import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import os from 'node:os';

const RUN_DIR = process.env.CAT_CODEX_RUN_DIR || path.join(
  process.env.DATA_DIR || path.join(os.homedir(), '.cat-agents'), 'codex',
);
const SOCKET_PATH = path.join(RUN_DIR, 'adapter.sock');
const TOKEN_FILE = path.join(RUN_DIR, 'cat-office-token');
const OFFICE_URL = process.env.CAT_OFFICE_URL || 'http://127.0.0.1:4317';

export function localToken() {
  if (process.env.CAT_AGENTS_EXTERNAL_TOKEN) return process.env.CAT_AGENTS_EXTERNAL_TOKEN;
  fs.mkdirSync(RUN_DIR, { recursive: true, mode: 0o700 });
  try {
    const fd = fs.openSync(TOKEN_FILE, 'wx', 0o600);
    try { fs.writeFileSync(fd, crypto.randomBytes(32).toString('hex') + '\n'); }
    finally { fs.closeSync(fd); }
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  return fs.readFileSync(TOKEN_FILE, 'utf8').trim();
}

export { RUN_DIR, SOCKET_PATH, OFFICE_URL };
