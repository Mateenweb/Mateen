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
│   ├── admin.html              # لوحة الإداريات (Bootstrap navbar)
│   ├── courses.html            # المواد العلمية
│   ├── library.html            # المكتبة (4 أقسام)
│   ├── student.html            # ملف الطالبة
│   ├── messages.html           # الرسائل
│   ├── news.html               # الأخبار
│   ├── schedule.html           # الجدول الدراسي
│   ├── supervisor.html         # لوحة المشرفة
│   ├── teacher-*.html          # صفحات المعلمات
│   └── about.html              # عن البرنامج
├── css/
│   ├── shared.css              # الأنماط المشتركة
│   ├── home.css                # الصفحة الرئيسية
│   ├── admin.css               # لوحة الإدارة
│   ├── courses.css             # المواد العلمية
│   ├── library.css             # المكتبة
│   ├── modals.css              # النوافذ المنبثقة
│   ├── mobile.css              # الجوال
│   └── responsive-fix.css      # إصلاحات التجاوب
├── js/
│   ├── config.js               # إعدادات Firebase
│   ├── admin-1.js              # منطق لوحة الإدارة
│   ├── courses-firebase.js     # منطق المواد العلمية
│   ├── library-firebase.js     # منطق المكتبة
│   ├── messages.js             # الرسائل + Cloudinary
│   ├── supervisor-1.js         # منطق المشرفة
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
├── .github/workflows/
│   └── deploy-functions.yml    # GitHub Actions للـ deploy
├── manifest.json               # PWA manifest
└── firebase.json               # إعدادات Firebase Hosting
```

---

## ✨ المميزات

### 👥 إدارة المستخدمين
- **5 أدوار:** إدارة، مشرفة، معلمة، طالبة، أصدقاء متين
- تسجيل دخول وتسجيل جديد مع التحقق من الدور
- حذف الحساب نهائياً من Firestore و Firebase Auth عبر Cloud Function تلقائياً

### 📚 المواد العلمية
- **5 مواد:** التفسير، الفقه، العقيدة، الحديث، مقرأة متين
- الأدمن والمشرفة: تعديل وحذف وإضافة محتوى لكل المواد + تعديل المادة الرئيسية نفسها
- المعلمة: تضيف وتعدل وتحذف محتوى مادتها فقط
- الطالبة: تشوف المواد المتاحة لها بعد الالتحاق
- تعديلات المواد الثابتة تُحفظ في Firestore وتظهر لكل المستخدمين

### 📖 المكتبة (4 أقسام)
- **مكتبة متين** — المواد المضافة من Firebase مع فلتر حسب المادة
- **المسار الإثرائي** — محتوى إثرائي يعمّق الفهم
- **بودكاست تبصرة** — حلقات صوتية
- **دورات متنوعة** — دورات علمية وتطويرية
- الأدمن والمشرفة يضيفون ويعدلون ويحذفون في كل الأقسام

### 💬 الرسائل
- رسائل مباشرة بين المستخدمين
- إرسال صور وتسجيلات صوتية عبر **Cloudinary** (للمعلمات والمشرفات والإدارة)
- الطالبة: نصوص فقط
- إشعارات فورية عبر Firebase Cloud Messaging

### 🎓 إدارة الطالبات
- إضافة طالبات فردياً أو جماعياً
- تتبع حالة المقابلة وقرار القبول
- تصدير بيانات الطالبات لملف Word
- جدول دراسي أسبوعي مع تحويل هجري ↔ ميلادي

---

## 🛠️ التقنيات المستخدمة

| التقنية | الاستخدام |
|---|---|
| HTML / CSS / JS | واجهة المستخدم — بدون build tool |
| Bootstrap 5 | Navbar, Offcanvas, Responsive |
| Firebase Auth | تسجيل الدخول والأدوار |
| Firebase Firestore | قاعدة البيانات الرئيسية |
| Firebase Hosting | استضافة الموقع |
| Firebase Functions | حذف المستخدمين من Auth تلقائياً |
| Firebase Messaging | إشعارات Push |
| **Cloudinary** | رفع الصور والتسجيلات الصوتية |
| GitHub Actions | Deploy تلقائي للـ Functions |
| Tabler Icons | أيقونات الواجهة |

---

## ⚙️ الإعداد

### Firebase
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

### Cloudinary
في `js/messages.js`:
```js
const CLOUD_NAME    = 'YOUR_CLOUD_NAME';
const UPLOAD_PRESET = 'mateen_uploads'; // Unsigned preset
```

---

## 🚀 النشر

- **الموقع** — GitHub Pages يتحدث تلقائياً عند كل push على `main`
- **Firebase Functions** — أضيفي `FIREBASE_SERVICE_ACCOUNT` كـ Secret في GitHub، وGitHub Actions يتولى الـ deploy تلقائياً عند تعديل `functions/`

---

## 📁 Firestore Collections

| Collection | المحتوى |
|---|---|
| `users` | بيانات المستخدمين والأدوار |
| `students` | بيانات الطالبات وحالة القبول |
| `materials` | المواد المضافة لكل مادة علمية |
| `staticSubjects` | تعديلات المواد الثابتة |
| `libraryItems` | محتوى المكتبة (إثرائي، بودكاست، دورات) |
| `conversations` | المحادثات والرسائل |
| `news` | الأخبار والإعلانات |
