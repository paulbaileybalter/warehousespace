/* Balter Brewing — Raw Material Ordering
   Plain JavaScript, no build step, no external libraries.
   Figures are saved in the browser (localStorage). */
(function () {
'use strict';

/* ------------------------------------------------------------------ constants */
var KEY = 'balter-ordering-v2';
var ALL_SKUS = ['XPA', 'CPT', 'EAZY', 'HAZY', 'IPA', 'LPA', 'LIMITED', 'BLACK', 'GBWIND', 'GBWAY', 'GBSUB'];
var SKU_LABEL = { XPA: 'XPA', CPT: 'CPT', EAZY: 'Eazy', HAZY: 'Hazy', IPA: 'IPA', LPA: 'LPA', LIMITED: 'Limited', BLACK: 'Black Lager', GBWIND: 'GB Windjammer', GBWAY: 'GB Wayfarer', GBSUB: 'GB Subtropic' };
// How names in the Live Brewery Board / order sheets map to SKUs (first match wins, spaces and symbols ignored)
var SKU_MAP = [['GBSUB', 'GBSUB'], ['SUBTROPIC', 'GBSUB'], ['GBWAY', 'GBWAY'], ['GBWF', 'GBWAY'], ['WAYFARER', 'GBWAY'], ['GBWIND', 'GBWIND'], ['GBWJ', 'GBWIND'], ['WINDJAMMER', 'GBWIND'],
  ['LIMITED', 'LIMITED'], ['BLACK', 'BLACK'], ['BLAGER', 'BLACK'], ['EAZY', 'EAZY'], ['EZ', 'EAZY'], ['HAZY', 'HAZY'], ['XPA', 'XPA'], ['CPT', 'CPT'], ['IPA', 'IPA'], ['LPA', 'LPA']];
function mapSku(label) {
  var s = String(label || '').toUpperCase().replace(/[^A-Z]/g, '');
  for (var i = 0; i < SKU_MAP.length; i++) if (s.indexOf(SKU_MAP[i][0]) === 0) return SKU_MAP[i][1];
  return null;
}
// Visy carton reorder-below / batch size — Role Handbook SOP-008
var HB_CARTON = { XPA: [30000, 20000], CPT: [9000, 10000], EAZY: [14500, 16000], HAZY: [8000, 8000], IPA: [3300, 5000], GBWAY: [5500, 3000], GBWIND: [5500, 3000], GBSUB: [3000, 3000], LPA: [3000, 3000], BLACK: [3000, 3000] };
// Minimum cluster stock per SKU — Cluster Wrap Order Sheet
var CLUSTER_MIN = { XPA: 64000, CPT: 32000, EAZY: 32000, HAZY: 32000, IPA: 32000, LPA: 32000, LIMITED: 0, BLACK: 0, GBWIND: 0, GBWAY: 0 };
var MAT_ORDER = ['cartons', 'pads', 'clusters', 'cans'];
var MAT = {
  cartons:  { name: 'Cartons',     supplier: 'Visy',             icon: 'carton',  space: true,  entry: 'units',   unit: 'cartons',  fixedDay: null, skus: ['XPA', 'CPT', 'EAZY', 'HAZY', 'IPA', 'LPA', 'BLACK', 'GBWAY', 'GBWIND', 'GBSUB'],
    rule: 'Visy · arrives any day Mon–Fri the week after you order' },
  pads:     { name: 'Pallet pads', supplier: 'Visy',             icon: 'pad',     space: false, entry: 'units',   unit: 'pads',     fixedDay: null, skus: null,
    rule: 'Visy · arrives any day Mon–Fri the week after you order (same order as cartons)' },
  clusters: { name: 'Clusters',    supplier: 'Smurfit Westrock', icon: 'cluster', space: true,  entry: 'pallets', unit: 'clusters', fixedDay: 2,    skus: ['XPA', 'CPT', 'EAZY', 'HAZY', 'IPA', 'LPA', 'LIMITED', 'GBWIND', 'GBWAY', 'BLACK'],
    rule: 'Smurfit Westrock · always arrives the Wednesday after you order · stock is kept to the end of the delivery week (one week ahead; two weeks is a setting)' },
  cans:     { name: 'Cans',        supplier: 'Orora',            icon: 'can',     space: false, entry: 'pallets', unit: 'cans',     fixedDay: null, skus: ['XPA', 'CPT', 'EAZY', 'HAZY', 'IPA', 'LPA', 'LIMITED', 'BLACK', 'GBWIND', 'GBWAY', 'GBSUB'],
    rule: 'Orora · Mon–Fri mornings the week after you order · evening second load only if essential' }
};
var TRUCK = 22; // pallets per Orora truck
var STATUS_RANK = { ok: 0, watch: 1, order: 2, risk: 3 };
var STATUS_TXT = { ok: 'Covered', watch: 'Order next week', order: 'Order this Thursday', risk: 'Run-out before delivery' };

var ITEMS = [];
MAT_ORDER.forEach(function (m) {
  if (m === 'pads') ITEMS.push({ id: 'pads:all', mat: 'pads', sku: null, label: 'Pallet pads' });
  else MAT[m].skus.forEach(function (s) { ITEMS.push({ id: m + ':' + s, mat: m, sku: s, label: SKU_LABEL[s] }); });
});
var ITEM = {}; ITEMS.forEach(function (i) { ITEM[i.id] = i; });

var ICONS = {
  carton: '<path d="M3 7l9-4 9 4v10l-9 4-9-4V7z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  pad: '<path d="M3 8l9-4 9 4-9 4-9-4z"/><path d="M3 12l9 4 9-4M3 16l9 4 9-4"/>',
  cluster: '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="2.6"/><circle cx="15.5" cy="8.5" r="2.6"/><circle cx="8.5" cy="15.5" r="2.6"/><circle cx="15.5" cy="15.5" r="2.6"/>',
  can: '<path d="M7 5c0-1.6 10-1.6 10 0v14c0 1.6-10 1.6-10 0z"/><path d="M7 5c0 1.6 10 1.6 10 0M7 9h10"/>',
  truck: '<path d="M2 6h11v9H2zM13 9h4l3 3v3h-7z"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  glass: '<path d="M6 3h12l-1.6 17.2a1.5 1.5 0 0 1-1.5 1.3H9.1a1.5 1.5 0 0 1-1.5-1.3L6 3z"/><path d="M6.6 9h10.8"/>'
};
function icon(n) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[n] + '</svg>'; }

/* ------------------------------------------------------------------ date helpers (ISO strings, UTC maths) */
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function parse(s) { var p = s.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])); }
function iso(d) { return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()); }
function addDays(s, n) { var d = parse(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
function dow(s) { return parse(s).getUTCDay(); }
function mondayOf(s) { return addDays(s, -((dow(s) + 6) % 7)); }
function diffDays(a, b) { return Math.round((parse(b) - parse(a)) / 864e5); }
function todayISO() { var n = new Date(); return n.getFullYear() + '-' + pad2(n.getMonth() + 1) + '-' + pad2(n.getDate()); }
var F_LONG = new Intl.DateTimeFormat('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
var F_MED = new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
var F_SHORT = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
var F_DOW = new Intl.DateTimeFormat('en-AU', { weekday: 'short', timeZone: 'UTC' });
function fLong(s) { return F_LONG.format(parse(s)); }
function fMed(s) { return F_MED.format(parse(s)); }
function fShort(s) { return F_SHORT.format(parse(s)); }
function fDow(s) { return F_DOW.format(parse(s)); }
function fmt(n, dp) { if (dp == null) dp = 0; var v = Math.abs(n) < 0.0005 ? 0 : n; return new Intl.NumberFormat('en-AU', { maximumFractionDigits: dp }).format(v); }
function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function r1(v) { return Math.round(v * 10) / 10; }

/* ------------------------------------------------------------------ state */
var state, TL;

function defParams(it) {
  if (it.mat === 'cartons') { var h = HB_CARTON[it.sku]; return { perPallet: 1050, perCase: 1, min: h[0], step: h[1], minPct: 0 }; }
  if (it.mat === 'clusters') return { perPallet: 32000, perCase: 4, min: CLUSTER_MIN[it.sku] || 0, step: 32000, minPct: 0 };
  if (it.mat === 'cans') return { perPallet: 7391, perCase: 16, min: 0, step: 7391, minPct: 10 };
  return { perPallet: 0, perCase: 1, min: 4000, step: 6000, minPct: 0 };
}

function blankState() {
  var s = { v: 2, capacity: 105, countDate: todayISO(), sample: false, params: {}, stock: {}, plan: {}, lbb: {}, lbbWeeks: [], lbbMeta: null, invMeta: null, invOnOrder: {}, delMeta: {},  open: [], orders: {}, ordersFor: '', lids: {}, viewDate: null, uid: 1,
    settings: { dueTodayOpen: true, clusterWeeks: 1, invCol: 'brewery', casesPerPallet: 60, padsPerPallet: 1, wholePallets: false, canSoft: 90, canMax: 104 }, ui: {} };
  ITEMS.forEach(function (it) { s.params[it.id] = defParams(it); s.stock[it.id] = 0; });
  ALL_SKUS.forEach(function (k) { s.plan[k] = {}; s.lbb[k] = {}; });
  return s;
}

function seed() {
  var s = blankState(), S = window.BALTER_SEED;
  if (!S) return s;
  s.sample = true; s.countDate = S.countDate; s.sampleNote = S.note;
  ALL_SKUS.forEach(function (k) { s.lbb[k] = S.lbb[k] || {}; });
  s.lbbWeeks = S.lbbWeeks.slice();
  s.lbbMeta = { name: 'Live Brewery Board (starting figures)', at: S.countDate };
  state = s; TL = computeTL(s.countDate);
  ['clusters', 'cans'].forEach(function (m) { Object.keys(S.stock[m]).forEach(function (k) { if (ITEM[m + ':' + k]) s.stock[m + ':' + k] = S.stock[m][k]; }); });
  // placeholders for cartons and pads: a little above the point where an order is triggered
  var fac = { XPA: 0.9, CPT: 0.7, EAZY: 1.2, HAZY: 1.0, IPA: 1.4, GBWAY: 1.3, GBWIND: 1.5, GBSUB: 1.1 };
  ITEMS.forEach(function (it) {
    if (it.mat !== 'cartons' && it.mat !== 'pads') return;
    var p = s.params[it.id], unit = it.mat === 'cartons' ? 500 : 50;
    s.stock[it.id] = Math.max(0, Math.round(p.min * 1.0 * (it.sku ? Math.min(fac[it.sku], 1.1) : 1.5) / unit) * unit);
  });
  s.stock['pads:all'] = 5487; // counted Wed 28 Oct
  S.open.forEach(function (o) { s.open.push({ id: s.uid++, itemId: o.itemId, qty: o.qty, date: o.date }); });
  return s;
}

function normalise(j) {
  var b = blankState(), s = Object.assign(b, j || {});
  s.settings = Object.assign(blankState().settings, (j && j.settings) || {});
  s.ui = s.ui || {};
  ITEMS.forEach(function (it) {
    s.params[it.id] = Object.assign(defParams(it), (j && j.params && j.params[it.id]) || {});
    s.stock[it.id] = Number(j && j.stock && j.stock[it.id]) || 0;
  });
  ALL_SKUS.forEach(function (k) { s.plan[k] = (j && j.plan && j.plan[k]) || {}; s.lbb[k] = (j && j.lbb && j.lbb[k]) || {}; });
  s.lbbWeeks = Array.isArray(s.lbbWeeks) ? s.lbbWeeks.filter(function (w) { return /^\d{4}-\d{2}-\d{2}$/.test(w); }) : [];
  s.open = Array.isArray(s.open) ? s.open.filter(function (o) { return o && ITEM[o.itemId] && /^\d{4}-\d{2}-\d{2}$/.test(o.date); }).map(function (o) { var r = { id: o.id || 0, itemId: o.itemId, qty: Number(o.qty) || 0, date: o.date }; if (o.src) r.src = o.src; if (o.po) r.po = String(o.po); if (o.slot) r.slot = o.slot; return r; }) : [];
  var mx = s.open.reduce(function (m, o) { return Math.max(m, Number(o.id) || 0); }, 0);
  s.open.forEach(function (o) { if (!o.id) o.id = ++mx; });
  s.uid = mx + 1;
  s.orders = s.orders || {}; s.lids = s.lids || {};
  s.capacity = clamp(Math.round(Number(s.capacity)) || 105, 1, 9999);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.countDate)) s.countDate = todayISO();
  return s;
}

function load() {
  try { var raw = localStorage.getItem(KEY); if (raw) { var j = JSON.parse(raw); if (j && j.v === 2) return normalise(j); } } catch (e) { /* ignore */ }
  return seed();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ } }

