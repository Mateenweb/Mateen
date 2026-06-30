// ===========================
//  واجهة الواجبات — Assignments UI Widget
//  يُستخدم جوه أي صفحة فيها مواد/محاضرات (courses-firebase.js وما شابه)
// ===========================
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { FIREBASE_CONFIG } from "./config.js";
import {
  addAssignment, getAssignmentsForMaterial, deleteAssignment,
  submitAssignment, getMySubmission, getAllSubmissions, gradeSubmission, getDeadlineStatus
} from "./assignments.js";

const app  = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

const CLOUD_NAME    = 'dqqtznoqt';
const UPLOAD_PRESET = 'mateen_uploads';

let _currentUserRole = null;
let _currentUserSubjects = [];
let _currentUserId = null;

let _resolveRoleReady;
const roleReady = new Promise(res => { _resolveRoleReady = res; });

onAuthStateChanged(auth, async (user) => {
  if (!user) { _resolveRoleReady(); return; }
  _currentUserId = user.uid;
  const snap = await getDoc(doc(db, 'users', user.uid));
  if (snap.exists()) {
    _currentUserRole = snap.data().role;
    _currentUserSubjects = snap.data().enrolledSubjects || [];
  }
  _resolveRoleReady();
});

function canManageAssignments(course) {
  if (_currentUserRole === 'admin' || _currentUserRole === 'supervisor') return true;
  if (_currentUserRole === 'teacher') return _currentUserSubjects.includes(course);
  return false;
}

