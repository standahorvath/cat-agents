#!/usr/bin/env node
// Codex launches this for each event. No prompt, command, or tool result leaves this process.
import net from 'node:net';
import { SOCKET_PATH } from './runtime-config.js';
import { sanitizeHookEvent } from './hook-event.js';
import { processAncestry } from './process-ancestry.js';

const occurredAt = new Date().toISOString();
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (raw.length <= 1024 * 1024) raw += chunk;
});
process.stdin.on('end', () => {
  try {
    if (raw.length > 1024 * 1024) return;
    const source = JSON.parse(raw);
    const event = sanitizeHookEvent(source);
    if (!event) return;
    const socket = net.createConnection(SOCKET_PATH);
    const timer = setTimeout(() => socket.destroy(), 100);
    const parentPids = processAncestry();
    socket.on('connect', () => socket.end(JSON.stringify({
      occurredAt, parentPid: process.ppid, parentPids, event,
    }) + '\n'));
    socket.on('error', () => {});
    socket.on('close', () => clearTimeout(timer));
  } catch {
    // Observational hooks never block Codex.
  }
});
