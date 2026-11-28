import { useState } from "react";
import type { TaskView } from "../../../shared/types";
import { ErrorBoundary } from "./ErrorBoundary";
import { Markdown as RawMarkdown } from "./Markdown";

const Markdown = ({ text }: { text: string }) => (
  <ErrorBoundary>
    <RawMarkdown text={text} />
  </ErrorBoundary>
);

const SUB: Record<string, string> = { queued: "في الانتظار", working: "شغال", done: "اقرأ التسليم" };

function statusLabel(task: TaskView, gm: string): string {
  if (task.status === "waiting") return "مستنية المدير";
  if (task.status === "planning") return task.subtasks.length ? `${gm} بيشرح المهام للفريق` : `${gm} بيقرأ الطلب ويفكّر`;
  if (task.status === "in_progress") return "الفريق شغال";
  if (task.status === "reviewing") return `${gm} بيراجع الشغل`;
  return "خلصت";
}

function copy(text: string) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

interface Props {
  task: TaskView;
  gmName?: string;
  onFocus?: (employeeId: string) => void;
  /** Finish a waiting task with templates instead of an AI agent. */
  onTemplates?: (taskId: string) => Promise<void>;
}

export function TaskCard({ task, gmName = "المدير", onFocus, onTemplates }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className={`task task--${task.status}`}>
      <div className="task__head">
        <span className={`chip chip--${task.status}`}>{statusLabel(task, gmName)}</span>
        <span className="task__meta">
          {task.ai && (
            <span className="chip chip--ai" title="المدير والفريق شغالين بذكاء اصطناعي حقيقي">
              {task.agent || "AI"}
            </span>
          )}
          <span className="task__pct">{Math.round(task.progress * 100)}%</span>
        </span>
      </div>
      <div className="bar">
        <i style={{ width: `${Math.round(task.progress * 100)}%` }} />
      </div>

      {task.understanding && (
        <div className="understanding">
          <b>فهم {gmName} للمهمة:</b> {task.understanding}
        </div>
      )}
      {task.status === "waiting" && (
        <div className="waiting">
          <p>
            المهمة وصلت لـ {gmName} ومستنية «العقل» اللي هيفكّر فيها. افتح Claude أو ChatGPT أو Codex المتوصّل بالمكتب وقوله:
          </p>
          <code className="say">شوف المهام الجديدة في مكتبي الذكي واشتغل عليها</code>
          {onTemplates && (
            <button
              className="ghost small"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onTemplates(task.id);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "…" : "أو كمّلها بالقوالب دلوقتي"}
            </button>
          )}
        </div>
      )}
      {!task.subtasks.length && task.status === "planning" && (
        <p className="thinking">
          <span className="dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          {gmName} بيحلل الطلب ويختار مين ينفّذ كل جزء…
        </p>
      )}

      {task.subtasks.length > 0 && (
        <ul className="subs">
          {task.subtasks.map((s) => (
            <li key={s.id} className={`sub sub--${s.status}`}>
              <button
                className="sub__row"
                onClick={() => (s.deliverable ? setOpen(open === s.id ? null : s.id) : onFocus?.(s.assigneeId))}
                aria-expanded={open === s.id}
              >
                <span className="sub__who">{s.assigneeName}</span>
                <span className="sub__title">{s.title.replace(/ لـ «.*»$/, "")}</span>
                <span className={`sub__st sub__st--${s.status}`}>
                  {s.status === "working" ? `${Math.round(s.progress * 100)}%` : SUB[s.status]}
                </span>
              </button>
              {s.brief && <p className="sub__brief">المطلوب: {s.brief}</p>}
              {s.status === "working" && (
                <div className="bar bar--thin">
                  <i style={{ width: `${Math.round(s.progress * 100)}%` }} />
                </div>
              )}
              {open === s.id && s.deliverable && (
                <div className="deliv">
                  <button className="ghost small" onClick={() => copy(s.deliverable!)}>
                    نسخ
                  </button>
                  <Markdown text={s.deliverable} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {task.error && <p className="warn">{task.error}</p>}
      {task.summary && (
        <details className="summary" open>
          <summary>تقرير {gmName}</summary>
          <Markdown text={task.summary} />
          <p className="hint">اضغط «اقرأ التسليم» جنب أي موظف عشان تشوف شغله كامل.</p>
        </details>
      )}
    </div>
  );
}
