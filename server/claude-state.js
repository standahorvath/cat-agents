// Reads the state of locally running Claude Code sessions straight from ~/.claude:
//   sessions/<pid>.json                       - registry of running sessions (status busy/idle)
//   projects/<project>/<sessionId>.jsonl      - transcript, tells us which tool is running
//   projects/<project>/<sessionId>/subagents/ - transcripts + meta of subagents
// None of this is a documented API, so every read is defensive.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hookState } from './hooks.js';

const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const SESSIONS_DIR = path.join(CLAUDE_DIR, 'sessions');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');

const INITIAL_TAIL_BYTES = 256 * 1024;
const MAX_CHUNK_BYTES = 4 * 1024 * 1024;
const SUBAGENT_ACTIVE_MS = 90_000;

// Inside a container the host's processes are invisible, so a session can't be
// checked by its PID. Claude deletes sessions/<pid>.json on exit, so there we
// trust the file and only hide sessions with no activity for a long time (crashes).
const PID_CHECK = (process.env.CLAUDE_PID_CHECK ?? 'auto') === 'auto' ? !fs.existsSync('/.dockerenv') : process.env.CLAUDE_PID_CHECK !== 'off';
const STALE_MS = Number(process.env.CLAUDE_STALE_HOURS || 48) * 3_600_000;
const MAX_EVENTS = 8;
// A finished tool keeps colouring the agent for a while, otherwise quick tools would only flash.
const LINGER_MS = 15_000;
// Context window the fill is measured against (current models have 1M tokens).
const CONTEXT_WINDOW = Number(process.env.CLAUDE_CONTEXT_WINDOW) || 1_000_000;

// Transcript tailing

class JsonlTail {
  constructor(file) {
    this.file = file;
    this.offset = null;
    this.rest = Buffer.alloc(0);
    this.skipPartial = false;
  }

  read() {
    let size;
    try {
      size = fs.statSync(this.file).size;
    } catch {
      return [];
    }
    // First read, truncated file or a huge backlog: start near the end.
    if (this.offset === null || size < this.offset || size - this.offset > MAX_CHUNK_BYTES) {
      this.offset = Math.max(0, size - INITIAL_TAIL_BYTES);
      this.rest = Buffer.alloc(0);
      this.skipPartial = this.offset > 0;
    }
    if (size === this.offset) return [];

    const chunk = Buffer.alloc(size - this.offset);
    const fd = fs.openSync(this.file, 'r');
    try {
      fs.readSync(fd, chunk, 0, chunk.length, this.offset);
    } finally {
      fs.closeSync(fd);
    }
    this.offset = size;

    // Work on bytes so a multi-byte character split across reads stays intact.
    const data = this.rest.length ? Buffer.concat([this.rest, chunk]) : chunk;
    let start = 0;
    if (this.skipPartial) {
      const nl = data.indexOf(10);
      if (nl === -1) {
        this.rest = Buffer.alloc(0);
        return [];
      }
      start = nl + 1;
      this.skipPartial = false;
    }
    const lastNl = data.lastIndexOf(10);
    if (lastNl < start) {
      this.rest = Buffer.from(data.subarray(start));
      return [];
    }
    this.rest = Buffer.from(data.subarray(lastNl + 1));

    const entries = [];
    for (const line of data.subarray(start, lastNl).toString('utf8').split('\n')) {
      if (!line) continue;
      try {
        entries.push(JSON.parse(line));
      } catch {
        // partial or foreign line, ignore
      }
    }
    return entries;
  }
}

// Tools

const SHELL = new Set(['Bash', 'BashOutput', 'KillShell', 'Monitor', 'TaskStop']);
const WRITE = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const READ = new Set(['Read', 'Grep', 'Glob', 'LS', 'ToolSearch']);
const WEB = new Set(['WebFetch', 'WebSearch']);
const AGENT = new Set(['Agent', 'Task', 'SendMessage', 'Workflow', 'Skill']);

