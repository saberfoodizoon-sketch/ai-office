// A Brain backed by a real model through Vercel AI Gateway.
//
// - plan():        the GM reads the request, restates it, and splits it into
//                  concrete subtasks, each assigned to the best-fitting employee
//                  based on their title and job description.
// - deliverable(): each employee writes their part, following the GM's brief.
// - summary():     the GM reviews everything and writes the final report.
//
// Auth: on Vercel the gateway uses the deployment's OIDC token automatically;
// elsewhere set AI_GATEWAY_API_KEY. Any failure falls back to MockBrain, so the
// office keeps working without credentials.

import { generateText, Output } from "ai";
import { z } from "zod";
import { ROLES, WORKER_ROLES } from "../shared/roles.js";
import type { Employee } from "../shared/types.js";
import { MockBrain, type Brain, type Plan, type PlannedSubtask } from "./brain.js";

export const DEFAULT_MODEL = "google/gemini-3-flash";
const MAX_SUBTASKS = 5;
const TIMEOUT_MS = 90_000;

const VOICE =
  "اكتب بالعربي بلهجة مصرية مهنية وواضحة. استخدم الأرقام والأمثلة المحددة بدل الكلام العام. " +
  "متخترعش أرقام أو حقايق عن شركات حقيقية؛ لو محتاج رقم، قول إنه تقدير.";

function teamSheet(team: Employee[]): string {
  return team
    .map(
      (e) =>
        `- id: ${e.id}\n  الاسم: ${e.name}\n  المسمى: ${e.title} (${ROLES[e.roleId].title})\n  الوصف الوظيفي: ${e.jobDescription || "—"}`,
    )
    .join("\n");
}

export class AiBrain implements Brain {
  readonly ai = true;
  private fallback = new MockBrain();

  constructor(private model = process.env.AI_GATEWAY_MODEL || DEFAULT_MODEL) {}

