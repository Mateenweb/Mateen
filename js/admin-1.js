
import { initializeApp, getApps, getApp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getFirestore, collection, addDoc, deleteDoc, doc,
         onSnapshot, query, orderBy, getDoc, updateDoc, getDocs }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./config.js";

const app  = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);
let allMats = [];

// ── AUTH GUARD ────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = '../html/login.html'; return; }
  const snap = await getDoc(doc(db, 'users', user.uid));
  const role = snap.exists() ? snap.data().role : 'student';
  if (role === 'student' || role === 'mateen' || role === 'supervisor') {
    window.location.href = '../html/login.html'; return;
  }
  document.getElementById('navUserName').textContent  = user.displayName || user.email.split('@')[0];
  document.getElementById('authGate').style.display   = 'none';
  document.getElementById('mainContent').style.display = 'flex';
  if (role !== 'admin') {
    document.getElementById('studentsSection').style.display = 'none';
  } else {
    document.getElementById('pendingSection').style.display = 'block';
    loadPendingAccounts();
  }
  loadMats();
});

window.doLogout = () => signOut(auth).then(() => window.location.href = '../html/login.html');

// ── ADD ───────────────────────────────────────────────
window.doAdd = async () => {
  hideErr();
  const url    = document.getElementById('fUrl').value.trim();
  const course = document.getElementById('fCourse').value;
  const title  = document.getElementById('fTitle').value.trim();
  if (!url)    { showErr('يرجى إدخال رابط الملف'); return; }
  if (!url.startsWith('http')) { showErr('الرابط يجب أن يبدأ بـ https://'); return; }
  if (!course) { showErr('يرجى اختيار المادة'); return; }
  if (!title)  { showErr('يرجى إدخال عنوان المادة'); return; }

  const btn = document.getElementById('addBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader spin"></i> جارٍ الحفظ...';

  try {
    await addDoc(collection(db, 'materials'), {
      url, course, title,
      type:     document.getElementById('fType').value,
      notes:    document.getElementById('fNotes').value.trim(),
      linkType: detectType(url),
      addedAt:  Date.now(),
      addedBy:  auth.currentUser.email,
    });
    showToast('✓ تمت إضافة المادة بنجاح');
    ['fUrl','fTitle','fNotes'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('fCourse').value = '';
  } catch(e) { showErr('خطأ: ' + e.message); }

  btn.disabled = false;
  btn.innerHTML = '<i class="ti ti-circle-plus"></i> إضافة المادة';
};

// ── LOAD ──────────────────────────────────────────────
function loadMats() {
  onSnapshot(query(collection(db, 'materials'), orderBy('addedAt','desc')), snap => {
    allMats = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderMats();
    updateStats();
  });
}

window.renderMats = () => {
  const q  = document.getElementById('searchQ').value.toLowerCase();
  const fc = document.getElementById('filterCourse').value;
  const ft = document.getElementById('filterType').value;
  const list = allMats.filter(m =>
    (!q  || m.title.toLowerCase().includes(q) || (m.course||'').includes(q)) &&
    (!fc || m.course === fc) && (!ft || m.type === ft)
  );
  const c = document.getElementById('matsContainer');
  if (!list.length) { c.innerHTML = '<div class="empty-state"><i class="ti ti-inbox"></i>لا توجد نتائج</div>'; return; }
  c.innerHTML = `
  <table class="mat-table">
    <thead><tr><th>المادة</th><th>المسار</th><th>النوع</th><th>المصدر</th><th>التاريخ</th><th></th></tr></thead>
    <tbody>${list.map(m=>`
    <tr>
      <td><div style="display:flex;align-items:center;gap:10px">
        <div class="type-icon ${icClass(m.linkType)}">${icHtml(m.linkType)}</div>
        <div>
          <div style="font-weight:500">${esc(m.title)}</div>
          ${m.notes?`<div style="font-size:11px;color:var(--text-mid)">${esc(m.notes)}</div>`:''}
        </div></div></td>
      <td><span class="badge badge-green">${esc(m.course)}</span></td>
      <td><span class="badge badge-gray">${esc(m.type)}</span></td>
      <td style="font-size:12px;color:var(--text-mid)">${srcName(m.url)}</td>
      <td style="font-size:12px;color:var(--text-mid);white-space:nowrap">${fmtDate(m.addedAt)}</td>
      <td><div style="display:flex;gap:2px">
        <a href="${esc(m.url)}" target="_blank" class="btn-icon btn-open" title="فتح"><i class="ti ti-external-link"></i></a>
        <button class="btn-icon btn-del" title="حذف" onclick="delMat('${m.id}')"><i class="ti ti-trash"></i></button>
      </div></td>
    </tr>`).join('')}</tbody>
  </table>`;
};

function updateStats() {
  document.getElementById('sTotal').textContent = allMats.length;
  document.getElementById('sMah').textContent   = allMats.filter(m=>m.type==='محاضرة').length;
  document.getElementById('sVid').textContent   = allMats.filter(m=>m.type==='فيديو'||m.linkType==='youtube').length;
  document.getElementById('sOth').textContent   = allMats.filter(m=>m.type!=='محاضرة'&&m.type!=='فيديو'&&m.linkType!=='youtube').length;
}

window.delMat = async id => {
  if (!confirm('هل تريدين حذف هذه المادة نهائياً؟')) return;
  await deleteDoc(doc(db, 'materials', id));
  showToast('تم الحذف');
};

// ── HELPERS ───────────────────────────────────────────
function detectType(url) {
  if (url.includes('youtube.com')||url.includes('youtu.be')) return 'youtube';
  if (url.includes('drive.google.com'))  return 'drive';
  if (url.includes('dropbox.com'))       return 'dropbox';
  if (url.match(/\.pdf$/i))              return 'pdf';
  if (url.match(/\.(mp4|mov)$/i))        return 'video';
  return 'link';
}
function srcName(url='') {
  if (url.includes('youtube.com')||url.includes('youtu.be')) return 'YouTube';
  if (url.includes('drive.google.com'))  return 'Google Drive';
  if (url.includes('dropbox.com'))       return 'Dropbox';
  if (url.includes('onedrive'))          return 'OneDrive';
  try { return new URL(url).hostname.replace('www.',''); } catch { return 'رابط'; }
}
function icClass(t){ return {youtube:'ic-yt',drive:'ic-drive',pdf:'ic-pdf',video:'ic-video'}[t]||'ic-link'; }
function icHtml(t){ return {youtube:'<i class="ti ti-brand-youtube"></i>',drive:'<i class="ti ti-brand-google-drive"></i>',pdf:'<i class="ti ti-file-type-pdf"></i>',video:'<i class="ti ti-video"></i>'}[t]||'<i class="ti ti-link"></i>'; }
function fmtDate(ts){ if(!ts)return'—'; return new Date(ts).toLocaleDateString('ar-EG',{year:'numeric',month:'short',day:'numeric'}); }
function esc(s){ return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
// ══════════════════════════════════════
//  الحسابات المعلقة (admin فقط)
// ══════════════════════════════════════

const ROLE_LABELS = {
  student:    '🎓 طالبة عادية',
  mateen:     '📖 طالبة متين',
  teacher:    '👩‍🏫 معلمة',
  supervisor: '🛡️ مشرفة',
  admin:      '👑 أدمن',
};

function loadPendingAccounts() {
  // الأدمن يشوف كل الحسابات المعلقة (معلمات + مشرفات + طالبات متين)
  onSnapshot(
    query(collection(db, 'users'), orderBy('createdAt', 'desc')),
    snap => {
      const pending = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(u => u.status === 'pending');
      renderPending(pending);
    }
  );
}

function renderPending(list) {
  const badge = document.getElementById('pendingBadge');
  const cont  = document.getElementById('pendingContainer');

  if (!list.length) {
    badge.style.display = 'none';
    cont.innerHTML = '<div class="empty-state"><i class="ti ti-inbox"></i>لا توجد حسابات معلقة</div>';
    return;
  }

  badge.style.display = 'inline';
  badge.textContent   = list.length;

  // فصل: طالبات متين (موافقة مشرفة) والباقي (موافقة أدمن)
  const mateen = list.filter(u => u.role === 'mateen');
  const others = list.filter(u => u.role !== 'mateen');

  const tableHTML = (rows) => `<div style="overflow-x:auto">
    <table class="pending-table">
      <thead><tr>
        <th>الاسم</th><th>الصفة</th><th>العمر</th><th>السنة</th>
        <th>الجوال</th><th>البريد الإلكتروني</th><th>تاريخ التسجيل</th><th></th>
      </tr></thead>
      <tbody>${rows.map(u => `
        <tr>
          <td style="font-weight:600">${esc(u.name||'—')}</td>
          <td><span style="font-size:12px;background:var(--beige2);padding:2px 8px;border-radius:4px">${ROLE_LABELS[u.role]||u.role}</span></td>
          <td>${u.age||'—'}</td>
          <td>${esc(u.year||'—')}</td>
          <td dir="ltr">${esc(u.phone||'—')}</td>
          <td dir="ltr" style="font-size:12px">${esc(u.email||'—')}</td>
          <td style="font-size:12px;color:var(--text-mid)">${u.createdAt ? new Date(u.createdAt.seconds*1000).toLocaleDateString('ar-EG',{year:'numeric',month:'short',day:'numeric'}) : '—'}</td>
          <td><div style="display:flex;gap:6px">
            <button class="btn-approve" onclick="approveUser('${u.id}')"><i class="ti ti-check"></i> قبول</button>
            <button class="btn-reject"  onclick="rejectUser('${u.id}')"><i class="ti ti-x"></i> رفض</button>
          </div></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;

  let html = '';
  if (mateen.length) {
    html += `<div style="padding:10px 16px 4px;font-size:12px;font-weight:600;color:var(--text-mid);border-bottom:1px solid var(--border)">
      📖 طالبات متين — تحتاج موافقة المشرفة (${mateen.length})
    </div>${tableHTML(mateen)}`;
  }
  if (others.length) {
    html += `<div style="padding:10px 16px 4px;font-size:12px;font-weight:600;color:var(--text-mid);border-top:${mateen.length?'2px':'0'} solid var(--border)">
      🛡️ معلمات ومشرفات — تحتاج موافقة الأدمن (${others.length})
    </div>${tableHTML(others)}`;
  }
  cont.innerHTML = html;
}

window.approveUser = async id => {
  await updateDoc(doc(db, 'users', id), { status: 'active' });
  showToast('✓ تم قبول الحساب');
};

window.rejectUser = async id => {
  if (!confirm('هل تريدين رفض هذا الحساب وحذفه نهائياً؟')) return;
  await deleteDoc(doc(db, 'users', id));
  showToast('تم رفض الحساب وحذفه');
};

// ══════════════════════════════════════
//  قاعدة بيانات الطالبات والمقابلات
// ══════════════════════════════════════

let allStudents = [];
const stuDateParts = {};

const MONTHS_HIJRI = ['محرم','صفر','ربيع الأول','ربيع الثاني','جمادى الأولى','جمادى الثانية','رجب','شعبان','رمضان','شوال','ذو القعدة','ذو الحجة'];
const MONTHS_AR    = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const YEARS_HIJRI  = Array.from({length:11},(_,i)=>1442+i);

function hijriToGregorian(hd,hm,hy) {
  hd=parseInt(hd); hm=parseInt(hm); hy=parseInt(hy);
  if(!hd||!hm||!hy) return null;
  const jdn = Math.floor((11*hy+3)/30)+354*hy+30*hm-Math.floor((hm-1)/2)+hd+1948440-385;
  let l=jdn+68569;
  const n=Math.floor((4*l)/146097);
  l=l-Math.floor((146097*n+3)/4);
  const ii=Math.floor((4000*(l+1))/1461001);
  l=l-Math.floor((1461*ii)/4)+31;
  const j=Math.floor((80*l)/2447);
  const day=l-Math.floor((2447*j)/80);
  l=Math.floor(j/11);
  const month=j+2-12*l;
  const year=100*(n-49)+ii+l;
  return {d:String(day).padStart(2,'0'),m:String(month).padStart(2,'0'),y:String(year)};
}

function parseDateParts(s){if(!s)return{d:'',m:'',y:''};const[d,m,y]=s.split('-');return{d:d||'',m:m||'',y:y||''};}

function makeDatePicker(sid, dateStr) {
  const {d,m,y}=parseDateParts(dateStr||'');
  const days=Array.from({length:30},(_,i)=>i+1);
  const dayOpts=days.map(n=>{const v=String(n).padStart(2,'0');return`<option value="${v}"${d===v?' selected':''}>${n}</option>`;}).join('');
  const monthOpts=MONTHS_HIJRI.map((mn,i)=>{const v=String(i+1).padStart(2,'0');return`<option value="${v}"${m===v?' selected':''}>${mn}</option>`;}).join('');
  const yearOpts=YEARS_HIJRI.map(yr=>`<option value="${yr}"${y===String(yr)?' selected':''}>${yr}</option>`).join('');
  return `<div class="arabic-date">
    <select class="date-day-sel" onchange="stuUpdateDatePart('${sid}','hd',this.value)"><option value="">يوم</option>${dayOpts}</select>
    <select class="date-month-sel" onchange="stuUpdateDatePart('${sid}','hm',this.value)"><option value="">شهر</option>${monthOpts}</select>
    <select class="date-year-sel" onchange="stuUpdateDatePart('${sid}','hy',this.value)"><option value="">سنة</option>${yearOpts}</select>
  </div>`;
}

const stuQuery = query(collection(db,'students'), orderBy('order'));
onSnapshot(stuQuery, snap => {
  allStudents = snap.docs.map(d=>({id:d.id,...d.data()}));
  renderStudents(allStudents);
  updateStuStats(allStudents);
});

function updateStuStats(list) {
  document.getElementById('stuTotal').textContent    = list.length;
  document.getElementById('stuDone').textContent     = list.filter(s=>s.interview==='done').length;
  document.getElementById('stuPending').textContent  = list.filter(s=>s.interview==='pending').length;
  document.getElementById('stuAccepted').textContent = list.filter(s=>s.accepted==='accepted').length;
  document.getElementById('stuRejected').textContent = list.filter(s=>s.accepted==='rejected').length;
}

window.applyStudentFilters = () => {
  const q  = (document.getElementById('stuSearch').value||'').toLowerCase();
  const fi = document.getElementById('stuFilterInterview').value;
  const fr = document.getElementById('stuFilterResult').value;
  const fs = document.getElementById('stuFilterStatus').value;
  renderStudents(allStudents.filter(s=>
    (!q  || (s.name||'').toLowerCase().includes(q)) &&
    (fi==='all' || s.interview===fi) &&
    (fr==='all' || s.accepted===fr) &&
    (fs==='all' || s.status===fs)
  ));
};

function renderStudents(list) {
  const tb = document.getElementById('stuTableBody');
  if(!list.length){tb.innerHTML=`<tr><td colspan="8" class="empty-state"><i class="ti ti-inbox"></i>لا توجد طالبات</td></tr>`;return;}
  tb.innerHTML = list.map((s,i)=>{
    const intClass = s.interview==='done'?'btn-done':'btn-pending';
    const intLabel = s.interview==='done'?'✅ تمت':'⏳ لم تتم';
    let accClass='btn-na', accLabel='— لم يحدد';
    if(s.accepted==='accepted'){accClass='btn-accepted';accLabel='✔️ مقبولة';}
    if(s.accepted==='rejected'){accClass='btn-rejected';accLabel='✖️ مرفوضة';}
    const statusSel = `<select class="status-sel" onchange="stuField('${s.id}','status',this.value)">
      <option value=""${!s.status?' selected':''}>🏷️ التصنيف</option>
      <option value="mateen"${s.status==='mateen'?' selected':''}>📖 بنات متين</option>
      <option value="new"${s.status==='new'?' selected':''}>✨ المستجدات</option>
    </select>`;
    const daySel=`<select class="day-sel" onchange="stuField('${s.id}','day',this.value)">
      <option value="">-اليوم-</option>
      ${['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'].map(d=>`<option${s.day===d?' selected':''}>${d}</option>`).join('')}
    </select>`;
    const timeSel=`<div class="time-cell">
      <select class="time-hour" onchange="stuField('${s.id}','hour',this.value)">
        <option value="">-</option>${[1,2,3,4,5,6,7,8,9,10,11,12].map(h=>`<option${s.hour==h?' selected':''}>${h}</option>`).join('')}
      </select>:
      <select class="time-ampm" onchange="stuField('${s.id}','ampm',this.value)">
        <option value="ص"${s.ampm==='ص'?' selected':''}>صباحاً</option>
        <option value="م"${s.ampm==='م'?' selected':''}>مساءً</option>
      </select>
    </div>`;
    return `<tr>
      <td><input type="checkbox" class="row-check" data-id="${s.id}" onchange="onRowCheck()"></td>
      <td style="color:var(--text-mid);font-size:12px">${i+1}</td>
      <td><div class="stu-name-cell">
        <a class="btn-stu-link" href="student-view.html?id=${s.id}" target="_blank" title="صفحة الطالبة">👤</a>
        <input type="text" value="${esc(s.name||'')}" oninput="stuAutoName('${s.id}',this.value)" style="min-width:100px">
        ${statusSel}
      </div></td>
      <td><div style="display:flex;flex-direction:column;gap:4px">${daySel}${makeDatePicker(s.id,s.dateH)}</div></td>
      <td>${timeSel}</td>
      <td><button class="btn-interview ${intClass}" onclick="stuToggleInterview('${s.id}','${s.interview}')">${intLabel}</button></td>
      <td><button class="btn-accept ${accClass}" onclick="stuToggleAccept('${s.id}','${s.accepted}','${s.interview}')">${accLabel}</button></td>
      <td><button class="btn-del-stu" onclick="stuDelete('${s.id}')" title="حذف"><i class="ti ti-trash"></i></button></td>
    </tr>`;
  }).join('');
}

const stuDefault = () => ({order:Date.now(), name:'طالبة جديدة', status:'', day:'', dateH:'', dateG:'', hour:'', minute:'00', ampm:'ص', interview:'pending', accepted:'na'});

window.addStudentRow = async () => { await addDoc(collection(db,'students'), stuDefault()); };

window.addBulkNames = async () => {
  const txt = document.getElementById('bulkNames').value;
  if(!txt.trim()) return;
  const names = txt.split('\n').filter(n=>n.trim());
  for(let i=0;i<names.length;i++) await addDoc(collection(db,'students'),{...stuDefault(),order:Date.now()+i,name:names[i].trim()});
  document.getElementById('bulkNames').value='';
  showToast('✓ تمت إضافة الأسماء');
};

window.stuAutoName = async (id,v) => updateDoc(doc(db,'students',id),{name:v});
window.stuField    = async (id,f,v) => updateDoc(doc(db,'students',id),{[f]:v});

window.stuUpdateDatePart = async (id,key,value) => {
  const s = allStudents.find(s=>s.id===id)||{};
  if(!stuDateParts[id]) stuDateParts[id]=parseDateParts(s.dateH||'');
  const pk={hd:'d',hm:'m',hy:'y'}[key];
  if(pk) stuDateParts[id][pk]=value;
  const {d,m,y}=stuDateParts[id];
  const up={dateH:`${d}-${m}-${y}`};
  if(d&&m&&y){const gr=hijriToGregorian(d,m,y);if(gr)up.dateG=`${gr.d}-${gr.m}-${gr.y}`;}
  await updateDoc(doc(db,'students',id),up);
};

window.stuToggleInterview = async (id,cur) => updateDoc(doc(db,'students',id),{interview:cur==='done'?'pending':'done'});

window.stuToggleAccept = async (id,cur,interview) => {
  if(interview!=='done'){showToast('يجب إجراء المقابلة أولاً','err');return;}
  const order=['na','accepted','rejected'];
  await updateDoc(doc(db,'students',id),{accepted:order[(order.indexOf(cur)+1)%3]});
};

window.stuDelete = async id => {
  if(!confirm('حذف الطالبة؟')) return;
  await deleteDoc(doc(db,'students',id));
  showToast('تم الحذف');
};

window.toggleSelectAll = checked => {
  document.querySelectorAll('.row-check').forEach(cb=>{
    cb.checked=checked;
    cb.closest('tr').classList.toggle('selected-row',checked);
  });
  document.getElementById('selectedCount').textContent=(checked?document.querySelectorAll('.row-check').length:0)+' محددة';
};

window.onRowCheck = () => {
  const checked=document.querySelectorAll('.row-check:checked');
  document.getElementById('selectedCount').textContent=checked.length+' محددة';
  document.querySelectorAll('.row-check').forEach(cb=>cb.closest('tr').classList.toggle('selected-row',cb.checked));
};

window.applyBulkDateTime = async () => {
  const checked=document.querySelectorAll('.row-check:checked');
  if(!checked.length){showToast('اختاري طالبات أولاً','err');return;}
  const day=document.getElementById('bulkDay').value;
  const dd=String(document.getElementById('bulkDD').value||'').padStart(2,'0');
  const mm=document.getElementById('bulkMM').value;
  const yy=document.getElementById('bulkYY').value;
  const hour=document.getElementById('bulkHour').value;
  const ampm=document.getElementById('bulkAmpm').value;
  const up={};
  if(day) up.day=day;
  if(dd&&mm&&yy){up.dateH=`${dd}-${mm}-${yy}`;const gr=hijriToGregorian(dd,mm,yy);if(gr)up.dateG=`${gr.d}-${gr.m}-${gr.y}`;}
  if(hour) up.hour=hour;
  if(ampm) up.ampm=ampm;
  if(!Object.keys(up).length){showToast('حددي بيانات للتطبيق','err');return;}
  for(const cb of checked) await updateDoc(doc(db,'students',cb.dataset.id),up);
  showToast(`✓ تم التطبيق على ${checked.length} طالبة`);
  toggleSelectAll(false);
};

// patch showToast to accept error flag
const _origToast = window.showToast ? null : null;

function hideErr(){ document.getElementById('errMsg').classList.remove('show'); }
function showToast(msg,err=false){ const t=document.getElementById('toast'); t.textContent=msg; t.className='toast'+(err?' error':''); t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),3000); }
