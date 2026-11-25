import { useEffect, useRef, useState } from "react";
import type { EmployeeView } from "../../../shared/types";
import type { OfficeClient } from "../client";

const IDEAS = [
  "حملة إطلاق على إنستجرام لكافيه جديد في المعادي، الجمهور شباب 20–30",
  "اكتب 3 بوستات لعرض الجمعة البيضاء على متجر ملابس أونلاين",
  "خطة منتج لتطبيق حجز ملاعب كورة في القاهرة",
  "هوية بصرية لبراند عصاير طبيعية اسمه «فريش»",
];

interface Props {
  client: OfficeClient;
  gm?: EmployeeView;
  team: EmployeeView[];
  onClose: () => void;
  onCreated: (msg: string) => void;
  onError: (msg: string) => void;
}

/** The main way to give the GM a task: a focused dialog with guidance. */
export function NewTaskDialog({ client, gm, team, onClose, onCreated, onError }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const workers = team.filter((e) => e.roleId !== "general_manager" && e.roleId !== "hr_manager");

  useEffect(() => {
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit() {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await client.assign(text);
      onCreated(`${gm?.name ?? "المدير"} استلم المهمة وبيقرأها دلوقتي`);
      onClose();
    } catch (e) {
      onError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="nt-title" onClick={(e) => e.stopPropagation()}>
        <header className="dialog__head">
          <h2 id="nt-title">مهمة جديدة لـ {gm?.name ?? "المدير"}</h2>
          <button className="ghost small" onClick={onClose} aria-label="إغلاق">
            ✕
          </button>
        </header>
        <ol className="steps">
          <li>اكتب المطلوب بالتفصيل: الهدف، الجمهور، الأسلوب، وأي قيود.</li>
          <li>{gm?.name ?? "المدير"} هيكتب فهمه للمهمة ويقسّمها ويختار لكل جزء الشخص المناسب.</li>
          <li>كل موظف بيسلّم شغله، وفي الآخر المدير بيراجع ويكتبلك تقرير.</li>
        </ol>
        <textarea
          ref={box}
          className="dialog__input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          maxLength={1000}
          placeholder="مثلًا: عايز حملة إطلاق على إنستجرام لكافيه جديد في المعادي، الجمهور شباب، والأسلوب شبابي وخفيف…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
        />
        <div className="ideas">
          {IDEAS.map((i) => (
            <button key={i} className="chip-btn" onClick={() => setText(i)}>
              {i}
            </button>
          ))}
        </div>
        <p className="muted small">
          الفريق المتاح: {workers.map((w) => `${w.name} (${w.title})`).join("، ") || "مفيش موظفين — عيّن من تبويب «التعيين»"}
        </p>
        <footer className="dialog__foot">
          <button className="ghost" onClick={onClose}>
            إلغاء
          </button>
          <button className="primary" disabled={busy || !text.trim() || !workers.length} onClick={submit}>
            {busy ? "بيتبعت…" : "ابعت للمدير"}
          </button>
        </footer>
      </div>
    </div>
  );
}
