# دليل دمج yt-dlp أو مزود تنزيل خارجي

## القرار المعماري

لا تشغّل `yt-dlp` داخل Express أثناء طلب HTTP. يجب أن يكون التدفق:

```text
POST /api/downloads
        |
        v
قاعدة البيانات: queued
        |
        v
Redis/BullMQ
        |
        v
Worker معزول: yt-dlp + FFmpeg أو مزود خارجي
        |
        v
Object Storage + Signed URL
        |
        v
GET /api/downloads/:id
```

بهذا لا يبقى اتصال المتصفح مفتوحًا، ويمكن إعادة المحاولة، تحديد التوازي، وإيقاف المهام الثقيلة دون إسقاط API.

## مقارنة الخيارات

| الخيار | مناسب لـ | المزايا | القيود |
|---|---|---|---|
| `yt-dlp` في Worker مملوك | تحكم كامل وحجم متوسط | تكلفة متغيرة منخفضة، تحكم في الصيغ والسجلات | صيانة مستمرة، اعتماد على FFmpeg، ضرورة استضافة عامل دائم |
| مزود خارجي API | إطلاق سريع وحجم غير متوقع | لا إدارة binaries أو التحديثات، غالبًا يدير التوسع | تكلفة لكل مهمة، اعتماد على SLA وسياسات الطرف الثالث، ضرورة حماية مفاتيح API |
| روابط رسمية/رفع ملفات يملكها المستخدم | MVP منخفض المخاطر | أبسط قانونيًا وتقنيًا | لا يغطي كل منصات الفيديو |

ابدأ بالمسار الأخف: مصدر رسمي أو ملفات مباشرة، ثم أضف Worker مملوكًا إذا كان حجم الاستخدام يبرر ذلك. استخدم مزودًا خارجيًا فقط بعد مراجعة شروطه، موقع التخزين، سياسة حذف البيانات، وحدود المعدل.

## تشغيل yt-dlp بأمان

### قواعد أساسية

- ثبّت نسخة محددة من `yt-dlp` وFFmpeg، ولا تستخدم `latest` في الإنتاج.
- شغّل العامل داخل حاوية غير root أو مستخدم محدود الصلاحيات.
- لا تستخدم `shell: true` ولا تبنِ أمرًا كسلسلة نصية.
- استخدم `spawn` مع مصفوفة arguments منفصلة.
- ضع المخرجات في مجلد مؤقت خاص بكل مهمة.
- لا تستخدم cookies من متصفح المستخدم ولا تطلب كلمات المرور.
- عطّل قوائم التشغيل افتراضيًا عبر `--no-playlist`.
- ضع حدًا للحجم والمدة والمهلة وعدد الملفات.
- افحص الملف الناتج قبل رفعه: MIME، الحجم، الامتداد، checksum.
- احذف مجلد المهمة في `finally` مهما كانت النتيجة.
- لا تتجاوز DRM أو الحواجز المدفوعة أو قيود المنصة.

### أمر نموذجي

```bash
yt-dlp \
  --no-playlist \
  --no-warnings \
  --socket-timeout 20 \
  --retries 2 \
  --max-filesize 500M \
  --merge-output-format mp4 \
  --print-json \
  --output /tmp/job-123/%(id)s.%(ext)s \
  'https://example.com/video'
```

لا تنفذ هذا الأمر عبر shell؛ المثال يوضح الخيارات فقط.

## واجهة Adapter أفضل

بدل إعادة رابط المصدر مباشرة، اجعل الـ Adapter يعيد خطة تنفيذ لا تحتوي على أسرار:

```ts
export interface DownloadRequest {
  url: URL;
  formatId: string;
  outputDir: string;
  maxBytes: number;
}

export interface DownloadResult {
  outputPath: string;
  mimeType: string;
  sizeBytes: number;
  providerVideoId: string;
}

export interface VideoAdapter {
  readonly name: ProviderName;
  canHandle(url: URL): boolean;
  inspect(url: URL): Promise<VideoMetadata>;
  download(request: DownloadRequest): Promise<DownloadResult>;
}
```

## Adapter باستخدام spawn

```ts
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readdir } from "node:fs/promises";
import path from "node:path";

function runYtDlp(url: URL, outputDir: string, formatSelector: string) {
  const args = [
    "--no-playlist",
    "--no-warnings",
    "--socket-timeout", "20",
    "--retries", "2",
    "--max-filesize", "500M",
    "--restrict-filenames",
    "--print-json",
    "--output", path.join(outputDir, "%(id)s.%(ext)s"),
    "--format", formatSelector,
    "--",
    url.toString(),
  ];

  const child = spawn("yt-dlp", args, {
    cwd: outputDir,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    env: { PATH: process.env.PATH },
  });

  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk).slice(-8_000);
  });

  return Promise.race([
    once(child, "close").then(([code]) => {
      if (code !== 0) throw new Error(`yt-dlp failed: ${stderr}`);
      return readdir(outputDir);
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("download timeout"));
      }, 5 * 60_000),
    ),
  ]);
}
```

في التطبيق الفعلي يجب إضافة `AbortController`، تنظيف timer، التأكد من أن الناتج ملف متوقع، وعدم إعادة `stderr` الخام للمستخدم.

## Worker باستخدام BullMQ

```ts
const worker = new Worker("video-downloads", async (job) => {
  const task = await db.downloadJobs.findById(job.data.jobId);
  const adapter = registry.resolve(new URL(task.sourceUrl));
  const outputDir = await createPrivateTempDir(task.id);

  try {
    await db.downloadJobs.markProcessing(task.id);
    const result = await adapter.download({
      url: new URL(task.sourceUrl),
      formatId: task.formatId,
      outputDir,
      maxBytes: 500 * 1024 * 1024,
    });
    const stored = await objectStorage.put(result.outputPath, {
      contentType: result.mimeType,
      maxAgeSeconds: 24 * 60 * 60,
    });
    await db.downloadJobs.complete(task.id, stored.objectKey, result.sizeBytes);
  } catch (error) {
    await db.downloadJobs.fail(task.id, toSafeErrorCode(error));
    throw error;
  } finally {
    await removeDirectory(outputDir);
  }
}, {
  connection: redis,
  concurrency: 2,
  limiter: { max: 10, duration: 60_000 },
});
```

في الإنتاج يجب أن تكون قاعدة البيانات مصدر الحقيقة؛ Redis يوزع العمل فقط. عند إعادة تشغيل Worker، تستعيد BullMQ المهام العالقة حسب `lockDuration` و`attempts`.

## الدمج مع مزود خارجي

أنشئ Adapter ثانيًا لا يعرف الواجهة الأمامية:

```ts
export interface ExternalDownloaderClient {
  inspect(url: string): Promise<VideoMetadata>;
  createJob(input: { url: string; format: string }): Promise<{ remoteId: string }>;
  getJob(remoteId: string): Promise<{ status: string; fileUrl?: string }>;
}
```

القواعد:

1. خزّن `remoteId` فقط، ولا تجعل `fileUrl` الخارجي دائمًا في الواجهة.
2. نفّذ polling محدودًا داخل Worker أو استخدم webhook موثقًا مع توقيع تحقق.
3. لا تعرض مفتاح المزود للمتصفح.
4. نزّل الناتج إلى Object Storage الخاص بك ثم أصدر Signed URL خاصًا بك.
5. ضع مهلة قصوى وعدد محاولات محدودًا.
6. راقب التكلفة لكل مهمة وحجم البيانات.
7. تأكد من أن المزود لا يحتفظ بالمحتوى أكثر من سياسة الخصوصية الخاصة بك.

## SSRF والحماية الشبكية

التحقق من النص في Express وحده غير كافٍ؛ قد يحدث DNS rebinding. طبّق دفاعًا متعدد الطبقات:

- قائمة سماح لمضيفات المنصات المدعومة.
- رفض IPs الخاصة بعد حل DNS داخل العامل.
- منع إعادة التوجيه إلى مضيف غير مسموح.
- شبكة خروج محدودة إن أمكن.
- عدم قبول URL يحدده المستخدم للمزود الخارجي إلا بعد فحصه.
- عزل worker عن قاعدة البيانات والشبكة الداخلية.

## التخزين والخصوصية

- ارفع الملف إلى S3-compatible storage بمفتاح غير قابل للتخمين.
- استخدم `Content-Disposition: attachment` وSigned URL قصير الصلاحية.
- احذف الملفات تلقائيًا بعد 24 ساعة، أو أقل حسب المنتج.
- لا تسجل الرابط الكامل أو بيانات المستخدم في logs.
- خزّن checksum والحجم ونوع MIME.
- اربط كل Job بـ `userId` وتحقق من الملكية في كل endpoint.

## خطة الإطلاق

### MVP

- مصدر رسمي أو DirectFileAdapter.
- Worker واحد، توازٍ 1–2.
- حد 500MB و5 دقائق.
- تخزين مؤقت 24 ساعة.
- لا cookies ولا DRM ولا قوائم تشغيل.

### قبل التوسع

- Redis/BullMQ وقاعدة بيانات دائمة.
- حاوية worker منفصلة وتحديثات yt-dlp مجدولة ومختبرة.
- مراقبة نجاح التنزيل، زمن الانتظار، استهلاك التخزين، وأخطاء كل منصة.
- اختبارات SSRF وpath traversal وملفات غير صحيحة.
- مراجعة شروط كل منصة وحقوق المحتوى.

## مكان التشغيل

Express يمكن أن يبقى على استضافة الويب المعتادة. أما `yt-dlp` وFFmpeg فيحتاجان Worker دائمًا ببيئة Linux وملفات تنفيذية مثبتة. إذا كانت الاستضافة المدارة لا تسمح بتثبيت هذه الأدوات، استخدم Worker على خادم دائم أو مزود خارجي، ولا تشغله داخل sandbox مؤقتة.
