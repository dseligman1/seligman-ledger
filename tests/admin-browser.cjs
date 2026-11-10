/* Life admin in the browser, demo data only. Needs a local server on :8767 serving this folder.
   LEDGER_PLAYWRIGHT_PATH may point to an existing Playwright installation. */
const { chromium } = require(process.env.LEDGER_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = path.resolve(__dirname, '../../outputs/life-admin'); fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const [w, h] of [[390, 844], [1280, 900]]){
      const context = await browser.newContext({ viewport: { width: w, height: h } }), page = await context.newPage();
      const errors = [], external = []; page.on('pageerror', e => errors.push(e.message));
      await page.route('**/*', r => { if (new URL(r.request().url()).hostname !== '127.0.0.1'){ external.push(r.request().url()); return r.abort(); } return r.continue(); });
      await page.goto('http://127.0.0.1:8767/'); await page.locator('#gate-households [data-demo-open]').click();
      await page.locator('#tour.on').waitFor(); await page.locator('#tour [data-act="tourEnd"]').click();
      const noScroll = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'no horizontal scroll at ' + w);

      // Overview: pensions tile and the "needs doing" card
      await page.locator('#page .update-card').waitFor();
      assert.match(await page.locator('.stats.five .stat').nth(4).textContent(), /Pensions\s*£[\d,]+/);
      assert.equal(await page.locator('#page h2', { hasText: 'Life admin' }).count(), 1);
      await noScroll(); await page.screenshot({ path: path.join(out, `overview-${w}.png`), fullPage: true });

      // Life admin page
      await page.locator(w < 900 ? '#bottomnav [data-tab="admin"]' : '#side-nav [data-tab="admin"]').click();
      await page.locator('#page h1', { hasText: 'Life admin' }).waitFor();
      assert.equal(await page.locator('[data-chart="pensions"] svg').count() > 0, true, 'pension chart draws');
      await noScroll(); await page.screenshot({ path: path.join(out, `admin-${w}.png`), fullPage: true });

      // Quarterly update: two values, one via "Same as last time"
      const potsBefore = await page.locator('.stat .v').first().textContent();
      await page.locator('#page [data-act="updatePensions"]').first().click();
      const boxes = page.locator('[data-pu]');
      await boxes.nth(0).fill('70000'); await page.locator('[data-pusame]').nth(1).click();
      await page.screenshot({ path: path.join(out, `update-${w}.png`) });
      await page.locator('#pu-save').click();
      await page.waitForFunction(b => document.querySelector('#page .stat .v').textContent !== b, potsBefore, { timeout: 3000 });

      // Add a pension, give it a value, check it shows in the total
      await page.locator('#page [data-act="addPension"]').first().click();
      await page.locator('#pn-name').fill('Test pot'); await page.locator('#pn-name').press('Tab');
      await page.locator('#pv-val').fill('1000'); await page.locator('[data-act="addPensionValue"]').click();
      assert.match(await page.locator('#modal-sub').textContent(), /£1,000/);
      await page.locator('#modal-close').click();
      assert.equal(await page.locator('#page .row .name', { hasText: 'Test pot' }).count(), 1);

      // Add a subscription with a renewal date in 10 days: appears under Coming up and on Overview
      await page.locator('[data-act="addAdminItem"][data-cat="subscription"]').click();
      await page.locator('#ad-name').fill('Test streaming'); await page.locator('#ad-name').press('Tab');
      const d = new Date(); d.setDate(d.getDate() + 10); const iso = d.toISOString().slice(0, 10);
      await page.locator('#modal-body [data-f="cost"]').fill('9.99'); await page.locator('#modal-body [data-f="cost"]').press('Tab');
      await page.locator('#modal-body [data-f="endDate"]').fill(iso); await page.locator('#modal-body [data-f="endDate"]').dispatchEvent('change');
      await page.screenshot({ path: path.join(out, `item-${w}.png`) });
      await page.locator('#modal-close').click();
      const coming = page.locator('#page section', { has: page.locator('h2', { hasText: 'Coming up' }) });
      assert.equal(await coming.locator('.name', { hasText: 'Test streaming' }).count(), 1);
      assert.match(await coming.locator('.row', { hasText: 'Test streaming' }).textContent(), /in 10 days/);

      // Calendar file downloads
      const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-act="adminCalendar"]').click()]);
      const ics = fs.readFileSync(await dl.path(), 'utf8');
      assert.match(ics, /SUMMARY:Test streaming renews/); assert.match(ics, /RRULE:FREQ=MONTHLY;INTERVAL=3/);

      // Survives a reload (demo saves to this browser)
      await page.reload(); await page.locator('#page h1', { hasText: 'Life admin' }).waitFor();
      assert.equal(await page.locator('#page .name', { hasText: 'Test streaming' }).count() >= 1, true);

      // Accounts note mentions pensions without changing net worth
      await page.locator(w < 900 ? '#bottomnav [data-tab="accounts"]' : '#side-nav [data-tab="accounts"]').click();
      assert.match(await page.locator('#page > .note').last().textContent(), /Pensions, kept separate/);
      await noScroll();

      assert.deepEqual(errors, []); assert.deepEqual(external, []);
      await context.close();
      console.log('ok', w);
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
