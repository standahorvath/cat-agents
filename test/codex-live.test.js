import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sanitizeHookEvent } from '../server/codex/hook-event.js';
import { contextFromTranscript } from '../server/codex/context.js';
import { editHooks } from '../server/codex/hook-install.js';
import { parseProcesses, codexProcesses } from '../server/codex/codex-process.js';
import { processAncestry } from '../server/codex/process-ancestry.js';
import { Adapter } from '../server/codex/receiver.js';

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

test('hook installation preserves other hooks and is idempotent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cat-hooks-'));
  try {
    const target = path.join(dir, 'hooks.json');
    const original = { hooks: { Stop: [{ matcher: '*', hooks: [{ type: 'command', command: 'other-hook' }] }] } };
    fs.writeFileSync(target, JSON.stringify(original));
    const options = { target, nodePath: '/usr/local/bin/node', script: '/tmp/my-hook.js' };
    assert.equal(editHooks({ ...options, action: 'install' }).changed, true);
    const installed = fs.readFileSync(target, 'utf8');
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
