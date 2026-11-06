// ==================== الداشبورد ولوحة المؤشرات ====================
function employeeStatus(emp){
  const t=todayISO();
  const active=state.leaves.find(l=>l.employeeId===emp.id && l.start<=t && l.end>=t);
  return active ? {text:'إجازة',cls:'b-blue'}:{text:'دوام',cls:'b-green'};
}

function renderStats(){
  const t=todayISO();
  document.getElementById('totalCount').textContent=state.employees.length;
  const inLeave=state.employees.filter(e=>employeeStatus(e).text==='إجازة').length;
  document.getElementById('leaveCount').textContent=inLeave;
  document.getElementById('workingCount').textContent=state.employees.length-inLeave;
  let soon=0;
  state.leaves.forEach(l=>{
    const ds=diffDays(l.start,t), de=diffDays(l.end,t);
    if((ds>=0&&ds<=SOON_DAYS)||(de>=0&&de<=SOON_DAYS)) soon++;
  });
  soon+=state.personalNotes.filter(n=>{
    const d=diffDays(n.date,t);
    return d>=0&&d<=SOON_DAYS;
  }).length;
  document.getElementById('soonCount').textContent=soon;
}
function renderInsightsDashboard(){
  const box=document.getElementById('insightsDashboardBox');if(!box)return;
  const total=state.employees.length;
  const inLeave=state.employees.filter(e=>employeeStatus(e).text==='إجازة').length;
  const working=total-inLeave,workingPct=total?Math.round(working/total*100):0;
  const overTen=state.employees.filter(e=>(Number(e.leaveBalance)||0)>9),overTenPct=total?Math.round(overTen.length/total*100):0;
  const expiredCards=state.employees.filter(e=>marineStatus(e).kind==='expired'),expiredPct=total?Math.round(expiredCards.length/total*100):0;
  const today=todayISO(),year=today.slice(0,4),yearStart=year+'-01-01',yearEnd=year+'-12-31';
  const yearLeaves=state.leaves.filter(l=>l.start<=yearEnd&&l.end>=yearStart);
  const takenLeaves=yearLeaves.filter(l=>l.start<=today);
  const completionPct=yearLeaves.length?Math.round(takenLeaves.length/yearLeaves.length*100):0;
  box.innerHTML=`
    <div class="metric-card success"><div class="insight-donut" style="--pct:${workingPct};--color:#2dd4a3"><strong>${workingPct}%</strong></div><div class="insight-copy"><h3>على رأس العمل</h3><p>الموظفون الحاضرون اليوم من إجمالي القوة</p><b>${working} من ${total} موظف</b></div></div>
    <div class="metric-card warning"><div class="insight-donut" style="--pct:${overTenPct};--color:#f59e0b"><strong>${overTenPct}%</strong></div><div class="insight-copy"><h3>رصيد فوق 10 أيام</h3><p>موظفون رصيد إجازتهم يتجاوز 10 أيام</p><b>${overTen.length} من ${total} موظف</b></div></div>
    <div class="metric-card danger"><div class="insight-donut" style="--pct:${expiredPct};--color:#ef4444"><strong>${expiredPct}%</strong></div><div class="insight-copy"><h3>بطاقات منتهية</h3><p>بطاقات Marine ID منتهية الصلاحية حاليًا</p><b>${expiredCards.length} من ${total} موظف</b></div></div>
    <div class="metric-card info"><div class="insight-donut" style="--pct:${completionPct};--color:#315fe7"><strong>${completionPct}%</strong></div><div class="insight-copy"><h3>نسبة الإنجاز بالإجازات السنوية</h3><p>الإجازات التي بدأ الموظفون فيها من إجمالي الإجازات المدخلة</p><b>${takenLeaves.length} من ${yearLeaves.length} إجازة</b></div></div>`;
}

