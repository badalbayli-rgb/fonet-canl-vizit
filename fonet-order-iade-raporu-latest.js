(() => {
  "use strict";

  const APP_KEY = "__FONET_ORDER_RETURN_REPORT__";
  const PANEL_ID = "fonet-order-iade-raporu";
  const VERSION = "2.1.0";
  const ENDPOINT = "/Stok/EOrderHastaIade/getEOrderHastaIadeList";
  const ORDER_ENDPOINT = "/Stok/EOrder/getKayitList";

  const clean = (value) => String(value == null ? "" : value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const norm = (value) => clean(value).toLocaleLowerCase("tr-TR");
  const escapeHtml = (value) => clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  function localInputDate(date) {
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function yesterdayInput() {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return localInputDate(date);
  }

  function serviceDate(input, endOfDay = false) {
    const match = clean(input).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return "";
    return `${match[3]}.${match[2]}.${match[1]} ${endOfDay ? "23:59:59" : "00:00:00"}`;
  }

  function parseDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === "number" && value > 1000000000) return new Date(value);
    const text = clean(value);
    if (!text) return null;
    const dotNet = text.match(/\/Date\((\d+)/);
    if (dotNet) return new Date(Number(dotNet[1]));
    const tr = text.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (tr) {
      const date = new Date(Number(tr[3]), Number(tr[2]) - 1, Number(tr[1]), Number(tr[4] || 0), Number(tr[5] || 0), Number(tr[6] || 0));
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function formatDateTime(value) {
    const date = value instanceof Date ? value : parseDate(value);
    if (!date) return "-";
    return new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(date);
  }

  function dateKey(value) {
    const date = value instanceof Date ? value : parseDate(value);
    return date ? localInputDate(date) : "bilinmiyor";
  }

  function displayDateKey(key) {
    const match = clean(key).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}.${match[2]}.${match[1]}` : "Tarihi bilinmiyor";
  }

  function orderHourKey(value) {
    const date = value instanceof Date ? value : parseDate(value);
    if (!date) return "Saati bilinmiyor";
    const hour = String(date.getHours()).padStart(2, "0");
    return `${hour}:00–${hour}:59`;
  }

  function namedText(value) {
    if (value == null) return "";
    if (typeof value === "string" || typeof value === "number") return clean(value);
    if (typeof value !== "object") return "";
    return clean(value.adi || value.ad || value.name || value.text || value.label || value.aciklama || value.tanim || value.koduAdi || "");
  }

  function readPath(object, path) {
    return String(path).split(".").reduce((current, key) => current == null ? undefined : current[key], object);
  }

  function firstValue(object, paths) {
    for (const path of paths) {
      const value = readPath(object, path);
      if (value != null && value !== "") return value;
    }
    return "";
  }

  function allContexts() {
    const output = [];
    const seen = new Set();
    function walk(win) {
      if (!win || seen.has(win)) return;
      seen.add(win);
      try {
        if (win.document) output.push(win);
        for (let index = 0; index < win.frames.length; index += 1) walk(win.frames[index]);
      } catch (_) {}
    }
    try { walk(window.top); } catch (_) {}
    try { walk(window.opener); } catch (_) {}
    walk(window);
    return output;
  }

  function recordsFromStore(store) {
    const output = [];
    try { store?.each?.((record) => output.push(record)); } catch (_) {}
    try { if (!output.length && store?.getRange) output.push(...store.getRange()); } catch (_) {}
    try { if (!output.length && Array.isArray(store?.data?.items)) output.push(...store.data.items); } catch (_) {}
    return output;
  }

  function recordValue(record, paths) {
    for (const path of paths) {
      try {
        const value = record?.get?.(path);
        if (value != null && value !== "") return value;
      } catch (_) {}
      const value = readPath(record?.data || record?.raw || record || {}, path);
      if (value != null && value !== "") return value;
    }
    return "";
  }

  function deepRecordValues(record) {
    const root = record?.data || record?.raw || record || {};
    const values = [];
    const seen = new Set();
    function walk(value, path = "", depth = 0) {
      if (!value || typeof value !== "object" || depth > 8 || seen.has(value)) return;
      seen.add(value);
      Object.entries(value).forEach(([key, child]) => {
        const childPath = path ? `${path}.${key}` : key;
        if (child == null || child === "") return;
        if (typeof child === "object") walk(child, childPath, depth + 1);
        else values.push({ path: norm(childPath).replace(/[^a-z0-9çğıöşü]/g, ""), value: child });
      });
    }
    walk(root);
    return values;
  }

  function deepPatientValue(record, patterns) {
    const candidates = deepRecordValues(record)
      .map((item) => ({ ...item, score: patterns.reduce((score, pattern, index) => pattern.test(item.path) ? Math.max(score, patterns.length - index) : score, 0) }))
      .filter((item) => item.score > 0 && clean(item.value));
    candidates.sort((a, b) => b.score - a.score || a.path.length - b.path.length);
    return candidates[0]?.value || "";
  }

  function gridColumns(grid) {
    try { return grid.getColumnManager?.().getColumns?.() || grid.headerCt?.getGridColumns?.() || grid.columns || []; } catch (_) { return []; }
  }

  function patientGridScore(grid) {
    const store = grid?.getStore?.() || grid?.store;
    const records = recordsFromStore(store);
    const columns = gridColumns(grid);
    const text = norm(columns.map((column) => `${clean(column.text)} ${clean(column.dataIndex)} ${clean(column.name)}`).join(" "));
    const keys = norm(records.slice(0, 3).map((record) => Object.keys(record?.data || record?.raw || {}).join(" ")).join(" "));
    let score = 0;
    let visible = false;
    try { visible = grid?.isVisible?.(true) === true; } catch (_) {}
    try { visible = visible || grid?.getEl?.()?.isVisible?.(true) === true; } catch (_) {}
    try {
      const element = grid?.getEl?.()?.dom;
      const rect = element?.getBoundingClientRect?.();
      visible = visible || Boolean(rect && rect.width > 20 && rect.height > 20);
    } catch (_) {}
    score += visible ? 60 : -35;
    if (/adı soyadı|adi soyadi|adisoyadi/.test(text)) score += 18;
    if (/oda no|odano|yatak/.test(text)) score += 8;
    if (/doktor|personel/.test(text)) score += 4;
    if (/birimsevk|birim sevk/.test(`${text} ${keys}`)) score += 14;
    if (/gelisid|geliş id|hasta/.test(`${text} ${keys}`)) score += 7;
    if (/tedavi adı|stok adı|order|laboratuvar|radyoloji/.test(text)) score -= 12;
    if (records.length > 1) score += 3;
    const totalCount = Number(store?.getTotalCount?.() ?? store?.totalCount ?? records.length) || records.length;
    const pageSize = Number(store?.getPageSize?.() ?? store?.pageSize ?? records.length) || records.length || 1;
    const currentPage = Number(store?.currentPage) || 1;
    return { score, visible, records, store, totalCount, pageSize, currentPage };
  }

  function findPatientGrid() {
    const candidates = [];
    for (const context of allContexts()) {
      try {
        const bodyText = clean(context.document?.body?.innerText || "");
        const countHints = [...bodyText.matchAll(/(?:^|\s)Yatan\s*:\s*(\d+)/gi)]
          .map((match) => Number(match[1]))
          .filter((value) => Number.isFinite(value) && value >= 0);
        const grids = context.Ext?.ComponentQuery?.query?.("gridpanel, grid") || [];
        grids.forEach((grid) => {
          const result = patientGridScore(grid);
          if (countHints.includes(result.totalCount) || countHints.includes(result.records.length)) result.score += 140;
          if (result.records.length) candidates.push({ context, grid, ...result });
        });
      } catch (_) {}
    }
    candidates.sort((a, b) => b.score - a.score || b.records.length - a.records.length);
    if (!candidates.length || candidates[0].score < 25) throw new Error("FONET Klinik hasta listesi bulunamadı. Klinik ekranını ve hasta listesini açık tutun.");
    return candidates[0];
  }

  function patientsFromRecords(records) {
    const unique = new Map();
    const unreadable = [];
    records.forEach((record, index) => {
      const data = record?.data || record?.raw || record || {};
      const birimSevkId = clean(recordValue(record, [
        "birimSevkId", "birimsevkid", "BIRIMSEVKID", "BIRIM_SEVK_ID", "hastaBirimSevkId", "HASTA_BIRIM_SEVK_ID",
        "klinik.birimSevk.id", "hastaKlinik.birimSevk.id", "hasta.birimSevk.id", "birimSevk.id", "sevk.birimSevk.id"
      ]) || deepPatientValue(record, [/birimsevkid$/, /hastabirimsevkid$/, /birimsevk.*id$/, /sevk.*birim.*id$/]));
      const adSoyad = clean(recordValue(record, [
        "adiSoyadi", "adiSoyadi1", "adSoyad", "hastaAdiSoyadi", "hastaAdSoyad", "ADSOYAD", "ADI_SOYADI",
        "hasta.adiSoyadi", "hasta.adSoyad", "kimlik.adiSoyadi", "hasta.kimlik.adiSoyadi"
      ]) || deepPatientValue(record, [/hasta.*adisoyadi$/, /hasta.*adsoyad$/, /kimlik.*adisoyadi$/, /adisoyadi$/, /adsoyad$/]));
      const oda = clean(recordValue(record, ["odaNo", "ODANO", "ODA_NO", "klinik.yatak.oda.odaNo", "yatak.oda.odaNo"]) || deepPatientValue(record, [/odano$/]));
      const yatak = clean(recordValue(record, ["yatakNo", "YATAKNO", "YATAK_NO", "klinik.yatak.yatakNo", "yatak.yatakNo"]) || deepPatientValue(record, [/yatakno$/]));
      if (!birimSevkId || !adSoyad) {
        unreadable.push({ index: index + 1, adSoyad: adSoyad || "Adı okunamadı", hasSevk: Boolean(birimSevkId) });
        return;
      }
      if (!unique.has(birimSevkId)) unique.set(birimSevkId, { index, birimSevkId, adSoyad, oda: [oda, yatak].filter(Boolean).join("/") || "-", raw: data });
    });
    if (!unique.size) throw new Error("Hasta listesinden birim/sevk bilgisi okunamadı.");
    state.sourceRowCount = records.length;
    state.unreadablePatients = unreadable;
    state.duplicatePatientRows = Math.max(0, records.length - unreadable.length - unique.size);
    return [...unique.values()];
  }

  function collectPatients() {
    const candidate = findPatientGrid();
    state.sourceContext = candidate.context;
    state.sourceStore = candidate.store;
    state.sourceGrid = candidate.grid;
    state.sourceTotalCount = candidate.totalCount;
    state.sourcePageSize = candidate.pageSize;
    state.sourceCurrentPage = candidate.currentPage;
    state.sourceLoadedCount = candidate.records.length;
    state.sourceGridVisible = Boolean(candidate.visible);
    state.patients = patientsFromRecords(candidate.records);
    return state.patients;
  }

  function loadStorePage(store, page) {
    if (!store?.loadPage) return Promise.resolve(recordsFromStore(store));
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback) => (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        callback(value);
      };
      const ok = finish(resolve);
      const fail = finish(reject);
      const timer = setTimeout(() => fail(new Error(`FONET hasta listesinin ${page}. sayfası zaman aşımına uğradı.`)), 20000);
      try {
        store.loadPage(page, { callback(records, operation, success) {
          if (success === false) fail(new Error(`FONET hasta listesinin ${page}. sayfası yüklenemedi.`));
          else ok(Array.isArray(records) && records.length ? records : recordsFromStore(store));
        } });
      } catch (error) { fail(error); }
    });
  }

  async function collectAllListedPatients() {
    collectPatients();
    const store = state.sourceStore;
    const total = Number(state.sourceTotalCount) || state.patients.length;
    const pageSize = Math.max(1, Number(state.sourcePageSize) || state.sourceLoadedCount || state.patients.length);
    const pageCount = Math.ceil(total / pageSize);
    if (!store?.loadPage || pageCount <= 1 || total <= state.sourceLoadedCount) {
      state.sourceTotalCount = Math.max(total, state.patients.length);
      state.sourceLoadedCount = state.patients.length;
      return state.patients;
    }
    if (total > 2500) throw new Error(`FONET hasta listesinde ${total} kayıt var; güvenlik sınırı 2500. Listeyi birim/servis filtresiyle daraltın.`);
    const originalPage = Number(store.currentPage) || state.sourceCurrentPage || 1;
    const allRecords = [];
    let pageError = null;
    try {
      for (let page = 1; page <= pageCount; page += 1) {
        state.message = `FONET listesinin tamamı okunuyor: sayfa ${page}/${pageCount} · ${total} hasta`;
        updateStatus();
        allRecords.push(...await loadStorePage(store, page));
      }
    } catch (error) {
      pageError = error;
    } finally {
      if ((Number(store.currentPage) || 1) !== originalPage) {
        try { await loadStorePage(store, originalPage); } catch (_) {}
      }
    }
    if (pageError) throw pageError;
    state.patients = patientsFromRecords(allRecords);
    state.sourceLoadedCount = state.patients.length;
    return state.patients;
  }

  function apiOrigin() {
    for (const context of [state.sourceContext, ...allContexts()]) {
      try { if (/^https?:$/i.test(context.location.protocol)) return context.location.origin; } catch (_) {}
    }
    return "http://hbys.bursa.yerel";
  }

  async function apiGet(path, params, signal) {
    const query = new URLSearchParams(params);
    query.set("_dc", String(Date.now()));
    const context = state.sourceContext || window;
    const fetchFunction = context.fetch?.bind(context) || fetch.bind(window);
    const response = await fetchFunction(`${apiOrigin()}/hbys-rs/hbys${path}?${query}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal,
      headers: { "Accept": "application/json, text/plain, */*", "X-Requested-With": "XMLHttpRequest" }
    });
    const text = await response.text();
    let payload;
    try { payload = text ? JSON.parse(text) : {}; } catch (_) { payload = { text }; }
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${clean(text).slice(0, 300)}`);
    const failure = businessFailure(payload);
    if (failure) throw new Error(failure);
    return payload;
  }

  function businessFailure(payload) {
    const objects = [payload, payload?.data, payload?.jsonArray, payload?.jsonArray?.data].filter((value) => value && typeof value === "object");
    for (const object of objects) {
      if (object.OK === false || object.ok === false || object.success === false || object.success === "false") {
        return clean(object.message || object.mesaj || object.msg || object.exception?.message || "FONET sorguyu reddetti.");
      }
      if (object.exception) return clean(object.exception.message || object.exception.description || object.exception) || "FONET sorgu hatası.";
    }
    return "";
  }

  function responseRows(payload) {
    const directChoices = [
      payload?.data?.data,
      payload?.data?.rows,
      payload?.data?.content,
      payload?.data?.list,
      payload?.data,
      payload?.jsonArray?.data?.data,
      payload?.jsonArray?.data?.rows,
      payload?.jsonArray?.data,
      payload?.jsonArray,
      payload?.rows,
      payload?.content,
      payload?.list,
      payload?.result?.data,
      payload?.result?.rows,
      payload?.result,
      payload
    ];
    const direct = directChoices.find(Array.isArray);
    if (direct) return direct;

    // FONET sürümleri aynı listeyi farklı zarflar içinde döndürebiliyor.
    // Sadece bilinen liste anahtarlarında sınırlı derinlikte arama yap.
    const queue = [{ value: payload, depth: 0 }];
    const seen = new Set();
    const listKeys = ["data", "rows", "content", "list", "result", "jsonArray", "items", "records"];
    while (queue.length) {
      const { value, depth } = queue.shift();
      if (!value || typeof value !== "object" || seen.has(value) || depth > 4) continue;
      seen.add(value);
      for (const key of listKeys) {
        const child = value[key];
        if (Array.isArray(child)) return child;
        if (child && typeof child === "object") queue.push({ value: child, depth: depth + 1 });
      }
    }
    return [];
  }

  function enumLabel(typeKey, typeName, value) {
    const direct = namedText(value);
    if (direct && !/^\d+$/.test(direct)) return direct;
    const id = value && typeof value === "object" ? value.id ?? value.value : value;
    if (id == null || id === "") return "Belirtilmemiş";
    const context = state.sourceContext || window;
    try {
      const enumType = context.enumStoreTip?.[typeKey] || typeName;
      const store = context.getEnumStore?.(enumType);
      const records = recordsFromStore(store);
      const match = records.find((record) => String(recordValue(record, ["id", "value", "kodu", "kod"])) === String(id));
      const text = clean(recordValue(match, ["adi", "ad", "name", "text", "label", "aciklama"]));
      if (text) return text;
    } catch (_) {}
    return `Kod ${clean(id)}`;
  }

  function numberValue(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const normalized = clean(value).replace(/\s/g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
    const number = Number(normalized);
    return Number.isFinite(number) ? number : 0;
  }

  function normalizeReturn(raw, patient) {
    const row = raw?.data || raw?.raw || raw || {};
    const returnDateRaw = firstValue(row, ["orderIadeTarih", "iadeTarihi", "iadeTarih"]);
    const returnDate = parseDate(returnDateRaw);
    const orderDateRaw = firstValue(row, ["tarih", "eorderPlan.tarih", "eorderPlan.eorder.baslangicTarihi", "istemTarihi"]);
    const quantityRaw = firstValue(row, ["iadeMiktar", "orderIadeMiktar", "miktar"]);
    const stock = firstValue(row, ["stok", "eorderPlan.eorder.stok", "eorderPlan.stok"]);
    const drugName = clean(namedText(stock) || firstValue(row, ["stokAdi", "eorderPlaneorderstokadi", "tedaviAdi", "ilacAdi"]) || "İlaç adı okunamadı");
    const reasonRaw = firstValue(row, ["orderIadeNeden", "iadeNeden"]);
    const statusRaw = firstValue(row, ["orderIade", "iadeDurumu"]);
    return {
      id: clean(firstValue(row, ["id", "eorderPlanDetayId"]) || `${patient.birimSevkId}-${Math.random()}`),
      patientKey: patient.birimSevkId,
      patientName: patient.adSoyad,
      room: patient.oda,
      drugName,
      stockCode: clean(firstValue(row, ["stok.kodu", "eorderPlan.eorder.stok.kodu", "eorderPlaneorderstokkodu"])),
      quantity: numberValue(quantityRaw),
      quantityText: clean(quantityRaw),
      orderDate: parseDate(orderDateRaw),
      returnDate,
      returnDateRaw: clean(returnDateRaw),
      rejected: Boolean(parseDate(firstValue(row, ["orderRedTarih", "iadeRedTarih"]))),
      reason: enumLabel("StokOrderIadeNeden_tr_com_fonet_hbys_common_enums", "tr.com.fonet.hbys.common.enums.StokOrderIadeNeden", reasonRaw),
      status: enumLabel("StokOrderIadeDurum_tr_com_fonet_hbys_common_enums", "tr.com.fonet.hbys.common.enums.StokOrderIadeDurum", statusRaw),
      explanation: clean(firstValue(row, ["orderIadeAciklama", "iadeAciklama", "aciklama"])),
      returnPerson: clean(firstValue(row, ["orderIadeKullanici.kimlik.adiSoyadi", "orderIadeKullanici.kimlik.adSoyad", "orderIadeKullanici.adiSoyadi", "iadePersonelAdi"]) || namedText(firstValue(row, ["orderIadeKullanici.kimlik", "orderIadeKullanici"])) || "Belirtilmemiş"),
      depot: clean(namedText(firstValue(row, ["eorderPlan.depo", "depo"]))),
      orderNo: clean(firstValue(row, ["orderNo", "eorderPlan.eorder.orderNo"])),
      orderId: clean(firstValue(row, ["eorderPlan.eorder.id", "eorder.id", "eorderId", "orderId"])),
      matchedOrderKey: "",
      orderingPerson: clean(firstValue(row, ["eorderPlan.eorder.kullanici.kimlik.adiSoyadi", "eorderPlan.eorder.ekleyenKullanici.kimlik.adiSoyadi", "eorderPlan.eorder.personel.kimlik.adiSoyadi", "eorderPlan.eorder.doktor.kimlik.adiSoyadi", "orderKullanici.kimlik.adiSoyadi", "istemYapanPersonel.kimlik.adiSoyadi"]) || namedText(firstValue(row, ["eorderPlan.eorder.kullanici.kimlik", "eorderPlan.eorder.personel.kimlik", "eorderPlan.eorder.doktor.kimlik"]))),
      raw: row
    };
  }

  function rangeBounds(startInput, endInput) {
    const start = parseDate(`${startInput}T00:00:00`);
    const end = parseDate(`${endInput}T23:59:59`);
    return { start, end };
  }

  function withinRange(date, start, end) {
    return date instanceof Date && !Number.isNaN(date.getTime()) && date >= start && date <= end;
  }

  async function fetchPatientReturns(patient, startInput, endInput, signal) {
    const request = (requestFilters) => apiGet(ENDPOINT, {
        autoStores: JSON.stringify(["orderIade", "orderIadeNeden", "uygulamaDurumu", "stokTuru"]),
        filterMap: "",
        filter: JSON.stringify(requestFilters),
        page: "1",
        start: "0",
        limit: "10000"
      }, signal);
    // Hem tarih hem de sevk alanının adı FONET sürümleri arasında değişebiliyor.
    // Görünür hastanın sevk kimliğiyle bilinen alanları sırayla dene; tarihi yerelde süz.
    const patientValue = Number(patient.birimSevkId) || patient.birimSevkId;
    const patientProperties = [
      "eorderPlan.eorder.birimSevk.id",
      "eorderPlan.birimSevk.id",
      "birimSevk.id"
    ];
    let payload = null;
    let rows = [];
    let lastError = null;
    let successfulRequest = false;
    for (const property of patientProperties) {
      try {
        payload = await request([{ index: 1, property, value: patientValue, type: "Long", operator: "=", filterType: "kriterPanel" }]);
        successfulRequest = true;
        rows = responseRows(payload);
        if (rows.length) break;
      } catch (error) {
        if (error?.name === "AbortError") throw error;
        lastError = error;
      }
    }
    if (!successfulRequest && lastError) throw lastError;
    const bounds = rangeBounds(startInput, endInput);
    return rows
      .map((row) => normalizeReturn(row, patient))
      .filter((row) => !row.rejected && withinRange(row.returnDate, bounds.start, bounds.end));
  }

  function normalizeOrder(raw, patient) {
    const row = raw?.data || raw?.raw || raw || {};
    const stock = firstValue(row, ["stok", "eorder.stok", "malzeme", "hizmetMakro"]);
    return {
      id: clean(firstValue(row, ["id", "eorderId", "orderId"])),
      orderNo: clean(firstValue(row, ["orderNo", "orderNumarasi", "protokolNo"])),
      patientKey: patient.birimSevkId,
      patientName: patient.adSoyad,
      room: patient.oda,
      drugName: clean(namedText(stock) || firstValue(row, ["stokAdi", "malzemeAdi", "tedaviAdi", "ilacAdi"]) || "Order adı okunamadı"),
      stockCode: clean(firstValue(row, ["stok.kodu", "eorder.stok.kodu", "malzeme.kodu"])),
      orderDate: parseDate(firstValue(row, ["baslangicTarihi", "tarih", "istemTarihi", "eklemeTarihi"])),
      orderingPerson: orderPersonName(row),
      raw: row
    };
  }

  function orderPersonName(row) {
    const direct = clean(firstValue(row, [
      "e.personel.kimlik.adiSoyadi", "e.doktor.kimlik.adiSoyadi", "e.kullanici.kimlik.adiSoyadi",
      "eorder.personel.kimlik.adiSoyadi", "eorder.doktor.kimlik.adiSoyadi", "eorder.kullanici.kimlik.adiSoyadi",
      "personel.kimlik.adiSoyadi", "doktor.kimlik.adiSoyadi", "hekim.kimlik.adiSoyadi",
      "istemYapanPersonel.kimlik.adiSoyadi", "istemYapanDoktor.kimlik.adiSoyadi", "isteyenDoktor.kimlik.adiSoyadi",
      "orderPersonel.kimlik.adiSoyadi", "orderVerenPersonel.kimlik.adiSoyadi", "olusturanPersonel.kimlik.adiSoyadi",
      "kullanici.kimlik.adiSoyadi", "ekleyenKullanici.kimlik.adiSoyadi", "kayitKullanici.kimlik.adiSoyadi",
      "personel.adiSoyadi", "doktor.adiSoyadi", "hekim.adiSoyadi", "kullanici.adiSoyadi"
    ]));
    if (direct) return direct;
    const candidates = [];
    const seen = new Set();
    function walk(value, path = "", depth = 0) {
      if (!value || typeof value !== "object" || depth > 6 || seen.has(value)) return;
      seen.add(value);
      for (const [key, child] of Object.entries(value)) {
        const childPath = `${path}.${key}`;
        if (/(personel|doktor|hekim|istem.*yapan|isteyen|order.*veren|kullanici|ekleyen|olusturan)/i.test(childPath)) {
          const name = clean(typeof child === "string" ? child : child?.kimlik?.adiSoyadi || child?.adiSoyadi || child?.adSoyad || child?.name);
          if (name && !/^\d+$/.test(name)) {
            let score = 1;
            if (/(doktor|hekim|istem.*yapan|isteyen|order.*veren)/i.test(childPath)) score += 5;
            if (/personel/i.test(childPath)) score += 3;
            if (/kullanici|ekleyen|olusturan/i.test(childPath)) score += 2;
            candidates.push({ name, score });
          }
        }
        if (child && typeof child === "object") walk(child, childPath, depth + 1);
      }
    }
    walk(row);
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.name || "Belirtilmemiş";
  }

  async function fetchPatientOrdersForDay(patient, dayInput, signal) {
    const filters = [
      { index: 1, property: "tarihTuru", value: "tarihAraligiIcinde", filterType: "kriterPanel", isEnum: false, type: "String", operator: "=" },
      { index: 2, property: "tarih", value: serviceDate(dayInput, false), filterType: "kriterPanel", type: "date", operator: "=" },
      // FONET'in çalışan E-Order ekranının kullandığı tek-gün sorgu biçimi.
      { index: 3, property: "e.baslangicTarihi", value: serviceDate(dayInput, false), filterType: "kriterPanel", type: "date", operator: ">=" },
      { index: 4, property: "e.bitisTarihi", value: serviceDate(dayInput, true), filterType: "kriterPanel", type: "date", operator: "<=" },
      { index: 5, property: "birimSevk.id", value: Number(patient.birimSevkId) || patient.birimSevkId, filterType: "kriterPanel", type: "Long", operator: "=" },
      { index: 6, property: "yeri", value: 2, filterType: "kriterPanel", isEnum: true, type: "tr.com.fonet.hbys.common.enums.EOrderYeri", operator: "=" },
      { index: 7, property: "hemsireOrder", value: "false", filterType: "kriterPanel", isEnum: false, type: "String", operator: "=" }
    ];
    const payload = await apiGet(ORDER_ENDPOINT, {
      autoStores: JSON.stringify(["turu", "stokTuru", "antibiyotikTuru", "ekstravazeIlacSekli", "durum"]),
      filterMap: "",
      filter: JSON.stringify(filters),
      page: "1",
      start: "0",
      limit: "10000"
    }, signal);
    return responseRows(payload).map((row) => normalizeOrder(row, patient));
  }

  function inputDatesBetween(startInput, endInput) {
    const dates = [];
    const start = parseDate(`${startInput}T12:00:00`);
    const end = parseDate(`${endInput}T12:00:00`);
    for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      dates.push(localInputDate(cursor));
    }
    return dates;
  }

  async function fetchPatientOrders(patient, startInput, endInput, signal) {
    // FONET istekleri aynı hasta için eşzamanlı çalıştırıldığında eksik liste
    // döndürebiliyor. Günleri sıralı oku, sonra aynı orderı tekilleştir.
    const dayResults = [];
    for (const day of inputDatesBetween(startInput, endInput)) {
      if (signal?.aborted) throw new DOMException("Durduruldu", "AbortError");
      dayResults.push(await fetchPatientOrdersForDay(patient, day, signal));
    }
    const unique = new Map();
    dayResults.flat().forEach((order) => {
      const stableKey = clean(order.id || order.orderNo) || [order.patientKey, norm(order.stockCode || order.drugName), order.orderDate?.getTime() || ""].join("|");
      if (!unique.has(stableKey)) unique.set(stableKey, order);
    });
    return [...unique.values()];
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

  function groupRows(rows, keyFunction) {
    const map = new Map();
    rows.forEach((row) => {
      const key = clean(keyFunction(row)) || "Belirtilmemiş";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    });
    return map;
  }

  function aggregateReturns(rows) {
    const grouped = new Map();
    rows.forEach((row) => {
      const key = [row.patientKey, dateKey(row.returnDate), norm(row.stockCode || row.drugName)].join("|");
      if (!grouped.has(key)) {
        grouped.set(key, {
          ...row,
          quantity: 0,
          recordCount: 0,
          entries: [],
          orderDates: [],
          returnPersons: [],
          reasons: [],
          statuses: [],
          explanations: [],
          orderNos: []
        });
      }
      const aggregate = grouped.get(key);
      aggregate.quantity += row.quantity;
      aggregate.recordCount += 1;
      aggregate.entries.push(row);
      if (row.orderDate) aggregate.orderDates.push(row.orderDate);
      if (row.returnPerson) aggregate.returnPersons.push(row.returnPerson);
      if (row.reason) aggregate.reasons.push(row.reason);
      if (row.status) aggregate.statuses.push(row.status);
      if (row.explanation) aggregate.explanations.push(row.explanation);
      if (row.orderNo) aggregate.orderNos.push(row.orderNo);
    });
    const uniqueTexts = (values) => [...new Set(values.map(clean).filter(Boolean))];
    return [...grouped.values()].map((row) => {
      row.orderDates.sort((a, b) => a - b);
      row.orderDate = row.orderDates[0] || row.orderDate;
      row.returnPersons = uniqueTexts(row.returnPersons);
      row.reasons = uniqueTexts(row.reasons);
      row.statuses = uniqueTexts(row.statuses);
      row.explanations = uniqueTexts(row.explanations);
      row.orderNos = uniqueTexts(row.orderNos);
      row.returnPerson = row.returnPersons.join(", ") || "Belirtilmemiş";
      row.reason = row.reasons.join(", ") || "Belirtilmemiş";
      row.status = row.statuses.join(", ") || "Belirtilmemiş";
      row.explanation = row.explanations.join(" | ");
      row.orderNo = row.orderNos.join(", ");
      return row;
    });
  }

  function detailRows(rows) {
    return rows.flatMap((row) => Array.isArray(row.entries) && row.entries.length ? row.entries : [row]);
  }

  function summarize(rows, orders = state.orders) {
    const details = detailRows(rows);
    const byDrug = [...groupRows(rows, (row) => row.drugName)].map(([name, items]) => ({
      name,
      lines: items.reduce((sum, item) => sum + (item.recordCount || 1), 0),
      quantity: items.reduce((sum, item) => sum + item.quantity, 0),
      patients: new Set(items.map((item) => item.patientKey)).size
    })).sort((a, b) => b.quantity - a.quantity || b.lines - a.lines || a.name.localeCompare(b.name, "tr"));
    const countMap = (selector, source = details) => [...groupRows(source, selector)].map(([name, items]) => ({
      name,
      lines: items.length,
      quantity: items.reduce((sum, item) => sum + item.quantity, 0),
      patients: new Set(items.map((item) => item.patientKey)).size
    })).sort((a, b) => b.quantity - a.quantity || b.lines - a.lines || a.name.localeCompare(b.name, "tr"));
    const byOrderHour = countMap((row) => orderHourKey(row.orderDate)).sort((a, b) => {
      if (a.name === "Saati bilinmiyor") return 1;
      if (b.name === "Saati bilinmiyor") return -1;
      return a.name.localeCompare(b.name, "tr");
    });
    const byPerson = countMap((row) => row.returnPerson || "Belirtilmemiş")
      .sort((a, b) => b.lines - a.lines || b.quantity - a.quantity || a.name.localeCompare(b.name, "tr"));
    const returnedOrderKeys = new Set(details.map((row) => clean(row.matchedOrderKey || row.orderId || row.orderNo)).filter(Boolean));
    const byOrderingPerson = [...groupRows(orders, (order) => order.orderingPerson || "Belirtilmemiş")].map(([name, personOrders]) => {
      const orderKeys = new Set(personOrders.map((order) => clean(order.id || order.orderNo)).filter(Boolean));
      const personReturns = details.filter((row) => norm(row.orderingPerson || "Belirtilmemiş") === norm(name));
      const returnedOrders = [...orderKeys].filter((key) => returnedOrderKeys.has(key)).length;
      return {
        name,
        orders: personOrders.length,
        returnedOrders,
        returnedMedicines: personReturns.length,
        returnLines: personReturns.length,
        returnQuantity: personReturns.reduce((sum, row) => sum + row.quantity, 0),
        rate: personOrders.length ? (personReturns.length / personOrders.length) * 100 : 0
      };
    }).sort((a, b) => b.rate - a.rate || b.returnedMedicines - a.returnedMedicines || b.orders - a.orders || a.name.localeCompare(b.name, "tr"));
    return {
      lines: details.length,
      displayLines: rows.length,
      quantity: rows.reduce((sum, row) => sum + row.quantity, 0),
      patientCount: new Set(rows.map((row) => row.patientKey)).size,
      drugCount: new Set(rows.map((row) => norm(row.drugName))).size,
      totalOrders: orders.length,
      returnedOrders: returnedOrderKeys.size,
      returnedMedicines: details.length,
      returnRate: orders.length ? (details.length / orders.length) * 100 : 0,
      byDrug,
      byReason: countMap((row) => row.reason),
      byReturnDate: countMap((row) => displayDateKey(dateKey(row.returnDate))),
      byOrderDate: countMap((row) => displayDateKey(dateKey(row.orderDate))),
      byOrderHour,
      byPerson,
      byOrderingPerson
    };
  }

  function quantityText(value) {
    return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 3 }).format(Number(value) || 0);
  }

  function orderDatesText(row) {
    const dates = Array.isArray(row.orderDates) && row.orderDates.length ? row.orderDates : [row.orderDate].filter(Boolean);
    return [...new Set(dates.map(formatDateTime))].join(" | ") || "-";
  }

  function hourNarrative(items) {
    return items.map((item) => `${item.name} saatinde order edilenlerden ${item.lines} iade kaydı, toplam ${quantityText(item.quantity)} miktar iade olmuş.`);
  }

  function filteredRows() {
    const search = norm(state.search);
    if (!search) return state.rows;
    return state.rows.filter((row) => norm([row.patientName, row.room, row.drugName, row.reason, row.status, row.explanation, row.stockCode, row.returnPerson].join(" ")).includes(search));
  }

  function updateStatus() {
    const element = uiDocument()?.getElementById("foir-status");
    if (element) element.textContent = state.message;
  }

  async function runReport() {
    if (state.running) return;
    const startInput = clean(uiDocument()?.getElementById("foir-start")?.value || state.startInput);
    const endInput = clean(uiDocument()?.getElementById("foir-end")?.value || state.endInput);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startInput) || !/^\d{4}-\d{2}-\d{2}$/.test(endInput) || startInput > endInput) {
      alert("Geçerli bir başlangıç ve bitiş tarihi seçin.");
      return;
    }
    state.startInput = startInput;
    state.endInput = endInput;
    state.running = true;
    state.cancelRequested = false;
    state.rows = [];
    state.orders = [];
    state.selectedDrug = "";
    state.selectedPerson = "";
    state.selectedOrderPerson = "";
    state.view = "analysis";
    state.errors = [];
    state.orderErrors = [];
    state.fallbackCount = 0;
    state.controller = new AbortController();
    try {
      await collectAllListedPatients();
      if (state.unreadablePatients.length) {
        const examples = state.unreadablePatients.slice(0, 5).map((item) => `${item.index}. satır ${item.adSoyad}`).join(", ");
        throw new Error(`FONET listesindeki ${state.sourceRowCount} satırın ${state.unreadablePatients.length} tanesinde birim/sevk kimliği okunamadı (${examples}). Eksik hastalar atlanmadı; yanlış rapor üretmemek için işlem durduruldu.`);
      }
      state.message = `FONET listesi doğrulandı: ${state.sourceRowCount} satır · ${state.patients.length} benzersiz hasta/sevk · İadeler ve orderlar okunuyor...`;
      render();
      let completed = 0;
      await runPool(state.patients, 2, async (patient) => {
        const [returnResult, orderResult] = await Promise.allSettled([
          fetchPatientReturns(patient, startInput, endInput, state.controller.signal),
          fetchPatientOrders(patient, startInput, endInput, state.controller.signal)
        ]);
        if (returnResult.status === "fulfilled") state.rows.push(...returnResult.value);
        else if (returnResult.reason?.name !== "AbortError") state.errors.push({ patient: `${patient.oda} · ${patient.adSoyad}`, message: clean(returnResult.reason?.message) });
        if (orderResult.status === "fulfilled") state.orders.push(...orderResult.value);
        else if (orderResult.reason?.name !== "AbortError") state.orderErrors.push({ patient: `${patient.oda} · ${patient.adSoyad}`, message: clean(orderResult.reason?.message) });
        completed += 1;
        state.message = `Sorgu: ${completed}/${state.patients.length} hasta · ${state.rows.length} iade satırı`;
        updateStatus();
      });
      const orderById = new Map();
      state.orders.forEach((order) => {
        const key = clean(order.id || order.orderNo);
        if (key) orderById.set(key, order);
      });
      state.rows.forEach((row) => {
        let matchedOrder = orderById.get(clean(row.orderId || row.orderNo));
        if (!matchedOrder) {
          const candidates = state.orders.filter((order) => order.patientKey === row.patientKey && norm(order.stockCode || order.drugName) === norm(row.stockCode || row.drugName));
          candidates.sort((a, b) => {
            const aDistance = a.orderDate && row.returnDate ? Math.abs(row.returnDate - a.orderDate) : Number.MAX_SAFE_INTEGER;
            const bDistance = b.orderDate && row.returnDate ? Math.abs(row.returnDate - b.orderDate) : Number.MAX_SAFE_INTEGER;
            return aDistance - bDistance;
          });
          matchedOrder = candidates[0];
        }
        if (!row.orderingPerson && matchedOrder) row.orderingPerson = matchedOrder.orderingPerson;
        if (matchedOrder) row.matchedOrderKey = clean(matchedOrder.id || matchedOrder.orderNo);
      });
      const rawCount = state.rows.length;
      state.rows = aggregateReturns(state.rows);
      state.rows.sort((a, b) => a.patientName.localeCompare(b.patientName, "tr") || (b.returnDate || 0) - (a.returnDate || 0) || a.drugName.localeCompare(b.drugName, "tr"));
      const summary = summarize(state.rows);
      state.message = state.cancelRequested
        ? `Sorgu durduruldu. Okunan ${rawCount} iade kaydı, ${state.rows.length} birleşik satırda gösteriliyor.`
        : `Tamamlandı: ${state.sourceRowCount} liste satırı · ${state.patients.length} hasta/sevk tarandı · ${summary.totalOrders} order edilen ilaç · ${summary.returnedMedicines} iade edilen ilaç · İade/Order oranı %${quantityText(summary.returnRate)} · İade sorgu hatası ${state.errors.length} · Order sorgu hatası ${state.orderErrors.length}`;
    } finally {
      state.running = false;
      state.controller = null;
      render();
    }
  }

  function csvCell(value) {
    const text = clean(value).replace(/"/g, '""');
    return `"${text}"`;
  }

  function exportCsv() {
    const rows = filteredRows();
    if (!rows.length) { alert("Dışa aktarılacak iade kaydı yok."); return; }
    const header = ["Hasta", "Oda/Yatak", "İlaç", "Stok Kodu", "Birleştirilen İade Kaydı", "Toplam İade Miktarı", "Order/Uygulama Tarihleri", "İade Tarihi", "İade Nedeni", "Durum", "Açıklama", "İade Personeli", "Order No"];
    const lines = [header, ...rows.map((row) => [row.patientName, row.room, row.drugName, row.stockCode, row.recordCount || 1, quantityText(row.quantity), orderDatesText(row), formatDateTime(row.returnDate), row.reason, row.status, row.explanation, row.returnPerson, row.orderNo])];
    const blob = new Blob(["\uFEFF", lines.map((line) => line.map(csvCell).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const doc = uiDocument() || document;
    const anchor = doc.createElement("a");
    anchor.href = url;
    anchor.download = `fonet-order-iade-${state.startInput}-${state.endInput}.csv`;
    doc.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copySummary() {
    const rows = filteredRows();
    const summary = summarize(rows);
    const top = summary.byDrug.slice(0, 10).map((item, index) => `${index + 1}. ${item.name}: ${quantityText(item.quantity)} (${item.lines} iade kaydı, ${item.patients} hasta)`).join("\n");
    const personnel = summary.byPerson.slice(0, 10).map((item, index) => `${index + 1}. ${item.name}: ${item.lines} iade kaydı, ${quantityText(item.quantity)} miktar`).join("\n");
    const hours = hourNarrative(summary.byOrderHour).join("\n");
    const text = [
      `FONET Order İade Raporu (${state.startInput} – ${state.endInput})`,
      `Toplam order edilen ilaç: ${summary.totalOrders} | Toplam iade edilen ilaç: ${summary.returnedMedicines} | İade edilen/Order edilen ilaç oranı: %${quantityText(summary.returnRate)} | Toplam iade miktarı: ${quantityText(summary.quantity)} | Hasta: ${summary.patientCount}`,
      summary.byDrug[0] ? `En çok iade edilen ilaç: ${summary.byDrug[0].name} — ${quantityText(summary.byDrug[0].quantity)}` : "İade kaydı yok.",
      summary.byPerson[0] ? `En çok iade yapan personel: ${summary.byPerson[0].name} — ${summary.byPerson[0].lines} iade kaydı, ${quantityText(summary.byPerson[0].quantity)} miktar` : "İade personeli bilgisi yok.",
      "",
      "En çok iade edilen ilaçlar:",
      top || "-",
      "",
      "En çok iade yapan personeller:",
      personnel || "-",
      "",
      "Order saatine göre iade analizi:",
      hours || "-"
    ].join("\n");
    try { await navigator.clipboard.writeText(text); state.message = "Rapor özeti panoya kopyalandı."; } catch (_) { alert(text); }
    updateStatus();
  }

  function printReport() {
    const rows = filteredRows();
    if (!rows.length) { alert("Yazdırılacak iade kaydı yok."); return; }
    const summary = summarize(rows);
    const win = window.open("", "_blank", "width=1200,height=850");
    if (!win) { alert("Yazdırma penceresi açılamadı."); return; }
    const hourRows = summary.byOrderHour.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${item.lines}</td><td>${quantityText(item.quantity)}</td><td>${item.patients}</td></tr>`).join("");
    const personRows = summary.byPerson.slice(0, 20).map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${item.lines}</td><td>${quantityText(item.quantity)}</td><td>${item.patients}</td></tr>`).join("");
    const detailRowsHtml = rows.map((row) => `<tr><td>${escapeHtml(row.patientName)}</td><td>${escapeHtml(row.room)}</td><td>${row.recordCount > 1 ? `<b>${row.recordCount} iade · </b>` : ""}${escapeHtml(row.drugName)}</td><td>${quantityText(row.quantity)}</td><td>${escapeHtml(orderDatesText(row))}</td><td>${escapeHtml(formatDateTime(row.returnDate))}</td><td>${escapeHtml(row.returnPerson)}</td><td>${escapeHtml(row.reason)}</td><td>${escapeHtml(row.explanation || "-")}</td></tr>`).join("");
    win.document.write(`<!doctype html><meta charset="utf-8"><title>FONET Order İade Raporu</title><style>body{font:12px Arial;color:#111;padding:24px}h1{font-size:22px}h2{font-size:16px;margin-top:22px}.cards{display:flex;flex-wrap:wrap;gap:12px;margin:14px 0}.card{border:1px solid #bbb;padding:10px;min-width:150px}table{border-collapse:collapse;width:100%;margin:8px 0 18px}th,td{border:1px solid #bbb;padding:6px;text-align:left;vertical-align:top}th{background:#eee}</style><h1>FONET Order İade Raporu</h1><p>${escapeHtml(state.startInput)} – ${escapeHtml(state.endInput)}</p><div class="cards"><div class="card">İade kaydı<br><b>${summary.lines}</b></div><div class="card">Birleşik satır<br><b>${summary.displayLines}</b></div><div class="card">Toplam miktar<br><b>${quantityText(summary.quantity)}</b></div><div class="card">Hasta<br><b>${summary.patientCount}</b></div><div class="card">En çok iade edilen<br><b>${escapeHtml(summary.byDrug[0]?.name || "-")}</b></div><div class="card">En çok iade yapan personel<br><b>${escapeHtml(summary.byPerson[0]?.name || "-")}</b></div></div><h2>Order saatine göre iade analizi</h2><table><thead><tr><th>Order saati</th><th>İade kaydı</th><th>İade miktarı</th><th>Hasta</th></tr></thead><tbody>${hourRows}</tbody></table><h2>İade yapan personele göre</h2><table><thead><tr><th>Personel</th><th>İade kaydı</th><th>İade miktarı</th><th>Hasta</th></tr></thead><tbody>${personRows}</tbody></table><h2>Hasta bazlı iade ayrıntıları</h2><table><thead><tr><th>Hasta</th><th>Oda</th><th>İlaç</th><th>Toplam miktar</th><th>Order tarihleri</th><th>İade tarihi</th><th>İade personeli</th><th>Neden</th><th>Açıklama</th></tr></thead><tbody>${detailRowsHtml}</tbody></table>`);
    win.document.close();
    setTimeout(() => win.print(), 250);
  }

  function metricCard(label, value, detail = "") {
    return `<div style="padding:11px 13px;border:1px solid #bfdbfe;border-radius:10px;background:#eff6ff;min-width:150px;flex:1;"><div style="font-size:11px;color:#475569;font-weight:700;">${escapeHtml(label)}</div><div style="font-size:22px;font-weight:900;color:#0f172a;">${escapeHtml(value)}</div><div style="font-size:10px;color:#64748b;">${escapeHtml(detail)}</div></div>`;
  }

  function barRows(items, label) {
    const maximum = Math.max(1, ...items.map((item) => item.quantity || item.lines));
    return items.length ? items.map((item, index) => `<div style="display:grid;grid-template-columns:28px minmax(180px,1fr) 2fr 95px;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid #e2e8f0;"><b>${index + 1}</b><span title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span><div style="height:10px;background:#e2e8f0;border-radius:999px;overflow:hidden;"><div style="height:100%;width:${Math.max(2, Math.round(((item.quantity || item.lines) / maximum) * 100))}%;background:#2563eb;"></div></div><b style="text-align:right;">${quantityText(item.quantity)} ${escapeHtml(label)}</b></div>`).join("") : `<div style="padding:18px;color:#64748b;">Kayıt yok.</div>`;
  }

  function personBarRows(items) {
    const maximum = Math.max(1, ...items.map((item) => item.lines));
    return items.length ? items.map((item, index) => `<button type="button" class="foir-person-link" data-person-index="${index}" title="Bu personelin hangi hastadan ne iade ettiğini göster" style="display:grid;grid-template-columns:28px minmax(180px,1fr) 2fr 125px;gap:8px;align-items:center;width:100%;padding:6px 0;border:0!important;border-bottom:1px solid #e2e8f0!important;border-radius:0!important;background:#fff;text-align:left;"><b>${index + 1}</b><span style="color:#0f766e;text-decoration:underline;font-weight:800;" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span><span style="height:10px;background:#e2e8f0;border-radius:999px;overflow:hidden;"><span style="display:block;height:100%;width:${Math.max(2, Math.round((item.lines / maximum) * 100))}%;background:#0f766e;"></span></span><b style="text-align:right;">${item.lines} kayıt · ${quantityText(item.quantity)}</b></button>`).join("") : `<div style="padding:18px;color:#64748b;">Kayıt yok.</div>`;
  }

  function orderPersonBarRows(items) {
    const maximum = Math.max(1, ...items.map((item) => item.rate));
    return items.length ? `<div style="display:grid;grid-template-columns:28px minmax(170px,1fr) 90px 90px 90px 1.2fr;gap:7px;padding:6px 2px;background:#f1f5f9;font-size:10px;font-weight:900;"><span>#</span><span>Order eden doktor</span><span>Order ilaç</span><span>İade ilaç</span><span>İade oranı</span><span>Dağılım</span></div>${items.map((item, index) => `<button type="button" class="foir-order-person-link" data-order-person-index="${index}" title="Kaç ilaç order ettiğini ve kaçının iade edildiğini göster" style="display:grid;grid-template-columns:28px minmax(170px,1fr) 90px 90px 90px 1.2fr;gap:7px;align-items:center;width:100%;padding:7px 2px;border:0!important;border-bottom:1px solid #e2e8f0!important;border-radius:0!important;background:#fff;text-align:left;"><b>${index + 1}</b><span style="color:#7c3aed;text-decoration:underline;font-weight:800;">${escapeHtml(item.name)}</span><b>${item.orders}</b><b>${item.returnedMedicines}</b><b>%${quantityText(item.rate)}</b><span style="height:10px;background:#e2e8f0;border-radius:999px;overflow:hidden;"><span style="display:block;height:100%;width:${Math.max(2, Math.round((item.rate / maximum) * 100))}%;background:#7c3aed;"></span></span></button>`).join("")}` : `<div style="padding:18px;color:#64748b;">Order kaydı yok.</div>`;
  }

  function drugBarRows(items) {
    const maximum = Math.max(1, ...items.map((item) => item.quantity || item.lines));
    return items.length ? `<div style="display:grid;grid-template-columns:28px minmax(180px,1fr) 85px 75px 1.4fr 90px;gap:8px;padding:6px 2px;background:#f1f5f9;font-size:10px;font-weight:900;"><span>#</span><span>İlaç</span><span>İade kaydı</span><span>Hasta</span><span>Dağılım</span><span style="text-align:right;">Miktar</span></div>${items.map((item, index) => `<button type="button" class="foir-drug-link" data-drug-index="${index}" title="Hangi hastalardan kaç adet iade edildiğini göster" style="display:grid;grid-template-columns:28px minmax(180px,1fr) 85px 75px 1.4fr 90px;gap:8px;align-items:center;width:100%;padding:7px 2px;border:0!important;border-bottom:1px solid #e2e8f0!important;border-radius:0!important;background:#fff;text-align:left;"><b>${index + 1}</b><span style="color:#1d4ed8;text-decoration:underline;font-weight:800;">${escapeHtml(item.name)}</span><b>${item.lines}</b><b>${item.patients}</b><span style="height:10px;background:#e2e8f0;border-radius:999px;overflow:hidden;"><span style="display:block;height:100%;width:${Math.max(2, Math.round(((item.quantity || item.lines) / maximum) * 100))}%;background:#2563eb;"></span></span><b style="text-align:right;">${quantityText(item.quantity)}</b></button>`).join("")}` : `<div style="padding:18px;color:#64748b;">Kayıt yok.</div>`;
  }

  function drugDetailHtml(rows, drugName) {
    if (!drugName) return "";
    const matches = rows.filter((row) => norm(row.drugName) === norm(drugName));
    const patientItems = [...groupRows(matches, (row) => row.patientKey)].map(([, items]) => {
      const first = items[0];
      return {
        patientName: first.patientName,
        room: first.room,
        records: items.reduce((sum, item) => sum + (item.recordCount || 1), 0),
        quantity: items.reduce((sum, item) => sum + item.quantity, 0),
        orderDates: [...new Set(items.flatMap((item) => (item.orderDates?.length ? item.orderDates : [item.orderDate]).filter(Boolean)).map(formatDateTime))],
        returnDates: [...new Set(items.map((item) => formatDateTime(item.returnDate)))],
        people: [...new Set(items.flatMap((item) => item.returnPersons?.length ? item.returnPersons : [item.returnPerson]).map(clean).filter(Boolean))]
      };
    }).sort((a, b) => b.quantity - a.quantity || b.records - a.records || a.patientName.localeCompare(b.patientName, "tr"));
    const totalRecords = patientItems.reduce((sum, item) => sum + item.records, 0);
    const totalQuantity = patientItems.reduce((sum, item) => sum + item.quantity, 0);
    return `<div id="foir-drug-dialog" style="position:absolute;inset:54px 24px 24px;z-index:5;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.55);"><section style="width:min(1050px,96%);max-height:78vh;overflow:auto;background:#fff;border:2px solid #2563eb;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.4);"><header style="position:sticky;top:0;z-index:1;display:flex;justify-content:space-between;gap:15px;align-items:center;padding:12px 14px;background:#dbeafe;border-bottom:1px solid #93c5fd;"><div><b style="font-size:16px;">${escapeHtml(drugName)}</b><div style="font-size:11px;color:#475569;">${patientItems.length} hasta · ${totalRecords} iade kaydı · ${quantityText(totalQuantity)} toplam miktar</div></div><button id="foir-drug-close" type="button">Kapat</button></header><table style="border-collapse:collapse;width:100%;min-width:900px;"><thead><tr><th>Hasta</th><th>Oda/Yatak</th><th>İade kaydı</th><th>Toplam miktar</th><th>Order/Uygulama zamanları</th><th>İade zamanları</th><th>İade personeli</th></tr></thead><tbody>${patientItems.map((item) => `<tr><td><b>${escapeHtml(item.patientName)}</b></td><td>${escapeHtml(item.room)}</td><td>${item.records} iade kaydı</td><td><b>${quantityText(item.quantity)}</b></td><td>${escapeHtml(item.orderDates.join(" | ") || "-")}</td><td>${escapeHtml(item.returnDates.join(" | ") || "-")}</td><td>${escapeHtml(item.people.join(", ") || "Belirtilmemiş")}</td></tr>`).join("")}</tbody></table></section></div>`;
  }

  function personDetailHtml(rows, personName) {
    if (!personName) return "";
    const matches = detailRows(rows).filter((row) => norm(row.returnPerson || "Belirtilmemiş") === norm(personName));
    const items = [...groupRows(matches, (row) => [row.patientKey, norm(row.stockCode || row.drugName)].join("|"))].map(([, group]) => {
      const first = group[0];
      return {
        patientName: first.patientName,
        room: first.room,
        drugName: first.drugName,
        stockCode: first.stockCode,
        records: group.length,
        quantity: group.reduce((sum, row) => sum + row.quantity, 0),
        returnDates: [...new Set(group.map((row) => formatDateTime(row.returnDate)))],
        reasons: [...new Set(group.map((row) => clean(row.reason)).filter(Boolean))],
        explanations: [...new Set(group.map((row) => clean(row.explanation)).filter(Boolean))]
      };
    }).sort((a, b) => a.patientName.localeCompare(b.patientName, "tr") || b.quantity - a.quantity || a.drugName.localeCompare(b.drugName, "tr"));
    const totalRecords = items.reduce((sum, item) => sum + item.records, 0);
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const patientCount = new Set(matches.map((row) => row.patientKey)).size;
    return `<div id="foir-person-dialog" style="position:absolute;inset:54px 24px 24px;z-index:6;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.55);"><section style="width:min(1180px,97%);max-height:80vh;overflow:auto;background:#fff;border:2px solid #0f766e;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.4);"><header style="position:sticky;top:0;z-index:1;display:flex;justify-content:space-between;gap:15px;align-items:center;padding:12px 14px;background:#ccfbf1;border-bottom:1px solid #5eead4;"><div><b style="font-size:16px;">${escapeHtml(personName)}</b><div style="font-size:11px;color:#475569;">${patientCount} hasta · ${totalRecords} iade kaydı · ${quantityText(totalQuantity)} toplam miktar</div></div><button id="foir-person-close" type="button">Kapat</button></header><table style="border-collapse:collapse;width:100%;min-width:1050px;"><thead><tr><th>Hasta</th><th>Oda/Yatak</th><th>İade edilen ilaç</th><th>İade kaydı</th><th>Toplam miktar</th><th>İade zamanı</th><th>İade nedeni</th><th>Açıklama</th></tr></thead><tbody>${items.map((item) => `<tr><td><b>${escapeHtml(item.patientName)}</b></td><td>${escapeHtml(item.room)}</td><td><b>${escapeHtml(item.drugName)}</b><br><small>${escapeHtml(item.stockCode || "-")}</small></td><td>${item.records}</td><td><b>${quantityText(item.quantity)}</b></td><td>${escapeHtml(item.returnDates.join(" | ") || "-")}</td><td>${escapeHtml(item.reasons.join(", ") || "-")}</td><td>${escapeHtml(item.explanations.join(" | ") || "-")}</td></tr>`).join("")}</tbody></table></section></div>`;
  }

  function orderPersonDetailHtml(rows, orders, personName) {
    if (!personName) return "";
    const personOrders = orders.filter((order) => norm(order.orderingPerson || "Belirtilmemiş") === norm(personName));
    const returns = detailRows(rows);
    const returnsByOrder = new Map();
    returns.forEach((row) => {
      const key = clean(row.matchedOrderKey || row.orderId || row.orderNo);
      if (!key) return;
      if (!returnsByOrder.has(key)) returnsByOrder.set(key, []);
      returnsByOrder.get(key).push(row);
    });
    const items = personOrders.map((order) => {
      const key = clean(order.id || order.orderNo);
      const matched = key ? (returnsByOrder.get(key) || []) : [];
      return {
        ...order,
        returned: matched.length > 0,
        returnRecords: matched.length,
        returnQuantity: matched.reduce((sum, row) => sum + row.quantity, 0),
        returnDates: [...new Set(matched.map((row) => formatDateTime(row.returnDate)))],
        returnPeople: [...new Set(matched.map((row) => clean(row.returnPerson)).filter(Boolean))]
      };
    }).filter((item) => item.returned).sort((a, b) => a.patientName.localeCompare(b.patientName, "tr") || (b.orderDate || 0) - (a.orderDate || 0));
    const returnedMedicineCount = items.reduce((sum, item) => sum + item.returnRecords, 0);
    const returnedOrderCount = items.length;
    const rate = personOrders.length ? (returnedMedicineCount / personOrders.length) * 100 : 0;
    return `<div id="foir-order-person-dialog" style="position:absolute;inset:54px 24px 24px;z-index:7;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.55);"><section style="width:min(1250px,98%);max-height:82vh;overflow:auto;background:#fff;border:2px solid #7c3aed;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.4);"><header style="position:sticky;top:0;z-index:1;display:flex;justify-content:space-between;gap:15px;align-items:center;padding:12px 14px;background:#ede9fe;border-bottom:1px solid #c4b5fd;"><div><b style="font-size:16px;">${escapeHtml(personName)}</b><div style="font-size:11px;color:#475569;">${personOrders.length} order edilen ilaç · ${returnedMedicineCount} iade edilen ilaç · İade/Order oranı %${quantityText(rate)} · ${returnedOrderCount} farklı orderda iade · Yalnızca iadeler gösteriliyor</div></div><button id="foir-order-person-close" type="button">Kapat</button></header><table style="border-collapse:collapse;width:100%;min-width:1100px;"><thead><tr><th>Hasta</th><th>Oda/Yatak</th><th>İade edilen ilaç</th><th>Order zamanı</th><th>İade edilen kayıt / miktar</th><th>İade zamanı</th><th>İade eden</th></tr></thead><tbody>${items.map((item) => `<tr><td><b>${escapeHtml(item.patientName)}</b></td><td>${escapeHtml(item.room)}</td><td><b>${escapeHtml(item.drugName)}</b><br><small>${escapeHtml(item.stockCode || "-")}</small></td><td>${escapeHtml(formatDateTime(item.orderDate))}</td><td>${item.returnRecords} ilaç · <b>${quantityText(item.returnQuantity)}</b></td><td>${escapeHtml(item.returnDates.join(" | ") || "-")}</td><td>${escapeHtml(item.returnPeople.join(", ") || "-")}</td></tr>`).join("")}</tbody></table></section></div>`;
  }

  function patientReportHtml(rows) {
    const groups = groupRows(rows, (row) => row.patientKey);
    return [...groups.values()].map((items) => {
      const first = items[0];
      const total = items.reduce((sum, item) => sum + item.quantity, 0);
      const records = items.reduce((sum, item) => sum + (item.recordCount || 1), 0);
      return `<section style="margin-bottom:12px;border:1px solid #cbd5e1;border-radius:10px;overflow:hidden;"><div style="display:flex;justify-content:space-between;gap:12px;padding:9px 12px;background:#f1f5f9;"><b>${escapeHtml(first.room)} · ${escapeHtml(first.patientName)}</b><span>${records} iade kaydı · ${items.length} birleşik satır · ${quantityText(total)} miktar</span></div><div style="overflow:auto;"><table style="border-collapse:collapse;width:100%;min-width:1150px;"><thead><tr><th>İlaç</th><th>İade kaydı / miktar</th><th>Order/Uygulama tarihleri</th><th>İade tarihi</th><th>İade personeli</th><th>İade nedeni</th><th>Durum</th><th>Açıklama</th></tr></thead><tbody>${items.map((row) => `<tr><td><b>${row.recordCount > 1 ? `<span style="color:#dc2626;">${row.recordCount} iade · </span>` : ""}${escapeHtml(row.drugName)}</b><br><small>${escapeHtml(row.stockCode)}</small></td><td>${row.recordCount || 1} kayıt<br><b>${quantityText(row.quantity)} miktar</b></td><td>${escapeHtml(orderDatesText(row))}</td><td>${escapeHtml(formatDateTime(row.returnDate))}</td><td>${escapeHtml(row.returnPerson || "Belirtilmemiş")}</td><td>${escapeHtml(row.reason)}</td><td>${escapeHtml(row.status)}</td><td>${escapeHtml(row.explanation || "-")}</td></tr>`).join("")}</tbody></table></div></section>`;
    }).join("") || `<div style="padding:30px;text-align:center;color:#64748b;">Seçilen tarih aralığında iade kaydı bulunmadı.</div>`;
  }

  function analysisHtml(summary) {
    const hourStatements = hourNarrative(summary.byOrderHour).map((text) => `<li style="padding:4px 0;">${escapeHtml(text)}</li>`).join("");
    return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(390px,1fr));gap:14px;"><section style="grid-column:1/-1;border:2px solid #93c5fd;border-radius:10px;padding:12px;"><h3 style="margin:0 0 3px;">FONET listesindeki tüm iade edilen ilaçlar</h3><p style="margin:0 0 7px;color:#2563eb;font-size:11px;font-weight:700;">Liste kısıtlanmaz. Hangi hastalardan kaç adet iade edildiğini görmek için ilaç adına tıklayın.</p>${drugBarRows(summary.byDrug)}</section><section style="grid-column:1/-1;border:2px solid #c4b5fd;border-radius:10px;padding:12px;"><h3 style="margin:0 0 3px;">Order eden personele göre iade oranı</h3><p style="margin:0 0 7px;color:#7c3aed;font-size:11px;font-weight:700;">Personelin kaç order girdiğini ve kaçının iade edildiğini görmek için adına tıklayın.</p>${orderPersonBarRows(summary.byOrderingPerson)}</section><section style="border:1px solid #cbd5e1;border-radius:10px;padding:12px;"><h3 style="margin:0 0 3px;">En çok iade yapan personel</h3><p style="margin:0 0 7px;color:#0f766e;font-size:11px;font-weight:700;">Hangi hastadan ne iade edildiğini görmek için personel adına tıklayın.</p>${personBarRows(summary.byPerson)}</section><section style="border:1px solid #cbd5e1;border-radius:10px;padding:12px;"><h3 style="margin:0 0 8px;">Order saatine göre iade</h3><ul style="margin:0;padding-left:19px;">${hourStatements || "<li>Kayıt yok.</li>"}</ul></section><section style="border:1px solid #cbd5e1;border-radius:10px;padding:12px;"><h3 style="margin:0 0 8px;">İade nedenleri</h3>${barRows(summary.byReason, "")}</section><section style="border:1px solid #cbd5e1;border-radius:10px;padding:12px;"><h3 style="margin:0 0 8px;">İade tarihine göre</h3>${barRows(summary.byReturnDate, "")}</section><section style="border:1px solid #cbd5e1;border-radius:10px;padding:12px;"><h3 style="margin:0 0 8px;">Order/Uygulama giriş tarihine göre</h3><p style="margin:0 0 7px;color:#64748b;font-size:11px;">Hangi tarihteki order kayıtlarının seçilen dönemde iade edildiğini gösterir.</p>${barRows(summary.byOrderDate, "")}</section></div>`;
  }

  function render() {
    const panel = uiDocument()?.getElementById(PANEL_ID);
    if (!panel) return;
    const oldScroller = panel.querySelector("#foir-scroll");
    const scrollTop = Number(oldScroller?.scrollTop) || 0;
    const rows = filteredRows();
    const summary = summarize(rows);
    const errorHtml = state.errors.length ? `<details style="margin-top:8px;color:#991b1b;"><summary>${state.errors.length} hasta iade sorgusu yapılamadı</summary>${state.errors.map((item) => `<div>${escapeHtml(item.patient)}: ${escapeHtml(item.message)}</div>`).join("")}</details>` : "";
    const orderErrorHtml = state.orderErrors.length ? `<details style="margin-top:8px;color:#92400e;"><summary>${state.orderErrors.length} hasta order sorgusu yapılamadı</summary>${state.orderErrors.map((item) => `<div>${escapeHtml(item.patient)}: ${escapeHtml(item.message)}</div>`).join("")}</details>` : "";
    panel.innerHTML = `<header style="display:flex;justify-content:space-between;gap:12px;padding:12px 14px;background:#0f172a;color:#fff;"><div><b>FONET Order İade Analiz Raporu v${VERSION}</b><div style="font-size:11px;color:#cbd5e1;margin-top:3px;">Ayrı pencere · Salt okunur · Veriler yalnızca bu tarayıcıda işlenir</div></div><button id="foir-close" class="foir-danger">Pencereyi Kapat</button></header><div style="padding:10px 12px;background:#f8fafc;border-bottom:1px solid #cbd5e1;"><div style="display:flex;gap:7px;align-items:end;flex-wrap:wrap;"><label>Başlangıç<br><input id="foir-start" type="date" value="${escapeHtml(state.startInput)}"></label><label>Bitiş<br><input id="foir-end" type="date" value="${escapeHtml(state.endInput)}"></label><button id="foir-yesterday">Dün</button><button id="foir-seven">Son 7 Gün</button><button id="foir-run" class="foir-primary">İadeleri Getir ve Analiz Et</button><button id="foir-stop" class="foir-danger">Durdur</button><button id="foir-csv">CSV İndir</button><button id="foir-copy">Özeti Kopyala</button><button id="foir-print">Yazdır</button></div><div style="display:flex;gap:7px;align-items:center;margin-top:8px;flex-wrap:wrap;"><input id="foir-search" placeholder="Hasta, oda, ilaç, iade nedeni veya personel ara" value="${escapeHtml(state.search)}" style="min-width:320px;flex:1;"><button id="foir-patient-view" class="${state.view === "patient" ? "foir-active" : ""}">Hasta Bazlı</button><button id="foir-analysis-view" class="${state.view === "analysis" ? "foir-active" : ""}">Analiz</button></div><div id="foir-status" style="margin-top:7px;font-size:12px;color:#334155;">${escapeHtml(state.message)}</div>${errorHtml}${orderErrorHtml}</div><div id="foir-scroll" style="height:calc(100vh - 218px);overflow:auto;padding:12px;background:#fff;"><div style="display:flex;gap:9px;flex-wrap:wrap;margin-bottom:12px;">${metricCard("Toplam order edilen ilaç", String(summary.totalOrders))}${metricCard("Toplam iade edilen ilaç", String(summary.returnedMedicines), `${summary.displayLines} birleşik satır`)}${metricCard("İade edilen / Order edilen", `%${quantityText(summary.returnRate)}`, "ilaç sayısı oranı")}${metricCard("Toplam iade miktarı", quantityText(summary.quantity))}${metricCard("İadesi olan hasta", String(summary.patientCount))}${metricCard("Farklı ilaç", String(summary.drugCount))}${metricCard("En çok iade yapan", summary.byPerson[0]?.name || "-", summary.byPerson[0] ? `${summary.byPerson[0].lines} kayıt · ${quantityText(summary.byPerson[0].quantity)} miktar` : "")}</div>${state.view === "analysis" ? analysisHtml(summary) : patientReportHtml(rows)}</div>${drugDetailHtml(rows, state.selectedDrug)}${personDetailHtml(rows, state.selectedPerson)}${orderPersonDetailHtml(rows, state.orders, state.selectedOrderPerson)}`;
    panel.querySelectorAll("button,input").forEach((element) => Object.assign(element.style, { border: "1px solid #94a3b8", borderRadius: "7px", padding: "7px 9px", fontWeight: element.tagName === "BUTTON" ? "800" : "500" }));
    panel.querySelectorAll("button").forEach((button) => { button.style.cursor = "pointer"; });
    panel.querySelectorAll("th,td").forEach((cell) => Object.assign(cell.style, { borderBottom: "1px solid #e2e8f0", padding: "7px", textAlign: "left", verticalAlign: "top" }));
    panel.querySelectorAll("th").forEach((cell) => { cell.style.background = "#f8fafc"; cell.style.position = "sticky"; cell.style.top = "0"; });
    panel.querySelector("#foir-run").style.background = "#2563eb"; panel.querySelector("#foir-run").style.color = "#fff";
    panel.querySelectorAll(".foir-danger").forEach((button) => { button.style.background = "#dc2626"; button.style.color = "#fff"; });
    panel.querySelectorAll(".foir-active").forEach((button) => { button.style.background = "#0f766e"; button.style.color = "#fff"; });
    const scroller = panel.querySelector("#foir-scroll");
    if (scroller) scroller.scrollTop = scrollTop;
    panel.querySelector("#foir-close").onclick = () => { if (!state.running) state.uiWindow?.close(); };
    panel.querySelector("#foir-run").onclick = runReport;
    panel.querySelector("#foir-stop").onclick = () => { state.cancelRequested = true; state.controller?.abort(); state.message = "Durdurma istendi; tamamlanan sonuçlar korunacak."; updateStatus(); };
    panel.querySelector("#foir-yesterday").onclick = () => { state.startInput = yesterdayInput(); state.endInput = state.startInput; render(); };
    panel.querySelector("#foir-seven").onclick = () => { const end = new Date(); end.setDate(end.getDate() - 1); const start = new Date(end); start.setDate(start.getDate() - 6); state.startInput = localInputDate(start); state.endInput = localInputDate(end); render(); };
    panel.querySelector("#foir-csv").onclick = exportCsv;
    panel.querySelector("#foir-copy").onclick = copySummary;
    panel.querySelector("#foir-print").onclick = printReport;
    panel.querySelector("#foir-patient-view").onclick = () => { state.view = "patient"; render(); };
    panel.querySelector("#foir-analysis-view").onclick = () => { state.view = "analysis"; render(); };
    panel.querySelector("#foir-search").onchange = (event) => { state.search = clean(event.target.value); render(); };
    panel.querySelectorAll(".foir-drug-link").forEach((button) => { button.onclick = () => { state.selectedDrug = summary.byDrug[Number(button.dataset.drugIndex)]?.name || ""; render(); }; });
    const drugClose = panel.querySelector("#foir-drug-close");
    if (drugClose) drugClose.onclick = () => { state.selectedDrug = ""; render(); };
    panel.querySelectorAll(".foir-person-link").forEach((button) => { button.onclick = () => { state.selectedPerson = summary.byPerson[Number(button.dataset.personIndex)]?.name || ""; render(); }; });
    const personClose = panel.querySelector("#foir-person-close");
    if (personClose) personClose.onclick = () => { state.selectedPerson = ""; render(); };
    panel.querySelectorAll(".foir-order-person-link").forEach((button) => { button.onclick = () => { state.selectedOrderPerson = summary.byOrderingPerson[Number(button.dataset.orderPersonIndex)]?.name || ""; render(); }; });
    const orderPersonClose = panel.querySelector("#foir-order-person-close");
    if (orderPersonClose) orderPersonClose.onclick = () => { state.selectedOrderPerson = ""; render(); };
    panel.querySelector("#foir-run").disabled = state.running;
    panel.querySelector("#foir-stop").disabled = !state.running;
  }

  function uiDocument() {
    try { return state?.uiWindow && !state.uiWindow.closed ? state.uiWindow.document : null; } catch (_) { return null; }
  }

  function makePanel() {
    let reportWindow = null;
    try { reportWindow = window.open("", "fonetOrderIadeAnalizRaporu", "popup=yes,width=1500,height=920,resizable=yes,scrollbars=yes"); } catch (_) {}
    if (!reportWindow) {
      alert("Rapor penceresi açılamadı. Bu site için açılır pencerelere izin verip bookmark'ı yeniden çalıştırın.");
      return;
    }
    state.uiWindow = reportWindow;
    const doc = reportWindow.document;
    doc.open();
    doc.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>FONET Order İade Analiz Raporu</title></head><body style="margin:0;overflow:hidden;background:#fff;"></body></html>`);
    doc.close();
    doc.getElementById(PANEL_ID)?.remove();
    const panel = doc.createElement("section");
    panel.id = PANEL_ID;
    Object.assign(panel.style, { position: "fixed", inset: "0", width: "100vw", height: "100vh", background: "#fff", color: "#0f172a", overflow: "hidden", fontFamily: "Arial,sans-serif" });
    doc.body.appendChild(panel);
    reportWindow.focus();
    render();
  }

  const existing = window[APP_KEY];
  if (existing) {
    if (existing.version === VERSION) { existing.show(); existing.collectPatients(); return; }
    if (existing.state?.running) { alert("Eski sürümde sorgu devam ediyor. Önce durdurun."); return; }
    try { existing.destroy(); } catch (_) {}
  }

  const state = {
    sourceContext: null,
    sourceStore: null,
    sourceGrid: null,
    sourceTotalCount: 0,
    sourceLoadedCount: 0,
    sourcePageSize: 0,
    sourceCurrentPage: 1,
    sourceGridVisible: false,
    uiWindow: null,
    sourceRowCount: 0,
    unreadablePatients: [],
    duplicatePatientRows: 0,
    patients: [],
    rows: [],
    orders: [],
    errors: [],
    orderErrors: [],
    startInput: yesterdayInput(),
    endInput: yesterdayInput(),
    search: "",
    selectedDrug: "",
    selectedPerson: "",
    selectedOrderPerson: "",
    view: "analysis",
    running: false,
    cancelRequested: false,
    controller: null,
    fallbackCount: 0,
    message: "Hazır. Varsayılan tarih dündür; İadeleri Getir ve Analiz Et düğmesine basın."
  };

  window[APP_KEY] = {
    version: VERSION,
    state,
    show() { if (!state.uiWindow || state.uiWindow.closed) makePanel(); else state.uiWindow.focus(); },
    destroy() { state.controller?.abort(); try { state.uiWindow?.close(); } catch (_) {} delete window[APP_KEY]; },
    collectPatients,
    collectAllListedPatients,
    run: runReport,
    _test: { parseDate, normalizeReturn, aggregateReturns, summarize, serviceDate, responseRows, orderHourKey, hourNarrative, analysisHtml, drugDetailHtml }
  };

  makePanel();
  try {
    collectPatients();
    state.message = `FONET listesinde ${state.sourceRowCount || state.sourceTotalCount || state.patients.length} satır bulundu · ${state.patients.length} hasta/sevk kimliği okundu${state.unreadablePatients.length ? ` · ${state.unreadablePatients.length} satır doğrulanamadı` : ""}${state.sourceTotalCount > state.sourceLoadedCount ? `; ${state.sourceLoadedCount} kayıt şu an yüklü, çalıştırınca tüm sayfalar okunacak` : ""}. Varsayılan olarak dünkü iadeler sorgulanacak.`;
    render();
  } catch (error) {
    state.message = clean(error.message);
    render();
  }
})();
