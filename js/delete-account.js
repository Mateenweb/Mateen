/**
 * delete-account.js
 * Delete حساب كامل من Firestore + Firebase Authentication
 * يشمل: users doc, students doc + subcollections, conversations,
 * وalso حساب Authentication same style (So that الإيميل يترفع/يتحرر)
 */

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getFirestore, doc, getDoc, getDocs, deleteDoc, collection, query, where }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { getFunctions, httpsCallable }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-functions.js";
import { FIREBASE_CONFIG } from "./config.js";

const app  = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const db   = getFirestore(app);
const fns  = getFunctions(app);
const deleteAuthUserFn = httpsCallable(fns, "deleteAuthUser");

// مسح subcollection كاملة
async function deleteSubcollection(parentRef, subcollName) {
  const snap = await getDocs(collection(parentRef, subcollName));
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
}

/**
 * fullDeleteUser(uid)
 * يمسح كل بيانات User من Firestore + حساب Authentication
 */
export async function fullDeleteUser(uid) {
  const errors = [];

  // 1. users/{uid}
  try { await deleteDoc(doc(db, 'users', uid)); } catch(e) { errors.push('users: ' + e.message); }

  // 2. students/{uid} + subcollections
  try {
    const studentRef = doc(db, 'students', uid);
    const studentSnap = await getDoc(studentRef);
    if (studentSnap.exists()) {
      await deleteSubcollection(studentRef, 'sessions');
      await deleteSubcollection(studentRef, 'grades');
      await deleteDoc(studentRef);
    }
  } catch(e) { errors.push('students: ' + e.message); }

  // 3. conversations التي يكون uid طرفاً فيها
  try {
    const convSnap = await getDocs(
      query(collection(db, 'conversations'), where('participants', 'array-contains', uid))
    );
    await Promise.all(convSnap.docs.map(async convDoc => {
      // مسح messages subcollection أولاً
      await deleteSubcollection(convDoc.ref, 'messages');
      await deleteDoc(convDoc.ref);
    }));
  } catch(e) { errors.push('conversations: ' + e.message); }

  // 4. Delete الحساب من Firebase Authentication (يحرر الإيميل لإعادة الاستخدام)
  //    لازم يتم عن طريق Cloud Function Because الـ client SDK مينفعش
  //    يDelete Auth account لمستخدمة تانية غير اللي مسجلة دخولها حالياً.
  try {
    await deleteAuthUserFn({ uid });
  } catch(e) { errors.push('auth: ' + e.message); }

  if (errors.length) console.warn('fullDeleteUser partial errors:', errors);
}
