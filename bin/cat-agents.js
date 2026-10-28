#!/usr/bin/env node
// `npx cat-agents`: runs the office server with the prebuilt frontend from dist/.
// The npx cache is throwaway, so coins and furniture live in ~/.cat-agents by default.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

const HELP = `Cat Office: live visualization of Claude Code agents

Usage:
  npx cat-agents [options]      start the office at http://127.0.0.1:4317
  npx cat-agents remove-hooks   remove the hooks from ~/.claude/settings.json

Options:
  -p, --port <port>   server port (default 4317, env PORT)
      --host <host>   server address (default 127.0.0.1, env HOST)
      --data <dir>    where coins and furniture are saved (default ~/.cat-agents, env DATA_DIR)
      --no-hooks      don't install hooks into ~/.claude/settings.json
      --no-open       don't open the office in the browser
  -v, --version       print the version
  -h, --help          print this help
`;

let args;
try {
  args = parseArgs({
    allowPositionals: true,
    options: {
      port: { type: 'string', short: 'p' },
      host: { type: 'string' },
      data: { type: 'string' },
      'no-hooks': { type: 'boolean' },
      'no-open': { type: 'boolean' },
      version: { type: 'boolean', short: 'v' },
      help: { type: 'boolean', short: 'h' },
    },
  });
} catch (err) {
  console.error(`${err.message}\n\n${HELP}`);
  process.exit(1);
}
const { values: opts, positionals } = args;

if (opts.help) {
  console.log(HELP);
  process.exit(0);
}
if (opts.version) {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  console.log(pkg.version);
  process.exit(0);
}

const [command] = positionals;
if (command === 'remove-hooks') {
  const { removeHooks } = await import('../server/hooks.js');
  console.log(removeHooks());
  process.exit(0);
}
if (command) {
  console.error(`Unknown command: ${command}\n\n${HELP}`);
  process.exit(1);
}

// The server reads its configuration from the environment when its modules load.
if (opts.port) process.env.PORT = opts.port;
if (opts.host) process.env.HOST = opts.host;
if (opts['no-hooks']) process.env.CAT_AGENTS_HOOKS = 'off';
process.env.DATA_DIR = path.resolve(opts.data || process.env.DATA_DIR || path.join(os.homedir(), '.cat-agents'));

const { server } = await import('../server/index.js');

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${process.env.PORT || 4317} is already in use. The office is probably running already, or try --port <other>.`);
  } else {
    console.error(err.message);
  }
  process.exit(1);
});

server.once('listening', () => {
  console.log(`data: ${process.env.DATA_DIR}`);
  if (opts['no-open']) return;
  const { address, port } = server.address();
  const url = `http://${address === '0.0.0.0' || address === '::' ? '127.0.0.1' : address}:${port}`;
  const [cmd, ...cmdArgs] =
    process.platform === 'darwin' ? ['open', url] : process.platform === 'win32' ? ['cmd', '/c', 'start', '', url] : ['xdg-open', url];
  spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
});
