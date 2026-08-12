(() => {
"use strict";
const LS_KEY="budgetPackStateV1", PROFILE_KEY="budgetPackProfileV1", THEME_KEY="budgetPackThemeV1";
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const pad=n=>String(n).padStart(2,"0");
const isoDate=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const today=()=>isoDate(new Date());
const uid=(p="id")=>`${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,9)}`;
const money=n=>new Intl.NumberFormat("fr-CA",{style:"currency",currency:"CAD",maximumFractionDigits:2}).format(Number(n||0));
const fmtDate=s=>new Date(`${s}T12:00:00`).toLocaleDateString("fr-CA",{weekday:"short",day:"numeric",month:"short"});
const monthKey=s=>String(s).slice(0,7);
const parseLocal=s=>new Date(`${s}T12:00:00`);
const addDays=(s,n)=>{const d=parseLocal(s);d.setDate(d.getDate()+n);return isoDate(d)};
const daysBetween=(a,b)=>Math.round((parseLocal(b)-parseLocal(a))/86400000);
const deepClone=o=>JSON.parse(JSON.stringify(o));
const nowIso=()=>new Date().toISOString();

const merchants=["Tim Hortons","Dépanneur","Épicerie","McDo / resto","Pharmacie","Amazon","Maison / réno","Enfants","Vêtements","Loisirs","Cadeaux","Auto","Animaux","Autre"];
const categories=["Épicerie","Resto / café","Dépanneur","Maison / réno","Enfants","Pharmacie","Vêtements","Loisirs","Cadeaux","Auto","Animaux","Facture","Autre"];

function seedBills(){
  const mk=(name,amount,dueDay,category="Facture",variable=false)=>({id:uid("bill"),name,amount,dueDay,category,frequency:"monthly",variable,autopay:false,active:true,statuses:{},createdAt:nowIso(),updatedAt:nowIso()});
  return [
    mk("Assurances",615,1), mk("Hydro",445,20,"Facture",true), mk("Netflix",20,20),
    mk("Visa",300,20,"Facture",true), mk("Fairstone",672,21), mk("Prêt 1",225,21),
    mk("Vidéotron",160,22), mk("Cogeco",80,24), mk("Hypothèque",1054,30),
    mk("Taxes municipales",200,15)
  ];
}
function defaultState(){
  return {
    settings:{familyName:"Budget familial",startBalance:0,startBalanceDate:today(),trackingStartDate:today(),overdraftLimit:1000,groceryBudget:300,categoryBudgets:{},historyMonths:"12",reminderHour:9,sundayReminder:true,dayBeforeReminder:true,lateReminder:true,timezone:"America/Toronto",updatedAt:nowIso()},
    bills:seedBills(),
    transactions:[],
    incomeSchedules:[
      {id:uid("inc"),name:"Ma paie",frequency:"weekly",weekday:4,amount:null,active:true,updatedAt:nowIso()},
      {id:uid("inc"),name:"Paie conjointe",frequency:"monthly",dueDay:1,amount:1534,active:true,updatedAt:nowIso()},
      {id:uid("inc"),name:"Paie conjointe",frequency:"monthly",dueDay:20,amount:3600,active:true,updatedAt:nowIso()}
    ],
    goals:[],
    archives:{},
    updatedAt:nowIso()
  };
}
let state=loadState(), summaryCursor=new Date(), calendarDays=14, historyFilter="all", cloudBusy=false, cloudTimer=null, oneSignalReady=false;
let profile=loadProfile();

function loadState(){try{return JSON.parse(localStorage.getItem(LS_KEY))||defaultState()}catch{return defaultState()}}
function loadProfile(){try{return JSON.parse(localStorage.getItem(PROFILE_KEY))||{apiUrl:"",token:"",memberId:"",memberName:"",familyId:"",joinCode:"",cloudVersion:0,oneSignalAppId:""}}catch{return {apiUrl:"",token:"",memberId:"",memberName:"",familyId:"",joinCode:"",cloudVersion:0,oneSignalAppId:""}}}
function saveProfile(){localStorage.setItem(PROFILE_KEY,JSON.stringify(profile))}
function saveState(skipCloud=false){
  state.updatedAt=nowIso(); localStorage.setItem(LS_KEY,JSON.stringify(state)); render();
  if(!skipCloud && profile.token && profile.apiUrl){clearTimeout(cloudTimer);cloudTimer=setTimeout(pushCloud,650)}
}
function touchSettings(){state.settings.updatedAt=nowIso()}
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.remove("hidden");clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.add("hidden"),2200)}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}

function applyTheme(name,custom){
  const r=document.documentElement, themes={
    beast:["#090b0a","#151816","#1d211e","#f7f8f7","#aab2ac","#7CFF00","#081000"],
    rose:["#130d11","#21141d","#2b1a27","#fff6fb","#ceb6c6","#ff74b7","#250011"],
    violet:["#100d17","#1b1626","#241d33","#fbf8ff","#bfb6cf","#b18cff","#120625"],
    blue:["#091118","#101d26","#172935","#f5fbff","#aac0cf","#52b7ff","#00131f"],
    light:["#f4f5f4","#ffffff","#edf0ed","#151915","#667066","#47a800","#ffffff"],
    dark:["#080808","#141414","#202020","#fafafa","#b5b5b5","#eeeeee","#111111"]
  };
  let vals=themes[name]||themes.beast;if(name==="custom"&&custom){vals=[...themes.beast];vals[5]=custom}
  ["--bg","--card","--card2","--text","--muted","--accent","--accentText"].forEach((k,i)=>r.style.setProperty(k,vals[i]));
  document.querySelector('meta[name="theme-color"]').setAttribute("content",vals[0]);
  localStorage.setItem(THEME_KEY,JSON.stringify({name,custom}));
}
function initTheme(){try{const t=JSON.parse(localStorage.getItem(THEME_KEY));if(t)applyTheme(t.name,t.custom)}catch{}}

