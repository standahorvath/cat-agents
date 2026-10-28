// Fake sessions for /?demo. Each session cycles through a script of states so all
// the cat behaviours show up within a few minutes.

const TOOLS = {
  shell: { name: 'Bash', category: 'shell', detail: 'npm test' },
  write: { name: 'Edit', category: 'write', detail: 'App.jsx' },
  read: { name: 'Grep', category: 'read', detail: 'useEffect' },
  web: { name: 'WebFetch', category: 'web', detail: 'developer.mozilla.org' },
  agent: { name: 'Agent', category: 'agent', detail: 'Prozkoumat API' },
  mcp: { name: 'query-docs', category: 'mcp', detail: 'react' },
  think: { name: null, category: 'think', detail: '' },
};

// [status, tool, seconds]
const SCRIPTS = [
  [['busy', 'shell', 25], ['busy', 'write', 20], ['idle', null, 40]],
  [['busy', 'write', 30], ['busy', 'think', 10], ['busy', 'read', 25]],
  [['idle', null, 60], ['busy', 'web', 25]],
  [['busy', 'agent', 35], ['busy', 'shell', 20]],
  [['busy', 'mcp', 20], ['waiting', null, 15], ['busy', 'shell', 20]],
  [['idle', null, 90]],
  [['busy', 'think', 15], ['busy', 'write', 25], ['idle', null, 30]],
];
const PROJECTS = ['eshop', 'web', 'api', 'docs', 'infra', 'legacy', 'mobil'];
const RESULTS = ['testsPass', 'commit', 'testsFail', 'push', 'build', 'error', 'merge', 'install', 'deploy', 'buildFail', 'lint', 'revert', 'slow'];

const VARIANTS = {
  idle: SCRIPTS.map(() => [['idle', null, 9999]]),
  work: SCRIPTS.map((_, i) => [['busy', ['shell', 'write', 'read', 'web', 'agent', 'mcp', 'think'][i], 9999]]),
};

export function startDemo(onSnapshot, variant = '') {
  const scripts = VARIANTS[variant] ?? SCRIPTS;
  const started = Date.now();
  const offsets = scripts.map((_, i) => i * 7);
  let tick = 0;
  const emit = () => {
    tick++;
    const now = Date.now();
    const elapsed = (now - started) / 1000;
    const sessions = scripts.map((script, i) => {
      const total = script.reduce((s, step) => s + step[2], 0);
      let tt = (elapsed + offsets[i]) % total;
      let step = script[0];
      for (const st of script) {
        if (tt < st[2]) {
          step = st;
          break;
        }
        tt -= st[2];
      }
      const [status, toolKey] = step;
      const tool = toolKey ? TOOLS[toolKey] : null;
      const kittens = toolKey === 'agent' ? 3 : i === 1 ? 1 : 0;
      // The context fills up and gets compacted; the first cat does it every minute.
      const period = i === 0 ? 60 : 240 + i * 30;
      const phase = elapsed / period + i * 0.13;
      const fill = (phase % 1) * 0.9;
      const cycle = Math.floor(phase);
      return {
        id: `demo-session-${i}`,
        pid: 1000 + i,
        name: `${PROJECTS[i]}-${i}`,
        cwd: `/demo/${PROJECTS[i]}`,
        project: PROJECTS[i],
        entrypoint: i % 2 ? 'claude-vscode' : 'cli',
        status,
        statusSince: now - tt * 1000 - (status === 'idle' ? i * 120000 : 0),
        startedAt: started + i,
        activity: status === 'busy' ? tool : null,
        events: tool && tool.category !== 'think' ? [{ id: `demo-${i}-${Math.floor(tick / 3)}`, ...tool, ts: now }] : [],
        // Every ~15 s a working cat gets a result: tests, a commit or a merge.
        context: { tokens: Math.round(fill * 1e6), window: 1e6, fill },
        compacts: cycle > 0 ? [{ id: `demo-compact-${i}-${cycle}`, ts: now, before: 900_000, after: Math.round(fill * 1e6), trigger: 'auto' }] : [],
        results:
          status === 'busy' && ['shell', 'write'].includes(toolKey)
            ? [{ id: `demo-r-${i}-${Math.floor((tick + i * 5) / 15)}`, kind: RESULTS[(Math.floor((tick + i * 5) / 15) + i) % RESULTS.length], ts: now }]
            : [],
        subagents: Array.from({ length: kittens }, (_, k) => {
          const keys = ['shell', 'read', 'write', 'think'];
          const kt = TOOLS[keys[(k + Math.floor(tick / 6)) % keys.length]];
          return {
            id: `demo-kitten-${i}-${k}`,
            type: 'general-purpose',
            description: `Koťátko ${k + 1}`,
            activity: kt,
            events: [{ id: `demo-k-${i}-${k}-${Math.floor(tick / 4)}`, ...kt, ts: now }],
          };
        }),
      };
    });
    onSnapshot(sessions);
  };
  emit();
  const id = setInterval(emit, 1000);
  return () => clearInterval(id);
}
