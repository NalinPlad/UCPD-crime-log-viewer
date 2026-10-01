import L from 'leaflet';
import { load, esc, fmt, hue, shareBtn, reportBtn, tags } from './data.js';
import { runTour, tourSeen } from './tour.js';

const HOUR = 3600e3;

const map = L.map('map', { preferCanvas: true, zoomControl: false }).setView([37.8719, -122.2585], 15);
const esri = (n) => L.tileLayer(`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/${n}/MapServer/tile/{z}/{y}/{x}`, {
  attribution: '&copy; Esri', maxZoom: 20, maxNativeZoom: 16,
}).addTo(map);
esri('World_Dark_Gray_Base');
esri('World_Dark_Gray_Reference');
const layer = L.layerGroup().addTo(map);

const tl = document.getElementById('tl');
const canvas = tl.querySelector('canvas');
const band = document.getElementById('band');
const handle = document.getElementById('handle');
const rangeEl = document.getElementById('range');

let incidents = [];
let t0, t1, start, end;


const list = document.getElementById('list');
const countEl = document.getElementById('count');
let shown = [];
let listKey = '';

function render() {
  shown = [];
  for (const i of incidents) {
    const on = i.t >= start && i.t <= end;
    if (on) shown.push(i);
    if (i.m && on !== layer.hasLayer(i.m)) on ? layer.addLayer(i.m) : layer.removeLayer(i.m);
  }
  const key = shown.length ? `${shown[0].idx}-${shown.at(-1).idx}-${shown.length}` : '';
  if (key !== listKey) {
    listKey = key;
    countEl.textContent = `${shown.length} incident${shown.length === 1 ? '' : 's'}`;
    list.innerHTML = shown.map((i, k) => `<div data-k="${k}"${i.m ? '' : ' class="nomap"'}><i style="background:${i.color}"></i><b>${esc(i.crime)}</b><span>${esc(i.loc)} · ${esc(fmt(i.t))}</span>${shareBtn(i.case)}</div>`).join('');
  }
  const w = tl.clientWidth;
  const x = (t) => ((t - t0) / (t1 - t0)) * w;
  band.style.left = `${x(start)}px`;
  band.style.width = `${Math.max(2, x(end) - x(start))}px`;
  rangeEl.textContent = `${fmt(start)} – ${fmt(end)}`;
}

function drawTrack() {
  const dpr = devicePixelRatio || 1;
  const w = tl.clientWidth, h = tl.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);
  const x = (t) => ((t - t0) / (t1 - t0)) * w;
  const days = (t1 - t0) / (24 * HOUR);
  const step = days > 120 ? 30 : days > 40 ? 7 : days > 14 ? 2 : 1;
  g.font = '10px ui-sans-serif, system-ui, sans-serif';
  g.textBaseline = 'bottom';
  const d = new Date(t0); d.setHours(0, 0, 0, 0);
  let lastLabel = -Infinity;
  for (let k = 0; d.getTime() <= t1; d.setDate(d.getDate() + 1), k++) {
    const px = x(d.getTime());
    g.fillStyle = '#1d1f23';
    g.fillRect(px, 8, 1, h - 30);
    if (k % step === 0 && px - lastLabel > 44 && px > 0) {
      g.fillStyle = '#6b7078';
      g.fillText(d.toLocaleDateString([], { month: 'short', day: 'numeric' }), px + 3, h - 5);
      lastLabel = px;
    }
  }
  const mid = 8 + (h - 30) / 2;
  for (const i of incidents) {
    g.fillStyle = i.color;
    g.globalAlpha = 0.8;
    g.fillRect(x(i.t) - 0.5, mid - 8 + ((hue(i.case) % 16)), 1.5, 3);
  }
  g.globalAlpha = 1;
}

function drag(e, mode) {
  e.preventDefault(); e.stopPropagation();
  const w = tl.clientWidth;
  const px0 = e.clientX, s0 = start, e0 = end;
  const move = (ev) => {
    const dt = ((ev.clientX - px0) / w) * (t1 - t0);
    if (mode === 'resize') {
      start = Math.min(Math.max(t0, s0 + dt), end - HOUR);
    } else {
      const span = e0 - s0;
      end = Math.min(t1, Math.max(t0 + span, e0 + dt));
      start = end - span;
    }
    render();
  };
  // While dragging, drop the tour's spotlight so the timeline reads at full strength; re-aim it on release.
  document.body.classList.add('dragging');
  const up = () => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up);
    document.body.classList.remove('dragging');
    touring?.place();
  };
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
}
handle.addEventListener('pointerdown', (e) => drag(e, 'resize'));
band.addEventListener('pointerdown', (e) => drag(e, 'move'));
tl.addEventListener('pointerdown', (e) => {
  const r = tl.getBoundingClientRect();
  const t = t0 + ((e.clientX - r.left) / r.width) * (t1 - t0);
  const span = end - start;
  end = Math.min(t1, Math.max(t0 + span, t + span / 2));
  start = end - span;
  render();
  drag(e, 'move');
});
addEventListener('resize', () => { drawTrack(); render(); });

