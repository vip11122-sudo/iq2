# UI/UX مقترح للصفحة الرئيسية | Home Page Proposal

## الاتجاه البصري

واجهة هادئة وموثوقة بلون أساسي كحلي داكن `#0F172A`، لون تمييز فيروزي `#14B8A6`، وخلفية فاتحة `#F8FAFC`. يدعم التصميم RTL للعربية وLTR للإنجليزية من خلال `dir` على مستوى التطبيق.

## الهيكل

1. **Header**: شعار نصي، رابط التنزيلات السابقة، زر تبديل اللغة `العربية / EN`، وزر الوضع الداكن.
2. **Hero**: عنوان عربي/إنجليزي، وصف قصير يوضح أن الاستخدام للمحتوى المسموح به، وحقل URL واسع مع زر `فحص الرابط / Inspect link`.
3. **Format panel**: يظهر بعد الفحص؛ صورة مصغرة، العنوان، المنصة، المدة، اختيار الجودة والصيغة، وزر `بدء التنزيل / Start download`.
4. **Progress card**: حالة المهمة، مرحلة المعالجة، progress bar، ورسالة الخطأ الآمنة عند الفشل.
5. **Recent downloads**: شبكة بطاقات متجاوبة؛ 1 عمود للهاتف، 2 للتابلت، 3 لسطح المكتب.
6. **Trust strip**: ثلاث نقاط قصيرة: روابط مؤقتة، حذف تلقائي، لا نتجاوز المحتوى المحمي.
7. **Footer**: سياسة الخصوصية، الشروط، مركز المساعدة، ومفتاح اللغة.

## النصوص الثنائية

| الوظيفة | العربية | English |
|---|---|---|
| العنوان | نزّل ما تملك حق استخدامه بسهولة | Download what you have the right to use |
| الحقل | الصق رابط الفيديو هنا | Paste a video link here |
| الفحص | فحص الرابط | Inspect link |
| البدء | بدء التنزيل | Start download |
| التنزيلات | تنزيلاتي | My downloads |
| فارغ | لا توجد تنزيلات بعد | No downloads yet |
| الخصوصية | روابط مؤقتة وحذف تلقائي | Temporary links and auto-cleanup |

## السلوك المتجاوب

- الهاتف: header مختصر، حقل وزر بعرض كامل، وpadding 16px.
- الجهاز اللوحي: hero بعمودين؛ النص في عمود والنموذج في الآخر.
- سطح المكتب: max-width 1180px، hero غير متماثل قليلًا، وبطاقات النتائج في grid.
- دعم لوحة المفاتيح: focus ring واضح، ترتيب tab منطقي، و`aria-live="polite"` لحالات المهمة.
- احترام `prefers-reduced-motion` وعدم الاعتماد على اللون وحده لتمييز الحالة.

## مكونات React المقترحة

```text
client/src/
  pages/Home.tsx
  components/
    Header.tsx
    LanguageToggle.tsx
    UrlInspectForm.tsx
    VideoPreviewCard.tsx
    FormatSelector.tsx
    DownloadProgress.tsx
    RecentDownloads.tsx
    TrustStrip.tsx
  contexts/LocaleContext.tsx
  lib/i18n.ts
```

## ملاحظة تنفيذية

الـ Backend الحالي يعيد metadata تجريبية لمصادر YouTube/Vimeo، ولا ينفذ تنزيلًا فعليًا لها. يجب ربط Adapter رسمي ومسموح به قبل تفعيل زر التنزيل على أي منصة.
