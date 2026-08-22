(() => {
  /********************************************************************
   * FONET SERVİS CANLI PANEL V6
   * - Kullanıcı tek tek hasta açmadan açık servis hasta listesini toplar
   * - DOM tablo + ExtJS grid store okumayı dener
   * - Hastaları vizit kartı formatında aynı panelde gösterir
   * - V2: yakalanan endpointlerle hasta detay/lab/kons/order/devir/radyoloji arka plan sorgusu dener
   * - V3: kart birleştirme, tıklayınca büyük detay, görünür hata/ID tanısı
   * - V4: eksik hastaGelisId tamamlama, lab/kons fallback, vizit kağıdı hazırla
   * - V5: vital endpointi, 5+ gün lab geçmişi, endpoint durum metni düzeltmesi
   * - V6: diyet alanları genişletildi, son 10 saat kons cevabı/okundu mantığı
   * - V6.1: kısa diyet kartı ve bugünkü kons takip kartı
   * - V6.2: ayrı popup panel, network getKayit diyet yakalama
   * - V6.3: kart boyutu/sıralama ve güncelleme içeriği etiketi
   * - V6.4: radyoloji rapor metni, yeni yatış uyarısı, tıklayana kadar kalan güncelleme etiketi
   * - V6.5: beyaz vizit ekranı ve gerekli lab tarihini kullanma
   * - V6.6: vizit kartı görünümü
   * - V6.7: kart başlığı doktor baş harfleri
   * - V6.8: preop/postop ameliyat istem tarihinden hesaplanır
   * - V6.9: anestezi formundan ASA/BH/Kİ/GO/Yer yakalama
   * - V6.10: kart scroll koruma, üstte vital/lab özeti ve glukoz
   * - V6.11: 1080p kompakt kart, belirgin vital ve hover büyütme
   * - V6.12: hover büyütme 1.4x ve animasyonsuz
   * - V6.13: radyoloji rapor metni yenilemede korunur
   * - V6.14: PCT ayrımı, lab tarihi ana takip kanlarına göre, Na/K/P/Ca/Mg
   * - V6.15: glukometre/idrar/kan gazı ana lab tarihine karışmaz
   * - V6.17: idrar WBC sonuçları hemogram WBC serisine karışmaz
   * - V6.18: günlük kons kartlarında bekleyen turuncu, tamamı kapanan mor
   * - V6.19: kons cevabı yalnızca gerçek Sonuç Açıklama metnine göre belirlenir
   * - V6.20: içeriksiz bildirimler engellendi, telefona değişiklik ayrıntısı eklenir
   * - V6.21: parmak ucu glukotest ana labdan ayrıldı, Yeni glukoz bildirimi eklendi
   * - V6.22: aynı bildirimlerin tekrarı ve dizi sıralamasından doğan sahte güncellemeler engellendi
   * - V6.23: günlük kons takibi her zaman son 10 saatte atılan konsları gösterir
   * - V6.24: Ca yalnız gerçek Kalsiyum (Ca) sonuçlarını kullanır; hesaplama açıklamaları dışlanır
   * - V6.25: hasta arama çubuğu, optimize bildirim şeridi, Google Docs uyumlu son 8 kan tablosu ve son vital vizit çıktısı
   ********************************************************************/

  if (window.__FONET_SERVICE_PANEL__) {
    try { window.__FONET_SERVICE_PANEL__.restore?.(); } catch (e) {}
  }

  const state = {
    patients: [],
    requests: [],
    seen: {},
    monitor: null,
    renderTimer: null,
    original: {},
    active: true,
    lastMessage: "",
    busy: false,
    selectedKey: "",
    ackConsults: {},
    panelWindow: null,
    popupMode: false,
    cardWidth: 380,
    cardHeight: 248,
    cardOrder: [],
    cardScroll: {},
    gridScroll: 0,
    radiologyTextCache: {},
    bridgeUrl: "http://127.0.0.1:8787/api/update",
    bridgeLastSent: 0,
    bridgeOnline: false,
    dragCardKey: "",
    drag: null,
    theme: (() => {
      try { return localStorage.getItem("fonetServicePanelTheme") || "clinical"; } catch (e) { return "clinical"; }
    })(),
    soundEnabled: (() => {
      try { return localStorage.getItem("fonetServicePanelSound") !== "0"; } catch (e) { return true; }
    })(),
    audioCtx: null,
    audioUnlocked: false,
    lastSoundAt: 0
    ,
    searchText: "",
    notificationLog: (() => {
      try {
        const value = JSON.parse(localStorage.getItem("fonetServiceNotifications") || "[]");
        return Array.isArray(value) ? value.slice(0, 160) : [];
      } catch (e) { return []; }
    })(),
    notificationSeen: (() => {
      try {
        const value = JSON.parse(localStorage.getItem("fonetServiceNotificationSeen") || "{}");
        return value && typeof value === "object" && !Array.isArray(value) ? value : {};
      } catch (e) { return {}; }
    })()
  };

  window.__FONET_SERVICE_PANEL__ = state;

  const THEMES = {
    clinical: {
      label: "Klinik",
      bg: "#edf4fb",
      surface: "#ffffff",
      surface2: "#f8fbff",
      header: "#0f172a",
      headerText: "#f8fafc",
      text: "#0f172a",
      muted: "#475569",
      border: "#c9d8e8",
      primary: "#0ea5e9",
      primary2: "#1d4ed8",
      accent: "#f59e0b",
      success: "#16a34a",
      danger: "#dc2626",
      purple: "#a855f7",
      tile: "#eff6ff",
      tileBorder: "#bfdbfe",
      shadow: "0 16px 38px rgba(15,23,42,.18)"
    },
    future: {
      label: "Futuristik",
      bg: "#07111f",
      surface: "#0c1b2e",
      surface2: "#10253d",
      header: "#020617",
      headerText: "#e0f2fe",
      text: "#e5f4ff",
      muted: "#9cc5dd",
      border: "#1e4d69",
      primary: "#22d3ee",
      primary2: "#38bdf8",
      accent: "#facc15",
      success: "#22c55e",
      danger: "#fb7185",
      purple: "#c084fc",
      tile: "#0f2a44",
      tileBorder: "#1e7497",
      shadow: "0 22px 70px rgba(34,211,238,.18)"
    },
    scifi: {
      label: "Bilim Kurgu",
      bg: "#0b1020",
      surface: "#15122a",
      surface2: "#20173a",
      header: "#13091f",
      headerText: "#f5e8ff",
      text: "#f3e8ff",
      muted: "#c4b5fd",
      border: "#4c1d95",
      primary: "#8b5cf6",
      primary2: "#06b6d4",
      accent: "#f97316",
      success: "#10b981",
      danger: "#ef4444",
      purple: "#d946ef",
      tile: "#21173d",
      tileBorder: "#6d28d9",
      shadow: "0 22px 70px rgba(217,70,239,.18)"
    },
    nature: {
      label: "Doğa",
      bg: "#edf7ef",
      surface: "#ffffff",
      surface2: "#f3fbf5",
      header: "#123524",
      headerText: "#ecfdf5",
      text: "#14211a",
      muted: "#476356",
      border: "#b7d8c2",
      primary: "#059669",
      primary2: "#0f766e",
      accent: "#ca8a04",
      success: "#16a34a",
      danger: "#dc2626",
      purple: "#7c3aed",
      tile: "#e8f8ed",
      tileBorder: "#a7f3d0",
      shadow: "0 18px 42px rgba(20,83,45,.18)"
    },
    graphite: {
      label: "Grafit",
      bg: "#e5e7eb",
      surface: "#ffffff",
      surface2: "#f3f4f6",
      header: "#111827",
      headerText: "#f9fafb",
      text: "#111827",
      muted: "#4b5563",
      border: "#cbd5e1",
      primary: "#2563eb",
      primary2: "#111827",
      accent: "#ea580c",
      success: "#15803d",
      danger: "#b91c1c",
      purple: "#7c3aed",
      tile: "#f8fafc",
      tileBorder: "#cbd5e1",
      shadow: "0 18px 42px rgba(17,24,39,.22)"
    },
    sunrise: {
      label: "Gün Doğumu",
      bg: "#fff7ed",
      surface: "#ffffff",
      surface2: "#fffaf0",
      header: "#431407",
      headerText: "#fff7ed",
      text: "#1f2937",
      muted: "#78716c",
      border: "#fed7aa",
      primary: "#ea580c",
      primary2: "#db2777",
      accent: "#f59e0b",
      success: "#16a34a",
      danger: "#dc2626",
      purple: "#9333ea",
      tile: "#fff3df",
      tileBorder: "#fdba74",
      shadow: "0 18px 42px rgba(154,52,18,.16)"
    }
  };

  function activeTheme() {
    return THEMES[state.theme] || THEMES.clinical;
  }

  function themeOptionsHtml() {
    return Object.entries(THEMES)
      .map(([key, theme]) => `<option value="${key}"${key === state.theme ? " selected" : ""}>${escapeHtml(theme.label)}</option>`)
      .join("");
  }

  function setTheme(name) {
    state.theme = THEMES[name] ? name : "clinical";
    try { localStorage.setItem("fonetServicePanelTheme", state.theme); } catch (e) {}
    makePanel();
  }

  function soundButtonText() {
    return state.soundEnabled ? "Ses Açık" : "Ses Kapalı";
  }

  function setSoundEnabled(value) {
    state.soundEnabled = Boolean(value);
    try { localStorage.setItem("fonetServicePanelSound", state.soundEnabled ? "1" : "0"); } catch (e) {}
    if (state.soundEnabled) {
      unlockNotificationSound();
      playNotificationSound(["test"], true);
    }
    makePanel();
  }

  function ensureAudioContext() {
    if (state.audioCtx) return state.audioCtx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    try {
      state.audioCtx = new Ctx();
      return state.audioCtx;
    } catch (e) {
      return null;
    }
  }

  function unlockNotificationSound() {
    if (!state.soundEnabled) return null;
    const ctx = ensureAudioContext();
    if (!ctx) return null;
    try {
      const resume = ctx.state === "suspended" ? ctx.resume() : Promise.resolve();
      Promise.resolve(resume).then(() => {
        state.audioUnlocked = true;
      }).catch(() => {});
    } catch (e) {}
    return ctx;
  }

  function soundPattern(labels = []) {
    const text = norm(labels.join(" "));
    if (/kons/.test(text) && /cevap/.test(text)) {
      return [
        { f: 880, d: 0.09, gap: 0.02 },
        { f: 1175, d: 0.11, gap: 0.03 },
        { f: 1568, d: 0.16, gap: 0 }
      ];
    }
    if (/vital|lab|radyoloji|order|devir|anestezi|asa|diyet|klinik/.test(text)) {
      return [
        { f: 740, d: 0.10, gap: 0.03 },
        { f: 988, d: 0.14, gap: 0 }
      ];
    }
    return [
      { f: 660, d: 0.10, gap: 0.02 },
      { f: 880, d: 0.12, gap: 0 }
    ];
  }

  function scheduleTone(ctx, freq, start, duration, volume = 0.11) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.025);
  }

  function playNotificationSound(labels = [], force = false) {
    if (!state.soundEnabled) return;
    const now = Date.now();
    if (!force && now - (state.lastSoundAt || 0) < 1800) return;
    state.lastSoundAt = now;
    const ctx = unlockNotificationSound();
    if (!ctx) return;
    const play = () => {
      try {
        let at = ctx.currentTime + 0.02;
        soundPattern(labels).forEach((tone) => {
          scheduleTone(ctx, tone.f, at, tone.d);
          at += tone.d + (tone.gap || 0);
        });
      } catch (e) {}
    };
    try {
      if (ctx.state === "suspended") {
        ctx.resume().then(play).catch(() => {});
      } else {
        play();
      }
    } catch (e) {}
  }

  const clean = (t) => String(t || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\r/g, "")
    .trim();

  const norm = (t) => clean(t).toLocaleLowerCase("tr-TR");

  function uiDocument() {
    try {
      if (state.panelWindow && !state.panelWindow.closed && state.panelWindow.document?.body) {
        return state.panelWindow.document;
      }
    } catch (e) {}
    try {
      if (window.top?.document?.body) return window.top.document;
    } catch (e) {}
    return document;
  }

  function uiWindow() {
    return uiDocument().defaultView || window;
  }

  function uiEl(id) {
    const doc = uiDocument();
    return doc.getElementById(id) || document.getElementById(id);
  }

  function removeUiEl(id) {
    const doc = uiDocument();
    const topEl = doc.getElementById(id);
    const localEl = document.getElementById(id);
    topEl?.remove();
    if (localEl && localEl !== topEl) localEl.remove();
  }

  function openPanelWindow() {
    try {
      if (state.panelWindow && !state.panelWindow.closed && state.panelWindow.document?.body) {
        state.popupMode = true;
        return state.panelWindow;
      }

      const win = window.open("", "fonet_servis_canli_panel_v6");
      if (!win) {
        state.popupMode = false;
        return null;
      }

      state.panelWindow = win;
      state.popupMode = true;
      win.document.open();
      win.document.write(`<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <title>FONET Servis Canlı İzlem</title>
  <style>
    html, body { margin:0; width:100%; height:100%; overflow:hidden; background:#f1f5f9; }
    button, textarea { font-family:inherit; }
  </style>
</head>
<body></body>
</html>`);
      win.document.close();
      win.onbeforeunload = () => {
        if (state.panelWindow === win) {
          state.panelWindow = null;
          state.popupMode = false;
        }
      };
      return win;
    } catch (e) {
      state.popupMode = false;
      return null;
    }
  }

  function rowsAsArrays() {
    return Array.from(document.querySelectorAll("tr"))
      .map((tr) =>
        Array.from(tr.querySelectorAll("td,th"))
          .map((td) => clean(td.innerText || td.textContent || ""))
          .filter(Boolean)
      )
      .filter((r) => r.length);
  }

  function patientKey(p) {
    const nameRoom = [p.oda, p.adSoyad].map(clean).join("|");
    if (clean(p.oda) && clean(p.adSoyad)) return nameRoom;
    return [p.adSoyad, p.protokol, p.kimlikNo, p.birimSevkId, p.hastaGelisId, p.hastaId].map(clean).filter(Boolean).join("|");
  }

  function displayKey(p) {
    return p.key || patientKey(p);
  }

  function roomSort(a, b) {
    return String(a.oda || "").localeCompare(String(b.oda || ""), "tr", { numeric: true });
  }

  function sortPatientsForDisplay(list) {
    const base = list.slice().sort(roomSort);
    const orderIndex = new Map((state.cardOrder || []).map((key, index) => [key, index]));
    const sorted = base.sort((a, b) => {
      const ak = displayKey(a);
      const bk = displayKey(b);
      const ai = orderIndex.has(ak) ? orderIndex.get(ak) : Number.MAX_SAFE_INTEGER;
      const bi = orderIndex.has(bk) ? orderIndex.get(bk) : Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return roomSort(a, b);
    });
    state.cardOrder = sorted.map(displayKey);
    return sorted;
  }

  function movePatientCard(fromKey, toKey) {
    if (!fromKey || !toKey || fromKey === toKey) return;
    const order = (state.cardOrder?.length ? state.cardOrder.slice() : state.patients.map(displayKey));
    state.patients.map(displayKey).forEach((key) => {
      if (key && !order.includes(key)) order.push(key);
    });
    const from = order.indexOf(fromKey);
    const to = order.indexOf(toKey);
    if (from < 0 || to < 0) return;
    const [item] = order.splice(from, 1);
    order.splice(to, 0, item);
    state.cardOrder = order;
    state.patients = sortPatientsForDisplay(state.patients);
    render();
  }

  function mergePatients(list) {
    const map = new Map();
    [...state.patients, ...list].forEach((p) => {
      if (!p || !p.adSoyad) return;
      const key = patientKey(p) || p.adSoyad;
      const old = map.get(key) || {};
      const merged = { ...old, ...p, key };
      ["birimSevkId", "hastaGelisId", "hastaId", "protokol", "kimlikNo", "doktor", "birim", "yas", "cinsiyet", "tani", "alerji", "asa", "diyet", "diyetId", "uzmanlikKodu", "diyetAraOgun", "knownDiseases", "homeMeds", "plannedOperation", "postopPlace"].forEach((field) => {
        if (!merged[field] && old[field]) merged[field] = old[field];
        if (!merged[field] && p[field]) merged[field] = p[field];
      });
      for (const field of ["labs", "glucoseChecks", "vitals", "consults", "orders", "nursing", "radiology", "surgeries", "anesthesia", "errors"]) {
        if ((!p[field] || (Array.isArray(p[field]) && !p[field].length)) && old[field]) merged[field] = old[field];
      }
      if (!p.clinical && old.clinical) merged.clinical = old.clinical;
      map.set(key, merged);
    });
    state.patients = sortPatientsForDisplay(Array.from(map.values()));
    return state.patients;
  }

  function collectPatientRowsFromDom() {
    const unitRe = /cerrahi|yoğun bakım|pacu|kliniği|servisi|ortopedi|dahiliye|anestezi|yatak/i;

    return rowsAsArrays()
      .filter((r) => {
        if (!/^\d+$/.test(r[0] || "")) return false;
        if (!r[1] || r[1].length < 5) return false;
        if (!/^\d{1,5}$/.test(r[2] || "")) return false;
        return r.some((x) => unitRe.test(norm(x)));
      })
      .map((r) => {
        let yas = "";
        let doktor = "";
        let birim = "";
        let vaka = "";

        if (/^\d{1,3}$/.test(r[3] || "") && r[4]) {
          yas = r[3] || "";
          doktor = r[4] || "";
          birim = r[5] || "";
          vaka = r[6] || "";
        } else {
          doktor = r[3] || "";
          birim = r[4] || "";
          vaka = r[5] || "";
        }

        return {
          source: "DOM",
          sira: r[0] || "",
          adSoyad: r[1] || "",
          oda: r[2] || "",
          yas,
          doktor,
          birim,
          vaka,
          raw: r.join(" | ")
        };
      });
  }

  function getRecordValue(record, names) {
    const readPath = (obj, path) => {
      if (!obj || !path.includes(".")) return undefined;
      return path.split(".").reduce((acc, key) => acc == null ? undefined : acc[key], obj);
    };

    for (const name of names) {
      try {
        if (record.get && record.get(name) != null) return record.get(name);
      } catch (e) {}
      try {
        if (record.data && record.data[name] != null) return record.data[name];
      } catch (e) {}
      try {
        const nested = readPath(record.data, name);
        if (nested != null) return nested;
      } catch (e) {}
    }
    return "";
  }

  function deepFind(obj, predicate, depth = 0) {
    if (!obj || typeof obj !== "object" || depth > 5) return "";
    try {
      if (predicate(obj)) return obj.id || "";
    } catch (e) {}
    for (const value of Object.values(obj)) {
      const found = deepFind(value, predicate, depth + 1);
      if (found) return found;
    }
    return "";
  }

  function inferIdsFromData(data = {}) {
    const birimSevkId =
      data.birimSevk?.id ||
      data.klinik?.birimSevk?.id ||
      data.hastaBirimSevk?.id ||
      deepFind(data, (x) => x.birim && x.hastaGelis && x.id);

    const hastaGelisId =
      data.hastaGelis?.id ||
      data.birimSevk?.hastaGelis?.id ||
      data.hastaBirimSevk?.hastaGelis?.id ||
      deepFind(data, (x) => x.hasta && (x.kodu || x.muracaatTarihi) && x.id);

    const hastaId =
      data.hasta?.id ||
      data.hastaGelis?.hasta?.id ||
      data.birimSevk?.hastaGelis?.hasta?.id ||
      data.hastaBirimSevk?.hastaGelis?.hasta?.id ||
      deepFind(data, (x) => x.kimlik && x.id);

    return { birimSevkId: clean(birimSevkId), hastaGelisId: clean(hastaGelisId), hastaId: clean(hastaId) };
  }

  function collectPatientRowsFromExt() {
    const out = [];
    if (!window.Ext?.ComponentQuery) return out;

    const nameKeys = ["ADSOYAD", "AD_SOYAD", "HASTA_ADI_SOYADI", "HASTAADI", "HASTA_ADI", "ADI_SOYADI", "adiSoyadi", "adSoyad", "hastaAdiSoyadi"];
    const firstKeys = ["ADI", "HASTA_ADI", "ad", "adi"];
    const lastKeys = ["SOYADI", "HASTA_SOYADI", "soyad", "soyadi"];
    const roomKeys = ["ODA", "ODA_NO", "ODANO", "YATAK_NO", "YATAKNO", "odaNo", "yatakNo"];
    const doctorKeys = ["DOKTOR", "DOKTOR_ADI", "SORUMLU_DOKTOR", "doktor", "doktorAdi"];
    const unitKeys = ["BIRIM", "BİRİM", "YATAK_BIRIMI", "SERVIS", "SERVİS", "KLİNİK", "KLINIK", "birim", "servis"];
    const protocolKeys = ["PROTOKOL", "PROTOKOL_NO", "ISLEMNO", "ISLEM_NO", "GELIS_NO", "protokolNo", "islemNo"];
    const idKeys = ["KIMLIK_NO", "TC_KIMLIK_NO", "TCKIMLIKNO", "HASTA_KIMLIK_NO", "kimlikNo", "tcKimlikNo"];
    const ageKeys = ["YAS", "YAŞ", "HASTA_YASI", "yas"];
    const dietKeys = ["DIYET", "DİYET", "DIYET_ADI", "DİYET_ADI", "DIYETADI", "DİYETADI", "diyet", "diyetAdi", "diyet.adi", "sabahDiyetMenu.adi", "ogleDiyetMenu.adi", "aksamDiyetMenu.adi"];
    const dietIdKeys = ["DIYET_ID", "DİYET_ID", "DIYETID", "DİYETID", "diyetId", "diyet.id", "sabahDiyetMenu.id", "ogleDiyetMenu.id", "aksamDiyetMenu.id"];
    const specialtyKeys = ["UZMANLIK_KODU", "UZMANLIKKODU", "BRANS_KODU", "BRANŞ_KODU", "uzmanlikKodu", "birim.uzmanlikKodu", "birimSevk.birim.uzmanlikKodu", "birimSevk.personel.uzmanlik.kodu"];
    const birimSevkKeys = ["BIRIM_SEVK_ID", "BIRIMSEVKID", "HASTA_BIRIM_SEVK_ID", "HASTABIRIMSEVKID", "birimSevkId", "hastaBirimSevkId", "birimSevk.id", "klinik.birimSevk.id", "id"];
    const hastaGelisKeys = ["HASTA_GELIS_ID", "HASTAGELISID", "GELIS_ID", "hastaGelisId", "hastaGelis.id", "birimSevk.hastaGelis.id"];
    const hastaIdKeys = ["HASTA_ID", "HASTAID", "hastaId", "hasta.id", "hastaGelis.hasta.id", "birimSevk.hastaGelis.hasta.id"];

    try {
      Ext.ComponentQuery.query("gridpanel, grid").forEach((grid) => {
        let store = null;
        try { store = grid.getStore?.(); } catch (e) {}
        if (!store) return;

        const records = [];
        try {
          store.each?.((rec) => records.push(rec));
        } catch (e) {}
        try {
          if (!records.length && store.data?.items) records.push(...store.data.items);
        } catch (e) {}

        records.forEach((record) => {
          const data = record.data || {};
          const inferred = inferIdsFromData(data);
          let adSoyad = clean(getRecordValue(record, nameKeys));
          const first = clean(getRecordValue(record, firstKeys));
          const last = clean(getRecordValue(record, lastKeys));
          if (!adSoyad && (first || last)) adSoyad = [first, last].filter(Boolean).join(" ");

          const oda = clean(getRecordValue(record, roomKeys));
          const birim = clean(getRecordValue(record, unitKeys));

          if (!adSoyad || adSoyad.length < 5) return;
          if (!oda && !/cerrahi|yoğun|servis|klinik|yatak/i.test(birim)) return;

          out.push({
            source: "ExtJS",
            adSoyad,
            oda,
            yas: clean(getRecordValue(record, ageKeys)),
            doktor: clean(getRecordValue(record, doctorKeys)),
            birim,
            protokol: clean(getRecordValue(record, protocolKeys)),
            kimlikNo: clean(getRecordValue(record, idKeys)),
            diyet: clean(getRecordValue(record, dietKeys)),
            diyetId: clean(getRecordValue(record, dietIdKeys)),
            uzmanlikKodu: clean(getRecordValue(record, specialtyKeys)),
            birimSevkId: clean(getRecordValue(record, birimSevkKeys)) || inferred.birimSevkId,
            hastaGelisId: clean(getRecordValue(record, hastaGelisKeys)) || inferred.hastaGelisId,
            hastaId: clean(getRecordValue(record, hastaIdKeys)) || inferred.hastaId,
            labs: [],
            vitals: [],
            consults: [],
            orders: [],
            nursing: [],
            radiology: [],
            clinical: "",
            errors: [],
            raw: JSON.stringify(data).slice(0, 1200)
          });
        });
      });
    } catch (e) {}

    return out;
  }

  function collectServicePatients(shouldRender = true) {
    const dom = collectPatientRowsFromDom();
    const ext = collectPatientRowsFromExt();
    mergePatients([...dom, ...ext]);
    state.lastMessage = `${state.patients.length} servis hastası toplandı.`;
    if (shouldRender) render();
    return state.patients;
  }

  function inferEndpointType(url, body, responseText) {
    const hay = `${url} ${body} ${responseText}`.toLocaleLowerCase("tr-TR");
    if (/anestezi|preoperatif|preop|asa skoru|anestezi.+muayene/.test(hay)) return "patient";
    if (/hasta|patient|yatis|yatış|protokol|kimlik|servis|klinik/.test(hay)) return "patient";
    if (/laboratuvar|lab|tetkik|sonuc|sonuç|hemogram|biyokimya|wbc|hgb|crp/.test(hay)) return "lab";
    if (/vital|tansiyon|nabız|nabiz|ateş|ates|solunum|spo2|ölçüm|olcum/.test(hay)) return "vital";
    if (/kons|konsult|konsült|istem|sonuç açıklama|sonucaciklama/.test(hay)) return "consult";
    if (/order|eorder|tedavi|ilaç|ilac|sarf|doz/.test(hay)) return "order";
    if (/hemşire|hemsire|devir|bakım|bakim|nöbet|nobet/.test(hay)) return "nursing";
    return "other";
  }

  function applyPatientDetailResponse(url, responseText) {
    if (!/\/Klinik\/Klinik\/getKayit\//i.test(url || "")) return false;
    if (!/diyet|DiyetMenu|Diyet/i.test(responseText || "")) return false;

    try {
      const match = String(url || "").match(/\/Klinik\/Klinik\/getKayit\/(\d+)/i);
      const tmp = { birimSevkId: clean(match?.[1] || "") };
      parseKlinikDetail(JSON.parse(responseText), tmp);
      if (!tmp.diyet && !tmp.diyetId) return false;

      const target = state.patients.find((p) =>
        (tmp.birimSevkId && clean(p.birimSevkId) === clean(tmp.birimSevkId)) ||
        (tmp.hastaGelisId && clean(p.hastaGelisId) === clean(tmp.hastaGelisId)) ||
        (tmp.hastaId && clean(p.hastaId) === clean(tmp.hastaId))
      );

      if (target) {
        const before = JSON.stringify(patientSnapshot(target));
        ["diyet", "diyetId", "uzmanlikKodu", "diyetAraOgun", "yatis", "tani", "clinical", "hastaGelisId", "hastaId", "birimSevkId"].forEach((field) => {
          if (tmp[field]) target[field] = tmp[field];
        });
        target.updatedAt = new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
        if (before !== JSON.stringify(patientSnapshot(target))) {
          const labels = [];
          if (tmp.diyet || tmp.diyetAraOgun) labels.push("Diyet güncellendi");
          if (tmp.clinical) labels.push("Klinik izlem");
          if (tmp.tani || tmp.yatis) labels.push("Hasta bilgisi");
          target.changedAt = Date.now();
          target.changedLabels = [...new Set([...(target.changedLabels || []), ...(labels.length ? labels : ["Hasta bilgisi"])])];
          target.changedText = target.changedLabels.slice(0, 4).join(", ");
          target.changedDetail = labels.length
            ? changeDetailText(labels, {}, patientSnapshot(target), target)
            : "Hasta bilgileri güncellendi.";
          target.lastChangeText = (labels.length ? labels : ["Hasta bilgisi"]).join(", ");
          target.lastChangeDetail = target.changedDetail;
          recordDesktopNotification(target, labels.length ? labels : ["Hasta bilgisi"], target.changedDetail);
          playNotificationSound(labels.length ? labels : ["Hasta bilgisi"]);
        }
        return true;
      }

      if (tmp.adSoyad) {
        mergePatients([tmp]);
        return true;
      }
    } catch (e) {}
    return false;
  }

  function applyRadiologyReportResponse(url, responseText) {
    if (!/\/Ris\/RisHizmetSonuc\/getRisRaporSonucByRaporId\//i.test(url || "")) return false;
    const reportId = clean(String(url || "").match(/getRisRaporSonucByRaporId\/(\d+)/i)?.[1] || "");
    if (!reportId) return false;

    try {
      const data = JSON.parse(responseText);
      const text = radiologyReportText(data);
      if (!text) return false;

      const patient = state.patients.find((p) => (p.radiology || []).some((r) => clean(r.reportId) === reportId));
      if (!patient) return false;

      const rad = (patient.radiology || []).find((r) => clean(r.reportId) === reportId);
      if (!rad) return false;
      const before = rad.reportText || "";
      rad.reportText = text;
      rad.reportDate = data?.data?.onayTarihi || data?.data?.eklemeTarihi || rad.reportDate || "";
      state.radiologyTextCache[reportId] = text;
      patient.updatedAt = new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
      if (before !== text) {
        patient.changedAt = Date.now();
        patient.changedLabels = [...new Set([...(patient.changedLabels || []), "Yeni radyoloji"])];
        patient.changedText = patient.changedLabels.slice(0, 4).join(", ");
        patient.changedDetail = `Radyoloji: ${clip(text, 520)}`;
        patient.lastChangeText = "Yeni radyoloji";
        patient.lastChangeDetail = patient.changedDetail;
        recordDesktopNotification(patient, ["Yeni radyoloji"], patient.changedDetail);
        playNotificationSound(["Yeni radyoloji"]);
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  function applyAnesthesiaFormResponse(url, responseText) {
    const sample = String(responseText || "").slice(0, 20000);
    if (!/anestezi|preoperatif|preop|\basa\b|planlanan ameliyat|kullandığı ilaç|kullandigi ilac|bilinen hastalık|bilinen hastalik/i.test(`${url || ""} ${sample}`)) return false;

    try {
      const data = JSON.parse(responseText);
      const info = extractAnesthesiaInfo(data);
      if (!info || !["asa", "knownDiseases", "homeMeds", "plannedOperation", "destination"].some((field) => info[field])) return false;

      const patient = findPatientForAnesthesiaData(data, info);
      if (!patient) {
        state.lastMessage = "Anestezi formu yakalandı, hasta eşleşmesi bulunamadı.";
        return true;
      }

      const before = stableJson(patientSnapshot(patient));
      applyAnesthesiaInfo(patient, info);
      patient.updatedAt = new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

      if (before !== stableJson(patientSnapshot(patient))) {
        patient.changedAt = Date.now();
        patient.changedLabels = [...new Set([...(patient.changedLabels || []), "Anestezi formu"])];
        patient.changedText = patient.changedLabels.slice(0, 4).join(", ");
        patient.changedDetail = changeDetailText(["Anestezi formu"], {}, patientSnapshot(patient), patient);
        patient.lastChangeText = "Anestezi formu";
        patient.lastChangeDetail = patient.changedDetail;
        recordDesktopNotification(patient, ["Anestezi formu"], patient.changedDetail);
        playNotificationSound(["Anestezi formu"]);
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  function scheduleRender(delay = 150) {
    if (!state.active || state.renderTimer) return;
    state.renderTimer = window.setTimeout(() => {
      state.renderTimer = null;
      if (state.active) render();
    }, delay);
  }

  function addRequest(req) {
    const responseText = String(req.responseText || "");
    const type = inferEndpointType(req.url, req.body, responseText);
    const appliedPatientDetail = applyPatientDetailResponse(req.url, responseText);
    const appliedRadiologyReport = applyRadiologyReportResponse(req.url, responseText);
    const appliedAnesthesia = applyAnesthesiaFormResponse(req.url, responseText);
    state.requests.unshift({ ...req, responseText: responseText.slice(0, 1000), type, at: new Date().toLocaleTimeString("tr-TR") });
    state.requests = state.requests.slice(0, 200);
    if (type === "patient") collectServicePatients(false);
    if (!state.busy) scheduleRender(appliedPatientDetail || appliedRadiologyReport || appliedAnesthesia ? 50 : 200);
  }

  function patchNetwork() {
    if (!state.original.xhrOpen && window.XMLHttpRequest) {
      state.original.xhrOpen = XMLHttpRequest.prototype.open;
      state.original.xhrSend = XMLHttpRequest.prototype.send;

      XMLHttpRequest.prototype.open = function(method, url) {
        this.__fsp = { method, url, started: performance.now(), body: "" };
        return state.original.xhrOpen.apply(this, arguments);
      };

      XMLHttpRequest.prototype.send = function(body) {
        const meta = this.__fsp || {};
        meta.body = typeof body === "string" ? body : "";
        this.addEventListener("loadend", () => {
          let text = "";
          try { text = String(this.responseText || ""); } catch (e) {}
          addRequest({
            source: "xhr",
            method: meta.method || "GET",
            url: meta.url || "",
            body: meta.body || "",
            status: this.status,
            responseText: text
          });
        });
        return state.original.xhrSend.apply(this, arguments);
      };
    }

    if (!state.original.extRequest && window.Ext?.Ajax?.request) {
      state.original.extRequest = Ext.Ajax.request;
      Ext.Ajax.request = function(options = {}) {
        const userSuccess = options.success;
        const userFailure = options.failure;
        const url = options.url || "";
        const method = options.method || "GET";
        const body = JSON.stringify(options.params || options.jsonData || {});

        options.success = function(response) {
          addRequest({
            source: "Ext.Ajax",
            method,
            url,
            body,
            status: response?.status || "",
            responseText: String(response?.responseText || "")
          });
          return userSuccess?.apply(this, arguments);
        };

        options.failure = function(response) {
          addRequest({
            source: "Ext.Ajax",
            method,
            url,
            body,
            status: response?.status || "ERR",
            responseText: String(response?.responseText || "")
          });
          return userFailure?.apply(this, arguments);
        };

        return state.original.extRequest.call(this, options);
      };
    }
  }

  function baseUrl() {
    const win = (() => {
      try {
        if (window.opener && !window.opener.closed && /^https?:/i.test(window.opener.location.origin)) return window.opener;
      } catch (e) {}
      return window;
    })();
    const origin = /^https?:/i.test(win.location.origin || "") ? win.location.origin : "http://hbys.bursa.yerel";
    return `${origin}/hbys-rs/hbys`;
  }

  function filterParam(items) {
    return encodeURIComponent(JSON.stringify(items));
  }

  async function apiJson(path, params = {}) {
    const query = new URLSearchParams({ _dc: Date.now() });
    Object.entries(params).forEach(([key, value]) => {
      if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
      else if (value != null) query.set(key, value);
    });
    const url = `${baseUrl()}${path}${path.includes("?") ? "&" : "?"}${query.toString()}`;
    const fetchFn = (() => {
      try {
        if (window.opener && !window.opener.closed && window.opener.fetch) return window.opener.fetch.bind(window.opener);
      } catch (e) {}
      return fetch.bind(window);
    })();
    const res = await fetchFn(url, {
      credentials: "include",
      headers: { "Accept": "application/json, text/plain, */*" }
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 120)}`);
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`JSON okunamadı: ${text.slice(0, 120)}`);
    }
  }

  async function apiJsonBody(path, method, payload = {}) {
    const url = `${baseUrl()}${path}`;
    try {
      const fonetWin = (window.opener && !window.opener.closed && /hbys/i.test(window.opener.location.href)) ? window.opener : window;
      if (fonetWin.Ext?.Ajax?.request) {
        return new Promise((resolve, reject) => {
          fonetWin.Ext.Ajax.request.call(fonetWin.Ext.Ajax, {
            url,
            method,
            jsonData: JSON.stringify(payload),
            success: (response) => {
              try {
                const text = response?.responseText || "";
                const json = text ? JSON.parse(text) : response;
                if (json?.success === false) reject(new Error(json.message || json.msg || text.slice(0, 220)));
                else resolve(json);
              } catch (e) {
                resolve(response);
              }
            },
            failure: (response) => reject(new Error(`${response?.status || "ERR"} ${String(response?.responseText || response?.statusText || "").slice(0, 220)}`))
          });
        });
      }
    } catch (e) {}
    if (false) return new Promise((resolve, reject) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open(method, url, true);
        xhr.withCredentials = true;
        xhr.setRequestHeader("Accept", "application/json, text/plain, */*");
        xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
        xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
        xhr.onreadystatechange = () => {
          if (xhr.readyState !== 4) return;
          const text = xhr.responseText || "";
          if (xhr.status < 200 || xhr.status >= 300) {
            reject(new Error(`${xhr.status || "ERR"} ${text.slice(0, 220)}`));
            return;
          }
          try {
            const json = text ? JSON.parse(text) : {};
            if (json?.success === false) {
              reject(new Error(json.message || json.msg || text.slice(0, 220) || "FONET başarısız döndü"));
            } else {
              resolve(json);
            }
          } catch (e) {
            resolve({ text });
          }
        };
        xhr.onerror = () => reject(new Error("XHR gönderimi başarısız"));
        xhr.send(JSON.stringify(payload));
      } catch (e) {
        reject(e);
      }
    });
    const ext = (() => {
      try {
        if (window.opener && !window.opener.closed && window.opener.Ext?.Ajax?.request) return window.opener.Ext.Ajax;
      } catch (e) {}
      try {
        if (window.Ext?.Ajax?.request) return window.Ext.Ajax;
      } catch (e) {}
      return null;
    })();
    if (ext) {
      return new Promise((resolve, reject) => {
        ext.request({
          url,
          method,
          jsonData: JSON.stringify(payload),
          success: (response) => {
            try {
              resolve(response?.responseText ? JSON.parse(response.responseText) : response);
            } catch (e) {
              resolve(response);
            }
          },
          failure: (response) => reject(new Error(`${response?.status || "ERR"} ${String(response?.responseText || response?.statusText || "").slice(0, 160)}`))
        });
      });
    }
    const fetchFn = (() => {
      try {
        if (window.opener && !window.opener.closed && window.opener.fetch) return window.opener.fetch.bind(window.opener);
      } catch (e) {}
      return fetch.bind(window);
    })();
    const res = await fetchFn(url, {
      method,
      credentials: "include",
      headers: {
        "Accept": "application/json, text/plain, */*",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 160)}`);
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch (e) {
      return { text };
    }
  }

  function shortDate(date) {
    const m = String(date || "").match(/(\d{2})[./](\d{2})[./](\d{4})/);
    return m ? `${m[1]}.${m[2]}` : "";
  }

  function shortTime(date) {
    const m = String(date || "").match(/\b(\d{2}:\d{2})/);
    return m ? m[1] : "";
  }

  function dateTimeKey(date) {
    const m = String(date || "").match(/(\d{2})[./](\d{2})[./](\d{4})\s+(\d{2}):(\d{2})/);
    return m ? `${m[3]}${m[2]}${m[1]}${m[4]}${m[5]}` : "";
  }

  function parseTrDate(date) {
    const m = String(date || "").match(/(\d{2})[./](\d{2})[./](\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return 0;
    return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6] || 0)).getTime();
  }

  function cleanMultiline(text) {
    return String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r/g, "")
      .split("\n")
      .map((x) => clean(x))
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  function stableJson(value) {
    const normalize = (item) => {
      if (Array.isArray(item)) {
        return item
          .map(normalize)
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), "tr"));
      }
      if (!item || typeof item !== "object") return item;
      return Object.keys(item).sort().reduce((out, key) => {
        out[key] = normalize(item[key]);
        return out;
      }, {});
    };
    return JSON.stringify(normalize(value));
  }

  function normalizeEventText(value) {
    return cleanMultiline(value).toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
  }

  function stableEventId(...parts) {
    const text = parts.map(normalizeEventText).join("|");
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `n${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  function persistDesktopNotifications() {
    try {
      localStorage.setItem("fonetServiceNotifications", JSON.stringify(state.notificationLog.slice(0, 160)));
      const seenEntries = Object.entries(state.notificationSeen || {})
        .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
        .slice(0, 600);
      state.notificationSeen = Object.fromEntries(seenEntries);
      localStorage.setItem("fonetServiceNotificationSeen", JSON.stringify(state.notificationSeen));
    } catch (e) {}
  }

  function notificationKind(labels = []) {
    const text = norm(labels.join(" "));
    if (/kons/.test(text)) return "consult";
    if (/glukoz|glukotest|glukometre/.test(text)) return "glucose";
    if (/vital|tansiyon|nabız|ates|ateş|spo2/.test(text)) return "vital";
    if (/lab|kan/.test(text)) return "lab";
    if (/radyoloji|görüntü|rapor/.test(text)) return "radiology";
    if (/order|ilaç|ilac/.test(text)) return "order";
    if (/devir|hemşire|hemsire/.test(text)) return "nursing";
    if (/diyet/.test(text)) return "diet";
    if (/anestezi|asa|bh|ki|go|yer/.test(text)) return "anesthesia";
    if (/yatış|yatis/.test(text)) return "admission";
    return "other";
  }

  function notificationStyle(kind) {
    const styles = {
      consult: { color: "#9333ea", soft: "#faf5ff", title: "Konsültasyon" },
      glucose: { color: "#d97706", soft: "#fffbeb", title: "Yeni glukoz" },
      vital: { color: "#0891b2", soft: "#ecfeff", title: "Yeni vital" },
      lab: { color: "#dc2626", soft: "#fef2f2", title: "Yeni lab" },
      radiology: { color: "#2563eb", soft: "#eff6ff", title: "Radyoloji" },
      order: { color: "#16a34a", soft: "#f0fdf4", title: "Yeni order" },
      nursing: { color: "#0f766e", soft: "#f0fdfa", title: "Hemşire / devir" },
      diet: { color: "#ca8a04", soft: "#fefce8", title: "Diyet" },
      anesthesia: { color: "#7c3aed", soft: "#f5f3ff", title: "Anestezi formu" },
      admission: { color: "#dc2626", soft: "#fff1f2", title: "Yatış / yer" },
      other: { color: "#475569", soft: "#f8fafc", title: "Güncelleme" }
    };
    return styles[kind] || styles.other;
  }

  function recordDesktopNotification(p, labels = [], detail = "") {
    const summary = [...new Set(labels.map(clean).filter(Boolean))].join(", ");
    const body = cleanMultiline(detail);
    if (!summary && !body) return null;
    const key = displayKey(p);
    const kind = notificationKind(labels);
    const id = stableEventId(key, kind, summary, body);
    if (state.notificationSeen[id]) return null;
    const now = Date.now();
    const recent = state.notificationLog.find((x) =>
      x?.key === key &&
      x.kind === kind &&
      !x.read &&
      now - Number(x.at || 0) < 120000
    );
    if (recent) {
      const mergedSummary = [...new Set([
        ...String(recent.summary || "").split(",").map(clean).filter(Boolean),
        ...summary.split(",").map(clean).filter(Boolean)
      ])].slice(0, 6).join(", ");
      recent.summary = mergedSummary || recent.summary || summary || notificationStyle(kind).title;
      recent.detail = compactNotificationDetail([recent.detail, body].filter(Boolean).join("\n\n"));
      recent.at = now;
      recent.count = Number(recent.count || 1) + 1;
      recent.read = false;
      state.notificationSeen[id] = now;
      state.notificationLog = [recent, ...state.notificationLog.filter((x) => x?.id !== recent.id)].slice(0, 160);
      persistDesktopNotifications();
      return recent;
    }

    const item = {
      id,
      key,
      oda: clean(p.oda),
      adSoyad: clean(p.adSoyad),
      kind,
      title: notificationStyle(kind).title,
      summary: summary || notificationStyle(kind).title,
      detail: compactNotificationDetail(body),
      at: now,
      read: false,
      count: 1
    };
    state.notificationSeen[id] = item.at;
    state.notificationLog = [item, ...state.notificationLog.filter((x) => x?.id !== id)].slice(0, 160);
    persistDesktopNotifications();
    return item;
  }

  function compactNotificationDetail(text) {
    const lines = cleanMultiline(text)
      .split("\n")
      .map(clean)
      .filter(Boolean);
    const unique = [];
    lines.forEach((line) => {
      const normalized = normalizeEventText(line);
      if (!normalized || unique.some((x) => normalizeEventText(x) === normalized)) return;
      unique.push(line);
    });
    return unique.slice(0, 14).join("\n");
  }

  function unreadNotificationCount() {
    return state.notificationLog.filter((item) => item && !item.read).length;
  }

  function markNotificationRead(id) {
    const item = state.notificationLog.find((x) => x?.id === id);
    if (item) item.read = true;
    persistDesktopNotifications();
  }

  function markPatientNotificationsRead(key) {
    let changed = false;
    state.notificationLog.forEach((item) => {
      if (item?.key === key && !item.read) {
        item.read = true;
        changed = true;
      }
    });
    if (changed) persistDesktopNotifications();
  }

  function markAllNotificationsRead() {
    state.notificationLog.forEach((item) => { if (item) item.read = true; });
    persistDesktopNotifications();
  }

  function deleteDesktopNotification(id) {
    state.notificationLog = state.notificationLog.filter((item) => item?.id !== id);
    persistDesktopNotifications();
  }

  function clearDesktopNotifications() {
    state.notificationLog = [];
    persistDesktopNotifications();
  }

  function patientMatchesSearch(p, query = state.searchText) {
    const q = norm(query);
    if (!q) return true;
    return norm([
      p.adSoyad,
      p.oda,
      p.doktor,
      p.birim,
      p.tani,
      p.clinical,
      p.diyet
    ].filter(Boolean).join(" ")).includes(q);
  }

  function htmlToText(raw) {
    const text = String(raw || "");
    if (!/<[^>]+>/.test(text)) return cleanMultiline(text);
    try {
      const doc = new DOMParser().parseFromString(text, "text/html");
      Array.from(doc.querySelectorAll("img,script,style")).forEach((x) => x.remove());
      return cleanMultiline(doc.body.innerText || doc.body.textContent || "");
    } catch (e) {
      return cleanMultiline(text.replace(/<[^>]+>/g, " "));
    }
  }

  function cleanReportText(text) {
    return cleanMultiline(text)
      .replace(/Bu raporun elektronik imzalı kopyasını[\s\S]*$/i, "")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/Rad\.?\s*Uzm\.?\s*Dr[\s\S]*$/i, "")
      .replace(/İmza:[\s\S]*$/i, "")
      .trim();
  }

  function usableRadiologyText(text) {
    const value = cleanReportText(text);
    if (!value) return "";
    if (/^(aktif|pasif|kesin rapor|rapor var|onaylandı|onaylandi|taslak|bekliyor)$/i.test(value)) return "";
    if (value.length < 4) return "";
    return value;
  }

  function extractBoldRadiologyText(raw) {
    const html = String(raw || "");
    if (!/<[^>]+>/.test(html)) return "";

    try {
      const doc = new DOMParser().parseFromString(html, "text/html");
      Array.from(doc.querySelectorAll("img,script,style")).forEach((x) => x.remove());

      const nodes = Array.from(doc.body.querySelectorAll("*"))
        .filter((el) => {
          if (el.tagName === "STRONG" || el.tagName === "B") return true;
          const style = String(el.getAttribute("style") || "");
          return /font-weight\s*:\s*(bold|[6-9]00)/i.test(style);
        });

      const lines = nodes
        .map((x) => cleanMultiline(x.innerText || x.textContent || ""))
        .flatMap((x) => x.split("\n"))
        .map(clean)
        .filter(Boolean)
        .filter((x) => {
          if (/^Tarih\s*:/i.test(x)) return false;
          if (/^ID\s*:/i.test(x)) return false;
          if (/^Modality\s*:/i.test(x)) return false;
          if (/^Hasta Adı\s*:/i.test(x)) return false;
          if (/^SAYIN MESLEKTAŞIM/i.test(x)) return false;
          if (/^Değerlendirme\s*:/i.test(x)) return false;
          if (/^İmza/i.test(x)) return false;
          if (/^Dip\.?\s*No/i.test(x)) return false;
          if (/^Tescil/i.test(x)) return false;
          if (/^Rad\.?\s*Uzm/i.test(x)) return false;
          return x.length >= 3;
        });

      return [...new Set(lines)].join("\n");
    } catch (e) {
      return "";
    }
  }

  function radiologyTextFromRaw(raw) {
    const text = String(raw || "");
    const bold = usableRadiologyText(extractBoldRadiologyText(text));
    if (bold) return bold;
    return usableRadiologyText(htmlToText(text));
  }

  function deepRadiologyTextCandidates(obj, out = [], depth = 0) {
    if (!obj || typeof obj !== "object" || depth > 7) return out;
    if (Array.isArray(obj)) {
      obj.forEach((value) => deepRadiologyTextCandidates(value, out, depth + 1));
      return out;
    }

    Object.entries(obj).forEach(([key, value]) => {
      const keyText = norm(key);
      if (typeof value === "string") {
        const raw = clean(value);
        if (raw.length > 20 && /rapor|bulgu|sonuç|sonuc|açıklama|aciklama|öneri|oneri|değerlendirme|degerlendirme/i.test(keyText)) {
          out.push(value);
        }
      } else if (value && typeof value === "object") {
        deepRadiologyTextCandidates(value, out, depth + 1);
      }
    });
    return out;
  }

  function radiologyReportText(data) {
    const root = data?.data || data || {};
    const candidates = [
      root.raporTextByRapor ||
      root.raporText ||
      root.raporMetni ||
      root.raporHtml ||
      root.rapor ||
      root.bulgu ||
      root.bulgular ||
      root.sonuc ||
      root.sonucAciklama ||
      root.aciklama ||
      "",
      ...deepRadiologyTextCandidates(root)
    ].filter(Boolean);

    for (const candidate of candidates) {
      const text = radiologyTextFromRaw(candidate);
      if (text) return text;
    }
    return "";
  }

  function radiologyIdentity(item = {}) {
    const reportId = clean(item.reportId || item.raporId || "");
    if (reportId) return `rapor:${reportId}`;
    const id = clean(item.id || item.risOrderId || "");
    if (id) return `order:${id}`;
    return `row:${clean(item.date || item.istemTarihi || item.risKabulTarihi || "")}|${clean(item.exam || item.risOrderKodAdi || "")}`;
  }

  function isSameDayMs(t, ref = new Date()) {
    if (!t) return false;
    const d = new Date(t);
    return d.getFullYear() === ref.getFullYear() &&
      d.getMonth() === ref.getMonth() &&
      d.getDate() === ref.getDate();
  }

  function isNewAdmissionAlert(p) {
    const t = parseTrDate(p.yatis);
    if (!t) return false;
    const now = new Date();
    if (!isSameDayMs(t, now)) return false;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0).getTime();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 0, 0).getTime();
    return t >= start && Date.now() <= end;
  }

  function startOfDayMs(t) {
    if (!t) return 0;
    const d = new Date(t);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }

  function dayDiff(fromMs, toMs = Date.now()) {
    const oneDay = 24 * 60 * 60 * 1000;
    return Math.floor((startOfDayMs(toMs) - startOfDayMs(fromMs)) / oneDay);
  }

  function surgeryDateMs(s) {
    return parseTrDate(
      s.startDate ||
      s.baslangicTarihi ||
      s.endDate ||
      s.bitisTarihi ||
      s.requestDate ||
      s.istekTarihi ||
      s.etar ||
      ""
    );
  }

  function operationBadge(p) {
    const list = (p.surgeries || []).filter((s) => surgeryDateMs(s));
    if (!list.length) return "";
    const now = Date.now();
    const admission = parseTrDate(p.yatis);
    const monthAgo = now - 31 * 24 * 60 * 60 * 1000;
    const recent = list.filter((s) => {
      const t = surgeryDateMs(s);
      return t >= monthAgo || (admission && admission < monthAgo && t >= admission);
    });
    const candidates = recent.length ? recent : list;
    const future = candidates
      .filter((s) => startOfDayMs(surgeryDateMs(s)) > startOfDayMs(now))
      .sort((a, b) => surgeryDateMs(a) - surgeryDateMs(b))[0];
    if (future) return "PREOP";

    const past = candidates
      .filter((s) => startOfDayMs(surgeryDateMs(s)) <= startOfDayMs(now))
      .sort((a, b) => surgeryDateMs(b) - surgeryDateMs(a))[0];
    if (!past) return "";
    return `POSTOP-${Math.max(0, dayDiff(surgeryDateMs(past), now))}`;
  }

  function consultKey(c) {
    return [c.id, c.date, c.unit, c.answer].map(clean).join("|");
  }

  function consultIsAnswered(c = {}) {
    return Boolean(cleanMultiline(htmlToText(c.answer || "")));
  }

  function consultAnswerText(raw = {}) {
    return cleanMultiline([
      htmlToText(raw.sonucAciklama || ""),
      htmlToText(raw.sonucAciklama2 || "")
    ].filter(Boolean).join("\n"));
  }

  function recentAnsweredConsults(p, hours = 10) {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    return (p.consults || []).filter((c) => {
      if (!c.answer) return false;
      const t = parseTrDate(c.date);
      return t && t >= cutoff;
    });
  }

  function unseenRecentAnsweredConsults(p) {
    const ack = state.ackConsults[p.key || patientKey(p)] || {};
    return recentAnsweredConsults(p).filter((c) => !ack[consultKey(c)]);
  }

  function acknowledgeConsults(p) {
    const key = p.key || patientKey(p);
    if (!state.ackConsults[key]) state.ackConsults[key] = {};
    recentAnsweredConsults(p).forEach((c) => {
      state.ackConsults[key][consultKey(c)] = Date.now();
    });
  }

  function acknowledgePatientUpdates(p) {
    p.changedAt = 0;
    p.changedLabels = [];
    p.changedText = "";
    p.changedDetail = "";
    p.lastChangeText = "";
    p.lastChangeDetail = "";
  }

  function isTodayTr(date) {
    const t = parseTrDate(date);
    if (!t) return false;
    const now = Date.now();
    return t >= now - 10 * 60 * 60 * 1000 && t <= now + 5 * 60 * 1000;
  }

  function clip(text, max = 70) {
    const s = clean(text);
    return s.length > max ? `${s.slice(0, max - 1).trim()}…` : s;
  }

  function compactDietInfo(diet) {
    const raw = clean(diet);
    if (!raw) return { code: "-", extra: "" };

    const codes = [];
    const extras = [];
    const addUnique = (list, value) => {
      const v = clean(value);
      if (v && !list.some((x) => norm(x) === norm(v))) list.push(v);
    };

    raw.split(/\s*\/\s*|\n+|;+/).map(clean).filter(Boolean).forEach((part) => {
      const n = norm(part);
      if (!n || /^(yok|hayır|hayir|-)$/.test(n)) return;

      let matchedCode = false;
      if (/\br\s*[- ]?\s*a[çc]\b|a[çc]\s*kal|oral\s*yok|\bnpo\b/.test(n)) {
        addUnique(codes, "Raç");
        matchedCode = true;
      }
      if (/\br\s*[- ]?\s*1\b|rejim\s*1/.test(n)) {
        addUnique(codes, "R1");
        matchedCode = true;
      }
      if (/\br\s*[- ]?\s*2\b|rejim\s*2/.test(n)) {
        addUnique(codes, "R2");
        matchedCode = true;
      }
      if (/\br\s*[- ]?\s*3\b|rejim\s*3/.test(n)) {
        addUnique(codes, "R3");
        matchedCode = true;
      }
      if (!matchedCode && /normal|serbest/.test(n)) addUnique(codes, "Normal");

      const extra = part
        .replace(/\bR\s*[- ]?\s*(?:A[ÇC]|[123])\b/gi, " ")
        .replace(/\bRejim\s*[123]\b/gi, " ")
        .replace(/\bD[iıİI]yet[iı]?\b/gi, " ")
        .replace(/\bMen[uü]\b/gi, " ")
        .replace(/\b(Sabah|Öğle|Ogle|Akşam|Aksam|Ara\s*\d?)\b/gi, " ")
        .replace(/[-:()]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (extra && !/^(yok|hayır|hayir|normal|serbest)$/i.test(extra)) addUnique(extras, extra);
    });

    return {
      code: codes.join("/") || clip(extras[0] || raw, 24),
      extra: clip(extras.join(" / "), 85)
    };
  }

  function readPath(obj, path) {
    if (!obj) return "";
    return path.split(".").reduce((acc, key) => acc == null ? undefined : acc[key], obj);
  }

  function searchNorm(text) {
    return norm(text)
      .replace(/ı/g, "i")
      .replace(/ğ/g, "g")
      .replace(/ü/g, "u")
      .replace(/ş/g, "s")
      .replace(/ö/g, "o")
      .replace(/ç/g, "c");
  }

  function primitiveText(value) {
    if (value == null) return "";
    if (typeof value === "string") return clean(htmlToText(value));
    if (typeof value === "number" || typeof value === "boolean") return clean(value);
    return "";
  }

  function formLeaves(obj, path = "", depth = 0, out = []) {
    if (obj == null || depth > 8) return out;
    if (Array.isArray(obj)) {
      obj.forEach((value, index) => formLeaves(value, `${path}.${index}`, depth + 1, out));
      return out;
    }
    if (typeof obj !== "object") {
      const value = primitiveText(obj);
      if (value) out.push({ path, key: path.split(".").pop() || "", value, raw: obj });
      return out;
    }
    Object.entries(obj).forEach(([key, value]) => {
      const next = path ? `${path}.${key}` : key;
      if (value == null) return;
      if (typeof value === "object") formLeaves(value, next, depth + 1, out);
      else {
        const text = primitiveText(value);
        if (text) out.push({ path: next, key, value: text, raw: value });
      }
    });
    return out;
  }

  function formObjectText(obj) {
    return formLeaves(obj)
      .map((x) => x.value)
      .filter(Boolean)
      .join("\n");
  }

  function meaningfulFormValue(value, max = 180) {
    const text = clean(value);
    if (!text) return "";
    const n = searchNorm(text);
    if (/^(true|false|evet|hayir|hayır|var|yok|0|1|-)$/.test(n)) return "";
    return clip(text, max);
  }

  function isCheckedValue(value) {
    if (value === true || value === 1) return true;
    return /^(true|evet|var|1|x|on|checked|secili|seçili|isaretli|işaretli)$/.test(searchNorm(value));
  }

  function bestFormLabel(obj = {}) {
    const keys = ["label", "baslik", "başlık", "soru", "adi", "adı", "ad", "name", "caption", "title", "parametreAdi", "alanAdi", "formElemani.adi", "formElemani.ad"];
    for (const key of keys) {
      const value = primitiveText(readPath(obj, key));
      if (value && value.length <= 120) return value;
    }
    return "";
  }

  function bestFormValue(obj = {}) {
    const keys = ["deger", "değer", "value", "cevap", "aciklama", "açıklama", "text", "sonuc", "sonuç", "girisDegeri", "girişDegeri", "kayitDegeri", "kayıtDegeri", "icerik", "içerik", "skor", "puan"];
    for (const key of keys) {
      const value = primitiveText(readPath(obj, key));
      if (value) return value;
    }
    return "";
  }

  function formLabeledValues(obj, out = [], depth = 0) {
    if (!obj || typeof obj !== "object" || depth > 8) return out;
    if (Array.isArray(obj)) {
      obj.forEach((value) => formLabeledValues(value, out, depth + 1));
      return out;
    }

    const label = bestFormLabel(obj);
    const value = bestFormValue(obj);
    if (label && value && searchNorm(label) !== searchNorm(value)) {
      out.push({ label, value, raw: obj });
    }

    Object.values(obj).forEach((value) => formLabeledValues(value, out, depth + 1));
    return out;
  }

  function firstFormField(root, labelRe, max = 180) {
    const pairs = formLabeledValues(root);
    for (const pair of pairs) {
      if (!labelRe.test(searchNorm(pair.label))) continue;
      const value = meaningfulFormValue(pair.value, max);
      if (value && !labelRe.test(searchNorm(value))) return value;
    }

    const leaves = formLeaves(root);
    for (const leaf of leaves) {
      const hay = searchNorm(`${leaf.path} ${leaf.key}`);
      if (!labelRe.test(hay)) continue;
      const value = meaningfulFormValue(leaf.value, max);
      if (value && !labelRe.test(searchNorm(value))) return value;
    }

    const lines = cleanMultiline(formObjectText(root)).split("\n").map(clean).filter(Boolean);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!labelRe.test(searchNorm(line))) continue;
      const inline = clean(line.replace(/^[^:：-]+[:：-]\s*/, ""));
      if (inline && inline !== line && !labelRe.test(searchNorm(inline))) return clip(inline, max);
      const next = lines[i + 1] || "";
      if (meaningfulFormValue(next, max) && !labelRe.test(searchNorm(next))) return clip(next, max);
    }
    return "";
  }

  function normalizeAsa(value) {
    const raw = clean(value).toLocaleUpperCase("tr-TR");
    const digit = raw.match(/\b([1-5])\b/)?.[1];
    if (digit) return digit;
    const roman = raw.match(/\b(IV|III|II|I|V)\b/)?.[1];
    return ({ I: "1", II: "2", III: "3", IV: "4", V: "5" })[roman] || "";
  }

  function extractAsa(root) {
    const leaves = formLeaves(root);
    for (const leaf of leaves) {
      const hay = searchNorm(`${leaf.path} ${leaf.key} ${leaf.value}`);
      if (!/\basa\b/.test(hay)) continue;
      const value = normalizeAsa(leaf.value) || (isCheckedValue(leaf.raw) ? normalizeAsa(leaf.path) : "");
      if (value) return value;
    }

    const text = formObjectText(root);
    const match = text.match(/\bASA(?:\s*(?:skoru|score|sinifi|sınıfı))?\s*[:：-]?\s*(I{1,3}|IV|V|[1-5])\b/i);
    return normalizeAsa(match?.[1] || "");
  }

  function addUnique(list, value) {
    const v = clean(value);
    if (v && !list.some((x) => searchNorm(x) === searchNorm(v))) list.push(v);
  }

  function extractPostopDestination(root) {
    const out = [];
    const addDest = (text) => {
      const hay = searchNorm(text);
      if (/pacu/.test(hay)) addUnique(out, "PACU");
      if (/\bybu\b|yogun bakim|yoğun bakım/.test(hay)) addUnique(out, "YBÜ");
      if (/\bklinik\b|servis/.test(hay)) addUnique(out, "Klinik");
    };

    const leaves = formLeaves(root);
    leaves.forEach((leaf) => {
      const hay = searchNorm(`${leaf.path} ${leaf.key} ${leaf.value}`);
      if (!/(pacu|\bybu\b|yogun bakim|klinik|servis)/.test(hay)) return;
      if (/fieldinfo|caption|postoperatifsolunum/.test(hay)) return;
      if (isCheckedValue(leaf.raw) || /(postop|ameliyat sonrasi|takip yeri|gidecegi yer|gidecegi birim|gidecegi servis).*(pacu|\bybu\b|yogun bakim|klinik|servis)/.test(hay)) {
        addDest(hay);
      }
    });

    const scanObjects = (obj, depth = 0) => {
      if (!obj || typeof obj !== "object" || depth > 8) return;
      if (Array.isArray(obj)) {
        obj.forEach((value) => scanObjects(value, depth + 1));
        return;
      }
      const label = bestFormLabel(obj);
      const checked = ["secili", "seçili", "checked", "isaretli", "işaretli", "deger", "değer", "value", "cevap"].some((key) => isCheckedValue(readPath(obj, key)));
      if (label && checked) addDest(label);
      Object.values(obj).forEach((value) => scanObjects(value, depth + 1));
    };
    scanObjects(root);

    return out.join("/");
  }

  function extractAnesthesiaInfo(data) {
    const root = data?.data || data || {};
    const knownDiseases = firstFormField(root, /bilinen.*hastalik|ek.*hastalik|yandas.*hastalik|sistemik.*hastalik|ozgecmis|komorbid/, 120);
    const homeMeds = firstFormField(root, /kullandigi.*ilac|kullandığı.*ilaç|ev.*ilac|ilac.*kullanimi|ilaclar/, 120);
    const plannedOperation = firstFormField(root, /planlanan.*ameliyat|yapilacak.*ameliyat|ameliyat.*adi|operasyon.*adi|cerrahi.*islem/, 120);
    const asa = extractAsa(root);
    const destination = extractPostopDestination(root);
    const rawText = clip(cleanMultiline(formObjectText(root)), 1500);
    return {
      asa,
      knownDiseases,
      homeMeds,
      plannedOperation,
      destination,
      rawText
    };
  }

  function findDeepPrimitive(obj, keyRe, depth = 0) {
    if (!obj || typeof obj !== "object" || depth > 8) return "";
    if (Array.isArray(obj)) {
      for (const value of obj) {
        const found = findDeepPrimitive(value, keyRe, depth + 1);
        if (found) return found;
      }
      return "";
    }
    for (const [key, value] of Object.entries(obj)) {
      if (keyRe.test(searchNorm(key)) && (typeof value === "string" || typeof value === "number")) return clean(value);
      const found = findDeepPrimitive(value, keyRe, depth + 1);
      if (found) return found;
    }
    return "";
  }

  function findPatientForAnesthesiaData(data, info = {}) {
    const root = data?.data || data || {};
    const ids = inferIdsFromData(root);
    const birimSevkId = ids.birimSevkId || findDeepPrimitive(root, /birim.*sevk.*id|hastabirimsevkid/);
    const hastaGelisId = ids.hastaGelisId || findDeepPrimitive(root, /hasta.*gelis.*id|hastagelisid|gelisid/);
    const hastaId = ids.hastaId || findDeepPrimitive(root, /^hastaid$|hasta.*id/);

    const byId = state.patients.find((p) =>
      (birimSevkId && clean(p.birimSevkId) === clean(birimSevkId)) ||
      (hastaGelisId && clean(p.hastaGelisId) === clean(hastaGelisId)) ||
      (hastaId && clean(p.hastaId) === clean(hastaId))
    );
    if (byId) return byId;

    const hay = searchNorm(`${formObjectText(root)} ${info.rawText || ""}`);
    return state.patients.find((p) => p.adSoyad && hay.includes(searchNorm(p.adSoyad))) || null;
  }

  function applyAnesthesiaInfo(p, info = {}) {
    p.anesthesia = { ...(p.anesthesia || {}), ...info, capturedAt: new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) };
    if (info.asa) p.asa = info.asa;
    if (info.knownDiseases) p.knownDiseases = info.knownDiseases;
    if (info.homeMeds) p.homeMeds = info.homeMeds;
    if (info.plannedOperation) p.plannedOperation = info.plannedOperation;
    if (info.destination) p.postopPlace = info.destination;
  }

  function extractDietInfo(root = {}) {
    const parts = [];
    const add = (value) => {
      const v = clean(typeof value === "object" ? value?.adi || value?.aciklama || "" : value);
      if (v && !parts.some((x) => norm(x) === norm(v))) parts.push(v);
    };

    [
      "diyet",
      "diyet.adi",
      "diyet.aciklama",
      "sabahDiyetMenu.adi",
      "ogleDiyetMenu.adi",
      "aksamDiyetMenu.adi",
      "ara1DiyetMenu.adi",
      "ara2DiyetMenu.adi",
      "araOgunDiyetMenu.adi",
      "diyetOzellikAciklama",
      "diyetAciklama",
      "klinik.diyet.adi",
      "birimSevk.diyet.adi",
      "hastaBirimSevk.diyet.adi"
    ].forEach((path) => add(readPath(root, path)));

    Object.entries(root || {}).forEach(([key, value]) => {
      if (/diyet/i.test(key)) add(value);
    });

    const dietId =
      readPath(root, "diyet.id") ||
      readPath(root, "sabahDiyetMenu.id") ||
      readPath(root, "ogleDiyetMenu.id") ||
      readPath(root, "aksamDiyetMenu.id") ||
      readPath(root, "ara1DiyetMenu.id") ||
      readPath(root, "ara2DiyetMenu.id");

    const uzmanlikKodu =
      readPath(root, "birimSevk.personel.uzmanlik.kodu") ||
      readPath(root, "birimSevk.birim.uzmanlikKodu") ||
      readPath(root, "birim.uzmanlikKodu") ||
      readPath(root, "personel.uzmanlik.kodu");

    return {
      text: parts.join(" / "),
      dietId: clean(dietId),
      uzmanlikKodu: clean(uzmanlikKodu)
    };
  }

  function setDietInfo(p, root) {
    const info = extractDietInfo(root);
    if (info.text) p.diyet = info.text;
    if (info.dietId) p.diyetId = info.dietId;
    if (info.uzmanlikKodu) p.uzmanlikKodu = info.uzmanlikKodu;
  }

  function extractAllergyInfo(root = {}) {
    const parts = [];
    const add = (value) => {
      const v = clean(typeof value === "object" ? value?.adi || value?.aciklama || value?.alerji || "" : value);
      if (v && !/^(yok|hayır|hayir|-)$/.test(norm(v)) && !parts.some((x) => norm(x) === norm(v))) parts.push(v);
    };
    [
      "alerji",
      "alerjiBilgisi",
      "alerjiAciklama",
      "hastaAlerji",
      "hastaAlerji.aciklama",
      "hastaGelis.alerji",
      "hasta.alerji"
    ].forEach((path) => add(readPath(root, path)));
    ["hastaAlerjiList", "alerjiList", "hastaAlerjileri"].forEach((path) => {
      const list = readPath(root, path);
      if (Array.isArray(list)) list.forEach(add);
    });
    return parts.join(", ");
  }

  function sexShort(value) {
    const n = norm(value);
    if (/kadın|kadin|bayan|female|\bk\b/.test(n)) return "K";
    if (/erkek|male|\be\b/.test(n)) return "E";
    return "";
  }

  function normalizeLabName(name) {
    const s = clean(name);
    const n = s.toLocaleLowerCase("tr-TR");
    if (/^wbc$/i.test(s) || /lökosit|lokosit|leukocyte|leucocyte/i.test(n)) return "WBC";
    if (/^hgb$/i.test(s) || /^hb$/i.test(s) || /hemoglobin/i.test(n)) return "Hb";
    if (/^plt$/i.test(s) || /trombosit/i.test(n)) return "PLT";
    if (/kreatinin/i.test(n)) return "Kre";
    if (/albümin|albumin/i.test(n)) return "Alb";
    if (/^ast$/i.test(s) || /aspartat/i.test(n)) return "AST";
    if (/^alt$/i.test(s) || /alanin/i.test(n)) return "ALT";
    if (/^alp$/i.test(s) || /alkalen/i.test(n)) return "ALP";
    if (/^ggt$/i.test(s) || /gamma/i.test(n)) return "GGT";
    if (/bilirubin.*total|total.*bilirubin/i.test(n)) return "Tbil";
    if (/bilirubin.*direkt|direkt.*bilirubin/i.test(n)) return "Dbil";
    if (/sodyum|sodium|^na$/i.test(n)) return "Na";
    if (/potasyum|potassium|^k$/i.test(n)) return "K";
    if (/fosfor|phosphorus|phosphate|inorganik fosfor|^phos$/i.test(n)) return "P";
    if (/düzeltilmiş\s*kalsiyum|duzeltilmis\s*kalsiyum|corrected\s*calcium/i.test(n)) return "";
    if (/kalsiyum|calcium|^ca$/i.test(n)) return "Ca";
    if (/magnezyum|magnesium|^mg$/i.test(n)) return "Mg";
    if (/crp|c-reaktif/i.test(n)) return "CRP";
    if (/prokalsitonin|procalcitonin/i.test(n)) return "PCT";
    if (/amilaz/i.test(n)) return "Amilaz";
    if (/lipaz/i.test(n)) return "Lipaz";
    if (/^glu$/i.test(s) || /glukoz|glikoz|glucose|glisemi|gluko\s*test|glukometre|parmak\s*ucu|kan şekeri|kan sekeri|açlık şekeri|aclik sekeri/i.test(n)) return "Glu";
    return "";
  }

  function summarizeLabs(details) {
    const wanted = {};
    const glucoseChecks = [];
    const labSourceText = (row) => clean([
      row?.tupAdi,
      row?.grupAdi,
      row?.tetkikAdi,
      row?.ornekTuru,
      row?.materyalAdi,
      row?.lisHastaTupTetkik?.tupAdi,
      row?.lisHastaTupTetkik?.lisHastaTup?.tupAdi,
      row?.lisHastaTupTetkik?.lisHastaTup?.lisTup?.adi,
      row?.lisHastaTupTetkik?.lisHastaTup?.ornekTuru,
      row?.lisHastaTupTetkik?.lisHastaTup?.ornekTuru?.adi,
      row?.lisHastaTupTetkik?.lisHastaTup?.materyalAdi,
      row?.lisHastaTupTetkik?.lisHastaTup?.materyal?.adi,
      row?.lisHastaTup?.tupAdi,
      row?.lisHastaTupTetkik?.tetkik?.adi,
      row?.tetkik?.adi
    ].filter(Boolean).join(" "));
    const isBloodGas = (source) => /kan\s*gaz|kangaz|blood\s*gas|arter.*gaz|ven[oö]z.*gaz|\bakg\b|\babg\b|\bvbg\b/.test(searchNorm(source));
    const isPointOfCare = (source) => /glukometre|parmak\s*ucu|hbtc|poct|point\s*of\s*care|gluko\s*test|strip\s*glukoz/.test(searchNorm(source));
    const isUrine = (source) => /idrar|urine|uriner|sediment|strip|tam\s*idrar|mikroskopi/.test(searchNorm(source));
    const isCulture = (source) => /kultur|kültür|mikrobiyoloji|antibiyogram/.test(searchNorm(source));
    const isHemogram = (source) => /hemogram|tam\s*kan|kan\s*say|cbc|mor\s*kapak|edta/.test(searchNorm(source));
    const numericResult = (value) => {
      const text = clean(value);
      const match = text.match(/^[<>]?\s*[+-]?\d+(?:[,.]\d+)?(?:\s*(?:H|L|\*)){0,2}$/i);
      if (!match) return "";
      return clean(text.replace(/\s*(?:H|L|\*)+\s*$/i, ""));
    };
    const isPrimaryLab = (key, source) => {
      if (key === "Glu") return false;
      return !(isBloodGas(source) || isPointOfCare(source) || isUrine(source) || isCulture(source));
    };
    const add = (key, value, date, source = "", historical = false) => {
      if (!key || value == null || value === "") return;
      const numericValue = numericResult(value);
      if (!numericValue) return;
      if (key === "Glu" && isPointOfCare(source)) {
        const item = {
          value: numericValue,
          date: date || "",
          sortKey: dateTimeKey(date),
          source,
          historical
        };
        const exists = glucoseChecks.some((x) => x.value === item.value && x.date === item.date);
        if (!exists) glucoseChecks.push(item);
        return;
      }
      if (!wanted[key]) wanted[key] = [];
      const item = {
        value: numericValue,
        date: date || "",
        sortKey: dateTimeKey(date),
        source,
        bloodGas: isBloodGas(source),
        pointOfCare: isPointOfCare(source),
        urine: isUrine(source),
        culture: isCulture(source),
        primaryLab: isPrimaryLab(key, source),
        historical
      };
      const exists = wanted[key].some((x) => x.value === item.value && x.date === item.date);
      if (!exists) wanted[key].push(item);
    };

    for (const row of details || []) {
      const test = row?.lisHastaTupTetkik?.tetkik?.adi || row?.tetkik?.adi || "";
      const key = normalizeLabName(test);
      if (!key) continue;
      const value = row?.lisHastaTupTetkik?.sonucByRapor || row?.sonucByRapor || row?.sonuc || "";
      const date = row?.lisHastaTupTetkik?.sonucTarihi || row?.lisHastaTupTetkik?.onayTarihi || "";
      const source = labSourceText(row);
      add(key, value, date, source);

      for (const old of row?.oncekiSonucList || []) {
        const oldTest = old?.lisHastaTupTetkik?.tetkik?.adi || old?.tetkik?.adi || old?.tetkikAdi || old?.parametreAdi || test;
        const oldKey = normalizeLabName(oldTest) || key;
        const oldSource = labSourceText(old) || source;
        add(oldKey, old.sonuc, old.sonucTarihi || old.onayTarihi || "", oldSource, true);
      }
    }

    Object.keys(wanted).forEach((key) => {
      wanted[key].sort((a, b) => String(b.sortKey || "").localeCompare(String(a.sortKey || "")));
      wanted[key] = wanted[key].slice(0, 8);
    });

    if (wanted.WBC?.length) {
      const companions = [...(wanted.Hb || []), ...(wanted.PLT || [])];
      const sameMoment = (item) => {
        const itemKey = item.sortKey || dateTimeKey(item.date);
        if (!itemKey) return false;
        return companions.some((other) => (other.sortKey || dateTimeKey(other.date)) === itemKey);
      };
      const cleanWbc = wanted.WBC.filter((item) =>
        item.primaryLab &&
        !item.urine &&
        !item.culture &&
        !item.bloodGas &&
        !item.pointOfCare &&
        (isHemogram(item.source) || sameMoment(item))
      );
      wanted.WBC = (cleanWbc.length ? cleanWbc : wanted.WBC.filter((item) =>
        item.primaryLab && !item.urine && !item.culture && !item.bloodGas && !item.pointOfCare
      )).slice(0, 8);
    }

    glucoseChecks.sort((a, b) => String(b.sortKey || "").localeCompare(String(a.sortKey || "")));
    return { labs: wanted, glucoseChecks: glucoseChecks.slice(0, 12) };
  }

  function labLine(labs) {
    const val = (k) => (labs?.[k] || []).slice(0, 3).map((x) => x.value).join("/");
    const pair = (a, b) => {
      const x = labs?.[a] || [];
      const y = labs?.[b] || [];
      return Array.from({ length: Math.max(x.length, y.length) }).slice(0, 3)
        .map((_, i) => [x[i]?.value, y[i]?.value].filter(Boolean).join("-"))
        .filter(Boolean)
        .join("/");
    };
    return [
      `WBC:${val("WBC")}`,
      `Hb:${val("Hb")}`,
      `Kre:${val("Kre")}`,
      `CRP:${val("CRP")}`,
      `PCT:${val("PCT")}`,
      `Glu:${val("Glu")}`,
      `Na-K:${pair("Na", "K")}`,
      `P-Ca-Mg:${[val("P"), val("Ca"), val("Mg")].filter(Boolean).join("-")}`,
      `AST-ALT:${pair("AST", "ALT")}`,
      `ALP-GGT:${pair("ALP", "GGT")}`,
      `Tbil-Dbil:${pair("Tbil", "Dbil")}`
    ].join(" | ");
  }

  function relevantLabDate(labs) {
    const keys = ["WBC", "Hb", "PLT", "Kre", "Alb", "AST", "ALT", "ALP", "GGT", "Tbil", "Dbil", "CRP", "PCT", "Amilaz", "Lipaz", "Na", "K", "P", "Ca", "Mg"];
    const latest = keys
      .flatMap((key) => labs?.[key] || [])
      .filter((x) => x?.date)
      .filter((x) => x.primaryLab)
      .sort((a, b) => String(b.sortKey || dateTimeKey(b.date)).localeCompare(String(a.sortKey || dateTimeKey(a.date))))[0];
    return shortDate(latest?.date || "");
  }

  function labSeries(labs, key, max = 6) {
    return (labs?.[key] || []).slice(0, max).map((x) => x.value).join("/");
  }

  function pairLabSeries(labs, a, b, max = 6) {
    const x = labs?.[a] || [];
    const y = labs?.[b] || [];
    return Array.from({ length: Math.max(x.length, y.length) }).slice(0, max)
      .map((_, i) => {
        const left = x[i]?.value || "";
        const right = y[i]?.value || "";
        return left && right ? `${left}-${right}` : (left || right);
      })
      .filter(Boolean)
      .join("/");
  }

  const VISIT_LAB_ROWS = [
    "WBC", "Hb", "PLT", "Kre", "Alb", "AST", "ALT", "ALP", "GGT",
    "Tbil", "Dbil", "Glu", "Amilaz", "Lipaz",
    "CRP", "PCT"
  ];

  const VISIT_LAB_LABELS = {
    WBC: "WBC",
    Hb: "Hb",
    PLT: "PLT",
    Kre: "Kre",
    Alb: "Alb",
    AST: "AST",
    ALT: "ALT",
    ALP: "ALP",
    GGT: "GGT",
    Tbil: "T.Bil",
    Dbil: "D.Bil",
    Glu: "Glu",
    Na: "Na",
    K: "K",
    P: "P",
    Ca: "Ca",
    Mg: "Mg",
    Amilaz: "Ami",
    Lipaz: "Lip",
    CRP: "CRP",
    PCT: "PCT"
  };

  const LAB_NORMAL_RANGES = {
    WBC: [4, 10.5],
    Hb: [12, 17.5],
    PLT: [150, 450],
    Kre: [0.5, 1.3],
    Alb: [3.5, 5.2],
    AST: [0, 40],
    ALT: [0, 41],
    ALP: [30, 120],
    GGT: [0, 60],
    Tbil: [0, 1.2],
    Dbil: [0, 0.3],
    Glu: [70, 180],
    Na: [135, 145],
    K: [3.5, 5.1],
    P: [2.5, 4.5],
    Ca: [8.5, 10.5],
    Mg: [1.6, 2.6],
    Amilaz: [0, 100],
    Lipaz: [0, 60],
    CRP: [0, 5],
    PCT: [0, 0.5]
  };

  function labNumericValue(value) {
    const match = String(value || "").replace(",", ".").match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : NaN;
  }

  function abnormalLabValue(key, value) {
    const range = LAB_NORMAL_RANGES[key];
    const n = labNumericValue(value);
    if (!range || !Number.isFinite(n)) return false;
    return n < range[0] || n > range[1];
  }

  function labVisitDates(labs = {}, max = 8) {
    const byDay = new Map();
    VISIT_LAB_ROWS.forEach((key) => {
      (labs?.[key] || []).forEach((item) => {
        const label = shortDate(item.date || "");
        const sortKey = item.sortKey || dateTimeKey(item.date || "");
        if (!label || !sortKey) return;
        const old = byDay.get(label);
        if (!old || String(sortKey).localeCompare(String(old.sortKey || "")) > 0) {
          byDay.set(label, { label, sortKey });
        }
      });
    });
    return Array.from(byDay.values())
      .sort((a, b) => String(b.sortKey || "").localeCompare(String(a.sortKey || "")))
      .slice(0, max);
  }

  function labValueForDate(labs = {}, key, dateLabel) {
    const items = (labs?.[key] || [])
      .filter((item) => shortDate(item.date || "") === dateLabel)
      .sort((a, b) => String(b.sortKey || dateTimeKey(b.date || "")).localeCompare(String(a.sortKey || dateTimeKey(a.date || ""))));
    return items[0]?.value || "";
  }

  function padVisitCell(text, width) {
    const s = String(text || "");
    return s.length >= width ? s : s + " ".repeat(width - s.length);
  }

  function visitLabCellText(key, raw) {
    if (!raw) return "X";
    return String(raw);
  }

  function visitLabCellHtml(key, raw) {
    if (!raw) return "X";
    const value = escapeHtml(raw);
    return abnormalLabValue(key, raw) ? `<strong>${value}</strong>` : value;
  }

  function visitLabTableText(labs = {}, vitalLine = "") {
    const dates = labVisitDates(labs, 8);
    if (!dates.length) return vitalLine ? ["Tetkik\tSon", `Son Vital\t${vitalLine}`].join("\n") : "Lab: -";
    const header = ["Tetkik", ...dates.map((d) => d.label)].join("\t");
    const rows = VISIT_LAB_ROWS.map((key) => {
      const cells = dates.map((d) => {
        const raw = labValueForDate(labs, key, d.label);
        return visitLabCellText(key, raw);
      });
      return [VISIT_LAB_LABELS[key] || key, ...cells].join("\t");
    });
    rows.push(["Elekt", latestElectrolyteText(labs), ...dates.slice(1).map(() => "")].join("\t"));
    if (vitalLine) rows.push(["Son Vital", vitalLine, ...dates.slice(1).map(() => "")].join("\t"));
    return [header, ...rows].join("\n");
  }

  function compactLabVitalsText(labs = {}, vitalLine = "") {
    const dates = labVisitDates(labs, 8);
    const max = 8;
    const rows = [
      `Lab :${dates[0]?.label || ""}`,
      `wbc:${labSeries(labs, "WBC", max) || "-"}`,
      `hb:${labSeries(labs, "Hb", max) || "-"}`,
      `kre:${labSeries(labs, "Kre", max) || "-"}`,
      `alb:${labSeries(labs, "Alb", max) || "-"}`,
      `AST-ALT:${pairLabSeries(labs, "AST", "ALT", max) || "-"}`,
      `ALP-GGT:${pairLabSeries(labs, "ALP", "GGT", max) || "-"}`,
      `Tbil-Dbil:${pairLabSeries(labs, "Tbil", "Dbil", max) || "-"}`,
      `CRP:${labSeries(labs, "CRP", max) || "-"}`,
      `Pc:${labSeries(labs, "PCT", max) || "-"}`,
      `Glu:${labSeries(labs, "Glu", max) || "-"}`,
      `Elekt:${latestElectrolyteText(labs)}`,
      `amilaz-lipaz:${pairLabSeries(labs, "Amilaz", "Lipaz", max) || "-"}`,
      `Vital:${vitalLine || "-"}`
    ];
    return rows.join("\n");
  }

  function latestElectrolyteText(labs = {}) {
    const keys = ["Na", "K", "P", "Ca", "Mg"];
    const parts = keys.map((key) => {
      const item = (labs?.[key] || [])[0] || {};
      return `${key}:${item.value || "X"}`;
    });
    return parts.join(" ");
  }

  function visitLabTableHtml(labs = {}, vitalLine = "") {
    const dates = labVisitDates(labs, 8);
    const tableStyle = "border-collapse:collapse;font-family:Arial Narrow,Arial,sans-serif;font-size:6.5pt;line-height:1.05;table-layout:fixed;width:270pt;";
    const thStyle = "text-align:center;font-weight:bold;padding:1px 2px;border:1px solid #d9dee6;white-space:nowrap;";
    const firstThStyle = "text-align:left;font-weight:bold;padding:1px 2px;border:1px solid #d9dee6;white-space:nowrap;width:34pt;";
    const tdStyle = "text-align:center;padding:1px 2px;border:1px solid #e5e7eb;vertical-align:middle;white-space:nowrap;";
    const firstTdStyle = "text-align:left;padding:1px 2px;border:1px solid #e5e7eb;vertical-align:middle;white-space:nowrap;font-weight:bold;width:34pt;";
    if (!dates.length) {
      return vitalLine
        ? `<table style="${tableStyle}"><thead><tr><th style="${firstThStyle}">Tetkik</th><th style="${thStyle}">Son</th></tr></thead><tbody><tr><td style="${firstTdStyle}"><strong>Vital</strong></td><td style="${tdStyle}">${escapeHtml(vitalLine)}</td></tr></tbody></table>`
        : `<p>Lab: -</p>`;
    }
    const header = [`<th style="${firstThStyle}">Tetkik</th>`, ...dates.map((d) => `<th style="${thStyle}">${escapeHtml(d.label)}</th>`)].join("");
    const rows = VISIT_LAB_ROWS.map((key) => {
      const cells = dates.map((d) => {
        const raw = labValueForDate(labs, key, d.label);
        return `<td style="${tdStyle}">${visitLabCellHtml(key, raw)}</td>`;
      }).join("");
      return `<tr><td style="${firstTdStyle}">${escapeHtml(VISIT_LAB_LABELS[key] || key)}</td>${cells}</tr>`;
    }).join("")
      + `<tr><td style="${firstTdStyle}"><strong>Elekt</strong></td><td style="${tdStyle};text-align:left;" colspan="${Math.max(1, dates.length)}">${escapeHtml(latestElectrolyteText(labs))}</td></tr>`
      + (vitalLine ? `<tr><td style="${firstTdStyle}"><strong>Vital</strong></td><td style="${tdStyle};text-align:left;" colspan="${Math.max(1, dates.length)}">${escapeHtml(vitalLine)}</td></tr>` : "");
    return `
      <table style="${tableStyle}">
        <thead><tr>${header}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function latestVitalLine(vitals = [], p = null) {
    const v = (vitals || [])[0] || {};
    const ta = [v.sys, v.dia].filter(Boolean).join("/");
    const freeText = p ? patientFreeText(p) : "";
    const parts = [
      shortDate(v.date) || "",
      ta ? `TA:${ta}` : "",
      v.pulse ? `N:${v.pulse}` : "",
      v.temp ? `A:${v.temp}` : "",
      v.spo2 ? `SpO2:${v.spo2}` : "",
      (v.resp || extractInlineValue(freeText, [/\bSS\s*[:\-]?\s*(\d+)/i, /solunum\s*[:\-]?\s*(\d+)/i])) ? `SS:${v.resp || extractInlineValue(freeText, [/\bSS\s*[:\-]?\s*(\d+)/i, /solunum\s*[:\-]?\s*(\d+)/i])}` : "",
      (v.pain || extractInlineValue(freeText, [/ağr[ıi]\s*[:\-]?\s*(\d+\s*\/\s*10|\d+)/i, /\bVAS\s*[:\-]?\s*(\d+\s*\/\s*10|\d+)/i])) ? `Agr:${v.pain || extractInlineValue(freeText, [/ağr[ıi]\s*[:\-]?\s*(\d+\s*\/\s*10|\d+)/i, /\bVAS\s*[:\-]?\s*(\d+\s*\/\s*10|\d+)/i])}` : ""
    ].filter(Boolean);
    return parts.length ? parts.join(" ") : "-";
  }

  function formatRadiology(radiology = [], max = 6, textLimit = 220) {
    return (radiology || []).slice(0, max).map((x) => {
      const report = clip(cleanReportText(x.reportText || ""), textLimit);
      return `(${shortDate(x.date) || "-"}) ${x.exam || "Radyoloji"}${report ? ":\n" + report : (x.reportId ? " [rapor var]" : "")}`;
    }).join("\n---\n");
  }

  function doctorInitials(name) {
    const cleaned = clean(String(name || "")
      .split(/[;,/]/)[0]
      .replace(/\b(?:Dr|Doktor|Uzm|Uzman|Op|Operatör|Operator|Prof|Doç|Doc|Yrd)\.?\b/gi, " ")
      .replace(/\s+/g, " "));
    const initials = cleaned
      .split(/\s+/)
      .map((part) => part.match(/[A-Za-zÇĞİÖŞÜçğıöşü]/)?.[0] || "")
      .filter(Boolean)
      .map((x) => x.toLocaleUpperCase("tr-TR"))
      .join("");
    return initials || "DR";
  }

  function patientFreeText(p) {
    return [
      p.tani,
      p.clinical,
      p.knownDiseases,
      p.homeMeds,
      p.plannedOperation,
      p.postopPlace,
      p.anesthesia?.rawText,
      ...(p.nursing || []).map((x) => x.text),
      ...(p.consults || []).map((x) => [x.request, x.answer].filter(Boolean).join(" ")),
      ...(p.radiology || []).map((x) => [x.exam, x.reportText].filter(Boolean).join(" "))
    ].filter(Boolean).join("\n");
  }

  function extractKnownDiseases(p) {
    const direct = clean(p.knownDiseases || p.anesthesia?.knownDiseases || "");
    if (direct) return clip(direct, 80);

    const text = patientFreeText(p);
    const found = [];
    const map = [
      ["DM", /\bDM\b|diabetes|diyabet/i],
      ["HT", /\bHT\b|hipertansiyon/i],
      ["KAH", /\bKAH\b|koroner/i],
      ["KKY", /\bKKY\b|kalp yetmez/i],
      ["KOAH", /\bKOAH\b/i],
      ["ASTIM", /ast[ıi]m/i],
      ["KBY", /\bKBY\b|kronik b[öo]brek/i],
      ["AF", /\bAF\b|atriyal fibrilasyon/i],
      ["SVO", /\bSVO\b|inme|serebrovask/i],
      ["CA", /\bCA\b|malignite|kanser/i]
    ];
    map.forEach(([label, re]) => {
      if (re.test(text) && !found.includes(label)) found.push(label);
    });
    return found.join(", ");
  }

  function extractInlineValue(text, patterns) {
    for (const re of patterns) {
      const match = String(text || "").match(re);
      if (match?.[1]) return clean(match[1]).replace(/[.;,]$/, "");
    }
    return "";
  }

  function extractCardMeta(p) {
    const text = patientFreeText(p);
    const anesthesia = p.anesthesia || {};
    const orders = (p.orders || []).slice(0, 8).map((x) => clean(`${x.name || ""} ${x.dose || ""}`)).filter(Boolean);
    const asa = p.asa || anesthesia.asa || extractInlineValue(text, [/\bASA\s*[:\-]?\s*([1-5])/i]);
    const allergy = p.alerji || extractInlineValue(text, [/alerji(?:si)?\s*[:\-]?\s*([^\n.;]+)/i]);
    const ki = p.homeMeds || anesthesia.homeMeds || extractInlineValue(text, [
      /K[İI]\s*[:\-]\s*([^\n]+)/i,
      /kullandığı ilaç(?:lar)?\s*[:\-]\s*([^\n]+)/i,
      /ev ilaç(?:ları)?\s*[:\-]\s*([^\n]+)/i
    ]);
    const go =
      p.plannedOperation ||
      anesthesia.plannedOperation ||
      extractInlineValue(text, [/G[ÖO]\s*[:\-]\s*([^\n]+)/i, /ameliyat\s*[:\-]\s*([^\n]+)/i, /operasyon\s*[:\-]\s*([^\n]+)/i]) ||
      (text.match(/kolesistektomi|apendektomi|ileostomi|kolostomi|laparotomi|debridman|ERCP|stent|rezeksiyon/i)?.[0] || "");
    const destination = p.postopPlace || anesthesia.destination || "";
    const plan =
      extractInlineValue(text, [/plan\s*[:\-]\s*([^\n]+)/i, /karar\s*[:\-]\s*([^\n]+)/i]) ||
      clean((p.clinical || "").split("\n").find((x) => /plan|öner|devam|taburcu|operasyon|ameliyat|ERCP|MRCP/i.test(x)) || "") ||
      clean((p.nursing || [])[0]?.text || "").split("\n").slice(0, 2).join(" ");
    return {
      bh: extractKnownDiseases(p),
      ki: clip(ki || orders.slice(0, 3).join(", "), 80),
      go: clip(go, 80),
      allergy: allergy && !/^(yok|hayır|hayir|-)/i.test(allergy) ? clip(allergy, 50) : "",
      asa,
      destination,
      plan: clip(plan, 170)
    };
  }

  function extractFollowItems(p) {
    const text = patientFreeText(p);
    const item = (label, patterns, fallback = "") => {
      const value = extractInlineValue(text, patterns) || fallback;
      return value ? { label, value: clip(value, 28) } : null;
    };
    return [
      item("Oral", [/oral\s*[:\-]?\s*([+\-]|var|yok|a[çc][ıi]k|kapal[ıi])/i]),
      item("Bulantı/Kusma", [/(?:bulant[ıi]|kusma)\s*[:\-]?\s*([+\-]|var|yok)/i]),
      item("Gaz", [/gaz\s*[:\-]?\s*([+\-]|var|yok|ç[ıi]kt[ıi])/i]),
      item("Gaita", [/gaita\s*[:\-]?\s*([+\-]|var|yok|ç[ıi]kt[ıi])/i]),
      item("İdrar", [/[iı]drar\s*[:\-]?\s*([^\n.;,]+)/i]),
      item("Dren", [/dren\s*[:\-]?\s*([^\n.;,]+)/i]),
      item("Mobilizasyon", [/mobilizasyon\s*[:\-]?\s*([+\-]|var|yok|mobil)/i])
    ].filter(Boolean);
  }

  function latestValue(list, key = "value") {
    return list?.[0]?.[key] || "";
  }

  function latestGlucoseCheck(p = {}) {
    return p.glucoseChecks?.[0] || {};
  }

  function glucoseCheckText(p = {}, max = 6) {
    return (p.glucoseChecks || []).slice(0, max).map((item) =>
      `${item.value || "-"} mg/dL${item.date ? " | " + item.date : ""}`
    ).join("\n");
  }

  function glucoseCheckHtml(p = {}, t = null) {
    const item = latestGlucoseCheck(p);
    if (!item.value) return "";
    const border = t?.accent || "#f59e0b";
    const bg = t?.surface || "#fff";
    const text = t?.text || "#0f172a";
    const label = t?.primary2 || "#92400e";
    return `
      <div style="display:grid;grid-template-columns:auto 1fr auto;gap:7px;align-items:center;border:1px solid ${border};border-radius:9px;background:${bg};padding:6px 8px;margin-top:7px;color:${text};">
        <div style="width:25px;height:25px;border-radius:7px;background:${border};color:#111827;display:grid;place-items:center;font-size:11px;font-weight:950;">G</div>
        <div style="font-size:11px;font-weight:900;color:${label};">Glukotest</div>
        <div style="text-align:right;">
          <b style="font-size:17px;">${escapeHtml(item.value)} mg/dL</b>
          <div style="font-size:10px;opacity:.72;">${escapeHtml(item.date || "")}</div>
        </div>
      </div>
    `;
  }

  function trendMark(list) {
    const current = Number(String(list?.[0]?.value || "").replace(",", "."));
    const previous = Number(String(list?.[1]?.value || "").replace(",", "."));
    if (!Number.isFinite(current) || !Number.isFinite(previous) || current === previous) return "";
    return current > previous ? "↑" : "↓";
  }

  function labTileHtml(label, value, trend = "", danger = false) {
    if (!value) value = "-";
    const color = danger || trend ? "#dc2626" : "#0f172a";
    return `
      <div style="border:1px solid #dbe3ee;border-radius:7px;background:#fff;padding:4px 5px;text-align:center;min-width:0;box-shadow:0 1px 2px rgba(15,23,42,.04);">
        <div style="font-size:10px;color:#0b3f91;font-weight:700;">${escapeHtml(label)}</div>
        <div style="font-size:13px;font-weight:800;color:${color};line-height:1.12;">${escapeHtml(String(value))}${trend ? ` <span>${escapeHtml(trend)}</span>` : ""}</div>
      </div>
    `;
  }

  function labTilesHtml(labs) {
    const one = (key, label, dangerFn = () => false) => {
      const list = labs?.[key] || [];
      const value = latestValue(list);
      return labTileHtml(label, value, trendMark(list), dangerFn(Number(String(value).replace(",", "."))));
    };
    const pair = (a, b, label, dangerFn = () => false) => {
      const av = latestValue(labs?.[a] || []);
      const bv = latestValue(labs?.[b] || []);
      const value = av || bv ? [av || "-", bv || "-"].join("/") : "";
      return labTileHtml(label, value, "", dangerFn(Number(String(av).replace(",", ".")), Number(String(bv).replace(",", "."))));
    };
    return [
      one("WBC", "WBC"),
      one("Hb", "Hb", (v) => v && v < 12),
      one("PLT", "Plt"),
      one("Kre", "Kre", (v) => v && v > 1.3),
      one("CRP", "CRP", (v) => v && v > 5),
      one("PCT", "PCT", (v) => v && v > 0.5),
      one("Glu", "Glu", (v) => v && (v < 70 || v > 180)),
      one("Na", "Na", (v) => v && (v < 135 || v > 145)),
      one("K", "K", (v) => v && (v < 3.5 || v > 5.2)),
      one("P", "P", (v) => v && (v < 2.5 || v > 4.5)),
      one("Ca", "Ca", (v) => v && (v < 8.5 || v > 10.5)),
      one("Mg", "Mg", (v) => v && (v < 1.6 || v > 2.6)),
      pair("AST", "ALT", "AST/ALT", (a, b) => a > 40 || b > 40),
      pair("ALP", "GGT", "ALP/GGT", (a, b) => a > 130 || b > 60),
      pair("Tbil", "Dbil", "Tbil/Dbil", (a, b) => a > 1.2 || b > 0.3)
    ].join("");
  }

  function vitalTileHtml(label, value, sub = "") {
    return `
      <div style="border:1px solid #dbe3ee;border-radius:10px;background:#fff;padding:7px 8px;text-align:center;min-width:74px;box-shadow:0 1px 2px rgba(15,23,42,.04);">
        <div style="font-size:11px;color:#0b3f91;font-weight:800;">${escapeHtml(label)}</div>
        ${sub ? `<div style="font-size:11px;color:#64748b;margin-top:2px;">${escapeHtml(sub)}</div>` : ""}
        <div style="font-size:18px;line-height:1.1;font-weight:800;color:#111827;margin-top:4px;">${escapeHtml(value || "-")}</div>
      </div>
    `;
  }

  function iconTile(label, value, icon, color = "#0b3f91") {
    return `
      <div style="display:grid;grid-template-columns:22px 1fr;align-items:center;gap:5px;border:1px solid #bfdbfe;border-radius:9px;background:#eff6ff;padding:5px 6px;min-width:0;box-shadow:0 1px 2px rgba(15,23,42,.05);">
        <div style="width:22px;height:22px;border-radius:7px;background:${color};color:white;display:grid;place-items:center;font-size:9px;font-weight:900;line-height:1;">${escapeHtml(icon)}</div>
        <div style="min-width:0;">
          <div style="font-size:9px;color:#1e3a8a;font-weight:800;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(label)}</div>
          <div style="font-size:20px;color:#0f172a;font-weight:900;line-height:1.05;margin-top:1px;">${escapeHtml(value || "-")}</div>
        </div>
      </div>
    `;
  }

  function summaryRowHtml(icon, label, text) {
    if (!text) return "";
    return `
      <div style="display:grid;grid-template-columns:22px 82px 1fr;gap:6px;align-items:start;border:1px solid #e2e8f0;border-bottom:0;padding:5px 6px;background:#fff;">
        <div style="width:20px;height:20px;border-radius:6px;background:#eff6ff;color:#0b3f91;font-weight:800;text-align:center;display:grid;place-items:center;font-size:11px;">${escapeHtml(icon)}</div>
        <div style="color:#0b3f91;font-weight:bold;white-space:nowrap;">${escapeHtml(label)}:</div>
        <div style="color:#1f2937;">${escapeHtml(text)}</div>
      </div>
    `;
  }

  function visitPaperText(p) {
    const c = p.clinical || "";
    const yatis = shortDate(p.yatis) || "";
    const doctorCode = doctorInitials(p.doktor);
    const meta = extractCardMeta(p);
    const postop = operationBadge(p);
    const consults = (p.consults || [])
      .filter((x) => x.answer || x.unit)
      .map((x) => `(${shortDate(x.date) || "-"}) ${x.unit || "Kons"}${x.answer ? ":\n" + x.answer : ""}`)
      .join("\n");
    const orders = (p.orders || []).slice(0, 12).map((x) => `${x.name} ${x.dose}`.trim()).join("+");
    const rad = formatRadiology(p.radiology, 6, 260);
    const nursing = (p.nursing || [])[0]?.text || "";
    const lastVital = latestVitalLine(p.vitals, p);
    const labText = compactLabVitalsText(p.labs, lastVital);

    return `
${doctorCode}-${p.oda || ""}-${p.adSoyad || ""}${p.yas ? "-" + p.yas : ""}
TANI:${p.tani || ""}
OP:${meta.go || ""}
PO-R:${postop || ""}
Yatış Tarihi: ${yatis}
Op Tarihi:
BH:${meta.bh || ""}
Kİ:${meta.ki || ""}
GO:${meta.go || ""}
ASA:${meta.asa || ""}${meta.destination ? " Yer:" + meta.destination : ""}
---------------------------------------------------------------------
${labText}
---------------------------------------------------------------------
Glukotest:
${glucoseCheckText(p, 6) || "-"}
---------------------------------------------------------------------
Order:${orders || ""}
Gözlem:
Jp:
Takip:${nursing.split("\n").slice(0, 4).join(" ")}
Görüntüleme:
${rad}
Konsültasyonlar:
${consults}
`.trim();
  }

  function visitPaperHtml(p) {
    const yatis = shortDate(p.yatis) || "";
    const doctorCode = doctorInitials(p.doktor);
    const meta = extractCardMeta(p);
    const postop = operationBadge(p);
    const consults = (p.consults || [])
      .filter((x) => x.answer || x.unit)
      .map((x) => `(${shortDate(x.date) || "-"}) ${x.unit || "Kons"}${x.answer ? ":\n" + x.answer : ""}`)
      .join("\n");
    const orders = (p.orders || []).slice(0, 12).map((x) => `${x.name} ${x.dose}`.trim()).join("+");
    const rad = formatRadiology(p.radiology, 6, 260);
    const nursing = (p.nursing || [])[0]?.text || "";
    const lastVital = latestVitalLine(p.vitals, p);
    const labText = compactLabVitalsText(p.labs, lastVital);
    const line = (label, value) => `<div><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value || "")}</div>`;

    return `
      <div style="font-family:Arial,sans-serif;font-size:11pt;color:#111827;">
        <div><strong>${escapeHtml(`${doctorCode}-${p.oda || ""}-${p.adSoyad || ""}${p.yas ? "-" + p.yas : ""}`)}</strong></div>
        ${line("TANI", p.tani || "")}
        ${line("OP", meta.go || "")}
        ${line("PO-R", postop || "")}
        ${line("Yatis Tarihi", yatis)}
        ${line("Op Tarihi", "")}
        ${line("BH", meta.bh || "")}
        ${line("KI", meta.ki || "")}
        ${line("GO", meta.go || "")}
        ${line("ASA", `${meta.asa || ""}${meta.destination ? " Yer:" + meta.destination : ""}`)}
        <pre style="font-family:Arial,sans-serif;white-space:pre-wrap;margin:10px 0 5px;">${escapeHtml(labText)}</pre>
        ${line("Glukotest", glucoseCheckText(p, 6) || "-")}
        ${line("Order", orders || "")}
        ${line("Gozlem", "")}
        ${line("Jp", "")}
        ${line("Takip", nursing.split("\n").slice(0, 4).join(" "))}
        <p style="margin:10px 0 3px;"><strong>Goruntuleme</strong></p>
        <pre style="font-family:Arial,sans-serif;white-space:pre-wrap;margin:0;">${escapeHtml(rad || "-")}</pre>
        <p style="margin:10px 0 3px;"><strong>Konsultasyonlar</strong></p>
        <pre style="font-family:Arial,sans-serif;white-space:pre-wrap;margin:0;">${escapeHtml(consults || "-")}</pre>
      </div>
    `.trim();
  }

  async function copyVisitPaper(p, fallbackText = "") {
    const text = fallbackText || visitPaperText(p);
    const html = visitPaperHtml(p);
    try {
      if (window.ClipboardItem && navigator.clipboard?.write) {
        await navigator.clipboard.write([new window.ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" })
        })]);
        return;
      }
      await navigator.clipboard.writeText(text);
    } catch (e) {
      try { await navigator.clipboard.writeText(text); } catch (ignore) {}
    }
  }

  async function copyEditableHtml(html, text = "") {
    const doc = uiDocument();
    const win = uiWindow();
    const holder = doc.createElement("div");
    holder.setAttribute("contenteditable", "true");
    holder.style.cssText = "position:fixed;left:-10000px;top:0;width:900px;background:white;color:black;font-family:Arial,sans-serif;font-size:11pt;";
    holder.innerHTML = html;
    doc.body.appendChild(holder);
    try {
      const range = doc.createRange();
      range.selectNodeContents(holder);
      const selection = win.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      const ok = doc.execCommand("copy");
      selection.removeAllRanges();
      if (ok) return true;
    } catch (e) {
    } finally {
      holder.remove();
    }

    try {
      if (window.ClipboardItem && navigator.clipboard?.write) {
        await navigator.clipboard.write([new window.ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" })
        })]);
        return true;
      }
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (ignore) {
        return false;
      }
    }
  }

  async function copyPlainText(text = "") {
    const value = String(text || "");
    const doc = uiDocument();
    const holder = doc.createElement("textarea");
    holder.value = value;
    holder.setAttribute("readonly", "readonly");
    holder.style.cssText = "position:fixed;left:-10000px;top:0;width:1px;height:1px;opacity:0;";
    doc.body.appendChild(holder);
    try {
      holder.focus();
      holder.select();
      holder.setSelectionRange(0, holder.value.length);
      if (doc.execCommand("copy")) return true;
    } catch (e) {
    } finally {
      holder.remove();
    }

    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (e) {
      const textArea = uiEl("fsl-modal-text");
      if (textArea) {
        textArea.value = value;
        textArea.focus();
        textArea.select();
      }
      return false;
    }
  }

  async function copyLabVitals(p) {
    const lastVital = latestVitalLine(p.vitals, p);
    const text = compactLabVitalsText(p.labs, lastVital);
    const html = visitLabTableHtml(p.labs, lastVital);
    const ok = await copyEditableHtml(html, text);
    state.lastMessage = ok ? "Kan/vital tablosu kopyalandı." : "Kan/vital kopyalanamadı.";
    render();
  }

  async function copyLabVitalsPlain(p) {
    const lastVital = latestVitalLine(p.vitals, p);
    const text = compactLabVitalsText(p.labs, lastVital);
    const ok = await copyPlainText(text);
    state.lastMessage = ok ? "Kan/vital metin kopyalandı." : "Kan/vital metin hazırlandı.";
    render();
  }

  function fullVisitText(p) {
    const doctorCode = doctorInitials(p.doktor);
    const meta = extractCardMeta(p);
    const consults = (p.consults || []).map((x) => {
      const answer = x.answer ? `\n${x.answer}` : "";
      return `(${shortDate(x.date) || "-"}) ${x.unit || "Kons"}${answer}`;
    }).join("\n---\n");
    const orders = (p.orders || []).map((x) => `- ${x.name} ${x.dose} ${x.amount || ""}`.trim()).join("\n");
    const nursing = (p.nursing || []).slice(0, 3).map((x) => `(${shortDate(x.date) || "-"}) ${x.text}`).join("\n---\n");
    const rad = formatRadiology(p.radiology, 10, 900);
    const vitals = formatVitals(p.vitals, 8);

    return `
${doctorCode}-${p.oda || ""}-${p.adSoyad || ""}
TANI:${p.tani || ""}
Yatış:${shortDate(p.yatis) || ""} Diyet:${p.diyet || ""}
Dr:${p.doktor || ""}
Anestezi:${[
  meta.asa ? "ASA " + meta.asa : "",
  meta.bh ? "BH:" + meta.bh : "",
  meta.ki ? "Kİ:" + meta.ki : "",
  meta.go ? "GO:" + meta.go : "",
  meta.destination ? "Yer:" + meta.destination : ""
].filter(Boolean).join(" | ") || "-"}
---------------------------------------------------------------------
Lab ${p.labDate || ""}: ${labLine(p.labs)}
---------------------------------------------------------------------
Glukotest:
${glucoseCheckText(p, 8) || "-"}
---------------------------------------------------------------------
Order:
${orders || "-"}
Klinik İzlem:
${p.clinical || "-"}
Hemşire/Devir:
${nursing || "-"}
Vitaller:
${vitals || "-"}
Görüntüleme:
${rad || "-"}
Konsültasyonlar:
${consults || "-"}
`.trim();
  }

  function openPatientDetail(key) {
    const p = state.patients.find((x) => displayKey(x) === key);
    if (!p) return;
    state.selectedKey = key;
    acknowledgeConsults(p);
    acknowledgePatientUpdates(p);
    render();

    let modal = uiEl("fsl-patient-modal");
    if (!modal) {
      modal = uiDocument().createElement("div");
      modal.id = "fsl-patient-modal";
      modal.style.cssText = `
        position:fixed;
        inset:42px;
        z-index:2147483647;
        background:#ffffff;
        color:#111827;
        border:1px solid #cbd5e1;
        border-radius:10px;
        box-shadow:0 24px 70px rgba(15,23,42,.55);
        display:grid;
        grid-template-rows:auto 1fr;
        overflow:hidden;
        font-family:Arial,sans-serif;
      `;
      uiDocument().body.appendChild(modal);
    }

    const visit = fullVisitText(p);
    const dietInfo = compactDietInfo(p.diyet);
    const meta = extractCardMeta(p);
    modal.innerHTML = `
      <header style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;background:#ffffff;color:#111827;border-bottom:1px solid #cbd5e1;">
        <div>
          <div style="font-size:20px;font-weight:bold;">${escapeHtml(p.oda || "-")} ${escapeHtml(p.adSoyad || "")}</div>
          <div style="font-size:12px;color:#475569;">${escapeHtml([p.yas ? p.yas + " yaş" : "", p.birim, p.doktor].filter(Boolean).join(" | "))}</div>
        </div>
        <div style="display:flex;gap:8px;">
          <button id="fsl-modal-visit" style="background:#f59e0b;color:white;border:0;border-radius:6px;padding:7px 10px;cursor:pointer;">Vizit Kağıdı Hazırla</button>
          <button id="fsl-modal-refresh" style="background:#0ea5e9;color:white;border:0;border-radius:6px;padding:7px 10px;cursor:pointer;">Detay Yenile</button>
          <button id="fsl-modal-copy" style="background:#16a34a;color:white;border:0;border-radius:6px;padding:7px 10px;cursor:pointer;">Kopyala</button>
          <button id="fsl-modal-close" style="background:#dc2626;color:white;border:0;border-radius:6px;padding:7px 10px;cursor:pointer;">Kapat</button>
        </div>
      </header>
      <section style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px;overflow:auto;background:#ffffff;">
        <textarea id="fsl-modal-text" style="width:100%;height:100%;min-height:560px;background:#ffffff;color:#111827;border:1px solid #cbd5e1;border-radius:8px;padding:10px;font:13px/1.4 Arial,sans-serif;box-sizing:border-box;">${escapeHtml(visit)}</textarea>
        <div style="display:grid;gap:10px;align-content:start;">
          ${detailBlock("Kimlik / ID", `BS:${p.birimSevkId || "-"} HG:${p.hastaGelisId || "-"} H:${p.hastaId || "-"}\nProtokol:${p.protokol || "-"}\nYatış:${p.yatis || "-"}`)}
          ${detailBlock("Anestezi Formu", `ASA:${meta.asa || "-"}${meta.destination ? " Yer:" + meta.destination : ""}\nBH:${meta.bh || "-"}\nKİ:${meta.ki || "-"}\nGO:${meta.go || "-"}${p.anesthesia?.capturedAt ? "\nYakalama:" + p.anesthesia.capturedAt : ""}`)}
          ${detailBlock("Diyet", `Kart:${dietInfo.code}${dietInfo.extra ? "\nEk:" + dietInfo.extra : ""}\nHam:${p.diyet || "-"}`)}
          ${detailBlock("Lab", labLine(p.labs) || "-")}
          ${detailBlock("Order", (p.orders || []).map((x) => `${x.name} ${x.dose}`).join("\n") || "-")}
          ${detailBlock("Konsültasyon", (p.consults || []).map((x) => `${x.unit || "Kons"}\n${x.answer || x.request || "-"}`).join("\n---\n") || "-")}
          ${detailBlock("Vitaller", formatVitals(p.vitals, 10) || "-")}
          ${detailBlock("Hemşire / Devir", (p.nursing || []).map((x) => `${x.date || ""}\n${x.text || ""}`).join("\n---\n") || "-")}
          ${detailBlock("Radyoloji", formatRadiology(p.radiology, 12, 1200) || "-")}
          ${p.errors?.length ? detailBlock("Hatalar", p.errors.join("\n")) : ""}
        </div>
      </section>
    `;

    uiEl("fsl-modal-close").onclick = () => modal.remove();
    uiEl("fsl-modal-visit").onclick = async () => {
      if (!p.labs || !Object.keys(p.labs).length || !p.consults?.length) {
        await refreshPatientDetails(p);
      }
      uiEl("fsl-modal-text").value = visitPaperText(p);
      openPatientDetail(key);
      const textArea = uiEl("fsl-modal-text");
      if (textArea) textArea.value = visitPaperText(p);
    };
    uiEl("fsl-modal-refresh").onclick = async () => {
      await refreshPatientDetails(p);
      openPatientDetail(key);
    };
    uiEl("fsl-modal-copy").onclick = async () => {
      const text = uiEl("fsl-modal-text").value;
      await copyVisitPaper(p, text);
    };
    const copyLabsButton = uiEl("fsl-modal-copy-labs");
    if (copyLabsButton) copyLabsButton.onclick = async () => {
      if (!p.labs || !Object.keys(p.labs).length || !p.vitals?.length) {
        await refreshPatientDetails(p);
      }
      await copyLabVitals(p);
    };
    const copyLabsTextButton = uiEl("fsl-modal-copy-labs-text");
    if (copyLabsTextButton) copyLabsTextButton.onclick = async () => {
      if (!p.labs || !Object.keys(p.labs).length || !p.vitals?.length) {
        await refreshPatientDetails(p);
      }
      await copyLabVitalsPlain(p);
    };

    if (!(p.labs && Object.keys(p.labs).length) && !p.loading) {
      refreshPatientDetails(p).then(() => {
        if (uiEl("fsl-patient-modal") && state.selectedKey === key) openPatientDetail(key);
      });
    }
  }

  function detailBlock(title, text) {
    return `
      <section style="border:1px solid #cbd5e1;border-left:4px solid #0ea5e9;border-radius:8px;background:#ffffff;padding:9px;">
        <div style="font-size:12px;color:#075985;font-weight:bold;text-transform:uppercase;margin-bottom:6px;">${escapeHtml(title)}</div>
        <pre style="margin:0;white-space:pre-wrap;font:12px/1.35 Arial,sans-serif;color:#111827;">${escapeHtml(text || "-")}</pre>
      </section>
    `;
  }

  function parseKlinikDetail(data, p) {
    const d = data?.data || {};
    const sevk = d.birimSevk || {};
    const gelis = sevk.hastaGelis || {};
    const hasta = gelis.hasta || {};
    const kimlik = hasta.kimlik || {};
    p.birimSevkId = p.birimSevkId || sevk.id || d.id || "";
    p.hastaGelisId = p.hastaGelisId || gelis.id || "";
    p.hastaId = p.hastaId || hasta.id || "";
    p.adSoyad = p.adSoyad || kimlik.adiSoyadi || "";
    p.yas = p.yas || gelis.yas || "";
    p.cinsiyet = p.cinsiyet || sexShort(kimlik.cinsiyet?.adi || kimlik.cinsiyet || hasta.cinsiyet?.adi || hasta.cinsiyet || "");
    p.oda = p.oda || d.klinik?.yatak?.oda?.odaNo || "";
    p.birim = p.birim || sevk.birim?.adi || d.klinik?.yatak?.oda?.birim?.adi || "";
    p.doktor = p.doktor || sevk.personel?.kimlik?.adiSoyadi || "";
    p.yatis = p.yatis || d.klinik?.yatisTarihi || sevk.sevkTarihi || "";
    p.alerji = p.alerji || extractAllergyInfo(d);
    setDietInfo(p, d);
    p.tani = (d.taniList || d.nakilTaniList || [])
      .map((x) => x?.tani?.koduAdi || x?.tani?.adi)
      .filter(Boolean)
      .slice(0, 4)
      .join(", ");
    const izlem = d.klinikIzlemList || [];
    p.clinical = izlem[0]?.klinikIzlem || p.clinical || "";
  }

  function parseSevkInfo(data, p) {
    const root = data?.data || {};
    const sevk = root.hastaBirimSevk || root.birimSevk || {};
    const gelis = sevk.hastaGelis || {};
    const hasta = gelis.hasta || {};
    const kimlik = hasta.kimlik || {};
    p.birimSevkId = p.birimSevkId || sevk.id || "";
    p.hastaGelisId = p.hastaGelisId || gelis.id || "";
    p.hastaId = p.hastaId || hasta.id || "";
    p.adSoyad = p.adSoyad || kimlik.adiSoyadi || "";
    p.yas = p.yas || gelis.yas || "";
    p.cinsiyet = p.cinsiyet || sexShort(kimlik.cinsiyet?.adi || kimlik.cinsiyet || hasta.cinsiyet?.adi || hasta.cinsiyet || "");
    p.oda = p.oda || sevk.klinik?.yatak?.oda?.odaNo || "";
    p.birim = p.birim || sevk.birim?.adi || sevk.klinik?.yatak?.oda?.birim?.adi || "";
    p.doktor = p.doktor || sevk.personel?.kimlik?.adiSoyadi || "";
    p.yatis = p.yatis || sevk.sevkTarihi || gelis.muracaatTarihi || "";
    p.alerji = p.alerji || extractAllergyInfo(root);
    setDietInfo(p, root);
    p.tani = p.tani || (root.hastaTaniList || [])
      .map((x) => x?.tani?.koduAdi || x?.tani?.adi)
      .filter(Boolean)
      .slice(0, 4)
      .join(", ");
  }

  async function fetchSevkInfo(p) {
    if (!p.birimSevkId) return;
    const data = await apiJson(`/Tibbi/HastaBirimSevk/getSevkUyariInfo/${p.birimSevkId}`);
    parseSevkInfo(data, p);
  }

  async function fetchClinical(p) {
    if (!p.birimSevkId) return;
    const data = await apiJson(`/Klinik/Klinik/getKayit/${p.birimSevkId}`);
    parseKlinikDetail(data, p);
  }

  async function fetchDiet(p) {
    if (!p.diyet && p.birimSevkId) await fetchClinical(p);
    if (!p.diyetId || !p.uzmanlikKodu) return;
    const data = await apiJson(`/Klinik/Klinik/checkUzmanlikAraOgun/${p.diyetId}/${p.uzmanlikKodu}`);
    const ok = data?.success === true || data?.success === "true";
    if (!ok) return;
    p.diyetAraOgun = "Ara öğün";
    if (!norm(p.diyet).includes("ara öğün")) {
      p.diyet = [p.diyet, p.diyetAraOgun].filter(Boolean).join(" / ");
    }
  }

  async function fetchSurgeries(p) {
    if (!p.birimSevkId) return;
    const data = await apiJson(`/Klinik/Klinik/ameliyatIstekKlinikList/${p.birimSevkId}`);
    p.surgeries = (data.data || [])
      .map((x) => ({
        id: x.id,
        name: x.ameliyat1 || x.ameliyat || x.ameliyatAdi || "",
        requestDate: x.istekTarihi || "",
        startDate: x.baslangicTarihi || "",
        endDate: x.bitisTarihi || "",
        unit: x.yapanBirim || x.isteyenBirim || ""
      }))
      .filter((x) => x.requestDate || x.startDate || x.endDate || x.name)
      .sort((a, b) => String(dateTimeKey(b.startDate || b.endDate || b.requestDate)).localeCompare(String(dateTimeKey(a.startDate || a.endDate || a.requestDate))));
  }

  async function fetchNursing(p) {
    if (!p.birimSevkId && !p.hastaId) return;
    const property = p.hastaId ? "birimSevk.hastaGelis.hasta.id" : "birimSevk.id";
    const value = p.hastaId || p.birimSevkId;
    const data = await apiJson("/Hemsire/HemsireDevirNotu/getKayitList", {
      filterMap: "",
      filter: JSON.stringify([{ index: 1, property, value: Number(value), filterType: "kriterPanel", type: "Long", operator: "=" }]),
      page: 1,
      start: 0,
      limit: 100,
      sort: JSON.stringify([{ property: "tarih", direction: "DESC" }])
    });
    p.nursing = (data.data || []).slice(0, 3).map((x) => ({
      id: x.id,
      date: x.tarih,
      text: x.hemsireDevirNotu || ""
    }));
  }

  async function fetchConsults(p) {
    if (!p.hastaGelisId) {
      await fetchSevkInfo(p);
    }
    if (!p.hastaGelisId) throw new Error("hastaGelisId bulunamadı");
    const data = await apiJson(`/Poliklinik/Poliklinik/getHastaGelisKonsultasyonList/${p.hastaGelisId}/1`);
    p.consults = (data.data || []).slice(0, 50).map((x) => {
      const answer = consultAnswerText(x);
      return {
        id: x.id,
        date: x.birimSevk?.sevkTarihi || x.etar || "",
        unit: x.birimSevk?.birim?.adi || "",
        answer,
        request: x.istemSebebi || "",
        status: x.durum,
        answered: Boolean(answer)
      };
    });
  }

  async function fetchRadiologyReportText(reportId) {
    if (!reportId) return "";
    const data = await apiJson(`/Ris/RisHizmetSonuc/getRisRaporSonucByRaporId/${reportId}`);
    const text = radiologyReportText(data);
    if (text) state.radiologyTextCache[clean(reportId)] = text;
    return text;
  }

  async function fetchRadiology(p) {
    if (!p.hastaGelisId || !p.hastaId) {
      await fetchSevkInfo(p);
    }
    if (!p.hastaGelisId && !p.hastaId) throw new Error("hastaGelisId/hastaId bulunamadı");
    const previousRadiology = Array.isArray(p.radiology) ? p.radiology : [];
    const previousByKey = new Map(previousRadiology.map((item) => [radiologyIdentity(item), item]));
    const previousByReportId = new Map(previousRadiology.filter((item) => item.reportId).map((item) => [clean(item.reportId), item]));

    const queries = [
      p.hastaGelisId ? { property: "hastaGelisId", value: p.hastaGelisId } : null,
      p.hastaId ? { property: "hastaId", value: p.hastaId } : null
    ].filter(Boolean);

    const rows = [];
    for (const q of queries) {
      try {
        const data = await apiJson("/Ris/RisHizmetSonuc/getRisHizmetSonucInfoList", {
          filter: JSON.stringify([{ property: q.property, value: Number(q.value), type: "Long", operator: "=" }]),
          page: 1,
          start: 0,
          limit: 100,
          sort: JSON.stringify([{ property: "istemTarihi", direction: "DESC" }])
        });
        rows.push(...(data.data || []));
      } catch (e) {
        p.errors = p.errors || [];
        p.errors.push(`Rad liste ${q.property}: ${e.message}`);
      }
    }

    if (!rows.length && previousRadiology.length) {
      p.radiology = previousRadiology;
      return;
    }

    p.radiology = rows
      .filter((x, i, arr) => arr.findIndex((y) => radiologyIdentity(y) === radiologyIdentity(x)) === i)
      .sort((a, b) => String(dateTimeKey(b.istemTarihi || b.risKabulTarihi || "")).localeCompare(String(dateTimeKey(a.istemTarihi || a.risKabulTarihi || ""))))
      .slice(0, 12)
      .map((x) => {
        const item = {
          id: x.risOrderId || x.raporId,
          date: x.istemTarihi || x.risKabulTarihi || "",
          exam: x.risOrderKodAdi || "",
          reportId: clean(x.raporId || ""),
          accepted: x.cekimOnayTarihi || "",
          reportDate: x.raporOnayTarihi || x.onayTarihi || "",
          reportText: radiologyTextFromRaw(x.raporTextByRapor || x.raporText || x.rapor || x.bulgular || x.sonuc || "")
        };
        const old = previousByKey.get(radiologyIdentity(item)) || previousByReportId.get(clean(item.reportId));
        if (!item.reportText && old?.reportText) item.reportText = old.reportText;
        if (!item.reportText && item.reportId && state.radiologyTextCache[clean(item.reportId)]) item.reportText = state.radiologyTextCache[clean(item.reportId)];
        if (!item.reportDate && old?.reportDate) item.reportDate = old.reportDate;
        return item;
      });

    for (const item of p.radiology) {
      if (!item.reportId || item.reportText) continue;
      try {
        const fetchedText = await fetchRadiologyReportText(item.reportId);
        if (fetchedText) item.reportText = fetchedText;
      } catch (e) {
        p.errors = p.errors || [];
        p.errors.push(`Rad rapor ${item.reportId}: ${e.message}`);
      }
    }
  }

  function formatVitals(vitals = [], max = 5) {
    return (vitals || []).slice(0, max).map((v) => {
      const ta = [v.sys, v.dia].filter(Boolean).join("/");
      return [
        shortDate(v.date) || "",
        ta ? `TA:${ta}` : "",
        v.pulse ? `N:${v.pulse}` : "",
        v.temp ? `Ateş:${v.temp}` : "",
        v.spo2 ? `SpO2:${v.spo2}` : ""
      ].filter(Boolean).join(" ");
    }).join(" / ");
  }

  async function fetchVitals(p) {
    if (!p.hastaGelisId) {
      await fetchSevkInfo(p);
    }
    if (!p.hastaGelisId) throw new Error("hastaGelisId bulunamadı");
    const data = await apiJson(`/Poliklinik/Poliklinik/getDigerIslem/${p.hastaGelisId}`);
    const rows = data?.data?.poliklinikDigerBilgiDetayList || [];
    p.vitals = rows
      .map((x) => ({
        id: x.id,
        date: x.olcumZamani || x.etar || "",
        sys: x.tansiyonBuyuk || "",
        dia: x.tansiyonKucuk || "",
        pulse: x.nabiz || "",
        temp: x.ates || "",
        spo2: x.spo2 || "",
        resp: x.solunum || x.solunumSayisi || x.solunumSayisiDakika || "",
        pain: x.agriSkoru || x.agri || x.vas || ""
      }))
      .sort((a, b) => String(dateTimeKey(b.date)).localeCompare(String(dateTimeKey(a.date))))
      .slice(0, 20);
  }

  function todayRange() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const date = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
    return { start: `${date} 00:00:00`, end: `${date} 23:59:59` };
  }

  async function fetchOrders(p) {
    if (!p.birimSevkId) return;
    const { start, end } = todayRange();
    const filter = [
      { index: 1, property: "tarihTuru", value: "tarihAraligiIcinde", filterType: "kriterPanel", isEnum: false, type: "String", operator: "=" },
      { index: 2, property: "tarih", value: start, filterType: "kriterPanel", type: "date", operator: "=" },
      { index: 3, property: "e.baslangicTarihi", value: start, filterType: "kriterPanel", type: "date", operator: ">=" },
      { index: 4, property: "e.bitisTarihi", value: end, filterType: "kriterPanel", type: "date", operator: "<=" },
      { index: 5, property: "birimSevk.id", value: Number(p.birimSevkId), filterType: "kriterPanel", type: "Long", operator: "=" },
      { index: 6, property: "yeri", value: 2, filterType: "kriterPanel", isEnum: true, type: "tr.com.fonet.hbys.common.enums.EOrderYeri", operator: "=" },
      { index: 7, property: "hemsireOrder", value: "false", filterType: "kriterPanel", isEnum: false, type: "String", operator: "=" }
    ];
    const data = await apiJson("/Stok/EOrder/getKayitList", {
      autoStores: ["turu", "stokTuru", "antibiyotikTuru", "ekstravazeIlacSekli", "durum"],
      filterMap: "",
      filter: JSON.stringify(filter),
      page: 1,
      start: 0,
      limit: 100
    });
    p.orderRows = Array.isArray(data.data) ? data.data : [];
    p.orders = p.orderRows.filter(isMedicineOrderRaw).slice(0, 12).map((x) => ({
      id: x.id,
      name: orderRawName(x),
      dose: x.doz || "",
      amount: x.miktar || "",
      unit: orderRawUnit(x),
      usage: orderRawUsage(x),
      start: x.baslangicTarihi || "",
      status: x.durum,
      raw: x
    })).filter((x) => x.name);
  }

  async function fetchOrderRowsForDate(p, dateText) {
    if (!p.birimSevkId) return [];
    const start = `${dateText} 00:00:00`;
    const end = `${dateText} 23:59:59`;
    const filter = [
      { index: 1, property: "tarihTuru", value: "tarihAraligiIcinde", filterType: "kriterPanel", isEnum: false, type: "String", operator: "=" },
      { index: 2, property: "tarih", value: start, filterType: "kriterPanel", type: "date", operator: "=" },
      { index: 3, property: "e.baslangicTarihi", value: start, filterType: "kriterPanel", type: "date", operator: ">=" },
      { index: 4, property: "e.bitisTarihi", value: end, filterType: "kriterPanel", type: "date", operator: "<=" },
      { index: 5, property: "birimSevk.id", value: Number(p.birimSevkId), filterType: "kriterPanel", type: "Long", operator: "=" },
      { index: 6, property: "yeri", value: 2, filterType: "kriterPanel", isEnum: true, type: "tr.com.fonet.hbys.common.enums.EOrderYeri", operator: "=" },
      { index: 7, property: "hemsireOrder", value: "false", filterType: "kriterPanel", isEnum: false, type: "String", operator: "=" }
    ];
    const data = await apiJson("/Stok/EOrder/getKayitList", {
      autoStores: ["turu", "stokTuru", "antibiyotikTuru", "ekstravazeIlacSekli", "durum"],
      filterMap: "",
      filter: JSON.stringify(filter),
      page: 1,
      start: 0,
      limit: 100
    });
    return Array.isArray(data.data) ? data.data : [];
  }

  function idValue(value) {
    if (value == null || value === "") return null;
    if (typeof value === "object") return value.id ?? value.ID ?? value.value ?? null;
    return value;
  }

  function refObject(value) {
    const id = idValue(value);
    if (id == null || id === "") return null;
    const text = String(id).trim();
    return /^\d+$/.test(text) ? { id: Number(text) } : null;
  }

  function orderRawName(x = {}) {
    return clean(
      x.stok?.adi ||
      x.hizmetMakro?.adi ||
      x.malzeme?.adi ||
      x.malzemeAdi ||
      (typeof x.malzeme === "string" ? x.malzeme : "") ||
      x.adi ||
      x.ad ||
      x.tedaviAdi ||
      x.ilacAdi ||
      x.aciklama ||
      ""
    );
  }

  function orderRawUnit(x = {}) {
    return clean(x.birim?.adi || x.birimi || x.birimAdi || "");
  }

  function orderRawUsage(x = {}) {
    const value = x.ilacKullanimSekli;
    if (value && typeof value === "object") return clean(value.adi || value.name || value.aciklama || value.id || "");
    const raw = clean(x.ilacKullanimSekliAdi || x.kullanimSekli || value || "");
    const map = {
      "1": "İnfüzyon",
      "2": "İntravenöz",
      "3": "Ağızdan",
      "4": "Subkütan",
      "5": "İnhaler"
    };
    return map[raw] || raw;
  }

  function orderRawTypeId(x = {}) {
    return Number(idValue(x.turu) || x.turuId || 0);
  }

  function orderRawStockType(x = {}) {
    return norm(x.stokTuru?.adi || x.stokTuru || x.stokTuruAdi || "");
  }

  function isSarfOrderName(name) {
    return /hasta\s*(alt\s*)?bez|eldiven|lanset|flaster|yara\s*[öo]rt|ka[ğg][ıi]t\s*[öo]rdek|triflo|solunum egzersiz|kolostomi|ileostomi|torba|pasta|ven valf|irrigasyon|s[üu]rg[üu]|sonda|kateter/.test(norm(name));
  }

  function looksLikeDose(value) {
    return /^\d+\s*x\s*\d+$/i.test(clean(value));
  }

  function isMedicineOrderRaw(x = {}) {
    const name = orderRawName(x);
    if (!name || isSarfOrderName(name)) return false;
    if (orderRawTypeId(x) === 2) return false;
    const stockType = orderRawStockType(x);
    if (/sarf|malzeme|hizmet/.test(stockType)) return false;
    return looksLikeDose(x.doz);
    if (stockType && !/^ila[çc]$/.test(stockType)) return false;
    return looksLikeDose(x.doz);
  }

  function isTransferExcludedOrderRaw(x = {}) {
    const name = orderRawName(x);
    if (!name || isSarfOrderName(name)) return false;
    if (isFollowOrderRaw(x) || isMedicineOrderRaw(x)) return false;
    const stockType = orderRawStockType(x);
    if (/sarf|malzeme|hizmet/.test(stockType)) return false;
    return Boolean(name);
  }

  function excludedOrderText(x = {}) {
    return [
      orderRawName(x) || "Adsız order",
      clean(x.doz) ? `Doz: ${clean(x.doz)}` : "Doz yok/uyumsuz",
      orderRawUnit(x) ? `Birim: ${orderRawUnit(x)}` : "",
      orderRawUsage(x) ? `Kullanim: ${orderRawUsage(x)}` : ""
    ].filter(Boolean).join(" | ");
  }

  function anyOrderText(x = {}) {
    if (isFollowOrderRaw(x)) return followOrderText(x);
    return [
      orderRawName(x) || clean(x.aciklama) || "Order",
      clean(x.doz) ? `Doz: ${clean(x.doz)}` : "",
      orderRawUnit(x) ? `Birim: ${orderRawUnit(x)}` : "",
      orderRawUsage(x) ? `Kullanim: ${orderRawUsage(x)}` : "",
      clean(x.aciklama) && clean(x.aciklama) !== orderRawName(x) ? `Aciklama: ${clean(x.aciklama)}` : ""
    ].filter(Boolean).join(" | ");
  }

  function isFollowOrderRaw(x = {}) {
    return orderRawTypeId(x) === 2;
    if (orderRawTypeId(x) === 2) return true;
    return Boolean(x.eorderTakipDirektif || x.takipDirektif || /ald[iı]g[iı]\s*[çc][iı]kard|a[çc]t/i.test(norm(x.aciklama || "")));
  }

  function followOrderText(x = {}) {
    const name = clean(x.eorderTakipDirektif?.adi || x.takipDirektif?.adi || x.takipAdi || "AÇT");
    const note = clean(x.aciklama || "");
    return [name, note && note !== name ? note : ""].filter(Boolean).join(" | ");
  }

  function tomorrowDateText() {
    const base = todayRange().start.slice(0, 10);
    const m = base.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!m) return base;
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    d.setDate(d.getDate() + 1);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}.${mm}.${d.getFullYear()}`;
  }

  function patientOrderTomorrowText(p) {
    const rows = p.orderRows || [];
    const all = rows.filter((x) => isFollowOrderRaw(x) || orderRawName(x) || clean(x.aciklama));
    if (!all.length) return "Order bulunamadi.";
    return ["BUGUNUN ORDERI:", all.map((x, i) => `${i + 1}. ${anyOrderText(x)}`).join("\n")].join("\n");
    const follows = rows.filter(isFollowOrderRaw);
    const meds = rows.filter(isMedicineOrderRaw);
    const parts = [];
    if (follows.length) {
      parts.push("TAKIP:");
      parts.push(follows.map((x, i) => `${i + 1}. ${followOrderText(x)}`).join("\n"));
    }
    if (meds.length) {
      if (parts.length) parts.push("");
      parts.push("ILAC:");
      parts.push(meds.map((x, i) => [
        `${i + 1}. ${orderRawName(x)}`,
        x.doz ? `Doz: ${x.doz}` : "",
        orderRawUnit(x) ? `Birim: ${orderRawUnit(x)}` : "",
        orderRawUsage(x) ? `Kullanim: ${orderRawUsage(x)}` : ""
      ].filter(Boolean).join(" | ")).join("\n"));
    }
    return parts.join("\n") || "Order bulunamadı.";
  }

  function draftFromMedicineRaw(x, targetDate, birimSevkId) {
    const stok = refObject(x.stok || x.stokId || x.malzeme || x.malzemeId || x.kodu || x.hizmetKodu);
    const birim = refObject(x.birim || x.birimId || x.stok?.birim || x.stok?.birimId || x.malzeme?.birim || x.malzeme?.birimId || x.stokBirim || x.stokBirimId);
    const depo = refObject(x.depo || x.depoId || x.stok?.depo || x.stokDepo || x.stokDepoId) || { id: 60000022000 };
    const birimSevk = refObject(x.birimSevk || x.birimSevkId || birimSevkId);
    if (!stok || !birimSevk) return null;
    const draft = {
      id: "",
      durum: 0,
      yeri: idValue(x.yeri) || 2,
      turu: 1,
      baslangicTarihi: `${targetDate} 00:00:00`,
      bitisTarihi: `${targetDate} 00:00:00`,
      doz: clean(x.doz),
      ilacKullanimSekli: idValue(x.ilacKullanimSekli) || "",
      verilisSuresi: x.verilisSuresi || "",
      tedaviTuru: x.tedaviTuru == null ? "" : idValue(x.tedaviTuru),
      luzumHalinde: x.luzumHalinde || 0,
      sozelOrder: x.sozelOrder || 0,
      acilOrder: x.acilOrder || "",
      yirmiDortSaat: x.yirmiDortSaat || "",
      birimSevk,
      aciklama: x.aciklama || null,
      birimCarpani: x.birimCarpani == null || x.birimCarpani === "" ? 1 : x.birimCarpani,
      dozArtirimi: x.dozArtirimi || "",
      raporTakipNo: x.raporTakipNo || null,
      miktar: x.miktar == null || x.miktar === "" ? Number(String(x.doz || "1").match(/\d+/)?.[0] || 1) : x.miktar,
      eczaciNotu: null,
      hekimNotu: null,
      evdenOrder: null,
      depo,
      stok
    };
    if (birim) draft.birim = birim;
    return draft;
  }

  function draftFromFollowRaw(x, targetDate, birimSevkId) {
    const birimSevk = refObject(x.birimSevk || x.birimSevkId || birimSevkId);
    const directive = refObject(x.eorderTakipDirektif || x.takipDirektif) || { id: 60000000103 };
    if (!birimSevk || !directive) return null;
    return {
      id: "",
      durum: 0,
      yeri: idValue(x.yeri) || 2,
      turu: 2,
      baslangicTarihi: `${targetDate} 00:00:00`,
      bitisTarihi: `${targetDate} 00:00:00`,
      doz: x.doz || "1x1",
      ilacKullanimSekli: "",
      verilisSuresi: "",
      tedaviTuru: idValue(x.tedaviTuru) || 1,
      luzumHalinde: x.luzumHalinde || 0,
      sozelOrder: x.sozelOrder || 0,
      acilOrder: x.acilOrder || "",
      yirmiDortSaat: x.yirmiDortSaat || "",
      birimSevk,
      aciklama: x.aciklama || "ALDIĞI ÇIKARDIĞI TAKİBİ",
      birimCarpani: "",
      dozArtirimi: "",
      raporTakipNo: null,
      miktar: x.miktar || 1,
      eczaciNotu: null,
      hekimNotu: null,
      evdenOrder: null,
      eorderTakipDirektif: directive
    };
  }

  function draftFromAnyOrderRaw(x, targetDate, birimSevkId) {
    if (isFollowOrderRaw(x)) return draftFromFollowRaw(x, targetDate, birimSevkId);
    const birimSevk = refObject(x.birimSevk || x.birimSevkId || birimSevkId);
    const stok = refObject(x.stok || x.stokId || x.malzeme || x.malzemeId || x.kodu || x.hizmetKodu);
    const birim = refObject(x.birim || x.birimId || x.stok?.birim || x.stok?.birimId || x.malzeme?.birim || x.malzeme?.birimId || x.stokBirim || x.stokBirimId);
    const depo = refObject(x.depo || x.depoId || x.stok?.depo || x.stokDepo || x.stokDepoId) || { id: 60000022000 };
    if (!birimSevk) return null;

    const draft = {
      id: "",
      durum: 0,
      yeri: idValue(x.yeri) || 2,
      turu: idValue(x.turu) || 1,
      baslangicTarihi: `${targetDate} 00:00:00`,
      bitisTarihi: `${targetDate} 00:00:00`,
      doz: clean(x.doz || "1x1"),
      ilacKullanimSekli: idValue(x.ilacKullanimSekli) || "",
      verilisSuresi: x.verilisSuresi || "",
      tedaviTuru: x.tedaviTuru == null ? "" : idValue(x.tedaviTuru),
      luzumHalinde: x.luzumHalinde || 0,
      sozelOrder: x.sozelOrder || 0,
      acilOrder: x.acilOrder || "",
      yirmiDortSaat: x.yirmiDortSaat || "",
      birimSevk,
      aciklama: x.aciklama || null,
      birimCarpani: x.birimCarpani == null || x.birimCarpani === "" ? 1 : x.birimCarpani,
      dozArtirimi: x.dozArtirimi || "",
      raporTakipNo: x.raporTakipNo || null,
      miktar: x.miktar == null || x.miktar === "" ? Number(String(x.doz || "1").match(/\d+/)?.[0] || 1) : x.miktar,
      eczaciNotu: null,
      hekimNotu: null,
      evdenOrder: null
    };
    if (stok) draft.stok = stok;
    if (birim) draft.birim = birim;
    if (depo) draft.depo = depo;
    const hizmetMakro = refObject(x.hizmetMakro || x.hizmetMakroId);
    if (hizmetMakro) draft.hizmetMakro = hizmetMakro;
    return draft;
  }

  function buildPatientOrderDraft(p) {
    const targetDate = tomorrowDateText();
    const rows = (p.orderRows || []).filter((x) => isFollowOrderRaw(x) || orderRawName(x) || clean(x.aciklama));
    const missing = [];
    const eorderList = [];
    rows.forEach((x) => {
      const draft = draftFromAnyOrderRaw(x, targetDate, p.birimSevkId);
      if (draft) eorderList.push(draft);
      else missing.push(anyOrderText(x));
    });
    return { targetDate, eorderList, missing, expected: rows.length };
  }

  function hasRequiredOrderIdentity(x = {}) {
    if (isFollowOrderRaw(x)) return true;
    if (refObject(x.hizmetMakro || x.hizmetMakroId)) return true;
    const stok = refObject(x.stok || x.stokId || x.malzeme || x.malzemeId || x.kodu || x.hizmetKodu);
    return Boolean(stok);
  }

  function buildPatientOrderDraftSafe(p) {
    const targetDate = tomorrowDateText();
    const rows = (p.orderRows || []).filter((x) => isFollowOrderRaw(x) || orderRawName(x) || clean(x.aciklama));
    const missing = [];
    const eorderList = [];
    rows.forEach((x) => {
      if (!hasRequiredOrderIdentity(x)) {
        missing.push(anyOrderText(x));
        return;
      }
      const draft = isMedicineOrderRaw(x)
        ? draftFromMedicineRaw(x, targetDate, p.birimSevkId)
        : draftFromAnyOrderRaw(x, targetDate, p.birimSevkId);
      if (draft) eorderList.push(draft);
      else missing.push(anyOrderText(x));
    });
    return { targetDate, eorderList, missing, expected: rows.length };
  }

  function orderCompareKey(x = {}) {
    if (isFollowOrderRaw(x)) return `T|${norm(followOrderText(x))}|${clean(x.doz || "1x1").toLowerCase()}`;
    return `O|${norm(orderRawName(x) || clean(x.aciklama))}|${clean(x.doz || "1x1").toLowerCase()}`;
  }

  function countOrderKeys(rows = []) {
    const map = new Map();
    rows.forEach((x) => {
      if (!isFollowOrderRaw(x) && !orderRawName(x) && !clean(x.aciklama)) return;
      const key = orderCompareKey(x);
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }

  function missingCopiedRows(sourceRows = [], copiedRows = []) {
    const copied = countOrderKeys(copiedRows);
    const missing = [];
    sourceRows.filter((x) => isFollowOrderRaw(x) || orderRawName(x) || clean(x.aciklama)).forEach((x) => {
      const key = orderCompareKey(x);
      const left = copied.get(key) || 0;
      if (left > 0) {
        copied.set(key, left - 1);
      } else {
        missing.push(anyOrderText(x));
      }
    });
    return missing;
  }

  function waitMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function transferPatientOrdersTomorrow(p) {
    const sentDraft = buildPatientOrderDraft(p);
    if (!sentDraft.eorderList.length) throw new Error("Aktarilacak order bulunamadi.");
    await apiJsonBody("/Stok/EOrder/updateKayit", "PUT", { eorderList: sentDraft.eorderList });
    await waitMs(700);
    const copiedRows = await fetchOrderRowsForDate(p, sentDraft.targetDate);
    const notCopied = missingCopiedRows(p.orderRows || [], copiedRows);
    sentDraft.notCopied = [...new Set([...(sentDraft.missing || []), ...notCopied])];
    sentDraft.fallbackReason = "guvenli mod";
    return sentDraft;
    /*
    const fullDraft = buildPatientOrderDraft(p);
    if (!fullDraft.eorderList.length) throw new Error("Aktarilacak order bulunamadi.");
    let sentDraft = fullDraft;
    let fallbackReason = "";
    try {
      await apiJsonBody("/Stok/EOrder/updateKayit", "PUT", { eorderList: fullDraft.eorderList });
    } catch (e) {
      fallbackReason = e?.message || String(e);
      sentDraft = buildPatientOrderDraftSafe(p);
      if (!sentDraft.eorderList.length) throw new Error(`FONET tum paketi reddetti, gonderilebilir satir bulunamadi: ${fallbackReason}`);
      await apiJsonBody("/Stok/EOrder/updateKayit", "PUT", { eorderList: sentDraft.eorderList });
    }
    await waitMs(700);
    const copiedRows = await fetchOrderRowsForDate(p, sentDraft.targetDate);
    const notCopied = missingCopiedRows(p.orderRows || [], copiedRows);
    sentDraft.notCopied = [...new Set([...(sentDraft.missing || []), ...notCopied])];
    sentDraft.fallbackReason = fallbackReason;
    return sentDraft;
    */
    /*
    const draft = buildPatientOrderDraft(p);
    draft.missing = [];
    if (draft.missing?.length) throw new Error(`Eksik bilgi nedeniyle aktarım durdu: ${draft.missing.join(", ")}`);
    if (!draft.eorderList.length) throw new Error("Aktarılacak order bulunamadı.");
    await apiJsonBody("/Stok/EOrder/updateKayit", "PUT", { eorderList: draft.eorderList });
    await waitMs(700);
    const copiedRows = await fetchOrderRowsForDate(p, draft.targetDate);
    const notCopied = missingCopiedRows(p.orderRows || [], copiedRows);
    if (notCopied.length) {
      throw new Error(`FONET'e gönderildi ama şu satır(lar) yarın listesinde görünmedi: ${notCopied.join(", ")}`);
    }
    return draft;
    */
  }

  async function fetchLabs(p) {
    if (!p.hastaGelisId && !p.hastaId) return;
    const property = p.hastaGelisId ? "hastaGelisId" : "hastaId";
    const value = p.hastaGelisId || p.hastaId;
    const kabul = await apiJson("/Lis/LisRaporSonuc/getLisRaporHastaInfoList", {
      filter: JSON.stringify([{ property, value: Number(value), type: "Long", operator: "=" }]),
      page: 1,
      start: 0,
      limit: 20,
      sort: JSON.stringify([{ property: "lisKabulTarihi", direction: "DESC" }])
    });
    if (!p.hastaGelisId && kabul.data?.[0]?.hastaGelisId) p.hastaGelisId = kabul.data[0].hastaGelisId;
    const latest = (kabul.data || []).slice(0, 5);
    const barkods = [];
    for (const k of latest) {
      const tup = await apiJson("/Lis/LisRaporSonuc/getLisHastaTupInfo", {
        filter: JSON.stringify([{ filterType: "kriterPanel", property: "t.lisKabul.id", value: Number(k.lisKabulId), type: "Long", operator: "=" }]),
        page: 1,
        start: 0,
        limit: 100
      });
      barkods.push(...(tup.data || []).map((x) => x.barkodNo).filter(Boolean));
    }
    if (!barkods.length) return;
    const detail = await apiJson("/Lis/LisRaporSonuc/getLisRaporDetay", {
      filter: JSON.stringify([{ filterType: "kriterPanel", property: "t.lisHastaTup.barkodNo", value: barkods, type: "Long", operator: "IN" }]),
      page: 1,
      start: 0,
      limit: 300,
      group: JSON.stringify([{ property: "tupAdi", direction: "ASC" }]),
      sort: JSON.stringify([{ property: "lt.siraNo", direction: "ASC" }])
    });
    const summarized = summarizeLabs(detail.data || []);
    const mainLabDate = relevantLabDate(summarized.labs);
    if (mainLabDate) {
      p.labs = summarized.labs;
      p.labDate = mainLabDate;
    } else if (!p.labs) {
      p.labs = summarized.labs;
      p.labDate = "";
    }
    if (summarized.glucoseChecks.length) {
      p.glucoseChecks = summarized.glucoseChecks;
    } else if (!Array.isArray(p.glucoseChecks)) {
      p.glucoseChecks = [];
    }
  }

  async function refreshPatientDetails(p, shouldRender = true) {
    p.loading = true;
    p.errors = [];
    if (shouldRender) scheduleRender(25);
    try { await fetchSevkInfo(p); } catch (e) { p.errors.push(`Sevk: ${e.message}`); }
    try { await fetchClinical(p); } catch (e) { p.errors.push(`Klinik: ${e.message}`); }
    const jobs = [
      ["Diyet", () => fetchDiet(p)],
      ["Ameliyat", () => fetchSurgeries(p)],
      ["Lab", () => fetchLabs(p)],
      ["Vital", () => fetchVitals(p)],
      ["Kons", () => fetchConsults(p)],
      ["Order", () => fetchOrders(p)],
      ["Devir", () => fetchNursing(p)],
      ["Rad", () => fetchRadiology(p)]
    ];
    for (const [label, fn] of jobs) {
      try { await fn(); } catch (e) { p.errors.push(`${label}: ${e.message}`); }
    }
    p.loading = false;
    p.updatedAt = new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    notifyChanges(p);
    if (shouldRender) scheduleRender(25);
  }

  function patientSnapshot(p) {
    return {
      labs: p.labs,
      glucoseChecks: p.glucoseChecks,
      vitals: p.vitals,
      consults: p.consults,
      orders: p.orders,
      nursing: p.nursing,
      radiology: p.radiology,
      surgeries: p.surgeries,
      anesthesia: p.anesthesia,
      asa: p.asa,
      knownDiseases: p.knownDiseases,
      homeMeds: p.homeMeds,
      plannedOperation: p.plannedOperation,
      postopPlace: p.postopPlace,
      diyet: p.diyet,
      diyetAraOgun: p.diyetAraOgun,
      clinical: p.clinical
    };
  }

  function hashPatient(p) {
    return stableJson(patientSnapshot(p));
  }

  function changedParts(before = {}, after = {}) {
    const checks = [
      ["labs", "Yeni lab"],
      ["glucoseChecks", "Yeni glukoz"],
      ["vitals", "Yeni vital"],
      ["consults", "Kons güncellendi"],
      ["orders", "Yeni order"],
      ["nursing", "Yeni devir"],
      ["radiology", "Yeni radyoloji"],
      ["surgeries", "Ameliyat"],
      ["anesthesia", "Anestezi formu"],
      ["asa", "ASA güncellendi"],
      ["knownDiseases", "BH güncellendi"],
      ["homeMeds", "Kİ güncellendi"],
      ["plannedOperation", "GO güncellendi"],
      ["postopPlace", "Yer güncellendi"],
      ["diyet", "Diyet güncellendi"],
      ["diyetAraOgun", "Diyet güncellendi"],
      ["clinical", "Klinik izlem"]
    ];
    const labels = checks
      .filter(([field]) => stableJson(before?.[field] || null) !== stableJson(after?.[field] || null))
      .map(([, label]) => label);

    if (labels.includes("Kons güncellendi")) {
      const oldAnswers = stableJson((before.consults || []).map((c) => [c.id, c.date, c.unit, c.answer]).filter((x) => x[3]));
      const newAnswers = stableJson((after.consults || []).map((c) => [c.id, c.date, c.unit, c.answer]).filter((x) => x[3]));
      return labels.map((label) => label === "Kons güncellendi" && oldAnswers !== newAnswers ? "Kons cevaplandı" : label);
    }
    return labels;
  }

  function latestLabDetail(labs = {}) {
    const keys = ["WBC", "Hb", "PLT", "Kre", "CRP", "PCT", "Glu", "Na", "K", "P", "Ca", "Mg", "AST", "ALT", "ALP", "GGT", "Tbil", "Dbil"];
    return keys
      .map((key) => {
        const item = labs?.[key]?.[0];
        return item?.value ? `${key}: ${item.value}` : "";
      })
      .filter(Boolean)
      .join(" | ");
  }

  function latestGlucoseDetail(checks = []) {
    const item = checks?.[0];
    if (!item?.value) return "";
    return [
      `${item.value} mg/dL`,
      item.date || ""
    ].filter(Boolean).join(" | ");
  }

  function consultChangeDetail(before = {}, after = {}) {
    const oldAnswers = new Set((before.consults || []).filter(consultIsAnswered).map((c) => `${c.id}|${c.answer}`));
    const answered = (after.consults || []).find((c) => consultIsAnswered(c) && !oldAnswers.has(`${c.id}|${c.answer}`));
    const item = answered || (after.consults || [])[0];
    if (!item) return "";
    return [
      [item.date, item.unit].filter(Boolean).join(" | "),
      item.request ? `İstem: ${clip(item.request, 260)}` : "",
      item.answer ? `Cevap: ${clip(item.answer, 520)}` : "Cevap: Bekliyor"
    ].filter(Boolean).join("\n");
  }

  function changeDetailText(labels = [], before = {}, after = {}, p = {}) {
    const parts = [];
    const add = (title, text) => {
      const value = cleanMultiline(text);
      if (value) parts.push(`${title}: ${value}`);
    };
    if (labels.includes("Yeni vital")) add("Yeni vital", formatVitals(after.vitals || [], 1));
    if (labels.includes("Yeni lab")) add(`Yeni lab${p.labDate ? ` (${p.labDate})` : ""}`, latestLabDetail(after.labs));
    if (labels.includes("Yeni glukoz")) add("Yeni glukoz", latestGlucoseDetail(after.glucoseChecks));
    if (labels.includes("Kons cevaplandı") || labels.includes("Kons güncellendi")) {
      add(labels.includes("Kons cevaplandı") ? "Kons cevabı" : "Kons durumu", consultChangeDetail(before, after));
    }
    if (labels.includes("Yeni order")) {
      add("Yeni order", (after.orders || []).slice(0, 6).map((x) => `${x.name || ""} ${x.dose || ""}`.trim()).filter(Boolean).join("\n"));
    }
    if (labels.includes("Yeni devir")) add("Hemşire/devir", (after.nursing || [])[0]?.text || "");
    if (labels.includes("Yeni radyoloji")) add("Radyoloji", formatRadiology(after.radiology || [], 1, 520));
    if (labels.includes("Diyet güncellendi")) add("Diyet", [p.diyet, p.diyetAraOgun].filter(Boolean).join(" / "));
    if (labels.includes("Klinik izlem")) add("Klinik izlem", clip(after.clinical || "", 520));
    if (labels.includes("ASA güncellendi") || labels.includes("Anestezi formu")) {
      add("Anestezi", [`ASA: ${p.asa || "-"}`, `BH: ${p.knownDiseases || "-"}`, `Kİ: ${p.homeMeds || "-"}`, `GO: ${p.plannedOperation || "-"}`].join("\n"));
    }
    if (labels.includes("BH güncellendi")) add("Bilinen hastalıklar", p.knownDiseases || "");
    if (labels.includes("Kİ güncellendi")) add("Kullandığı ilaçlar", p.homeMeds || "");
    if (labels.includes("GO güncellendi")) add("Planlanan ameliyat", p.plannedOperation || "");
    if (labels.includes("Yer güncellendi")) add("Planlanan yer", p.postopPlace || "");
    if (labels.includes("Ameliyat")) add("Ameliyat", (after.surgeries || []).slice(0, 3).map((x) => [x.name, x.startDate || x.requestDate].filter(Boolean).join(" | ")).join("\n"));
    return parts.join("\n\n");
  }

  function notifyChanges(p) {
    const key = p.key || patientKey(p);
    const snapshot = patientSnapshot(p);
    const hash = stableJson(snapshot);
    const seen = state.seen[key];
    const oldHash = typeof seen === "string" ? seen : seen?.hash;
    const oldSnapshot = typeof seen === "string" ? null : seen?.snapshot;
    if (!oldHash) {
      state.seen[key] = { hash, snapshot };
      return;
    }
    if (oldHash !== hash) {
      state.seen[key] = { hash, snapshot };
      const labels = changedParts(oldSnapshot, snapshot);
      if (!labels.length) return;
      p.changedAt = Date.now();
      p.changedLabels = [...new Set([...(p.changedLabels || []), ...labels])];
      p.changedText = p.changedLabels.slice(0, 4).join(", ");
      const eventDetail = changeDetailText(labels, oldSnapshot || {}, snapshot, p);
      p.changedDetail = eventDetail;
      p.lastChangeText = [...new Set(labels)].join(", ");
      p.lastChangeDetail = eventDetail;
      recordDesktopNotification(p, labels, eventDetail);
      const msg = `${p.oda || ""} ${p.adSoyad || "Hasta"}: ${p.changedText}`;
      state.lastMessage = msg;
      try {
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("FONET servis paneli", { body: msg });
        } else if ("Notification" in window && Notification.permission === "default") {
          Notification.requestPermission();
        }
      } catch (e) {}
      playNotificationSound(labels);
    }
  }

  async function refreshAllDetails() {
    if (state.busy || document.hidden || !state.active) return;
    state.busy = true;
    try {
      collectServicePatients(false);
      const candidates = state.patients.filter((p) => p.birimSevkId || p.hastaGelisId || p.hastaId);
      state.lastMessage = `${candidates.length}/${state.patients.length} hasta için arka plan detay çekiliyor.`;
      scheduleRender(25);

      for (const p of candidates) {
        if (!state.active || document.hidden) break;
        try { await refreshPatientDetails(p, false); } catch (e) {}
        await new Promise((resolve) => window.setTimeout(resolve, 40));
      }

      state.lastMessage = `Detay güncellendi: ${new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`;
    } finally {
      state.busy = false;
      scheduleRender(25);
    }
  }

  function restore() {
    state.active = false;
    if (state.monitor) window.clearInterval(state.monitor);
    if (state.renderTimer) window.clearTimeout(state.renderTimer);
    if (state.original.xhrOpen) XMLHttpRequest.prototype.open = state.original.xhrOpen;
    if (state.original.xhrSend) XMLHttpRequest.prototype.send = state.original.xhrSend;
    if (state.original.extRequest && window.Ext?.Ajax) Ext.Ajax.request = state.original.extRequest;
    removeUiEl("fonet-service-live-panel");
    removeUiEl("fsl-patient-modal");
    removeUiEl("fsl-notification-center");
    try {
      if (state.panelWindow && !state.panelWindow.closed) state.panelWindow.close();
    } catch (e) {}
    state.panelWindow = null;
    state.popupMode = false;
  }

  state.restore = restore;

  function exportPatients() {
    const safe = state.patients.map((p) => ({
      ...p,
      kimlikNo: p.kimlikNo ? "[MASKED]" : "",
      raw: ""
    }));
    return JSON.stringify({ patients: safe, requests: state.requests.slice(0, 30) }, null, 2);
  }

  function bridgePayload() {
    const payload = JSON.parse(exportPatients());
    payload.generatedAt = new Date().toISOString();
    payload.summary = {
      total: state.patients.length,
      changed: state.patients.filter((p) => p.changedText || p.changedLabels?.length).length,
      consultAnswered: state.patients.filter((p) => unseenRecentAnsweredConsults(p).length).length,
      lastMessage: state.lastMessage || ""
    };
    payload.changedPatients = state.patients
      .filter((p) => p.changedText || p.changedLabels?.length || unseenRecentAnsweredConsults(p).length)
      .map((p) => {
        const unseen = unseenRecentAnsweredConsults(p);
        return {
          key: displayKey(p),
          oda: p.oda,
          adSoyad: p.adSoyad,
          changedText: p.lastChangeText || p.changedText || (p.changedLabels || []).join(", ") || (unseen.length ? "Kons cevaplandı" : ""),
          changedDetail: p.lastChangeDetail || p.changedDetail || (unseen.length ? consultChangeDetail({}, { consults: unseen }) : ""),
          consultAnswered: unseen.length
        };
      })
      .filter((p) => p.changedText || p.changedDetail || p.consultAnswered);
    return payload;
  }

  function sendBridgeUpdate() {
    if (!state.bridgeUrl || !window.fetch) return;
    const now = Date.now();
    if (now - (state.bridgeLastSent || 0) < 3500) return;
    state.bridgeLastSent = now;

    try {
      fetch(state.bridgeUrl, {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bridgePayload())
      })
        .then((res) => { state.bridgeOnline = Boolean(res?.ok); })
        .catch(() => { state.bridgeOnline = false; });
    } catch (e) {
      state.bridgeOnline = false;
    }
  }

  async function copyExport() {
    const text = exportPatients();
    try {
      await navigator.clipboard.writeText(text);
      alert("Servis hasta listesi ve son endpoint ipuçları panoya kopyalandı.");
    } catch (e) {
      const out = uiEl("fsl-output");
      if (out) out.value = text;
    }
  }

  function todayConsultGroups() {
    const groups = new Map();
    state.patients.forEach((p) => {
      if (!patientMatchesSearch(p)) return;
      const key = p.key || patientKey(p);
      const todays = (p.consults || []).filter((c) => isTodayTr(c.date));
      if (!todays.length) return;
      const unseenKeys = new Set(unseenRecentAnsweredConsults(p).map(consultKey));
      const old = groups.get(key) || { p, key, items: [], latestTime: 0, unseenCount: 0 };
      todays.forEach((c) => {
        const ck = consultKey(c);
        if (old.items.some((x) => consultKey(x) === ck)) return;
        old.items.push(c);
        old.latestTime = Math.max(old.latestTime, parseTrDate(c.date));
        if (c.answer && unseenKeys.has(ck)) old.unseenCount += 1;
      });
      groups.set(key, old);
    });

    return Array.from(groups.values())
      .map((g) => ({
        ...g,
        answeredCount: g.items.filter(consultIsAnswered).length,
        pendingCount: g.items.filter((c) => !consultIsAnswered(c)).length
      }))
      .sort((a, b) => {
        const pendingPriority = Number(b.pendingCount > 0) - Number(a.pendingCount > 0);
        return pendingPriority || b.latestTime - a.latestTime;
      });
  }

  function consultTrackingCard() {
    const groups = todayConsultGroups();
    const total = groups.reduce((sum, g) => sum + g.items.length, 0);
    const answered = groups.reduce((sum, g) => sum + g.answeredCount, 0);
    const pending = groups.reduce((sum, g) => sum + g.pendingCount, 0);
    const rows = groups.slice(0, 18).map((g) => {
      const latest = g.items.slice().sort((a, b) => parseTrDate(b.date) - parseTrDate(a.date))[0] || {};
      const units = [...new Set(g.items.map((c) => clean(c.unit || "Kons")).filter(Boolean))].slice(0, 4).join(", ");
      const hasPending = g.pendingCount > 0;
      const color = hasPending ? "#f59e0b" : "#7c3aed";
      const background = hasPending ? "#fffbeb" : "#faf5ff";
      const status = hasPending
        ? `${g.pendingCount} bekleyen • ${g.answeredCount} cevaplandı`
        : `${g.answeredCount} cevaplandı${g.unseenCount ? ` • ${g.unseenCount} yeni` : ""}`;
      return `
        <button type="button" data-open-patient="${escapeHtml(g.key)}" style="text-align:left;border:1px solid #d7e2ea;border-left:5px solid ${color};border-radius:7px;background:${background};padding:8px;cursor:pointer;color:#0f172a;">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
            <b style="font-size:13px;">${escapeHtml(g.p.oda || "-")} ${escapeHtml(g.p.adSoyad || "")}</b>
            <span style="font-size:11px;background:${color};color:white;border-radius:5px;padding:2px 5px;white-space:nowrap;">${escapeHtml(status)}</span>
          </div>
          <div style="font-size:11px;color:#475569;margin-top:4px;">${escapeHtml(shortTime(latest.date) || "--:--")} | ${escapeHtml(units || "Kons")}</div>
          <div style="font-size:11px;color:#64748b;margin-top:3px;">Toplam ${g.items.length} kons | ${g.answeredCount} cevaplandı | ${g.pendingCount} bekleyen</div>
        </button>
      `;
    }).join("");

    return `
      <section id="fsl-consult-tracker" style="grid-column:1/-1;border:1px solid #cbd5e1;border-left:5px solid #7c3aed;border-radius:8px;background:white;padding:10px;">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:8px;">
          <div>
            <div style="font-weight:bold;color:#0f172a;">Bugünkü Kons Takibi</div>
            <div style="font-size:12px;color:#64748b;">Son 10 saatte atılan konslar gösterilir.</div>
          </div>
          <div style="font-size:12px;color:#334155;white-space:nowrap;">${total} kons | ${answered} cevap | ${pending} bekleyen</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px;">
          ${rows || `<div style="font-size:12px;color:#64748b;padding:8px;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:7px;">Bugün kayıtlı kons görünmüyor.</div>`}
        </div>
      </section>
    `;
  }

  function consultTrackingCardV16() {
    const t = activeTheme();
    const groups = todayConsultGroups();
    const total = groups.reduce((sum, g) => sum + g.items.length, 0);
    const answered = groups.reduce((sum, g) => sum + g.answeredCount, 0);
    const pending = groups.reduce((sum, g) => sum + g.pendingCount, 0);
    const rows = groups.slice(0, 18).map((g) => {
      const latest = g.items.slice().sort((a, b) => parseTrDate(b.date) - parseTrDate(a.date))[0] || {};
      const units = [...new Set(g.items.map((c) => clean(c.unit || "Kons")).filter(Boolean))].slice(0, 4).join(", ");
      const hasPending = g.pendingCount > 0;
      const color = hasPending ? "#f59e0b" : "#7c3aed";
      const background = hasPending ? "#fffbeb" : "#faf5ff";
      const status = hasPending
        ? `${g.pendingCount} bekleyen • ${g.answeredCount} cevaplandı`
        : `${g.answeredCount} cevaplandı${g.unseenCount ? ` • ${g.unseenCount} yeni` : ""}`;
      return `
        <button type="button" data-open-patient="${escapeHtml(g.key)}" style="text-align:left;border:1px solid ${t.border};border-left:5px solid ${color};border-radius:12px;background:${background};padding:10px;cursor:pointer;color:#0f172a;box-shadow:0 1px 2px rgba(15,23,42,.06);">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
            <b style="font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(g.p.oda || "-")} ${escapeHtml(g.p.adSoyad || "")}</b>
            <span style="font-size:11px;background:${color};color:white;border-radius:999px;padding:4px 7px;white-space:nowrap;font-weight:900;">${escapeHtml(status)}</span>
          </div>
          <div style="font-size:12px;color:${t.muted};margin-top:5px;">${escapeHtml(shortTime(latest.date) || "--:--")} | ${escapeHtml(units || "Kons")}</div>
          <div style="font-size:11px;color:${t.muted};margin-top:3px;">Toplam ${g.items.length} | ${g.answeredCount} cevaplandı | ${g.pendingCount} bekleyen</div>
        </button>
      `;
    }).join("");

    return `
      <section id="fsl-consult-tracker" style="grid-column:1/-1;border:1px solid ${t.border};border-left:6px solid ${t.purple};border-radius:14px;background:${t.surface2};padding:11px;color:${t.text};box-shadow:${t.shadow};">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:9px;">
          <div>
            <div style="font-weight:950;color:${t.text};font-size:15px;">Bugünkü Kons Takibi</div>
            <div style="font-size:12px;color:${t.muted};">Son 10 saatte atılan konslar gösterilir.</div>
          </div>
          <div style="font-size:12px;color:${t.text};white-space:nowrap;font-weight:900;">${total} kons | ${answered} cevap | ${pending} bekleyen</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(245px,1fr));gap:8px;">
          ${rows || `<div style="font-size:12px;color:${t.muted};padding:10px;background:${t.surface};border:1px dashed ${t.border};border-radius:10px;">Bugün kayıtlı kons görünmüyor.</div>`}
        </div>
      </section>
    `;
  }

  function patientCard(p) {
    const key = displayKey(p);
    const unseenConsults = unseenRecentAnsweredConsults(p);
    const latestConsult = unseenConsults[0] || (p.consults || []).find((x) => x.answer) || (p.consults || [])[0] || {};
    const latestRad = (p.radiology || [])[0] || {};
    const latestVital = (p.vitals || [])[0] || {};
    const dietInfo = compactDietInfo(p.diyet);
    const meta = extractCardMeta(p);
    const freeText = patientFreeText(p);
    const doctorCode = doctorInitials(p.doktor);
    const age = clean(p.yas).match(/\d+/)?.[0] || clean(p.yas);
    const ageSex = [age, sexShort(p.cinsiyet)].filter(Boolean).join("");
    const diagnosis = clip(p.tani || p.clinical?.split("\n").find(Boolean) || "", 110);
    const operation = operationBadge(p);
    const dietBadge = dietInfo.code && dietInfo.code !== "-" ? dietInfo.code : "";
    const riskBadge = clean(freeText.match(/sarı risk|kırmızı risk|yüksek risk|düşme riski/i)?.[0] || "").toLocaleUpperCase("tr-TR");
    const orderText = (p.orders || []).slice(0, 5).map((x) => clean(`${x.name} ${x.dose}`)).filter(Boolean).join(" + ");
    const consultText = latestConsult.answer
      ? `${latestConsult.unit || "Kons"} -> ${clip(latestConsult.answer, 90)}`
      : (latestConsult.unit ? `${latestConsult.unit}${latestConsult.request ? " -> " + clip(latestConsult.request, 80) : ""}` : "");
    const radText = latestRad.exam
      ? `${shortDate(latestRad.date)} ${latestRad.exam}${latestRad.reportText ? ": " + clip(latestRad.reportText, 90) : (latestRad.reportId ? " [rapor var]" : "")}`
      : "";
    const hasConsultAnswer = Boolean(unseenConsults.length);
    const hasUnreadUpdate = Boolean(p.changedText || (p.changedLabels || []).length);
    const changeText = hasUnreadUpdate ? (p.changedText || (p.changedLabels || []).join(", ") || "Güncellendi") : "";
    const newAdmission = isNewAdmissionAlert(p);
    const borderColor = newAdmission ? "#dc2626" : (hasUnreadUpdate ? "#f59e0b" : (hasConsultAnswer ? "#a855f7" : "#0ea5e9"));
    const background = newAdmission ? "#fef2f2" : (hasUnreadUpdate ? "#fffbeb" : (hasConsultAnswer ? "#faf5ff" : "white"));
    const ta = [latestVital.sys, latestVital.dia].filter(Boolean).join("/");
    const resp = latestVital.resp || extractInlineValue(freeText, [/\bSS\s*[:\-]?\s*(\d+)/i, /solunum\s*[:\-]?\s*(\d+)/i]);
    const pain = latestVital.pain || extractInlineValue(freeText, [/ağr[ıi]\s*[:\-]?\s*(\d+\s*\/\s*10|\d+)/i, /\bVAS\s*[:\-]?\s*(\d+\s*\/\s*10|\d+)/i]);
    const followItems = extractFollowItems(p);
    const facts = [
      ["BH", meta.bh],
      ["Kİ", meta.ki],
      ["GO", meta.go],
      ["Alerji", meta.allergy],
      ["ASA", meta.asa],
      ...(meta.destination ? [["Yer", meta.destination]] : [])
    ];

    return `
      <article data-card="${escapeHtml(key)}" draggable="true" title="Kartı taşımak için sürükle, sağ alttan yüksekliğini değiştir." style="position:relative;border:1px solid #d7e2ea;border-left:5px solid ${borderColor};border-radius:10px;background:${background};padding:9px;height:${state.cardHeight || 250}px;box-sizing:border-box;cursor:pointer;resize:vertical;overflow:auto;font-family:Arial,sans-serif;box-shadow:0 6px 16px rgba(15,23,42,.10);will-change:transform;">
        <div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:start;border-bottom:1px solid #e2e8f0;padding-bottom:7px;">
          <div style="min-width:0;">
            <div style="display:flex;align-items:baseline;gap:7px;min-width:0;">
              <span style="font-size:17px;font-weight:900;color:#0b3f91;line-height:1;white-space:nowrap;">${escapeHtml(doctorCode)}-${escapeHtml(p.oda || "-")}</span>
              <span style="font-size:18px;font-weight:900;color:#111827;line-height:1.05;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml([p.adSoyad, ageSex].filter(Boolean).join(", "))}</span>
            </div>
            <div style="font-size:11px;color:#334155;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(diagnosis || p.birim || "")}</div>
            <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;margin-top:7px;">
              ${iconTile("TA", ta, "TA", "#0b3f91")}
              ${iconTile("Nabız", latestVital.pulse || "", "N", "#2563eb")}
              ${iconTile("Ateş", latestVital.temp || "", "C", "#dc2626")}
              ${iconTile("SpO2", latestVital.spo2 ? `${latestVital.spo2}%` : "", "O2", "#0891b2")}
              ${iconTile("SS", resp, "SS", "#0f766e")}
              ${iconTile("Ağrı", pain, "A", "#9333ea")}
            </div>
            <div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px;margin-top:6px;">
              ${labTilesHtml(p.labs)}
            </div>
            ${glucoseCheckHtml(p)}
          </div>
          <div style="display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end;max-width:104px;">
            ${operation ? `<span style="font-size:11px;font-weight:800;border:1px solid #1d4ed8;color:#1e3a8a;background:#eff6ff;border-radius:7px;padding:5px 7px;">${escapeHtml(operation)}</span>` : ""}
            ${dietBadge ? `<span style="font-size:11px;font-weight:800;border:1px solid #64748b;color:#334155;background:#f8fafc;border-radius:7px;padding:5px 7px;">${escapeHtml(dietBadge)}</span>` : ""}
            ${riskBadge ? `<span style="font-size:11px;font-weight:800;background:#facc15;color:#111827;border-radius:7px;padding:5px 7px;">${escapeHtml(riskBadge)}</span>` : ""}
            ${newAdmission ? `<span style="font-size:11px;font-weight:800;background:#dc2626;color:white;border-radius:7px;padding:5px 7px;">Yeni yatış</span>` : ""}
            ${hasConsultAnswer ? `<span style="font-size:11px;font-weight:800;background:#a855f7;color:white;border-radius:7px;padding:5px 7px;">Kons</span>` : ""}
            ${changeText ? `<span style="font-size:11px;font-weight:800;background:#f59e0b;color:#111827;border-radius:7px;padding:5px 7px;">${escapeHtml(changeText)}</span>` : ""}
            ${p.loading ? `<span style="font-size:10px;background:#fef3c7;color:#92400e;border-radius:6px;padding:4px 6px;">yükleniyor</span>` : ""}
          </div>
        </div>

        <div style="display:flex;gap:7px;flex-wrap:wrap;border-bottom:1px solid #e2e8f0;padding:6px 0;color:#111827;font-size:11px;">
          ${facts.map(([label, value]) => `<div style="padding-right:7px;border-right:1px solid #e2e8f0;max-width:170px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><b>${escapeHtml(label)}:</b> ${escapeHtml(value || "-")}</div>`).join("")}
        </div>

        ${followItems.length ? `<div style="display:flex;flex-wrap:wrap;gap:0;margin-top:7px;border:1px solid #e2e8f0;border-radius:7px;overflow:hidden;background:#fff;">
          ${followItems.map((x) => `<div style="font-size:11px;padding:5px 7px;border-right:1px solid #e2e8f0;"><b>${escapeHtml(x.label)}:</b> ${escapeHtml(x.value)}</div>`).join("")}
        </div>` : ""}

        <div style="border-radius:7px;overflow:hidden;margin-top:7px;border-bottom:1px solid #e2e8f0;font-size:11px;">
          ${summaryRowHtml("G", "Görüntüleme", radText)}
          ${summaryRowHtml("K", "Konsültasyon", consultText)}
          ${summaryRowHtml("O", "Order", orderText)}
        </div>

        ${meta.plan ? `<div style="display:grid;grid-template-columns:24px 78px 1fr;gap:6px;align-items:center;margin-top:7px;border:1px solid #f59e0b;border-radius:8px;background:#fffbeb;padding:6px;">
          <div style="font-size:16px;color:#d97706;text-align:center;">✓</div>
          <div style="font-size:12px;font-weight:800;color:#111827;">Plan:</div>
          <div style="font-size:12px;color:#1f2937;">${escapeHtml(meta.plan)}</div>
        </div>` : ""}

        ${p.errors?.length ? `<pre style="margin:10px 0 0;white-space:pre-wrap;font:11px/1.3 Arial,sans-serif;color:#b91c1c;background:#fff1f2;border:1px solid #fecdd3;border-radius:8px;padding:8px;">${escapeHtml(p.errors.slice(0, 3).join("\n"))}</pre>` : ""}
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
          <button data-refresh="${escapeHtml(key)}" style="background:#0ea5e9;color:white;border:0;border-radius:6px;padding:5px 7px;cursor:pointer;font-size:11px;">Detay Yenile</button>
          <span style="font-size:11px;color:#64748b;">${escapeHtml([p.updatedAt, p.yatis ? "Yatış " + shortDate(p.yatis) : "", p.doktor || ""].filter(Boolean).join(" | "))}</span>
        </div>
      </article>
    `;
  }

  function patientAgeSex(p) {
    const rawAge = clean(p.yas);
    let age = "";
    const exact = rawAge.match(/^(?:ya[şs]\s*)?(1[01]\d|120|[1-9]\d?)$/i);
    const loose = rawAge.match(/\b(1[01]\d|120|[1-9]\d?)\b/);
    const n = Number((exact || loose || [])[1]);
    if (Number.isFinite(n) && n > 0 && n <= 120) age = String(n);
    const sex = sexShort(p.cinsiyet);
    return `${age}${sex}`.trim();
  }

  function statusPill(text, color, bg, textColor = "#fff") {
    if (!text) return "";
    return `<span style="font-size:11px;font-weight:900;line-height:1;border:1px solid ${color};background:${bg || color};color:${textColor};border-radius:999px;padding:6px 8px;white-space:nowrap;box-shadow:0 1px 2px rgba(15,23,42,.12);">${escapeHtml(text)}</span>`;
  }

  function vitalTileV16(label, value, icon, color, t) {
    return `
      <div style="display:grid;grid-template-columns:26px minmax(0,1fr);align-items:center;gap:6px;border:1px solid ${t.tileBorder};border-radius:10px;background:${t.tile};padding:7px;min-width:0;">
        <div style="width:26px;height:26px;border-radius:8px;background:${color};color:white;display:grid;place-items:center;font-size:10px;font-weight:900;letter-spacing:0;">${escapeHtml(icon)}</div>
        <div style="min-width:0;">
          <div style="font-size:10px;color:${t.primary2};font-weight:900;line-height:1;white-space:nowrap;">${escapeHtml(label)}</div>
          <div style="font-size:22px;color:${t.text};font-weight:950;line-height:1.05;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(value || "-")}</div>
        </div>
      </div>
    `;
  }

  function labTileV16(label, value, trend = "", danger = false, t = activeTheme()) {
    const shown = value || "-";
    const color = danger || trend ? t.danger : t.text;
    return `
      <div style="border:1px solid ${t.border};border-radius:8px;background:${t.surface};padding:5px 5px;text-align:center;min-width:0;box-shadow:0 1px 2px rgba(15,23,42,.06);">
        <div style="font-size:10px;color:${t.primary2};font-weight:900;line-height:1;">${escapeHtml(label)}</div>
        <div style="font-size:15px;font-weight:950;color:${color};line-height:1.08;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(String(shown))}${trend ? ` <span>${escapeHtml(trend)}</span>` : ""}</div>
      </div>
    `;
  }

  function labTilesHtmlV16(labs, t) {
    const one = (key, label, dangerFn = () => false) => {
      const list = labs?.[key] || [];
      const value = latestValue(list);
      return labTileV16(label, value, trendMark(list), dangerFn(Number(String(value).replace(",", "."))), t);
    };
    return [
      one("WBC", "WBC"),
      one("Hb", "Hb", (v) => v && v < 12),
      one("PLT", "Plt"),
      one("Kre", "Kre", (v) => v && v > 1.3),
      one("CRP", "CRP", (v) => v && v > 5),
      one("PCT", "PCT", (v) => v && v > 0.5),
      one("Glu", "Glu", (v) => v && (v < 70 || v > 180)),
      one("Na", "Na", (v) => v && (v < 135 || v > 145)),
      one("K", "K", (v) => v && (v < 3.5 || v > 5.2)),
      one("P", "P", (v) => v && (v < 2.5 || v > 4.5))
    ].join("");
  }

  function microInfo(label, value, t) {
    return `
      <div style="min-width:0;padding:5px 8px;border-right:1px solid ${t.border};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
        <b style="color:${t.primary2};">${escapeHtml(label)}:</b> ${escapeHtml(value || "-")}
      </div>
    `;
  }

  function summaryRowHtmlV16(icon, label, text, t) {
    if (!text) return "";
    return `
      <div style="display:grid;grid-template-columns:25px 92px minmax(0,1fr);gap:7px;align-items:start;border:1px solid ${t.border};border-bottom:0;padding:6px 7px;background:${t.surface};">
        <div style="width:23px;height:23px;border-radius:7px;background:${t.tile};color:${t.primary2};font-weight:950;text-align:center;display:grid;place-items:center;font-size:11px;">${escapeHtml(icon)}</div>
        <div style="color:${t.primary2};font-weight:900;white-space:nowrap;">${escapeHtml(label)}:</div>
        <div style="color:${t.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(text)}</div>
      </div>
    `;
  }

  function actionButtonHtml(id, text, color) {
    return `<button id="${id}" style="background:${color};color:white;border:0;border-radius:8px;padding:9px 12px;cursor:pointer;font-weight:800;font-size:13px;line-height:1;">${escapeHtml(text)}</button>`;
  }

  function detailBlockV16(title, text, t, icon = "") {
    return `
      <section style="border:1px solid ${t.border};border-left:5px solid ${t.primary};border-radius:12px;background:${t.surface};padding:11px;min-width:0;box-shadow:0 1px 2px rgba(15,23,42,.05);">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;">
          ${icon ? `<div style="width:24px;height:24px;border-radius:8px;background:${t.tile};color:${t.primary2};display:grid;place-items:center;font-size:12px;font-weight:900;">${escapeHtml(icon)}</div>` : ""}
          <div style="font-size:12px;color:${t.primary2};font-weight:950;text-transform:uppercase;letter-spacing:.02em;">${escapeHtml(title)}</div>
        </div>
        <pre style="margin:0;white-space:pre-wrap;font:13px/1.35 Arial,sans-serif;color:${t.text};max-height:190px;overflow:auto;">${escapeHtml(text || "-")}</pre>
      </section>
    `;
  }

  function patientCardV16(p) {
    const t = activeTheme();
    const key = displayKey(p);
    const unseenConsults = unseenRecentAnsweredConsults(p);
    const latestConsult = unseenConsults[0] || (p.consults || []).find((x) => x.answer) || (p.consults || [])[0] || {};
    const latestRad = (p.radiology || [])[0] || {};
    const latestVital = (p.vitals || [])[0] || {};
    const dietInfo = compactDietInfo(p.diyet);
    const meta = extractCardMeta(p);
    const freeText = patientFreeText(p);
    const doctorCode = doctorInitials(p.doktor);
    const ageSex = patientAgeSex(p);
    const diagnosis = clip(p.tani || p.clinical?.split("\n").find(Boolean) || p.birim || "", 86);
    const operation = operationBadge(p);
    const dietBadge = dietInfo.code && dietInfo.code !== "-" ? dietInfo.code : "";
    const riskBadge = clean(freeText.match(/sarÄ± risk|kÄ±rmÄ±zÄ± risk|yÃ¼ksek risk|dÃ¼ÅŸme riski/i)?.[0] || "").toLocaleUpperCase("tr-TR");
    const orderText = (p.orders || []).slice(0, 4).map((x) => clean(`${x.name} ${x.dose}`)).filter(Boolean).join(" + ");
    const consultText = latestConsult.answer
      ? `${latestConsult.unit || "Kons"} -> ${clip(latestConsult.answer, 78)}`
      : (latestConsult.unit ? `${latestConsult.unit}${latestConsult.request ? " -> " + clip(latestConsult.request, 72) : ""}` : "");
    const radText = latestRad.exam
      ? `${shortDate(latestRad.date)} ${latestRad.exam}${latestRad.reportText ? ": " + clip(latestRad.reportText, 74) : (latestRad.reportId ? " [rapor var]" : "")}`
      : "";
    const hasConsultAnswer = Boolean(unseenConsults.length);
    const hasUnreadUpdate = Boolean(p.changedText || (p.changedLabels || []).length);
    const changeText = hasUnreadUpdate ? clip(p.changedText || (p.changedLabels || []).join(", ") || "Güncellendi", 42) : "";
    const newAdmission = isNewAdmissionAlert(p);
    const borderColor = newAdmission ? t.danger : (hasUnreadUpdate ? t.accent : (hasConsultAnswer ? t.purple : t.primary));
    const background = newAdmission
      ? "linear-gradient(180deg,#fff7f7 0%,#fff 78%)"
      : (hasConsultAnswer
        ? `linear-gradient(180deg,${t.surface2} 0%,${t.surface} 72%)`
        : `linear-gradient(180deg,${t.surface} 0%,${t.surface2} 100%)`);
    const ta = [latestVital.sys, latestVital.dia].filter(Boolean).join("/");
    const resp = latestVital.resp || extractInlineValue(freeText, [/\bSS\s*[:\-]?\s*(\d+)/i, /solunum\s*[:\-]?\s*(\d+)/i]);
    const pain = latestVital.pain || extractInlineValue(freeText, [/aÄŸr[Ä±i]\s*[:\-]?\s*(\d+\s*\/\s*10|\d+)/i, /\bVAS\s*[:\-]?\s*(\d+\s*\/\s*10|\d+)/i]);
    const followItems = extractFollowItems(p).slice(0, 5);
    const facts = [
      ["BH", meta.bh],
      ["KI", meta.ki],
      ["GO", meta.go],
      ["Alerji", meta.allergy],
      ["ASA", meta.asa]
    ];
    const chips = [
      operation ? statusPill(operation, t.primary2, t.tile, t.primary2) : "",
      dietBadge ? statusPill(dietBadge, t.border, t.surface2, t.text) : "",
      riskBadge ? statusPill(riskBadge, "#facc15", "#facc15", "#111827") : "",
      newAdmission ? statusPill("Yeni yatış", t.danger, t.danger) : "",
      hasConsultAnswer ? statusPill("Kons cevap", t.purple, t.purple) : "",
      changeText ? statusPill(changeText, t.accent, t.accent, "#111827") : "",
      p.loading ? statusPill("yükleniyor", "#fbbf24", "#fef3c7", "#92400e") : ""
    ].filter(Boolean).join("");

    return `
      <article data-card="${escapeHtml(key)}" draggable="true" title="KartÄ± taÅŸÄ±mak iÃ§in sÃ¼rÃ¼kle, saÄŸ alttan yÃ¼ksekliÄŸini deÄŸiÅŸtir." style="position:relative;border:1px solid ${t.border};border-left:6px solid ${borderColor};border-radius:14px;background:${background};color:${t.text};padding:10px;height:${state.cardHeight || 248}px;box-sizing:border-box;cursor:pointer;resize:vertical;overflow:auto;font-family:Arial,sans-serif;box-shadow:${t.shadow};will-change:transform;">
        <div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:start;border-bottom:1px solid ${t.border};padding-bottom:7px;">
          <div style="min-width:0;">
            <div style="display:flex;align-items:center;gap:8px;min-width:0;">
              <div style="font-size:18px;font-weight:950;color:${t.primary2};line-height:1;white-space:nowrap;">${escapeHtml(doctorCode)}-${escapeHtml(p.oda || "-")}</div>
              <div style="font-size:21px;font-weight:950;color:${t.text};line-height:1.02;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(p.adSoyad || "")}${ageSex ? `, ${escapeHtml(ageSex)}` : ""}</div>
            </div>
            <div style="font-size:12px;color:${t.muted};margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(diagnosis || "-")}</div>
          </div>
          <div style="display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end;max-width:168px;">${chips}</div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:8px;">
          ${vitalTileV16("TA", ta, "TA", "#0b3f91", t)}
          ${vitalTileV16("Nabız", latestVital.pulse || "", "N", "#2563eb", t)}
          ${vitalTileV16("Ateş", latestVital.temp || "", "C", "#dc2626", t)}
          ${vitalTileV16("SpO2", latestVital.spo2 ? `${latestVital.spo2}%` : "", "O2", "#0891b2", t)}
          ${vitalTileV16("SS", resp, "SS", "#0f766e", t)}
          ${vitalTileV16("Ağrı", pain, "A", "#9333ea", t)}
        </div>

        <div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin-top:7px;">
          ${labTilesHtmlV16(p.labs, t)}
        </div>
        ${glucoseCheckHtml(p, t)}

        <div style="display:flex;gap:0;overflow:hidden;border:1px solid ${t.border};border-radius:9px;background:${t.surface};margin-top:8px;color:${t.text};font-size:11px;">
          ${facts.map(([label, value]) => microInfo(label, clip(value || "-", 32), t)).join("")}
        </div>

        ${followItems.length ? `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:7px;">
          ${followItems.map((x) => `<span style="font-size:11px;padding:5px 7px;border:1px solid ${t.border};border-radius:999px;background:${t.surface};color:${t.text};"><b style="color:${t.primary2};">${escapeHtml(x.label)}:</b> ${escapeHtml(x.value)}</span>`).join("")}
        </div>` : ""}

        <div style="border-radius:9px;overflow:hidden;margin-top:8px;font-size:11px;">
          ${summaryRowHtmlV16("G", "Görüntüleme", radText, t)}
          ${summaryRowHtmlV16("K", "Konsültasyon", consultText, t)}
          ${summaryRowHtmlV16("O", "Order", orderText, t)}
        </div>

        ${meta.plan ? `<div style="display:grid;grid-template-columns:26px 80px minmax(0,1fr);gap:7px;align-items:center;margin-top:8px;border:1px solid ${t.accent};border-radius:10px;background:${t.surface2};padding:7px;">
          <div style="width:24px;height:24px;border-radius:8px;background:${t.accent};color:#111827;display:grid;place-items:center;font-weight:950;">P</div>
          <div style="font-size:12px;font-weight:950;color:${t.text};">Plan:</div>
          <div style="font-size:12px;color:${t.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(meta.plan)}</div>
        </div>` : ""}

        ${p.errors?.length ? `<pre style="margin:8px 0 0;white-space:pre-wrap;font:11px/1.3 Arial,sans-serif;color:${t.danger};background:#fff1f2;border:1px solid #fecdd3;border-radius:8px;padding:7px;">${escapeHtml(p.errors.slice(0, 3).join("\n"))}</pre>` : ""}
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;gap:8px;">
          <button data-refresh="${escapeHtml(key)}" style="background:${t.primary};color:white;border:0;border-radius:8px;padding:6px 8px;cursor:pointer;font-size:11px;font-weight:900;">Detay Yenile</button>
          <span style="font-size:11px;color:${t.muted};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml([p.updatedAt, p.yatis ? "Yatış " + shortDate(p.yatis) : "", p.doktor || ""].filter(Boolean).join(" | "))}</span>
        </div>
      </article>
    `;
  }

  function openPatientDetailV16(key) {
    const p = state.patients.find((x) => displayKey(x) === key);
    if (!p) return;
    state.selectedKey = key;
    markPatientNotificationsRead(key);
    acknowledgeConsults(p);
    acknowledgePatientUpdates(p);
    render();

    const t = activeTheme();
    let modal = uiEl("fsl-patient-modal");
    if (!modal) {
      modal = uiDocument().createElement("div");
      modal.id = "fsl-patient-modal";
      uiDocument().body.appendChild(modal);
    }

    const visit = fullVisitText(p);
    const dietInfo = compactDietInfo(p.diyet);
    const meta = extractCardMeta(p);
    const latestVital = (p.vitals || [])[0] || {};
    const ta = [latestVital.sys, latestVital.dia].filter(Boolean).join("/");
    const resp = latestVital.resp || "";
    const pain = latestVital.pain || "";
    const ageSex = patientAgeSex(p);
    const operation = operationBadge(p);
    const quickVitals = [
      ["TA", ta],
      ["Nabız", latestVital.pulse],
      ["Ateş", latestVital.temp],
      ["SpO2", latestVital.spo2 ? `${latestVital.spo2}%` : ""],
      ["SS", resp],
      ["Ağrı", pain]
    ];

    modal.style.cssText = `
      position:fixed;
      inset:34px 50px;
      z-index:2147483647;
      background:${t.bg};
      color:${t.text};
      border:1px solid ${t.border};
      border-radius:16px;
      box-shadow:0 28px 90px rgba(15,23,42,.55);
      display:grid;
      grid-template-rows:auto 1fr;
      overflow:hidden;
      font-family:Arial,sans-serif;
    `;

    modal.innerHTML = `
      <header style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:14px 16px;background:${t.header};color:${t.headerText};border-bottom:1px solid ${t.border};">
        <div style="min-width:0;">
          <div style="display:flex;align-items:center;gap:10px;min-width:0;">
            <div style="font-size:24px;font-weight:950;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(p.oda || "-")} ${escapeHtml(p.adSoyad || "")}${ageSex ? `, ${escapeHtml(ageSex)}` : ""}</div>
            ${operation ? statusPill(operation, t.primary, t.tile, t.primary2) : ""}
            ${dietInfo.code && dietInfo.code !== "-" ? statusPill(dietInfo.code, t.border, t.surface2, t.text) : ""}
          </div>
          <div style="font-size:12px;color:${t.muted === "#475569" ? "#bfdbfe" : t.muted};margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml([p.birim, p.doktor].filter(Boolean).join(" | "))}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">
          ${actionButtonHtml("fsl-modal-visit", "Vizit Kağıdı", t.accent)}
          ${actionButtonHtml("fsl-modal-refresh", "Detay Yenile", t.primary)}
          ${actionButtonHtml("fsl-modal-copy-labs", "Kan/Vital Tablo", "#7c3aed")}
          ${actionButtonHtml("fsl-modal-copy-labs-text", "Kan/Vital Metin", "#0f766e")}
          ${actionButtonHtml("fsl-modal-order-yarin", "Order Yarın", "#f97316")}
          ${actionButtonHtml("fsl-modal-copy", "Kopyala", t.success)}
          ${actionButtonHtml("fsl-modal-close", "Kapat", t.danger)}
        </div>
      </header>
      <section style="display:grid;grid-template-columns:minmax(440px,1.04fr) minmax(420px,.96fr);gap:14px;padding:14px;overflow:auto;background:${t.bg};">
        <div style="display:grid;grid-template-rows:auto 1fr;gap:10px;min-width:0;min-height:0;">
          <div style="display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:7px;">
            ${quickVitals.map(([label, value]) => labTileV16(label, value || "-", "", false, t)).join("")}
          </div>
          <textarea id="fsl-modal-text" style="width:100%;height:100%;min-height:620px;background:#ffffff;color:#111827;border:1px solid ${t.border};border-radius:12px;padding:14px;font:14px/1.43 Arial,sans-serif;box-sizing:border-box;box-shadow:0 1px 2px rgba(15,23,42,.06);">${escapeHtml(visit)}</textarea>
        </div>
        <div style="display:grid;gap:10px;align-content:start;min-width:0;">
          ${detailBlockV16("Klinik Özet", `TANI:${p.tani || "-"}\nYatış:${p.yatis || "-"}\nBH:${meta.bh || "-"}\nKI:${meta.ki || "-"}\nGO:${meta.go || "-"}\nAlerji:${meta.allergy || "-"}\nASA:${meta.asa || "-"}${meta.destination ? "\nYer:" + meta.destination : ""}`, t, "O")}
          ${detailBlockV16("Diyet", `Kart:${dietInfo.code}${dietInfo.extra ? "\nEk:" + dietInfo.extra : ""}\nHam:${p.diyet || "-"}`, t, "D")}
          ${detailBlockV16("Lab", `Tarih:${p.labDate || "-"}\n${labLine(p.labs) || "-"}`, t, "L")}
          ${p.glucoseChecks?.length ? detailBlockV16("Glukotest", glucoseCheckText(p, 12), t, "G") : ""}
          ${detailBlockV16("Görüntüleme", formatRadiology(p.radiology, 12, 1200) || "-", t, "G")}
          ${detailBlockV16("Konsültasyon", (p.consults || []).map((x) => `${x.unit || "Kons"}${x.date ? " | " + x.date : ""}\n${x.answer || x.request || "-"}`).join("\n---\n") || "-", t, "K")}
          ${detailBlockV16("Order", (p.orders || []).map((x) => `${x.name} ${x.dose}`).join("\n") || "-", t, "Rx")}
          ${detailBlockV16("Hemşire / Devir", (p.nursing || []).map((x) => `${x.date || ""}\n${x.text || ""}`).join("\n---\n") || "-", t, "N")}
          ${p.errors?.length ? detailBlockV16("Hatalar", p.errors.join("\n"), t, "!") : ""}
          <details style="border:1px solid ${t.border};border-radius:10px;background:${t.surface};padding:9px;color:${t.text};">
            <summary style="cursor:pointer;font-size:12px;font-weight:900;color:${t.primary2};">Teknik bilgiler</summary>
            <pre style="white-space:pre-wrap;font:12px/1.35 Arial,sans-serif;margin:8px 0 0;color:${t.text};">BS:${escapeHtml(p.birimSevkId || "-")} HG:${escapeHtml(p.hastaGelisId || "-")} H:${escapeHtml(p.hastaId || "-")}</pre>
          </details>
        </div>
      </section>
    `;

    uiEl("fsl-modal-close").onclick = () => modal.remove();
    uiEl("fsl-modal-visit").onclick = async () => {
      if (!p.labs || !Object.keys(p.labs).length || !p.consults?.length) {
        await refreshPatientDetails(p);
      }
      const textArea = uiEl("fsl-modal-text");
      if (textArea) textArea.value = visitPaperText(p);
    };
    uiEl("fsl-modal-refresh").onclick = async () => {
      await refreshPatientDetails(p);
      openPatientDetailV16(key);
    };
    uiEl("fsl-modal-copy").onclick = async () => {
      const text = uiEl("fsl-modal-text").value;
      await copyVisitPaper(p, text);
    };
    const copyLabsButton = uiEl("fsl-modal-copy-labs");
    if (copyLabsButton) copyLabsButton.onclick = async () => {
      if (!p.labs || !Object.keys(p.labs).length || !p.vitals?.length) {
        await refreshPatientDetails(p);
      }
      await copyLabVitals(p);
    };
    const copyLabsTextButton = uiEl("fsl-modal-copy-labs-text");
    if (copyLabsTextButton) copyLabsTextButton.onclick = async () => {
      if (!p.labs || !Object.keys(p.labs).length || !p.vitals?.length) {
        await refreshPatientDetails(p);
      }
      await copyLabVitalsPlain(p);
    };
    const orderTomorrowButton = uiEl("fsl-modal-order-yarin");
    orderTomorrowButton?.remove();
    if (orderTomorrowButton) orderTomorrowButton.onclick = async () => {
      const textArea = uiEl("fsl-modal-text");
      try {
        orderTomorrowButton.textContent = "Order okunuyor...";
        await fetchOrders(p);
        const text = patientOrderTomorrowText(p);
        if (textArea) textArea.value = text;
        await copyPlainText(text);
        state.lastMessage = "Order metni kopyalandı.";
        const draft = buildPatientOrderDraft(p);
        if (draft.missing?.length) {
          const message = `AKTARIM DURDU: ${draft.missing.length} satırın FONET ham bilgisi eksik:\n- ${draft.missing.join("\n- ")}`;
          if (textArea) textArea.value = `${text}\n\n---\n${message}`;
          alert(message);
          return;
        }
        if (!draft.eorderList.length) {
          alert("Aktarılacak ilaç/takip orderı bulunamadı.");
          return;
        }
        const ok = confirm(`${draft.targetDate} tarihine ${draft.eorderList.length} satır TASLAK order aktarılsın mı?\n\nE-imza veya Tedavi Uygula yapılmayacak. Aktarımdan sonra order ekranında kontrol et.`);
        if (!ok) return;
        orderTomorrowButton.textContent = "Aktarılıyor...";
        const sent = await transferPatientOrdersTomorrow(p);
        if (sent.notCopied?.length) {
          alert(`${sent.targetDate} icin ${sent.eorderList.length}/${sent.expected || sent.eorderList.length} satir gonderildi.\n\nKopyalanmayan:\n- ${sent.notCopied.join("\n- ")}`);
        }
        state.lastMessage = `${draft.targetDate} için ${draft.eorderList.length} satır taslak order gönderildi.`;
        if (textArea) textArea.value = `${text}\n\n---\n${draft.targetDate} için ${draft.eorderList.length} satır TASLAK order FONET'e gönderildi. Order ekranında tarihi ${draft.targetDate} yapıp kontrol et.`;
        alert(`${draft.targetDate} için taslak order gönderildi. Lütfen order ekranında kontrol et.`);
      } catch (e) {
        alert(`Order yarın işlemi olmadı: ${e?.message || e}`);
      } finally {
        orderTomorrowButton.textContent = "Order Yarın";
      }
    };

    if (!(p.labs && Object.keys(p.labs).length) && !p.loading) {
      refreshPatientDetails(p).then(() => {
        if (uiEl("fsl-patient-modal") && state.selectedKey === key) openPatientDetailV16(key);
      });
    }
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function notificationTime(value) {
    const date = new Date(Number(value || 0));
    if (!Number.isFinite(date.getTime())) return "";
    return date.toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function updateNotificationButton() {
    const button = uiEl("fsl-notifications");
    if (!button) return;
    const count = unreadNotificationCount();
    const t = activeTheme();
    button.textContent = count ? `Bildirimler (${count})` : "Bildirimler";
    button.style.background = count ? t.accent : "#334155";
    button.style.color = count ? "#111827" : "#ffffff";
  }

  function renderNotificationBar() {
    const bar = uiEl("fsl-notification-bar");
    if (!bar) return;
    const t = activeTheme();
    const unread = unreadNotificationCount();
    const recent = state.notificationLog
      .filter(Boolean)
      .slice()
      .sort((a, b) => Number(b.at || 0) - Number(a.at || 0))
      .slice(0, 8);

    const chips = recent.map((item) => {
      const style = notificationStyle(item.kind);
      const read = Boolean(item.read);
      const patient = [item.oda, item.adSoyad].filter(Boolean).join(" ") || "Hasta";
      const countText = Number(item.count || 1) > 1 ? ` x${Number(item.count || 1)}` : "";
      return `
        <button type="button" data-notification-chip="${escapeHtml(item.id)}" title="${escapeHtml(item.detail || item.summary || item.title || "")}" style="min-width:220px;max-width:340px;height:42px;text-align:left;border:1px solid ${read ? t.border : style.color};border-left:5px solid ${read ? "#94a3b8" : style.color};border-radius:9px;background:${read ? t.surface : style.soft};color:${t.text};padding:6px 9px;cursor:pointer;display:grid;grid-template-rows:auto auto;gap:2px;overflow:hidden;opacity:${read ? ".78" : "1"};">
          <span style="font-size:11px;font-weight:950;color:${read ? t.muted : style.color};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(item.title || style.title)}${escapeHtml(countText)} · ${escapeHtml(notificationTime(item.at))}</span>
          <span style="font-size:12px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(patient)}: ${escapeHtml(item.summary || item.title || "Guncelleme")}</span>
        </button>
      `;
    }).join("");

    bar.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;min-width:0;">
        <button id="fsl-notification-read-all-inline" title="Tum bildirimleri okundu yap" style="height:32px;border:0;border-radius:8px;background:${unread ? t.accent : "#64748b"};color:${unread ? "#111827" : "white"};padding:0 10px;font-size:12px;font-weight:950;cursor:pointer;white-space:nowrap;">${unread ? `${unread} yeni` : "Bildirim yok"}</button>
        <div style="display:flex;gap:7px;overflow:auto;padding-bottom:1px;min-width:0;scrollbar-width:thin;">
          ${chips || `<div style="height:42px;display:flex;align-items:center;color:${t.muted};font-size:12px;border:1px dashed ${t.border};border-radius:9px;background:${t.surface};padding:0 12px;">Yeni bildirimler burada gorunecek.</div>`}
        </div>
      </div>
    `;

    Array.from(bar.querySelectorAll("[data-notification-chip]")).forEach((chip) => {
      chip.onclick = () => {
        const item = state.notificationLog.find((x) => x?.id === chip.dataset.notificationChip);
        if (!item) return;
        markNotificationRead(item.id);
        render();
        openPatientDetailV16(item.key);
      };
    });
    const readAll = uiEl("fsl-notification-read-all-inline");
    if (readAll) {
      readAll.onclick = () => {
        if (unread) markAllNotificationsRead();
        else openNotificationCenter();
        render();
      };
    }
  }

  function openNotificationCenter() {
    removeUiEl("fsl-notification-center");
    const doc = uiDocument();
    const t = activeTheme();
    const modal = doc.createElement("div");
    modal.id = "fsl-notification-center";
    modal.style.cssText = `
      position:fixed;
      inset:34px max(34px,calc((100vw - 980px)/2));
      z-index:2147483647;
      display:grid;
      grid-template-rows:auto 1fr;
      overflow:hidden;
      border:1px solid ${t.border};
      border-radius:14px;
      background:${t.bg};
      color:${t.text};
      box-shadow:0 30px 90px rgba(15,23,42,.55);
      font-family:Arial,sans-serif;
    `;

    const rows = state.notificationLog.map((item) => {
      const style = notificationStyle(item.kind);
      const read = Boolean(item.read);
      return `
        <article data-notification="${escapeHtml(item.id)}" style="border:1px solid ${read ? t.border : style.color};border-left:6px solid ${read ? "#94a3b8" : style.color};border-radius:10px;background:${read ? t.surface : style.soft};padding:11px;cursor:pointer;opacity:${read ? ".72" : "1"};">
          <div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:start;">
            <div>
              <div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap;">
                ${read ? "" : `<span style="width:8px;height:8px;border-radius:50%;background:${style.color};display:inline-block;"></span>`}
                <b style="font-size:14px;color:${read ? t.muted : style.color};">${escapeHtml(item.title || style.title)}</b>
                <span style="font-size:11px;color:${t.muted};">${read ? "Okundu" : "Yeni"}</span>
              </div>
              <div style="font-size:17px;font-weight:950;color:${t.text};margin-top:5px;">${escapeHtml([item.oda, item.adSoyad].filter(Boolean).join(" ") || "Hasta")}</div>
            </div>
            <span style="font-size:11px;color:${t.muted};white-space:nowrap;">${escapeHtml(notificationTime(item.at))}</span>
          </div>
          <div style="font-size:13px;font-weight:900;color:${t.text};margin-top:7px;">${escapeHtml(item.summary || item.title || "Güncelleme")}</div>
          ${item.detail ? `<pre style="margin:6px 0 0;white-space:pre-wrap;font:12px/1.38 Arial,sans-serif;color:${t.muted};max-height:180px;overflow:auto;">${escapeHtml(item.detail)}</pre>` : ""}
          <div style="display:flex;justify-content:flex-end;gap:7px;margin-top:9px;">
            <button data-notification-open="${escapeHtml(item.id)}" style="border:0;border-radius:7px;background:${style.color};color:white;padding:7px 12px;font-weight:900;cursor:pointer;">Aç</button>
            <button data-notification-delete="${escapeHtml(item.id)}" style="border:0;border-radius:7px;background:${t.danger};color:white;padding:7px 12px;font-weight:900;cursor:pointer;">Sil</button>
          </div>
        </article>
      `;
    }).join("");

    modal.innerHTML = `
      <header style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:13px 15px;background:${t.header};color:${t.headerText};border-bottom:1px solid ${t.border};">
        <div>
          <div style="font-size:20px;font-weight:950;">Bildirimler</div>
          <div style="font-size:12px;color:#bfdbfe;margin-top:3px;">${unreadNotificationCount()} okunmamış · ${state.notificationLog.length} toplam</div>
        </div>
        <div style="display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end;">
          <button id="fsl-notification-read-all" style="border:0;border-radius:7px;background:#475569;color:white;padding:8px 11px;font-weight:900;cursor:pointer;">Tümünü Okundu Yap</button>
          <button id="fsl-notification-clear" style="border:0;border-radius:7px;background:${t.danger};color:white;padding:8px 11px;font-weight:900;cursor:pointer;">Temizle</button>
          <button id="fsl-notification-close" style="border:0;border-radius:7px;background:#334155;color:white;padding:8px 11px;font-weight:900;cursor:pointer;">Kapat</button>
        </div>
      </header>
      <section style="overflow:auto;padding:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px;align-content:start;">
        ${rows || `<div style="grid-column:1/-1;text-align:center;color:${t.muted};padding:55px 15px;border:1px dashed ${t.border};border-radius:10px;background:${t.surface};">Henüz bildirim yok.</div>`}
      </section>
    `;
    doc.body.appendChild(modal);

    const openItem = (id) => {
      const item = state.notificationLog.find((x) => x?.id === id);
      if (!item) return;
      markNotificationRead(id);
      modal.remove();
      render();
      openPatientDetailV16(item.key);
    };

    Array.from(modal.querySelectorAll("[data-notification]")).forEach((card) => {
      card.onclick = () => openItem(card.dataset.notification);
    });
    Array.from(modal.querySelectorAll("[data-notification-open]")).forEach((button) => {
      button.onclick = (event) => {
        event.stopPropagation();
        openItem(button.dataset.notificationOpen);
      };
    });
    Array.from(modal.querySelectorAll("[data-notification-delete]")).forEach((button) => {
      button.onclick = (event) => {
        event.stopPropagation();
        deleteDesktopNotification(button.dataset.notificationDelete);
        render();
        openNotificationCenter();
      };
    });
    uiEl("fsl-notification-read-all").onclick = () => {
      markAllNotificationsRead();
      render();
      openNotificationCenter();
    };
    uiEl("fsl-notification-clear").onclick = () => {
      clearDesktopNotifications();
      render();
      openNotificationCenter();
    };
    uiEl("fsl-notification-close").onclick = () => modal.remove();
  }

  function render() {
    const grid = uiEl("fsl-grid");
    const status = uiEl("fsl-status");
    const endpoints = uiEl("fsl-endpoints");
    const t = activeTheme();
    if (!grid) return;

    state.gridScroll = Number.isFinite(grid.scrollTop) ? grid.scrollTop : (state.gridScroll || 0);
    Array.from(grid.querySelectorAll("article[data-card]")).forEach((card) => {
      if (card.dataset.card) state.cardScroll[card.dataset.card] = card.scrollTop || 0;
    });

    const filteredPatients = state.patients.filter((p) => patientMatchesSearch(p));
    if (status) {
      status.textContent = state.searchText
        ? `${filteredPatients.length}/${state.patients.length} hasta`
        : (state.lastMessage || `${state.patients.length} hasta`);
    }
    grid.style.gridTemplateColumns = `repeat(auto-fill,minmax(${state.cardWidth || 360}px,1fr))`;
    grid.innerHTML = consultTrackingCardV16() + (filteredPatients.length
      ? filteredPatients.map(patientCardV16).join("")
      : `<div style="grid-column:1/-1;color:${t.muted};padding:24px;text-align:center;border:1px dashed ${t.border};border-radius:10px;background:${t.surface};">${state.searchText ? "Aramaya uygun hasta bulunamadı." : `Henüz hasta bulunamadı. FONET hasta listesi ekranda açıkken "Servisi Topla" düğmesine bas.`}</div>`);
    grid.scrollTop = state.gridScroll || 0;

    Array.from(grid.querySelectorAll("button[data-refresh]")).forEach((btn) => {
      btn.onclick = (event) => {
        event.stopPropagation();
        const p = state.patients.find((x) => displayKey(x) === btn.dataset.refresh);
        if (p) refreshPatientDetails(p);
      };
    });

    Array.from(grid.querySelectorAll("[data-open-patient]")).forEach((btn) => {
      btn.onclick = (event) => {
        event.stopPropagation();
        openPatientDetailV16(btn.dataset.openPatient);
      };
    });

    Array.from(grid.querySelectorAll("article[data-card]")).forEach((card) => {
      card.scrollTop = state.cardScroll?.[card.dataset.card] || 0;
      card.onscroll = () => {
        state.cardScroll[card.dataset.card] = card.scrollTop || 0;
      };
      card.onmouseenter = () => {
        const rect = card.getBoundingClientRect();
        const win = uiWindow();
        const x = rect.left < win.innerWidth * 0.28 ? "left" : (rect.right > win.innerWidth * 0.72 ? "right" : "center");
        const y = rect.top < win.innerHeight * 0.42 ? "top" : "bottom";
        card.style.transformOrigin = `${x} ${y}`;
        card.style.transform = "scale(1.4)";
        card.style.zIndex = "2147483600";
        card.style.boxShadow = `0 28px 80px rgba(15,23,42,.42)`;
        card.style.outline = `2px solid ${t.primary}`;
        card.style.outlineOffset = "2px";
      };
      card.onmouseleave = () => {
        card.style.transform = "";
        card.style.zIndex = "";
        card.style.boxShadow = activeTheme().shadow;
        card.style.outline = "";
        card.style.outlineOffset = "";
      };
      card.ondragstart = (event) => {
        state.dragCardKey = card.dataset.card;
        try {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", card.dataset.card);
        } catch (e) {}
        card.style.opacity = "0.55";
      };
      card.ondragend = () => {
        state.dragCardKey = "";
        card.style.opacity = "";
        Array.from(grid.querySelectorAll("article[data-card]")).forEach((x) => {
          x.style.outline = "";
        });
      };
      card.ondragover = (event) => {
        if (!state.dragCardKey || state.dragCardKey === card.dataset.card) return;
        event.preventDefault();
        card.style.outline = "2px solid #38bdf8";
        card.style.outlineOffset = "2px";
      };
      card.ondragleave = () => {
        card.style.outline = "";
      };
      card.ondrop = (event) => {
        event.preventDefault();
        card.style.outline = "";
        const from = state.dragCardKey || event.dataTransfer?.getData("text/plain");
        movePatientCard(from, card.dataset.card);
      };
      card.onclick = () => openPatientDetailV16(card.dataset.card);
    });

    const grouped = state.requests.reduce((acc, r) => {
      acc[r.type] = (acc[r.type] || 0) + 1;
      return acc;
    }, {});
    if (endpoints) endpoints.textContent = Object.entries(grouped).map(([k, v]) => `${k}:${v}`).join(" | ") || "arka plan sorgu hazır";
    updateNotificationButton();
    renderNotificationBar();
    sendBridgeUpdate();
  }

  function makePanel() {
    openPanelWindow();
    removeUiEl("fonet-service-live-panel");
    const doc = uiDocument();
    const win = uiWindow();
    const t = activeTheme();
    const panel = doc.createElement("div");
    panel.id = "fonet-service-live-panel";
    const panelShell = state.popupMode ? `
      position:fixed;
      inset:0;
      width:100vw;
      height:100vh;
      z-index:2147483647;
      background:#f1f5f9;
      color:#0f172a;
      font-family:Arial,sans-serif;
      display:grid;
      grid-template-rows:auto auto auto 1fr auto;
      overflow:hidden;
    ` : `
      position:fixed;
      top:90px;
      left:420px;
      width:1050px;
      height:720px;
      max-width:calc(100vw - 24px);
      max-height:calc(100vh - 24px);
      z-index:2147483647;
      background:#f1f5f9;
      color:#0f172a;
      border:1px solid #94a3b8;
      border-radius:10px;
      box-shadow:0 22px 55px rgba(15,23,42,.35);
      font-family:Arial,sans-serif;
      display:grid;
      grid-template-rows:auto auto auto 1fr auto;
      overflow:hidden;
      resize:both;
      min-width:760px;
      min-height:480px;
    `;
    panel.style.cssText = panelShell;
    panel.style.background = t.bg;
    panel.style.color = t.text;
    panel.style.borderColor = t.border;
    panel.style.boxShadow = t.shadow;

    panel.innerHTML = `
      <header id="fsl-drag-handle" style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px;background:${t.header};color:${t.headerText};cursor:${state.popupMode ? "default" : "move"};user-select:none;border-bottom:1px solid ${t.border};">
        <div>
          <b>FONET Servis Canlı Panel V6.25</b>
          <span id="fsl-status" style="margin-left:10px;color:#bfdbfe;">hazır</span>
          <span id="fsl-endpoints" style="margin-left:10px;color:${t.accent};font-size:12px;">arka plan sorgu hazır</span>
        </div>
        <div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">
          <select id="fsl-theme" title="Tema" style="height:32px;border:1px solid ${t.border};border-radius:8px;background:${t.surface};color:${t.text};padding:0 8px;font-weight:800;cursor:pointer;">${themeOptionsHtml()}</select>
          <button id="fsl-sound" title="Bildirim sesi" style="background:${state.soundEnabled ? t.accent : "#64748b"};color:${state.soundEnabled ? "#111827" : "white"};border:0;border-radius:6px;padding:7px 10px;cursor:pointer;font-weight:800;">${soundButtonText()}</button>
          <button id="fsl-card-smaller" title="Kartları küçült" style="background:#334155;color:white;border:0;border-radius:6px;padding:7px 10px;cursor:pointer;">Kart -</button>
          <button id="fsl-card-bigger" title="Kartları büyüt" style="background:#334155;color:white;border:0;border-radius:6px;padding:7px 10px;cursor:pointer;">Kart +</button>
          <button id="fsl-collect" style="background:${t.primary};color:white;border:0;border-radius:6px;padding:7px 10px;cursor:pointer;">Servisi Topla</button>
          <button id="fsl-details" style="background:${t.primary2};color:white;border:0;border-radius:6px;padding:7px 10px;cursor:pointer;">Detayları Çek</button>
          <button id="fsl-watch" style="background:${t.success};color:white;border:0;border-radius:6px;padding:7px 10px;cursor:pointer;">Otomatik İzle</button>
          <button id="fsl-copy" style="background:#475569;color:white;border:0;border-radius:6px;padding:7px 10px;cursor:pointer;">Dışa Aktar</button>
          <button id="fsl-close" style="background:${t.danger};color:white;border:0;border-radius:6px;padding:7px 10px;cursor:pointer;">Kapat</button>
        </div>
      </header>
      <section style="display:grid;grid-template-columns:minmax(220px,1fr) auto;gap:9px;align-items:center;padding:9px 11px;background:${t.surface2};border-bottom:1px solid ${t.border};">
        <div style="display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;border:1px solid ${t.border};border-radius:9px;background:${t.surface};overflow:hidden;min-width:0;">
          <span style="padding:0 9px;color:${t.primary2};font-size:13px;font-weight:950;">Ara</span>
          <input id="fsl-search" value="${escapeHtml(state.searchText)}" placeholder="Hasta adı, oda, doktor, birim veya tanı ara" style="width:100%;height:36px;border:0;outline:0;background:transparent;color:${t.text};font:13px Arial,sans-serif;box-sizing:border-box;" />
          <button id="fsl-search-clear" title="Aramayı temizle" style="width:36px;height:36px;border:0;background:transparent;color:${t.muted};font-size:20px;cursor:pointer;">×</button>
        </div>
        <button id="fsl-notifications" style="height:38px;border:0;border-radius:9px;background:#334155;color:white;padding:0 14px;font-weight:950;cursor:pointer;white-space:nowrap;">Bildirimler</button>
      </section>
      <section id="fsl-notification-bar" style="min-height:52px;padding:7px 11px;background:${t.bg};border-bottom:1px solid ${t.border};overflow:hidden;"></section>
      <section id="fsl-grid" style="overflow:auto;padding:10px;display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:10px;align-content:start;background:${t.bg};"></section>
      <textarea id="fsl-output" style="height:72px;border:0;border-top:1px solid ${t.border};padding:8px;font:11px Consolas,monospace;box-sizing:border-box;background:${t.surface};color:${t.text};" placeholder="Dışa aktarım veya tanı bilgisi burada görünür."></textarea>
    `;

    doc.body.appendChild(panel);

    const themeSelect = uiEl("fsl-theme");
    if (themeSelect) {
      themeSelect.onchange = () => setTheme(themeSelect.value);
    }

    const soundButton = uiEl("fsl-sound");
    if (soundButton) {
      soundButton.onclick = () => setSoundEnabled(!state.soundEnabled);
    }

    const searchInput = uiEl("fsl-search");
    if (searchInput) {
      searchInput.oninput = () => {
        state.searchText = searchInput.value || "";
        state.gridScroll = 0;
        render();
      };
    }
    uiEl("fsl-search-clear").onclick = () => {
      state.searchText = "";
      if (searchInput) {
        searchInput.value = "";
        searchInput.focus();
      }
      state.gridScroll = 0;
      render();
    };
    uiEl("fsl-notifications").onclick = openNotificationCenter;

    panel.addEventListener("pointerdown", () => {
      unlockNotificationSound();
    }, { once: true });

    const handle = uiEl("fsl-drag-handle");
    handle.onmousedown = (event) => {
      if (state.popupMode) return;
      if (event.target.tagName === "BUTTON") return;
      const rect = panel.getBoundingClientRect();
      state.drag = {
        startX: event.clientX,
        startY: event.clientY,
        left: rect.left,
        top: rect.top
      };
      event.preventDefault();
    };

    win.addEventListener("mousemove", (event) => {
      if (!state.drag) return;
      const nextLeft = state.drag.left + event.clientX - state.drag.startX;
      const nextTop = state.drag.top + event.clientY - state.drag.startY;
      const maxLeft = win.innerWidth - Math.min(panel.offsetWidth, win.innerWidth - 24) - 12;
      const maxTop = win.innerHeight - 48;
      panel.style.left = `${Math.max(12, Math.min(nextLeft, Math.max(12, maxLeft)))}px`;
      panel.style.top = `${Math.max(12, Math.min(nextTop, maxTop))}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
    });

    win.addEventListener("mouseup", () => {
      state.drag = null;
    });

    uiEl("fsl-collect").onclick = () => {
      collectServicePatients();
      uiEl("fsl-output").value = exportPatients();
    };

    uiEl("fsl-card-smaller").onclick = () => {
      state.cardWidth = Math.max(320, (state.cardWidth || 360) - 40);
      state.cardHeight = Math.max(210, (state.cardHeight || 250) - 20);
      render();
    };

    uiEl("fsl-card-bigger").onclick = () => {
      state.cardWidth = Math.min(620, (state.cardWidth || 360) + 40);
      state.cardHeight = Math.min(520, (state.cardHeight || 250) + 20);
      render();
    };

    uiEl("fsl-details").onclick = () => {
      refreshAllDetails();
    };

    uiEl("fsl-watch").onclick = () => {
      collectServicePatients();
      if (!state.monitor) {
        state.monitor = window.setInterval(() => {
          refreshAllDetails();
        }, 120000);
      }
      refreshAllDetails();
      state.lastMessage = "Otomatik servis izleme açık: 120 sn. Arka planda duraklar.";
      render();
    };

    uiEl("fsl-copy").onclick = copyExport;
    uiEl("fsl-close").onclick = restore;
    render();
  }

  patchNetwork();
  makePanel();
  collectServicePatients();

  const extTimer = window.setInterval(() => {
    if (!state.active) {
      window.clearInterval(extTimer);
      return;
    }
    patchNetwork();
    if (state.original.xhrOpen && state.original.extRequest) window.clearInterval(extTimer);
  }, 10000);
})();
