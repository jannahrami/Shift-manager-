// ==================== التنقل بين الصفحات وفتح/إغلاق النماذج (Modals) ====================
function renderAll(){
  document.getElementById('todayLabel').textContent=new Date().toLocaleDateString('ar-SA-u-ca-gregory',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric'});
  renderAccessCards();renderStats(); renderInsightsDashboard(); renderLeaveBalanceInsights(); renderDashboardShift();renderMarineAlert(); renderCurrentLeaveTable(); renderPersonalNotes(); renderUpdates(); renderAlerts(); renderNotificationBadge(); renderEmployees(); renderLeaves(); renderLeaveCalendar(); renderShiftSchedule(); renderMonthlyRoster(); renderShift(); refreshSelects(); renderShiftPreview(); if(selectedEmployeeId)renderEmployeeProfile();applyRoleUI();
}

/* ===== Annual leave plan (admin) — employees pick 3 months via personal links ===== */
const LP_MONTHS_AR=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const LP_MONTHS_EN=['January','February','March','April','May','June','July','August','September','October','November','December'];
const LP_STATUS={none:['لم يسلّم','b-neutral'],submitted:['قيد المراجعة','b-yellow'],approved:['معتمدة','b-green'],rejected:['مرفوضة','b-red']};
let lpState={year:null,settings:null,links:[],plans:[],filter:'all',loaded:false};
function lpEl(id){return document.getElementById(id)}
function lpDefaultYear(){const d=new Date();return d.getMonth()>=9?d.getFullYear()+1:d.getFullYear()}
function lpMax(){return Number(lpState.settings?.max_per_month)||6}
function lpLinkUrl(token){return new URL('leave-plan.html?t='+token,location.href).href}
function lpStatusMsg(text,error=false){const el=lpEl('lpStatus');if(!el)return;el.textContent=text||'';el.style.color=error?'var(--red)':''}
async function lpApi(path,options={}){
  let res=await supabaseFetch(path,options);
  if(res.status===401&&await refreshSession())res=await supabaseFetch(path,options);
  if(!res.ok){let msg='';try{const j=await res.json();msg=j.message||j.hint||''}catch{}throw new Error(msg||('HTTP '+res.status))}
  if(res.status===204)return null;
  const text=await res.text();return text?JSON.parse(text):null;
}
function lpFriendlyError(e){
  const m=String(e?.message||'');
  if(/leave_plan|does not exist|schema cache|relation/i.test(m))return 'جداول خطة الإجازة غير موجودة في قاعدة البيانات. شغّل ملف supabase/annual_leave_plan.sql في Supabase أولًا.';
  return 'تعذر الاتصال بقاعدة البيانات: '+m;
}
function lpInit(){
  const sec=lpEl('leavePlanSection');if(!sec)return;
  if(!isAdmin()){sec.style.display='none';return}
  sec.style.display='';
  const y=lpEl('lpYear');if(!y.value)y.value=lpDefaultYear();
  if(!lpState.loaded||lpState.year!==Number(y.value))lpLoad();
}
async function lpLoad(){
  if(!isAdmin())return;
  const year=Number(lpEl('lpYear').value)||lpDefaultYear();lpEl('lpYear').value=year;
  lpStatusMsg('جاري التحميل…');
  try{
    const [settings,links,plans]=await Promise.all([
      lpApi(`/rest/v1/leave_plan_settings?year=eq.${year}&select=*`),
      lpApi(`/rest/v1/leave_plan_links?year=eq.${year}&select=token,employee_id,badge,name,reminded_at`),
      lpApi(`/rest/v1/leave_plans?year=eq.${year}&select=*`)
    ]);
    lpState={...lpState,year,settings:settings?.[0]||null,links:links||[],plans:plans||[],loaded:true};
    lpEl('lpMax').value=lpMax();lpEl('lpOpen').checked=lpState.settings?lpState.settings.is_open:true;lpEl('lpDeadline').value=lpState.settings?.deadline||'';lpEl('lpDatesDeadline').value=lpState.settings?.dates_deadline||'';
    lpStatusMsg(lpState.links.length?'':'ما تم تجهيز روابط لهذه السنة بعد. اضغط «تجهيز روابط الموظفين».');
    lpRender();
  }catch(e){lpState.loaded=false;lpStatusMsg(lpFriendlyError(e),true);lpEl('lpList').innerHTML='';lpEl('lpStats').innerHTML='';lpEl('lpMonths').innerHTML=''}
}
async function lpSaveSettings(silent=false){
  const year=Number(lpEl('lpYear').value),max=Math.max(1,Math.min(60,Number(lpEl('lpMax').value)||6)),open=lpEl('lpOpen').checked,deadline=lpEl('lpDeadline').value||null,dates_deadline=lpEl('lpDatesDeadline').value||null;
  try{
    await lpApi('/rest/v1/leave_plan_settings?on_conflict=year',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({year,max_per_month:max,is_open:open,deadline,dates_deadline,updated_at:new Date().toISOString()})});
    lpState.settings={year,max_per_month:max,is_open:open,deadline,dates_deadline};lpNavDot();lpRender();if(!silent)lpStatusMsg('تم حفظ الإعدادات ✓');
  }catch(e){lpStatusMsg(lpFriendlyError(e),true)}
}
async function lpGenerateLinks(){
  const year=Number(lpEl('lpYear').value);const emps=state.employees||[];
  if(!emps.length){alert('لا يوجد موظفين');return}
  if(!confirm(`تجهيز روابط لـ ${emps.length} موظف لسنة ${year}؟\nالروابط الموجودة ما تتغير، وبس تنضاف روابط للموظفين الجدد.`))return;
  lpStatusMsg('جاري تجهيز الروابط…');
  try{
    if(!lpState.settings)await lpSaveSettings(true);
    const rows=emps.map(e=>({year,employee_id:String(e.id),badge:String(e.empId||''),name:rosterEmployeeName(e)||e.name||''}));
    await lpApi('/rest/v1/leave_plan_links?on_conflict=year,employee_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(rows)});
    await lpLoad();lpStatusMsg(`تم تجهيز ${rows.length} رابط ✓ الحين انسخها وأرسلها، أو أرسل لكل موظف من زر واتساب.`);
  }catch(e){lpStatusMsg(lpFriendlyError(e),true)}
}
function lpRows(){
  const plans=new Map(lpState.plans.map(p=>[String(p.employee_id),p])),links=new Map(lpState.links.map(l=>[String(l.employee_id),l]));
  const rows=(state.employees||[]).map(e=>{const id=String(e.id);return {id,name:rosterEmployeeName(e)||e.name||links.get(id)?.name||'',badge:String(e.empId||links.get(id)?.badge||''),employee:e,link:links.get(id),plan:plans.get(id)}});
  lpState.links.forEach(l=>{if(!rows.some(r=>r.id===String(l.employee_id)))rows.push({id:String(l.employee_id),name:l.name,badge:l.badge,employee:null,link:l,plan:plans.get(String(l.employee_id))})});
  return rows.sort((a,b)=>String(a.name).localeCompare(String(b.name),'ar'));
}
function lpMonthCounts(excludeId=''){const c=Array(13).fill(0);lpState.plans.forEach(p=>{if(p.status!=='rejected'&&String(p.employee_id)!==excludeId)c[p.assigned_month]++});return c}
function lpRender(){
  const rows=lpRows(),counts=lpMonthCounts(),max=lpMax();
  const st=k=>rows.filter(r=>(r.plan?.status||'none')===k).length;
  const sent=rows.filter(r=>r.plan).length;
  lpEl('lpDl').innerHTML=lpDeadlineBanner(rows);lpNavDot();
  lpEl('lpStats').innerHTML=[[sent,'سلّموا'],[rows.length-sent,'لم يسلّموا'],[st('submitted'),'بانتظار الاعتماد'],[st('approved'),'معتمدة']].map(([n,l])=>`<div class="lp-stat"><b>${n}</b><span>${l}</span></div>`).join('');
  lpEl('lpMonths').innerHTML=LP_MONTHS_AR.map((m,i)=>{const n=counts[i+1],pct=Math.min(100,Math.round(n/max*100));return `<div class="lp-month ${n>=max?'full':n>=max-1?'near':''}" title="${LP_MONTHS_EN[i]}"><b>${m}</b>${n} / ${max}<div class="bar"><i style="width:${pct}%"></i></div></div>`}).join('');
  const dst=k=>rows.filter(r=>r.plan?.status==='approved'&&(r.plan.dates_status||'none')===k).length;
  const filters=[['all','الكل',rows.length],['none','لم يسلّم',st('none')],['submitted','بانتظار',st('submitted')],['approved','معتمدة',st('approved')],['rejected','مرفوضة',st('rejected')],['d_none','لم يحدد التواريخ',dst('none')],['d_submitted','تواريخ للمراجعة',dst('submitted')],['d_approved','تواريخ معتمدة',dst('approved')]];
  lpEl('lpFilter').innerHTML=filters.map(([k,l,n])=>`<button class="secondary ${lpState.filter===k?'on':''}" onclick="lpState.filter='${k}';lpRender()">${l} (${n})</button>`).join('');
  const shown=rows.filter(r=>{const f=lpState.filter;if(f==='all')return true;if(f.startsWith('d_'))return r.plan?.status==='approved'&&(r.plan.dates_status||'none')===f.slice(2);return (r.plan?.status||'none')===f});
  lpEl('lpList').innerHTML=shown.length?shown.map(lpRowHtml).join(''):`<div class="small-note" style="padding:12px">لا يوجد موظفين في هذا التصنيف</div>`;
}
/* Previous-year leave per employee (from leaves already entered in the app). Courses are not counted as leave. */
const LP_NOT_LEAVE=/cour|coure|دورة|تدريب|training/i;
function lpPrev(id,year){
  const days=Array(13).fill(0);
  (state.leaves||[]).forEach(l=>{
    if(String(l.employeeId)!==String(id)||LP_NOT_LEAVE.test(l.note||''))return;
    const s=/^(\d{4})-(\d{2})-(\d{2})$/.exec(l.start||''),e=/^(\d{4})-(\d{2})-(\d{2})$/.exec(l.end||'');if(!s||!e)return;
    let d=Date.UTC(+s[1],+s[2]-1,+s[3]);const end=Date.UTC(+e[1],+e[2]-1,+e[3]);
    for(let guard=0;d<=end&&guard<400;d+=86400000,guard++){const x=new Date(d);if(x.getUTCFullYear()===year)days[x.getUTCMonth()+1]++}
  });
  const months=[];for(let m=1;m<=12;m++)if(days[m])months.push({m,days:days[m]});
  return {months,main:new Set(months.filter(x=>x.days>=7).map(x=>x.m))};
}
function lpRepeat(r){const p=r.plan;if(!p||p.status==='rejected')return false;return lpPrev(r.id,lpState.year-1).main.has(p.assigned_month)}
const LP_DATES={none:['بانتظار تحديد التواريخ','b-neutral'],submitted:['التواريخ قيد المراجعة','b-yellow'],approved:['التواريخ معتمدة ✓','b-green'],rejected:['التواريخ مرفوضة','b-red']};
function lpFmtDay(d){const [y,m,dd]=d.split('-').map(Number);return `${dd} ${LP_MONTHS_AR[m-1]}`}
function lpPeriodsText(p,sep='  ·  '){return (p?.periods||[]).map(x=>`${lpFmtDay(x.start)} إلى ${lpFmtDay(x.end)} (${diffDays(x.end,x.start)+1} يوم)`).join(sep)}
const LP_SHIFT_WORD={N:'ليل',A:'مساء',M:'صباح'};
/* الشفتات اللي تغطيها الإجازة، مثل: مساء - صباح - ليل (3 أيام) */
function lpShiftsOfPeriod(x){
  const parts=[];let cur=null;
  for(let d=x.start;d<=x.end;d=addDaysISO(d,1)){
    const sh=groupShiftForDate(d);if(!LP_SHIFT_WORD[sh.code])continue;
    const key=sh.code+shiftPeriodStart(d,sh.code);
    if(cur&&cur.key===key)cur.days++;else{cur={key,code:sh.code,days:1};parts.push(cur)}
  }
  const back=firstWorkDayAfterLeave(x.end);
  return parts.map(p=>LP_SHIFT_WORD[p.code]+(p.days<7?` (${p.days} ${p.days<=10&&p.days>=3?'أيام':'يوم'})`:'')).join(' - ')+(back?` · يباشر ${lpFmtDay(back.date)} ${LP_SHIFT_WORD[back.code]||''}`:'');
}
function lpShiftsText(p,sep=' | '){return (p?.periods||[]).map(lpShiftsOfPeriod).filter(Boolean).join(sep)}
function lpRowHtml(r){
  const p=r.plan,[label,cls]=LP_STATUS[p?.status||'none'];
  const choices=p?[p.choice1,p.choice2,p.choice3].map((m,i)=>`<span class="lp-chip ${p.assigned_month===m?'assigned':''}" title="اضغط لتحويل الحجز لهذا الشهر" onclick="lpAssign('${esc(r.id)}',${m})"><span class="n">${i+1}</span>${LP_MONTHS_AR[m-1]}</span>`).join(''):'<span class="small-note">—</span>';
  const id=esc(r.id),acts=[];
  if(p?.status==='submitted')acts.push(`<button class="primary" onclick="lpSetStatus('${id}','approved')">اعتماد الشهر</button>`,`<button class="danger" onclick="lpReject('${id}')">رفض</button>`);
  if(p&&p.status!=='submitted'&&p.dates_status!=='approved')acts.push(`<button class="secondary" onclick="lpSetStatus('${id}','submitted')">إرجاع للانتظار</button>`);
  let datesHtml='';
  if(p?.status==='approved'){
    const ds=p.dates_status||'none',[dl,dc]=LP_DATES[ds];
    datesHtml=`<div class="lp-dates"><span class="badge ${dc}">${dl}</span>${p.periods?.length?`<span class="lp-dates-text">${esc(lpPeriodsText(p))}</span><span class="small-note">${esc(lpShiftsText(p))}</span>`:''}${p.dates_note&&ds==='rejected'?`<small style="color:var(--red)">${esc(p.dates_note)}</small>`:''}${(()=>{if(p.assigned_month<10||!p.periods?.length)return '';const pb=lpProjectedBalance(r,lpState.year);return pb&&pb.balance>9?`<small style="color:var(--red);font-weight:700">⚠ يبقى رصيده ${pb.balance} يوم بعد الإجازة — فوق 9، لازم يزيد ${pb.balance-9} يوم</small>`:''})()}</div>`;
    if(ds==='submitted')acts.push(`<button class="primary" onclick="lpApproveDates('${id}')">اعتماد التواريخ</button>`,`<button class="danger" onclick="lpRejectDates('${id}')">رفض التواريخ</button>`);
    acts.push(`<button class="secondary" onclick="lpEditDates('${id}')">${p.periods?.length?'تعديل التواريخ':'إدخال التواريخ'}</button>`);
    if(ds==='approved')acts.push(`<button class="secondary" onclick="lpUnapproveDates('${id}')">إلغاء اعتماد التواريخ</button>`);
  }
  if(r.link)acts.push(`<button class="secondary" onclick="lpCopyOne('${id}')">نسخ الرسالة</button>`,`<button class="whatsapp-btn" style="color:#fff;border:1px solid;border-radius:12px" onclick="lpWhatsApp('${id}')">واتساب</button>`);
  const note=p?.admin_note?`<small style="color:var(--red)">${esc(p.admin_note)}</small>`:'';
  const py=lpState.year-1,prev=lpPrev(r.id,py),rep=lpRepeat(r);
  const prevLine=`<small class="lp-prev">إجازة ${py}: ${prev.months.length?prev.months.map(x=>`${LP_MONTHS_AR[x.m-1]} (${x.days})`).join('، '):'لا يوجد'}</small>`;
  const repTag=rep?`<span class="badge b-red" style="display:inline-block;margin-top:5px;margin-right:4px">⚠ نفس شهر ${py}</span>`:'';
  return `<div class="row lp-row"><div class="lp-who"><b>${esc(r.name)}</b><small>رقم الباج ${esc(r.badge)}</small>${prevLine}<span class="badge ${cls}" style="display:inline-block;margin-top:5px">${label}</span>${repTag}${note}</div><div class="lp-choices">${choices}${datesHtml}</div><div class="lp-row-actions">${acts.join('')}</div></div>`;
}
async function lpPatch(id,patch){
  await lpApi(`/rest/v1/leave_plans?year=eq.${lpState.year}&employee_id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({...patch,updated_at:new Date().toISOString()})});
  const p=lpState.plans.find(x=>String(x.employee_id)===id);if(p)Object.assign(p,patch);lpRender();
}
function lpPlan(id){return lpState.plans.find(x=>String(x.employee_id)===id)}
const LP_CLEAR_DATES={periods:null,dates_status:null,dates_note:'',dates_submitted_at:null};
async function lpSetStatus(id,status){
  const p=lpPlan(id);
  if(p?.dates_status==='approved'&&status!=='approved'){alert('تواريخ هذا الموظف معتمدة ومضافة للإجازات. ألغِ اعتماد التواريخ أولًا.');return}
  const clear=p?.status==='approved'&&status!=='approved'&&p.periods?.length;
  if(clear&&!confirm('الموظف محدد تواريخ. إرجاع الخطة بيمسح التواريخ. متأكد؟'))return;
  try{await lpPatch(id,{status,...(status!=='rejected'?{admin_note:''}:{}),...(clear?LP_CLEAR_DATES:{})})}catch(e){alert(lpFriendlyError(e))}
}
async function lpReject(id){
  const note=prompt('سبب الرفض (يظهر للموظف، اختياري):','');if(note===null)return;
  try{await lpPatch(id,{status:'rejected',admin_note:note.trim()})}catch(e){alert(lpFriendlyError(e));return}
  lpOfferWhatsApp(id);
}
async function lpAssign(id,month){
  const p=lpPlan(id);if(!p||p.assigned_month===month)return;
  if(p.dates_status==='approved'){alert('تواريخ هذا الموظف معتمدة. ألغِ اعتماد التواريخ أولًا قبل تغيير الشهر.');return}
  const n=lpMonthCounts(id)[month];
  if(n>=lpMax()&&!confirm(`شهر ${LP_MONTHS_AR[month-1]} فيه ${n} موظفين (الحد ${lpMax()}). تبغى تحوله له رغم ذلك؟`))return;
  if(!confirm(`تحويل حجز ${p.name} إلى شهر ${LP_MONTHS_AR[month-1]}؟${p.periods?.length?'\nالتواريخ اللي حددها بتنمسح ويحددها من جديد.':''}`))return;
  try{await lpPatch(id,{assigned_month:month,...(p.periods?.length||p.dates_status?LP_CLEAR_DATES:{})})}catch(e){alert(lpFriendlyError(e))}
}
/* ---- اعتماد التواريخ = إضافتها لقسم الإجازات وخصمها من الرصيد ---- */
function lpRemoveLinkedLeaves(p){
  const ids=new Set((p.leave_ids||[]).map(String));if(!ids.size)return 0;let n=0;
  state.leaves=(state.leaves||[]).filter(l=>{if(!ids.has(String(l.id)))return true;const c=leaveChargedDays(l);if(c){const e=state.employees.find(x=>x.id===l.employeeId);if(e)e.leaveBalance=(Number(e.leaveBalance)||0)+c}n++;return false});
  return n;
}
function lpBuildLeaves(p){
  const future=lpState.year>new Date().getFullYear();
  return (p.periods||[]).map(x=>{const d=diffDays(x.end,x.start)+1;return {id:crypto.randomUUID(),employeeId:String(p.employee_id),start:x.start,end:x.end,note:`خطة الإجازة السنوية ${lpState.year}`,...(future?{balanceDaysCharged:0,pendingChargeYear:lpState.year,pendingChargeDays:d}:{balanceDaysCharged:d})}});
}
function lpReqText(m){return m<=3?'شفتين على الأقل':m>=10?'شفتات تكفي إن رصيدك ما يبقى أكثر من 9 أيام':'3 شفتات'}
const LP_SHIFT_CAP={N:6,A:5,M:5};
function lpShiftCapWarnings(p,ignoreIds){
  const out=[],emp=String(p.employee_id),seen=new Set();
  (p.periods||[]).forEach(x=>{
    for(let d=x.start;d<=x.end;d=addDaysISO(d,1)){
      const sh=groupShiftForDate(d),cap=LP_SHIFT_CAP[sh.code];if(!cap)continue;
      const who=new Set((state.leaves||[]).filter(l=>!ignoreIds.has(String(l.id))&&String(l.employeeId)!==emp&&l.start<=d&&l.end>=d).map(l=>String(l.employeeId)));
      if(who.size+1>cap){const key=sh.code+shiftPeriodStart(d,sh.code);if(!seen.has(key)){seen.add(key);out.push(`شفت ${sh.arabic} ${fmtDate(d)}: بيصيرون ${who.size+1} مجازين والحد ${cap}`)}}
    }
  });
  return out;
}
function lpCapacityWarnings(p,ignoreIds){
  const msgs=lpShiftCapWarnings(p,ignoreIds);
  (p.periods||[]).forEach(x=>{
    const saved=state.leaves;state.leaves=(state.leaves||[]).filter(l=>!ignoreIds.has(String(l.id)));
    let c;try{c=checkLeaveCapacity(String(p.employee_id),x.start,x.end,null)}finally{state.leaves=saved}
    if(c.employeeConflict)msgs.push(`عنده إجازة متداخلة من ${fmtDate(c.employeeConflict.start)} إلى ${fmtDate(c.employeeConflict.end)}`);
    if(c.blocked.length)msgs.push(`${c.blocked.length} يوم فوق الحد الأعلى للمجازين (مثل ${fmtDate(c.blocked[0].date)}: ${c.blocked[0].total} موظفين)`);
  });
  return msgs;
}
async function lpApproveDates(id){
  const p=lpPlan(id);if(!p?.periods?.length){alert('ما فيه تواريخ');return}
  const old=new Set((p.leave_ids||[]).map(String)),warn=lpCapacityWarnings(p,old);
  if(!confirm(`اعتماد تواريخ ${p.name}؟\n${lpPeriodsText(p,'\n')}\n\nبتنضاف لقسم الإجازات، و${lpState.year>new Date().getFullYear()?`تنخصم من رصيد ${lpState.year} تلقائي أول يوم في السنة (بعد إضافة الـ 30 يوم)`:'تنخصم من رصيده'}.${warn.length?'\n\n⚠ '+warn.join('\n⚠ '):''}`))return;
  const leaves=lpBuildLeaves(p);
  try{await lpPatch(id,{dates_status:'approved',dates_note:'',leave_ids:leaves.map(l=>l.id)})}catch(e){alert(lpFriendlyError(e));return}
  lpRemoveLinkedLeaves({leave_ids:[...old]});
  leaves.forEach(l=>{state.leaves.push(l);const e=state.employees.find(x=>x.id===l.employeeId);if(e)e.leaveBalance=(Number(e.leaveBalance)||0)-l.balanceDaysCharged});
  save();lpStatusMsg(`تم اعتماد تواريخ ${p.name} وإضافتها للإجازات ✓`);
}
async function lpApproveAllDates(){
  const list=lpState.plans.filter(p=>p.status==='approved'&&p.dates_status==='submitted'&&p.periods?.length);
  if(!list.length){alert('ما فيه تواريخ بانتظار الاعتماد');return}
  const warns=[];list.forEach(p=>{const w=lpCapacityWarnings(p,new Set((p.leave_ids||[]).map(String)));if(w.length)warns.push(`• ${p.name}: ${w[0]}`)});
  if(!confirm(`اعتماد تواريخ ${list.length} موظف دفعة وحدة؟\nبتنضاف لقسم الإجازات${lpState.year>new Date().getFullYear()?` وتنخصم من رصيد ${lpState.year} أول السنة`:' وتنخصم من الأرصدة'}.${warns.length?`\n\n⚠ تنبيهات (${warns.length}):\n`+warns.slice(0,8).join('\n')+(warns.length>8?'\n…':''):''}`))return;
  let done=0,failed=0;
  for(const p of list){
    const id=String(p.employee_id),old=[...(p.leave_ids||[])],leaves=lpBuildLeaves(p);
    try{await lpPatch(id,{dates_status:'approved',dates_note:'',leave_ids:leaves.map(l=>l.id)})}catch(e){failed++;continue}
    lpRemoveLinkedLeaves({leave_ids:old});
    leaves.forEach(l=>{state.leaves.push(l);const e=state.employees.find(x=>x.id===l.employeeId);if(e)e.leaveBalance=(Number(e.leaveBalance)||0)-l.balanceDaysCharged});
    done++;lpStatusMsg(`جاري الاعتماد… ${done} / ${list.length}`);
  }
  if(done)save();
  lpStatusMsg(`تم اعتماد تواريخ ${done} موظف ✓${failed?` · تعذر ${failed}`:''}`,!!failed);
}
async function lpUnapproveDates(id){
  const p=lpPlan(id);if(!p)return;
  if(!confirm(`إلغاء اعتماد تواريخ ${p.name}؟\nبتنحذف من قسم الإجازات ويرجع الرصيد، وترجع التواريخ للمراجعة.`))return;
  const ids=[...(p.leave_ids||[])];
  try{await lpPatch(id,{dates_status:'submitted',leave_ids:[]})}catch(e){alert(lpFriendlyError(e));return}
  lpRemoveLinkedLeaves({leave_ids:ids});save();lpStatusMsg('تم إلغاء اعتماد التواريخ');
}
async function lpRejectDates(id){
  const note=prompt('سبب رفض التواريخ (يظهر للموظف ويختار من جديد):','');if(note===null)return;
  try{await lpPatch(id,{dates_status:'rejected',dates_note:note.trim()})}catch(e){alert(lpFriendlyError(e));return}
  lpOfferWhatsApp(id);
}
function lpOfferWhatsApp(id){const r=lpRows().find(x=>x.id===id);if(r?.link&&confirm(`تم الرفض. ترسل لـ ${r.name} رسالة واتساب فيها السبب وطلب إعادة الاختيار؟`))lpWhatsApp(id)}
function lpEditDates(id){
  const p=lpPlan(id);if(!p)return;document.getElementById('lpDatesEditor')?.remove();
  const per=[...(p.periods||[]),{},{}].slice(0,2);
  const box=document.createElement('div');box.id='lpDatesEditor';box.className='modal show';
  box.innerHTML=`<div class="sheet" style="max-width:460px"><h3 style="margin:0 0 4px">تواريخ ${esc(p.name)}</h3>
    <p class="small-note" style="margin:0 0 12px">الشهر المعتمد: ${LP_MONTHS_AR[p.assigned_month-1]} · المطلوب ${lpReqText(p.assigned_month)}. الحد: ليلي 6 · صباحي/مسائي 5. الفترة الثانية اختيارية.${p.dates_status==='approved'?' التعديل بيحدّث الإجازة في قسم الإجازات والرصيد مباشرة.':''}</p>
    ${per.map((x,i)=>`<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px"><label class="small-note">الفترة ${i+1} من<input type="date" id="lpEdS${i}" value="${x.start||''}"></label><label class="small-note">إلى<input type="date" id="lpEdE${i}" value="${x.end||''}"></label></div>`).join('')}
    <div id="lpEdShift" class="small-note" style="margin-bottom:10px"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="secondary" onclick="document.getElementById('lpDatesEditor').remove()">إلغاء</button><button class="primary" onclick="lpSaveDates('${esc(id)}')">حفظ</button></div></div>`;
  document.body.appendChild(box);
  const hint=()=>{const t=[0,1].map(i=>{const s=document.getElementById('lpEdS'+i).value,e=document.getElementById('lpEdE'+i).value;if(!s||!e)return '';const back=firstWorkDayAfterLeave(e);return `الفترة ${i+1}: تبدأ ${groupShiftForDate(s).arabic} وتنتهي ${groupShiftForDate(e).arabic}${back?` · يباشر ${lpFmtDay(back.date)} ${groupShiftForDate(back.date).arabic}`:''}`}).filter(Boolean);document.getElementById('lpEdShift').textContent=t.join(' · ')};
  box.querySelectorAll('input').forEach(i=>i.addEventListener('change',hint));hint();
}
async function lpSaveDates(id){
  const p=lpPlan(id);if(!p)return;const periods=[];
  for(const i of [0,1]){const s=document.getElementById('lpEdS'+i).value,e=document.getElementById('lpEdE'+i).value;
    if(!s&&!e)continue;if(!s||!e){alert(`أكمل تاريخ البداية والنهاية للفترة ${i+1}`);return}if(e<s){alert(`نهاية الفترة ${i+1} قبل بدايتها`);return}periods.push({start:s,end:e})}
  if(!periods.length){alert('أدخل فترة وحدة على الأقل');return}
  periods.sort((a,b)=>a.start.localeCompare(b.start));
  if(periods[1]&&periods[1].start<=periods[0].end){alert('الفترتين متداخلتين');return}
  const approved=p.dates_status==='approved';
  if(approved){
    const tmp={...p,periods},warn=lpCapacityWarnings(tmp,new Set((p.leave_ids||[]).map(String)));
    if(warn.length&&!confirm('⚠ '+warn.join('\n⚠ ')+'\n\nتبغى تحفظ رغم ذلك؟'))return;
    const leaves=lpBuildLeaves(tmp),old=[...(p.leave_ids||[])];
    try{await lpPatch(id,{periods,leave_ids:leaves.map(l=>l.id)})}catch(e){alert(lpFriendlyError(e));return}
    lpRemoveLinkedLeaves({leave_ids:old});
    leaves.forEach(l=>{state.leaves.push(l);const e=state.employees.find(x=>x.id===l.employeeId);if(e)e.leaveBalance=(Number(e.leaveBalance)||0)-l.balanceDaysCharged});save();
  }else{
    try{await lpPatch(id,{periods,dates_status:'submitted',dates_note:'',dates_submitted_at:p.dates_submitted_at||new Date().toISOString()})}catch(e){alert(lpFriendlyError(e));return}
  }
  document.getElementById('lpDatesEditor')?.remove();lpStatusMsg(`تم حفظ تواريخ ${p.name} ✓`);
}
function lpPhase(r){const p=r.plan;if(p?.status==='approved'&&(!p.dates_status||p.dates_status==='rejected'))return 'dates';return 'months'}
function lpMessage(r){
  const url=lpLinkUrl(r.link.token),p=r.plan;
  if(p?.status==='rejected'){
    const why=p.admin_note?`\nالسبب: ${p.admin_note}`:'';
    return `السلام عليكم ${r.name}\nنعتذر، لم يتم اعتماد خطة إجازتك لسنة ${lpState.year} (الخيار: ${LP_MONTHS_AR[p.choice1-1]}).${why}\nالرجاء الدخول على الرابط واختيار أشهر جديدة، ثم الإرسال مرة ثانية:\n${url}\nالرابط خاص فيك، لا تشاركه.`;
  }
  if(p?.status==='approved'&&p.dates_status==='rejected'){
    const why=p.dates_note?`\nالسبب: ${p.dates_note}`:'';
    return `السلام عليكم ${r.name}\nشهر إجازتك (${LP_MONTHS_AR[p.assigned_month-1]}) معتمد ✓، بس التواريخ اللي اخترتها تحتاج تعديل.${why}\nالرجاء الدخول على الرابط واختيار فترة جديدة من التقويم:\n${url}\nالرابط خاص فيك، لا تشاركه.`;
  }
  if(lpPhase(r)==='dates')return `السلام عليكم ${r.name}\nتم اعتماد إجازتك السنوية لسنة ${lpState.year} في شهر ${LP_MONTHS_AR[p.assigned_month-1]} ✓\nالرجاء الدخول على الرابط وتحديد فترة الإجازة (${lpReqText(p.assigned_month)}) من التقويم:${lpDlLine('dates')}\n${url}\nالرابط خاص فيك، لا تشاركه.`;
  return `السلام عليكم ${r.name}\nهذا رابط خطة إجازتك السنوية لسنة ${lpState.year}. اختر 3 أشهر بالترتيب، والمشرف يراجع الخطط ويعتمدها.${lpDlLine('months')}\n${url}\nالرابط خاص فيك، لا تشاركه.`;
}
/* ===== آخر موعد + التذكير ===== */
const LP_DAYS_AR=['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
function lpTodayISO(){const d=new Date(Date.now()+3*3600000);return d.toISOString().slice(0,10)}
function lpDaysLeft(dl){if(!dl)return null;return diffDays(dl,lpTodayISO())}
function lpDlFmt(dl){const [y,m,d]=dl.split('-').map(Number);return `${LP_DAYS_AR[new Date(Date.UTC(y,m-1,d)).getUTCDay()]} ${d} ${LP_MONTHS_AR[m-1]}`}
function lpLeftText(n){return n<0?'انتهى الموعد':n===0?'اليوم آخر يوم':n===1?'باقي يوم واحد':n===2?'باقي يومين':n<=10?`باقي ${n} أيام`:`باقي ${n} يوم`}
function lpDl(kind){return kind==='dates'?lpState.settings?.dates_deadline:lpState.settings?.deadline}
function lpDlLine(kind){const dl=lpDl(kind);if(!dl)return '';const n=lpDaysLeft(dl);return n<0?'':`\nآخر موعد: ${lpDlFmt(dl)} (${lpLeftText(n)}).`}
/* مين متأخر: ما سلّم الأشهر، أو شهره معتمد وما حدد التواريخ */
function lpLate(rows=lpRows()){
  return {months:rows.filter(r=>r.link&&!r.plan),dates:rows.filter(r=>r.link&&r.plan?.status==='approved'&&!r.plan.dates_status)};
}
function lpDeadlineBanner(rows){
  const late=lpLate(rows),out=[];
  [['months','اختيار الأشهر',late.months],['dates','تحديد التواريخ',late.dates]].forEach(([k,label,list])=>{
    const dl=lpDl(k);if(!dl)return;const n=lpDaysLeft(dl);
    const cls=n<0?'late':(n<=3&&list.length)?'warn':'ok';
    const who=list.length?` · ${list.length} موظف ما ${k==='months'?'سلّموا':'حددوا'}`:' · الكل سلّم ✓';
    out.push(`<div class="${cls}">⏰ ${label}: ${lpDlFmt(dl)} — ${lpLeftText(n)}${n<0?' (الاستقبال مقفل تلقائيًا)':''}${who}</div>`);
  });
  return out.join('');
}
function lpReminderMessage(r,kind){
  const url=lpLinkUrl(r.link.token),dl=lpDl(kind),n=lpDaysLeft(dl);
  const when=dl?(n<0?`\nانتهى الموعد (${lpDlFmt(dl)})، تواصل مع المشرف بأسرع وقت.`:`\nآخر موعد: ${lpDlFmt(dl)} (${lpLeftText(n)}).`):'';
  if(kind==='dates')return `السلام عليكم ${r.name}\nتذكير: شهر إجازتك (${LP_MONTHS_AR[r.plan.assigned_month-1]}) معتمد ✓ وباقي تحدد فترة الإجازة (${lpReqText(r.plan.assigned_month)}) من التقويم.${when}\n${url}\nالرابط خاص فيك، لا تشاركه.`;
  return `السلام عليكم ${r.name}\nتذكير: ما وصلتنا خطة إجازتك السنوية لسنة ${lpState.year}. اختر 3 أشهر بالترتيب من الرابط، والأشهر تُحجز بالأسبقية.${when}\n${url}\nالرابط خاص فيك، لا تشاركه.`;
}
function lpAgo(t){if(!t)return '';const h=Math.round((Date.now()-new Date(t).getTime())/3600000);return h<1?'قبل شوي':h<24?`قبل ${h} ساعة`:`قبل ${Math.round(h/24)} يوم`}
function lpReminders(){
  if(!lpState.links.length){alert('جهّز الروابط أولًا');return}
  const late=lpLate();document.getElementById('lpRemBox')?.remove();
  if(!late.months.length&&!late.dates.length){alert('ما فيه أحد متأخر ✓ الكل سلّم');return}
  const row=(r,k)=>{const ph=normalizeSaudiPhone(r.employee?.phone);return `<div class="lp-rm-row" id="lpRm_${k}_${esc(r.id)}"><div class="n"><b>${esc(r.name)}</b><small>${esc(r.badge||'')}${ph?'':' · ⚠ ما فيه جوال'}${r.link.reminded_at?` · ذُكِّر ${lpAgo(r.link.reminded_at)}`:''}</small></div><button class="primary" onclick="lpRemindOne('${esc(r.id)}','${k}')">واتساب</button></div>`};
  const sec=(k,title,list)=>list.length?`<h4 style="margin:12px 0 4px">${title} (${list.length})${lpDl(k)?` <span class="small-note">· ${lpLeftText(lpDaysLeft(lpDl(k)))}</span>`:''}</h4>${list.map(r=>row(r,k)).join('')}<button class="secondary" style="margin-top:8px" onclick="lpCopyReminders('${k}')">📋 نسخ رسالة جماعية</button>`:'';
  const box=document.createElement('div');box.id='lpRemBox';box.className='modal show';
  box.innerHTML=`<div class="sheet" style="max-width:520px;max-height:86vh;overflow:auto"><h3 style="margin:0 0 4px">⏰ تذكير المتأخرين</h3>
    <p class="small-note" style="margin:0">اضغط «واتساب» لكل موظف، تنفتح الرسالة جاهزة فيها رابطه وآخر موعد. أو انسخ رسالة جماعية للقروب.</p>
    ${sec('months','ما سلّموا خطة الأشهر',late.months)}${sec('dates','ما حددوا التواريخ',late.dates)}
    <div style="display:flex;justify-content:flex-end;margin-top:14px"><button class="secondary" onclick="document.getElementById('lpRemBox').remove()">إغلاق</button></div></div>`;
  document.body.appendChild(box);
}
async function lpMarkReminded(ids){
  const now=new Date().toISOString();
  lpState.links.forEach(l=>{if(ids.includes(String(l.employee_id)))l.reminded_at=now});
  try{await lpApi(`/rest/v1/leave_plan_links?year=eq.${lpState.year}&employee_id=in.(${ids.map(i=>'"'+String(i).replace(/"/g,'')+'"').join(',')})`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({reminded_at:now})})}catch(e){console.warn(e)}
}
function lpRemindOne(id,kind){
  const r=lpRows().find(x=>x.id===id);if(!r?.link)return;
  const phone=normalizeSaudiPhone(r.employee?.phone),msg=lpReminderMessage(r,kind);
  const url=phone?`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`:`https://wa.me/?text=${encodeURIComponent(msg)}`;
  const opened=window.open(url,'_blank');if(!opened)window.location.href=url;
  lpMarkReminded([id]);const el=document.getElementById(`lpRm_${kind}_${id}`);if(el){el.style.opacity='.5';const b=el.querySelector('button');if(b)b.textContent='✓ أُرسل'}
}
function lpCopyReminders(kind){
  const list=lpLate()[kind];if(!list.length)return;const dl=lpDl(kind),n=lpDaysLeft(dl);
  const head=kind==='dates'?`تذكير: الموظفين التالية أسماؤهم شهر إجازتهم معتمد وباقي يحددون فترة الإجازة من التقويم.`:`تذكير: الموظفين التالية أسماؤهم ما سلّموا خطة الإجازة السنوية ${lpState.year}. كل واحد يفتح رابطه ويختار 3 أشهر.`;
  const text=head+(dl&&n>=0?`\nآخر موعد: ${lpDlFmt(dl)} (${lpLeftText(n)}).`:'')+'\n\n'+list.map(r=>`${r.name}${kind==='dates'?' · '+LP_MONTHS_AR[r.plan.assigned_month-1]:''}:\n${lpLinkUrl(r.link.token)}`).join('\n\n');
  lpCopyText(text,`تم نسخ تذكير ${list.length} موظف ✓`);lpMarkReminded(list.map(r=>r.id));
}
/* نقطة حمراء على تبويب خطة الإجازة لما يقرب الموعد وفيه متأخرين */
async function lpNavDot(){
  const nb=document.getElementById('lpNavBtn');if(!nb||!isAdmin())return;
  try{
    let rows,settings=lpState.settings;
    if(lpState.loaded)rows=lpRows();
    else{
      const year=lpDefaultYear();const [st,links,plans]=await Promise.all([lpApi(`/rest/v1/leave_plan_settings?year=eq.${year}&select=*`),lpApi(`/rest/v1/leave_plan_links?year=eq.${year}&select=employee_id`),lpApi(`/rest/v1/leave_plans?year=eq.${year}&select=employee_id,status,dates_status`)]);
      settings=st?.[0];const pm=new Map((plans||[]).map(p=>[String(p.employee_id),p]));rows=(links||[]).map(l=>({link:l,plan:pm.get(String(l.employee_id))}));
    }
    const late=lpLate(rows);let n=0;
    [['deadline',late.months],['dates_deadline',late.dates]].forEach(([k,list])=>{const left=lpDaysLeft(settings?.[k]);if(left!==null&&left<=3&&list.length)n+=list.length});
    nb.querySelectorAll('.lp-nav-dot').forEach(x=>x.remove());
    if(n){const s=document.createElement('span');s.className='lp-nav-dot';s.textContent=n;s.title=`${n} موظف متأخر والموعد قريب`;nb.appendChild(s)}
  }catch(e){}
}
async function lpApproveAll(){
  const n=lpState.plans.filter(p=>p.status==='submitted').length;if(!n){alert('ما فيه خطط بانتظار الاعتماد');return}
  if(!confirm(`اعتماد ${n} خطة مرسلة دفعة وحدة؟`))return;
  try{
    await lpApi(`/rest/v1/leave_plans?year=eq.${lpState.year}&status=eq.submitted`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'approved',admin_note:'',updated_at:new Date().toISOString()})});
    lpState.plans.forEach(p=>{if(p.status==='submitted'){p.status='approved';p.admin_note=''}});lpRender();lpStatusMsg(`تم اعتماد ${n} خطة ✓`);
  }catch(e){lpStatusMsg(lpFriendlyError(e),true)}
}
async function lpCopyText(text,okMsg){
  let copied=false;
  try{await navigator.clipboard.writeText(text);copied=true}
  catch{const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();try{copied=document.execCommand('copy')}catch{}ta.remove()}
  lpStatusMsg(copied?okMsg:'');lpShowText(text,copied?okMsg:'انسخ النص من هنا');
}
/* يعرض الرسالة المنسوخة عشان تشوفها، مع زر نسخ وزر إرسال واتساب */
function lpShowText(text,title){
  document.getElementById('lpTextBox')?.remove();
  const box=document.createElement('div');box.id='lpTextBox';box.className='modal show';
  box.innerHTML=`<div class="sheet" style="max-width:560px"><h3 style="margin:0 0 4px">${esc(title)}</h3>
    <p class="small-note" style="margin:0 0 8px">الرسالة انحفظت في الحافظة، الصقها في واتساب. أو اضغط «إرسال واتساب» واختر القروب أو الشخص.</p>
    <textarea id="lpTextArea" readonly style="width:100%;height:46vh;font-size:13px;line-height:1.6;direction:rtl;white-space:pre-wrap"></textarea>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;flex-wrap:wrap">
      <button class="secondary" onclick="document.getElementById('lpTextBox').remove()">إغلاق</button>
      <button class="secondary" id="lpTextCopy">📋 نسخ مرة ثانية</button>
      <button class="primary" id="lpTextWa">إرسال واتساب</button></div></div>`;
  document.body.appendChild(box);
  const ta=document.getElementById('lpTextArea');ta.value=text;
  document.getElementById('lpTextCopy').onclick=async()=>{ta.select();try{await navigator.clipboard.writeText(text)}catch{try{document.execCommand('copy')}catch{}}document.getElementById('lpTextCopy').textContent='✓ تم النسخ'};
  document.getElementById('lpTextWa').onclick=()=>{const url=`https://wa.me/?text=${encodeURIComponent(text)}`;const w=window.open(url,'_blank');if(!w)location.href=url};
}
function lpCopyOne(id){const r=lpRows().find(x=>x.id===id);if(r?.link)lpCopyText(lpMessage(r),`تم نسخ رابط ${r.name} ✓`)}
function lpCopyRejectedMessages(){
  const rows=lpRows().filter(r=>r.link&&(r.plan?.status==='rejected'||(r.plan?.status==='approved'&&r.plan.dates_status==='rejected')));
  if(!rows.length){alert('ما فيه خطط مرفوضة');return}
  lpCopyText(rows.map(lpMessage).join('\n\n— — —\n\n'),`تم نسخ ${rows.length} رسالة رفض ✓`);
}
function lpCopyDatesMessages(){
  const rows=lpRows().filter(r=>r.link&&lpPhase(r)==='dates');
  if(!rows.length){alert('ما فيه أحد بانتظار تحديد التواريخ');return}
  const text=`تم اعتماد أشهر الإجازة السنوية ${lpState.year} ✓\nالرجاء من كل موظف الدخول على رابطه وتحديد فترة الإجازة من التقويم.\n\n`+rows.map(r=>`${r.name} · ${LP_MONTHS_AR[r.plan.assigned_month-1]}:\n${lpLinkUrl(r.link.token)}`).join('\n\n');
  lpCopyText(text,`تم نسخ ${rows.length} رسالة ✓`);
}
function lpCopyLinks(all){
  const rows=lpRows().filter(r=>r.link&&(all||!r.plan));
  if(!rows.length){alert(all?'جهّز الروابط أولًا':'كل الموظفين سلّموا خططهم ✓');return}
  const text=`روابط خطة الإجازة السنوية ${lpState.year}\nكل موظف يفتح رابطه ويختار 3 أشهر بالترتيب. المشرف يراجع الخطط ويعتمدها.\n\n`+rows.map(r=>`${r.name} (${r.badge}):\n${lpLinkUrl(r.link.token)}`).join('\n\n');
  lpCopyText(text,`تم نسخ ${rows.length} رابط ✓`);
}
function lpWhatsApp(id){
  const r=lpRows().find(x=>x.id===id);if(!r?.link)return;
  const phone=normalizeSaudiPhone(r.employee?.phone);
  const url=phone?`https://wa.me/${phone}?text=${encodeURIComponent(lpMessage(r))}`:`https://wa.me/?text=${encodeURIComponent(lpMessage(r))}`;
  const opened=window.open(url,'_blank');if(!opened)window.location.href=url;
}
/* ===== Minimal styled XLSX writer (no external library) ===== */
const LPX_CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function lpxCrc(b){let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=LPX_CRC[(c^b[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0}
function lpxZip(files){
  const enc=new TextEncoder(),parts=[],central=[];let offset=0;
  const u16=n=>[n&255,(n>>>8)&255],u32=n=>[n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];
  files.forEach(f=>{
    const name=enc.encode(f.name),data=enc.encode(f.data),crc=lpxCrc(data);
    const head=new Uint8Array([...u32(0x04034b50),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x21),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0)]);
    parts.push(head,name,data);
    central.push(new Uint8Array([...u32(0x02014b50),...u16(20),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x21),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset)]),name);
    offset+=head.length+name.length+data.length;
  });
  const cdSize=central.reduce((s,p)=>s+p.length,0);
  const end=new Uint8Array([...u32(0x06054b50),...u16(0),...u16(0),...u16(files.length),...u16(files.length),...u32(cdSize),...u32(offset),...u16(0)]);
  return new Blob([...parts,...central,end],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
const LPX_STYLE={default:0,title:1,sub:2,head:3,body:4,bodyC:5,zebra:6,zebraC:7,approved:8,submitted:9,rejected:10,none:11,assigned:12,wrap:13,full:14,near:15,ok:16,zebraWrap:17,num:18,prev:19,prevZ:20,prevWarn:21,mTitle:22,gTitle:23,dHead:24,dBody:25,dGreen:26,dYellow:27,dGray:28,dLegend:29,rsTitle:30,rsPost:31,rsNames:32,rsBand:33,rsGap:34,rsDark:35,rsLeave:36};
function lpxStyles(){
  const font=(sz,color,b)=>`<font>${b?'<b/>':''}<sz val="${sz}"/><color rgb="FF${color}"/><name val="Arial"/></font>`;
  const fonts=[font(11,'1A2233'),font(16,'FFFFFF',1),font(10,'5D6B80'),font(11,'FFFFFF',1),font(11,'1F7A4D',1),font(11,'8F5C14',1),font(11,'B3263A',1),font(11,'5D6B80'),font(11,'FFFFFF',1),font(11,'1A2233',1),'<font><b/><u/><sz val="14"/><color rgb="FFC00000"/><name val="Arial"/></font>',font(18,'2F5597',1),font(12,'1A2233',1),font(12,'1A2233'),font(12,'8A94A6'),font(14,'1A2233',1),font(12,'2E3FC2',1),font(12,'000000'),font(12,'C00000',1),font(12,'C00000')];
  const fill=c=>`<fill><patternFill patternType="solid"><fgColor rgb="FF${c}"/><bgColor indexed="64"/></patternFill></fill>`;
  const fills=['<fill><patternFill patternType="none"/></fill>','<fill><patternFill patternType="gray125"/></fill>',fill('14284B'),fill('EEF2F8'),fill('1F3C6E'),fill('F7F9FC'),fill('E3F4EA'),fill('FCEFD9'),fill('FBE4E7'),fill('EEF0F3'),fill('F0A020'),fill('C6E0B4'),fill('FFF2CC'),fill('D9E1F2'),fill('D0D3DA'),fill('1F3864')];
  const side='<left style="thin"><color rgb="FFD9DFE8"/></left><right style="thin"><color rgb="FFD9DFE8"/></right><top style="thin"><color rgb="FFD9DFE8"/></top><bottom style="thin"><color rgb="FFD9DFE8"/></bottom>';
  const sideK='<left style="thin"><color rgb="FF404040"/></left><right style="thin"><color rgb="FF404040"/></right><top style="thin"><color rgb="FF404040"/></top><bottom style="thin"><color rgb="FF404040"/></bottom>';
  const borders=['<border><left/><right/><top/><bottom/><diagonal/></border>',`<border>${side}<diagonal/></border>`,`<border>${sideK}<diagonal/></border>`];
  const xf=(f,fi,b,h,wrap,ltr)=>`<xf numFmtId="0" fontId="${f}" fillId="${fi}" borderId="${b}" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${h}" vertical="center" readingOrder="${ltr?1:2}"${h==='right'?' indent="1"':''}${wrap?' wrapText="1"':''}/></xf>`;
  const xfs=[xf(0,0,0,'general'),xf(1,2,0,'center'),xf(2,3,0,'center'),xf(3,4,1,'center',1),xf(0,0,1,'right'),xf(0,0,1,'center'),xf(0,5,1,'right'),xf(0,5,1,'center'),
    xf(4,6,1,'center'),xf(5,7,1,'center'),xf(6,8,1,'center'),xf(7,9,1,'center'),xf(8,10,1,'center'),xf(0,0,1,'right',1),xf(6,8,1,'center'),xf(5,7,1,'center'),xf(4,6,1,'center'),xf(0,5,1,'right',1),xf(9,0,1,'center'),xf(0,0,1,'center',1),xf(0,5,1,'center',1),xf(6,8,1,'center',1),xf(10,0,0,'center',0,1),xf(11,0,0,'center',0,1),xf(12,13,1,'center',0,1),xf(13,0,1,'center',1,1),xf(13,11,1,'center',1,1),xf(13,12,1,'center',1,1),xf(14,0,1,'center',1,1),xf(2,0,0,'center',0,1),xf(15,14,2,'center',0,1),xf(16,14,2,'center',0,1),xf(17,0,2,'center',1),xf(18,14,2,'center',0,1),xf(17,14,2,'center'),xf(17,15,2,'center'),xf(19,0,2,'center',1)];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="${borders.length}">${borders.join('')}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}
function lpxCol(i){let s='';i++;while(i>0){const m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26)}return s}
function lpxXml(v){return String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'')}
/* sheet: {name, cols:[widths], rows:[{height, cells:[{v, s}]}], merges:['A1:J1'], freeze:rowNumber, filter:'A3:J10'} */
function lpxSheet(sh){
  const rows=sh.rows.map((r,ri)=>{
    const cells=r.cells.map((c,ci)=>{
      if(c==null)return '';const ref=lpxCol(ci)+(ri+1),s=LPX_STYLE[c.s||'default']||0;
      if((c.v===''||c.v==null)&&!Array.isArray(c.runs))return `<c r="${ref}" s="${s}"/>`;
      if(typeof c.v==='number')return `<c r="${ref}" s="${s}"><v>${c.v}</v></c>`;
      if(Array.isArray(c.runs))return `<c r="${ref}" s="${s}" t="inlineStr"><is>${c.runs.map(r=>`<r><rPr>${r.b?'<b/>':''}<sz val="12"/><color rgb="FF${r.color||'000000'}"/><rFont val="Arial"/></rPr><t xml:space="preserve">${lpxXml(r.t)}</t></r>`).join('')}</is></c>`;
      return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${lpxXml(c.v)}</t></is></c>`;
    }).join('');
    return `<row r="${ri+1}"${r.height?` ht="${r.height}" customHeight="1"`:''}>${cells}</row>`;
  }).join('');
  const pane=sh.freeze?`<pane ySplit="${sh.freeze}" topLeftCell="A${sh.freeze+1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${sh.freeze+1}" sqref="A${sh.freeze+1}"/>`:'';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0"${sh.ltr?'':' rightToLeft="1"'} showGridLines="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols>${sh.cols.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${rows}</sheetData>${sh.filter?`<autoFilter ref="${sh.filter}"/>`:''}${sh.merges?.length?`<mergeCells count="${sh.merges.length}">${sh.merges.map(m=>`<mergeCell ref="${m}"/>`).join('')}</mergeCells>`:''}<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup orientation="${sh.portrait?'portrait':'landscape'}" paperSize="9" fitToWidth="1" fitToHeight="${sh.onePage?1:0}"/></worksheet>`;
}
function lpxWorkbook(sheets){
  const files=[
    {name:'[Content_Types].xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`},
    {name:'_rels/.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`},
    {name:'xl/workbook.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${sheets.map((s,i)=>`<sheet name="${lpxXml(s.name).slice(0,31)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets><definedNames>${sheets.map((s,i)=>s.filter?`<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${lpxXml(s.name).slice(0,31)}'!$${s.filter.split(':')[0].replace(/(\d+)/,'$$$1')}:$${s.filter.split(':')[1].replace(/(\d+)/,'$$$1')}</definedName>`:'').join('')}</definedNames></workbook>`},
    {name:'xl/_rels/workbook.xml.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`},
    {name:'xl/styles.xml',data:lpxStyles()},
    ...sheets.map((s,i)=>({name:`xl/worksheets/sheet${i+1}.xml`,data:lpxSheet(s)}))
  ];
  return lpxZip(files);
}
function lpxDownload(blob,filename){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000)}
/* ورقة التوزيع: نفس شكل ملف الإجازات القديم — كل شهر جدول، يناير–يونيو يسار ويوليو–ديسمبر يمين */
function lpDistributionSheet(rows,year,max){
  const md=d=>{const [,m,dd]=d.split('-').map(Number);return `${LP_MONTHS_EN[m-1].slice(0,3)} ${dd}`};
  const E=(v,s)=>({v,s});
  /* كل فترة تنحط تحت الشهر اللي تبدأ فيه (موظف عنده فترة في يناير وفترة في يونيو يطلع في الشهرين) */
  const entries=[];
  rows.filter(r=>r.plan&&r.plan.status!=='rejected').forEach(r=>{
    const ps=r.plan.periods||[];
    if(!ps.length){entries.push({r,m:r.plan.assigned_month,periods:[]});return}
    const byM=new Map();ps.forEach(x=>{const m=Number(String(x.start).slice(5,7));if(!byM.has(m))byM.set(m,[]);byM.get(m).push(x)});
    byM.forEach((periods,m)=>entries.push({r,m,periods}));
  });
  const block=m=>{
    const list=entries.filter(e=>e.m===m)
      .sort((a,b)=>String(a.periods[0]?.start||'9').localeCompare(String(b.periods[0]?.start||'9'))||String(a.r.employee?.name||a.r.name).localeCompare(String(b.r.employee?.name||b.r.name)));
    const out=[{height:26,title:true,cells:[E(`${LP_MONTHS_EN[m-1]} 1, ${year}`,'mTitle'),E('','mTitle'),E('','mTitle'),E('','mTitle'),E('','mTitle')]},
      {height:24,cells:['No.','Badge #','Name','Vacation',`Remaining ${year}`].map(v=>E(v,'dHead'))}];
    const n=Math.max(list.length,max);
    for(let i=0;i<n;i++){
      const en=list[i],r=en?.r,p=r?.plan;
      if(!r){out.push({height:22,cells:[E(i+1,'dBody'),E('','dBody'),E('','dBody'),E('','dBody'),E('','dBody')]});continue}
      const monthOk=p.status==='approved',ds=p.dates_status;
      const st=!monthOk?'dGray':ds==='approved'?'dGreen':ds==='submitted'?'dYellow':'dBody';
      const vac=en.periods.length?en.periods.map(x=>`${md(x.start)} to ${md(x.end)}`).join('  /  '):(monthOk?'':'month pending');
      out.push({height:en.periods.length>1?36:22,cells:[E(i+1,st),E(r.badge,st),E(r.employee?.name||r.name,st),E(vac,st),(()=>{const pb=lpProjectedBalance(r,year);return pb?E(pb.balance,st!=='dGray'&&pb.balance<0?'prevWarn':st):E('—',st)})()]});
    }
    return out;
  };
  const side=ms=>ms.flatMap((m,i)=>[...(i?[{height:10,cells:[null,null,null,null,null]}]:[]),...block(m)]);
  const L=side([1,2,3,4,5,6]),R=side([7,8,9,10,11,12]),top=3,out=[],merges=['A1:K1','A2:K2'];
  out.push({height:32,cells:[E(`Group-A  ·  Annual Leave Plan ${year}`,'gTitle'),...Array(10).fill(E('','gTitle'))]});
  out.push({height:20,cells:[E(`Green = dates approved   ·   Yellow = dates under review   ·   White = month approved, dates not set   ·   Grey = month under review   ·   Remaining ${year} = ${year-1} balance (max 9 carried) + 30 − leave days`,'dLegend'),...Array(10).fill(E('','dLegend'))]});
  out.push({height:8,cells:[]});
  for(let i=0;i<Math.max(L.length,R.length);i++){
    const l=L[i]||{height:0,cells:[null,null,null,null,null]},r=R[i]||{height:0,cells:[null,null,null,null,null]},row=top+i+1;
    if(l.title)merges.push(`A${row}:E${row}`);if(r.title)merges.push(`G${row}:K${row}`);
    out.push({height:Math.max(l.height,r.height)||20,cells:[...l.cells,null,...r.cells]});
  }
  return {name:'التوزيع',ltr:true,cols:[6,11,36,27,15,4,6,11,36,27,15],merges,rows:out};
}
/* رصيد السنة القادمة المتوقع: نفس قاعدة التطبيق (ترحيل 9 أيام بالحد الأعلى + 30) ناقص إجازاتها */
function lpProjectedBalance(r,year){
  if(!r.employee||year<=new Date().getFullYear())return null;
  const carried=Math.min(Math.max(0,Number(r.employee.leaveBalance)||0),9);
  let used=0;
  (state.leaves||[]).forEach(l=>{if(String(l.employeeId)===r.id&&Number(l.pendingChargeYear)===year)used+=Number(l.pendingChargeDays)||(diffDays(l.end,l.start)+1)});
  const p=r.plan;
  if(p?.status==='approved'&&p.dates_status==='submitted')(p.periods||[]).forEach(x=>used+=diffDays(x.end,x.start)+1);
  return {balance:carried+30-used,used};
}
function lpExport(){
  const rows=lpRows();if(!rows.length){alert('لا يوجد بيانات');return}
  const year=lpState.year,max=lpMax(),m=x=>x?`${LP_MONTHS_AR[x-1]} · ${LP_MONTHS_EN[x-1].slice(0,3)}`:'';
  const sent=rows.filter(r=>r.plan).length,today=new Date();
  const dstr=`${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;
  const py=year-1;
  const head=['#','اسم الموظف','رقم الباج','الحالة',`إجازة ${py} (الأيام)`,'الخيار الأول','الخيار الثاني','الخيار الثالث','الشهر المعتمد','تواريخ الإجازة','حالة التواريخ','ملاحظة',`رصيد ${year-1}`,`الرصيد المتبقي ${year}`];
  const statusStyle={approved:'approved',submitted:'submitted',rejected:'rejected',none:'none'};
  const order={approved:0,submitted:1,rejected:2,none:3};
  const sorted=[...rows].sort((a,b)=>(order[a.plan?.status||'none']-order[b.plan?.status||'none'])||(a.plan&&b.plan?a.plan.assigned_month-b.plan.assigned_month:0)||String(a.name).localeCompare(String(b.name),'ar'));
  const body=sorted.map((r,i)=>{
    const p=r.plan,st=p?.status||'none',z=i%2===1,b=z?'zebra':'body',bc=z?'zebraC':'bodyC';
    const ch=k=>({v:p?m(p[k]):'—',s:p&&p.status!=='rejected'&&p.assigned_month===p[k]?'assigned':bc});
    const pv=lpPrev(r.id,py),pvText=pv.months.length?pv.months.map(x=>`${LP_MONTHS_AR[x.m-1]} (${x.days})`).join('، '):'لا يوجد',rep=lpRepeat(r);
    const noteLines=(p?.periods?.length||0)+(p?.admin_note?1:0)+(p?.dates_status==='rejected'&&p.dates_note?1:0);
    return {height:Math.max(22,17*Math.max(pv.months.length>2?2:1,p?.periods?.length||1,noteLines)+6),cells:[{v:i+1,s:bc},{v:r.name,s:b},{v:r.badge,s:bc},{v:LP_STATUS[st][0],s:statusStyle[st]},{v:rep?pvText+'  ⚠ تكرار':pvText,s:rep?'prevWarn':z?'prevZ':'prev'},ch('choice1'),ch('choice2'),ch('choice3'),
      {v:p&&p.status==='approved'?m(p.assigned_month):p&&p.status==='submitted'?'لم يُعتمد بعد':'—',s:p&&p.status==='approved'?'approved':bc},{v:p?.periods?.length?lpPeriodsText(p,'\n'):'—',s:z?'prevZ':'prev'},{v:p?.status==='approved'?LP_DATES[p.dates_status||'none'][0]:'—',s:p?.status!=='approved'?bc:p.dates_status==='approved'?'approved':p.dates_status==='submitted'?'submitted':p.dates_status==='rejected'?'rejected':'none'},{v:[lpShiftsText(p,'\n'),p?.admin_note,p?.dates_status==='rejected'?p.dates_note:''].filter(Boolean).join('\n'),s:z?'zebraWrap':'wrap'},(()=>{const b=r.employee?Number(r.employee.leaveBalance):NaN;return Number.isFinite(b)?{v:b,s:b<0?'rejected':'num'}:{v:'—',s:bc}})(),(()=>{const pb=lpProjectedBalance(r,year);return pb?{v:pb.balance,s:pb.balance<0?'rejected':'approved'}:{v:'—',s:bc}})()]};
  });
  const last=3+body.length;
  const sheet1={name:`خطة الإجازة ${year}`,cols:[5,30,12,17,24,16,16,16,18,30,22,24,13,15],freeze:3,filter:`A3:N${last}`,merges:['A1:N1','A2:N2'],
    rows:[{height:34,cells:[{v:`خطة الإجازة السنوية ${year} · Group A`,s:'title'},...Array(13).fill({v:'',s:'title'})]},
      {height:22,cells:[{v:`تاريخ التصدير ${dstr}   ·   سلّموا ${sent} من ${rows.length}   ·   الحد في الشهر ${max}   ·   البرتقالي = الشهر المرشّح له   ·   الأحمر = نفس شهر إجازة ${py}   ·   الرصيد المتبقي ${year} = رصيد ${year-1} (بحد أعلى 9) + 30 − أيام إجازة ${year}`,s:'sub'},...Array(13).fill({v:'',s:'sub'})]},
      {height:26,cells:head.map(v=>({v,s:'head'}))},...body]};
  const byMonth=Array.from({length:12},()=>[]);
  const apprBy=Array(12).fill(0),pendBy=Array(12).fill(0);
  rows.forEach(r=>{if(r.plan&&r.plan.status!=='rejected'){const k=r.plan.assigned_month-1;byMonth[k].push(r.name+(r.plan.status==='approved'?' ✓':''));if(r.plan.status==='approved')apprBy[k]++;else pendBy[k]++}});
  const mrows=byMonth.map((names,i)=>{const n=names.length,z=i%2===1;return {height:Math.max(22,16*Math.ceil(Math.max(1,names.length)/2)),cells:[{v:`${LP_MONTHS_AR[i]} · ${LP_MONTHS_EN[i]}`,s:z?'zebra':'body'},{v:apprBy[i],s:z?'zebraC':'bodyC'},{v:pendBy[i],s:z?'zebraC':'bodyC'},{v:n,s:n>=max?'full':n>=max-1?'near':'ok'},{v:max,s:z?'zebraC':'bodyC'},{v:Math.max(0,max-n),s:z?'zebraC':'bodyC'},{v:names.join('، '),s:z?'zebraWrap':'wrap'}]}});
  const sheet2={name:'ملخص الأشهر',cols:[22,11,13,11,9,10,62],freeze:3,merges:['A1:G1','A2:G2'],
    rows:[{height:34,cells:[{v:`توزيع الإجازات على الأشهر ${year}`,s:'title'},...Array(6).fill({v:'',s:'title'})]},
      {height:22,cells:[{v:'المجموع = المعتمد + قيد المراجعة   ·   أخضر متاح · أصفر قارب يمتلئ · أحمر ممتلئ   ·   ✓ = معتمد',s:'sub'},...Array(6).fill({v:'',s:'sub'})]},
      {height:26,cells:['الشهر','معتمد','قيد المراجعة','المجموع','الحد','المتبقي','الموظفين'].map(v=>({v,s:'head'}))},...mrows]};
  lpxDownload(lpxWorkbook([sheet1,sheet2,lpDistributionSheet(rows,year,max)]),`Group_A_Annual_Leave_Plan_${year}.xlsx`);
}
/* أطول إجازة للموظف في سنة معيّنة، وشهرها (الشهر اللي فيه أغلب أيامها) */
function lpLongestLeave(id,year){
  let best=null;
  (state.leaves||[]).forEach(l=>{
    if(String(l.employeeId)!==String(id)||LP_NOT_LEAVE.test(l.note||''))return;
    const s=/^(\d{4})-(\d{2})-(\d{2})$/.exec(l.start||''),e=/^(\d{4})-(\d{2})-(\d{2})$/.exec(l.end||'');if(!s||!e)return;
    const per=Array(13).fill(0);let d=Date.UTC(+s[1],+s[2]-1,+s[3]);const end=Date.UTC(+e[1],+e[2]-1,+e[3]);
    for(let g=0;d<=end&&g<400;d+=86400000,g++){const x=new Date(d);if(x.getUTCFullYear()===year)per[x.getUTCMonth()+1]++}
    const days=per.reduce((a,b)=>a+b,0);if(!days)return;
    const m=per.indexOf(Math.max(...per));
    if(!best||days>best.days)best={m,days};
  });
  return best;
}
/* خيارات خطة 2026 (من جدول Excel اللي كان قبل البرنامج) حسب رقم الباج: [الأول، الثاني، الثالث] */
const LP_CHOICES_2026={"101771":[5,8,11],"101725":[8,11,4],"101702":[3,6,12],"103630":[10,7,4],"101655":[8,4,12],"103389":[11,12,12],"101650":[12,7,4],"101662":[12,8,4],"104121":[4,10,6],"101738":[12,8,4],"102305":[11,7,3],"101634":[7,12,4],"102299":[3,7,12],"103661":[9,8,4],"101631":[7,6,9],"103871":[7,11,4],"102301":[7,11,2],"101690":[11,8,1],"101632":[8,11,4],"101708":[7,10,4],"104165":[4,7,12],"104722":[12,8,4],"102593":[10,9,11],"101718":[8,12,4],"104495":[5,12,4],"104116":[9,6,4],"101749":[8,12,1],"102293":[7,12,4],"101741":[11,8,3],"101694":[7,9,4],"101697":[4,7,12],"102297":[7,12,3],"102286":[7,9,4],"101988":[6,9,12],"101700":[8,11,4],"103619":[11,7,4],"101703":[8,12,4],"101701":[11,5,4],"103409":[8,4,12],"101698":[8,12,4]};
/* أشهر إجازة 2026 الفعلية (من جدول 2026 Vacation Plan) حسب رقم الباج */
const LP_VAC_2026={"101749":[1],"101702":[3],"102299":[3],"102297":[3],"104121":[4],"104165":[4],"101697":[4],"103409":[4],"101771":[10],"104495":[5],"101701":[5],"101631":[6],"104116":[6],"102286":[6],"101988":[6],"101634":[7],"103871":[7],"102301":[7],"102293":[7],"101725":[8],"101655":[8],"101632":[8],"101703":[8],"101698":[8],"103661":[9],"102593":[9],"101694":[9],"103630":[10],"101708":[10],"103619":[10],"101700":[10],"101738":[11],"102305":[11],"101690":[11],"101741":[11],"101650":[12],"101662":[12],"104722":[12],"101718":[12]};
function lpGivenChoice(badge,year,month){
  const c=year===2026?LP_CHOICES_2026[String(badge||'')]:lpState.prevPlans?.[String(badge||'')];
  if(!c||!month)return null;const i=c.indexOf(month);return i<0?`خارج الخيارات (${c.map(x=>LP_MONTHS_AR[x-1]).join('، ')})`:i+1;
}
/* تصدير خيارات الموظفين: الاسم · الباج · شهر أطول إجازة السنة الماضية · الخيارات الثلاثة */
function lpExportChoices(){
  const rows=lpRows();if(!rows.length){alert('لا يوجد بيانات');return}
  const year=lpState.year,py=year-1,m=x=>x?LP_MONTHS_AR[x-1]:'—';
  const body=rows.map((r,i)=>{
    const p=r.plan&&r.plan.status!=='rejected'?r.plan:null,z=i%2===1,b=z?'zebra':'body',bc=z?'zebraC':'bodyC',ll=lpLongestLeave(r.id,py);
    const vm=py===2026?LP_VAC_2026[String(r.badge||'')]:null,months=vm||(ll?[ll.m]:[]);
    const gcs=months.map(x=>lpGivenChoice(r.badge,py,x)).filter(x=>x!=null),gc=!gcs.length?null:gcs.length===1?gcs[0]:gcs.join(' + ');
    const vtxt=vm?vm.map(m).join(' + '):ll?`${m(ll.m)} (${ll.days} يوم)`:'لا يوجد';
    return {height:22,cells:[{v:i+1,s:bc},{v:r.name,s:b},{v:r.badge,s:bc},{v:vtxt,s:bc},{v:gc??'—',s:gcs.some(x=>String(x).startsWith('خارج'))?'prevWarn':typeof gc==='number'?'num':bc},...['choice1','choice2','choice3'].map(k=>({v:p?m(p[k]):'—',s:p?.status==='approved'&&p.assigned_month===p[k]?'approved':bc}))]};
  });
  const sheet={name:`خيارات ${year}`,cols:[5,32,13,22,34,18,18,18],freeze:3,filter:`A3:H${3+body.length}`,merges:['A1:H1','A2:H2'],portrait:true,
    rows:[{height:34,cells:[{v:`خيارات خطة الإجازة ${year} · Group A`,s:'title'},...Array(7).fill({v:'',s:'title'})]},
      {height:22,cells:[{v:`سلّموا ${rows.filter(r=>r.plan&&r.plan.status!=='rejected').length} من ${rows.length}   ·   الأخضر = الشهر المعتمد له في ${year}   ·   الأحمر = أخذ شهر خارج خياراته في ${py}   ·   رقم الخيار = أي خيار من خياراته في ${py} انعطى له`,s:'sub'},...Array(7).fill({v:'',s:'sub'})]},
      {height:26,cells:['#','الاسم','رقم الباج',`إجازة ${py}`,`رقم الخيار ${py}`,`الخيار الأول ${year}`,`الخيار الثاني ${year}`,`الخيار الثالث ${year}`].map(v=>({v,s:'head'}))},...body]};
  lpxDownload(lpxWorkbook([sheet,lpDistributionSheet(rows,year,lpMax())]),`Group_A_Leave_Choices_${year}.xlsx`);
}
/* ===== النسخ الاحتياطية ===== */
const SM_REASON={auto:'تلقائية',manual:'يدوية',before_restore:'قبل الاسترجاع',initial:'أول نسخة'};
function smFmt(ts){const d=new Date(ts);return d.toLocaleString('ar-SA-u-nu-latn-ca-gregory',{weekday:'long',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'})}
function smStatus(t,err=false){const el=document.getElementById('smBackupStatus');if(el){el.textContent=t||'';el.style.color=err?'var(--red)':''}}
function smBackupsInit(){const sec=document.getElementById('smBackupSection');if(!sec)return;if(!isAdmin()){sec.classList.add('hidden');return}sec.classList.remove('hidden');smBackupsLoad()}
async function smBackupsLoad(){
  smStatus('جاري التحميل…');
  try{
    const rows=await lpApi('/rest/v1/shift_manager_backups?select=id,created_at,reason&order=created_at.desc&limit=60');
    smStatus(rows?.length?`${rows.length} نسخة محفوظة · آخر نسخة: ${smFmt(rows[0].created_at)}`:'ما فيه نسخ محفوظة بعد');
    document.getElementById('smBackupList').innerHTML=(rows||[]).map(r=>`<div class="row" style="display:flex;align-items:center;gap:10px;justify-content:space-between"><div><b class="name" style="font-size:13px">${esc(smFmt(r.created_at))}</b><small style="display:block;color:var(--muted)">نسخة ${SM_REASON[r.reason]||esc(r.reason)}</small></div><div style="display:flex;gap:6px"><button class="secondary" onclick="smDownload(${Number(r.id)})">⬇ تنزيل</button><button class="danger" onclick="smRestore(${Number(r.id)})">↺ استرجاع</button></div></div>`).join('');
  }catch(e){smStatus(/shift_manager_backups|does not exist|schema cache/i.test(String(e.message))?'جدول النسخ الاحتياطية غير موجود. شغّل ملف supabase/backups.sql.':'تعذر التحميل: '+e.message,true)}
}
async function smBackupNow(){
  try{await lpApi('/rest/v1/rpc/sm_backup_now',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});smStatus('تم حفظ نسخة ✓');smBackupsLoad()}catch(e){smStatus('تعذر الحفظ: '+e.message,true)}
}
async function smDownload(id){
  try{
    const rows=await lpApi(`/rest/v1/shift_manager_backups?id=eq.${Number(id)}&select=*`);const b=rows?.[0];if(!b)return;
    const d=new Date(b.created_at),pad=n=>String(n).padStart(2,'0');
    const name=`Shift-Manager_backup_${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.json`;
    lpxDownload(new Blob([JSON.stringify({exported_at:new Date().toISOString(),backup_created_at:b.created_at,reason:b.reason,shift_manager_state:[{id:'main',data:b.state}],leave_plans:b.leave_plans},null,1)],{type:'application/json'}),name);
  }catch(e){smStatus('تعذر التنزيل: '+e.message,true)}
}
async function smRestore(id){
  const rows=await lpApi(`/rest/v1/shift_manager_backups?id=eq.${Number(id)}&select=created_at`).catch(()=>null);const when=rows?.[0]?smFmt(rows[0].created_at):'';
  const typed=prompt(`⚠ استرجاع نسخة ${when}\nكل البيانات الحالية بترجع لحالتها في ذاك الوقت (الموظفين، الإجازات، الأرصدة…).\nقبل الاسترجاع تنحفظ نسخة من الوضع الحالي، فتقدر ترجع لها.\n\nللتأكيد اكتب: استرجاع`,'');
  if(typed===null)return;if(typed.trim()!=='استرجاع'){alert('ما تم الاسترجاع.');return}
  const withPlans=confirm('ترجّع خطط الإجازة السنوية بعد لنفس الوقت؟\nموافق = نعم · إلغاء = لا، خلّ خطط الإجازة مثل ما هي');
  try{
    const r=await lpApi('/rest/v1/rpc/sm_restore_backup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_id:Number(id),p_with_plans:withPlans})});
    if(!r?.ok){alert('تعذر الاسترجاع');return}
    alert('تم الاسترجاع ✓ الصفحة بتتحدث الحين.');location.reload();
  }catch(e){alert('تعذر الاسترجاع: '+e.message)}
}
/* الجوال: 4 تبويبات أساسية + "المزيد" فيه الباقي والمساعد الذكي */
function buildNavMore(){
  const panel=document.getElementById('navMorePanel');if(!panel)return;
  const items=[...document.querySelectorAll('.bottom-nav .navbtn:not(.nav-main):not(.nav-more)')].filter(b=>b.style.display!=='none');
  panel.innerHTML=items.map(b=>`<button class="navbtn ${b.classList.contains('active')?'active':''}" data-view="${b.dataset.view}" type="button" onclick="toggleNavMore(false);showView('${b.dataset.view}',null)">${b.innerHTML}</button>`).join('')+
    `<button class="navbtn" type="button" onclick="toggleNavMore(false);openAIAssistant()"><span><svg class=\"ic\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M16 18a2 2 0 0 1 2 2 2 2 0 0 1 2-2 2 2 0 0 1-2-2 2 2 0 0 1-2 2m0-12a2 2 0 0 1 2 2 2 2 0 0 1 2-2 2 2 0 0 1-2-2 2 2 0 0 1-2 2M9 18a6 6 0 0 1 6-6 6 6 0 0 1-6-6 6 6 0 0 1-6 6 6 6 0 0 1 6 6\"/></svg></span>المساعد الذكي</button>`;
}
function toggleNavMore(open){
  const sh=document.getElementById('navMoreSheet');if(!sh)return;
  const on=open===undefined?!sh.classList.contains('open'):open;
  if(on)buildNavMore();sh.classList.toggle('open',on);
}
function syncNavMoreActive(id){
  const more=document.querySelector('.bottom-nav .nav-more');if(!more)return;
  const main=[...document.querySelectorAll('.bottom-nav .nav-main')].some(b=>b.dataset.view===id);
  more.classList.toggle('active',!main);
}
function showView(id,btn){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.navbtn').forEach(b=>b.classList.toggle('active',b.dataset.view===id));
  syncNavMoreActive(id);
  document.querySelector('.fab')?.classList.toggle('hidden',!['homeView','employeesView'].includes(id));
  if(id==='reportsView'){
    const month=document.getElementById('monthlyReportMonth'),year=document.getElementById('annualReportYear');
    if(month&&!month.value)month.value=currentMonthValue();if(year&&!year.value)year.value=new Date().getFullYear();refreshSelects();selectReportType('balances');
  }
  if(id==='leavePlanView')lpInit();
  if(id==='reportsView')smBackupsInit();
  window.scrollTo({top:0,behavior:'smooth'});
}
function openEmployeeModal(id=''){
  editingEmployeeId=id||null;const e=editingEmployeeId?state.employees.find(x=>x.id===editingEmployeeId):null;
  document.getElementById('employeeModalTitle').textContent=e?'تعديل بيانات الموظف':'إضافة موظف';document.getElementById('employeeSaveBtn').textContent=e?'حفظ التعديلات':'حفظ';
  document.getElementById('empName').value=e?.name||'';document.getElementById('empNameAr').value=e?.nameAr||ROSTER_ARABIC_NAMES[String(e?.empId||'')]||'';document.getElementById('empId').value=e?.empId||'';document.getElementById('empPhone').value=localPhone(e?.phone);document.getElementById('empLeaveBalance').value=e?formatDays(e.leaveBalance):'';document.getElementById('empMarineIdExpiry').value=e?marineExpiryFor(e):'';document.getElementById('empDutyRole').value=e?.dutyRole||'';document.getElementById('empShift').value=e?.shift||'Morning';document.getElementById('empLocation').value=e?.location||'';document.getElementById('empNote').value=e?.note||'';
  document.getElementById('employeeModal').classList.add('show');
}
function closeEmployeeModal(){editingEmployeeId=null;closeModal('employeeModal')}
function editLeaveBalance(id){
  const e=state.employees.find(x=>x.id===id);if(!e)return;
  const value=prompt(`أدخل رصيد الإجازة المتبقي للموظف ${e.name}`,formatDays(e.leaveBalance));
  if(value===null)return;
  const balance=Number(value);
  if(!Number.isFinite(balance)||balance<0){alert('أدخل رصيدًا صحيحًا');return}
  e.leaveBalance=balance;save();
}
function employeeDutyRoleLabel(role){return ({chief:'Shift Chief',assistant:'Assistant Shift Chief',community:'Community Supervisor',clerk:'Shift Clerk',scc:'SCC',visitor:'Ind. Visitor',commVisitor:'Comm. Visitor',leader:'ليدر',officer:'فرد',patrol:'دورية',flex:'فرد + دورية'})[role]||'غير محدد'}
function updateEmployeeDutyRole(id,role){const e=state.employees.find(x=>x.id===id);if(!e||!['','chief','assistant','community','clerk','scc','visitor','commVisitor','leader','officer','patrol','flex'].includes(role))return;e.dutyRole=role;save()}
function editEmployeeDutyRole(id){
  const e=state.employees.find(x=>x.id===id);if(!e)return;
  const value=prompt(`حدد مهمة ${e.name}:\n1 = Shift Chief\n2 = Assistant Shift Chief\n3 = Community Supervisor\n4 = Shift Clerk\n5 = SCC\n6 = Ind. Visitor\n7 = Comm. Visitor\n8 = ليدر\n9 = فرد\n10 = دورية\n11 = فرد + دورية`,({chief:'1',assistant:'2',community:'3',clerk:'4',scc:'5',visitor:'6',commVisitor:'7',leader:'8',officer:'9',patrol:'10',flex:'11'})[e.dutyRole]||'');if(value===null)return;
  const role=({'1':'chief','2':'assistant','3':'community','4':'clerk','5':'scc','6':'visitor','7':'commVisitor','8':'leader','9':'officer','10':'patrol','11':'flex'})[value.trim()];if(!role){alert('اختر رقمًا من 1 إلى 11');return}e.dutyRole=role;save();
}
function openLeaveModal(id=null){
  refreshSelects();editingLeaveId=id;
  const leave=id?state.leaves.find(l=>l.id===id):null;
  document.getElementById('leaveModalTitle').textContent=leave?'تعديل الإجازة':'إضافة إجازة';
  document.getElementById('leaveSaveBtn').textContent=leave?'حفظ التعديل':'حفظ';
  document.getElementById('leaveEmployee').value=leave?.employeeId||state.employees[0]?.id||'';
  document.getElementById('leaveStart').value=leave?.start||'';
  document.getElementById('leaveEnd').value=leave?.end||'';
  document.getElementById('leaveNote').value=leave?.note||'';
  document.getElementById('leaveModal').classList.add('show');
}
function openShiftModal(){refreshSelects();document.getElementById('shiftModal').classList.add('show')}
function openPersonalNoteModal(){
  const date=document.getElementById('personalNoteDate');
  if(date&&!date.value)date.value=todayISO();
  document.getElementById('personalNoteModal').classList.add('show');
}
function closeModal(id){document.getElementById(id).classList.remove('show');if(id==='aiAssistantModal')aiStopRealtime(false)}
function quickAdd(){openEmployeeModal()}

// ==================== حفظ وحذف السجلات (موظف، إجازة، شفت، ملاحظة شخصية) ====================
function saveEmployee(){
  const name=document.getElementById('empName').value.trim();
  const nameAr=document.getElementById('empNameAr').value.trim();
  const empId=document.getElementById('empId').value.trim();
  const phoneInput=document.getElementById('empPhone').value.trim();
  if(!name||!empId){alert('أدخل الاسم والرقم الوظيفي');return}
  const phone=phoneInput?normalizeSaudiPhone(phoneInput):'';
  if(phoneInput&&!phone){alert('أدخل رقم جوال سعودي صحيحًا مثل 05XXXXXXXX');return}
  const leaveBalance=Number(document.getElementById('empLeaveBalance').value||0);
  if(!Number.isFinite(leaveBalance)||leaveBalance<0){alert('أدخل رصيد إجازة صحيحًا');return}
  const duplicate=state.employees.find(e=>e.empId===empId&&e.id!==editingEmployeeId);if(duplicate){alert('الرقم الوظيفي مستخدم لموظف آخر');return}
  const values={name,nameAr,empId,phone,marineIdExpiry:document.getElementById('empMarineIdExpiry').value,shift:document.getElementById('empShift').value,dutyRole:document.getElementById('empDutyRole').value,location:document.getElementById('empLocation').value.trim(),note:document.getElementById('empNote').value.trim(),leaveBalance};
  if(editingEmployeeId){const e=state.employees.find(x=>x.id===editingEmployeeId);if(!e)return;Object.assign(e,values)}else state.employees.push({id:crypto.randomUUID(),gc:'',position:'',...values});
  ['empName','empNameAr','empId','empPhone','empLocation','empNote','empLeaveBalance','empMarineIdExpiry','empDutyRole'].forEach(id=>document.getElementById(id).value='');
  editingEmployeeId=null;closeModal('employeeModal');save();
}
function datesBetween(start,end){
  const dates=[],cursor=new Date(start+'T12:00:00'),last=new Date(end+'T12:00:00');
  while(cursor<=last){
    const y=cursor.getFullYear(),m=String(cursor.getMonth()+1).padStart(2,'0'),d=String(cursor.getDate()).padStart(2,'0');
    dates.push(`${y}-${m}-${d}`);cursor.setDate(cursor.getDate()+1);
  }
  return dates;
}
function checkLeaveCapacity(employeeId,start,end,excludeId=null){
  const otherLeaves=state.leaves.filter(l=>l.id!==excludeId);
  const employeeConflict=otherLeaves.find(l=>l.employeeId===employeeId&&l.start<=end&&l.end>=start);
  const blocked=[],full=[];
  datesBetween(start,end).forEach(date=>{
    const total=otherLeaves.filter(l=>l.start<=date&&l.end>=date).length+1;
    if(total>6)blocked.push({date,total});else if(total===6)full.push({date,total});
  });
  return {employeeConflict,blocked,full};
}
function leaveChargedDays(leave){
  if(!leave)return 0;
  if(leave.pendingChargeYear)return 0;
  const stored=Number(leave.balanceDaysCharged);
  if(Number.isFinite(stored)&&stored>0)return stored;
  if(/^\d{4}-\d{2}-\d{2}$/.test(leave.start||'')&&/^\d{4}-\d{2}-\d{2}$/.test(leave.end||'')&&leave.end>=leave.start)return diffDays(leave.end,leave.start)+1;
  return 0;
}
function saveLeave(){
  const employeeId=document.getElementById('leaveEmployee').value;
  const start=document.getElementById('leaveStart').value;
  const end=document.getElementById('leaveEnd').value;
  if(!employeeId||!start||!end){alert('أكمل بيانات الإجازة');return}
  if(end<start){alert('تاريخ النهاية يجب أن يكون بعد البداية');return}
  const check=checkLeaveCapacity(employeeId,start,end,editingLeaveId);
  if(check.employeeConflict){alert(`هذا الموظف لديه إجازة متداخلة من ${fmtDate(check.employeeConflict.start)} إلى ${fmtDate(check.employeeConflict.end)}`);return}
  if(check.blocked.length){
    const dates=check.blocked.slice(0,5).map(x=>`${fmtDate(x.date)} (${x.total} موظفين)`).join('\n');
    const more=check.blocked.length>5?`\nو${check.blocked.length-5} أيام أخرى`:'';
    if(!confirm(`تنبيه: سيتجاوز عدد المجازين الحد الأعلى وهو 6.\n\nالأيام المتعارضة:\n${dates}${more}\n\nهل تريد الإضافة رغم ذلك؟`))return;
  }else if(check.full.length&&!confirm(`تنبيه: سيصل عدد المجازين إلى الحد الأعلى 6 موظفين خلال ${check.full.length} يوم. هل تريد المتابعة والإضافة؟`))return;
  const newDays=diffDays(end,start)+1;
  const futureYear=Number(start.slice(0,4))>new Date().getFullYear()?Number(start.slice(0,4)):0;
  const oldLeave=editingLeaveId?state.leaves.find(l=>l.id===editingLeaveId):null;
  const oldCharged=leaveChargedDays(oldLeave);
  const oldEmployee=oldLeave?state.employees.find(e=>e.id===oldLeave.employeeId):null;
  const employee=state.employees.find(e=>e.id===employeeId);
  const available=(Number(employee?.leaveBalance)||0)+(oldLeave?.employeeId===employeeId?oldCharged:0);
  if(!futureYear&&newDays>available&&!confirm(`تنبيه: مدة الإجازة ${newDays} يوم بينما الرصيد المتاح ${formatDays(available)} يوم.\nسيصبح الرصيد سالبًا. هل تريد المتابعة؟`))return;
  if(oldLeave&&oldEmployee)oldEmployee.leaveBalance=(Number(oldEmployee.leaveBalance)||0)+oldCharged;
  if(employee&&!futureYear)employee.leaveBalance=(Number(employee.leaveBalance)||0)-newDays;
  const leaveData={employeeId,start,end,note:document.getElementById('leaveNote').value.trim(),balanceDaysCharged:futureYear?0:newDays,...(futureYear?{pendingChargeYear:futureYear,pendingChargeDays:newDays}:{pendingChargeYear:undefined,pendingChargeDays:undefined})};
  if(editingLeaveId){
    const index=state.leaves.findIndex(l=>l.id===editingLeaveId);
    if(index>=0)state.leaves[index]={...state.leaves[index],...leaveData};
  }else{
    state.leaves.push({id:crypto.randomUUID(),...leaveData});
  }
  document.getElementById('leaveStart').value='';document.getElementById('leaveEnd').value='';document.getElementById('leaveNote').value='';
  editingLeaveId=null;
  closeModal('leaveModal'); save();
}
function saveShift(){
  const post=document.getElementById('shiftPost').value.trim();
  const employeeId=document.getElementById('shiftEmployee').value;
  const shift=document.getElementById('shiftType').value;
  if(!post||!employeeId){alert('أدخل الموقع والموظف');return}
  state.shifts.push({id:crypto.randomUUID(),post,employeeId,shift});
  document.getElementById('shiftPost').value='';
  closeModal('shiftModal'); save();
}
function savePersonalNote(){
  const date=document.getElementById('personalNoteDate').value;
  const text=document.getElementById('personalNoteText').value.trim();
  if(!date||!text){alert('أدخل تاريخ التنبيه ونص الملاحظة');return}
  state.personalNotes.push({
    id:(crypto.randomUUID?crypto.randomUUID():('note-'+Date.now())),
    date,text,createdAt:new Date().toISOString()
  });
  document.getElementById('personalNoteText').value='';
  document.getElementById('personalNoteDate').value=todayISO();
  closeModal('personalNoteModal');save();
}
function deletePersonalNote(id){
  if(confirm('حذف هذه الملاحظة؟')){
    state.personalNotes=state.personalNotes.filter(n=>n.id!==id);save();
  }
}
// ==================== صفحة التحديثات (تعليمات وتغييرات العمل) ====================
function openUpdateModal(){
  document.getElementById('updateText').value='';
  document.getElementById('updateModal').classList.add('show');
}
function saveUpdateEntry(){
  const text=document.getElementById('updateText').value.trim();
  if(!text){alert('أدخل نص التحديث');return}
  state.updates.push({id:(crypto.randomUUID?crypto.randomUUID():('update-'+Date.now())),text,createdAt:new Date().toISOString()});
  closeModal('updateModal');save();
}
function deleteUpdateEntry(id){
  if(confirm('حذف هذا التحديث؟')){
    state.updates=state.updates.filter(u=>u.id!==id);save();
  }
}
function renderUpdates(){
  const box=document.getElementById('updatesList');
  if(!box)return;
  const updates=[...state.updates].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  if(!updates.length){box.innerHTML='<div class="empty">لا توجد تحديثات مسجّلة</div>';return}
  box.innerHTML=updates.map(u=>`<div class="note-row">
    <div class="note-copy">
      <div class="note-text">${esc(u.text)}</div>
      <div class="note-date"><span>◷</span><span>${fmtDate(String(u.createdAt).slice(0,10))}</span></div>
    </div>
    <button class="secondary danger" onclick="deleteUpdateEntry('${u.id}')">حذف</button>
  </div>`).join('');
}
function deleteEmployee(id){
  if(!confirm('حذف الموظف وكل الإجازات والتوزيعات المرتبطة به؟'))return;
  state.employees=state.employees.filter(e=>e.id!==id);
  state.leaves=state.leaves.filter(l=>l.employeeId!==id);
  state.shifts=state.shifts.filter(s=>s.employeeId!==id); state.records=state.records.filter(r=>r.employeeId!==id);
  Object.values(state.monthlySchedules||{}).forEach(schedule=>Object.keys(schedule||{}).forEach(key=>{schedule[key]=(schedule[key]||[]).filter(employeeId=>employeeId!==id);if(!schedule[key].length)delete schedule[key]}));save();
}
function deleteLeave(id){
  if(!confirm('حذف الإجازة؟'))return;
  const leave=state.leaves.find(x=>x.id===id);
  const charged=leaveChargedDays(leave);if(leave&&charged){const e=state.employees.find(x=>x.id===leave.employeeId);if(e)e.leaveBalance=(Number(e.leaveBalance)||0)+charged}
  state.leaves=state.leaves.filter(x=>x.id!==id);save();
}
function deleteShift(id){ if(confirm('حذف التوزيع؟')){state.shifts=state.shifts.filter(x=>x.id!==id);save()} }

/* مساعد الشفت: استعلامات محلية آمنة + تأكيد قبل الكتابة */
let aiPendingAction=null;
let aiConversationHistory=[];
let aiLastEmployeeId=null;
let aiRecognition=null;
let aiIsListening=false;
let aiVoiceEnabled=localStorage.getItem('shiftManagerAIVoice')!=='off';
let aiSpeechToken=0;
let aiSpeechAudio=null;
let aiSpeechUrl='';
let aiRealtimePc=null;
let aiRealtimeDc=null;
let aiRealtimeStream=null;
let aiRealtimeAudio=null;
let aiRealtimeConnecting=false;
let aiRealtimeConnected=false;
let aiRealtimeTranscript='';
let aiRealtimeLastUserText='';
let aiRealtimeLeaveApprovalPending=null;
let aiRealtimeWhatsAppPending=null;
let aiRealtimeWaitingRetry=false;
const aiRealtimeHandledCalls=new Set();
let aiRealtimeResponseActive=false;
let aiRealtimeResponsePending=null;

/* ===== رابط السوبرفايزر: صفحة مؤشرات للقراءة فقط ===== */
function smShareUrl(token){return new URL('supervisor.html?t='+token,location.href).href}
async function smShareOpen(){
  if(!isAdmin())return;
  document.getElementById('smShareBox')?.remove();
  const box=document.createElement('div');box.id='smShareBox';box.className='modal show';
  box.innerHTML=`<div class="sheet" style="max-width:560px;max-height:86vh;overflow:auto"><h3 style="margin:0 0 4px">مشاركة المؤشرات</h3>
    <p class="small-note" style="margin:0 0 12px">رابط يفتح صفحة المؤشرات بس، للقراءة، ويتحدث تلقائياً. ما يقدر صاحبه يدخل البرنامج أو يعدّل، وما يشوف أرقام الجوالات. تقدر تلغي الرابط أي وقت.</p>
    <div style="display:flex;gap:8px;margin-bottom:12px"><input id="smShareLabel" placeholder="لمين الرابط؟ مثال: السوبرفايزر" style="flex:1"><button class="primary" onclick="smShareCreate()">إنشاء رابط</button></div>
    <div id="smShareList" class="small-note">جاري التحميل…</div>
    <div style="display:flex;justify-content:flex-end;margin-top:14px"><button class="secondary" onclick="document.getElementById('smShareBox').remove()">إغلاق</button></div></div>`;
  box.addEventListener('click',e=>{if(e.target===box)box.remove()});
  document.body.appendChild(box);smShareLoad();
}
async function smShareLoad(){
  const el=document.getElementById('smShareList');if(!el)return;
  try{
    const rows=await lpApi('/rest/v1/sm_share_links?revoked=eq.false&select=token,label,created_at,last_seen&order=created_at.desc')||[];
    el.innerHTML=rows.length?rows.map(r=>`<div class="lp-rm-row"><div class="n"><b>${esc(r.label||'بدون اسم')}</b><small>${r.last_seen?'آخر فتح '+lpAgo(r.last_seen):'ما انفتح بعد'}</small></div>
      <button class="secondary" onclick="smShareCopy('${r.token}')">نسخ</button><button class="primary" onclick="smShareWa('${r.token}')">واتساب</button><button class="secondary danger" onclick="smShareRevoke('${r.token}')">إلغاء</button></div>`).join(''):'ما فيه روابط. اكتب لمين الرابط واضغط «إنشاء رابط».';
  }catch(e){el.textContent='تعذر التحميل: '+e.message}
}
async function smShareCreate(){
  const label=(document.getElementById('smShareLabel')?.value||'').trim()||'السوبرفايزر';
  try{await lpApi('/rest/v1/sm_share_links',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({label})});document.getElementById('smShareLabel').value='';smShareLoad()}
  catch(e){alert('تعذر إنشاء الرابط: '+e.message)}
}
function smShareCopy(t){lpCopyText(smShareUrl(t),'تم نسخ الرابط ✓')}
function smShareWa(t){const msg=`السلام عليكم\nهذا رابط مؤشرات Group A (للعرض فقط، ويتحدث تلقائياً):\n${smShareUrl(t)}`;const url=`https://wa.me/?text=${encodeURIComponent(msg)}`;const w=window.open(url,'_blank');if(!w)location.href=url}
async function smShareRevoke(t){
  if(!confirm('إلغاء الرابط؟ اللي عنده الرابط ما راح يقدر يفتحه بعدها.'))return;
  try{await lpApi(`/rest/v1/sm_share_links?token=eq.${t}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({revoked:true})});smShareLoad()}
  catch(e){alert('تعذر الإلغاء: '+e.message)}
}
