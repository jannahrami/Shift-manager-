// ======================================================================
// فهرس الأقسام (Table of Contents) — ابحث (Ctrl+F) عن اسم القسم أو "===="
// ======================================================================
// 1.  الثوابت والحالة العامة
// 2.  صيانة البيانات، Marine ID، بطاقات الصلاحية
// 3.  تسجيل الدخول، الجلسة، والمزامنة مع Supabase
// 4.  دوال تنسيق عامة (تاريخ، نص، هاتف)
// 5.  الداشبورد ولوحة المؤشرات
// 6.  التنبيهات والبحث الشامل
// 7.  التقويم (Calendar)
// 8.  دورة الشفت، التذكيرات اليومية والأسبوعية
// 9.  جدول الشفتات (عرض شهري بسيط)
// 10. رسائل واتساب وحالة الإجازة والتنبيهات
// 11. الموظفون: العرض، الملف الشخصي، السجلات والإنجازات
// 12. التقارير (شهرية، سنوية، إنجازات، تصدير Excel/PDF)
// 13. الإجازات والشفت (عرض القوائم)
// 14. التوزيع الشهري للمواقع (Monthly Roster)
// 15. التنقل بين الصفحات وفتح/إغلاق النماذج (Modals)
// 16. حفظ وحذف السجلات (موظف، إجازة، شفت، ملاحظة شخصية)
// 17. صفحة التحديثات (تعليمات وتغييرات العمل)
// 19. المساعد الذكي: أدوات نصية وصوتية عامة
// 20. المساعد الذكي: جلسة Realtime الصوتية (WebRTC)
// 21. المساعد الذكي: فهم الأسئلة النصية والردود
// 22. المساعد الذكي: تنفيذ الإجراءات وتأكيدها (save_leave وغيره)
// ======================================================================

// ==================== الثوابت والحالة العامة (Constants & State) ====================
const KEY='shiftManagerDataV3_GroupA_Leaves';
const OLD_SESSION_KEY='shiftManagerSupabaseSession';
const SESSION_KEY='shiftManagerAuthSessionV2';
const ADMIN_EMAIL='jannahrami@yahoo.com';
const GUEST_USERNAME='guest';
const GUEST_EMAIL='guest@shiftmanager.app';
const SUPABASE_URL='https://gfpzjydgcmwwrxrvmreq.supabase.co';
const SUPABASE_KEY='sb_publishable_VJ17gLtZ7CAHnpOP6G1yqw_CxvZgyrz';
const SOON_DAYS=3;
/* بيانات الموظفين الحساسة (تواريخ Marine ID وقوائم الصلاحيات) محفوظة في جدول shift_manager_config
   في Supabase، وتنقرأ بعد تسجيل الدخول — عشان ما تكون ظاهرة في الكود العام. */
let MARINE_ID_EXPIRY_BY_BADGE={};
let ACCESS_GROUPS=[];
async function loadAppConfig(){
  try{
    const res=await supabaseFetch('/rest/v1/shift_manager_config?select=key,value');
    if(!res.ok)return;
    (await res.json()).forEach(r=>{
      if(r.key==='marine_id_expiry'&&r.value&&typeof r.value==='object')MARINE_ID_EXPIRY_BY_BADGE=r.value;
      if(r.key==='access_groups'&&Array.isArray(r.value))ACCESS_GROUPS=r.value;
      if(r.key==='historical_locations_2026'&&r.value&&typeof r.value==='object')HISTORICAL_LOCATIONS_2026=r.value;
    });
  }catch(e){console.warn('config load failed',e)}
}
function emptyState(){return {employees:[],leaves:[],shifts:[],records:[],achievements:[],personalNotes:[],updates:[],forms:[],accidentReports:[],monthlySchedules:{},monthlyScheduleRequirements:{},monthlySchedulePeriods:{},leaveBalanceHistory:[],locationHistory:{}}}
let state=emptyState();

