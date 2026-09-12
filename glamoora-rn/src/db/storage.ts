import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const LSKEY = 'glamoora_db_v2';

const webStore = {
  async get(): Promise<string | null> {
    try {
      return (globalThis.localStorage as Storage).getItem(LSKEY);
    } catch {
      return null;
    }
  },
  async set(s: string): Promise<void> {
    try {
      (globalThis.localStorage as Storage).setItem(LSKEY, s);
    } catch {
      /* ignore */
    }
  },
  async del(): Promise<void> {
    try {
      (globalThis.localStorage as Storage).removeItem(LSKEY);
    } catch {
      /* ignore */
    }
  },
};

const backend = Platform.OS === 'web' ? webStore : AsyncStorage;

export async function loadRaw(): Promise<string | null> {
  try {
    return await backend.get();
  } catch {
    return null;
  }
}
export async function saveRaw(s: string): Promise<void> {
  try {
    await backend.set(s);
  } catch {
    /* ignore */
  }
}
export async function clearRaw(): Promise<void> {
  try {
    await backend.del();
  } catch {
    /* ignore */
  }
}
