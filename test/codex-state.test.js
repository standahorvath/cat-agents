import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SessionStateMachine } from '../server/codex/state.js';

const fixtures = JSON.parse(fs.readFileSync(new URL('./codex-hook-events.json', import.meta.url), 'utf8'));

const A = 'cli-a:87315:start-a';
const B = 'cli-b:89184:start-b';
const base = '2026-10-25T19:00:';
const at = seconds => `${base}${String(seconds).padStart(2, '0')}.000Z`;
const event = (kind, turn = 'turn_1', extra = {}) => ({
  hook_event_name: kind, session_id: 'thr_alpha', turn_id: turn,
  cwd: '/work/example-project', ...extra,
});
const apply = (machine, value, time, processId = A) =>
  machine.apply(value, { processId, occurredAt: time });
const only = machine => machine.snapshot()[0];

test('anonymized hook sequence keeps two CLI sessions separate and resumes after restart', () => {
  const machine = new SessionStateMachine();
  machine.setProcess(A);
  for (const item of fixtures.slice(0, 14)) {
    apply(machine, item.event, item.occurredAt, item.processId);
    if (item.event.hook_event_name === 'PermissionRequest') {
      assert.equal(machine.snapshot().find(x => x.id === 'codex:thr_alpha').status, 'waiting');
    }
    if (item.event.hook_event_name === 'PreToolUse' && item.event.turn_id === 'turn_2' &&
        item.event.tool_use_id === 'tool_2') {
      assert.equal(machine.snapshot().find(x => x.id === 'codex:thr_alpha').status, 'waiting');
    }
  }
  assert.deepEqual(machine.snapshot().map(x => [x.id, x.status]), [['codex:thr_beta', 'idle']]);
  machine.setProcess(B);
  assert.deepEqual(machine.snapshot(), []);
  for (const item of fixtures.slice(15)) apply(machine, item.event, item.occurredAt, item.processId);
  assert.deepEqual(machine.snapshot().map(x => [x.id, x.status]), [['codex:thr_beta', 'busy']]);
  assert.equal(only(machine).project, 'example-project');
  assert.deepEqual(only(machine).subagents, []);
});

test('permission remains waiting when PreToolUse arrives first or second', () => {
  for (const reverse of [false, true]) {
    const machine = new SessionStateMachine();
    machine.setProcess(A);
    apply(machine, event('UserPromptSubmit'), at(1));
    const pre = event('PreToolUse', 'turn_1', { tool_name: 'Bash', tool_use_id: 'tool_1', tool_input: { command: 'a' } });
    const permission = event('PermissionRequest', 'turn_1', { tool_name: 'Bash', tool_input: { command: 'a' } });
    const pair = reverse ? [permission, pre] : [pre, permission];
    for (const item of pair) apply(machine, item, at(2));
    assert.equal(only(machine).status, 'waiting');
    assert.equal(only(machine).activity.name, 'Bash');
    apply(machine, event('PostToolUse', 'turn_1', { tool_name: 'Bash', tool_use_id: 'tool_other', tool_input: { command: 'b' } }), at(3));
    assert.equal(only(machine).status, 'waiting');
    apply(machine, event('PostToolUse', 'turn_1', { tool_name: 'Bash', tool_use_id: 'tool_1', tool_input: { command: 'a' } }), at(4));
    assert.equal(only(machine).status, 'busy');
    assert.equal(only(machine).activity, null);
    apply(machine, event('Stop'), at(5));
    assert.equal(only(machine).status, 'idle');
  }
});

test('a later matching PreToolUse resumes a waiting cat before the tool finishes', () => {
  const machine = new SessionStateMachine();
  machine.setProcess(A);
  apply(machine, event('PermissionRequest', 'turn_1', {
    tool_name: 'Bash', tool_input: { command: 'approved' },
  }), at(2));
  assert.equal(only(machine).status, 'waiting');
  apply(machine, event('PreToolUse', 'turn_1', {
    tool_name: 'Bash', tool_use_id: 'unrelated', tool_input: { command: 'other' },
  }), at(3));
  assert.equal(only(machine).status, 'waiting');
  apply(machine, event('PreToolUse', 'turn_1', {
    tool_name: 'Bash', tool_use_id: 'approved-tool', tool_input: { command: 'approved' },
  }), at(4));
  assert.equal(only(machine).status, 'busy');
  assert.equal(only(machine).activity.name, 'Bash');
});

