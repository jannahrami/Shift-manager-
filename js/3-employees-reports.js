// ==================== رسائل واتساب وحالة الإجازة والتنبيهات ====================
function selectGlobalEmployee(id){
  document.getElementById('globalSearchInput').value='';document.getElementById('globalSearchResults').classList.remove('show');openEmployeeProfile(id);
}

function rosterLocationForDate(employee,date){
  const preferred=date.slice(0,7),months=Object.keys(state.monthlySchedules||{}).sort((a,b)=>a===preferred?-1:b===preferred?1:b.localeCompare(a));
  for(const month of months){
    const period=state.monthlySchedulePeriods?.[month]||monthBounds(month);
    if(!period||date<period.start||date>period.end)continue;
    const schedule=state.monthlySchedules[month]||{};
    const match=Object.entries(schedule).find(([,ids])=>Array.isArray(ids)&&ids.includes(employee.id));
    if(match)return match[0].split('|').slice(1).join('|');
  }
  const daily=state.shifts.find(s=>s.employeeId===employee.id);
  return daily?.post||employee.location||'لم يتم تحديده بعد';
}
function leaveReturnMessage(employee,leave){
  const daysToEnd=diffDays(leave.end,todayISO()),returnDuty=firstWorkDayAfterLeave(leave.end);
  const endText=daysToEnd===0?'تنتهي إجازتك اليوم':daysToEnd===1?'تنتهي إجازتك غدًا':daysToEnd===2?'تنتهي إجازتك بعد يومين':daysToEnd===3?'تنتهي إجازتك بعد 3 أيام':`تنتهي إجازتك بتاريخ ${fmtDate(leave.end)}`;
  const returnDate=returnDuty?.date||addDaysISO(leave.end,1),shift=returnDuty?'ال'+returnDuty.arabic:'لم يتم تحديده بعد',location=rosterLocationForDate(employee,returnDate);
  return `عزيزي ${rosterEmployeeName(employee)}، ${endText}، وموعد عودتك للعمل بتاريخ ${fmtDate(returnDate)}، على الشفت ${shift}، في الموقع ${location}.`;
}
function leaveStartMessage(employee,leave){
  return `عزيزي ${rosterEmployeeName(employee)}، نذكّرك بأن إجازتك تبدأ بتاريخ ${fmtDate(leave.start)}. نتمنى لك إجازة سعيدة.`;
}
function sendLeaveWhatsApp(employeeId,leaveId,type){
  const employee=state.employees.find(e=>e.id===employeeId),leave=state.leaves.find(l=>l.id===leaveId);if(!employee||!leave)return;
  const phone=normalizeSaudiPhone(employee.phone);
  if(!phone){alert(`لا يوجد رقم جوال صحيح للموظف ${rosterEmployeeName(employee)}. أضف الرقم من تعديل بيانات الموظف.`);return}
  const message=type==='start'?leaveStartMessage(employee,leave):leaveReturnMessage(employee,leave);
  const url=`https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  const opened=window.open(url,'_blank');if(!opened)window.location.href=url;
}

function aiOpenWhatsApp(employee,message){
  const phone=normalizeSaudiPhone(employee?.phone),text=String(message||'').trim().slice(0,1500);
  if(!phone)return {ok:false,error:`لا يوجد رقم جوال صحيح للموظف ${aiDisplayEmployee(employee)}. أضف الرقم من بيانات الموظف أولًا.`};
  if(!text)return {ok:false,error:'نص رسالة واتساب فارغ.'};
  const url=`https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  const opened=window.open(url,'_blank');if(!opened)window.location.href=url;
  return {ok:true,phone:localPhone(phone),message:text};
}

function renderAlerts(){
  const box=document.getElementById('alertsList'); box.innerHTML='';
  const t=todayISO(); let alerts=[];
  state.leaves.forEach(l=>{
    const e=state.employees.find(x=>x.id===l.employeeId); if(!e)return;
    const ds=diffDays(l.start,t), de=diffDays(l.end,t);
    const base={name:rosterEmployeeName(e),employeeId:e.id,leaveId:l.id,hasPhone:!!normalizeSaudiPhone(e.phone)};
    if(ds===0) alerts.push({...base,msg:'تبدأ إجازته اليوم',cls:'b-yellow',type:'start'});
    else if(ds===1) alerts.push({...base,msg:'تبدأ إجازته غدًا',cls:'b-yellow',type:'start'});
    else if(ds===2) alerts.push({...base,msg:'تبدأ إجازته بعد يومين',cls:'b-yellow',type:'start'});
    else if(ds===3) alerts.push({...base,msg:'تبدأ إجازته بعد 3 أيام',cls:'b-yellow',type:'start'});
    if(de===0) alerts.push({...base,msg:'آخر يوم إجازة اليوم',cls:'b-blue',type:'return'});
    else if(de===1) alerts.push({...base,msg:'تنتهي إجازته غدًا',cls:'b-green',type:'return'});
    else if(de===2) alerts.push({...base,msg:'تنتهي إجازته بعد يومين',cls:'b-green',type:'return'});
    else if(de===3) alerts.push({...base,msg:'تنتهي إجازته بعد 3 أيام',cls:'b-green',type:'return'});
  });
  if(!alerts.length){box.innerHTML='<div class="empty">لا توجد تنبيهات قريبة 👌</div>';return}
  alerts.forEach(a=>box.insertAdjacentHTML('beforeend',`
    <div class="row">
      <div class="row-main"><div class="avatar">${esc(initials(a.name))}</div><div><div class="name">${esc(a.name)}</div><div class="meta">${esc(a.msg)}</div></div></div>
      <div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap"><span class="badge ${a.cls}">تنبيه</span><button class="secondary ${a.hasPhone?'whatsapp-btn':''}" ${a.hasPhone?'':'disabled'} onclick="sendLeaveWhatsApp('${a.employeeId}','${a.leaveId}','${a.type}')">${a.hasPhone?'واتساب':'لا يوجد رقم'}</button></div>
    </div>`));
}

