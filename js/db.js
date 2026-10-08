// 端末内データベース（IndexedDB）。外部には一切送信しない。
// receipts: 領収書 / images: 画像（Blob） / settings: 設定（1件）

import { CATEGORIES } from './categories.js';

const DB_NAME = 'kakusapo';
const DB_VERSION = 1;
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('receipts')) {
        db.createObjectStore('receipts', { keyPath: 'id' }).createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('images')) db.createObjectStore('images');
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

// stores に対するトランザクションを実行し、fn が返したリクエストの結果を返す
async function run(stores, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    const req = fn(tx);
    let result;
    if (req && 'onsuccess' in req) req.onsuccess = () => { result = req.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const DEFAULT_SETTINGS = {
  filingType: 'blue',
  ratios: Object.fromEntries(CATEGORIES.map((c) => [c.id, c.ratio])),
  vendorMap: {},
  phoneMap: {},
  lastBackupAt: null,
  installGuideDismissed: false
};

export const db = {
  allReceipts: () => run('receipts', 'readonly', (tx) => tx.objectStore('receipts').getAll()),
  getReceipt: (id) => run('receipts', 'readonly', (tx) => tx.objectStore('receipts').get(id)),
  putReceipt: (r) => run('receipts', 'readwrite', (tx) => tx.objectStore('receipts').put(r)),
  getImage: (id) => run('images', 'readonly', (tx) => tx.objectStore('images').get(id)),
  putImage: (id, blob) => run('images', 'readwrite', (tx) => tx.objectStore('images').put(blob, id)),

  deleteReceipt: (r) => run(['receipts', 'images'], 'readwrite', (tx) => {
    tx.objectStore('receipts').delete(r.id);
    if (r.imageId) tx.objectStore('images').delete(r.imageId);
  }),

  async getSettings() {
    const s = await run('settings', 'readonly', (tx) => tx.objectStore('settings').get('settings'));
    return {
      ...DEFAULT_SETTINGS,
      ...(s || {}),
      ratios: { ...DEFAULT_SETTINGS.ratios, ...((s && s.ratios) || {}) },
      vendorMap: { ...((s && s.vendorMap) || {}) },
      phoneMap: { ...((s && s.phoneMap) || {}) }
    };
  },
  saveSettings: (s) => run('settings', 'readwrite', (tx) => tx.objectStore('settings').put(s, 'settings')),

  clearAll: () => run(['receipts', 'images', 'settings'], 'readwrite', (tx) => {
    tx.objectStore('receipts').clear();
    tx.objectStore('images').clear();
    tx.objectStore('settings').clear();
  })
};

// ブラウザにデータを消さないよう依頼する（対応ブラウザのみ）
export async function requestPersist() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch (e) { /* 非対応 */ }
  return false;
}

export function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