function lastDay(y,m){return new Date(y,m,0).getDate()}
function monthlyDate(year,month1,day){return `${year}-${pad(month1)}-${pad(Math.min(day,lastDay(year,month1)))}`}
function billOccurrences(bill,from,to){
  if(!bill.active && !bill.endedAt) return [];
  let out=[];
  if(bill.frequency==="one"){
    if(bill.dueDate>=from&&bill.dueDate<=to) out=[bill.dueDate];
  } else if(bill.frequency==="weekly"){
    let d=bill.startDate||from;
    while(d<from)d=addDays(d,7);
    while(d<=to){out.push(d);d=addDays(d,7)}
  } else {
    let d=parseLocal(from), end=parseLocal(to);
    d.setDate(1);
    while(d<=end){
      const s=monthlyDate(d.getFullYear(),d.getMonth()+1,bill.dueDay||1);
      if(s>=from&&s<=to)out.push(s);
      d.setMonth(d.getMonth()+1);
    }
  }
  const activeFrom=bill.activeFrom||state.settings.trackingStartDate||state.settings.startBalanceDate||today();
  out=out.filter(x=>x>=activeFrom);
  if(bill.endedAt) out=out.filter(x=>x<=bill.endedAt);
  return out;
}
function incomeOccurrences(sched,from,to){
  if(!sched.active)return [];
  let out=[];
  if(sched.frequency==="monthly"){
    let d=parseLocal(from),end=parseLocal(to);d.setDate(1);
    while(d<=end){const s=monthlyDate(d.getFullYear(),d.getMonth()+1,sched.dueDay||1);if(s>=from&&s<=to)out.push(s);d.setMonth(d.getMonth()+1)}
  }else if(sched.frequency==="weekly"){
    let d=parseLocal(from),target=sched.weekday??4;
    while(d.getDay()!==target)d.setDate(d.getDate()+1);
    while(isoDate(d)<=to){out.push(isoDate(d));d.setDate(d.getDate()+7)}
  }
  return out;
}
function billStatus(bill,due){return (bill.statuses||{})[due]||{}}
function setBillStatus(bill,due,patch){
  bill.statuses=bill.statuses||{};bill.statuses[due]={...bill.statuses[due],...patch,updatedAt:nowIso()};bill.updatedAt=nowIso();saveState()
}
function dueItems(from=addDays(today(),-30),to=addDays(today(),31)){
  const arr=[];
  state.bills.forEach(b=>billOccurrences(b,from,to).forEach(due=>arr.push({kind:"bill",bill:b,due,status:billStatus(b,due)})));
  return arr.sort((a,b)=>a.due.localeCompare(b.due));
}
function nextPayDate(){
  const from=today(),to=addDays(from,60), dates=[];
  state.incomeSchedules.forEach(s=>incomeOccurrences(s,from,to).forEach(d=>dates.push({date:d,s})));
  dates.sort((a,b)=>a.date.localeCompare(b.date)); return dates[0]||null;
}
function currentBalance(){
  const start=state.settings.startBalanceDate||"1900-01-01";
  let v=Number(state.settings.startBalance||0);
  state.transactions.forEach(t=>{
    if(t.date<start)return;
    if(t.kind==="income")v+=Number(t.amount||0);
    if(t.kind==="expense")v-=Number(t.amount||0);
  });
  state.bills.forEach(b=>Object.entries(b.statuses||{}).forEach(([due,st])=>{
    const paidDate=(st.paidAt||"").slice(0,10);
    if(st.paidAt && paidDate>=start)v-=Number(st.paidAmount??b.amount??0);
  }));
  return v;
}
function overMonth(key=monthKey(today())){return state.transactions.filter(t=>t.kind==="over"&&monthKey(t.date)===key).reduce((s,t)=>s+Number(t.amount||0),0)}
function expensesWeek(){
  const d=new Date();const day=(d.getDay()+6)%7;const start=isoDate(new Date(d.getFullYear(),d.getMonth(),d.getDate()-day));const end=addDays(start,6);
  return state.transactions.filter(t=>t.kind==="expense"&&t.date>=start&&t.date<=end)
}
function availableToPay(){
  const bal=currentBalance(), np=nextPayDate(), end=np?.date||addDays(today(),14);
  const due=dueItems(today(),end).filter(x=>!x.status.paidAt).reduce((s,x)=>s+Number(x.bill.amount||0),0);
  return bal-due;
}