function renderLeaveBalanceInsights(){
  const box=document.getElementById('leaveBalanceInsights');if(!box)return;
  const today=todayISO(),year=today.slice(0,4),yearStart=year+'-01-01',yearEnd=year+'-12-31',total=state.employees.length;
  const yearLeaves=state.leaves.filter(l=>l.start<=yearEnd&&l.end>=yearStart);
  const takenLeaves=yearLeaves.filter(l=>l.start<=today);
  const needs=state.employees.filter(e=>(Number(e.leaveBalance)||0)>9).sort((a,b)=>Number(b.leaveBalance)-Number(a.leaveBalance));
  const excessDays=needs.reduce((sum,e)=>sum+Math.max(0,(Number(e.leaveBalance)||0)-9),0);
  const completionPct=yearLeaves.length?Math.round(takenLeaves.length/yearLeaves.length*100):0,needsPct=total?Math.round(needs.length/total*100):0;
  document.getElementById('leaveInsightsYear').textContent=year;
  const names=needs.slice(0,6).map(e=>`<div class="liquidation-person"><div><div class="name">${esc(e.name)}</div><div class="meta">#${esc(e.empId)} · الرصيد ${formatDays(e.leaveBalance)} يوم</div></div><span class="liquidation-excess">تصفية ${formatDays(Number(e.leaveBalance)-9)} يوم</span></div>`).join('');
  box.innerHTML=`
    <div class="insight-chart-card"><div class="insight-donut" style="--pct:${needsPct};--color:#f59e0b"><strong>${needsPct}%</strong></div><div class="insight-copy"><h3>موظفون يحتاجون تصفية</h3><p>رصيدهم الحالي يتجاوز الحد المسموح ترحيله وهو 9 أيام</p><b>${needs.length} موظف · ${formatDays(excessDays)} يوم للتصفية</b></div></div>
    <div class="insight-chart-card"><div class="insight-copy" style="width:100%"><h3>الإجازات المدخلة والمأخوذة</h3><p>مقارنة إجازات عام ${year} مع التي بدأ الموظفون فيها فعليًا</p><div class="insight-compare"><span><strong>${yearLeaves.length}</strong><small>إجازة مدخلة</small></span><i>←</i><span><strong>${takenLeaves.length}</strong><small>إجازة مأخوذة</small></span></div></div></div>
    <div class="insight-chart-card"><div class="insight-donut" style="--pct:${completionPct};--color:#16a085"><strong>${completionPct}%</strong></div><div class="insight-copy"><h3>نسبة الإنجاز</h3><p>الإجازات التي بدأ الموظفون فيها من إجمالي الإجازات المدخلة</p><b>${takenLeaves.length} من ${yearLeaves.length} إجازة</b></div></div>
    <div class="liquidation-list"><h3>أعلى الأرصدة المطلوب تصفيتها</h3>${names||'<div class="empty">جميع الأرصدة ضمن حد الترحيل 👌</div>'}${needs.length>6?`<div class="small-note" style="margin-top:8px">و${needs.length-6} موظفين آخرين — التفاصيل الكاملة في تقرير الأرصدة</div>`:''}</div>`;
}

