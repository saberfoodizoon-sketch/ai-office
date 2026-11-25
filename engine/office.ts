// The office engine: owns the team and tasks, schedules work, and derives the
// live state (who is working, meeting, on a break) from timestamps. Because
// status is computed from time, any client can poll and see smooth progress
// without the server running timers.

import { randomUUID } from "node:crypto";
import { ROLES } from "../shared/roles.js";
import { DESK_COUNT } from "../shared/layout.js";
import type {
  Activity,
  Employee,
  EmployeeView,
  HireInput,
  HireResult,
  OfficeData,
  OfficeSnapshot,
  RoleId,
  Subtask,
  SubtaskView,
  Task,
  TaskView,
} from "../shared/types.js";
import { MockBrain, type Brain, type Plan } from "./brain.js";
import type { Store } from "./store.js";

/** Minimum meeting time, and how long the team sits together once the plan is known. */
const MIN_MEETING_MS = 12_000;
const GATHER_MS = 8_000;
const REVIEW_MS = 4_000;
const MAX_TEAM = DESK_COUNT + 2;

const MALE = ["كريم", "أحمد", "مازن", "حسن", "طارق", "مصطفى", "عمرو", "سيف", "آدم", "شريف"];
const FEMALE = ["نور", "سارة", "هنا", "ملك", "ريم", "جنى", "دينا", "فريدة", "ياسمين", "رنا"];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function seedData(now: number): OfficeData {
  const mk = (name: string, roleId: RoleId, title: string, jd: string, desk: number, look: number): Employee => ({
    id: randomUUID(),
    name,
    roleId,
    title,
    jobDescription: jd,
    desk,
    hiredAt: now - 86_400_000,
    look,
  });
  return {
    employees: [
      mk("عمر", "general_manager", "General Manager", "يستلم الطلبات، يوزعها على الفريق، ويراجع الشغل قبل التسليم.", -1, 1),
      mk("ليلى", "hr_manager", "HR Manager", "تعيين الموظفين الجدد حسب الوصف الوظيفي وتجهيز مكاتبهم.", -2, 2),
      mk("زياد", "product_manager", "Product Manager", "تحويل الأفكار لخطة منتج واضحة ونطاق عمل وخارطة طريق.", 0, 3),
      mk("منى", "copywriter", "Copywriter", "كتابة المحتوى والإعلانات والبوستات والرسائل التسويقية.", 1, 4),
      mk("يوسف", "marketer", "Marketing Specialist", "تخطيط الحملات واختيار القنوات وقياس النتائج.", 6, 5),
    ],
    tasks: [],
  };
}

/**
 * How long an instance trusts its in-memory copy before checking the store.
 * With a versioned store (Redis) that check is one tiny read; the full state is
 * only re-read when another instance changed it.
 */
const CACHE_MS = 3_000;

export class Office {
  private data!: OfficeData;
  private loadedAt = 0;
  private loadedVersion: string | null = null;
  private mock = new MockBrain();

  constructor(
    private brain: Brain,
    private store: Store,
    /** Multiplier for work durations; 1 = demo speed (~15–25 s per subtask). */
    private speed = 1,
    /** Keeps background work alive after the response (waitUntil on Vercel). */
    private defer: (p: Promise<unknown>) => void = () => {},
    /**
     * Agent mode: tasks wait for an AI assistant connected over MCP to act as
     * the GM and the team (see agentWork / submitPlan / submitDeliverable / submitReport).
     */
    readonly agentMode = false,
  ) {}

  // ---- persistence ----------------------------------------------------------
  // Status is derived from timestamps, so the stored data only changes on
  // writes. Reads use a short-lived cache; writes always re-read first so
  // concurrent instances don't overwrite each other's recent changes.

  private async ready(force = false) {
    if (!force && this.data && Date.now() - this.loadedAt < CACHE_MS) return;
    const version = this.store.version ? await this.store.version() : null;
    if (this.data && version !== null && version === this.loadedVersion) {
      this.loadedAt = Date.now();
      return;
    }
    const loaded = await this.store.load();
    if (loaded) this.data = loaded;
    else {
      this.data = seedData(Date.now());
      await this.store.save(this.data);
    }
    this.loadedVersion = this.store.version ? await this.store.version() : null;
    this.loadedAt = Date.now();
  }

  private async persist() {
    await this.store.save(this.data);
    this.loadedVersion = this.store.version ? await this.store.version() : null;
    this.loadedAt = Date.now();
  }

  private queue: Promise<unknown> = Promise.resolve();

