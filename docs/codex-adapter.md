# Codex adapter protocol

Start Cat Office with `CAT_AGENTS_EXTERNAL_TOKEN` set to a local secret. The
adapter sends a full snapshot to `PUT /api/external-sources/codex/sessions` with
`Authorization: Bearer <token>` and `Content-Type: application/json`.

```json
{
  "schemaVersion": 1,
  "sessions": [{
    "id": "codex:thr_123",
    "source": "codex",
    "name": "example-project",
    "cwd": "/work/example-project",
    "project": "example-project",
    "status": "waiting",
    "statusSince": 1792955400000,
    "startedAt": 1792955300000,
    "activity": { "name": "Bash", "category": "shell", "detail": "Bash", "ts": 1792955400000 },
    "context": { "tokens": 129200, "window": 258400, "fill": 0.5 },
    "results": [{ "id": "codex:thr_123:tool_456", "kind": "commit", "ts": 1792955410000 }],
    "compacts": [{ "id": "codex:thr_123:compact:1792955420000", "ts": 1792955420000, "before": 129200, "after": 20000, "trigger": "auto" }],
    "subagents": []
  }]
}
```

Each accepted request replaces all Codex sessions and returns `204`. An empty
`sessions` array clears them. Send a snapshot at least every five seconds;
the server expires it after 15 seconds without an update. Claude sessions are
unaffected.

Only loopback clients with the token can submit a snapshot. The endpoint rejects
bodies over 256 KiB, more than 100 sessions, duplicate IDs, IDs outside the
`codex:` namespace, unsupported statuses, and extra fields. The accepted
statuses are `busy`, `waiting`, and `idle`; `activity` may be `null`.
Prompt, tool input, and tool output content are not accepted. The optional
`results` array contains at most 32 sanitized commit, push, merge, test or build outcome events. Each
result has a unique tool-call ID so the office counts it once, including across
heartbeat snapshots. `context` is `null` until the CLI transcript contains a
valid token-count event. The hook reads only the latest input-token count and
model context window. At `Stop`, it also checks completed custom shell tool
results in the current turn because Codex does not emit tool hooks for those
calls. Only the result kind, timestamp, and tool-call ID are forwarded; command
and output text stay in the hook process. Invalid requests leave
the last valid snapshot intact.
The optional `compacts` array contains up to three recent compactions with
token counts before and after each one.
When `PreCompact` and `PostCompact` hooks are available, the adapter instead
uses them to identify the compaction. It records the pre-compaction token count
and waits for a lower count in a later transcript usage record before publishing
the event. The `SessionStart` path remains a fallback for older Codex versions.
