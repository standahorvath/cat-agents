const MAX_SESSIONS = 100;
const MAX_TEXT = 512;
export const EXTERNAL_TTL_MS = 15_000;

const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keysOnly = (value, allowed) => Object.keys(value).every(key => allowed.includes(key));
const text = (value, max = MAX_TEXT) => typeof value === 'string' && value.length <= max;
const timestamp = value => Number.isSafeInteger(value) && value >= 0;

export function validateCodexSnapshot(body) {
  if (!plain(body) || !keysOnly(body, ['schemaVersion', 'sessions']) ||
      body.schemaVersion !== 1 || !Array.isArray(body.sessions) || body.sessions.length > MAX_SESSIONS) {
    return { ok: false, error: 'Invalid snapshot envelope' };
  }
  const ids = new Set();
  const sessions = [];
  for (const input of body.sessions) {
    if (!plain(input) || !keysOnly(input, [
      'id', 'source', 'name', 'cwd', 'project', 'status', 'statusSince', 'startedAt', 'activity', 'context', 'results', 'subagents',
    ]) || !text(input.id, 200) || !/^codex:[A-Za-z0-9_-]+$/.test(input.id) || ids.has(input.id) ||
        input.source !== 'codex' || !text(input.name) || !text(input.cwd, 4096) ||
        !text(input.project) || !['busy', 'waiting', 'idle'].includes(input.status) ||
        !timestamp(input.statusSince) || !timestamp(input.startedAt) ||
        (input.results !== undefined && (!Array.isArray(input.results) || input.results.length > 6)) ||
        !Array.isArray(input.subagents) || input.subagents.length !== 0) {
      return { ok: false, error: 'Invalid session' };
    }
    ids.add(input.id);
    const results = [];
    const resultIds = new Set();
    for (const item of input.results ?? []) {
      if (!plain(item) || !keysOnly(item, ['id', 'kind', 'ts']) ||
          !text(item.id, 300) || !item.id.startsWith(`${input.id}:`) || resultIds.has(item.id) ||
          item.kind !== 'commit' || !timestamp(item.ts)) {
        return { ok: false, error: 'Invalid result' };
      }
      resultIds.add(item.id);
      results.push({ id: item.id, kind: item.kind, ts: item.ts });
    }
    let activity = null;
    if (input.activity !== null) {
      const item = input.activity;
      if (!plain(item) || !keysOnly(item, ['name', 'category', 'detail', 'ts']) ||
          !text(item.name) || !text(item.category, 32) || !text(item.detail) || !timestamp(item.ts)) {
        return { ok: false, error: 'Invalid activity' };
      }
      activity = { name: item.name, category: item.category, detail: item.detail, ts: item.ts };
    }
    let context = null;
    if (input.context != null) {
      const item = input.context;
      if (!plain(item) || !keysOnly(item, ['tokens', 'window', 'fill']) ||
          !Number.isSafeInteger(item.tokens) || item.tokens < 0 ||
          !Number.isSafeInteger(item.window) || item.window <= 0 ||
          typeof item.fill !== 'number' || !Number.isFinite(item.fill) ||
          item.fill < 0 || item.fill > 1 ||
          Math.abs(item.fill - Math.min(1, item.tokens / item.window)) > 1e-9) {
        return { ok: false, error: 'Invalid context' };
      }
      context = { tokens: item.tokens, window: item.window, fill: item.fill };
    }
    sessions.push({
      id: input.id, source: 'codex', name: input.name, cwd: input.cwd,
      project: input.project, status: input.status, statusSince: input.statusSince,
      startedAt: input.startedAt, activity, context, results, subagents: [],
    });
  }
  return { ok: true, sessions };
}

export class ExternalSessions {
  constructor(ttlMs = EXTERNAL_TTL_MS) {
    this.ttlMs = ttlMs;
    this.codex = [];
    this.updatedAt = 0;
  }

  replace(sessions, now = Date.now()) {
    this.codex = sessions;
    this.updatedAt = now;
  }

  current(now = Date.now()) {
    if (!this.updatedAt || now - this.updatedAt > this.ttlMs) return [];
    return this.codex;
  }
}