test('successful Codex commit is retained as one result in the session snapshot', () => {
  const machine = new SessionStateMachine();
  machine.setProcess(A);
  apply(machine, event('PreToolUse', 'turn_1', { tool_name: 'Bash', tool_use_id: 'tool_1' }), at(1));
  apply(machine, event('PostToolUse', 'turn_1', { tool_name: 'Bash', tool_use_id: 'tool_1', result_kind: 'commit' }), at(2));
  assert.deepEqual(only(machine).results, [{ id: 'codex:thr_alpha:tool_1', kind: 'commit', ts: Date.parse(at(2)) }]);
  apply(machine, event('Stop'), at(3));
  assert.equal(only(machine).results.length, 1);
  apply(machine, event('PreToolUse', 'turn_2', { tool_name: 'exec', tool_use_id: 'tool_2' }), at(4));
  apply(machine, event('PostToolUse', 'turn_2', { tool_name: 'exec', tool_use_id: 'tool_2', result_kind: 'commit' }), at(5));
  assert.equal(only(machine).results.length, 2);
});

test('CLI context tracks the latest input usage and shrinks after compaction', () => {
  const machine = new SessionStateMachine();
  machine.setProcess(A);
  apply(machine, event('SessionStart', 'turn_1', { context: { tokens: 129200, window: 258400 } }), at(1));
  assert.deepEqual(only(machine).context, { tokens: 129200, window: 258400, fill: 0.5 });
  apply(machine, event('UserPromptSubmit', 'turn_1'), at(1));
  apply(machine, event('Stop', 'turn_1', { context: { tokens: 200000, window: 258400 } }), at(2));
  assert.ok(only(machine).context.fill > 0.75);
  apply(machine, event('SessionStart', 'turn_2', { source: 'compact', context: { tokens: 20000, window: 258400 } }), at(3));
  assert.ok(only(machine).context.fill < 0.1);
});

test('a late SessionStart cannot replace context from a newer hook', () => {
  const machine = new SessionStateMachine();
  machine.setProcess(A);
  apply(machine, event('UserPromptSubmit'), at(1));
  apply(machine, event('Stop', 'turn_1', { context: { tokens: 800, window: 1000 } }), at(5));
  assert.equal(apply(machine, event('SessionStart', 'turn_1', {
    context: { tokens: 100, window: 1000 },
  }), at(3)), false);
  assert.deepEqual(only(machine).context, { tokens: 800, window: 1000, fill: 0.8 });
  apply(machine, event('SessionStart', 'turn_2', {
    source: 'compact', context: { tokens: 50, window: 1000 },
  }), at(6));
  assert.deepEqual(only(machine).context, { tokens: 50, window: 1000, fill: 0.05 });
});

test('unidentified post-tool event cannot clear a waiting input with a fingerprint', () => {
  const machine = new SessionStateMachine();
  machine.setProcess(A);
  apply(machine, event('UserPromptSubmit'), at(1));
  apply(machine, event('PermissionRequest', 'turn_1', {
    tool_name: 'Bash', tool_input: { command: 'needs approval' },
  }), at(2));
  assert.equal(apply(machine, event('PostToolUse', 'turn_1', {
    tool_name: 'Bash', tool_use_id: 'another-tool',
  }), at(3)), false);
  assert.equal(only(machine).status, 'waiting');
  assert.equal(apply(machine, event('PostToolUse', 'turn_1', {
    tool_name: 'Bash', tool_input: { command: 'needs approval' },
  }), at(4)), true);
  assert.equal(only(machine).status, 'busy');
});

