import test from 'node:test';
import assert from 'node:assert/strict';
import { ExternalSessions, validateCodexSnapshot } from '../server/external-sessions.js';

const session = {
  id: 'codex:thr_123', source: 'codex', name: 'example', cwd: '/work/example',
  project: 'example', status: 'waiting', statusSince: 1000, startedAt: 900,
  activity: { name: 'Bash', category: 'shell', detail: 'Bash', ts: 1000 },
  context: null,
  results: [],
  subagents: [],
};

test('accepts a full Codex snapshot and copies only allowed fields', () => {
  const result = validateCodexSnapshot({ schemaVersion: 1, sessions: [session] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.sessions, [session]);
  assert.equal(validateCodexSnapshot({ schemaVersion: 1, sessions: [] }).ok, true);
});

test('rejects malformed and content-bearing snapshots', () => {
  for (const body of [
    { schemaVersion: 2, sessions: [session] },
    { schemaVersion: 1, sessions: [session, session] },
    { schemaVersion: 1, sessions: [{ ...session, id: 'claude:thr_123' }] },
    { schemaVersion: 1, sessions: [{ ...session, status: 'unknown' }] },
    { schemaVersion: 1, sessions: [{ ...session, prompt: 'private' }] },
    { schemaVersion: 1, sessions: [{ ...session, activity: { ...session.activity, command: 'private' } }] },
    { schemaVersion: 1, sessions: [{ ...session, subagents: [{}] }] },
    { schemaVersion: 1, sessions: [{ ...session, context: { tokens: 90, window: 100, fill: 0.5 } }] },
    { schemaVersion: 1, sessions: [{ ...session, context: { tokens: 90, window: 0, fill: 1 } }] },
    { schemaVersion: 1, sessions: [{ ...session, results: [{ id: 'codex:thr_123:x', kind: 'push', ts: 1000 }] }] },
  ]) {
    assert.equal(validateCodexSnapshot(body).ok, false);
  }
});

test('accepts numerical CLI context without transcript content', () => {
  const context = { tokens: 129200, window: 258400, fill: 0.5 };
  assert.deepEqual(validateCodexSnapshot({ schemaVersion: 1, sessions: [{ ...session, context }] }).sessions[0].context, context);
});

test('accepts sanitized commit results for achievement counting', () => {
  const results = [{ id: 'codex:thr_123:tool_1', kind: 'commit', ts: 1000 }];
  assert.deepEqual(validateCodexSnapshot({ schemaVersion: 1, sessions: [{ ...session, results }] }).sessions[0].results, results);
});

test('external snapshot expires after missed heartbeats and can be cleared immediately', () => {
  const source = new ExternalSessions(15_000);
  source.replace([session], 1000);
  assert.equal(source.current(16_000).length, 1);
  assert.deepEqual(source.current(16_001), []);
  source.replace([session], 17_000);
  assert.equal(source.current(17_001).length, 1);
  source.replace([], 18_000);
  assert.deepEqual(source.current(18_001), []);
});
