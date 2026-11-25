import { useEffect, useRef, useState } from "react";
import type { EmployeeView, OfficeSnapshot } from "../../../shared/types";
import type { OfficeClient } from "../client";
import { Markdown } from "./Markdown";
import { TaskCard } from "./TaskCard";

export type Tab = "gm" | "hr" | "team" | "tasks";

const IDEAS = [
  "حملة إطلاق لتطبيق توصيل أكل صحي",
  "اكتبوا 3 بوستات لكافيه جديد في القاهرة",
  "خطة منتج لتطبيق حجز ملاعب",
  "هوية بصرية لبراند ملابس رياضية",
];

const JOB_TEMPLATES = [
  { t: "Graphic Designer", d: "تصميم بوستات السوشيال ميديا والهوية البصرية واللوجو." },
  { t: "Web Developer", d: "تطوير المواقع والتطبيقات وربط الـ API." },
  { t: "Data Analyst", d: "تحليل البيانات وبناء التقارير ومتابعة مؤشرات الأداء." },
  { t: "Sales Representative", d: "التواصل مع العملاء المحتملين وتقديم العروض وإغلاق الصفقات." },
  { t: "Customer Support", d: "الرد على العملاء وحل المشاكل وكتابة الأسئلة الشائعة." },
  { t: "Market Researcher", d: "بحث السوق وتحليل المنافسين وعمل الاستبيانات." },
];

interface Props {
  snap: OfficeSnapshot;
  client: OfficeClient;
  tab: Tab;
  setTab: (t: Tab) => void;
  selected: EmployeeView | null;
  onSelect: (id: string | null) => void;
  notify: (msg: string, kind?: "ok" | "err") => void;
  onNewTask: () => void;
}

function Avatar({ e, size = 34 }: { e: EmployeeView; size?: number }) {
  return (
    <span className="avatar" style={{ background: e.color, width: size, height: size, fontSize: size * 0.42 }}>
      {e.name.slice(0, 1)}
    </span>
  );
}

const ACT: Record<EmployeeView["activity"], string> = { working: "بيشتغل", meeting: "في اجتماع", idle: "متاح", break: "استراحة" };

