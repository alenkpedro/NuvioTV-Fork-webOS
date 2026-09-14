import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: '*.spec.js', workers: 1,
  use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 1920, height: 1080 }, browserName: 'chromium', launchOptions: { executablePath: process.env.CHROME_PATH || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined) }, screenshot: 'only-on-failure' },
  webServer: { command: 'npm start', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
});
