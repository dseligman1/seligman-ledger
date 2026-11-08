const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { webcrypto: crypto } = require('node:crypto');
const b64 = x => Buffer.from(x).toString('base64');
async function key(pin,salt){
  const km=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:210000,hash:'SHA-256'},km,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function encrypt(state,pin){
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(pin,salt),new TextEncoder().encode(JSON.stringify(state)));
  return {v:1,salt:b64(salt),iv:b64(iv),data:b64(ct)};
}
async function decrypt(payload,pin){
  const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(payload.iv,'base64')},await key(pin,Buffer.from(payload.salt,'base64')),Buffer.from(payload.data,'base64'));
  return JSON.parse(new TextDecoder().decode(pt));
}
function harness(household='sal'){
  const files={}, requests=[], ls=new Map([['ledger_pat','test-token']]), ss=new Map([['ledger_household',household]]);
  const storage=m=>({getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)});
  const h={files,requests,failWrite:false};
  const box=vm.createContext({window:{}, location:{search:''}, localStorage:storage(ls),sessionStorage:storage(ss),URLSearchParams,crypto,TextEncoder,TextDecoder,btoa,atob,setTimeout,clearTimeout,
    fetch:async (url,options={})=>{
      const file=new URL(url).pathname.split('/contents/')[1], method=options.method||'GET'; requests.push({file,method});
      const response=(status,data)=>({status,ok:status>=200&&status<300,json:async()=>data});
      if(method==='PUT'){
        if(h.failWrite) return response(500,{});
        const body=JSON.parse(options.body);
        if(files[file] && files[file].sha!==body.sha) return response(409,{});
        files[file]={sha:'new-'+requests.length,payload:JSON.parse(Buffer.from(body.content,'base64').toString())};
        return response(200,{content:{sha:files[file].sha}});
      }
      return files[file] ? response(200,{sha:files[file].sha,content:b64(JSON.stringify(files[file].payload))}) : response(404,{});
    }});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/core.js'),'utf8'),box);
  h.L=box.window.Ledger; return h;
}
const seed=()=>({meta:{},accounts:[{id:'a',name:'Example account',bucket:'savings',tags:[]}],budget:{years:[2026],lines:[]}});
test('households route to separate files and parents never fall back to original data',async()=>{
  const h=harness(), {L}=h;
  h.files['ledger.json']={sha:'dan',payload:await encrypt(seed(),'135790')};
  assert.equal((await L.store.unlock('246810')).state,null);
  assert.deepEqual(h.requests.map(x=>x.file),['ledger-sal-phil.json']);
  assert.equal(L.CFG.uiKey,'ledger_ui_v2_sal');
  const d=harness('dan'); assert.equal(d.L.CFG.file,'ledger.json'); assert.equal(d.L.CFG.legacyFile,'data.json'); assert.equal(d.L.CFG.uiKey,'ledger_ui_v2');
});
test('PIN rotation persists only the selected household and rejects the old PIN',async()=>{
  const h=harness(), {L}=h;
  h.files['ledger-sal-phil.json']={sha:'s1',payload:await encrypt(seed(),'246810')};
  h.files['ledger.json']={sha:'dan',payload:await encrypt(seed(),'135790')};
  const original=JSON.stringify(h.files['ledger.json']);
  const {state}=await L.store.unlock('246810');
  await L.store.changePin('246810','864209',state);
  const saved=h.files['ledger-sal-phil.json'].payload;
  assert.equal(JSON.stringify(h.files['ledger.json']),original);
  assert.deepEqual(await decrypt(saved,'864209'),JSON.parse(JSON.stringify(state)));
  await assert.rejects(decrypt(saved,'246810'));
  assert.equal(L.store.pin,'864209');
  assert.ok(h.requests.every(x=>x.file==='ledger-sal-phil.json'));
});
test('failed or concurrent PIN changes keep the original key and remote data',async()=>{
  const h=harness(), {L}=h;
  h.files[L.CFG.file]={sha:'s1',payload:await encrypt(seed(),'246810')};
  const {state}=await L.store.unlock('246810'), original=JSON.stringify(h.files[L.CFG.file]);
  await assert.rejects(L.store.changePin('000000','864209',state),/current PIN/);
  h.failWrite=true; await assert.rejects(L.store.changePin('246810','864209',state),/write failed/);
  assert.equal(L.store.pin,'246810'); assert.equal(L.store.rotating,false); assert.equal(JSON.stringify(h.files[L.CFG.file]),original);
  h.failWrite=false; h.files[L.CFG.file].sha='other-device';
  await assert.rejects(L.store.changePin('246810','864209',state),/another device/);
  assert.equal(L.store.pin,'246810');
});
test('a stale unlocked device cannot overwrite data after another device changes the PIN',async()=>{
  const h=harness(), {L}=h;
  h.files[L.CFG.file]={sha:'s1',payload:await encrypt(seed(),'246810')};
  const {state}=await L.store.unlock('246810');
  h.files[L.CFG.file]={sha:'s2',payload:await encrypt(seed(),'864209')};
  const before=JSON.stringify(h.files[L.CFG.file]); L.store.dirty=true;
  await L.store.flush(state);
  assert.equal(JSON.stringify(h.files[L.CFG.file]),before); assert.equal(L.store.dirty,true);
  assert.equal(h.requests.filter(x=>x.method==='PUT').length,0);
});
