# موقع نغمة — Boilerplate جاهز لـ GitHub وRender

واجهة عربية/إنجليزية مع Backend Node.js وExpress لتجربة تدفق تنزيل مؤقت.

## الحالة الحالية

هذه النسخة **Boilerplate تعليمي قابل للنشر**:

- API Express يعمل.
- حالات المهمة والتقدم وSSE وإعادة المحاولة والإلغاء تعمل.
- الواجهة موجودة في `docs/ui-preview.html`.
- عند عدم توفر API، تستخدم الواجهة محاكاة محلية للتجربة.
- عند تشغيل Docker، ينفذ الخادم تنزيلًا فعليًا عبر `yt-dlp` وFFmpeg إلى مجلد مؤقت.
- الملف الناتج متاح عبر رمز عشوائي، ثم يحذف تلقائيًا بعد 30 دقيقة.

للاستخدام العام يجب إضافة Redis/BullMQ للتوسع، وCloudflare R2 إذا أردت فصل التخزين عن خادم API، ومراجعة شروط المنصات.

## التشغيل محليًا

```bash
npm ci
cp .env.example .env
npm run check
npm run build
npm start
```

- API: `http://localhost:4000`
- فحص الصحة: `http://localhost:4000/health`
- معاينة الواجهة: افتح `docs/ui-preview.html` أو شغّل:

```bash
python3 -m http.server 4173 --directory docs
```

## Endpoints

```text
GET    /health
POST   /api/inspect
POST   /api/downloads
GET    /api/downloads/:id
GET    /api/downloads/:id/events
POST   /api/downloads/:id/retry
DELETE /api/downloads/:id
```

## الرفع إلى GitHub

1. أنشئ مستودعًا جديدًا وفارغًا في GitHub.
2. من مجلد المشروع شغّل:

```bash
git init
git add .
git commit -m "Initial video downloader boilerplate"
git branch -M main
git remote add origin https://github.com/USERNAME/REPOSITORY.git
git push -u origin main
```

3. استبدل `USERNAME/REPOSITORY` ببيانات مستودعك.
4. لا ترفع ملف `.env` أو أي مفتاح API. ملف `.env.example` لا يحتوي أسرارًا.

يمكن أيضًا فك الحزمة ZIP ثم رفع الملفات من زر **Add file → Upload files** في GitHub.

## نشر Web Service على Render

أنشئ **New → Web Service** واربط مستودع GitHub:

```text
Runtime: Node
Build Command: npm ci && npm run build
Start Command: node dist/server.js
```

أو اختر Docker واستخدم ملف `Dockerfile` الموجود في جذر المشروع.

أضف في Render:

```env
NODE_ENV=production
PORT=10000
CORS_ORIGIN=https://your-frontend-domain.example
```

## تشغيل التنزيل الحقيقي

للنشر الأول على Render اختر **Web Service باستخدام Dockerfile**، وليس Static Site؛ لأن صورة Docker تثبت FFmpeg و`yt-dlp`. بعد إضافة متغيرات البيئة، يعيد API مهمة بسرعة ثم ينفذ التنزيل في الخلفية داخل العملية ويعرض الحالة عبر SSE. عند زيادة عدد المستخدمين افصل التنفيذ إلى Background Worker مع Redis/BullMQ.


صورة Docker تثبت `yt-dlp` وFFmpeg، ويشغل `POST /api/downloads` عملية فعلية في مجلد مؤقت. لا يوجد حساب مستخدم؛ يتم إصدار `accessToken` عشوائي لكل مهمة. استخدمه مع:

```text
GET /api/downloads/:id?token=...
GET /api/downloads/:id/events?token=...
GET /api/downloads/:id/file?token=...
```

يحذف الخادم مجلد المهمة بعد 30 دقيقة من اكتمالها، أو عند الفشل. للطلبات الكثيرة يجب فصل التنفيذ إلى **Background Worker** مع Redis/BullMQ بدل تشغيل العملية داخل Web Service.

## الخصوصية والاحتفاظ المؤقت

التصميم المقترح للإنتاج:

```text
الرابط → Worker → تحويل → R2 مؤقت → رابط Signed URL → حذف بعد 30 دقيقة
```

لا يوجد نظام حسابات في هذا الـ Boilerplate. عند تفعيل Worker الحقيقي يجب استخدام رمز وصول عشوائي للمهمة، وتحديد حجم ومدة الفيديو، ومعدل الطلبات لكل IP، وعدم تسجيل الروابط الحساسة كاملة.

## الأمان

- لا تتجاوز DRM أو تسجيل الدخول أو القيود التقنية للمنصات.
- استخدم المحتوى الذي يملكه المستخدم أو يملك إذنًا لتنزيله فقط.
- أضف SSRF/DNS rebinding protection قبل قبول روابط مصادر عامة.
- لا تضع الأسرار في الواجهة أو GitHub.
- استخدم HTTPS وCORS محدودًا بنطاق الواجهة.

## الملفات المهمة

```text
src/server.ts                         خادم Express
src/routes/video.routes.ts            API وSSE والإلغاء وإعادة المحاولة
src/services/job.service.ts           حالات المهام والتقدم
src/services/error-mapper.service.ts  رسائل أخطاء آمنة
src/types/jobs.ts                     أنواع الحالات والأحداث
docs/ui-preview.html                  معاينة الواجهة
Dockerfile                             صورة Web Service
.github/workflows/ci.yml               فحص GitHub Actions
```
