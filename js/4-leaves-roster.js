// ==================== الإجازات والشفت (عرض القوائم) ====================
function exportLeavesExcel(requestedMonth=''){
  const month=requestedMonth||document.getElementById('leaveMonthFilter')?.value||'';
  if(!month){alert('اختر الشهر أولًا ثم اضغط Export Excel');return}
  const rows=reportRowsForMonth(month);
  if(!rows.length){alert('لا توجد إجازات في الشهر المحدد');return}
  const header=['Employee Name / اسم الموظف','Badge Number / رقم الباج','Leave From / من','Leave To / إلى','Total Days / عدد الأيام'];
  downloadCsv(`Group_A_Leaves_${month}.csv`,header,rows.map(({leave,employee})=>[employee.name,employee.empId,leave.start,leave.end,diffDays(leave.end,leave.start)+1]));
}
function monthLabel(value){
  if(!value)return 'جميع الإجازات';
  const [year,month]=value.split('-').map(Number);
  return 'إجازات '+new Date(year,month-1,1).toLocaleDateString('ar-SA-u-ca-gregory',{month:'long',year:'numeric'});
}
function renderLeaves(){
  const box=document.getElementById('leaveList'); box.innerHTML='';
  const month=document.getElementById('leaveMonthFilter')?.value||'';
  const rangeStart=document.getElementById('leaveRangeStart')?.value||'',rangeEnd=document.getElementById('leaveRangeEnd')?.value||'',hasRange=!!(rangeStart&&rangeEnd&&rangeEnd>=rangeStart);
  const monthStart=month?month+'-01':'';
  const monthEnd=month?month+'-'+String(new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate()).padStart(2,'0'):'';
  const list=state.leaves
    .filter(l=>hasRange?(l.start<=rangeEnd&&l.end>=rangeStart):(!month||(l.start<=monthEnd&&l.end>=monthStart)))
    .sort((a,b)=>a.start.localeCompare(b.start));
  document.getElementById('leaveMonthTitle').textContent=hasRange?`الإجازات المتقاطعة مع الفترة ${fmtDate(rangeStart)} إلى ${fmtDate(rangeEnd)}`:monthLabel(month);
  document.getElementById('leaveMonthCount').textContent=new Set(list.map(l=>l.employeeId)).size+' موظف';
  if(!list.length){box.innerHTML='<div class="empty">لا توجد إجازات في الفترة المحددة</div>';return}
  const t=todayISO();
  list.forEach(l=>{
    const e=state.employees.find(x=>x.id===l.employeeId); if(!e)return;
    let statusClass='leave-upcoming',label='قادمة';
    if(l.start<=t&&l.end>=t){statusClass='leave-active';label='في إجازة'}
    else if(l.end<t){statusClass='leave-ended';label='منتهية'}
    box.insertAdjacentHTML('beforeend',`
      <div class="row ${statusClass}">
        <div class="row-main">
          <div class="avatar">${esc(initials(e.name))}</div>
          <div><div class="name">${esc(e.name)}</div><div class="meta">${fmtDate(l.start)} ← ${fmtDate(l.end)}</div></div>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <span class="badge ${statusClass}">${label}</span>
          <button class="secondary" onclick="openLeaveModal('${l.id}')">تعديل</button>
          <button class="secondary danger" onclick="deleteLeave('${l.id}')">حذف</button>
        </div>
      </div>`);
  });
}

function renderShift(){
  const box=document.getElementById('shiftList'); box.innerHTML='';
  if(!state.shifts.length){box.innerHTML='<div class="empty">لا يوجد توزيع محفوظ للشفت</div>';return}
  state.shifts.forEach(s=>{
    const e=state.employees.find(x=>x.id===s.employeeId);
    box.insertAdjacentHTML('beforeend',`
      <div class="shift-card">
        <strong>${esc(s.post)}</strong>
        <div class="meta">${esc(e?e.name:'موظف محذوف')} · ${esc(s.shift)}</div>
        <div style="margin-top:10px"><button class="secondary danger" onclick="deleteShift('${s.id}')">حذف</button></div>
      </div>`);
  });
  renderShiftPreview();
}

function renderShiftPreview(){
  const box=document.getElementById('currentShiftPreview');
  const rows=state.shifts.slice(0,4);
  const current=groupShiftForDate(todayISO());
  const summary=`<div class="shift-today-mini ${current.cls}"><span>دوام Group A اليوم</span><strong>${current.code} · ${current.name}</strong></div>`;
  if(!rows.length){box.innerHTML=summary+'<div class="empty">لا يوجد توزيع مواقع محفوظ</div>';return}
  box.innerHTML=summary+rows.map(s=>{
    const e=state.employees.find(x=>x.id===s.employeeId);
    return `<div class="row"><div><div class="name">${esc(s.post)}</div><div class="meta">${esc(e?e.name:'-')} · ${esc(s.shift)}</div></div></div>`;
  }).join('');
}

function refreshSelects(){
  const opts=state.employees.map(e=>`<option value="${e.id}">${esc(e.name)} (#${esc(e.empId)})</option>`).join('');
  document.getElementById('leaveEmployee').innerHTML=opts;
  document.getElementById('shiftEmployee').innerHTML=opts;
  const annual=document.getElementById('annualReportEmployee');if(annual){const current=annual.value;annual.innerHTML=opts;if(current)annual.value=current}
  const fullEmployee=document.getElementById('fullEmployeeReportEmployee');if(fullEmployee){const current=fullEmployee.value;fullEmployee.innerHTML=opts;if(current)fullEmployee.value=current}
  const fullStart=document.getElementById('fullEmployeeReportStart'),fullEnd=document.getElementById('fullEmployeeReportEnd'),year=new Date().getFullYear();
  if(fullStart&&!fullStart.value)fullStart.value=`${year}-01-01`;
  if(fullEnd&&!fullEnd.value)fullEnd.value=`${year}-12-31`;
}

function openEmployeeAnnualReport(id){
  showView('reportsView');refreshSelects();
  document.getElementById('annualReportEmployee').value=id;
  document.getElementById('annualReportYear').value=new Date().getFullYear();
  selectReportType('annual');renderAnnualEmployeeReport();
}

