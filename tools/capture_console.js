const playwright = require('playwright');

(async () => {
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const logs = [];

  page.on('console', (msg) => {
    const text = msg.text();
    const type = msg.type();
    const location = msg.location ? `${msg.location().url}:${msg.location().lineNumber}` : '';
    const entry = { type, text, location, timestamp: Date.now() };
    logs.push(entry);
    console.log(`[PAGE ${type}] ${text}`);
  });

  page.on('pageerror', (err) => {
    console.error('[PAGE ERROR]', err);
    logs.push({ type: 'pageerror', text: String(err), timestamp: Date.now() });
  });

  page.on('requestfailed', (req) => {
    console.warn('[REQUEST FAILED]', req.url(), req.failure()?.errorText || '');
    logs.push({ type: 'requestfailed', url: req.url(), text: req.failure()?.errorText || '', timestamp: Date.now() });
  });

  const url = 'http://localhost:5174/';
  console.log('Navigating to', url);

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
  } catch (e) {
    console.error('Failed to load page:', e.message);
  }

  // Wait and capture logs for 12 seconds
  await page.waitForTimeout(12000);

  console.log('\n=== CAPTURED LOGS ===');
  for (const l of logs) {
    console.log(JSON.stringify(l));
  }

  await browser.close();
  process.exit(0);
})();
