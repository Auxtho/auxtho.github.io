const path = require('node:path');

module.exports = {
  testDir: path.join(__dirname, 'tests'),
  testMatch: /.*\.spec\.cjs$/,
  fullyParallel: false,
  outputDir: process.env.AUXTHO_PLAYWRIGHT_OUTPUT_DIR || 'test-results',
  use: {
    headless: true,
  },
};
