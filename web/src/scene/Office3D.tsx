import { Html, OrbitControls, OrthographicCamera, PerspectiveCamera } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import React, { useMemo, useRef } from "react";
import {
  DESKS,
  ENTRANCE,
  GM_DESK,
  HR_DESK,
  LOUNGE_SPOTS,
  MEETING_SEATS,
  ZONES,
  type Vec2,
} from "../../../shared/layout";
import type { EmployeeView } from "../../../shared/types";
import { Character, type Spot } from "./Character";
import { Furniture } from "./Furniture";

export type ViewMode = "3d" | "top";

function deskOf(e: EmployeeView) {
  if (e.roleId === "general_manager") return GM_DESK;
  if (e.roleId === "hr_manager") return HR_DESK;
  return DESKS[e.desk] ?? DESKS[0];
}

/** Extra standing spots for when the meeting table or the lounge is full. */
const MEETING_STANDING: Spot[] = Array.from({ length: 12 }, (_, i) => ({
  x: 12.2 + (i % 4) * 1.3,
  z: 8.6 - Math.floor(i / 4) * 0.9 + (i % 2) * 0.2,
  face: Math.PI,
  sit: false,
  pose: "rest" as const,
}));
const LOUNGE_STANDING: Spot[] = Array.from({ length: 12 }, (_, i) => ({
  x: -16.8 + (i % 4) * 1.2,
  z: -0.8 - Math.floor(i / 4) * 0.9,
  face: Math.PI / 2,
  sit: false,
  pose: "rest" as const,
}));

/**
 * Seats stay with a person while they keep the same activity, so someone joining
 * or leaving doesn't make everyone else shuffle across the room.
 */
class SeatBook {
  private seats = new Map<string, number>();
  /** `head` (the GM) always gets seat 0; everyone else keeps their seat or takes the first free one. */
  assign(ids: string[], head?: string): Map<string, number> {
    const present = new Set(ids);
    for (const id of [...this.seats.keys()]) if (!present.has(id)) this.seats.delete(id);
    if (head && present.has(head) && this.seats.get(head) !== 0) {
      for (const [id, seat] of this.seats) if (seat === 0) this.seats.delete(id);
      this.seats.set(head, 0);
    }
    const taken = new Set(this.seats.values());
    for (const id of ids) {
      if (this.seats.has(id)) continue;
      let i = head ? 1 : 0;
      while (taken.has(i)) i++;
      this.seats.set(id, i);
      taken.add(i);
    }
    return this.seats;
  }
}

function computeTargets(employees: EmployeeView[], meetingBook: SeatBook, loungeBook: SeatBook): Map<string, Spot> {
  const out = new Map<string, Spot>();
  const gm = employees.find((e) => e.roleId === "general_manager");
  const meeting = employees.filter((e) => e.activity === "meeting").map((e) => e.id);
  const mSeats = meetingBook.assign(meeting, gm?.id);
  for (const id of meeting) {
    const i = mSeats.get(id) ?? 0;
    const seat = MEETING_SEATS[i];
    if (seat) out.set(id, { ...seat, sit: true, pose: id === gm?.id ? "talk" : "rest" });
    else out.set(id, MEETING_STANDING[(i - MEETING_SEATS.length) % MEETING_STANDING.length]);
  }
  const lounging = employees.filter((e) => e.activity === "break").map((e) => e.id);
  const lSeats = loungeBook.assign(lounging);
  for (const id of lounging) {
    const i = lSeats.get(id) ?? 0;
    const spot = LOUNGE_SPOTS[i];
    if (spot) out.set(id, { ...spot, sit: i >= 2 && i <= 4, pose: i < 2 ? "play" : "rest" });
    else out.set(id, LOUNGE_STANDING[(i - LOUNGE_SPOTS.length) % LOUNGE_STANDING.length]);
  }
  for (const e of employees) {
    if (out.has(e.id)) continue;
    const d = deskOf(e);
    out.set(e.id, { x: d.seat.x, z: d.seat.z, face: Math.PI, sit: true, pose: e.activity === "working" ? "type" : "rest" });
  }
  return out;
}

