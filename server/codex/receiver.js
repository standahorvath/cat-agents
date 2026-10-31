import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { SessionStateMachine } from './state.js';
import { publishSnapshot } from './cat-office-client.js';
import { findCodexProcesses } from './codex-process.js';
import { SOCKET_PATH, OFFICE_URL, localToken } from './runtime-config.js';

export class Adapter {
  constructor({ processFinder = findCodexProcesses, publish = publishSnapshot,
                socketPath = SOCKET_PATH, officeUrl = OFFICE_URL, token = localToken(),
                processPollMs = 1000, heartbeatMs = 5000 } = {}) {
    this.processFinder = processFinder;
    this.publish = publish;
    this.socketPath = socketPath;
    this.officeUrl = officeUrl;
    this.token = token;
    this.processPollMs = processPollMs;
    this.heartbeatMs = heartbeatMs;
    this.processes = new Map();
    this.states = new Map();
    this.server = null;
    this.pollTimer = null;
    this.heartbeatTimer = null;
    this.dirty = false;
    this.sending = null;
    this.scanSequence = 0;
  }

  async refreshProcess() {
    const sequence = ++this.scanSequence;
    const next = await this.processFinder();
    if (sequence !== this.scanSequence) return [...this.processes.values()];
    const processes = new Map(next.map(process => [process.pid, process]));
    let changed = false;
    for (const [pid, previous] of this.processes) {
      if (processes.get(pid)?.id !== previous.id) {
        this.states.delete(previous.id);
        changed = true;
      }
    }
    this.processes = processes;
    if (changed) this.requestPublish();
    return next;
  }

  async receive(message) {
    if (!message || !Number.isInteger(message.parentPid) ||
        typeof message.occurredAt !== 'string' || !message.event) return false;
    const parents = Array.isArray(message.parentPids) && message.parentPids.length <= 6 &&
      message.parentPids[0] === message.parentPid &&
      message.parentPids.every(pid => Number.isInteger(pid) && pid > 1)
      ? message.parentPids : [message.parentPid];
    let process = parents.map(pid => this.processes.get(pid)).find(Boolean);
    if (!process) {
      try { await this.refreshProcess(); } catch { return false; }
      process = parents.map(pid => this.processes.get(pid)).find(Boolean);
    }
    if (!process) return false;
    if (Number.isFinite(process.startedAt) &&
        Date.parse(message.occurredAt) < process.startedAt) return false;
    let state = this.states.get(process.id);
    if (!state) {
      state = new SessionStateMachine();
      state.setProcess(process.id);
      this.states.set(process.id, state);
    }
    const changed = state.apply(message.event, {
      processId: process.id, occurredAt: message.occurredAt,
    });
    if (changed) this.requestPublish();
    return changed;
  }

  requestPublish() {
    this.dirty = true;
    if (this.sending) return this.sending;
    this.sending = (async () => {
      while (this.dirty) {
        this.dirty = false;
        try {
          const sessions = new Map();
          for (const state of this.states.values()) {
            for (const session of state.snapshot()) sessions.set(session.id, session);
          }
          await this.publish([...sessions.values()], {
            url: `${this.officeUrl}/api/external-sources/codex/sessions`, token: this.token,
          });
        } catch (error) {
          console.error('Cat Office snapshot:', error.message);
          // Heartbeat retries even when the office is unavailable.
        }
      }
    })().finally(() => {
      this.sending = null;
      if (this.dirty) this.requestPublish();
    });
    return this.sending;
  }

  async start() {
    fs.mkdirSync(path.dirname(this.socketPath), { recursive: true, mode: 0o700 });
    if (fs.existsSync(this.socketPath)) {
      const active = await new Promise((resolve, reject) => {
        const socket = net.createConnection(this.socketPath);
        const timer = setTimeout(() => { socket.destroy(); resolve(false); }, 100);
        socket.once('connect', () => { clearTimeout(timer); socket.destroy(); resolve(true); });
        socket.once('error', error => {
          clearTimeout(timer);
          if (error.code === 'ECONNREFUSED') resolve(false);
          else reject(error);
        });
      });
      if (active) throw new Error('Codex adapter is already running');
      fs.unlinkSync(this.socketPath);
    }
    this.server = net.createServer(socket => {
      socket.setEncoding('utf8');
      let buffer = '';
      socket.on('data', chunk => {
        buffer += chunk;
        if (buffer.length > 16 * 1024) return socket.destroy();
        const end = buffer.indexOf('\n');
        if (end === -1) return;
        const line = buffer.slice(0, end);
        buffer = '';
        socket.end();
        try { void this.receive(JSON.parse(line)); } catch { /* malformed local event */ }
      });
    });
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.socketPath, resolve);
    });
    fs.chmodSync(this.socketPath, 0o600);
    try { await this.refreshProcess(); } catch (error) { console.error('Process scan:', error.message); }
    await this.requestPublish();
    this.pollTimer = setInterval(() => {
      this.refreshProcess().catch(error => console.error('Process scan:', error.message));
    }, this.processPollMs);
    this.heartbeatTimer = setInterval(() => this.requestPublish(), this.heartbeatMs);
    console.log(`Codex adapter listening on ${this.socketPath}`);
  }

  async stop() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.processes.clear();
    this.states.clear();
    await this.requestPublish();
    if (this.server) await new Promise(resolve => this.server.close(resolve));
    try { fs.unlinkSync(this.socketPath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