export function Panel({ snap, client, tab, setTab, selected, onSelect, notify, onNewTask }: Props) {
  const gm = snap.employees.find((e) => e.roleId === "general_manager");
  const hr = snap.employees.find((e) => e.roleId === "hr_manager");
  const active = snap.tasks.filter((t) => t.status !== "done").length;

  return (
    <aside className="panel">
      <nav className="tabs" role="tablist">
        {(
          [
            ["gm", `المدير${gm ? ` · ${gm.name}` : ""}`],
            ["hr", "التعيين"],
            ["team", `الفريق (${snap.employees.length})`],
            ["tasks", `المهام${active ? ` · ${active}` : ""}`],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>
      <div className="panel__body">
        {selected ? (
          <EmployeeCard e={selected} snap={snap} client={client} onClose={() => onSelect(null)} notify={notify} />
        ) : tab === "gm" ? (
          <GmTab snap={snap} client={client} gm={gm} notify={notify} onFocus={(id) => onSelect(id)} />
        ) : tab === "hr" ? (
          <HrTab snap={snap} client={client} hr={hr} notify={notify} onSelect={onSelect} />
        ) : tab === "team" ? (
          <TeamTab snap={snap} onSelect={onSelect} />
        ) : (
          <div className="stack">
            <button className="primary block" onClick={onNewTask}>
              ＋ مهمة جديدة
            </button>
            {snap.tasks.length === 0 && (
              <p className="empty">مفيش مهام لسه. اضغط «مهمة جديدة» واكتب المطلوب، و{gm?.name ?? "المدير"} هيوزّعه على الفريق.</p>
            )}
            {snap.tasks.map((t) => (
              <div key={t.id}>
                <p className="req">«{t.request}»</p>
                <TaskCard task={t} gmName={gm?.name} onFocus={(id) => onSelect(id)} />
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function GmTab({ snap, client, gm, notify, onFocus }: { snap: OfficeSnapshot; client: OfficeClient; gm?: EmployeeView; notify: Props["notify"]; onFocus: (id: string) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  // No <form> submit: sandboxed widget iframes may block form submission entirely.
  async function submit() {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await client.assign(text);
      setText("");
      notify(`${gm?.name ?? "المدير"} استلم الطلب وبيقرأه دلوقتي`);
    } catch (err) {
      notify((err as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  const history = [...snap.tasks].slice(0, 6).reverse();
  const end = useRef<HTMLDivElement>(null);
  const newest = snap.tasks[0]?.id;
  // Keep the newest request in view when one is added.
  useEffect(() => {
    // Scroll only the panel, never the page (scrollIntoView would also scroll a widget iframe).
    const box = end.current?.closest(".panel__body");
    if (box) box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  }, [newest]);
  return (
    <div className="chat">
      <div className="chat__log">
        <div className="msg msg--gm">
          {gm && <Avatar e={gm} size={28} />}
          <div>
            أهلًا، أنا {gm?.name ?? "المدير"} 👋 اكتبلي المهمة بالتفصيل تحت (الهدف، الجمهور، الأسلوب). هفهمها، وأقسّمها، وأدّي كل جزء للشخص المناسب، وأرجعلك بتقرير.
          </div>
        </div>
        {history.map((t) => (
          <div key={t.id} className="pair">
            <div className="msg msg--me">{t.request}</div>
            <div className="msg msg--gm">
              {gm && <Avatar e={gm} size={28} />}
              <div className="grow">
                <p>
                  {!t.subtasks.length
                    ? "تمام، بقرأ الطلب وبفكّر مين الأنسب لكل جزء…"
                    : `وزّعتها على: ${[...new Set(t.subtasks.map((s) => s.assigneeName))].join("، ")}`}
                </p>
                <TaskCard task={t} gmName={gm?.name} onFocus={onFocus} />
              </div>
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      {!snap.tasks.length && (
        <div className="ideas">
          {IDEAS.map((i) => (
            <button key={i} className="chip-btn" onClick={() => setText(i)}>
              {i}
            </button>
          ))}
        </div>
      )}
      <div className="composer">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`مهمة جديدة لـ ${gm?.name ?? "المدير"}… (Enter للإرسال)`}
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button type="button" className="primary" disabled={busy || !text.trim()} onClick={submit}>
          {busy ? "…" : "ابعت"}
        </button>
      </div>
    </div>
  );
}

function HrTab({ snap, client, hr, notify, onSelect }: { snap: OfficeSnapshot; client: OfficeClient; hr?: EmployeeView; notify: Props["notify"]; onSelect: (id: string) => void }) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [jd, setJd] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; id: string } | null>(null);

  async function submit() {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const r = await client.hire({ name, jobTitle: title, jobDescription: jd });
      setNote({ text: r.note, id: r.employee.id });
      setName("");
      setTitle("");
      setJd("");
      notify(`${r.employee.name} انضم للفريق 🎉`);
    } catch (err) {
      notify((err as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="msg msg--gm">
        {hr && <Avatar e={hr} size={28} />}
        <div>أنا {hr?.name ?? "مديرة الموارد البشرية"}. ابعتلي المسمى الوظيفي والـ Job Description، وأنا هعيّن الشخص المناسب وأجهّزله مكتبه.</div>
      </div>
      <div className="form">
        <label>
          المسمى الوظيفي
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلًا: Graphic Designer" maxLength={80} onKeyDown={(e) => e.key === "Enter" && submit()} />
        </label>
        <label>
          الوصف الوظيفي (Job Description)
          <textarea value={jd} onChange={(e) => setJd(e.target.value)} rows={4} placeholder="المسؤوليات والمهارات المطلوبة…" maxLength={2000} />
        </label>
        <label>
          الاسم <span className="muted">(اختياري)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="هنختار اسم لو سبته فاضي" maxLength={30} />
        </label>
        <div className="ideas">
          {JOB_TEMPLATES.map((j) => (
            <button
              type="button"
              key={j.t}
              className="chip-btn"
              onClick={() => {
                setTitle(j.t);
                setJd(j.d);
              }}
            >
              {j.t}
            </button>
          ))}
        </div>
        <button type="button" className="primary" disabled={busy || !title.trim()} onClick={submit}>
          {busy ? "بيتم التعيين…" : "عيّن الموظف"}
        </button>
      </div>
      {note && (
        <div className="note">
          <Markdown text={note.text} />
          <button className="ghost small" onClick={() => onSelect(note.id)}>
            شوفه في المكتب
          </button>
        </div>
      )}
      <p className="muted small">عدد الفريق: {snap.employees.length} من 20</p>
    </div>
  );
}

function TeamTab({ snap, onSelect }: { snap: OfficeSnapshot; onSelect: (id: string) => void }) {
  return (
    <ul className="team">
      {snap.employees.map((e) => (
        <li key={e.id}>
          <button onClick={() => onSelect(e.id)}>
            <Avatar e={e} />
            <span className="team__main">
              <b>{e.name}</b>
              <span className="muted">{e.title}</span>
              {e.doing && <span className="team__doing">{e.doing.replace(/ لـ «.*»$/, "")}</span>}
            </span>
            <span className={`act act--${e.activity}`}>{ACT[e.activity]}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function EmployeeCard({ e, snap, client, onClose, notify }: { e: EmployeeView; snap: OfficeSnapshot; client: OfficeClient; onClose: () => void; notify: Props["notify"] }) {
  const work = snap.tasks.flatMap((t) => t.subtasks.filter((s) => s.assigneeId === e.id).map((s) => ({ ...s, request: t.request })));
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const protectedRole = e.roleId === "general_manager" || e.roleId === "hr_manager";

  return (
    <div className="stack">
      <button className="ghost small back" onClick={onClose}>
        → رجوع
      </button>
      <div className="profile">
        <Avatar e={e} size={52} />
        <div>
          <h2>{e.name}</h2>
          <p className="muted">
            {e.title} · {e.roleTitle}
          </p>
          <span className={`act act--${e.activity}`}>{ACT[e.activity]}</span>
        </div>
      </div>
      {e.doing && (
        <div className="note">
          <b>بيشتغل دلوقتي على:</b> {e.doing}
          {e.doingProgress !== undefined && (
            <div className="bar">
              <i style={{ width: `${Math.round(e.doingProgress * 100)}%` }} />
            </div>
          )}
        </div>
      )}
      {e.jobDescription && (
        <section>
          <h4>الوصف الوظيفي</h4>
          <p className="jd">{e.jobDescription}</p>
        </section>
      )}
      <section>
        <h4>الشغل ({work.length})</h4>
        {!work.length && <p className="muted small">لسه ماستلمش مهام.</p>}
        <ul className="subs">
          {work.map((s) => (
            <li key={s.id} className={`sub sub--${s.status}`}>
              <button className="sub__row" onClick={() => setOpen(open === s.id ? null : s.id)} disabled={!s.deliverable}>
                <span className="sub__title">{s.title.replace(/ لـ «.*»$/, "")}</span>
                <span className={`sub__st sub__st--${s.status}`}>{s.status === "done" ? "اقرأ" : s.status === "working" ? `${Math.round(s.progress * 100)}%` : "في الانتظار"}</span>
              </button>
              {open === s.id && s.deliverable && (
                <div className="deliv">
                  <Markdown text={s.deliverable} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
      {!protectedRole &&
        (confirm ? (
          <div className="confirm">
            <span>متأكد إنك عايز تستغنى عن {e.name}؟</span>
            <button
              className="danger small"
              onClick={async () => {
                try {
                  notify(await client.fire(e.id));
                  onClose();
                } catch (err) {
                  notify((err as Error).message, "err");
                  setConfirm(false);
                }
              }}
            >
              أيوه
            </button>
            <button className="ghost small" onClick={() => setConfirm(false)}>
              لأ
            </button>
          </div>
        ) : (
          <button className="ghost small danger-text" onClick={() => setConfirm(true)}>
            الاستغناء عن الموظف
          </button>
        ))}
    </div>
  );
}
