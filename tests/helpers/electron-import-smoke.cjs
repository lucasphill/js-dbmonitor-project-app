// Opt-in real Electron acceptance; hidden window, disposable local profile store.
// Run: node_modules/.bin/electron tests/helpers/electron-import-smoke.cjs
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const Module=require('node:module');
const electron=require('electron');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dbmonitor-import-electron-'));
electron.app.disableHardwareAcceleration();electron.app.getAppPath=()=>path.resolve(__dirname,'../..');electron.app.requestSingleInstanceLock=()=>true;electron.app.setName('DBMonitorImportSmoke');electron.app.setPath('userData',dir);
process.env.DBMONITOR_USER_DATA_DIR=dir;
let fixtureWindow;
class HiddenWindow extends electron.BrowserWindow {constructor(options){super({...options,show:false,webPreferences:{...options.webPreferences,offscreen:true,backgroundThrottling:false}});fixtureWindow=this;}show(){}showInactive(){}}
const originalLoad=Module._load;
Module._load=function(id,...args){return id==='electron'?{...electron,BrowserWindow:HiddenWindow}:originalLoad.call(this,id,...args);};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let timeout=setTimeout(()=>{console.error('Electron import smoke timeout');electron.app.exit(1);},60000);
electron.app.on('will-quit',()=>{clearTimeout(timeout);const resolved=path.resolve(dir);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('dbmonitor-import-electron-'))fs.rmSync(resolved,{recursive:true,force:true});});
require('../../electron/main.cjs');
(async()=>{
 await electron.app.whenReady();
 let win;for(let i=0;i<400;i++){win=fixtureWindow;if(win&&!win.webContents.isLoading())break;await delay(100);}
 assert.ok(win);
 const evaluate=expression=>win.webContents.executeJavaScript(expression,true);
 async function wait(expression){for(let i=0;i<100;i++){if(await evaluate(expression))return;await delay(50);}throw new Error('UI condition failed: '+expression);}
 async function click(text){await wait(`Array.from(document.querySelectorAll('button,[role="option"]')).some(e=>e.textContent.trim()===${JSON.stringify(text)})`);await evaluate(`Array.from(document.querySelectorAll('button,[role="option"]')).find(e=>e.textContent.trim()===${JSON.stringify(text)}).click()`);await delay(70);}
 async function fill(label,value){await evaluate(`(()=>{const e=Array.from(document.querySelectorAll('label')).find(e=>e.textContent.startsWith(${JSON.stringify(label)})).querySelector('input,textarea');Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await delay(70);}
 await wait('!!window.bdash && !!document.querySelector("button")');
 const before=await evaluate('window.bdash.listConnectionProfiles()');
 const started=Date.now();
 await click('Configurações');await click('Adicionar origem');
 await evaluate(`Array.from(document.querySelectorAll('label')).find(e=>e.textContent.startsWith('Autenticação')).querySelector('button').click()`);await delay(100);
 await click('AWS via SSM + IAM');
 const command='aws ssm start-session --region sa-east-1 --target i-0123456789abcdef0 --document-name AWS-StartPortForwardingSessionToRemoteHost --parameters host="test.abc.sa-east-1.rds.amazonaws.com",portNumber="5432",localPortNumber="15432"';
 await fill('Comando de conexão SSM',command);await click('Importar comando');await wait('document.body.textContent.includes("Revise antes de aplicar")');
 assert.equal(await evaluate(`Array.from(document.querySelectorAll('label')).find(e=>e.textContent.startsWith('Endpoint PostgreSQL')).querySelector('input').value`),'');
 fs.mkdirSync(path.join(__dirname,'../../.electron-cache'),{recursive:true});fs.writeFileSync(path.join(__dirname,'../../.electron-cache/import-preview.png'),(await win.webContents.capturePage()).toPNG());
 await click('Aplicar dados');await fill('Nome do perfil','Import smoke');await fill('Usuário do PostgreSQL','observer');
 assert.equal(await evaluate('document.querySelector("textarea").value'),'');
 await click('Criar perfil');
 await wait('document.body.textContent.includes("Import smoke") && !document.querySelector("textarea")');
 const cadastroMs=Date.now()-started;
 const after=await evaluate('window.bdash.listConnectionProfiles()');
 assert.equal(after.activeProfileId,before.activeProfileId);assert.equal(after.generation,before.generation);
 const profile=after.profiles.find(p=>p.label==='Import smoke');assert.ok(profile);assert.equal(profile.host,'test.abc.sa-east-1.rds.amazonaws.com');assert.equal(profile.ssmLocalPort,15432);assert.equal(profile.dbUser,'observer');
 const response=await evaluate(`window.bdash.importSsmConnectionCommand(${JSON.stringify(command+'; SECRET_SMOKE')})`);
 assert.equal(response.ok,false);assert.equal(response.error.code,'SSM_IMPORT_UNSAFE_CONTENT');assert.ok(!response.error.message.includes('SECRET_SMOKE'));
 // Deadline/format measurement through actual IPC, including exact UTF8 limit.
 const base='aws ssm start-session --document-name AWS-StartPortForwardingSessionToRemoteHost';
 const variants=[command,command.replaceAll(' --',' \\\n --'),command.replaceAll(' --',' `\r\n --'),base+' --region=sa-east-1 --target=i-0123456789abcdef0 --parameters '+JSON.stringify({host:['test.abc.sa-east-1.rds.amazonaws.com'],portNumber:['5432'],localPortNumber:['15432']})];
 const times=[];for(const text of [...variants,base+' '.repeat(16384-Buffer.byteLength(base))]){const t=Date.now();const result=await evaluate(`window.bdash.importSsmConnectionCommand(${JSON.stringify(text)})`);times.push(Date.now()-t);assert.equal(result.ok,true);assert.ok(result.data.patch);}
 // Reopen/edit actual persisted profile through the form without activating it.
 await evaluate(`(()=>{const row=Array.from(document.querySelectorAll('[class]')).filter(e=>e.textContent.includes('Import smoke')&&e.querySelector('button')).sort((a,b)=>a.textContent.length-b.textContent.length)[0]; const b=Array.from(row.querySelectorAll('button')).find(b=>b.textContent.includes('Editar'));if(b)b.click();})()`);
 await wait('!!document.querySelector("textarea")');
 assert.equal(await evaluate(`Array.from(document.querySelectorAll('label')).find(e=>e.textContent.startsWith('Endpoint PostgreSQL')).querySelector('input').value`),profile.host);
 await fill('Comando de conexão SSM',base+' --target i-1234abcd');await click('Importar comando');await wait('document.body.textContent.includes("Revise antes de aplicar")');
 await fill('Nome do perfil','Import smoke edited');assert.equal(await evaluate('document.body.textContent.includes("Revise antes de aplicar")'),false);
 await click('Importar comando');await wait('document.body.textContent.includes("Revise antes de aplicar")');await click('Aplicar dados');await click('Salvar alterações');
 await wait('!document.querySelector("textarea")');
 const changed=(await evaluate('window.bdash.listConnectionProfiles()')).profiles.find(p=>p.id===profile.id);assert.equal(changed.ssmTarget,'i-1234abcd');assert.equal(changed.ssmLocalPort,15432);assert.equal(changed.host,profile.host);
 const runtime=await evaluate('window.bdash.getConnectionStatus()');assert.equal(runtime.sourceContext.profileId,before.activeProfileId);
 console.log(JSON.stringify({acceptance:'PASS',platform:process.platform,cadastroMs,ipcImportMaxMs:Math.max(...times),formats:variants.length,activeProfilePreserved:true,editedSameIdentity:true}));
 clearTimeout(timeout);win.destroy();electron.app.exit(0);process.exit(0);
})().catch(error=>{console.error(error.stack);clearTimeout(timeout);electron.app.exit(1);});
