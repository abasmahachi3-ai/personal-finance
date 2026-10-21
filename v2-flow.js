/* V2 guided financial flow. Preserves historic transactions and balances. */
(function(){
'use strict';
const today=()=>new Date().toLocaleDateString('sv-SE').slice(0,7);
const fmt=n=>money(Number(n)||0);
const curr=()=>typeof viewedMonth==='string'?viewedMonth:today();
const oldDashboard=dashboard;
const oldBudgets=budgets;
const oldSubmit=window.v2SubmitTx;
const oldTransfer=window.v2SubmitTransfer;
let toastTimer;
function notify(message){let x=document.getElementById('v2-toast');if(!x){x=document.createElement('div');x.id='v2-toast';x.style.cssText='position:fixed;bottom:105px;left:50%;transform:translateX(-50%);padding:12px 18px;background:#e5e7eb;color:#181a1d;border-radius:12px;z-index:99;box-shadow:0 8px 30px #0008;max-width:94vw;text-align:center';document.body.append(x)}x.textContent=message;clearTimeout(toastTimer);toastTimer=setTimeout(()=>x.remove(),3800)}
function guide(){
 const now=today(), plan=state.v2?.monthly?.[now];
 const income=state.transactions.filter(t=>t.type==='income'&&t.date?.slice(0,7)===now).reduce((s,t)=>s+Number(t.amount||0),0);
 const transfers=state.transactions.filter(t=>t.type==='transfer'&&t.date?.slice(0,7)===now).length;
 const expense=state.transactions.filter(t=>t.type==='expense'&&t.date?.slice(0,7)===now).length;
 const planned=plan?.status==='confirmed';
 const steps=[
 {label:'บันทึกรายรับจริง',done:income>0,desc:income>0?'รับแล้ว '+fmt(income):'เมื่อเงินเดือนเข้าบัญชี ให้บันทึกเพียงครั้งเดียว',action:'v2StartIncome()',cta:'เพิ่มรายรับ'},
 {label:'จัดสรรและยืนยันงบ',done:planned,desc:planned?'แผนเดือนนี้พร้อมใช้งาน':'ใช้ Monthly Template แล้วปรับก่อนยืนยัน',action:"go('budgets')",cta:'ตั้งแผน'},
 {label:'บันทึกรายจ่ายหรือโอนเข้า EF',done:expense+transfers>0,desc:expense+transfers>0?'มีรายการแล้ว '+(expense+transfers)+' รายการ':'บันทึกธุรกรรมจริง ไม่ใช่การตัดยอดจากแผน',action:'openTransaction()',cta:'เพิ่มรายการ'},
 {label:'ติดตามผลจริง',done:false,desc:'ตรวจงบใกล้เต็มและเงินออมจริง',action:'v2TrackProgress()',cta:'ดูผล'}];
 return '<div class="card v2-flow-guide"><div class="v2-inline"><h2 style="margin:0">เส้นทางการเงินเดือนนี้</h2><span class="v2-pill">'+steps.filter(x=>x.done).length+'/3 ขั้นตอน</span></div><p class="v2-subtle">บันทึกรายรับ → จัดสรรงบ → บันทึกรายจ่าย/โอนเงิน → ติดตามผล</p>'+steps.map((x,i)=>'<div class="v2-row"><div style="flex:1"><strong>'+(x.done?'✓ ':'')+(i+1)+'. '+x.label+'</strong><div class="v2-subtle">'+x.desc+'</div></div><button class="btn secondary small" onclick="'+x.action+'">'+x.cta+'</button></div>').join('')+'</div>';
}
window.v2StartIncome=function(){openTransaction();window.v2Type('income')};
window.v2TrackProgress=function(){go('budgets');window.v2PlanTab('progress')};
dashboard=function(){return guide()+oldDashboard()};
budgets=function(){const html=oldBudgets();return '<div class="v2-inline"><span class="v2-pill">Flow ใหม่ · รายรับ → แผน → ติดตาม</span><button class="btn secondary small" onclick="go(\'dashboard\')">กลับหน้าแรก</button></div>'+html};
window.v2SubmitTx=function(event){
 const submit=document.querySelector('#modal button[type="submit"]');
 if(submit?.disabled){event.preventDefault();return}
 const before=state.transactions.length, editingBefore=editing;
 const amountField=document.getElementById('tx-amount'),accountField=document.getElementById('tx-account');
 const amt=Number(amountField?.value||0);
 const kind=document.getElementById('tx-type')?.value;
 if(amt<=0||!Number.isFinite(amt)){event.preventDefault();alert('จำนวนเงินไม่ถูกต้อง');return}
 if(kind==='expense'||kind==='transfer'){
 const a=state.accounts.find(x=>x.id===accountField?.value);
 if(a&&balance(a)<amt&&!editingBefore){event.preventDefault();alert('ยอดเงินในบัญชีไม่เพียงพอ กรุณาตรวจสอบบัญชี');return}
 }
 if(submit)submit.disabled=true;
 try{oldSubmit(event);if(state.transactions.length>before||editingBefore){try{localStorage.setItem('abas-finance-v2-last-account',accountField.value)}catch(e){}notify('บันทึกในเครื่องแล้ว · ยังไม่ซิงก์ Google Sheets')}}finally{if(submit?.isConnected)submit.disabled=false}
};
const oldOpenTx=openTransaction;
openTransaction=function(id){oldOpenTx(id);if(!id){try{let last=localStorage.getItem('abas-finance-v2-last-account');let el=document.getElementById('tx-account');if(last&&el?.querySelector('option[value="'+last.replace(/[^A-Za-z0-9_-]/g,'')+'"]'))el.value=last}catch(e){}}};
window.v2SubmitTransfer=function(event){const before=state.transactions.length;oldTransfer(event);if(state.transactions.length>before)notify('โอนระหว่างบัญชีแล้ว · ยอดเงินรวมไม่เพิ่ม')};
const originalGo=go;
go=function(key){originalGo(key);if(key==='dashboard'){let guideEl=document.querySelector('.v2-flow-guide');if(guideEl&&state.v2?.monthly?.[today()]?.status==='confirmed')guideEl.setAttribute('aria-label','แผนเงินพร้อมใช้งาน')}};
render();
})();