function renderCurrentLeaveTable(){
  const box=document.getElementById('currentLeaveTable');
  const count=document.getElementById('currentLeaveCount');
  if(!box||!count)return;
  const t=todayISO();
  const active=state.leaves
    .filter(l=>(l.start<=t&&l.end>=t)||(diffDays(l.start,t)>0&&diffDays(l.start,t)<=SOON_DAYS))
    .sort((a,b)=>a.start.localeCompare(b.start));
  count.textContent=`${active.length} ${active.length===1?'موظف':'موظفين'}`;
  if(!active.length){
    box.innerHTML='<div class="empty">لا توجد إجازات حالية أو تبدأ خلال 3 أيام</div>';
    return;
  }
  const rows=active.map(l=>{
    const e=state.employees.find(x=>x.id===l.employeeId);
    if(!e)return '';
    const untilStart=diffDays(l.start,t),remaining=Math.max(0,diffDays(l.end,t));
    const returnDuty=firstWorkDayAfterLeave(l.end);
    let status,remainingText,rowClass;
    if(untilStart>0){
      status={cls:'b-yellow',text:'إجازته قريبة'};rowClass='status-yellow';
      remainingText=untilStart===1?'تبدأ غدًا':`تبدأ بعد ${untilStart} أيام`;
    }else if(remaining<=SOON_DAYS){
      status={cls:'b-green',text:'راجع قريب'};rowClass='status-green';
      remainingText=remaining===0?'اليوم آخر يوم':remaining===1?'يوم واحد':`${remaining} يوم`;
    }else{
      status={cls:'b-blue',text:'في إجازة'};rowClass='status-blue';
      remainingText=`${remaining} يوم`;
    }
    return `<tr class="${rowClass}">
      <td><div class="employee-cell"><div class="avatar">${esc(initials(e.name))}</div><div><div class="name">${esc(e.name)}</div><div class="meta">#${esc(e.empId)}</div><span class="badge ${status.cls} employee-status-inline">${status.text}</span></div></div></td>
      <td>${fmtDate(l.start)}</td>
      <td>${fmtDate(l.end)}</td>
      <td><span class="days-remaining">${remainingText}</span>${returnDuty?`<div class="return-shift ${returnDuty.cls}"><span>العودة: ${returnDuty.arabic}</span><small>${fmtDate(returnDuty.date)}</small></div>`:''}</td>
      <td><span class="badge ${status.cls}">${status.text}</span></td>
    </tr>`;
  }).join('');
  box.innerHTML=`<div class="leave-table-wrap"><table class="leave-table">
    <thead><tr><th>الموظف</th><th>بداية الإجازة</th><th>نهاية الإجازة</th><th>المتبقي</th><th>الحالة</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function personalNoteStatus(date){
  const days=diffDays(date,todayISO());
  if(days<0)return {text:'فات موعدها',cls:'b-neutral',when:fmtDate(date)};
  if(days===0)return {text:'اليوم',cls:'b-red',when:'اليوم'};
  if(days===1)return {text:'غدًا',cls:'b-yellow',when:'غدًا'};
  if(days<=SOON_DAYS)return {text:`بعد ${days} أيام`,cls:'b-yellow',when:`بعد ${days} أيام`};
  return {text:'قادمة',cls:'b-blue',when:fmtDate(date)};
}

function renderPersonalNotes(){
  const box=document.getElementById('personalNotesList');
  if(!box)return;
  const notes=[...state.personalNotes].sort((a,b)=>a.date.localeCompare(b.date));
  if(!notes.length){
    box.innerHTML='<div class="empty">لا توجد ملاحظات أو تنبيهات محفوظة</div>';
    return;
  }
  box.innerHTML=notes.map(n=>{
    const status=personalNoteStatus(n.date);
    return `<div class="note-row">
      <div class="note-copy">
        <div class="note-text">${esc(n.text)}</div>
        <div class="note-date"><span>◷</span><span>${fmtDate(n.date)}</span><span class="badge ${status.cls}">${status.text}</span></div>
      </div>
      <button class="secondary danger" onclick="deletePersonalNote('${n.id}')">حذف</button>
    </div>`;
  }).join('');
}

// ==================== الموظفون: العرض، الملف الشخصي، السجلات والإنجازات ====================
function renderEmployees(){
  const box=document.getElementById('employeesList');
  const q=(document.getElementById('searchInput')?.value||'').trim().toLowerCase();
  const list=state.employees.filter(e=>!q || e.name.toLowerCase().includes(q) || (e.nameAr||'').toLowerCase().includes(q) || (e.empId||'').toLowerCase().includes(q) || (e.gc||'').toLowerCase().includes(q) || (e.position||'').toLowerCase().includes(q));
  if(!list.length){box.innerHTML='<div class="empty">لا يوجد موظفون</div>';return}
  const roleOptions=[['','حدد المهمة'],['chief','Shift Chief'],['assistant','Assistant'],['community','Community Supervisor'],['clerk','Shift Clerk'],['scc','SCC'],['visitor','Ind. Visitor'],['commVisitor','Comm. Visitor'],['leader','ليدر'],['officer','فرد'],['patrol','دورية'],['flex','فرد + دورية']];
  const marineBadgeCls={missing:'b-blue',expired:'b-red',soon:'b-yellow',valid:'b-green'};
  const rows=list.map((e,i)=>{
    const st=employeeStatus(e);
    const marine=marineStatus(e);
    const roleSelect=`<select class="employee-role-select" aria-label="مهمة الموظف" onclick="event.stopPropagation()" onchange="event.stopPropagation();updateEmployeeDutyRole('${e.id}',this.value)" style="width:auto;min-width:105px;padding:6px 8px">${roleOptions.map(([v,l])=>`<option value="${v}" ${e.dutyRole===v?'selected':''}>${l}</option>`).join('')}</select>`;
    return `<tr class="employee-click" onclick="openEmployeeProfile('${e.id}')" style="cursor:pointer">
      <td>${i+1}</td>
      <td><div style="display:flex;align-items:center;gap:8px"><span class="avatar">${esc(initials(e.name))}</span><div><div class="name">${esc(e.nameAr||e.name)}</div>${e.nameAr?`<div class="meta">${esc(e.name)}</div>`:''}</div></div></td>
      <td>${esc(e.empId||'—')}</td>
      <td onclick="event.stopPropagation()">${roleSelect}</td>
      <td>${esc(e.shift||'—')}</td>
      <td>${esc(e.location||'—')}</td>
      <td><span class="badge ${st.cls}">${st.text}</span></td>
      <td><strong>${formatDays(e.leaveBalance)}</strong></td>
      <td><span class="badge ${marineBadgeCls[marine.kind]||'b-blue'}">${esc(marine.label)}</span></td>
      <td onclick="event.stopPropagation()"><button class="secondary" onclick="openEmployeeModal('${e.id}')">تعديل</button> <button class="secondary danger" onclick="deleteEmployee('${e.id}')">حذف</button></td>
    </tr>`;
  }).join('');
  box.innerHTML=`<div class="leave-table-wrap"><table class="leave-table"><thead><tr><th>م</th><th>الاسم</th><th>الرقم الوظيفي</th><th>المهمة</th><th>الشفت</th><th>الموقع</th><th>حالة اليوم</th><th>رصيد الإجازة</th><th>البطاقة البحرية</th><th>إجراءات</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}


