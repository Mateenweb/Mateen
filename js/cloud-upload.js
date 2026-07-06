// ── رفع ملف/صورة على Cloudinary (بدون توقيع، عن طريق upload_preset عام) ──
const CLOUD_NAME    = 'dqqtznoqt';
const UPLOAD_PRESET = 'mateen_uploads';

/**
 * يرفع أي ملف (صورة، PDF، Word، إلخ) ويرجع رابط عام (secure_url) قابل للمشاركة.
 * بيستخدم /auto/upload عشان Cloudinary يكتشف نوع الملف صح بنفسه.
 */
export async function uploadToCloudinary(file) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', UPLOAD_PRESET);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`,
    { method: 'POST', body: fd }
  );
  const data = await res.json();
  if (!data.secure_url) throw new Error(data.error?.message || 'فشل رفع الملف');
  return data.secure_url;
}
