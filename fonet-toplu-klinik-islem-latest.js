(() => {
  "use strict";

  const APP_KEY = "__FONET_BULK_CLINICAL_PROCEDURE__";
  const PANEL_ID = "fonet-toplu-klinik-islem-guvenli";
  const VERSION = "1.0.4";
  const HISTORY_FRESH_MS = 60 * 1000;
  const HOUR_MS = 60 * 60 * 1000;
  const PROCEDURES = [
    { key: "foley", code: "530310", name: "Foley sonda", rule: "72s", aliases: [/foley\s*sonda/i, /mesane\s*sonda/i, /üriner\s*(kateter|sonda)/i] },
    { key: "ng", code: "530340", name: "NG sonda", rule: "72s", aliases: [/\bng\s*sonda/i, /nazogastrik\s*sonda/i] },
    { key: "pansuman", code: "530580", name: "Yara pansumanı", rule: "günlük", aliases: [/yara\s*pansuman/i] },
    { key: "apse", code: "530030", name: "Apse yüzeyel", rule: "günlük", aliases: [/apse\s*yüzeyel/i, /apse\s*yuzeyel/i] }
  ];

  const targetWindow = (() => {
    try {
      if (window.opener && !window.opener.closed && /hbys/i.test(window.opener.location.href || "")) return window.opener;
    } catch (_) {}
    return window;
  })();

  const existingApp = window[APP_KEY];
  if (existingApp) {
    if (existingApp.version === VERSION) {
      existingApp.show();
      existingApp.refresh();
      return;
    }
    if (existingApp.state?.running) {
      alert("Eski sürümde işlem devam ediyor. İşlem tamamlandıktan sonra bookmark'a yeniden basın.");
      return;
    }
    try { existingApp.destroy?.(); } catch (_) {}
    try { document.getElementById(PANEL_ID)?.remove(); } catch (_) {}
    try { delete window[APP_KEY]; } catch (_) { window[APP_KEY] = null; }
  }

  const state = {
    patients: [],
    catalog: new Map(),
    catalogChecked: false,
    running: false,
    cancelRequested: false,
    attested: false,
    sourceGridId: "",
    message: "Hazır. Önce FONET hizmet kodları doğrulanacak."
  };

  const clean = (value) => String(value == null ? "" : value)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\r/g, "")
    .trim();
  const norm = (value) => clean(value).toLocaleLowerCase("tr-TR");
  const escapeHtml = (value) => clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  // FONET hizmetGirisListesi.js bu servise tarihi "d.m.Y H:i:s" biçiminde gönderiyor.
  function fonetDateTime(date = new Date()) {
    const pad = (value) => String(value).padStart(2, "0");
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  function apiBase() {
    let origin = "http://hbys.bursa.yerel";
    try { if (/^https?:$/i.test(targetWindow.location.protocol)) origin = targetWindow.location.origin; } catch (_) {}
    return `${origin}/hbys-rs/hbys`;
  }

  async function apiRequest(method, path, body, signal) {
    const fetchFunction = targetWindow.fetch?.bind(targetWindow) || fetch.bind(window);
    const separator = path.includes("?") ? "&" : "?";
    let response;
    try {
      response = await fetchFunction(`${apiBase()}${path}${separator}_dc=${Date.now()}`, {
        method,
        credentials: "include",
        cache: "no-store",
        signal,
        headers: {
          "Accept": "application/json, text/plain, */*",
          "Content-Type": "application/json;charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest"
        },
        body: body == null ? undefined : JSON.stringify(body)
      });
    } catch (error) {
      error.networkAmbiguous = method !== "GET";
      throw error;
    }
    const responseText = await response.text();
    let payload = responseText;
    try { payload = responseText ? JSON.parse(responseText) : {}; } catch (_) {}
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}: ${clean(responseText).slice(0, 180)}`);
      error.httpStatus = response.status;
      error.networkAmbiguous = method !== "GET" && response.status >= 500;
      throw error;
    }
    return payload;
  }

  const apiGet = (path, signal) => apiRequest("GET", path, null, signal);
  const apiPost = (path, body, signal) => apiRequest("POST", path, body, signal);

  function businessFailure(payload) {
    const objects = [payload, payload?.data, payload?.jsonArray, payload?.jsonArray?.data].filter((item) => item && typeof item === "object");
    for (const object of objects) {
      if (object.OK === false || object.ok === false || object.success === false || object.success === "false") {
        return clean(object.message || object.mesaj || object.msg || object.exception?.message || "FONET işlemi reddetti.");
      }
      if (object.exception) return clean(object.exception.message || object.exception.description || object.exception) || "FONET işlem hatası.";
    }
    return "";
  }

  function arrayRows(root) {
    const rows = [];
    const seen = new WeakSet();
    function walk(value, depth) {
      if (!value || typeof value !== "object" || depth > 7 || seen.has(value)) return;
      seen.add(value);
      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (item && typeof item === "object" && !Array.isArray(item)) rows.push(item);
          walk(item, depth + 1);
        });
        return;
      }
      Object.values(value).forEach((item) => walk(item, depth + 1));
    }
    walk(root, 0);
    return rows;
  }

  function recordValue(record, names) {
    const readPath = (object, path) => path.split(".").reduce((current, key) => current == null ? undefined : current[key], object);
    for (const name of names) {
      try { const value = record.get?.(name); if (value != null && value !== "") return value; } catch (_) {}
      try { const value = record.data?.[name]; if (value != null && value !== "") return value; } catch (_) {}
      try { const value = readPath(record.data, name); if (value != null && value !== "") return value; } catch (_) {}
    }
    return "";
  }

  function gridColumns(grid) {
    const columns = [];
    try { columns.push(...(grid.getColumnManager?.().getColumns?.() || [])); } catch (_) {}
    try { if (!columns.length) columns.push(...(grid.headerCt?.getGridColumns?.() || [])); } catch (_) {}
    try { if (!columns.length && Array.isArray(grid.columns)) columns.push(...grid.columns); } catch (_) {}
    return columns;
  }

  function gridRecords(grid) {
    const records = [];
    try {
      const store = grid.getStore?.() || grid.store;
      store?.each?.((record) => records.push(record));
      if (!records.length && Array.isArray(store?.data?.items)) records.push(...store.data.items);
    } catch (_) {}
    return records;
  }

  function scorePatientGrid(grid) {
    const columns = gridColumns(grid);
    const text = norm(columns.map((column) => `${clean(column.text)} ${clean(column.dataIndex)} ${clean(column.name)}`).join(" "));
    const records = gridRecords(grid);
    let score = 0;
    if (/adı soyadı|adi soyadi|adisoyadi/.test(text)) score += 15;
    if (/oda no|odano/.test(text)) score += 8;
    if (/yatak birimi|birimadi|birim adi/.test(text)) score += 8;
    if (/doktor|personeladi/.test(text)) score += 5;
    if (/birimsevkid|birim sevk id/.test(text)) score += 12;
    if (/geliş id|gelisid/.test(text)) score += 10;
    if (records.length >= 2) score += 4;
    score += records.slice(0, 5).filter((record) => clean(recordValue(record, ["adiSoyadi", "adSoyad", "hastaAdiSoyadi"])).length >= 5).length * 4;
    return score;
  }

  function findPatientGrid() {
    const Ext = targetWindow.Ext;
    if (!Ext?.ComponentQuery?.query) throw new Error("FONET ExtJS bileşenleri bulunamadı. Klinik hasta listesi açık olmalı.");
    const ranked = (Ext.ComponentQuery.query("gridpanel, grid") || [])
      .map((grid) => ({ grid, score: scorePatientGrid(grid), count: gridRecords(grid).length }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.score - a.score || b.count - a.count);
    if (!ranked.length || ranked[0].score < 25) throw new Error("Klinik hasta listesi güvenli biçimde ayırt edilemedi.");
    return ranked[0];
  }

  function emptyProcedureState() {
    return Object.fromEntries(PROCEDURES.map((procedure) => [procedure.key, {
      selected: false,
      locked: false,
      status: "bekliyor",
      detail: "Henüz geçmiş kontrol edilmedi.",
      lastDate: null
    }]));
  }

  function patientFromRecord(record, index) {
    const adSoyad = clean(recordValue(record, ["adiSoyadi", "adSoyad", "hastaAdiSoyadi", "ADSOYAD"]));
    const odaNo = clean(recordValue(record, ["odaNo", "ODA_NO", "ODANO", "klinik.yatak.oda.odaNo"]));
    const yatakNo = clean(recordValue(record, ["yatakNo", "YATAK_NO", "YATAKNO", "klinik.yatak.yatakNo"]));
    const birimSevkId = clean(recordValue(record, ["birimSevkId", "BIRIM_SEVK_ID", "klinik.birimSevk.id", "id"]));
    const hastaGelisId = clean(recordValue(record, ["gelisId", "hastaGelisId", "HASTA_GELIS_ID", "hastaGelis.id"]));
    return {
      index,
      adSoyad,
      oda: [odaNo, yatakNo].filter(Boolean).join("/") || "-",
      birimSevkId,
      hastaGelisId,
      procedures: emptyProcedureState(),
      historyCheckedAt: 0,
      checking: false,
      result: "",
      resultDetail: ""
    };
  }

  function patientKey(patient) { return clean(patient.birimSevkId || `${patient.oda}|${patient.adSoyad}`); }

  function collectPatients() {
    if (state.running) return;
    const previous = new Map(state.patients.map((patient) => [patientKey(patient), patient]));
    const found = findPatientGrid();
    const unique = new Map();
    gridRecords(found.grid).forEach((record, index) => {
      const patient = patientFromRecord(record, index);
      if (!patient.adSoyad || !patient.birimSevkId || !patient.hastaGelisId) return;
      const key = patientKey(patient);
      if (unique.has(key)) return;
      const old = previous.get(key);
      if (old) patient.procedures = old.procedures;
      unique.set(key, patient);
    });
    state.patients = [...unique.values()];
    state.sourceGridId = clean(found.grid.id || found.grid.itemId || "Klinik hasta listesi");
    state.message = `${state.patients.length} hasta FONET sırasıyla okundu. Yalnızca gerçekten uygulanan işlemleri işaretleyin.`;
    render();
  }

  function catalogRequest() {
    return new Promise((resolve, reject) => {
      const CC = targetWindow.CC;
      if (!CC?.getSetRequest) {
        reject(new Error("FONET katalog servisi bulunamadı."));
        return;
      }
      let finished = false;
      const timer = setTimeout(() => {
        if (!finished) { finished = true; reject(new Error("FONET katalog kontrolü zaman aşımına uğradı.")); }
      }, 20000);
      try {
        CC.getSetRequest({
          url: "Tanim/HizmetMakro/getHizmetMakroTopluIstem",
          method: "GET",
          notMask: true,
          mesajGosterme: false,
          filter: [{ property: "kodu", value: PROCEDURES.map((item) => item.code), type: "string", operator: "IN" }],
          callBack: (response) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            resolve(response);
          }
        });
      } catch (error) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  function mandatoryFields(record) {
    const output = [];
    const seen = new WeakSet();
    function walk(value, depth) {
      if (!value || typeof value !== "object" || depth > 5 || seen.has(value)) return;
      seen.add(value);
      Object.entries(value).forEach(([key, child]) => {
        if (/zorunlu/i.test(key) && (child === true || child === 1 || child === "1")) output.push(key);
        if (child && typeof child === "object") walk(child, depth + 1);
      });
    }
    walk(record, 0);
    return [...new Set(output)];
  }

  async function validateCatalog() {
    if (state.running) return;
    state.running = true;
    state.message = "FONET hizmet kataloğunda dört işlem kodu doğrulanıyor...";
    render();
    try {
      const response = await catalogRequest();
      const failure = businessFailure(response);
      if (failure) throw new Error(failure);
      const rows = arrayRows(response).filter((row) => clean(row.kodu || row.makroKodu));
      state.catalog.clear();
      PROCEDURES.forEach((procedure) => {
        const matches = rows.filter((row) => clean(row.kodu || row.makroKodu) === procedure.code);
        const record = matches[0];
        if (!record) {
          state.catalog.set(procedure.key, { valid: false, detail: `${procedure.code} FONET hizmet kataloğunda bulunamadı.` });
          return;
        }
        const required = mandatoryFields(record);
        const requirementNote = required.length ? ` · Ek alanlar kayıt öncesi FONET kural servisinde kontrol edilecek: ${required.join(", ")}` : "";
        state.catalog.set(procedure.key, { valid: true, warning: required.length > 0, detail: `${procedure.code} — ${clean(record.adi || record.koduAdi || procedure.name)}${requirementNote}`, record });
      });
      state.catalogChecked = true;
      const validCount = [...state.catalog.values()].filter((item) => item.valid).length;
      state.message = `Katalog kontrolü tamamlandı: ${validCount}/4 işlem güvenli gönderime uygun.`;
    } catch (error) {
      state.catalogChecked = false;
      state.message = `Katalog doğrulanamadı: ${clean(error.message)} Kayıt gönderimi kapalı.`;
    } finally {
      state.running = false;
      render();
    }
  }

  function parseDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === "number" && value > 1000000000) return new Date(value);
    const text = clean(value);
    if (!text) return null;
    const dotNet = text.match(/\/Date\((\d+)/);
    if (dotNet) return new Date(Number(dotNet[1]));
    const turkish = text.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (turkish) {
      let year = Number(turkish[3]);
      if (year < 100) year += 2000;
      const date = new Date(year, Number(turkish[2]) - 1, Number(turkish[1]), Number(turkish[4] || 0), Number(turkish[5] || 0), Number(turkish[6] || 0));
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function collectDateValues(value, output = [], depth = 0, seen = new WeakSet()) {
    if (!value || typeof value !== "object" || depth > 5 || seen.has(value)) return output;
    seen.add(value);
    Object.entries(value).forEach(([key, child]) => {
      if (/tarih|date|istem|işlem|islem/i.test(key) && (typeof child === "string" || typeof child === "number" || child instanceof Date)) output.push(child);
      if (child && typeof child === "object") collectDateValues(child, output, depth + 1, seen);
    });
    return output;
  }

  function rowMatchesProcedure(row, procedure) {
    let text = "";
    try { text = JSON.stringify(row); } catch (_) { text = String(row); }
    const codeMatch = new RegExp(`(^|[^0-9])${procedure.code}([^0-9]|$)`).test(text);
    return codeMatch || procedure.aliases.some((pattern) => pattern.test(text));
  }

  function sameLocalDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function formatDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(date);
  }

  function inspectProcedureHistory(payload, procedure) {
    const matchingRows = arrayRows(payload).filter((row) => rowMatchesProcedure(row, procedure));
    if (!matchingRows.length) return { locked: false, status: "uygun", detail: "Önceki kayıt bulunmadı.", lastDate: null };
    const dates = matchingRows.flatMap((row) => collectDateValues(row)).map(parseDate).filter(Boolean).sort((a, b) => b - a);
    if (!dates.length) return { locked: true, status: "belirsiz", detail: "İşlem bulundu ancak tarihi okunamadı; güvenlik için kapatıldı.", lastDate: null };
    const lastDate = dates[0];
    const now = new Date();
    const blocked = procedure.rule === "72s"
      ? lastDate.getTime() >= now.getTime() - 72 * HOUR_MS && lastDate.getTime() <= now.getTime() + 10 * 60 * 1000
      : sameLocalDay(lastDate, now);
    if (blocked) {
      const ruleText = procedure.rule === "72s" ? "son 72 saatte mevcut" : "bugün mevcut";
      return { locked: true, status: "mevcut", detail: `${ruleText}. Son kayıt: ${formatDate(lastDate)}`, lastDate };
    }
    return { locked: false, status: "uygun", detail: `Son kayıt: ${formatDate(lastDate)} — yeniden girilebilir.`, lastDate };
  }

  async function inspectPatient(patient, force = false) {
    if (patient.checking) return;
    if (!force && Date.now() - patient.historyCheckedAt < HISTORY_FRESH_MS) return;
    patient.checking = true;
    PROCEDURES.forEach((procedure) => {
      const item = patient.procedures[procedure.key];
      item.status = "kontrol";
      item.detail = "FONET hizmet geçmişi kontrol ediliyor.";
    });
    render();
    try {
      const payload = await apiGet(`/Tibbi/HastaHizmet/getHizmetList/${encodeURIComponent(patient.hastaGelisId)}/${encodeURIComponent(patient.birimSevkId)}`);
      const failure = businessFailure(payload);
      if (failure) throw new Error(failure);
      PROCEDURES.forEach((procedure) => {
        const result = inspectProcedureHistory(payload, procedure);
        const item = patient.procedures[procedure.key];
        Object.assign(item, result);
        if (result.locked) item.selected = false;
      });
      patient.historyCheckedAt = Date.now();
    } catch (error) {
      PROCEDURES.forEach((procedure) => {
        const item = patient.procedures[procedure.key];
        item.selected = false;
        item.locked = true;
        item.status = "hata";
        item.detail = `Geçmiş kontrol edilemedi: ${clean(error.message)}`;
      });
      patient.historyCheckedAt = 0;
    } finally {
      patient.checking = false;
      render();
    }
  }

  function selectedPatients() {
    return state.patients.filter((patient) => PROCEDURES.some((procedure) => patient.procedures[procedure.key].selected));
  }

  async function runPool(items, limit, worker) {
    let cursor = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length && !state.cancelRequested) {
        const index = cursor++;
        await worker(items[index], index);
      }
    });
    await Promise.all(runners);
  }

  async function checkSelectedHistory(force = true) {
    const patients = selectedPatients();
    if (!patients.length) throw new Error("Hiçbir hastada işlem işaretlenmedi.");
    state.running = true;
    state.cancelRequested = false;
    state.message = `${patients.length} hastanın işlem geçmişi kontrol ediliyor...`;
    render();
    let completed = 0;
    try {
      await runPool(patients, 4, async (patient) => {
        await inspectPatient(patient, force);
        completed += 1;
        state.message = `Geçmiş kontrolü: ${completed}/${patients.length}`;
        render();
      });
    } finally {
      state.running = false;
      state.message = "Geçmiş kontrolü tamamlandı. Engellenen işlemlerin işareti kaldırıldı.";
      render();
    }
    return selectedPatients();
  }

  function checkedResponseRows(payload) {
    const direct = payload?.data?.data;
    if (Array.isArray(direct)) return direct;
    return arrayRows(payload).filter((row) => row?.hastaHizmet && clean(row?.makroKodu || row?.hastaHizmet?.makro?.kodu));
  }

  function prepareAddRow(row, fallbackCode) {
    const hastaHizmet = row.hastaHizmet;
    if (!hastaHizmet || typeof hastaHizmet !== "object") throw new Error("FONET kontrol yanıtında hasta hizmeti oluşmadı.");
    try { if (hastaHizmet.makro?.koduAdi != null) delete hastaHizmet.makro.koduAdi; } catch (_) {}
    try { if (hastaHizmet.makro?.hizmet?.hizmetTuru?.grubu != null) delete hastaHizmet.makro.hizmet.hizmetTuru.grubu; } catch (_) {}
    if (hastaHizmet.yapanBirim?.id != null) hastaHizmet.yapanBirim = { id: hastaHizmet.yapanBirim.id };
    const prepared = {
      makroKodu: clean(row.makroKodu || hastaHizmet.makro?.kodu || fallbackCode),
      fromTopluPanel: true,
      hastaHizmet
    };
    ["hizmetAciklamaGirisiZorunlu", "tekrarGirisSebep", "tekrarGirisSebepAciklama", "detayBilgiInfo", "hizmetBilgiInfo", "kontrolMakroGrupDetayId", "kontrolMakroGrupId"].forEach((key) => {
      if (row[key] != null) prepared[key] = row[key];
    });
    return prepared;
  }

  async function addProceduresForPatient(patient, procedures) {
    const istemTarihi = fonetDateTime();
    const checkPayload = procedures.map((procedure) => ({
      makroKodu: procedure.code,
      fromTopluIstem: true,
      hastaHizmet: {
        birimSevk: { id: Number(patient.birimSevkId) || patient.birimSevkId },
        istemTarihi,
        yapanBirim: null,
        yapanPersonel: null
      },
      engelOrani: 0
    }));
    const checked = await apiPost("/Tibbi/HastaHizmet/checkAddHastaHizmetList", checkPayload);
    const checkFailure = businessFailure(checked);
    if (checkFailure) throw new Error(`FONET kural kontrolü: ${checkFailure}`);
    const rows = checkedResponseRows(checked);
    if (!rows.length) throw new Error("FONET kural kontrolü kayıt üretmedi; işlem gönderilmedi.");
    const blocked = rows.find((row) => row.engel === true || row.engel === 1 || row.engel === "1");
    if (blocked) throw new Error(clean(blocked.mesaj || blocked.uyari || blocked.aciklama || "FONET karar destek kontrolü ek kullanıcı işlemi istiyor."));
    const required = rows.flatMap(mandatoryFields);
    if (required.length) throw new Error(`Ek zorunlu alan gerekiyor (${[...new Set(required)].join(", ")}); bu hasta için kayıt gönderilmedi.`);
    const prepared = procedures.map((procedure) => {
      const row = rows.find((item) => clean(item.makroKodu || item?.hastaHizmet?.makro?.kodu) === procedure.code);
      if (!row) throw new Error(`${procedure.code} FONET kural yanıtında bulunamadı.`);
      return prepareAddRow(row, procedure.code);
    });
    const added = await apiPost("/Tibbi/HastaHizmet/addHastaHizmetList", prepared);
    const addFailure = businessFailure(added);
    if (addFailure) throw new Error(addFailure);
    return added;
  }

  async function transferSelected() {
    if (state.running) return;
    if (!state.catalogChecked || PROCEDURES.some((procedure) => !state.catalog.get(procedure.key)?.valid)) {
      alert("Dört işlem kodunun tamamı FONET kataloğunda doğrulanmadan kayıt gönderilemez.");
      return;
    }
    state.attested = Boolean(document.getElementById("fki-attestation")?.checked);
    if (!state.attested) {
      alert("Yalnızca bugün gerçekten uygulanan işlemleri seçtiğinizi onaylayın.");
      return;
    }
    try { await checkSelectedHistory(true); } catch (error) { alert(clean(error.message)); return; }
    const patients = selectedPatients();
    const plan = patients.map((patient) => ({
      patient,
      procedures: PROCEDURES.filter((procedure) => {
        const item = patient.procedures[procedure.key];
        return item.selected && !item.locked && item.status === "uygun";
      })
    })).filter((item) => item.procedures.length);
    if (!plan.length) {
      alert("Kontrol sonrasında gönderilebilecek işlem kalmadı.");
      return;
    }
    const operationCount = plan.reduce((sum, item) => sum + item.procedures.length, 0);
    const preview = plan.slice(0, 20).map(({ patient, procedures }) => `${patient.oda} ${patient.adSoyad}: ${procedures.map((item) => item.name).join(", ")}`).join("\n");
    const more = plan.length > 20 ? `\n... ve ${plan.length - 20} hasta daha` : "";
    if (!confirm(`${plan.length} hastaya toplam ${operationCount} hizmet kaydı gönderilecek.\n\n${preview}${more}\n\nBu işlemlerin bugün gerçekten uygulandığını onaylıyor musunuz?`)) return;

    state.running = true;
    state.cancelRequested = false;
    state.message = "Seçili ve doğrulanmış işlemler FONET'e gönderiliyor...";
    render();
    let completed = 0;
    let success = 0;
    let failed = 0;
    try {
      await runPool(plan, 2, async ({ patient, procedures }) => {
        patient.result = "gönderiliyor";
        patient.resultDetail = procedures.map((item) => item.code).join(", ");
        render();
        try {
          await addProceduresForPatient(patient, procedures);
          patient.result = "başarılı";
          patient.resultDetail = `${procedures.map((item) => `${item.code} ${item.name}`).join(", ")} kaydedildi.`;
          procedures.forEach((procedure) => {
            const item = patient.procedures[procedure.key];
            item.selected = false;
            item.locked = true;
            item.status = "kaydedildi";
            item.detail = "Bu oturumda başarıyla kaydedildi.";
          });
          success += procedures.length;
        } catch (error) {
          patient.result = error.networkAmbiguous ? "belirsiz" : "hata";
          patient.resultDetail = error.networkAmbiguous
            ? "Sunucu yanıtı belirsiz. Mükerrer riskine karşı otomatik tekrar yapılmadı; FONET hizmet listesini kontrol edin."
            : clean(error.message);
          failed += procedures.length;
        }
        completed += 1;
        state.message = `Toplu işlem: ${completed}/${plan.length} hasta · Başarılı ${success} · Hatalı/belirsiz ${failed}`;
        render();
      });
    } finally {
      state.running = false;
      state.message = `Tamamlandı. Başarılı ${success}/${operationCount}; hatalı veya belirsiz ${failed}.`;
      render();
    }
  }

  function statusColor(status) {
    if (["uygun", "başarılı", "kaydedildi"].includes(status)) return "#15803d";
    if (["mevcut", "belirsiz", "hata"].includes(status)) return "#b91c1c";
    if (["kontrol", "gönderiliyor"].includes(status)) return "#1d4ed8";
    return "#64748b";
  }

  function render() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const previousScroller = panel.querySelector("#fki-list-scroll");
    const previousScrollTop = Number(previousScroller?.scrollTop) || 0;
    const previousScrollLeft = Number(previousScroller?.scrollLeft) || 0;
    const selectedCount = state.patients.reduce((sum, patient) => sum + PROCEDURES.filter((procedure) => patient.procedures[procedure.key].selected).length, 0);
    const catalogHtml = PROCEDURES.map((procedure) => {
      const catalog = state.catalog.get(procedure.key);
      const ok = catalog?.valid;
      const warning = ok && catalog?.warning;
      const background = warning ? "#fef3c7" : ok ? "#dcfce7" : "#fee2e2";
      const color = warning ? "#92400e" : ok ? "#166534" : "#991b1b";
      const mark = warning ? "!" : ok ? "✓" : "?";
      return `<span title="${escapeHtml(catalog?.detail || "Henüz doğrulanmadı")}" style="padding:4px 7px;border-radius:999px;background:${background};color:${color};font-size:11px;font-weight:800;">${escapeHtml(procedure.code)} ${mark}</span>`;
    }).join(" ");
    const rowsHtml = state.patients.map((patient, patientIndex) => {
      const procedureCells = PROCEDURES.map((procedure) => {
        const item = patient.procedures[procedure.key];
        const catalogValid = state.catalog.get(procedure.key)?.valid === true;
        const disabled = state.running || item.locked || !catalogValid;
        return `<td style="padding:7px;border-bottom:1px solid #e2e8f0;vertical-align:top;min-width:170px;">
          <label style="display:flex;gap:6px;align-items:flex-start;font-weight:800;cursor:${disabled ? "not-allowed" : "pointer"};">
            <input class="fki-procedure" data-patient="${patientIndex}" data-procedure="${procedure.key}" type="checkbox" ${item.selected ? "checked" : ""} ${disabled ? "disabled" : ""}>
            <span>${escapeHtml(procedure.code)}<br><small>${escapeHtml(procedure.name)}</small></span>
          </label>
          <div title="${escapeHtml(item.detail)}" style="margin-top:4px;color:${statusColor(item.status)};font-size:10px;line-height:1.25;">${escapeHtml(item.detail)}</div>
        </td>`;
      }).join("");
      return `<tr>
        <td style="position:sticky;left:0;z-index:1;background:#fff;padding:7px;border-bottom:1px solid #e2e8f0;min-width:220px;"><b>${escapeHtml(patient.oda)} · ${escapeHtml(patient.adSoyad)}</b><div style="font-size:10px;color:${statusColor(patient.result)};">${escapeHtml(patient.resultDetail || "")}</div></td>
        ${procedureCells}
      </tr>`;
    }).join("");
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:12px 14px;background:#0f172a;color:#fff;">
        <div><b>FONET Hasta Bazlı Toplu İşlem v${VERSION}</b><div style="margin-top:4px;display:flex;gap:5px;flex-wrap:wrap;">${catalogHtml}</div></div>
        <button id="fki-close" style="border:0;border-radius:8px;background:#dc2626;color:#fff;padding:8px 12px;font-weight:800;cursor:pointer;">Kapat</button>
      </div>
      <div style="padding:10px;background:#f8fafc;border-bottom:1px solid #cbd5e1;">
        <div style="display:flex;gap:7px;flex-wrap:wrap;align-items:center;">
          <button id="fki-refresh">Hastaları Oku</button>
          <button id="fki-catalog">Kodları Doğrula</button>
          <button id="fki-check">Seçilenlerin Geçmişini Kontrol Et</button>
          <button id="fki-clear">İşaretleri Temizle</button>
          <button id="fki-send" style="background:#15803d;color:#fff;border-color:#15803d;">Doğrulanmış İşlemleri Kaydet</button>
          <button id="fki-stop" style="background:#b91c1c;color:#fff;border-color:#b91c1c;">Durdur</button>
        </div>
        <div style="margin-top:8px;padding:8px;border-radius:8px;background:#fff7ed;color:#9a3412;font-size:12px;"><b>Kural:</b> Foley ve NG son 72 saatte varsa kapatılır. Pansuman ve apse yüzeyel bugün varsa kapatılır; önceki gün kaydı günlük yeniden girişe engel olmaz.</div>
        <label style="display:flex;gap:8px;align-items:flex-start;margin-top:8px;font-size:12px;font-weight:700;"><input id="fki-attestation" type="checkbox" ${state.attested ? "checked" : ""}><span>Yalnızca bugün gerçekten uygulanan işlemleri işaretlediğimi ve hasta–işlem listesini kontrol ettiğimi onaylıyorum.</span></label>
        <div id="fki-summary" style="margin-top:7px;font-size:12px;color:#334155;">Hasta: ${state.patients.length} · İşaretli işlem: ${selectedCount} · ${escapeHtml(state.message)}</div>
      </div>
      <div id="fki-list-scroll" style="overflow:auto;height:calc(76vh - 205px);background:#fff;">
        <table style="border-collapse:collapse;width:100%;font:12px Arial,sans-serif;">
          <thead><tr><th style="position:sticky;left:0;top:0;z-index:3;background:#e2e8f0;padding:8px;text-align:left;">Hasta</th>${PROCEDURES.map((procedure) => `<th style="position:sticky;top:0;z-index:2;background:#e2e8f0;padding:8px;text-align:left;">${escapeHtml(procedure.name)}<br><small>${escapeHtml(procedure.rule === "72s" ? "72 saat" : "günde 1")}</small></th>`).join("")}</tr></thead>
          <tbody>${rowsHtml || `<tr><td colspan="5" style="padding:18px;color:#64748b;">Hasta okunmadı.</td></tr>`}</tbody>
        </table>
      </div>`;

    panel.querySelectorAll("button").forEach((button) => Object.assign(button.style, { border: "1px solid #94a3b8", borderRadius: "7px", padding: "7px 10px", fontWeight: "800", cursor: "pointer" }));
    const currentScroller = panel.querySelector("#fki-list-scroll");
    if (currentScroller) {
      currentScroller.scrollTop = previousScrollTop;
      currentScroller.scrollLeft = previousScrollLeft;
    }
    panel.querySelector("#fki-attestation").onchange = (event) => { state.attested = Boolean(event.target.checked); };
    panel.querySelector("#fki-close").onclick = () => {
      if (state.running) { alert("İşlem sürerken panel kapatılamaz. Önce Durdur düğmesine basın."); return; }
      panel.style.display = "none";
    };
    panel.querySelector("#fki-refresh").onclick = () => { try { collectPatients(); } catch (error) { state.message = clean(error.message); render(); } };
    panel.querySelector("#fki-catalog").onclick = validateCatalog;
    panel.querySelector("#fki-check").onclick = () => checkSelectedHistory(true).catch((error) => alert(clean(error.message)));
    panel.querySelector("#fki-clear").onclick = () => {
      if (state.running) return;
      state.patients.forEach((patient) => PROCEDURES.forEach((procedure) => { patient.procedures[procedure.key].selected = false; }));
      state.message = "Tüm işlem işaretleri temizlendi.";
      render();
    };
    panel.querySelector("#fki-send").onclick = transferSelected;
    panel.querySelector("#fki-stop").onclick = () => { state.cancelRequested = true; state.message = "Durdurma istendi; devam eden sunucu isteği tamamlanınca duracak."; render(); };
    panel.querySelectorAll(".fki-procedure").forEach((checkbox) => {
      checkbox.onchange = () => {
        const patient = state.patients[Number(checkbox.dataset.patient)];
        const item = patient?.procedures?.[checkbox.dataset.procedure];
        if (!patient || !item || item.locked) return;
        item.selected = checkbox.checked;
        render();
        if (checkbox.checked) inspectPatient(patient, false);
      };
    });
    ["fki-refresh", "fki-catalog", "fki-check", "fki-clear", "fki-send"].forEach((id) => { panel.querySelector(`#${id}`).disabled = state.running; });
    panel.querySelector("#fki-stop").disabled = !state.running;
  }

  function makePanel() {
    const old = document.getElementById(PANEL_ID);
    if (old) old.remove();
    const panel = document.createElement("section");
    panel.id = PANEL_ID;
    Object.assign(panel.style, {
      position: "fixed", right: "12px", bottom: "12px", width: "min(1240px, calc(100vw - 24px))", height: "76vh",
      zIndex: "2147483647", background: "#fff", border: "1px solid #334155", borderRadius: "12px", overflow: "hidden",
      boxShadow: "0 22px 60px rgba(0,0,0,.38)", color: "#0f172a", fontFamily: "Arial, sans-serif"
    });
    document.body.appendChild(panel);
    render();
  }

  window[APP_KEY] = {
    version: VERSION,
    show() { const panel = document.getElementById(PANEL_ID); if (panel) panel.style.display = "block"; },
    refresh() { try { collectPatients(); } catch (error) { state.message = clean(error.message); render(); } },
    destroy() { const panel = document.getElementById(PANEL_ID); if (panel) panel.remove(); },
    state
  };

  makePanel();
  try { collectPatients(); } catch (error) { state.message = clean(error.message); render(); }
  validateCatalog();
})();