/* توزيع المواقع التاريخي 2026 محفوظ في shift_manager_config (historical_locations_2026) وينقرأ بعد الدخول */
let HISTORICAL_LOCATIONS_2026={};
// ==================== History الموظف — قراءة فقط، من monthlySchedules وmonthlySchedulePeriods الموجودتين فعليًا (بدون بيانات أو جدول جديد) ====================
function getEmployeeLocationHistory(employeeId,year){
  const months=new Set();
  Object.keys(state.monthlySchedules||{}).forEach(m=>{if(m.startsWith(String(year)+'-'))months.add(m)});
  const baselineYear=state.locationHistory?.[employeeId]?.[String(year)]||{};
  Object.keys(baselineYear).forEach(mm=>months.add(`${year}-${mm}`));
  const result=[];
  [...months].sort().forEach(month=>{
    const mm=month.split('-')[1];
    const locations=[];
    const schedule=state.monthlySchedules?.[month]||{};
    Object.entries(schedule).forEach(([key,ids])=>{
      if(Array.isArray(ids)&&ids.includes(employeeId)){
        const loc=key.includes('|')?key.split('|').slice(1).join('|'):key;
        if(!locations.includes(loc))locations.push(loc);
      }
    });
    (baselineYear[mm]||[]).forEach(loc=>{if(!locations.includes(loc))locations.push(loc)});
    if(locations.length){
      const period=state.monthlySchedulePeriods?.[month]||monthBounds(month);
      result.push({month,period,locations});
    }
  });
  return result;
}
function historyPeriodLabel(month,period){
  const [y,m]=month.split('-').map(Number);
  const bounds=monthBounds(month);
  const monthYearFull=new Date(y,m-1,1).toLocaleDateString('ar-SA-u-ca-gregory',{month:'long',year:'numeric'});
  if(!period||(period.start===bounds.start&&period.end===bounds.end))return monthYearFull;
  const monthNameOnly=new Date(y,m-1,1).toLocaleDateString('ar-SA-u-ca-gregory',{month:'long'});
  return `${period.start.slice(8,10)}–${period.end.slice(8,10)} ${monthNameOnly} ${y}`;
}
function cleanNameForMatch(name){
  return (name||'')
    .replace(/[\u064B-\u065F\u0670]/g,'')
    .replace(/[إأآا]/g,'ا')
    .replace(/ى/g,'ي')
    .replace(/ة/g,'ه')
    .replace(/\s+/g,' ')
    .trim();
}
function nameTokensForMatch(name){
  const raw=cleanNameForMatch(name).split(' ').filter(Boolean);
  const tokens=[];
  for(let i=0;i<raw.length;i++){
    if(raw[i]==='عبد'&&raw[i+1]){tokens.push('عبد'+raw[i+1]);i++}
    else tokens.push(raw[i]);
  }
  return tokens;
}
function matchHistoricalName(excelName){
  const cleanExcel=cleanNameForMatch(excelName);
  const exact=state.employees.filter(e=>cleanNameForMatch(e.nameAr||e.name)===cleanExcel);
  if(exact.length===1)return{status:'matched',employee:exact[0],method:'exact'};
  if(exact.length>1)return{status:'review',candidates:exact,method:'exact-ambiguous'};
  const tokens=nameTokensForMatch(excelName);
  if(tokens.length>=2){
    const first=tokens[0],last=tokens[tokens.length-1];
    const candidates=state.employees.filter(e=>{
      const et=nameTokensForMatch(e.nameAr||e.name);
      return et.length>=2&&et[0]===first&&et[et.length-1]===last;
    });
    if(candidates.length===1)return{status:'matched',employee:candidates[0],method:'first-last'};
    if(candidates.length>1)return{status:'review',candidates,method:'first-last-ambiguous'};
  }
  return{status:'unmatched'};
}
let pendingHistoricalImport=null;
function runHistoricalImportMatch(){
  const namesSet=new Set();
  Object.values(HISTORICAL_LOCATIONS_2026).forEach(monthData=>{
    Object.values(monthData).forEach(names=>names.forEach(n=>namesSet.add(n)));
  });
  const matched=[],review=[],unmatched=[],nameToEmployeeId={};
  namesSet.forEach(name=>{
    const r=matchHistoricalName(name);
    if(r.status==='matched'){matched.push({excelName:name,employee:r.employee});nameToEmployeeId[name]=r.employee.id}
    else if(r.status==='review'){review.push({excelName:name,candidates:r.candidates})}
    else{unmatched.push({excelName:name})}
  });
  pendingHistoricalImport={nameToEmployeeId,matched,review,unmatched};
  document.getElementById('historicalImportModal').classList.add('show');
  renderHistoricalImportReport();
}
function renderHistoricalImportReport(){
  const p=pendingHistoricalImport;if(!p)return;
  document.getElementById('histImportSummary').textContent=`عدد أسماء Excel الفريدة: ${p.matched.length+p.review.length+p.unmatched.length} — تم الربط: ${p.matched.length} · يحتاج مراجعة: ${p.review.length} · غير مرتبط: ${p.unmatched.length}`;
  document.getElementById('histImportMatched').innerHTML=p.matched.length?p.matched.map(m=>`<div class="row"><div class="row-main"><div><div class="name">${esc(m.excelName)}</div><div class="meta">↳ ${esc(m.employee.nameAr||m.employee.name)}</div></div></div></div>`).join(''):'<div class="empty">لا يوجد</div>';
  document.getElementById('histImportReview').innerHTML=p.review.length?p.review.map(m=>`<div class="row"><div class="row-main"><div><div class="name">${esc(m.excelName)}</div><div class="meta">تطابق مع ${m.candidates.length} موظفين: ${esc(m.candidates.map(c=>c.nameAr||c.name).join('، '))} — لم يُربط تلقائيًا</div></div></div></div>`).join(''):'<div class="empty">لا يوجد</div>';
  document.getElementById('histImportUnmatched').innerHTML=p.unmatched.length?p.unmatched.map(m=>`<div class="row"><div class="row-main"><div class="name">${esc(m.excelName)}</div></div></div>`).join(''):'<div class="empty">لا يوجد</div>';
  const btn=document.getElementById('histImportConfirmBtn');if(btn)btn.disabled=!p.matched.length;
}
function confirmHistoricalImport(){
  const p=pendingHistoricalImport;if(!p||!p.matched.length)return;
  if(!state.locationHistory||typeof state.locationHistory!=='object')state.locationHistory={};
  let recordCount=0;
  Object.entries(HISTORICAL_LOCATIONS_2026).forEach(([monthKey,monthData])=>{
    const [year,mm]=monthKey.split('-');
    Object.entries(monthData).forEach(([loc,names])=>{
      names.forEach(name=>{
        const empId=p.nameToEmployeeId[name];
        if(!empId)return;
        if(!state.locationHistory[empId])state.locationHistory[empId]={};
        if(!state.locationHistory[empId][year])state.locationHistory[empId][year]={};
        if(!state.locationHistory[empId][year][mm])state.locationHistory[empId][year][mm]=[];
        if(!state.locationHistory[empId][year][mm].includes(loc)){state.locationHistory[empId][year][mm].push(loc);recordCount++}
      });
    });
  });
  save();
  closeModal('historicalImportModal');
  alert(`تم اعتماد الاستيراد.\nموظفون مرتبطون: ${p.matched.length}\nسجلات (شهر×موقع) محفوظة: ${recordCount}\nيحتاج مراجعة: ${p.review.length}\nغير مرتبط: ${p.unmatched.length}`);
  renderEmployeeHistoryModal();
  pendingHistoricalImport=null;
}
// ==================== Gate & Patrol Coverage — تقرير محسوب من History الموجودة فعليًا، Read Only ====================
function getAvailableHistoryYears(){
  const years=new Set();
  Object.values(state.locationHistory||{}).forEach(byYear=>{
    Object.keys(byYear||{}).forEach(y=>years.add(y));
  });
  Object.keys(state.monthlySchedules||{}).forEach(m=>years.add(m.split('-')[0]));
  years.add(String(new Date().getFullYear()));
  return [...years].sort((a,b)=>b.localeCompare(a));
}
function getGateCoverageReport(year){
  const gates={},patrols={};
  state.employees.forEach(e=>{
    const history=getEmployeeLocationHistory(e.id,Number(year));
    history.forEach(row=>{
      row.locations.forEach(loc=>{
        let bucket=null;
        if(/^STN/i.test(loc))bucket=gates;
        else if(/^Patrol/i.test(loc))bucket=patrols;
        if(!bucket)return;
        if(!bucket[loc])bucket[loc]={};
        if(!bucket[loc][e.id])bucket[loc][e.id]={employee:e,count:0};
        bucket[loc][e.id].count++;
      });
    });
  });
  function finalize(bucket){
    return Object.keys(bucket).sort().map(loc=>({
      location:loc,
      employees:Object.values(bucket[loc]).map(x=>({employee:x.employee,count:x.count,exceeded:x.count>3})).sort((a,b)=>b.count-a.count)
    }));
  }
  return {gates:finalize(gates),patrols:finalize(patrols)};
}
function coverageCardHtml(item){
  const rows=item.employees.map(x=>`<div class="coverage-row ${x.exceeded?'exceeded':''}"><span class="cov-name">${esc(x.employee.nameAr||x.employee.name)}</span><span class="cov-count">${x.count} ${x.count===1?'مرة':'مرات'}</span></div>`).join('');
  return `<div class="coverage-card"><h4>${esc(item.location)}</h4>${rows||'<div class="empty">لا يوجد</div>'}</div>`;
}
function openGateCoverage(){showView('gateCoverageView',document.querySelector('.navbtn[data-view=gateCoverageView]'))}
/* يتنادى من showView لما تفتح تبويب «التغطية» */
function prepGateCoverage(){
  const sel=document.getElementById('gateCoverageYear');if(!sel)return;
  const prev=sel.value,years=getAvailableHistoryYears();
  sel.innerHTML=years.map(y=>`<option value="${y}">${y}</option>`).join('');
  if(prev&&years.map(String).includes(prev))sel.value=prev;
  renderGateCoverage();
}
function renderGateCoverage(){
  const year=document.getElementById('gateCoverageYear').value;
  const report=getGateCoverageReport(year);
  document.getElementById('gateCoverageGates').innerHTML=report.gates.length?report.gates.map(coverageCardHtml).join(''):'<div class="empty">لا توجد بيانات بوابات لهذه السنة</div>';
  document.getElementById('gateCoveragePatrols').innerHTML=report.patrols.length?report.patrols.map(coverageCardHtml).join(''):'<div class="empty">لا توجد بيانات دوريات لهذه السنة</div>';
  renderTempCoverageLog(year);
}
let employeeHistoryEmployeeId=null;
function openEmployeeHistory(id){
  const e=state.employees.find(x=>x.id===id);if(!e)return;
  employeeHistoryEmployeeId=id;
  document.getElementById('employeeHistoryTitle').textContent='History — '+(e.nameAr||e.name);
  const years=new Set(Object.keys(state.monthlySchedules||{}).map(m=>m.slice(0,4)));
  years.add(String(new Date().getFullYear()));
  const sortedYears=[...years].sort((a,b)=>b.localeCompare(a));
  const sel=document.getElementById('employeeHistoryYear');
  sel.innerHTML=sortedYears.map(y=>`<option value="${y}">${y}</option>`).join('');
  document.getElementById('employeeHistoryModal').classList.add('show');
  renderEmployeeHistoryModal();
}
function renderEmployeeHistoryModal(){
  const box=document.getElementById('employeeHistoryList');if(!box)return;
  const e=state.employees.find(x=>x.id===employeeHistoryEmployeeId);if(!e)return;
  const year=document.getElementById('employeeHistoryYear').value;
  const data=getEmployeeLocationHistory(e.id,Number(year));
  const uniqueBox=document.getElementById('employeeHistoryUnique');
  if(uniqueBox){
    const uniqueLocations=[...new Set(data.flatMap(row=>row.locations))];
    uniqueBox.innerHTML=uniqueLocations.length?`<div class="small-note" style="margin-bottom:6px">المواقع التي سبق له تغطيتها:</div><div>${uniqueLocations.map(l=>`<span class="chip" style="margin:2px">${esc(l)}</span>`).join('')}</div>`:'';
  }
  box.innerHTML=data.length?data.map(row=>`<div class="row"><div class="row-main"><div><div class="name">${esc(historyPeriodLabel(row.month,row.period))}</div><div class="meta">${esc(row.locations.join(' / '))}</div></div></div></div>`).join(''):'<div class="empty">لا يوجد سجل توزيع محفوظ لهذه السنة</div>';
}

