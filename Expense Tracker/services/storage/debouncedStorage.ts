import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StateStorage } from 'zustand/middleware';

export function createDebouncedStorage(delayMs = 250): StateStorage {
  const pending = new Map<string, string>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  return {
    getItem: (name) => pending.get(name) ?? AsyncStorage.getItem(name),
    setItem: (name, value) => {
      pending.set(name, value);
      const prior = timers.get(name);
      if (prior) clearTimeout(prior);
      timers.set(name, setTimeout(() => {
        const latest = pending.get(name);
        pending.delete(name);
        timers.delete(name);
        if (latest !== undefined) AsyncStorage.setItem(name, latest).catch(() => undefined);
      }, delayMs));
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
