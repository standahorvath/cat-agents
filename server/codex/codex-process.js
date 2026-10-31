import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function parseProcesses(output) {
  return output.split('\n').flatMap(line => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.{24})\s+(.+)$/);
    return match ? [{
      pid: Number(match[1]), ppid: Number(match[2]),
      started: match[3].trim(), command: match[4].trim(),
    }] : [];
  });
}

export function codexProcesses(processes) {
  const result = [];
  for (const item of processes) {
    const executable = item.command.split(' ')[0];
    if (!/(^|\/)codex$/.test(executable)) continue;
    if (executable.includes('.app/Contents/')) continue;
    // Recent CLI versions run hooks from a shared managed app-server daemon,
    // which is not a child of the CLI process.
    if (/\bapp-server\b/.test(item.command) && /--managed-daemon\b/.test(item.command)) {
      result.push({ id: `${executable}:${item.pid}:${item.started}`, pid: item.pid,
        startedAt: Date.parse(item.started), kind: 'backend' });
      continue;
    }
    if (/\b(?:app-server|exec-server|mcp-server)\b/.test(item.command)) continue;
    result.push({ id: `${executable}:${item.pid}:${item.started}`, pid: item.pid,
      startedAt: Date.parse(item.started), kind: 'cli' });
  }
  return result;
}

export async function findCodexProcesses() {
  const { stdout } = await execFileAsync('/bin/ps', ['-axo', 'pid=,ppid=,lstart=,command='], {
    timeout: 2000, maxBuffer: 8 * 1024 * 1024,
  });
  return codexProcesses(parseProcesses(stdout));
}
