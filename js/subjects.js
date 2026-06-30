// ===========================
//  إدارة المواد الدراسية — Dynamic Subjects
// ===========================
import { getFirestore, collection, getDocs, addDoc, deleteDoc, doc, query, orderBy, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { FIREBASE_CONFIG } from "./config.js";

const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
const db  = getFirestore(app);

// fallback في حالة عدم توفر اتصال أو الـ collection فاضية لأول مرة
const DEFAULT_SUBJECTS = ['التفسير', 'الفقه', 'العقيدة', 'الحديث', 'مقرأة متين'];

let _subjectsCache = null;

// جلب كل المواد من Firestore (مرتبة حسب وقت الإضافة)
export async function loadSubjects() {
  if (_subjectsCache) return _subjectsCache;
  try {
    const snap = await getDocs(query(collection(db, 'subjects'), orderBy('createdAt', 'asc')));
    if (snap.empty) {
      _subjectsCache = DEFAULT_SUBJECTS;
    } else {
      _subjectsCache = snap.docs.map(d => d.data().name).filter(Boolean);
    }
  } catch (e) {
    console.error('loadSubjects error:', e);
    _subjectsCache = DEFAULT_SUBJECTS;
  }
  return _subjectsCache;
}

// إضافة مادة جديدة
export async function addSubject(name) {
  name = (name || '').trim();
  if (!name) throw new Error('اسم المادة مطلوب');
  await addDoc(collection(db, 'subjects'), { name, createdAt: serverTimestamp() });
  _subjectsCache = null; // إبطال الكاش عشان يتجدد
}

// حذف مادة
export async function deleteSubject(id) {
  await deleteDoc(doc(db, 'subjects', id));
  _subjectsCache = null;
}

// جلب المواد مع الـ id بتاعها (لقسم الإدارة)
export async function loadSubjectsWithIds() {
  const snap = await getDocs(query(collection(db, 'subjects'), orderBy('createdAt', 'asc')));
  return snap.docs.map(d => ({ id: d.id, name: d.data().name }));
}

// تهيئة المواد الافتراضية لو الـ collection فاضية تماماً (تتنادى مرة واحدة من لوحة الإدارة)
export async function seedDefaultSubjectsIfEmpty() {
  const snap = await getDocs(collection(db, 'subjects'));
  if (!snap.empty) return false;
  for (const name of DEFAULT_SUBJECTS) {
    await addDoc(collection(db, 'subjects'), { name, createdAt: serverTimestamp() });
  }
  _subjectsCache = null;
  return true;
}