/* ------------------------------------------------------------------ planning maths */
function computeTL(cd) {
  var thu = addDays(mondayOf(cd), 3);
  var orderDate = diffDays(cd, thu) >= 0 ? thu : addDays(thu, 7);
  var orderWeek = mondayOf(orderDate), dw = addDays(orderWeek, 7), first = mondayOf(cd);
  var weeks = []; for (var w = first; diffDays(orderWeek, w) <= 35; w = addDays(w, 7)) weeks.push(w);
  var endDate = addDays(weeks[weeks.length - 1], 6);
  var days = [], idx = {};
  for (var d = cd; diffDays(d, endDate) >= 0; d = addDays(d, 1)) { idx[d] = days.length; days.push(d); }
  var dwDays = [0, 1, 2, 3, 4].map(function (i) { return addDays(dw, i); });
  return { cd: cd, orderDate: orderDate, orderWeek: orderWeek, dw: dw, weeks: weeks, days: days, idx: idx, dwDays: dwDays, wed: addDays(dw, 2), cover: addDays(dw, 6), coverC: addDays(dw, (state && state.settings && state.settings.clusterWeeks === 2) ? 13 : 6), endDate: endDate };
}
function isLbbWeek(wk) { return state.lbbWeeks.indexOf(wk) >= 0; }
function dayCases(sku, d) {
  var wk = mondayOf(d);
  if (isLbbWeek(wk)) return (state.lbb[sku] && state.lbb[sku][d]) || 0;
  var w = dow(d); if (w === 0 || w === 6) return 0;
  return (Number((state.plan[sku] || {})[wk]) || 0) / 5;
}
function weekCases(sku, wk) {
  if (isLbbWeek(wk)) { var t = 0; for (var i = 0; i < 7; i++) t += (state.lbb[sku] && state.lbb[sku][addDays(wk, i)]) || 0; return t; }
  return Number((state.plan[sku] || {})[wk]) || 0;
}
function totalCases(wk) { return ALL_SKUS.reduce(function (a, k) { return a + weekCases(k, wk); }, 0); }
function dayUse(it, p, d) {
  if (it.mat === 'pads') {
    var t = 0; ALL_SKUS.forEach(function (k) { t += dayCases(k, d); });
    return t / (state.settings.casesPerPallet || 1) * state.settings.padsPerPallet;
  }
  return dayCases(it.sku, d) * p.perCase;
}
function sim(it, p, dels) {
  var s = state.stock[it.id] || 0, out = new Array(TL.days.length);
  for (var i = 0; i < TL.days.length; i++) {
    var d = TL.days[i], del = dels[d] || 0; s += del;
    var use = dayUse(it, p, d);
    out[i] = { date: d, del: del, use: use, peak: s, end: s - use };
    s -= use;
  }
  return out;
}
function toDisp(it, units) { return MAT[it.mat].entry === 'pallets' ? units / state.params[it.id].perPallet : units; }
function fromDisp(it, v) { return MAT[it.mat].entry === 'pallets' ? v * state.params[it.id].perPallet : v; }
function dispUnit(it) { return MAT[it.mat].entry === 'pallets' ? 'pallets' : MAT[it.mat].unit; }
function palletsOf(it, units) { var pp = state.params[it.id].perPallet; return pp ? units / pp : 0; }
function palSpace(it, units) { var v = units > 0 ? palletsOf(it, units) : 0; return state.settings.wholePallets ? Math.ceil(v - 1e-9) : v; }

function analyse() {
  TL = computeTL(state.countDate);
  if (state.ordersFor !== TL.orderDate) { state.orders = {}; state.lids = {}; state.ordersFor = TL.orderDate; }
  var R = { items: {}, mats: {}, space: [], cansStore: [], trucks: {}, events: {} };

  // 1. baseline projection, need and suggested quantity for every line
  ITEMS.forEach(function (it) {
    var p = state.params[it.id], m = MAT[it.mat], A = { it: it, p: p, stock: state.stock[it.id] || 0 };
    var dels = {};
    state.open.forEach(function (o) { if (o.itemId === it.id) dels[o.date] = (dels[o.date] || 0) + o.qty; });
    A.dels = dels;
    A.base = sim(it, p, dels);
    var coverDate = it.mat === 'clusters' ? TL.coverC : TL.cover;
    var earliest = m.fixedDay != null ? TL.wed : TL.dw;
    A.coverDate = coverDate;
    A.endCover = A.base[TL.idx[coverDate]].end;
    var useToCover = 0; A.base.forEach(function (r) { if (diffDays(r.date, coverDate) >= 0) useToCover += r.use; });
    A.min = p.min + (p.minPct || 0) / 100 * useToCover;
    var ro = A.base.filter(function (r) { return r.end < -0.5; })[0];
    A.runout = ro ? ro.date : null;
    A.risk = !!(A.runout && diffDays(A.runout, earliest) > 0);
    A.avgDaily = TL.dwDays.reduce(function (a, d) { return a + dayUse(it, p, d); }, 0) / 5;
    A.need = A.min - A.endCover;
    A.sug = A.need > 0.5 ? Math.ceil(A.need / p.step - 1e-9) * p.step : 0;
    A.latestIdx = 0;
    if (m.fixedDay == null) {
      for (var k = 4; k >= 0; k--) { var prev = addDays(TL.dwDays[k], -1); if (A.base[TL.idx[prev]].end >= A.avgDaily) { A.latestIdx = k; break; } }
    }
    var next7 = A.base[TL.idx[addDays(coverDate, 7)]];
    A.status = A.risk ? 'risk' : A.need > 0.5 ? 'order' : (next7 && next7.end < A.min ? 'watch' : 'ok');
    var ov = state.orders[it.id] || {};
    A.qty = ov.qty != null ? Math.max(0, ov.qty) : A.sug;
    A.dayEdited = !!(ov.day && TL.dwDays.indexOf(ov.day) >= 0);
    A.day = m.fixedDay != null ? TL.wed : A.dayEdited ? ov.day : TL.dwDays[A.latestIdx];
    R.items[it.id] = A;
  });

  // 2. pack Orora deliveries into trucks (suggested days only; manual choices are respected)
  var load = {}; TL.dwDays.forEach(function (d) { load[d] = Number(state.lids[d]) || 0; });
  var canA = ITEMS.filter(function (i) { return i.mat === 'cans'; }).map(function (i) { return R.items[i.id]; });
  canA.forEach(function (A) { if (A.dayEdited && A.qty > 0) load[A.day] += palletsOf(A.it, A.qty); });
  canA.filter(function (A) { return !A.dayEdited && A.qty > 0; }).sort(function (a, b) { return a.latestIdx - b.latestIdx || b.qty - a.qty; }).forEach(function (A) {
    var pal = palletsOf(A.it, A.qty), pick = -1, k;
    for (k = A.latestIdx; k >= 0; k--) if (load[TL.dwDays[k]] + pal <= TRUCK + 1e-9) { pick = k; break; }
    if (pick < 0) { pick = A.latestIdx; for (k = A.latestIdx; k >= 0; k--) if (load[TL.dwDays[k]] < load[TL.dwDays[pick]]) pick = k; }
    A.day = TL.dwDays[pick]; load[A.day] += pal;
  });

  // 3. projection including this order, cover checks
  ITEMS.forEach(function (it) {
    var A = R.items[it.id], d2 = Object.assign({}, A.dels);
    if (A.qty > 0) d2[A.day] = (d2[A.day] || 0) + A.qty;
    A.full = sim(it, A.p, d2);
    A.endCoverFull = A.full[TL.idx[A.coverDate]].end;
    A.shortAfter = Math.max(0, A.min - A.endCoverFull);
    var ro2 = A.full.filter(function (r) { return r.end < -0.5; })[0];
    A.lastsTo = ro2 ? ro2.date : null;
    A.edited = A.qty !== A.sug || A.dayEdited;
  });

  MAT_ORDER.forEach(function (mk) {
    var its = ITEMS.filter(function (i) { return i.mat === mk; }).map(function (i) { return R.items[i.id]; });
    var worst = its.reduce(function (w, a) { return STATUS_RANK[a.status] > STATUS_RANK[w] ? a.status : w; }, 'ok');
    R.mats[mk] = { items: its, worst: worst, needing: its.filter(function (a) { return a.status === 'order' || a.status === 'risk'; }).length, qtyUnits: its.reduce(function (a, x) { return a + x.qty; }, 0) };
  });

  // 4. pallet space: cartons + clusters share the allowance; cans have their own store
  TL.days.forEach(function (d, i) {
    var c = 0, k = 0, arr = 0, cn = 0;
    ITEMS.forEach(function (it) {
      var r = R.items[it.id].full[i];
      if (it.mat === 'cartons') { c += palSpace(it, r.peak); arr += r.del / state.params[it.id].perPallet; }
      else if (it.mat === 'clusters') { k += palSpace(it, r.peak); arr += r.del / state.params[it.id].perPallet; }
      else if (it.mat === 'cans') cn += palSpace(it, r.peak);
    });
    R.space.push({ date: d, c: c, k: k, total: c + k, arr: arr });
    R.cansStore.push({ date: d, total: cn });
  });
  var peak = null, cpeak = null;
  TL.dwDays.forEach(function (d) { var r = R.space[TL.idx[d]], q = R.cansStore[TL.idx[d]]; if (!peak || r.total > peak.total) peak = r; if (!cpeak || q.total > cpeak.total) cpeak = q; });
  R.peak = peak; R.canPeak = cpeak;
  R.view = state.viewDate && TL.idx[state.viewDate] != null ? R.space[TL.idx[state.viewDate]] : peak;
  var cap = state.capacity;
  R.spaceStatus = r1(R.peak.total) > cap ? 'order' : R.peak.total >= cap * 0.9 ? 'watch' : 'ok';
  R.overDays = R.space.filter(function (r) { var w = dow(r.date); return w > 0 && w < 6 && r1(r.total) > cap; });
  R.canStatus = R.canPeak.total > state.settings.canMax ? 'order' : R.canPeak.total > state.settings.canSoft ? 'watch' : 'ok';

  // 5. what lands each day of the delivery week
  TL.dwDays.forEach(function (d) { R.events[d] = { smurfit: 0, cartons: 0, pads: 0, cans: 0, spaceIn: 0, lids: Number(state.lids[d]) || 0 }; });
  ITEMS.forEach(function (it) {
    var A = R.items[it.id]; if (A.qty <= 0) return;
    var e = R.events[A.day]; if (!e) return;
    if (it.mat === 'clusters') { e.smurfit += palletsOf(it, A.qty); e.spaceIn += palletsOf(it, A.qty); }
    if (it.mat === 'cartons') { e.cartons += A.qty; e.spaceIn += palletsOf(it, A.qty); }
    if (it.mat === 'pads') e.pads += A.qty;
    if (it.mat === 'cans') e.cans += palletsOf(it, A.qty);
  });
  return R;
}

/* ------------------------------------------------------------------ rendering helpers */
function chip(st, txt) { return '<span class="chip st-' + st + '"><i></i>' + txt + '</span>'; }
function dispQty(it, units, dp) { return fmt(toDisp(it, units), dp == null ? (MAT[it.mat].entry === 'pallets' ? 2 : 0) : dp); }

function hero(R) {
  var today = todayISO(), dd = diffDays(today, TL.orderDate);
  var rel = dd < 0 ? 'Order day has passed' : dd === 0 ? 'Order day is today' : dd === 1 ? 'Tomorrow' : 'In ' + dd + ' days';
  var h = '<section class="hero" aria-label="Summary"><div class="next"><span class="eyebrow">Next order · Thursday</span>' +
    '<div class="when">' + fLong(TL.orderDate) + '</div><span class="rel">' + rel + '</span><ul>' +
    '<li><b>Clusters</b><span>Arrive <strong>' + fMed(TL.wed) + '</strong> (Smurfit Westrock)</span></li>' +
    '<li><b>Cans</b><span>Mon–Fri ' + fShort(TL.dwDays[0]) + ' – ' + fShort(TL.dwDays[4]) + ', mornings (Orora)</span></li>' +
    '<li><b>Cartons &amp; pads</b><span>Any day Mon–Fri ' + fShort(TL.dwDays[0]) + ' – ' + fShort(TL.dwDays[4]) + ' (Visy)</span></li></ul></div><div class="tiles">';
  MAT_ORDER.forEach(function (mk) {
    var m = MAT[mk], r = R.mats[mk], n = r.items.length;
    var line = r.needing ? r.needing + ' of ' + n + (n === 1 ? ' item needs' : ' lines need') + ' ordering' : r.worst === 'watch' ? 'Fine this week — order next Thursday' : 'All lines covered';
    h += '<a class="tile st-' + r.worst + '" href="#mat-' + mk + '"><span class="ico">' + icon(m.icon) + '</span><h3>' + m.name + '</h3>' + chip(r.worst, STATUS_TXT[r.worst]) + '<p>' + line + '</p></a>';
  });
  var sp = R.spaceStatus;
  h += '<a class="tile st-' + sp + '" href="#space"><span class="ico">' + icon('glass') + '</span><h3>Pallet space</h3>' +
    chip(sp, sp === 'order' ? 'Over allowance' : sp === 'watch' ? 'Nearly full' : 'Room to spare') + '<p>Peak ' + fmt(R.peak.total, 1) + ' of ' + state.capacity + ' pallets (' + fMed(R.peak.date) + ')</p></a>' +
    '<a class="tile st-' + R.canStatus + '" href="#mat-cans"><span class="ico">' + icon('can') + '</span><h3>Can store</h3>' +
    chip(R.canStatus, R.canStatus === 'order' ? 'Over maximum' : R.canStatus === 'watch' ? 'Over comfortable limit' : 'Within limits') + '<p>Peak ' + fmt(R.canPeak.total, 1) + ' pallets (limit ' + state.settings.canSoft + ' / ' + state.settings.canMax + ')</p></a></div></section>';
  return h;
}