test('new turn can start with a tool at the same timestamp as the previous stop', () => {
  const machine = new SessionStateMachine();
  machine.setProcess(A);
  apply(machine, event('UserPromptSubmit', 'turn_1'), at(1));
  apply(machine, event('Stop', 'turn_1'), at(2));
  assert.equal(apply(machine, event('PreToolUse', 'turn_2', {
    tool_name: 'Bash', tool_use_id: 'tool_2',
  }), at(2)), true);
  assert.equal(only(machine).status, 'busy');
  assert.equal(only(machine).activity.name, 'Bash');
  assert.equal(apply(machine, event('Stop', 'turn_1'), at(3)), false);
});

test('late and duplicate events do not rewind a completed turn or a newer turn', () => {
  const machine = new SessionStateMachine();
  machine.setProcess(A);
  apply(machine, event('UserPromptSubmit'), at(1));
  apply(machine, event('Stop'), at(5));
  const idleSince = only(machine).statusSince;
  assert.equal(apply(machine, event('PreToolUse', 'turn_1', { tool_name: 'Bash' }), at(3)), false);
  assert.equal(apply(machine, event('Stop'), at(5)), false);
  assert.equal(only(machine).statusSince, idleSince);
  apply(machine, event('UserPromptSubmit', 'turn_2'), at(6));
  assert.equal(apply(machine, event('Stop', 'turn_1'), at(7)), false);
  assert.equal(apply(machine, event('PreToolUse', 'turn_1', { tool_name: 'Bash' }), at(8)), false);
  assert.equal(only(machine).status, 'busy');
  assert.equal(apply(machine, event('UserPromptSubmit', 'turn_2'), at(9)), false);
  assert.equal(only(machine).status, 'busy');
});

test('late prompt cannot clear an already running tool', () => {
  const machine = new SessionStateMachine();
  machine.setProcess(A);
  apply(machine, event('PreToolUse', 'turn_1', { tool_name: 'Bash', tool_use_id: 'tool_1' }), at(2));
  assert.equal(apply(machine, event('UserPromptSubmit'), at(1)), false);
  assert.equal(apply(machine, event('UserPromptSubmit'), at(3)), false);
  assert.equal(only(machine).activity.name, 'Bash');
});

test('post-tool from a different concurrent tool cannot clear current activity', () => {
  const machine = new SessionStateMachine();
  machine.setProcess(A);
  apply(machine, event('UserPromptSubmit'), at(1));
  apply(machine, event('PreToolUse', 'turn_1', { tool_name: 'Bash', tool_use_id: 'tool_old' }), at(2));
  apply(machine, event('PreToolUse', 'turn_1', { tool_name: 'webrun', tool_use_id: 'tool_new' }), at(3));
  assert.equal(apply(machine, event('PostToolUse', 'turn_1', { tool_name: 'Bash', tool_use_id: 'tool_old' }), at(4)), false);
  assert.equal(only(machine).activity.name, 'webrun');
  apply(machine, event('PostToolUse', 'turn_1', { tool_name: 'webrun', tool_use_id: 'tool_new' }), at(5));
  assert.equal(only(machine).activity, null);
});

test('concurrent commit is counted without clearing a newer tool activity', () => {
  for (const completedAt of [at(2), at(4)]) {
    const machine = new SessionStateMachine();
    machine.setProcess(A);
    apply(machine, event('PreToolUse', 'turn_1', { tool_name: 'Bash', tool_use_id: 'commit_tool' }), at(1));
    apply(machine, event('PreToolUse', 'turn_1', { tool_name: 'exec', tool_use_id: 'new_tool' }), at(3));
    const commit = event('PostToolUse', 'turn_1', {
      tool_name: 'Bash', tool_use_id: 'commit_tool', result_kind: 'commit',
    });
    assert.equal(apply(machine, commit, completedAt), true);
    assert.equal(only(machine).activity.name, 'exec');
    assert.equal(only(machine).status, 'busy');
    assert.deepEqual(only(machine).results, [{
      id: 'codex:thr_alpha:commit_tool', kind: 'commit', ts: Date.parse(completedAt),
    }]);
    assert.equal(apply(machine, commit, completedAt), false);
    assert.equal(only(machine).results.length, 1);
  }
});

