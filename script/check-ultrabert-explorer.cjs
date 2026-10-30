const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');

async function main() {
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
    await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });
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
    await page.screenshot({ path: path.join(output, 'phone.png'), fullPage: true });
    // Confirm that keyboard users can reach a native input and navigate examples.
    await page.locator('#previous').focus();
    await page.keyboard.press('Enter');
    assert.notEqual(await page.locator('#article').inputValue(), before);
    assert.deepEqual(errors, []);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(origin + '/one-linear-layer-broke-my-int8-encoder/');
    await page.getByRole('heading', { name: 'One Linear layer broke my INT8 encoder', exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'article-desktop.png') });
    await page.locator('#the-rescue-still-changes-with-batching').evaluate(element => element.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: path.join(output, 'article-interactive-preview.png') });
    await page.getByRole('link', { name: 'Explore the predictions →', exact: true }).click();
    await page.waitForSelector('#scores .score-row');
    await page.getByRole('link', { name: '← Read the article', exact: true }).click();
    await page.getByRole('heading', { name: 'One Linear layer broke my INT8 encoder', exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Article horizontal overflow on phone');
    await page.screenshot({ path: path.join(output, 'article-phone.png') });
    assert.deepEqual(errors, []);
    console.log('Explorer and article browser checks passed, including preview navigation and desktop/phone layouts.');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
