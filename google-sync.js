/* Personal Finance Google Sheets sync. OAuth token is memory-only. */
(() => {
'use strict';
const CONF='abas-finance-google-config-v1';
let config={clientId:'',sheetId:''},token='',client=null,timer=null,busy=false,pending=false,synced=false;
try {config={...config,...JSON.parse(localStorage.getItem(CONF)||'{}')}} catch(e){}
const status=(msg,kind='')=>{let el=document.getElementById('cloud-status');if(el){el.textContent=msg;el.style.color=kind==='error'?'#b22f45':'#5b6278'}};
const url='https://sheets.googleapis.com/v4/spreadsheets/';
async function api(path,opts={}){
 if(!token)throw Error('ยังไม่ได้เข้าสู่ระบบ Google');
 let res=await fetch(url+path,{...opts,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(opts.headers||{})}});
 if(!res.ok){let e=await res.json().catch(()=>({}));throw Error(e.error?.message||('Google API '+res.status))}
 return res.json();
}
const tableNames=['FinanceApp','Transactions','Accounts','Budgets'];
async function ensureTab(){
 const meta=await api(encodeURIComponent(config.sheetId)+'?fields=sheets.properties.title');
 const existing=new Set((meta.sheets||[]).map(s=>s.properties.title));
 const requests=tableNames.filter(name=>!existing.has(name)).map(title=>({addSheet:{properties:{title}}}));
 if(requests.length)await api(encodeURIComponent(config.sheetId)+':batchUpdate',{method:'POST',body:JSON.stringify({requests})});
}
function snapshot(){return JSON.stringify({schema:1,savedAt:new Date().toISOString(),data:state})}
async function remote(){
 const r=await api(encodeURIComponent(config.sheetId)+'/values/'+encodeURIComponent('FinanceApp!A1:A3000'));
 const rows=(r.values||[]).map(a=>a[0]||'');
 if(!rows.length||rows[0]!=='PF-SNAPSHOT-1')return null;
 let n=Number(rows[1]);if(!Number.isInteger(n)||n<1||n>2990)throw Error('รูปแบบข้อมูลบนชีตไม่ถูกต้อง');
 let obj=JSON.parse(rows.slice(2,n+2).join(''));
 if(!obj.data||!Array.isArray(obj.data.accounts)||!Array.isArray(obj.data.transactions))throw Error('ข้อมูลบนชีตไม่สมบูรณ์');
 return obj;
}
async function upload(){
 const payload=snapshot(),chunks=payload.match(/[\s\S]{1,25000}/g)||[''];
 if(chunks.length>2990)throw Error('ข้อมูลมากเกินขนาดที่รองรับ');
 const values=[['PF-SNAPSHOT-1'],[String(chunks.length)],...chunks.map(x=>[x])];
 await api(encodeURIComponent(config.sheetId)+'/values/'+encodeURIComponent('FinanceApp!A1:A3000')+':clear',{method:'POST',body:'{}'});
 await api(encodeURIComponent(config.sheetId)+'/values/'+encodeURIComponent('FinanceApp!A1')+'?valueInputOption=RAW',{method:'PUT',body:JSON.stringify({values,majorDimension:'ROWS'})});
}
function rowsForSheets(){
 const acc=state.accounts||[],tx=state.transactions||[], budgets=state.budgets||{};
 const names=new Map(acc.map(a=>[a.id,a.name]));
 const accountRows=[['Account ID','Account Name','Opening Balance (THB)'],...acc.map(a=>[a.id,a.name,Number(a.opening)||0])];
 const transactionRows=[['Transaction ID','Date','Type','Category','Amount (THB)','Account','Destination Account','Note','Account ID','Destination Account ID'],...tx.map(t=>[t.id,t.date,t.type,t.category||'',Number(t.amount)||0,names.get(t.account)||'',names.get(t.to)||'',t.note||'',t.account||'',t.to||''])];
 const budgetRows=[['Category','Monthly Budget (THB)'],...Object.entries(budgets).map(([name,amount])=>[name,Number(amount)||0])];
 return [{name:'Transactions',values:transactionRows},{name:'Accounts',values:accountRows},{name:'Budgets',values:budgetRows}];
}
async function publishTables(){
 const id=encodeURIComponent(config.sheetId), tables=rowsForSheets();
 // Snapshot remains untouched: these are readable views, not the recovery source.
 const ranges=tables.map(t=>t.name+'!A1:J5000');
 await api(id+'/values:batchClear',{method:'POST',body:JSON.stringify({ranges})});
 await api(id+'/values:batchUpdate',{method:'POST',body:JSON.stringify({
  valueInputOption:'RAW',data:tables.map(t=>({range:t.name+'!A1',majorDimension:'ROWS',values:t.values}))
 })});
}
async function flush(){
 if(busy){pending=true;return}if(!synced||!token)return;
 busy=true;try{await upload();await publishTables();status('✓ บันทึกข้อมูลและอัปเดตตาราง Transactions / Accounts / Budgets แล้ว '+new Date().toLocaleTimeString('th-TH'))}catch(e){status('ซิงก์ไม่สำเร็จ: '+e.message+' (ข้อมูลยังอยู่ในเครื่องนี้)','error')}finally{busy=false;if(pending){pending=false;schedule()}}
}
function schedule(){if(!synced)return;clearTimeout(timer);timer=setTimeout(flush,1200)}
async function initialize(){
 if(!config.clientId||!config.sheetId)throw Error('กรุณาระบุ OAuth Client ID และ Spreadsheet ID ก่อน');
 if(!window.google?.accounts?.oauth2)throw Error('ยังโหลด Google Sign-In ไม่สำเร็จ โปรดลองใหม่');
 client=google.accounts.oauth2.initTokenClient({client_id:config.clientId,scope:'https://www.googleapis.com/auth/spreadsheets',callback:async response=>{
 if(response.error){status('Google Sign-In: '+response.error,'error');return}
 token=response.access_token;synced=false;
 try{
 status('กำลังตรวจข้อมูลบน Google Sheets...');
 await ensureTab();
 const cloud=await remote();
 if(cloud){
  const localData=state.transactions.length>0||state.accounts.some(a=>Number(a.opening)!==0)||Object.values(state.budgets).some(Number);
  const cloudData=cloud.data;
  if(localData){
   const selection=confirm('พบข้อมูลบน Google Sheets แล้ว\nกด OK เพื่อโหลดข้อมูลจาก Google Sheets ลงเครื่องนี้\nกด Cancel เพื่อเก็บข้อมูลในเครื่องไว้ก่อน (ยังไม่เปิดซิงก์)\n\nโปรดตรวจสอบก่อนเลือกเพื่อป้องกันข้อมูลทับกัน');
   if(!selection){status('หยุดการเชื่อมต่อเพื่อป้องกันข้อมูลถูกแทนที่');return}
  }
  state=cloudData;localStorage.setItem(KEY,JSON.stringify(state));render();
 }else if(state.transactions.length||Object.values(state.budgets).some(Number)||state.accounts.some(a=>Number(a.opening)!==0)){
  if(!confirm('Google Sheets ยังว่างอยู่ ต้องการย้ายข้อมูลจากเครื่องนี้ขึ้น Google Sheets ใช่ไหม?')){status('ยังไม่เปิดซิงก์');return}
 }
 synced=true;await flush();status('✓ เชื่อมต่อแล้ว — บันทึกลง Google Sheets อัตโนมัติ');
 }catch(e){synced=false;status('เชื่อมต่อไม่สำเร็จ: '+e.message,'error')}
 }});
 client.requestAccessToken({prompt:'consent'});
}
window.cloudSync={
 saveSettings(){config={clientId:document.getElementById('google-client').value.trim(),sheetId:document.getElementById('google-sheet').value.trim()};localStorage.setItem(CONF,JSON.stringify(config));status('บันทึกค่าการเชื่อมต่อแล้ว กรุณากดเชื่อมต่อ Google')},
 connect(){initialize().catch(e=>status(e.message,'error'))},
 afterSave(){schedule()},
 configured(){return config},
 isReady(){return synced}
};
})();