// ===========================
//  نظام الواجبات — Assignments System
// ===========================
import { initializeApp, getApps, getApp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getFirestore, collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc,
         query, where, orderBy, onSnapshot, serverTimestamp, Timestamp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./config.js";

const app  = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

/*
هيكلة Firestore:
assignments/{assignmentId}
  - materialId: string  (ربط بالمحاضرة/المادة من materials collection)
  - course: string      (اسم المادة — التفسير، الفقه...)
  - title: string
  - description: string
  - allowFile: bool
  - allowText: bool
  - deadline: Timestamp
  - createdBy: uid
  - createdAt: Timestamp

assignments/{assignmentId}/submissions/{studentUid}
  - studentUid: string
  - studentName: string
  - fileUrl: string | null
  - textAnswer: string | null
  - submittedAt: Timestamp
  - grade: number | null
  - feedback: string | null
  - gradedAt: Timestamp | null
  - gradedBy: uid | null
*/

// ── إضافة واجب جديد (معلمة/أدمن فقط) ──────────────────────────
export async function addAssignment({ materialId, course, title, description, allowFile, allowText, deadline }) {
  const user = auth.currentUser;
  if (!user) throw new Error('يجب تسجيل الدخول');
  if (!allowFile && !allowText) throw new Error('اختاري وسيلة تسليم واحدة على الأقل');

  return await addDoc(collection(db, 'assignments'), {
    materialId, course, title, description: description || '',
    allowFile: !!allowFile, allowText: !!allowText,
    deadline: deadline ? Timestamp.fromDate(new Date(deadline)) : null,
    createdBy: user.uid,
    createdAt: serverTimestamp()
  });
}

// ── جلب واجبات محاضرة معينة ──────────────────────────────────
export async function getAssignmentsForMaterial(materialId) {
  const q = query(collection(db, 'assignments'), where('materialId', '==', materialId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── جلب كل واجبات مادة معينة (لصفحة المعلمة) ─────────────────
export async function getAssignmentsForCourse(course) {
  const q = query(collection(db, 'assignments'), where('course', '==', course), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── حذف واجب ──────────────────────────────────────────────────
export async function deleteAssignment(assignmentId) {
  await deleteDoc(doc(db, 'assignments', assignmentId));
}

// ── تسليم رد الطالبة على الواجب ──────────────────────────────
export async function submitAssignment(assignmentId, { fileUrl, textAnswer }) {
  const user = auth.currentUser;
  if (!user) throw new Error('يجب تسجيل الدخول');

  const studentSnap = await getDoc(doc(db, 'users', user.uid));
  const studentName = studentSnap.exists() ? (studentSnap.data().name || user.email) : user.email;

  await updateDoc(doc(db, 'assignments', assignmentId, 'submissions', user.uid), {
    studentUid: user.uid,
    studentName,
    fileUrl: fileUrl || null,
    textAnswer: textAnswer || null,
    submittedAt: serverTimestamp()
  }).catch(async () => {
    // لو الـ doc مش موجود (أول تسليم)
    const { setDoc } = await import("https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js");
    await setDoc(doc(db, 'assignments', assignmentId, 'submissions', user.uid), {
      studentUid: user.uid,
      studentName,
      fileUrl: fileUrl || null,
      textAnswer: textAnswer || null,
      submittedAt: serverTimestamp(),
      grade: null,
      feedback: null,
      gradedAt: null,
      gradedBy: null
    });
  });
}

// ── جلب رد طالبة معينة على واجب (الطالبة بتشوف ردها هي بس) ───
export async function getMySubmission(assignmentId) {
  const user = auth.currentUser;
  if (!user) return null;
  const snap = await getDoc(doc(db, 'assignments', assignmentId, 'submissions', user.uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// ── جلب كل الردود على واجب (للمعلمة/الأدمن فقط) ──────────────
export async function getAllSubmissions(assignmentId) {
  const snap = await getDocs(collection(db, 'assignments', assignmentId, 'submissions'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── تقييم رد طالبة (معلمة/أدمن) ───────────────────────────────
export async function gradeSubmission(assignmentId, studentUid, { grade, feedback }) {
  const user = auth.currentUser;
  if (!user) throw new Error('يجب تسجيل الدخول');
  await updateDoc(doc(db, 'assignments', assignmentId, 'submissions', studentUid), {
    grade: grade ?? null,
    feedback: feedback || '',
    gradedAt: serverTimestamp(),
    gradedBy: user.uid
  });
}

// ── حساب الوقت المتبقي للموعد النهائي ────────────────────────
export function getDeadlineStatus(deadline) {
  if (!deadline) return { status: 'none', text: 'بدون موعد نهائي', color: 'var(--text-mid)' };
  const now = new Date();
  const dl = deadline.toDate ? deadline.toDate() : new Date(deadline);
  const diffMs = dl - now;
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffHours / 24;

  if (diffMs < 0) {
    return { status: 'expired', text: 'انتهى الموعد النهائي', color: '#e74c3c' };
  } else if (diffHours <= 24) {
    return { status: 'urgent', text: `باقي ${Math.round(diffHours)} ساعة فقط!`, color: '#e74c3c' };
  } else if (diffDays <= 3) {
    return { status: 'soon', text: `باقي ${Math.round(diffDays)} يوم`, color: '#e67e22' };
  } else {
    return { status: 'ok', text: dl.toLocaleDateString('ar-EG', { day:'numeric', month:'long', year:'numeric' }), color: 'var(--green-dark)' };
  }
}
