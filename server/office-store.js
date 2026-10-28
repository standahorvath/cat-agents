// The player's office (coins, room size, furniture), saved in data/office.json so
// cats earn coins even while nobody watches.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialState, migrate, publicView, runAction, tick } from '../shared/office-rules.js';

const DATA_DIR = process.env.DATA_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
const FILE = path.join(DATA_DIR, 'office.json');
const SAVE_EVERY_MS = 10_000;

let state = load();
let dirty = false;
let lastSave = 0;

function load() {
  try {
    const saved = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (Array.isArray(saved.items)) return migrate(saved);
  } catch {
    // first run
  }
  return initialState();
}

function save(force = false) {
  if (!dirty) return;
  const now = Date.now();
  if (!force && now - lastSave < SAVE_EVERY_MS) return;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(state, null, 2));
  lastSave = now;
  dirty = false;
}

export function earn(sessions, seconds, watched = true) {
  if (tick(state, sessions, seconds, watched)) {
    dirty = true;
    save();
  }
}

export const publicState = () => publicView(state);

export function act(action, payload) {
  const result = runAction(state, action, payload);
  if (result.ok) {
    dirty = true;
    save(!['restore', 'relate', 'record'].includes(action));
  }
  return result;
}

process.on('exit', () => save(true));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    save(true);
    process.exit(0);
  });
}