function render(){
  renderHome();renderGoals();renderCalendar();renderHistory();renderSummary();renderSettings();renderQuickMerchants();updateSyncLine();ensureNegativeBalanceButton();
}
function renderHome(){
  const bal=currentBalance();$("#budgetBalance").textContent=money(bal);$("#availableUntilPay").textContent=money(availableToPay());$("#overThisMonth").textContent=money(overMonth());
  const od=$("#overdraftCard");
  if(bal<0){const used=Math.abs(bal),limit=Number(state.settings.overdraftLimit||1000);od.innerHTML=`<div class="overdraft">🚨 <strong>Découvert utilisé ${money(used)} / ${money(limit)}</strong><div class="sub">Il reste ${money(Math.max(0,limit-used))} avant la limite.</div></div>`}else od.innerHTML="";
  const items=dueItems(addDays(today(),-31),addDays(today(),7));
  const upcoming=items.filter(x=>x.due>=today()&&!x.status.paidAt), late=items.filter(x=>x.due<today()&&!x.status.paidAt && (!x.status.snoozedUntil||x.status.snoozedUntil<=today()));
  $("#bills7").textContent=upcoming.length;$("#lateCount").textContent=late.length;
  const week=expensesWeek(), spend=week.reduce((s,t)=>s+Number(t.amount||0),0), groc=week.filter(t=>t.category==="Épicerie").reduce((s,t)=>s+Number(t.amount||0),0);
  $("#spendWeek").textContent=money(spend);$("#groceryWeek").textContent=`${money(groc)} / ${money(state.settings.groceryBudget||0)}`;
  const show=items.filter(x=>!x.status.paidAt && (x.due>=addDays(today(),-14))).slice(0,7);
  $("#homeBills").innerHTML=show.length?show.map(renderBillRow).join(""):`<div class="card muted">Aucun paiement urgent 🎉</div>`;
}
function renderBillRow(x){
  const late=x.due<today(), snooze=x.status.snoozedUntil&&x.status.snoozedUntil>today();
  let badge=late?`<span class="badge red">EN RETARD</span>`:`<span class="badge orange">${esc(fmtDate(x.due))}</span>`;
  if(snooze)badge=`<span class="badge orange">REPORTÉ AU ${esc(fmtDate(x.status.snoozedUntil))}</span>`;
  return `<div class="billRow"><div class="billMain"><div class="billTitle">${esc(x.bill.name)}</div><div class="sub">${esc(x.bill.category||"Facture")}</div>${badge}</div><div class="amount">${money(x.bill.amount)}</div><div class="rowActions"><button onclick="BP.payBill('${x.bill.id}','${x.due}')">✅</button><button onclick="BP.snooze('${x.bill.id}','${x.due}')">⏰</button></div></div>`
}
function renderGoals(){
  const el=$("#homeGoals");if(!el)return;
  el.innerHTML=state.goals.length?state.goals.map(g=>{const pct=Math.min(100,Math.round((Number(g.saved||0)/Math.max(1,Number(g.target||0)))*100));return `<div class="card"><div class="catTop"><strong>🎯 ${esc(g.name)}</strong><strong>${money(g.saved)} / ${money(g.target)}</strong></div><div class="bar"><i style="width:${pct}%"></i></div><button class="smallBtn" style="margin-top:9px" onclick="BP.addGoalMoney('${g.id}')">＋ Mettre de côté</button></div>`}).join(""):`<div class="card muted">Aucun objectif pour l'instant.</div>`;
}
function renderCalendar(){
  const from=today(),to=addDays(from,calendarDays), events=[];
  dueItems(from,to).forEach(x=>events.push({date:x.due,type:"bill",x}));
  state.incomeSchedules.forEach(s=>incomeOccurrences(s,from,to).forEach(date=>events.push({date,type:"income",sched:s})));
  events.sort((a,b)=>a.date.localeCompare(b.date));
  $("#calendarList").innerHTML=events.length?events.map(e=>{
    const d=parseLocal(e.date);
    if(e.type==="income") return `<div class="timelineRow"><div class="timelineDate">${d.toLocaleDateString("fr-CA",{weekday:"short"})}<b>${d.getDate()}</b></div><div class="historyMain"><div class="historyTitle">💵 ${esc(e.sched.name)}</div><div class="sub">${e.sched.amount==null?"Montant à entrer":money(e.sched.amount)}</div></div></div>`;
    const st=e.x.status, paid=!!st.paidAt;
    return `<div class="timelineRow"><div class="timelineDate">${d.toLocaleDateString("fr-CA",{weekday:"short"})}<b>${d.getDate()}</b></div><div class="historyMain"><div class="historyTitle">🧾 ${esc(e.x.bill.name)}</div><div class="sub">${paid?"Payée":(st.snoozedUntil?`Reportée au ${fmtDate(st.snoozedUntil)}`:"À payer")}</div></div><div class="amount ${paid?"okText":""}">${money(st.paidAmount??e.x.bill.amount)}</div></div>`;
  }).join(""):`<div class="card muted">Rien à afficher.</div>`;
}
function historyItems(){
  const arr=[];
  state.transactions.forEach(t=>arr.push({date:t.date,kind:t.kind,id:t.id,title:t.merchant||t.name||(t.kind==="income"?"Paie":"OVER"),amount:t.amount,category:t.category,member:t.memberName,note:t.note,raw:t}));
  state.bills.forEach(b=>Object.entries(b.statuses||{}).forEach(([due,st])=>{if(st.paidAt)arr.push({date:st.paidAt.slice(0,10),kind:"bill",id:`${b.id}|${due}`,title:b.name,amount:st.paidAmount??b.amount,category:"Facture",member:st.paidBy,note:`Échéance ${due}`,raw:{bill:b,due,st}})}));
  return arr.sort((a,b)=>b.date.localeCompare(a.date));
}
function renderHistory(){
  let arr=historyItems();if(historyFilter!=="all")arr=arr.filter(x=>x.kind===historyFilter);
  $("#historyList").innerHTML=arr.slice(0,250).map(x=>`<div class="historyRow"><div class="historyMain"><div class="historyTitle">${x.kind==="expense"?"💸":x.kind==="income"?"💵":x.kind==="over"?"⚡":"🧾"} ${esc(x.title)}</div><div class="sub">${esc(fmtDate(x.date))}${x.category?` · ${esc(x.category)}`:""}${x.member?` · ${esc(x.member)}`:""}</div></div><div class="amount ${x.kind==="income"?"okText":x.kind==="over"?"warnText":""}">${x.kind==="income"?"+":x.kind==="expense"||x.kind==="bill"?"−":""}${money(x.amount)}</div><div class="rowActions"><button onclick="BP.editHistory('${x.kind}','${x.id}')">✏️</button></div></div>`).join("")||`<div class="card muted">Aucun historique.</div>`;
}
function monthData(key){
  const tx=state.transactions.filter(t=>monthKey(t.date)===key), bills=[];
  state.bills.forEach(b=>Object.entries(b.statuses||{}).forEach(([due,st])=>{if(st.paidAt&&monthKey(st.paidAt)===key)bills.push({bill:b,due,st})}));
  const income=tx.filter(t=>t.kind==="income").reduce((s,t)=>s+Number(t.amount||0),0), over=tx.filter(t=>t.kind==="over").reduce((s,t)=>s+Number(t.amount||0),0), expenses=tx.filter(t=>t.kind==="expense").reduce((s,t)=>s+Number(t.amount||0),0), billPaid=bills.reduce((s,x)=>s+Number(x.st.paidAmount??x.bill.amount??0),0);
  const cats={};tx.filter(t=>t.kind==="expense").forEach(t=>cats[t.category||"Autre"]=(cats[t.category||"Autre"]||0)+Number(t.amount||0));bills.forEach(x=>cats["Factures"]=(cats["Factures"]||0)+Number(x.st.paidAmount??x.bill.amount??0));
  let minBal=null,negDays=0;
  const first=`${key}-01`,last=monthlyDate(Number(key.slice(0,4)),Number(key.slice(5,7)),31);
  let b=Number(state.settings.startBalance||0); // approximation month path from start
  const daily={};
  state.transactions.filter(t=>t.date<=last&&t.date>=state.settings.startBalanceDate).forEach(t=>{daily[t.date]=daily[t.date]||0;daily[t.date]+=t.kind==="income"?Number(t.amount||0):t.kind==="expense"?-Number(t.amount||0):0});
  state.bills.forEach(bl=>Object.entries(bl.statuses||{}).forEach(([d,st])=>{const p=(st.paidAt||"").slice(0,10);if(p&&p<=last&&p>=state.settings.startBalanceDate){daily[p]=daily[p]||0;daily[p]-=Number(st.paidAmount??bl.amount??0)}}));
  let cur=state.settings.startBalanceDate; if(cur<=last){while(cur<=last){b+=daily[cur]||0;if(cur>=first){if(b<0)negDays++;minBal=minBal===null?b:Math.min(minBal,b)}cur=addDays(cur,1)}}
  return {income,over,expenses,billPaid,totalOut:expenses+billPaid,net:income-expenses-billPaid,cats,negDays,minBal:minBal??0,tx,bills};
}
function renderSummary(){
  const key=`${summaryCursor.getFullYear()}-${pad(summaryCursor.getMonth()+1)}`, m=monthData(key);
  $("#summaryMonth").textContent=summaryCursor.toLocaleDateString("fr-CA",{month:"long",year:"numeric"});
  const prev=new Date(summaryCursor);prev.setMonth(prev.getMonth()-1);const pk=`${prev.getFullYear()}-${pad(prev.getMonth()+1)}`,pm=monthData(pk);const diff=m.totalOut-pm.totalOut;
  const cells=[["Revenus",m.income],["Dépenses",m.totalOut],["OVER séparé",m.over],["Résultat",m.net],["Jours découvert",m.negDays],["Plus bas solde",m.minBal],["Vs mois passé",diff]];
  $("#summaryCards").innerHTML=cells.map(([a,v],i)=>`<div class="summaryCell"><span>${a}</span><strong>${i===4?v:money(v)}</strong></div>`).join("");
  const max=Math.max(1,...Object.values(m.cats));$("#categoryBreakdown").innerHTML=Object.entries(m.cats).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="catRow"><div class="catTop"><span>${esc(k)}</span><strong>${money(v)}</strong></div><div class="bar"><i style="width:${Math.max(4,v/max*100)}%"></i></div></div>`).join("")||`<div class="muted small">Pas encore de dépenses ce mois-ci.</div>`;
}
function renderQuickMerchants(){
  const recent=state.transactions.filter(t=>t.kind==="expense"&&t.merchant).slice().sort((a,b)=>b.date.localeCompare(a.date)).map(t=>t.merchant);
  const list=[...new Set([...recent,...merchants])].slice(0,16);
  $("#quickMerchants").innerHTML=list.map(m=>`<button class="chip" onclick="BP.quickMerchant('${encodeURIComponent(m)}')">${esc(m)}</button>`).join("");
}
function renderSettings(){
  const s=state.settings;
  $("#startBalance").value=s.startBalance;$("#startBalanceDate").value=s.startBalanceDate;$("#overdraftLimit").value=s.overdraftLimit;$("#groceryBudget").value=s.groceryBudget;$("#reminderHour").value=s.reminderHour;$("#sundayReminder").checked=s.sundayReminder;$("#dayBeforeReminder").checked=s.dayBeforeReminder;$("#lateReminder").checked=s.lateReminder;$("#historyMonths").value=s.historyMonths;
  $("#apiUrl").value=profile.apiUrl||"";$("#memberName").value=profile.memberName||"";$("#oneSignalAppId").value=profile.oneSignalAppId||"";
  const cb=state.settings.categoryBudgets||{};$("#categoryBudgetList").innerHTML=Object.keys(cb).length?Object.entries(cb).map(([k,v])=>`<div class="billRow"><div class="billMain"><div class="billTitle">${esc(k)}</div><div class="sub">Budget mensuel</div></div><div class="amount">${money(v)}</div><div class="rowActions"><button onclick="BP.removeCategoryBudget('${encodeURIComponent(k)}')">✕</button></div></div>`).join(""):`<div class="muted small">Aucun budget mensuel supplémentaire.</div>`;
  $("#cloudStatus").innerHTML=profile.token?`✅ Connecté comme <b>${esc(profile.memberName||"membre")}</b><br>Code famille : <b>${esc(profile.joinCode||"—")}</b>`:`Pas encore connecté — l'app fonctionne localement.`;
}
function updateSyncLine(){
  $("#syncLine").textContent=profile.token?`Budget partagé · ${profile.memberName||"connecté"}`:"Mode local · prêt à utiliser";
}

