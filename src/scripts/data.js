import Papa from 'papaparse';

const BASE = 'https://docs.google.com/spreadsheets/d/1tib7sgkUmbr4M7MXzn78MzTENa0qXbjpGCCSszXBkLg';
const SHEET = `${BASE}/gviz/tq?tqx=out:csv&sheet=Incidents`;
const ARCHIVE = `${BASE}/htmlview/sheet?headers=true&gid=1110217855`;

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
export const fmt = (t) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export const hue = (s) => {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) % 360;
};
export const colorFor = (crime) => `hsl(${hue(crime.split(':')[0].trim().toUpperCase())} 75% 58%)`;

function parseTime(r) {
  const d = (r['Reported'] || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  const tm = [r['Reported'], r['Occurred start'], r['Occurred end']].join(' ').match(/\b(\d{1,2}):(\d{2})\b/);
  let y, m, day;
  if (d) { [, m, day, y] = d.map(Number); if (y < 100) y += 2000; }
  else if (/^\d{4}-\d{2}-\d{2}/.test(r['Log date'] || '')) [y, m, day] = r['Log date'].split('-').map(Number);
  else return NaN;
  return new Date(y, m - 1, day, tm ? +tm[1] : 12, tm ? +tm[2] : 0).getTime();
}

// Drive file cells are hyperlinks, which the CSV export drops; read them from the HTML view.
const docLinks = () => fetch(ARCHIVE).then((r) => r.text()).then((html) => {
  const links = {};
  for (const [, id, name] of html.matchAll(/document\/d\/([\w-]+)[^>]*>([^<]+\.docx?)</g)) links[name.trim()] = `https://docs.google.com/document/d/${id}/edit`;
  return links;
}).catch(() => ({}));

const csv = () => fetch(SHEET).then((r) => r.text()).then((text) => Papa.parse(text, { header: true, skipEmptyLines: true }));

export async function load() {
  const [{ data, meta }, links] = await Promise.all([csv(), docLinks()]);
  // Keep columns that have a header and at least one value (Papa renames blank headers to _1, _2, ...).
  const fields = meta.fields.filter((f) => f.trim() && !/^_\d+$/.test(f) && data.some((r) => r[f]?.trim()));
  const rows = data.map((r) => {
    const crime = (r['Crime(s)'] || '').trim();
    return {
      raw: r, crime, t: parseTime(r),
      lat: parseFloat(r['Latitude']), lng: parseFloat(r['Longitude']),
      loc: r['Location'], case: r['Case #'] || '', disp: r['Disposition'],
      doc: links[(r['Source file'] || '').trim()],
      color: colorFor(crime),
    };
  }).filter((i) => i.crime || i.case);
  const latest = Math.max(...rows.map((i) => i.t).filter(isFinite));
  if (isFinite(latest)) document.getElementById('latest').textContent = `Latest data: ${new Date(latest).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
  return { rows, fields };
}
