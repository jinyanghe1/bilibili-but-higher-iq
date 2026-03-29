// Bilibili Quality Filter - Background Service Worker

import {
  blocklistManager,
  getSettings,
  saveSettings
} from '../storage/blocklist-manager.js';
import {
  DEFAULT_SETTINGS,
  STORAGE_KEYS
} from '../utils/constants.js';

const BILIBILI_TAB_URLS = [
  'https://bilibili.com/*',
  'https://*.bilibili.com/*'
];

const state = {
  initialized: false,
  initializingPromise: null,
  settings: { ...DEFAULT_SETTINGS }
};

async function initialize() {
  if (state.initialized) {
    return;
  }

  if (state.initializingPromise) {
    return state.initializingPromise;
  }

  state.initializingPromise = (async () => {
    await blocklistManager.init();
    state.settings = {
      ...DEFAULT_SETTINGS,
      ...(await getSettings())
    };
    state.initialized = true;
    console.log('[BQF] Service worker initialized');
  })().catch((error) => {
    console.error('[BQF] Service worker initialization failed:', error);
    throw error;
  }).finally(() => {
    state.initializingPromise = null;
  });

  return state.initializingPromise;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void routeMessage(message, sender)
    .then((response) => {
      sendResponse(response);
    })
    .catch((error) => {
      console.error('[BQF] Message handling failed:', error);
      sendResponse({
        success: false,
        error: error.message
      });
    });

  return true;
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'sync' || !changes[STORAGE_KEYS.SETTINGS]) {
    return;
  }

  state.settings = {
    ...DEFAULT_SETTINGS,
    ...(changes[STORAGE_KEYS.SETTINGS].newValue || {})
  };
});

chrome.runtime.onInstalled.addListener((details) => {
  void handleInstallation(details);
});

chrome.runtime.onStartup?.addListener(() => {
  void initialize();
});

async function routeMessage(message, sender) {
  await initialize();

  switch (message?.type) {
    case 'GET_SETTINGS':
      return handleGetSettings();
    case 'UPDATE_SETTINGS':
      return handleUpdateSettings(message.settings);
    case 'USER_BLOCKED':
      return handleUserBlocked(message.uid, message.username, sender?.tab?.id);
    case 'GET_BLOCKLIST':
      return handleGetBlocklist();
    case 'GET_KEYWORDS':
      return handleGetKeywords();
    case 'ADD_KEYWORD':
      return handleAddKeyword(message.keyword, message.category, message.weight);
    case 'REMOVE_KEYWORD':
      return handleRemoveKeyword(message.id);
    case 'UNBLOCK_USER':
      return handleUnblockUser(message.uid);
    case 'EXPORT_DATA':
      return handleExportData();
    case 'IMPORT_DATA':
      return handleImportData(message.data);
    case 'CLEAR_ALL':
      return handleClearAll();
    case 'GET_STATS':
      return handleGetStats();
    default:
      return {
        success: false,
        error: 'Unknown message type'
      };
  }
}

async function handleInstallation(details) {
  if (details.reason === 'install') {
    await saveSettings({ ...DEFAULT_SETTINGS });
    state.settings = { ...DEFAULT_SETTINGS };
    console.log('[BQF] Extension installed');
  } else if (details.reason === 'update') {
    console.log(`[BQF] Extension updated from ${details.previousVersion}`);
  }

  await initialize();
}

async function handleGetSettings() {
  const settings = await getSettings();
  state.settings = {
    ...DEFAULT_SETTINGS,
    ...settings
  };

  return {
    success: true,
    settings: state.settings
  };
}

async function handleUpdateSettings(newSettings = {}) {
  state.settings = {
    ...DEFAULT_SETTINGS,
    ...state.settings,
    ...newSettings
  };

  await saveSettings(state.settings);
  await broadcastToAllTabs({
    type: 'SETTINGS_UPDATED',
    settings: state.settings
  });

  return {
    success: true,
    settings: state.settings
  };
}

async function handleUserBlocked(uid, username, senderTabId) {
  if (!uid) {
    return {
      success: false,
      error: 'uid is required'
    };
  }

  const normalizedUid = String(uid);
  const safeUsername = username || normalizedUid;
  const alreadyBlocked = await blocklistManager.isUserBlocked(normalizedUid);

  if (!alreadyBlocked) {
    await blocklistManager.blockUser(normalizedUid, safeUsername, 'manual');
  }

  await broadcastToAllTabs({
    type: 'USER_BLOCKED',
    uid: normalizedUid,
    username: safeUsername
  }, senderTabId);

  return { success: true };
}

async function handleGetBlocklist() {
  const users = await blocklistManager.getBlockedUsers();
  return {
    success: true,
    users
  };
}

async function handleGetKeywords() {
  const grouped = {
    rageBait: [],
    clickbait: [],
    homogenized: []
  };

  const keywords = await blocklistManager.getAllKeywords();
  for (const keyword of keywords) {
    if (!grouped[keyword.category]) {
      grouped[keyword.category] = [];
    }

    grouped[keyword.category].push({
      id: keyword.id,
      keyword: keyword.keyword,
      weight: keyword.weight,
      severity: keyword.severity,
      enabled: keyword.enabled
    });
  }

  return {
    success: true,
    keywords: grouped
  };
}

async function handleAddKeyword(keyword, category, weight) {
  const id = await blocklistManager.addKeyword(keyword, category, weight);
  await broadcastToAllTabs({ type: 'REFRESH_DATA' });

  return {
    success: true,
    id
  };
}

async function handleRemoveKeyword(id) {
  await blocklistManager.removeKeyword(id);
  await broadcastToAllTabs({ type: 'REFRESH_DATA' });

  return { success: true };
}

async function handleUnblockUser(uid) {
  if (!uid) {
    return {
      success: false,
      error: 'uid is required'
    };
  }

  await blocklistManager.unblockUser(uid);
  await broadcastToAllTabs({ type: 'REFRESH_DATA' });

  return { success: true };
}

async function handleExportData() {
  const data = await blocklistManager.exportData();
  return {
    success: true,
    data
  };
}

async function handleImportData(data) {
  await blocklistManager.importData(data);
  await broadcastToAllTabs({ type: 'REFRESH_DATA' });

  return { success: true };
}

async function handleClearAll() {
  await blocklistManager.clearAll();
  await broadcastToAllTabs({ type: 'REFRESH_DATA' });

  return { success: true };
}

async function handleGetStats() {
  const [keywords, users] = await Promise.all([
    blocklistManager.getAllKeywords(),
    blocklistManager.getBlockedUsers()
  ]);

  const keywordsByCategory = keywords.reduce((acc, keyword) => {
    acc[keyword.category] = (acc[keyword.category] || 0) + 1;
    return acc;
  }, {
    rageBait: 0,
    clickbait: 0,
    homogenized: 0
  });

  return {
    success: true,
    stats: {
      totalKeywords: keywords.length,
      keywordsByCategory,
      blockedUsers: users.length
    }
  };
}

async function broadcastToAllTabs(message, excludedTabId = null) {
  const tabs = await chrome.tabs.query({ url: BILIBILI_TAB_URLS });

  await Promise.allSettled(
    tabs
      .filter((tab) => tab.id && tab.id !== excludedTabId)
      .map((tab) => chrome.tabs.sendMessage(tab.id, message))
  );
}

void initialize();