function openModal(html){$("#modal").innerHTML=html;$("#modalBackdrop").classList.remove("hidden")}
function closeModal(){$("#modalBackdrop").classList.add("hidden")}
function modalHeader(title){return `<div class="modalHeader"><h2>${title}</h2><button class="closeBtn" onclick="BP.close()">✕</button></div>`}
function expenseForm(prefill=""){
  openModal(`${modalHeader("Ajouter une dépense")}<form id="expenseForm" class="formGrid">
    <label class="span2">Montant<input name="amount" type="number" step=".01" inputmode="decimal" required autofocus></label>
    <label class="span2">Commerce / dépense<input name="merchant" value="${esc(prefill)}" list="merchantList" required></label>
    <datalist id="merchantList">${merchants.map(m=>`<option>${esc(m)}</option>`).join("")}</datalist>
    <label>Catégorie<select name="category">${categories.map(c=>`<option>${c}</option>`).join("")}</select></label>
    <label>Date<input name="date" type="date" value="${today()}" required></label>
    <label>Type<select name="needFun"><option value="">Non précisé</option><option>Besoin</option><option>Plaisir</option></select></label>
    <label>Qui<input name="memberName" value="${esc(profile.memberName||"Moi")}"></label>
    <label class="span2">Note (facultatif)<input name="note"></label>
    <button class="fullBtn primary span2">Enregistrer</button>
  </form>`);
  $("#expenseForm").onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);state.transactions.unshift({id:uid("tx"),kind:"expense",amount:Number(f.get("amount")),merchant:f.get("merchant"),category:f.get("category"),date:f.get("date"),needFun:f.get("needFun"),memberName:f.get("memberName"),note:f.get("note"),createdAt:nowIso(),updatedAt:nowIso()});saveState();closeModal();toast("Dépense ajoutée ✅")}
}
function incomeForm(kind="income"){
  const over=kind==="over";
  openModal(`${modalHeader(over?"Ajouter de l'OVER":"Ajouter une paie")}<form id="incomeForm">
    <label>Montant<input name="amount" type="number" step=".01" inputmode="decimal" required autofocus></label>
    <label>Date<input name="date" type="date" value="${today()}" required></label>
    <label>Note<input name="note" placeholder="${over?"Ex. heures supplémentaires":"Facultatif"}"></label>
    <button class="fullBtn primary">Enregistrer</button>
    ${over?`<p class="muted small">⚡ L'OVER est suivi séparément et n'augmente pas le budget disponible.</p>`:""}
  </form>`);
  $("#incomeForm").onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);state.transactions.unshift({id:uid("tx"),kind,amount:Number(f.get("amount")),date:f.get("date"),name:over?"OVER":"Paie",memberName:profile.memberName||"Moi",note:f.get("note"),createdAt:nowIso(),updatedAt:nowIso()});saveState();closeModal();toast(over?"OVER enregistré ⚡":"Paie ajoutée 💵")}
}
function billForm(editId=null){
  const b=editId?state.bills.find(x=>x.id===editId):null;
  openModal(`${modalHeader(b?"Modifier facture":"Ajouter une facture")}<form id="billForm" class="formGrid">
    <label class="span2">Nom<input name="name" value="${esc(b?.name||"")}" required></label>
    <label>Montant<input name="amount" type="number" step=".01" value="${b?.amount??""}" required></label>
    <label>Catégorie<select name="category">${categories.map(c=>`<option ${b?.category===c?"selected":""}>${c}</option>`).join("")}</select></label>
    <label>Fréquence<select name="frequency"><option value="monthly" ${b?.frequency==="monthly"?"selected":""}>Mensuelle</option><option value="weekly" ${b?.frequency==="weekly"?"selected":""}>Hebdomadaire</option><option value="one" ${b?.frequency==="one"?"selected":""}>Une fois</option></select></label>
    <label>Jour du mois<input name="dueDay" type="number" min="1" max="31" value="${b?.dueDay??1}"></label>
    <label>Date unique / départ<input name="dueDate" type="date" value="${b?.dueDate||b?.startDate||today()}"></label>
    <label class="switchRow"><span>Montant variable</span><input name="variable" type="checkbox" ${b?.variable?"checked":""}></label>
    <label class="switchRow"><span>Prélèvement auto</span><input name="autopay" type="checkbox" ${b?.autopay?"checked":""}></label>
    <button class="fullBtn primary span2">${b?"Enregistrer":"Ajouter"}</button>
    ${b?`<button type="button" class="fullBtn span2" onclick="BP.endBill('${b.id}')">🏁 Prêt/facture terminé</button>`:""}
  </form>`);
  $("#billForm").onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);const obj=b||{id:uid("bill"),statuses:{},createdAt:nowIso()};Object.assign(obj,{name:f.get("name"),amount:Number(f.get("amount")),category:f.get("category"),frequency:f.get("frequency"),dueDay:Number(f.get("dueDay")||1),dueDate:f.get("dueDate"),startDate:f.get("dueDate"),activeFrom:b?.activeFrom||today(),variable:f.get("variable")==="on",autopay:f.get("autopay")==="on",active:true,updatedAt:nowIso()});if(!b)state.bills.push(obj);saveState();closeModal();toast(b?"Facture modifiée":"Facture ajoutée")}
}
function goalForm(){
  openModal(`${modalHeader("Nouvel objectif")}<form id="goalForm"><label>Nom<input name="name" required placeholder="Noël, vacances, urgence..."></label><label>Objectif $<input name="target" type="number" step=".01" required></label><label>Déjà mis de côté<input name="saved" type="number" step=".01" value="0"></label><button class="fullBtn primary">Ajouter</button></form>`);
  $("#goalForm").onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);state.goals.push({id:uid("goal"),name:f.get("name"),target:Number(f.get("target")),saved:Number(f.get("saved")),updatedAt:nowIso()});saveState();closeModal();toast("Objectif ajouté 🎯")}
}
function afford(){
  openModal(`${modalHeader("Peut-on se le permettre?")}<form id="affordForm"><label>Montant de l'achat<input name="amount" type="number" step=".01" required autofocus></label><button class="fullBtn primary">Calculer</button><div id="affordResult"></div></form>`);
  $("#affordForm").onsubmit=e=>{e.preventDefault();const a=Number(new FormData(e.target).get("amount")||0), before=availableToPay(), after=before-a, limit=Number(state.settings.overdraftLimit||1000);let txt;
    if(after>=0)txt=`<div class="card"><h3 class="okText">✅ Oui sans découvert</h3><p>Il resterait <b>${money(after)}</b> avant la prochaine paie après les obligations prévues.</p></div>`;
    else if(after>=-limit)txt=`<div class="card"><h3 class="warnText">⚠️ Ça utiliserait le découvert</h3><p>Projection : <b>${money(after)}</b>. Techniquement possible, mais pas avec les salaires disponibles seulement.</p></div>`;
    else txt=`<div class="card"><h3 class="dangerText">🚨 Non</h3><p>Projection : <b>${money(after)}</b>, donc sous la limite de découvert de ${money(-limit)}.</p></div>`;
    $("#affordResult").innerHTML=txt;
  }
}
function payBill(id,due){
  const b=state.bills.find(x=>x.id===id);if(!b)return;
  const st=billStatus(b,due), amount=b.variable?prompt(`Montant réellement payé pour ${b.name}`,String(st.paidAmount??b.amount)):String(b.amount);
  if(amount===null)return;setBillStatus(b,due,{paidAt:nowIso(),paidAmount:Number(amount),paidBy:profile.memberName||"Moi",snoozedUntil:null});toast("Facture payée ✅")
}
function snooze(id,due){
  const b=state.bills.find(x=>x.id===id);if(!b)return;const proposed=addDays(today(),2),d=prompt(`Reporter l'alerte de "${b.name}" jusqu'à quelle date?`,proposed);if(!d)return;
  setBillStatus(b,due,{snoozedUntil:d});toast(`Rappels reportés au ${fmtDate(d)} ⏰`)
}
function endBill(id){
  const b=state.bills.find(x=>x.id===id);if(!b)return;if(!confirm(`Terminer "${b.name}"? L'historique restera conservé.`))return;b.active=false;b.endedAt=today();b.updatedAt=nowIso();saveState();closeModal();toast(`🎉 ${b.name} terminé`)
}

