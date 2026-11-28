import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/** Wrap mutations so the office refreshes right after they succeed. */
function withRefresh(c: OfficeClient, refresh: () => void): OfficeClient {
  const after =
    <A extends unknown[], R>(fn: (...a: A) => Promise<R>) =>
    async (...a: A) => {
      const r = await fn(...a);
      refresh();
      return r;
    };
  return {
    ...c,
    hire: after(c.hire),
    assign: after(c.assign),
    fire: after(c.fire),
    finishWithTemplates: after(c.finishWithTemplates),
    ...(c.reset ? { reset: after(c.reset) } : {}),
  };
}

const isMobile = () => typeof window !== "undefined" && window.matchMedia("(max-width: 820px)").matches;

export function App({ client: rawClient, embedded = false }: { client: OfficeClient; embedded?: boolean }) {
  const [snap, setSnap] = useState<OfficeSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>("3d");
  const [tab, setTab] = useState<Tab>("gm");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [panelOpen, setPanelOpen] = useState(true);
  const [newTask, setNewTask] = useState(false);
  const [fullscreen, setFullscreen] = useState(() => rawClient.isFullscreen?.() ?? false);
  const doneSeen = useRef<Set<string> | null>(null);
  const refreshRef = useRef<() => void>(() => {});

  const notify = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const client = useMemo(() => withRefresh(rawClient, () => refreshRef.current()), [rawClient]);

  // Poll the office. One loop only: a poll never overlaps another, and replies
  // older than the latest applied one are dropped.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    let again = false;
    let seq = 0;
    let applied = 0;
    let fails = 0;
    let last: OfficeSnapshot | null = null;

    const schedule = () => {
      clearTimeout(timer);
      const busy = last?.tasks.some((t) => t.status !== "done" && t.status !== "waiting");
      const base = document.hidden ? 15_000 : busy ? 1_000 : 4_000;
      // Back off while the server is unreachable (up to 30 s).
      const delay = fails ? Math.min(30_000, base * 2 ** fails) : base;
      timer = setTimeout(tick, delay);
    };

    const tick = async () => {
      if (!alive) return;
      if (inFlight) {
        again = true; // run once more as soon as the current poll returns
        return;
      }
      inFlight = true;
      clearTimeout(timer);
      const mine = ++seq;
      try {
        const s = await rawClient.getOffice();
        if (!alive || mine < applied) return;
        applied = mine;
        last = s;
        fails = 0;
        setSnap(s);
        setError(null);
        // Announce newly finished tasks (but not ones already done on first load).
        const done = s.tasks.filter((t) => t.status === "done").map((t) => t.id);
        if (doneSeen.current)
          for (const id of done)
            if (!doneSeen.current.has(id)) notify("المدير خلّص مهمة ✅ — التقرير جاهز في «المهام»");
        doneSeen.current = new Set(done);
      } catch (e) {
        fails++;
        if (alive) setError((e as Error).message);
      } finally {
        inFlight = false;
        if (alive) {
          if (again) {
            again = false;
            tick();
          } else schedule();
        }
      }
    };

    refreshRef.current = () => tick();
    tick();
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearTimeout(timer);
      refreshRef.current = () => {};
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [rawClient, notify]);

  // Follow display-mode changes the host makes on its own (e.g. ChatGPT's close button).
  useEffect(() => rawClient.onDisplayModeChange?.((m) => setFullscreen(m === "fullscreen")), [rawClient]);

  // On phones the panel can't be toggled from the top bar, so keep it open there.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 820px)");
    const sync = () => mq.matches && setPanelOpen(true);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const onSelect = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) setPanelOpen(true);
  }, []);
  const closeDialog = useCallback(() => setNewTask(false), []);

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
    <div className={`app ${embedded ? "app--embedded" : ""} ${embedded && fullscreen ? "app--fs" : ""} ${panelOpen || isMobile() ? "" : "app--nopanel"}`}>
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
            <button className={mode === "3d" ? "on" : ""} aria-pressed={mode === "3d"} onClick={() => setMode("3d")}>
              3D
            </button>
            <button className={mode === "top" ? "on" : ""} aria-pressed={mode === "top"} onClick={() => setMode("top")}>
              من فوق
            </button>
          </div>
          {client.toggleFullscreen && (
            <button
              className="ghost"
              onClick={async () => {
                try {
                  await client.toggleFullscreen!();
                  setFullscreen(client.isFullscreen?.() ?? false);
                } catch (e) {
                  notify((e as Error).message || "مش قادر أغيّر طريقة العرض", "err");
                }
              }}
            >
              {fullscreen ? "تصغير" : "ملء الشاشة"}
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
                try {
                  await client.reset!();
                  setSelectedId(null);
                  notify("رجّعنا المكتب لأوله");
                } catch (e) {
                  notify((e as Error).message, "err");
                }
              }}
            >
              إعادة ضبط
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="offline" role="status">
          الاتصال بالمكتب اتقطع، بنحاول تاني… (اللي ظاهر قدامك ممكن يكون قديم)
        </div>
      )}

      <main className="stage">
        <Office3D employees={snap.employees} mode={mode} selectedId={selectedId} onSelect={onSelect} />
        <div className="legend">
          <span>
            <i className="dot dot--working" />
            بيشتغل
          </span>
          <span>
            <i className="dot dot--meeting" />
            اجتماع
          </span>
          <span>
            <i className="dot dot--break" />
            استراحة
          </span>
          <span className="muted">اسحب للف · عجلة الماوس للتقريب · اضغط على أي موظف</span>
        </div>
      </main>

      {(panelOpen || isMobile()) && (
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
          onClose={closeDialog}
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