const itemAt = (e) => shown[e.target.closest('[data-k]')?.dataset.k];
list.addEventListener('click', (e) => {
  const i = itemAt(e);
  if (!i) return;
  if (i.m) { map.flyTo(i.m.getLatLng(), Math.max(map.getZoom(), 17), { duration: 0.6 }); i.m.openPopup(); }
  else if (i.doc) window.open(i.doc, '_blank', 'noopener');
});

load().then(({ rows }) => {
  incidents = rows.filter((i) => i.crime && isFinite(i.t)).sort((a, b) => b.t - a.t).map((i, idx) => {
    if (isFinite(i.lat) && isFinite(i.lng)) {
      i.m = L.circleMarker([i.lat, i.lng], { radius: 6, color: i.color, fillColor: i.color, fillOpacity: 0.75, weight: 1 });
      const body = `<b>${esc(i.crime)}</b>${tags(i)}${esc(i.loc)}<br><span>${esc(fmt(i.t))} · #${esc(i.case)}<br>${esc(i.disp)}</span>`;
      const card = `<div class="card">${body}<div class="acts">${reportBtn(i.doc)}${shareBtn(i.case)}</div></div>`;
      i.m.bindTooltip(card, { className: 'tip', direction: 'top', offset: [0, -6] })
        .bindPopup(card, { className: 'pin', minWidth: 278, maxWidth: 278, offset: [0, -4] })
        .on('popupopen', () => i.m.closeTooltip())
        .on('tooltipopen', () => i.m.isPopupOpen() && i.m.closeTooltip());
    }
    return Object.assign(i, { idx });
  });
  const now = Date.now();
  t0 = Math.min(...incidents.map((i) => i.t), now - 72 * HOUR) - 6 * HOUR; t1 = now;
  end = t1; start = end - 72 * HOUR;
  drawTrack(); render();
  if (!tourSeen() || location.hash === '#tour') startTour();
});

const mapwrap = document.getElementById('mapwrap');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let touring = null;

function startTour() {
  touring?.end();
  history.replaceState(null, '', location.pathname + location.search);
  const pick = () => shown.find((i) => i.m) || incidents.find((i) => i.m);
  const dotRect = () => {
    const i = pick();
    if (!i) return null;
    const p = map.latLngToContainerPoint(i.m.getLatLng()), r = mapwrap.getBoundingClientRect();
    return new DOMRect(r.left + p.x - 9, r.top + p.y - 9, 18, 18);
  };
  // The dot, grown to cover its hover card or pinned popup when one is open.
  const dotWithCard = () => {
    const r = dotRect(), m = pick()?.m;
    const el = m?.isPopupOpen() ? m.getPopup().getElement() : m?.getTooltip()?.isOpen() ? m.getTooltip().getElement() : null;
    if (!r || !el) return r;
    const c = el.getBoundingClientRect();
    const x = Math.min(r.left, c.left), y = Math.min(r.top, c.top);
    return new DOMRect(x, y, Math.max(r.right, c.right) - x, Math.max(r.bottom, c.bottom) - y);
  };
  const focusDot = () => {
    map.closePopup();
    const i = pick();
    if (i) map.panInside(i.m.getLatLng(), { paddingTopLeft: [60, 120], paddingBottomRight: [380, 160], animate: false });
  };
  const steps = [
    { target: dotWithCard, before: focusDot, text: 'Hover on a dot to see its details. Click to pin it.' },
    { target: () => band, before: () => map.closePopup(), text: 'Drag the orange band to move back in time.' },
    { target: () => handle, pad: 8, text: 'Pull its left edge to widen the time range.' },
    { target: () => document.getElementById('all'), text: 'Open the full sheet to search across every incident in our archive.' },
    {
      target: () => document.querySelector('.leaflet-popup .acts') || dotRect(),
      before: async () => { focusDot(); pick()?.m.openPopup(); await sleep(300); },
      text: 'These buttons let you share an incident, and open the original report in our archive.',
    },
  ];
  const t = runTour(steps, { onEnd: () => { map.off('move', t.place).off('tooltipopen tooltipclose popupopen popupclose', replace); touring = null; } });
  const replace = () => requestAnimationFrame(t.place);
  map.on('move', t.place).on('tooltipopen tooltipclose popupopen popupclose', replace);
  touring = t;
}

document.getElementById('help').addEventListener('click', (e) => { e.preventDefault(); if (incidents.length) startTour(); });
