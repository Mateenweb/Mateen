// =========================================================
//  Firebase Cloud Functions — Mateen
// =========================================================
const { onDocumentCreated, onDocumentDeleted } = require("firebase-functions/v2/firestore");
const { initializeApp }  = require("firebase-admin/app");
const { getFirestore }   = require("firebase-admin/firestore");
const { getMessaging }   = require("firebase-admin/messaging");
const { getAuth }        = require("firebase-admin/auth");

initializeApp();
const db = getFirestore();

// =========================================================
//  1. deleteUserFromAuth
//  Firestore trigger: لما يتمسح users/{uid} يتمسح من Auth تلقائياً
// =========================================================
exports.deleteUserFromAuth = onDocumentDeleted("users/{uid}", async (event) => {
  const uid = event.params.uid;
  try {
    await getAuth().deleteUser(uid);
    console.log(`✅ حُذف ${uid} من Auth`);
  } catch (e) {
    if (e.code === "auth/user-not-found") {
      console.log(`ℹ️ ${uid} مش موجود في Auth`);
    } else {
      console.error(`❌ خطأ في حذف ${uid}:`, e.message);
    }
  }
});

// =========================================================
//  2. sendMessageNotification
//  بيبعت إشعار FCM لما تيجي رسالة جديدة
// =========================================================
exports.sendMessageNotification = onDocumentCreated(
  "conversations/{convId}/messages/{msgId}",
  async (event) => {
    const msg    = event.data.data();
    const convId = event.params.convId;

    const convSnap = await db.doc(`conversations/${convId}`).get();
    if (!convSnap.exists) return;

    const participants = convSnap.data().participants || [];
    const senderId     = msg.senderId;
    const senderName   = msg.senderName || "متين";
    const text         = msg.text || "رسالة جديدة";
    const recipients   = participants.filter(uid => uid !== senderId);

    for (const uid of recipients) {
      const userSnap = await db.doc(`users/${uid}`).get();
      if (!userSnap.exists) continue;

      const tokens    = userSnap.data().fcmTokens || {};
      const tokenList = Object.keys(tokens);
      if (!tokenList.length) continue;

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
            icon:     "https://mateenweb.github.io/Mateen/logo.png",
            badge:    "https://mateenweb.github.io/Mateen/favicon.ico",
            dir:      "rtl",
            lang:     "ar",
            tag:      "mateen-msg",
            renotify: true,
          },
          fcmOptions: { link: "https://mateenweb.github.io/Mateen/html/messages.html" },
        },
        data: { convId, senderId, url: "/html/messages.html" },
      }));

      const results = await getMessaging().sendEach(messages);

      // امسح التوكنات المنتهية
      const invalidTokens = [];
      results.responses.forEach((r, i) => {
        if (!r.success && (
          r.error?.code === "messaging/registration-token-not-registered" ||
          r.error?.code === "messaging/invalid-registration-token"
        )) invalidTokens.push(tokenList[i]);
      });

      if (invalidTokens.length) {
        const { FieldValue } = require("firebase-admin/firestore");
        const updates = {};
        invalidTokens.forEach(t => updates[`fcmTokens.${t}`] = FieldValue.delete());
        await db.doc(`users/${uid}`).update(updates);
      }
    }
  }
);
// trigger deploy Sat Jun 20 11:31:31 UTC 2026
