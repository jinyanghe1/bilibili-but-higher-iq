// Bilibili Quality Filter - Options Page Script

import { DEFAULT_SETTINGS } from '../../utils/constants.js';

// DOM Elements
const elements = {
  // General
  enabled: document.getElementById('enabled'),
  dimInsteadOfHide: document.getElementById('dimInsteadOfHide'),
  autoCollapseComments: document.getElementById('autoCollapseComments'),
  showBlockUserButton: document.getElementById('showBlockUserButton'),
  // Filters
  filterRageBait: document.getElementById('filterRageBait'),
  filterClickbait: document.getElementById('filterClickbait'),
  filterHomogenized: document.getElementById('filterHomogenized'),
  filterComments: document.getElementById('filterComments'),
  // Comment filter mode
  modeBlocklist: document.getElementById('modeBlocklist'),
  modeAllowlist: document.getElementById('modeAllowlist'),
  // Blocklist intensity
  intensitySetting: document.getElementById('intensitySetting'),
  intensitySimple: document.getElementById('intensitySimple'),
  intensityMild: document.getElementById('intensityMild'),
  intensityRadical: document.getElementById('intensityRadical'),
  // ML
  enableMLSentiment: document.getElementById('enableMLSentiment'),
  // Keywords
  newKeyword: document.getElementById('newKeyword'),
  keywordCategory: document.getElementById('keywordCategory'),
  addKeywordBtn: document.getElementById('addKeywordBtn'),
  keywordsList: document.getElementById('keywordsList'),
  // Blocklist
  blockedCount: document.getElementById('blockedCount'),
  blocklistContainer: document.getElementById('blocklistContainer'),
  // Data
  exportBtn: document.getElementById('exportBtn'),
  importBtn: document.getElementById('importBtn'),
  importFile: document.getElementById('importFile'),
  clearAllBtn: document.getElementById('clearAllBtn'),
  // Stats
  statKeywords: document.getElementById('statKeywords'),
  statBlocked: document.getElementById('statBlocked'),
  // Toast
  toast: document.getElementById('toast'),
  toastMessage: document.getElementById('toastMessage')
};

// Current state
let currentCategory = 'rageBait';

/**
 * Initialize options page
 */
async function init() {
  await loadSettings();
  await loadStats();
  await loadKeywords();
  await loadBlocklist();
  setupEventListeners();
  localizeUI();
}

/**
 * Load settings from storage
 */
async function loadSettings() {
  try {
    const result = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    if (result.success) {
      const settings = { ...DEFAULT_SETTINGS, ...result.settings };
      updateSettingsUI(settings);
    }
  } catch (error) {
    console.error('[BQF] Failed to load settings:', error);
    updateSettingsUI(DEFAULT_SETTINGS);
  }
}

/**
 * Update settings UI
 */
function updateSettingsUI(settings) {
  if (elements.enabled) elements.enabled.checked = settings.enabled;
  if (elements.dimInsteadOfHide) elements.dimInsteadOfHide.checked = settings.dimInsteadOfHide;
  if (elements.autoCollapseComments) elements.autoCollapseComments.checked = settings.autoCollapseComments;
  if (elements.showBlockUserButton) elements.showBlockUserButton.checked = settings.showBlockUserButton;
  if (elements.filterRageBait) elements.filterRageBait.checked = settings.filterRageBait;
  if (elements.filterClickbait) elements.filterClickbait.checked = settings.filterClickbait;
  if (elements.filterHomogenized) elements.filterHomogenized.checked = settings.filterHomogenized;
  if (elements.filterComments) elements.filterComments.checked = settings.filterComments;

  // Comment filter mode
  const mode = settings.commentFilterMode || 'blocklist';
  if (elements.modeBlocklist) elements.modeBlocklist.checked = mode === 'blocklist';
  if (elements.modeAllowlist) elements.modeAllowlist.checked = mode === 'allowlist';
  updateIntensityVisibility(mode);

  // Blocklist intensity
  const intensity = settings.blocklistIntensity || 'mild';
  if (elements.intensitySimple) elements.intensitySimple.checked = intensity === 'simple';
  if (elements.intensityMild) elements.intensityMild.checked = intensity === 'mild';
  if (elements.intensityRadical) elements.intensityRadical.checked = intensity === 'radical';

  // ML sentiment
  if (elements.enableMLSentiment) elements.enableMLSentiment.checked = settings.enableMLSentiment;
}

/**
 * Update intensity selector visibility based on mode
 */
function updateIntensityVisibility(mode) {
  if (elements.intensitySetting) {
    elements.intensitySetting.style.display = mode === 'blocklist' ? 'block' : 'none';
  }
}

/**
 * Save settings to storage
 */
