(() => {
  const VERSION = "v19-temiz-optimize";
  const RUN_ID = `foy-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const PANEL_ID = `fonet-order-kopyala-${RUN_ID}`;
  const UI_SUFFIX = `-${RUN_ID}`;
  const API_BASE = `${location.origin}/hbys-rs/hbys`;
  const DEFAULT_DEPO_ID = 60000022000;
  const ACT_DIRECTIVE_ID = 60000000103;

  const state = {
    birimSevkId: "",
    rows: [],
    source: "",
    captured: null,
    expectedCount: 0,
    selectedKeys: new Set(),
    selectionSignature: ""
  };

  function clean(v) {
    return String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  }

  function norm(v) {
    return clean(v).toLocaleLowerCase("tr-TR")
      .replace(/ı/g, "i").replace(/İ/g, "i")
      .replace(/ğ/g, "g").replace(/ü/g, "u")
      .replace(/ş/g, "s").replace(/ö/g, "o")
      .replace(/ç/g, "c");
  }

  function idValue(v) {
    if (v == null || v === "") return "";
    if (typeof v === "object") return v.id ?? v.ID ?? v.value ?? "";
    return v;
  }

  function refObject(v) {
    const id = idValue(v);
    if (id == null || id === "") return null;
    const text = String(id).trim();
    return /^\d+$/.test(text) ? { id: Number(text) } : null;
  }

  function readPath(obj, path) {
    if (!obj || !path) return undefined;
    return String(path).split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
  }

  function firstValue(obj, paths) {
    for (const path of paths) {
      const v = readPath(obj, path);
      if (v != null && v !== "") return v;
    }
    return "";
  }

  function inferBirimSevkFromRows(rows = []) {
    const directPaths = [
      "birimSevk.id", "hastaBirimSevk.id", "klinik.birimSevk.id",
      "eorder.birimSevk.id", "order.birimSevk.id", "birimSevkId",
      "hastaBirimSevkId", "BIRIM_SEVK_ID", "HASTA_BIRIM_SEVK_ID"
    ];
    for (const row of (Array.isArray(rows) ? rows : [])) {
      const direct = clean(firstValue(row || {}, directPaths));
      if (/^\d{4,}$/.test(direct)) return direct;
      const seen = new Set();
      const walk = (obj, depth = 0) => {
        if (!obj || typeof obj !== "object" || depth > 6 || seen.has(obj)) return "";
        seen.add(obj);
        for (const [key, value] of Object.entries(obj)) {
          const k = norm(key).replace(/[^a-z0-9]/g, "");
          if (/birimsevk|hastabirimsevk/.test(k)) {
            const candidate = clean(idValue(value));
            if (/^\d{4,}$/.test(candidate)) return candidate;
          }
        }
        for (const value of Object.values(obj)) {
          const got = walk(value, depth + 1);
          if (got) return got;
        }
        return "";
      };
      const deep = walk(row);
      if (deep) return deep;
    }
    return "";
  }

  function todayText() {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
  }

  function addOneDay(dateText) {
    const m = clean(dateText).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!m) return dateText;
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    d.setDate(d.getDate() + 1);
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
  }

  function addDays(dateText, amount) {
    const m = clean(dateText).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!m) return dateText;
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    d.setDate(d.getDate() + Number(amount || 0));
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
  }

  function toInputDate(dateText) {
    const m = clean(dateText).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
  }

  function fromInputDate(value) {
    const m = clean(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
  }

  function selectedDates() {
    return {
      sourceDate: fromInputDate(ui("foy-source-date")?.value) || todayText(),
      targetDate: fromInputDate(ui("foy-target-date")?.value) || addOneDay(todayText())
    };
  }

  function allContexts() {
    const out = [];
    const seen = new Set();
    function walk(win) {
      if (!win || seen.has(win)) return;
      seen.add(win);
      try {
        if (win.document) out.push(win);
        for (let i = 0; i < win.frames.length; i += 1) walk(win.frames[i]);
      } catch (e) {}
    }
    walk(window.top || window);
    walk(window);
    return out;
  }

  function apiRequest(path, method = "GET", data = null) {
    const url = `${API_BASE}${path}`;
    if (window.Ext?.Ajax?.request) {
      return new Promise((resolve, reject) => {
        Ext.Ajax.request({
          url,
          method,
          params: method === "GET" ? data : undefined,
          jsonData: method !== "GET" && data ? JSON.stringify(data) : undefined,
          success: (resp) => {
            const text = resp?.responseText || "";
            try { resolve(text ? JSON.parse(text) : {}); } catch (e) { resolve({ text }); }
          },
          failure: (resp) => reject(new Error(`${resp?.status || "ERR"} ${String(resp?.responseText || resp?.statusText || "").slice(0, 700)}`))
        });
      });
    }
    const qs = method === "GET" && data ? `?${new URLSearchParams(data)}` : "";
    return fetch(`${url}${qs}`, {
      method,
      headers: method === "GET" ? undefined : { "Content-Type": "application/json" },
      body: method === "GET" || !data ? undefined : JSON.stringify(data)
    }).then(async (r) => {
      const text = await r.text();
      if (!r.ok) throw new Error(`${r.status} ${text.slice(0, 700)}`);
      try { return text ? JSON.parse(text) : {}; } catch (e) { return { text }; }
    });
  }

  function pageWorldScan() {
    const results = [];
    for (const ctx of allContexts()) {
      try {
        const doc = ctx.document;
        const marker = `foy_${Date.now()}_${Math.random()}`.replace(/\W/g, "");
        const script = doc.createElement("script");
        script.textContent = `
          (() => {
            const clean = (v) => String(v == null ? "" : v).replace(/\\s+/g, " ").trim();
            const lower = (v) => clean(v).toLocaleLowerCase("tr-TR");
            const readPath = (obj, path) => String(path).split(".").reduce((a, k) => a == null ? undefined : a[k], obj);
            const firstValue = (obj, paths) => {
              for (const p of paths) {
                const v = readPath(obj, p);
                if (v != null && v !== "") return v;
              }
              return "";
            };
            const deepFindId = (obj, pred, depth = 0, seen = new Set()) => {
              if (!obj || typeof obj !== "object" || depth > 5 || seen.has(obj)) return "";
              seen.add(obj);
              try { if (pred(obj)) return obj.id || obj.ID || ""; } catch (e) {}
              for (const v of Object.values(obj)) {
                const got = deepFindId(v, pred, depth + 1, seen);
                if (got) return got;
              }
              return "";
            };
            const dataOf = (rec) => Object.assign({}, rec && rec.raw || {}, rec && rec.data || {});
            const recordsFromStore = (store) => {
              const out = [];
              try { store && store.each && store.each((r) => out.push(r)); } catch (e) {}
              try { if (!out.length && store && store.getRange) out.push(...store.getRange()); } catch (e) {}
              try { if (!out.length && store && store.data && store.data.items) out.push(...store.data.items); } catch (e) {}
              return out;
            };
            const inferSevk = (data) => clean(firstValue(data, [
              "birimSevk.id", "hastaBirimSevk.id", "klinik.birimSevk.id",
              "birimSevkId", "hastaBirimSevkId", "BIRIM_SEVK_ID", "BIRIMSEVKID",
              "HASTA_BIRIM_SEVK_ID", "HASTABIRIMSEVKID"
            ]) || deepFindId(data, (x) => x.birim && x.hastaGelis && x.id));
            const inferName = (data) => {
              const name = clean(firstValue(data, ["adSoyad", "adiSoyadi", "hastaAdiSoyadi", "ADSOYAD", "ADI_SOYADI", "HASTA_ADI_SOYADI"]));
              if (name) return name;
              return [clean(firstValue(data, ["hasta.adi", "adi", "ADI", "HASTA_ADI"])), clean(firstValue(data, ["hasta.soyadi", "soyadi", "SOYADI", "HASTA_SOYADI"]))].filter(Boolean).join(" ");
            };
            const rowKeys = (row) => Object.keys(row || {}).join("|").toLocaleLowerCase("tr-TR");
            const namedText = (v) => {
              if (v == null) return "";
              if (typeof v === "string" || typeof v === "number") return clean(v);
              if (typeof v !== "object") return "";
              return clean(v.adi || v.ad || v.name || v.text || v.label || v.aciklama || v.tanim || "");
            };
            const deepOrderName = (obj, depth = 0, seen = new Set()) => {
              if (!obj || typeof obj !== "object" || depth > 4 || seen.has(obj)) return "";
              seen.add(obj);
              const entries = Object.entries(obj);
              for (const [key, value] of entries) {
                const k = lower(key);
                if (!/stok|ilac|ilaç|tedavi|malzeme|hizmet|urun|ürün|preparat|jenerik/.test(k) || /birim|depo|kullanim|kullanım|tur|tür|id$/.test(k)) continue;
                const txt = namedText(value);
                if (txt && /[a-zA-ZÇĞİÖŞÜçğıöşü]/.test(txt)) return txt;
              }
              for (const [key, value] of entries) {
                const k = lower(key);
                if (!/stok|ilac|ilaç|tedavi|malzeme|hizmet|urun|ürün|preparat|jenerik/.test(k) || /birim|depo|kullanim|kullanım|tur|tür/.test(k)) continue;
                const got = deepOrderName(value, depth + 1, seen);
                if (got) return got;
              }
              return "";
            };
            const orderName = (x) => clean(
              x.__foyRenderedName ||
              namedText(x.stok) || x.stokAdi || x.stokAd || x.stokKartiAdi || namedText(x.stokKarti) ||
              namedText(x.hizmetMakro) || x.hizmetMakroAdi || x.hizmetAdi || namedText(x.hizmet) ||
              namedText(x.malzeme) || x.malzemeAdi || x.malzemeAd ||
              namedText(x.ilac) || x.ilacAdi || x.ilacAd || x.ilacTicariAdi || x.ticariAdi ||
              namedText(x.tedavi) || x.tedaviAdi || x.tedaviAd ||
              namedText(x.urun) || x.urunAdi || x.urunAd || x.preparatAdi || x.jenerikAdi ||
              x.adi || x.ad || x.name || deepOrderName(x) || x.aciklama || ""
            );
            const items = Object.values((window.Ext && Ext.ComponentManager && Ext.ComponentManager.all && Ext.ComponentManager.all.items) || {});
            const patients = [];
            const orderCandidates = [];
            const debug = [];
            items.forEach((cmp) => {
              try {
                const selected = (cmp.getSelectionModel && cmp.getSelectionModel().getSelection && cmp.getSelectionModel().getSelection()) || (cmp.getSelection && cmp.getSelection()) || [];
                selected.forEach((rec) => {
                  const data = dataOf(rec);
                  const id = inferSevk(data) || clean(data.id);
                  if (id) patients.push({ id, name: inferName(data), source: "secili" });
                });
              } catch (e) {}
              try {
                const rec = cmp.getRecord && cmp.getRecord();
                if (rec) {
                  const data = dataOf(rec);
                  const id = inferSevk(data);
                  if (id) patients.push({ id, name: inferName(data), source: "form" });
                }
              } catch (e) {}
              try {
                const cols = (cmp.columns || cmp.headerCt && cmp.headerCt.getGridColumns && cmp.headerCt.getGridColumns() || []);
                const colText = cols.map((c) => clean(c.text || c.header || c.dataIndex || c.name || "")).join("|");
                const store = cmp.store || (cmp.getStore && cmp.getStore());
                const records = recordsFromStore(store);
                if (!records.length) return;
                const tedaviColIndex = cols.findIndex((c) => {
                  const t = clean(c.text || c.header || c.dataIndex || c.name || "");
                  return /tedavi\s*adi|ila[cç]\s*adi|stok\s*adi|malzeme\s*adi/i.test(t) || (/tedavi|ila[cç]|stok|malzeme/i.test(t) && !/t[uü]r|birim|kullan/i.test(t));
                });
                const rows = records.map((rec, rowIndex) => {
                  const data = dataOf(rec);
                  data.__foySourceIndex = rowIndex;
                  const rendered = {};
                  try {
                    const view = cmp.getView && cmp.getView();
                    cols.forEach((col, ci) => {
                      const header = clean(col.text || col.header || col.dataIndex || col.name || ("col" + ci));
                      let cellText = "";
                      try {
                        const cell = view && view.getCell && view.getCell(rec, col);
                        const dom = cell && (cell.dom || cell);
                        cellText = clean(dom && (dom.innerText || dom.textContent));
                      } catch (e) {}
                      if (!cellText && col.dataIndex) {
                        try {
                          const rawVal = rec && rec.get ? rec.get(col.dataIndex) : readPath(data, col.dataIndex);
                          cellText = namedText(rawVal);
                        } catch (e) {}
                      }
                      if (header && cellText) rendered[header] = cellText;
                    });
                  } catch (e) {}
                  data.__foyRenderedCells = rendered;

                  const renderedNameEntry = Object.entries(rendered).find(([header, value]) => {
                    const h = lower(header);
                    return value && (
                      /tedavi\s*ad[ıi]/i.test(h) ||
                      /ila[cç]\s*ad[ıi]/i.test(h) ||
                      /stok\s*ad[ıi]/i.test(h) ||
                      /malzeme\s*ad[ıi]/i.test(h) ||
                      (/tedavi|ila[cç]|stok|malzeme/i.test(h) && !/t[uü]r|birim|kullan/i.test(h))
                    );
                  });
                  if (renderedNameEntry && renderedNameEntry[1]) data.__foyRenderedName = renderedNameEntry[1];

                  if (!data.__foyRenderedName && tedaviColIndex >= 0) {
                    try {
                      const col = cols[tedaviColIndex] || {};
                      const rawVal = col.dataIndex ? (rec && rec.get ? rec.get(col.dataIndex) : readPath(data, col.dataIndex)) : "";
                      const byField = namedText(rawVal);
                      if (byField && byField !== "[object Object]") data.__foyRenderedName = byField;
                    } catch (e) {}
                  }
                  return data;
                });
                const keys = rows.slice(0, 8).map(rowKeys).join("|");
                const names = rows.slice(0, 8).map(orderName).filter(Boolean).join("|");
                let score = 0;
                if (/tedavi|order|ilaç|ilac|sarf|stok|malzeme/i.test(colText)) score += 5;
                if (/doz|birimi|ilaç kullanım|ilac kullanim/i.test(colText)) score += 4;
                if (/stok|stokid|hizmetmakro|birimsevk|doz|ilackullanim/i.test(keys)) score += 8;
                if (names) score += 4;
                if (/hasta listesi|klinik bilgiler|laboratuvar|radyoloji|taburcu/i.test(colText) && !/tedavi|order|stok|malzeme/i.test(colText)) score -= 8;
                debug.push({ score, count: rows.length, cols: colText.slice(0, 180), keys: keys.slice(0, 180) });
                if (score >= 8) orderCandidates.push({ score, rows, cols: colText, keys });
              } catch (e) {}
            });
            orderCandidates.sort((a, b) => b.score - a.score || b.rows.length - a.rows.length);
            const best = orderCandidates[0] || null;
            const bestOrders = best && best.rows || [];
            const bestPatient = patients.find((x) => x.source === "secili") || patients.find((x) => x.source === "form") || patients[0] || null;
            document.documentElement.setAttribute("data-${marker}", JSON.stringify({
              patient: bestPatient,
              orders: bestOrders,
              expectedCount: bestOrders.length,
              debug
            }));
          })();
        `;
        (doc.head || doc.documentElement).appendChild(script);
        script.remove();
        const raw = doc.documentElement.getAttribute(`data-${marker}`) || "";
        doc.documentElement.removeAttribute(`data-${marker}`);
        if (raw) results.push(JSON.parse(raw));
      } catch (e) {}
    }
    return results;
  }

  // Bazı Chrome/FONET oturumları sayfaya eklenen scripti CSP nedeniyle çalıştırmıyor.
  // Bu yedek okuyucu aynı ExtJS gridini doğrudan mevcut pencere/iframe üzerinden okur.
  function directGridScan() {
    const candidates = [];
    for (const ctx of allContexts()) {
      try {
        const ExtRef = ctx.Ext;
        const all = ExtRef?.ComponentManager?.all;
        let components = [];
        if (Array.isArray(all?.items)) components = all.items;
        else if (all?.items && typeof all.items === "object") components = Object.values(all.items);
        else if (all && typeof all.each === "function") all.each((cmp) => components.push(cmp));
        for (const cmp of components) {
          try {
            const cols = cmp.columns || cmp.headerCt?.getGridColumns?.() || [];
            const headers = cols.map((c) => clean(c.text || c.header || c.dataIndex || c.name || ""));
            const headerText = norm(headers.join("|"));
            if (!/tedavi|ilac|stok|malzeme/.test(headerText)) continue;
            if (!/doz|birim|kullanim/.test(headerText)) continue;
            const store = cmp.store || cmp.getStore?.();
            let records = [];
            if (store?.getRange) records = store.getRange();
            else if (Array.isArray(store?.data?.items)) records = store.data.items;
            if (!records.length) continue;
            const view = cmp.getView?.();
            const rows = records.map((rec, rowIndex) => {
              const data = Object.assign({}, rec?.raw || {}, rec?.data || {});
              data.__foySourceIndex = rowIndex;
              data.__foyRenderedCells = {};
              cols.forEach((col, ci) => {
                const header = headers[ci] || `col${ci}`;
                let value = "";
                try {
                  const cell = view?.getCell?.(rec, col);
                  const dom = cell?.dom || cell;
                  value = clean(dom?.innerText || dom?.textContent || "");
                } catch (e) {}
                if (!value && col.dataIndex) {
                  try { value = namedText(rec?.get ? rec.get(col.dataIndex) : readPath(data, col.dataIndex)); } catch (e) {}
                }
                if (value) data.__foyRenderedCells[header] = value;
              });
              data.__foyRenderedName = renderedValue(data, /tedavi|ila[cç]|stok|malzeme|preparat|[üu]r[üu]n/i);
              return data;
            });
            candidates.push({ rows, expectedCount: Number(store?.getTotalCount?.() || rows.length), score: rows.length });
          } catch (e) {}
        }
      } catch (e) {}
    }
    candidates.sort((a, b) => b.rows.length - a.rows.length || b.score - a.score);
    return candidates[0] || null;
  }

  function directSelectedSevkScan() {
    for (const ctx of allContexts()) {
      try {
        const all = ctx.Ext?.ComponentManager?.all;
        let components = [];
        if (Array.isArray(all?.items)) components = all.items;
        else if (all?.items && typeof all.items === "object") components = Object.values(all.items);
        else if (all?.each) all.each((cmp) => components.push(cmp));
        for (const cmp of components) {
          const records = [];
          try { records.push(...(cmp.getSelectionModel?.().getSelection?.() || [])); } catch (e) {}
          try { const rec = cmp.getRecord?.(); if (rec) records.push(rec); } catch (e) {}
          for (const rec of records) {
            const data = Object.assign({}, rec?.raw || {}, rec?.data || {});
            const id = inferBirimSevkFromRows([data]);
            if (id) return id;
          }
        }
      } catch (e) {}
    }
    return "";
  }

  // ExtJS nesnelerine erişilemezse ekranda görünen grid satırlarını doğrudan DOM'dan oku.
  function domGridScan() {
    const found = [];
    for (const ctx of allContexts()) {
      try {
        const rowEls = ctx.document.querySelectorAll(".x-grid3-row, .x-grid-row");
        rowEls.forEach((rowEl) => {
          const innerCells = rowEl.querySelectorAll(".x-grid3-cell-inner, .x-grid-cell-inner");
          const cellEls = innerCells.length ? innerCells : rowEl.querySelectorAll("td");
          const cells = [...cellEls].map((el) => clean(el.innerText || el.textContent || ""));
          const doseIndex = cells.findIndex((v) => /^\d+(?:[.,]\d+)?\s*x\s*\d+(?:[.,]\d+)?$/i.test(v));
          if (doseIndex < 1) return;
          const name = clean(cells[doseIndex - 1]);
          if (!name || !/[a-zA-ZÇĞİÖŞÜçğıöşü]/.test(name)) return;
          found.push({
            __foySourceIndex: found.length,
            __foyRenderedName: name,
            __foyRenderedCells: { "Tedavi Adı": name, "Doz": cells[doseIndex] },
            doz: cells[doseIndex],
            birimAdi: cells[doseIndex + 1] || "",
            kullanimSekli: cells[doseIndex + 2] || "",
            aciklama: cells[doseIndex + 3] || ""
          });
        });
      } catch (e) {}
    }
    return found;
  }

  async function refreshFonetQueryForCapture() {
    for (const ctx of allContexts()) {
      try {
        const all = ctx.Ext?.ComponentManager?.all;
        let components = [];
        if (Array.isArray(all?.items)) components = all.items;
        else if (all?.items && typeof all.items === "object") components = Object.values(all.items);
        else if (all?.each) all.each((cmp) => components.push(cmp));
        const queryCmp = components.find((cmp) => norm(cmp?.text || cmp?.buttonText || cmp?.getText?.() || "") === "sorgula");
        if (queryCmp) {
          setStatus("Hasta/sevk bilgisi için FONET sorgusu yenileniyor...");
          if (typeof queryCmp.handler === "function") queryCmp.handler.call(queryCmp.scope || queryCmp, queryCmp);
          else if (queryCmp.fireEvent) queryCmp.fireEvent("click", queryCmp);
          else queryCmp.el?.dom?.click?.();
          for (let i = 0; i < 20 && !state.birimSevkId; i += 1) await new Promise((resolve) => setTimeout(resolve, 200));
          state.birimSevkId = state.birimSevkId || directSelectedSevkScan();
          return Boolean(state.birimSevkId);
        }
        const buttons = [...ctx.document.querySelectorAll("button, .x-btn-text, input[type=button]")];
        const queryButton = buttons.find((el) => norm(el.innerText || el.value || el.textContent) === "sorgula");
        if (queryButton) {
          setStatus("Hasta/sevk bilgisi için FONET sorgusu yenileniyor...");
          queryButton.click();
          for (let i = 0; i < 20 && !state.birimSevkId; i += 1) await new Promise((resolve) => setTimeout(resolve, 200));
          state.birimSevkId = state.birimSevkId || directSelectedSevkScan();
          return Boolean(state.birimSevkId);
        }
      } catch (e) {}
    }
    return false;
  }

  function extractBirimSevkFromCapturedText(text) {
    const decoded = (() => { try { return decodeURIComponent(String(text || "")); } catch (e) { return String(text || ""); } })();
    const patterns = [
      /"property"\s*:\s*"birimSevk\.id"[\s\S]{0,180}?"value"\s*:\s*"?(\d+)"?/,
      /birimSevk\.id[^0-9]{0,120}(\d{4,})/
    ];
    for (const pattern of patterns) {
      const m = decoded.match(pattern);
      if (m?.[1]) return m[1];
    }
    return "";
  }

  function captureOrderResponse(url, requestText, responseText) {
    if (!/\/Stok\/EOrder\/getKayitList/i.test(String(url || ""))) return;
    let json = null;
    try { json = JSON.parse(responseText || "{}"); } catch (e) {}
    const rows = Array.isArray(json?.data) ? json.data : [];
    if (!rows.length) return;
    const birimSevkId = extractBirimSevkFromCapturedText(`${url}\n${requestText}`) || inferBirimSevkFromRows(rows);
    state.captured = { birimSevkId, rows };
    state.birimSevkId = birimSevkId || state.birimSevkId;
    setRowsAllSelected(rows, "yakalanan order istegi");
    setStatus(`Yakalandı: ${displayRows().length}/${rows.length} satır | BS:${state.birimSevkId || "?"}`);
  }

  function installHooksIn(ctx) {
    try {
      ctx.__foyV19Capture = captureOrderResponse;
      if (ctx.__foyV19HookInstalled) return;
      ctx.__foyV19HookInstalled = true;
      const OriginalXHR = ctx.XMLHttpRequest;
      if (OriginalXHR) {
        ctx.XMLHttpRequest = function FoyXHR() {
          const xhr = new OriginalXHR();
          let method = "";
          let url = "";
          let body = "";
          const open = xhr.open;
          xhr.open = function patchedOpen(m, u) {
            method = m;
            url = u;
            return open.apply(xhr, arguments);
          };
          const send = xhr.send;
          xhr.send = function patchedSend(b) {
            body = b || "";
            try {
              xhr.addEventListener("load", () => {
                try { ctx.__foyV19Capture?.(url, `${method}\n${body}`, xhr.responseText); } catch (e) {}
              });
            } catch (e) {}
            return send.apply(xhr, arguments);
          };
          return xhr;
        };
      }
    } catch (e) {}
  }

  function installHooks() {
    allContexts().forEach(installHooksIn);
  }

  async function fetchOrdersForBirimSevk(birimSevkId, dateText = todayText()) {
    if (!/^\d+$/.test(String(birimSevkId || ""))) return [];
    const start = `${dateText} 00:00:00`;
    const end = `${dateText} 23:59:59`;
    const filter = [
      { index: 1, property: "tarihTuru", value: "tarihAraligiIcinde", filterType: "kriterPanel", isEnum: false, type: "String", operator: "=" },
      { index: 2, property: "tarih", value: start, filterType: "kriterPanel", type: "date", operator: "=" },
      { index: 3, property: "e.baslangicTarihi", value: start, filterType: "kriterPanel", type: "date", operator: ">=" },
      { index: 4, property: "e.bitisTarihi", value: end, filterType: "kriterPanel", type: "date", operator: "<=" },
      { index: 5, property: "birimSevk.id", value: Number(birimSevkId), filterType: "kriterPanel", type: "Long", operator: "=" },
      { index: 6, property: "yeri", value: 2, filterType: "kriterPanel", isEnum: true, type: "tr.com.fonet.hbys.common.enums.EOrderYeri", operator: "=" },
      { index: 7, property: "hemsireOrder", value: "false", filterType: "kriterPanel", isEnum: false, type: "String", operator: "=" }
    ];
    const data = await apiRequest("/Stok/EOrder/getKayitList", "GET", {
      autoStores: JSON.stringify(["turu", "stokTuru", "antibiyotikTuru", "ekstravazeIlacSekli", "durum"]),
      filterMap: "",
      filter: JSON.stringify(filter),
      page: 1,
      start: 0,
      limit: 500
    });
    return Array.isArray(data.data) ? data.data : [];
  }

  function namedText(v) {
    if (v == null) return "";
    if (typeof v === "string" || typeof v === "number") return clean(v);
    if (typeof v !== "object") return "";
    return clean(v.adi || v.ad || v.name || v.text || v.label || v.aciklama || v.tanim || "");
  }

  function deepOrderName(obj, depth = 0, seen = new Set()) {
    if (!obj || typeof obj !== "object" || depth > 4 || seen.has(obj)) return "";
    seen.add(obj);
    const entries = Object.entries(obj);
    for (const [key, value] of entries) {
      const k = norm(key);
      if (!/stok|ilac|tedavi|malzeme|hizmet|urun|preparat|jenerik/.test(k) || /birim|depo|kullanim|tur|id$/.test(k)) continue;
      const txt = namedText(value);
      if (txt && /[a-zA-ZÇĞİÖŞÜçğıöşü]/.test(txt)) return txt;
    }
    for (const [key, value] of entries) {
      const k = norm(key);
      if (!/stok|ilac|tedavi|malzeme|hizmet|urun|preparat|jenerik/.test(k) || /birim|depo|kullanim|tur/.test(k)) continue;
      const got = deepOrderName(value, depth + 1, seen);
      if (got) return got;
    }
    return "";
  }

  function renderedValue(x = {}, pattern) {
    const cells = x.__foyRenderedCells && typeof x.__foyRenderedCells === "object" ? x.__foyRenderedCells : {};
    for (const [header, value] of Object.entries(cells)) {
      if (pattern.test(clean(header)) && clean(value)) return clean(value);
    }
    return "";
  }

  function orderName(x = {}) {
    return clean(
      x.__foyRenderedName ||
      renderedValue(x, /tedavi|ila[cç]|stok|malzeme|preparat|[üu]r[üu]n/i) ||
      namedText(x.stok) || x.stokAdi || x.stokAd || x.stokKartiAdi || namedText(x.stokKarti) || namedText(x.stokKart) ||
      namedText(x.hizmetMakro) || x.hizmetMakroAdi || x.hizmetAdi || namedText(x.hizmet) ||
      namedText(x.malzeme) || x.malzemeAdi || x.malzemeAd || namedText(x.malzemeKarti) ||
      namedText(x.ilac) || x.ilacAdi || x.ilacAd || x.ilacTicariAdi || x.ticariAdi || x.ilacTamAdi || x.ilacAciklama ||
      namedText(x.tedavi) || x.tedaviAdi || x.tedaviAd ||
      namedText(x.urun) || x.urunAdi || x.urunAd || namedText(x.urunKarti) || x.preparatAdi || x.jenerikAdi ||
      x.STOK_ADI || x.ILAC_ADI || x.TEDAVI_ADI || x.MALZEME_ADI ||
      x.adi || x.ad || x.name || deepOrderName(x) || x.aciklama ||
      ""
    );
  }

  function orderDose(x = {}) {
    return clean(x.__foyEditedDose || x.doz || renderedValue(x, /^doz$/i) || "1x1");
  }

  function orderUnit(x = {}) {
    return clean(x.birim?.adi || x.birimAdi || x.birimi || renderedValue(x, /^birimi$|^birim$/i));
  }

  function orderRouteText(x = {}) {
    return clean(
      x.ilacKullanimSekli?.adi || x.ilacKullanimSekliAdi || x.kullanimSekli ||
      renderedValue(x, /ila[cç]\s*kullan[ıi]m|kullan[ıi]m\s*[şs]ekli|uygulama/i)
    );
  }

  function orderNote(x = {}) {
    return clean(x.aciklama || renderedValue(x, /^a[cç][ıi]klama$/i));
  }

  function isFollow(x = {}) {
    return Number(idValue(x.turu) || x.turuId || 0) === 2;
  }

  function orderKey(x = {}) {
    const dose = orderDose(x).toLowerCase().replace(/\s+/g, "");
    const route = norm(orderRouteText(x) || idValue(x.ilacKullanimSekli) || "");
    const note = norm(orderNote(x));
    if (isFollow(x)) return `T|${norm(x.eorderTakipDirektif?.adi || x.takipDirektif?.adi || orderNote(x) || "takip")}|${dose}|${route}|${note}`;
    return `O|${norm(orderName(x) || `row-${x.__foySourceIndex ?? ""}`)}|${dose}|${route}|${note}`;
  }

  function prepareRows(rows = []) {
    const seenIds = new Set();
    const seenExact = new Set();
    const safeRows = (Array.isArray(rows) ? rows : []).filter((row) => {
      // Yalnızca aynı FONET kayıt kimliği yinelenmişse kaldır. Aynı ilaçtan
      // gerçekten iki ayrı order varsa kimlikleri farklı olacağı için ikisi de kalır.
      const rawId = clean(firstValue(row || {}, ["id", "eorderId", "orderId", "EORDER_ID", "ORDER_ID"]));
      if (rawId) {
        const identity = `ID:${rawId}`;
        if (seenIds.has(identity)) return false;
        seenIds.add(identity);
      }
      const exact = [isFollow(row) ? "T" : "O", norm(orderName(row)), norm(orderDose(row)),
        norm(orderUnit(row)), norm(orderRouteText(row)), norm(orderNote(row))].join("|");
      if (seenExact.has(exact)) return false;
      seenExact.add(exact);
      return true;
    });
    return safeRows.map((row, index) => {
      const copy = Object.assign({}, row || {});
      copy.__foySourceIndex = Number.isFinite(Number(copy.__foySourceIndex)) ? Number(copy.__foySourceIndex) : index;
      copy.__foySelectionId = `${index}:${clean(copy.id || copy.eorderId || copy.orderId || "")}:${orderKey(copy)}`;
      return copy;
    });
  }

  function displayRows() {
    return Array.isArray(state.rows) ? state.rows : [];
  }

  // Her yeni okumada FONET'teki bütün satırları sağ panelde göster ve seç.
  function setRowsAllSelected(rows, source, expectedCount) {
    state.rows = prepareRows(rows);
    state.birimSevkId = state.birimSevkId || inferBirimSevkFromRows(rows) || inferBirimSevkFromRows(state.rows);
    // Aynı kimlikli tarama tekrarları FONET'te ayrı order değildir.
    state.expectedCount = state.rows.length;
    state.source = source || "";
    state.selectionSignature = state.rows.map(selectionKey).join("\n");
    state.selectedKeys = new Set(state.rows.map(selectionKey));
    renderRows();
  }

  function selectionKey(row) {
    return clean(row?.__foySelectionId || `${row?.__foySourceIndex ?? ""}:${orderKey(row || {})}`);
  }

  function syncSelection(rows = displayRows(), force = false) {
    const signature = rows.map(selectionKey).join("\n");
    if (force || signature !== state.selectionSignature) {
      state.selectionSignature = signature;
      state.selectedKeys = new Set(rows.map(selectionKey));
    } else {
      const allowed = new Set(rows.map(selectionKey));
      state.selectedKeys = new Set([...state.selectedKeys].filter((key) => allowed.has(key)));
    }
  }

  function selectedRows() {
    const rows = displayRows();
    syncSelection(rows);
    return rows.filter((row) => state.selectedKeys.has(selectionKey(row)));
  }

  function escapeHtml(v) {
    return clean(v).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));
  }

  function lineText(x, i) {
    if (isFollow(x)) return `${i + 1}. TAKIP: ${clean(x.eorderTakipDirektif?.adi || x.takipDirektif?.adi || orderNote(x) || "Takip")}${orderDose(x) ? " | Doz: " + orderDose(x) : ""}`;
    const name = orderName(x);
    return [
      `${i + 1}. ${name || "⚠ İLAÇ/TEDAVİ ADI OKUNAMADI"}`,
      orderDose(x) ? `Doz: ${orderDose(x)}` : "",
      orderUnit(x) ? `Birim: ${orderUnit(x)}` : "",
      orderRouteText(x) ? `Kullanim: ${orderRouteText(x)}` : "",
      orderNote(x) ? `Aciklama: ${orderNote(x)}` : ""
    ].filter(Boolean).join(" | ");
  }

  function doseFirst(dose) {
    return Number(String(dose || "1").match(/\d+/)?.[0] || 1);
  }

  function draftFromRow(x, targetDate, fallbackBirimSevkId) {
    const birimSevk = refObject(x.birimSevk || x.birimSevkId || fallbackBirimSevkId);
    if (!birimSevk) return null;
    if (isFollow(x)) {
      return {
        id: "",
        durum: 0,
        yeri: idValue(x.yeri) || 2,
        turu: 2,
        baslangicTarihi: `${targetDate} 00:00:00`,
        bitisTarihi: `${targetDate} 00:00:00`,
        doz: orderDose(x),
        ilacKullanimSekli: "",
        verilisSuresi: "",
        tedaviTuru: idValue(x.tedaviTuru) || 1,
        luzumHalinde: x.luzumHalinde || 0,
        sozelOrder: x.sozelOrder || 0,
        acilOrder: x.acilOrder || "",
        yirmiDortSaat: x.yirmiDortSaat || "",
        birimSevk,
        aciklama: orderNote(x) || "ALDIGI CIKARDIGI TAKIBI",
        birimCarpani: "",
        dozArtirimi: "",
        raporTakipNo: null,
        miktar: x.miktar || 1,
        eczaciNotu: null,
        hekimNotu: null,
        evdenOrder: null,
        eorderTakipDirektif: refObject(x.eorderTakipDirektif || x.takipDirektif) || { id: ACT_DIRECTIVE_ID }
      };
    }

    const stok = refObject(x.stok || x.stokId || x.malzeme || x.malzemeId || x.kodu || x.hizmetKodu);
    const hizmetMakro = refObject(x.hizmetMakro || x.hizmetMakroId);
    if (!stok && !hizmetMakro) return null;
    const draft = {
      id: "",
      durum: 0,
      yeri: idValue(x.yeri) || 2,
      turu: idValue(x.turu) || 1,
      baslangicTarihi: `${targetDate} 00:00:00`,
      bitisTarihi: `${targetDate} 00:00:00`,
      doz: orderDose(x),
      ilacKullanimSekli: idValue(x.ilacKullanimSekli) || "",
      verilisSuresi: x.verilisSuresi || "",
      tedaviTuru: x.tedaviTuru == null ? "" : idValue(x.tedaviTuru),
      luzumHalinde: x.luzumHalinde || 0,
      sozelOrder: x.sozelOrder || 0,
      acilOrder: x.acilOrder || "",
      yirmiDortSaat: x.yirmiDortSaat || "",
      birimSevk,
      aciklama: orderNote(x) || null,
      birimCarpani: x.birimCarpani == null || x.birimCarpani === "" ? 1 : x.birimCarpani,
      dozArtirimi: x.dozArtirimi || "",
      raporTakipNo: x.raporTakipNo || null,
      miktar: x.miktar == null || x.miktar === "" ? doseFirst(orderDose(x)) : x.miktar,
      eczaciNotu: null,
      hekimNotu: null,
      evdenOrder: null
    };
    const birim = refObject(x.birim || x.birimId || x.stok?.birim || x.stok?.birimId || x.malzeme?.birim || x.malzeme?.birimId || x.stokBirim || x.stokBirimId);
    const depo = refObject(x.depo || x.depoId || x.stok?.depo || x.stokDepo || x.stokDepoId) || { id: DEFAULT_DEPO_ID };
    if (stok) draft.stok = stok;
    if (birim) draft.birim = birim;
    if (depo) draft.depo = depo;
    if (hizmetMakro) draft.hizmetMakro = hizmetMakro;
    return draft;
  }

  function keyCounts(rows = []) {
    const map = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const key = orderKey(row);
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }

  function buildDraft(rows, birimSevkId, targetExistingRows, requestedTargetDate) {
    const targetDate = requestedTargetDate || addOneDay(todayText());
    const sourceRows = Array.isArray(rows) ? rows.slice() : [];
    const existing = keyCounts(targetExistingRows);
    const eorderList = [];
    const alreadyExists = [];
    const missing = [];
    sourceRows.forEach((row) => {
      const key = orderKey(row);
      if ((existing.get(key) || 0) > 0) {
        existing.set(key, existing.get(key) - 1);
        alreadyExists.push(lineText(row, alreadyExists.length));
        return;
      }
      const draft = draftFromRow(row, targetDate, birimSevkId);
      if (draft) eorderList.push(draft);
      else missing.push(lineText(row, missing.length));
    });
    return { targetDate, unique: sourceRows, dupes: [], eorderList, alreadyExists, missing };
  }

  function ui(id) {
    return document.getElementById(`${id}${UI_SUFFIX}`);
  }

  function setStatus(text) {
    const el = ui("foy-clean-status");
    if (el) el.textContent = text;
  }

  function updateSelectionUi() {
    const all = displayRows();
    const selected = selectedRows();
    const count = ui("foy-clean-selection");
    const named = all.filter((row) => isFollow(row) || Boolean(orderName(row))).length;
    if (count) count.textContent = `Seçili: ${selected.length}/${all.length} | Adı okunan: ${named}/${all.length}`;
    const area = ui("foy-clean-text");
    if (area) area.value = selected.length ? selected.map(lineText).join("\n") : "";
  }

  function renderRows() {
    const rows = displayRows();
    syncSelection(rows);
    const list = ui("foy-clean-list");
    if (list) {
      if (!rows.length) {
        list.innerHTML = '<div style="padding:10px;color:#64748b;">Order okunmadi.</div>';
      } else {
        list.innerHTML = rows.map((row, i) => {
          const checked = state.selectedKeys.has(selectionKey(row)) ? " checked" : "";
          return `<div style="display:flex;align-items:flex-start;gap:8px;padding:5px 7px;border-bottom:1px solid #e2e8f0;line-height:1.25;">` +
            `<input class="foy-order-check" data-index="${i}" type="checkbox"${checked} style="margin-top:2px;transform:scale(1.08);">` +
            `<span style="flex:1;font:12px Consolas,monospace;white-space:normal;word-break:break-word;">${escapeHtml(lineText(row, i))}</span>` +
            `<label style="display:flex;align-items:center;gap:4px;font:11px Arial,sans-serif;font-weight:700;white-space:nowrap;">Doz:` +
              `<input class="foy-dose-input" data-index="${i}" value="${escapeHtml(orderDose(row))}" style="width:58px;border:1px solid #94a3b8;border-radius:5px;padding:4px;box-sizing:border-box;">` +
            `</label>` +
          `</div>`;
        }).join("");
        list.querySelectorAll(".foy-order-check").forEach((box) => {
          box.onchange = () => {
            const row = rows[Number(box.dataset.index)];
            if (!row) return;
            const key = selectionKey(row);
            if (box.checked) state.selectedKeys.add(key);
            else state.selectedKeys.delete(key);
            updateSelectionUi();
          };
        });
        list.querySelectorAll(".foy-dose-input").forEach((input) => {
          input.onchange = () => {
            const row = rows[Number(input.dataset.index)];
            if (!row) return;
            const value = clean(input.value);
            if (!value) {
              input.value = orderDose(row);
              alert("Doz boş bırakılamaz.");
              return;
            }
            row.__foyEditedDose = value;
            input.value = value;
            updateSelectionUi();
            setStatus(`${orderName(row) || "Order"} dozu ${value} olarak değiştirildi.`);
          };
        });
      }
    }
    updateSelectionUi();
  }

  async function readOrders() {
    setStatus("Ekrandaki FONET gridleri okunuyor...");
    state.birimSevkId = state.birimSevkId || directSelectedSevkScan();
    const scans = pageWorldScan();
    const direct = directGridScan();
    const domRows = domGridScan();
    const withOrders = scans.find((x) => Array.isArray(x.orders) && x.orders.length) ||
      (direct ? { orders: direct.rows, expectedCount: direct.expectedCount } : null) ||
      (domRows.length ? { orders: domRows, expectedCount: domRows.length } : null);
    const withPatient = scans.find((x) => x.patient?.id);
    if (withPatient?.patient?.id) state.birimSevkId = clean(withPatient.patient.id);
    if (withOrders?.orders?.length) {
      setRowsAllSelected(withOrders.orders, "ekrandaki tedavi grid", withOrders.expectedCount);
      if (!state.birimSevkId) await refreshFonetQueryForCapture();
      const { sourceDate } = selectedDates();
      if (state.birimSevkId) {
        setRowsAllSelected(await fetchOrdersForBirimSevk(state.birimSevkId, sourceDate), `API kaynak tarihi ${sourceDate}`);
      }
      if (state.birimSevkId) {
        setStatus(`GÜVENLİ OKUMA: ${displayRows().length}/${state.expectedCount || state.rows.length} satır | Adı okunan: ${displayRows().filter((r) => isFollow(r) || orderName(r)).length}/${displayRows().length} | BS:${state.birimSevkId}`);
      } else {
        setStatus(`OKUMA: ${displayRows().length}/${state.expectedCount || state.rows.length} satır | Adı okunan: ${displayRows().filter((r) => isFollow(r) || orderName(r)).length}/${displayRows().length} | BS yok`);
      }
      return;
    }

    if (state.birimSevkId) {
      const { sourceDate } = selectedDates();
      setRowsAllSelected(await fetchOrdersForBirimSevk(state.birimSevkId, sourceDate), `API kaynak tarihi ${sourceDate}`);
      setStatus(`API: ${displayRows().length}/${state.expectedCount || state.rows.length} satır | Adı okunan: ${displayRows().filter((r) => isFollow(r) || orderName(r)).length}/${displayRows().length} | BS:${state.birimSevkId}`);
      return;
    }

    if (state.captured?.rows?.length) {
      state.birimSevkId = state.captured.birimSevkId || state.birimSevkId;
      setRowsAllSelected(state.captured.rows, "yakalanan istek");
      setStatus(`YAKALANDI: ${displayRows().length}/${state.expectedCount || state.rows.length} satır | Adı okunan: ${displayRows().filter((r) => isFollow(r) || orderName(r)).length}/${displayRows().length} | BS:${state.birimSevkId || "?"}`);
      return;
    }

    const debug = scans.flatMap((x) => x.debug || []).slice(0, 8).map((x) => `puan:${x.score} satir:${x.count} kolon:${x.cols}`).join("\n");
    alert("Order okunamadi.\n\nBu panel acikken FONET'te hastayi sec ve Tedavi Girisleri tablosu gorunsun. Gerekirse Sorgula'ya bas.\n\nGorulen gridler:\n" + (debug || "Yok"));
    setStatus("Order okunamadi.");
  }

  async function transferTomorrow() {
    if (!state.rows.length) await readOrders();
    if (!state.rows.length) return;
    const chosenRows = selectedRows();
    if (!chosenRows.length) {
      alert("Yarına aktarılacak order seçilmedi. Aktarmak istediklerinin tikini açık bırak.");
      return;
    }
    if (state.expectedCount && displayRows().length !== state.expectedCount) {
      alert(`GÜVENLİK BLOĞU: FONET ${state.expectedCount} satır gösteriyor ancak panel ${displayRows().length} satır okuyabildi. Eksik okuma varken yarına aktarım yapılmayacak.`);
      return;
    }
    const unresolvedSelected = chosenRows.filter((row) => !isFollow(row) && !orderName(row));
    if (unresolvedSelected.length) {
      alert(`GÜVENLİK BLOĞU: Seçili ${unresolvedSelected.length} satırın ilaç/tedavi adı doğrulanamadı. Bu satırların tikini kaldırmadan aktarım yapılmayacak.`);
      return;
    }
    if (!state.birimSevkId) {
      state.birimSevkId = directSelectedSevkScan();
    }
    if (!state.birimSevkId) {
      await refreshFonetQueryForCapture();
      if (!state.birimSevkId) {
        alert("Hasta/sevk ID alınamadı. Hasta seçiliyken önce FONET'teki Sorgula düğmesine, ardından Ekrandan Oku düğmesine basın.");
        return;
      }
    }
    const { sourceDate, targetDate } = selectedDates();
    if (sourceDate === targetDate) {
      alert("Kaynak ve hedef tarih aynı olamaz.");
      return;
    }
    setStatus(`${targetDate} kontrol ediliyor...`);
    const targetExistingRows = await fetchOrdersForBirimSevk(state.birimSevkId, targetDate);
    const draft = buildDraft(chosenRows, state.birimSevkId, targetExistingRows, targetDate);
    if (draft.missing.length) {
      alert(`GÜVENLİK BLOĞU: Seçili ${draft.missing.length} order güvenli şekilde taslağa çevrilemedi. Hiçbir order gönderilmedi.\n\n- ${draft.missing.join("\n- ")}`);
      return;
    }
    if (!draft.eorderList.length) {
      alert(`Aktarilacak yeni order yok.\n\nYarinda zaten olan: ${draft.alreadyExists.length}` +
        (draft.alreadyExists.length ? `\n\nYarinda zaten olan:\n- ${draft.alreadyExists.join("\n- ")}` : "") +
        (draft.missing.length ? `\n\nEksik:\n- ${draft.missing.join("\n- ")}` : ""));
      return;
    }
    const ok = confirm(`${draft.targetDate} tarihine ${draft.eorderList.length}/${chosenRows.length} SEÇİLİ satır TASLAK order aktarılsın mı?` +
      (draft.alreadyExists.length ? `\n\nYarinda zaten var, tekrar gonderilmeyecek:\n- ${draft.alreadyExists.join("\n- ")}` : "") +
      (draft.missing.length ? `\n\nAktarilamayacak:\n- ${draft.missing.join("\n- ")}` : "") +
      "\n\nE-imza/Tedavi Uygula yapilmaz.");
    if (!ok) return;
    setStatus("FONET'e gonderiliyor...");
    await apiRequest("/Stok/EOrder/updateKayit", "PUT", { eorderList: draft.eorderList });
    await new Promise((resolve) => setTimeout(resolve, 800));
    const afterRows = await fetchOrdersForBirimSevk(state.birimSevkId, draft.targetDate);
    const report = `Gönderildi: ${draft.eorderList.length}/${chosenRows.length} seçili\nSeçim dışı bırakılan: ${Math.max(0, displayRows().length - chosenRows.length)}\nYarın zaten var diye atlanan: ${draft.alreadyExists.length}\nYarın görünen toplam: ${afterRows.length}`;
    setStatus(report.replace(/\n/g, " | "));
    alert(report);
  }

  async function copyText() {
    const rows = selectedRows();
    if (!rows.length) {
      alert("Kopyalanacak order seçilmedi.");
      return;
    }
    const text = rows.map(lineText).join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setStatus("Metin kopyalandi.");
  }

  function makePanel() {
    document.querySelectorAll('[id^="fonet-order-kopyala-"]').forEach((node) => node.remove());
    installHooks();
    const el = document.createElement("div");
    el.id = PANEL_ID;
    el.style.cssText = "position:fixed;right:18px;bottom:58px;z-index:2147483647;width:650px;max-width:calc(100vw - 36px);background:#0f172a;color:white;border-radius:10px;box-shadow:0 16px 40px rgba(0,0,0,.35);font:13px Arial,sans-serif;overflow:hidden;";
    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#111827;">
        <b>Order Kopyala ${VERSION} — 1:1 satır kontrolü</b>
        <button id="foy-clean-close${UI_SUFFIX}" style="border:0;border-radius:7px;background:#dc2626;color:white;padding:7px 10px;font-weight:800;cursor:pointer;">Kapat</button>
      </div>
      <div style="padding:10px;background:white;color:#0f172a;">
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
          <button id="foy-clean-read${UI_SUFFIX}" style="border:0;border-radius:8px;background:#2563eb;color:white;padding:9px 12px;font-weight:800;cursor:pointer;">Kaynak Tarihi Oku</button>
          <button id="foy-clean-copy${UI_SUFFIX}" style="border:0;border-radius:8px;background:#16a34a;color:white;padding:9px 12px;font-weight:800;cursor:pointer;">Seçilileri Kopyala</button>
          <button id="foy-clean-transfer${UI_SUFFIX}" style="border:0;border-radius:8px;background:#f97316;color:white;padding:9px 12px;font-weight:800;cursor:pointer;">Seçilileri Hedefe Aktar</button>
          <button id="foy-clean-all${UI_SUFFIX}" style="border:1px solid #94a3b8;border-radius:8px;background:#f8fafc;color:#0f172a;padding:8px 10px;font-weight:700;cursor:pointer;">Tümünü Seç</button>
          <button id="foy-clean-none${UI_SUFFIX}" style="border:1px solid #94a3b8;border-radius:8px;background:#f8fafc;color:#0f172a;padding:8px 10px;font-weight:700;cursor:pointer;">Tümünü Kaldır</button>
        </div>
        <div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap;margin-bottom:9px;padding:8px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;">
          <label style="font-size:11px;font-weight:700;">Kaynak tarih<br><input id="foy-source-date${UI_SUFFIX}" type="date" style="margin-top:3px;padding:5px;border:1px solid #94a3b8;border-radius:5px;"></label>
          <span style="padding-bottom:7px;font-weight:900;">→</span>
          <label style="font-size:11px;font-weight:700;">Hedef tarih<br><input id="foy-target-date${UI_SUFFIX}" type="date" style="margin-top:3px;padding:5px;border:1px solid #94a3b8;border-radius:5px;"></label>
          <button id="foy-yesterday-today${UI_SUFFIX}" style="padding:6px 8px;border:1px solid #64748b;border-radius:6px;background:white;cursor:pointer;font-weight:700;">Dün → Bugün</button>
          <button id="foy-today-tomorrow${UI_SUFFIX}" style="padding:6px 8px;border:1px solid #64748b;border-radius:6px;background:white;cursor:pointer;font-weight:700;">Bugün → Yarın</button>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin:2px 1px 6px 1px;">
          <b style="font-size:12px;">Hedef tarihe aktarılacak orderlar</b>
          <span id="foy-clean-selection${UI_SUFFIX}" style="font-size:12px;color:#475569;">Seçili: 0/0</span>
        </div>
        <div id="foy-clean-list${UI_SUFFIX}" style="height:300px;overflow:auto;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;background:white;"></div>
        <textarea id="foy-clean-text${UI_SUFFIX}" style="display:none;"></textarea>
        <div id="foy-clean-status${UI_SUFFIX}" style="margin-top:8px;color:#475569;font-size:12px;white-space:pre-wrap;">Hazır. Kaynak ve hedef tarihi seçin.</div>
      </div>
    `;
    document.body.appendChild(el);
    const applyDates = (sourceDate, targetDate) => {
      ui("foy-source-date").value = toInputDate(sourceDate);
      ui("foy-target-date").value = toInputDate(targetDate);
      setStatus(`Kaynak: ${sourceDate} → Hedef: ${targetDate}. Kaynak Tarihi Oku düğmesine basın.`);
    };
    applyDates(todayText(), addOneDay(todayText()));
    ui("foy-yesterday-today").onclick = () => applyDates(addDays(todayText(), -1), todayText());
    ui("foy-today-tomorrow").onclick = () => applyDates(todayText(), addOneDay(todayText()));
    ui("foy-clean-close").onclick = () => el.remove();
    ui("foy-clean-read").onclick = () => readOrders().catch((e) => alert(`Okuma olmadi:\n${e?.message || e}`));
    ui("foy-clean-copy").onclick = () => copyText().catch((e) => alert(`Kopyalama olmadi:\n${e?.message || e}`));
    ui("foy-clean-all").onclick = () => {
      state.selectedKeys = new Set(displayRows().map(selectionKey));
      renderRows();
    };
    ui("foy-clean-none").onclick = () => {
      state.selectedKeys = new Set();
      state.selectionSignature = displayRows().map(selectionKey).join("\n");
      renderRows();
    };
    ui("foy-clean-transfer").onclick = () => transferTomorrow().catch((e) => {
      setStatus("Aktarim olmadi.");
      alert(`Aktarim olmadi:\n${e?.message || e}`);
    });
    readOrders().catch((e) => setStatus(`Otomatik okuma olmadi: ${e?.message || e}`));
  }

  makePanel();
})();