function recordBadgeClass(type){
  if(type==='Late') return 'b-red';
  if(type==='Excuse') return 'b-yellow';
  if(type==='M time') return 'b-blue';
  return 'b-green';
}

function openEmployeeProfile(id){
  selectedEmployeeId=id;
  editingAchievementId=null;
  const dateInput=document.getElementById('recordDate');
  if(dateInput && !dateInput.value) dateInput.value=todayISO();
  const achievementDate=document.getElementById('achievementDate');
  if(achievementDate && !achievementDate.value) achievementDate.value=todayISO();
  renderEmployeeProfile();
  showView('employeeProfileView');
}

function renderEmployeeProfile(){
  const head=document.getElementById('employeeProfileHeader');
  const list=document.getElementById('employeeRecordsList');
  const leaveList=document.getElementById('employeeLeavesList');
  const achievementList=document.getElementById('employeeAchievementsList');
  if(!head||!list)return;
  const e=state.employees.find(x=>x.id===selectedEmployeeId);
  if(!e){
    head.innerHTML='<div class="empty">اختر موظفًا من قائمة الموظفين</div>';
    list.innerHTML='';if(leaveList)leaveList.innerHTML='';if(achievementList)achievementList.innerHTML='';
    return;
  }
  const st=employeeStatus(e);
  head.innerHTML=`
    <div class="row">
      <div class="row-main">
        <div class="avatar">${esc(initials(e.name))}</div>
        <div>
          <div class="name">${esc(e.nameAr||e.name)}</div>
          ${e.nameAr?`<div class="meta">${esc(e.name)}</div>`:''}
          <div class="meta">Badge #${esc(e.empId)} · GC ${esc(e.gc||'-')}</div>
          <div class="meta">الجوال: ${esc(localPhone(e.phone)||'غير مسجل')}</div>
          <div class="meta">Marine ID: ${marineExpiryFor(e)?`${fmtDate(marineExpiryFor(e))} · ${esc(marineStatus(e).label)}`:'غير مسجل'}</div>
          <div class="meta">Access: ${employeeAccessGroups(e).length?employeeAccessGroups(e).map(g=>esc(g.title)).join(' · '):'لا توجد صلاحية مسجلة'}</div>
          <div class="meta">${esc(e.position||e.shift||'-')}</div>
          <div class="meta" style="margin-top:6px">رصيد الإجازة المتبقي: <strong>${formatDays(e.leaveBalance)}</strong> يوم <button class="secondary" style="padding:4px 9px;margin-right:6px" onclick="editLeaveBalance('${e.id}')">تعديل الرصيد</button></div>
          <div class="meta" style="margin-top:7px">المهمة: <span class="badge role-badge">${employeeDutyRoleLabel(e.dutyRole)}</span> <button class="secondary" style="padding:4px 9px;margin-right:6px" onclick="editEmployeeDutyRole('${e.id}')">تعديل المهمة</button></div>
        </div>
      </div>
      <div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap"><span class="badge ${st.cls}">${st.text}</span><button class="secondary" onclick="openEmployeeModal('${e.id}')">✏️ تعديل البيانات</button><button class="secondary" onclick="openEmployeeAnnualReport('${e.id}')">📊 التقرير السنوي</button><button class="secondary" onclick="openEmployeeHistory('${e.id}')">🗂️ History</button></div>
    </div>`;

  const employeeLeaves=state.leaves.filter(l=>l.employeeId===e.id).sort((a,b)=>b.start.localeCompare(a.start));
  document.getElementById('profileLeaveCount').textContent=employeeLeaves.length;
  leaveList.innerHTML=employeeLeaves.length?employeeLeaves.map(l=>{
    const t=todayISO();let label='قادمة',statusClass='leave-upcoming';
    if(l.start<=t&&l.end>=t){label='في إجازة';statusClass='leave-active'}else if(l.end<t){label='منتهية';statusClass='leave-ended'}
    return `<div class="row ${statusClass}"><div><div class="name">${fmtDate(l.start)} ← ${fmtDate(l.end)}</div><div class="meta">${diffDays(l.end,l.start)+1} يوم · ${esc(l.note||'بدون ملاحظة')}</div></div><span class="badge ${statusClass}">${label}</span></div>`;
  }).join(''):'<div class="empty">لا توجد إجازات مسجلة لهذا الموظف</div>';

  const achievements=state.achievements
    .filter(a=>a.employeeId===e.id)
    .sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  document.getElementById('achievementCount').textContent=achievements.length;
  achievementList.innerHTML=achievements.length?achievements.map(a=>`
    <div class="row">
      <div class="row-main">
        <div class="achievement-icon">🏆</div>
        <div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="badge achievement-type">${esc(a.type)}</span><span class="meta">${fmtDate(a.date)}</span></div>
          <div class="meta" style="margin-top:8px;color:var(--text);line-height:1.7">${esc(a.note)}</div>
        </div>
      </div>
      <div class="achievement-actions"><button class="secondary" onclick="editEmployeeAchievement('${a.id}')">تعديل</button><button class="secondary danger" onclick="deleteEmployeeAchievement('${a.id}')">حذف</button></div>
    </div>`).join(''):'<div class="empty">لا توجد إنجازات مسجلة لهذا الموظف حتى الآن</div>';

  const records=state.records
    .filter(r=>r.employeeId===e.id)
    .sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  document.getElementById('recordCount').textContent=records.length;

  if(!records.length){
    list.innerHTML='<div class="empty">لا توجد ملاحظات مسجلة لهذا الموظف</div>';
    return;
  }
  list.innerHTML=records.map(r=>`
    <div class="row">
      <div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="badge ${recordBadgeClass(r.type)}">${esc(r.type)}</span>
          <span class="meta">${fmtDate(r.date)}</span>
        </div>
        ${r.note?`<div class="meta" style="margin-top:8px;color:var(--text)">${esc(r.note)}</div>`:''}
      </div>
      <button class="secondary danger" onclick="deleteEmployeeRecord('${r.id}')">حذف</button>
    </div>`).join('');
}