async function saveSettings() {
  const commentFilterMode = elements.modeBlocklist?.checked ? 'blocklist' : 'allowlist';
  const blocklistIntensity = elements.intensitySimple?.checked ? 'simple' :
                             elements.intensityRadical?.checked ? 'radical' : 'mild';

  const settings = {
    enabled: elements.enabled?.checked ?? true,
    filterRageBait: elements.filterRageBait?.checked ?? true,
    filterClickbait: elements.filterClickbait?.checked ?? true,
    filterHomogenized: elements.filterHomogenized?.checked ?? true,
    filterComments: elements.filterComments?.checked ?? true,
    dimInsteadOfHide: elements.dimInsteadOfHide?.checked ?? false,
    autoCollapseComments: elements.autoCollapseComments?.checked ?? true,
    showBlockUserButton: elements.showBlockUserButton?.checked ?? true,
    commentFilterMode,
    blocklistIntensity,
    enableMLSentiment: elements.enableMLSentiment?.checked ?? false
  };

  try {
    await chrome.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings
    });
    showToast('Settings saved!', 'success');
  } catch (error) {
    console.error('[BQF] Failed to save settings:', error);
    showToast('Failed to save settings', 'error');
  }
}

/**
 * Load statistics
 */
async function loadStats() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATS' });
    if (response.success) {
      if (elements.statKeywords) elements.statKeywords.textContent = response.stats.totalKeywords;
      if (elements.statBlocked) elements.statBlocked.textContent = response.stats.blockedUsers;
      if (elements.blockedCount) elements.blockedCount.textContent = response.stats.blockedUsers;
    }
  } catch (error) {
    console.error('[BQF] Failed to load stats:', error);
  }
}

/**
 * Load keywords
 */
async function loadKeywords() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_KEYWORDS' });
    if (response.success) {
      renderKeywords(response.keywords);
    }
  } catch (error) {
    console.error('[BQF] Failed to load keywords:', error);
  }
}

/**
 * Render keywords list
 */
function renderKeywords(keywords) {
  if (!elements.keywordsList) return;

  const categoryKeywords = keywords[currentCategory] || [];
  
  if (categoryKeywords.length === 0) {
    elements.keywordsList.innerHTML = '<p class="empty-state">No keywords in this category</p>';
    return;
  }

  elements.keywordsList.innerHTML = categoryKeywords.map(kw => `
    <div class="keyword-tag" data-id="${kw.id}">
      <span>${escapeHtml(kw.keyword)}</span>
      <span class="remove" data-id="${kw.id}">&times;</span>
    </div>
  `).join('');
}

/**
 * Add new keyword
 */
async function addKeyword() {
  const keyword = elements.newKeyword?.value.trim();
  const category = elements.keywordCategory?.value || 'rageBait';

  if (!keyword) {
    showToast('Please enter a keyword', 'error');
    return;
  }

  try {
    await chrome.runtime.sendMessage({
      type: 'ADD_KEYWORD',
      keyword,
      category,
      weight: 0.5
    });

    elements.newKeyword.value = '';
    await loadKeywords();
    await loadStats();
    showToast('Keyword added!', 'success');
  } catch (error) {
    console.error('[BQF] Failed to add keyword:', error);
    showToast('Failed to add keyword', 'error');
  }
}

/**
 * Remove keyword
 */
async function removeKeyword(id) {
  try {
    await chrome.runtime.sendMessage({
      type: 'REMOVE_KEYWORD',
      id
    });

    await loadKeywords();
    await loadStats();
    showToast('Keyword removed!', 'success');
  } catch (error) {
    console.error('[BQF] Failed to remove keyword:', error);
    showToast('Failed to remove keyword', 'error');
  }
}

/**
 * Load blocked users
 */
async function loadBlocklist() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_BLOCKLIST' });
    if (response.success) {
      renderBlocklist(response.users);
    }
  } catch (error) {
    console.error('[BQF] Failed to load blocklist:', error);
  }
}

/**
 * Render blocklist
 */
function renderBlocklist(users) {
  if (!elements.blocklistContainer) return;

  if (users.length === 0) {
    elements.blocklistContainer.innerHTML = '<p class="empty-state">No blocked users</p>';
    return;
  }

  elements.blocklistContainer.innerHTML = users.map(user => `
    <div class="blocked-user" data-uid="${escapeHtml(user.uid)}">
      <div class="blocked-user-info">
        <span class="blocked-user-name">${escapeHtml(user.username)}</span>
        <span class="blocked-user-uid">UID: ${escapeHtml(user.uid)}</span>
      </div>
      <button class="btn btn-secondary unblock-btn" data-uid="${escapeHtml(user.uid)}">Unblock</button>
    </div>
  `).join('');
}

/**
 * Unblock user
 */
