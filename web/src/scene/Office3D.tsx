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

/** Decide where everyone should be, given their current activity. */
function computeTargets(employees: EmployeeView[]): Map<string, Spot> {
  const out = new Map<string, Spot>();
  // GM always takes the head of the table; others fill remaining seats.
  const meeting = employees
    .filter((e) => e.activity === "meeting")
    .sort((a, b) => (a.roleId === "general_manager" ? -1 : b.roleId === "general_manager" ? 1 : a.desk - b.desk));
  meeting.forEach((e, i) => {
    const s = MEETING_SEATS[i];
    if (s) out.set(e.id, { ...s, sit: true, pose: i === 0 ? "talk" : "rest" });
  });
  const lounging = employees.filter((e) => e.activity === "break").sort((a, b) => a.desk - b.desk);
  lounging.forEach((e, i) => {
    const s = LOUNGE_SPOTS[i];
    if (s) out.set(e.id, { ...s, sit: i >= 2 && i <= 4, pose: i < 2 ? "play" : "rest" });
  });
  for (const e of employees) {
    if (out.has(e.id)) continue;
    const d = deskOf(e);
    out.set(e.id, { x: d.seat.x, z: d.seat.z, face: Math.PI, sit: true, pose: e.activity === "working" ? "type" : "rest" });
  }
  return out;
}

function Cameras({ mode }: { mode: ViewMode }) {
  const { width, height } = useThree((s) => s.size);
  const aspect = width / Math.max(height, 1);
  // Pull the camera back on narrow screens so the whole 36 m floor stays in frame.
  const k = Math.max(1, 1.62 / aspect);
  const fit = Math.min(width / 39, height / 25);
  return mode === "top" ? (
    <>
      <OrthographicCamera makeDefault position={[0, 60, 0.01]} zoom={fit} near={0.1} far={200} />
      <OrbitControls target={[0, 0, 0]} enableRotate={false} minZoom={10} maxZoom={80} screenSpacePanning />
    </>
  ) : (
    <>
      <PerspectiveCamera makeDefault position={[0, 22 * k, 23 * k]} fov={40} />
      <OrbitControls
        target={[0, 0, 0]}
        maxPolarAngle={1.32}
        minDistance={6}
        maxDistance={80}
        enableDamping
      />
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
  const targets = useMemo(() => computeTargets(employees), [employees]);
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
          onSelect={(id) => onSelect(id)}
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