test('a late commit from the previous turn counts once without changing the current turn', () => {
  const machine = new SessionStateMachine();
  machine.setProcess(A);
  apply(machine, event('PreToolUse', 'turn_1', {
    tool_name: 'Bash', tool_use_id: 'commit_tool',
  }), at(1));
  apply(machine, event('Stop', 'turn_1'), at(3));
  apply(machine, event('UserPromptSubmit', 'turn_2'), at(4));
  const commit = event('PostToolUse', 'turn_1', {
    tool_name: 'Bash', tool_use_id: 'commit_tool', result_kind: 'commit',
  });
  assert.equal(apply(machine, commit, at(2)), true);
  assert.deepEqual(only(machine).results, [{
    id: 'codex:thr_alpha:commit_tool', kind: 'commit', ts: Date.parse(at(2)),
  }]);
  assert.equal(only(machine).status, 'busy');
  assert.equal(only(machine).statusSince, Date.parse(at(4)));
  assert.equal(apply(machine, commit, at(2)), false);
  assert.equal(apply(machine, event('PostToolUse', 'unknown_turn', {
    tool_name: 'Bash', tool_use_id: 'unknown_tool', result_kind: 'commit',
  }), at(2)), false);
  assert.equal(only(machine).results.length, 1);
});

test('SessionEnd is a tombstone; only a later SessionStart can reopen it', () => {
  const machine = new SessionStateMachine();
  machine.setProcess(A);
  apply(machine, event('UserPromptSubmit'), at(1));
  apply(machine, { hook_event_name: 'SessionEnd', session_id: 'thr_alpha', reason: 'other' }, at(5));
  assert.deepEqual(machine.snapshot(), []);
  assert.equal(apply(machine, event('UserPromptSubmit', 'turn_2'), at(6)), false);
  assert.deepEqual(machine.snapshot(), []);
  apply(machine, { hook_event_name: 'SessionStart', session_id: 'thr_alpha', cwd: '/work/example-project', source: 'resume' }, at(7));
  assert.equal(only(machine).status, 'idle');
  apply(machine, event('UserPromptSubmit', 'turn_2'), at(8));
  assert.equal(only(machine).status, 'busy');
});

test('process identity clears all cats and rejects events from the old process', () => {
  const machine = new SessionStateMachine();
  machine.setProcess(A);
  apply(machine, event('UserPromptSubmit'), at(1));
  assert.equal(machine.snapshot().length, 1);
  machine.setProcess(null);
  assert.deepEqual(machine.snapshot(), []);
  machine.setProcess(B);
  assert.equal(apply(machine, event('PreToolUse', 'turn_1', { tool_name: 'Bash' }), at(9), A), false);
  assert.deepEqual(machine.snapshot(), []);
  apply(machine, event('UserPromptSubmit', 'turn_2'), at(10), B);
  assert.equal(only(machine).status, 'busy');
});

test('snapshot exposes no hook content and rejects invalid events', () => {
  const machine = new SessionStateMachine();
  machine.setProcess(A);
  assert.equal(apply(machine, event('UserPromptSubmit', '', { prompt: 'private' }), at(1)), false);
  assert.deepEqual(machine.snapshot(), []);
  assert.equal(apply(machine, event('Stop'), at(1)), false);
  assert.deepEqual(machine.snapshot(), []);
  apply(machine, event('UserPromptSubmit', 'turn_1', { prompt: 'private' }), at(1));
  assert.equal(JSON.stringify(machine.snapshot()).includes('private'), false);
  assert.equal(only(machine).id, 'codex:thr_alpha');
});

test('tool input key is independent of JSON property order', () => {
  const machine = new SessionStateMachine();
  machine.setProcess(A);
  apply(machine, event('UserPromptSubmit'), at(1));
  apply(machine, event('PermissionRequest', 'turn_1', {
    tool_name: 'Bash', tool_input: { command: 'echo safe', options: { b: 2, a: 1 } },
  }), at(2));
  apply(machine, event('PostToolUse', 'turn_1', {
    tool_name: 'Bash', tool_input: { options: { a: 1, b: 2 }, command: 'echo safe' },
  }), at(3));
  assert.equal(only(machine).status, 'busy');
});
