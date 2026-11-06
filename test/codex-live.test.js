import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { sanitizeHookEvent } from '../server/codex/hook-event.js';
import { contextFromTranscript } from '../server/codex/context.js';
import { editHooks } from '../server/codex/hook-install.js';
import { parseProcesses, codexProcesses } from '../server/codex/codex-process.js';
import { processAncestry } from '../server/codex/process-ancestry.js';
import { Adapter } from '../server/codex/receiver.js';

test('in-process adapter skips heartbeat while external adapter keeps it', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cat-adapter-'));
  try {
    for (const [heartbeatMs, expectedTimer] of [[null, false], [5000, true]]) {
      const sent = [];
      const adapter = new Adapter({
        socketPath: path.join(dir, `adapter-${expectedTimer}.sock`),
        processFinder: async () => [],
        publish: async sessions => { sent.push(sessions); },
        token: 'test', processPollMs: 60_000, heartbeatMs,
      });
      try {
        await adapter.start();
        assert.equal(Boolean(adapter.heartbeatTimer), expectedTimer);
        assert.deepEqual(sent, [[]]);
      } finally {
        await adapter.stop();
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('accepted socket errors do not stop the adapter', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cat-adapter-error-'));
  const adapter = new Adapter({ socketPath: path.join(dir, 'adapter.sock'),
    processFinder: async () => [], publish: async () => {}, token: 'test',
    processPollMs: 60_000, heartbeatMs: null });
  try {
    await adapter.start();
    const handled = new Promise(resolve => {
      adapter.server.once('connection', socket => {
        socket.emit('error', Object.assign(new Error('connection reset'), { code: 'ECONNRESET' }));
        socket.destroy();
        resolve();
      });
    });
    const first = net.createConnection(adapter.socketPath);
    first.on('error', () => {});
    await handled;
    assert.equal(adapter.server.listening, true);
    const second = net.createConnection(adapter.socketPath);
    try {
      await new Promise((resolve, reject) => {
        second.once('connect', resolve);
        second.once('error', reject);
      });
    } finally { second.destroy(); first.destroy(); }
  } finally {
    await adapter.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('hook strips content but preserves event identity and input correlation', () => {
  const event = sanitizeHookEvent({
    hook_event_name: 'PermissionRequest', session_id: 'thr_a', turn_id: 'turn_a',
    cwd: '/work/demo', tool_name: 'Bash', tool_input: { command: 'SECRET' },
    prompt: 'PRIVATE PROMPT', tool_response: 'PRIVATE RESULT', transcript_path: '/secret/path',
  });
  assert.deepEqual(Object.keys(event).sort(), [
    'cwd', 'hook_event_name', 'session_id', 'tool_input_key', 'tool_name', 'turn_id',
  ]);
  assert.equal(JSON.stringify(event).includes('SECRET'), false);
  assert.equal(JSON.stringify(event).includes('PRIVATE'), false);
  assert.equal(event.tool_input_key.length, 64);
});

test('CLI hook extracts only current context usage from its transcript', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cat-context-'));
  try {
    const file = path.join(dir, 'rollout.jsonl');
    const line = (type, payload) => JSON.stringify({ type, payload }) + '\n';
    fs.writeFileSync(file, line('response_item', { text: 'PRIVATE PROMPT' }) +
      line('event_msg', { type: 'token_count', info: {
        last_token_usage: { input_tokens: 129200 },
        total_token_usage: { input_tokens: 900000 }, model_context_window: 258400,
      } }));
    assert.deepEqual(contextFromTranscript(file), { tokens: 129200, window: 258400 });
    const event = sanitizeHookEvent({ hook_event_name: 'Stop', session_id: 'cli_1',
      turn_id: 'turn_1', transcript_path: file });
    assert.deepEqual(event.context, { tokens: 129200, window: 258400 });
    assert.equal(JSON.stringify(event).includes('PRIVATE'), false);
    assert.equal(JSON.stringify(event).includes(file), false);
    fs.appendFileSync(file, line('event_msg', { type: 'token_count', info: {
      last_token_usage: { input_tokens: 10000 }, model_context_window: 258400,
    } }));
    assert.deepEqual(contextFromTranscript(file), { tokens: 10000, window: 258400 });
    fs.appendFileSync(file, '{"type":"event_msg","payload":');
    assert.deepEqual(contextFromTranscript(file), { tokens: 10000, window: 258400 });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('hook reports only a confirmed successful commit', () => {
  const base = { hook_event_name: 'PostToolUse', session_id: 'thr_a', turn_id: 'turn_a',
    tool_name: 'Bash', tool_use_id: 'tool_1', tool_input: { command: 'git commit -m "secret"' } };
  const success = sanitizeHookEvent({ ...base, tool_response: { exit_code: 0, output: '[main abcdef123] secret' } });
  assert.equal(success.result_kind, 'commit');
  assert.equal(JSON.stringify(success).includes('secret'), false);
  assert.equal(sanitizeHookEvent({ ...base, tool_response: { exit_code: 1, output: 'nothing to commit' } }).result_kind, undefined);
  assert.equal(sanitizeHookEvent({ ...base, tool_input: { command: 'git commit -m "secret" || true' },
    tool_response: { exit_code: 0, output: 'nothing to commit, working tree clean' } }).result_kind, undefined);
  assert.equal(sanitizeHookEvent({ ...base, tool_response: 'Process exited with code 0\n[main abcdef123] secret' }).result_kind, 'commit');
  assert.equal(sanitizeHookEvent({ ...base, tool_input: { command: 'git commit --dry-run' }, tool_response: { exit_code: 0 } }).result_kind, undefined);
  const wrapped = { ...base, tool_name: 'exec',
    tool_input: { code: 'const r=await tools.exec_command({cmd:"git add README.md && git commit -m note"});text(r.output);' },
    tool_response: { output: [
      { type: 'input_text', text: 'Script completed\nWall time 2.6 seconds\nOutput:\n' },
      { type: 'input_text', text: '[codex/readme b2f4286] note\n 1 file changed' },
    ] },
  };
  assert.equal(sanitizeHookEvent(wrapped).result_kind, 'commit');
  assert.equal(sanitizeHookEvent({ ...wrapped, tool_response: { output: [{ text: 'Script completed\nOutput:\nnothing to commit' }] } }).result_kind, undefined);
});

test('hook reports test outcomes without retaining commands or output', () => {
  const base = { hook_event_name: 'PostToolUse', session_id: 'thr_a', turn_id: 'turn_a',
    tool_name: 'Bash', tool_use_id: 'tool_1', tool_input: { command: 'npm test -- secret' } };
  const result = response => sanitizeHookEvent({ ...base, tool_response: response });
  assert.equal(result({ exit_code: 0, output: '12 passed' }).result_kind, 'testsPass');
  assert.equal(result({ exit_code: 0, output: 'ℹ fail 0' }).result_kind, 'testsPass');
  assert.equal(result({ exit_code: 0, output: '0 fail' }).result_kind, 'testsPass');
  assert.equal(result({ exit_code: 1, output: '1 failed' }).result_kind, 'testsFail');
  assert.equal(result({ exit_code: 0, output: '1 failed' }).result_kind, 'testsFail');
  assert.equal(result({ output: 'still running' }).result_kind, undefined);
  assert.equal(JSON.stringify(result({ exit_code: 0, output: 'PRIVATE 12 passed' })).includes('PRIVATE'), false);
  assert.equal(sanitizeHookEvent({ ...base, tool_input: { command: 'echo hello' },
    tool_response: { exit_code: 0 } }).result_kind, undefined);
  assert.equal(sanitizeHookEvent({ ...base, tool_input: { command: './gradlew :module:test' },
    tool_response: { exit_code: 0 } }).result_kind, 'testsPass');
  assert.equal(sanitizeHookEvent({ ...base, tool_name: 'functions.exec',
    tool_input: { code: 'const r=await tools.exec_command({cmd:"npm test"});text(r.output)' },
    tool_response: { output: [{ text: 'Script completed\nOutput:\n12 passed' }] } }).result_kind, 'testsPass');
  assert.equal(sanitizeHookEvent({ ...base, tool_name: 'exec',
    tool_input: { code: 'const r=await tools.exec_command({cmd:"node --test test/codex-state.test.js"}); text(r.output);' },
    tool_response: { output: [{ text: 'Script completed' }, { text: '1..21\n# pass 21\n# fail 0' }] } }).result_kind, 'testsPass');
});

test('hook reports only confirmed successful push and merge commands', () => {
  const base = { hook_event_name: 'PostToolUse', session_id: 'thr_a', turn_id: 'turn_a',
    tool_name: 'exec_command', tool_use_id: 'tool_1' };
  const result = (cmd, response) => sanitizeHookEvent({ ...base, tool_input: { cmd }, tool_response: response });
  assert.equal(result('git push origin main', { exit_code: 0, output: 'PRIVATE' }).result_kind, 'push');
  assert.equal(result('git -C repo merge feature', { exit_code: 0, output: 'Already up to date.' }).result_kind, 'merge');
  assert.equal(result('gh pr merge 42 --squash', { exit_code: 0 }).result_kind, 'merge');
  assert.equal(result('git push origin main', { exit_code: 1, output: 'rejected' }).result_kind, undefined);
  assert.equal(result('git push --dry-run', { exit_code: 0 }).result_kind, undefined);
  assert.equal(result('git merge --abort', { exit_code: 0 }).result_kind, undefined);
  assert.equal(result('echo git push', { exit_code: 0 }).result_kind, undefined);
  assert.equal(result('git push', { output: 'still running' }).result_kind, undefined);
  assert.equal(JSON.stringify(result('git push origin main', { exit_code: 0, output: 'PRIVATE' })).includes('PRIVATE'), false);
});

test('hook installation preserves other hooks and is idempotent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cat-hooks-'));
  try {
    const target = path.join(dir, 'hooks.json');
    const original = { hooks: { Stop: [{ matcher: '*', hooks: [{ type: 'command', command: 'other-hook' }] }] } };
    fs.writeFileSync(target, JSON.stringify(original));
    const options = { target, nodePath: '/usr/local/bin/node', script: '/tmp/my-hook.js', runDir: '/tmp/custom data/codex' };
    assert.equal(editHooks({ ...options, action: 'install' }).changed, true);
    const installed = fs.readFileSync(target, 'utf8');
    assert.match(installed, /CAT_CODEX_RUN_DIR='\/tmp\/custom data\/codex'/);
    assert.equal(JSON.parse(installed).hooks.PreCompact.length, 1);
    assert.equal(JSON.parse(installed).hooks.PostCompact.length, 1);
    assert.equal(editHooks({ ...options, action: 'install' }).changed, false);
    assert.equal(fs.readFileSync(target, 'utf8'), installed);
    assert.equal(JSON.parse(installed).hooks.Stop.length, 2);
    assert.equal(editHooks({ ...options, action: 'remove' }).changed, true);
    assert.deepEqual(JSON.parse(fs.readFileSync(target, 'utf8')), original);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('process scanner finds CLI sessions and excludes desktop and service processes', () => {
  const processes = parseProcesses([
    '89184     1 Sun Oct 25 20:11:36 2026     /Applications/ChatGPT.app/Contents/MacOS/ChatGPT',
    '89229 89184 Sun Oct 25 20:11:37 2026     /Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex app-server',
    '92485 89184 Sun Oct 25 20:21:15 2026     /Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex --model o3',
    '92486 89184 Sun Oct 25 20:21:16 2026     /Users/me/Applications/Codex.app/Contents/MacOS/codex --model o3',
    '92500 90000 Sun Oct 25 20:22:15 2026     /opt/homebrew/bin/codex --model o3',
    '92501 90000 Sun Oct 25 20:22:16 2026     codex exec --model o3',
    '92502 90000 Sun Oct 25 20:22:17 2026     /opt/homebrew/bin/codex app-server',
    '92503     1 Sun Oct 25 20:22:18 2026     /Users/me/.codex/packages/app-server-daemon/bin/codex app-server --listen unix:// --managed-daemon',
  ].join('\n'));
  assert.deepEqual(codexProcesses(processes).map(x => [x.pid, x.kind]), [
    [92500, 'cli'], [92501, 'cli'], [92503, 'backend'],
  ]);
  assert.equal(Number.isFinite(codexProcesses(processes)[0].startedAt), true);
});

test('receiver rejects events older than a process parsed from C-locale ps output', async () => {
  const [process] = codexProcesses(parseProcesses(
    '92500 90000 Sun Oct 25 20:22:15 2026     /opt/homebrew/bin/codex --model o3',
  ));
  const adapter = new Adapter({ processFinder: async () => [process],
    publish: async () => {}, token: 'test' });
  await adapter.refreshProcess();
  assert.equal(await adapter.receive({ parentPid: process.pid,
    occurredAt: '2026-10-25T00:00:00Z',
    event: sanitizeHookEvent({ hook_event_name: 'SessionStart', session_id: 'old' }),
  }), false);
  assert.equal(adapter.states.size, 0);
});

test('hook captures its shell and Codex ancestors before the shell exits', () => {
  const parents = new Map([[300, 200], [200, 100], [100, 1]]);
  assert.deepEqual(processAncestry(300, pid => parents.get(pid)), [300, 200, 100]);
});

test('receiver associates a shell-launched hook with its Codex process', async () => {
  const adapter = new Adapter({
    processFinder: async () => [{ id: 'cli-a', pid: 100, startedAt: 0, kind: 'cli' }],
    publish: async () => {}, token: 'test',
  });
  await adapter.refreshProcess();
  const event = sanitizeHookEvent({ hook_event_name: 'SessionStart',
    session_id: 'cli_1', cwd: '/work/example' });
  assert.equal(await adapter.receive({ parentPid: 300, parentPids: [300, 200, 100],
    occurredAt: '2026-10-25T19:00:01Z', event }), true);
  assert.deepEqual(adapter.states.get('cli-a').snapshot().map(s => s.id), ['codex:cli_1']);
});

test('receiver keeps CLI chats separate when hooks come from the shared backend', async () => {
  const adapter = new Adapter({
    processFinder: async () => [
      { id: 'backend-a', pid: 100, startedAt: 0, kind: 'backend' },
      { id: 'cli-a', pid: 200, startedAt: 0, kind: 'cli' },
    ],
    publish: async () => {}, token: 'test',
  });
  await adapter.refreshProcess();
  for (const id of ['first', 'second']) {
    const event = sanitizeHookEvent({ hook_event_name: 'UserPromptSubmit',
      session_id: id, turn_id: `turn_${id}`, cwd: `/work/${id}` });
    assert.equal(await adapter.receive({ parentPid: 100, parentPids: [100],
      occurredAt: '2026-10-25T19:00:01Z', event }), true);
  }
  assert.deepEqual(adapter.states.get('backend-a').snapshot().map(s => s.id),
    ['codex:first', 'codex:second']);
  assert.equal(await adapter.receive({ parentPid: 100, parentPids: [100],
    occurredAt: '2026-10-25T19:00:02Z', event: sanitizeHookEvent({
      hook_event_name: 'SessionEnd', session_id: 'first',
    }) }), true);
  assert.deepEqual(adapter.states.get('backend-a').snapshot().map(s => s.id), ['codex:second']);
});

test('shared backend expires abandoned sessions and old deduplication data', async () => {
  const sent = [];
  const adapter = new Adapter({
    processFinder: async () => [{ id: 'backend-a', pid: 100, startedAt: 0, kind: 'backend' }],
    publish: async sessions => { sent.push(sessions); }, token: 'test', sessionTtlMs: 1000,
    idleSessionTtlMs: 1000,
  });
  await adapter.refreshProcess();
  await adapter.receive({ parentPid: 100, occurredAt: new Date().toISOString(),
    event: sanitizeHookEvent({ hook_event_name: 'UserPromptSubmit', session_id: 'abandoned',
      turn_id: 'turn_1', cwd: '/work/demo' }) });
  const state = adapter.states.get('backend-a');
  state.sessions.get('codex:abandoned').lastReceivedAt = Date.now() - 1001;
  state.ended.set('codex:old', Date.now() - 2000);
  state.endedReceived.set('codex:old', Date.now() - 1001);
  await adapter.refreshProcess();
  await adapter.requestPublish();
  assert.deepEqual(sent.at(-1), []);
  assert.equal(state.sessions.size, 0);
  assert.equal(state.ended.size, 0);
});

test('idle chat on a shared backend stays visible after ten minutes without hooks', async () => {
  const adapter = new Adapter({
    processFinder: async () => [{ id: 'backend-a', pid: 100, startedAt: 0, kind: 'backend' }],
    publish: async () => {}, token: 'test',
  });
  await adapter.refreshProcess();
  await adapter.receive({ parentPid: 100, occurredAt: new Date().toISOString(),
    event: sanitizeHookEvent({ hook_event_name: 'SessionStart', session_id: 'open_chat' }) });
  const state = adapter.states.get('backend-a');
  state.sessions.get('codex:open_chat').lastReceivedAt = Date.now() - 10 * 60_000;
  await adapter.refreshProcess();
  assert.deepEqual(state.snapshot().map(session => session.id), ['codex:open_chat']);
});

test('shared backend returns a busy chat to idle when Stop is lost', async () => {
  const adapter = new Adapter({
    processFinder: async () => [{ id: 'backend-a', pid: 100, startedAt: 0, kind: 'backend' }],
    publish: async () => {}, token: 'test', sessionTtlMs: 1000,
  });
  await adapter.refreshProcess();
  await adapter.receive({ parentPid: 100, occurredAt: new Date().toISOString(),
    event: sanitizeHookEvent({ hook_event_name: 'UserPromptSubmit', session_id: 'open_chat',
      turn_id: 'turn_1' }) });
  const state = adapter.states.get('backend-a');
  state.sessions.get('codex:open_chat').lastReceivedAt = Date.now() - 1001;
  await adapter.refreshProcess();
  assert.equal(state.snapshot()[0].status, 'idle');
  assert.equal(state.snapshot().length, 1);
});

test('live CLI also returns a busy chat to idle when Stop is lost', async () => {
  const adapter = new Adapter({
    processFinder: async () => [{ id: 'cli-a', pid: 100, startedAt: 0, kind: 'cli' }],
    publish: async () => {}, token: 'test', sessionTtlMs: 1000,
  });
  await adapter.refreshProcess();
  await adapter.receive({ parentPid: 100, occurredAt: new Date().toISOString(),
    event: sanitizeHookEvent({ hook_event_name: 'UserPromptSubmit', session_id: 'open_chat',
      turn_id: 'turn_1' }) });
  const state = adapter.states.get('cli-a');
  state.sessions.get('codex:open_chat').lastReceivedAt = Date.now() - 1001;
  await adapter.refreshProcess();
  assert.equal(state.snapshot()[0].status, 'idle');
});

test('live CLI sessions remain visible without new hook events', async () => {
  const adapter = new Adapter({
    processFinder: async () => [{ id: 'cli-a', pid: 100, startedAt: 0, kind: 'cli' }],
    publish: async () => {}, token: 'test', sessionTtlMs: 1000,
  });
  await adapter.refreshProcess();
  await adapter.receive({ parentPid: 100, occurredAt: new Date().toISOString(),
    event: sanitizeHookEvent({ hook_event_name: 'SessionStart', session_id: 'live_cli' }) });
  const state = adapter.states.get('cli-a');
  state.sessions.get('codex:live_cli').lastReceivedAt = Date.now() - 1001;
  await adapter.refreshProcess();
  assert.deepEqual(state.snapshot().map(session => session.id), ['codex:live_cli']);
});

test('live receiver rejects stale process events and publishes cleared snapshot', async () => {
  let processes = [{ id: 'cli-a', pid: 100, startedAt: 0, kind: 'cli' }];
  const sent = [];
  const adapter = new Adapter({ processFinder: async () => processes,
    publish: async sessions => { sent.push(sessions); }, token: 'test', officeUrl: 'http://127.0.0.1:4317' });
  await adapter.refreshProcess();
  const event = sanitizeHookEvent({ hook_event_name: 'UserPromptSubmit', session_id: 'thr_a',
    turn_id: 'turn_a', cwd: '/work/demo', prompt: 'private' });
  assert.equal(await adapter.receive({ parentPid: 100, occurredAt: '2026-10-25T19:00:01Z', event }), true);
  await adapter.requestPublish();
  assert.equal(sent.at(-1)[0].status, 'busy');
  processes = [{ id: 'cli-b', pid: 200, startedAt: 0, kind: 'cli' }];
  await adapter.refreshProcess();
  await adapter.requestPublish();
  assert.deepEqual(sent.at(-1), []);
  assert.equal(await adapter.receive({ parentPid: 100, occurredAt: '2026-10-25T19:00:02Z', event }), false);
  assert.equal(adapter.states.size, 0);
});

test('multiple CLI sessions coexist and each process exits independently', async () => {
  let processes = [
    { id: 'cli-a', pid: 100, startedAt: 0, kind: 'cli' },
    { id: 'cli-b', pid: 200, startedAt: 0, kind: 'cli' },
  ];
  const sent = [];
  const adapter = new Adapter({ processFinder: async () => processes,
    publish: async sessions => { sent.push(sessions); }, token: 'test' });
  await adapter.refreshProcess();
  for (const [pid, id] of [[100, 'first'], [200, 'second']]) {
    assert.equal(await adapter.receive({ parentPid: pid, occurredAt: '2026-10-25T19:00:01Z',
      event: sanitizeHookEvent({ hook_event_name: 'UserPromptSubmit', session_id: id,
        turn_id: `turn_${id}`, cwd: `/work/${id}` }) }), true);
  }
  await adapter.requestPublish();
  assert.deepEqual(sent.at(-1).map(x => x.id).sort(), ['codex:first', 'codex:second']);
  processes = [processes[1]];
  await adapter.refreshProcess();
  await adapter.requestPublish();
  assert.deepEqual(sent.at(-1).map(x => x.id), ['codex:second']);
  assert.equal(await adapter.receive({ parentPid: 100, occurredAt: '2026-10-25T19:00:02Z',
    event: sanitizeHookEvent({ hook_event_name: 'Stop', session_id: 'first', turn_id: 'turn_first' }) }), false);
});

test('CLI quit removes its cat as soon as SessionEnd arrives', async () => {
  const processes = [
    { id: 'cli-a', pid: 100, startedAt: 0, kind: 'cli' },
    { id: 'cli-b', pid: 200, startedAt: 0, kind: 'cli' },
  ];
  const sent = [];
  const adapter = new Adapter({ processFinder: async () => processes,
    publish: async sessions => { sent.push(sessions); }, token: 'test' });
  await adapter.refreshProcess();
  for (const [pid, id] of [[100, 'first'], [200, 'second']]) {
    await adapter.receive({ parentPid: pid, occurredAt: '2026-10-25T19:00:01Z',
      event: sanitizeHookEvent({ hook_event_name: 'SessionStart', session_id: id,
        cwd: `/work/${id}` }) });
  }
  await adapter.requestPublish();
  assert.deepEqual(sent.at(-1).map(x => x.id).sort(), ['codex:first', 'codex:second']);

  assert.equal(await adapter.receive({ parentPid: 100, occurredAt: '2026-10-25T19:00:02Z',
    event: sanitizeHookEvent({ hook_event_name: 'SessionEnd', session_id: 'first', reason: 'other' }) }), true);
  await adapter.requestPublish();
  assert.deepEqual(sent.at(-1).map(x => x.id), ['codex:second']);
});
