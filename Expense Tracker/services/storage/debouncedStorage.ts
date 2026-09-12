import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import type { StateStorage } from 'zustand/middleware';

export function createDebouncedStorage(delayMs = 250): StateStorage {
  const pending = new Map<string, string>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  function flush(name: string): void {
    const prior = timers.get(name);
    if (prior) clearTimeout(prior);
    timers.delete(name);
    const latest = pending.get(name);
    pending.delete(name);
    if (latest !== undefined) AsyncStorage.setItem(name, latest).catch(() => undefined);
  }

  // A write buffered here is otherwise lost if the process is killed within
  // the debounce window — background/inactive always precedes termination
  // on both platforms, so flushing everything pending right then closes
  // that gap without giving up the debounce's coalescing during normal use.
  AppState.addEventListener('change', (state) => {
    if (state === 'active') return;
    for (const name of [...pending.keys()]) flush(name);
  });

  return {
    getItem: (name) => pending.get(name) ?? AsyncStorage.getItem(name),
    setItem: (name, value) => {
      pending.set(name, value);
      const prior = timers.get(name);
      if (prior) clearTimeout(prior);
      timers.set(name, setTimeout(() => flush(name), delayMs));
    },
    removeItem: (name) => {
      const prior = timers.get(name);
      if (prior) clearTimeout(prior);
      timers.delete(name);
      pending.delete(name);
      return AsyncStorage.removeItem(name);
    },
  };
}
