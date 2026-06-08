
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, onSnapshot, query, where, orderBy, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./config.js";

const app  = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = 'login.html'; return; }
  const snap = await getDoc(doc(db, 'users', user.uid));
  const role = snap.exists() ? snap.data().role : '';
  if (role !== 'supervisor' && role !== 'admin') { window.location.href = 'login.html'; return; }
  document.getElementById('navUserName').textContent   = snap.data().name || user.email.split('@')[0];
  document.getElementById('authGate').style.display    = 'none';
  document.getElementById('mainContent').style.display = 'flex';
  loadData();
});

window.doLogout = () => signOut(auth).then(() => window.location.href = 'login.html');

function loadData() {
  const mateenQuery = query(collection(db,'users'), where('role','==','mateen'), orderBy('createdAt','desc'));
  onSnapshot(mateenQuery, snap => {
    const all     = snap.docs.map(d=>({id:d.id,...d.data()}));
    const pending = all.filter(u=>u.status==='pending');
    const active  = all.filter(u=>u.status==='active');
    document.getElementById('sPending').textContent = pending.length;
    document.getElementById('sActive').textContent  = active.length;
    document.getElementById('sTotal').textContent   = all.length;
    renderPending(pending);
    renderAll(all);
  });
}

function renderPending(list) {
  const c = document.getElementById('pendingContainer');
  if (!list.length) { c.innerHTML = '<div class="empty-state"><i class="ti ti-inbox"></i>لا توجد حسابات معلقة</div>'; return; }
  c.innerHTML = `<div style="overflow-x:auto"><table class="pending-table">
    <thead><tr><th>الاسم</th><th>العمر</th><th>السنة</th><th>الجوال</th><th>البريد</th><th>تاريخ التسجيل</th><th></th></tr></thead>
    <tbody>${list.map(u=>`<tr>
      <td style="font-weight:600">${esc(u.name||'—')}</td>
      <td>${u.age||'—'}</td>
      <td>${esc(u.year||'—')}</td>
      <td dir="ltr">${esc(u.phone||'—')}</td>
      <td dir="ltr" style="font-size:12px">${esc(u.email||'—')}</td>
      <td style="font-size:12px;color:var(--text-mid)">${fmtDate(u.createdAt)}</td>
      <td><div style="display:flex;gap:6px">
        <button class="btn-approve" onclick="approveUser('${u.id}')"><i class="ti ti-check"></i> قبول</button>
        <button class="btn-reject"  onclick="rejectUser('${u.id}')"><i class="ti ti-x"></i> رفض</button>
      </div></td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function renderAll(list) {
  const c = document.getElementById('allContainer');
  if (!list.length) { c.innerHTML = '<div class="empty-state"><i class="ti ti-inbox"></i>لا توجد طالبات</div>'; return; }
  c.innerHTML = `<div style="overflow-x:auto"><table class="pending-table">
    <thead><tr><th>الاسم</th><th>العمر</th><th>الجوال</th><th>البريد</th><th>الحالة</th><th></th></tr></thead>
    <tbody>${list.map(u=>`<tr>
      <td style="font-weight:600">${esc(u.name||'—')}</td>
      <td>${u.age||'—'}</td>
      <td dir="ltr">${esc(u.phone||'—')}</td>
      <td dir="ltr" style="font-size:12px">${esc(u.email||'—')}</td>
      <td>${u.status==='active'?'<span style="color:var(--green-dark);font-size:12px">✅ نشطة</span>':u.status==='pending'?'<span class="badge-pending">⏳ معلقة</span>':'<span style="color:#c0392b;font-size:12px">❌ مرفوضة</span>'}</td>
      <td><button class="btn-reject" onclick="suspendUser('${u.id}','${u.status}')"><i class="ti ti-ban"></i> ${u.status==='suspended'?'رفع الإيقاف':'إيقاف'}</button></td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

window.approveUser = async id => { await updateDoc(doc(db,'users',id),{status:'active'}); showToast('✓ تم قبول الحساب'); };
window.rejectUser  = async id => { if(!confirm('رفض الحساب وحذفه؟')) return; await deleteDoc(doc(db,'users',id)); showToast('تم الرفض'); };
window.suspendUser = async (id,cur) => {
  const ns = cur==='suspended' ? 'active' : 'suspended';
  await updateDoc(doc(db,'users',id),{status:ns});
  showToast(ns==='suspended'?'تم إيقاف الحساب':'تم رفع الإيقاف');
};

function fmtDate(ts) { if(!ts) return '—'; return new Date(ts.seconds*1000).toLocaleDateString('ar-EG',{year:'numeric',month:'short',day:'numeric'}); }
function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function showToast(msg) { const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),3000); }