function addGoalMoney(id){
  const g=state.goals.find(x=>x.id===id);if(!g)return;const v=prompt(`Combien ajouter à "${g.name}" ?`,"0");if(v===null)return;g.saved=Number(g.saved||0)+Number(v||0);g.updatedAt=nowIso();saveState();toast("Objectif mis à jour 🎯")
}
function addCategoryBudget(){
  openModal(`${modalHeader("Budget par catégorie")}<form id="catBudgetForm"><label>Catégorie<select name="category">${categories.map(c=>`<option>${c}</option>`).join("")}</select></label><label>Budget mensuel<input name="amount" type="number" step=".01" required></label><button class="fullBtn primary">Enregistrer</button></form>`);
  $("#catBudgetForm").onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);state.settings.categoryBudgets=state.settings.categoryBudgets||{};state.settings.categoryBudgets[f.get("category")]=Number(f.get("amount"));touchSettings();saveState();closeModal();toast("Budget catégorie ajouté")}
}
function removeCategoryBudget(encoded){
  const k=decodeURIComponent(encoded);if(!confirm(`Enlever le budget "${k}" ?`))return;delete state.settings.categoryBudgets[k];touchSettings();saveState()
}
function editHistory(kind,id){
  if(kind==="bill"){
    const [billId,due]=id.split("|"),b=state.bills.find(x=>x.id===billId);if(!b)return;
    if(confirm(`Annuler le statut PAYÉ de "${b.name}" ?`)){delete b.statuses[due];b.updatedAt=nowIso();saveState();toast("Paiement annulé")}
    return;
  }
  const t=state.transactions.find(x=>x.id===id);if(!t)return;
  const amount=prompt("Modifier le montant",String(t.amount));if(amount===null)return;
  t.amount=Number(amount||0);
  if(kind==="expense"){const name=prompt("Modifier le nom / commerce",t.merchant||"");if(name!==null)t.merchant=name}
  const date=prompt("Modifier la date (AAAA-MM-JJ)",t.date);if(date)t.date=date;
  t.updatedAt=nowIso();saveState();toast("Entrée modifiée ✅")
}
function summaryText(){
  const key=`${summaryCursor.getFullYear()}-${pad(summaryCursor.getMonth()+1)}`,m=monthData(key);
  const cats=Object.entries(m.cats).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}: ${money(v)}`).join("; ");
  return `BUDGET PACK — BILAN ${key}