  /** Read-modify-write, serialized within this instance (background work writes too). */
  private write<T>(fn: () => T): Promise<T> {
    const run = this.queue.then(async () => {
      await this.ready(true);
      const out = fn();
      await this.persist();
      return out;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async reset() {
    this.data = seedData(Date.now());
    await this.persist();
  }

  hire(input: HireInput) {
    return this.write(() => this.hireSync(input));
  }
  fire(employeeId: string) {
    return this.write(() => this.fireSync(employeeId));
  }
  /**
   * Creates the task and returns at once; the GM plans and the team works in the
   * background. `defer` keeps that work alive after the response (waitUntil on Vercel).
   */
  async assign(request: string, mode: "agent" | "auto" = this.agentMode ? "agent" : "auto") {
    const view = await this.write(() => this.createTask(request, mode));
    if (mode === "auto") this.startRun(view.id, this.brain);
    return view;
  }

  private startRun(taskId: string, brain: Brain) {
    this.defer(this.run(taskId, brain).catch((e) => console.error("task failed", taskId, e)));
  }

  // ---- agent mode: an AI assistant does the thinking over MCP -----------------

  /** Everything an agent needs to act: open tasks, what each needs next, and the team. */
  async agentWork() {
    await this.ready(true);
    const team = this.data.employees.filter((e) => e.roleId !== "general_manager");
    const byId = new Map(this.data.employees.map((e) => [e.id, e]));
    const open = this.data.tasks
      .filter((t) => t.mode === "agent" && !t.summary)
      .map((t) => {
        const missing = t.subtasks.filter((s) => !s.deliverable);
        return {
          taskId: t.id,
          request: t.request,
          next: !t.planned ? ("plan" as const) : missing.length ? ("deliverables" as const) : ("report" as const),
          understanding: t.understanding,
          subtasks: t.subtasks.map((s) => {
            const e = byId.get(s.assigneeId);
            return {
              subtaskId: s.id,
              assignee: e ? { id: e.id, name: e.name, title: e.title, role: ROLES[e.roleId].title, jobDescription: e.jobDescription } : undefined,
              title: s.title,
              brief: s.brief,
              delivered: Boolean(s.deliverable),
              deliverable: s.deliverable,
            };
          }),
        };
      });
    return {
      gm: this.data.employees.find((e) => e.roleId === "general_manager")?.name ?? "عمر",
      team: team.map((e) => ({ id: e.id, name: e.name, title: e.title, role: ROLES[e.roleId].title, jobDescription: e.jobDescription })),
      tasks: open,
    };
  }

  submitPlan(taskId: string, plan: Plan, agent?: string) {
    return this.write(() => {
      const t = this.task(taskId);
      if (t.mode !== "agent") throw new Error("This task is handled by templates, not by an agent.");
      if (t.planned) throw new Error("This task already has a plan. Submit deliverables next.");
      const ok = new Set(this.data.employees.filter((e) => e.roleId !== "general_manager").map((e) => e.id));
      const bad = plan.subtasks.filter((s) => !ok.has(s.assigneeId));
      if (bad.length) throw new Error(`Unknown or invalid assigneeId: ${bad.map((b) => b.assigneeId).join(", ")}. Use ids from the team list (not the GM).`);
      if (!plan.subtasks.length) throw new Error("A plan needs at least one subtask.");
      t.ai = true;
      if (agent) t.agent = agent.slice(0, 40);
      this.applyPlan(t, plan);
      return this.viewTask(t, Date.now());
    });
  }

  submitDeliverable(taskId: string, subtaskId: string, content: string) {
    return this.write(() => {
      const t = this.task(taskId);
      const sub = t.subtasks.find((s) => s.id === subtaskId);
      if (!sub) throw new Error("Unknown subtaskId for this task. Call get_pending_work for the ids.");
      if (content.trim().length < 20) throw new Error("Deliverable is too short; write the actual work.");
      this.applyDeliverable(sub, content.trim());
      return this.viewTask(t, Date.now());
    });
  }

  submitReport(taskId: string, summary: string) {
    return this.write(() => {
      const t = this.task(taskId);
      const missing = t.subtasks.filter((s) => !s.deliverable);
      if (!t.planned || missing.length) throw new Error(`Submit all deliverables first (${missing.length} missing).`);
      t.summary = summary.trim();
      t.summaryAt = Date.now();
      return this.viewTask(t, Date.now());
    });
  }

  /** Finish an agent task with templates (user didn't want to wait for an agent). */
  async finishWithTemplates(taskId: string) {
    const view = await this.write(() => {
      const t = this.task(taskId);
      if (t.summary) throw new Error("المهمة دي خلصت خلاص.");
      t.mode = "auto";
      return this.viewTask(t, Date.now());
    });
    this.startRun(taskId, this.mock);
    return view;
  }
  async getTask(id: string) {
    await this.ready();
    return this.getTaskSync(id);
  }
  async snapshot() {
    await this.ready();
    return this.snapshotSync();
  }

  // ---- commands -------------------------------------------------------------

  private hireSync(input: HireInput): HireResult {
    const jobTitle = input.jobTitle.trim().slice(0, 80);
    const jobDescription = input.jobDescription.trim().slice(0, 2000);
    if (!jobTitle) throw new Error("لازم تكتب المسمى الوظيفي.");
    if (this.data.employees.length >= MAX_TEAM) throw new Error(`المكتب مليان: أقصى عدد ${MAX_TEAM} موظف.`);

    const used = new Set(this.data.employees.map((e) => e.desk));
    let desk = 0;
    while (used.has(desk)) desk++;

    const roleId = this.brain.classifyRole(jobTitle, jobDescription);
    const look = this.data.employees.length * 7 + 11;
    const taken = new Set(this.data.employees.map((e) => e.name));
    const pool = look % 2 ? MALE : FEMALE;
    const name =
      input.name?.trim().slice(0, 30) || pool.find((n) => !taken.has(n)) || `موظف ${this.data.employees.length + 1}`;

    const employee: Employee = {
      id: randomUUID(),
      name,
      roleId,
      title: jobTitle,
      jobDescription,
      desk,
      hiredAt: Date.now(),
      look,
    };
    this.data.employees.push(employee);
    const note = this.brain.hiringNote(employee);
    this.data.lastHire = { employeeId: employee.id, at: employee.hiredAt, note };
    return { employee: this.viewEmployee(employee, this.snapshotContext(Date.now())), note };
  }

  private fireSync(employeeId: string): string {
    const e = this.data.employees.find((x) => x.id === employeeId);
    if (!e) throw new Error("الموظف ده مش موجود.");
    if (e.roleId === "general_manager" || e.roleId === "hr_manager") throw new Error("مينفعش تستغنى عن المدير العام أو مديرة الموارد البشرية.");
    const now = Date.now();
    const busy = this.data.tasks.some((t) =>
      t.subtasks.some((s) => s.assigneeId === e.id && subtaskState(s, now).status !== "done" && now - t.createdAt < STALE_MS),
    );
    if (busy) throw new Error(`${e.name} شغال على مهمة دلوقتي. استنى لما يخلص.`);
    this.data.employees = this.data.employees.filter((x) => x.id !== employeeId);
    return `تم الاستغناء عن ${e.name}.`;
  }

  private createTask(request: string, mode: "agent" | "auto"): TaskView {
    const text = request.trim().slice(0, 1000);
    if (!text) throw new Error("اكتب الطلب الأول.");
    if (!this.data.employees.some((e) => e.roleId !== "general_manager" && e.roleId !== "hr_manager"))
      throw new Error("مفيش موظفين يشتغلوا على الطلب. عيّن موظفين من الموارد البشرية الأول.");
    const task: Task = {
      id: randomUUID(),
      request: text,
      createdAt: Date.now(),
      planningMs: MIN_MEETING_MS,
      planned: false,
      subtasks: [],
      ai: mode === "auto" && this.brain.ai,
      mode,
    };
    this.data.tasks.unshift(task);
    this.data.tasks = this.data.tasks.slice(0, 30);
    return this.viewTask(task, task.createdAt);
  }

  private task(id: string) {
    const t = this.data.tasks.find((x) => x.id === id);
    if (!t) throw new Error("task gone");
    return t;
  }

  /** Try the configured brain, fall back to templates so a task always finishes. */
  private async think<T>(taskId: string, step: string, brain: Brain, ai: () => Promise<T>, mock: () => Promise<T>): Promise<T> {
    if (brain.ai) {
      try {
        return await ai();
      } catch (e) {
        console.error(`brain.${step} failed, using templates`, e);
        await this.write(() => {
          const t = this.task(taskId);
          t.ai = false;
          t.error = /credit card|customer_verification/i.test(String(e))
            ? "الذكاء الاصطناعي محتاج تفعيل: ضيف كارت في حساب Vercel (AI Gateway) عشان يتفتح الرصيد المجاني. المهمة اتكمّلت بالقوالب."
            : "الذكاء الاصطناعي مكانش متاح لجزء من المهمة، فاتكمّل بالقوالب.";
        });
      }
    }
    return mock();
  }

  /** The GM's plan becomes timed subtasks; the team gathers briefly first. */
  private applyPlan(t: Task, plan: Plan) {
    const now = Date.now();
    const byId = new Map(this.data.employees.map((e) => [e.id, e]));
    t.understanding = plan.understanding;
    t.planningMs = Math.max(MIN_MEETING_MS, now - t.createdAt + GATHER_MS);
    const meetingEnds = t.createdAt + t.planningMs;
    // One subtask at a time per person: queue after their current work.
    const busyUntil = new Map<string, number>();
    for (const other of this.data.tasks)
      for (const s of other.subtasks)
        busyUntil.set(s.assigneeId, Math.max(busyUntil.get(s.assigneeId) ?? 0, s.doneAt ?? s.startAt + s.durationMs));
    t.subtasks = plan.subtasks
      .filter((p) => byId.has(p.assigneeId))
      .slice(0, 6)
      .map((p, i) => {
        const startAt = Math.max(meetingEnds + i * 1_200, Math.min((busyUntil.get(p.assigneeId) ?? 0) + 1_000, now + 120_000));
        const durationMs = Math.round((14_000 + (hash(t.request + p.assigneeId) % 10_000)) * this.speed);
        busyUntil.set(p.assigneeId, startAt + durationMs);
        return { id: randomUUID(), assigneeId: p.assigneeId, title: p.title.trim(), brief: p.brief.trim(), startAt, durationMs };
      });
    t.planned = true;
  }

  /** Shows once its slot elapses, so the office animation stays believable. */
  private applyDeliverable(sub: Subtask, text: string) {
    sub.deliverable = text;
    sub.doneAt = Math.max(Date.now(), sub.startAt + sub.durationMs);
  }

  /** Runs whatever is left of a task with the given brain: plan, deliverables, report. */
  private async run(taskId: string, brain: Brain) {
    const { request } = this.task(taskId);
    const team = [...this.data.employees];
    const byId = new Map(team.map((e) => [e.id, e]));

    if (!this.task(taskId).planned) {
      let plan: Plan = await this.think(taskId, "plan", brain, () => brain.plan(request, team), () => this.mock.plan(request, team));
      if (!plan.subtasks.length) plan = await this.mock.plan(request, team);
      await this.write(() => this.applyPlan(this.task(taskId), plan));
    }
    const understanding = this.task(taskId).understanding ?? "";

    const results = await Promise.all(
      this.task(taskId).subtasks.map(async (s) => {
        const emp = byId.get(s.assigneeId)!;
        if (s.deliverable) return { employee: emp, title: s.title, deliverable: s.deliverable };
        const brief = { assigneeId: s.assigneeId, title: s.title, brief: s.brief };
        const deliverable = await this.think(
          taskId,
          "deliverable",
          brain,
          () => brain.deliverable(emp, brief, request, understanding),
          () => this.mock.deliverable(emp, brief, request, understanding),
        );
        await this.write(() => {
          const sub = this.task(taskId).subtasks.find((x) => x.id === s.id);
          if (sub && !sub.deliverable) this.applyDeliverable(sub, deliverable);
        });
        return { employee: emp, title: s.title, deliverable };
      }),
    );

    if (!this.task(taskId).summary) {
      const summary = await this.think(
        taskId,
        "summary",
        brain,
        () => brain.summary(request, understanding, results),
        () => this.mock.summary(request, understanding, results),
      );
      await this.write(() => {
        const t = this.task(taskId);
        t.summary = summary;
        t.summaryAt = Date.now();
      });
    }
  }

  // ---- views ----------------------------------------------------------------

  private getTaskSync(id: string): TaskView | undefined {
    const t = this.data.tasks.find((x) => x.id === id);
    return t && this.viewTask(t, Date.now());
  }

  private snapshotSync(): OfficeSnapshot {
    const now = Date.now();
    const ctx = this.snapshotContext(now);
    return {
      now,
      employees: this.data.employees.map((e) => this.viewEmployee(e, ctx)),
      tasks: this.data.tasks.map((t) => this.viewTask(t, now)),
      lastHire: this.data.lastHire,
    };
  }

  private snapshotContext(now: number) {
    const planning = this.data.tasks.filter((t) => this.taskStatus(t, now) === "planning");
    const inMeeting = new Set<string>();
    for (const t of planning) for (const s of t.subtasks) inMeeting.add(s.assigneeId);
    const anyActive = this.data.tasks.some((t) => this.taskStatus(t, now) !== "done");
    return { now, planning, inMeeting, anyActive };
  }

  private viewEmployee(e: Employee, ctx: ReturnType<Office["snapshotContext"]>): EmployeeView {
    const { now } = ctx;
    const role = ROLES[e.roleId];
    let activity: Activity = "idle";
    let doing: string | undefined;
    let doingProgress: number | undefined;
    let completed = 0;

    for (const t of this.data.tasks)
      for (const s of t.subtasks) {
        if (s.assigneeId !== e.id) continue;
        const st = subtaskState(s, now);
        if (st.status === "done") completed++;
        else if (st.status === "working") {
          activity = "working";
          doing = s.title;
          doingProgress = st.progress;
        }
      }

    if (e.roleId === "general_manager") {
      if (ctx.planning.length) activity = "meeting";
      else if (ctx.anyActive) {
        activity = "working";
        doing = "متابعة الفريق ومراجعة التسليمات";
      }
    } else if (e.roleId === "hr_manager") {
      const recent = this.data.lastHire && now - this.data.lastHire.at < 8_000;
      if (recent) {
        activity = "working";
        doing = "تجهيز الموظف الجديد";
      }
    }

    if (activity === "idle" && ctx.inMeeting.has(e.id)) activity = "meeting";
    // Free people take turns in the lounge, in ~25 s slots.
    if (activity === "idle" && e.roleId !== "general_manager" && hash(e.id + Math.floor(now / 25_000)) % 3 === 0)
      activity = "break";

    return {
      id: e.id,
      name: e.name,
      roleId: e.roleId,
      roleTitle: role.title,
      color: role.color,
      title: e.title,
      jobDescription: e.jobDescription,
      desk: e.desk,
      look: e.look,
      hiredAt: e.hiredAt,
      activity,
      doing,
      doingProgress,
      completed,
    };
  }

  private taskStatus(t: Task, now: number): TaskView["status"] {
    const agent = t.mode === "agent";
    if (agent && !t.planned) return "waiting";
    // Agent tasks never time out: they finish when the agent submits the report.
    const stale = !agent && now - t.createdAt > STALE_MS;
    if (!t.planned || now < t.createdAt + t.planningMs) {
      // A plan that never arrives (crashed instance) shouldn't freeze the office.
      if (!t.planned && stale) return "done";
      return "planning";
    }
    const states = t.subtasks.map((s) => subtaskState(s, now));
    if (states.some((x) => x.status !== "done")) {
      if (stale) return "done";
      return "in_progress";
    }
    const lastDone = Math.max(...t.subtasks.map((s) => s.doneAt ?? 0));
    if (!t.summary || now < Math.max(lastDone + REVIEW_MS, t.summaryAt ?? 0)) return stale ? "done" : "reviewing";
    return "done";
  }

  private viewTask(t: Task, now: number): TaskView {
    const names = new Map(this.data.employees.map((e) => [e.id, e.name]));
    const subtasks: SubtaskView[] = t.subtasks.map((s) => {
      const st = subtaskState(s, now);
      return {
        id: s.id,
        assigneeId: s.assigneeId,
        assigneeName: names.get(s.assigneeId) ?? "موظف سابق",
        title: s.title,
        brief: s.brief,
        status: st.status,
        progress: st.progress,
        deliverable: st.status === "done" ? s.deliverable : undefined,
      };
    });
    const status = this.taskStatus(t, now);
    const work = subtasks.length ? subtasks.reduce((a, s) => a + s.progress, 0) / subtasks.length : 0;
    const progress =
      status === "waiting"
        ? 0
        : status === "planning"
        ? Math.min(0.08, 0.08 * ((now - t.createdAt) / t.planningMs))
        : status === "done"
          ? 1
          : status === "reviewing"
            ? 0.96
            : 0.08 + work * 0.86;
    return {
      id: t.id,
      request: t.request,
      createdAt: t.createdAt,
      status,
      progress,
      understanding: t.planned ? t.understanding : undefined,
      subtasks,
      summary: status === "done" ? t.summary : undefined,
      ai: Boolean(t.ai),
      error: t.error,
      mode: t.mode ?? "auto",
      agent: t.agent,
    };
  }
}

/** Give up on a task that's been stuck this long (e.g. its instance died). */
const STALE_MS = 6 * 60_000;

function subtaskState(s: Subtask, now: number): { status: SubtaskView["status"]; progress: number } {
  if (s.deliverable && s.doneAt !== undefined && now >= s.doneAt) return { status: "done", progress: 1 };
  if (now < s.startAt) return { status: "queued", progress: 0 };
  // Until the work arrives, creep toward 95%.
  return { status: "working", progress: Math.min(0.95, (now - s.startAt) / s.durationMs) };
}
