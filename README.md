# مكتبي الذكي — AI Office

مكتب افتراضي ثلاثي الأبعاد لفريق موظفين ذكاء اصطناعي. بتعيّن موظفين عن طريق مديرة الموارد البشرية بالـ Job Description، وبتبعت طلباتك للمدير العام، وهو يجمع الفريق في اجتماع ويوزّع الشغل. بعدها تتفرج عليهم وهم بيشتغلوا على مكاتبهم وبيرتاحوا في منطقة الاستراحة، وفي الآخر تستلم تسليم كل واحد وتقرير المدير.

المشروع بيشتغل بطريقتين ليهم نفس المحرك:

| | الموقع المستقل | ChatGPT App |
|---|---|---|
| الواجهة | صفحة كاملة: مكتب 3D + لوحة جانبية | Widget جوه المحادثة (inline أو ملء الشاشة) |
| البيانات | REST على `/api/*` | أدوات MCP على `/mcp` |
| مين بيطلب الشغل | إنت من اللوحة | إنت من اللوحة، أو ChatGPT نفسه بالأدوات |

## التشغيل المحلي

محتاج Node.js 20 أو أحدث.

```bash
npm install
npm start
```

- الموقع: http://localhost:8787
- سيرفر MCP: http://localhost:8787/mcp
- تجربة الـ widget محليًا من غير ChatGPT: http://localhost:8787/dev-host/

للتطوير مع إعادة تحميل الواجهة تلقائيًا، شغّل السيرفر في نافذة والـ Vite في نافذة تانية (`npm run dev:web`)، وبعدين افتح http://localhost:5173.

### إعدادات اختيارية

| المتغير | الافتراضي | الوظيفة |
|---|---|---|
| `PORT` | `8787` | بورت السيرفر |
| `WORK_SPEED` | `1` | مُضاعِف مدة الشغل (`0.5` أسرع، `2` أبطأ) |
| `DATA_FILE` | `data/office.json` | مكان حفظ الفريق والمهام محليًا |
| `BLOB_READ_WRITE_TOKEN` | — | لو موجود، الحفظ بيبقى في Vercel Blob بدل الملف (Vercel بيحطه لوحده) |
| `PUBLIC_ORIGIN` | — | دومين الـ widget عند النشر، مثلًا `https://office.example.com` |

## النسخة الأونلاين

- الموقع: https://ai-office-saberfoodizoon-5406.vercel.app
- سيرفر MCP: `https://ai-office-saberfoodizoon-5406.vercel.app/mcp`

المشروع منشور على Vercel ومربوط بالـ repo، فأي push على `main` بينشر نسخة جديدة لوحده. الفريق والمهام محفوظين في Vercel Blob (store اسمه `ai-office-state`)، فكل اللي بيفتح المكتب (من الموقع أو ChatGPT أو Codex) بيشوف نفس الفريق ونفس المهام.

## ربطه بـ ChatGPT

1. افتح https://chatgpt.com/plugins، اضغط **+** ثم **Add custom MCP server**.
2. اكتب الاسم (مثلًا «مكتبي الذكي») والوصف، وحط الرابط:
   `https://ai-office-saberfoodizoon-5406.vercel.app/mcp`
3. خلي الـ authentication على **No authentication**، ووافق على التنبيه، واختار **Create as a plugin**.
4. في محادثة جديدة جرّب: «افتحلي المكتب»، أو «عيّن مصمم جرافيك»، أو «خلّي الفريق يعمل حملة لكافيه جديد».

بعد أي تعديل في الأدوات أو الـ widget: اعمل push، واستنى النشر يخلص، واضغط **Refresh** في صفحة الـ plugin. لو غيّرت الـ widget تغيير كبير، غيّر `WIDGET_URI` في `server/mcp.ts` (مثلًا `office-v2.html`)، لأن ChatGPT بيعمل cache بالرابط ده.

## ربطه بـ Codex

Codex (الـ CLI والـ IDE extension والتطبيق) بيستخدم نفس الإعدادات. شغّل الأمر ده مرة واحدة:

```bash
codex mcp add ai-office --url https://ai-office-saberfoodizoon-5406.vercel.app/mcp
```

أو ضيف السطور دي في `~/.codex/config.toml`:

```toml
[mcp_servers.ai-office]
url = "https://ai-office-saberfoodizoon-5406.vercel.app/mcp"
```

بعدها اطلب من Codex: «شوف مين في فريق ai-office»، أو «ابعت للمدير مهمة: خطة إطلاق لتطبيقي»، أو «هات تسليمات آخر مهمة». Codex هيشتغل بالأدوات، والمكتب الـ 3D بيظهر في ChatGPT والموقع.

### الأدوات

| الأداة | النوع | الوظيفة |
|---|---|---|
| `show_office` | عرض (read-only) | يفتح المكتب الـ 3D جوه المحادثة |
| `get_office` | قراءة | الفريق والمهام الحالية |
| `hire_employee` | كتابة | تعيين موظف من مسمى وظيفي + وصف |
| `assign_task` | كتابة | طلب للمدير يوزّعه على الفريق |
| `get_task` | قراءة | التقدم والتسليمات وتقرير المدير |
| `fire_employee` | كتابة (destructive) | الاستغناء عن موظف |
| `office_live_state` | للـ widget بس | الحالة الكاملة للتحديث المستمر (مخفية عن الموديل) |

## ربط ذكاء اصطناعي حقيقي

دلوقتي الموظفين شغالين بـ `MockBrain` في `engine/brain.ts`. ده بيكتب تسليمات عربي منظّمة من قوالب حسب تخصص كل موظف، من غير أي API.

عشان تستخدم موديل حقيقي، اعمل class بيطبّق الـ interface `Brain` (فيه 5 دوال: `classifyRole`، `hiringNote`، `plan`، `deliverable`، `summary`)، وكل دالة منهم تبعت prompt للموديل. وبعدين بدّل سطر واحد في `server/index.ts`:

```ts
const office = new Office(new MockBrain(), ...);   // ← حط الـ brain الجديد هنا
```

الجدولة والحركة والواجهة كلها مش هتتغيّر.

ملاحظة: `deliverable` بتتنادى وقت توزيع المهمة. مع موديل حقيقي الأفضل تخليها async وتولّد كل تسليم في الخلفية، والمهمة الفرعية تفضل «شغال» لحد ما الرد يوصل.

## هيكل المشروع

```
shared/     الأنواع، الأدوار، وخريطة المكتب (مشتركة بين السيرفر والواجهة)
engine/     Office (الحالة والجدولة) + Brain (التخطيط والتسليمات) + Store (ملف أو Blob)
server.ts   تطبيق Express (REST + MCP) — نقطة التشغيل على Vercel
server/     أدوات MCP، والتشغيل المحلي، والـ widget المدمج
web/src/    React + three.js: المشهد الـ 3D، والشخصيات، واللوحة
dev/        host محلي بيحاكي ChatGPT عشان تجرّب الـ widget
```

حالة كل موظف (بيشتغل، في اجتماع، استراحة) بتتحسب من الوقت، مش من timers. عشان كده أي عميل يقدر يسأل في أي وقت ويشوف التقدّم مضبوط، حتى بعد ما السيرفر يعيد التشغيل.
