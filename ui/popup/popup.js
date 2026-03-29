// Bilibili Quality Filter - Popup Script

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

// DOM Elements
const elements = {
  enabled: document.getElementById('enabled'),
  filterRageBait: document.getElementById('filterRageBait'),
  filterClickbait: document.getElementById('filterClickbait'),
  filterHomogenized: document.getElementById('filterHomogenized'),
  filterComments: document.getElementById('filterComments'),
  dimInsteadOfHide: document.getElementById('dimInsteadOfHide'),
  showBlockUserButton: document.getElementById('showBlockUserButton'),
  keywordCount: document.getElementById('keywordCount'),
  userCount: document.getElementById('userCount'),
  openOptions: document.getElementById('openOptions')
};

/**
 * Initialize popup
 */
async function init() {
  await loadSettings();
  await loadStats();
  setupEventListeners();
  localizeUI();
}

/**
 * Load settings from storage
 */
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get('settings');
    const settings = { ...DEFAULT_SETTINGS, ...result.settings };

    // Update UI
    elements.enabled.checked = settings.enabled;
    elements.filterRageBait.checked = settings.filterRageBait;
    elements.filterClickbait.checked = settings.filterClickbait;
    elements.filterHomogenized.checked = settings.filterHomogenized;
    elements.filterComments.checked = settings.filterComments;
    elements.dimInsteadOfHide.checked = settings.dimInsteadOfHide;
    elements.showBlockUserButton.checked = settings.showBlockUserButton;

    // Update body class for disabled state
    document.body.classList.toggle('disabled', !settings.enabled);
  } catch (error) {
    console.error('[BQF] Failed to load settings:', error);
  }
}

/**
 * Load statistics from background
 */
async function loadStats() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATS' });
    if (response.success) {
      elements.keywordCount.textContent = response.stats.totalKeywords;
      elements.userCount.textContent = response.stats.blockedUsers;
    }
  } catch (error) {
    console.error('[BQF] Failed to load stats:', error);
    elements.keywordCount.textContent = '-';
    elements.userCount.textContent = '-';
  }
}

/**
 * Save settings to storage
 */
async function saveSettings() {
  const settings = {
    enabled: elements.enabled.checked,
    filterRageBait: elements.filterRageBait.checked,
    filterClickbait: elements.filterClickbait.checked,
    filterHomogenized: elements.filterHomogenized.checked,
    filterComments: elements.filterComments.checked,
    dimInsteadOfHide: elements.dimInsteadOfHide.checked,
    showBlockUserButton: elements.showBlockUserButton.checked
  };

  try {
    await chrome.storage.sync.set({ settings });

    // Notify background script
    await chrome.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings
    });

    // Update body class
    document.body.classList.toggle('disabled', !settings.enabled);
  } catch (error) {
    console.error('[BQF] Failed to save settings:', error);
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Settings changes
  Object.values(elements).forEach(el => {
    if (el && el.type === 'checkbox') {
      el.addEventListener('change', saveSettings);
    }
  });

  // Enabled toggle special handling
  elements.enabled.addEventListener('change', () => {
    document.body.classList.toggle('disabled', !elements.enabled.checked);
    saveSettings();
  });

  // Open options button
  elements.openOptions.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });
}

/**
 * Localize UI with i18n messages
 */
function localizeUI() {
  const elements = document.querySelectorAll('[data-i18n]');
  elements.forEach(el => {
    const key = el.getAttribute('data-i18n');
    const message = chrome.i18n.getMessage(key);
    if (message) {
      el.textContent = message;
    }
  });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