function deliveryWeek(R) {
  var h = '<section class="sec" id="week"><div class="sec-head"><div><span class="eyebrow">Delivery week · ' + fShort(TL.dwDays[0]) + ' – ' + fShort(TL.dwDays[4]) + '</span><h2>What lands, and when</h2>' +
    '<p>Built from the quantities and delivery days on the order desk below, so it updates as you change them.</p></div></div><div class="week">';
  TL.dwDays.forEach(function (d) {
    var e = R.events[d], parts = '', trucks = Math.ceil((e.cans + e.lids) / TRUCK - 1e-9);
    if (e.smurfit > 0) parts += '<div class="ev smurfit"><span>Clusters</span><b>' + fmt(e.smurfit, 2) + ' plt</b></div>';
    if (e.cartons > 0) parts += '<div class="ev visy"><span>Cartons</span><b>' + fmt(e.cartons) + '</b></div>';
    if (e.pads > 0) parts += '<div class="ev visy"><span>Pallet pads</span><b>' + fmt(e.pads) + '</b></div>';
    if (e.cans > 0) parts += '<div class="ev orora"><span>Cans · ' + trucks + (trucks === 1 ? ' truck' : ' trucks') + '</span><b>' + fmt(e.cans, 1) + ' plt</b></div>';
    h += '<div class="day' + (parts ? '' : ' empty') + '"><h4>' + fDow(d) + '<span>' + fShort(d) + '</span></h4>' + (parts || '<span class="muted" style="font-size:11.5px">No deliveries planned</span>') +
      (e.spaceIn > 0 ? '<div class="tot">+' + fmt(e.spaceIn, 1) + ' pallet' + (e.spaceIn === 1 ? '' : 's') + ' into the shared allowance</div>' : '') + '</div>';
  });
  h += '</div><div class="dlegend"><span><i style="background:var(--sky-soft);border:1px solid var(--sky)"></i>Smurfit Westrock</span><span><i style="background:var(--purple-soft);border:1px solid #cfc7e3"></i>Visy</span><span><i style="background:var(--teal-soft);border:1px solid var(--teal)"></i>Orora</span></div></section>';
  return h;
}

function tank(A) {
  var it = A.it, max = Math.max(A.min * 2, A.stock, 1), lvl = clamp(A.stock / max, 0, 1), inc = clamp(A.qty / max, 0, 1 - lvl), minPos = clamp(A.min / max, 0, 1);
  var pal = MAT[it.mat].entry === 'pallets';
  return '<div class="tk" title="' + esc(it.label) + ': ' + fmt(A.stock) + ' ' + MAT[it.mat].unit + ' on hand, minimum ' + fmt(A.min) + '"><div class="tank st-' + A.status + '">' +
    '<div class="fill" style="height:' + (lvl * 100).toFixed(1) + '%"></div>' +
    (inc > 0 ? '<div class="inc" style="bottom:' + (lvl * 100).toFixed(1) + '%;height:' + (inc * 100).toFixed(1) + '%"></div>' : '') +
    (A.min > 0 ? '<div class="min" style="bottom:' + (minPos * 100).toFixed(1) + '%"></div>' : '') + '</div><b>' + esc(it.label) + '</b><small>' + dispQty(it, A.stock, pal ? 1 : 0) + (pal ? ' plt' : '') + '</small></div>';
}

function orderRow(R, A) {
  var it = A.it, m = MAT[it.mat], pal = m.entry === 'pallets';
  var stepAttr = it.mat === 'clusters' ? 1 : pal ? 1 : A.p.step;
  var qv = toDisp(it, A.qty); qv = pal ? Math.round(qv * 100) / 100 : Math.round(qv);
  var roTxt = A.runout ? '<span class="' + (A.risk || diffDays(A.runout, A.coverDate) >= 0 ? 'warn-t' : '') + '">' + fMed(A.runout) + '</span>' : '<span class="muted">Beyond plan</span>';
  var dayCell;
  if (m.fixedDay != null) dayCell = '<strong>' + fMed(TL.wed) + '</strong><small>fixed by Smurfit</small>';
  else dayCell = '<select data-act="day" data-id="' + it.id + '" data-fid="day:' + it.id + '" aria-label="Delivery day for ' + esc(it.label) + '">' +
    TL.dwDays.map(function (d) { return '<option value="' + d + '"' + (d === A.day ? ' selected' : '') + '>' + fMed(d) + '</option>'; }).join('') + '</select>';
  var after;
  if (A.shortAfter > 0.5) after = '<span class="warn-t">Short ' + dispQty(it, A.shortAfter) + ' ' + dispUnit(it) + '</span><small>below minimum stock</small>';
  else after = '✓ meets minimum<small>' + (A.lastsTo ? 'lasts to ' + fMed(A.lastsTo) : 'lasts beyond plan') + '</small>';
  var stockTxt = fmt(A.stock) + (it.mat === 'pads' ? '' : '<small>' + fmt(palletsOf(it, A.stock), 1) + ' pallets</small>');
  return '<tr><td><span class="sku">' + esc(it.label) + '</span><br>' + chip(A.status, STATUS_TXT[A.status]) + '</td>' +
    '<td class="r num">' + stockTxt + '</td><td>' + roTxt + '</td>' +
    '<td class="r num">' + (A.sug > 0 ? dispQty(it, A.sug) + '<small>' + dispUnit(it) + '</small>' : '<span class="muted">—</span>') + '</td>' +
    '<td class="q"><input type="number" min="0" step="' + stepAttr + '" value="' + qv + '" data-act="qty" data-id="' + it.id + '" data-fid="qty:' + it.id + '" aria-label="Order quantity for ' + esc(it.label) + ' in ' + dispUnit(it) + '"><small>' + dispUnit(it) + '</small></td>' +
    '<td class="r num">' + (A.qty > 0 && it.mat !== 'pads' ? fmt(palletsOf(it, A.qty), 2) : '—') + '</td>' +
    '<td>' + dayCell + '</td><td>' + after + '</td></tr>';
}

function matCard(R, mk) {
  var m = MAT[mk], r = R.mats[mk], its = r.items;
  var totalTxt = mk === 'cartons' || mk === 'pads' ? fmt(r.qtyUnits) + ' ' + m.unit : fmt(r.qtyUnits / state.params[its[0].it.id].perPallet, 2) + ' pallets';
  var palEq = mk === 'cartons' ? ' (' + fmt(its.reduce(function (a, x) { return a + palletsOf(x.it, x.qty); }, 0), 1) + ' pallets)' : '';
  var h = '<article class="panel mat" id="mat-' + mk + '"><div class="mat-head"><span class="ico">' + icon(m.icon) + '</span><div><h3>' + m.name + '</h3><div class="sub">' + m.rule + '</div></div>' +
    '<div class="right">' + chip(r.worst, STATUS_TXT[r.worst]) + '<span class="num" style="font-size:13px"><b>This order:</b> ' + totalTxt + palEq + '</span></div></div>';
  h += '<div class="tanks" aria-label="Stock levels">' + its.map(tank).join('') + '</div>' +
    '<div class="tlegend"><span><i style="background:var(--teal)"></i>On hand</span><span><i style="background:repeating-linear-gradient(135deg,var(--sky) 0 4px,#fff 4px 7px)"></i>This order</span><span><i style="border-style:dashed;background:#fff"></i>Minimum stock (dashed line)</span></div>';
  h += '<div class="tbl-wrap"><table><thead><tr><th>' + (mk === 'pads' ? 'Item' : 'SKU') + '</th><th class="r">On hand</th><th>Runs out</th><th class="r">Suggested</th><th>Order</th><th class="r">Pallets</th><th>Deliver on</th><th>After this order</th></tr></thead><tbody>';
  its.forEach(function (A) { h += orderRow(R, A); });
  h += '</tbody></table></div>';
  var coverTxt = mk === 'clusters' ? (state.settings.clusterWeeks === 2 ? 'the end of the week after delivery (' : 'the end of delivery week (') + fMed(TL.coverC) + ')' : 'the end of delivery week (' + fMed(TL.cover) + ')';
  var minTxt = mk === 'cans' ? 'the minimum is a ' + (its[0].p.minPct || 0) + '% buffer on planned use' : 'at or above its minimum';
  h += '<div class="mat-foot"><span>Suggestions keep stock ' + (mk === 'cans' ? 'covering planned use plus ' + (its[0].p.minPct || 0) + '% buffer' : minTxt) + ' to ' + coverTxt + '. Change any quantity or day.</span><button class="btn small" data-act="resetmat" data-mat="' + mk + '">Reset to suggestions</button></div>';
  if (mk === 'cans') h += trucks(R) + canStore(R);
  return h + '</article>';
}

function trucks(R) {
  var h = '<div class="trucks"><h4>' + icon('truck') + 'Truck fill · ' + TRUCK + ' pallets per truck</h4>';
  TL.dwDays.forEach(function (d) {
    var e = R.events[d], pal = e.cans, lids = e.lids, tot = pal + lids;
    var note, over = tot > TRUCK + 1e-9;
    if (pal <= 0) note = '<span class="muted">No cans</span>';
    else if (over) note = '<span class="warn-t">' + fmt(tot - TRUCK, 1) + ' pallets over one truck</span> — move some to another day, or use the evening load';
    else if (tot < TRUCK) note = fmt(TRUCK - tot, 1) + ' spare pallet spaces on the truck';
    else note = 'Full truck ✓';
    h += '<div class="trow"><strong>' + fMed(d) + '</strong><div class="bar" title="' + fmt(tot, 1) + ' pallets">' +
      '<span class="' + (over ? 'over' : '') + '" style="width:' + clamp(pal / TRUCK * 100, 0, 100) + '%"></span>' +
      (lids > 0 ? '<span class="eve" style="width:' + clamp(lids / TRUCK * 100, 0, 100 - clamp(pal / TRUCK * 100, 0, 100)) + '%"></span>' : '') + '</div>' +
      '<div class="tnote">' + (pal > 0 ? '<b>' + fmt(pal, 1) + ' plt cans</b> · ' : '') + note + '</div></div>' +
      '<div class="trow" style="padding:0 0 6px"><span></span><label>Lids / other pallets on this truck <input type="number" min="0" step="1" class="cell-in" style="max-width:70px" value="' + (lids || '') + '" placeholder="0" data-act="lids" data-date="' + d + '" data-fid="lids:' + d + '"></label><span></span></div>';
  });
  return h + '<p class="muted" style="font-size:11.5px;margin-top:4px">Blue = lids or other pallets sharing the truck (lids are not planned here, so enter how many you are bringing). If a day needs more than one truck, Orora can send a second load that evening — rare.</p></div>';
}

function canStore(R) {
  var s = state.settings, pk = R.canPeak;
  var h = '<div class="trucks" style="border-top:1px solid var(--line);padding-top:14px"><h4>' + icon('can') + 'Can store · ' + fmt(pk.total, 1) + ' pallets at the delivery-week peak (' + fMed(pk.date) + ') ' +
    chip(R.canStatus, R.canStatus === 'order' ? 'Over maximum' : R.canStatus === 'watch' ? 'Over comfortable limit' : 'Within limits') + '</h4>' +
    '<div class="chart-wrap" style="padding:0">' + barChart(R, { stacks: [{ color: '#47D7AC', get: function (i) { return R.cansStore[i].total; } }], lines: [{ v: s.canSoft, label: 'Comfortable ' + s.canSoft, dash: true }, { v: s.canMax, label: 'Maximum ' + s.canMax, dash: false, orange: true }], overAt: s.canMax, aria: 'Projected can storage in pallets each weekday' }) + '</div>' +
    '<div class="row" style="margin-top:6px;font-size:12px"><label class="muted">Comfortable limit <input type="number" class="cell-in" min="1" value="' + s.canSoft + '" data-act="setting" data-k="canSoft" data-fid="s:canSoft" style="max-width:76px"></label>' +
    '<label class="muted">Absolute maximum <input type="number" class="cell-in" min="1" value="' + s.canMax + '" data-act="setting" data-k="canMax" data-fid="s:canMax" style="max-width:76px"></label><span class="muted">pallets (from the Orora order sheet: 90 / 104)</span></div></div>';
  return h;
}

