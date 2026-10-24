// Builds src/data/hyg-subset.json from the HYG star database (v4.1, CC BY-SA 4.0,
// https://codeberg.org/astronexus/hyg). Usage: node scripts/build-catalog.mjs <hygdata_v41.csv>
import { readFileSync, writeFileSync } from 'node:fs';

const src = process.argv[2];
if (!src) throw new Error('usage: node scripts/build-catalog.mjs <hygdata_v41.csv>');

function parseLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') q = !q;
    else if (c === ',' && !q) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

const lines = readFileSync(src, 'utf8').split(/\r?\n/).filter(Boolean);
const head = parseLine(lines[0]);
const col = Object.fromEntries(head.map((h, i) => [h, i]));
const PC_TO_LY = 3.26156;
// J2000 equatorial -> galactic rotation (x toward the galactic centre, z toward the north galactic pole)
const M = [
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [0.4941094279, -0.44482963, 0.7469822445],
  [-0.867666149, -0.1980763734, 0.4559837762],
];

const stars = [];
for (const line of lines.slice(1)) {
  const r = parseLine(line);
  const id = Number(r[col.id]);
  if (id === 0) continue; // Sol is hand-modelled
  const mag = parseFloat(r[col.mag]);
  const dist = parseFloat(r[col.dist]);
  const proper = r[col.proper];
  if (!(mag < 6.5 || dist < 20 || proper)) continue;
  if (!(dist > 0) || dist > 99000) continue;
  const eq = [parseFloat(r[col.x]), parseFloat(r[col.y]), parseFloat(r[col.z])];
  const g = M.map((row) => (row[0] * eq[0] + row[1] * eq[1] + row[2] * eq[2]) * PC_TO_LY);
  const absmag = parseFloat(r[col.absmag]);
  const ci = parseFloat(r[col.ci]);
  const spect = r[col.spect] || '';
  const bf = r[col.bf];
  const name = proper || bf?.trim() || (r[col.hip] ? `HIP ${r[col.hip]}` : r[col.hd] ? `HD ${r[col.hd]}` : r[col.gl] ? r[col.gl] : `HYG ${id}`);
  stars.push([
    id,
    name,
    +g[0].toFixed(3),
    +g[1].toFixed(3),
    +g[2].toFixed(3),
    +absmag.toFixed(2),
    Number.isFinite(ci) ? +ci.toFixed(2) : 0.65,
    spect.slice(0, 2),
    +mag.toFixed(2),
    r[col.hip] ? Number(r[col.hip]) : 0,
  ]);
}
stars.sort((a, b) => a[2] * a[2] + a[3] * a[3] + a[4] * a[4] - (b[2] * b[2] + b[3] * b[3] + b[4] * b[4]));
writeFileSync(
  new URL('../src/data/hyg-subset.json', import.meta.url),
  JSON.stringify({
    source: 'HYG Database v4.1 (astronexus), CC BY-SA 4.0',
    fields: ['hygId', 'name', 'xLy', 'yLy', 'zLy', 'absMag', 'colorIndex', 'spectral', 'apparentMag', 'hip'],
    frame: 'galactic Cartesian, light-years, Sol at origin, +x toward galactic centre, +z toward north galactic pole',
    stars,
  }),
);
console.log('stars', stars.length);
