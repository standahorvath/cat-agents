import { fingerprintToolInput } from './state.js';
import { contextFromTranscript } from './context.js';
import { TEST_COMMAND, TEST_FAILED, BUILD_COMMAND, BUILD_FAILED } from '../test-patterns.js';


function responseText(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(responseText).join('\n');
  if (!value || typeof value !== 'object') return '';
  return [value.text, value.output, value.content].map(responseText).join('\n');
}

function testResult(source) {
  if (source.hook_event_name !== 'PostToolUse') return null;
  const direct = source.tool_name === 'Bash' || source.tool_name === 'exec_command';
  const wrapped = source.tool_name === 'exec' || source.tool_name === 'functions.exec';
  if (!direct && !wrapped) return null;
  const command = direct ? source.tool_input?.command ?? source.tool_input?.cmd : source.tool_input?.code;
  if (typeof command !== 'string' || !TEST_COMMAND.test(command)) return null;
  const response = source.tool_response;
  if (!response) return null;
  const output = responseText(response);
  const code = typeof response === 'object' ? response.exit_code ?? response.exitCode : null;
  if (Number.isInteger(code)) return code === 0 && !TEST_FAILED.test(output) ? 'testsPass' : 'testsFail';
  if (/\b(?:Process exited with code|exit code:)\s*[1-9]\d*\b/i.test(output) || TEST_FAILED.test(output)) return 'testsFail';
  if (/\b(?:Process exited with code|exit code:)\s*0\b/i.test(output) ||
      /\bScript completed\b/.test(output)) return 'testsPass';
  return null;
}

function buildResult(source) {
  if (source.hook_event_name !== 'PostToolUse') return null;
  const direct = source.tool_name === 'Bash' || source.tool_name === 'exec_command';
  const wrapped = source.tool_name === 'exec' || source.tool_name === 'functions.exec';
  if (!direct && !wrapped) return null;
  const command = direct ? source.tool_input?.command ?? source.tool_input?.cmd : source.tool_input?.code;
  if (typeof command !== 'string' || TEST_COMMAND.test(command) ||
      !BUILD_COMMAND.test(command) || /\bgit (commit|push)\b/.test(command)) return null;
  const response = source.tool_response;
  if (!response) return null;
  const output = responseText(response);
  const code = typeof response === 'object' ? response.exit_code ?? response.exitCode : null;
  if (Number.isInteger(code)) return code === 0 && !BUILD_FAILED.test(output) ? 'build' : 'buildFail';
  if (/\b(?:Process exited with code|exit code:|exit_code["']?\s*:)\s*[1-9]\d*\b/i.test(output) ||
      BUILD_FAILED.test(output)) return 'buildFail';
  if (/\b(?:Process exited with code|exit code:|exit_code["']?\s*:)\s*0\b/i.test(output) ||
      /\bBUILD SUCCESS(?:FUL)?\b/.test(output) || /\bScript completed\b/.test(output)) return 'build';
  return null;
}

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

function successfulGitOperation(source) {
  if (source.hook_event_name !== 'PostToolUse') return null;
  const direct = source.tool_name === 'Bash' || source.tool_name === 'exec_command';
  const wrapped = source.tool_name === 'exec' || source.tool_name === 'functions.exec';
  if (!direct && !wrapped) return null;
  const command = direct ? source.tool_input?.command ?? source.tool_input?.cmd : source.tool_input?.code;
  if (typeof command !== 'string') return null;
  const boundary = wrapped ? '(?:^|[;&|"\'])' : '(?:^|[;&|])';
  const git = `${boundary}\\s*git\\s+(?:(?:-C\\s+\\S+|--git-dir(?:=|\\s+)\\S+|--work-tree(?:=|\\s+)\\S+)\\s+)*`;
  const kind = new RegExp(`${git}merge(?:\\s|$)|${boundary}\\s*gh\\s+pr\\s+merge(?:\\s|$)`).test(command) ? 'merge'
    : new RegExp(`${git}push(?:\\s|$)`).test(command) ? 'push' : null;
  if (!kind || /(?:^|\s)--dry-run(?:\s|$)/.test(command) ||
      (kind === 'merge' && /\bgit\s+merge\s+--(?:abort|quit|continue)\b/.test(command))) return null;
  const response = source.tool_response;
  if (!response) return null;
  const output = responseText(response);
  const code = typeof response === 'object' ? response.exit_code ?? response.exitCode : null;
  if (Number.isInteger(code)) return code === 0 ? kind : null;
  if (/\b(?:Process exited with code|exit code:)\s*0\b/i.test(output)) return kind;
  if (wrapped) return null;
  return null;
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
  else {
    const result = testResult(source) ?? buildResult(source) ?? successfulGitOperation(source);
    if (result) event.result_kind = result;
  }
  const context = contextFromTranscript(source.transcript_path);
  if (context) event.context = context;
  return event;
}
