// The "brain" decides how work is split and writes each employee's output.
//
// MockBrain produces realistic, structured Arabic deliverables from templates so
// the whole office works without any AI provider. To use a real model later,
// implement `Brain` with LLM calls (one per method) and pass it to `new Office()`.

import { ROLES, WORKER_ROLES, classifyRole, scoreRole } from "../shared/roles";
import type { Employee, RoleId } from "../shared/types";

export interface PlannedSubtask {
  assigneeId: string;
  title: string;
}

export interface Brain {
  classifyRole(jobTitle: string, jobDescription: string): RoleId;
  hiringNote(employee: Employee): string;
  plan(request: string, team: Employee[]): PlannedSubtask[];
  deliverable(employee: Employee, subtaskTitle: string, request: string): string;
  summary(request: string, parts: { employee: Employee; title: string }[]): string;
}

const MAX_ASSIGNEES = 5;

const FILLER = /^(?:(?:انا|أنا|احنا|إحنا|لو سمحت|من فضلك|please|i want|i need|we need)\s+)*(?:عايز(?:ين)?|عاوز(?:ين)?|محتاج(?:ين)?|نفسي|ممكن|أريد|اريد|نريد|اعمل(?:وا)?(?:لي|لنا)?|اعملي|اعملولي|جهز(?:وا)?(?:لي)?)?\s*(?:منكم|تعملوا|تعمل|نعمل|تجهزوا)?\s*/i;

