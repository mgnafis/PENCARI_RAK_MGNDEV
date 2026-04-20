import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFile(filename, source) {
  const wb = XLSX.readFile(filename, { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const data = [];

  for (let i = 2; i < raw.length; i++) {
    const r = raw[i];
    if (!r[1]) continue;
    data.push({
      source,
      BinLocation: String(r[0] || '').trim(),
      ItemCode: String(r[1] || '').trim().toUpperCase(),
      ItemName: String(r[2] || '').trim(),
      UnitName: String(r[3] || '').trim(),
      Unallocated: Number(r[4]) || 0,
      Stock: Number(r[5]) || 0,
      OsTransfer: String(r[6] || '').trim(),
      OsSpb: String(r[7] || '').trim(),
    });
  }
  return data;
}

const inventory = new Map();

const G005_PATH = path.join(__dirname, 'G005.xlsx');
const G00G_PATH = path.join(__dirname, 'G00G.xlsx');

for (const entry of loadFile(G005_PATH, 'G005')) {
  if (!inventory.has(entry.ItemCode)) inventory.set(entry.ItemCode, []);
  inventory.get(entry.ItemCode).push(entry);
}

for (const entry of loadFile(G00G_PATH, 'G00G')) {
  if (!inventory.has(entry.ItemCode)) inventory.set(entry.ItemCode, []);
  inventory.get(entry.ItemCode).push(entry);
}

export { inventory };