function categorize(name) {
  if (SHELL.has(name)) return 'shell';
  if (WRITE.has(name)) return 'write';
  if (READ.has(name)) return 'read';
  if (WEB.has(name) || /browser|playwright|chrome/i.test(name)) return 'web';
  if (AGENT.has(name)) return 'agent';
  if (name.startsWith('mcp__')) return 'mcp';
  return 'other';
}

function detailFor(input) {
  if (typeof input.description === 'string') return input.description;
  if (typeof input.command === 'string') return input.command;
  if (typeof input.file_path === 'string') return path.basename(input.file_path);
  if (typeof input.notebook_path === 'string') return path.basename(input.notebook_path);
  if (typeof input.pattern === 'string') return input.pattern;
  if (typeof input.query === 'string') return input.query;
  if (typeof input.url === 'string') {
    try {
      return new URL(input.url).hostname;
    } catch {
      return input.url;
    }
  }
  if (typeof input.skill === 'string') return input.skill;
  return '';
}

function truncate(text, max = 90) {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

function describeTool(block, ts) {
  return {
    id: block.id,
    name: block.name.split('__').at(-1),
    category: categorize(block.name),
    detail: truncate(detailFor(block.input ?? {})),
    command: block.name === 'Bash' ? String(block.input?.command ?? '').slice(0, 400) : null,
    ts,
  };
}

// Results of commands: tests, failures, commits

const TEST_COMMAND = /\b((npm|pnpm|yarn|bun)( run)? test|vitest|jest|pytest|phpunit|pest|go test|cargo test|rspec|mocha|artisan test|composer test|dotnet test|tox|make (test|check))\b/;
const TEST_FAILED = /(\b[1-9]\d* (failed|failing|failures?|errors?)\b|FAILURES!|ERRORS!|Tests:.*\bfailed|✗|FAIL\b)/;

function resultText(block) {
  if (typeof block.content === 'string') return block.content;
  if (Array.isArray(block.content)) return block.content.map((c) => c.text ?? '').join('\n');
  return '';
}

const DEPLOY_COMMAND = /\b(npm|pnpm|yarn|bun) run deploy\b|\bdeploy\.sh\b|\b(cap|serverless|sls|fly|netlify|firebase|wrangler)\b[^|;&]*\bdeploy\b|\bvercel --prod\b|\bkubectl apply\b|\bhelm (install|upgrade)\b|\bterraform apply\b|\bdocker push\b|\bdocker buildx build[^|;&]*--push\b/;
const BUILD_COMMAND = /\b((npm|pnpm|yarn|bun)( run)? build|vite build|next build|tsc|webpack|cargo build|go build|gradle|mvn (package|install)|dotnet build|docker (compose )?build)\b|(^|[;&|]\s*)make\b/;
const BUILD_FAILED = /\b(error TS\d+|Build failed|build failed|ERROR in|compilation failed|error\[E\d+\])/;
const INSTALL_COMMAND = /\b((npm|pnpm|bun) (i|install|ci|add)|yarn (install|add)|pip3? install|composer (install|require|update)|cargo add|go get|brew install|apt(-get)? install|gem install|bundle install)\b/;
const LINT_COMMAND = /\b(eslint|prettier|biome|ruff|flake8|phpstan|psalm|rubocop|golangci-lint|(npm|pnpm|yarn|bun)( run)? (lint|format))\b/;
const REVERT_COMMAND = /\bgit (revert|reset --hard|restore|stash)\b|\bgit checkout -- /;
// A shell command this slow gets a sigh from the cat.
const SLOW_MS = 120_000;

// What a finished shell command means for the cat, or null.
export function classifyResult(command, output, isError) {
  if (!command) return null;
  if (TEST_COMMAND.test(command)) return isError || TEST_FAILED.test(output) ? 'testsFail' : 'testsPass';
  if (BUILD_COMMAND.test(command) && !/\bgit (commit|push)\b/.test(command)) return isError || BUILD_FAILED.test(output) ? 'buildFail' : 'build';
  if (isError) return /\bgit (commit|push)\b/.test(command) ? null : 'error';
  if (/\b(gh pr merge|git merge)\b/.test(command)) return 'merge';
  if (/\bgit push\b/.test(command)) return 'push';
  if (/\bgit commit\b/.test(command) && !/--dry-run/.test(command)) return 'commit';
  if (DEPLOY_COMMAND.test(command)) return 'deploy';
  if (INSTALL_COMMAND.test(command)) return 'install';
  if (LINT_COMMAND.test(command)) return 'lint';
  if (REVERT_COMMAND.test(command)) return 'revert';
  return null;
}

// Activity derived from transcript entries

class Activity {
  constructor() {
    this.pending = new Map();
    this.events = [];
    this.results = [];
    this.finished = false;
    this.tokens = null; // context size after the latest reply
    this.compacts = [];
  }

  apply(entry) {
    const ts = Date.parse(entry.timestamp) || Date.now();
    const content = entry.message?.content;
    // Context in use: everything the model read for its latest reply.
    const usage = entry.type === 'assistant' && !entry.isSidechain ? entry.message?.usage : null;
    if (usage) {
      const tokens = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
      if (tokens > 0) this.tokens = tokens;
    }
    if (entry.type === 'system' && entry.subtype === 'compact_boundary') {
      const meta = entry.compactMetadata ?? {};
      this.compacts.push({ id: entry.uuid ?? String(ts), ts, before: meta.preTokens ?? this.tokens ?? 0, after: meta.postTokens ?? 0, trigger: meta.trigger ?? 'auto' });
      if (this.compacts.length > 3) this.compacts.shift();
      this.tokens = meta.postTokens ?? null;
    }
    if (entry.type === 'assistant' && Array.isArray(content)) {
      this.finished = entry.message.stop_reason === 'end_turn';
      for (const block of content) {
        if (block.type !== 'tool_use') continue;
        const tool = describeTool(block, ts);
        this.pending.set(block.id, tool);
        this.events.push(tool);
      }
      if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    } else if (entry.type === 'user') {
      this.finished = false;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type !== 'tool_result') continue;
          const tool = this.pending.get(block.tool_use_id);
          this.pending.delete(block.tool_use_id);
          let kind = classifyResult(tool?.command, resultText(block), block.is_error === true);
          if (!kind && tool?.command && ts - tool.ts > SLOW_MS) kind = 'slow';
          if (kind) {
            this.results.push({ id: block.tool_use_id, kind, ts });
            if (this.results.length > 6) this.results.shift();
          }
        }
      }
    } else if (entry.type === 'system' && entry.subtype === 'turn_duration') {
      this.pending.clear();
      this.finished = true;
    }
  }

  current(now) {
    const running = [...this.pending.values()].at(-1);
    if (running) return running;
    const last = this.events.at(-1);
    if (last && now - last.ts < LINGER_MS) return last;
    return { name: null, category: 'think', detail: '' };
  }
}

