// Shop actions. Live mode talks to the server; demo mode keeps the office in
// memory with the same rules, earning coins from the fake sessions.

import { initialState, publicView, runAction, tick } from '../shared/office-rules.js';

export function createOfficeApi({ demo, onState }) {
  if (demo) {
    const state = initialState();
    state.coins = 20000;
    let sessions = [];
    const timer = setInterval(() => {
      if (tick(state, sessions, 1)) onState(publicView(state));
    }, 1000);
    onState(publicView(state));
    return {
      setSessions: (list) => (sessions = list),
      act: async (action, payload) => {
        const result = runAction(state, action, payload);
        if (result.ok) onState(result.office);
        return result;
      },
      dispose: () => clearInterval(timer),
    };
  }

  return {
    setSessions: () => {},
    act: async (action, payload) => {
      try {
        const res = await fetch(`/api/office/${action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload ?? {}),
        });
        const result = await res.json();
        if (result.ok) onState(result.office);
        return result;
      } catch {
        return { ok: false, error: 'Server neodpovídá' };
      }
    },
    dispose: () => {},
  };
}