/* ---- pallet space */
function glassSVG(frac, over, cap) {
  var f = clamp(frac, 0, 1), bottom = 288, top = 26, y = bottom - (bottom - top) * f;
  var xl = function (yy) { return 28 + 20 * (yy - 22) / 254; }, xr = function (yy) { return 172 - 20 * (yy - 22) / 254; };
  var glass = 'M28 22 H172 L152 276 Q150 290 136 290 H64 Q50 290 48 276 Z';
  var s = '<svg class="glass" viewBox="0 0 230 310" role="img" aria-label="Pint glass filled to ' + Math.round(frac * 100) + ' percent of the pallet allowance">' +
    '<defs><clipPath id="gc"><path d="' + glass + '"/></clipPath><clipPath id="lc"><rect x="0" y="' + y.toFixed(1) + '" width="230" height="' + (310 - y).toFixed(1) + '"/></clipPath>' +
    '<linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFD637"/><stop offset="1" stop-color="#FDAA63"/></linearGradient></defs>' +
    '<path d="' + glass + '" fill="#fff"/><g clip-path="url(#gc)"><rect x="0" y="' + y.toFixed(1) + '" width="230" height="' + (310 - y).toFixed(1) + '" fill="url(#lg)"/><g clip-path="url(#lc)">';
  [[60, 250, 5, 0], [95, 270, 3, 1.3], [120, 245, 4, 2.4], [80, 280, 2.5, 3.1], [140, 260, 3.5, 0.7], [105, 285, 2.5, 1.9], [70, 265, 3, 3.8]].forEach(function (b) {
    s += '<circle class="gb" cx="' + b[0] + '" cy="' + b[1] + '" r="' + b[2] + '" fill="#fff" fill-opacity=".75" style="animation-delay:-' + b[3] + 's"/>';
  });
  s += '</g>';
  if (f > 0.005) {
    var fy = y, n = 6, x0 = xl(fy) + 6, x1 = xr(fy) - 6;
    for (var i = 0; i < n; i++) { var cx = x0 + (x1 - x0) * i / (n - 1); s += '<circle cx="' + cx.toFixed(1) + '" cy="' + (fy + 1).toFixed(1) + '" r="12" fill="#fff" stroke="#F1EB9C" stroke-width="2"/>'; }
    s += '<rect x="' + (xl(fy) + 2).toFixed(1) + '" y="' + (fy + 1).toFixed(1) + '" width="' + (xr(fy) - xl(fy) - 4).toFixed(1) + '" height="12" fill="#fff"/>';
  }
  s += '<path d="M52 40 L66 270" stroke="#fff" stroke-opacity=".55" stroke-width="5" stroke-linecap="round" fill="none"/></g>';
  if (over) {
    s += '<g><circle cx="52" cy="14" r="13" fill="#fff" stroke="#F1EB9C" stroke-width="2"/><circle cx="82" cy="8" r="14" fill="#fff" stroke="#F1EB9C" stroke-width="2"/><circle cx="116" cy="6" r="15" fill="#fff" stroke="#F1EB9C" stroke-width="2"/><circle cx="148" cy="9" r="13" fill="#fff" stroke="#F1EB9C" stroke-width="2"/><circle cx="170" cy="16" r="11" fill="#fff" stroke="#F1EB9C" stroke-width="2"/>' +
      '<path d="M176 24 q10 20 6 46 q-2 10 -9 3 q-4 -8 -1 -22 z" fill="#FDAA63" stroke="#000" stroke-width="1.5"/><path d="M26 24 q-9 14 -5 34 q3 8 8 2 q3 -16 2 -34 z" fill="#FDAA63" stroke="#000" stroke-width="1.5"/></g>';
  }
  s += '<path d="' + glass + '" fill="none" stroke="#000" stroke-width="3.5" stroke-linejoin="round"/>';
  [0.25, 0.5, 0.75, 1].forEach(function (t) {
    var ty = bottom - (bottom - top) * t, x = xr(ty);
    s += '<line x1="' + (x + 4) + '" y1="' + ty.toFixed(1) + '" x2="' + (x + 14) + '" y2="' + ty.toFixed(1) + '" stroke="#000" stroke-width="1.5"/><text x="' + (x + 18) + '" y="' + (ty + 3.5).toFixed(1) + '" font-size="10" fill="#6B685D" font-family="Lexend,sans-serif">' + Math.round(cap * t) + '</text>';
  });
  return s + '</svg>';
}

// Generic weekday bar chart. cfg: stacks [{color,get(i)}], lines [{v,label,dash,orange}], overAt, selectable, aria
function barChart(R, cfg) {
  var days = TL.days.filter(function (d) { var w = dow(d); return w > 0 && w < 6; });
  var W = 960, H = 280, L = 44, Rr = 12, T = 22, B = 46, n = days.length;
  var totals = days.map(function (d) { return cfg.stacks.reduce(function (a, st) { return a + st.get(TL.idx[d]); }, 0); });
  var maxLine = Math.max.apply(null, cfg.lines.map(function (l) { return l.v; }));
  var max = Math.max(maxLine * 1.18, Math.max.apply(null, totals) * 1.1, 10);
  var bw = (W - L - Rr) / n, yy = function (v) { return T + (H - T - B) * (1 - v / max); };
  var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(cfg.aria) + '">';
  var i0 = days.indexOf(TL.dwDays[0]);
  if (i0 >= 0) s += '<rect x="' + (L + i0 * bw).toFixed(1) + '" y="' + T + '" width="' + (bw * 5).toFixed(1) + '" height="' + (H - T - B) + '" fill="#E8FAF4"/><text x="' + (L + i0 * bw + 4).toFixed(1) + '" y="' + (T + 11) + '" font-size="10" font-weight="600">Delivery week</text>';
  [0, 0.25, 0.5, 0.75, 1].forEach(function (t) {
    var v = Math.round(max * t / 5) * 5, y = yy(v);
    s += '<line x1="' + L + '" x2="' + (W - Rr) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="#E7E5DE"/><text class="ax" x="' + (L - 6) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="end">' + v + '</text>';
  });
  days.forEach(function (d, i) {
    var gi = TL.idx[d], x = L + i * bw, w = bw * 0.7, xx = x + bw * 0.15, base = H - B, tot = totals[i], over = r1(tot) > cfg.overAt;
    var sel = cfg.selectable && R.view && R.view.date === d, acc = 0, rects = '';
    cfg.stacks.forEach(function (st) { var v = st.get(gi), hh = (H - T - B) * v / max; rects += '<rect x="' + xx.toFixed(1) + '" y="' + (base - acc - hh).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + hh.toFixed(1) + '" fill="' + st.color + '"/>'; acc += hh; });
    var arr = cfg.selectable ? R.space[gi].arr : 0;
    s += '<g class="bargrp"' + (cfg.selectable ? ' data-act="view" data-date="' + d + '"' : '') + '><title>' + fMed(d) + ': ' + fmt(tot, 1) + ' pallets' + (arr > 0 ? ' · +' + fmt(arr, 1) + ' arriving' : '') + '</title>' +
      '<rect class="hit" x="' + x.toFixed(1) + '" y="' + T + '" width="' + bw.toFixed(1) + '" height="' + (H - T - B) + '" fill="transparent"/>' + rects +
      '<rect x="' + xx.toFixed(1) + '" y="' + (base - acc).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + acc.toFixed(1) + '" fill="none" stroke="' + (over ? '#FDAA63' : sel ? '#000' : 'none') + '" stroke-width="' + (over ? 3 : 2) + '"/>' +
      (over ? '<circle cx="' + (xx + w / 2).toFixed(1) + '" cy="' + (base - acc - 10).toFixed(1) + '" r="7" fill="#FDAA63" stroke="#000"/><text x="' + (xx + w / 2).toFixed(1) + '" y="' + (base - acc - 6.5).toFixed(1) + '" font-size="10" font-weight="700" text-anchor="middle">!</text>' : '') +
      (arr > 0.01 ? '<path d="M' + (xx + w / 2 - 4).toFixed(1) + ' ' + (base + 12) + ' h8 l-4 -7z" fill="#000"/>' : '') + '</g>';
    s += '<text class="ax" x="' + (xx + w / 2).toFixed(1) + '" y="' + (base + 24) + '" text-anchor="middle">' + 'MTWTF'.charAt(dow(d) - 1) + '</text>';
    if (dow(d) === 1) s += '<text x="' + xx.toFixed(1) + '" y="' + (base + 38) + '" font-size="10" font-weight="600">' + fShort(d) + '</text>';
    if (d === TL.orderDate) s += '<text x="' + (xx + w / 2).toFixed(1) + '" y="' + (T - 8) + '" font-size="10" font-weight="700" text-anchor="middle">Order ▾</text>';
  });
  cfg.lines.forEach(function (l) {
    var cy = yy(l.v);
    s += '<line x1="' + L + '" x2="' + (W - Rr) + '" y1="' + cy.toFixed(1) + '" y2="' + cy.toFixed(1) + '" stroke="' + (l.orange ? '#FDAA63' : '#000') + '" stroke-width="2"' + (l.dash ? ' stroke-dasharray="7 5"' : '') + '/><text x="' + (W - Rr) + '" y="' + (cy - 5).toFixed(1) + '" font-size="11" font-weight="700" text-anchor="end">' + esc(l.label) + '</text>';
  });
  return s + '</svg>';
}

function spaceSection(R) {
  var cap = state.capacity, v = R.view, frac = v.total / cap, over = r1(v.total) > cap, free = cap - v.total;
  var wk = TL.days.filter(function (d) { var w = dow(d); return w > 0 && w < 6; });
  var den = Math.max(v.total, cap);
  var h = '<section class="sec" id="space"><div class="sec-head"><div><span class="eyebrow">Pallet space</span><h2>How full is the cellar?</h2>' +
    '<p>Cartons and clusters share one pallet allowance. Cans have their own store (shown under Cans above) and pallet pads are not counted.</p></div></div>' +
    '<div class="panel"><div class="space-grid"><div>' + glassSVG(frac, over, cap) + '</div><div>' +
    '<div class="caprow"><label for="capInput">Pallet space allowance (cartons + clusters)</label>' +
    '<button class="btn step" data-act="capstep" data-d="-5" aria-label="Minus 5">−5</button><button class="btn step" data-act="capstep" data-d="-1" aria-label="Minus 1">−1</button>' +
    '<input type="number" id="capInput" min="1" max="9999" step="1" value="' + cap + '" data-act="cap" data-fid="cap">' +
    '<button class="btn step" data-act="capstep" data-d="1" aria-label="Plus 1">+1</button><button class="btn step" data-act="capstep" data-d="5" aria-label="Plus 5">+5</button><span class="muted" style="font-size:12px">pallets</span></div>' +
    '<div class="big num">' + fmt(v.total, 1) + '<small>of ' + cap + ' pallets on ' + fMed(v.date) + '</small></div>' +
    chip(over ? 'order' : free <= cap * 0.1 ? 'watch' : 'ok', over ? 'Over by ' + fmt(v.total - cap, 1) + ' pallets' : fmt(free, 1) + ' pallets free') +
    '<div class="split" aria-hidden="true"><span style="width:' + (v.c / den * 100).toFixed(1) + '%;background:var(--purple)"></span><span style="width:' + (v.k / den * 100).toFixed(1) + '%;background:var(--sky)"></span></div>' +
    '<div class="sl"><span><i style="background:var(--purple)"></i>Cartons ' + fmt(v.c, 1) + ' pallets</span><span><i style="background:var(--sky)"></i>Clusters ' + fmt(v.k, 1) + ' pallets</span></div>' +
    '<div class="viewrow"><label for="viewSel">Showing</label><select id="viewSel" data-act="viewsel" data-fid="viewsel">' + wk.map(function (d) { return '<option value="' + d + '"' + (d === v.date ? ' selected' : '') + '>' + fMed(d) + '</option>'; }).join('') + '</select>' +
    (state.viewDate ? '<button class="btn small" data-act="viewpeak">Back to delivery-week peak</button>' : '<span>(peak day of delivery week)</span>') + '</div>' +
    '</div></div><div class="chart-wrap">' + barChart(R, { stacks: [{ color: '#7566A0', get: function (i) { return R.space[i].c; } }, { color: '#99D6EA', get: function (i) { return R.space[i].k; } }], lines: [{ v: cap, label: 'Allowance ' + cap, dash: true }], overAt: cap, selectable: true, aria: 'Projected pallet space used each weekday against the allowance' }) + '</div>' +
    '<div class="chart-leg"><span><i style="background:var(--purple)"></i>Cartons</span><span><i style="background:var(--sky)"></i>Clusters</span><span><i class="dash"></i>Allowance</span><span><i style="background:#fff;border:3px solid var(--orange)"></i>Over allowance</span><span>▲ delivery arrives</span><span>Click a bar to show it in the glass</span></div>';
  if (R.overDays.length) {
    var worst = R.overDays.reduce(function (a, b) { return b.total > a.total ? b : a; });
    h += '<p class="note"><span class="warn-t">Over the allowance on ' + R.overDays.length + ' weekday' + (R.overDays.length > 1 ? 's' : '') + '</span> — worst is ' + fMed(worst.date) + ' at ' + fmt(worst.total, 1) + ' pallets (' + fmt(worst.total - cap, 1) + ' over). Trim a carton or cluster order, move a Visy delivery later in the week, or raise the allowance.</p>';
  } else h += '<p class="note">✓ Everything fits within the ' + cap + '-pallet allowance for the whole planning window.</p>';
  h += '<div class="tbl-wrap"><table><thead><tr><th>Delivery week</th><th class="r">Cartons in (plt)</th><th class="r">Clusters in (plt)</th><th class="r">On site after deliveries</th><th class="r">Free</th></tr></thead><tbody>';
  TL.dwDays.forEach(function (d) {
    var i = TL.idx[d], rc = 0, rk = 0;
    ITEMS.forEach(function (it) { if (it.mat === 'cartons' || it.mat === 'clusters') { var pl = R.items[it.id].full[i].del / state.params[it.id].perPallet; if (it.mat === 'cartons') rc += pl; else rk += pl; } });
    var t = R.space[i].total, fr = cap - t;
    h += '<tr><td><strong>' + fMed(d) + '</strong></td><td class="r num">' + (rc ? fmt(rc, 1) : '—') + '</td><td class="r num">' + (rk ? fmt(rk, 1) : '—') + '</td><td class="r num"><b>' + fmt(t, 1) + '</b></td><td class="r num">' + (fr < 0 ? '<span class="warn-t">' + fmt(fr, 1) + '</span>' : fmt(fr, 1)) + '</td></tr>';
  });
  return h + '</tbody></table></div></div></section>';
}