function saveEmployeeRecord(){
  if(!selectedEmployeeId){alert('اختر موظفًا أولًا');return}
  const type=document.getElementById('recordType').value;
  const date=document.getElementById('recordDate').value || todayISO();
  const note=document.getElementById('recordNote').value.trim();
  state.records.push({
    id:(crypto.randomUUID?crypto.randomUUID():('rec-'+Date.now())),
    employeeId:selectedEmployeeId,
    type,date,note,
    createdAt:new Date().toISOString()
  });
  document.getElementById('recordNote').value='';
  document.getElementById('recordDate').value=todayISO();
  save();
  renderEmployeeProfile();
}

function deleteEmployeeRecord(id){
  if(!confirm('حذف هذه الملاحظة؟'))return;
  state.records=state.records.filter(r=>r.id!==id);
  save();
  renderEmployeeProfile();
}

function resetAchievementForm(){
  editingAchievementId=null;
  const type=document.getElementById('achievementType'),date=document.getElementById('achievementDate'),note=document.getElementById('achievementNote');
  if(type)type.value='بلاغ عن مشكلة';if(date)date.value=todayISO();if(note)note.value='';
  const saveBtn=document.getElementById('achievementSaveBtn'),cancelBtn=document.getElementById('achievementCancelBtn');
  if(saveBtn)saveBtn.textContent='حفظ الإنجاز';if(cancelBtn)cancelBtn.style.display='none';
}

