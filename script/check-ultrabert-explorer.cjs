const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const output = path.resolve('tmp/ultrabert-browser');
  fs.mkdirSync(output, { recursive: true });
  try {
    await page.goto(pathToFileURL(path.resolve('_site/experiments/ultrabert-batching/index.html')).href);
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
    console.log('Explorer browser checks passed at desktop, tablet and phone widths.');
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