/* ---- inputs */
function planSection() {
  var wks = TL.weeks, meta = state.lbbMeta;
  var h = '<section class="sec" id="inputs"><div class="sec-head"><div><span class="eyebrow">Brew plan &amp; stock</span><h2>What the numbers are built from</h2>' +
    '<p>The brew schedule comes from the Live Brewery Board; the stock count and any orders already on their way are entered here. Everything above updates straight away.</p></div></div>';

  var dm = state.delMeta || {};
  h += '<div class="panel" style="margin-bottom:14px"><div class="pad"><div class="row" style="justify-content:space-between;align-items:flex-start"><div style="max-width:660px"><h3 style="font-size:15px">Orora &amp; cluster order sheets — what is coming and when</h3>' +
    '<p class="muted" style="font-size:12.5px;margin-top:3px">Upload the <b>Orora Order Sheet</b> and the <b>Cluster Wrap Order Sheet</b> (select both at once, or one at a time). The site reads each week\'s tab and lists every can load (with PO and AM/PM) and cluster delivery from the stock-count day up to the delivery week you are about to order for. Re-uploading replaces the earlier sheet figures; loads you typed in yourself are kept. Can loads are 22 pallets.</p>' +
    '<label class="row" style="margin-top:8px;font-size:12.5px;gap:8px"><input type="checkbox" data-act="cdin" data-fid="s:cdin"' + (state.settings.dueTodayOpen !== false ? ' checked' : '') + ' style="width:16px;height:16px;accent-color:var(--purple)"> Include deliveries due on the stock-count day <span class="muted">(untick if they are already in the stock spreadsheet)</span></label>' +
    ['orora', 'cluster'].map(function (k) { var m = dm[k]; return '<p style="font-size:12.5px;margin-top:8px">' + (m ? chip('ok', 'Loaded') + ' <b>' + esc(m.name) + '</b> · ' + m.n + ' deliveries · uploaded ' + fMed(m.at) : chip('watch', 'Not loaded') + ' ' + (k === 'orora' ? 'Orora Order Sheet' : 'Cluster Wrap Order Sheet')) + '</p>'; }).join('') +
    '</div><div class="row"><button class="btn teal" data-act="delpick">Upload order sheets (.xlsx)</button>' + (state.open.some(function (o) { return o.src; }) ? '<button class="btn" data-act="delclear">Remove sheet deliveries</button>' : '') + '</div></div></div></div>';

  var im = state.invMeta, oo = state.invOnOrder || {}, ooKeys = Object.keys(oo).filter(function (id) { return ITEM[id] && oo[id] > 0; });
  h += '<div class="panel" style="margin-bottom:14px"><div class="pad"><div class="row" style="justify-content:space-between;align-items:flex-start"><div style="max-width:660px"><h3 style="font-size:15px">Stock spreadsheet (NetSuite inventory)</h3>' +
    '<p class="muted" style="font-size:12.5px;margin-top:3px">Upload the <b>Inventory – HOPS, YEAST, Grain, Packaging</b> export each time. The <b>Can</b>, <b>Carton Empty</b> and <b>Cluster</b> rows fill the stock table below and the stock date is set to today. Pallet pads are not in that report, so enter them by hand. The file is read in your browser and is not sent anywhere.</p>' +
    '<label class="fld" style="max-width:300px;margin-top:8px"><span>Count stock from</span><select data-act="invcol" data-fid="s:invcol"><option value="brewery"' + (state.settings.invCol !== 'total' ? ' selected' : '') + '>Brewery On Hand only</option><option value="total"' + (state.settings.invCol === 'total' ? ' selected' : '') + '>Total On Hand (incl. Be Cool and Credit Return)</option></select></label>' +
    (im ? '<p style="font-size:12.5px;margin-top:8px">' + chip('ok', 'Loaded') + ' <b>' + esc(im.name) + '</b> · ' + im.n + ' items · uploaded ' + fMed(im.at) + '</p>' : '<p style="font-size:12.5px;margin-top:8px">' + chip('watch', 'Not loaded') + ' Using the stock figures entered below.</p>') +
    (ooKeys.length ? '<details style="margin-top:8px"><summary style="cursor:pointer;font-size:12.5px">On order per NetSuite (no arrival dates) — for reference</summary><p class="muted" style="font-size:11.5px;margin:6px 0">These have no delivery dates, so they are not counted. Add the ones still to arrive under <b>Orders already on their way</b> with their date.</p><div style="font-size:12.5px;columns:2;column-gap:24px">' +
      ooKeys.map(function (id) { var it = ITEM[id]; return '<div>' + MAT[it.mat].name + ' ' + (it.sku ? SKU_LABEL[it.sku] : '') + ': <b>' + fmt(oo[id]) + '</b></div>'; }).join('') + '</div></details>' : '') +
    '</div><div class="row"><button class="btn teal" data-act="invpick">Upload stock spreadsheet (.xlsx)</button></div></div></div></div>';

  h += '<div class="panel" style="margin-bottom:14px"><div class="pad"><div class="row" style="justify-content:space-between;align-items:flex-start"><div style="max-width:660px"><h3 style="font-size:15px">Live Brewery Board</h3>' +
    '<p class="muted" style="font-size:12.5px;margin-top:3px">Upload the Live Brewery Board workbook. The site reads the <b>Cartons</b> rows of each <b>WC</b> tab (cases packed per day, weekends included) from this week onwards — the same schedule the Orora and cluster order sheets are built from. The file is read in your browser and is not sent anywhere.</p>' +
    (meta ? '<p style="font-size:12.5px;margin-top:8px">' + chip('ok', 'Loaded') + ' <b>' + esc(meta.name) + '</b> · weeks commencing ' + state.lbbWeeks.slice().sort().map(fShort).join(', ') + '</p>' : '<p style="font-size:12.5px;margin-top:8px">' + chip('watch', 'Not loaded') + ' Using the weekly figures below.</p>') +
    '</div><div class="row"><button class="btn teal" data-act="lbbpick">Upload Live Brewery Board (.xlsx)</button>' + (state.lbbWeeks.length ? '<button class="btn" data-act="lbbclear">Remove schedule</button>' : '') + '</div></div></div></div>';

  h += '<details class="panel" open data-ui="plan"><summary>Cases packed per week <small>one case = 1 carton, 4 clusters, 16 cans · weeks from the Live Brewery Board are read-only</small></summary><div class="panel-body"><div class="tbl-wrap" style="padding:0"><table><thead><tr><th>SKU</th>';
  wks.forEach(function (w) {
    var tag = w === TL.orderWeek ? 'ord' : w === TL.dw ? 'del' : w === mondayOf(TL.cd) ? 'cur' : '';
    var lab = w === TL.orderWeek ? 'Order week' : w === TL.dw ? 'Delivery week' : w === mondayOf(TL.cd) ? 'This week' : 'Later';
    h += '<th class="wk ' + tag + '">w/c ' + fShort(w) + '<small>' + lab + (isLbbWeek(w) ? ' · LBB' : '') + '</small></th>';
  });
  h += '</tr></thead><tbody>';
  ALL_SKUS.forEach(function (k) {
    h += '<tr><td class="sku">' + SKU_LABEL[k] + '</td>';
    wks.forEach(function (w) {
      if (isLbbWeek(w)) h += '<td class="r num lbbcell">' + (weekCases(k, w) ? fmt(weekCases(k, w)) : '<span class="muted">–</span>') + '</td>';
      else h += '<td class="r"><input class="cell-in" type="number" min="0" step="100" value="' + (weekCases(k, w) || '') + '" placeholder="0" data-act="plan" data-sku="' + k + '" data-wk="' + w + '" data-fid="plan:' + k + ':' + w + '" aria-label="Cases for ' + SKU_LABEL[k] + ' week commencing ' + fShort(w) + '"></td>';
    });
    h += '</tr>';
  });
  h += '</tbody><tfoot><tr><td>Total</td>' + wks.map(function (w) { return '<td class="r num">' + fmt(totalCases(w)) + '</td>'; }).join('') + '</tr></tfoot></table></div>' +
    '<div class="grid2" style="margin-top:14px"><div class="fld"><span>Or paste weekly figures from a spreadsheet</span><textarea id="pasteTxt" placeholder="XPA&#9;14000&#9;14000&#9;15400&#10;CPT&#9;5000&#9;5000&#9;5500&#10;…SKU name first, then cases for each week" data-fid="pastetxt"></textarea></div>' +
    '<div class="fld"><span>First pasted column is the week commencing</span><select id="pasteWk" data-fid="pastewk">' + wks.map(function (w, i) { return '<option value="' + w + '"' + (i === 0 ? ' selected' : '') + '>' + fMed(w) + '</option>'; }).join('') + '</select>' +
    '<div class="row" style="margin-top:8px"><button class="btn teal small" data-act="paste">Apply pasted figures</button></div><p class="muted" style="font-size:11.5px;margin-top:6px">Weeks that come from the Live Brewery Board are not overwritten. Manual weeks are spread evenly Mon–Fri.</p></div></div></div></details>';

  h += '<details class="panel" style="margin-top:14px" open data-ui="stock"><summary>Stock on hand <small>counted ' + fMed(TL.cd) + ' · cartons and pads in units, clusters and cans in pallets</small></summary><div class="panel-body"><div class="tbl-wrap" style="padding:0"><table><thead><tr><th>SKU</th><th class="r">Cartons <small style="text-transform:none;letter-spacing:0">(units)</small></th><th class="r">Clusters <small style="text-transform:none;letter-spacing:0">(pallets)</small></th><th class="r">Cans <small style="text-transform:none;letter-spacing:0">(pallets)</small></th></tr></thead><tbody>';
  ALL_SKUS.forEach(function (k) {
    h += '<tr><td class="sku">' + SKU_LABEL[k] + '</td>';
    ['cartons', 'clusters', 'cans'].forEach(function (m) {
      var it = ITEM[m + ':' + k];
      if (!it) { h += '<td class="r muted">n/a</td>'; return; }
      var v = toDisp(it, state.stock[it.id] || 0), pal = MAT[m].entry === 'pallets';
      h += '<td class="r"><input class="cell-in" type="number" min="0" step="' + (m === 'clusters' ? 0.25 : pal ? 0.5 : 50) + '" value="' + (v ? (pal ? Math.round(v * 100) / 100 : Math.round(v)) : '') + '" placeholder="0" data-act="stock" data-id="' + it.id + '" data-fid="stock:' + it.id + '" aria-label="' + MAT[m].name + ' on hand for ' + SKU_LABEL[k] + '"></td>';
    });
    h += '</tr>';
  });
  var pit = ITEM['pads:all'];
  h += '</tbody></table></div><div class="row" style="margin-top:12px"><label class="fld" style="max-width:240px"><span>Pallet pads on hand (pads)</span><input type="number" min="0" step="50" value="' + (state.stock[pit.id] || '') + '" placeholder="0" data-act="stock" data-id="pads:all" data-fid="stock:pads:all"></label></div>' +
    '<p class="muted" style="font-size:11.5px;margin-top:8px">Count on the Wednesday and include Thursday and Friday deliveries that are still to arrive in <b>Orders already on their way</b> below (as in the order SOPs).</p></div></details>';

  h += '<details class="panel" style="margin-top:14px" open data-ui="open"><summary>Orders already on their way <small>placed on earlier Thursdays and not yet delivered</small></summary><div class="panel-body"><div class="tbl-wrap" style="padding:0"><table><thead><tr><th>Item</th><th class="r">Quantity</th><th class="r">PO</th><th>Arrives</th><th></th></tr></thead><tbody>';
  var opens = state.open.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  if (!opens.length) h += '<tr><td colspan="5" class="muted">Nothing on the way. Add anything that is still to be delivered so it is counted.</td></tr>';
  opens.forEach(function (o) {
    var it = ITEM[o.itemId];
    h += '<tr><td><span class="sku">' + esc(MAT[it.mat].name) + '</span> · ' + esc(it.label) + '</td><td class="r"><input class="cell-in" type="number" min="0" step="any" value="' + Math.round(toDisp(it, o.qty) * 100) / 100 + '" data-act="oqty" data-oid="' + o.id + '" data-fid="oqty:' + o.id + '" aria-label="Quantity"><small>' + dispUnit(it) + '</small></td>' +
      '<td class="r" style="white-space:nowrap">' + (o.po ? '<small>' + esc(o.po) + (o.slot ? ' · ' + esc(o.slot) : '') + '</small>' : '') + '</td><td><input type="date" value="' + o.date + '" data-act="odate" data-oid="' + o.id + '" data-fid="odate:' + o.id + '" style="max-width:160px"></td><td><button class="btn small" data-act="odel" data-oid="' + o.id + '">Remove</button></td></tr>';
  });
  h += '<tr><td><select id="oaItem" data-fid="oaitem" aria-label="Item to add">' + ITEMS.map(function (it) { return '<option value="' + it.id + '">' + MAT[it.mat].name + ' · ' + esc(it.label) + '</option>'; }).join('') + '</select></td>' +
    '<td class="r"><input class="cell-in" type="number" id="oaQty" min="0" step="any" placeholder="Qty" data-fid="oaqty" aria-label="Quantity"><small>cartons / pads / pallets</small></td><td></td>' +
    '<td><input type="date" id="oaDate" value="' + addDays(TL.cd, 1) + '" data-fid="oadate" style="max-width:160px"></td><td><button class="btn teal small" data-act="oadd">Add</button></td></tr>';
  return h + '</tbody></table></div></div></details></section>';
}

