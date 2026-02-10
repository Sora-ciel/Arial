import { writable } from 'svelte/store';

const MAX_LOGS = 120;

function createSyncDebugStore() {
  const { subscribe, update, set } = writable([]);

  function push(entry) {
    update(items => {
      const next = [...items, { id: crypto.randomUUID(), ts: Date.now(), ...entry }];
      if (next.length > MAX_LOGS) {
        return next.slice(next.length - MAX_LOGS);
      }
      return next;
    });
  }

  return {
    subscribe,
    reset: () => set([]),
    logInfo: (step, detail = '') => push({ level: 'info', step, detail }),
    logSuccess: (step, detail = '') => push({ level: 'success', step, detail }),
    logError: (step, detail = '') => push({ level: 'error', step, detail })
  };
}

export const syncDebugLog = createSyncDebugStore();