// Sessions

const tracked = new Map(); // sessionId -> { transcript, tail, activity, subagents }

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

function mtime(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

function sessionAlive(info, file, transcript) {
  if (PID_CHECK) return pidAlive(info.pid);
  const last = Math.max(info.updatedAt ?? 0, info.statusUpdatedAt ?? 0, mtime(file), transcript ? mtime(transcript) : 0);
  return Date.now() - last < STALE_MS;
}

function findTranscript(sessionId, cwd) {
  const guess = path.join(PROJECTS_DIR, cwd.replace(/[^a-zA-Z0-9]/g, '-'), `${sessionId}.jsonl`);
  if (fs.existsSync(guess)) return guess;
  try {
    for (const dir of fs.readdirSync(PROJECTS_DIR)) {
      const candidate = path.join(PROJECTS_DIR, dir, `${sessionId}.jsonl`);
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch {
    // no projects dir yet
  }
  return null;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function collectSubagents(state, now) {
  const dir = path.join(state.transcript.replace(/\.jsonl$/, ''), 'subagents');
  let files;
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
  } catch {
    return [];
  }

  const result = [];
  const seen = new Set();
  for (const file of files) {
    const full = path.join(dir, file);
    let mtime;
    try {
      mtime = fs.statSync(full).mtimeMs;
    } catch {
      continue;
    }
    if (now - mtime > SUBAGENT_ACTIVE_MS) continue;

    const id = file.replace(/\.jsonl$/, '');
    seen.add(id);
    let sub = state.subagents.get(id);
    if (!sub) {
      const meta = readJson(full.replace(/\.jsonl$/, '.meta.json')) ?? {};
      sub = { tail: new JsonlTail(full), activity: new Activity(), meta };
      state.subagents.set(id, sub);
    }
    for (const entry of sub.tail.read()) sub.activity.apply(entry);
    if (sub.activity.finished) continue;

    result.push({
      id,
      type: sub.meta.agentType ?? 'agent',
      description: sub.meta.description ?? '',
      activity: sub.activity.current(now),
      events: sub.activity.events.slice(-3),
    });
  }
  for (const id of state.subagents.keys()) if (!seen.has(id)) state.subagents.delete(id);
  return result;
}

export function snapshot() {
  const now = Date.now();
  const sessions = [];
  const alive = new Set();

  let files = [];
  try {
    files = fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith('.json'));
  } catch {
    // no sessions dir: nothing runs
  }

  for (const file of files) {
    const sessionFile = path.join(SESSIONS_DIR, file);
    const info = readJson(sessionFile);
    if (!info?.sessionId || !info.pid) continue;
    const known = tracked.get(info.sessionId);
    const transcript = known?.transcript ?? (PID_CHECK ? null : findTranscript(info.sessionId, info.cwd ?? ''));
    if (!sessionAlive(info, sessionFile, transcript)) continue;
    alive.add(info.sessionId);

    let state = known;
    if (!state) {
      state = { transcript: null, tail: null, activity: new Activity(), subagents: new Map() };
      tracked.set(info.sessionId, state);
    }
    if (!state.transcript) {
      state.transcript = findTranscript(info.sessionId, info.cwd ?? '');
      if (state.transcript) state.tail = new JsonlTail(state.transcript);
    }
    if (state.tail) for (const entry of state.tail.read()) state.activity.apply(entry);

    // Hooks know right away when a session waits for permission or starts a tool.
    const hook = hookState(info.sessionId);
    let status = info.status ?? 'unknown';
    if (hook?.waiting) status = 'waiting';
    let activity = status === 'busy' ? state.activity.current(now) : null;
    if (status === 'busy' && hook?.tool && now - hook.tool.ts < 30_000) {
      const tool = describeTool({ id: hook.tool.id, name: hook.tool.name, input: hook.tool.input }, hook.tool.ts);
      activity = tool;
      if (!state.activity.events.some((e) => e.id === tool.id)) state.activity.events.push(tool);
    }

    sessions.push({
      id: info.sessionId,
      pid: info.pid,
      name: info.name ?? info.sessionId.slice(0, 8),
      cwd: info.cwd ?? '',
      project: path.basename(info.cwd ?? '') || '~',
      entrypoint: info.entrypoint ?? 'cli',
      status,
      statusSince: info.statusUpdatedAt ?? info.updatedAt ?? info.startedAt ?? now,
      startedAt: info.startedAt ?? 0,
      activity,
      events: state.activity.events.slice(-4).map(({ command, ...e }) => e),
      results: state.activity.results.slice(-4),
      context: state.activity.tokens == null ? null : { tokens: state.activity.tokens, window: CONTEXT_WINDOW, fill: Math.min(1, state.activity.tokens / CONTEXT_WINDOW) },
      compacts: state.activity.compacts,
      subagents: state.transcript ? collectSubagents(state, now) : [],
    });
  }

  for (const id of tracked.keys()) if (!alive.has(id)) tracked.delete(id);
  sessions.sort((a, b) => a.startedAt - b.startedAt);
  return { sessions };
}
