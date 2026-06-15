@echo off
chcp 65001 >nul
title نشر Cloud Functions — متين

echo.
echo ╔══════════════════════════════════════════╗
echo ║     نشر إشعارات متين — Cloud Functions  ║
echo ╚══════════════════════════════════════════╝
echo.

:: ── تحقق من Node.js ──────────────────────────────────────────
echo [1/5] التحقق من Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  ❌ Node.js غير مثبت!
    echo  افتحي هذا الرابط وحملي النسخة LTS:
    echo  https://nodejs.org
    echo.
    pause
    exit /b 1
)
echo  ✅ Node.js موجود

:: ── تثبيت Firebase Tools ─────────────────────────────────────
echo.
echo [2/5] تثبيت Firebase Tools...
call npm install -g firebase-tools --silent
if %errorlevel% neq 0 (
    echo  ❌ فشل تثبيت Firebase Tools
    pause
    exit /b 1
)
echo  ✅ Firebase Tools جاهز

:: ── تسجيل الدخول ─────────────────────────────────────────────
echo.
echo [3/5] تسجيل الدخول بحساب Google...
echo  سيفتح المتصفح — سجلي دخول بنفس حساب Firebase
echo.
call firebase login
if %errorlevel% neq 0 (
    echo  ❌ فشل تسجيل الدخول
    pause
    exit /b 1
)
echo  ✅ تم تسجيل الدخول

:: ── الانتقال لمجلد المشروع ───────────────────────────────────
echo.
echo [4/5] تثبيت dependencies...
cd /d "%~dp0"
cd functions
call npm install
if %errorlevel% neq 0 (
    echo  ❌ فشل تثبيت الحزم
    pause
    exit /b 1
)
cd ..
echo  ✅ الحزم جاهزة

:: ── النشر ────────────────────────────────────────────────────
echo.
echo [5/5] نشر Cloud Functions...
echo  قد يستغرق هذا دقيقة أو دقيقتين...
echo.
call firebase deploy --only functions --project mateen-a122d
if %errorlevel% neq 0 (
    echo.
    echo  ❌ فشل النشر — تحققي من الأخطاء أعلاه
    pause
    exit /b 1
)

echo.
echo ╔══════════════════════════════════════════╗
echo ║   ✅ تم النشر بنجاح! الإشعارات شغالة   ║
echo ╚══════════════════════════════════════════╝
echo.
echo الإشعارات التالية تعمل الآن:
echo  • رسالة جديدة   → إشعار للمستلمة
echo  • حساب جديد     → إشعار للإدارة
echo  • قبول الحساب   → إشعار للمستخدمة
echo.
pause
