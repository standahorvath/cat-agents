import { execFileSync } from 'node:child_process';

// Command hooks are launched through a shell, so process.ppid is usually the
// shell rather than Codex. Capture its ancestors before the shell exits.
export function processAncestry(pid = process.ppid, parentOf = parentPid) {
  const pids = [];
  const seen = new Set();
  for (let depth = 0; depth < 6 && Number.isInteger(pid) && pid > 1 && !seen.has(pid); depth++) {
    pids.push(pid);
    seen.add(pid);
    try { pid = parentOf(pid); } catch { break; }
  }
  return pids;
}

function parentPid(pid) {
  const output = execFileSync('/bin/ps', ['-p', String(pid), '-o', 'ppid='], {
    encoding: 'utf8', timeout: 250, maxBuffer: 1024,
  }).trim();
  return /^\d+$/.test(output) ? Number(output) : null;
}
