import { useState } from "react";
import type { TaskView } from "../../../shared/types";
import { Markdown } from "./Markdown";

const STATUS: Record<TaskView["status"], string> = {
  planning: "عمر بيخطط في الاجتماع",
  in_progress: "الفريق شغال",
  reviewing: "عمر بيراجع",
  done: "خلصت",
};
const SUB: Record<string, string> = { queued: "في الانتظار", working: "شغال", done: "سلّم" };

function copy(text: string) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

export function TaskCard({ task, onFocus }: { task: TaskView; onFocus?: (employeeId: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className={`task task--${task.status}`}>
      <div className="task__head">
        <span className={`chip chip--${task.status}`}>{STATUS[task.status]}</span>
        <span className="task__pct">{Math.round(task.progress * 100)}%</span>
      </div>
      <div className="bar">
        <i style={{ width: `${Math.round(task.progress * 100)}%` }} />
      </div>
      <ul className="subs">
        {task.subtasks.map((s) => (
          <li key={s.id} className={`sub sub--${s.status}`}>
            <button className="sub__row" onClick={() => (s.deliverable ? setOpen(open === s.id ? null : s.id) : onFocus?.(s.assigneeId))}>
              <span className="sub__who">{s.assigneeName}</span>
              <span className="sub__title">{s.title.replace(/ لـ «.*»$/, "")}</span>
              <span className={`sub__st sub__st--${s.status}`}>
                {s.status === "working" ? `${Math.round(s.progress * 100)}%` : SUB[s.status]}
              </span>
            </button>
            {s.status === "working" && (
              <div className="bar bar--thin">
                <i style={{ width: `${Math.round(s.progress * 100)}%` }} />
              </div>
            )}
            {open === s.id && s.deliverable && (
              <div className="deliv">
                <button className="ghost small" onClick={() => copy(s.deliverable!)}>نسخ</button>
                <Markdown text={s.deliverable} />
              </div>
            )}
          </li>
        ))}
      </ul>
      {task.summary && (
        <details className="summary" open>
          <summary>تقرير المدير</summary>
          <Markdown text={task.summary} />
          <p className="hint">اضغط على اسم أي موظف فوق عشان تقرأ تسليمه.</p>
        </details>
      )}
    </div>
  );
}