function saveEmployeeAchievement(){
  if(!selectedEmployeeId){alert('اختر موظفًا أولًا');return}
  const type=document.getElementById('achievementType').value;
  const date=document.getElementById('achievementDate').value||todayISO();
  const note=document.getElementById('achievementNote').value.trim();
  if(!note){alert('اكتب تفاصيل الإنجاز');return}
  if(editingAchievementId){
    const achievement=state.achievements.find(a=>a.id===editingAchievementId);
    if(achievement)Object.assign(achievement,{type,date,note,updatedAt:new Date().toISOString()});
  }else{
    state.achievements.push({id:(crypto.randomUUID?crypto.randomUUID():('ach-'+Date.now())),employeeId:selectedEmployeeId,type,date,note,createdAt:new Date().toISOString()});
  }
  resetAchievementForm();save();renderEmployeeProfile();
}

function editEmployeeAchievement(id){
  const achievement=state.achievements.find(a=>a.id===id);if(!achievement)return;
  editingAchievementId=id;
  document.getElementById('achievementType').value=achievement.type;
  document.getElementById('achievementDate').value=achievement.date||todayISO();
  document.getElementById('achievementNote').value=achievement.note||'';
  document.getElementById('achievementSaveBtn').textContent='حفظ التعديل';
  document.getElementById('achievementCancelBtn').style.display='inline-flex';
  document.getElementById('achievementNote').focus();
}

function cancelAchievementEdit(){resetAchievementForm()}

function deleteEmployeeAchievement(id){
  if(!confirm('حذف هذا الإنجاز؟'))return;
  state.achievements=state.achievements.filter(a=>a.id!==id);
  if(editingAchievementId===id)resetAchievementForm();
  save();renderEmployeeProfile();
}