async function unblockUser(uid) {
  try {
    await chrome.runtime.sendMessage({
      type: 'UNBLOCK_USER',
      uid
    });

    await loadBlocklist();
    await loadStats();
    showToast('User unblocked!', 'success');
  } catch (error) {
    console.error('[BQF] Failed to unblock user:', error);
    showToast('Failed to unblock user', 'error');
  }
}

/**
 * Export data
 */
async function exportData() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'EXPORT_DATA' });
    if (response.success) {
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bqf-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Data exported!', 'success');
    }
  } catch (error) {
    console.error('[BQF] Failed to export data:', error);
    showToast('Failed to export data', 'error');
  }
}

/**
 * Import data
 */
async function importData(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    
    await chrome.runtime.sendMessage({
      type: 'IMPORT_DATA',
      data
    });

    await loadSettings();
    await loadKeywords();
    await loadBlocklist();
    await loadStats();
    showToast('Data imported!', 'success');
  } catch (error) {
    console.error('[BQF] Failed to import data:', error);
    showToast('Failed to import data', 'error');
  }
}

/**
 * Clear all data
 */
async function clearAll() {
  if (!confirm('Are you sure you want to clear all data? This cannot be undone.')) {
    return;
  }

  try {
    await chrome.runtime.sendMessage({ type: 'CLEAR_ALL' });
    await loadSettings();
    await loadKeywords();
    await loadBlocklist();
    await loadStats();
    showToast('All data cleared!', 'success');
  } catch (error) {
    console.error('[BQF] Failed to clear data:', error);
    showToast('Failed to clear data', 'error');
  }
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
  if (!elements.toast || !elements.toastMessage) return;
  
  elements.toastMessage.textContent = message;
  elements.toast.className = `toast show ${type}`;
  
  setTimeout(() => {
    elements.toast.className = 'toast';
  }, 3000);
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Localize UI
 */
function localizeUI() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const message = chrome.i18n.getMessage(key);
    if (message) {
      el.textContent = message;
    }
  });
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Settings changes
  const settingsInputs = [
    elements.enabled,
    elements.dimInsteadOfHide,
    elements.autoCollapseComments,
    elements.showBlockUserButton,
    elements.filterRageBait,
    elements.filterClickbait,
    elements.filterHomogenized,
    elements.filterComments,
    elements.enableMLSentiment
  ];

  settingsInputs.forEach(input => {
    if (input) {
      input.addEventListener('change', saveSettings);
    }
  });

  // Comment filter mode changes
  if (elements.modeBlocklist) {
    elements.modeBlocklist.addEventListener('change', () => {
      if (elements.modeBlocklist.checked) {
        updateIntensityVisibility('blocklist');
        saveSettings();
      }
    });
  }
  if (elements.modeAllowlist) {
    elements.modeAllowlist.addEventListener('change', () => {
      if (elements.modeAllowlist.checked) {
        updateIntensityVisibility('allowlist');
        saveSettings();
      }
    });
  }

  // Blocklist intensity changes
  [elements.intensitySimple, elements.intensityMild, elements.intensityRadical].forEach(input => {
    if (input) {
      input.addEventListener('change', saveSettings);
    }
  });

  // Add keyword
  if (elements.addKeywordBtn) {
    elements.addKeywordBtn.addEventListener('click', addKeyword);
  }
  if (elements.newKeyword) {
    elements.newKeyword.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') addKeyword();
    });
  }

  // Keyword tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentCategory = btn.dataset.category;
      loadKeywords();
    });
  });

  // Keyword delete (delegated)
  if (elements.keywordsList) {
    elements.keywordsList.addEventListener('click', (e) => {
      if (e.target.classList.contains('remove')) {
        const id = e.target.dataset.id;
        if (id) removeKeyword(parseInt(id));
      }
    });
  }

  // Unblock user (delegated)
  if (elements.blocklistContainer) {
    elements.blocklistContainer.addEventListener('click', (e) => {
      if (e.target.classList.contains('unblock-btn')) {
        const uid = e.target.dataset.uid;
        if (uid) unblockUser(uid);
      }
    });
  }

  // Export
  if (elements.exportBtn) {
    elements.exportBtn.addEventListener('click', exportData);
  }

  // Import
  if (elements.importBtn && elements.importFile) {
    elements.importBtn.addEventListener('click', () => {
      elements.importFile.click();
    });
    elements.importFile.addEventListener('change', (e) => {
      if (e.target.files[0]) {
        importData(e.target.files[0]);
      }
    });
  }

  // Clear all
  if (elements.clearAllBtn) {
    elements.clearAllBtn.addEventListener('click', clearAll);
  }

  // Navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      
      const targetId = item.getAttribute('href').substring(1);
      document.querySelectorAll('.content-section').forEach(section => {
        section.style.display = section.id === targetId ? 'block' : 'none';
      });
    });
  });
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', init);
