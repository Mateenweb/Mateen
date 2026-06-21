# 🌿 برنامج متين العلمي

منصة تعليمية إسلامية متكاملة لإدارة الطالبات والمواد العلمية، مبنية على Firebase مع واجهة عربية RTL كاملة.

🔗 **الموقع:** [mateenweb.github.io/Mateen](https://mateenweb.github.io/Mateen/)

---

## 🗂️ هيكل المشروع

```
Mateen/
├── index.html                  # إعادة توجيه لصفحة الدخول
├── html/
│   ├── home.html               # الصفحة الرئيسية
│   ├── login.html              # تسجيل الدخول والتسجيل
│   ├── admin.html              # لوحة الإداريات
│   ├── courses.html            # المواد العلمية
│   ├── student.html            # ملف الطالبة
│   ├── messages.html           # الرسائل
│   ├── news.html               # الأخبار
│   ├── library.html            # المكتبة
│   ├── schedule.html           # الجدول الدراسي
│   ├── supervisor.html         # لوحة المشرفة
│   ├── teacher-*.html          # صفحات المعلمات (تفسير، فقه، عقيدة، حديث، مقرأة)
│   └── about.html              # عن البرنامج
├── css/
│   ├── shared.css              # الأنماط المشتركة (nav, footer, basmala)
│   ├── home.css                # الصفحة الرئيسية
│   ├── admin.css               # لوحة الإدارة
│   ├── courses.css             # المواد العلمية
│   ├── modals.css              # النوافذ المنبثقة
│   ├── mobile.css              # الأنماط للجوال
│   └── responsive-fix.css      # إصلاحات التجاوب
├── js/
│   ├── config.js               # إعدادات Firebase
│   ├── admin-1.js              # منطق لوحة الإدارة
│   ├── courses-firebase.js     # منطق المواد العلمية
│   ├── supervisor-1.js         # منطق لوحة المشرفة
│   ├── teacher-*.js            # منطق صفحات المعلمات
│   ├── export.js               # تصدير Word/PDF
│   ├── dateUtils.js            # تحويل التاريخ هجري ↔ ميلادي
│   ├── notifications.js        # إشعارات FCM
│   └── sw-register.js          # Service Worker
├── functions/
│   └── index.js                # Firebase Cloud Functions
├── libs/
│   ├── tabler-icons/           # أيقونات Tabler
│   └── fonts/                  # خطوط عربية
├── manifest.json               # PWA manifest
└── firebase.json               # إعدادات Firebase Hosting
```

---

## ✨ المميزات

### 👥 إدارة المستخدمين
- **5 أدوار:** إدارة، مشرفة، معلمة، طالبة، أصدقاء متين
- تسجيل دخول وتسجيل جديد مع التحقق من الدور
- حذف الحساب نهائياً من Firestore و Firebase Auth عبر Cloud Function

### 📚 المواد العلمية
- **5 مواد:** التفسير، الفقه، العقيدة، الحديث، مقرأة متين
- الأدمن والمشرفة: تعديل وحذف وإضافة محتوى لكل المواد
- المعلمة: تضيف وتعدل وتحذف محتوى مادتها فقط
- الطالبة: تشوف المواد المتاحة لها بعد الالتحاق

### 🎓 إدارة الطالبات
- إضافة طالبات فردياً أو جماعياً
- تتبع حالة المقابلة وقرار القبول
- تصدير بيانات الطالبات لملف Word مع خيارات تخصيص متقدمة
- تقسيم الصفحات حسب الوقت واليوم

### 📅 نظام التاريخ
- إدخال بالتقويم **الهجري** مع تحويل تلقائي للـ**ميلادي**
- جدول دراسي أسبوعي

### 💬 التواصل
- رسائل مباشرة بين المستخدمين
- إشعارات فورية عبر Firebase Cloud Messaging (FCM)

### 📰 الأخبار والمكتبة
- إدارة الأخبار والإعلانات
- مكتبة الموارد التعليمية

---

## 🛠️ التقنيات المستخدمة

| التقنية | الاستخدام |
|---|---|
| HTML / CSS / JS | واجهة المستخدم — بدون build tool |
| Bootstrap 5 | Navbar, Offcanvas, Responsive |
| Firebase Auth | تسجيل الدخول والأدوار |
| Firebase Firestore | قاعدة البيانات الرئيسية |
| Firebase Hosting | استضافة الموقع |
| Firebase Functions | حذف المستخدمين من Auth |
| Firebase Messaging | إشعارات Push |
| GitHub Actions | Deploy تلقائي للـ Functions |
| Tabler Icons | أيقونات الواجهة |

---

## ⚙️ إعداد Firebase

عدّلي القيم في `js/config.js`:

```js
export const FIREBASE_CONFIG = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  projectId:         "YOUR_PROJECT",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};
```

---

## 🚀 النشر

الموقع منشور على **GitHub Pages** ويتحدث تلقائياً عند كل push على `main`.

لنشر Firebase Functions:
- أضيفي `FIREBASE_SERVICE_ACCOUNT` كـ Secret في GitHub repo
- GitHub Actions يتولى الـ deploy تلقائياً عند تعديل `functions/`

---

## 📁 Firestore Collections

| Collection | المحتوى |
|---|---|
| `users` | بيانات المستخدمين والأدوار |
| `students` | بيانات الطالبات وحالة القبول |
| `materials` | المواد المضافة لكل مادة علمية |
| `subjects` | المواد الرئيسية المضافة ديناميكياً |
| `staticSubjects` | تعديلات المواد الثابتة (التفسير، الفقه، إلخ) |
| `conversations` | المحادثات والرسائل |
| `news` | الأخبار والإعلانات |
| `library` | المكتبة |
