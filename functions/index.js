// =========================================================
//  Firebase Cloud Functions — Mateen
//  بيبعت إشعار FCM لما تيجي رسالة جديدة
// =========================================================
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp }     = require("firebase-admin/app");
const { getFirestore }      = require("firebase-admin/firestore");
const { getMessaging }      = require("firebase-admin/messaging");
const { getAuth }           = require("firebase-admin/auth");

initializeApp();
const db = getFirestore();

// =========================================================
//  deleteUser — تحذف المستخدم من Auth + Firestore كامل
//  تُنادى من الأدمن فقط
// =========================================================
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getAuth }            = require("firebase-admin/auth");

exports.deleteUser = onCall({ region: "us-central1" }, async (request) => {
  // 1. لازم يكون مسجّل دخول
  if (!request.auth) throw new HttpsError("unauthenticated", "يجب تسجيل الدخول");

  // 2. تأكد إن اللي بينادي أدمن أو مشرفة
  const callerSnap = await db.doc(`users/${request.auth.uid}`).get();
  const role = callerSnap.data()?.role;
  if (role !== "admin" && role !== "supervisor") {
    throw new HttpsError("permission-denied", "غير مصرح");
  }

  const uid = request.data?.uid;
  if (!uid) throw new HttpsError("invalid-argument", "uid مطلوب");

  const errors = [];

  // 3. مسح Firestore: users/{uid}
  try { await db.doc(`users/${uid}`).delete(); } catch(e) { errors.push("users: " + e.message); }

  // 4. مسح students/{uid} + subcollections
  try {
    const studentRef  = db.doc(`students/${uid}`);
    const studentSnap = await studentRef.get();
    if (studentSnap.exists) {
      const subs = ["sessions", "grades"];
      for (const sub of subs) {
        const snap = await studentRef.collection(sub).get();
        await Promise.all(snap.docs.map(d => d.ref.delete()));
      }
      await studentRef.delete();
    }
  } catch(e) { errors.push("students: " + e.message); }

  // 5. مسح conversations التي يكون uid طرفاً فيها
  try {
    const convSnap = await db.collection("conversations")
      .where("participants", "array-contains", uid).get();
    await Promise.all(convSnap.docs.map(async convDoc => {
      const msgs = await convDoc.ref.collection("messages").get();
      await Promise.all(msgs.docs.map(m => m.ref.delete()));
      await convDoc.ref.delete();
    }));
  } catch(e) { errors.push("conversations: " + e.message); }

  // 6. مسح من Firebase Auth — ده اللي مش ممكن يتعمل من المتصفح
  try { await getAuth().deleteUser(uid); } catch(e) { errors.push("auth: " + e.message); }

  if (errors.length) console.warn("deleteUser partial errors:", errors);
  return { success: true, errors };
});

// =========================================================
exports.sendMessageNotification = onDocumentCreated(
  "conversations/{convId}/messages/{msgId}",
  async (event) => {
    const msg   = event.data.data();
    const convId = event.params.convId;

    // جيب المحادثة عشان تعرف المشاركين
    const convSnap = await db.doc(`conversations/${convId}`).get();
    if (!convSnap.exists) return;

    const participants = convSnap.data().participants || [];
    const senderId     = msg.senderId;
    const senderName   = msg.senderName || "متين";
    const text         = msg.text || "رسالة جديدة";

    // ابعت إشعار لكل مشارك غير المرسل
    const recipients = participants.filter(uid => uid !== senderId);

    for (const uid of recipients) {
      const userSnap = await db.doc(`users/${uid}`).get();
      if (!userSnap.exists) continue;

      const tokens = userSnap.data().fcmTokens || {};
      const tokenList = Object.keys(tokens);
      if (!tokenList.length) continue;

      // ابعت لكل device token
      const messages = tokenList.map(token => ({
        token,
        notification: {
          title: `💬 ${senderName}`,
          body:  text.length > 80 ? text.slice(0, 80) + "…" : text,
        },
        android: { notification: { sound: "default", priority: "high" } },
        apns:    { payload: { aps: { sound: "default" } } },
        webpush: {
          notification: {
            icon:  "https://mateenweb.github.io/Mateen/logo.png",
            badge: "https://mateenweb.github.io/Mateen/favicon.ico",
            dir:   "rtl",
            lang:  "ar",
            tag:   "mateen-msg",
            renotify: true,
          },
          fcmOptions: {
            link: `https://mateenweb.github.io/Mateen/html/messages.html`,
          },
        },
        data: {
          convId,
          senderId,
          url: "/html/messages.html",
        },
      }));

      // ابعت كل التوكنات دفعة واحدة
      const results = await getMessaging().sendEach(messages);

      // امسح التوكنات المنتهية/الغلط
      const invalidTokens = [];
      results.responses.forEach((r, i) => {
        if (!r.success &&
            (r.error?.code === "messaging/registration-token-not-registered" ||
             r.error?.code === "messaging/invalid-registration-token")) {
          invalidTokens.push(tokenList[i]);
        }
      });
      if (invalidTokens.length) {
        const updates = {};
        invalidTokens.forEach(t => updates[`fcmTokens.${t}`] = require("firebase-admin/firestore").FieldValue.delete());
        await db.doc(`users/${uid}`).update(updates);
      }
    }
  }
);

// =========================================================
//  deleteAuthUser — يحذف حساب Firebase Authentication نهائياً
//  بيتنادى من delete-account.js بعد ما تتمسح بيانات Firestore
// =========================================================
exports.deleteAuthUser = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "يجب تسجيل الدخول لتنفيذ هذا الإجراء");
  }

  const targetUid = request.data?.uid;
  if (!targetUid) {
    throw new HttpsError("invalid-argument", "uid مفقود");
  }

  // اسمحي فقط: المستخدمة تحذف حسابها هي، أو الإدارة تحذف أي حساب
  if (callerUid !== targetUid) {
    const callerSnap = await db.doc(`users/${callerUid}`).get();
    const callerRole = callerSnap.exists ? callerSnap.data().role : null;
    if (callerRole !== "admin" && callerRole !== "supervisor") {
      throw new HttpsError("permission-denied", "ليس لديك صلاحية حذف هذا الحساب");
    }
  }

  try {
    await getAuth().deleteUser(targetUid);
    return { success: true };
  } catch (e) {
    // لو الحساب أصلاً مش موجود في Auth (اتمسح قبل كده) — اعتبريها نجحت
    if (e.code === "auth/user-not-found") {
      return { success: true, note: "already-deleted" };
    }
    throw new HttpsError("internal", "فشل حذف حساب Authentication: " + e.message);
  }
});