if(!Array.isArray(state.records)) state.records=[];
if(!Array.isArray(state.achievements)) state.achievements=[];
if(!Array.isArray(state.personalNotes)) state.personalNotes=[];
if(!Array.isArray(state.updates)) state.updates=[];
if(!Array.isArray(state.forms)) state.forms=[];
if(!Array.isArray(state.accidentReports)) state.accidentReports=[];
if(!state.monthlySchedules||typeof state.monthlySchedules!=='object'||Array.isArray(state.monthlySchedules))state.monthlySchedules={};
if(!state.monthlyScheduleRequirements||typeof state.monthlyScheduleRequirements!=='object'||Array.isArray(state.monthlyScheduleRequirements))state.monthlyScheduleRequirements={};
if(!state.monthlySchedulePeriods||typeof state.monthlySchedulePeriods!=='object'||Array.isArray(state.monthlySchedulePeriods))state.monthlySchedulePeriods={};
if(!state.locationHistory||typeof state.locationHistory!=='object'||Array.isArray(state.locationHistory))state.locationHistory={};
state.employees.forEach(e=>{if(!['chief','assistant','community','clerk','scc','visitor','commVisitor','leader','officer','patrol','flex'].includes(e.dutyRole))e.dutyRole=''})
state.employees.forEach(e=>{if(!Number.isFinite(Number(e.leaveBalance)))e.leaveBalance=0;else e.leaveBalance=Number(e.leaveBalance)});
if(!Array.isArray(state.leaveBalanceHistory))state.leaveBalanceHistory=[];
let selectedEmployeeId=null;
let editingEmployeeId=null;
let editingAchievementId=null;
let editingLeaveId=null;
let calendarMonth=todayISO().slice(0,7);
let scheduleMonth=todayISO().slice(0,7);
let monthlyRosterMonth=todayISO().slice(0,7);
let editingMonthlyRosterPost='';
let editingMonthlyRosterSelection=new Set();
let pendingAutoRoster=null;
let shiftDatePickerTarget='leaveStart';
let shiftDatePickerMonth=todayISO().slice(0,7);
let storedAuth=null;try{storedAuth=JSON.parse(localStorage.getItem(SESSION_KEY)||sessionStorage.getItem(SESSION_KEY)||'null')}catch{}
let session=storedAuth?.session||null;
let currentRole=storedAuth?.role||'guest';
let rememberSession=Boolean(localStorage.getItem(SESSION_KEY));
let syncTimer=null;
let cloudReady=false;

// ==================== صيانة البيانات، Marine ID، بطاقات الصلاحية ====================
function pruneOldMonthlyRosterLocations(){
  if(Number(state.monthlyRosterLocationsVersion)>=2)return false;
  const active=new Set([
    'leadership|Shift Chief (01)','leadership|Assistant Shift Chief (02)','leadership|Community Supervisor (03)','leadership|Shift Clerk','leadership|SCC','leadership|Ind. Visitor','leadership|Comm. Visitor',
    'stations|STN# 01','stations|STN# 04','stations|STN# 05','stations|STN# 06','stations|STN# 07','stations|STN# 10','stations|STN# 16A','stations|STN# 17',
    'patrol|Patrol# (05)','patrol|Patrol# (06)','patrol|Patrol# (07)','patrol|Patrol# (08)','patrol|Patrol# (09)','patrol|Patrol# (010)','patrol|Patrol# (011)','patrol|Patrol# (012)','patrol|Patrol# (013)'
  ]);
  [state.monthlySchedules,state.monthlyScheduleRequirements].forEach(months=>Object.values(months||{}).forEach(month=>Object.keys(month||{}).forEach(key=>{if(!active.has(key))delete month[key]})));
  state.monthlyRosterLocationsVersion=2;return true;
}