function topicOf(request: string, max = 90): string {
  let t = request.trim().replace(/\s+/g, " ").replace(/[.؟?!]+$/, "");
  t = t.replace(FILLER, "") || t;
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

function bullets(lines: string[]): string {
  return lines.map((l) => `- ${l}`).join("\n");
}

/** Lines from a job description, used to describe responsibilities. */
function duties(jd: string): string[] {
  return jd
    .split(/\n|[.،؛;]| - |•/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3)
    .slice(0, 5);
}

const SUBTASK_TITLES: Record<RoleId, (topic: string) => string> = {
  general_manager: (t) => `متابعة «${t}»`,
  hr_manager: (t) => `احتياجات الفريق لـ «${t}»`,
  product_manager: (t) => `خطة المنتج ونطاق العمل لـ «${t}»`,
  copywriter: (t) => `كتابة المحتوى والرسائل لـ «${t}»`,
  designer: (t) => `الاتجاه البصري والتصميم لـ «${t}»`,
  marketer: (t) => `خطة التسويق والإطلاق لـ «${t}»`,
  developer: (t) => `الخطة التقنية والتنفيذ لـ «${t}»`,
  data_analyst: (t) => `مؤشرات القياس والتحليل لـ «${t}»`,
  researcher: (t) => `بحث السوق والمنافسين لـ «${t}»`,
  sales: (t) => `خطة المبيعات والعرض لـ «${t}»`,
  support: (t) => `ردود خدمة العملاء لـ «${t}»`,
  specialist: (t) => `خطة تنفيذ «${t}»`,
};

const TEMPLATES: Record<RoleId, (topic: string, e: Employee) => string> = {
  general_manager: (t) => `متابعة عامة لـ «${t}».`,
  hr_manager: (t) =>
    `## احتياجات الفريق لـ «${t}»\n\n${bullets([
      "مراجعة المهارات المتاحة حاليًا في الفريق",
      "تحديد الأدوار الناقصة وكتابة وصف وظيفي لكل منها",
      "خطة تعيين خلال أسبوعين",
    ])}`,
  product_manager: (t) => `## خطة المنتج: ${t}

### المشكلة
العميل محتاج طريقة أسهل وأسرع للوصول للنتيجة اللي بيقدمها «${t}»، والحلول الحالية إما معقدة أو غالية.

### المستخدم المستهدف
${bullets(["المستخدم الأساسي: الشخص اللي بيدفع ويستخدم يوميًا", "المستخدم الثانوي: الفريق أو الأسرة اللي بتستفيد من النتيجة"])}

### نطاق النسخة الأولى (MVP)
${bullets([
  "التسجيل وإعداد الحساب في أقل من دقيقة",
  "الخاصية الأساسية اللي بتحل المشكلة من أول استخدام",
  "لوحة متابعة بسيطة للنتائج",
  "إشعارات للتذكير والمتابعة",
])}

### خارج النطاق حاليًا
${bullets(["التكاملات المتقدمة", "تعدد اللغات بعد العربي والإنجليزي"])}

### خارطة الطريق
| المرحلة | المدة | الناتج |
|---|---|---|
| اكتشاف | أسبوع | مقابلات مع 10 عملاء |
| بناء MVP | 4 أسابيع | نسخة تجريبية |
| إطلاق تجريبي | أسبوعين | 50 مستخدم أول |`,
  copywriter: (t) => `## المحتوى والرسائل: ${t}

### الرسالة الأساسية
«${t}» — الطريقة الأبسط عشان توصل للي عايزه، من غير وجع دماغ.

### 3 عناوين مقترحة
1. أخيرًا… ${t} بقى أسهل من أي وقت
2. وفّر وقتك، وسيب الباقي علينا
3. جرّبها مرة، ومش هترجع للطريقة القديمة

### بوست سوشيال ميديا
> كام مرة حسيت إن الموضوع ده واخد منك وقت ومجهود أكتر من اللازم؟ 🤔
> مع «${t}» كل حاجة بقت أوضح وأسرع.
> ✅ سهل من أول يوم  ✅ نتيجة تقدر تشوفها  ✅ دعم في أي وقت
> جرّب دلوقتي — اللينك في البايو 👆

### دعوة للفعل (CTA)
${bullets(["ابدأ مجانًا النهارده", "احجز عرض تجريبي في 15 دقيقة"])}`,
  designer: (t) => `## الاتجاه البصري: ${t}

### الإحساس العام
حديث، واضح، ودود — مساحات بيضاء كتير وتفاصيل قليلة مدروسة.

### الألوان
| الاستخدام | اللون |
|---|---|
| أساسي | #1F6FEB أزرق واثق |
| ثانوي | #14B8A6 تركواز |
| تمييز | #F97316 برتقالي للأزرار |
| خلفيات | #F8FAFC |

### الخطوط
${bullets(["العناوين: IBM Plex Sans Arabic — Bold", "النصوص: IBM Plex Sans Arabic — Regular"])}

### الشاشات المطلوبة
1. الصفحة الرئيسية / الهبوط
2. التسجيل والإعداد
3. لوحة المتابعة
4. صفحة التفاصيل والإعدادات

### تصميمات السوشيال
قالب ثابت للبوستات (1080×1350) + قالب ستوري (1080×1920) بنفس الهوية.`,
  marketer: (t) => `## خطة التسويق: ${t}

### الجمهور المستهدف
${bullets(["السن 22–40، مهتمين بالحلول العملية", "نشطين على إنستجرام وتيك توك", "بيقارنوا قبل ما يشتروا وبيثقوا في التجارب الحقيقية"])}

### القنوات
| القناة | الهدف | الميزانية |
|---|---|---|
| إعلانات ميتا | وعي + زيارات | 40% |
| تيك توك | محتوى قصير وانتشار | 30% |
| مؤثرين صغيرين | ثقة | 20% |
| إيميل / واتساب | تحويل | 10% |

### خطة 30 يوم
${bullets([
  "الأسبوع 1: تجهيز المحتوى وصفحة الهبوط والتتبع",
  "الأسبوع 2: إطلاق الإعلانات واختبار 3 رسائل مختلفة",
  "الأسبوع 3: مضاعفة الميزانية على الإعلان الأفضل",
  "الأسبوع 4: حملة عروض + جمع آراء العملاء",
])}

### مؤشرات النجاح
${bullets(["تكلفة العميل المحتمل أقل من الهدف بـ 20%", "معدل تحويل صفحة الهبوط 3% أو أكثر"])}`,
  developer: (t) => `## الخطة التقنية: ${t}

### المعمارية المقترحة
${bullets(["واجهة ويب: Next.js + React", "باك إند: Node.js مع API واضحة", "قاعدة بيانات: PostgreSQL", "استضافة: سحابية مع نشر تلقائي"])}

### خطوات التنفيذ
1. إعداد المشروع والبيئات (تطوير / إنتاج)
2. نظام الحسابات وتسجيل الدخول
3. الخاصية الأساسية + اختبارات
4. لوحة المتابعة
5. المراقبة والتنبيهات قبل الإطلاق

### التقدير
| الجزء | المدة |
|---|---|
| الأساس والحسابات | أسبوع |
| الخاصية الأساسية | أسبوعين |
| الواجهة والتجربة | أسبوع |
| الاختبار والإطلاق | أسبوع |`,
  data_analyst: (t) => `## مؤشرات القياس: ${t}

### المؤشرات الأساسية (KPIs)
| المؤشر | ليه مهم | الهدف المبدئي |
|---|---|---|
| مستخدمين نشطين أسبوعيًا | بيقيس القيمة الحقيقية | +10% أسبوعيًا |
| معدل التحويل | كفاءة القمع | 3% |
| الاحتفاظ بعد 30 يوم | رضا العملاء | 40% |
| تكلفة اكتساب العميل | ربحية النمو | أقل من ثلث قيمة العميل |

### البيانات المطلوب جمعها
${bullets(["مصدر كل زيارة (UTM)", "خطوات التسجيل ونقطة الخروج", "تكرار الاستخدام لكل مستخدم"])}

### الداشبورد المقترح
لوحة أسبوعية فيها القمع كامل + مقارنة بالأسبوع اللي فات + تنبيه لو أي مؤشر نزل أكتر من 15%.`,
  researcher: (t) => `## بحث السوق: ${t}

### أسئلة البحث
1. مين بيدفع فعلًا على حلول زي «${t}»؟
2. إيه أكتر حاجة بتضايق العملاء في البدائل الحالية؟
3. الناس مستعدة تدفع كام؟

### المنافسين اللي محتاجين نراجعهم
| النوع | ليه نراجعه |
|---|---|
| منافس مباشر كبير | نعرف التسعير والمميزات |
| منافس محلي | نفهم السوق والقنوات |
| بديل غير مباشر (الطريقة اليدوية) | نفهم ليه الناس لسه بتستخدمه |

### المنهجية
${bullets(["10 مقابلات مع عملاء محتملين", "استبيان قصير لـ 100 شخص", "تحليل التقييمات على المتاجر والسوشيال"])}

### فرص مبدئية
الفجوة الأوضح غالبًا في البساطة والدعم باللغة العربية.`,
  sales: (t) => `## خطة المبيعات: ${t}

### العميل المثالي
${bullets(["شركة صغيرة أو متوسطة عندها المشكلة بشكل يومي", "صاحب القرار متاح ومهتم بتوفير الوقت"])}

### العرض في 30 ثانية
«بنساعدك توصل لنتيجة أسرع بنص المجهود. عملاؤنا وفّروا ساعات كل أسبوع من أول شهر. ينفع أوريك في 15 دقيقة؟»

### الاعتراضات والرد عليها
| الاعتراض | الرد |
|---|---|
| غالي | نحسب مع بعض العائد في أول 3 شهور |
| مش وقته | نبدأ بتجربة صغيرة من غير التزام |
| عندنا حل | نقارن جنب بعض في نقطتين بس |

### الهدف
20 مكالمة أسبوعيًا ← 6 عروض ← صفقتين.`,
  support: (t) => `## ردود خدمة العملاء: ${t}

### أسئلة شائعة
**إزاي أبدأ؟**
سجّل حسابك وهتلاقي خطوات الإعداد قدامك، كلها حوالي دقيقتين.

**ينفع ألغي في أي وقت؟**
أكيد، من الإعدادات وبضغطة واحدة.

**لو حصلت مشكلة؟**
كلّمنا على الشات أو واتساب، ومتوسط الرد أقل من 10 دقايق.

### قالب الرد على شكوى
> أهلًا [الاسم]، آسفين جدًا على اللي حصل 🙏 فهمنا المشكلة، وهنحلّها خلال [المدة]. هنتابع معاك بنفسنا لحد ما تتأكد إن كل حاجة تمام.

### معايير الجودة
${bullets(["أول رد في أقل من 10 دقايق", "حل 80% من المشاكل من أول تواصل"])}`,
  specialist: (t, e) => `## خطة تنفيذ: ${t}

### من منظور ${e.title}
${bullets([...duties(e.jobDescription).slice(0, 3), "تحديد المطلوب بالظبط ومعايير النجاح", "تقسيم الشغل لخطوات أسبوعية", "تسليم أول نسخة للمراجعة خلال أسبوع"])}

### المخاطر
${bullets(["وضوح المتطلبات من البداية", "التنسيق مع باقي الفريق"])}`,
};

export class MockBrain implements Brain {
  classifyRole(jobTitle: string, jobDescription: string): RoleId {
    return classifyRole(jobTitle, jobDescription);
  }

  hiringNote(e: Employee): string {
    const d = duties(e.jobDescription);
    const resp = d.length ? `\nالمسؤوليات:\n${bullets(d)}` : "";
    return `تم تعيين ${e.name} في وظيفة «${e.title}» (${ROLES[e.roleId].title}). مكتبه جاهز وهيبدأ يستلم مهام من المدير فورًا.${resp}`;
  }

  plan(request: string, team: Employee[]): PlannedSubtask[] {
    const topic = topicOf(request, 40);
    const workers = team.filter((e) => WORKER_ROLES.includes(e.roleId));
    if (!workers.length) return [];

    const lower = request.toLowerCase();
    const scored = workers.map((e) => ({
      e,
      // Keyword match on the role, plus a bonus when the request names the person or their title.
      s:
        scoreRole(e.roleId, request) * 2 +
        (lower.includes(e.title.toLowerCase()) ? 3 : 0) +
        (request.includes(e.name) ? 5 : 0),
    }));

    let picked = scored.filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
    // One person per role is enough unless the team is tiny.
    const seen = new Set<RoleId>();
    picked = picked.filter((x) => (seen.has(x.e.roleId) ? false : (seen.add(x.e.roleId), true)));

    if (picked.length < 2) {
      // Nothing obvious: bring in the generalist core team.
      const order: RoleId[] = ["product_manager", "copywriter", "marketer", "designer", "researcher"];
      for (const r of order) {
        const e = workers.find((w) => w.roleId === r && !picked.some((p) => p.e.id === w.id));
        if (e && picked.length < 3) picked.push({ e, s: 0 });
      }
      for (const e of workers) if (picked.length < 2 && !picked.some((p) => p.e.id === e.id)) picked.push({ e, s: 0 });
    }

    return picked.slice(0, MAX_ASSIGNEES).map(({ e }) => ({
      assigneeId: e.id,
      title: SUBTASK_TITLES[e.roleId](topic),
    }));
  }

  deliverable(e: Employee, _title: string, request: string): string {
    return TEMPLATES[e.roleId](topicOf(request), e);
  }

  summary(request: string, parts: { employee: Employee; title: string }[]): string {
    const topic = topicOf(request);
    return `## تقرير المدير: ${topic}

خلّصنا الطلب. وزّعته على ${parts.length} من الفريق وراجعت شغلهم:

${parts.map((p) => `- **${p.employee.name}** (${ROLES[p.employee.roleId].title}): ${p.title.replace(/ لـ «.*»$/, "")} ✅`).join("\n")}

### الخطوة الجاية
راجع تسليم كل واحد تحت، ولو عايز تعديل في أي جزء ابعتلي طلب جديد وهوزّعه فورًا.`;
  }
}
