// Some Codex custom tools do not emit PreToolUse/PostToolUse hooks. Recover only
// their completed result metadata at Stop; commands and output stay in Codex.
import fs from 'node:fs';
import { sanitizeHookEvent } from './hook-event.js';

const MAX_TAIL_BYTES = 16 * 1024 * 1024;

function shellCommands(code) {
  if (!/\btools\.exec_command\s*\(/.test(code)) return [];
  const commands = [];
  for (const match of code.matchAll(/\bcmd\s*:\s*("(?:\\.|[^"\\])*")/g)) {
    try { commands.push(JSON.parse(match[1])); } catch { /* dynamic command */ }
  }
  return commands;
}

function recentEntries(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const start = Math.max(0, size - MAX_TAIL_BYTES);
    const buffer = Buffer.alloc(size - start);
    fs.readSync(fd, buffer, 0, buffer.length, start);
    const lines = buffer.toString('utf8').split('\n');
    if (start) lines.shift();
    return lines.flatMap(line => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
  } finally {
    fs.closeSync(fd);
  }
}

export function transcriptResults(source) {
  if (typeof source.transcript_path !== 'string' || !source.transcript_path ||
      typeof source.turn_id !== 'string' || !source.turn_id) return [];
  let entries;
  try { entries = recentEntries(source.transcript_path); } catch { return []; }
  const start = entries.findLastIndex(entry => entry.payload?.type === 'task_started' &&
    entry.payload.turn_id === source.turn_id);
  if (start < 0) return [];

  const calls = new Map();
  const results = [];
  for (const entry of entries.slice(start + 1)) {
    const item = entry.payload;
    if (item?.type === 'task_started') break;
    if (item?.type === 'custom_tool_call' &&
        ['exec', 'functions.exec'].includes(item.name) && typeof item.call_id === 'string') {
      calls.set(item.call_id, item);
    }
    if (item?.type !== 'custom_tool_call_output' || !calls.has(item.call_id)) continue;
    const call = calls.get(item.call_id);
    calls.delete(item.call_id);
    if (typeof call.input !== 'string' || !Array.isArray(item.output)) continue;
    const commands = shellCommands(call.input);
    if (!commands.length) continue;
    const output = item.output.map(part => part?.text ?? '').join('\n');
    // A wrapper may finish while its nested shell command is still running.
    if (/\bScript running with cell ID\b/.test(output)) continue;
    const event = sanitizeHookEvent({
      hook_event_name: 'PostToolUse', session_id: source.session_id,
      turn_id: source.turn_id, tool_name: call.name, tool_use_id: item.call_id,
      tool_input: { code: commands.join('\n') }, tool_response: item.output,
    });
    if (!event?.result_kind) continue;
    // functions.exec often prints a JSON-encoded exec_command result, where
    // newlines appear as literal "\\n". A word boundary before BUILD then
    // sees the "n" as a word character and misses a successful Gradle run.
    if (event.result_kind === 'testsPass' &&
        !/BUILD SUCCESSFUL\b|#\s*pass\s+[1-9]\d*\b|\b[1-9]\d*\s+passed\b|Tests:\s*.*\b[1-9]\d*\s+passed\b/i.test(output)) continue;
    if (event.result_kind === 'build' && !/BUILD SUCCESS(?:FUL)?\b|\bbuild succeeded\b/i.test(output)) continue;
    results.push({ event, occurredAt: entry.timestamp });
  }
  return results;
}
