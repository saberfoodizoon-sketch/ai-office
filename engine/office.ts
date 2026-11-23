// The office engine: owns the team and tasks, schedules work, and derives the
// live state (who is working, meeting, on a break) from timestamps. Because
// status is computed from time, any client can poll and see smooth progress
// without the server running timers.

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ROLES } from "../shared/roles";
import { DESK_COUNT } from "../shared/layout";
import type {
  Activity,
  Employee,
  EmployeeView,
  HireInput,
  HireResult,
  OfficeData,
  OfficeSnapshot,
  RoleId,
  SubtaskView,
  Task,
  TaskView,
} from "../shared/types";
import type { Brain } from "./brain";

const PLANNING_MS = 12_000;
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

export class Office {
  private data: OfficeData;

  constructor(
    private brain: Brain,
    private file?: string,
    /** Multiplier for work durations; 1 = demo speed (~10–20 s per subtask). */
    private speed = 1,
  ) {
    this.data = this.load();
  }

  // ---- persistence ----------------------------------------------------------

  private load(): OfficeData {
    if (this.file && existsSync(this.file)) {
      try {
        return JSON.parse(readFileSync(this.file, "utf8")) as OfficeData;
      } catch {
        /* fall through to a fresh office */
      }
    }
    return seedData(Date.now());
  }

  private save() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }

  reset() {
    this.data = seedData(Date.now());
    this.save();
  }

  // ---- commands -------------------------------------------------------------

  hire(input: HireInput): HireResult {
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
    this.save();
    return { employee: this.viewEmployee(employee, this.snapshotContext(Date.now())), note };
  }

  fire(employeeId: string): string {
    const e = this.data.employees.find((x) => x.id === employeeId);
    if (!e) throw new Error("الموظف ده مش موجود.");
    if (e.roleId === "general_manager" || e.roleId === "hr_manager") throw new Error("مينفعش تستغنى عن المدير العام أو مديرة الموارد البشرية.");
    const now = Date.now();
    const busy = this.data.tasks.some((t) => t.subtasks.some((s) => s.assigneeId === e.id && s.startAt + s.durationMs > now));
    if (busy) throw new Error(`${e.name} شغال على مهمة دلوقتي. استنى لما يخلص.`);
    this.data.employees = this.data.employees.filter((x) => x.id !== employeeId);
    this.save();
    return `تم الاستغناء عن ${e.name}.`;
  }

  assign(request: string): TaskView {
    const text = request.trim().slice(0, 1000);
    if (!text) throw new Error("اكتب الطلب الأول.");
    const team = this.data.employees;
    const plan = this.brain.plan(text, team);
    if (!plan.length) throw new Error("مفيش موظفين يشتغلوا على الطلب. عيّن موظفين من الموارد البشرية الأول.");

    const now = Date.now();
    const planningMs = PLANNING_MS;
    // Each employee works on one subtask at a time: queue after their current work.
    const busyUntil = new Map<string, number>();
    for (const t of this.data.tasks)
      for (const s of t.subtasks) busyUntil.set(s.assigneeId, Math.max(busyUntil.get(s.assigneeId) ?? 0, s.startAt + s.durationMs));

    const subtasks = plan.map((p, i) => {
      const emp = team.find((e) => e.id === p.assigneeId)!;
      const startAt = Math.max(now + planningMs + i * 1_200, (busyUntil.get(emp.id) ?? 0) + 1_000);
      const durationMs = Math.round((10_000 + (hash(text + emp.id) % 10_000)) * this.speed);
      return {
        id: randomUUID(),
        assigneeId: emp.id,
        title: p.title,
        startAt,
        durationMs,
        deliverable: this.brain.deliverable(emp, p.title, text),
      };
    });

    const summary = this.brain.summary(
      text,
      subtasks.map((s) => ({ employee: team.find((e) => e.id === s.assigneeId)!, title: s.title })),
    );
    const task: Task = { id: randomUUID(), request: text, createdAt: now, planningMs, subtasks, summary };
    this.data.tasks.unshift(task);
    this.data.tasks = this.data.tasks.slice(0, 30);
    this.save();
    return this.viewTask(task, now);
  }

  // ---- views ----------------------------------------------------------------

  getTask(id: string): TaskView | undefined {
    const t = this.data.tasks.find((x) => x.id === id);
    return t && this.viewTask(t, Date.now());
  }

  snapshot(): OfficeSnapshot {
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
    const planning = this.data.tasks.filter((t) => now < t.createdAt + t.planningMs);
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
        if (now >= s.startAt + s.durationMs) completed++;
        else if (now >= s.startAt) {
          activity = "working";
          doing = s.title;
          doingProgress = (now - s.startAt) / s.durationMs;
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
    if (now < t.createdAt + t.planningMs) return "planning";
    const end = Math.max(...t.subtasks.map((s) => s.startAt + s.durationMs));
    if (now < end) return "in_progress";
    if (now < end + REVIEW_MS) return "reviewing";
    return "done";
  }

  private viewTask(t: Task, now: number): TaskView {
    const names = new Map(this.data.employees.map((e) => [e.id, e.name]));
    const subtasks: SubtaskView[] = t.subtasks.map((s) => {
      const p = Math.min(1, Math.max(0, (now - s.startAt) / s.durationMs));
      const status = p >= 1 ? "done" : now >= s.startAt ? "working" : "queued";
      return {
        id: s.id,
        assigneeId: s.assigneeId,
        assigneeName: names.get(s.assigneeId) ?? "موظف سابق",
        title: s.title,
        status,
        progress: p,
        deliverable: status === "done" ? s.deliverable : undefined,
      };
    });
    const status = this.taskStatus(t, now);
    const work = subtasks.reduce((a, s) => a + s.progress, 0) / subtasks.length;
    const progress = status === "planning" ? 0.05 * ((now - t.createdAt) / t.planningMs) : status === "done" ? 1 : 0.05 + work * 0.9;
    return {
      id: t.id,
      request: t.request,
      createdAt: t.createdAt,
      status,
      progress,
      subtasks,
      summary: status === "done" ? t.summary : undefined,
    };
  }
}
