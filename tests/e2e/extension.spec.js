// Bilibili Quality Filter - E2E Tests
const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('Bilibili Quality Filter Extension', () => {
  let extensionId;
  let optionsUrl;
  let context;

  test.beforeEach(async ({ browser }) => {
    // Create context with extension loaded
    const extensionPath = path.resolve(__dirname, '../../');
    context = await browser.newContext({
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ]
    });

    // Get extension ID from background page target
    const backgroundPage = await context.waitForEvent('backgroundpage');
    const url = backgroundPage.url();
    const match = url.match(/chrome-extension:\/\/([^/]+)/);
    extensionId = match ? match[1] : null;
    optionsUrl = `chrome-extension://${extensionId}/ui/options/options.html`;

    await backgroundPage.close();
  });

  test.afterEach(async () => {
    if (context) {
      await context.close();
    }
  });

  test('should display extension icon and title', async () => {
    const page = await context.newPage();
    await page.goto(optionsUrl);

    // Check title
    const title = await page.title();
    expect(title).toContain('Bilibili Quality Filter');

    // Check sidebar header
    const headerText = await page.locator('.sidebar-header h1').textContent();
    expect(headerText).toContain('Bilibili Quality Filter');

    await page.close();
  });

  test('should have all navigation items', async () => {
    const page = await context.newPage();
    await page.goto(optionsUrl);

    const navItems = await page.locator('.sidebar-nav .nav-item').allTextContents();
    expect(navItems).toContain('General');
    expect(navItems).toContain('Filters');
    expect(navItems).toContain('Keywords');
    expect(navItems).toContain('Blocklist');
    expect(navItems).toContain('Data');

    await page.close();
  });

  test('should toggle filter enabled/disabled', async () => {
    const page = await context.newPage();
    await page.goto(optionsUrl);

    const enabledCheckbox = page.locator('#enabled');

    // Check initial state (should be enabled by default)
    await expect(enabledCheckbox).toBeChecked();

    // Toggle off
    await enabledCheckbox.click();
    await expect(enabledCheckbox).not.toBeChecked();

    // Toggle back on
    await enabledCheckbox.click();
    await expect(enabledCheckbox).toBeChecked();

    await page.close();
  });

  test('should show blocklist mode options by default', async () => {
    const page = await context.newPage();
    await page.goto(optionsUrl);

    const modeBlocklist = page.locator('#modeBlocklist');
    const intensitySetting = page.locator('#intensitySetting');

    // Blocklist should be selected by default
    await expect(modeBlocklist).toBeChecked();

    // Intensity setting should be visible in blocklist mode
    await expect(intensitySetting).toBeVisible();

    await page.close();
  });

  test('should hide intensity selector in allowlist mode', async () => {
    const page = await context.newPage();
    await page.goto(optionsUrl);

    const modeAllowlist = page.locator('#modeAllowlist');
    const intensitySetting = page.locator('#intensitySetting');

    // Switch to allowlist mode
    await modeAllowlist.click();
    await expect(modeAllowlist).toBeChecked();

    // Intensity setting should be hidden in allowlist mode
    await expect(intensitySetting).toBeHidden();

    await page.close();
  });

  test('should have three intensity levels in blocklist mode', async () => {
    const page = await context.newPage();
    await page.goto(optionsUrl);

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

    await page.close();
  });

  test('should select different intensity levels', async () => {
    const page = await context.newPage();
    await page.goto(optionsUrl);

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

    await page.close();
  });

  test('should toggle ML sentiment analysis', async () => {
    const page = await context.newPage();
    await page.goto(optionsUrl);

    const mlCheckbox = page.locator('#enableMLSentiment');

    // Should be unchecked by default
    await expect(mlCheckbox).not.toBeChecked();

    // Toggle on
    await mlCheckbox.click();
    await expect(mlCheckbox).toBeChecked();

    // Toggle off
    await mlCheckbox.click();
    await expect(mlCheckbox).not.toBeChecked();

    await page.close();
  });

  test('should toggle comment filters', async () => {
    const page = await context.newPage();
    await page.goto(optionsUrl);

    const filterComments = page.locator('#filterComments');

    // Should be checked by default
    await expect(filterComments).toBeChecked();

    // Toggle off
    await filterComments.click();
    await expect(filterComments).not.toBeChecked();

    await page.close();
  });

  test('should show video filter options', async () => {
    const page = await context.newPage();
    await page.goto(optionsUrl);

    const filterRageBait = page.locator('#filterRageBait');
    const filterClickbait = page.locator('#filterClickbait');
    const filterHomogenized = page.locator('#filterHomogenized');

    // All should be checked by default
    await expect(filterRageBait).toBeChecked();
    await expect(filterClickbait).toBeChecked();
    await expect(filterHomogenized).toBeChecked();

    await page.close();
  });

  test('should navigate between sections', async () => {
    const page = await context.newPage();
    await page.goto(optionsUrl);

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

    await page.close();
  });

  test('should display settings in General section', async () => {
    const page = await context.newPage();
    await page.goto(optionsUrl);

    // Check for general settings
    const dimInsteadOfHide = page.locator('#dimInsteadOfHide');
    const autoCollapseComments = page.locator('#autoCollapseComments');
    const showBlockUserButton = page.locator('#showBlockUserButton');

    await expect(dimInsteadOfHide).toBeVisible();
    await expect(autoCollapseComments).toBeVisible();
    await expect(showBlockUserButton).toBeVisible();

    await page.close();
  });

  test('should have version 0.2.0 displayed', async () => {
    const page = await context.newPage();
    await page.goto(optionsUrl);

    const versionText = await page.locator('.sidebar-footer').textContent();
    expect(versionText).toContain('0.2.0');

    await page.close();
  });
});

test.describe('Settings Persistence', () => {
  let extensionId;
  let optionsUrl;
  let context;

  test.beforeEach(async ({ browser }) => {
    const extensionPath = path.resolve(__dirname, '../../');
    context = await browser.newContext({
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ]
    });

    const backgroundPage = await context.waitForEvent('backgroundpage');
    const url = backgroundPage.url();
    const match = url.match(/chrome-extension:\/\/([^/]+)/);
    extensionId = match ? match[1] : null;
    optionsUrl = `chrome-extension://${extensionId}/ui/options/options.html`;

    await backgroundPage.close();
  });

  test.afterEach(async () => {
    if (context) {
      await context.close();
    }
  });

  test('should persist mode selection after reload', async () => {
    const page = await context.newPage();
    await page.goto(optionsUrl);

    // Switch to allowlist mode
    await page.locator('#modeAllowlist').click();
    await expect(page.locator('#modeAllowlist')).toBeChecked();

    // Reload page
    await page.reload();

    // Mode should persist
    await expect(page.locator('#modeAllowlist')).toBeChecked();

    await page.close();
  });

  test('should persist intensity selection after reload', async () => {
    const page = await context.newPage();
    await page.goto(optionsUrl);

    // Switch to radical intensity
    await page.locator('#intensityRadical').click();
    await expect(page.locator('#intensityRadical')).toBeChecked();

    // Reload page
    await page.reload();

    // Intensity should persist
    await expect(page.locator('#intensityRadical')).toBeChecked();

    await page.close();
  });

  test('should persist ML toggle after reload', async () => {
    const page = await context.newPage();
    await page.goto(optionsUrl);

    // Enable ML
    await page.locator('#enableMLSentiment').click();
    await expect(page.locator('#enableMLSentiment')).toBeChecked();

    // Reload page
    await page.reload();

    // ML toggle should persist
    await expect(page.locator('#enableMLSentiment')).toBeChecked();

    await page.close();
  });
});
