(() => {
  "use strict";

  const APP_KEY = "__FONET_BULK_VISIT__";
  const PANEL_ID = "fonet-toplu-vizit-guvenli";
  const VISIT_CODE = "510123";
  const VERSION = "1.1.0";

  if (window[APP_KEY]) {
    window[APP_KEY].show();
    window[APP_KEY].refresh();
    return;
  }

  const state = {
    patients: [],
    running: false,
    cancelRequested: false,
    lastCheckAt: 0,
    sourceGridId: "",
    message: "Hazır. Klinik hasta listesini okuyun."
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

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function fonetWindow() {
    try {
      if (window.opener && !window.opener.closed && /hbys/i.test(window.opener.location.href || "")) return window.opener;
    } catch (_) {}
    return window;
  }

  function apiBase() {
    const target = fonetWindow();
    let origin = "http://hbys.bursa.yerel";
    try {
      if (/^https?:$/i.test(target.location.protocol)) origin = target.location.origin;
    } catch (_) {}
    return `${origin}/hbys-rs/hbys`;
  }

  function selectedPatients() {
    return state.patients.filter((patient) => patient.selected && !patient.locked);
  }

  function patientKey(patient) {
    return clean(patient.birimSevkId || `${patient.oda}|${patient.adSoyad}`);
  }

  function recordValue(record, names) {
    const readPath = (object, path) => path.split(".").reduce((current, key) => current == null ? undefined : current[key], object);
    for (const name of names) {
      try {
        const value = record.get?.(name);
        if (value != null && value !== "") return value;
      } catch (_) {}
      try {
        const value = record.data?.[name];
        if (value != null && value !== "") return value;
      } catch (_) {}
      try {
        const value = readPath(record.data, name);
        if (value != null && value !== "") return value;
      } catch (_) {}
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
    const columnText = columns.map((column) => `${clean(column.text)} ${clean(column.dataIndex)} ${clean(column.name)}`).join(" ");
    const normalized = norm(columnText);
    const records = gridRecords(grid);
    let score = 0;
    if (/adı soyadı|adi soyadi|adisoyadi/.test(normalized)) score += 15;
    if (/oda no|odano/.test(normalized)) score += 8;
    if (/yatak birimi|birimadi|birim adi/.test(normalized)) score += 8;
    if (/doktor|personeladi/.test(normalized)) score += 5;
    if (/birimsevkid|birim sevk id/.test(normalized)) score += 12;
    if (/geliş id|gelisid/.test(normalized)) score += 10;
    if (records.length >= 2) score += 4;
    if (records.length >= 10) score += 3;
    const sample = records.slice(0, 5);
    const matching = sample.filter((record) => clean(recordValue(record, ["adiSoyadi", "adSoyad", "hastaAdiSoyadi"])).length >= 5).length;
    score += matching * 4;
    return score;
  }

  function findPatientGrid() {
    const target = fonetWindow();
    const Ext = target.Ext;
    if (!Ext?.ComponentQuery?.query) throw new Error("FONET ExtJS bileşenleri bulunamadı. Klinik hasta listesi açık olmalı.");
    const grids = Ext.ComponentQuery.query("gridpanel, grid") || [];
    const ranked = grids
      .map((grid) => ({ grid, score: scorePatientGrid(grid), count: gridRecords(grid).length }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.score - a.score || b.count - a.count);
    if (!ranked.length || ranked[0].score < 25) throw new Error("Klinik hasta grid'i güvenli şekilde ayırt edilemedi.");
    return ranked[0];
  }

  function patientFromRecord(record, index) {
    const adSoyad = clean(recordValue(record, ["adiSoyadi", "adSoyad", "hastaAdiSoyadi", "ADSOYAD"]));
    const odaNo = clean(recordValue(record, ["odaNo", "ODA_NO", "ODANO", "klinik.yatak.oda.odaNo"]));
    const yatakNo = clean(recordValue(record, ["yatakNo", "YATAK_NO", "YATAKNO", "klinik.yatak.yatakNo"]));
    const birimSevkId = clean(recordValue(record, ["birimSevkId", "BIRIM_SEVK_ID", "klinik.birimSevk.id", "id"]));
    const hastaGelisId = clean(recordValue(record, ["gelisId", "hastaGelisId", "HASTA_GELIS_ID", "hastaGelis.id"]));
    const doktor = clean(recordValue(record, ["personelAdi", "doktorAdi", "DOKTOR_ADI", "personel.kimlik.adiSoyadi"]));
    const birim = clean(recordValue(record, ["birim", "birimAdi", "YATAK_BIRIMI", "klinik.yatak.oda.birim.adi"]));
    const protokol = clean(recordValue(record, ["protokolNo", "PROTOKOL_NO", "klinik.protokolNo"]));
    const kabul = recordValue(record, ["kabul", "klinikId", "klinik.id"]);
    return {
      index,
      adSoyad,
      oda: [odaNo, yatakNo].filter(Boolean).join("/") || "-",
      doktor,
      birim,
      protokol,
      birimSevkId,
      hastaGelisId,
      kabul: clean(kabul),
      selected: Boolean(adSoyad && birimSevkId && hastaGelisId),
      locked: !(adSoyad && birimSevkId && hastaGelisId),
      status: adSoyad && birimSevkId && hastaGelisId ? "bekliyor" : "kimlik-eksik",
      detail: adSoyad && birimSevkId && hastaGelisId ? "Bugünkü vizit henüz kontrol edilmedi." : "Birim sevk veya geliş kimliği okunamadı; işlem dışı bırakıldı."
    };
  }

  function collectPatients() {
    if (state.running) return;
    const previous = new Map(state.patients.map((patient) => [patientKey(patient), patient]));
    const found = findPatientGrid();
    const unique = new Map();
    gridRecords(found.grid).forEach((record, index) => {
      const patient = patientFromRecord(record, index);
      if (!patient.adSoyad || !patient.birimSevkId) return;
      const key = patientKey(patient);
      if (unique.has(key)) return;
      const old = previous.get(key);
      if (old) {
        patient.selected = old.selected && !patient.locked;
        patient.status = old.status;
        patient.detail = old.detail;
        patient.locked = old.locked || patient.locked;
      }
      unique.set(key, patient);
    });
    state.patients = [...unique.values()];
    state.sourceGridId = clean(found.grid.id || found.grid.itemId || "Klinik hasta grid'i");
    state.lastCheckAt = 0;
    state.message = `${state.patients.length} hasta FONET sırasıyla okundu. İşlem öncesi bugünkü vizitler kontrol edilecek.`;
    render();
  }

  async function apiGet(path, signal) {
    const target = fonetWindow();
    const fetchFunction = target.fetch?.bind(target) || fetch.bind(window);
    const separator = path.includes("?") ? "&" : "?";
    const response = await fetchFunction(`${apiBase()}${path}${separator}_dc=${Date.now()}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal,
      headers: {
        "Accept": "application/json, text/plain, */*",
        "X-Requested-With": "XMLHttpRequest"
      }
    });
    const text = await response.text();
    let payload = text;
    try { payload = text ? JSON.parse(text) : {}; } catch (_) {}
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}: ${clean(text).slice(0, 180)}`);
      error.httpStatus = response.status;
      throw error;
    }
    return payload;
  }

  function businessFailure(payload) {
    const objects = [payload, payload?.data, payload?.jsonArray, payload?.jsonArray?.data].filter((item) => item && typeof item === "object");
    for (const object of objects) {
      if (object.OK === false || object.ok === false || object.success === false || object.success === "false") {
        return clean(object.message || object.mesaj || object.msg || object.exception?.message || "FONET işlemi reddetti.");
      }
      if (object.exception) return clean(object.exception.message || object.exception) || "FONET işlem hatası.";
    }
    const textCandidates = [payload?.message, payload?.mesaj, payload?.data?.message, typeof payload?.data === "string" ? payload.data : ""]
      .map(clean)
      .filter(Boolean);
    const warning = textCandidates.find((text) => /hata|yapılamaz|yetki|redd|taburcu|uygun değil|uygun degil/i.test(text));
    return warning || "";
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

  function isVisitRow(row) {
    let text = "";
    try { text = JSON.stringify(row); } catch (_) { text = String(row); }
    return new RegExp(`(^|[^0-9])${VISIT_CODE}([^0-9]|$)`).test(text) || /yatakl[ıi] servis viziti/i.test(text);
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

  function isToday(value) {
    const now = new Date();
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.getFullYear() === now.getFullYear() && value.getMonth() === now.getMonth() && value.getDate() === now.getDate();
    }
    if (typeof value === "number" && value > 1000000000) return isToday(new Date(value));
    const text = clean(value);
    if (!text) return false;
    const turkish = text.match(/^(\d{1,2})[.\/-](\d{1,2})(?:[.\/-](\d{2,4}))?/);
    if (turkish) {
      const day = Number(turkish[1]);
      const month = Number(turkish[2]);
      let year = turkish[3] ? Number(turkish[3]) : now.getFullYear();
      if (year < 100) year += 2000;
      return day === now.getDate() && month === now.getMonth() + 1 && year === now.getFullYear();
    }
    const parsed = new Date(text);
    return !Number.isNaN(parsed.getTime()) && parsed.getFullYear() === now.getFullYear() && parsed.getMonth() === now.getMonth() && parsed.getDate() === now.getDate();
  }

  async function inspectTodayVisit(patient) {
    const payload = await apiGet(`/Tibbi/HastaHizmet/getHizmetList/${encodeURIComponent(patient.hastaGelisId)}/${encodeURIComponent(patient.birimSevkId)}`);
    const failure = businessFailure(payload);
    if (failure) throw new Error(failure);
    const visits = arrayRows(payload).filter(isVisitRow);
    if (!visits.length) return { result: "ready", detail: "Bugün için yeni vizit kaydı eklenebilir." };
    const datedVisits = visits.map((row) => collectDateValues(row)).flat();
    if (datedVisits.some(isToday)) return { result: "existing", detail: `Bugün ${VISIT_CODE} viziti zaten mevcut; işlem dışı bırakıldı.` };
    if (!datedVisits.length) return { result: "uncertain", detail: "Eski bir vizit bulundu ancak tarihi doğrulanamadı; güvenlik için işlem dışı bırakıldı." };
    return { result: "ready", detail: "Bugün için yeni vizit kaydı eklenebilir." };
  }

  function setPatientStatus(patient, status, detail, options = {}) {
    patient.status = status;
    patient.detail = detail;
    if (options.lock != null) patient.locked = options.lock;
    if (options.select != null) patient.selected = options.select;
  }

  async function runPool(items, limit, worker) {
    let cursor = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length && !state.cancelRequested) {
        const index = cursor;
        cursor += 1;
        await worker(items[index], index);
      }
    });
    await Promise.all(runners);
  }

  async function checkSelected(options = {}) {
    if (state.running) return [];
    const candidates = selectedPatients();
    if (!candidates.length) throw new Error("Kontrol edilecek hasta seçilmedi.");
    state.running = true;
    state.cancelRequested = false;
    state.message = `${candidates.length} hastada bugünkü vizit kontrol ediliyor...`;
    candidates.forEach((patient) => setPatientStatus(patient, "kontrol", "FONET hizmet listesi kontrol ediliyor."));
    render();

    let completed = 0;
    try {
      await runPool(candidates, 4, async (patient) => {
        try {
          const inspection = await inspectTodayVisit(patient);
          if (inspection.result === "existing") setPatientStatus(patient, "mevcut", inspection.detail, { select: false, lock: true });
          else if (inspection.result === "uncertain") setPatientStatus(patient, "belirsiz", inspection.detail, { select: false, lock: true });
          else setPatientStatus(patient, "hazır", inspection.detail, { lock: false });
        } catch (error) {
          setPatientStatus(patient, "kontrol-hata", `Kontrol başarısız: ${clean(error.message)}`, { select: false, lock: true });
        }
        completed += 1;
        state.message = `Vizit kontrolü: ${completed}/${candidates.length}`;
        render();
      });
      state.lastCheckAt = Date.now();
    } finally {
      state.running = false;
      state.message = state.cancelRequested ? "Kontrol kullanıcı tarafından durduruldu." : "Kontrol tamamlandı. Mevcut ve belirsiz kayıtlar otomatik dışlandı.";
      render();
    }
    return state.patients.filter((patient) => patient.selected && !patient.locked && patient.status === "hazır");
  }

  async function addVisit(patient) {
    const payload = await apiGet(`/Klinik/Klinik/insertVizit/${encodeURIComponent(patient.birimSevkId)}`);
    const failure = businessFailure(payload);
    if (failure) throw new Error(failure);
    return payload;
  }

  async function transferSelected() {
    if (state.running) return;
    const attestation = document.getElementById("ftv-attestation");
    if (!attestation?.checked) {
      alert("Devam etmek için seçili hastaların bugün değerlendirildiğini onaylayın.");
      return;
    }

    let ready;
    try {
      ready = await checkSelected({ beforeTransfer: true });
    } catch (error) {
      alert(error.message);
      return;
    }
    if (!ready.length) {
      alert("Kontrol sonrasında vizit eklenecek uygun hasta kalmadı.");
      return;
    }

    const preview = ready.slice(0, 15).map((patient) => `${patient.oda} ${patient.adSoyad}`).join("\n");
    const more = ready.length > 15 ? `\n... ve ${ready.length - 15} hasta daha` : "";
    const confirmed = confirm(`${ready.length} hastaya BUGÜN için ${VISIT_CODE} – Yataklı servis viziti eklenecek.\n\n${preview}${more}\n\nBu hastaları bugün değerlendirdiğinizi ve listeyi kontrol ettiğinizi onaylıyor musunuz?`);
    if (!confirmed) {
      state.message = "Gönderim iptal edildi; hiçbir yeni vizit eklenmedi.";
      render();
      return;
    }

    state.running = true;
    state.cancelRequested = false;
    let success = 0;
    let failed = 0;
    let ambiguous = 0;
    let completed = 0;
    try {
      await runPool(ready, 3, async (patient) => {
        if (state.cancelRequested) return;
        setPatientStatus(patient, "gönderiliyor", "Vizit kaydı FONET'e gönderiliyor.", { lock: true });
        state.message = `Tüm seçili hastalar gönderiliyor: ${completed}/${ready.length}`;
        render();
        try {
          await addVisit(patient);
          setPatientStatus(patient, "başarılı", "FONET vizit isteğini başarıyla kabul etti.", { select: false, lock: true });
          success += 1;
        } catch (error) {
          if (error.httpStatus === 401 || error.httpStatus === 403) {
            setPatientStatus(patient, "hata", `Oturum/yetki hatası: ${clean(error.message)}`, { select: false, lock: true });
            failed += 1;
            state.cancelRequested = true;
          } else if (/Failed to fetch|NetworkError|timeout|zaman aşımı|Load failed/i.test(clean(error.message))) {
            setPatientStatus(patient, "belirsiz-sonuç", "Ağ yanıtı alınamadı. Mükerrer riskinden dolayı otomatik tekrar yapılmadı; FONET hizmet listesinden kontrol edin.", { select: false, lock: true });
            ambiguous += 1;
          } else {
            setPatientStatus(patient, "hata", clean(error.message) || "FONET işlemi reddetti.", { select: false, lock: true });
            failed += 1;
          }
        }
        completed += 1;
        state.message = `Tüm seçili hastalar gönderiliyor: ${completed}/${ready.length}`;
        render();
        await sleep(120);
      });
    } finally {
      state.running = false;
      const unprocessed = ready.filter((patient) => patient.status === "hazır").length;
      state.message = `Tamamlandı — Başarılı: ${success} | Hata: ${failed} | Belirsiz: ${ambiguous} | İşlenmeyen: ${unprocessed}`;
      render();
      alert(`${state.message}\n\nBelirsiz sonuçlar otomatik tekrarlanmadı. Bu satırları FONET Hizmet Listesi'nden kontrol edin.`);
    }
  }

  function statusStyle(status) {
    const styles = {
      bekliyor: ["#475569", "#f1f5f9"],
      kontrol: ["#1d4ed8", "#dbeafe"],
      hazır: ["#166534", "#dcfce7"],
      mevcut: ["#92400e", "#fef3c7"],
      belirsiz: ["#9a3412", "#ffedd5"],
      "kimlik-eksik": ["#991b1b", "#fee2e2"],
      "kontrol-hata": ["#991b1b", "#fee2e2"],
      gönderiliyor: ["#6d28d9", "#ede9fe"],
      başarılı: ["#166534", "#dcfce7"],
      hata: ["#991b1b", "#fee2e2"],
      "belirsiz-sonuç": ["#9a3412", "#ffedd5"]
    };
    return styles[status] || ["#475569", "#f1f5f9"];
  }

  function renderList() {
    const list = document.getElementById("ftv-list");
    if (!list) return;
    if (!state.patients.length) {
      list.innerHTML = '<div style="padding:30px;text-align:center;color:#64748b;border:1px dashed #94a3b8;border-radius:9px;">Henüz hasta okunmadı.<br>Klinik hasta listesi açıkken “Hastaları Oku” düğmesine basın.</div>';
      return;
    }
    list.innerHTML = state.patients.map((patient, index) => {
      const [color, background] = statusStyle(patient.status);
      return `<label style="display:grid;grid-template-columns:24px 42px minmax(0,1fr) auto;gap:7px;align-items:start;padding:7px 8px;border-bottom:1px solid #e2e8f0;background:${patient.selected ? "#fff" : "#f8fafc"};cursor:${patient.locked || state.running ? "default" : "pointer"};">
        <input class="ftv-patient-check" data-index="${index}" type="checkbox" ${patient.selected ? "checked" : ""} ${patient.locked || state.running ? "disabled" : ""} style="margin-top:4px;transform:scale(1.1);">
        <b style="color:#334155;margin-top:2px;">${escapeHtml(patient.oda)}</b>
        <span style="min-width:0;"><b style="color:#0f172a;">${escapeHtml(patient.adSoyad)}</b><small style="display:block;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;">${escapeHtml(patient.doktor || patient.birim || "-")}</small><small style="display:block;color:${color};margin-top:2px;">${escapeHtml(patient.detail)}</small></span>
        <span style="white-space:nowrap;border-radius:999px;padding:3px 7px;background:${background};color:${color};font-size:10px;font-weight:900;">${escapeHtml(patient.status)}</span>
      </label>`;
    }).join("");
    list.querySelectorAll(".ftv-patient-check").forEach((checkbox) => {
      checkbox.onchange = () => {
        const patient = state.patients[Number(checkbox.dataset.index)];
        if (!patient || patient.locked || state.running) return;
        patient.selected = checkbox.checked;
        render();
      };
    });
  }

  function render() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const selected = selectedPatients().length;
    const existing = state.patients.filter((patient) => patient.status === "mevcut").length;
    const success = state.patients.filter((patient) => patient.status === "başarılı").length;
    const summary = panel.querySelector("#ftv-summary");
    const message = panel.querySelector("#ftv-message");
    const stop = panel.querySelector("#ftv-stop");
    if (summary) summary.textContent = `Hasta: ${state.patients.length} | Seçili: ${selected} | Bugün mevcut: ${existing} | Başarılı: ${success}`;
    if (message) message.textContent = state.message;
    if (stop) stop.style.display = state.running ? "inline-block" : "none";
    panel.querySelectorAll("button:not(#ftv-close):not(#ftv-stop)").forEach((button) => { button.disabled = state.running; button.style.opacity = state.running ? ".55" : "1"; });
    renderList();
  }

  function selectAll(selected) {
    if (state.running) return;
    state.patients.forEach((patient) => {
      if (!patient.locked && !["mevcut", "başarılı", "belirsiz-sonuç"].includes(patient.status)) patient.selected = selected;
    });
    render();
  }

  function close() {
    if (state.running) {
      alert("İşlem sürerken panel kapatılamaz. Önce Durdur düğmesine basın.");
      return;
    }
    document.getElementById(PANEL_ID)?.remove();
    delete window[APP_KEY];
  }

  function makePanel() {
    document.getElementById(PANEL_ID)?.remove();
    const panel = document.createElement("section");
    panel.id = PANEL_ID;
    panel.style.cssText = "position:fixed;right:16px;bottom:52px;z-index:2147483647;width:700px;max-width:calc(100vw - 32px);height:610px;max-height:calc(100vh - 80px);display:grid;grid-template-rows:auto auto auto auto minmax(160px,1fr) auto;background:#f8fafc;color:#0f172a;border:1px solid #64748b;border-radius:12px;box-shadow:0 18px 50px rgba(15,23,42,.4);overflow:hidden;font:13px Arial,sans-serif;";
    panel.innerHTML = `
      <header style="display:flex;justify-content:space-between;gap:10px;align-items:center;background:#0f172a;color:white;padding:11px 12px;">
        <div><b>FONET Toplu Vizit Yardımcısı v${VERSION}</b><div style="font-size:11px;color:#cbd5e1;margin-top:2px;">${VISIT_CODE} – Yataklı servis viziti · mükerrer kontrollü</div></div>
        <button id="ftv-close" style="border:0;border-radius:7px;background:#dc2626;color:white;padding:7px 10px;font-weight:900;cursor:pointer;">Kapat</button>
      </header>
      <div style="display:flex;flex-wrap:wrap;gap:7px;padding:9px 11px;background:white;border-bottom:1px solid #e2e8f0;">
        <button id="ftv-read" style="border:0;border-radius:7px;background:#2563eb;color:white;padding:8px 11px;font-weight:900;cursor:pointer;">Hastaları Oku</button>
        <button id="ftv-check" style="border:0;border-radius:7px;background:#7c3aed;color:white;padding:8px 11px;font-weight:900;cursor:pointer;">Bugünü Kontrol Et</button>
        <button id="ftv-send" style="border:0;border-radius:7px;background:#ea580c;color:white;padding:8px 11px;font-weight:900;cursor:pointer;">Seçililere Vizit At</button>
        <button id="ftv-stop" style="display:none;border:0;border-radius:7px;background:#b91c1c;color:white;padding:8px 11px;font-weight:900;cursor:pointer;">Durdur</button>
      </div>
      <div style="display:flex;gap:7px;align-items:center;padding:7px 11px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
        <button id="ftv-all" style="border:1px solid #94a3b8;border-radius:7px;background:white;padding:6px 9px;font-weight:800;cursor:pointer;">Tümünü Seç</button>
        <button id="ftv-none" style="border:1px solid #94a3b8;border-radius:7px;background:white;padding:6px 9px;font-weight:800;cursor:pointer;">Tümünü Kaldır</button>
        <span id="ftv-summary" style="margin-left:auto;color:#475569;font-size:11px;font-weight:800;"></span>
      </div>
      <label style="display:flex;gap:8px;align-items:flex-start;padding:8px 11px;background:#fff7ed;border-bottom:1px solid #fed7aa;color:#9a3412;font-size:12px;line-height:1.35;">
        <input id="ftv-attestation" type="checkbox" style="margin-top:2px;transform:scale(1.1);"><span>Seçili hastaları bugün değerlendirdiğimi, listenin doğru olduğunu ve seçilenlerin <b>tamamına tek işlemle</b> vizit hizmet kaydı oluşturulmasını onaylıyorum.</span>
      </label>
      <div id="ftv-list" style="overflow:auto;background:white;"></div>
      <div id="ftv-message" style="min-height:18px;padding:8px 11px;background:#f8fafc;border-top:1px solid #cbd5e1;color:#334155;font-size:11px;white-space:pre-wrap;"></div>`;
    document.body.appendChild(panel);

    panel.querySelector("#ftv-close").onclick = close;
    panel.querySelector("#ftv-read").onclick = () => {
      try { collectPatients(); } catch (error) { state.message = error.message; render(); alert(error.message); }
    };
    panel.querySelector("#ftv-check").onclick = () => checkSelected().catch((error) => alert(error.message));
    panel.querySelector("#ftv-send").onclick = transferSelected;
    panel.querySelector("#ftv-stop").onclick = () => {
      state.cancelRequested = true;
      state.message = "Durdurma istendi; devam eden tek istek tamamlanınca işlem kesilecek.";
      render();
    };
    panel.querySelector("#ftv-all").onclick = () => selectAll(true);
    panel.querySelector("#ftv-none").onclick = () => selectAll(false);
    render();
  }

  window[APP_KEY] = {
    show() {
      const panel = document.getElementById(PANEL_ID);
      if (panel) panel.style.display = "grid";
      else makePanel();
    },
    refresh() {
      try { collectPatients(); } catch (_) {}
    },
    close
  };

  makePanel();
  try { collectPatients(); } catch (error) {
    state.message = `${error.message} “Hastaları Oku” ile tekrar deneyin.`;
    render();
  }
})();