function exportLeaveInsightsPDF(){
  const today=todayISO(),year=today.slice(0,4),yearStart=year+'-01-01',yearEnd=year+'-12-31',total=state.employees.length;
  const yearLeaves=state.leaves.filter(l=>l.start<=yearEnd&&l.end>=yearStart);
  const takenLeaves=yearLeaves.filter(l=>l.start<=today);
  const needs=state.employees.filter(e=>(Number(e.leaveBalance)||0)>9).sort((a,b)=>Number(b.leaveBalance)-Number(a.leaveBalance));
  const excessDays=needs.reduce((sum,e)=>sum+Math.max(0,(Number(e.leaveBalance)||0)-9),0);
  const completionPct=yearLeaves.length?Math.round(takenLeaves.length/yearLeaves.length*100):0,needsPct=total?Math.round(needs.length/total*100):0;
  const rows=needs.map((e,i)=>`<tr><td>${i+1}</td><td>${esc(e.name)}</td><td>${esc(e.empId)}</td><td>${formatDays(e.leaveBalance)} يوم</td><td>${formatDays(Number(e.leaveBalance)-9)} يوم</td></tr>`).join('');
  const win=window.open('','_blank');if(!win){alert('اسمح بالنوافذ المنبثقة لتصدير PDF');return}
  win.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>Leave Balance Indicators ${year}</title><style>
    *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}body{font-family:Arial,Tahoma,sans-serif;margin:0;padding:28px;color:#172033;background:#fff}header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #315fe7;padding-bottom:14px;margin-bottom:20px}h1{font-size:23px;margin:0 0 5px}.sub{font-size:11px;color:#64748b}.charts{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px}.card{border:1px solid #d8e0ea;border-radius:16px;padding:15px;display:flex;align-items:center;gap:14px}.donut{--pct:0;--color:#315fe7;width:88px;height:88px;flex:0 0 auto;border-radius:50%;display:grid;place-items:center;background:conic-gradient(var(--color) calc(var(--pct)*1%),#e2e8f0 0);position:relative}.donut:before{content:"";position:absolute;inset:11px;border-radius:50%;background:#fff}.donut b{position:relative;font-size:19px}.card h2{font-size:15px;margin:0 0 7px}.card p{font-size:11px;color:#64748b;line-height:1.5;margin:0}.card strong{display:block;margin-top:8px;font-size:13px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}.summary div{background:#eef3fb;border-radius:12px;padding:13px;text-align:center}.summary b{display:block;font-size:22px}.summary span{font-size:10px;color:#64748b}table{width:100%;border-collapse:collapse}th,td{padding:10px;border:1px solid #d8e0ea;text-align:right;font-size:11px}th{background:#e9eef6}h3{font-size:16px;margin:0 0 10px}.empty{padding:24px;text-align:center;background:#f1f5f9;border-radius:12px;color:#64748b}@page{size:A4 landscape;margin:10mm}
  </style></head><body><header><div><h1>مؤشرات استخدام وتصفية رصيد الإجازات</h1><div class="sub">Group A · السنة ${year}</div></div><div class="sub">تاريخ التقرير: ${fmtDate(today)}</div></header>
  <div class="charts"><div class="card"><div class="donut" style="--pct:${needsPct};--color:#f59e0b"><b>${needsPct}%</b></div><div><h2>موظفون يحتاجون تصفية</h2><p>رصيدهم يتجاوز حد الترحيل وهو 9 أيام.</p><strong>${needs.length} من ${total} موظف</strong></div></div><div class="card"><div><h2>الإجازات المدخلة والمأخوذة</h2><p>مقارنة الإجازات المسجلة مع التي بدأ الموظفون فيها فعليًا.</p><strong>${yearLeaves.length} مدخلة · ${takenLeaves.length} مأخوذة</strong></div></div><div class="card"><div class="donut" style="--pct:${completionPct};--color:#16a085"><b>${completionPct}%</b></div><div><h2>نسبة الإنجاز</h2><p>الإجازات المأخوذة من إجمالي الإجازات المدخلة.</p><strong>${takenLeaves.length} من ${yearLeaves.length} إجازة</strong></div></div></div>
  <div class="summary"><div><b>${yearLeaves.length}</b><span>الإجازات المدخلة</span></div><div><b>${takenLeaves.length}</b><span>الإجازات المأخوذة</span></div><div><b>${needs.length}</b><span>يحتاجون تصفية</span></div><div><b>${formatDays(excessDays)}</b><span>إجمالي أيام التصفية</span></div></div>
  <h3>تفاصيل الموظفين المطلوب تصفية أرصدتهم</h3>${needs.length?`<table><thead><tr><th>#</th><th>الموظف</th><th>رقم الباج</th><th>الرصيد الحالي</th><th>المطلوب تصفيته</th></tr></thead><tbody>${rows}</tbody></table>`:'<div class="empty">جميع أرصدة الموظفين ضمن حد الترحيل</div>'}
  </body></html>`);
  win.document.close();win.focus();setTimeout(()=>win.print(),300);
}

// ==================== التنبيهات والبحث الشامل ====================
function getUpcomingNotifications(days=7){
  const t=todayISO(),items=[];
  state.leaves.forEach(l=>{
    const e=state.employees.find(x=>x.id===l.employeeId);if(!e)return;
    const ds=diffDays(l.start,t),de=diffDays(l.end,t);
    if(ds>=0&&ds<=days)items.push({date:l.start,icon:'🟡',title:e.name,text:ds===0?'تبدأ إجازته اليوم':`تبدأ إجازته بعد ${ds} ${ds===1?'يوم':'أيام'}`,employeeId:e.id});
    if(de>=0&&de<=days)items.push({date:l.end,icon:'🟢',title:e.name,text:de===0?'آخر يوم إجازة اليوم':`موعد عودته بعد ${de} ${de===1?'يوم':'أيام'}`,employeeId:e.id});
  });
  state.personalNotes.forEach(n=>{
    const d=diffDays(n.date,t);
    if(d>=0&&d<=days)items.push({date:n.date,icon:'📌',title:d===0?'ملاحظة اليوم':'ملاحظة قادمة',text:n.text});
  });
  return items.sort((a,b)=>a.date.localeCompare(b.date));
}
function renderNotificationBadge(){
  const count=getUpcomingNotifications().length,el=document.getElementById('notifyCount');
  el.textContent=count>99?'99+':count;el.classList.toggle('show',count>0);
}
function openNotifications(){
  const items=getUpcomingNotifications(),box=document.getElementById('notificationList');
  box.innerHTML=items.length?items.map(n=>`<div class="notification-item" ${n.employeeId?`onclick="closeModal('notificationsModal');openEmployeeProfile('${n.employeeId}')" style="cursor:pointer"`:''}>
    <div class="notification-icon">${n.icon}</div><div><div class="name">${esc(n.title)}</div><div class="meta">${fmtDate(n.date)} · ${esc(n.text)}</div></div>
  </div>`).join(''):'<div class="empty">لا توجد تنبيهات خلال 7 أيام 👌</div>';
  document.getElementById('notificationsModal').classList.add('show');
}

function renderGlobalSearch(){
  const input=document.getElementById('globalSearchInput'),box=document.getElementById('globalSearchResults');
  const q=input.value.trim().toLowerCase();
  if(!q){box.classList.remove('show');box.innerHTML='';return}
  const matches=state.employees.filter(e=>e.name.toLowerCase().includes(q)||(e.nameAr||'').toLowerCase().includes(q)||(e.empId||'').toLowerCase().includes(q)).slice(0,10);
  box.innerHTML=matches.length?matches.map(e=>{
    const leaves=state.leaves.filter(l=>l.employeeId===e.id).length,records=state.records.filter(r=>r.employeeId===e.id).length;
    return `<div class="search-result" onclick="selectGlobalEmployee('${e.id}')"><div class="name">${esc(e.nameAr||e.name)}</div><div class="meta">#${esc(e.empId)} · ${leaves} إجازة · ${records} ملاحظة</div></div>`;
  }).join(''):'<div class="empty">لا يوجد موظف مطابق</div>';
  box.classList.add('show');
}