function settingsSection() {
  var s = state.settings;
  var h = '<section class="sec" id="settings"><div class="sec-head"><div><span class="eyebrow">Settings</span><h2>Pack sizes, minimums &amp; rules</h2>' +
    '<p>Tagged <span class="src hb">Sheets / handbook</span> values come from your order sheets or the Role Handbook. Tagged <span class="src ph">Check</span> values are placeholders — please confirm or correct them.</p></div></div>';
  h += '<details class="panel" data-ui="params"><summary>Minimum stock, order step and conversions <small>all editable</small></summary><div class="panel-body"><div class="tbl-wrap" style="padding:0"><table><thead><tr><th>Item</th><th class="r">Units per pallet</th><th class="r">Units per case</th><th class="r">Minimum stock</th><th class="r">Buffer on planned use (%)</th><th class="r">Order step</th></tr></thead><tbody>';
  var notes = {
    cartons: '<span class="src hb">Handbook</span> 1,050 per pallet; reorder-below and batch sizes from SOP-008 · one carton per case · <span class="src ph">Check</span> LPA and Black Lager levels (3,000 / 3,000) are placeholders',
    pads: '<span class="src">You</span> Order 6,000 when stock drops below 4,000. Pads used per finished pallet below is still a guess — please check',
    clusters: '<span class="src hb">Cluster sheet</span> 32,000 per pallet, 4 per case, minimum stock per SKU, ordered in whole pallets',
    cans: '<span class="src hb">Orora sheet</span> 7,391 per pallet, 16 per case, 10% buffer on planned production, ordered in whole pallets'
  };
  MAT_ORDER.forEach(function (mk) {
    h += '<tr><td colspan="6" style="background:var(--wash);font-size:12px"><strong>' + MAT[mk].name + '</strong> · ' + notes[mk] + '</td></tr>';
    ITEMS.filter(function (i) { return i.mat === mk; }).forEach(function (it) {
      var p = state.params[it.id];
      h += '<tr><td class="sku">' + esc(it.label) + '</td>' +
        '<td class="r">' + (mk === 'pads' ? '<span class="muted">n/a</span>' : '<input class="cell-in" type="number" min="1" value="' + p.perPallet + '" data-act="param" data-f="perPallet" data-id="' + it.id + '" data-fid="pp:' + it.id + '">') + '</td>' +
        '<td class="r">' + (mk === 'pads' ? '<span class="muted">see below</span>' : '<input class="cell-in" type="number" min="0" step="any" value="' + p.perCase + '" data-act="param" data-f="perCase" data-id="' + it.id + '" data-fid="pc:' + it.id + '">') + '</td>' +
        '<td class="r"><input class="cell-in" type="number" min="0" step="any" value="' + Math.round(toDisp(it, p.min) * 100) / 100 + '" data-act="param" data-f="min" data-id="' + it.id + '" data-fid="mn:' + it.id + '"><small>' + dispUnit(it) + '</small></td>' +
        '<td class="r"><input class="cell-in" type="number" min="0" step="any" value="' + (p.minPct || 0) + '" data-act="param" data-f="minPct" data-id="' + it.id + '" data-fid="mp:' + it.id + '"></td>' +
        '<td class="r"><input class="cell-in" type="number" min="0" step="any" value="' + Math.round(toDisp(it, p.step) * 100) / 100 + '" data-act="param" data-f="step" data-id="' + it.id + '" data-fid="st:' + it.id + '"><small>' + dispUnit(it) + '</small></td></tr>';
    });
  });
  h += '</tbody></table></div><div class="grid2" style="margin-top:14px"><label class="fld"><span><span class="src ph">Check</span> Cases per finished pallet</span><input type="number" min="1" value="' + s.casesPerPallet + '" data-act="setting" data-k="casesPerPallet" data-fid="s:cpp"></label>' +
    '<label class="fld"><span><span class="src ph">Check</span> Pallet pads used per finished pallet</span><input type="number" min="0" step="any" value="' + s.padsPerPallet + '" data-act="setting" data-k="padsPerPallet" data-fid="s:ppp"></label></div>' +
    '<div class="grid2" style="margin-top:12px"><label class="fld"><span>Clusters: how far ahead to cover</span><select data-act="setting" data-k="clusterWeeks" data-fid="s:cw"><option value="1"' + (s.clusterWeeks !== 2 ? ' selected' : '') + '>One week (to end of delivery week)</option><option value="2"' + (s.clusterWeeks === 2 ? ' selected' : '') + '>Two weeks (to end of the week after)</option></select></label></div>' +
    '<label class="row" style="margin-top:14px;font-size:13px"><input type="checkbox" data-act="whole" data-fid="s:whole"' + (s.wholePallets ? ' checked' : '') + ' style="width:16px;height:16px;accent-color:var(--purple)"> Count part-pallets as whole pallets in the space check <span class="muted">(a part-pallet still takes a floor position; off = matches your order sheets, which use fractions)</span></label></div></details>';
  h += '<details class="panel" style="margin-top:14px" data-ui="how"><summary>How the suggestions work</summary><div class="panel-body" style="font-size:13px;line-height:1.55">' +
    '<p>Orders are placed on a <strong>Thursday</strong>. Clusters land the <strong>following Wednesday</strong>; cartons and pallet pads can land <strong>any weekday</strong> the following week; cans land <strong>Mon–Fri mornings</strong> that week.</p>' +
    '<p style="margin-top:8px">Stock is projected day by day from your count, using the cases packed each day on the Live Brewery Board (16 cans, 4 clusters and 1 carton per case) and the orders already on their way. A line is flagged <strong>Order this Thursday</strong> when projected stock would fall below its minimum at the <em>cover date</em>:</p>' +
    '<ul style="margin:6px 0 0 18px;padding:0"><li><strong>Clusters</strong> — end of delivery week (one week ahead, as run for the rest of the year; switch to two weeks in Settings), with the per-SKU emergency minimum stock.</li><li><strong>Cans</strong> — end of delivery week, covering planned production plus a 10% buffer (as in the Orora Order Sheet).</li><li><strong>Cartons &amp; pads</strong> — end of delivery week, keeping the Visy reorder-below level from SOP-008.</li></ul>' +
    '<p style="margin-top:8px">Quantities round up to the order step (whole pallets for clusters and cans). Cans are placed on trucks of 22 pallets, filling the latest day that still works, and cartons/pads are suggested for the latest weekday that leaves about a day of buffer.</p>' +
    '<p style="margin-top:8px"><strong>Run-out before delivery</strong> means stock is projected to hit zero before the earliest day this order could arrive — ordering alone will not fix it, so talk to the supplier.</p></div></details>';
  h += '<details class="panel" style="margin-top:14px" data-ui="data"><summary>Data <small>saved in this browser only</small></summary><div class="panel-body"><div class="row">' +
    '<button class="btn" data-act="export">Export backup (.json)</button><button class="btn" data-act="import">Import backup</button><button class="btn" data-act="sample">Reload starting figures</button><button class="btn" data-act="clear">Clear all figures</button></div>' +
    '<p class="muted" style="font-size:12px;margin-top:10px">Figures live in this browser on this device. To use them on another computer, export a backup and import it there.</p></div></details></section>';
  return h;
}

function summaryText(R) {
  var L = ['Balter Brewing — raw material order, Thursday ' + fMed(TL.orderDate) + ' ' + TL.orderDate.slice(0, 4), ''];
  var groups = [['Smurfit Westrock — Clusters (arrive ' + fMed(TL.wed) + ')', ['clusters']], ['Visy — Cartons & pallet pads', ['cartons', 'pads']], ['Orora — Cans', ['cans']]];
  groups.forEach(function (g) {
    L.push(g[0]);
    var any = false;
    g[1].forEach(function (mk) {
      R.mats[mk].items.forEach(function (A) {
        if (A.qty <= 0) return; any = true;
        var it = A.it, line = '  ' + (mk === 'pads' ? 'Pallet pads' : MAT[mk].name + ' ' + it.label) + ': ';
        if (MAT[mk].entry === 'pallets') line += fmt(palletsOf(it, A.qty), 2) + ' pallets (' + fmt(A.qty) + ' ' + MAT[mk].unit + ')';
        else line += fmt(A.qty) + ' ' + MAT[mk].unit + (mk === 'cartons' ? ' (' + fmt(palletsOf(it, A.qty), 1) + ' pallets)' : '');
        if (MAT[mk].fixedDay == null) line += ' — deliver ' + fMed(A.day);
        L.push(line);
      });
    });
    if (!any) L.push('  Nothing to order');
    L.push('');
  });
  L.push('Pallet space (cartons + clusters): peak ' + fmt(R.peak.total, 1) + ' of ' + state.capacity + ' pallets on ' + fMed(R.peak.date) + (r1(R.peak.total) > state.capacity ? ' — OVER ALLOWANCE' : ' — within allowance'));
  L.push('Can store: peak ' + fmt(R.canPeak.total, 1) + ' pallets (comfortable ' + state.settings.canSoft + ', maximum ' + state.settings.canMax + ')');
  return L.join('\n');
}

function summarySection(R) {
  function box(title, sub, mats) {
    var rows = '';
    mats.forEach(function (mk) {
      R.mats[mk].items.forEach(function (A) {
        if (A.qty <= 0) return; var it = A.it;
        var q = MAT[mk].entry === 'pallets' ? fmt(palletsOf(it, A.qty), 2) + ' plt' : fmt(A.qty);
        rows += '<li><span>' + (mk === 'pads' ? 'Pallet pads' : MAT[mk].name + ' · ' + esc(it.label)) + (MAT[mk].fixedDay == null ? ' <span class="muted">' + fDow(A.day) + '</span>' : '') + '</span><b class="num">' + q + '</b></li>';
      });
    });
    return '<div class="sumbox"><h4>' + title + '</h4><div class="sub">' + sub + '</div>' + (rows ? '<ul>' + rows + '</ul>' : '<div class="none">Nothing to order</div>') + '</div>';
  }
  var short = MAT_ORDER.some(function (m) { return R.mats[m].items.some(function (a) { return a.shortAfter > 0.5; }); });
  return '<section class="sec" id="summary"><div class="sec-head"><div><span class="eyebrow">Ready to raise POs</span><h2>Thursday order summary</h2></div><button class="btn teal" data-act="copy">Copy order summary</button></div><div class="panel"><div class="sum">' +
    box('Smurfit Westrock', 'Clusters · arrive ' + fMed(TL.wed), ['clusters']) + box('Visy', 'Cartons &amp; pallet pads · Mon–Fri ' + fShort(TL.dwDays[0]) + ' – ' + fShort(TL.dwDays[4]), ['cartons', 'pads']) + box('Orora', 'Cans · Mon–Fri mornings', ['cans']) + '</div>' +
    '<div class="checkline">' + chip(R.spaceStatus === 'order' ? 'order' : 'ok', R.spaceStatus === 'order' ? 'Pallet space over allowance' : 'Fits pallet allowance') +
    chip(R.canStatus === 'order' ? 'order' : R.canStatus, R.canStatus === 'ok' ? 'Can store within limits' : R.canStatus === 'watch' ? 'Can store over comfortable limit' : 'Can store over maximum') +
    chip(short ? 'order' : 'ok', short ? 'Some lines below minimum' : 'All lines meet minimum') + '</div></div></section>';
}

/* ------------------------------------------------------------------ render */
var app, lastR, renderTimer, pointerDown = false, pending = false;

function render() {
  var ae = document.activeElement, fid = ae && ae.dataset ? ae.dataset.fid : null;
  var R = lastR = analyse();
  var banner = state.sample ? '<div class="banner"><span><b>Starting figures loaded.</b> The brew schedule is from your Live Brewery Board; cluster and can stock are rolled forward from your order sheets to Wed 28 Oct; <b>cartons are placeholders</b>; pallet pads are your 28 Oct count (5,487). Replace the stock with today\'s count.</span><button class="btn small" data-act="clear">Clear starting figures</button></div>' : '';
  var cards = '<section class="sec" id="order"><div class="sec-head"><div><span class="eyebrow">Order desk</span><h2>Cartons, pallet pads, clusters &amp; cans</h2><p>Each tank shows stock against its minimum (dashed line). Suggested quantities are pre-filled — change any quantity or delivery day and the space check updates.</p></div></div>' +
    MAT_ORDER.map(function (mk) { return matCard(R, mk); }).join('') + '</section>';
  app.innerHTML = banner + hero(R) + deliveryWeek(R) + cards + summarySection(R) + spaceSection(R) + planSection() + settingsSection();
  Array.prototype.forEach.call(app.querySelectorAll('details[data-ui]'), function (d) { var k = d.getAttribute('data-ui'); if (state.ui[k] != null) d.open = state.ui[k]; });
  document.getElementById('dateInput').value = state.countDate;
  if (fid) {
    var n = app.querySelector('[data-fid="' + fid.replace(/"/g, '\\"') + '"]');
    if (n && n !== ae) { n.focus(); if (n.select && n.type !== 'date' && n.type !== 'checkbox') { try { n.select(); } catch (e) { /* ignore */ } } }
  }
}
function commit() { save(); schedule(); }
function schedule() { if (pointerDown) { pending = true; return; } clearTimeout(renderTimer); renderTimer = setTimeout(render, 0); }
function toast(msg) { var t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('show'); }, 3200); }

