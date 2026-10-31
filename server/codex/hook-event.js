import { fingerprintToolInput } from './state.js';
import { contextFromTranscript } from './context.js';

function successfulCommit(source) {
  if (source.hook_event_name !== 'PostToolUse') return false;
  const direct = source.tool_name === 'Bash';
  const wrapped = source.tool_name === 'exec' || source.tool_name === 'functions.exec';
  if (!direct && !wrapped) return false;
  const command = direct ? source.tool_input?.command ?? source.tool_input?.cmd : source.tool_input?.code;
  if (typeof command !== 'string' || !/(?:^|[\s;&|"'])git\s+(?:-C\s+\S+\s+|--git-dir(?:=|\s+)\S+\s+|--work-tree(?:=|\s+)\S+\s+)*commit(?:\s|$)/.test(command) || /(?:^|\s)--dry-run(?:\s|$)/.test(command)) return false;
  const response = source.tool_response;
  if (!response) return false;
  const outputText = value => {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(outputText).join('\n');
    if (!value || typeof value !== 'object') return '';
    return [value.text, value.output, value.content].map(outputText).join('\n');
  };
  const output = outputText(response);
  const commitLine = /^\[[^\]\n]+ [a-f0-9]{7,40}\]/im.test(output);
  if (wrapped) return commitLine;
  const code = typeof response === 'object' ? response.exit_code ?? response.exitCode : null;
  if (code === 0) return commitLine;
  if (code !== null && code !== undefined) return false;
  return /(?:Process exited with code 0|exit code: 0)\b/.test(output) && commitLine;
}

export function sanitizeHookEvent(source) {
  if (!source || typeof source !== 'object' ||
      typeof source.session_id !== 'string' || !source.session_id ||
      typeof source.hook_event_name !== 'string') return null;
  const event = {};
  for (const [key, max] of Object.entries({
    hook_event_name: 40, session_id: 200, turn_id: 200, cwd: 4096,
    tool_name: 200, tool_use_id: 200, source: 40, reason: 40,
  })) {
    if (typeof source[key] === 'string' && source[key].length <= max) event[key] = source[key];
  }
  const inputKey = fingerprintToolInput(source);
  if (inputKey) event.tool_input_key = inputKey;
  if (successfulCommit(source)) event.result_kind = 'commit';
  const context = contextFromTranscript(source.transcript_path);
  if (context) event.context = context;
  return event;
}