// ==================== التقويم (Calendar) ====================
function calendarDateISO(year,month,day){
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
function changeCalendarMonth(step){
  let [year,month]=calendarMonth.split('-').map(Number);
  month+=step;if(month<1){month=12;year--}if(month>12){month=1;year++}
  calendarMonth=`${year}-${String(month).padStart(2,'0')}`;renderLeaveCalendar();
}
function goCalendarToday(){calendarMonth=todayISO().slice(0,7);renderLeaveCalendar()}
function prepareCalendarEmail(){
  renderLeaveCalendar();
  const monthName=document.getElementById('calendarTitle').textContent;
  const originalTitle=document.title;
  document.title=`Group A Leave and Shift Calendar - ${monthName}`;
  window.print();
  document.title=originalTitle;
  setTimeout(()=>{
    if(!confirm('بعد حفظ التقويم بصيغة PDF، اضغط موافق لفتح رسالة البريد وإرفاق الملف.'))return;
    const subject=`Group A Leave and Shift Calendar - ${monthName}`;
    const body=`Dear Sir,\n\nPlease find attached the Group A leave and shift calendar for ${monthName}.\n\nBest regards,`;
    window.location.href=`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  },250);
}
function renderLeaveCalendar(){
  const box=document.getElementById('leaveCalendar'),weekdays=document.getElementById('calendarWeekdays');
  if(!box||!weekdays)return;
  const [year,month]=calendarMonth.split('-').map(Number);
  const firstDay=new Date(year,month-1,1).getDay();
  const daysInMonth=new Date(year,month,0).getDate();
  document.getElementById('calendarTitle').textContent=new Date(year,month-1,1).toLocaleDateString('ar-SA-u-ca-gregory',{month:'long',year:'numeric'});
  weekdays.innerHTML=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'].map(d=>`<div class="calendar-weekday">${d}</div>`).join('');
  let html='';const totalCells=Math.ceil((firstDay+daysInMonth)/7)*7;box.dataset.weeks=String(totalCells/7);
  for(let i=0;i<totalCells;i++){
    const day=i-firstDay+1;
    if(day<1||day>daysInMonth){html+='<div class="calendar-day other"></div>';continue}
    const date=calendarDateISO(year,month,day);
    const groupShift=groupShiftForDate(date);
    const dayLeaves=state.leaves.filter(l=>l.start<=date&&l.end>=date).sort((a,b)=>a.start.localeCompare(b.start));
    const capacityClass=dayLeaves.length>6?'capacity-exceeded':dayLeaves.length===6?'capacity-full':'';
    const capacityLabel=dayLeaves.length>6?`<span class="capacity-label exceeded">تجاوز ${dayLeaves.length}/6</span>`:dayLeaves.length===6?'<span class="capacity-label">مكتمل 6/6</span>':'';
    const events=dayLeaves.map(l=>{
      const e=state.employees.find(x=>x.id===l.employeeId);if(!e)return '';
      const type=l.start===date?'start':l.end===date?'end':'active';
      const displayName=rosterEmployeeName(e);
      return `<button class="calendar-event ${type}" title="${esc(displayName)}" onclick="openEmployeeProfile('${e.id}')">${esc(displayName)}</button>`;
    }).join('');
    const shiftTag=`<div class="calendar-shift-tag ${groupShift.cls}" title="${groupShift.name}"><span>${groupShift.code}</span><small>${groupShift.arabic}</small></div>`;
    html+=`<div class="calendar-day ${date===todayISO()?'today':''} ${capacityClass}"><div class="calendar-day-number">${day.toLocaleString('ar-SA')}</div>${shiftTag}${capacityLabel}${events}</div>`;
  }
  box.innerHTML=html;
}

// ==================== دورة الشفت، التذكيرات اليومية والأسبوعية ====================
const SHIFT_ANCHOR='2026-08-30';
const SHIFT_CYCLE=[
  {from:0,to:6,code:'N',name:'Night',arabic:'ليلي',cls:'shift-night'},
  {from:7,to:8,code:'OFF',name:'Off',arabic:'راحة',cls:'shift-off'},
  {from:9,to:15,code:'A',name:'Afternoon',arabic:'مسائي',cls:'shift-afternoon'},
  {from:16,to:17,code:'OFF',name:'Off',arabic:'راحة',cls:'shift-off'},
  {from:18,to:24,code:'M',name:'Morning',arabic:'صباحي',cls:'shift-morning'},
  {from:25,to:27,code:'OFF',name:'Off',arabic:'راحة',cls:'shift-off'}
];
function groupShiftForDate(date){
  const raw=diffDays(date,SHIFT_ANCHOR),day=((raw%28)+28)%28;
  return SHIFT_CYCLE.find(s=>day>=s.from&&day<=s.to)||SHIFT_CYCLE[0];
}
function shiftPickerLabel(shift){
  if(shift.code==='M')return 'صباح';
  if(shift.code==='A')return 'ظهر';
  if(shift.code==='N')return 'ليل';
  return 'أوف';
}
function openShiftDatePicker(targetId){
  shiftDatePickerTarget=targetId;
  const selected=document.getElementById(targetId)?.value;
  shiftDatePickerMonth=(selected&&/^\d{4}-\d{2}-\d{2}$/.test(selected)?selected:todayISO()).slice(0,7);
  const labels={leaveStart:'اختيار بداية الإجازة',leaveEnd:'اختيار نهاية الإجازة',leaveRangeStart:'اختيار بداية فترة البحث',leaveRangeEnd:'اختيار نهاية فترة البحث'};
  document.getElementById('datePickerTargetLabel').textContent=labels[targetId]||'اختيار التاريخ';
  renderShiftDatePicker();document.getElementById('shiftDatePickerModal').classList.add('show');
}
function changeDatePickerMonth(step){
  let [year,month]=shiftDatePickerMonth.split('-').map(Number);month+=step;
  if(month<1){month=12;year--}if(month>12){month=1;year++}
  shiftDatePickerMonth=`${year}-${String(month).padStart(2,'0')}`;renderShiftDatePicker();
}
function goDatePickerToday(){shiftDatePickerMonth=todayISO().slice(0,7);renderShiftDatePicker()}
function chooseShiftDate(date){
  const input=document.getElementById(shiftDatePickerTarget);if(!input)return;
  input.value=date;
  const pairedEnd=shiftDatePickerTarget==='leaveStart'?'leaveEnd':shiftDatePickerTarget==='leaveRangeStart'?'leaveRangeEnd':'';
  if(pairedEnd){const end=document.getElementById(pairedEnd);if(end?.value&&end.value<date)end.value=''}
  closeModal('shiftDatePickerModal');
}
function renderShiftDatePicker(){
  const grid=document.getElementById('shiftDateGrid'),weekdays=document.getElementById('shiftDateWeekdays');if(!grid||!weekdays)return;
  const [year,month]=shiftDatePickerMonth.split('-').map(Number),firstDay=new Date(year,month-1,1).getDay(),daysInMonth=new Date(year,month,0).getDate();
  document.getElementById('datePickerTitle').textContent=new Date(year,month-1,1).toLocaleDateString('ar-SA-u-ca-gregory',{month:'long',year:'numeric'});
  weekdays.innerHTML=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'].map(x=>`<div>${x}</div>`).join('');
  const selected=document.getElementById(shiftDatePickerTarget)?.value||'';let html='';
  for(let i=0;i<42;i++){
    const day=i-firstDay+1;if(day<1||day>daysInMonth){html+='<div class="shift-date-day empty"></div>';continue}
    const date=calendarDateISO(year,month,day),shift=groupShiftForDate(date);
    html+=`<button type="button" class="shift-date-day ${date===selected?'selected':''}" onclick="chooseShiftDate('${date}')"><span class="shift-date-number">${day}</span><span class="shift-date-label ${shift.cls}">${shift.code} · ${shiftPickerLabel(shift)}</span></button>`;
  }
  grid.innerHTML=html;
}
function addDaysISO(date,days){
  const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+days);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function shortDate(date){
  return new Date(date+'T12:00:00').toLocaleDateString('ar-SA-u-ca-gregory',{day:'numeric',month:'long'});
}
function shiftPeriodEnd(date,code){
  let end=date;
  for(let i=1;i<=28;i++){
    const next=addDaysISO(date,i);if(groupShiftForDate(next).code!==code)break;end=next;
  }
  return end;
}
function shiftPeriodStart(date,code){
  let start=date;
  for(let i=1;i<=28;i++){
    const previous=addDaysISO(date,-i);if(groupShiftForDate(previous).code!==code)break;start=previous;
  }
  return start;
}
function nextWorkingShift(date,currentCode){
  for(let i=1;i<=35;i++){
    const nextDate=addDaysISO(date,i),info=groupShiftForDate(nextDate);
    if(info.code!=='OFF'&&info.code!==currentCode)return {date:nextDate,...info};
  }
  return null;
}
function firstWorkDayAfterLeave(endDate){
  for(let i=1;i<=7;i++){
    const date=addDaysISO(endDate,i),shift=groupShiftForDate(date);
    if(shift.code!=='OFF')return {date,...shift};
  }
  return null;
}
function renderDashboardShift(){
  const code=document.getElementById('dashboardShiftCode');
  if(!code)return;
  const t=todayISO(),current=groupShiftForDate(t),end=shiftPeriodEnd(t,current.code),next=nextWorkingShift(t,current.code);
  code.textContent=current.code;
  document.getElementById('dashboardShiftName').textContent=current.code==='OFF'?'يوم راحة':current.name+' Shift';
  document.getElementById('dashboardShiftPeriod').textContent=current.code==='OFF'?`الراحة مستمرة حتى ${shortDate(end)}`:`${current.arabic} حتى ${shortDate(end)}`;
  document.getElementById('dashboardNextShift').textContent=next?`القادم: ${next.code} · ${next.name} — ${shortDate(next.date)}`:'—';
  renderConditionalReminder();
  renderReminderCards();
  renderLatestUpdatesCard();
}
const SHIFT_CONDITIONAL_REMINDERS=[
  {shift:'A',weekday:0,title:'Weekly Fence and Light Inspection'},
  {shift:'M',weekday:5,title:'Gate and Patrol Check'},
  {shift:'N',weekday:5,title:'Weapons Inspection'}
];
function conditionalShiftReminder(date){
  const shift=groupShiftForDate(date),weekday=new Date(date+'T12:00:00').getDay();
  return SHIFT_CONDITIONAL_REMINDERS.find(r=>r.shift===shift.code&&r.weekday===weekday)||null;
}
function personalNotesForToday(){
  return state.personalNotes.filter(n=>n.date===todayISO());
}
function upcomingLeaveReminders(){
  const target=addDaysISO(todayISO(),2);
  const items=[];
  state.leaves.forEach(leave=>{
    if(leave.start===target)items.push(`${aiEmployeeName(leave.employeeId)} يبدأ إجازته بعد يومين`);
    const returnDuty=firstWorkDayAfterLeave(leave.end);
    const returnDate=returnDuty?.date||addDaysISO(leave.end,1);
    if(returnDate===target)items.push(`${aiEmployeeName(leave.employeeId)} راجع من الإجازة بعد يومين`);
  });
  return items;
}
function todaySummaryItems(){
  const items=[];
  const shift=conditionalShiftReminder(todayISO());
  if(shift)items.push(shift.title);
  personalNotesForToday().forEach(n=>items.push(n.text));
  items.push(...upcomingLeaveReminders());
  return items;
}
function todaySummaryItemsTyped(){
  const items=[];
  const shift=conditionalShiftReminder(todayISO());
  if(shift)items.push({type:'shift',text:shift.title});
  personalNotesForToday().forEach(n=>items.push({type:'personal',text:n.text}));
  upcomingLeaveReminders().forEach(text=>items.push({type:'leave',text}));
  return items;
}
function renderLatestUpdatesCard(){
  const box=document.getElementById('latestUpdatesBox');if(!box)return;
  const latest=[...state.updates].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,3);
  box.innerHTML=latest.length?latest.map(u=>reminderItemHtml(u.text,fmtDate(String(u.createdAt).slice(0,10)))).join(''):reminderEmpty();
}
function renderConditionalReminder(){
  const box=document.getElementById('conditionalShiftReminder');if(!box)return;
  const items=todaySummaryItemsTyped();
  box.style.display=items.length?'flex':'none';
  const REMINDER_ICON={shift:'🛡️',personal:'📝',leave:'🧳'};
  box.innerHTML=items.map(i=>`<span>${REMINDER_ICON[i.type]||'📋'} ${esc(i.text)}</span>`).join('');
}
function reminderItemHtml(name,meta){return `<div class="reminder-item"><div class="rt-name">${esc(name)}</div><div class="rt-meta">${esc(meta)}</div></div>`}
function reminderEmpty(){return '<div class="reminder-item rt-meta">لا يوجد</div>'}
function renderReminderCards(){
  const todayBox=document.getElementById('reminderTodayBox');
  const upcomingBox=document.getElementById('reminderUpcomingBox');
  const returningBox=document.getElementById('reminderReturningBox');
  const expiredBox=document.getElementById('reminderExpiredBox');
  if(!todayBox||!upcomingBox||!returningBox||!expiredBox)return;

  /* تذكيرات اليوم — نفس conditionalShiftReminder وpersonalNotesForToday الموجودتين */
  const todayItems=[];
  const shiftReminder=conditionalShiftReminder(todayISO());
  if(shiftReminder)todayItems.push(reminderItemHtml(shiftReminder.title,'تذكير الشفت اليوم'));
  personalNotesForToday().forEach(n=>todayItems.push(reminderItemHtml(n.text,'اليوم')));
  todayBox.innerHTML=todayItems.length?todayItems.join(''):reminderEmpty();

  /* إجازات قادمة وراجعون — نفس منطق upcomingLeaveReminders موزّع على بطاقتين بدل نص واحد مدمج */
  const target=addDaysISO(todayISO(),2);
  const upcoming=[],returning=[];
  state.leaves.forEach(leave=>{
    if(leave.start===target)upcoming.push(reminderItemHtml(aiEmployeeName(leave.employeeId),'يبدأ إجازته في '+fmtDate(leave.start)));
    const returnDuty=firstWorkDayAfterLeave(leave.end);
    const returnDate=returnDuty?.date||addDaysISO(leave.end,1);
    if(returnDate===target)returning.push(reminderItemHtml(aiEmployeeName(leave.employeeId),'يرجع تقريبًا في '+fmtDate(returnDate)));
  });
  upcomingBox.innerHTML=upcoming.length?upcoming.join(''):reminderEmpty();
  returningBox.innerHTML=returning.length?returning.join(''):reminderEmpty();

  /* بطاقات بحرية منتهية — نفس marineStatus المستخدمة أصلًا بـrenderMarineAlert */
  const expired=state.employees.filter(e=>marineStatus(e).kind==='expired');
  expiredBox.innerHTML=expired.length?expired.map(e=>reminderItemHtml(aiDisplayEmployee(e),'منتهية منذ '+fmtDate(marineExpiryFor(e)))).join(''):reminderEmpty();
}
// ==================== جدول الشفتات (عرض شهري بسيط) ====================
function changeScheduleMonth(step){
  let [year,month]=scheduleMonth.split('-').map(Number);month+=step;
  if(month<1){month=12;year--}if(month>12){month=1;year++}
  scheduleMonth=`${year}-${String(month).padStart(2,'0')}`;renderShiftSchedule();
}
function goScheduleToday(){scheduleMonth=todayISO().slice(0,7);renderShiftSchedule()}
function renderShiftSchedule(){
  const grid=document.getElementById('scheduleGrid'),weekdays=document.getElementById('scheduleWeekdays');
  if(!grid||!weekdays)return;
  const t=todayISO(),current=groupShiftForDate(t),currentEnd=shiftPeriodEnd(t,current.code),next=nextWorkingShift(t,current.code);
  const currentCard=document.getElementById('todayShiftCard'),nextCard=document.getElementById('nextShiftCard');
  currentCard.className=`shift-status-card ${current.cls}`;
  currentCard.innerHTML=`<div class="shift-card-label">دوام اليوم</div><strong>${current.code} · ${current.name}</strong><div class="meta">${current.arabic} حتى ${shortDate(currentEnd)}</div>`;
  nextCard.className=`shift-status-card ${next.cls}`;
  nextCard.innerHTML=`<div class="shift-card-label">الشفت القادم</div><strong>${next.code} · ${next.name}</strong><div class="meta">يبدأ ${shortDate(next.date)}</div>`;
  const [year,month]=scheduleMonth.split('-').map(Number),firstDay=new Date(year,month-1,1).getDay(),daysInMonth=new Date(year,month,0).getDate();
  document.getElementById('scheduleTitle').textContent=new Date(year,month-1,1).toLocaleDateString('ar-SA-u-ca-gregory',{month:'long',year:'numeric'});
  weekdays.innerHTML=['أحد','اثنين','ثلاثاء','أربعاء','خميس','جمعة','سبت'].map(d=>`<div class="schedule-weekday">${d}</div>`).join('');
  let html='';
  for(let i=0;i<42;i++){
    const day=i-firstDay+1;
    if(day<1||day>daysInMonth){html+='<div class="schedule-day empty"></div>';continue}
    const date=calendarDateISO(year,month,day),info=groupShiftForDate(date);
    html+=`<div class="schedule-day ${date===t?'today':''}"><div class="schedule-day-number">${day.toLocaleString('ar-SA')}</div><div class="schedule-shift-code ${info.cls}">${info.code}</div><div class="schedule-shift-name">${info.arabic}</div></div>`;
  }
  grid.innerHTML=html;
}