function ensureAnnualLeaveCredit(){
  const currentYear=new Date().getFullYear();
  const lastYear=Number(state.leaveBalanceAccrualYear);
  if(!Number.isInteger(lastYear)||lastYear<2020||lastYear>currentYear){
    state.leaveBalanceAccrualYear=currentYear;
    return true;
  }
  if(lastYear>=currentYear)return false;
  for(let year=lastYear+1;year<=currentYear;year++){
    let expiredDays=0;
    state.employees.forEach(e=>{
      const previous=Math.max(0,Number(e.leaveBalance)||0);
      const carried=Math.min(previous,9);
      expiredDays+=Math.max(0,previous-carried);
      e.leaveBalance=carried+30;
    });
    (state.leaves||[]).forEach(l=>{
      if(Number(l.pendingChargeYear)!==year)return;
      const d=Number(l.pendingChargeDays)||(diffDays(l.end,l.start)+1),e=state.employees.find(x=>x.id===l.employeeId);
      if(e)e.leaveBalance=(Number(e.leaveBalance)||0)-d;
      l.balanceDaysCharged=d;delete l.pendingChargeYear;delete l.pendingChargeDays;
    });
    state.leaveBalanceHistory.push({id:`annual-credit-${year}`,year,days:30,maxCarryOver:9,expiredDays,appliedAt:new Date().toISOString(),employeeCount:state.employees.length});
  }
  state.leaveBalanceAccrualYear=currentYear;
  return true;
}
function hydrateMarineIdDates(){let changed=false;state.employees.forEach(e=>{const date=MARINE_ID_EXPIRY_BY_BADGE[String(e.empId||'')];if(date&&!e.marineIdExpiry){e.marineIdExpiry=date;changed=true}});return changed}
function marineExpiryFor(employee){return employee?.marineIdExpiry||MARINE_ID_EXPIRY_BY_BADGE[String(employee?.empId||'')]||''}
function marineStatus(employee){
  const expiry=marineExpiryFor(employee);if(!expiry)return {kind:'missing',days:null,label:'غير مسجل'};
  const days=diffDays(expiry,todayISO());
  if(days<0)return {kind:'expired',days,label:`منتهية من ${Math.abs(days)} يوم`};
  if(days<=30)return {kind:'soon',days,label:days===0?'تنتهي اليوم':`تنتهي بعد ${days} يوم`};
  return {kind:'valid',days,label:'سارية'};
}
function marineEmployees(){return state.employees.filter(e=>marineExpiryFor(e)).map(employee=>({employee,status:marineStatus(employee)})).sort((a,b)=>marineExpiryFor(a.employee).localeCompare(marineExpiryFor(b.employee)))}
function renderMarineAlert(){
  const rows=marineEmployees(),expired=rows.filter(x=>x.status.kind==='expired').length,soon=rows.filter(x=>x.status.kind==='soon').length;
  const cls=expired?'danger':soon?'warning':'ok',text=expired?`${expired} منتهية${soon?` · ${soon} تنتهي خلال شهر`:''}`:soon?`${soon} تنتهي خلال شهر`:'جميع البطاقات سارية';
  const desktop=document.getElementById('marineAlert'),mobile=document.getElementById('marineMobileAlert');
  if(desktop){desktop.className=`marine-alert ${cls}`;desktop.innerHTML=`<strong>Marine ID Access</strong><span>${text}</span>`}
  if(mobile){mobile.className=`marine-mobile-alert ${cls}`;mobile.textContent=`بطاقات Marine: ${text}`}
}
function openMarineAlerts(){
  const rows=marineEmployees(),box=document.getElementById('marineAlertsList');
  box.innerHTML=rows.length?rows.map(({employee,status})=>`<div class="marine-row ${status.kind}" onclick="closeModal('marineAlertsModal');openEmployeeProfile('${employee.id}')" style="cursor:pointer"><div><div class="name">${esc(employee.nameAr||employee.name)}</div><div class="meta">Badge #${esc(employee.empId)} · ${esc(status.label)}</div></div><div class="marine-date">${fmtDate(marineExpiryFor(employee))}</div></div>`).join(''):'<div class="empty">لا توجد بيانات Marine ID مسجلة</div>';
  document.getElementById('marineAlertsModal').classList.add('show');
}
function accessEmployeeByBadge(badge){return state.employees.find(e=>String(e.empId||'')===String(badge))}
function employeeAccessGroups(employee){return ACCESS_GROUPS.filter(group=>group.badges.includes(String(employee?.empId||'')))}
function renderAccessCards(){
  const box=document.getElementById('accessCards');if(!box)return;
  box.innerHTML=ACCESS_GROUPS.map(group=>`<button class="access-card ${group.id}" onclick="openAccessGroup('${group.id}')"><span class="access-card-icon">${group.icon}</span><span><strong>${esc(group.title)}</strong><small>${esc(group.countLabel||`${group.badges.length} موظفين مصرح لهم`)}</small></span></button>`).join('');
  box.innerHTML+='<a class="access-card" href="https://jannahrami.github.io/newgrid/" target="_blank" rel="noopener noreferrer" style="background:linear-gradient(135deg,#1b2c47,#0f1b2d);border-color:#2a3f5f;color:#fff;text-decoration:none"><span class="access-card-icon" aria-hidden="true">📍</span><span><strong>PRC Grid Finder</strong><small>فتح أداة تحديد الشبكة</small></span></a>';
}
function openAccessGroup(groupId){
  const group=ACCESS_GROUPS.find(g=>g.id===groupId),box=document.getElementById('accessGroupMembers');if(!group||!box)return;
  document.getElementById('accessGroupTitle').textContent=group.title;
  box.innerHTML=group.badges.map(badge=>{const employee=accessEmployeeByBadge(badge),name=employee?(employee.nameAr||employee.name):group.names[badge],meta=group.id==='patrols'?'رقم التاج':(employee&&employee.nameAr?employee.name:'Access authorized');return `<div class="access-member" ${employee?`onclick="closeModal('accessGroupModal');openEmployeeProfile('${employee.id}')"`:''}><div><div class="name">${esc(name||'-')}</div><div class="meta">${esc(meta)}</div></div><span class="access-member-badge">${group.tagPrefix??'#'}${esc(badge)}</span></div>`}).join('');
  document.getElementById('accessGroupModal').classList.add('show');
}

