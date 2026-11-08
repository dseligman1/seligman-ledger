/* Local browser checks. All household requests are mocked with invented data. */
const { chromium } = require(process.env.LEDGER_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {webcrypto:crypto}=require('node:crypto');
const out=path.resolve(__dirname,'../../outputs/onboarding'); fs.mkdirSync(out,{recursive:true});
const url='http://127.0.0.1:8767/';
async function encrypted(state,pin){
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const km=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:210000,hash:'SHA-256'},km,{name:'AES-GCM',length:256},false,['encrypt']);
  const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(state)));
  const b64=x=>Buffer.from(x).toString('base64'); return {v:1,salt:b64(salt),iv:b64(iv),data:b64(ct)};
}
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const context=await browser.newContext({viewport:{width:390,height:844}}), page=await context.newPage();
    const errors=[],external=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>{
      if(new URL(route.request().url()).hostname!=='127.0.0.1'){external.push(route.request().url());return route.abort();}
      return route.continue();
    });
    await page.goto(url); await page.locator('#gate-households').waitFor({state:'visible'});
    await page.screenshot({animations:'disabled',path:path.join(out,'phone-sign-in.png')});
    await page.locator('#gate-households [data-demo-open]').click();
    await page.locator('#tour.on').waitFor();
    assert.equal(await page.locator('#demo-user').count(),0);
    for(let i=0;i<8;i++){
      assert.equal(await page.locator('.tour-step').textContent(),`${i+1} of 8`);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      if(i===3) await page.screenshot({animations:'disabled',path:path.join(out,'phone-guide-budget.png')});
      if(i===0){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.closest('#tour')!==null),true);}
      await page.locator('#tour .btn.primary').click();
    }
    await page.reload(); await page.locator('#page .update-card').waitFor();
    assert.equal(await page.locator('#tour.on').count(),0);
    await page.locator('#settings-btn').click(); await page.locator('[data-act="tour"]').click();
    await page.locator('#tour.on').waitFor(); await page.keyboard.press('Escape');
    await page.locator('#bottomnav [data-tab="budget"]').click();
    const id=await page.evaluate(()=>Ledger.S.budget.lines.find(l=>l.kind==='fixed').id);
    const year=await page.evaluate(()=>Ledger.ui.budgetYear);
    const original=await page.evaluate(({id,year})=>Ledger.model.amt(Ledger.S.budget.lines.find(l=>l.id===id),year),{id,year});
    await page.locator(`#page [data-act="openLine"][data-id="${id}"]`).click();
    const unit=`[data-edit="amountPeriod"][data-y="${year}"]`, amount=`[data-edit="lineYear"][data-y="${year}"]`;
    await page.locator(unit).selectOption('annual');
    assert.equal(Number((await page.locator(amount).inputValue()).replace(/,/g,'')),original*12);
    await page.locator(amount).fill('1200'); await page.locator(amount).press('Tab');
    await page.locator(unit).scrollIntoViewIfNeeded();
    await page.screenshot({animations:'disabled',path:path.join(out,'phone-annual-entry.png')});
    await page.locator(`[data-act="payMode"][data-v="months"]`).click();
    const month=await page.evaluate(({id,year})=>Ledger.model.payMonths(Ledger.S.budget.lines.find(l=>l.id===id),year)[0],{id,year});
    assert.equal(await page.evaluate(({id,year,month})=>{const l=Ledger.S.budget.lines.find(l=>l.id===id);return Ledger.model.lineInMonth(l,`${year}-${String(month).padStart(2,'0')}`,Ledger.model.amt(l,year));},{id,year,month}),1200);
    await page.locator(`[data-act="payMonth"][data-m="${month===9?6:9}"]`).click();
    assert.equal(await page.evaluate(({id,year,month})=>{const l=Ledger.S.budget.lines.find(l=>l.id===id);return Ledger.model.lineInMonth(l,`${year}-${String(month).padStart(2,'0')}`,Ledger.model.amt(l,year));},{id,year,month}),600);
    await page.screenshot({animations:'disabled',path:path.join(out,'phone-annual-amount.png')});
    await page.locator('#modal-close').click();
    assert.equal(await page.locator(`#page [data-edit="amt"][data-id="${id}"]`).inputValue(),'1,200');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.setViewportSize({width:1280,height:900});
    await page.screenshot({animations:'disabled',path:path.join(out,'desktop-budget.png')});
    const seed=await page.evaluate(()=>{const s=Ledger.demoState();s.meta.starterData=true;s.checklist={};s.monthlyReports={};return s;});
    await page.locator('#side-foot [data-act="lock"]').click();
    await page.locator('#gate-households').waitFor({state:'visible'});
    assert.deepEqual(external,[]); assert.deepEqual(errors,[]);
    // A separate browser has no demo preferences or login state. Never use the real encrypted file.
    const parent=await browser.newContext({viewport:{width:390,height:844}}), p=await parent.newPage(), requests=[];
    let file={payload:await encrypted(seed,'246810'),sha:'seed'}, writes=0;
    p.on('pageerror',e=>errors.push(e.message));
    await p.route('**/*',async route=>{
      const r=route.request(),u=new URL(r.url());
      if(u.hostname==='127.0.0.1') return route.continue();
      if(u.hostname!=='api.github.com') throw new Error('Unexpected external request');
      requests.push(u.pathname);
      assert.ok(u.pathname.endsWith('/contents/ledger-sal-phil.json'),'must only access the parents file');
      if(r.method()==='PUT'){
        const body=r.postDataJSON(); assert.equal(body.sha,file.sha);
        file={payload:JSON.parse(Buffer.from(body.content,'base64').toString()),sha:'saved-'+(++writes)};
        return route.fulfill({status:200,json:{content:{sha:file.sha}}});
      }
      return route.fulfill({status:200,json:{sha:file.sha,content:Buffer.from(JSON.stringify(file.payload)).toString('base64')}});
    });
    await p.goto(url); await p.locator('[data-household="sal"]').click();
    await p.locator('#pat-input').fill('test-token'); await p.locator('#pat-btn').click();
    assert.match(await p.locator('#pin-household').textContent(),/Sal & Phil/);
    await p.locator('#pin-input').fill('000000'); await p.waitForFunction(()=>document.getElementById('pin-error').textContent.includes('Try again'));
    await p.locator('#pin-input').fill('246810'); await p.locator('#tour.on').waitFor();
    assert.match(await p.locator('#tour-title').textContent(),/Sal & Phil/);
    await p.keyboard.press('Escape'); assert.match(await p.locator('#preview-bar').textContent(),/Example figures/);
    await p.locator('#settings-btn').click(); await p.locator('[data-act="changePin"]').click();
    await p.locator('#pin-current').fill('246810'); await p.locator('#pin-new').fill('864209'); await p.locator('#pin-confirm').fill('864200');
    await p.locator('#change-pin-submit').click(); assert.match(await p.locator('#change-pin-error').textContent(),/do not match/);
    await p.locator('#pin-confirm').fill('864209'); await p.locator('#change-pin-submit').click();
    await p.waitForFunction(()=>!Ledger.modal.isOpen); assert.equal(writes,1);
    await p.reload(); await p.locator('#pin-input').fill('246810'); await p.waitForFunction(()=>document.getElementById('pin-error').textContent.includes('Try again'));
    await p.locator('#pin-input').fill('864209'); await p.locator('#page .update-card').waitFor();
    assert.equal(await p.locator('#tour.on').count(),0);
    await p.screenshot({animations:'disabled',path:path.join(out,'phone-parents-starter.png')});
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.ok(requests.length>0);assert.deepEqual(errors,[]);
    console.log('PASS: one-tap demo, eight-step guide/replay, annual conversion/timing, phone/desktop layout, household routing, wrong PIN, PIN change/relock. Mocked saves only.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
