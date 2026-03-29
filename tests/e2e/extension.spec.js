// Bilibili Quality Filter - E2E Tests
const { test: base, expect, chromium } = require('@playwright/test');
const path = require('path');
const os = require('os');
const fs = require('fs/promises');

const EXTENSION_PATH = path.resolve(__dirname, '../../');
const OPTIONS_PAGE_PATH = 'ui/options/options.html';
const VIEWPORT = { width: 1280, height: 720 };

async function requestSettings(page) {
  return page.evaluate(async () => {
    try {
      return await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    } catch (error) {
      return {
        success: false,
        error: String(error)
      };
    }
  });
}

async function waitForStoredSetting(page, key, expectedValue) {
  await expect.poll(async () => {
    const response = await requestSettings(page);
    return response?.settings?.[key];
  }).toBe(expectedValue);
}

async function waitForOptionsReady(page) {
  await expect(page.locator('.sidebar-header h1')).toContainText('Bilibili Quality Filter');
  await expect(page.locator('#statKeywords')).not.toHaveText('-');
  await expect.poll(async () => {
    const response = await requestSettings(page);
    return response?.success === true;
  }).toBe(true);
}

async function resolveExtensionId(context) {
  let [serviceWorker] = context.serviceWorkers();

  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker', { timeout: 15000 });
  }

  const match = serviceWorker.url().match(/^chrome-extension:\/\/([^/]+)\//);
  if (!match) {
    throw new Error(`Unable to resolve extension id from service worker URL: ${serviceWorker.url()}`);
  }

  return match[1];
}

