import test from 'node:test';
import assert from 'node:assert/strict';
import { ExternalSessions, validateCodexSnapshot } from '../server/external-sessions.js';

const session = {
  id: 'codex:thr_123', source: 'codex', name: 'example', cwd: '/work/example',
  project: 'example', status: 'waiting', statusSince: 1000, startedAt: 900,
  activity: { name: 'Bash', category: 'shell', detail: 'Bash', ts: 1000 },
  context: null,
  results: [],
  compacts: [],
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
    { schemaVersion: 1, sessions: [{ ...session, results: [{ id: 'codex:thr_123:x', kind: 'unknown', ts: 1000 }] }] },
    { schemaVersion: 1, sessions: [{ ...session, compacts: [{ id: 'codex:thr_123:compact:1', ts: 1, before: 10, after: 2, trigger: 'manual', prompt: 'private' }] }] },
  ]) {
    assert.equal(validateCodexSnapshot(body).ok, false);
  }
});

test('accepts numerical CLI context without transcript content', () => {
  const context = { tokens: 129200, window: 258400, fill: 0.5 };
  assert.deepEqual(validateCodexSnapshot({ schemaVersion: 1, sessions: [{ ...session, context }] }).sessions[0].context, context);
});

test('accepts sanitized commit, push, merge, test and build results for achievement counting', () => {
  const results = [
    { id: 'codex:thr_123:tool_1', kind: 'commit', ts: 1000 },
    { id: 'codex:thr_123:tool_2', kind: 'testsPass', ts: 1001 },
    { id: 'codex:thr_123:tool_3', kind: 'testsFail', ts: 1002 },
    { id: 'codex:thr_123:tool_4', kind: 'push', ts: 1003 },
    { id: 'codex:thr_123:tool_5', kind: 'merge', ts: 1004 },
    { id: 'codex:thr_123:tool_6', kind: 'build', ts: 1005 },
  ];
  assert.deepEqual(validateCodexSnapshot({ schemaVersion: 1, sessions: [{ ...session, results }] }).sessions[0].results, results);
  const failure = { id: 'codex:thr_123:tool_7', kind: 'buildFail', ts: 1006 };
  assert.deepEqual(validateCodexSnapshot({ schemaVersion: 1, sessions: [{ ...session, results: [failure] }] }).sessions[0].results, [failure]);
});

test('accepts sanitized compaction metadata', () => {
  const compacts = [{ id: 'codex:thr_123:compact:1001', ts: 1001, before: 900, after: 100, trigger: 'auto' }];
  assert.deepEqual(validateCodexSnapshot({ schemaVersion: 1, sessions: [{ ...session, compacts }] }).sessions[0].compacts, compacts);
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
