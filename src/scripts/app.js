import L from 'leaflet';
import { load, esc, fmt, hue, shareBtn, reportBtn } from './data.js';

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
  const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
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
list.addEventListener('mouseover', (e) => { const i = itemAt(e); if (i?.m) i.m.openPopup(); });
list.addEventListener('mouseout', (e) => { const i = itemAt(e); if (i?.m) i.m.closeTooltip(); });

load().then(({ rows }) => {
  incidents = rows.filter((i) => i.crime && isFinite(i.t)).sort((a, b) => b.t - a.t).map((i, idx) => {
    if (isFinite(i.lat) && isFinite(i.lng)) {
      i.m = L.circleMarker([i.lat, i.lng], { radius: 6, color: i.color, fillColor: i.color, fillOpacity: 0.75, weight: 1 });
      const body = `<b>${esc(i.crime)}</b>${esc(i.loc)}<br><span>${esc(fmt(i.t))} · #${esc(i.case)}<br>${esc(i.disp)}</span>`;
      i.m.bindTooltip(body, { className: 'tip', direction: 'top', offset: [0, -6] })
        .bindPopup(`<div class="card">${body}<div class="acts">${reportBtn(i.doc)}${shareBtn(i.case)}</div></div>`, { className: 'pin', minWidth: 278, maxWidth: 278, offset: [0, -4] })
        .on('popupopen', () => i.m.closeTooltip())
        .on('tooltipopen', () => i.m.isPopupOpen() && i.m.closeTooltip());
    }
    return Object.assign(i, { idx });
  });
  const now = Date.now();
  t0 = Math.min(...incidents.map((i) => i.t), now - 72 * HOUR) - 6 * HOUR; t1 = now;
  end = t1; start = end - 72 * HOUR;
  drawTrack(); render();
});