// ==================== التقارير (شهرية، سنوية، إنجازات، تصدير Excel/PDF) ====================
function currentMonthValue(){return todayISO().slice(0,7)}
function showCurrentLeaveMonth(){
  clearLeaveRange(false);document.getElementById('leaveMonthFilter').value=currentMonthValue();renderLeaves();
}
function clearLeaveMonth(){
  document.getElementById('leaveMonthFilter').value='';clearLeaveRange(false);renderLeaves();
}
function applyLeaveRange(){
  const start=document.getElementById('leaveRangeStart').value,end=document.getElementById('leaveRangeEnd').value;
  if(!start||!end){alert('حدد تاريخ البداية والنهاية');return}
  if(end<start){alert('تاريخ النهاية يجب أن يكون بعد تاريخ البداية');return}
  document.getElementById('leaveMonthFilter').value='';renderLeaves();
}
function clearLeaveRange(render=true){
  const start=document.getElementById('leaveRangeStart'),end=document.getElementById('leaveRangeEnd');if(start)start.value='';if(end)end.value='';if(render)renderLeaves();
}
function csvCell(value){
  let text=String(value??'');
  if(/^[=+@-]/.test(text))text="'"+text;
  return `"${text.replace(/"/g,'""')}"`;
}
function downloadCsv(filename,header,rows){
  const lines=[header.map(csvCell).join(','),...rows.map(row=>row.map(csvCell).join(','))];
  const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function monthBounds(month){
  if(!month)return null;const [year,monthNo]=month.split('-').map(Number);
  return {start:month+'-01',end:month+'-'+String(new Date(year,monthNo,0).getDate()).padStart(2,'0')};
}
function selectReportType(type,button){
  document.querySelectorAll('.report-choice').forEach(b=>b.classList.toggle('active',b.dataset.report===type));
  document.querySelectorAll('.report-panel').forEach(p=>p.classList.remove('active'));
  const panel=document.getElementById(type+'ReportPanel');if(panel)panel.classList.add('active');
  if(type==='balances')renderBalancesReport();
  if(type==='monthly')renderMonthlyReport();
  if(type==='annual'&&document.getElementById('annualReportEmployee').value)renderAnnualEmployeeReport();
  if(type==='fullEmployee'&&document.getElementById('fullEmployeeReportEmployee').value)renderFullEmployeeReport();
  if(type==='achievements')renderAchievementsReport();
}
function balanceReportEmployees(){
  return [...state.employees].sort((a,b)=>a.name.localeCompare(b.name));
}
function renderBalancesReport(){
  const employees=balanceReportEmployees(),box=document.getElementById('balancesReportBox');if(!box)return;
  const total=employees.reduce((sum,e)=>sum+(Number(e.leaveBalance)||0),0);
  const low=employees.filter(e=>(Number(e.leaveBalance)||0)<10).length;
  box.innerHTML=`<div class="report-document" dir="rtl"><div class="small-note">الرصيد الحالي بعد الخصومات والإضافات السنوية</div>
    <div class="report-summary"><div><strong>${employees.length}</strong><span>عدد الموظفين</span></div><div><strong>${formatDays(total)}</strong><span>إجمالي أيام الرصيد</span></div><div><strong>${low}</strong><span>رصيد أقل من 10 أيام</span></div></div>
    <div class="leave-table-wrap"><table class="leave-table report-table"><thead><tr><th>#</th><th>اسم الموظف</th><th>رقم الباج</th><th>المنصب</th><th>الرصيد المتبقي</th><th>الحالة</th></tr></thead><tbody>${employees.map((e,i)=>{const balance=Number(e.leaveBalance)||0;const cls=balance<0?'b-red':balance<10?'b-yellow':'b-green';const label=balance<0?'متجاوز الرصيد':balance<10?'رصيد منخفض':'متاح';return `<tr><td>${i+1}</td><td>${esc(e.name)}</td><td>${esc(e.empId)}</td><td>${esc(e.position||e.shift||'-')}</td><td><strong>${formatDays(balance)} يوم</strong></td><td><span class="badge ${cls}">${label}</span></td></tr>`}).join('')}</tbody></table></div></div>`;
}
function exportBalancesReportExcel(){
  const employees=balanceReportEmployees();if(!employees.length){alert('لا يوجد موظفون');return}
  downloadCsv(`All_Employees_Leave_Balances_${todayISO()}.csv`,['م','اسم الموظف','رقم الباج','المنصب','رصيد الإجازة المتبقي'],employees.map((e,i)=>[i+1,e.name,e.empId,e.position||e.shift||'',formatDays(e.leaveBalance)]));
}
function reportRowsForMonth(month){
  const bounds=monthBounds(month);if(!bounds)return [];
  return state.leaves.filter(l=>l.start<=bounds.end&&l.end>=bounds.start)
    .map(l=>({leave:l,employee:state.employees.find(e=>e.id===l.employeeId)})).filter(x=>x.employee)
    .sort((a,b)=>a.leave.start.localeCompare(b.leave.start)||a.employee.name.localeCompare(b.employee.name));
}
function reportTable(title,subtitle,rows){
  const totalDays=rows.reduce((sum,x)=>sum+(x.days??diffDays(x.leave.end,x.leave.start)+1),0);
  const people=new Set(rows.map(x=>x.employee.id)).size;
  return `<div class="report-document" dir="rtl"><div class="section-head"><div><h2>${esc(title)}</h2><div class="small-note">${esc(subtitle)}</div></div></div>
    <div class="report-summary"><div><strong>${people}</strong><span>عدد الموظفين</span></div><div><strong>${rows.length}</strong><span>عدد الإجازات</span></div><div><strong>${totalDays}</strong><span>إجمالي الأيام</span></div></div>
    <div class="leave-table-wrap"><table class="leave-table report-table"><thead><tr><th>#</th><th>اسم الموظف</th><th>رقم الباج</th><th>من</th><th>إلى</th><th>الأيام</th><th>الملاحظة</th></tr></thead><tbody>${rows.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.employee.name)}</td><td>${esc(x.employee.empId)}</td><td>${fmtDate(x.leave.start)}</td><td>${fmtDate(x.leave.end)}</td><td>${x.days??diffDays(x.leave.end,x.leave.start)+1}</td><td>${esc(x.leave.note||'-')}</td></tr>`).join('')}</tbody></table></div></div>`;
}
function renderMonthlyReport(){
  const month=document.getElementById('monthlyReportMonth').value;
  if(!month){alert('اختر شهر التقرير');return}
  const rows=reportRowsForMonth(month),box=document.getElementById('monthlyReportBox');
  box.innerHTML=rows.length?reportTable('تقرير الإجازات الشهري',monthLabel(month),rows):'<div class="empty">لا توجد إجازات في هذا الشهر</div>';
}
function exportMonthlyReportExcel(){
  const month=document.getElementById('monthlyReportMonth').value;if(!month){alert('اختر شهر التقرير');return}
  const rows=reportRowsForMonth(month);if(!rows.length){alert('لا توجد إجازات في هذا الشهر');return}
  downloadCsv(`Monthly_Leave_Report_${month}.csv`,['م','اسم الموظف','رقم الباج','من','إلى','عدد الأيام','الملاحظة'],rows.map((x,i)=>[i+1,x.employee.name,x.employee.empId,x.leave.start,x.leave.end,diffDays(x.leave.end,x.leave.start)+1,x.leave.note||'']));
}
function annualReportRows(employeeId,year){
  const yearStart=`${year}-01-01`,yearEnd=`${year}-12-31`,employee=state.employees.find(e=>e.id===employeeId);
  if(!employee)return [];
  return state.leaves.filter(l=>l.employeeId===employeeId&&l.start<=yearEnd&&l.end>=yearStart).sort((a,b)=>a.start.localeCompare(b.start)).map(leave=>{
    const clippedStart=leave.start<yearStart?yearStart:leave.start,clippedEnd=leave.end>yearEnd?yearEnd:leave.end;
    return {leave,employee,days:diffDays(clippedEnd,clippedStart)+1};
  });
}
function renderAnnualEmployeeReport(){
  const employeeId=document.getElementById('annualReportEmployee').value,year=Number(document.getElementById('annualReportYear').value);
  if(!employeeId||!year){alert('اختر الموظف والسنة');return}
  const employee=state.employees.find(e=>e.id===employeeId),rows=annualReportRows(employeeId,year),box=document.getElementById('annualReportBox');
  const header=`${employee.name} · Badge #${employee.empId} · الرصيد الحالي ${formatDays(employee.leaveBalance)} يوم`;
  box.innerHTML=rows.length?reportTable(`تقرير إجازات الموظف لعام ${year}`,header,rows):`<div class="empty">لا توجد إجازات مسجلة للموظف خلال ${year}<br>الرصيد الحالي: ${formatDays(employee.leaveBalance)} يوم</div>`;
}
function exportAnnualEmployeeReport(){
  const employeeId=document.getElementById('annualReportEmployee').value,year=Number(document.getElementById('annualReportYear').value);
  if(!employeeId||!year){alert('اختر الموظف والسنة');return}
  const employee=state.employees.find(e=>e.id===employeeId),rows=annualReportRows(employeeId,year);if(!rows.length){alert('لا توجد إجازات في السنة المحددة');return}
  downloadCsv(`Employee_Leave_Report_${employee.empId}_${year}.csv`,['م','اسم الموظف','رقم الباج','من','إلى','أيام ضمن السنة','الملاحظة','الرصيد الحالي'],rows.map((x,i)=>[i+1,employee.name,employee.empId,x.leave.start,x.leave.end,x.days,x.leave.note||'',employee.leaveBalance]));
}
function renderFullEmployeeReport(){
  const employeeId=document.getElementById('fullEmployeeReportEmployee')?.value;
  const start=document.getElementById('fullEmployeeReportStart')?.value,end=document.getElementById('fullEmployeeReportEnd')?.value;
  const employee=state.employees.find(e=>e.id===employeeId),box=document.getElementById('fullEmployeeReportBox');
  if(!box)return;if(!employee){box.innerHTML='<div class="empty">اختر الموظف أولًا</div>';return}
  if(!start||!end){alert('حدد تاريخ البداية والنهاية');return}
  if(end<start){alert('تاريخ النهاية يجب أن يكون بعد تاريخ البداية');return}
  const records=state.records.filter(r=>r.employeeId===employeeId&&r.date>=start&&r.date<=end).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const leaves=state.leaves.filter(l=>l.employeeId===employeeId&&l.start<=end&&l.end>=start).sort((a,b)=>(b.start||'').localeCompare(a.start||''));
  const achievements=state.achievements.filter(a=>a.employeeId===employeeId&&a.date>=start&&a.date<=end).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const emptyRow=(cols,text)=>`<tr><td colspan="${cols}" style="text-align:center;color:#64748b">${esc(text)}</td></tr>`;
  box.innerHTML=`<div class="report-document" dir="rtl">
    <div class="section-head"><div><h2>التقرير الكامل للموظف</h2><div class="small-note">الفترة من ${fmtDate(start)} إلى ${fmtDate(end)} · تاريخ الاستخراج: ${fmtDate(todayISO())}</div></div></div>
    <div class="report-summary"><div><strong>${esc(employee.nameAr||employee.name||'-')}</strong><span>اسم الموظف</span></div><div><strong>${esc(employee.empId||'-')}</strong><span>الرقم الوظيفي</span></div><div><strong>${records.length}</strong><span>الملاحظات</span></div><div><strong>${leaves.length}</strong><span>الإجازات</span></div><div><strong>${achievements.length}</strong><span>الإنجازات</span></div></div>
    <div class="small-note" style="margin:10px 0 18px">Marine ID Access: ${marineExpiryFor(employee)?`${fmtDate(marineExpiryFor(employee))} — ${esc(marineStatus(employee).label)}`:'غير مسجل'}<br>Access: ${employeeAccessGroups(employee).length?employeeAccessGroups(employee).map(g=>esc(g.title)).join(' · '):'لا توجد صلاحية مسجلة'}</div>
    <h3 style="margin-top:20px">الملاحظات المسجلة</h3>
    <div class="leave-table-wrap"><table class="leave-table report-table"><thead><tr><th>#</th><th>التاريخ</th><th>النوع</th><th>التفاصيل</th></tr></thead><tbody>${records.length?records.map((r,i)=>`<tr><td>${i+1}</td><td>${fmtDate(r.date)}</td><td>${esc(r.type==='Late'?'تأخير':r.type==='Note'?'ملاحظة':r.type||'-')}</td><td>${esc(r.note||'-')}</td></tr>`).join(''):emptyRow(4,'لا توجد ملاحظات مسجلة')}</tbody></table></div>
    <h3 style="margin-top:20px">الإجازات</h3>
    <div class="leave-table-wrap"><table class="leave-table report-table"><thead><tr><th>#</th><th>من</th><th>إلى</th><th>عدد الأيام</th><th>الملاحظة</th></tr></thead><tbody>${leaves.length?leaves.map((l,i)=>`<tr><td>${i+1}</td><td>${fmtDate(l.start)}</td><td>${fmtDate(l.end)}</td><td>${diffDays(l.end,l.start)+1}</td><td>${esc(l.note||'-')}</td></tr>`).join(''):emptyRow(5,'لا توجد إجازات مسجلة')}</tbody></table></div>
    <h3 style="margin-top:20px">الإنجازات</h3>
    <div class="leave-table-wrap"><table class="leave-table report-table"><thead><tr><th>#</th><th>التاريخ</th><th>نوع الإنجاز</th><th>التفاصيل</th></tr></thead><tbody>${achievements.length?achievements.map((a,i)=>`<tr><td>${i+1}</td><td>${fmtDate(a.date)}</td><td>${esc(a.type||'-')}</td><td>${esc(a.note||'-')}</td></tr>`).join(''):emptyRow(4,'لا توجد إنجازات مسجلة')}</tbody></table></div>
  </div>`;
}
function achievementReportRows(employeeId=''){
  return state.achievements.map(achievement=>({achievement,employee:state.employees.find(e=>e.id===achievement.employeeId)}))
    .filter(x=>x.employee&&(!employeeId||x.employee.id===employeeId))
    .sort((a,b)=>(b.achievement.date||'').localeCompare(a.achievement.date||'')||a.employee.name.localeCompare(b.employee.name));
}
function achievementReportDocument(rows,title='تقرير إنجازات الموظفين'){
  const people=new Set(rows.map(x=>x.employee.id)).size;
  return `<div class="report-document" dir="rtl"><div class="section-head"><div><h2>${esc(title)}</h2><div class="small-note">سجل الإنجازات مرتب من الأحدث إلى الأقدم</div></div></div>
    <div class="report-summary"><div><strong>${people}</strong><span>عدد الموظفين</span></div><div><strong>${rows.length}</strong><span>إجمالي الإنجازات</span></div><div><strong>${new Set(rows.map(x=>x.achievement.type)).size}</strong><span>أنواع الإنجازات</span></div></div>
    <div class="leave-table-wrap"><table class="leave-table report-table"><thead><tr><th>#</th><th>اسم الموظف</th><th>رقم الباج</th><th>التاريخ</th><th>نوع الإنجاز</th><th>التفاصيل</th></tr></thead><tbody>${rows.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.employee.name)}</td><td>${esc(x.employee.empId)}</td><td>${fmtDate(x.achievement.date)}</td><td><span class="badge achievement-type">${esc(x.achievement.type)}</span></td><td>${esc(x.achievement.note)}</td></tr>`).join('')}</tbody></table></div></div>`;
}
function renderAchievementsReport(){
  const box=document.getElementById('achievementsReportBox');if(!box)return;
  const rows=achievementReportRows();
  box.innerHTML=rows.length?achievementReportDocument(rows):'<div class="empty">لا توجد إنجازات مسجلة لأي موظف</div>';
}
function exportAchievementsReportExcel(){
  const rows=achievementReportRows();if(!rows.length){alert('لا توجد إنجازات مسجلة');return}
  downloadCsv(`All_Employee_Achievements_${todayISO()}.csv`,['م','اسم الموظف','رقم الباج','التاريخ','نوع الإنجاز','التفاصيل'],rows.map((x,i)=>[i+1,x.employee.name,x.employee.empId,x.achievement.date,x.achievement.type,x.achievement.note]));
}
function printEmployeeAchievements(){
  if(!selectedEmployeeId){alert('اختر موظفًا أولًا');return}
  const employee=state.employees.find(e=>e.id===selectedEmployeeId),rows=achievementReportRows(selectedEmployeeId);
  if(!employee||!rows.length){alert('لا توجد إنجازات مسجلة لهذا الموظف');return}
  const temp=document.createElement('div');temp.id='employeeAchievementPrint';temp.style.display='none';temp.innerHTML=achievementReportDocument(rows,`إنجازات الموظف: ${employee.name}`);document.body.appendChild(temp);
  printReport(temp.id,`إنجازات الموظف ${employee.name}`);setTimeout(()=>temp.remove(),1000);
}
function openAllAchievementsReport(){
  showView('reportsView');selectReportType('achievements');renderAchievementsReport();
}
function printReport(boxId,title){
  const box=document.getElementById(boxId);if(!box||!box.querySelector('table')){alert('اعرض التقرير أولًا');return}
  const win=window.open('','_blank');if(!win){alert('اسمح بالنوافذ المنبثقة للطباعة');return}
  win.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#172033}h2{margin-bottom:4px}.small-note{color:#64748b}.report-summary{display:flex;gap:10px;margin:18px 0}.report-summary div{flex:1;border:1px solid #d8dee8;border-radius:10px;padding:12px;text-align:center}.report-summary strong{display:block;font-size:22px}.report-summary span{font-size:11px;color:#64748b}table{width:100%;border-collapse:collapse;margin-top:14px}th,td{border:1px solid #d8dee8;padding:9px;text-align:right;font-size:12px}th{background:#eef2f7}@page{size:A4 landscape;margin:12mm}</style></head><body>${box.innerHTML}</body></html>`);
  win.document.close();win.focus();setTimeout(()=>win.print(),250);
}
