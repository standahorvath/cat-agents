import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PermissionRequest', 'PostToolUse', 'Stop', 'SessionEnd'];
const MARKER = 'CAT_AGENTS_CODEX_ADAPTER=1';
const HOOK_SCRIPT = fileURLToPath(new URL('./hook.js', import.meta.url));

const quote = value => `'${String(value).replaceAll("'", "'\\''")}'`;

export function hookCommand(nodePath = process.execPath, script = HOOK_SCRIPT) {
  return `${MARKER} ${quote(nodePath)} ${quote(script)}`;
}

function isOurs(hook) {
  return hook?.type === 'command' && typeof hook.command === 'string' &&
    hook.command.includes(MARKER);
}

export function editHooks({ action, target = path.join(os.homedir(), '.codex', 'hooks.json'),
                     nodePath = process.execPath, script = HOOK_SCRIPT } = {}) {
  if (!['install', 'remove'].includes(action)) throw new TypeError('action must be install or remove');
  const existed = fs.existsSync(target);
  const original = existed ? fs.readFileSync(target, 'utf8') : null;
  const config = original ? JSON.parse(original) : {};
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Invalid hooks.json');
  if (config.hooks != null && (typeof config.hooks !== 'object' || Array.isArray(config.hooks))) {
    throw new Error('Invalid hooks table');
  }
  config.hooks ||= {};
  let changed = false;
  for (const event of EVENTS) {
    const groups = config.hooks[event] || [];
    if (!Array.isArray(groups)) throw new Error(`Invalid ${event} hook groups`);
    const remaining = groups.map(group => {
      if (!group || !Array.isArray(group.hooks)) return group;
      const hooks = group.hooks.filter(hook => !isOurs(hook));
      if (hooks.length !== group.hooks.length) changed = true;
      return { ...group, hooks };
    }).filter(group => !Array.isArray(group?.hooks) || group.hooks.length);
    if (action === 'install') {
      remaining.push({ hooks: [{ type: 'command', command: hookCommand(nodePath, script),
        async: event !== 'SessionEnd', timeout: event === 'SessionEnd' ? 3 : 2 }] });
      changed = true;
    }
    if (remaining.length) config.hooks[event] = remaining;
    else delete config.hooks[event];
  }
  if (!changed) return { changed: false, target };
  if (!Object.keys(config.hooks).length) delete config.hooks;
  const serialized = JSON.stringify(config, null, 2) + '\n';
  if (original === serialized) return { changed: false, target };
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  if (existed) {
    const backup = `${target}.cat-agents-backup-${Date.now()}`;
    fs.copyFileSync(target, backup);
    fs.chmodSync(backup, 0o600);
  }
  fs.writeFileSync(target, serialized, { mode: 0o600 });
  return { changed: true, target };
}

export { EVENTS };