async function launchExtensionSession() {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bqf-playwright-'));

  try {
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      headless: true,
      viewport: VIEWPORT,
      ignoreHTTPSErrors: true,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`
      ]
    });

    const extensionId = await resolveExtensionId(context);
    return {
      context,
      extensionId,
      optionsUrl: `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}`,
      userDataDir
    };
  } catch (error) {
    await fs.rm(userDataDir, { recursive: true, force: true });
    throw error;
  }
}

async function closeExtensionSession(session) {
  if (!session) {
    return;
  }

  await session.context?.close();

  try {
    await fs.rm(session.userDataDir, { recursive: true, force: true });
  } catch (error) {
    console.warn(`[BQF] Failed to remove Playwright user data dir ${session.userDataDir}:`, error);
  }
}

const test = base.extend({
  extensionSession: async ({}, use) => {
    const session = await launchExtensionSession();

    try {
      await use(session);
    } finally {
      await closeExtensionSession(session);
    }
  },
  optionsPage: async ({ extensionSession }, use) => {
    const page = await extensionSession.context.newPage();
    await page.goto(extensionSession.optionsUrl, { waitUntil: 'domcontentloaded' });
    await waitForOptionsReady(page);

    try {
      await use(page);
    } finally {
      await page.close();
    }
  }
});

test.describe('Bilibili Quality Filter Extension', () => {
  test('should display extension icon and title', async ({ optionsPage: page }) => {
    // Check title
    const title = await page.title();
    expect(title).toContain('Bilibili Quality Filter');

    // Check sidebar header
    const headerText = await page.locator('.sidebar-header h1').textContent();
    expect(headerText).toContain('Bilibili Quality Filter');

  });

  test('should have all navigation items', async ({ optionsPage: page }) => {
    const navItems = await page.locator('.sidebar-nav .nav-item').allTextContents();
    expect(navItems).toContain('General');
    expect(navItems).toContain('Filters');
    expect(navItems).toContain('Keywords');
    expect(navItems).toContain('Blocklist');
    expect(navItems).toContain('Data');
  });

  test('should toggle filter enabled/disabled', async ({ optionsPage: page }) => {
    const enabledCheckbox = page.locator('#enabled');

    // Check initial state (should be enabled by default)
    await expect(enabledCheckbox).toBeChecked();

    // Toggle off
    await enabledCheckbox.click();
    await expect(enabledCheckbox).not.toBeChecked();

    // Toggle back on
    await enabledCheckbox.click();
    await expect(enabledCheckbox).toBeChecked();
  });

  test('should show blocklist mode options by default', async ({ optionsPage: page }) => {
    const modeBlocklist = page.locator('#modeBlocklist');
    const intensitySetting = page.locator('#intensitySetting');

    // Blocklist should be selected by default
    await expect(modeBlocklist).toBeChecked();

    // Intensity setting should be visible in blocklist mode
    await expect(intensitySetting).toBeVisible();
  });

  test('should hide intensity selector in allowlist mode', async ({ optionsPage: page }) => {
    const modeAllowlist = page.locator('#modeAllowlist');
    const intensitySetting = page.locator('#intensitySetting');

    // Switch to allowlist mode
    await modeAllowlist.click();
    await expect(modeAllowlist).toBeChecked();

    // Intensity setting should be hidden in allowlist mode
    await expect(intensitySetting).toBeHidden();
  });

  test('should have three intensity levels in blocklist mode', async ({ optionsPage: page }) => {
    const modeBlocklist = page.locator('#modeBlocklist');
    await modeBlocklist.click();

    const intensitySimple = page.locator('#intensitySimple');
    const intensityMild = page.locator('#intensityMild');
    const intensityRadical = page.locator('#intensityRadical');

    // All three should be visible
    await expect(intensitySimple).toBeVisible();
    await expect(intensityMild).toBeVisible();
    await expect(intensityRadical).toBeVisible();

    // Mild should be selected by default
    await expect(intensityMild).toBeChecked();
  });

  test('should select different intensity levels', async ({ optionsPage: page }) => {
    const modeBlocklist = page.locator('#modeBlocklist');
    await modeBlocklist.click();

    const intensitySimple = page.locator('#intensitySimple');
    const intensityRadical = page.locator('#intensityRadical');

    // Select simple
    await intensitySimple.click();
    await expect(intensitySimple).toBeChecked();

    // Select radical
    await intensityRadical.click();
    await expect(intensityRadical).toBeChecked();
  });

  test('should toggle ML sentiment analysis', async ({ optionsPage: page }) => {
    const mlCheckbox = page.locator('#enableMLSentiment');

    // Should be unchecked by default
    await expect(mlCheckbox).not.toBeChecked();

    // Toggle on
    await mlCheckbox.click();
    await expect(mlCheckbox).toBeChecked();

    // Toggle off
    await mlCheckbox.click();
    await expect(mlCheckbox).not.toBeChecked();
  });

  test('should toggle comment filters', async ({ optionsPage: page }) => {
    const filterComments = page.locator('#filterComments');

    // Should be checked by default
    await expect(filterComments).toBeChecked();

    // Toggle off
    await filterComments.click();
    await expect(filterComments).not.toBeChecked();
  });

  test('should show video filter options', async ({ optionsPage: page }) => {
    const filterRageBait = page.locator('#filterRageBait');
    const filterClickbait = page.locator('#filterClickbait');
    const filterHomogenized = page.locator('#filterHomogenized');

    // All should be checked by default
    await expect(filterRageBait).toBeChecked();
    await expect(filterClickbait).toBeChecked();
    await expect(filterHomogenized).toBeChecked();
  });

  test('should navigate between sections', async ({ optionsPage: page }) => {
    // Navigate to Keywords section
    await page.click('a[href="#keywords"]');
    const keywordsSection = page.locator('#keywords');
    await expect(keywordsSection).toBeVisible();

    // Navigate to Blocklist section
    await page.click('a[href="#blocklist"]');
    const blocklistSection = page.locator('#blocklist');
    await expect(blocklistSection).toBeVisible();

    // Navigate to Data section
    await page.click('a[href="#data"]');
    const dataSection = page.locator('#data');
    await expect(dataSection).toBeVisible();
  });

  test('should display settings in General section', async ({ optionsPage: page }) => {
    // Check for general settings
    const dimInsteadOfHide = page.locator('#dimInsteadOfHide');
    const autoCollapseComments = page.locator('#autoCollapseComments');
    const showBlockUserButton = page.locator('#showBlockUserButton');

    await expect(dimInsteadOfHide).toBeVisible();
    await expect(autoCollapseComments).toBeVisible();
    await expect(showBlockUserButton).toBeVisible();
  });

  test('should have version 0.1.0 displayed', async ({ optionsPage: page }) => {
    const versionText = await page.locator('.sidebar-footer').textContent();
    expect(versionText).toContain('0.1.0');
  });
});

test.describe('Settings Persistence', () => {
  test('should persist mode selection after reload', async ({ optionsPage: page }) => {
    // Switch to allowlist mode
    await page.locator('#modeAllowlist').click();
    await expect(page.locator('#modeAllowlist')).toBeChecked();
    await waitForStoredSetting(page, 'commentFilterMode', 'allowlist');

    // Reload page
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForOptionsReady(page);

    // Mode should persist
    await expect(page.locator('#modeAllowlist')).toBeChecked();
  });

  test('should persist intensity selection after reload', async ({ optionsPage: page }) => {
    // Switch to radical intensity
    await page.locator('#intensityRadical').click();
    await expect(page.locator('#intensityRadical')).toBeChecked();
    await waitForStoredSetting(page, 'blocklistIntensity', 'radical');

    // Reload page
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForOptionsReady(page);

    // Intensity should persist
    await expect(page.locator('#intensityRadical')).toBeChecked();
  });

  test('should persist ML toggle after reload', async ({ optionsPage: page }) => {
    // Enable ML
    await page.locator('#enableMLSentiment').click();
    await expect(page.locator('#enableMLSentiment')).toBeChecked();
    await waitForStoredSetting(page, 'enableMLSentiment', true);

    // Reload page
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForOptionsReady(page);

    // ML toggle should persist
    await expect(page.locator('#enableMLSentiment')).toBeChecked();
  });
});
