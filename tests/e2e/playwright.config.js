// Bilibili Quality Filter - Playwright Configuration
const { defineConfig } = require('@playwright/test');
const path = require('path');

module.exports = defineConfig({
  testDir: path.resolve(__dirname),
  testMatch: /extension\.spec\.js/,
  timeout: 45000,
  expect: {
    timeout: 10000
  },
  retries: 1,
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: path.resolve(__dirname, 'test-results')
});
