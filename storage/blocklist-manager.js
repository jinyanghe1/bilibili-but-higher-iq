// Bilibili Quality Filter - Blocklist Manager with Dexie.js (IndexedDB)

// Note: This file uses Dexie.js for IndexedDB. In production, include:
// <script src="https://unpkg.com/dexie@3/dist/dexie.min.js"></script>

const DB_NAME = 'BilibiliQualityFilterDB';
const DB_VERSION = 1;

let db = null;

// Initialize database
async function initDB() {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      // Keywords store
      if (!database.objectStoreNames.contains('keywords')) {
        const keywordStore = database.createObjectStore('keywords', {
          keyPath: 'id',
          autoIncrement: true
        });
        keywordStore.createIndex('category', 'category', { unique: false });
        keywordStore.createIndex('keyword', 'keyword', { unique: false });
        keywordStore.createIndex('enabled', 'enabled', { unique: false });
      }

      // User blocklist store
      if (!database.objectStoreNames.contains('userBlocklist')) {
        const userStore = database.createObjectStore('userBlocklist', {
          keyPath: 'id',
          autoIncrement: true
        });
        userStore.createIndex('uid', 'uid', { unique: true });
        userStore.createIndex('username', 'username', { unique: false });
      }

      // Custom keywords store
      if (!database.objectStoreNames.contains('customKeywords')) {
        const customStore = database.createObjectStore('customKeywords', {
          keyPath: 'id',
          autoIncrement: true
        });
        customStore.createIndex('keyword', 'keyword', { unique: true });
        customStore.createIndex('category', 'category', { unique: false });
      }

      // Feedback store
      if (!database.objectStoreNames.contains('feedback')) {
        const feedbackStore = database.createObjectStore('feedback', {
          keyPath: 'id',
          autoIncrement: true
        });
        feedbackStore.createIndex('type', 'type', { unique: false });
        feedbackStore.createIndex('targetId', 'targetId', { unique: false });
        feedbackStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

// Default keyword blocklists
const KEYWORD_BLOCKLISTS = {
  rageBait: {
    name: 'Rage Bait',
    nameZh: '引战内容',
    weight: 0.8,
    severity: 'high',
    keywords: [
      '引战', '撕逼', '对立', '恰烂钱', '恰流量',
      '阴阳怪气', '呵呵', '孝子', '美分', '五毛',
      '脑残', '智障', '废物', '垃圾', '有病',
      '舔狗', '海王', '绿茶', '圣母', '白莲花',
      '杠精', '喷子', '键盘侠', '柠檬精', '酸了'
    ]
  },
  clickbait: {
    name: 'Clickbait',
    nameZh: '标题党',
    weight: 0.6,
    severity: 'medium',
    keywords: [
      '震惊', '必看', '绝了', '绝了绝了', '笑死',
      '哭', '破防', '绷不住', '爆笑', '搞笑',
      '秒了', '碾压', '封神', '天花板', '神作',
      '炸裂', 'YYDS', '绝了绝了', '太牛了', '牛蛙',
      '哭死', '笑抽', '笑崩', '破大防', '绷不住了',
      '太绝了', '这也太', '竟然', '居然', '万万没想到'
    ]
  },
  homogenized: {
    name: 'Homogenized',
    nameZh: '同质化内容',
    weight: 0.7,
    severity: 'high',
    keywords: [
      '搬运', '抄袭', '盗摄', '二创', '转载',
      '素材', '来源', '侵删', '侵权', '盗版',
      '抄袭', '融梗', '洗稿', '抄袭狗', '盗图',
      '二改', '改改', '素材来源', '非原创', '抱走'
    ]
  }
};

// BlocklistManager class
export class BlocklistManager {
  constructor() {
    this.initialized = false;
    this._keywordCache = null;
    this._blockedUsersCache = null;
  }

  async init() {
    if (this.initialized) return;
    await initDB();
    await this.ensureDefaultKeywords();
    this.initialized = true;
  }

  async ensureDefaultKeywords() {
    const count = await this.countKeywords();
    if (count === 0) {
      await this.loadDefaultKeywords();
    }
  }

  async countKeywords() {
    await this.init();
    const database = await initDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('keywords', 'readonly');
      const store = tx.objectStore('keywords');
      const countRequest = store.count();
      countRequest.onsuccess = () => resolve(countRequest.result);
      countRequest.onerror = () => reject(countRequest.error);
    });
  }

  async loadDefaultKeywords() {
    const database = await initDB();
    const tx = database.transaction('keywords', 'readwrite');
    const store = tx.objectStore('keywords');

    for (const [category, config] of Object.entries(KEYWORD_BLOCKLISTS)) {
      for (const keyword of config.keywords) {
        store.add({
          category,
          keyword,
          weight: config.weight,
          severity: config.severity,
          enabled: true
        });
      }
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getKeywordsByCategory() {
    await this.init();
    this._keywordCache = null;

    const database = await initDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('keywords', 'readonly');
      const store = tx.objectStore('keywords');
      const index = store.index('enabled');
      const request = index.getAll(1);

      request.onsuccess = () => {
        const keywords = request.result;
        const grouped = {};

        for (const kw of keywords) {
          if (!grouped[kw.category]) {
            grouped[kw.category] = [];
          }
          grouped[kw.category].push({
            keyword: kw.keyword,
            weight: kw.weight,
            severity: kw.severity
          });
        }

        resolve(grouped);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getAllKeywords() {
    await this.init();

    if (this._keywordCache) {
      return this._keywordCache;
    }

    const database = await initDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('keywords', 'readonly');
      const store = tx.objectStore('keywords');
      const index = store.index('enabled');
      const request = index.getAll(1);

      request.onsuccess = () => {
        this._keywordCache = request.result;
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async addKeyword(keyword, category, weight = 0.5) {
    await this.init();
    this._keywordCache = null;

    const database = await initDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('keywords', 'readwrite');
      const store = tx.objectStore('keywords');
      const request = store.add({
        category,
        keyword,
        weight,
        severity: weight > 0.6 ? 'high' : weight > 0.4 ? 'medium' : 'low',
        enabled: true
      });

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async removeKeyword(id) {
    await this.init();
    this._keywordCache = null;

    const database = await initDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('keywords', 'readwrite');
      const store = tx.objectStore('keywords');
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async blockUser(uid, username, reason = 'manual') {
    await this.init();
    this._blockedUsersCache = null;

    const database = await initDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('userBlocklist', 'readwrite');
      const store = tx.objectStore('userBlocklist');
      const request = store.add({
        uid: String(uid),
        username,
        reason,
        timestamp: Date.now()
      });

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async unblockUser(uid) {
    await this.init();
    this._blockedUsersCache = null;

    const database = await initDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('userBlocklist', 'readwrite');
      const store = tx.objectStore('userBlocklist');
      const index = store.index('uid');
      const request = index.openCursor(IDBKeyRange.only(String(uid)));

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
        }
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async isUserBlocked(uid) {
    await this.init();

    const blockedUsers = await this.getBlockedUsers();
    return blockedUsers.some(u => u.uid === String(uid));
  }

  async getBlockedUsers() {
    await this.init();

    if (this._blockedUsersCache) {
      return this._blockedUsersCache;
    }

    const database = await initDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('userBlocklist', 'readonly');
      const store = tx.objectStore('userBlocklist');
      const request = store.getAll();

      request.onsuccess = () => {
        this._blockedUsersCache = request.result;
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getBlockedUIDSet() {
    const users = await this.getBlockedUsers();
    return new Set(users.map(u => u.uid));
  }

  async addFeedback(type, targetId, action) {
    await this.init();

    const database = await initDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('feedback', 'readwrite');
      const store = tx.objectStore('feedback');
      const request = store.add({
        type,
        targetId,
        action,
        timestamp: Date.now()
      });

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async exportData() {
    await this.init();

    const database = await initDB();

    const [keywords, userBlocklist] = await Promise.all([
      this._getAllFromStore('keywords'),
      this._getAllFromStore('userBlocklist')
    ]);

    return {
      version: '0.1.0',
      exportDate: new Date().toISOString(),
      keywords,
      userBlocklist
    };
  }

  async _getAllFromStore(storeName) {
    const database = await initDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async importData(data) {
    await this.init();

    if (data.keywords) {
      await this._clearStore('keywords');
      await this._bulkAdd('keywords', data.keywords);
    }

    if (data.userBlocklist) {
      await this._clearStore('userBlocklist');
      await this._bulkAdd('userBlocklist', data.userBlocklist);
    }

    this._keywordCache = null;
    this._blockedUsersCache = null;
  }

  async _clearStore(storeName) {
    const database = await initDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async _bulkAdd(storeName, items) {
    const database = await initDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);

      for (const item of items) {
        store.add(item);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async clearAll() {
    await this.init();

    await Promise.all([
      this._clearStore('keywords'),
      this._clearStore('userBlocklist'),
      this._clearStore('feedback')
    ]);

    await this.loadDefaultKeywords();
    this._keywordCache = null;
    this._blockedUsersCache = null;
  }
}

// Default settings
const DEFAULT_SETTINGS = {
  enabled: true,
  filterRageBait: true,
  filterClickbait: true,
  filterHomogenized: true,
  filterComments: true,
  dimInsteadOfHide: false,
  autoCollapseComments: true,
  showBlockUserButton: true
};

// Get settings from chrome.storage
export async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get('settings', (result) => {
      resolve(result.settings || DEFAULT_SETTINGS);
    });
  });
}

// Save settings to chrome.storage
export async function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ settings }, resolve);
  });
}

// Singleton instance
export const blocklistManager = new BlocklistManager();

// Initialize on module load
blocklistManager.init().catch(console.error);