// ==================== التوزيع الشهري للمواقع (Monthly Roster) ====================
const MONTHLY_ROSTER_GROUPS=[
  {name:'Monthly Schedule',key:'leadership',posts:['Shift Chief (01)','Assistant Shift Chief (02)','Community Supervisor (03)','Shift Clerk','SCC','Ind. Visitor','Comm. Visitor']},
  {name:'Stations',key:'stations',posts:['STN# 01','STN# 04','STN# 05','STN# 06','STN# 07','STN# 10','STN# 16A','STN# 17']},
  {name:'Patrols',key:'patrol',posts:['Patrol# (05)','Patrol# (06)','Patrol# (07)','Patrol# (08)','Patrol# (09)','Patrol# (010)','Patrol# (011)','Patrol# (012)','Patrol# (013)']}
];
const ROSTER_STATION_LIMITS={
  'stations|STN# 01':{min:4},'stations|STN# 04':{min:2,max:3},'stations|STN# 05':{min:3},
  'stations|STN# 06':{min:1,max:1},'stations|STN# 07':{min:1,max:2,def:2},'stations|STN# 10':{min:3},'stations|STN# 16A':{min:3,max:4}
};
function rosterPostKey(groupKey,post){return groupKey+'|'+post}
function monthlyRosterData(){
  if(!state.monthlySchedules[monthlyRosterMonth])state.monthlySchedules[monthlyRosterMonth]={};
  const data=state.monthlySchedules[monthlyRosterMonth];
  Object.keys(data).forEach(key=>data[key]=(data[key]||[]).filter(id=>!rosterLeaveStatus(id).blocked||isDesignatedBackupAssignment(id,key)));
  return data;
}
function normalizeRosterRequirement(key,value){const rule=ROSTER_STATION_LIMITS[key],n=Math.max(0,Math.min(99,Number(value)||0));if(!rule)return n;return Math.min(rule.max??99,Math.max(rule.min,n))}
function rosterRequirementHint(key){const r=ROSTER_STATION_LIMITS[key];if(!r)return '';return r.max===r.min?`${r.min} بالضبط`:r.max?`من ${r.min} إلى ${r.max}`:`الحد الأدنى ${r.min}`}
function monthlyRosterRequirements(){if(!state.monthlyScheduleRequirements[monthlyRosterMonth])state.monthlyScheduleRequirements[monthlyRosterMonth]={};const req=state.monthlyScheduleRequirements[monthlyRosterMonth];Object.keys(ROSTER_STATION_LIMITS).forEach(key=>req[key]=normalizeRosterRequirement(key,req[key]??ROSTER_STATION_LIMITS[key].def));return req}
function defaultMonthlyRosterPeriod(){const b=monthBounds(monthlyRosterMonth);return {start:b.start,end:b.end}}
function monthlyRosterPeriod(){return state.monthlySchedulePeriods[monthlyRosterMonth]||defaultMonthlyRosterPeriod()}
function syncMonthlyRosterPeriodInputs(){const p=monthlyRosterPeriod(),start=document.getElementById('monthlyRosterStart'),end=document.getElementById('monthlyRosterEnd');if(start)start.value=p.start;if(end)end.value=p.end}
function saveMonthlyRosterPeriod(){
  const start=document.getElementById('monthlyRosterStart').value,end=document.getElementById('monthlyRosterEnd').value;if(!start||!end){alert('حدد بداية ونهاية فترة الجدول');return}if(end<start){alert('نهاية الفترة يجب أن تكون بعد البداية');return}
  state.monthlySchedulePeriods[monthlyRosterMonth]={start,end};save();alert('تم حفظ الجدول وفترته')
}
function cancelMonthlyRoster(){
  const data=monthlyRosterData(),hasAssignments=Object.values(data).some(ids=>Array.isArray(ids)&&ids.length);if(!hasAssignments){alert('لا يوجد جدول محفوظ لإلغائه');return}
  const label=monthLabel(monthlyRosterMonth).replace('إجازات ','');if(!confirm(`هل تريد إلغاء جدول ${label} بالكامل؟\nسيتم حذف التوزيع المحفوظ فقط، ولن تُحذف الإجازات أو أعداد الاحتياج.`))return;
  state.monthlySchedules[monthlyRosterMonth]={};pendingAutoRoster=null;save();alert('تم إلغاء الجدول، ويمكنك إنشاء توزيع جديد');
}
function updateMonthlyRosterPeriodDraft(){const start=document.getElementById('monthlyRosterStart').value,end=document.getElementById('monthlyRosterEnd').value;if(start&&end&&end>=start){state.monthlySchedulePeriods[monthlyRosterMonth]={start,end};svUpdateTitle()}}
function rosterLeaveStatus(employeeId,period=monthlyRosterPeriod()){
  const overlaps=state.leaves.filter(l=>l.employeeId===employeeId&&l.start<=period.end&&l.end>=period.start).sort((a,b)=>a.start.localeCompare(b.start));
  const activeAtStart=overlaps.find(l=>l.start<=period.start&&l.end>=period.start),returning=activeAtStart&&activeAtStart.end<period.end?activeAtStart:null,blocked=activeAtStart||null;const upcoming=overlaps.find(l=>l.start>period.start&&l.start<=period.end);return {blocked,upcoming,returning,activeAtStart,overlaps};
}
let FIXED_ROSTER_POSTS={};
const ROSTER_ARABIC_NAMES={};
function rosterEmployeeName(employee){return employee?.nameAr||ROSTER_ARABIC_NAMES[String(employee?.empId||'')]||employee?.name||''}
let ASSISTANT_PRIMARY_ID='',ASSISTANT_BACKUP_ID='';const ASSISTANT_POST_KEY='leadership|Assistant Shift Chief (02)';
let SCC_PRIMARY_IDS=[],SCC_BACKUP_IDS=[];const SCC_POST_KEY='leadership|SCC';
let COMMUNITY_PRIMARY_ID='',COMMUNITY_BACKUP_ID='';const COMMUNITY_POST_KEY='leadership|Community Supervisor (03)';
function loadRuntimeRosterConfig(){
  const config=state.rosterSecurityConfig||{};
  FIXED_ROSTER_POSTS=config.fixedPosts&&typeof config.fixedPosts==='object'?{...config.fixedPosts}:{};
  ASSISTANT_PRIMARY_ID=String(config.assistantPrimaryId||'');ASSISTANT_BACKUP_ID=String(config.assistantBackupId||'');
  SCC_PRIMARY_IDS=Array.isArray(config.sccPrimaryIds)?[...config.sccPrimaryIds]:[];SCC_BACKUP_IDS=Array.isArray(config.sccBackupIds)?[...config.sccBackupIds]:[];
  COMMUNITY_PRIMARY_ID=String(config.communityPrimaryId||'');COMMUNITY_BACKUP_ID=String(config.communityBackupId||'');
}
function fixedRosterPost(employeeId){return FIXED_ROSTER_POSTS[employeeId]||''}
function rosterBackupAvailable(employeeId,coverageStart,period=monthlyRosterPeriod()){
  const status=rosterLeaveStatus(employeeId,period);return !status.blocked||(status.returning&&addDaysISO(status.returning.end,1)<=coverageStart);
}
function isDesignatedBackupAssignment(employeeId,key,period=monthlyRosterPeriod()){
  if(employeeId===ASSISTANT_BACKUP_ID&&key===ASSISTANT_POST_KEY){const leave=rosterLeaveStatus(ASSISTANT_PRIMARY_ID,period).upcoming;return !!leave&&rosterBackupAvailable(employeeId,leave.start,period)}
  if(SCC_BACKUP_IDS.includes(employeeId)&&key===SCC_POST_KEY){const leave=SCC_PRIMARY_IDS.map(id=>rosterLeaveStatus(id,period).upcoming).filter(Boolean).sort((a,b)=>a.start.localeCompare(b.start))[0];return !!leave&&rosterBackupAvailable(employeeId,leave.start,period)}
  if(employeeId===COMMUNITY_BACKUP_ID&&key===COMMUNITY_POST_KEY){const leave=rosterLeaveStatus(COMMUNITY_PRIMARY_ID,period).upcoming;return !!leave&&rosterBackupAvailable(employeeId,leave.start,period)}
  return false;
}
function rosterEmployeesOnLeave(period=monthlyRosterPeriod()){
  /* بس اللي إجازتهم شغالة في يوم بداية الجدول (اللي تبدأ إجازته بعدين يطلع في التوزيع عادي) */
  return state.employees.map(employee=>{const leaves=state.leaves.filter(l=>l.employeeId===employee.id&&l.start<=period.start&&l.end>=period.start).sort((a,b)=>a.start.localeCompare(b.start));return leaves.length?{employee,leaves}:null}).filter(Boolean).sort((a,b)=>a.employee.name.localeCompare(b.employee.name));
}
function rosterLeaveSectionRows(columns=4){
  const entries=rosterEmployeesOnLeave();if(!entries.length)return '';
  const people=entries.map(({employee,leaves})=>{const dates=leaves.map(l=>`${fmtDate(l.start)} → ${fmtDate(l.end)}`).join('، '),status=rosterLeaveStatus(employee.id),returning=status.returning,cls=returning?'roster-returning':'roster-leave-person',title=returning?`${dates} — متاح بعد العودة ${fmtDate(addDaysISO(returning.end,1))}`:dates;return `<span class="roster-person ${cls}" title="${esc(title)}">${esc(rosterEmployeeName(employee))}</span>`}).join('');
  return `<tr class="roster-group leave"><td colspan="${columns}">Leave / إجازة (${entries.length})</td></tr><tr class="roster-leave-row"><td class="roster-post">Leave / إجازة</td><td>${entries.length}</td><td colspan="${Math.max(1,columns-2)}"><div class="roster-people">${people}</div></td></tr>`;
}
function setMonthlyRosterRequirement(key,value){const entered=Math.max(0,Math.min(99,Number(value)||0)),n=normalizeRosterRequirement(key,entered),req=monthlyRosterRequirements();if(n!==entered)alert(`تم تعديل العدد حسب قاعدة ${key.split('|')[1]}: ${rosterRequirementHint(key)}`);if(n)req[key]=n;else delete req[key];localStorage.setItem(KEY,JSON.stringify(state));clearTimeout(syncTimer);syncTimer=setTimeout(syncCloud,450);renderMonthlyRoster()}
function changeMonthlyRosterMonth(delta){const [y,m]=monthlyRosterMonth.split('-').map(Number),d=new Date(y,m-1+delta,1);monthlyRosterMonth=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;renderMonthlyRoster()}
function goMonthlyRosterToday(){monthlyRosterMonth=todayISO().slice(0,7);renderMonthlyRoster()}
function renderMonthlyRosterSummary(){
  const summary=document.getElementById('monthlyRosterSummary');if(!summary)return;const data=monthlyRosterData(),requirements=monthlyRosterRequirements(),allIds=new Set();
  Object.values(data).forEach(ids=>{if(Array.isArray(ids))ids.forEach(id=>allIds.add(id))});const needed=Object.values(requirements).reduce((s,n)=>s+(Number(n)||0),0),unclassified=state.employees.filter(e=>!e.dutyRole).length;
  const short=Object.entries(requirements).filter(([k,n])=>(Number(n)||0)>(Array.isArray(data[k])?data[k].length:0)).length;
  const leaveCount=rosterEmployeesOnLeave().length,period=monthlyRosterPeriod();
  const mAlerts=[...allIds].map(id=>state.employees.find(e=>e.id===id)).filter(e=>e&&marineExpiryFor(e)&&['soon','expired'].includes(marineStatus(e).kind)).length+(((data[MARINE_PATROL_KEY]||[]).some(id=>{const e=state.employees.find(x=>x.id===id);return e&&!rosterMarineOk(e,period)}))?1:0);
  summary.innerHTML=`<div><span>موزعين</span><strong>${allIds.size}<small>/${needed||'—'}</small></strong>${unclassified?`<em>${unclassified} بلا مهمة</em>`:''}</div><div class="${short?'bad':''}"><span>مواقع ناقصة</span><strong>${short}</strong></div><div><span>في إجازة</span><strong>${leaveCount}</strong></div><div class="${mAlerts?'warn':''}"><span>Marine</span><strong>${mAlerts?`${mAlerts} تنبيه`:'✓'}</strong></div>`;
}
/* جدول الطباعة (نفس الشكل القديم) */
function rosterPrintTableHtml(){
  const data=monthlyRosterData(),requirements=monthlyRosterRequirements();
  let html='<div class="monthly-roster-wrap"><table class="monthly-roster-table"><thead><tr><th>الموقع / المهمة</th><th>العدد المطلوب<br><small>شامل الليدر</small></th><th>الموظفون</th></tr></thead><tbody>';
  MONTHLY_ROSTER_GROUPS.forEach(group=>{
    html+=`<tr class="roster-group ${group.key}"><td colspan="3">${esc(group.name)}</td></tr>`;
    group.posts.forEach(post=>{const key=rosterPostKey(group.key,post),ids=Array.isArray(data[key])?data[key]:[],people=rosterLeadersFirst(ids.map(id=>state.employees.find(e=>e.id===id)).filter(Boolean)),hint=rosterRequirementHint(key);
      html+=`<tr><td class="roster-post">${esc(post)}${hint?`<div class="small-note">${esc(hint)}</div>`:''}</td><td>${Number(requirements[key])||0}</td><td><div class="roster-people">${people.length?people.map(e=>`<span class="roster-person ${e.dutyRole==='leader'?'roster-leader':''}">${esc(rosterEmployeeName(e))}</span>`).join(''):'<span class="roster-empty">غير موزع</span>'}</div></td></tr>`});
  });
  return html+rosterLeaveSectionRows(3)+'</tbody></table></div>';
}
function renderMonthlyRoster(){
  const title=document.getElementById('monthlyRosterTitle'),box=document.getElementById('monthlyRosterTable'),summary=document.getElementById('monthlyRosterSummary');if(!title||!box||!summary)return;
  syncMonthlyRosterPeriodInputs();
  svUpdateTitle();
  const data=monthlyRosterData(),requirements=monthlyRosterRequirements();renderMonthlyRosterSummary();
  const st=document.getElementById('svStatus'),saved=!!state.monthlySchedulePeriods?.[monthlyRosterMonth],has=Object.values(data).some(ids=>Array.isArray(ids)&&ids.length);
  if(st){st.className='sv-status '+(has&&saved?'ok':has?'draft':'empty');st.textContent=has&&saved?'✓ محفوظ':has?'الفترة ما انحفظت':'ما فيه توزيع'}
  box.innerHTML=MONTHLY_ROSTER_GROUPS.map(group=>{
    let filled=0,need=0;
    const cards=group.posts.map(post=>{const key=rosterPostKey(group.key,post),ids=Array.isArray(data[key])?data[key]:[],people=rosterLeadersFirst(ids.map(id=>state.employees.find(e=>e.id===id)).filter(Boolean)),req=Number(requirements[key])||0,rule=ROSTER_STATION_LIMITS[key],hint=rosterRequirementHint(key);
      filled+=Math.min(people.length,req||people.length);need+=req;
      const cls=req&&people.length<req?'short':(!req&&!people.length?'idle':'ok'),pct=req?Math.min(100,Math.round(people.length/req*100)):(people.length?100:0);
      return `<div class="sv-card ${cls}${key===MARINE_PATROL_KEY?' marine':''}"><div class="sv-card-h"><div class="sv-card-t"><b>${esc(post)}${key===MARINE_PATROL_KEY?' <span class="sv-anchor" title="تحتاج بطاقة Marine">⚓</span>':''}</b>${hint?`<small>${esc(hint)}</small>`:''}</div><span class="sv-badge ${cls}" title="الموزعين / المطلوب (شامل الليدر)">${people.length}/${req}</span><button type="button" class="sv-edit no-print" onclick="openMonthlyRosterModal('${esc(key)}')" aria-label="تعديل ${esc(post)}" title="تعديل الموقع والعدد المطلوب">✎</button></div><div class="sv-bar"><i style="width:${pct}%"></i></div>
        <div class="roster-people roster-drop sv-list" ondragover="allowRosterDrop(event)" ondragleave="this.classList.remove('drag-over')" ondrop="dropRosterEmployee(event,'${esc(key)}','saved')">${people.map(e=>rosterPersonChip(e,key)).join('')}${people.length<req||!people.length?`<button type="button" class="sv-add no-print" onclick="openMonthlyRosterModal('${esc(key)}')">+ إضافة</button>`:''}</div></div>`}).join('');
    const name=group.key==='leadership'?'القيادة والمهام':group.key==='stations'?'البوابات':group.key==='patrol'?'الدوريات':group.name;
    return `<div class="sv-group"><div class="sv-gh"><span>${esc(name)}</span><span>${filled}/${need}</span></div><div class="sv-grid">${cards}</div></div>`;
  }).join('');
  renderShiftSidePanel(data);
  const cs=document.getElementById('svCycleSummary');if(cs){const W={N:'ليل',A:'مساء',M:'صباح',OFF:'راحة'},t=todayISO(),c=groupShiftForDate(t).code;let d=t,g=0;while(groupShiftForDate(d).code===c&&g<30){d=addDaysISO(d,1);g++}while(groupShiftForDate(d).code==='OFF'&&g<60){d=addDaysISO(d,1);g++}cs.textContent=`اليوم: ${W[c]||c} · الجاي: ${W[groupShiftForDate(d).code]||''} من ${fmtDate(d)}`}
}
function renderShiftSidePanel(data){
  const side=document.getElementById('svSide');if(!side)return;
  const assigned=new Set();Object.values(data).forEach(ids=>Array.isArray(ids)&&ids.forEach(id=>assigned.add(id)));
  const leave=rosterEmployeesOnLeave(),onLeave=new Set(leave.map(x=>x.employee.id));
  const free=state.employees.filter(e=>!assigned.has(e.id)&&!onLeave.has(e.id)&&!rosterLeaveStatus(e.id).blocked).sort((a,b)=>String(rosterEmployeeName(a)).localeCompare(String(rosterEmployeeName(b)),'ar'));
  const lv=leave.map(({employee,leaves})=>{const dates=leaves.map(l=>`${fmtDate(l.start)} → ${fmtDate(l.end)}`).join('، ');return `<span class="roster-person roster-leave-person" title="${esc(dates)}">${esc(rosterEmployeeName(employee))}</span>`}).join('');
  side.innerHTML=`<div class="sv-side-card"><div class="sv-side-h"><b>غير موزعين</b><span>${free.length}</span></div><div class="sv-side-note">اضغط على الاسم واختر موقع، أو اسحبه</div><div class="roster-people roster-drop sv-free" ondragover="allowRosterDrop(event)" ondragleave="this.classList.remove('drag-over')" ondrop="dropRosterEmployee(event,'','saved')">${free.length?free.map(e=>rosterPersonChip(e,'','saved')).join(''):'<span class="roster-empty">الكل موزّع ✓</span>'}</div>
    <div class="sv-side-h" style="margin-top:12px"><b>في إجازة</b><span>${leave.length}</span></div><div class="roster-people">${lv||'<span class="roster-empty">لا أحد</span>'}</div></div>`;
}
function toggleSvMore(ev){const m=document.getElementById('svMenu');if(!m)return;if(ev)ev.stopPropagation();const open=!m.classList.contains('open');m.classList.toggle('open',open);if(open)setTimeout(()=>document.addEventListener('click',()=>m.classList.remove('open'),{once:true}),0)}
function openMonthlyRosterModal(key){
  editingMonthlyRosterPost=key;const [groupKey,...postParts]=key.split('|'),post=postParts.join('|'),group=MONTHLY_ROSTER_GROUPS.find(g=>g.key===groupKey);
  editingMonthlyRosterSelection=new Set(monthlyRosterData()[key]||[]);
  Object.entries(FIXED_ROSTER_POSTS).forEach(([id,postKey])=>{if(key===postKey&&state.employees.some(e=>e.id===id)&&!rosterLeaveStatus(id).blocked)editingMonthlyRosterSelection.add(id)});
  document.getElementById('monthlyRosterModalGroup').textContent=group?.name||'';document.getElementById('monthlyRosterModalTitle').textContent=post;
  {const r=document.getElementById('monthlyRosterModalReq'),rule=ROSTER_STATION_LIMITS[key],h=document.getElementById('monthlyRosterModalReqHint');if(r){r.min=rule?.min??0;r.max=rule?.max??99;r.value=Number(monthlyRosterRequirements()[key])||0}if(h)h.textContent=rosterRequirementHint(key)||'شامل الليدر'}
  document.getElementById('monthlyRosterModalMonth').textContent=monthLabel(monthlyRosterMonth).replace('إجازات ','');document.getElementById('monthlyRosterEmployeeSearch').value='';
  renderMonthlyRosterEmployeeOptions();document.getElementById('monthlyRosterModal').classList.add('show');
}
function toggleMonthlyRosterEmployee(id,checked){if(checked)editingMonthlyRosterSelection.add(id);else editingMonthlyRosterSelection.delete(id)}
function renderMonthlyRosterEmployeeOptions(){
  const box=document.getElementById('monthlyRosterEmployeeOptions');if(!box||!editingMonthlyRosterPost)return;const q=(document.getElementById('monthlyRosterEmployeeSearch').value||'').trim().toLowerCase();
  const employees=[...state.employees].filter(e=>!q||e.name.toLowerCase().includes(q)||String(e.empId).includes(q)).sort((a,b)=>a.name.localeCompare(b.name));
  box.innerHTML=employees.length?employees.map(e=>{const leave=rosterLeaveStatus(e.id),fixedPost=fixedRosterPost(e.id),fixedElsewhere=fixedPost&&editingMonthlyRosterPost!==fixedPost,fixedHere=fixedPost&&editingMonthlyRosterPost===fixedPost,disabled=leave.blocked||fixedElsewhere||fixedHere;if(leave.blocked||fixedElsewhere)editingMonthlyRosterSelection.delete(e.id);const note=leave.blocked?`في إجازة عند بداية الفترة: ${fmtDate(leave.blocked.start)} إلى ${fmtDate(leave.blocked.end)}`:fixedElsewhere?`ثابت في ${fixedPost.split('|')[1]}`:fixedHere?'ثابت في هذا الموقع':leave.upcoming?`تنبيه: تبدأ إجازته ${fmtDate(leave.upcoming.start)}`:`Badge #${esc(e.empId)}`;return `<label class="roster-check" style="${disabled?'opacity:.58':''}"><input type="checkbox" value="${esc(e.id)}" ${editingMonthlyRosterSelection.has(e.id)?'checked':''} ${disabled?'disabled':''} onchange="toggleMonthlyRosterEmployee('${esc(e.id)}',this.checked)"><span><strong>${esc(e.name)}</strong><small>${note}</small></span></label>`}).join(''):'<div class="empty">لا توجد نتائج</div>';
}
function saveMonthlyRosterAssignment(){
  if(!editingMonthlyRosterPost)return;if(editingMonthlyRosterPost===MARINE_PATROL_KEY){const bad=[...editingMonthlyRosterSelection].map(id=>state.employees.find(e=>e.id===id)).filter(e=>e&&!rosterMarineOk(e,monthlyRosterPeriod()));if(bad.length&&!confirm(`هذولا ما عندهم بطاقة Marine صالحة لين نهاية الفترة:\n${bad.map(e=>rosterEmployeeName(e)).join('\n')}\n\nتكمل؟`))return}const ids=[...editingMonthlyRosterSelection],data=monthlyRosterData(),blocked=ids.map(id=>({id,status:rosterLeaveStatus(id)})).filter(x=>x.status.blocked);if(blocked.length){alert('لا يمكن إضافة موظف موجود في إجازة عند بداية فترة الجدول');return}const upcoming=ids.map(id=>({employee:state.employees.find(e=>e.id===id),leave:rosterLeaveStatus(id).upcoming})).filter(x=>x.employee&&x.leave);if(upcoming.length&&!confirm('تنبيه: الموظفون التالية أسماؤهم تبدأ إجازاتهم أثناء فترة الجدول:\n'+upcoming.map(x=>`${x.employee.name} — ${fmtDate(x.leave.start)}`).join('\n')+'\n\nهل تريد إضافتهم؟'))return;
  if(ids.length)data[editingMonthlyRosterPost]=ids;else delete data[editingMonthlyRosterPost];closeModal('monthlyRosterModal');editingMonthlyRosterPost='';save();
}
function clearMonthlyRosterAssignment(){if(!editingMonthlyRosterPost)return;if(!confirm('تفريغ جميع الموظفين من هذا الموقع؟'))return;const data=monthlyRosterData(),fixed=Object.entries(FIXED_ROSTER_POSTS).filter(([id,key])=>key===editingMonthlyRosterPost&&!rosterLeaveStatus(id).blocked).map(([id])=>id);if(fixed.length)data[editingMonthlyRosterPost]=fixed;else delete data[editingMonthlyRosterPost];closeModal('monthlyRosterModal');editingMonthlyRosterPost='';save()}
function rosterPersonChip(employee,sourceKey,mode='saved'){
  const fixedPost=fixedRosterPost(employee.id),fixed=!!fixedPost&&fixedPost===sourceKey,status=rosterLeaveStatus(employee.id),assistantBackup=employee.id===ASSISTANT_BACKUP_ID&&sourceKey===ASSISTANT_POST_KEY&&rosterLeaveStatus(ASSISTANT_PRIMARY_ID).overlaps.length,sccBackup=SCC_BACKUP_IDS.includes(employee.id)&&sourceKey===SCC_POST_KEY&&SCC_PRIMARY_IDS.some(id=>rosterLeaveStatus(id).overlaps.length),communityBackup=employee.id===COMMUNITY_BACKUP_ID&&sourceKey===COMMUNITY_POST_KEY&&rosterLeaveStatus(COMMUNITY_PRIMARY_ID).overlaps.length,statusClass=status.upcoming?'roster-mid-leave':status.returning||assistantBackup||sccBackup||communityBackup?'roster-returning':'',details=[];if(fixed)details.push(`ثابت في ${fixedPost.split('|')[1]}`);if(status.upcoming)details.push(`تبدأ إجازته ${fmtDate(status.upcoming.start)}`);else if(status.returning)details.push(`متاح بعد العودة ${fmtDate(addDaysISO(status.returning.end,1))}`);if(assistantBackup)details.push('Assistant Backup أثناء إجازة الموظف الأساسي');if(sccBackup)details.push('SCC Backup أثناء إجازة أحد موظفي SCC');if(communityBackup)details.push('Community Supervisor Backup');const title=details.join(' — ')||'اسحب لتغيير الموقع';
  return `<span class="roster-person ${employee.dutyRole==='leader'?'roster-leader':''} ${statusClass} ${fixed?'roster-fixed':''}" title="${esc(title)}" ${fixed?'':'draggable="true"'} ondragstart="dragRosterEmployee(event,'${esc(employee.id)}','${esc(sourceKey)}','${mode}')" onclick="openRosterMoveMenu(event,'${esc(employee.id)}','${esc(sourceKey)}','${mode}')" role="button" tabindex="0">${rosterMarineMark(employee)}${esc(rosterEmployeeName(employee))}${mode==='saved'?tcChipTag(employee.id):''}</span>`;
}
function dragRosterEmployee(event,employeeId,sourceKey,mode){event.dataTransfer.setData('text/plain',JSON.stringify({employeeId,sourceKey,mode}));event.dataTransfer.effectAllowed='move'}
function allowRosterDrop(event){event.preventDefault();event.currentTarget.classList.add('drag-over')}
function dropRosterEmployee(event,targetKey,mode){
  event.preventDefault();document.querySelectorAll('.roster-drop.drag-over').forEach(x=>x.classList.remove('drag-over'));let payload;try{payload=JSON.parse(event.dataTransfer.getData('text/plain'))}catch{return}if(!payload||payload.mode!==mode||payload.sourceKey===targetKey)return;
  moveRosterEmployee(payload.employeeId,targetKey,mode);
}
/* ينقل الموظف لموقع (أو يشيله لو targetKey فاضي) — نفس قواعد السحب */
function moveRosterEmployee(employeeId,targetKey,mode){
  if(fixedRosterPost(employeeId)){const e=state.employees.find(x=>x.id===employeeId);alert(`${e?.name||'الموظف'} ثابت في ${fixedRosterPost(employeeId).split('|')[1]}`);return false}
  if(targetKey===MARINE_PATROL_KEY){const e=state.employees.find(x=>x.id===employeeId);if(e&&!rosterMarineOk(e,monthlyRosterPeriod())&&!confirm(`${rosterEmployeeName(e)} ما عنده بطاقة Marine صالحة لين نهاية الفترة، و ${MARINE_PATROL_KEY.split('|')[1]} تحتاج Marine. تكمل؟`))return false}
  const data=mode==='preview'?pendingAutoRoster?.result:monthlyRosterData();if(!data)return false;Object.keys(data).forEach(key=>data[key]=(data[key]||[]).filter(id=>id!==employeeId));if(targetKey){if(!data[targetKey])data[targetKey]=[];data[targetKey].push(employeeId)}
  if(mode==='preview')renderAutoRosterPreview();else save();
  return true;
}
/* ===== الضغط على اسم الموظف: قائمة المواقع ===== */
function closeRosterMoveMenu(){document.getElementById('rosterMoveMenu')?.remove();document.removeEventListener('mousedown',rosterMoveOutside,true);document.removeEventListener('keydown',rosterMoveEsc,true)}
function rosterMoveOutside(e){const m=document.getElementById('rosterMoveMenu');if(m&&!m.contains(e.target))closeRosterMoveMenu()}
function rosterMoveEsc(e){if(e.key==='Escape')closeRosterMoveMenu()}
function openRosterMoveMenu(event,employeeId,sourceKey,mode){
  event.stopPropagation();event.preventDefault();closeRosterMoveMenu();
  const emp=state.employees.find(e=>e.id===employeeId);if(!emp)return;
  if(sourceKey&&fixedRosterPost(employeeId)===sourceKey){alert(`${rosterEmployeeName(emp)} ثابت في ${sourceKey.split('|')[1]}`);return}
  const data=(mode==='preview'?pendingAutoRoster?.result:monthlyRosterData())||{};
  const groups=MONTHLY_ROSTER_GROUPS.map(g=>`<div class="rmm-g">${esc(g.name==='Monthly Schedule'?'القيادة والمهام':g.name)}</div>`+g.posts.map(post=>{const key=rosterPostKey(g.key,post),n=(data[key]||[]).length,cur=key===sourceKey;
    return `<button type="button" class="rmm-i ${cur?'cur':''}" ${cur?'disabled':''} onclick="pickRosterMove('${esc(employeeId)}','${esc(key)}','${mode}')"><span>${esc(post)}</span><small>${cur?'موقعه الحالي':n}</small></button>`}).join('')).join('');
  const inPost=Object.keys(data).some(k=>(data[k]||[]).includes(employeeId));
  const m=document.createElement('div');m.id='rosterMoveMenu';m.className='rmm';m.setAttribute('role','menu');
  m.innerHTML=`<div class="rmm-h"><b>${esc(rosterEmployeeName(emp))}</b><small>اختر الموقع الجديد</small><button type="button" class="rmm-x" aria-label="إغلاق" onclick="closeRosterMoveMenu()">✕</button></div>${rosterRoleRow(emp,employeeId,sourceKey,mode)}<div class="rmm-list">${groups}</div>${mode==='saved'?`<button type="button" class="rmm-tc" onclick="openTempCoverageForm('${esc(employeeId)}','${esc(sourceKey)}')">↪ تغطية مؤقتة (بدون تغيير الجدول)</button>`:''}${inPost?`<button type="button" class="rmm-rm" onclick="pickRosterMove('${esc(employeeId)}','','${mode}')">إزالة من الموقع</button>`:''}`;
  document.body.appendChild(m);
  if(window.innerWidth>700){const r=event.currentTarget.getBoundingClientRect(),w=m.offsetWidth,h=m.offsetHeight;let left=Math.min(Math.max(8,r.right-w),window.innerWidth-w-8),top=r.bottom+6;if(top+h>window.innerHeight-8)top=Math.max(8,r.top-h-6);m.style.left=left+'px';m.style.top=top+'px'}else m.classList.add('sheet');
  setTimeout(()=>{document.addEventListener('mousedown',rosterMoveOutside,true);document.addEventListener('keydown',rosterMoveEsc,true)},0);
  m.querySelector('.rmm-i.cur')?.scrollIntoView({block:'center'});
}
function rosterRoleRow(emp,employeeId,sourceKey,mode){
  const r=emp.dutyRole||'',other=r&&r!=='leader'&&r!=='officer'?`<small class="rmm-role-now">الحالية: ${esc(employeeDutyRoleLabel(r))}</small>`:'';
  return `<div class="rmm-role"><span>المهمة</span><div class="rmm-seg">${[['leader','ليدر'],['officer','فرد']].map(([k,l])=>`<button type="button" class="${r===k?'on':''}" ${r===k?'disabled':''} onclick="setRosterRole('${esc(employeeId)}','${k}','${esc(sourceKey)}','${mode}')">${l}</button>`).join('')}</div>${other}</div>`;
}
/* يغيّر مهمة الموظف في ملفه (دائم) — نفس صفحة الموظفين */
function setRosterRole(employeeId,role,sourceKey,mode){
  const e=state.employees.find(x=>x.id===employeeId);if(!e)return;
  e.dutyRole=role;closeRosterMoveMenu();
  if(mode==='preview')renderAutoRosterPreview();
  save();
}
function pickRosterMove(employeeId,targetKey,mode){closeRosterMoveMenu();moveRosterEmployee(employeeId,targetKey,mode)}
function seededRosterSort(employees,salt){return [...employees].sort((a,b)=>{const score=id=>{let h=2166136261;for(const c of (monthlyRosterMonth+'|'+salt+'|'+id)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0};return score(a.id)-score(b.id)})}
function isLeaderGate(group,post){return group.key==='stations'&&post.startsWith('STN#')&&!post.includes('X-Ray')}
function specialRoleForPost(post){return ({'Shift Chief (01)':'chief','Assistant Shift Chief (02)':'assistant','Community Supervisor (03)':'community','Shift Clerk':'clerk','SCC':'scc','Ind. Visitor':'visitor','Comm. Visitor':'commVisitor'})[post]||''}
function takeRosterEmployee(pools,preferred,used){for(const role of preferred){const found=pools[role].find(e=>!used.has(e.id));if(found){used.add(found.id);return found.id}}return null}
function fillRosterTargetsRoundRobin(targets,result,pools,preferredRoles,used){
  targets.forEach(t=>result[t.key]=result[t.key]||[]);let progress=true;
  while(progress){progress=false;for(const t of targets){if(result[t.key].length>=t.count)continue;const id=takeRosterEmployee(pools,preferredRoles,used);if(id){result[t.key].push(id);progress=true}}}
}
function buildAutoMonthlyRoster(){
  const requirements=monthlyRosterRequirements(),result={},used=new Set(),shortages=[],period=monthlyRosterPeriod(),generationSeed=`${Date.now()}|${Math.random()}`,blockedIds=new Set(state.employees.filter(e=>rosterLeaveStatus(e.id,period).blocked).map(e=>e.id));
  const roleNames=['chief','assistant','community','clerk','scc','visitor','commVisitor','leader','officer','patrol','flex'],pools={};roleNames.forEach(role=>pools[role]=seededRosterSort(state.employees.filter(e=>e.dutyRole===role&&!blockedIds.has(e.id)),`${role}|${generationSeed}`));
  const targets=[];MONTHLY_ROSTER_GROUPS.forEach(group=>group.posts.forEach(post=>{const key=rosterPostKey(group.key,post),count=Number(requirements[key])||0;if(count>0)targets.push({group,post,key,count})}));
  Object.entries(FIXED_ROSTER_POSTS).forEach(([employeeId,postKey])=>{const fixedTarget=targets.find(t=>t.key===postKey),fixedEmployee=state.employees.find(e=>e.id===employeeId);if(fixedTarget&&fixedEmployee){if(blockedIds.has(employeeId))shortages.push(`${fixedEmployee.name}: في إجازة عند بداية الفترة ولا يمكن توزيعه كموظف أساسي في ${fixedTarget.post}`);else{result[postKey]=result[postKey]||[];if(!result[postKey].includes(employeeId))result[postKey].push(employeeId);used.add(employeeId)}}});
  targets.filter(t=>specialRoleForPost(t.post)).forEach(t=>{
    const role=specialRoleForPost(t.post);result[t.key]=[];
    if(t.key===ASSISTANT_POST_KEY){const primary=state.employees.find(e=>e.id===ASSISTANT_PRIMARY_ID),backup=state.employees.find(e=>e.id===ASSISTANT_BACKUP_ID),primaryStatus=rosterLeaveStatus(ASSISTANT_PRIMARY_ID,period);if(primary&&!primaryStatus.blocked){result[t.key].push(primary.id);used.add(primary.id)}else if(backup&&rosterBackupAvailable(backup.id,period.start,period)){result[t.key].push(backup.id);used.add(backup.id);shortages.push(`${backup.name}: يغطي Assistant بدل ${primary?.name||'الموظف الأساسي'}`)}if(primaryStatus.upcoming&&backup&&rosterBackupAvailable(backup.id,primaryStatus.upcoming.start,period)&&!used.has(backup.id)){result[t.key].push(backup.id);used.add(backup.id);shortages.push(`${backup.name}: Assistant Backup من ${fmtDate(primaryStatus.upcoming.start)}`)}}
    if(t.key===COMMUNITY_POST_KEY){const primary=state.employees.find(e=>e.id===COMMUNITY_PRIMARY_ID),backup=state.employees.find(e=>e.id===COMMUNITY_BACKUP_ID),primaryStatus=rosterLeaveStatus(COMMUNITY_PRIMARY_ID,period);if(primary&&!primaryStatus.blocked){result[t.key].push(primary.id);used.add(primary.id)}else if(backup&&rosterBackupAvailable(backup.id,period.start,period)&&!used.has(backup.id)){result[t.key].push(backup.id);used.add(backup.id);shortages.push(`${backup.name}: Community Supervisor Backup`)}if(primaryStatus.upcoming&&backup&&rosterBackupAvailable(backup.id,primaryStatus.upcoming.start,period)&&!used.has(backup.id)){result[t.key].push(backup.id);used.add(backup.id);shortages.push(`${backup.name}: Community Supervisor Backup من ${fmtDate(primaryStatus.upcoming.start)}`)}}
    while(result[t.key].length<t.count){const id=takeRosterEmployee(pools,[role],used);if(!id)break;result[t.key].push(id)}
    if(t.key===SCC_POST_KEY){const blockedPrimary=SCC_PRIMARY_IDS.some(id=>rosterLeaveStatus(id,period).blocked),upcomingPrimary=SCC_PRIMARY_IDS.map(id=>rosterLeaveStatus(id,period).upcoming).filter(Boolean).sort((a,b)=>a.start.localeCompare(b.start))[0],coverageStart=blockedPrimary?period.start:(upcomingPrimary?.start||period.start),needsBackup=result[t.key].length<t.count||blockedPrimary||upcomingPrimary,backup=SCC_BACKUP_IDS.map(id=>state.employees.find(e=>e.id===id)).find(e=>e&&!used.has(e.id)&&rosterBackupAvailable(e.id,coverageStart,period));if(backup&&needsBackup){result[t.key].push(backup.id);used.add(backup.id);shortages.push(`${backup.name}: SCC Backup${upcomingPrimary?` من ${fmtDate(upcomingPrimary.start)}`:''}`)}}
    if(result[t.key].length<t.count)shortages.push(`${t.post}: ناقص ${t.count-result[t.key].length} من مهمة ${employeeDutyRoleLabel(role)}`)
  });
  targets.filter(t=>isLeaderGate(t.group,t.post)).forEach(t=>{result[t.key]=result[t.key]||[];const hasLeader=result[t.key].some(id=>state.employees.find(e=>e.id===id)?.dutyRole==='leader');if(!hasLeader&&result[t.key].length<t.count){const id=takeRosterEmployee(pools,['leader'],used);if(id)result[t.key].unshift(id);else shortages.push(`${t.post}: لا يوجد ليدر متاح`)}else if(!hasLeader)shortages.push(`${t.post}: العدد المحدد لا يتسع لليدر مع الموظف الثابت`)});
  /* Patrol# (09): ما يغطيها إلا اللي عنده Marine صالحة لين نهاية الفترة — تتوزع أول عشان ما تروح بطاقات Marine لدوريات ثانية */
  const marineTarget=targets.find(t=>t.key===MARINE_PATROL_KEY);
  if(marineTarget){result[marineTarget.key]=result[marineTarget.key]||[];
    result[marineTarget.key].forEach(id=>{const e=state.employees.find(x=>x.id===id);if(e&&!rosterMarineOk(e,period))shortages.push(`${e.name}: في ${marineTarget.post} وبطاقة Marine غير صالحة لين نهاية الفترة`)});
    for(const role of ['patrol','flex']){while(result[marineTarget.key].length<marineTarget.count){const e=pools[role].find(x=>!used.has(x.id)&&rosterMarineOk(x,period));if(!e)break;used.add(e.id);result[marineTarget.key].push(e.id)}}
    if(result[marineTarget.key].length<marineTarget.count)shortages.push(`${marineTarget.post}: ما لقيت أحد متاح عنده بطاقة Marine صالحة (ناقص ${marineTarget.count-result[marineTarget.key].length})`);
  }
  const patrolTargets=targets.filter(t=>t.group.key==='patrol'&&t.key!==MARINE_PATROL_KEY);fillRosterTargetsRoundRobin(patrolTargets,result,pools,['patrol','flex'],used);patrolTargets.forEach(t=>{if(result[t.key].length<t.count)shortages.push(`${t.post}: ناقص ${t.count-result[t.key].length}`)});
  const stationTargets=targets.filter(t=>t.group.key!=='patrol'&&!specialRoleForPost(t.post));fillRosterTargetsRoundRobin(stationTargets,result,pools,['officer','flex','leader','patrol'],used);stationTargets.forEach(t=>{if(result[t.key].length<t.count)shortages.push(`${t.post}: ناقص ${t.count-result[t.key].length}`)});
  const leaveWarnings=[...used].map(id=>{const e=state.employees.find(x=>x.id===id),leave=rosterLeaveStatus(id,period).upcoming;return leave?`${e.name}: تبدأ إجازته ${fmtDate(leave.start)} أثناء فترة الجدول`:''}).filter(Boolean);
  return {result,shortages,leaveWarnings,used,required:targets.reduce((s,t)=>s+t.count,0),unclassified:state.employees.filter(e=>!e.dutyRole).length};
}
function previewAutoMonthlyRoster(){
  const start=document.getElementById('monthlyRosterStart').value,end=document.getElementById('monthlyRosterEnd').value;if(!start||!end||end<start){alert('حدد فترة صحيحة من وإلى أولًا');return}state.monthlySchedulePeriods[monthlyRosterMonth]={start,end};
  const requirements=monthlyRosterRequirements(),total=Object.values(requirements).reduce((s,n)=>s+(Number(n)||0),0);if(!total){alert('حدد العدد المطلوب للمواقع أولًا');return}
  pendingAutoRoster=buildAutoMonthlyRoster();renderAutoRosterPreview();document.getElementById('autoRosterPreviewModal').classList.add('show');
}
function renderAutoRosterPreview(){
  if(!pendingAutoRoster)return;const status=document.getElementById('autoRosterPreviewStatus'),box=document.getElementById('autoRosterPreviewTable');
  const warnings=[...pendingAutoRoster.shortages,...pendingAutoRoster.leaveWarnings];if(pendingAutoRoster.unclassified)warnings.push(`${pendingAutoRoster.unclassified} موظف لم تُحدد مهمته`);
  status.innerHTML=`<div class="auto-preview-alert ${warnings.length?'':'ok'}">${warnings.length?'<strong>تنبيهات قبل الاعتماد:</strong><br>'+warnings.map(esc).join('<br>'):`✓ تم توزيع ${pendingAutoRoster.used.size} موظف لتغطية ${pendingAutoRoster.required} خانة بدون تكرار.`}</div>`;
  let html='<div class="monthly-roster-wrap"><table class="monthly-roster-table"><thead><tr><th>الموقع</th><th>العدد</th><th>التوزيع المقترح</th></tr></thead><tbody>';
  MONTHLY_ROSTER_GROUPS.forEach(group=>group.posts.forEach(post=>{const key=rosterPostKey(group.key,post),ids=pendingAutoRoster.result[key];if(!ids)return;const people=ids.map(id=>state.employees.find(e=>e.id===id)).filter(Boolean);html+=`<tr><td class="roster-post">${esc(post)}</td><td>${Number(monthlyRosterRequirements()[key])||0}</td><td><div class="roster-people roster-drop" ondragover="allowRosterDrop(event)" ondrop="dropRosterEmployee(event,'${esc(key)}','preview')">${people.map(e=>rosterPersonChip(e,key,'preview')).join(' ')||'<span class="roster-empty">لم تتم التغطية</span>'}</div></td></tr>`}));
  html+=rosterLeaveSectionRows(3);
  box.innerHTML=html+'</tbody></table></div>';document.getElementById('confirmAutoRosterBtn').disabled=!Object.keys(pendingAutoRoster.result).length;
}
function confirmAutoMonthlyRoster(){if(!pendingAutoRoster)return;state.monthlySchedules[monthlyRosterMonth]=pendingAutoRoster.result;pendingAutoRoster=null;closeModal('autoRosterPreviewModal');save();alert('تم اعتماد وحفظ التوزيع الشهري')}
/* تصدير الجدول الشهري Excel بنفس شكل ملف Monthly Schedule: المهمة | الأسماء، الليدر بالأحمر، والمجازين بالأحمر تحت */
function exportMonthlyRosterExcel(){
  const data=monthlyRosterData(),E=(v,s)=>({v,s}),rows=[],merges=[];
  const nameOf=e=>{const f=rosterEmployeeName(e)||e.name;return typeof lpShortName==='function'?lpShortName(f):f};
  const people=key=>(Array.isArray(data[key])?data[key]:[]).map(id=>state.employees.find(e=>e.id===id)).filter(Boolean);
  const band=(text,style,h=24)=>{rows.push({height:h,cells:[E(text,style),E('',style)]});merges.push(`A${rows.length}:B${rows.length}`)};
  const runsFor=list=>{const leaders=list.filter(e=>e.dutyRole==='leader'),rest=list.filter(e=>e.dutyRole!=='leader'),out=[];
    [...leaders,...rest].forEach((e,i)=>{if(i)out.push({t:' - ',color:'000000'});out.push({t:nameOf(e),color:e.dutyRole==='leader'?'C00000':'000000'})});return out};
  band('Monthly Schedule','rsTitle',32);
  rows.push({height:8,cells:[]});
  const groups=Object.fromEntries(MONTHLY_ROSTER_GROUPS.map(g=>[g.key,g]));
  groups.leadership.posts.forEach(post=>{const list=people(rosterPostKey('leadership',post));if(!list.length)return;rows.push({height:24,cells:[E(post,'rsPost'),{runs:runsFor(list.map(e=>({...e,dutyRole:''}))),s:'rsNames'}]})});
  band('Stations','rsBand');
  groups.stations.posts.forEach(post=>{const list=people(rosterPostKey('stations',post));rows.push({height:24,cells:[E(post.replace('STN#','STN#'),'rsPost'),list.length?{runs:runsFor(list),s:'rsNames'}:E('','rsNames')]})});
  band('','rsGap',18);
  groups.patrol.posts.forEach(post=>{const list=people(rosterPostKey('patrol',post));rows.push({height:24,cells:[E(post.replace('Patrol#','Patrol #'),'rsPost'),list.length?{runs:runsFor(list.map(e=>({...e,dutyRole:''}))),s:'rsNames'}:E('','rsNames')]})});
  band('','rsDark',18);
  const onLeave=rosterEmployeesOnLeave().map(x=>nameOf(x.employee));
  rows.push({height:28,cells:[E(onLeave.join('    '),'rsLeave'),E('','rsLeave')]});merges.push(`A${rows.length}:B${rows.length}`);
  const sheet={name:'Monthly Schedule',ltr:true,portrait:true,onePage:true,cols:[34,86],merges,rows};
  lpxDownload(lpxWorkbook([sheet]),`Monthly-Schedule-${monthlyRosterMonth}.xlsx`);
}
function printMonthlyRoster(){
  const period=monthlyRosterPeriod(),win=window.open('','_blank');if(!win){alert('اسمح بالنوافذ المنبثقة للطباعة');return}
  win.document.write(`<!doctype html><html dir="ltr"><head><meta charset="utf-8"><title>${esc('الجدول الشهري · '+monthLabel(monthlyRosterMonth).replace('إجازات ',''))}</title><style>*{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}html,body{margin:0;padding:0}body{font-family:Arial,sans-serif;color:#172033;font-size:7.5px}h1{text-align:center;font-size:15px;line-height:1;margin:0 0 2px}.period{text-align:center;color:#64748b;font-size:7.5px;line-height:1;margin-bottom:4px}.monthly-roster-wrap{overflow:visible!important}table{width:100%;border-collapse:collapse;direction:ltr;table-layout:fixed}th,td{border:1px solid #aeb8c5;padding:2px 3px;text-align:left;font-size:7.2px;line-height:1.05;vertical-align:middle}th:nth-child(1),td:nth-child(1){width:18%}th:nth-child(2),td:nth-child(2){width:7%}.roster-group td{background:#167590;color:#fff;font-weight:bold;text-align:center;padding:2px}.roster-group.patrol td{background:#c45d1b}.roster-group.leave td{background:#be123c}.roster-people{display:flex;align-items:center;gap:2px;flex-wrap:wrap}.roster-person{display:inline-block;margin:0 1px;padding:1px 3px;border-radius:3px;font-size:6.8px;line-height:1.05;white-space:nowrap}.roster-leader{color:#b4232f;font-weight:bold}.roster-mid-leave{background:#fff4bf!important;color:#765500!important;border:1px solid #e9c94f}.roster-returning{background:#dcfce7!important;color:#166534!important;border:1px solid #86d79f}.roster-leave-person{color:#9f1239;font-weight:bold}.small-note{font-size:6px}.no-print,.roster-edit,button{display:none!important}input{border:0;background:transparent;width:28px;font-size:7px}.roster-fixed{box-shadow:none}tr{break-inside:avoid;page-break-inside:avoid}@page{size:A4 landscape;margin:4mm}@media print{body{width:100%;overflow:hidden}}</style></head><body><h1>${esc('الجدول الشهري · '+monthLabel(monthlyRosterMonth).replace('إجازات ',''))}</h1><div class="period">From ${fmtDate(period.start)} To ${fmtDate(period.end)}</div>${rosterPrintTableHtml()}</body></html>`);win.document.close();win.focus();setTimeout(()=>win.print(),250);
}


/* ===== منتقي تاريخ ملوّن بالشفت (ليل/مساء/صباح/راحة) لفترة الجدول الشهري ===== */
const SDP_COLORS={N:'#efd45b',A:'#e993aa',M:'#d68ce4',OFF:'#e3e7ee'},SDP_WORD={N:'ليل',A:'مساء',M:'صباح',OFF:'راحة'};
let sdpInput=null,sdpMonth='';
function openShiftDatePicker(input){
  sdpInput=input;const v=input.value||todayISO();sdpMonth=v.slice(0,7);
  let box=document.getElementById('shiftDatePicker');
  if(!box){box=document.createElement('div');box.id='shiftDatePicker';box.className='sdp';document.body.appendChild(box);
    document.addEventListener('mousedown',e=>{const b=document.getElementById('shiftDatePicker');if(b&&b.classList.contains('open')&&!b.contains(e.target)&&e.target!==sdpInput)b.classList.remove('open')});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')document.getElementById('shiftDatePicker')?.classList.remove('open')})}
  renderShiftDatePicker();box.classList.add('open');
  const r=input.getBoundingClientRect(),w=Math.min(330,window.innerWidth-16);
  box.style.width=w+'px';box.style.top=(window.scrollY+r.bottom+6)+'px';
  box.style.left=Math.max(8,Math.min(window.scrollX+r.right-w,window.scrollX+window.innerWidth-w-8))+'px';
}
function sdpShift(delta){const [y,m]=sdpMonth.split('-').map(Number),d=new Date(y,m-1+delta,1);sdpMonth=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;renderShiftDatePicker()}
function renderShiftDatePicker(){
  const box=document.getElementById('shiftDatePicker');if(!box)return;
  const [y,m]=sdpMonth.split('-').map(Number),first=`${sdpMonth}-01`,startDow=new Date(y,m-1,1).getDay(),days=new Date(y,m,0).getDate();
  const ps=document.getElementById('monthlyRosterStart')?.value||'',pe=document.getElementById('monthlyRosterEnd')?.value||'',today=todayISO();
  const months=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  let cells='';for(let i=0;i<startDow;i++)cells+='<span></span>';
  for(let d=1;d<=days;d++){
    const iso=`${sdpMonth}-${String(d).padStart(2,'0')}`,sh=groupShiftForDate(iso),code=SDP_COLORS[sh.code]?sh.code:'OFF';
    const prev=groupShiftForDate(addDaysISO(iso,-1)).code,blockStart=code!=='OFF'&&prev!==sh.code;
    const sel=iso===sdpInput?.value,inRange=ps&&pe&&iso>=ps&&iso<=pe;
    cells+=`<button type="button" class="sdp-d ${sel?'sel':''} ${inRange?'rng':''} ${iso===today?'today':''} ${blockStart?'bs':''}" style="--c:${SDP_COLORS[code]}" title="${SDP_WORD[code]}${blockStart?' · بداية الشفت':''}" onclick="pickShiftDate('${iso}')"><b>${d}</b><small>${code==='OFF'?'':code}</small></button>`;
  }
  box.innerHTML=`<div class="sdp-head"><button type="button" onclick="sdpShift(-1)" aria-label="الشهر السابق">›</button><b>${months[m-1]} ${y}</b><button type="button" onclick="sdpShift(1)" aria-label="الشهر التالي">‹</button></div>
    <div class="sdp-dow"><span>ح</span><span>ن</span><span>ث</span><span>ر</span><span>خ</span><span>ج</span><span>س</span></div>
    <div class="sdp-grid">${cells}</div>
    <div class="sdp-leg">${['N','A','M','OFF'].map(k=>`<span><i style="background:${SDP_COLORS[k]}"></i>${SDP_WORD[k]}</span>`).join('')}<span><i class="bsi"></i>بداية شفت</span></div>
    <div class="sdp-foot"><button type="button" onclick="pickShiftDate(todayISO())">اليوم</button><button type="button" onclick="document.getElementById('shiftDatePicker').classList.remove('open')">إغلاق</button></div>`;
}
function pickShiftDate(iso){
  if(!sdpInput)return;sdpInput.value=iso;sdpInput.dispatchEvent(new Event('change',{bubbles:true}));
  document.getElementById('shiftDatePicker')?.classList.remove('open');
}

/* ===== التغطيات خارج الجدول (مؤقتة) ===== */
let tcEditId=null;
function tcPosts(){return MONTHLY_ROSTER_GROUPS.filter(g=>g.key!=='leadership').flatMap(g=>g.posts.map(p=>({group:g.name,post:p})))}
function tcPostOptions(sel){return MONTHLY_ROSTER_GROUPS.filter(g=>g.key!=='leadership').map(g=>`<optgroup label="${esc(g.name)}">${g.posts.map(p=>`<option value="${esc(p)}" ${p===sel?'selected':''}>${esc(p)}</option>`).join('')}</optgroup>`).join('')}
function tcDaysTxt(n){return n===1?"يوم واحد":n===2?"يومين":`${n} ${n>=3&&n<=10?"أيام":"يوم"}`}
function tcEmpName(id){const e=state.employees.find(x=>x.id===id);return e?(e.nameAr||e.name):'—'}
function tcValidate(loc,start,end){if(!loc)return 'اختر الموقع';if(!start||!end)return 'حدد التاريخين';if(end<start)return 'تاريخ النهاية قبل البداية';if(diffDays(end,start)>60)return 'المدة أطول من 60 يوم — هذي مو تغطية مؤقتة';return ''}
function tcOverlap(employeeId,start,end,skipId){return (state.tempCoverage||[]).find(t=>t.id!==skipId&&t.employeeId===employeeId&&!(t.end<start||t.start>end))}
/* من قائمة الاسم في جدول الشفت */
function openTempCoverageForm(employeeId,sourceKey){
  const m=document.getElementById('rosterMoveMenu');if(!m)return;const today=todayISO();
  const list=m.querySelector('.rmm-list'),rm=m.querySelector('.rmm-rm'),role=m.querySelector('.rmm-role');rm&&rm.remove();role&&role.remove();
  m.querySelector('.rmm-h small').textContent='تغطية مؤقتة — الجدول ما يتغير';
  list.outerHTML=`<div class="tc-form"><label>يغطي في<select id="tcLoc"><option value="">اختر…</option>${tcPostOptions('')}</select></label>
    <div class="tc-dates"><label>من<input type="date" id="tcStart" value="${today}"></label><label>إلى<input type="date" id="tcEnd" value="${today}"></label></div>
    <div class="tc-err" id="tcErr"></div>
    <div class="tc-act"><button type="button" class="secondary" onclick="closeRosterMoveMenu()">إلغاء</button><button type="button" onclick="saveTempCoverage('${esc(employeeId)}','${esc(sourceKey)}')">حفظ التغطية</button></div></div>`;
}
function saveTempCoverage(employeeId,sourceKey){
  const loc=document.getElementById('tcLoc').value,start=document.getElementById('tcStart').value,end=document.getElementById('tcEnd').value,err=tcValidate(loc,start,end);
  if(err){document.getElementById('tcErr').textContent=err;return}
  if(sourceKey&&sourceKey.split('|').slice(1).join('|')===loc){document.getElementById('tcErr').textContent='هذا موقعه الأصلي في الجدول';return}
  const o=tcOverlap(employeeId,start,end);if(o&&!confirm(`عنده تغطية ثانية في نفس الفترة (${o.loc}: ${fmtDate(o.start)} – ${fmtDate(o.end)}). تكمل؟`))return;
  state.tempCoverage.push({id:'tc_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),employeeId,loc,start,end,from:sourceKey?sourceKey.split('|').slice(1).join('|'):'',createdAt:new Date().toISOString()});
  closeRosterMoveMenu();save();
}
/* علامة جنب الاسم في الجدول: تغطيات داخل فترة الجدول المعروض */
function tcChipTag(employeeId){
  const p=monthlyRosterPeriod();
  const list=(state.tempCoverage||[]).filter(t=>t.employeeId===employeeId&&!(t.end<p.start||t.start>p.end)).sort((a,b)=>a.start.localeCompare(b.start));
  return list.map(t=>`<span class="tc-tag" title="تغطية مؤقتة: ${esc(t.loc)} من ${fmtDate(t.start)} إلى ${fmtDate(t.end)}">↪ ${esc(t.loc)} ${t.start===t.end?fmtDayShort(t.start):`${fmtDayShort(t.start)}–${fmtDayShort(t.end)}`}</span>`).join('');
}
function fmtDayShort(d){const [y,m,dd]=d.split('-').map(Number);return `${dd}/${m}`}
let tcOpenKey='';
function renderTempCoverageLog(year){
  const box=document.getElementById('tempCoverageLog');if(!box)return;
  const ys=`${year}-01-01`,ye=`${year}-12-31`,list=(state.tempCoverage||[]).filter(t=>!(t.end<ys||t.start>ye));
  const daysIn=t=>diffDays(t.end>ye?ye:t.end,t.start<ys?ys:t.start)+1;
  const total=list.reduce((s,t)=>s+daysIn(t),0);
  document.getElementById('tempCoverageKicker').textContent=list.length?`المجموع ${tcDaysTxt(total)} · اضغط على الاسم للتفاصيل`:'تتسجل من قائمة الاسم في جدول الشفت';
  const by={};list.forEach(t=>{(by[t.loc]=by[t.loc]||{});const x=(by[t.loc][t.employeeId]=by[t.loc][t.employeeId]||{days:0,items:[]});x.days+=daysIn(t);x.items.push(t)});
  const order=l=>(/^STN/i.test(l)?0:1);
  const locs=Object.keys(by).sort((a,b)=>order(a)-order(b)||a.localeCompare(b,undefined,{numeric:true}));
  box.innerHTML=locs.length?locs.map(loc=>{
    const rows=Object.entries(by[loc]).sort((a,b)=>b[1].days-a[1].days).map(([id,x])=>{const key=loc+'|'+id,open=tcOpenKey===key;
      const items=open?`<div class="tc-items">${x.items.sort((a,b)=>a.start.localeCompare(b.start)).map(t=>tcEditId===t.id
        ?`<div class="tc-item edit"><select id="tceLoc">${tcPostOptions(t.loc)}</select><input type="date" id="tceStart" value="${esc(t.start)}"><input type="date" id="tceEnd" value="${esc(t.end)}"><span class="tc-err" id="tceErr"></span><span class="tc-btns"><button type="button" onclick="saveTempCoverageEdit('${esc(t.id)}')">حفظ</button><button type="button" class="secondary" onclick="tcEditId=null;renderGateCoverage()">إلغاء</button></span></div>`
        :`<div class="tc-item"><span>${fmtDate(t.start)}${t.end!==t.start?' – '+fmtDate(t.end):''} · ${tcDaysTxt(diffDays(t.end,t.start)+1)}${t.from?`<small> · أصلاً في ${esc(t.from)}</small>`:''}</span><span class="tc-btns"><button type="button" class="secondary" onclick="tcEditId='${esc(t.id)}';renderGateCoverage()">تعديل</button><button type="button" class="secondary danger" onclick="deleteTempCoverage('${esc(t.id)}')">حذف</button></span></div>`).join('')}</div>`:'';
      return `<div class="coverage-row tc-cov ${open?'open':''}"><button type="button" class="cov-name tc-name" onclick="tcOpenKey=tcOpenKey==='${esc(key)}'?'':'${esc(key)}';tcEditId=null;renderGateCoverage()">${esc(tcEmpName(id))} <span class="tc-chev">${open?'▴':'▾'}</span></button><span class="cov-count">${tcDaysTxt(x.days)}</span></div>${items}`}).join('');
    return `<div class="coverage-card"><h4>${esc(loc)}</h4>${rows}</div>`}).join(''):'<div class="empty">ما فيه تغطيات خارج الجدول في هذي السنة. سجّلها من جدول الشفت: اضغط على اسم الموظف ← «تغطية مؤقتة».</div>';
}
function saveTempCoverageEdit(id){
  const t=(state.tempCoverage||[]).find(x=>x.id===id);if(!t)return;
  const loc=document.getElementById('tceLoc').value,start=document.getElementById('tceStart').value,end=document.getElementById('tceEnd').value,err=tcValidate(loc,start,end);
  if(err){document.getElementById('tceErr').textContent=err;return}
  Object.assign(t,{loc,start,end,updatedAt:new Date().toISOString()});tcEditId=null;if(save()!==false)renderGateCoverage();
}
function deleteTempCoverage(id){
  const t=(state.tempCoverage||[]).find(x=>x.id===id);if(!t)return;
  if(!confirm(`حذف تغطية ${tcEmpName(t.employeeId)} في ${t.loc} (${fmtDate(t.start)} – ${fmtDate(t.end)})؟`))return;
  state.tempCoverage=state.tempCoverage.filter(x=>x.id!==id);if(save()!==false)renderGateCoverage();
}

/* علامة بطاقة Marine جنب الاسم: أخضر صالحة · برتقالي تنتهي خلال 30 يوم · أحمر منتهية */
function rosterMarineMark(employee){
  const st=marineStatus(employee);if(st.kind==='missing')return '';
  return `<span class="mrn-mark ${st.kind}" title="بطاقة Marine: ${esc(st.label)} · ${fmtDate(marineExpiryFor(employee))}">⚓</span>`;
}

const MARINE_PATROL_KEY='patrol|Patrol# (09)';
function rosterMarineOk(employee,period){const exp=marineExpiryFor(employee);return !!exp&&exp>=(period?.end||todayISO())}

/* الليدر دايم أول في العرض (ترتيب الحفظ ما يتغير) */
function rosterLeadersFirst(list){return [...list.filter(e=>e.dutyRole==='leader'),...list.filter(e=>e.dutyRole!=='leader')]}

/* عنوان صفحة الشفت = تواريخ الفترة، وتحته اسم الجدول */
function svUpdateTitle(){const title=document.getElementById('monthlyRosterTitle');if(!title)return;const p=monthlyRosterPeriod(),f=d=>new Date(d+'T12:00:00').toLocaleDateString('ar-SA-u-ca-gregory-nu-latn',{day:'numeric',month:'long'}),k=document.getElementById('svKicker');
  title.textContent=`${f(p.start)} – ${f(p.end)}`;title.title=`${p.start} → ${p.end}`;if(k)k.textContent='جدول '+monthLabel(monthlyRosterMonth).replace('إجازات ','')}