function Cameras({ mode }: { mode: ViewMode }) {
  const get = useThree((s) => s.get);
  // Fit the floor once per view mode; resizes (panel toggle, rotation) keep the user's orbit.
  const { k, fit } = useMemo(() => {
    const { width, height } = get().size;
    const aspect = width / Math.max(height, 1);
    // Pull the camera back on narrow screens so the whole 36 m floor stays in frame.
    return { k: Math.max(1, 1.62 / aspect), fit: Math.min(width / 39, height / 25) };
  }, [mode, get]);
  return mode === "top" ? (
    <>
      <OrthographicCamera makeDefault position={[0, 60, 0.01]} zoom={fit} near={0.1} far={200} />
      <OrbitControls target={[0, 0, 0]} enableRotate={false} minZoom={10} maxZoom={80} screenSpacePanning />
    </>
  ) : (
    <>
      <PerspectiveCamera makeDefault position={[0, 22 * k, 23 * k]} fov={40} />
      <OrbitControls target={[0, 0, 0]} maxPolarAngle={1.32} minDistance={6} maxDistance={80} enableDamping />
    </>
  );
}

interface Props {
  employees: EmployeeView[];
  mode: ViewMode;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function Office3D({ employees, mode, selectedId, onSelect }: Props) {
  const books = useRef({ meeting: new SeatBook(), lounge: new SeatBook() });
  const targets = useMemo(() => computeTargets(employees, books.current.meeting, books.current.lounge), [employees]);
  const layer = useRef<HTMLDivElement>(null!);
  // People present at first render start in place; new hires walk in from the entrance.
  const known = useRef<Set<string> | null>(null);
  const starts = useRef(new Map<string, Vec2>());
  if (known.current === null) {
    known.current = new Set(employees.map((e) => e.id));
    for (const e of employees) starts.current.set(e.id, targets.get(e.id)!);
  }
  for (const e of employees) {
    if (!starts.current.has(e.id)) starts.current.set(e.id, ENTRANCE);
  }

  const activeDesks = employees
    .filter((e) => e.activity === "working" && e.roleId !== "general_manager" && e.roleId !== "hr_manager")
    .map((e) => e.desk)
    .sort((a, b) => a - b)
    .join(",");
  const gmActive = employees.some((e) => e.roleId === "general_manager" && e.activity === "working");
  const hrActive = employees.some((e) => e.roleId === "hr_manager" && e.activity === "working");

  return (
    <div className="scene" ref={layer}>
    <Canvas shadows dpr={[1, 2]} onPointerMissed={() => onSelect(null)} gl={{ antialias: true }}>
      <color attach="background" args={["#f3efe8"]} />
      <fog attach="fog" args={["#f3efe8", 45, 90]} />
      <Cameras mode={mode} />
      <hemisphereLight args={["#ffffff", "#c8b89c", 0.9]} />
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[-8, 22, 10]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-bias={-0.0004}
      />
      <Furniture activeDesks={activeDesks} gmActive={gmActive} hrActive={hrActive} />

      {mode === "top" && <AreaLabels portal={layer} />}

      {employees.map((e) => (
        <Character
          key={e.id}
          employee={e}
          target={targets.get(e.id)!}
          start={starts.current.get(e.id)!}
          selected={e.id === selectedId}
          showLabel
          onSelect={onSelect}
          portal={layer}
        />
      ))}
    </Canvas>
    </div>
  );
}

function AreaLabels({ portal }: { portal: React.RefObject<HTMLElement> }) {
  const labels: { p: [number, number, number]; t: string }[] = [
    ...ZONES.map((z) => ({ p: [z.cx, 0.1, 2.9] as [number, number, number], t: z.label })),
    { p: [14.2, 0.1, -2.8], t: "مكتب المدير" },
    { p: [14.2, 0.1, 8.9], t: "غرفة الاجتماعات" },
    { p: [-14.6, 0.1, -4.2], t: "الموارد البشرية" },
    { p: [-14.6, 0.1, 10.0], t: "منطقة الاستراحة" },
  ];
  return (
    <>
      {labels.map((l) => (
        <Html key={l.t} portal={portal} position={l.p} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
          <div className="area-label">{l.t}</div>
        </Html>
      ))}
    </>
  );
}
