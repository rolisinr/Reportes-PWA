// =============================================
// DATABASE MANAGER (IndexedDB)
// =============================================

const DB = (function () {
  const DB_NAME = 'ReportesTGA_DB';
  const DB_VERSION = 2;
  const STORES = ['programacion', 'covs_base', 'history', 'custom_tpls', 'pending_sync'];
  let dbInstance = null;

  function init() {
    return new Promise((resolve, reject) => {
      if (dbInstance) return resolve(dbInstance);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      
      req.onupgradeneeded = function (e) {
        const db = e.target.result;
        STORES.forEach(storeName => {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName);
          }
        });
      };
      
      req.onsuccess = function (e) {
        dbInstance = e.target.result;
        resolve(dbInstance);
      };
      
      req.onerror = function (e) {
        console.error('IndexedDB error:', e);
        reject(e);
      };
    });
  }

  async function get(storeName, key) {
    const db = await init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function set(storeName, key, value) {
    const db = await init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function del(storeName, key) {
    const db = await init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function getAll(storeName) {
    const db = await init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      const keysReq = store.getAllKeys();
      req.onsuccess = () => {
        keysReq.onsuccess = () => {
          const map = {};
          keysReq.result.forEach((k, i) => map[k] = req.result[i]);
          resolve(map);
        };
      };
      req.onerror = () => reject(req.error);
    });
  }

  // Migración automática de localStorage a IndexedDB
  async function migrateFromLocalStorage() {
    try {
      // History
      const hist = localStorage.getItem('history');
      if (hist) {
        await set('history', 'items', JSON.parse(hist));
        localStorage.removeItem('history');
      }

      // Custom Templates
      const ctpls = localStorage.getItem('custom_tpls');
      if (ctpls) {
        await set('custom_tpls', 'items', JSON.parse(ctpls));
        localStorage.removeItem('custom_tpls');
      }

      // Programacion (prog_hoy)
      const prog = localStorage.getItem('prog_hoy');
      if (prog) {
        await set('programacion', 'prog_hoy', JSON.parse(prog));
        localStorage.removeItem('prog_hoy');
      }

      // Covs base
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('covs_base_')) {
          const data = localStorage.getItem(key);
          await set('covs_base', key, JSON.parse(data));
          localStorage.removeItem(key);
          i--; // adjust index since we removed an item
        }
      }
    } catch (e) {
      console.error('Error migrating to IndexedDB:', e);
    }
  }

  return { init, get, set, del, getAll, migrateFromLocalStorage };
})();
