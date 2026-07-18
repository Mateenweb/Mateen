# 🌿 برنامج متين العلمي

منصة تعليمية إسلامية متكاملة لإدارة الطالبات والمواد العلمية، مبنية على Firebase مع واجهة عربية RTL كاملة، وتعمل كتطبيق PWA قابل للتثبيت.

🔗 **الموقع:** [mateenweb.github.io/Mateen](https://mateenweb.github.io/Mateen/)

---

## 🗂️ هيكل المشروع

```
Mateen/
├── index.html                  # إعادة توجيه لصفحة الدخول
├── docs-user-guide.md          # دليل استخدام الموقع لكل دور
├── manifest.json               # PWA manifest
├── sw.js                       # Service Worker
├── mateen.apk                  # نسخة أندرويد قابلة للتثبيت
├── html/
│   ├── home.html               # الصفحة الرئيسية
│   ├── login.html              # تسجيل الدخول والتسجيل
│   ├── onboarding.html         # ترحيب وتهيئة الحساب الجديد
│   ├── admin.html              # لوحة الإداريات (Bootstrap navbar)
│   ├── support.html            # لوحة الدعم الفني
│   ├── courses.html            # المواد العلمية
│   ├── library.html            # المكتبة (4 أقسام)
│   ├── student.html            # ملف الطالبة
│   ├── student-general.html    # صفحة الطالبة العامة
│   ├── student-view.html       # عرض ملف طالبة (للمعلمة/المشرفة)
│   ├── my-students.html        # طالبات المعلمة
│   ├── messages.html           # الرسائل
│   ├── news.html                # الأخبار
│   ├── schedule.html           # الجدول الدراسي
│   ├── stats.html              # الإحصائيات والتصدير
│   ├── supervisor.html         # لوحة المشرفة
│   ├── teacher-*.html          # صفحات المعلمات (حسب المادة)
│   └── about.html              # عن البرنامج
├── css/
│   ├── shared.css / common.css # الأنماط المشتركة
│   ├── admin.css               # لوحة الإدارة والدعم
│   ├── courses.css             # المواد العلمية
│   ├── library.css             # المكتبة
│   ├── stats.css               # الإحصائيات
│   ├── modals.css              # النوافذ المنبثقة
│   ├── mobile.css              # الجوال
│   └── responsive-fix.css      # إصلاحات التجاوب
├── js/
│   ├── config.js               # إعدادات Firebase
│   ├── admin-1.js               # منطق لوحة الإدارة
│   ├── admin-news.js           # إدارة الأخبار من لوحة الأدمن
│   ├── support-1.js            # منطق لوحة الدعم الفني
│   ├── custom-theme.js         # نظام الثيمات المخصصة لكل حساب
│   ├── assignments.js / assignments-ui.js  # نظام الواجبات
│   ├── stats.js                # الإحصائيات
│   ├── export.js               # تصدير Excel / Word / PDF
│   ├── courses-firebase.js     # منطق المواد العلمية
│   ├── library-firebase.js     # منطق المكتبة
│   ├── subjects.js             # إدارة قائمة المواد من Firestore
│   ├── messages.js             # الرسائل + Cloudinary
│   ├── cloud-upload.js         # رفع الملفات عبر Cloudinary
│   ├── supervisor-1.js         # منطق المشرفة
│   ├── teacher-*.js            # منطق صفحات المعلمات
│   ├── delete-account.js       # حذف الحساب نهائياً
│   ├── dateUtils.js            # تحويل التاريخ هجري ↔ ميلادي
│   ├── notifications.js        # إشعارات FCM + Toasts
│   ├── nav.js / ui.js / tour.js # عناصر تنقل وواجهة مشتركة
│   └── sw-register.js          # تسجيل Service Worker
├── functions/
│   └── index.js                # Firebase Cloud Functions
├── libs/
│   ├── tabler-icons/           # أيقونات Tabler
│   ├── bootstrap/              # Bootstrap RTL (مستضاف محلياً)
│   └── fonts/                  # خطوط عربية
├── .github/workflows/
│   └── deploy-functions.yml    # GitHub Actions للـ deploy
└── firebase.json               # إعدادات Firebase Hosting
```

---

## ✨ المميزات

### 👥 إدارة المستخدمين
- **6 أدوار:** إدارة، دعم فني، مشرفة، معلمة، طالبة، أصدقاء متين
- تسجيل دخول وتسجيل جديد مع التحقق من الدور
- حذف الحساب نهائياً من Firestore و Firebase Auth عبر Cloud Function تلقائياً
- صفحة ترحيب (onboarding) لتهيئة الحساب الجديد

### 🛠️ لوحة الدعم الفني
- عرض وإدارة جميع المستخدمين ومراسلتهم
- **فحص الموقع الشامل** — أداة تفحص كل صفحات الموقع تلقائياً وتقيّم الأداء وSEO وإمكانية الوصول وأفضل الممارسات والصور
- تخصيص ثيم كل حساب (الألوان والزخرفة) من 10 ثيمات جاهزة

### 🎨 الثيمات المخصصة
- 10 ثيمات ألوان جاهزة + 3 أنماط زخرفية اختيارية (نجوم، هندسي، دوائر)
- يُخصَّص لكل حساب من لوحة الدعم، ويُطبَّق تلقائياً على كل صفحات الموقع

### 📚 المواد العلمية
- **5 مواد:** التفسير، الفقه، العقيدة، الحديث، مقرأة متين (مُدارة من Firestore وليست ثابتة في الكود)
- الأدمن والمشرفة: تعديل وحذف وإضافة محتوى لكل المواد + تعديل المادة الرئيسية نفسها
- المعلمة: تضيف وتعدل وتحذف محتوى مادتها فقط
- الطالبة: تشوف المواد المتاحة لها بعد الالتحاق
- تعديلات المواد الثابتة تُحفظ في Firestore وتظهر لكل المستخدمين

### 📝 الواجبات
- ربط الواجبات بمحاضرة/مادة معيّنة
- تسليم ومتابعة وتقييم من المعلمة

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
- إشعارات فورية عبر Firebase Cloud Messaging + إشعارات Toast من Firestore

### 🎓 إدارة الطالبات
- إضافة طالبات فردياً أو جماعياً
- تتبع حالة المقابلة وقرار القبول
- تصدير بيانات الطالبات لملف Word
- جدول دراسي أسبوعي مع تحويل هجري ↔ ميلادي

### 📊 الإحصائيات والتصدير
- صفحة إحصائيات شاملة: الحضور، الدرجات، الأعلى/الأقل حضوراً، إحصائيات المواد
- تصدير أي تقرير بصيغة **Excel أو Word أو PDF**

### 📱 تطبيق ويب تقدّمي (PWA)
- قابل للتثبيت من المتصفح مباشرة، مع نافذة اختيار حسب الجهاز
- نسخة APK جاهزة للأندرويد (`mateen.apk`)

---

## 🛠️ التقنيات المستخدمة

| التقنية | الاستخدام |
|---|---|
| HTML / CSS / JS | واجهة المستخدم — بدون build tool |
| Bootstrap 5 (RTL, مستضاف محلياً) | Navbar, Offcanvas, Responsive |
| Firebase Auth | تسجيل الدخول والأدوار |
| Firebase Firestore | قاعدة البيانات الرئيسية |
| Firebase Hosting | استضافة الموقع |
| Firebase Functions | حذف المستخدمين من Auth تلقائياً |
| Firebase Messaging | إشعارات Push |
| **Cloudinary** | رفع الصور والتسجيلات الصوتية |
| GitHub Actions | Deploy تلقائي للـ Functions |
| Tabler Icons | أيقونات الواجهة |
| Service Worker + Web App Manifest | دعم PWA والعمل دون اتصال |

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
| `subjects` | قائمة المواد العلمية (تُزرع تلقائياً) |
| `libraryItems` | محتوى المكتبة (إثرائي، بودكاست، دورات) |
| `assignments` | الواجبات وتسليماتها |
| `conversations` | المحادثات والرسائل |
| `news` | الأخبار والإعلانات |

---

## 📘 التوثيق

راجعي `docs-user-guide.md` لدليل مفصّل بخدمات كل دور (الإدارة، الدعم، المشرفة، المعلمة، الطالبة).
