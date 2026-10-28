// Claude Code hooks: installed into ~/.claude/settings.json on startup so every
// session reports tool use and permission prompts the moment they happen.
// Our entries are recognisable by the "cat-agents" marker and can be removed with
// `node server/hooks.js --remove`.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MARK = 'cat-agents';
const EVENTS = ['PreToolUse', 'PostToolUse', 'Notification', 'Stop', 'UserPromptSubmit', 'SubagentStop'];
const TOOL_EVENTS = new Set(['PreToolUse', 'PostToolUse']);
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const SETTINGS = path.join(CLAUDE_DIR, 'settings.json');

const hookCommand = (url) =>
  `curl -s -m 1 -X POST -H 'Content-Type: application/json' --data-binary @- ${url} >/dev/null 2>&1 || true # ${MARK}`;

const isOurs = (group) => group?.hooks?.some((h) => typeof h.command === 'string' && h.command.includes(MARK));

function readSettings() {
  if (fs.existsSync(SETTINGS) && fs.statSync(SETTINGS).isDirectory()) return { skip: 'settings.json is a directory (the file to mount is missing)' };
  try {
    return { settings: fs.existsSync(SETTINGS) ? JSON.parse(fs.readFileSync(SETTINGS, 'utf8')) : {} };
  } catch (err) {
    return { skip: `cannot read settings.json (${err.message})` };
  }
}

// Written in place (not renamed) so it also works when the file is bind-mounted.
function writeSettings(settings) {
  fs.writeFileSync(SETTINGS, `${JSON.stringify(settings, null, 2)}\n`);
}

export function installHooks(url) {
  const { settings, skip } = readSettings();
  if (skip) return `hooks skipped: ${skip}`;
  const command = hookCommand(url);
  settings.hooks ??= {};
  const already = EVENTS.every((event) =>
    (settings.hooks[event] ?? []).some((g) => isOurs(g) && g.hooks.some((h) => h.command === command)),
  );
  if (already) return 'hooks already installed';

  const backup = `${SETTINGS}.cat-agents.bak`;
  if (fs.existsSync(SETTINGS) && !fs.existsSync(backup)) {
    try {
      fs.copyFileSync(SETTINGS, backup);
    } catch {
      // Read-only directory (Docker): the settings file itself is still writable
    }
  }
  for (const event of EVENTS) {
    const groups = (settings.hooks[event] ?? []).filter((g) => !isOurs(g));
    const ours = { hooks: [{ type: 'command', command, timeout: 2 }] };
    if (TOOL_EVENTS.has(event)) ours.matcher = '*';
    settings.hooks[event] = [...groups, ours];
  }
  writeSettings(settings);
  return `hooks installed into ${SETTINGS}`;
}

export function removeHooks() {
  const { settings, skip } = readSettings();
  if (skip) return `nothing changed: ${skip}`;
  if (!settings.hooks) return 'no hooks found';
  for (const event of Object.keys(settings.hooks)) {
    settings.hooks[event] = settings.hooks[event].filter((g) => !isOurs(g));
    if (!settings.hooks[event].length) delete settings.hooks[event];
  }
  if (!Object.keys(settings.hooks).length) delete settings.hooks;
  writeSettings(settings);
  return 'cat-agents hooks removed';
}

// Live state from hook events

const live = new Map(); // sessionId -> { waiting, tool, ts }

export function handleHook(event) {
  const id = event?.session_id;
  if (!id) return;
  const entry = live.get(id) ?? { waiting: false, tool: null, ts: 0 };
  entry.ts = Date.now();
  switch (event.hook_event_name) {
    case 'Notification':
      // "Claude needs your permission to use Bash": the cat runs to the front.
      if (/permission/i.test(event.message ?? '')) entry.waiting = true;
      break;
    case 'PreToolUse':
      entry.waiting = false;
      entry.tool = { name: event.tool_name, input: event.tool_input ?? {}, ts: Date.now(), id: `hook-${Date.now()}` };
      break;
    case 'PostToolUse':
      entry.waiting = false;
      entry.tool = null;
      break;
    case 'Stop':
    case 'UserPromptSubmit':
      entry.waiting = false;
      entry.tool = null;
      break;
    default:
  }
  live.set(id, entry);
}

export const hookState = (sessionId) => live.get(sessionId);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.env.HOOK_URL || `http://127.0.0.1:${process.env.PORT || 4317}/api/hook`;
  console.log(process.argv.includes('--remove') ? removeHooks() : installHooks(url));
}
