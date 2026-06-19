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
//  حذف حساب من Firebase Authentication (يحتاج صلاحية admin)
//  السبب: الـ client SDK مينفعش يحذف Auth account لمستخدمة
//  تانية غير اللي عامل لها login حالياً، ده محتاج Admin SDK
//  وبالتالي لازم يتنفذ من سيرفر (Cloud Function) زي هنا.
// =========================================================
exports.deleteAuthUser = onCall(async (request) => {
  // 1. لازم يكون المستخدم مسجل دخول
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً");
  }

  // 2. تحقق إن صاحب الطلب admin فعلاً (من Firestore)
  const callerSnap = await db.doc(`users/${request.auth.uid}`).get();
  const callerRole = callerSnap.exists ? callerSnap.data().role : null;
  if (callerRole !== "admin" && callerRole !== "supervisor") {
    throw new HttpsError("permission-denied", "غير مصرح لكِ بحذف الحسابات");
  }

  // 3. تحقق من وجود uid المراد حذفه
  const targetUid = request.data && request.data.uid;
  if (!targetUid || typeof targetUid !== "string") {
    throw new HttpsError("invalid-argument", "uid المستخدمة المطلوب حذفها غير موجود");
  }

  // 4. امنعي حذف الأدمن لنفسه بالغلط
  if (targetUid === request.auth.uid) {
    throw new HttpsError("failed-precondition", "لا يمكنك حذف حسابك الخاص من هنا");
  }

  // 5. الحذف الفعلي من Firebase Authentication
  try {
    await getAuth().deleteUser(targetUid);
    return { success: true };
  } catch (e) {
    if (e.code === "auth/user-not-found") {
      // الحساب أصلاً مش موجود في Auth (محذوف قبل كده) — ده مش خطأ
      return { success: true, note: "already-deleted" };
    }
    throw new HttpsError("internal", e.message);
  }
});

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