  /** Credentials exist (Vercel OIDC or an API key)? Otherwise use MockBrain. */
  static available(): boolean {
    return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL);
  }

  classifyRole(jobTitle: string, jobDescription: string) {
    return this.fallback.classifyRole(jobTitle, jobDescription);
  }

  hiringNote(e: Employee) {
    return this.fallback.hiringNote(e);
  }

  async plan(request: string, team: Employee[]): Promise<Plan> {
    const gm = team.find((e) => e.roleId === "general_manager");
    // The GM delegates to everyone except himself; HR only when it's about people.
    const candidates = team.filter((e) => e.roleId !== "general_manager");
    if (!candidates.some((e) => WORKER_ROLES.includes(e.roleId))) return { understanding: "", subtasks: [] };
    const ids = candidates.map((e) => e.id) as [string, ...string[]];

    const schema = z.object({
      understanding: z
        .string()
        .describe("فهمك للطلب في 2-4 جمل: الهدف، الجمهور أو المستخدم، والقيود أو الافتراضات المهمة."),
      subtasks: z
        .array(
          z.object({
            assigneeId: z.enum(ids).describe("id الموظف الأنسب من القائمة"),
            title: z.string().describe("عنوان قصير للمهمة الفرعية (3-7 كلمات)"),
            brief: z
              .string()
              .describe("تعليمات واضحة للموظف: المطلوب تسليمه بالظبط، والشكل، وأي تفاصيل مهمة من الطلب."),
          }),
        )
        .min(1)
        .max(MAX_SUBTASKS),
    });

    const { output } = await generateText({
      model: this.model,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      output: Output.object({ schema }),
      instructions:
        `إنت ${gm?.name ?? "عمر"}، المدير العام لفريق شغال. وظيفتك تفهم طلب صاحب الشغل كويس وتوزّعه صح.\n` +
        "قواعد التوزيع:\n" +
        "1. افهم الطلب الأول: إيه الهدف الحقيقي؟ مين المستفيد؟ إيه الناتج النهائي اللي صاحب الشغل عايزه؟\n" +
        "2. قسّم الطلب لأقل عدد مهام فرعية يغطي المطلوب (من 1 لـ 5). متضيفش مهام ملهاش لازمة.\n" +
        "3. اختار لكل مهمة الموظف اللي وصفه الوظيفي ومسماه أقرب حاجة ليها. اقرا الوصف الوظيفي كويس.\n" +
        "4. لو الطلب صغير ومحدد (زي «اكتب بوست»)، اديه لشخص واحد بس.\n" +
        "5. متدّيش نفس الشخص أكتر من مهمة إلا لو مفيش حد تاني مناسب.\n" +
        "6. مديرة الموارد البشرية تاخد مهام بس لو الطلب عن التوظيف أو الفريق.\n" +
        "7. الـ brief لازم يبقى محدد: يقول للموظف يسلّم إيه بالظبط، ويربطه بتفاصيل الطلب.\n" +
        VOICE,
      prompt: `الفريق المتاح:\n${teamSheet(candidates)}\n\nالطلب من صاحب الشغل:\n«${request}»`,
    });

    // Defensive: keep valid assignees and avoid exact duplicates.
    const seen = new Set<string>();
    const subtasks: PlannedSubtask[] = [];
    for (const s of output.subtasks) {
      const key = `${s.assigneeId}:${s.title}`;
      if (!ids.includes(s.assigneeId) || seen.has(key)) continue;
      seen.add(key);
      subtasks.push({ assigneeId: s.assigneeId, title: s.title.trim(), brief: s.brief.trim() });
    }
    return { understanding: output.understanding.trim(), subtasks };
  }

  async deliverable(e: Employee, sub: PlannedSubtask, request: string, understanding: string): Promise<string> {
    const { text } = await generateText({
      model: this.model,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      maxOutputTokens: 2_500,
      instructions:
        `إنت ${e.name}، شغال ${e.title} (${ROLES[e.roleId].title}).\n` +
        `وصفك الوظيفي: ${e.jobDescription || "—"}\n` +
        "سلّم شغل حقيقي جاهز للاستخدام، مش خطة عن الشغل. لو المطلوب محتوى، اكتب المحتوى نفسه.\n" +
        "الشكل: Markdown بسيط فقط — عنوان رئيسي بـ ##، عناوين فرعية بـ ###، قوائم بـ - أو 1.، جداول بسيطة لو مفيدة، و**bold** للمهم. " +
        "من غير مقدمات أو تحيات، ومن غير ما تعيد كتابة التعليمات. الطول: من 250 لـ 600 كلمة حسب المطلوب.\n" +
        VOICE,
      prompt:
        `الطلب الأصلي من صاحب الشغل: «${request}»\n\n` +
        `فهم المدير للطلب: ${understanding}\n\n` +
        `مهمتك: ${sub.title}\n` +
        `تعليمات المدير ليك: ${sub.brief}`,
    });
    return text.trim();
  }

  async summary(
    request: string,
    understanding: string,
    parts: { employee: Employee; title: string; deliverable: string }[],
  ): Promise<string> {
    const work = parts
      .map((p) => `### ${p.employee.name} (${p.employee.title}) — ${p.title}\n${p.deliverable.slice(0, 2_500)}`)
      .join("\n\n");
    const { text } = await generateText({
      model: this.model,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      maxOutputTokens: 1_200,
      instructions:
        "إنت المدير العام. راجعت شغل الفريق، واكتب تقرير قصير لصاحب الشغل.\n" +
        "الشكل: يبدأ بـ «## تقرير المدير: <موضوع الطلب>»، بعدين ملخص في جملتين، بعدين «### اللي اتعمل» فيها نقطة لكل موظف (اسمه بـ **bold** وأهم حاجة سلّمها)، " +
        "بعدين «### توصياتي» فيها 2-3 خطوات جاية عملية. من غير مقدمات. أقل من 250 كلمة.\n" +
        VOICE,
      prompt: `الطلب: «${request}»\nفهمك للطلب: ${understanding}\n\nتسليمات الفريق:\n${work}`,
    });
    return text.trim();
  }
}
