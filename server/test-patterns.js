// Shared test-result patterns for Claude transcript parsing and Codex hooks.
export const TEST_COMMAND = /\b((npm|pnpm|yarn|bun)( run)? test|node\s+(?:--test\b|--run\s+test\b)|vitest|jest|pytest|phpunit|pest|go test|cargo test|rspec|mocha|artisan test|composer test|dotnet test|tox|make (test|check))\b|(?:^|[\s;"'])\.?\/gradlew?\s+[^\n;]*\btest\b|\bmvn\s+[^\n;]*\btest\b/i;
export const TEST_FAILED = /(\b[1-9]\d* (failed|failing|failures?|errors?)\b|FAILURES!|ERRORS!|Tests:.*\bfailed|✗|FAIL\b)/;
