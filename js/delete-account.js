/**
 * delete-account.js
 * حذف حساب كامل من Firestore + Auth
 * يشمل: users doc, students doc + subcollections, conversations
 */

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getFirestore, doc, getDoc, getDocs, deleteDoc, collection, query, where }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./config.js";

const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const db  = getFirestore(app);

// مسح subcollection كاملة
async function deleteSubcollection(parentRef, subcollName) {
  const snap = await getDocs(collection(parentRef, subcollName));
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
}

/**
 * fullDeleteUser(uid)
 * يمسح كل بيانات المستخدم من Firestore
 * (Auth يتمسح منفصلاً لأنه يحتاج credentials)
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

  if (errors.length) console.warn('fullDeleteUser partial errors:', errors);
}
