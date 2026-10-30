/* Run with a local server on :8767; only invented demo data is used.
   LEDGER_PLAYWRIGHT_PATH may point to an existing Playwright installation. */
const { chromium } = require(process.env.LEDGER_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = path.resolve(__dirname, '../../outputs/monthly-review');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel:'chrome', headless:true });
  try {
    const context = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:1, acceptDownloads:true });
    const page = await context.newPage(), errors = [], external = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => { if (new URL(route.request().url()).hostname !== '127.0.0.1'){ external.push(route.request().url()); return route.abort(); } return route.continue(); });
    await page.addInitScript(() => {
      const RealDate = Date, instant = new RealDate('2026-11-04T12:00:00Z').valueOf();
      window.Date = class extends RealDate { constructor(...args){ super(...(args.length ? args : [instant])); } static now(){ return instant; } };
      sessionStorage.setItem('ledger_demo', '1');
    });
    await page.goto('http://127.0.0.1:8767/');
    await page.waitForSelector('#page .update-card');
    assert.equal(await page.evaluate(() => !!Ledger.S.monthlyReports['2026-11']), false);
    await page.locator('#page [data-act="logBalances"]').first().click();
    while (await page.locator('#modal-body [data-same]').count()) await page.locator('#modal-body [data-same]').first().click();
    await page.locator('#log-save').click();
    await page.waitForFunction(() => !Ledger.modal.isOpen);
    assert.equal(await page.evaluate(() => !!Ledger.S.monthlyReports['2026-11']), false);
    for (const k of ['change','oneoffs','budget']) await page.locator(`#page [data-act="tick"][data-k="${k}"]`).click();
    await page.waitForSelector('#report-preview img');
    await page.waitForFunction(() => !document.querySelector('[data-report-export="png"]').disabled);
    assert.equal(await page.locator('#modal-title').textContent(), 'October 2026 review');
    assert.equal(await page.evaluate(() => Ledger.S.monthlyReports['2026-11'].month), '2026-10');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await page.evaluate(() => document.getElementById('modal-sheet').scrollWidth > document.getElementById('modal-sheet').clientWidth), false);
    await page.waitForFunction(() => !document.getElementById('toast').classList.contains('on'));
    await page.screenshot({path:path.join(out,'phone-preview.png')});
    for (const type of ['png','pdf']){
      const download = page.waitForEvent('download');
      await page.locator(`[data-report-export="${type}"]`).click();
      const file = await download; assert.equal(file.suggestedFilename(), `seligman-ledger-2026-10.${type}`);
      await file.saveAs(path.join(out, `demo-october-2026.${type}`));
    }
    // Share/copy are explicitly stubbed; no messages or clipboard writes leave the test.
    await page.evaluate(() => {
      Object.defineProperty(navigator,'canShare',{ configurable:true, value:() => true });
      Object.defineProperty(navigator,'share',{ configurable:true, writable:true, value:async data => { window.sharedFile = {name:data.files[0].name,size:data.files[0].size,type:data.files[0].type}; } });
      Object.defineProperty(navigator,'clipboard',{ configurable:true, value:{write:async items => {window.copiedType=items[0].types[0];}} });
      Ledger.reports.open('2026-11');
    });
    await page.waitForFunction(() => !document.querySelector('[data-report-export="share"]').disabled);
    await page.locator('[data-report-export="share"]').click();
    assert.equal((await page.evaluate(() => window.sharedFile)).type,'image/png');
    await page.locator('[data-report-export="copy"]').click();
    assert.equal(await page.evaluate(() => window.copiedType),'image/png');
    // Cancelled native sharing is quiet; failed sharing offers the file fallback.
    await page.evaluate(() => navigator.share = async () => {throw new DOMException('Cancelled','AbortError');});
    await page.locator('[data-report-export="share"]').click();
    await page.evaluate(() => navigator.share = async () => {throw new DOMException('Unavailable','NotAllowedError');});
    await page.locator('[data-report-export="share"]').click();
    await page.waitForFunction(() => document.getElementById('toast').textContent.includes('Save image'));
    assert.match(await page.locator('#toast').textContent(),/Save image/);
    await page.setViewportSize({width:1280,height:900});
    await page.waitForFunction(() => !document.getElementById('toast').classList.contains('on'));
    await page.screenshot({path:path.join(out,'desktop-preview.png')});
    await page.locator('#modal-close').click();
    await page.reload(); await page.waitForSelector('#page .report-ready');
    assert.equal(await page.evaluate(() => !!Ledger.S.monthlyReports['2026-11']), true);
    assert.equal(await page.evaluate(() => Ledger.modal.isOpen), false, 'must not reopen the report on every load');
    await page.locator('#page [data-act="tick"][data-k="budget"]').click();
    assert.equal(await page.evaluate(() => !!Ledger.S.monthlyReports['2026-11']), false);
    await page.locator('#page [data-act="tick"][data-k="budget"]').click();
    await page.waitForSelector('#report-preview img');
    await page.locator('#report-month').selectOption('2026-10');
    await page.waitForFunction(() => document.getElementById('modal-title').textContent === 'September 2026 review');
    await page.waitForFunction(() => !document.querySelector('[data-report-export="png"]').disabled);
    await page.locator('#modal-close').click();
    // Completion also works when the final action is an account confirmation.
    await page.evaluate(() => Ledger.commit(s => { delete Ledger.model.snap(s,'2026-11').updated.x01; }));
    assert.equal(await page.evaluate(() => !!Ledger.S.monthlyReports['2026-11']),false);
    await page.locator('#page [data-act="logBalances"]').first().click();
    await page.locator('#modal-body [data-same="x01"]').click();
    await page.locator('#log-save').click();
    await page.waitForSelector('#report-preview img');
    assert.equal(await page.locator('#modal-title').textContent(),'October 2026 review');
    assert.deepEqual(errors,[]); assert.deepEqual(external,[]);
    console.log('PASS: completion trigger, exports, month labels, mobile/desktop layout, share/copy fallbacks, reload, reopen, report history; no external requests or browser errors.');
    console.log('Demo PNG and PDF:',out);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });
