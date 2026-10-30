const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const { chromium } = require('playwright');

function checkResizeMessages() {
  const origin = 'https://julesbelveze.github.io';
  const frame = { contentWindow: {}, style: {}, hidden: true };
  let receive;
  vm.runInNewContext(fs.readFileSync('assets/js/ultrabert-embed.js', 'utf8'), {
    document: { getElementById: () => frame },
    window: { location: { origin }, addEventListener: (_, handler) => { receive = handler; } },
  });
  assert.equal(frame.hidden, false);
  const message = height => ({ origin, source: frame.contentWindow, data: { type: 'ultrabert-explorer-height', height } });
  receive(message(950));
  assert.equal(frame.style.height, '950px');
  for (const event of [
    { ...message(1000), source: {} },
    { ...message(1000), origin: 'https://example.com' },
    message(Infinity), message(-1), message(100000),
  ]) {
    receive(event);
    assert.equal(frame.style.height, '950px');
  }
}

async function main() {
  checkResizeMessages();
  const root = path.resolve('_site');
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
  const server = http.createServer((request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      let file = path.resolve(root, '.' + pathname);
      if (file !== root && !file.startsWith(root + path.sep)) throw new Error('Invalid path');
      if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      response.end(fs.readFileSync(file));
    } catch {
      response.writeHead(404); response.end('Not found');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const output = path.resolve('tmp/ultrabert-browser');
  fs.mkdirSync(output, { recursive: true });
  try {
    await page.goto(origin + '/experiments/ultrabert-batching/');
    await page.waitForSelector('#scores .score-row');
    assert.equal(await page.locator('#article option').count(), 67);
    assert.equal(await page.locator('#article').inputValue(), '66');
    assert.equal(await page.locator('#metric-f1').textContent(), '76.45 → 77.18');
    assert.equal(await page.locator('#metric-tradeoff').textContent(), '+33 / −28');
    assert.equal(await page.locator('#left-winner').textContent(), 'Headlines & News');
    assert.equal(await page.locator('#right-winner').textContent(), 'Guides & Resources');
    await page.screenshot({ animations: 'disabled', path: path.join(output, 'desktop.png'), fullPage: true });
    await page.selectOption('#policy', 'batch1_actual_length');
    assert.equal(await page.locator('#metric-f1').textContent(), '76.45 → 76.84');
    assert.equal(await page.locator('#metric-changes').textContent(), '73 / 1,156');
    assert.equal(await page.locator('#article').inputValue(), '66');
    await page.selectOption('#model', 'fp32');
    assert.equal(await page.locator('#metric-changes').textContent(), '0 / 1,156');
    assert.equal(await page.locator('#left-winner').textContent(), await page.locator('#right-winner').textContent());
    for (const [filter, expected] of [['stable', 1089], ['all', 1156], ['changed', 67]]) {
      await page.selectOption('#filter', filter);
      assert.equal(await page.locator('#article option').count(), expected);
    }
    const before = await page.locator('#article').inputValue();
    await page.click('#next');
    assert.notEqual(await page.locator('#article').inputValue(), before);
    await page.click('#previous');
    assert.equal(await page.locator('#article').inputValue(), before);
    await page.selectOption('#policy', 'batch1_pad256');
    await page.selectOption('#model', 'int8');
    for (const width of [1280, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Horizontal overflow at ${width}px`);
      assert.equal(await page.locator('#scores .score-cell').count(), 10);
    }
    await page.screenshot({ animations: 'disabled', path: path.join(output, 'phone.png'), fullPage: true });
    // Confirm that keyboard users can reach a native input and navigate examples.
    await page.locator('#previous').focus();
    await page.keyboard.press('Enter');
    assert.notEqual(await page.locator('#article').inputValue(), before);
    assert.deepEqual(errors, []);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(origin + '/one-linear-layer-broke-my-int8-encoder/');
    await page.getByRole('heading', { name: 'One Linear layer broke my INT8 encoder', exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => ['body', '.initial-content', '.page', '.page__content'].map(selector => document.querySelector(selector)).filter(Boolean).every(element => Number(getComputedStyle(element).opacity) > 0.99));
    await page.screenshot({ animations: 'disabled', path: path.join(output, 'article-desktop.png') });
    await page.locator('#the-rescue-still-changes-with-batching').evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
    await page.screenshot({ animations: 'disabled', path: path.join(output, 'article-interactive-preview.png') });
    const frameElement = page.locator('#ultrabert-predictions');
    await frameElement.scrollIntoViewIfNeeded();
    const inline = page.frameLocator('#ultrabert-predictions');
    await inline.locator('#scores .score-row').first().waitFor();
    assert.equal(await inline.locator('#right-winner').textContent(), 'Guides & Resources');
    assert.ok(await inline.locator('h1').isHidden());
    assert.ok(await inline.locator('.metrics').isHidden());
    await page.waitForFunction(() => {
      const frame = document.getElementById('ultrabert-predictions');
      const main = frame.contentDocument?.querySelector('main');
      return main && Math.abs(frame.getBoundingClientRect().height - main.getBoundingClientRect().height) <= 2;
    });
    await inline.locator('#next').click();
    assert.notEqual(await inline.locator('#article').inputValue(), '66');
    assert.ok(page.url().endsWith('/one-linear-layer-broke-my-int8-encoder/'));
    await inline.locator('#model').selectOption('fp32');
    assert.equal(await inline.locator('#left-winner').textContent(), await inline.locator('#right-winner').textContent());
    await inline.locator('#model').selectOption('int8');
    await frameElement.scrollIntoViewIfNeeded();
    await frameElement.screenshot({ animations: 'disabled', path: path.join(output, 'article-inline-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => {
      const frame = document.getElementById('ultrabert-predictions');
      const main = frame.contentDocument?.querySelector('main');
      return main && Math.abs(frame.getBoundingClientRect().height - main.getBoundingClientRect().height) <= 2;
    });
    assert.ok(await inline.locator('html').evaluate(element => element.scrollWidth <= innerWidth));
    await inline.locator('#policy').selectOption('batch1_actual_length');
    await inline.locator('#previous').click();
    assert.equal(await inline.locator('#article').inputValue(), '66');
    await page.waitForFunction(() => {
      const frame = document.getElementById('ultrabert-predictions');
      const main = frame.contentDocument?.querySelector('main');
      return main && Math.abs(frame.getBoundingClientRect().height - main.getBoundingClientRect().height) <= 2;
    });
    const dimensions = await inline.locator('html').evaluate(element => ({ scrollHeight: element.scrollHeight, innerHeight, mainHeight: document.querySelector('main').getBoundingClientRect().height }));
    assert.ok(dimensions.scrollHeight <= dimensions.innerHeight + 2, JSON.stringify(dimensions));
    await frameElement.screenshot({ animations: 'disabled', path: path.join(output, 'article-inline-phone.png') });
    await page.getByRole('link', { name: 'Open the full explorer →', exact: true }).click();
    await page.waitForSelector('#scores .score-row');
    await page.getByRole('link', { name: '← Read the article', exact: true }).click();
    await page.getByRole('heading', { name: 'One Linear layer broke my INT8 encoder', exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => ['body', '.initial-content', '.page', '.page__content'].map(selector => document.querySelector(selector)).filter(Boolean).every(element => Number(getComputedStyle(element).opacity) > 0.99));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Article horizontal overflow on phone');
    assert.notEqual(await page.locator('.page__content p').first().evaluate(element => getComputedStyle(element).textAlign), 'justify');
    await page.screenshot({ animations: 'disabled', path: path.join(output, 'article-phone.png') });
    assert.deepEqual(errors, []);
    const noJs = await browser.newContext({ javaScriptEnabled: false });
    try {
      const fallback = await noJs.newPage();
      await fallback.goto(origin + '/one-linear-layer-broke-my-int8-encoder/');
      assert.ok(await fallback.locator('#ultrabert-predictions').isHidden());
      assert.ok(await fallback.locator('.prediction-explorer-inline img').isVisible());
      assert.ok(await fallback.getByRole('link', { name: 'Open the full explorer →', exact: true }).isVisible());
    } finally { await noJs.close(); }
    console.log('Explorer, inline comparisons, trusted auto-resize, no-JavaScript fallback and desktop/phone checks passed.');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