/* ------------------------------------------------------------------ Live Brewery Board import (reads .xlsx directly, no libraries) */
function u16(dv, p) { return dv.getUint16(p, true); }
function u32(dv, p) { return dv.getUint32(p, true); }
function openZip(buf) {
  var dv = new DataView(buf), u8 = new Uint8Array(buf), i = u8.length - 22;
  while (i >= 0 && u32(dv, i) !== 0x06054b50) i--;
  if (i < 0) throw new Error('Not an Excel (.xlsx) file');
  var count = u16(dv, i + 10), p = u32(dv, i + 16), files = {}, dec = new TextDecoder();
  for (var k = 0; k < count; k++) {
    if (u32(dv, p) !== 0x02014b50) break;
    var nl = u16(dv, p + 28), el = u16(dv, p + 30), cl = u16(dv, p + 32);
    files[dec.decode(u8.subarray(p + 46, p + 46 + nl))] = { method: u16(dv, p + 10), csize: u32(dv, p + 20), lho: u32(dv, p + 42) };
    p += 46 + nl + el + cl;
  }
  return {
    has: function (n) { return !!files[n]; },
    text: function (n) {
      var f = files[n]; if (!f) return Promise.resolve('');
      var nl2 = u16(dv, f.lho + 26), el2 = u16(dv, f.lho + 28), st = f.lho + 30 + nl2 + el2, data = u8.subarray(st, st + f.csize);
      if (f.method === 0) return Promise.resolve(dec.decode(data));
      return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    }
  };
}
function xmlDecode(s) { return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, function (m, c) { return String.fromCharCode(c); }).replace(/&amp;/g, '&'); }
function colNum(c) { var n = 0; for (var i = 0; i < c.length; i++) n = n * 26 + c.charCodeAt(i) - 64; return n; }
function serialToISO(v) { var d = new Date(Math.round((v - 25569) * 864e5)); return iso(d); }

async function parseLBB(file) {
  var zip = openZip(await file.arrayBuffer());
  var wbx = await zip.text('xl/workbook.xml'), rels = await zip.text('xl/_rels/workbook.xml.rels');
  var relMap = {}; (rels.match(/<Relationship\b[^>]*>/g) || []).forEach(function (t) { var id = /\bId="([^"]+)"/.exec(t), tg = /\bTarget="([^"]+)"/.exec(t); if (id && tg) relMap[id[1]] = tg[1]; });
  var sheets = (wbx.match(/<sheet\b[^>]*>/g) || []).map(function (t) {
    var nm = /\bname="([^"]*)"/.exec(t), rid = /\br:id="([^"]+)"/.exec(t), st = /\bstate="([^"]+)"/.exec(t);
    return { name: nm ? xmlDecode(nm[1]) : '', rid: rid ? rid[1] : '', hidden: !!(st && st[1] !== 'visible') };
  }).filter(function (s) { return !s.hidden && /^WC\s*\d/i.test(s.name) && relMap[s.rid]; });
  if (!sheets.length) throw new Error('No "WC …" week tabs found — is this the Live Brewery Board?');
  var sst = await zip.text('xl/sharedStrings.xml'), strings = [];
  (sst.match(/<si>[\s\S]*?<\/si>|<si\/>/g) || []).forEach(function (si) { var t = ''; si.replace(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g, function (m, x) { t += x; return m; }); strings.push(xmlDecode(t)); });
  var from = mondayOf(state.countDate), out = {}, weeks = [], ignored = {}, names = [];
  ALL_SKUS.forEach(function (k) { out[k] = {}; });
  for (var si = 0; si < Math.min(sheets.length, 40); si++) {
    var sh = sheets[si], path = relMap[sh.rid].replace(/^\/?(xl\/)?/, 'xl/');
    var xml = await zip.text(path); if (!xml) continue;
    var rows = {};
    xml.replace(/<row\b[^>]*\br="(2|36|37|38|39)"[^>]*>([\s\S]*?)<\/row>/g, function (m, r, body) {
      var cells = {};
      body.replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, function (mm, attrs, inner) {
        var ref = /\br="([A-Z]+)\d+"/.exec(attrs), ty = /\bt="([^"]+)"/.exec(attrs), v = /<v>([\s\S]*?)<\/v>/.exec(inner || '');
        if (!ref) return mm;
        var val = null;
        if (ty && ty[1] === 's' && v) val = strings[Number(v[1])];
        else if (ty && ty[1] === 'inlineStr') { var tt = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/.exec(inner || ''); val = tt ? xmlDecode(tt[1]) : null; }
        else if (ty && ty[1] === 'str' && v) val = xmlDecode(v[1]);
        else if (v && v[1] !== '') val = Number(v[1]);
        if (val !== null && val !== undefined) cells[colNum(ref[1])] = val;
        return mm;
      });
      rows[r] = cells; return m;
    });
    var d0 = rows['2'] && rows['2'][2];
    if (typeof d0 !== 'number') continue;
    var mon = serialToISO(d0);
    if (dow(mon) !== 1 || diffDays(from, mon) < 0 || weeks.indexOf(mon) >= 0) continue;
    weeks.push(mon); names.push(sh.name);
    for (var k = 0; k < 7; k++) {
      var date = addDays(mon, k);
      ['36', '37', '38', '39'].forEach(function (r) {
        var cs = rows[r]; if (!cs) return;
        var lab = cs[2 + 3 * k], q = cs[4 + 3 * k];
        if (lab == null || typeof q !== 'number' || !(q > 0)) return;
        var sku = mapSku(lab);
        if (!sku) { ignored[String(lab).trim()] = 1; return; }
        out[sku][date] = (out[sku][date] || 0) + Math.round(q);
      });
    }
  }
  if (!weeks.length) throw new Error('No current or future weeks found in the file for ' + fMed(state.countDate));
  return { lbb: out, weeks: weeks, ignored: Object.keys(ignored), names: names };
}

async function importLBB(file) {
  toast('Reading ' + file.name + '…');
  try {
    var res = await parseLBB(file);
    // replace schedule for the weeks found; keep any other imported weeks
    var keep = state.lbbWeeks.filter(function (w) { return res.weeks.indexOf(w) < 0; });
    ALL_SKUS.forEach(function (k) {
      var cur = state.lbb[k] || {}, next = {};
      Object.keys(cur).forEach(function (d) { if (keep.indexOf(mondayOf(d)) >= 0) next[d] = cur[d]; });
      Object.keys(res.lbb[k]).forEach(function (d) { next[d] = res.lbb[k][d]; });
      state.lbb[k] = next;
    });
    state.lbbWeeks = keep.concat(res.weeks).sort();
    state.lbbMeta = { name: file.name, at: todayISO() };
    var cases = 0; ALL_SKUS.forEach(function (k) { Object.keys(res.lbb[k]).forEach(function (d) { cases += res.lbb[k][d]; }); });
    state.sample = state.sample && false;
    commit();
    toast('Loaded ' + res.weeks.length + ' week' + (res.weeks.length > 1 ? 's' : '') + ' · ' + fmt(cases) + ' cases scheduled' + (res.ignored.length ? ' · ignored: ' + res.ignored.slice(0, 3).join(', ') : ''));
  } catch (e) { toast('Could not read that file: ' + (e && e.message ? e.message : e)); }
}

/* ---- NetSuite inventory import */
async function parseInventory(file) {
  var zip = openZip(await file.arrayBuffer());
  var wbx = await zip.text('xl/workbook.xml'), rels = await zip.text('xl/_rels/workbook.xml.rels');
  var relMap = {}; (rels.match(/<Relationship\b[^>]*>/g) || []).forEach(function (t) { var id = /\bId="([^"]+)"/.exec(t), tg = /\bTarget="([^"]+)"/.exec(t); if (id && tg) relMap[id[1]] = tg[1]; });
  var sheets = (wbx.match(/<sheet\b[^>]*>/g) || []).map(function (t) { var rid = /\br:id="([^"]+)"/.exec(t); return rid ? rid[1] : ''; }).filter(function (r) { return relMap[r]; });
  if (!sheets.length) throw new Error('No sheets found in the file');
  var sst = await zip.text('xl/sharedStrings.xml'), strings = [];
  (sst.match(/<si>[\s\S]*?<\/si>|<si\/>/g) || []).forEach(function (si) { var t = ''; si.replace(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g, function (m, x) { t += x; return m; }); strings.push(xmlDecode(t)); });
  var xml = await zip.text(relMap[sheets[0]].replace(/^\/?(xl\/)?/, 'xl/'));
  var rows = [];
  xml.replace(/<row\b[^>]*>([\s\S]*?)<\/row>/g, function (m, body) {
    var cells = {};
    body.replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, function (mm, attrs, inner) {
      var ref = /\br="([A-Z]+)\d+"/.exec(attrs), ty = /\bt="([^"]+)"/.exec(attrs), v = /<v>([\s\S]*?)<\/v>/.exec(inner || '');
      if (!ref) return mm;
      var val = null;
      if (ty && ty[1] === 's' && v) val = strings[Number(v[1])];
      else if (ty && ty[1] === 'inlineStr') { var tt = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/.exec(inner || ''); val = tt ? xmlDecode(tt[1]) : null; }
      else if (ty && ty[1] === 'str' && v) val = xmlDecode(v[1]);
      else if (v && v[1] !== '') val = Number(v[1]);
      if (val !== null && val !== undefined) cells[colNum(ref[1])] = val;
      return mm;
    });
    rows.push(cells); return m;
  });
  var colOn = state.settings.invCol === 'total' ? 11 : 2, colOrd = state.settings.invCol === 'total' ? 12 : 3;
  var stock = {}, onOrder = {}, unmapped = [];
  rows.forEach(function (c) {
    var nm = c[1]; if (typeof nm !== 'string') return;
    var m = /^\s*(Can|Carton Empty|Cluster)\s*-\s*(.+)$/i.exec(nm); if (!m) return;
    var mat = /^can$/i.test(m[1]) ? 'cans' : /^carton/i.test(m[1]) ? 'cartons' : 'clusters';
    var sku = mapSku(m[2]), id = sku ? mat + ':' + sku : null;
    var on = typeof c[colOn] === 'number' ? c[colOn] : 0, od = typeof c[colOrd] === 'number' ? c[colOrd] : 0;
    if (!id || !ITEM[id]) { if (on > 0) unmapped.push(nm.trim()); return; }
    stock[id] = (stock[id] || 0) + Math.max(0, on);
    if (od > 0) onOrder[id] = (onOrder[id] || 0) + od;
  });
  if (!Object.keys(stock).length) throw new Error('No "Can -", "Carton Empty -" or "Cluster -" rows found — is this the inventory report?');
  return { stock: stock, onOrder: onOrder, unmapped: unmapped };
}

async function importInventory(file) {
  toast('Reading ' + file.name + '…');
  try {
    var res = await parseInventory(file), n = 0;
    ITEMS.forEach(function (it) { if (it.mat === 'pads') return; state.stock[it.id] = res.stock[it.id] || 0; n++; });
    state.invOnOrder = res.onOrder;
    state.invMeta = { name: file.name, at: todayISO(), n: Object.keys(res.stock).length };
    if (state.sample) { state.open = []; state.sample = false; }
    state.countDate = todayISO();
    commit();
    toast('Stock loaded · ' + state.invMeta.n + ' items · stock date set to today' + (res.unmapped.length ? ' · not tracked: ' + res.unmapped.slice(0, 3).join(', ') : ''));
  } catch (e) { toast('Could not read that file: ' + (e && e.message ? e.message : e)); }
}

/* ---- Orora / Cluster Wrap order sheet import */
async function readSheets(file, maxSheets) {
  var zip = openZip(await file.arrayBuffer());
  var wbx = await zip.text('xl/workbook.xml'), rels = await zip.text('xl/_rels/workbook.xml.rels');
  var relMap = {}; (rels.match(/<Relationship\b[^>]*>/g) || []).forEach(function (t) { var id = /\bId="([^"]+)"/.exec(t), tg = /\bTarget="([^"]+)"/.exec(t); if (id && tg) relMap[id[1]] = tg[1]; });
  var list = (wbx.match(/<sheet\b[^>]*>/g) || []).map(function (t) { var nm = /\bname="([^"]*)"/.exec(t), rid = /\br:id="([^"]+)"/.exec(t), st = /\bstate="([^"]+)"/.exec(t); return { name: nm ? xmlDecode(nm[1]) : '', rid: rid ? rid[1] : '', hidden: !!(st && st[1] !== 'visible') }; }).filter(function (x) { return !x.hidden && relMap[x.rid]; });
  var sst = await zip.text('xl/sharedStrings.xml'), strings = [];
  (sst.match(/<si>[\s\S]*?<\/si>|<si\/>/g) || []).forEach(function (si) { var t = ''; si.replace(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g, function (m, x) { t += x; return m; }); strings.push(xmlDecode(t)); });
  var out = [];
  for (var i = 0; i < Math.min(list.length, maxSheets); i++) {
    var xml = await zip.text(relMap[list[i].rid].replace(/^\/?(xl\/)?/, 'xl/')); if (!xml) continue;
    var rows = {};
    xml.replace(/<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g, function (m, r, body) {
      if (Number(r) > 40) return m;
      var cells = {};
      body.replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, function (mm, attrs, inner) {
        var ref = /\br="([A-Z]+)\d+"/.exec(attrs), ty = /\bt="([^"]+)"/.exec(attrs), v = /<v>([\s\S]*?)<\/v>/.exec(inner || '');
        if (!ref) return mm;
        var val = null;
        if (ty && ty[1] === 's' && v) val = strings[Number(v[1])];
        else if (ty && ty[1] === 'inlineStr') { var tt = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/.exec(inner || ''); val = tt ? xmlDecode(tt[1]) : null; }
        else if (ty && ty[1] === 'str' && v) val = xmlDecode(v[1]);
        else if (v && v[1] !== '') val = Number(v[1]);
        if (val !== null && val !== undefined) cells[colNum(ref[1])] = val;
        return mm;
      });
      rows[r] = cells; return m;
    });
    out.push({ name: list[i].name, rows: rows });
  }
  return out;
}

