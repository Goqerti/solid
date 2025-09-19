import fs from 'fs';
import path from 'path';

export function ensureFile(filePath, initial = []) {
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(initial, null, 2));
  }
}

export function readJSON(filePath) {
  ensureFile(filePath, []);
  const raw = fs.readFileSync(filePath, 'utf8');
  try { return JSON.parse(raw); } catch { return []; }
}

export function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}
