// Bilibili Quality Filter - Background Service Worker
// Handles message routing, cross-tab sync, and settings management

import { blocklistManager, getSettings, saveSettings } from '../storage/blocklist-manager.js';

// Service Worker State
const state = {
  settings: null,
  isInitialized: false
};

/**
 * Initialize service worker
 */
async function initialize() {
  if (state.isInitialized) return;

  try {
    // Initialize blocklist manager
    await blocklistManager.init();

    // Load settings
    state.settings = await getSettings();

    // Setup alarm for periodic cleanup
    chrome.alarms.create('cleanup', { periodInMinutes: 60 });

    state.isInitialized = true;
    console.log('[BQF] Service Worker initialized');
  } catch (error) {
    console.error('[BQF] Service Worker initialization failed:', error);
  }
}

/**
 * Message handler
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Ensure initialized
  initialize();

  const { type } = message;

  switch (type) {
    case 'GET_SETTINGS':
      handleGetSettings(sendResponse);
      break;

    case 'UPDATE_SETTINGS':
      handleUpdateSettings(message.settings, sendResponse);
      break;

    case 'USER_BLOCKED':
      handleUserBlocked(message.uid, message.username, sender);
      sendResponse({ success: true });
      break;

    case 'GET_BLOCKLIST':
      handleGetBlocklist(sendResponse);
      break;

    case 'ADD_KEYWORD':
      handleAddKeyword(message.keyword, message.category, message.weight, sendResponse);
      break;

    case 'REMOVE_KEYWORD':
      handleRemoveKeyword(message.id, sendResponse);
      break;

    case 'EXPORT_DATA':
      handleExportData(sendResponse);
      break;

    case 'IMPORT_DATA':
      handleImportData(message.data, sendResponse);
      break;

    case 'CLEAR_ALL':
      handleClearAll(sendResponse);
      break;

    case 'GET_STATS':
      handleGetStats(sendResponse);
      break;

    default:
      sendResponse({ error: 'Unknown message type' });
  }

  // Return true to indicate async response
  return true;
});

/**
 * Handle GET_SETTINGS request
 */
async function handleGetSettings(sendResponse) {
  try {
    const settings = await getSettings();
    sendResponse({ success: true, settings });
  } catch (error) {
    console.error('[BQF] Failed to get settings:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * Handle UPDATE_SETTINGS request
 */
async function handleUpdateSettings(newSettings, sendResponse) {
  try {
    const mergedSettings = { ...state.settings, ...newSettings };
    await saveSettings(mergedSettings);
    state.settings = mergedSettings;

    // Broadcast to all tabs
    broadcastToAllTabs({
      type: 'SETTINGS_UPDATED',
      settings: mergedSettings
    });

    sendResponse({ success: true, settings: mergedSettings });
  } catch (error) {
    console.error('[BQF] Failed to update settings:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * Handle USER_BLOCKED event
 */
async function handleUserBlocked(uid, username, sender) {
  try {
    // Block the user
    await blocklistManager.blockUser(uid, username, 'manual');

    // Broadcast to all tabs except sender
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id !== sender.tab?.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'USER_BLOCKED',
          uid,
          username
        }).catch(() => {
          // Ignore errors for tabs that don't have content script
        });
      }
    }

    console.log(`[BQF] User blocked: ${username} (${uid})`);
  } catch (error) {
    console.error('[BQF] Failed to block user:', error);
  }
}

/**
 * Handle GET_BLOCKLIST request
 */
async function handleGetBlocklist(sendResponse) {
  try {
    const users = await blocklistManager.getBlockedUsers();
    sendResponse({ success: true, users });
  } catch (error) {
    console.error('[BQF] Failed to get blocklist:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * Handle ADD_KEYWORD request
 */
async function handleAddKeyword(keyword, category, weight, sendResponse) {
  try {
    const id = await blocklistManager.addKeyword(keyword, category, weight);

    // Refresh keywords in all tabs
    broadcastToAllTabs({ type: 'REFRESH_DATA' });

    sendResponse({ success: true, id });
  } catch (error) {
    console.error('[BQF] Failed to add keyword:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * Handle REMOVE_KEYWORD request
 */
async function handleRemoveKeyword(id, sendResponse) {
  try {
    await blocklistManager.removeKeyword(id);

    // Refresh keywords in all tabs
    broadcastToAllTabs({ type: 'REFRESH_DATA' });

    sendResponse({ success: true });
  } catch (error) {
    console.error('[BQF] Failed to remove keyword:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * Handle EXPORT_DATA request
 */
async function handleExportData(sendResponse) {
  try {
    const data = await blocklistManager.exportData();
    sendResponse({ success: true, data });
  } catch (error) {
    console.error('[BQF] Failed to export data:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * Handle IMPORT_DATA request
 */
async function handleImportData(data, sendResponse) {
  try {
    await blocklistManager.importData(data);

    // Refresh all tabs
    broadcastToAllTabs({ type: 'REFRESH_DATA' });

    sendResponse({ success: true });
  } catch (error) {
    console.error('[BQF] Failed to import data:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * Handle CLEAR_ALL request
 */
async function handleClearAll(sendResponse) {
  try {
    await blocklistManager.clearAll();

    // Refresh all tabs
    broadcastToAllTabs({ type: 'REFRESH_DATA' });

    sendResponse({ success: true });
  } catch (error) {
    console.error('[BQF] Failed to clear all data:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * Handle GET_STATS request
 */
async function handleGetStats(sendResponse) {
  try {
    const [keywords, users, allKeywords] = await Promise.all([
      blocklistManager.getKeywordsByCategory(),
      blocklistManager.getBlockedUsers(),
      blocklistManager.getAllKeywords()
    ]);

    const stats = {
      totalKeywords: allKeywords.length,
      keywordsByCategory: {
        rageBait: keywords.rageBait?.length || 0,
        clickbait: keywords.clickbait?.length || 0,
        homogenized: keywords.homogenized?.length || 0
      },
      blockedUsers: users.length
    };

    sendResponse({ success: true, stats });
  } catch (error) {
    console.error('[BQF] Failed to get stats:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * Broadcast message to all Bilibili tabs
 */
async function broadcastToAllTabs(message) {
  const tabs = await chrome.tabs.query({
    url: ['https://bilibili.com/*', 'https://*.bilibili.com/*']
  });

  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, message).catch(() => {
      // Ignore errors for tabs that don't have content script
    });
  }
}

/**
 * Alarm handler for periodic tasks
 */
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cleanup') {
    performCleanup();
  }
});

/**
 * Perform periodic cleanup
 */
async function performCleanup() {
  try {
    // Clear caches to free memory
    blocklistManager._keywordCache = null;
    blocklistManager._blockedUsersCache = null;

    console.log('[BQF] Periodic cleanup completed');
  } catch (error) {
    console.error('[BQF] Cleanup failed:', error);
  }
}

/**
 * Handle installation/update
 */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[BQF] Extension installed');
    // Set default settings
    saveSettings({
      enabled: true,
      filterRageBait: true,
      filterClickbait: true,
      filterHomogenized: true,
      filterComments: true,
      dimInsteadOfHide: false,
      autoCollapseComments: true,
      showBlockUserButton: true
    });
  } else if (details.reason === 'update') {
    console.log(`[BQF] Extension updated from ${details.previousVersion}`);
  }

  // Initialize
  initialize();
});

// Initialize on startup
initialize();