function sheetSku(label) { return mapSku(String(label || '').toUpperCase().replace(/^\s*(BALTER|GREEN\s*BEACON|GB\s*(?=WIND|WAY|SUB))\s*/, function (m) { return /^GB/.test(m.trim()) ? 'GB' : ''; })); }

async function parseDeliverySheets(file) {
  var sheets = await readSheets(file, 14), kind = null, found = {}, weekOf = {}, from = state.countDate, to = TL.dw;
  function put(key, rec, wk) { if (!found[key] || wk >= weekOf[key]) { found[key] = rec; weekOf[key] = wk; } }
  sheets.forEach(function (sh) {
    var c2 = String((sh.rows['2'] || {})[3] || ''), r8 = sh.rows['8'] || {}, wk = typeof (sh.rows['2'] || {})[5] === 'number' ? (sh.rows['2'] || {})[5] : 0;
    if (/can ordering/i.test(c2)) {
      kind = 'orora';
      [5, 7, 9, 11, 13].forEach(function (col) {
        if (typeof r8[col] !== 'number') return;
        var date = serialToISO(r8[col]); if (date < from || date >= to) return;
        for (var r = 9; r <= 30; r += 2) ['AM', 'PM'].forEach(function (slot, k) {
          var row = sh.rows[String(r + k)] || {}, lab = (sh.rows[String(r)] || {})[2], sku = sheetSku(lab);
          var pal = row[col], cans = row[col + 1];
          if (!sku || !ITEM['cans:' + sku]) return;
          if (!(typeof pal === 'number' && pal > 0) && !(typeof cans === 'number' && cans > 0)) return;
          var qty = typeof cans === 'number' && cans > 0 ? cans : pal * state.params['cans:' + sku].perPallet;
          var po = (sh.rows[slot === 'AM' ? '36' : '37'] || {})[col];
          put('o|' + date + '|' + sku + '|' + slot, { itemId: 'cans:' + sku, qty: Math.round(qty), date: date, src: 'orora', po: po ? String(po) : '', slot: slot }, wk);
        });
      });
    } else if (/cluster ordering/i.test(c2)) {
      kind = 'cluster';
      [4, 5].forEach(function (col) {
        if (typeof r8[col] !== 'number') return;
        var date = serialToISO(r8[col]); if (date < from || date >= to) return;
        for (var r = 9; r <= 18; r++) {
          var row = sh.rows[String(r)] || {}, sku = sheetSku(row[2]), pal = row[col];
          if (!sku || !ITEM['clusters:' + sku] || !(typeof pal === 'number' && pal > 0)) continue;
          var po = (sh.rows['19'] || {})[col];
          put('c|' + date + '|' + sku, { itemId: 'clusters:' + sku, qty: Math.round(pal * state.params['clusters:' + sku].perPallet), date: date, src: 'cluster', po: po ? String(po) : '' }, wk);
        }
      });
    }
  });
  if (!kind) throw new Error('Not an Orora Order Sheet or Cluster Wrap Order Sheet');
  return { kind: kind, loads: Object.keys(found).map(function (k) { return found[k]; }) };
}

async function importDeliverySheets(files) {
  var done = [], err = [];
  TL = computeTL(state.countDate);
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    try {
      toast('Reading ' + f.name + '…');
      var res = await parseDeliverySheets(f);
      if (state.sample) { state.open = []; state.sample = false; }
      var from = state.settings.dueTodayOpen !== false ? state.countDate : addDays(state.countDate, 1);
      state.open = state.open.filter(function (o) { return o.src !== res.kind; });
      var n = 0;
      res.loads.forEach(function (l) { if (l.date < from) return; l.id = state.uid++; state.open.push(l); n++; });
      state.delMeta = state.delMeta || {};
      state.delMeta[res.kind] = { name: f.name, at: todayISO(), n: n };
      done.push((res.kind === 'orora' ? 'Orora' : 'Cluster') + ': ' + n + ' deliveries');
    } catch (e) { err.push(f.name + ' — ' + (e && e.message ? e.message : e)); }
  }
  commit();
  toast((done.length ? 'Loaded · ' + done.join(' · ') : '') + (err.length ? (done.length ? ' · ' : '') + 'Could not read ' + err.join('; ') : ''));
}

/* ------------------------------------------------------------------ events */
function num(v) { var n = parseFloat(String(v).replace(/,/g, '')); return isFinite(n) ? n : 0; }

function onChange(e) {
  var t = e.target, act = t.dataset && t.dataset.act; if (!act) return;
  var it = t.dataset.id ? ITEM[t.dataset.id] : null;
  switch (act) {
    case 'cap': state.capacity = clamp(Math.round(num(t.value)) || 1, 1, 9999); break;
    case 'stock': state.stock[it.id] = Math.max(0, fromDisp(it, num(t.value))); break;
    case 'plan': state.plan[t.dataset.sku][t.dataset.wk] = Math.max(0, Math.round(num(t.value))); break;
    case 'qty':
      if (t.value === '') { var o = state.orders[it.id]; if (o) delete o.qty; }
      else { var q = Math.max(0, num(t.value)); if (it.mat === 'cans' || it.mat === 'clusters') q = Math.round(q * 4) / 4; if (it.mat === 'cans') q = Math.round(q); state.orders[it.id] = Object.assign(state.orders[it.id] || {}, { qty: fromDisp(it, q) }); }
      break;
    case 'day': state.orders[it.id] = Object.assign(state.orders[it.id] || {}, { day: t.value }); break;
    case 'lids': state.lids[t.dataset.date] = Math.max(0, num(t.value)); break;
    case 'param':
      var f = t.dataset.f, v = Math.max(0, num(t.value));
      if (f === 'min' || f === 'step') state.params[it.id][f] = fromDisp(it, v) || (f === 'step' ? 1 : 0);
      else if (f === 'minPct') state.params[it.id][f] = v;
      else state.params[it.id][f] = v || 1;
      break;
    case 'setting': state.settings[t.dataset.k] = Math.max(0, num(t.value)); if (t.dataset.k === 'clusterWeeks') state.settings.clusterWeeks = state.settings.clusterWeeks === 2 ? 2 : 1; if (t.dataset.k === 'casesPerPallet' && !state.settings.casesPerPallet) state.settings.casesPerPallet = 1; break;
    case 'cdin': state.settings.dueTodayOpen = t.checked; break;
    case 'invcol': state.settings.invCol = t.value === 'total' ? 'total' : 'brewery'; break;
    case 'whole': state.settings.wholePallets = t.checked; break;
    case 'oqty': state.open.forEach(function (o) { if (String(o.id) === t.dataset.oid) o.qty = fromDisp(ITEM[o.itemId], Math.max(0, num(t.value))); }); break;
    case 'odate': state.open.forEach(function (o) { if (String(o.id) === t.dataset.oid && /^\d{4}-\d{2}-\d{2}$/.test(t.value)) o.date = t.value; }); break;
    case 'viewsel': state.viewDate = t.value; break;
    default: return;
  }
  commit();
}

function onClick(e) {
  var t = e.target.closest('[data-act]'); if (!t || t.tagName === 'INPUT' || t.tagName === 'SELECT') return;
  var act = t.dataset.act;
  switch (act) {
    case 'capstep': state.capacity = clamp(state.capacity + Number(t.dataset.d), 1, 9999); break;
    case 'view': state.viewDate = t.dataset.date; break;
    case 'viewpeak': state.viewDate = null; break;
    case 'resetmat':
      ITEMS.forEach(function (it) { if (it.mat === t.dataset.mat) delete state.orders[it.id]; });
      break;
    case 'odel': state.open = state.open.filter(function (o) { return String(o.id) !== t.dataset.oid; }); break;
    case 'oadd': {
      var id = document.getElementById('oaItem').value, q = num(document.getElementById('oaQty').value), d = document.getElementById('oaDate').value;
      if (!(q > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(d)) { toast('Enter a quantity and an arrival date first'); return; }
      state.open.push({ id: state.uid++, itemId: id, qty: fromDisp(ITEM[id], q), date: d });
      break;
    }
    case 'delpick': document.getElementById('delFile').click(); return;
    case 'delclear': state.open = state.open.filter(function (o) { return !o.src; }); state.delMeta = {}; break;
    case 'invpick': document.getElementById('invFile').click(); return;
    case 'lbbpick': document.getElementById('lbbFile').click(); return;
    case 'lbbclear': state.lbbWeeks = []; state.lbbMeta = null; ALL_SKUS.forEach(function (k) { state.lbb[k] = {}; }); break;
    case 'paste': applyPaste(); return;
    case 'copy': copySummary(); return;
    case 'export': exportData(); return;
    case 'import': document.getElementById('importFile').click(); return;
    case 'sample': if (!confirm('Replace everything with the starting figures?')) return; var cap = state.capacity; state = seed(); state.capacity = cap; break;
    case 'clear':
      if (!confirm('Clear all stock, weekly plan, Live Brewery Board schedule and open orders? Settings and the pallet allowance are kept.')) return;
      state.sample = false; state.open = []; state.orders = {}; state.lids = {}; state.lbbWeeks = []; state.lbbMeta = null;
      ITEMS.forEach(function (it) { state.stock[it.id] = 0; }); ALL_SKUS.forEach(function (k) { state.plan[k] = {}; state.lbb[k] = {}; });
      break;
    default: return;
  }
  commit();
}

function applyPaste() {
  var txt = document.getElementById('pasteTxt').value, wk0 = document.getElementById('pasteWk').value, hit = 0, cells = 0, skipped = 0;
  txt.split(/\r?\n/).forEach(function (line) {
    if (!line.trim()) return;
    var parts = line.indexOf('\t') >= 0 ? line.split('\t') : line.indexOf(',') >= 0 ? line.split(',') : line.trim().split(/\s{2,}|\s+/);
    var sku = mapSku(parts[0]); if (!sku) return;
    hit++;
    parts.slice(1).forEach(function (c, i) {
      var raw = c.trim(); if (raw === '' || !/^[\d.,\s]+$/.test(raw)) return;
      var wk = addDays(wk0, 7 * i);
      if (isLbbWeek(wk)) { skipped++; return; }
      state.plan[sku][wk] = Math.max(0, Math.round(num(raw))); cells++;
    });
  });
  if (!hit) { toast('No SKU rows recognised — start each row with the SKU name'); return; }
  toast('Updated ' + cells + ' weekly figure' + (cells === 1 ? '' : 's') + (skipped ? ' · ' + skipped + ' skipped (week comes from the Live Brewery Board)' : '')); document.getElementById('pasteTxt').value = ''; commit();
}

function copySummary() {
  var text = summaryText(lastR || analyse());
  function ok() { toast('Order summary copied'); }
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback); else fallback();
  function fallback() {
    var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); ok(); } catch (e) { toast('Could not copy — select the summary manually'); }
    document.body.removeChild(ta);
  }
}

function exportData() {
  var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'balter-ordering-' + state.countDate + '.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  toast('Backup downloaded');
}

function init() {
  app = document.getElementById('app');
  state = load();
  var b = document.getElementById('bubbles');
  for (var i = 0; i < 16; i++) {
    var sp = document.createElement('span'), sz = 8 + Math.random() * 26;
    sp.style.cssText = 'left:' + (Math.random() * 100).toFixed(1) + '%;width:' + sz.toFixed(0) + 'px;height:' + sz.toFixed(0) + 'px;animation-duration:' + (14 + Math.random() * 18).toFixed(1) + 's;animation-delay:-' + (Math.random() * 25).toFixed(1) + 's';
    b.appendChild(sp);
  }
  app.addEventListener('change', onChange);
  app.addEventListener('click', onClick);
  app.addEventListener('toggle', function (e) { var d = e.target; if (d.tagName === 'DETAILS' && d.dataset.ui) { state.ui[d.dataset.ui] = d.open; save(); } }, true);
  document.addEventListener('pointerdown', function () { pointerDown = true; }, true);
  function up() { pointerDown = false; if (pending) { pending = false; clearTimeout(renderTimer); renderTimer = setTimeout(render, 0); } }
  document.addEventListener('pointerup', up, true); document.addEventListener('pointercancel', up, true);
  var di = document.getElementById('dateInput');
  function setDate(v) { if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { state.countDate = v; state.viewDate = null; commit(); } }
  di.addEventListener('change', function () { setDate(di.value); });
  document.getElementById('prevDay').addEventListener('click', function () { setDate(addDays(state.countDate, -1)); });
  document.getElementById('nextDay').addEventListener('click', function () { setDate(addDays(state.countDate, 1)); });
  document.getElementById('copyBtn').addEventListener('click', copySummary);
  document.getElementById('printBtn').addEventListener('click', function () { window.print(); });
  document.getElementById('importFile').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0]; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try { var j = JSON.parse(rd.result); if (!j || j.v !== 2) throw new Error('bad'); state = normalise(j); commit(); toast('Backup imported'); }
      catch (err) { toast('That file is not a Balter ordering backup'); }
    };
    rd.readAsText(f); e.target.value = '';
  });
  document.getElementById('delFile').addEventListener('change', function (e) { var fs = Array.prototype.slice.call(e.target.files || []); e.target.value = ''; if (fs.length) importDeliverySheets(fs); });
  document.getElementById('invFile').addEventListener('change', function (e) { var f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) importInventory(f); });
  document.getElementById('lbbFile').addEventListener('change', function (e) { var f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) importLBB(f); });
  render();
}
init();
})();
