(() => {
"use strict";

const BUILD="2026-11-12-NOUBLIE-RIEN-V2";
const LS_KEY="budgetPackStateV1";
const PROFILE_KEY="budgetPackProfileV1";
const HUB_KEY="familyHubV1";
const DEFAULT_ONESIGNAL_APP_ID="4770a678-6329-4944-9d54-b01d0b14fc97";
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const nowIso=()=>new Date().toISOString();
const uid=(p="id")=>`${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,9)}`;
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const normalize=s=>String(s??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");

let page="list";
let taskFilter="all";
let jobFilter="active";
let cloudBusy=false;
let cloudTimer=null;
let pullTimer=null;
let oneSignalInitialized=false;
let members=[];
let state=loadState();
let profile=loadProfile();
ensureHub();
installV2Styles();

function loadState(){
  try{return JSON.parse(localStorage.getItem(LS_KEY))||{}}catch{return {}}
}
function loadProfile(){
  const blank={apiUrl:"",token:"",memberId:"",memberName:"",familyId:"",joinCode:"",cloudVersion:0,oneSignalAppId:DEFAULT_ONESIGNAL_APP_ID};
  try{return {...blank,...(JSON.parse(localStorage.getItem(PROFILE_KEY))||{})}}catch{return blank}
}
function saveProfile(){localStorage.setItem(PROFILE_KEY,JSON.stringify(profile))}
function defaultHub(){return {version:1,tasks:[],jobs:[],createdAt:nowIso(),updatedAt:nowIso()}}
function ensureHub(){
  if(!state||typeof state!=="object")state={};
  if(!state[HUB_KEY]||typeof state[HUB_KEY]!=="object")state[HUB_KEY]=defaultHub();
  const h=state[HUB_KEY];
  if(!Array.isArray(h.tasks))h.tasks=[];
  if(!Array.isArray(h.jobs))h.jobs=[];
  if(!h.version)h.version=1;
}
function hub(){ensureHub();return state[HUB_KEY]}
function saveLocal(){hub().updatedAt=nowIso();state.updatedAt=nowIso();localStorage.setItem(LS_KEY,JSON.stringify(state))}
function saveState({skipCloud=false}={}){
  saveLocal();render();
  if(!skipCloud&&profile.token&&profile.apiUrl){clearTimeout(cloudTimer);cloudTimer=setTimeout(()=>pushCloud(),500)}
}
function toast(msg){const t=$("#toast");if(!t)return;t.textContent=msg;t.classList.remove("hidden");clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.add("hidden"),2200)}
function fmtDateTime(v){if(!v)return"";const d=new Date(v);if(Number.isNaN(d.getTime()))return"";return d.toLocaleString("fr-CA",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}
function pad2(n){return String(n).padStart(2,"0")}
function localDateISO(d=new Date()){return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`}
function addLocalDays(n){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+n);return localDateISO(d)}
function fmtDueDate(v){
  if(!v)return"";
  if(v===localDateISO())return"Aujourd’hui";
  if(v===addLocalDays(1))return"Demain";
  const d=new Date(`${v}T12:00:00`);
  if(Number.isNaN(d.getTime()))return v;
  return d.toLocaleDateString("fr-CA",{day:"numeric",month:"short"});
}
function taskDueBucket(t){
  const v=String(t?.dueDate||"");
  const today=localDateISO();
  if(!v)return"nodate";
  if(v<today)return"overdue";
  if(v===today)return"today";
  return"later";
}
function installV2Styles(){
  if(document.getElementById("noublie-v2-css"))return;
  const st=document.createElement("style");
  st.id="noublie-v2-css";
  st.textContent=`
    input,textarea,select{font-size:16px!important;line-height:1.25}
    .taskGroup{margin-top:13px;border-top:1px solid var(--line);padding-top:10px}
    .taskGroup:first-of-type{margin-top:5px}
    .taskGroupHead{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:2px 2px 8px}
    .taskGroupHead strong{font-size:15px}
    .taskGroupHead span{min-width:26px;height:26px;padding:0 7px;border-radius:999px;background:var(--card2);display:grid;place-items:center;color:var(--muted);font-size:10px;font-weight:900}
    .groupEmpty{padding:15px 8px;color:var(--muted);font-size:11px;text-align:center}
    .badge.today{color:var(--accent)}
    .badge.late{color:var(--danger)}
    .pasteBtn{min-height:48px}
  `;
  document.head.appendChild(st);
}
function myName(){return profile.memberName||members.find(x=>x.id===profile.memberId)?.name||"Moi"}
function initials(name){return String(name||"?").trim().split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase()||"?"}
function categoryInfo(type){
  const map={todo:["✅","À faire"],buy:["🛒","À acheter"],call:["📞","À appeler"],wait:["⏳","En attente"]};
  return map[type]||map.todo;
}
function assigneeLabel(t){
  if(!t.assigneeId||t.assigneeId==="all")return"Nous deux";
  return t.assigneeName||members.find(m=>m.id===t.assigneeId)?.name||"Assigné";
}
function isMine(t){return !t.assigneeId||t.assigneeId==="all"||t.assigneeId===profile.memberId}
function activeTasks(){return hub().tasks.filter(t=>t&&!t.deletedAt&&!t.doneAt)}
function doneTasks(){return hub().tasks.filter(t=>t&&!t.deletedAt&&t.doneAt).sort((a,b)=>String(b.doneAt).localeCompare(String(a.doneAt)))}
function activeJobs(){return hub().jobs.filter(j=>j&&!j.deletedAt&&!j.archivedAt)}
function archivedJobs(){return hub().jobs.filter(j=>j&&!j.deletedAt&&j.archivedAt).sort((a,b)=>String(b.archivedAt).localeCompare(String(a.archivedAt)))}
function sortedTasks(list){return [...list].sort((a,b)=>Number(b.priority==="hot")-Number(a.priority==="hot")||String(b.updatedAt||b.createdAt||"").localeCompare(String(a.updatedAt||a.createdAt||"")))}

function render(){
  const app=$("#app");if(!app)return;
  app.innerHTML=`
    <header class="topbar">
      <div><div class="brand">N’OUBLIE <span>RIEN</span></div><div class="subbrand">Liste familiale · WIZZ · Jobs</div><div id="syncLine" class="sync"></div></div>
      <div class="avatar">${esc(initials(myName()))}</div>
    </header>
    <main>
      <section id="page-list" class="page ${page==="list"?"active":""}">${renderListPage()}</section>
      <section id="page-jobs" class="page ${page==="jobs"?"active":""}">${renderJobsPage()}</section>
      <section id="page-done" class="page ${page==="done"?"active":""}">${renderDonePage()}</section>
      <section id="page-settings" class="page ${page==="settings"?"active":""}">${renderSettingsPage()}</section>
    </main>
    ${page!=="settings"?`<button class="fab" id="fabAdd" aria-label="Ajouter">＋</button>`:""}
    <nav class="bottomNav">
      ${navBtn("list","☑","Liste")}${navBtn("jobs","🧰","Jobs")}${navBtn("done","✓","Fait")}${navBtn("settings","⚙","Réglages")}
    </nav>`;
  bindMainEvents();updateSyncLine();
}
function navBtn(id,icon,label){return `<button class="navBtn ${page===id?"active":""}" data-page="${id}"><b>${icon}</b><span>${label}</span></button>`}

function taskGroupHtml(title,list,emptyText=""){
  return `<div class="taskGroup"><div class="taskGroupHead"><strong>${title}</strong><span>${list.length}</span></div>${list.length?list.map(taskRow).join(""):`<div class="groupEmpty">${esc(emptyText||"Rien ici.")}</div>`}</div>`;
}
function renderListPage(){
  const all=activeTasks();
  const hot=all.filter(t=>t.priority==="hot");
  let list=sortedTasks(all);
  if(taskFilter!=="all")list=list.filter(t=>t.type===taskFilter);

  const overdue=sortedTasks(list.filter(t=>taskDueBucket(t)==="overdue"));
  const today=sortedTasks(list.filter(t=>taskDueBucket(t)==="today"));
  const later=[...list.filter(t=>taskDueBucket(t)==="later")].sort((a,b)=>String(a.dueDate).localeCompare(String(b.dueDate))||Number(b.priority==="hot")-Number(a.priority==="hot"));
  const nodate=sortedTasks(list.filter(t=>taskDueBucket(t)==="nodate"));

  return `
    <div class="hero">
      <div class="heroTitle">Qu’est-ce qu’on<br>ne doit pas oublier?</div>
      <div class="heroSub">Aujourd’hui reste en haut. Le reste attend dans « Plus tard » ✅.</div>
      <div class="heroButtons">
        <button class="btn primary" id="quickTask">＋ Ajouter</button>
        <button class="btn" id="quickImport">⚡ Code</button>
        <button class="btn wide" id="quickWizz">⚡ WIZZ l’autre</button>
      </div>
    </div>
    <div class="stats">
      <div class="stat"><span>Ouvert</span><strong>${all.length}</strong></div>
      <div class="stat"><span>☀️ Aujourd’hui</span><strong>${all.filter(t=>taskDueBucket(t)==="today").length}</strong></div>
      <div class="stat"><span>🔥 Priorité</span><strong>${hot.length}</strong></div>
    </div>
    <div class="section">
      <div class="sectionHead"><strong>Liste partagée</strong><button id="addTaskTop">＋ Ajouter</button></div>
      <div class="chips">
        ${chip("all","Tout")}${chip("todo","✅ À faire")}${chip("buy","🛒 Acheter")}${chip("call","📞 Appeler")}${chip("wait","⏳ Attente")}
      </div>
      ${overdue.length?taskGroupHtml("⚠️ En retard",overdue):""}
      ${taskGroupHtml("☀️ Aujourd’hui",today,"Rien à faire aujourd’hui 🎉")}
      ${later.length?taskGroupHtml("📅 Plus tard",later):""}
      ${nodate.length?taskGroupHtml("🗂 Sans date",nodate):""}
    </div>`;
}
function chip(id,label){return `<button class="chip ${taskFilter===id?"active":""}" data-filter="${id}">${label}</button>`}
function taskRow(t,{done=false}={}){
  const [icon,label]=categoryInfo(t.type);
  const hot=t.priority==="hot"?`<span class="badge hot">🔥 Priorité</span>`:"";
  const mine=t.assigneeId===profile.memberId?`<span class="badge mine">👤 Moi</span>`:`<span class="badge">👥 ${esc(assigneeLabel(t))}</span>`;
  const doneMeta=done?` · Fait ${esc(fmtDateTime(t.doneAt))}${t.doneByName?` par ${esc(t.doneByName)}`:""}`:"";
  const bucket=taskDueBucket(t);
  const due=!done&&t.dueDate?`<span class="badge ${bucket==="overdue"?"late":bucket==="today"?"today":""}">${bucket==="overdue"?"⚠️":"📅"} ${esc(fmtDueDate(t.dueDate))}</span>`:"";
  return `<div class="task ${done?"taskDone":""}">
    <div class="taskIcon">${icon}</div>
    <div class="taskMain">
      <div class="taskTitle">${esc(t.title)}</div>
      <div class="taskMeta">${esc(label)}${doneMeta}</div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:6px">${hot}${due}${mine}</div>
      ${t.note?`<div class="taskNote">${esc(t.note)}</div>`:""}
    </div>
    <div class="actions">
      ${done?`<button class="iconBtn" data-task-undo="${t.id}" title="Remettre à faire">↩</button>`:`<button class="iconBtn wizz" data-task-wizz="${t.id}" title="WIZZ">⚡</button><button class="iconBtn done" data-task-done="${t.id}" title="Fait">✓</button>`}
      <button class="iconBtn" data-task-edit="${t.id}" title="Modifier">✎</button>
    </div>
  </div>`;
}

function renderJobsPage(){
  const list=jobFilter==="archived"?archivedJobs():activeJobs();
  const cards=list.length?list.map(jobCard).join(""):`<div class="empty">🧰 Aucune job ${jobFilter==="archived"?"archivée":"active"}.</div>`;
  return `
    <div class="hero">
      <div class="heroTitle">🧰 Jobs & matériel</div>
      <div class="heroSub">Prépare tes listes d’avance. <b>Aucun rappel automatique</b> pour les jobs.</div>
      <div class="heroButtons">
        <button class="btn primary" id="newJob">＋ Nouvelle job</button>
        <button class="btn" id="jobImport">⚡ Code JOB</button>
        <button class="btn wide" id="jobWizzAll">⚡ WIZZ l’autre</button>
      </div>
    </div>
    <div class="section">
      <div class="chips"><button class="chip ${jobFilter==="active"?"active":""}" data-jobfilter="active">🧰 Actives</button><button class="chip ${jobFilter==="archived"?"active":""}" data-jobfilter="archived">📦 Archivées</button></div>
      ${cards}
    </div>`;
}
function jobCard(j){
  const items=Array.isArray(j.items)?j.items:[];const done=items.filter(x=>x.done).length;const pct=items.length?Math.round(done/items.length*100):0;
  const rows=items.length?items.map(it=>`<label class="jobItem ${it.done?"done":""}"><input type="checkbox" data-job-item="${j.id}" data-item-id="${it.id}" ${it.done?"checked":""}><span>${esc(it.label)}</span></label>`).join(""):`<div class="empty">Aucun matériel dans cette job.</div>`;
  return `<div class="job">
    <div class="jobTop"><div style="flex:1"><div class="jobTitle">${esc(j.title)}</div><div class="jobMeta">${done}/${items.length} prêt${j.createdByName?` · créé par ${esc(j.createdByName)}`:""}</div>${j.note?`<div class="taskNote">${esc(j.note)}</div>`:""}</div><span class="badge">${pct}%</span></div>
    <div class="progress"><i style="width:${pct}%"></i></div>
    <div class="jobItems">${rows}</div>
    <div class="jobFoot">
      <button class="btn small" data-job-additem="${j.id}">＋ Item</button>
      <button class="btn small" data-job-edit="${j.id}">✎ Modifier</button>
      <button class="btn small" data-job-wizz="${j.id}">⚡ WIZZ</button>
      ${j.archivedAt?`<button class="btn small" data-job-restore="${j.id}">↩ Réactiver</button>`:`<button class="btn small" data-job-archive="${j.id}">📦 Archiver</button>`}
    </div>
  </div>`;
}

function renderDonePage(){
  const t=doneTasks();const j=archivedJobs();
  return `<div class="hero"><div class="heroTitle">✅ Fait</div><div class="heroSub">Les choses terminées restent accessibles, mais ne te gossent plus.</div></div>
    <div class="section"><div class="sectionHead"><strong>Tâches terminées</strong><span class="tiny">${t.length}</span></div>${t.length?t.slice(0,100).map(x=>taskRow(x,{done:true})).join(""):`<div class="empty">Aucune tâche terminée.</div>`}</div>
    <div class="section"><div class="sectionHead"><strong>Jobs archivées</strong><button data-gojobsarchive="1">Voir dans Jobs →</button></div>${j.length?j.slice(0,5).map(x=>`<div class="task"><div class="taskIcon">📦</div><div class="taskMain"><div class="taskTitle">${esc(x.title)}</div><div class="taskMeta">Archivée ${esc(fmtDateTime(x.archivedAt))}</div></div></div>`).join(""):`<div class="empty">Aucune job archivée.</div>`}</div>`;
}

function renderSettingsPage(){
  const connected=!!(profile.token&&profile.apiUrl);const memberRows=members.length?members.map(m=>`<div class="memberRow"><span>${esc(m.name)}</span><span class="badge ${m.id===profile.memberId?"mine":""}">${m.id===profile.memberId?"Ce téléphone":esc(m.role||"membre")}</span></div>`).join(""):`<div class="tiny">Les membres apparaîtront après synchronisation.</div>`;
  return `<div class="hero"><div class="heroTitle">⚙ Réglages</div><div class="heroSub">Partage, WIZZ et notifications.</div></div>
    <div class="settingsCard"><h3>👥 Famille partagée</h3>
      <div class="tiny">Statut : ${connected?"connecté au partage":"mode local"}</div>
      <label>Adresse API<input id="apiUrl" value="${esc(profile.apiUrl||"")}" placeholder="https://...workers.dev"></label>
      <label>Ton nom<input id="memberName" value="${esc(profile.memberName||"")}" placeholder="Francis"></label>
      ${connected?`<div class="two"><button class="btn" id="pullNow">🔄 Synchroniser</button><button class="btn danger" id="disconnect">Déconnecter</button></div><label>Code famille<input value="${esc(profile.joinCode||"")}" readonly></label>`:
      `<div class="two"><button class="btn primary" id="createFamily">Créer le partage</button><button class="btn" id="joinFamily">Rejoindre</button></div><label>Code pour rejoindre<input id="joinCode" maxlength="8" placeholder="ABC123"></label>`}
      <div style="margin-top:10px">${memberRows}</div>
    </div>
    <div class="settingsCard"><h3>⚡ WIZZ & notifications</h3>
      <label>OneSignal App ID<input id="oneSignalId" value="${esc(profile.oneSignalAppId||DEFAULT_ONESIGNAL_APP_ID)}"></label>
      <button class="btn primary full" id="enablePush">🔔 Activer / relier ce téléphone</button>
      <div class="two" style="margin-top:8px"><button class="btn" id="testLocal">🔔 Tester ce téléphone</button><button class="btn" id="testServerWizz">⚡ Tester WIZZ vers l’autre</button></div>
      <div class="tiny" style="margin-top:8px">Le test WIZZ passe vraiment par le serveur et OneSignal.</div>
    </div>
    <div class="settingsCard"><h3>💾 Données</h3>
      <div class="two"><button class="btn" id="exportHub">📤 Exporter</button><button class="btn" id="importHub">📥 Importer</button></div><input id="importFile" type="file" accept="application/json" class="hidden">
      <button class="btn danger full" style="margin-top:8px" id="resetHub">🧹 Vider seulement N’OUBLIE RIEN</button>
      <div class="tiny" style="margin-top:8px">Les anciennes données Budget Pack restent conservées dans le stockage, mais cette nouvelle app ne les affiche plus.</div>
    </div>
    <div class="tiny" style="text-align:center;margin:16px 0">${BUILD}</div>`;
}

function bindMainEvents(){
  $$("[data-page]").forEach(b=>b.onclick=()=>{page=b.dataset.page;render()});
  $("#fabAdd")?.addEventListener("click",()=>page==="jobs"?openJobForm():openTaskForm());
  $("#quickTask")?.addEventListener("click",()=>openTaskForm());
  $("#addTaskTop")?.addEventListener("click",()=>openTaskForm());
  $("#quickImport")?.addEventListener("click",openImport);
  $("#quickWizz")?.addEventListener("click",()=>openFreeWizz());
  $$("[data-filter]").forEach(b=>b.onclick=()=>{taskFilter=b.dataset.filter;render()});
  $$("[data-task-done]").forEach(b=>b.onclick=()=>completeTask(b.dataset.taskDone));
  $$("[data-task-undo]").forEach(b=>b.onclick=()=>undoTask(b.dataset.taskUndo));
  $$("[data-task-edit]").forEach(b=>b.onclick=()=>openTaskForm(b.dataset.taskEdit));
  $$("[data-task-wizz]").forEach(b=>b.onclick=()=>wizzTask(b.dataset.taskWizz));

  $("#newJob")?.addEventListener("click",()=>openJobForm());
  $("#jobImport")?.addEventListener("click",openImport);
  $("#jobWizzAll")?.addEventListener("click",()=>openFreeWizz("🧰 Petit rappel pour une job"));
  $$("[data-jobfilter]").forEach(b=>b.onclick=()=>{jobFilter=b.dataset.jobfilter;render()});
  $$("[data-job-item]").forEach(ch=>ch.onchange=()=>toggleJobItem(ch.dataset.jobItem,ch.dataset.itemId,ch.checked));
  $$("[data-job-additem]").forEach(b=>b.onclick=()=>addJobItemPrompt(b.dataset.jobAdditem));
  $$("[data-job-edit]").forEach(b=>b.onclick=()=>openJobForm(b.dataset.jobEdit));
  $$("[data-job-wizz]").forEach(b=>b.onclick=()=>wizzJob(b.dataset.jobWizz));
  $$("[data-job-archive]").forEach(b=>b.onclick=()=>archiveJob(b.dataset.jobArchive));
  $$("[data-job-restore]").forEach(b=>b.onclick=()=>restoreJob(b.dataset.jobRestore));
  $("[data-gojobsarchive]")?.addEventListener("click",()=>{page="jobs";jobFilter="archived";render()});

  bindSettings();
}

function openModal(html){const b=$("#modalBackdrop"),m=$("#modal");m.innerHTML=html;b.classList.remove("hidden");b.onclick=e=>{if(e.target===b)closeModal()};$("#modalClose")?.addEventListener("click",closeModal)}
function closeModal(){$("#modalBackdrop")?.classList.add("hidden")}
function modalHead(title){return `<div class="modalHead"><h2>${esc(title)}</h2><button class="close" id="modalClose">✕</button></div>`}
function memberOptions(selected="all"){
  const opts=[`<option value="all" ${selected==="all"?"selected":""}>Nous deux</option>`];
  members.forEach(m=>opts.push(`<option value="${esc(m.id)}" ${selected===m.id?"selected":""}>${esc(m.name)}${m.id===profile.memberId?" (moi)":""}</option>`));
  if(!members.length&&profile.memberId)opts.push(`<option value="${esc(profile.memberId)}" ${selected===profile.memberId?"selected":""}>${esc(myName())} (moi)</option>`);
  return opts.join("");
}
function openTaskForm(id=""){
  const t=id?hub().tasks.find(x=>x.id===id):null;
  const dueDate=t?.dueDate??localDateISO();
  openModal(`${modalHead(t?"Modifier la tâche":"Nouvelle affaire")}
    <form id="taskForm">
      <label>Quoi?<input name="title" required maxlength="120" value="${esc(t?.title||"")}" placeholder="Ex. Appeler le dentiste"></label>
      <div class="formGrid"><div><label>Type<select name="type"><option value="todo" ${t?.type==="todo"?"selected":""}>✅ À faire</option><option value="buy" ${t?.type==="buy"?"selected":""}>🛒 À acheter</option><option value="call" ${t?.type==="call"?"selected":""}>📞 À appeler</option><option value="wait" ${t?.type==="wait"?"selected":""}>⏳ En attente</option></select></label></div>
      <div><label>Pour qui?<select name="assignee">${memberOptions(t?.assigneeId||"all")}</select></label></div></div>
      <label>Quand?<input type="date" name="dueDate" value="${esc(dueDate)}"></label>
      <div class="tiny">Aujourd’hui par défaut. Efface la date si tu veux « Sans date ».</div>
      <label>Priorité<select name="priority"><option value="normal" ${t?.priority!=="hot"?"selected":""}>Normale</option><option value="hot" ${t?.priority==="hot"?"selected":""}>🔥 Important</option></select></label>
      <label>Note<textarea name="note" placeholder="Détail utile...">${esc(t?.note||"")}</textarea></label>
      <div class="modalActions"><button type="button" class="btn" id="cancelTask">Annuler</button><button class="btn primary">${t?"Enregistrer":"Ajouter"}</button></div>
      ${t?`<button type="button" class="btn danger full" id="deleteTask" style="margin-top:8px">🗑 Supprimer</button>`:""}
    </form>`);
  $("#cancelTask").onclick=closeModal;
  $("#taskForm").onsubmit=e=>{
    e.preventDefault();
    const f=new FormData(e.target),assigneeId=String(f.get("assignee")||"all"),m=members.find(x=>x.id===assigneeId);
    const obj=t||{id:uid("task"),createdAt:nowIso(),createdById:profile.memberId||"",createdByName:myName()};
    Object.assign(obj,{
      title:String(f.get("title")||"").trim(),
      type:String(f.get("type")||"todo"),
      assigneeId,
      assigneeName:assigneeId==="all"?"Nous deux":m?.name||((assigneeId===profile.memberId)?myName():""),
      dueDate:String(f.get("dueDate")||""),
      priority:String(f.get("priority")||"normal"),
      note:String(f.get("note")||"").trim(),
      updatedAt:nowIso()
    });
    if(!t)hub().tasks.push(obj);
    saveState();closeModal();toast(t?"Tâche modifiée ✅":"Ajouté à la liste ✅");
  };
  $("#deleteTask")?.addEventListener("click",()=>{if(!confirm("Supprimer cette tâche?"))return;t.deletedAt=nowIso();t.updatedAt=nowIso();saveState();closeModal();toast("Tâche supprimée")});
}
function completeTask(id){const t=hub().tasks.find(x=>x.id===id);if(!t)return;t.doneAt=nowIso();t.doneById=profile.memberId||"";t.doneByName=myName();t.updatedAt=nowIso();saveState();toast("Fait ✅")}
function undoTask(id){const t=hub().tasks.find(x=>x.id===id);if(!t)return;delete t.doneAt;delete t.doneById;delete t.doneByName;t.updatedAt=nowIso();saveState();toast("Remis à faire ↩")}

function openJobForm(id=""){
  const j=id?hub().jobs.find(x=>x.id===id):null;
  const lines=(j?.items||[]).map(x=>x.label).join("\n");
  openModal(`${modalHead(j?"Modifier la job":"Nouvelle job")}
    <form id="jobForm"><label>Nom de la job<input name="title" required maxlength="120" value="${esc(j?.title||"")}" placeholder="Ex. Garage chez Marc"></label>
      <label>Matériel / choses à apporter<textarea name="items" rows="8" placeholder="4 x 2x4\n1 boîte de vis 3 po\nClous\nLaser">${esc(lines)}</textarea></label>
      <label>Note<textarea name="note" placeholder="Détail de chantier, adresse, etc.">${esc(j?.note||"")}</textarea></label>
      <div class="tiny">🧰 Les jobs n’ont aucun rappel automatique.</div>
      <div class="modalActions"><button type="button" class="btn" id="cancelJob">Annuler</button><button class="btn primary">${j?"Enregistrer":"Créer la job"}</button></div>
      ${j?`<button type="button" class="btn danger full" id="deleteJob" style="margin-top:8px">🗑 Supprimer la job</button>`:""}
    </form>`);
  $("#cancelJob").onclick=closeModal;
  $("#jobForm").onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),labels=String(f.get("items")||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);const obj=j||{id:uid("job"),createdAt:nowIso(),createdById:profile.memberId||"",createdByName:myName(),items:[]};const old=new Map((obj.items||[]).map(x=>[normalize(x.label),x]));obj.title=String(f.get("title")||"").trim();obj.note=String(f.get("note")||"").trim();obj.items=labels.map(label=>old.get(normalize(label))||{id:uid("itm"),label,done:false,createdAt:nowIso(),updatedAt:nowIso()});obj.updatedAt=nowIso();if(!j)hub().jobs.push(obj);saveState();closeModal();toast(j?"Job modifiée 🧰":"Job créée 🧰")};
  $("#deleteJob")?.addEventListener("click",()=>{if(!confirm("Supprimer cette job?"))return;j.deletedAt=nowIso();j.updatedAt=nowIso();saveState();closeModal();toast("Job supprimée")});
}
function toggleJobItem(jobId,itemId,checked){const j=hub().jobs.find(x=>x.id===jobId);const it=j?.items?.find(x=>x.id===itemId);if(!it)return;it.done=!!checked;it.doneAt=checked?nowIso():null;it.doneByName=checked?myName():"";it.updatedAt=nowIso();j.updatedAt=nowIso();saveState()}
function addJobItemPrompt(jobId){const j=hub().jobs.find(x=>x.id===jobId);if(!j)return;const label=prompt("Quoi ajouter à la job?");if(!label?.trim())return;j.items=j.items||[];j.items.push({id:uid("itm"),label:label.trim(),done:false,createdAt:nowIso(),updatedAt:nowIso()});j.updatedAt=nowIso();saveState();toast("Ajouté à la job 🧰")}
function archiveJob(id){const j=hub().jobs.find(x=>x.id===id);if(!j)return;j.archivedAt=nowIso();j.archivedByName=myName();j.updatedAt=nowIso();saveState();toast("Job archivée 📦")}
function restoreJob(id){const j=hub().jobs.find(x=>x.id===id);if(!j)return;delete j.archivedAt;delete j.archivedByName;j.updatedAt=nowIso();saveState();toast("Job réactivée 🧰")}

async function wizzTask(id){const t=hub().tasks.find(x=>x.id===id);if(!t)return;const target=t.assigneeId&&t.assigneeId!=="all"&&t.assigneeId!==profile.memberId?t.assigneeId:"";await sendWizz(`⚡ WIZZ de ${myName()}`,`${t.title}${t.note?` · ${t.note}`:""}`,target)}
async function wizzJob(id){const j=hub().jobs.find(x=>x.id===id);if(!j)return;await sendWizz(`⚡ WIZZ de ${myName()}`,`🧰 Job : ${j.title}`)}
function openFreeWizz(prefill=""){
  openModal(`${modalHead("⚡ Envoyer un WIZZ")}<form id="wizzForm"><label>Message<textarea name="message" required placeholder="Ex. Pense à acheter du lait">${esc(prefill)}</textarea></label><button class="btn primary full">⚡ WIZZ maintenant</button></form>`);
  $("#wizzForm").onsubmit=async e=>{e.preventDefault();const msg=String(new FormData(e.target).get("message")||"").trim();if(!msg)return;closeModal();await sendWizz(`⚡ WIZZ de ${myName()}`,msg)};
}
async function sendWizz(title,message,targetMemberId=""){
  if(!profile.token||!profile.apiUrl)return toast("Connecte d’abord la liste familiale dans Réglages");
  try{const j=await api("/api/wizz",{method:"POST",body:JSON.stringify({title,message,targetMemberId})});toast(j.sent?"WIZZ envoyé ⚡":"WIZZ envoyé au serveur, mais aucun téléphone cible") }catch(e){toast("WIZZ impossible : "+e.message)}
}

function openImport(){
  openModal(`${modalHead("⚡ Import ChatGPT")}
    <div class="tiny">Tu peux coller plusieurs lignes TASK et JOB.</div>
    <div class="codeBox" style="margin-top:8px">TASK|ACHAT|Acheter du lait|NOUS|NORMAL|AUJOURDHUI|2 %<br>TASK|APPEL|Dentiste|MOI|NORMAL|DATE=2026-11-16<br>JOB|Garage chez Marc|2x4=4|Vis 3po=1 boîte|Clous|APPORTER=Laser</div>
    <label>Codes<textarea id="importText" rows="10" placeholder="Colle les codes ici"></textarea></label>
    <div class="two"><button type="button" class="btn pasteBtn" id="pasteImport">📋 Coller</button><button class="btn primary" id="doImport">Importer</button></div>
    <div id="importPreview" class="tiny" style="margin-top:8px"></div>`);
  $("#pasteImport").onclick=async()=>{
    try{
      if(!navigator.clipboard?.readText)throw new Error("clipboard");
      const txt=await navigator.clipboard.readText();
      if(!txt)return toast("Le presse-papiers est vide");
      $("#importText").value=txt;
      toast("Code collé 📋");
    }catch{
      $("#importText")?.focus();
      toast("Autorise « Coller » si l’iPhone le demande");
    }
  };
  $("#doImport").onclick=()=>applyImport($("#importText").value);
}
function parseType(v){const n=normalize(v).replace(/[_-]/g," ");if(["achat","acheter","buy"].includes(n))return"buy";if(["appel","appeler","call"].includes(n))return"call";if(["attente","en attente","wait"].includes(n))return"wait";return"todo"}
function resolveAssignee(token){const n=normalize(token);if(!token||["nous","nous deux","all","tous"].includes(n))return{id:"all",name:"Nous deux"};if(["moi","me"].includes(n))return{id:profile.memberId||"all",name:myName()};const m=members.find(x=>normalize(x.name)===n||normalize(x.name).includes(n)||n.includes(normalize(x.name)));return m?{id:m.id,name:m.name}:{id:"all",name:"Nous deux"}}
function parseJobPart(raw){const p=String(raw||"").trim();if(!p)return null;const eq=p.indexOf("=");if(eq<0)return{kind:"item",label:p};const key=p.slice(0,eq).trim(),val=p.slice(eq+1).trim();const kn=normalize(key);if(kn==="note"||kn==="notes")return{kind:"note",label:val};if(["apporter","a apporter","bring"].includes(kn))return{kind:"item",label:`À apporter : ${val}`};if(["mat","materiel","material"].includes(kn))return{kind:"item",label:val};return{kind:"item",label:`${val} · ${key}`}}
function applyImport(text){
  const lines=String(text||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);let added=0,errors=[];
  lines.forEach((line,i)=>{
    const p=line.split("|").map(x=>x.trim()),kind=normalize(p[0]);
    if(kind==="task"||kind==="tache"){
      const type=parseType(p[1]),title=p[2];
      if(!title){errors.push(`Ligne ${i+1}: titre manquant`);return}
      const a=resolveAssignee(p[3]),priority=/hot|priorite|🔥|urgent/i.test(p[4]||"")?"hot":"normal";
      let dueDate=localDateISO(),noteParts=[];
      p.slice(5).forEach(raw=>{
        const x=String(raw||"").trim(),n=normalize(x);
        if(!x)return;
        if(/^date\s*[=:]/i.test(x)){
          const v=x.replace(/^date\s*[=:]\s*/i,"").trim();
          if(/^\d{4}-\d{2}-\d{2}$/.test(v))dueDate=v;else noteParts.push(x);
          return;
        }
        if(["aujourdhui","aujourd hui","today"].includes(n)){dueDate=localDateISO();return}
        if(["demain","tomorrow"].includes(n)){dueDate=addLocalDays(1);return}
        if(["sans date","sans_date","nodate","aucune date"].includes(n)){dueDate="";return}
        if(["ce soir","soir"].includes(n)){dueDate=localDateISO();noteParts.push(x);return}
        noteParts.push(x);
      });
      hub().tasks.push({id:uid("task"),title,type,assigneeId:a.id,assigneeName:a.name,priority,dueDate,note:noteParts.join(" | "),createdAt:nowIso(),createdById:profile.memberId||"",createdByName:myName(),updatedAt:nowIso()});
      added++;return;
    }
    if(kind==="job"){
      const title=p[1];if(!title){errors.push(`Ligne ${i+1}: nom de job manquant`);return}
      let note="";const items=[];
      p.slice(2).forEach(x=>{const q=parseJobPart(x);if(!q)return;if(q.kind==="note")note=q.label;else items.push({id:uid("itm"),label:q.label,done:false,createdAt:nowIso(),updatedAt:nowIso()})});
      hub().jobs.push({id:uid("job"),title,note,items,createdAt:nowIso(),createdById:profile.memberId||"",createdByName:myName(),updatedAt:nowIso()});
      added++;return;
    }
    errors.push(`Ligne ${i+1}: doit commencer par TASK ou JOB`);
  });
  if(added)saveState();
  if(errors.length){
    $("#importPreview").innerHTML=`⚠️ ${esc(errors.join(" · "))}<br>✅ ${added} ajouté(s)`;
    toast(`${added} ajouté(s), ${errors.length} erreur(s)`);
  }else{
    closeModal();toast(`${added} élément(s) importé(s) ✅`);
  }
}

function apiBase(){return String(profile.apiUrl||"").replace(/\/+$/,"")}
async function api(path,opts={}){
  const headers={...(opts.headers||{})};if(opts.body)headers["Content-Type"]=profile.token?"application/json":"text/plain;charset=UTF-8";if(profile.token)headers.Authorization=`Bearer ${profile.token}`;
  const r=await fetch(apiBase()+path,{...opts,headers});let j={};try{j=await r.json()}catch{};if(!r.ok){const e=new Error(j.error||`Erreur ${r.status}`);e.status=r.status;e.payload=j;throw e}return j
}
function mergeById(local=[],remote=[]){const m=new Map();[...remote,...local].forEach(x=>{if(!x?.id)return;const old=m.get(x.id);if(!old||String(x.updatedAt||x.createdAt||"")>=String(old.updatedAt||old.createdAt||""))m.set(x.id,x)});return [...m.values()]}
function mergeState(local,remote){
  const out={...(remote||{}),...(local||{})};const lh=local?.[HUB_KEY]||{},rh=remote?.[HUB_KEY]||{};out[HUB_KEY]={...rh,...lh,version:1,tasks:mergeById(lh.tasks||[],rh.tasks||[]),jobs:mergeById(lh.jobs||[],rh.jobs||[]),updatedAt:[lh.updatedAt,rh.updatedAt].filter(Boolean).sort().pop()||nowIso()};return out
}
async function pullCloud(){
  if(cloudBusy||!profile.token||!profile.apiUrl)return;cloudBusy=true;updateSyncLine("Synchronisation…");
  try{const j=await api("/api/state");state=mergeState(state,j.data||{});ensureHub();profile.cloudVersion=Number(j.version||0);profile.joinCode=j.joinCode||profile.joinCode;saveProfile();saveLocal();await loadMembers();queueOneSignal(false);render();updateSyncLine("Synchronisé ✓","ok")}
  catch(e){updateSyncLine("Sync à vérifier","bad")}finally{cloudBusy=false}
}
async function pushCloud(retry=false){
  if(cloudBusy||!profile.token||!profile.apiUrl)return;cloudBusy=true;updateSyncLine("Envoi…");
  try{const j=await api("/api/state",{method:"PUT",body:JSON.stringify({version:Number(profile.cloudVersion||0),data:state})});profile.cloudVersion=Number(j.version||profile.cloudVersion||0);saveProfile();updateSyncLine("Synchronisé ✓","ok")}
  catch(e){if(e.status===409&&e.payload){state=mergeState(state,e.payload.data||{});profile.cloudVersion=Number(e.payload.version||0);saveProfile();saveLocal();cloudBusy=false;if(!retry)return pushCloud(true)}updateSyncLine("Sync à vérifier","bad")}
  finally{cloudBusy=false}
}
async function loadMembers(){if(!profile.token||!profile.apiUrl)return;try{const j=await api("/api/members");members=Array.isArray(j.members)?j.members:[]}catch{members=[]}}
function updateSyncLine(text,klass=""){const e=$("#syncLine");if(!e)return;if(text){e.textContent=text;e.className=`sync ${klass}`;return}if(profile.token&&profile.apiUrl){e.textContent="Liste familiale partagée";e.className="sync ok"}else{e.textContent="Mode local";e.className="sync"}}

function bindSettings(){
  $("#apiUrl")?.addEventListener("change",e=>{profile.apiUrl=e.target.value.trim();saveProfile()});
  $("#memberName")?.addEventListener("change",e=>{profile.memberName=e.target.value.trim();saveProfile();render()});
  $("#oneSignalId")?.addEventListener("change",e=>{profile.oneSignalAppId=e.target.value.trim();saveProfile()});
  $("#pullNow")?.addEventListener("click",async()=>{await pullCloud();toast("Synchronisé 🔄")});
  $("#disconnect")?.addEventListener("click",()=>{if(!confirm("Déconnecter ce téléphone de la liste partagée?"))return;profile.token="";profile.memberId="";profile.familyId="";profile.joinCode="";profile.cloudVersion=0;saveProfile();members=[];render();toast("Téléphone déconnecté")});
  $("#createFamily")?.addEventListener("click",createFamily);
  $("#joinFamily")?.addEventListener("click",joinFamily);
  $("#enablePush")?.addEventListener("click",()=>queueOneSignal(true));
  $("#testLocal")?.addEventListener("click",testLocalNotification);
  $("#testServerWizz")?.addEventListener("click",()=>sendWizz(`⚡ Test WIZZ de ${myName()}`,"Si tu vois ceci, le WIZZ partagé fonctionne ✅"));
  $("#exportHub")?.addEventListener("click",exportHub);
  $("#importHub")?.addEventListener("click",()=>$("#importFile")?.click());
  $("#importFile")?.addEventListener("change",e=>{const f=e.target.files?.[0];if(f)importHubFile(f);e.target.value=""});
  $("#resetHub")?.addEventListener("click",()=>{if(!confirm("Vider toutes les tâches et jobs de N’OUBLIE RIEN? Les anciennes données Budget Pack ne seront pas touchées."))return;state[HUB_KEY]=defaultHub();saveState();toast("Nouvelle liste vidée")});
}
async function createFamily(){
  profile.apiUrl=$("#apiUrl")?.value.trim()||profile.apiUrl;profile.memberName=$("#memberName")?.value.trim()||profile.memberName||"Moi";if(!profile.apiUrl)return toast("Entre l’adresse API");
  try{const j=await api("/api/family/create",{method:"POST",body:JSON.stringify({familyName:"N’OUBLIE RIEN",memberName:profile.memberName,timezone:"America/Toronto"})});Object.assign(profile,{token:j.token,memberId:j.memberId,familyId:j.familyId,joinCode:j.joinCode,cloudVersion:Number(j.version||0)});saveProfile();await pushCloud(true);await loadMembers();queueOneSignal(true);render();toast(`Partage créé · code ${j.joinCode}`)}catch(e){toast("Création impossible : "+e.message)}
}
async function joinFamily(){
  profile.apiUrl=$("#apiUrl")?.value.trim()||profile.apiUrl;profile.memberName=$("#memberName")?.value.trim()||profile.memberName||"Membre";const code=$("#joinCode")?.value.trim().toUpperCase();if(!profile.apiUrl||!code)return toast("Adresse API + code requis");
  try{const j=await api("/api/family/join",{method:"POST",body:JSON.stringify({joinCode:code,memberName:profile.memberName})});Object.assign(profile,{token:j.token,memberId:j.memberId,familyId:j.familyId,joinCode:j.joinCode,cloudVersion:0});saveProfile();await pullCloud();queueOneSignal(true);render();toast("Liste familiale rejointe ✅")}catch(e){toast("Impossible de rejoindre : "+e.message)}
}

function queueOneSignal(requestPermission=false){
  if(!profile.oneSignalAppId)profile.oneSignalAppId=DEFAULT_ONESIGNAL_APP_ID;saveProfile();
  window.OneSignalDeferred=window.OneSignalDeferred||[];
  window.OneSignalDeferred.push(async OneSignal=>{
    try{
      if(!oneSignalInitialized){await OneSignal.init({appId:profile.oneSignalAppId});oneSignalInitialized=true}
      if(profile.memberId)await OneSignal.login(profile.memberId);
      if(requestPermission)await OneSignal.Notifications.requestPermission();
      if(requestPermission)toast("Téléphone relié aux notifications 🔔")
    }catch(e){if(requestPermission)toast("Impossible d’activer les notifications")}
  });
}
async function testLocalNotification(){
  try{if(!("Notification" in window))return toast("Notifications non supportées");if(Notification.permission!=="granted")return toast("Active d’abord les notifications");const reg=("serviceWorker" in navigator)?await navigator.serviceWorker.ready:null;if(reg?.showNotification)await reg.showNotification("N’OUBLIE RIEN 🔔",{body:"Test local réussi ✅",icon:"icon-192.png",badge:"icon-192.png",tag:"noublie-test"});else new Notification("N’OUBLIE RIEN 🔔",{body:"Test local réussi ✅"});toast("Test local envoyé 🔔")}catch{toast("Test local impossible")}
}

function exportHub(){const blob=new Blob([JSON.stringify({app:"N’OUBLIE RIEN",build:BUILD,familyHub:hub()},null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`noublie-rien-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast("Sauvegarde exportée 📤")}
function importHubFile(file){const r=new FileReader();r.onload=()=>{try{const j=JSON.parse(r.result);const incoming=j.familyHub||j[HUB_KEY];if(!incoming||!Array.isArray(incoming.tasks)||!Array.isArray(incoming.jobs))throw Error();state[HUB_KEY]={...defaultHub(),...incoming};saveState();toast("Sauvegarde importée ✅")}catch{toast("Fichier invalide")}};r.readAsText(file)}

if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});
render();
if(profile.token&&profile.apiUrl){pullCloud();clearInterval(pullTimer);pullTimer=setInterval(()=>{if(document.visibilityState==="visible")pullCloud()},15000)}
queueOneSignal(false);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&profile.token&&profile.apiUrl)pullCloud()});

})();
