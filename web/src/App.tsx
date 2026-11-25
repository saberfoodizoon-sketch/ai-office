import { useCallback, useEffect, useRef, useState } from "react";
import type { OfficeSnapshot } from "../../shared/types";
import type { OfficeClient } from "./client";
import { Office3D, type ViewMode } from "./scene/Office3D";
import { NewTaskDialog } from "./ui/NewTaskDialog";
import { Panel, type Tab } from "./ui/Panel";

interface Toast {
  id: number;
  msg: string;
  kind: "ok" | "err";
}

export function App({ client, embedded = false }: { client: OfficeClient; embedded?: boolean }) {
  const [snap, setSnap] = useState<OfficeSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>("3d");
  const [tab, setTab] = useState<Tab>("gm");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [panelOpen, setPanelOpen] = useState(true);
  const [newTask, setNewTask] = useState(false);
  const [, force] = useState(0);
  const doneSeen = useRef<Set<string> | null>(null);
  const latest = useRef<OfficeSnapshot | null>(null);

  const notify = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  // Poll the office; progress is derived from server time so 1 s is smooth enough.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const s = await client.getOffice();
        if (!alive) return;
        setSnap(s);
        latest.current = s;
        setError(null);
        // Announce newly finished tasks (but not ones already done on first load).
        const done = s.tasks.filter((t) => t.status === "done").map((t) => t.id);
        if (doneSeen.current) {
          for (const id of done)
            if (!doneSeen.current.has(id)) notify("المدير خلّص مهمة ✅ — التقرير جاهز في «المهام»");
        }
        doneSeen.current = new Set(done);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
      // Fast while work is happening, slower when idle, slowest in a background tab.
      const busy = latest.current?.tasks.some((t) => t.status !== "done" && t.status !== "waiting");
      const delay = document.hidden ? 15_000 : busy ? 1_000 : 4_000;
      if (alive) timer = setTimeout(tick, delay);
    };
    tick();
    // Refresh right away when the tab comes back.
    const onVisible = () => {
      if (!document.hidden) {
        clearTimeout(timer);
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [client, notify]);

  if (!snap)
    return (
      <div className={`app loading ${embedded ? "app--embedded" : ""}`}>
        <div className="spinner" />
        <p>{error ? `مش قادر أوصل للمكتب: ${error}` : "بنفتح المكتب…"}</p>
      </div>
    );

  const selected = snap.employees.find((e) => e.id === selectedId) ?? null;
  const working = snap.employees.filter((e) => e.activity === "working").length;

  return (
    <div className={`app ${embedded ? "app--embedded" : ""} ${embedded && client.isFullscreen?.() ? "app--fs" : ""} ${panelOpen ? "" : "app--nopanel"}`}>
      <header className="topbar">
        <div className="brand">
          <span className="logo">◆</span>
          <div>
            <h1>مكتبي الذكي</h1>
            <p>
              {snap.employees.length} موظف · {working} شغالين دلوقتي
            </p>
          </div>
        </div>
        <div className="actions">
          <button className="primary new-task" onClick={() => setNewTask(true)}>
            ＋ مهمة جديدة
          </button>
          <div className="seg" role="group" aria-label="طريقة العرض">
            <button className={mode === "3d" ? "on" : ""} onClick={() => setMode("3d")}>
              3D
            </button>
            <button className={mode === "top" ? "on" : ""} onClick={() => setMode("top")}>
              من فوق
            </button>
          </div>
          {client.toggleFullscreen && (
            <button
              className="ghost"
              onClick={async () => {
                await client.toggleFullscreen!();
                force((n) => n + 1);
              }}
            >
              {client.isFullscreen?.() ? "تصغير" : "ملء الشاشة"}
            </button>
          )}
          <button className="ghost panel-toggle" onClick={() => setPanelOpen((o) => !o)}>
            {panelOpen ? "إخفاء اللوحة" : "اللوحة"}
          </button>
          {client.reset && (
            <button
              className="ghost reset-btn"
              title="يرجّع المكتب لأوله"
              onClick={async () => {
                if (!confirm("ترجّع المكتب لحالته الأولى؟ هتتمسح المهام والموظفين الجداد.")) return;
                await client.reset!();
                setSelectedId(null);
                notify("رجّعنا المكتب لأوله");
              }}
            >
              إعادة ضبط
            </button>
          )}
        </div>
      </header>

      <main className="stage">
        <Office3D
          employees={snap.employees}
          mode={mode}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            if (id) setPanelOpen(true);
          }}
        />
        <div className="legend">
          <span><i className="dot dot--working" />بيشتغل</span>
          <span><i className="dot dot--meeting" />اجتماع</span>
          <span><i className="dot dot--break" />استراحة</span>
          <span className="muted">اسحب للف · عجلة الماوس للتقريب · اضغط على أي موظف</span>
        </div>
      </main>

      {panelOpen && (
        <Panel
          snap={snap}
          client={client}
          tab={tab}
          setTab={(t) => {
            setSelectedId(null);
            setTab(t);
          }}
          selected={selected}
          onSelect={(id) => setSelectedId(id)}
          notify={notify}
          onNewTask={() => setNewTask(true)}
        />
      )}

      {newTask && (
        <NewTaskDialog
          client={client}
          gm={snap.employees.find((e) => e.roleId === "general_manager")}
          team={snap.employees}
          onClose={() => setNewTask(false)}
          onCreated={(msg) => {
            notify(msg);
            setSelectedId(null);
            setTab("gm");
            setPanelOpen(true);
          }}
          onError={(msg) => notify(msg, "err")}
        />
      )}

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.kind}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