// ==================== تسجيل الدخول، الجلسة، والمزامنة مع Supabase ====================
function setCloudStatus(mode,title){
  const el=document.getElementById('cloudStatus');
  el.className='cloud-status'+(mode?' '+mode:''); el.title=title||'حالة المزامنة';
}
function isAdmin(){return currentRole==='admin'&&String(session?.user?.email||'').toLowerCase()===ADMIN_EMAIL}
function updateLoginRoleUI(){
  const admin=document.getElementById('loginRole')?.value==='admin',row=document.getElementById('rememberLoginRow'),identity=document.getElementById('loginEmail');
  if(row)row.style.display=admin?'flex':'none';
  if(identity){identity.type=admin?'email':'text';identity.placeholder=admin?'البريد الإلكتروني':'اسم المستخدم';identity.value=admin?'':GUEST_USERNAME;identity.readOnly=!admin;identity.dir='ltr'}
  if(!admin){const remember=document.getElementById('rememberLogin');if(remember)remember.checked=false}
  document.getElementById('loginPassword')?.focus();
}
function persistAuth(){
  const payload=JSON.stringify({session,role:currentRole});localStorage.removeItem(SESSION_KEY);sessionStorage.removeItem(SESSION_KEY);
  (rememberSession&&isAdmin()?localStorage:sessionStorage).setItem(SESSION_KEY,payload);
}
function applyRoleUI(){
  document.querySelectorAll('.admin-only').forEach(el=>{el.classList.remove('admin-only');el.removeAttribute('aria-hidden')});
  document.querySelectorAll('.employee-role-select,.roster-required').forEach(el=>{el.disabled=false;el.removeAttribute('title')});
  document.body.classList.toggle('guest-mode',!isAdmin());{const sb=document.getElementById('shareInsightsBtn');if(sb)sb.style.display=isAdmin()?'':'none'}{const nb=document.getElementById('lpNavBtn');if(nb)nb.style.display=isAdmin()?'':'none';if(isAdmin())setTimeout(lpNavDot,1500)}document.getElementById('smBackupSection')?.classList.toggle('hidden',!isAdmin());const badge=document.getElementById('currentRoleBadge');if(badge)badge.textContent=isAdmin()?'Admin':'Guest · عرض فقط';
  if(isAdmin())return;
  const blocked=/^(openEmployeeModal|openLeaveModal|openShiftModal|openPersonalNoteModal|saveEmployeeRecord|saveEmployeeAchievement|editEmployeeAchievement|deleteEmployeeAchievement|deleteEmployeeRecord|editLeaveBalance|editEmployeeDutyRole|updateEmployeeDutyRole|saveMonthlyRosterPeriod|cancelMonthlyRoster|previewAutoMonthlyRoster|confirmAutoMonthlyRoster|openMonthlyRosterModal|saveMonthlyRosterAssignment|clearMonthlyRosterAssignment|saveEmployee|saveLeave|saveShift|savePersonalNote|deletePersonalNote|deleteEmployee|deleteLeave|deleteShift)/;
  document.querySelectorAll('[onclick]').forEach(el=>{const code=el.getAttribute('onclick')||'';if(blocked.test(code)){el.classList.add('admin-only');el.setAttribute('aria-hidden','true')}});
  document.querySelectorAll('.employee-role-select,.roster-required').forEach(el=>{el.disabled=true;el.title='وضع Guest للعرض فقط'});
  document.getElementById('backupBtn')?.classList.add('admin-only');document.querySelector('.ai-fab')?.classList.add('admin-only');
}
function unlockApp(){document.getElementById('authScreen')?.classList.add('hidden');document.getElementById('appShell')?.classList.remove('locked');applyRoleUI()}
function lockApp(message=''){
  document.getElementById('appShell')?.classList.add('locked');document.getElementById('authScreen')?.classList.remove('hidden');
  const error=document.getElementById('authError');if(error&&message)error.textContent=message;
}
async function supabaseFetch(path,options={}){
  const headers={apikey:SUPABASE_KEY,'Content-Type':'application/json',...(options.headers||{})};
  if(session?.access_token) headers.Authorization='Bearer '+session.access_token;
  return fetch(SUPABASE_URL+path,{...options,headers});
}
async function login(){
  const identity=document.getElementById('loginEmail').value.trim();
  const password=document.getElementById('loginPassword').value;
  const requestedRole=document.getElementById('loginRole').value;
  const email=requestedRole==='guest'?(identity.toLowerCase()===GUEST_USERNAME?GUEST_EMAIL:''):identity;
  const error=document.getElementById('authError'),btn=document.getElementById('loginBtn');
  if(!email||!password){error.textContent=requestedRole==='guest'?'أدخل اسم المستخدم guest وكلمة المرور':'أدخل البريد وكلمة المرور';return}
  btn.disabled=true;btn.textContent='جاري الدخول...';error.textContent='';
  try{
    const res=await supabaseFetch('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})});
    const data=await res.json(); if(!res.ok) throw new Error(data.error_description||data.msg||'تعذر تسجيل الدخول');
    const accountEmail=String(data?.user?.email||email).toLowerCase();
    if(requestedRole==='admin'&&accountEmail!==ADMIN_EMAIL)throw new Error('هذا الحساب غير مصرح له بالدخول كـ Admin');
    if(requestedRole==='guest'&&accountEmail!==GUEST_EMAIL)throw new Error('بيانات دخول Guest غير صحيحة');
    session=data;currentRole=requestedRole==='guest'?'guest':(accountEmail===ADMIN_EMAIL?'admin':'guest');rememberSession=isAdmin()&&document.getElementById('rememberLogin').checked;persistAuth();
    document.getElementById('loginPassword').value=''; await loadCloudState();
  }catch(e){error.textContent=e.message}
  finally{btn.disabled=false;btn.textContent='دخول ومزامنة'}
}
async function refreshSession(){
  if(!session?.refresh_token)return false;
  try{
    const res=await supabaseFetch('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:session.refresh_token})});
    if(!res.ok)return false;session=await res.json();if(currentRole==='admin'&&!isAdmin())return false;persistAuth();return true;
  }catch{return false}
}
async function loadCloudState(){
  setCloudStatus('','جاري المزامنة');
  try{
    const res=await supabaseFetch('/rest/v1/shift_manager_state?id=eq.main&select=data');
    if(res.status===401){if(await refreshSession())return loadCloudState();throw new Error('انتهت جلسة الدخول')}
    if(!res.ok)throw new Error('تعذر قراءة البيانات السحابية');
    const rows=await res.json();
    await loadAppConfig();
    if(rows.length&&rows[0].data&&Object.keys(rows[0].data).length){
      state=rows[0].data;
    }else{
      throw new Error('لا توجد بيانات محفوظة في الحساب. شغّل ملف التهيئة أولًا.');
    }
    if(!Array.isArray(state.records))state.records=[];
    if(!Array.isArray(state.achievements))state.achievements=[];
    if(!Array.isArray(state.personalNotes))state.personalNotes=[];
    if(!Array.isArray(state.updates))state.updates=[];
    if(!Array.isArray(state.forms))state.forms=[];
    if(!Array.isArray(state.accidentReports))state.accidentReports=[];
    if(!state.monthlySchedules||typeof state.monthlySchedules!=='object'||Array.isArray(state.monthlySchedules))state.monthlySchedules={};
    if(!state.monthlyScheduleRequirements||typeof state.monthlyScheduleRequirements!=='object'||Array.isArray(state.monthlyScheduleRequirements))state.monthlyScheduleRequirements={};
    if(!state.monthlySchedulePeriods||typeof state.monthlySchedulePeriods!=='object'||Array.isArray(state.monthlySchedulePeriods))state.monthlySchedulePeriods={};
    if(!state.locationHistory||typeof state.locationHistory!=='object'||Array.isArray(state.locationHistory))state.locationHistory={};
    state.employees.forEach(e=>{if(!['chief','assistant','community','clerk','scc','visitor','commVisitor','leader','officer','patrol','flex'].includes(e.dutyRole))e.dutyRole=''})
    state.employees.forEach(e=>{if(!Number.isFinite(Number(e.leaveBalance)))e.leaveBalance=0;else e.leaveBalance=Number(e.leaveBalance)});
    if(!Array.isArray(state.leaveBalanceHistory))state.leaveBalanceHistory=[];
    const marineIdsChanged=isAdmin()?hydrateMarineIdDates():false;
    const rosterLocationsChanged=isAdmin()?pruneOldMonthlyRosterLocations():false;
    const annualCreditChanged=isAdmin()?ensureAnnualLeaveCredit():false;
    loadRuntimeRosterConfig();
    localStorage.setItem(KEY,JSON.stringify(state));
    if(marineIdsChanged||rosterLocationsChanged||annualCreditChanged)await uploadCloudState();
    cloudReady=true;setCloudStatus('online','تمت المزامنة');unlockApp();renderAll();runDailyGreeting();
  }catch(e){cloudReady=false;setCloudStatus('offline','تعذرت المزامنة');lockApp(e.message||'تعذر تحميل البيانات')}
}
async function uploadCloudState(){
  if(!isAdmin())throw new Error('حساب Guest للعرض فقط');
  const res=await supabaseFetch('/rest/v1/shift_manager_state?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({id:'main',data:state,updated_at:new Date().toISOString()})});
  if(!res.ok)throw new Error('تعذر حفظ البيانات السحابية');
}
async function syncCloud(){
  if(!session||!cloudReady)return;
  setCloudStatus('','جاري الحفظ');
  try{await uploadCloudState();setCloudStatus('online','تم الحفظ والمزامنة')}
  catch{setCloudStatus('offline','حُفظ محليًا وتعذرت المزامنة')}
}
function save(){
  if(!isAdmin()){alert('حساب Guest للعرض فقط ولا يمكنه تعديل البيانات');return false}
  localStorage.setItem(KEY,JSON.stringify(state));renderAll();
  clearTimeout(syncTimer);syncTimer=setTimeout(syncCloud,450);
}
function logout(){
  session=null;currentRole='guest';rememberSession=false;cloudReady=false;localStorage.removeItem(SESSION_KEY);sessionStorage.removeItem(SESSION_KEY);localStorage.removeItem(KEY);document.body.classList.remove('guest-mode');setCloudStatus('offline','تم تسجيل الخروج');lockApp();
}

// ==================== دوال تنسيق عامة (تاريخ، نص، هاتف) ====================
function fmtDate(s){ if(!s)return ''; return new Date(s+'T12:00:00').toLocaleDateString('ar-SA-u-ca-gregory',{day:'2-digit',month:'2-digit',year:'numeric'}); }
function diffDays(a,b){ const x=new Date(a+'T12:00:00'),y=new Date(b+'T12:00:00'); return Math.round((x-y)/86400000); }
function formatDays(value){const n=Number(value)||0;return Number.isInteger(n)?String(n):n.toFixed(1)}
function todayISO(){
  const d=new Date(), y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function initials(n){ return (n||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join(''); }
function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function normalizeSaudiPhone(value=''){
  let digits=String(value).replace(/\D/g,'');
  if(digits.startsWith('00'))digits=digits.slice(2);
  if(/^05\d{8}$/.test(digits))return '966'+digits.slice(1);
  if(/^5\d{8}$/.test(digits))return '966'+digits;
  if(/^9665\d{8}$/.test(digits))return digits;
  return '';
}
function localPhone(value=''){const phone=normalizeSaudiPhone(value);return phone?'0'+phone.slice(3):String(value||'')}

