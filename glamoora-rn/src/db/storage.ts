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

/** Normalised key/value adapter — AsyncStorage exposes getItem/setItem/removeItem. */
interface KV {
  get(): Promise<string | null>;
  set(s: string): Promise<void>;
  del(): Promise<void>;
}

const nativeStore: KV = {
  async get() {
    try {
      return await AsyncStorage.getItem(LSKEY);
    } catch {
      return null;
    }
  },
  async set(s: string) {
    try {
      await AsyncStorage.setItem(LSKEY, s);
    } catch {
      /* ignore */
    }
  },
  async del() {
    try {
      await AsyncStorage.removeItem(LSKEY);
    } catch {
      /* ignore */
    }
  },
};

const backend: KV = Platform.OS === 'web' ? webStore : nativeStore;

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
