// ===========================
//  إدارة المواد الدراسية — Dynamic Subjects
// ===========================
import { getFirestore, collection, getDocs, addDoc, deleteDoc, doc, updateDoc, query, orderBy, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { FIREBASE_CONFIG } from "./config.js";

const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
const db  = getFirestore(app);

// fallback في حالة عدم توفر اتصال أو الـ collection فاضية لأول مرة
// كل مادة افتراضية تظهر في كل الأقسام
const DEFAULT_SUBJECTS = [
  { name: 'التفسير',    inExams: true, inAttendance: true, inEnrollment: true },
  { name: 'الفقه',      inExams: true, inAttendance: true, inEnrollment: true },
  { name: 'العقيدة',    inExams: true, inAttendance: true, inEnrollment: true },
  { name: 'الحديث',     inExams: true, inAttendance: true, inEnrollment: true },
  { name: 'مقرأة متين', inExams: true, inAttendance: true, inEnrollment: true },
];

let _subjectsCache = null; // كل المواد (raw objects)

// جلب كل المواد كاملة (بكل الحقول والـ id)
async function loadAllSubjectsRaw() {
  if (_subjectsCache) return _subjectsCache;
  try {
    const snap = await getDocs(query(collection(db, 'subjects'), orderBy('createdAt', 'asc')));
    if (snap.empty) {
      _subjectsCache = DEFAULT_SUBJECTS.map((s, i) => ({ id: 'default-' + i, ...s }));
    } else {
      _subjectsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  } catch (e) {
    console.error('loadSubjects error:', e);
    _subjectsCache = DEFAULT_SUBJECTS.map((s, i) => ({ id: 'default-' + i, ...s }));
  }
  return _subjectsCache;
}

// كل أسماء المواد (للتوافق مع الكود القديم)
export async function loadSubjects() {
  const all = await loadAllSubjectsRaw();
  return all.map(s => s.name);
}

// المواد المخصصة لقسم معين فقط — key: 'inExams' | 'inAttendance' | 'inEnrollment'
export async function loadSubjectsFor(key) {
  const all = await loadAllSubjectsRaw();
  return all.filter(s => s[key] !== false).map(s => s.name);
}

// إضافة مادة جديدة مع تحديد الأقسام
export async function addSubject(name, flags = { inExams: true, inAttendance: true, inEnrollment: true }) {
  name = (name || '').trim();
  if (!name) throw new Error('اسم المادة مطلوب');
  await addDoc(collection(db, 'subjects'), {
    name,
    inExams: !!flags.inExams,
    inAttendance: !!flags.inAttendance,
    inEnrollment: !!flags.inEnrollment,
    createdAt: serverTimestamp()
  });
  _subjectsCache = null; // إبطال الكاش عشان يتجدد
}

// تعديل أقسام مادة موجودة
export async function updateSubjectFlags(id, flags) {
  await updateDoc(doc(db, 'subjects', id), {
    inExams: !!flags.inExams,
    inAttendance: !!flags.inAttendance,
    inEnrollment: !!flags.inEnrollment,
  });
  _subjectsCache = null;
}

// حذف مادة
export async function deleteSubject(id) {
  await deleteDoc(doc(db, 'subjects', id));
  _subjectsCache = null;
}

// جلب المواد مع كل التفاصيل (لقسم الإدارة)
export async function loadSubjectsWithIds() {
  return await loadAllSubjectsRaw();
}

// تهيئة المواد الافتراضية لو الـ collection فاضية تماماً (تتنادى مرة واحدة من لوحة الإدارة)
export async function seedDefaultSubjectsIfEmpty() {
  const snap = await getDocs(collection(db, 'subjects'));
  if (!snap.empty) return false;
  for (const s of DEFAULT_SUBJECTS) {
    await addDoc(collection(db, 'subjects'), { ...s, createdAt: serverTimestamp() });
  }
  _subjectsCache = null;
  return true;
}
