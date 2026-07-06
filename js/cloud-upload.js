// ── رفع ملف/صورة على Cloudinary (بدون توقيع، عن طريق upload_preset عام) ──
const CLOUD_NAME    = 'dqqtznoqt';
const UPLOAD_PRESET = 'mateen_uploads';

/**
 * يرفع أي ملف (صورة، PDF، Word، إلخ) ويرجع رابط عام (secure_url) قابل للمشاركة.
 * بنحدد resource_type بنفسنا (image للصور الحقيقية، raw لأي حاجة تانية)
 * بدل ما نسيب Cloudinary يخمّن عن طريق /auto/upload — لأن التخمين ده أحيانًا
 * بيصنّف مستندات (PDF/Word) على إنها "صورة" وCloudinary بيمنع عرضها علنًا
 * كإجراء أمان افتراضي (بيرجع 401 لما تفتحي الرابط).
 */
export async function uploadToCloudinary(file) {
  const isImage = (file.type || '').startsWith('image/');
  const resourceType = isImage ? 'image' : 'raw';

  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', UPLOAD_PRESET);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`,
    { method: 'POST', body: fd }
  );
  const data = await res.json();
  if (!data.secure_url) throw new Error(data.error?.message || 'فشل رفع الملف');
  return data.secure_url;
}