async function uploadFile(file) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', UPLOAD_PRESET);
  const isImage = file.type.startsWith('image/');
  const resourceType = isImage ? 'image' : 'raw';
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`, { method: 'POST', body: fd });
  const data = await res.json();
  if (!data.secure_url) throw new Error(data.error?.message || 'فشل رفع الملف');
  return data.secure_url;
}

// ── HTML قسم الواجبات جوه كارت المادة ─────────────────────────
export async function renderAssignmentsSection(materialId, course, containerId) {
  await roleReady;
  const container = document.getElementById(containerId);
  if (!container) return;

  const canManage = canManageAssignments(course);
  const assignments = await getAssignmentsForMaterial(materialId);

  let html = `<div style="margin-top:10px;border-top:1px dashed var(--border);padding-top:10px">`;

  if (assignments.length === 0 && !canManage) {
    container.innerHTML = '';
    return;
  }

  if (canManage) {
    html += `<button onclick="window.openAddAssignmentModal('${materialId}','${course}')"
      style="width:100%;padding:8px;border:1px dashed var(--gold);background:transparent;color:var(--green-dark);border-radius:8px;font-family:inherit;font-size:12px;cursor:pointer;margin-bottom:8px;display:flex;align-items:center;justify-content:center;gap:6px">
      <i class="ti ti-clipboard-plus"></i> إضافة واجب
    </button>`;
  }

  for (const a of assignments) {
    const dl = getDeadlineStatus(a.deadline);
    html += `
      <div style="background:rgba(92,61,46,0.05);border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:8px;cursor:pointer" onclick="window.openAssignmentDetail('${a.id}','${course}')">
        <div style="display:flex;justify-content:space-between;align-items:start;gap:8px">
          <div style="font-size:13px;font-weight:700;color:var(--green-dark)">📝 ${a.title}</div>
          ${canManage ? `<button onclick="event.stopPropagation();window.removeAssignment('${a.id}','${materialId}','${course}')" style="background:none;border:none;color:#e74c3c;cursor:pointer;padding:2px"><i class="ti ti-trash" style="font-size:14px"></i></button>` : ''}
        </div>
        <div style="font-size:11px;color:${dl.color};margin-top:4px">⏰ ${dl.text}</div>
      </div>`;
  }

  html += `</div>`;
  container.innerHTML = html;
}

// ── Modal إضافة واجب ───────────────────────────────────────────
function ensureModalsExist() {
  if (document.getElementById('addAssignmentModal')) return;

  const modalsHTML = `
  <div id="addAssignmentModal" class="modal-overlay" onclick="if(event.target===this)this.classList.remove('show')" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;align-items:center;justify-content:center">
    <div class="modal-box" style="width:min(94vw,460px);background:var(--bg-card,#fff);border-radius:16px;padding:20px;max-height:90vh;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <span style="font-size:16px;font-weight:700">إضافة واجب جديد</span>
        <button onclick="document.getElementById('addAssignmentModal').classList.remove('show')" style="background:none;border:none;font-size:20px;cursor:pointer">✕</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <input id="asgTitle" type="text" placeholder="عنوان الواجب" style="padding:10px;border:1px solid var(--border);border-radius:8px;font-family:inherit"/>
        <textarea id="asgDesc" rows="3" placeholder="وصف الواجب (اختياري)" style="padding:10px;border:1px solid var(--border);border-radius:8px;font-family:inherit"></textarea>
        <div style="display:flex;flex-direction:column;gap:6px">
          <label style="font-size:12px;color:var(--text-mid)">وسيلة التسليم المسموحة</label>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
            <input type="checkbox" id="asgAllowFile" checked/> 📎 رفع ملف/صورة
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
            <input type="checkbox" id="asgAllowText" checked/> ✍️ كتابة نص
          </label>
        </div>
        <div>
          <label style="font-size:12px;color:var(--text-mid)">الموعد النهائي للتسليم</label>
          <input id="asgDeadline" type="datetime-local" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-family:inherit;margin-top:4px"/>
        </div>
        <button onclick="window.submitAddAssignment()" style="background:linear-gradient(135deg,#2c1a0e,#5c3d2e);color:#e8c96a;border:none;border-radius:10px;padding:11px;font-family:inherit;font-size:14px;cursor:pointer;font-weight:600">
          نشر الواجب
        </button>
      </div>
    </div>
  </div>

  <div id="assignmentDetailModal" class="modal-overlay" onclick="if(event.target===this)this.classList.remove('show')" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;align-items:center;justify-content:center">
    <div class="modal-box" style="width:min(94vw,520px);background:var(--bg-card,#fff);border-radius:16px;padding:20px;max-height:90vh;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <span id="asgDetailTitle" style="font-size:16px;font-weight:700"></span>
        <button onclick="document.getElementById('assignmentDetailModal').classList.remove('show')" style="background:none;border:none;font-size:20px;cursor:pointer">✕</button>
      </div>
      <div id="asgDetailBody"></div>
    </div>
  </div>

  <style>
  .modal-overlay.show { display: flex !important; }
  </style>`;

  document.body.insertAdjacentHTML('beforeend', modalsHTML);
}

window.openAddAssignmentModal = (materialId, course) => {
  ensureModalsExist();
  document.getElementById('asgTitle').value = '';
  document.getElementById('asgDesc').value = '';
  document.getElementById('asgAllowFile').checked = true;
  document.getElementById('asgAllowText').checked = true;
  document.getElementById('asgDeadline').value = '';
  document.getElementById('addAssignmentModal').dataset.materialId = materialId;
  document.getElementById('addAssignmentModal').dataset.course = course;
  document.getElementById('addAssignmentModal').classList.add('show');
};

window.submitAddAssignment = async () => {
  const modal = document.getElementById('addAssignmentModal');
  const title = document.getElementById('asgTitle').value.trim();
  if (!title) { alert('اكتبي عنوان الواجب'); return; }
  const allowFile = document.getElementById('asgAllowFile').checked;
  const allowText = document.getElementById('asgAllowText').checked;
  if (!allowFile && !allowText) { alert('اختاري وسيلة تسليم واحدة على الأقل'); return; }
  const deadline = document.getElementById('asgDeadline').value;

  try {
    await addAssignment({
      materialId: modal.dataset.materialId,
      course: modal.dataset.course,
      title,
      description: document.getElementById('asgDesc').value.trim(),
      allowFile, allowText, deadline
    });
    modal.classList.remove('show');
    if (window.refreshAssignmentsFor) window.refreshAssignmentsFor(modal.dataset.materialId, modal.dataset.course);
    alert('✅ تم نشر الواجب');
  } catch (e) {
    alert('خطأ: ' + e.message);
  }
};

window.removeAssignment = async (assignmentId, materialId, course) => {
  if (!confirm('متأكدة من حذف الواجب؟ هيتمسح مع كل الردود.')) return;
  await deleteAssignment(assignmentId);
  if (window.refreshAssignmentsFor) window.refreshAssignmentsFor(materialId, course);
};

// ── تفاصيل الواجب: عرض للطالبة (تسليم) أو للمعلمة (تقييم) ────
window.openAssignmentDetail = async (assignmentId, course) => {
  ensureModalsExist();
  const modal = document.getElementById('assignmentDetailModal');
  const body  = document.getElementById('asgDetailBody');
  body.innerHTML = '<div style="text-align:center;padding:30px"><i class="ti ti-loader spin"></i></div>';
  modal.classList.add('show');

  const canManage = canManageAssignments(course);

  // جيب بيانات الواجب
  const { getDoc: gd, doc: d } = await import("https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js");
  const asgSnap = await gd(d(db, 'assignments', assignmentId));
  if (!asgSnap.exists()) { body.innerHTML = '<div>الواجب غير موجود</div>'; return; }
  const asg = { id: asgSnap.id, ...asgSnap.data() };

  document.getElementById('asgDetailTitle').textContent = '📝 ' + asg.title;
  const dl = getDeadlineStatus(asg.deadline);

  if (canManage) {
    // ── واجهة المعلمة: كل الردود ──
    const subs = await getAllSubmissions(assignmentId);
    let html = `
      <div style="font-size:13px;color:var(--text-mid);margin-bottom:10px">${asg.description || ''}</div>
      <div style="font-size:12px;color:${dl.color};margin-bottom:14px">⏰ ${dl.text}</div>
      <div style="font-size:13px;font-weight:700;margin-bottom:10px">الردود (${subs.length})</div>`;

    if (subs.length === 0) {
      html += '<div style="text-align:center;color:var(--text-mid);padding:20px;font-size:13px">لا توجد ردود بعد</div>';
    } else {
      html += subs.map(s => `
        <div style="border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:10px">
          <div style="font-weight:700;font-size:13px;margin-bottom:6px">${s.studentName}</div>
          ${s.textAnswer ? `<div style="background:var(--beige,#f7f0e5);padding:8px 10px;border-radius:8px;font-size:13px;margin-bottom:6px;white-space:pre-wrap">${s.textAnswer}</div>` : ''}
          ${s.fileUrl ? `<a href="${s.fileUrl}" target="_blank" style="font-size:12px;color:var(--gold-mid);display:inline-block;margin-bottom:6px">📎 عرض الملف المرفوع</a>` : ''}
          <div style="display:flex;gap:8px;align-items:center;margin-top:8px">
            <input type="number" min="0" max="100" placeholder="الدرجة" value="${s.grade ?? ''}" id="grade-${s.studentUid}" style="width:80px;padding:6px;border:1px solid var(--border);border-radius:6px"/>
            <input type="text" placeholder="ملاحظة (اختياري)" value="${s.feedback ?? ''}" id="feedback-${s.studentUid}" style="flex:1;padding:6px;border:1px solid var(--border);border-radius:6px;font-size:12px"/>
            <button onclick="window.submitGrade('${assignmentId}','${s.studentUid}')" style="background:var(--green-dark);color:white;border:none;border-radius:6px;padding:6px 12px;font-size:12px;cursor:pointer">حفظ</button>
          </div>
          ${s.gradedAt ? `<div style="font-size:11px;color:#27ae60;margin-top:6px">✓ تم التقييم</div>` : ''}
        </div>`).join('');
    }
    body.innerHTML = html;

  } else {
    // ── واجهة الطالبة: تسليم/عرض ردها ──
    const mySub = await getMySubmission(assignmentId);
    let html = `
      <div style="font-size:13px;color:var(--text-mid);margin-bottom:10px">${asg.description || ''}</div>
      <div style="font-size:12px;color:${dl.color};margin-bottom:14px">⏰ ${dl.text}</div>`;

    if (mySub) {
      html += `<div style="background:rgba(39,174,96,0.08);border:1px solid #27ae60;border-radius:10px;padding:12px;margin-bottom:10px">
        <div style="font-size:13px;font-weight:700;color:#27ae60;margin-bottom:6px">✅ تم التسليم</div>
        ${mySub.textAnswer ? `<div style="background:var(--beige,#f7f0e5);padding:8px 10px;border-radius:8px;font-size:13px;margin-bottom:6px;white-space:pre-wrap">${mySub.textAnswer}</div>` : ''}
        ${mySub.fileUrl ? `<a href="${mySub.fileUrl}" target="_blank" style="font-size:12px;color:var(--gold-mid)">📎 عرض ملفك المرفوع</a>` : ''}
      </div>`;
      if (mySub.grade !== null && mySub.grade !== undefined) {
        html += `<div style="background:rgba(232,201,106,0.1);border:1px solid var(--gold);border-radius:10px;padding:12px">
          <div style="font-size:14px;font-weight:700;color:var(--green-dark)">الدرجة: ${mySub.grade}/100</div>
          ${mySub.feedback ? `<div style="font-size:13px;color:var(--text-mid);margin-top:6px">${mySub.feedback}</div>` : ''}
        </div>`;
      } else {
        html += `<div style="font-size:12px;color:var(--text-mid)">⏳ لم يتم التقييم بعد</div>`;
      }
    } else if (dl.status === 'expired') {
      html += `<div style="text-align:center;color:#e74c3c;padding:16px;font-size:13px">انتهى موعد التسليم</div>`;
    } else {
      html += `<div style="display:flex;flex-direction:column;gap:10px">`;
      if (asg.allowText) {
        html += `<textarea id="mySubmitText" rows="4" placeholder="اكتبي إجابتك هنا..." style="padding:10px;border:1px solid var(--border);border-radius:8px;font-family:inherit"></textarea>`;
      }
      if (asg.allowFile) {
        html += `<input type="file" id="mySubmitFile" style="font-size:13px"/>`;
      }
      html += `<button onclick="window.submitMyAssignment('${assignmentId}')" style="background:linear-gradient(135deg,#2c1a0e,#5c3d2e);color:#e8c96a;border:none;border-radius:10px;padding:11px;font-family:inherit;font-size:14px;cursor:pointer;font-weight:600">
        تسليم الواجب
      </button></div>`;
    }
    body.innerHTML = html;
  }
};

window.submitMyAssignment = async (assignmentId) => {
  const textEl = document.getElementById('mySubmitText');
  const fileEl = document.getElementById('mySubmitFile');
  const textAnswer = textEl ? textEl.value.trim() : '';
  const file = fileEl ? fileEl.files[0] : null;

  if (!textAnswer && !file) { alert('من فضلك اكتبي إجابة أو ارفعي ملف'); return; }

  try {
    let fileUrl = null;
    if (file) {
      fileUrl = await uploadFile(file);
    }
    await submitAssignment(assignmentId, { fileUrl, textAnswer });
    alert('✅ تم تسليم الواجب بنجاح');
    document.getElementById('assignmentDetailModal').classList.remove('show');
  } catch (e) {
    alert('خطأ: ' + e.message);
  }
};

window.submitGrade = async (assignmentId, studentUid) => {
  const grade = document.getElementById(`grade-${studentUid}`).value;
  const feedback = document.getElementById(`feedback-${studentUid}`).value;
  try {
    await gradeSubmission(assignmentId, studentUid, { grade: grade ? Number(grade) : null, feedback });
    alert('✅ تم حفظ التقييم');
  } catch (e) {
    alert('خطأ: ' + e.message);
  }
};
