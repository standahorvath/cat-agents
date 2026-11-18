// Shared test-result patterns for Claude transcript parsing and Codex hooks.
export const TEST_COMMAND = /\b((npm|pnpm|yarn|bun)( run)? test|node\s+(?:--test\b|--run\s+test\b)|vitest|jest|pytest|phpunit|pest|go test|cargo test|rspec|mocha|artisan test|composer test|dotnet test|tox|make (test|check))\b|(?:^|[\s;"'])\.?\/gradlew?\s+[^\n;]*\btest\b|\bgradle\s+[^\n;]*\btest\b|\b(?:mvn|mvnw)\s+[^\n;]*\btest\b/i;
export const TEST_FAILED = /(\b[1-9]\d* (failed|failing|failures?|errors?)\b|FAILURES!|ERRORS!|Tests:.*\bfailed|✗|FAIL\b)/;
export const BUILD_COMMAND = /\b((npm|pnpm|yarn|bun)( run)? build|vite build|next build|tsc|webpack|cargo build|go build|gradle|dotnet build|docker (compose )?build)\b|\b(?:mvn|mvnw)\b[^\n;]*\b(?:package|install|compile|verify)\b|(?:^|[\s;"'])\.?\/(?:gradlew|mvnw)\s+[^\n;]*(?:\bbuild\b|\bcompile\w*\b|\bpackage\b)|(^|[;&|]\s*)make\b/i;
export const BUILD_FAILED = /\b(error TS\d+|build fail(?:ed|ure)|ERROR in|compilation failed|error\[E\d+\])/i;
