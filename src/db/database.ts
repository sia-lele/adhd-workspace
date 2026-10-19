// ============================================================
// IndexedDB 持久层（原生封装，无第三方依赖）
// 存储：sops / templates / instances / prefs(单例) / lowEnergy
// 要求：刷新不丢失、关闭浏览器不丢失、可导出/导入 JSON
// ============================================================

import type {
  Sop,
  TaskTemplate,
  TaskInstance,
  UserPreferences,
  LowEnergyState,
  PointsState,
} from '../types';

const DB_NAME = 'adhd-executive-workspace';
const DB_VERSION = 2;

const STORES = ['sops', 'templates', 'instances', 'prefs', 'lowEnergy', 'points'] as const;
export type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) {
          const store = db.createObjectStore(s, { keyPath: 'id' });
          if (s === 'instances') {
            // 用于按日期查询
            store.createIndex('byDate', 'localDate', { unique: false });
            store.createIndex('byTemplate', 'templateId', { unique: false });
          }
          if (s === 'templates') {
            store.createIndex('bySop', 'sopId', { unique: false });
          }
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(
  store: StoreName,
  mode: IDBTransactionMode,
): Promise<IDBObjectStore> {
  const db = await openDB();
  return db.transaction(store, mode).objectStore(store);
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const os = await tx(store, 'readonly');
  return new Promise((resolve, reject) => {
    const req = os.getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

export async function getOne<T>(store: StoreName, id: string): Promise<T | undefined> {
  const os = await tx(store, 'readonly');
  return new Promise((resolve, reject) => {
    const req = os.get(id);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function put<T>(store: StoreName, item: T): Promise<void> {
  const os = await tx(store, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = os.put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function bulkPut<T>(store: StoreName, items: T[]): Promise<void> {
  if (items.length === 0) return;
  const os = await tx(store, 'readwrite');
  return new Promise((resolve, reject) => {
    let i = 0;
    const next = () => {
      if (i >= items.length) {
        os.transaction.oncomplete = () => resolve();
        return;
      }
      const req = os.put(items[i++]);
      req.onerror = () => reject(req.error);
      req.onsuccess = next;
    };
    next();
  });
}

export async function del(store: StoreName, id: string): Promise<void> {
  const os = await tx(store, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = os.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clearStore(store: StoreName): Promise<void> {
  const os = await tx(store, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = os.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ---- 业务便捷封装 ----

export const sopDB = {
  all: () => getAll<Sop>('sops'),
  put: (s: Sop) => put('sops', s),
  bulkPut: (ss: Sop[]) => bulkPut('sops', ss),
  del: (id: string) => del('sops', id),
};
export const templateDB = {
  all: () => getAll<TaskTemplate>('templates'),
  put: (t: TaskTemplate) => put('templates', t),
  bulkPut: (ts: TaskTemplate[]) => bulkPut('templates', ts),
  del: (id: string) => del('templates', id),
};
export const instanceDB = {
  all: () => getAll<TaskInstance>('instances'),
  put: (t: TaskInstance) => put('instances', t),
  bulkPut: (ts: TaskInstance[]) => bulkPut('instances', ts),
  del: (id: string) => del('instances', id),
};
export const prefsDB = {
  get: () => getOne<UserPreferences>('prefs', 'prefs'),
  put: (p: UserPreferences) => put('prefs', p),
};
export const lowEnergyDB = {
  all: () => getAll<LowEnergyState>('lowEnergy'),
  put: (s: LowEnergyState) => put('lowEnergy', s),
  del: (id: string) => del('lowEnergy', id),
};
export const pointsDB = {
  get: () => getOne<PointsState>('points', 'main'),
  put: (p: PointsState) => put('points', p),
};

/** 导出全部数据为 JSON 字符串 */
export async function exportAll(): Promise<string> {
  const [sops, templates, instances, prefs, lowEnergy, points] = await Promise.all([
    sopDB.all(),
    templateDB.all(),
    instanceDB.all(),
    prefsDB.get(),
    lowEnergyDB.all(),
    pointsDB.get(),
  ]);
  return JSON.stringify({ version: 2, sops, templates, instances, prefs, lowEnergy, points }, null, 2);
}

/** 导入数据（覆盖式合并：按 id 写入） */
export async function importAll(json: string): Promise<void> {
  const data = JSON.parse(json);
  if (data.sops) await bulkPut('sops', data.sops);
  if (data.templates) await bulkPut('templates', data.templates);
  if (data.instances) await bulkPut('instances', data.instances);
  if (data.prefs) await prefsDB.put(data.prefs);
  if (data.lowEnergy) await bulkPut('lowEnergy', data.lowEnergy);
  if (data.points) await pointsDB.put(data.points);
}