Revenus normaux: ${money(m.income)}
Dépenses totales: ${money(m.totalOut)}
Résultat sans OVER: ${money(m.net)}
OVER séparé: ${money(m.over)}
Jours à découvert: ${m.negDays}
Plus bas solde estimé: ${money(m.minBal)}
Catégories: ${cats||"aucune"}
Analyse ce bilan. Dis-moi clairement ce qui est bon, ce qui est à surveiller et 3 actions concrètes pour améliorer le prochain mois sans compter l'OVER comme revenu normal.`;
}
async function shareSummary(){
  const text=summaryText();try{if(navigator.share)await navigator.share({title:"BUDGET PACK — Bilan",text});else{await navigator.clipboard.writeText(text);toast("Bilan copié — colle-le dans ChatGPT 🤖")}}catch(e){if(e.name!=="AbortError")toast("Impossible de partager")}
}
function exportData(){
  const blob=new Blob([JSON.stringify({version:1,exportedAt:nowIso(),state},null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`budget-pack-${today()}.json`;a.click();URL.revokeObjectURL(a.href)
}
function importData(file){
  const r=new FileReader();r.onload=()=>{try{const j=JSON.parse(r.result);if(!j.state)throw Error();state=j.state;saveState();toast("Sauvegarde importée ✅")}catch{toast("Fichier invalide")}};r.readAsText(file)
}

// ----- Cloud sync -----
function apiBase(){return (profile.apiUrl||"").replace(/\/+$/,"")}
async function api(path,opts={}){
  const headers={...(opts.headers||{})};
  // Sans jeton (création/join), text/plain évite le pré-test CORS sur certains navigateurs Android.
  // Le Worker lit quand même le corps avec request.json().
  if(opts.body) headers["Content-Type"]=profile.token?"application/json":"text/plain;charset=UTF-8";
  if(profile.token) headers.Authorization=`Bearer ${profile.token}`;
  const r=await fetch(apiBase()+path,{...opts,headers});const j=await r.json().catch(()=>({}));if(!r.ok){const err=new Error(j.error||`Erreur ${r.status}`);err.status=r.status;err.data=j;throw err}return j
}
function mergeById(a=[],b=[]){
  const m=new Map();[...a,...b].forEach(x=>{const old=m.get(x.id);if(!old||String(x.updatedAt||"")>=String(old.updatedAt||""))m.set(x.id,x)});return [...m.values()]
}
function mergeState(local,remote){
  if(!remote||!remote.settings)return local;
  const settings=String(local.settings?.updatedAt||"")>=String(remote.settings?.updatedAt||"")?local.settings:remote.settings;
  return {...remote,...local,settings,bills:mergeById(local.bills,remote.bills),transactions:mergeById(local.transactions,remote.transactions),incomeSchedules:mergeById(local.incomeSchedules,remote.incomeSchedules),goals:mergeById(local.goals,remote.goals),archives:{...(remote.archives||{}),...(local.archives||{})},updatedAt:nowIso()}
}
async function pullCloud(){
  if(!profile.token||!apiBase()||cloudBusy)return;cloudBusy=true;
  try{
    const j=await api("/api/state");
    if(j.data&&j.data.settings){state=mergeState(state,j.data);profile.cloudVersion=j.version||0;saveProfile();localStorage.setItem(LS_KEY,JSON.stringify(state));render();await pushCloud(true)}
    else{profile.cloudVersion=j.version||0;saveProfile();await pushCloud(true)}
  }catch(e){console.warn(e)}finally{cloudBusy=false}
}
async function pushCloud(force=false){
  if(!profile.token||!apiBase()||cloudBusy)return;cloudBusy=true;
  try{
    const j=await api("/api/state",{method:"PUT",body:JSON.stringify({version:profile.cloudVersion||0,data:state})});profile.cloudVersion=j.version;saveProfile();$("#syncLine").textContent=`Synchronisé · ${profile.memberName||""}`;
  }catch(e){
    if(e.status===409&&e.data?.data){state=mergeState(state,e.data.data);profile.cloudVersion=e.data.version;saveProfile();localStorage.setItem(LS_KEY,JSON.stringify(state));cloudBusy=false;return pushCloud(true)}
    $("#syncLine").textContent="Sync à vérifier";console.warn(e)
  }finally{cloudBusy=false}
}
async function createFamily(){
  profile.apiUrl=$("#apiUrl").value.trim();profile.memberName=$("#memberName").value.trim()||"Moi";if(!profile.apiUrl)return toast("Entre l'adresse du serveur");
  try{const j=await api("/api/family/create",{method:"POST",body:JSON.stringify({familyName:state.settings.familyName||"Budget familial",memberName:profile.memberName,timezone:state.settings.timezone||"America/Toronto"})});Object.assign(profile,{token:j.token,memberId:j.memberId,familyId:j.familyId,joinCode:j.joinCode,cloudVersion:j.version||0});saveProfile();await pushCloud(true);await initOneSignal();render();toast(`Budget partagé créé · code ${j.joinCode}`)}catch(e){toast("Création impossible : "+e.message)}
}
async function joinFamily(){
  profile.apiUrl=$("#apiUrl").value.trim();profile.memberName=$("#memberName").value.trim()||"Membre";const code=$("#joinCode").value.trim().toUpperCase();if(!profile.apiUrl||!code)return toast("Adresse serveur + code requis");
  try{const j=await api("/api/family/join",{method:"POST",body:JSON.stringify({joinCode:code,memberName:profile.memberName})});Object.assign(profile,{token:j.token,memberId:j.memberId,familyId:j.familyId,joinCode:j.joinCode,cloudVersion:0});saveProfile();await pullCloud();await initOneSignal();render();toast("Budget partagé rejoint ✅")}catch(e){toast("Impossible de rejoindre : "+e.message)}
}
function leaveCloud(){if(!confirm("Déconnecter ce téléphone du budget partagé? Les données locales restent ici."))return;profile={...profile,token:"",memberId:"",familyId:"",joinCode:"",cloudVersion:0};saveProfile();render();toast("Téléphone déconnecté")}
async function initOneSignal(){
  const appId=profile.oneSignalAppId;if(!appId||oneSignalReady)return;
  window.OneSignalDeferred=window.OneSignalDeferred||[];
  window.OneSignalDeferred.push(async OneSignal=>{
    try{const swUrl=new URL("push/onesignal/OneSignalSDKWorker.js",location.href), swPath=swUrl.pathname.replace(/^\//,""), swScope=swUrl.pathname.replace(/OneSignalSDKWorker\.js$/,"");await OneSignal.init({appId,serviceWorkerPath:swPath,serviceWorkerParam:{scope:swScope}});if(profile.memberId)await OneSignal.login(profile.memberId);oneSignalReady=true}catch(e){console.warn("OneSignal",e)}
  })
}
async function enablePush(){
  profile.oneSignalAppId=$("#oneSignalAppId").value.trim();saveProfile();if(!profile.oneSignalAppId)return toast("Ajoute le OneSignal App ID");
  await initOneSignal();window.OneSignalDeferred=window.OneSignalDeferred||[];window.OneSignalDeferred.push(async OneSignal=>{try{if(profile.memberId)await OneSignal.login(profile.memberId);await OneSignal.Notifications.requestPermission();toast("Notifications activées 🔔")}catch(e){toast("Impossible d'activer les notifications")}})
}

// ----- settings / nav -----

function ensureNegativeBalanceButton(){
  const input=document.getElementById("startBalance");
  if(!input || document.getElementById("startBalanceSignBtn")) return;
  const wrap=document.createElement("div");
  wrap.style.display="grid";
  wrap.style.gridTemplateColumns="1fr 54px";
  wrap.style.gap="8px";
  wrap.style.alignItems="end";
  input.parentNode.insertBefore(wrap,input);
  wrap.appendChild(input);
  const btn=document.createElement("button");
  btn.type="button";
  btn.id="startBalanceSignBtn";
  btn.className="smallBtn";
  btn.textContent="±";
  btn.style.height="44px";
  btn.style.marginTop="6px";
  btn.onclick=()=>{
    input.value=String(-Number(input.value||0));
    input.dispatchEvent(new Event("change",{bubbles:true}));
    input.focus();
  };
  wrap.appendChild(btn);
}

function settingsChanged(){
  state.settings.startBalance=Number($("#startBalance").value||0);state.settings.startBalanceDate=$("#startBalanceDate").value||today();state.settings.overdraftLimit=Number($("#overdraftLimit").value||1000);state.settings.groceryBudget=Number($("#groceryBudget").value||0);state.settings.reminderHour=Math.max(0,Math.min(23,Number($("#reminderHour").value||9)));state.settings.sundayReminder=$("#sundayReminder").checked;state.settings.dayBeforeReminder=$("#dayBeforeReminder").checked;state.settings.lateReminder=$("#lateReminder").checked;state.settings.historyMonths=$("#historyMonths").value;touchSettings();saveState()
}
function goPage(id){$$(".page").forEach(p=>p.classList.toggle("active",p.id===id));$$(".bottomNav button").forEach(b=>b.classList.toggle("active",b.dataset.page===id));scrollTo(0,0)}
function add(kind){if(kind==="expense")expenseForm();else if(kind==="income"||kind==="over")incomeForm(kind);else if(kind==="bill")billForm();else if(kind==="goal")goalForm()}
function migrateTrackingStart(){
  let changed=false;
  state.settings=state.settings||{};
  if(!state.settings.trackingStartDate){
    state.settings.trackingStartDate=today();
    state.settings.updatedAt=nowIso();
    changed=true;
  }
  (state.bills||[]).forEach(b=>{
    if(!b.activeFrom){
      b.activeFrom=state.settings.trackingStartDate;
      b.updatedAt=nowIso();
      changed=true;
    }
  });
  if(changed)localStorage.setItem(LS_KEY,JSON.stringify(state));
}
function archiveOld(){ // Safe monthly summaries, then detail removal according to preference
  const hm=state.settings.historyMonths;if(hm==="always")return;
  const cutoff=new Date();cutoff.setMonth(cutoff.getMonth()-Number(hm||12));const cut=isoDate(cutoff);
  const old=state.transactions.filter(t=>t.date<cut);if(!old.length)return;
  const groups={};const ensure=k=>groups[k]||(groups[k]={income:0,expense:0,over:0,billAmount:0,billsPaid:0,categories:{}});
  old.forEach(t=>{const k=monthKey(t.date),g=ensure(k);g[t.kind]=(g[t.kind]||0)+Number(t.amount||0);if(t.kind==="expense")g.categories[t.category||"Autre"]=(g.categories[t.category||"Autre"]||0)+Number(t.amount||0)});
  state.bills.forEach(b=>Object.keys(b.statuses||{}).forEach(due=>{const st=b.statuses[due],pd=(st.paidAt||"").slice(0,10);if(pd&&pd<cut){const k=monthKey(pd),g=ensure(k),amt=Number(st.paidAmount??b.amount??0);g.billAmount+=amt;g.billsPaid+=1;g.categories.Factures=(g.categories.Factures||0)+amt;delete b.statuses[due];b.updatedAt=nowIso()}}));
  Object.entries(groups).forEach(([k,v])=>state.archives[k]={...(state.archives[k]||{}),...v,archivedAt:nowIso()});
  state.transactions=state.transactions.filter(t=>t.date>=cut);localStorage.setItem(LS_KEY,JSON.stringify(state))
}

// ----- events -----
document.addEventListener("click",e=>{
  const p=e.target.closest("[data-page]");if(p)goPage(p.dataset.page);
  const a=e.target.closest("[data-add]");if(a)add(a.dataset.add);
  const g=e.target.closest("[data-go]");if(g)goPage(g.dataset.go);
});
$("#quickExpenseBtn").onclick=()=>expenseForm();$("#addBillBtn").onclick=()=>billForm();$("#affordBtn").onclick=afford;$("#modalBackdrop").onclick=e=>{if(e.target.id==="modalBackdrop")closeModal()};
$("#calendarRange").onclick=e=>{const b=e.target.closest("button");if(!b)return;calendarDays=Number(b.dataset.days);$$("#calendarRange button").forEach(x=>x.classList.toggle("active",x===b));renderCalendar()};
$("#historyFilter").onclick=e=>{const b=e.target.closest("button");if(!b)return;historyFilter=b.dataset.filter;$$("#historyFilter button").forEach(x=>x.classList.toggle("active",x===b));renderHistory()};
$("#prevMonth").onclick=()=>{summaryCursor.setMonth(summaryCursor.getMonth()-1);renderSummary()};$("#nextMonth").onclick=()=>{summaryCursor.setMonth(summaryCursor.getMonth()+1);renderSummary()};
$("#shareSummary").onclick=shareSummary;$("#exportBtn").onclick=exportData;
["startBalance","startBalanceDate","overdraftLimit","groceryBudget","reminderHour","sundayReminder","dayBeforeReminder","lateReminder","historyMonths"].forEach(id=>$("#"+id).addEventListener("change",settingsChanged));
$$("[data-theme]").forEach(b=>b.onclick=()=>applyTheme(b.dataset.theme));$("#customAccent").onchange=e=>applyTheme("custom",e.target.value);
$("#apiUrl").onchange=e=>{profile.apiUrl=e.target.value.trim();saveProfile()};$("#memberName").onchange=e=>{profile.memberName=e.target.value.trim();saveProfile()};
$("#oneSignalAppId").onchange=e=>{profile.oneSignalAppId=e.target.value.trim();saveProfile()};
$("#createFamilyBtn").onclick=createFamily;$("#joinFamilyBtn").onclick=joinFamily;$("#leaveCloudBtn").onclick=leaveCloud;$("#enablePushBtn").onclick=enablePush;
$("#addCategoryBudgetBtn").onclick=addCategoryBudget;
$("#seedBtn").onclick=()=>{if(confirm("Remettre les factures de départ? Ça n'efface pas tes dépenses.")){state.bills=seedBills();saveState();toast("Factures de départ remises")}};
$("#importBtn").onclick=()=>$("#importFile").click();$("#importFile").onchange=e=>e.target.files[0]&&importData(e.target.files[0]);

window.BP={close:closeModal,payBill,snooze,endBill,quickMerchant:s=>expenseForm(decodeURIComponent(s)),editBill:billForm,addGoalMoney,removeCategoryBudget,editHistory};

initTheme();migrateTrackingStart();archiveOld();render();if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});
if(profile.token)pullCloud();if(profile.oneSignalAppId)initOneSignal();
setInterval(()=>{if(profile.token&&document.visibilityState==="visible")pullCloud()},30000);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&profile.token)pullCloud()});
})();