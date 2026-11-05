// Codex hooks do not include token usage. Read only the recent numeric usage
// record from the local CLI transcript; never forward transcript content.
import fs from 'node:fs';

const MAX_TAIL_BYTES = 1024 * 1024;

export function contextFromTranscript(file) {
  if (typeof file !== 'string' || !file.endsWith('.jsonl')) return null;
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const start = Math.max(0, size - MAX_TAIL_BYTES);
    const buffer = Buffer.alloc(size - start);
    fs.readSync(fd, buffer, 0, buffer.length, start);
    const lines = buffer.toString('utf8').split('\n');
    if (start > 0) lines.shift(); // The first line may be incomplete.
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i].includes('"token_count"')) continue;
      let entry;
      try { entry = JSON.parse(lines[i]); } catch { continue; }
      if (entry.type !== 'event_msg' || entry.payload?.type !== 'token_count') continue;
      const tokens = entry.payload.info?.last_token_usage?.input_tokens;
      const window = entry.payload.info?.model_context_window;
      if (Number.isSafeInteger(tokens) && tokens >= 0 &&
          Number.isSafeInteger(window) && window > 0) return { tokens, window };
    }
  } catch {
    // Missing or unreadable transcripts leave context unknown.
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  return null;
}
