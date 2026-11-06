// ==================== المساعد الذكي: أدوات نصية وصوتية عامة ====================
function aiNormalize(value=''){
  return String(value).toLowerCase().replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/[\u064B-\u065F]/g,'').replace(/[^\u0600-\u06ff\w\s-]/g,' ').replace(/\s+/g,' ').trim();
}
function aiDateLabel(date){return date===todayISO()?'اليوم':fmtDate(date)}
function aiOffsetDate(days){const d=new Date(todayISO()+'T12:00:00');d.setDate(d.getDate()+days);return d.toISOString().slice(0,10)}
function aiDisplayEmployee(employee){return employee?.nameAr||employee?.name||'موظف غير معروف'}
function aiEmployeeName(id){return aiDisplayEmployee(state.employees.find(e=>e.id===id))}
function aiFindEmployee(text){
  const q=aiNormalize(text), ranked=state.employees.map(e=>{
    const aliases=[e.nameAr,e.name].filter(Boolean).map(aiNormalize);
    let score=aliases.reduce((best,name)=>{
      const parts=name.split(' ').filter(x=>x.length>1);
      const aliasScore=q.includes(name)?100+name.length:parts.reduce((n,p)=>n+(q.includes(p)?p.length:0),0);
      return Math.max(best,aliasScore);
    },0);
    if(e.empId&&q.includes(String(e.empId)))score=200;
    return {e,score};
  }).filter(x=>x.score>1).sort((a,b)=>b.score-a.score);
  if(!ranked.length)return {status:'none'};
  if(ranked.length>1&&ranked[0].score===ranked[1].score)return {status:'many',items:ranked.filter(x=>x.score===ranked[0].score).slice(0,5).map(x=>x.e)};
  return {status:'one',employee:ranked[0].e};
}
function aiWindow(text){
  const q=aiNormalize(text);
  if(q.includes('بعد بكره')){const d=aiOffsetDate(2);return {start:d,end:d,label:'بعد بكرة'}}
  if(q.includes('بكره')||q.includes('غدا')){const d=aiOffsetDate(1);return {start:d,end:d,label:'بكرة'}}
  const match=q.match(/خلال\s+(\d+)\s*(?:يوم|ايام)/);if(match)return {start:todayISO(),end:aiOffsetDate(Number(match[1])),label:`خلال ${match[1]} أيام`};
  if(q.includes('الاسبوع')||q.includes('7 ايام')||q.includes('٧ ايام'))return {start:todayISO(),end:aiOffsetDate(7),label:'خلال 7 أيام'};
  return {start:todayISO(),end:todayISO(),label:'اليوم'};
}
function aiAddMessage(text,role='bot',actions='',speak=false){
  const chat=document.getElementById('aiChat');if(!chat)return;
  const item=document.createElement('div');item.className=`ai-message ${role}`;item.textContent=text;
  if(actions){const box=document.createElement('div');box.className='ai-confirm';box.innerHTML=actions;item.appendChild(box)}
  chat.appendChild(item);chat.scrollTop=chat.scrollHeight;
  if(role==='bot'&&speak&&aiVoiceEnabled)aiSpeak(text);
}
function aiArabicSpeechText(text){
  return String(text).replace(/\bLate\b/gi,'تأخير').replace(/\bNote\b/gi,'ملاحظة').replace(/\bShift\b/gi,'شِفت').replace(/#\s*/g,'رقم ').replace(/[•✅✦]/g,'').replace(/\n+/g,'. ');
}
function aiStopSpeech(){
  ++aiSpeechToken;
  if(aiSpeechAudio){aiSpeechAudio.pause();aiSpeechAudio.src='';aiSpeechAudio=null}
  if(aiSpeechUrl){URL.revokeObjectURL(aiSpeechUrl);aiSpeechUrl=''}
  if('speechSynthesis' in window)window.speechSynthesis.cancel();
}
async function aiSpeak(text){
  if(!aiVoiceEnabled||!session?.access_token)return;
  aiStopSpeech();const token=aiSpeechToken;
  const spokenText=aiArabicSpeechText(text).trim().slice(0,200);if(!spokenText)return;
  try{
    const res=await fetch(SUPABASE_URL+'/functions/v1/shift-assistant-',{
      method:'POST',
      headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},
      body:JSON.stringify({mode:'speech',text:spokenText})
    });
    if(!res.ok)throw new Error('VOICE_FAILED');
    const blob=await res.blob();if(token!==aiSpeechToken||!aiVoiceEnabled)return;
    aiSpeechUrl=URL.createObjectURL(blob);aiSpeechAudio=new Audio(aiSpeechUrl);aiSpeechAudio.preload='auto';aiSpeechAudio.setAttribute('playsinline','');
    aiSpeechAudio.onended=()=>{if(aiSpeechUrl){URL.revokeObjectURL(aiSpeechUrl);aiSpeechUrl=''}aiSpeechAudio=null};
    await aiSpeechAudio.play();
  }catch(error){console.warn('Abdullah voice unavailable',error)}
}
function updateAIVoiceButton(){const btn=document.getElementById('aiVoiceToggle');if(btn){btn.textContent=aiVoiceEnabled?'🔊':'🔇';btn.classList.toggle('off',!aiVoiceEnabled)}}
function weeklyLeaveSummary(){
  const from=addDaysISO(todayISO(),1),to=addDaysISO(todayISO(),7);
  let starting=0,returning=0;
  state.leaves.forEach(leave=>{
    if(leave.start>=from&&leave.start<=to)starting++;
    const returnDuty=firstWorkDayAfterLeave(leave.end);
    const returnDate=returnDuty?.date||addDaysISO(leave.end,1);
    if(returnDate>=from&&returnDate<=to)returning++;
  });
  return {starting,returning};
}
function aiWeeklySummaryText(){
  const {starting,returning}=weeklyLeaveSummary();
  if(!starting&&!returning)return 'هذا الأسبوع ما فيه إجازات مجدولة تبدأ أو ترجع.';
  const parts=[];
  if(starting)parts.push(`${starting} إجازات تبدأ`);
  if(returning)parts.push(`${returning} يرجعون`);
  return `هذا الأسبوع عندك ${parts.join(' و')}.`;
}
function aiDailyGreetingText(){
  const hour=new Date().getHours();
  const prefix=hour<12?'صباح الخير رامي':'مساء الخير رامي';
  const items=todaySummaryItems();
  const daily=!items.length?`${prefix}. ما عندك تذكيرات مجدولة اليوم.`
    :items.length===1?`${prefix}. عندك اليوم ${items[0]}.`
    :`${prefix}. عندك اليوم ${items.length===2?'تذكيرين':items.length+' تذكيرات'}: ${items.join('، و')}.`;
  return `${daily} ${aiWeeklySummaryText()}`;
}
async function runDailyGreeting(){
  await aiSpeak(aiDailyGreetingText());
}
function toggleAIVoice(){
  aiVoiceEnabled=!aiVoiceEnabled;localStorage.setItem('shiftManagerAIVoice',aiVoiceEnabled?'on':'off');updateAIVoiceButton();
  if(aiRealtimeAudio)aiRealtimeAudio.muted=!aiVoiceEnabled;
  if(!aiVoiceEnabled)aiStopSpeech();
}
function aiAnnualIndicatorsSnapshot(year=Number(todayISO().slice(0,4))){
  year=Number(year)||Number(todayISO().slice(0,4));
  const today=todayISO(),yearStart=`${year}-01-01`,yearEnd=`${year}-12-31`,total=state.employees.length;
  const entered=state.leaves.filter(l=>l.start<=yearEnd&&l.end>=yearStart);
  const taken=entered.filter(l=>l.start<=today);
  const needsClearance=state.employees.filter(e=>(Number(e.leaveBalance)||0)>9).sort((a,b)=>Number(b.leaveBalance)-Number(a.leaveBalance));
  const clearanceDays=needsClearance.reduce((sum,e)=>sum+Math.max(0,(Number(e.leaveBalance)||0)-9),0);
  return {
    year,totalEmployees:total,enteredLeaves:entered.length,takenLeaves:taken.length,
    completionPercent:entered.length?Math.round(taken.length/entered.length*100):0,
    employeesNeedingClearance:needsClearance.length,clearanceDays:formatDays(clearanceDays),
    highestBalances:needsClearance.map(e=>({employeeId:e.id,name:aiDisplayEmployee(e),badge:e.empId||'',balance:formatDays(e.leaveBalance),daysToClear:formatDays((Number(e.leaveBalance)||0)-9)}))
  };
}
function aiDashboardSnapshot(year=Number(todayISO().slice(0,4))){
  const today=todayISO();
  const onLeave=state.employees.filter(e=>employeeStatus(e).text==='إجازة').length;
  let alertsNext3Days=0;
  state.leaves.forEach(l=>{const ds=diffDays(l.start,today),de=diffDays(l.end,today);if((ds>=0&&ds<=SOON_DAYS)||(de>=0&&de<=SOON_DAYS))alertsNext3Days++});
  alertsNext3Days+=state.personalNotes.filter(n=>{const d=diffDays(n.date,today);return d>=0&&d<=SOON_DAYS}).length;
  const current=groupShiftForDate(today);
  return {
    today,totalEmployees:state.employees.length,onDuty:state.employees.length-onLeave,onLeave,
    alertsNext3Days,currentGroupShift:{code:current.code,name:current.name,arabic:current.code==='OFF'?'راحة':current.arabic},
    annualIndicators:aiAnnualIndicatorsSnapshot(year)
  };
}
// ==================== المساعد الذكي: جلسة Realtime الصوتية (WebRTC) ====================
function aiRealtimeInstructions(){
  return `أنت مساعد الشفت الصوتي الخاص برامي، مشرف الأمن الصناعي. تحدث دائمًا بالعربية السعودية الحجازية بصوت طبيعي ودافئ مثل زميل يعرف رامي، وليس كمجيب آلي أو موظف خدمة عملاء. اختصر في الكلام اليومي، وافهم المزح والتحية ورد بعفوية. لا تقل: كيف أقدر أخدمك، كيف يمكنني مساعدتك، يرجى التوضيح، أو أنا هنا لمساعدتك. لا تسرد قدراتك إلا إذا سألك رامي.
عندك أدوات توصلك ببيانات النظام الفعلية (موظفين، إجازات، مؤشرات، سجلات، إنجازات، شفتات، مواقع، Marine ID، ملاحظات). استخدمها دائمًا لأي رقم أو اسم أو تاريخ حقيقي — ممنوع تختلق أو تخمّن أي بيانة. نفّذ كل الأدوات اللازمة أولًا، ثم رد فورًا في نفس الدورة؛ ممنوع تقول «بأشيك» أو «لحظة» أو «بأجهز» وتتوقف قبل تنفيذ الأداة. إذا احتجت تحدد موظف بالاسم استخدم find_employee أولًا؛ إذا رجع أكثر من نتيجة لا تخمّن، اسأل رامي أيهم يقصد.
تسجيل الملاحظات والتأخير والتذكيرات لا يحتاج تكرار تأكيد؛ نفّذها مباشرة بعد اكتمال الاسم والتاريخ والتفصيل. الإجازة فقط تحتاج تأكيدًا واحدًا: كرر الاسم والتاريخ مرة واحدة، وبعد أي موافقة طبيعية مثل نعم أو تمام أو أوكي أو أبشر أو اعتمد نفّذ الحفظ ولا تطلب تأكيدًا ثانيًا. افحص تداخل الإجازة والرصيد قبل الحفظ. إذا طلب رامي إرسال واتساب لموظف، استخدم أداة open_whatsapp مع الموظف ونص الرسالة، واعرض الاسم والرقم والنص واطلب تأكيدًا واحدًا؛ بعد الموافقة ستفتح الصفحة واتساب بالنص الجاهز، ولا تقل إن الرسالة أُرسلت لأن رامي هو من يضغط إرسال داخل واتساب. لا تقل «تم الحفظ» إلا إذا أعادت الأداة ok:true.
تاريخ اليوم ${todayISO()}.`;
}
function aiRealtimeTools(){return [
  {type:'function',name:'find_employee',description:'ابحث عن موظف بالاسم أو رقمه لتحديد هويته أو جلب رقم جواله أو رصيده أو شفته.',parameters:{type:'object',properties:{query:{type:'string'}},required:['query']}},
  {type:'function',name:'get_employee_leaves',description:'إجازات موظف محدد (سابقة وحالية وقادمة).',parameters:{type:'object',properties:{employee_id:{type:'string'},employee_name:{type:'string'}}}},
  {type:'function',name:'get_leaves_in_range',description:'كل الإجازات المتقاطعة مع نطاق تاريخ معيّن، مثل شهر كامل.',parameters:{type:'object',properties:{start:{type:'string',description:'YYYY-MM-DD'},end:{type:'string',description:'YYYY-MM-DD'}},required:['start','end']}},
  {type:'function',name:'list_employees_on_leave_at',description:'كل الموظفين اللي في إجازة في تاريخ محدد.',parameters:{type:'object',properties:{date:{type:'string',description:'YYYY-MM-DD'}},required:['date']}},
  {type:'function',name:'get_dashboard_indicators',description:'إجمالي الموظفين، على رأس العمل، في إجازة الآن، والتنبيهات خلال 3 أيام.',parameters:{type:'object',properties:{}}},
  {type:'function',name:'get_annual_leave_indicators',description:'مؤشرات إجازات السنة: المدخلة، المأخوذة، نسبة الإنجاز، ومن يحتاج تصفية.',parameters:{type:'object',properties:{year:{type:'integer'}}}},
  {type:'function',name:'get_group_shift',description:'كود واسم شفت Group A الساري في تاريخ محدد.',parameters:{type:'object',properties:{date:{type:'string',description:'YYYY-MM-DD'}},required:['date']}},
  {type:'function',name:'get_employee_records',description:'سجلات تأخير أو ملاحظات موظف محدد.',parameters:{type:'object',properties:{employee_id:{type:'string'},employee_name:{type:'string'},type:{type:'string',description:'Late أو Note، اختياري'}}}},
  {type:'function',name:'get_employee_achievements',description:'إنجازات موظف محدد.',parameters:{type:'object',properties:{employee_id:{type:'string'},employee_name:{type:'string'}}}},
  {type:'function',name:'list_personal_notes',description:'تذكيرات رامي الشخصية، مع إمكانية تصفية بتاريخ محدد.',parameters:{type:'object',properties:{date:{type:'string',description:'YYYY-MM-DD، اختياري'}}}},
  {type:'function',name:'get_employee_marine_status',description:'حالة بطاقة Marine ID لموظف محدد: سارية أو تنتهي قريبًا أو منتهية.',parameters:{type:'object',properties:{employee_id:{type:'string'},employee_name:{type:'string'}}}},
  {type:'function',name:'get_employee_location',description:'الموقع أو البوابة المخصصة لموظف في تاريخ محدد؛ يستخدم اليوم افتراضيًا إن لم يُذكر تاريخ.',parameters:{type:'object',properties:{employee_id:{type:'string'},employee_name:{type:'string'},date:{type:'string',description:'YYYY-MM-DD، اختياري'}}}},
  {type:'function',name:'save_leave',description:'حفظ إجازة موظف بعد فحص التداخل والرصيد وبعد تأكيد واحد فقط من رامي',parameters:{type:'object',properties:{employee_id:{type:'string'},employee_name:{type:'string'},start:{type:'string',description:'YYYY-MM-DD'},end:{type:'string',description:'YYYY-MM-DD'},note:{type:'string'}},required:['employee_id','start','end']}},
  {type:'function',name:'save_late',description:'حفظ تأخير موظف مباشرة عند اكتمال البيانات',parameters:{type:'object',properties:{employee_id:{type:'string'},employee_name:{type:'string'},date:{type:'string',description:'YYYY-MM-DD'},minutes:{type:'integer'}},required:['employee_id','date','minutes']}},
  {type:'function',name:'save_employee_note',description:'حفظ ملاحظة موظف مباشرة عند اكتمال البيانات',parameters:{type:'object',properties:{employee_id:{type:'string'},employee_name:{type:'string'},date:{type:'string',description:'YYYY-MM-DD'},note:{type:'string'}},required:['employee_id','date','note']}},
  {type:'function',name:'save_personal_note',description:'حفظ تذكير رامي مباشرة عند اكتمال التاريخ والنص',parameters:{type:'object',properties:{date:{type:'string',description:'YYYY-MM-DD'},note:{type:'string'}},required:['date','note']}},
  {type:'function',name:'open_whatsapp',description:'تجهيز رسالة واتساب لموظف وفتحها بعد تأكيد واحد من رامي',parameters:{type:'object',properties:{employee_id:{type:'string'},employee_name:{type:'string'},message:{type:'string'}},required:['message']}}
]}
function aiRealtimeSend(event){if(aiRealtimeDc?.readyState==='open')aiRealtimeDc.send(JSON.stringify(event))}
function aiRealtimeUpdateContext(){aiRealtimeSend({type:'session.update',session:{type:'realtime',instructions:aiRealtimeInstructions(),tools:aiRealtimeTools(),tool_choice:'auto'}})}
function aiRealtimeToolResult(callId,result){
  if(String(callId).startsWith('approved-')){
    const speak=result?.message||result?.error||(result?.ok?'تم التنفيذ':'حدث خطأ ولم يتم التنفيذ');
    const payload={type:'response.create',response:{instructions:`انطق نتيجة التنفيذ التالية فورًا فقط كما هي، بدون تمهيد أو وعد بالرجوع أو إعادة فحص: ${speak}`}};
    if(aiRealtimeResponseActive){aiRealtimeResponsePending=payload;return}
    aiRealtimeSend(payload);return;
  }
  aiRealtimeSend({type:'conversation.item.create',item:{type:'function_call_output',call_id:callId,output:JSON.stringify(result)}});
  const payload=(result?.ok&&result?.message)
    ?{type:'response.create',response:{instructions:`انطق نتيجة التنفيذ التالية فورًا فقط كما هي، بدون تمهيد أو وعد بالرجوع أو إعادة فحص: ${result.message}`}}
    :{type:'response.create'};
  if(aiRealtimeResponseActive){aiRealtimeResponsePending=payload;return}
  aiRealtimeSend(payload);
}
function aiRealtimeEmployee(args){
  let employee=state.employees.find(e=>e.id===args.employee_id);
  if(employee)return employee;
  const found=aiFindEmployee(args.employee_name||'');return found.status==='one'?found.employee:null;
}
function aiBalanceThreshold(raw){
  const q=aiNormalize(raw);if(!q.includes('رصيد')||!q.includes('فوق'))return null;
  const words={صفر:0,واحد:1,اثنين:2,ثلاثه:3,اربعه:4,خمسه:5,سته:6,سبعه:7,ثمانيه:8,تسعه:9,عشره:10,عشرين:20,ثلاثين:30};
  const numeric=q.match(/فوق\s+(\d+(?:\.\d+)?)/);if(numeric)return Number(numeric[1]);
  for(const [word,value] of Object.entries(words))if(q.includes(`فوق ${word}`))return value;
  return null;
}
function aiVerifiedReadReply(raw){
  const q=aiNormalize(raw),year=aiRequestedYear(raw),snapshot=aiDashboardSnapshot(year);
  const threshold=aiBalanceThreshold(raw);
  if(threshold!==null){
    const rows=state.employees.filter(e=>(Number(e.leaveBalance)||0)>threshold).sort((a,b)=>Number(b.leaveBalance)-Number(a.leaveBalance));
    return `عدد الموظفين اللي رصيدهم فوق ${formatDays(threshold)} أيام: ${rows.length} موظف.`;
  }
  if(q.includes('مؤشر السنه')||q.includes('مؤشرات السنه')||q.includes('تقرير السنه')||q.includes('مؤشر الاجازات')||q.includes('تقرير المؤشرات')){
    const a=snapshot.annualIndicators;return `مؤشرات سنة ${a.year}: الإجازات المدخلة ${a.enteredLeaves}، والمأخوذة ${a.takenLeaves}، ونسبة الإنجاز ${a.completionPercent} بالمئة، ويحتاجون تصفية ${a.employeesNeedingClearance} موظف.`;
  }
  if(q.includes('على راس العمل')||q.includes('المتاحين اليوم')||q.includes('المتاحون اليوم'))return `على رأس العمل اليوم ${snapshot.onDuty} موظف.`;
  if(q.includes('في اجازه الان')||q.includes('في اجازه حاليا'))return `في إجازة الآن ${snapshot.onLeave} موظفين.`;
  if(q.includes('تنبيه')&&(q.includes('3')||q.includes('ثلاث')))return `التنبيهات خلال ثلاثة أيام: ${snapshot.alertsNext3Days}.`;
  if(q.includes('اجمالي الموظفين')||q.includes('عدد الموظفين')||q.includes('كم اجمالي الموظفين')||/كم\s+موظف\s+(?:عندنا|معانا|في القروب|في المجموع)/.test(q))return `إجمالي الموظفين ${snapshot.totalEmployees} موظف.`;
  if(/(دوامي|دوامنا|شفتنا|دوام الشفت|دوام قروب|group a)/.test(q)){
    let date=aiRequestedShiftDate(raw);if(!date){if(q.includes('بعد بكره'))date=aiOffsetDate(2);else if(q.includes('بكره')||q.includes('غدا'))date=aiOffsetDate(1);else if(q.includes('اليوم'))date=todayISO()}
    if(date){const shift=groupShiftForDate(date),label=shift.code==='OFF'?'راحة':shift.arabic;return `دوام Group A يوم ${fmtDate(date)}: ${shift.code}، ${label}.`}
  }
  return '';
}
function aiRealtimeAnswerVerified(reply){
  aiRealtimeSend({type:'response.create',response:{instructions:`انطق الجواب التالي فقط كما هو، بدون مقدمة أو إضافة أو اعتذار: ${reply}`}});
}
async function aiPersistAssistantMutation(snapshot){
  localStorage.setItem(KEY,JSON.stringify(state));renderAll();clearTimeout(syncTimer);
  try{setCloudStatus('','جاري الحفظ');await uploadCloudState();setCloudStatus('online','تم الحفظ والمزامنة');return true}
  catch(error){console.error('[DEBUG] aiPersistAssistantMutation failed:',error?.message||error);state=snapshot;localStorage.setItem(KEY,JSON.stringify(state));renderAll();setCloudStatus('offline','تعذر الحفظ');return false}
}
function aiRealtimeEmployeeBrief(e){
  return {id:e.id,name:aiDisplayEmployee(e),empId:e.empId||'',phone:localPhone(e.phone)||'',leaveBalance:formatDays(e.leaveBalance),shift:e.shift||'',position:e.position||'',dutyRole:e.dutyRole||''};
}
function aiRealtimeRunReadTool(name,args){
  switch(name){
    case 'find_employee':{
      const found=aiFindEmployee(args?.query||'');
      if(found.status==='one')return {count:1,employees:[aiRealtimeEmployeeBrief(found.employee)]};
      if(found.status==='many')return {count:found.items.length,employees:found.items.slice(0,6).map(aiRealtimeEmployeeBrief)};
      return {count:0,employees:[]};
    }
    case 'get_employee_leaves':{
      const employee=aiRealtimeEmployee(args);if(!employee)return {error:'لم أجد الموظف المحدد'};
      const rows=state.leaves.filter(l=>l.employeeId===employee.id).sort((a,b)=>String(a.start).localeCompare(String(b.start)));
      return {count:rows.length,leaves:rows.map(l=>({start:l.start,end:l.end,note:l.note||''}))};
    }
    case 'get_leaves_in_range':{
      const start=String(args?.start||''),end=String(args?.end||'');
      const rows=state.leaves.filter(l=>l.start<=end&&l.end>=start).sort((a,b)=>String(a.start).localeCompare(String(b.start))).slice(0,30);
      return {count:rows.length,leaves:rows.map(l=>({employeeId:l.employeeId,name:aiEmployeeName(l.employeeId),start:l.start,end:l.end}))};
    }
    case 'list_employees_on_leave_at':{
      const date=String(args?.date||'');
      const rows=state.leaves.filter(l=>l.start<=date&&l.end>=date);
      return {count:rows.length,employees:rows.map(l=>({employeeId:l.employeeId,name:aiEmployeeName(l.employeeId),returnDate:l.end}))};
    }
    case 'get_dashboard_indicators':{
      const s=aiDashboardSnapshot();
      return {today:s.today,totalEmployees:s.totalEmployees,onDuty:s.onDuty,onLeave:s.onLeave,alertsNext3Days:s.alertsNext3Days,currentGroupShift:s.currentGroupShift};
    }
    case 'get_annual_leave_indicators':
      return aiAnnualIndicatorsSnapshot(Number(args?.year)||undefined);
    case 'get_group_shift':{
      const date=String(args?.date||'');if(!date)return {error:'التاريخ مطلوب'};
      const info=groupShiftForDate(date);
      return {code:info.code,arabic:info.code==='OFF'?'راحة':info.arabic,periodStart:shiftPeriodStart(date,info.code),periodEnd:shiftPeriodEnd(date,info.code)};
    }
    case 'get_employee_records':{
      const employee=aiRealtimeEmployee(args);if(!employee)return {error:'لم أجد الموظف المحدد'};
      let rows=state.records.filter(r=>r.employeeId===employee.id);
      if(args?.type)rows=rows.filter(r=>r.type===args.type);
      rows=rows.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
      return {count:rows.length,records:rows.map(r=>({type:r.type,date:r.date,note:r.note||''}))};
    }
    case 'get_employee_achievements':{
      const employee=aiRealtimeEmployee(args);if(!employee)return {error:'لم أجد الموظف المحدد'};
      const rows=state.achievements.filter(a=>a.employeeId===employee.id);
      return {count:rows.length,achievements:rows.map(a=>({type:a.type,date:a.date,note:a.note||''}))};
    }
    case 'list_personal_notes':{
      let rows=Array.isArray(state.personalNotes)?state.personalNotes:[];
      if(args?.date)rows=rows.filter(n=>n.date===args.date);
      rows=rows.slice(-20);
      return {count:rows.length,notes:rows.map(n=>({date:n.date,text:n.text}))};
    }
    case 'get_employee_marine_status':{
      const employee=aiRealtimeEmployee(args);if(!employee)return {error:'لم أجد الموظف المحدد'};
      const expiry=marineExpiryFor(employee);if(!expiry)return {status:'missing',label:'غير مسجل'};
      const status=marineStatus(employee);
      return {expiry,status:status.kind,label:status.label};
    }
    case 'get_employee_location':{
      const employee=aiRealtimeEmployee(args);if(!employee)return {error:'لم أجد الموظف المحدد'};
      const date=aiSafeDate(args?.date);
      return {date,location:rosterLocationForDate(employee,date)};
    }
    default:
      return {error:'أداة غير معروفة'};
  }
}
const AI_REALTIME_READ_TOOLS=new Set(['find_employee','get_employee_leaves','get_leaves_in_range','list_employees_on_leave_at','get_dashboard_indicators','get_annual_leave_indicators','get_group_shift','get_employee_records','get_employee_achievements','list_personal_notes','get_employee_marine_status','get_employee_location']);
async function aiHandleRealtimeTool(event){
  const callId=event.call_id;if(!callId||aiRealtimeHandledCalls.has(callId))return;aiRealtimeHandledCalls.add(callId);
  let args={};try{args=JSON.parse(event.arguments||'{}')}catch{return aiRealtimeToolResult(callId,{ok:false,error:'البيانات غير مفهومة'})}
  if(AI_REALTIME_READ_TOOLS.has(event.name))return aiRealtimeToolResult(callId,aiRealtimeRunReadTool(event.name,args));
  if(event.name==='save_leave'&&!aiRealtimeLeaveApprovalPending?.approved){
    const employee=aiRealtimeEmployee(args);if(!employee)return aiRealtimeToolResult(callId,{ok:false,error:'لم أجد الموظف المحدد'});
    const start=String(args.start||''),end=String(args.end||'');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||end<start)return aiRealtimeToolResult(callId,{ok:false,error:'تواريخ الإجازة غير صحيحة'});
    const check=checkLeaveCapacity(employee.id,start,end);
    if(check.employeeConflict)return aiRealtimeToolResult(callId,{ok:false,error:`لدى ${aiDisplayEmployee(employee)} إجازة متداخلة من ${check.employeeConflict.start} إلى ${check.employeeConflict.end}`});
    if(check.blocked.length)return aiRealtimeToolResult(callId,{ok:false,error:'لا يمكن الحفظ لأن عدد المجازين سيتجاوز الحد الأعلى وهو 6 في بعض الأيام'});
    const days=diffDays(end,start)+1,available=Number(employee.leaveBalance)||0;
    const balanceWarning=days>available?` تنبيه: الرصيد المتاح ${formatDays(available)} يوم فقط وهو أقل من مدة الإجازة ${days} يوم، اذكر هذا التحذير ضمن نفس التأكيد.`:'';
    aiRealtimeLeaveApprovalPending={args:{employee_id:employee.id,start,end,note:String(args.note||'').trim().slice(0,500),days},approved:false};
    return aiRealtimeToolResult(callId,{ok:false,needs_confirmation:true,error:`اعرض الاسم وتاريخ البداية والنهاية واطلب تأكيدًا واحدًا فقط.${balanceWarning} بعد موافقة رامي ستنفذ الصفحة الحفظ مباشرة`})
  }
  if(event.name==='open_whatsapp'&&!aiRealtimeWhatsAppPending?.approved){
    const employee=aiRealtimeEmployee(args),message=String(args.message||'').trim().slice(0,1500);
    if(!employee)return aiRealtimeToolResult(callId,{ok:false,error:'لم أجد الموظف المحدد'});
    const phone=localPhone(employee.phone);if(!normalizeSaudiPhone(employee.phone))return aiRealtimeToolResult(callId,{ok:false,error:`لا يوجد رقم جوال مسجل لـ ${aiDisplayEmployee(employee)}`});
    if(!message)return aiRealtimeToolResult(callId,{ok:false,error:'احتاج نص رسالة واتساب'});
    aiRealtimeWhatsAppPending={args:{employee_id:employee.id,employee_name:aiDisplayEmployee(employee),message},approved:false};
    return aiRealtimeToolResult(callId,{ok:false,needs_confirmation:true,error:`اعرض للتأكيد مرة واحدة: ${aiDisplayEmployee(employee)}، الرقم ${phone}، ونص الرسالة: ${message}`});
  }
  if(event.name==='open_whatsapp')aiRealtimeWhatsAppPending=null;
  const date=aiSafeDate(args.date),now=new Date().toISOString(),snapshot=JSON.parse(JSON.stringify(state));
  if(event.name==='save_personal_note'){
    const note=String(args.note||'').trim().slice(0,500);if(!note)return aiRealtimeToolResult(callId,{ok:false,error:'الملاحظة فارغة'});
    state.personalNotes.push({id:(crypto.randomUUID?crypto.randomUUID():('note-'+Date.now())),date,text:note,createdAt:now,source:'realtime'});if(!await aiPersistAssistantMutation(snapshot))return aiRealtimeToolResult(callId,{ok:false,error:'تعذر الحفظ في النظام؛ لم يتم تسجيل التذكير'});
    return aiRealtimeToolResult(callId,{ok:true,message:'تم حفظ التذكير'});
  }
  const employee=aiRealtimeEmployee(args);if(!employee)return aiRealtimeToolResult(callId,{ok:false,error:'لم أجد الموظف المحدد'});
  if(event.name==='open_whatsapp'){
    const opened=aiOpenWhatsApp(employee,args.message);
    return aiRealtimeToolResult(callId,opened.ok?{ok:true,message:`تم فتح واتساب لـ ${aiDisplayEmployee(employee)} والرسالة جاهزة؛ اضغط إرسال داخل واتساب`}:{ok:false,error:opened.error});
  }
  if(event.name==='save_leave'){
    aiRealtimeLeaveApprovalPending=null;
    const start=String(args.start||''),end=String(args.end||''),days=Number(args.days)||(diffDays(end,start)+1);
    employee.leaveBalance=(Number(employee.leaveBalance)||0)-days;
    state.leaves.push({id:(crypto.randomUUID?crypto.randomUUID():('leave-'+Date.now())),employeeId:employee.id,start,end,note:String(args.note||'').trim().slice(0,500),balanceDaysCharged:days,source:'realtime'});
    if(!await aiPersistAssistantMutation(snapshot))return aiRealtimeToolResult(callId,{ok:false,error:'تعذر الحفظ في النظام؛ لم يتم تسجيل الإجازة'});
    return aiRealtimeToolResult(callId,{ok:true,message:`تم حفظ إجازة ${aiDisplayEmployee(employee)} من ${start} إلى ${end} وخصم ${days} يوم من الرصيد`});
  }
  if(event.name==='save_late'){
    const minutes=Math.max(1,Math.min(1440,Number(args.minutes)||0));if(!minutes)return aiRealtimeToolResult(callId,{ok:false,error:'مدة التأخير غير صحيحة'});
    state.records.push({id:(crypto.randomUUID?crypto.randomUUID():('rec-'+Date.now())),employeeId:employee.id,type:'Late',date,note:`تأخير ${minutes} دقيقة`,createdAt:now,source:'realtime'});if(!await aiPersistAssistantMutation(snapshot))return aiRealtimeToolResult(callId,{ok:false,error:'تعذر الحفظ في النظام؛ لم يتم تسجيل التأخير'});
    return aiRealtimeToolResult(callId,{ok:true,message:`تم حفظ تأخير ${aiDisplayEmployee(employee)} لمدة ${minutes} دقيقة`});
  }
  if(event.name==='save_employee_note'){
    const note=String(args.note||'').trim().slice(0,500);if(!note)return aiRealtimeToolResult(callId,{ok:false,error:'الملاحظة فارغة'});
    state.records.push({id:(crypto.randomUUID?crypto.randomUUID():('rec-'+Date.now())),employeeId:employee.id,type:'Note',date,note,createdAt:now,source:'realtime'});if(!await aiPersistAssistantMutation(snapshot))return aiRealtimeToolResult(callId,{ok:false,error:'تعذر الحفظ في النظام؛ لم يتم تسجيل الملاحظة'});
    return aiRealtimeToolResult(callId,{ok:true,message:`تم حفظ الملاحظة في سجل ${aiDisplayEmployee(employee)}`});
  }
  aiRealtimeToolResult(callId,{ok:false,error:'الأداة غير معروفة'});
}
function aiHandleRealtimeEvent(event){
  if(event.type==='response.created')aiRealtimeResponseActive=true;
  if(event.type==='conversation.item.input_audio_transcription.completed'&&event.transcript?.trim()){
    aiRealtimeLastUserText=event.transcript.trim();const q=aiNormalize(aiRealtimeLastUserText);
    aiRealtimeWaitingRetry=false;
    aiAddMessage(aiRealtimeLastUserText,'user','',false);
    if(aiRealtimeLeaveApprovalPending&&(q==='لا'||q.includes('الغ')||q.includes('مو موافق'))){
      aiRealtimeLeaveApprovalPending=null;
      aiRealtimeAnswerVerified('تم إلغاء الإجازة، وما تغيّر شيء.');return;
    }
    if(aiRealtimeLeaveApprovalPending&&(q==='نعم'||q==='ايوه'||q.includes('موافق')||q.includes('تمام')||q.includes('اوكي')||q.includes('ابشر')||q.includes('اعتمد')||q.includes('اكد'))){
      const pending=aiRealtimeLeaveApprovalPending;pending.approved=true;
      aiHandleRealtimeTool({call_id:'approved-leave-'+Date.now(),name:'save_leave',arguments:JSON.stringify(pending.args)}).catch(error=>console.error('Realtime approved leave',error));return;
    }
    if(aiRealtimeWhatsAppPending&&(q==='لا'||q.includes('الغ')||q.includes('مو موافق'))){aiRealtimeWhatsAppPending=null;aiRealtimeAnswerVerified('تم إلغاء رسالة واتساب.');return}
    if(aiRealtimeWhatsAppPending&&(q==='نعم'||q==='ايوه'||q.includes('موافق')||q.includes('تمام')||q.includes('اوكي')||q.includes('ابشر')||q.includes('اعتمد')||q.includes('اكد'))){const pending=aiRealtimeWhatsAppPending;pending.approved=true;aiHandleRealtimeTool({call_id:'approved-whatsapp-'+Date.now(),name:'open_whatsapp',arguments:JSON.stringify(pending.args)}).catch(error=>console.error('Realtime approved WhatsApp',error));return}
    const verifiedReply=aiVerifiedReadReply(aiRealtimeLastUserText);
    if(verifiedReply)aiRealtimeAnswerVerified(verifiedReply);else aiRealtimeSend({type:'response.create'});
  }
  if(event.type==='conversation.item.input_audio_transcription.failed')aiRealtimeSend({type:'response.create'});
  if(event.type==='response.output_audio_transcript.delta')aiRealtimeTranscript+=(event.delta||'');
  if(event.type==='response.output_audio_transcript.done'){
    const text=(event.transcript||aiRealtimeTranscript).trim();aiRealtimeTranscript='';if(text)aiAddMessage(text,'bot','',false);
    const waiting=/(خليني|لحظة|ثواني|بأشيك|باشيك|أشيك|بشوف|أشوف|براجع|أراجع|بأتأكد|أتأكد|أتحقق|بأجهز|بجهز|أجهز|راح\s+أجهز).{0,80}(وأرد|وارجع|وأرجع|عليك|لك|الرد|النتيجة|من البيانات|من التداخل|من الرصيد|بناء\s+على)/i;
    if(text&&waiting.test(text)&&!aiRealtimeWaitingRetry&&!aiRealtimeResponseActive){
      aiRealtimeWaitingRetry=true;
      aiRealtimeSend({type:'response.create',response:{instructions:'أكمل الآن ولا تنتظر سؤالًا آخر. افحص بيانات السياق وأعطِ رامي النتيجة النهائية مباشرة. ممنوع قول لحظة أو بأشيك أو سأرد عليك.'}});
    }
  }
  if(event.type==='response.function_call_arguments.done')aiHandleRealtimeTool(event).catch(error=>console.error('Realtime tool',error));
  if(event.type==='response.done'){
    aiRealtimeResponseActive=false;
    if(aiRealtimeResponsePending){const pending=aiRealtimeResponsePending;aiRealtimeResponsePending=null;aiRealtimeSend(pending)}
  }
  if(event.type==='error'){console.error('OpenAI realtime',event);const e=event.error||{};const debugMsg=`[DEBUG] code:${e.code||'—'} | type:${e.type||'—'} | param:${e.param||'—'} | event_id:${e.event_id||'—'} | msg:${e.message||'—'}`;aiAddMessage('صار خلل بسيط في الاتصال الصوتي. اقفل المايك وشغّله مرة ثانية.\n'+debugMsg,'error','',false)}
}
function aiStopRealtime(showMessage=true){
  const wasActive=aiRealtimeConnected||aiRealtimeConnecting;aiRealtimeConnected=false;aiRealtimeConnecting=false;aiIsListening=false;
  try{aiRealtimeDc?.close()}catch{}try{aiRealtimePc?.close()}catch{}aiRealtimeStream?.getTracks().forEach(t=>t.stop());
  if(aiRealtimeAudio){aiRealtimeAudio.pause();aiRealtimeAudio.srcObject=null}
  aiRealtimeDc=null;aiRealtimePc=null;aiRealtimeStream=null;aiRealtimeAudio=null;aiRealtimeTranscript='';aiRealtimeLastUserText='';aiRealtimeLeaveApprovalPending=null;aiRealtimeWhatsAppPending=null;aiRealtimeWaitingRetry=false;aiRealtimeHandledCalls.clear();aiRealtimeResponseActive=false;aiRealtimeResponsePending=null;
  document.getElementById('aiMicBtn')?.classList.remove('listening');const input=document.getElementById('aiInput');if(input)input.placeholder='مثال: سجل عند أحمد تأخير اليوم 20 دقيقة';
  if(showMessage&&wasActive)aiAddMessage('تم إنهاء المحادثة الصوتية.','bot','',false);
}
async function aiStartRealtime(){
  if(aiRealtimeConnecting||aiRealtimeConnected)return;if(!session?.access_token)return aiAddMessage('سجّل الدخول أول عشان أشغّل المحادثة الصوتية.','error');
  if(!window.RTCPeerConnection||!navigator.mediaDevices?.getUserMedia)return aiAddMessage('المحادثة الصوتية المباشرة غير مدعومة في هذا المتصفح. افتح الموقع في Safari محدّث.','error');
  aiRealtimeConnecting=true;aiStopSpeech();const mic=document.getElementById('aiMicBtn');mic?.classList.add('listening');const input=document.getElementById('aiInput');if(input)input.placeholder='جاري تشغيل المحادثة الصوتية...';
  try{
    aiRealtimeStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    aiRealtimePc=new RTCPeerConnection();aiRealtimeAudio=document.createElement('audio');aiRealtimeAudio.autoplay=true;aiRealtimeAudio.setAttribute('playsinline','');aiRealtimeAudio.muted=!aiVoiceEnabled;
    aiRealtimePc.ontrack=e=>{aiRealtimeAudio.srcObject=e.streams[0];aiRealtimeAudio.play().catch(()=>{})};
    aiRealtimeStream.getTracks().forEach(track=>aiRealtimePc.addTrack(track,aiRealtimeStream));
    aiRealtimeDc=aiRealtimePc.createDataChannel('oai-events');
    aiRealtimeDc.onopen=()=>{aiRealtimeConnecting=false;aiRealtimeConnected=true;aiIsListening=true;if(input)input.placeholder='المحادثة شغالة… تكلم براحتك';aiRealtimeUpdateContext();aiAddMessage('المحادثة الصوتية المباشرة جاهزة 🎙️','bot','',false)};
    aiRealtimeDc.onmessage=e=>{try{aiHandleRealtimeEvent(JSON.parse(e.data))}catch(error){console.warn('Realtime event',error)}};
    aiRealtimeDc.onclose=()=>{if(aiRealtimeConnected)aiStopRealtime(false)};
    const offer=await aiRealtimePc.createOffer();await aiRealtimePc.setLocalDescription(offer);
    const realtimeController=new AbortController(),realtimeTimer=setTimeout(()=>realtimeController.abort(),18000);
    let res;
    try{
      res=await fetch(SUPABASE_URL+'/functions/v1/shift-assistant-',{method:'POST',signal:realtimeController.signal,headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({mode:'realtime',sdp:offer.sdp})});
    }finally{clearTimeout(realtimeTimer)}
    const answer=await res.text();if(!res.ok)throw new Error(answer||'REALTIME_FAILED');
    await aiRealtimePc.setRemoteDescription({type:'answer',sdp:answer});
  }catch(error){console.error('Realtime start',error);aiStopRealtime(false);aiAddMessage(error?.name==='NotAllowedError'?'فعّل إذن الميكروفون من إعدادات Safari وبعدها جرّب مرة ثانية.':'ما قدرت أشغّل الاتصال الصوتي. تأكد من نشر آخر كود للدالة وجرّب مرة ثانية.','error','',false)}
}
function toggleAIListening(){if(aiRealtimeConnected||aiRealtimeConnecting)aiStopRealtime();else aiStartRealtime()}
function openAIAssistant(){
  document.getElementById('aiAssistantModal').classList.add('show');const chat=document.getElementById('aiChat');
  updateAIVoiceButton();
  if(chat&&!chat.children.length)aiAddMessage('هلا يا رامي 👋\nأنا حاضر. اسألني عن الإجازات والعودة، أو اطلب مني أسجّل تأخير أو ملاحظة.');
  setTimeout(()=>document.getElementById('aiInput')?.focus(),180);
}
function askAIQuick(text){const input=document.getElementById('aiInput');input.value=text;sendAIMessage()}
// ==================== المساعد الذكي: فهم الأسئلة النصية والردود ====================
function aiDelayDuration(text){
  const q=aiNormalize(text),words={واحد:1,وحده:1,ساعتين:2,اثنين:2,ثنتين:2,ثلاث:3,ثلاثه:3,اربع:4,اربعه:4,خمس:5,خمسه:5,ست:6,سته:6,سبع:7,سبعه:7,ثمان:8,ثمانيه:8,تسع:9,تسعه:9,عشر:10,عشره:10,خمستعش:15,خمسطعش:15,عشرين:20,نص:30,نصف:30,ثلاثين:30,اربعين:40,خمسين:50,ستين:60};
  if(/1\s*[\/\\]\s*4/.test(String(text))||q.includes('ربع'))return {minutes:15,label:'ربع ساعة'};
  const numberMatch=q.match(/\d+/);let amount=numberMatch?Number(numberMatch[0]):null;
  if(amount===null)for(const [word,value] of Object.entries(words))if(q.includes(word)){amount=value;break}
  if(q.includes('ساعتين'))amount=2;
  const isHours=/(ساعه|ساعتين|ساعات)/.test(q);
  if(amount===null&&isHours)amount=1;
  if(amount===null)return null;
  if(isHours&&(q.includes('نص')||q.includes('نصف')))return {minutes:30,label:'30 دقيقة'};
  const hourLabel=amount===1?'ساعة':amount===2?'ساعتين':`${amount} ساعات`;
  return {minutes:isHours?amount*60:amount,label:isHours?hourLabel:`${amount} دقيقة`};
}
function aiList(items,emptyText){return items.length?items.map((x,i)=>`${i+1}. ${x}`).join('\n'):emptyText}
function aiRequestedMonth(raw){
  const q=aiNormalize(raw),names={يناير:1,جانوري:1,فبراير:2,فبرابر:2,مارس:3,ابريل:4,مايو:5,يونيو:6,يونيه:6,يوليو:7,يوليه:7,اغسطس:8,سبتمبر:9,اكتوبر:10,نوفمبر:11,ديسمبر:12};
  let month=null;
  for(const [name,value] of Object.entries(names))if(q.includes(name)){month=value;break}
  if(month===null){const m=q.match(/(?:شهر|اجازات?)\s+(\d{1,2})(?:\s|$)/);if(m&&Number(m[1])>=1&&Number(m[1])<=12)month=Number(m[1])}
  if(month===null)return null;
  const yearMatch=q.match(/\b(20\d{2})\b/),year=yearMatch?Number(yearMatch[1]):Number(todayISO().slice(0,4));
  const start=`${year}-${String(month).padStart(2,'0')}-01`,end=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
  return {month,year,start,end};
}
function aiHandleMonthLeaveQuery(raw){
  const q=aiNormalize(raw),requested=aiRequestedMonth(raw);
  if(!requested||!(q.includes('اجازه')||q.includes('اجازات')))return false;
  const monthNames=['','يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  const rows=state.leaves.filter(l=>l.start<=requested.end&&l.end>=requested.start).sort((a,b)=>a.start.localeCompare(b.start)).map(l=>`${aiEmployeeName(l.employeeId)} — من ${fmtDate(l.start)} إلى ${fmtDate(l.end)}`);
  aiAddMessage(aiList(rows,`ما فيه إجازات مسجّلة في ${monthNames[requested.month]} ${requested.year}.`)+(rows.length?`\n\nالإجمالي: ${rows.length}`:''));
  return true;
}
function aiRequestedShiftDate(raw){
  const q=aiNormalize(raw),monthInfo=aiRequestedMonth(raw);if(!monthInfo)return null;
  const wordDays={واحد:1,اول:1,اثنين:2,ثنين:2,ثلاثه:3,ثلاث:3,اربعه:4,اربع:4,خمسه:5,خمس:5,سته:6,ست:6,سبعه:7,سبع:7,ثمانيه:8,ثمان:8,تسعه:9,تسع:9,عشره:10,عشر:10};
  const match=q.match(/(?:يوم|تاريخ)\s+(\d{1,2})/);let day=match?Number(match[1]):null;
  if(day===null)for(const [word,value] of Object.entries(wordDays))if(new RegExp(`(?:يوم|تاريخ)\\s+${word}(?:\\s|$)`).test(q)){day=value;break}
  if(day===null){const loose=q.match(/\b(\d{1,2})\b/);if(loose&&Number(loose[1])!==monthInfo.month)day=Number(loose[1])}
  if(!day||day>new Date(monthInfo.year,monthInfo.month,0).getDate())return null;
  return `${monthInfo.year}-${String(monthInfo.month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
function aiHandleGroupShiftQuery(raw){
  const q=aiNormalize(raw);if(!/(دوامي|دوامنا|شفتنا|دوام الشفت|دوام قروب|group a)/.test(q))return false;
  let date=aiRequestedShiftDate(raw);
  if(!date){if(q.includes('بعد بكره'))date=aiOffsetDate(2);else if(q.includes('بكره')||q.includes('غدا'))date=aiOffsetDate(1);else if(q.includes('اليوم'))date=todayISO()}
  if(!date)return false;
  const shift=groupShiftForDate(date),label=shift.code==='OFF'?'راحة':shift.arabic;
  aiAddMessage(`دوام Group A يوم ${fmtDate(date)}: ${shift.code} · ${label}.`);return true;
}
function aiRequestedYear(raw){
  const q=aiNormalize(raw),match=q.match(/\b(20\d{2})\b/);return match?Number(match[1]):Number(todayISO().slice(0,4));
}
function aiHandleDashboardQuery(raw){
  const q=aiNormalize(raw),snapshot=aiDashboardSnapshot(aiRequestedYear(raw));
  if(q.includes('مؤشر السنه')||q.includes('مؤشرات السنه')||q.includes('تقرير السنه')||q.includes('مؤشر الاجازات')||q.includes('تقرير المؤشرات')){
    const a=snapshot.annualIndicators,clearance=a.highestBalances.length?`\nأعلى الأرصدة المطلوب تصفيتها:\n${a.highestBalances.map((e,i)=>`${i+1}. ${e.name}: ${e.balance} يوم، المطلوب ${e.daysToClear} يوم`).join('\n')}`:'\nجميع الأرصدة ضمن حد الترحيل.';
    aiAddMessage(`مؤشرات سنة ${a.year}:\nالإجازات المدخلة: ${a.enteredLeaves}\nالإجازات المأخوذة: ${a.takenLeaves}\nنسبة الإنجاز: ${a.completionPercent}%\nيحتاجون تصفية: ${a.employeesNeedingClearance} موظف\nإجمالي أيام التصفية: ${a.clearanceDays}${clearance}`);return true;
  }
  if(q.includes('على راس العمل')||q.includes('المتاحين اليوم')||q.includes('المتاحون اليوم')){
    aiAddMessage(`على رأس العمل اليوم: ${snapshot.onDuty} من أصل ${snapshot.totalEmployees}. وفي إجازة الآن: ${snapshot.onLeave}.`);return true;
  }
  if(q.includes('في اجازه الان')||q.includes('في اجازه حاليا')){
    aiAddMessage(`في إجازة الآن: ${snapshot.onLeave} موظفين.`);return true;
  }
  if(q.includes('تنبيه')&&q.includes('3')){
    aiAddMessage(`التنبيهات خلال 3 أيام: ${snapshot.alertsNext3Days}.`);return true;
  }
  if(q.includes('اجمالي الموظفين')||q.includes('عدد الموظفين')||/كم\s+(?:عدد\s+)?الموظفين/.test(q)||/كم\s+موظف\s+(?:عندنا|معانا|في القروب|في المجموع)/.test(q)){
    aiAddMessage(`إجمالي الموظفين المسجّلين: ${snapshot.totalEmployees} موظف.`);return true;
  }
  return false;
}
function aiEmployeeFromConversation(raw){
  const found=aiFindEmployee(raw);
  if(found.status==='one'){aiLastEmployeeId=found.employee.id;return found.employee}
  if(found.status==='many')return null;
  const q=aiNormalize(raw),hasReference=/(^|\s)(له|حقه|رقمه|جواله|اجازته|رصيده|شفته|دوامه|ملاحظاته|انجازاته)(\s|$)/.test(q);
  return hasReference?state.employees.find(e=>e.id===aiLastEmployeeId)||null:null;
}
function aiHandleEmployeeLookup(raw){
  const q=aiNormalize(raw),employee=aiEmployeeFromConversation(raw);
  if(!employee)return false;
  if(q.includes('جوال')||q.includes('رقم جوال')||q.includes('رقمه')){
    const phone=localPhone(employee.phone);
    aiAddMessage(phone?`رقم جوال ${aiDisplayEmployee(employee)}: ${phone}`:`ما فيه رقم جوال مسجّل لـ ${aiDisplayEmployee(employee)} في البيانات.`);
    return true;
  }
  const leaves=state.leaves.filter(l=>l.employeeId===employee.id).sort((a,b)=>b.start.localeCompare(a.start));
  if(q.includes('اجازه')||q.includes('اجازته')){
    let selected=null,label='';
    if(q.includes('اخر')||q.includes('سابق')||q.includes('قديم')){
      selected=leaves.filter(l=>l.end<todayISO()).sort((a,b)=>b.end.localeCompare(a.end))[0];label='آخر إجازة سابقة';
      if(!selected){aiAddMessage(`لا توجد إجازة سابقة مسجّلة لـ ${aiDisplayEmployee(employee)}.`);return true}
    }else{
      selected=leaves.find(l=>l.start<=todayISO()&&l.end>=todayISO())||leaves.filter(l=>l.start>todayISO()).sort((a,b)=>a.start.localeCompare(b.start))[0]||leaves[0];
      label=selected?(selected.start<=todayISO()&&selected.end>=todayISO()?'إجازته الحالية':selected.start>todayISO()?'إجازته القادمة':'آخر إجازة مسجّلة'):'';
      if(!selected){aiAddMessage(`لا توجد إجازات مسجّلة لـ ${aiDisplayEmployee(employee)}.`);return true}
    }
    aiAddMessage(`${label} لـ ${aiDisplayEmployee(employee)} من ${fmtDate(selected.start)} إلى ${fmtDate(selected.end)}.`);
    return true;
  }
  if(q.includes('رصيد')){aiAddMessage(`رصيد إجازة ${aiDisplayEmployee(employee)}: ${formatDays(employee.leaveBalance)} يوم.`);return true}
  if(q.includes('معلومات')||q.includes('بيانات')){
    const phone=localPhone(employee.phone)||'غير مسجّل';
    aiAddMessage(`${aiDisplayEmployee(employee)} (#${employee.empId||'-'})، الجوال: ${phone}، رصيد الإجازة: ${formatDays(employee.leaveBalance)} يوم، الشفت: ${employee.shift||'غير محدد'}.`);return true;
  }
  return false;
}
function aiAskEmployeeChoice(items,action){
  aiPendingAction={kind:'chooseEmployee',action,employeeIds:items.map(e=>e.id)};
  const buttons=items.map(e=>`<button class="yes" onclick="aiChooseEmployee('${e.id}')">${esc(aiDisplayEmployee(e))}</button>`).join('');
  aiAddMessage('أبشر، عندي أكثر من موظف بهذا الاسم. ممكن تحدد مين تقصد؟','bot',buttons+'<button class="no" onclick="aiCancelAction()">إلغاء</button>');
}
function aiChooseEmployee(employeeId){
  if(aiPendingAction?.kind!=='chooseEmployee')return;
  const action={...aiPendingAction.action,employeeId},employee=state.employees.find(e=>e.id===employeeId);aiPendingAction=action;
  if(action.kind==='leave'){
    const days=diffDays(action.end,action.start)+1;action.days=days;
    return aiAddMessage(`تقصد ${aiDisplayEmployee(employee)}؟\nإجازة من ${fmtDate(action.start)} إلى ${fmtDate(action.end)} (${days} يوم)\nهل أعتمد الحفظ؟`,'bot','<button class="yes" onclick="aiConfirmAction()">تأكيد وحفظ</button><button class="no" onclick="aiCancelAction()">إلغاء</button>');
  }
  if(action.kind==='whatsapp'){
    const phone=localPhone(employee.phone)||'غير مسجّل';
    return aiAddMessage(`رسالة واتساب إلى ${aiDisplayEmployee(employee)} (${phone}):\n${action.message}\n\nأفتحها في واتساب؟`,'bot','<button class="yes" onclick="aiConfirmAction()">فتح واتساب</button><button class="no" onclick="aiCancelAction()">إلغاء</button>');
  }
  aiAddMessage(`تقصد ${aiDisplayEmployee(employee)}؟\n${action.type==='Late'?action.note:'ملاحظة: '+action.note} · ${aiDateLabel(action.date)}\nهل أعتمد التسجيل؟`,'bot','<button class="yes" onclick="aiConfirmAction()">تأكيد وحفظ</button><button class="no" onclick="aiCancelAction()">إلغاء</button>');
}
function aiHandleQuery(raw){
  const q=aiNormalize(raw), win=aiWindow(raw), today=todayISO();
  if((q.includes('سجل')||q.includes('اضف'))&&(q.includes('متاخر')||q.includes('تاخير')||q.includes('تاخر'))){
    const found=aiFindEmployee(raw);
    if(found.status==='none')return aiAddMessage('أبشر، بس احتاج اسم الموظف عشان أسجّلها على الشخص الصحيح 🌷','bot');
    const duration=aiDelayDuration(raw);
    const date=q.includes('بكره')?aiOffsetDate(1):today;
    const note=duration?`تأخير ${duration.label}`:'تأخير';
    if(found.status==='many')return aiAskEmployeeChoice(found.items,{kind:'record',type:'Late',date,note});
    aiPendingAction={kind:'record',employeeId:found.employee.id,type:'Late',date,note};
    return aiAddMessage(`راح أسجّل على ${aiDisplayEmployee(found.employee)}:\nتأخير · ${aiDateLabel(date)}${duration?` · ${duration.label}`:''}\nهل أعتمد التسجيل؟`,'bot','<button class="yes" onclick="aiConfirmAction()">تأكيد وحفظ</button><button class="no" onclick="aiCancelAction()">إلغاء</button>');
  }
  if((q.includes('سجل')||q.includes('اضف'))&&q.includes('ملاحظه')){
    const noteEmployee=aiFindEmployee(raw);
    const looksPersonal=q.includes('عندك')||q.includes('عندي')||q.includes('ذكرني')||noteEmployee.status==='none'&&(!q.includes(' عند ')&&!q.includes(' على ')||q.includes('بكره')||q.includes('اجتماع')||q.includes('موعد')||q.includes('جوله'));
    if(looksPersonal){
      const date=win.start;
      let note=raw.replace(/^.*?(?:سجل\s+عند[كي]|ذكرني|اضف)\s*/i,'').replace(/^\s*(?:الملاحظ[ةه]|ملاحظ[ةه])\s*/i,'').trim()||'ملاحظة';
      aiPendingAction={kind:'personalNote',date,note};
      return aiAddMessage(`راح أسجّل لك تذكير ${aiDateLabel(date)}:\n${note}\nهل أعتمد التسجيل؟`,'bot','<button class="yes" onclick="aiConfirmAction()">تأكيد وحفظ</button><button class="no" onclick="aiCancelAction()">إلغاء</button>');
    }
    const found=noteEmployee;
    if(found.status==='none')return aiAddMessage('أكيد. الملاحظة هذه لك كتذكير شخصي، ولا تبغاني أسجّلها على موظف؟','bot');
    let note=raw.replace(/^.*?ملاحظ[ةه]\s*/,'').trim();
    const selected=found.status==='one'?found.employee:found.items[0];
    const selectedName=selected.nameAr||selected.name;
    note=note.replace(new RegExp(selectedName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),'').replace(/^\s*(?:عند|على)?\s*/,'').trim()||'ملاحظة';
    if(found.status==='many')return aiAskEmployeeChoice(found.items,{kind:'record',type:'Note',date:today,note});
    aiPendingAction={kind:'record',employeeId:found.employee.id,type:'Note',date:today,note};
    return aiAddMessage(`راح أضيف في سجل ${aiDisplayEmployee(found.employee)}:\n${note}\nهل أعتمد التسجيل؟`,'bot','<button class="yes" onclick="aiConfirmAction()">تأكيد وحفظ</button><button class="no" onclick="aiCancelAction()">إلغاء</button>');
  }
  if(q.includes('راجع')||q.includes('الراجعين')||q.includes('العوده')){
    const rows=state.leaves.filter(l=>l.end>=win.start&&l.end<=win.end).sort((a,b)=>a.end.localeCompare(b.end)).map(l=>`${aiEmployeeName(l.employeeId)} — ${aiDateLabel(l.end)}`);
    return aiAddMessage(aiList(rows,`ما فيه أحد راجع ${win.label}.`)+(rows.length?`\n\nالإجمالي: ${rows.length}`:''));
  }
  if((q.includes('طالع')||q.includes('تبدأ')||q.includes('تبدا')||q.includes('قادمه'))&&q.includes('اجازه')){
    const rows=state.leaves.filter(l=>l.start>=win.start&&l.start<=win.end).sort((a,b)=>a.start.localeCompare(b.start)).map(l=>`${aiEmployeeName(l.employeeId)} — ${aiDateLabel(l.start)}`);
    return aiAddMessage(aiList(rows,`ما فيه إجازات تبدأ ${win.label}.`)+(rows.length?`\n\nالإجمالي: ${rows.length}`:''));
  }
  if(q.includes('اجازه')||q.includes('اجازات')){
    const target=win.start, rows=state.leaves.filter(l=>l.start<=target&&l.end>=target).sort((a,b)=>a.end.localeCompare(b.end)).map(l=>`${aiEmployeeName(l.employeeId)} — يرجع ${aiDateLabel(l.end)}`);
    return aiAddMessage(aiList(rows,`ما فيه أحد في إجازة ${win.label}.`)+(rows.length?`\n\nالإجمالي: ${rows.length}`:''));
  }
  if(q.includes('على راس العمل')||q.includes('متاح')||q.includes('موجود')){
    const away=new Set(state.leaves.filter(l=>l.start<=win.start&&l.end>=win.start).map(l=>l.employeeId));
    const available=state.employees.filter(e=>!away.has(e.id));
    return aiAddMessage(`المتاحون ${win.label}: ${available.length} من أصل ${state.employees.length}.\nفي إجازة: ${away.size}.`);
  }
  const found=aiFindEmployee(raw);
  if(found.status==='one'){
    const leave=state.leaves.find(l=>l.employeeId===found.employee.id&&l.start<=today&&l.end>=today);
    return aiAddMessage(leave?`${aiDisplayEmployee(found.employee)} في إجازة حاليًا، والعودة ${fmtDate(leave.end)}.`:`${aiDisplayEmployee(found.employee)} مو مسجّل في إجازة اليوم.`);
  }
  aiAddMessage('ما فهمت طلبك كامل يا رامي 😅\nممكن تقوله بطريقة ثانية؟ مثل: «مين في إجازة اليوم؟» أو «سجّل على فلان تأخير ربع ساعة».','bot');
}
// ==================== المساعد الذكي: تنفيذ الإجراءات وتأكيدها (save_leave وغيره) ====================
function aiContextForAgent(){
  const groupShiftPeriods=[];let start='2025-01-01',end='2028-12-31';
  while(start<=end){const info=groupShiftForDate(start),periodEnd=shiftPeriodEnd(start,info.code);groupShiftPeriods.push({start,end:periodEnd>end?end:periodEnd,code:info.code,arabic:info.arabic});start=addDaysISO(periodEnd,1)}
  return {
    today:todayISO(),
    dashboardIndicators:aiDashboardSnapshot(),
    annualLeaveIndicators:aiAnnualIndicatorsSnapshot(),
    employees:state.employees.map(e=>({id:e.id,name:e.name||'',nameAr:e.nameAr||'',empId:e.empId||'',phone:e.phone||'',marineIdExpiry:marineExpiryFor(e),gc:e.gc||'',position:e.position||'',shift:e.shift||'',location:e.location||'',dutyRole:e.dutyRole||'',leaveBalance:Number(e.leaveBalance)||0,note:e.note||''})),
    leaves:state.leaves.map(l=>({employeeId:l.employeeId,start:l.start,end:l.end,note:l.note||'',balanceDaysCharged:Number(l.balanceDaysCharged)||0})),
    shifts:state.shifts.map(s=>({employeeId:s.employeeId,post:s.post||'',shift:s.shift||''})),
    records:state.records.map(r=>({employeeId:r.employeeId,type:r.type||'',date:r.date||'',note:r.note||''})),
    achievements:state.achievements.map(a=>({employeeId:a.employeeId,type:a.type||'',date:a.date||'',note:a.note||''})),
    personalNotes:state.personalNotes.map(n=>({date:n.date||'',text:n.text||'',createdAt:n.createdAt||''})),
    monthlySchedules:state.monthlySchedules||{},
    monthlySchedulePeriods:state.monthlySchedulePeriods||{},
    locationHistory:state.locationHistory||{},
    accessGroups:ACCESS_GROUPS.map(g=>({title:g.title,badges:g.badges})),
    groupShiftPeriods,
    leaveBalanceHistory:Array.isArray(state.leaveBalanceHistory)?state.leaveBalanceHistory:[]
  };
}
async function aiAskGroq(message){
  if(!session?.access_token)throw new Error('NO_SESSION');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),40000);
  try{
    const res=await fetch(SUPABASE_URL+'/functions/v1/shift-assistant-',{
      method:'POST',signal:controller.signal,
      headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},
      body:JSON.stringify({message,context:aiContextForAgent(),history:aiConversationHistory.slice(-12)})
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(data.error||'AI_FAILED');
    return data;
  }finally{clearTimeout(timer)}
}
function aiSafeDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?String(value):todayISO()}
function aiResolveAgentEmployee(action){
  let employee=state.employees.find(e=>e.id===action.employeeId);
  if(employee)return {status:'one',employee};
  return aiFindEmployee(action.employeeName||'');
}
function aiPrepareAgentAction(action){
  if(!action||typeof action!=='object')return false;
  const date=aiSafeDate(action.date),note=String(action.note||'').trim().slice(0,500)||'ملاحظة';
  if(action.type==='send_whatsapp'){
    const found=aiResolveAgentEmployee(action),message=String(action.message||action.note||'').trim().slice(0,1500);
    if(found.status==='many')return aiAskEmployeeChoice(found.items,{kind:'whatsapp',message}),true;
    if(found.status!=='one'){aiAddMessage('احتاج اسم الموظف الصحيح عشان أجهّز رسالة واتساب.');return true}
    const phone=localPhone(found.employee.phone);if(!normalizeSaudiPhone(found.employee.phone)){aiAddMessage(`ما فيه رقم جوال صحيح مسجّل لـ ${aiDisplayEmployee(found.employee)}.`,'error');return true}
    if(!message){aiAddMessage('أبشر، ايش تبغاني أكتب في الرسالة؟');return true}
    aiPendingAction={kind:'whatsapp',employeeId:found.employee.id,message};
    aiAddMessage(`رسالة واتساب إلى ${aiDisplayEmployee(found.employee)} (${phone}):\n${message}\n\nأفتحها في واتساب؟`,'bot','<button class="yes" onclick="aiConfirmAction()">فتح واتساب</button><button class="no" onclick="aiCancelAction()">إلغاء</button>');return true;
  }
  if(action.type==='save_leave'){
    const found=aiResolveAgentEmployee(action),start=String(action.start||''),end=String(action.end||'');
    if(found.status==='many')return aiAskEmployeeChoice(found.items,{kind:'leave',start,end,note:note==='ملاحظة'?'':note}),true;
    if(found.status!=='one'){aiAddMessage('احتاج اسم الموظف الصحيح قبل ما أجهّز الإجازة.');return true}
    if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||end<start){aiAddMessage('احتاج تاريخ بداية ونهاية صحيحين للإجازة.');return true}
    const check=checkLeaveCapacity(found.employee.id,start,end),days=diffDays(end,start)+1,available=Number(found.employee.leaveBalance)||0;
    if(check.employeeConflict){aiAddMessage(`${aiDisplayEmployee(found.employee)} عنده إجازة متداخلة من ${fmtDate(check.employeeConflict.start)} إلى ${fmtDate(check.employeeConflict.end)}.`);return true}
    if(check.blocked.length){aiAddMessage(`ما أقدر أضيفها: عدد المجازين سيتجاوز 6 خلال ${check.blocked.length} يوم.`);return true}
    if(days>available){aiAddMessage(`مدة الإجازة ${days} يوم، ورصيد ${aiDisplayEmployee(found.employee)} المتاح ${formatDays(available)} يوم فقط.`);return true}
    aiPendingAction={kind:'leave',employeeId:found.employee.id,start,end,note:note==='ملاحظة'?'':note,days};
    aiAddMessage(`بأسجّل إجازة ${aiDisplayEmployee(found.employee)} من ${fmtDate(start)} إلى ${fmtDate(end)} (${days} يوم).\nأعتمد الحفظ؟`,'bot','<button class="yes" onclick="aiConfirmAction()">تأكيد وحفظ</button><button class="no" onclick="aiCancelAction()">إلغاء</button>');return true;
  }
  if(action.type==='personal_note'){
    aiPendingAction={kind:'personalNote',date,note};
    aiAddMessage(`أبشر، بأسجّل لك تذكير ${aiDateLabel(date)}:\n${note}\nأعتمد الحفظ؟`,'bot','<button class="yes" onclick="aiConfirmAction()">تأكيد وحفظ</button><button class="no" onclick="aiCancelAction()">إلغاء</button>');return true;
  }
  if(action.type!=='record_late'&&action.type!=='employee_note')return false;
  const found=aiResolveAgentEmployee(action),type=action.type==='record_late'?'Late':'Note';
  if(found.status==='many')return aiAskEmployeeChoice(found.items,{kind:'record',type,date,note}),true;
  if(found.status!=='one'){aiAddMessage('أبشر، بس احتاج اسم الموظف عشان أسجّلها على الشخص الصحيح 🌷');return true}
  aiPendingAction={kind:'record',employeeId:found.employee.id,type,date,note};
  aiAddMessage(`تمام، بأسجّل على ${aiDisplayEmployee(found.employee)}:\n${type==='Late'?'تأخير':'ملاحظة'} · ${aiDateLabel(date)}\n${note}\nأعتمد الحفظ؟`,'bot','<button class="yes" onclick="aiConfirmAction()">تأكيد وحفظ</button><button class="no" onclick="aiCancelAction()">إلغاء</button>');return true;
}
async function sendAIMessage(){
  const input=document.getElementById('aiInput'),text=input.value.trim();if(!text)return;
  if(aiRealtimeConnected&&aiRealtimeDc?.readyState==='open'){
    aiRealtimeLastUserText=text;aiAddMessage(text,'user','',false);input.value='';
    const q=aiNormalize(text);
    if(aiRealtimeLeaveApprovalPending&&(q==='لا'||q.includes('الغ')||q.includes('مو موافق'))){aiRealtimeLeaveApprovalPending=null;aiRealtimeAnswerVerified('تم إلغاء الإجازة، وما تغيّر شيء.');return}
    if(aiRealtimeLeaveApprovalPending&&(q==='نعم'||q==='ايوه'||q.includes('موافق')||q.includes('تمام')||q.includes('اوكي')||q.includes('ابشر')||q.includes('اعتمد')||q.includes('اكد'))){const pending=aiRealtimeLeaveApprovalPending;pending.approved=true;aiHandleRealtimeTool({call_id:'approved-leave-'+Date.now(),name:'save_leave',arguments:JSON.stringify(pending.args)}).catch(error=>console.error('Realtime approved leave',error));return}
    if(aiRealtimeWhatsAppPending&&(q==='لا'||q.includes('الغ')||q.includes('مو موافق'))){aiRealtimeWhatsAppPending=null;aiRealtimeAnswerVerified('تم إلغاء رسالة واتساب.');return}
    if(aiRealtimeWhatsAppPending&&(q==='نعم'||q==='ايوه'||q.includes('موافق')||q.includes('تمام')||q.includes('اوكي')||q.includes('ابشر')||q.includes('اعتمد')||q.includes('اكد')||q.includes('افتح'))){const pending=aiRealtimeWhatsAppPending;pending.approved=true;aiHandleRealtimeTool({call_id:'approved-whatsapp-'+Date.now(),name:'open_whatsapp',arguments:JSON.stringify(pending.args)}).catch(error=>console.error('Realtime approved WhatsApp',error));return}
    const verifiedReply=aiVerifiedReadReply(text);if(verifiedReply){aiRealtimeAnswerVerified(verifiedReply);return}
    aiRealtimeSend({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text}]}});aiRealtimeSend({type:'response.create'});return;
  }
  aiAddMessage(text,'user');input.value='';
  const q=aiNormalize(text);
  if(aiPendingAction&&(q==='تاكيد'||q.includes('اكد')||q.includes('اعتمد')||q==='نعم'||q==='ايوه'||q.includes('موافق')||q.includes('تمام')||q.includes('اوكي')||q.includes('افتح')))return aiConfirmAction();
  if(aiPendingAction&&(q.includes('الغ')||q==='لا'))return aiCancelAction();
  if(aiPendingAction?.kind==='chooseEmployee'){
    const found=aiFindEmployee(text);
    if(found.status==='one'&&aiPendingAction.employeeIds.includes(found.employee.id))return aiChooseEmployee(found.employee.id);
    return aiAddMessage('تمام، بس اختر الاسم من القائمة أو قل لي الاسم كامل عشان أعتمد الشخص الصحيح.','bot');
  }
  if(aiHandleDashboardQuery(text))return;
  if(aiHandleMonthLeaveQuery(text))return;
  if(aiHandleGroupShiftQuery(text))return;
  if(aiHandleEmployeeLookup(text))return;
  const btn=document.getElementById('aiSendBtn');if(btn){btn.disabled=true;btn.textContent='...'}
  input.disabled=true;
  try{
    const result=await aiAskGroq(text);
    const reply=String(result.reply||'تم').trim()||'تم';
    aiConversationHistory.push({role:'user',content:text},{role:'assistant',content:reply});
    if(aiConversationHistory.length>24)aiConversationHistory=aiConversationHistory.slice(-24);
    if(!aiPrepareAgentAction(result.action))aiAddMessage(reply,'bot','',true);
  }catch(error){
    console.warn('Groq assistant fallback',error);
    aiAddMessage('تعذر الوصول للمساعد الذكي حاليًا (شبكة بطيئة أو ضغط على الخدمة)، هذا رد مبدئي بالبحث المباشر:','error');
    aiHandleQuery(text);
  }finally{if(btn){btn.disabled=false;btn.textContent='إرسال'}input.disabled=false}
}
async function aiConfirmAction(){
  if(!aiPendingAction)return aiAddMessage('كل شيء تمام، ما عندي عملية معلّقة تحتاج تأكيد.','bot');
  const action=aiPendingAction,snapshot=JSON.parse(JSON.stringify(state));
  if(action.kind==='personalNote'){
    state.personalNotes.push({id:(crypto.randomUUID?crypto.randomUUID():('note-'+Date.now())),date:action.date,text:action.note,createdAt:new Date().toISOString(),source:'assistant'});
    aiPendingAction=null;if(!await aiPersistAssistantMutation(snapshot))return aiAddMessage('ما تم الحفظ في النظام. جرّب مرة ثانية.','error');return aiAddMessage('تم حفظ التذكير ومزامنته ✅');
  }
  if(action.kind==='chooseEmployee')return aiAddMessage('قبل الحفظ، اختر لي الموظف المقصود من فضلك.','bot');
  const employee=state.employees.find(e=>e.id===action.employeeId);if(!employee){aiPendingAction=null;return aiAddMessage('يبدو أن بيانات الموظف تغيّرت. حدّث الصفحة وجرّب مرة ثانية لو سمحت.','bot')}
  if(action.kind==='whatsapp'){
    aiPendingAction=null;const opened=aiOpenWhatsApp(employee,action.message);
    return aiAddMessage(opened.ok?`فتحت واتساب لـ ${aiDisplayEmployee(employee)} والرسالة جاهزة؛ اضغط إرسال داخل واتساب.`:opened.error,opened.ok?'bot':'error');
  }
  if(action.kind==='leave'){
    const check=checkLeaveCapacity(employee.id,action.start,action.end),days=diffDays(action.end,action.start)+1,available=Number(employee.leaveBalance)||0;
    if(check.employeeConflict){aiPendingAction=null;return aiAddMessage('ما تم الحفظ لأن الموظف عنده إجازة متداخلة.','error')}
    if(check.blocked.length){aiPendingAction=null;return aiAddMessage('ما تم الحفظ لأن عدد المجازين سيتجاوز الحد الأعلى.','error')}
    if(days>available){aiPendingAction=null;return aiAddMessage('ما تم الحفظ لأن رصيد الإجازة غير كافٍ.','error')}
    employee.leaveBalance=available-days;
    state.leaves.push({id:(crypto.randomUUID?crypto.randomUUID():('leave-'+Date.now())),employeeId:employee.id,start:action.start,end:action.end,note:action.note||'',balanceDaysCharged:days,source:'assistant'});
    aiPendingAction=null;if(!await aiPersistAssistantMutation(snapshot))return aiAddMessage('ما تم حفظ الإجازة في النظام، وما تغيّر الرصيد. جرّب مرة ثانية.','error');return aiAddMessage(`تم حفظ إجازة ${aiDisplayEmployee(employee)} داخل النظام وخصم ${days} يوم من الرصيد ✅`);
  }
  if(action.kind==='record')state.records.push({id:(crypto.randomUUID?crypto.randomUUID():('rec-'+Date.now())),employeeId:action.employeeId,type:action.type,date:action.date,note:action.note,createdAt:new Date().toISOString(),source:'assistant'});
  aiPendingAction=null;if(!await aiPersistAssistantMutation(snapshot))return aiAddMessage('ما تم الحفظ في النظام. جرّب مرة ثانية.','error');aiAddMessage(`تم الحفظ والمزامنة في سجل ${aiDisplayEmployee(employee)} ✅`);
}
function aiCancelAction(){aiPendingAction=null;aiAddMessage('تم إلغاء الأمر، وما تغيّر شيء.')}


document.querySelectorAll('.modal').forEach(m=>m.addEventListener('click',e=>{if(e.target===m){m.classList.remove('show');if(m.id==='aiAssistantModal')aiStopRealtime(false)}}));
document.addEventListener('click',e=>{
  if(!e.target.closest('.global-search'))document.getElementById('globalSearchResults')?.classList.remove('show');
});

document.getElementById('backupBtn').addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='shift-manager-backup.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
});
lockApp();
localStorage.removeItem(OLD_SESSION_KEY);updateLoginRoleUI();
if(document.getElementById('recordDate')) document.getElementById('recordDate').value=todayISO();
if(session){
  refreshSession().then(ok=>ok?loadCloudState():logout()).catch(()=>logout());
}else{
  localStorage.removeItem(KEY);setCloudStatus('offline','يتطلب تسجيل الدخول');
}
