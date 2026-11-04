// A request the URL parser rejects must get an answer, not take the server down.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ENTRY = fileURLToPath(new URL('../server/index.js', import.meta.url));

const freePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});

const get = (port, urlPath) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, path: urlPath }, (res) => {
    res.resume();
    res.on('end', () => resolve(res.statusCode));
  });
  req.once('error', reject);
  req.end();
});

describe('server', () => {
  let child;
  let port;
  let tmp;

  before(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cat-agents-test-'));
    port = await freePort();
    child = spawn(process.execPath, [ENTRY], {
      env: {
        ...process.env,
        HOME: tmp,
        CLAUDE_CONFIG_DIR: path.join(tmp, '.claude'),
        DATA_DIR: tmp,
        CAT_AGENTS_HOOKS: 'off',
        HOST: '127.0.0.1',
        PORT: String(port),
      },
      stdio: 'ignore',
    });
    for (let tries = 0; ; tries++) {
      try {
        await get(port, '/api/state');
        return;
      } catch (err) {
        if (tries >= 50) throw err;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  });

  after(() => {
    child.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  for (const urlPath of ['/%', '/%E0%A4%A', '//']) {
    it(`answers 400 to ${urlPath} and keeps running`, async () => {
      assert.equal(await get(port, urlPath), 400);
      assert.equal(await get(port, '/api/state'), 200);
    });
  }
});
