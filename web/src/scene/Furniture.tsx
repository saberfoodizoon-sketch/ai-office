import { memo } from "react";
import {
  DESKS,
  FLOOR,
  GM_DESK,
  GM_OFFICE,
  HR_DESK,
  LOUNGE,
  MEETING,
  MEETING_SEATS,
  ZONES,
  type Desk,
} from "../../../shared/layout";

const WALL_H = 3.4;

function Box({ p, s, c, cast = true, ...m }: { p: [number, number, number]; s: [number, number, number]; c: string; cast?: boolean; roughness?: number; metalness?: number; emissive?: string; emissiveIntensity?: number }) {
  return (
    <mesh position={p} castShadow={cast} receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} roughness={m.roughness ?? 0.8} metalness={m.metalness ?? 0} emissive={m.emissive ?? "#000"} emissiveIntensity={m.emissiveIntensity ?? 0} />
    </mesh>
  );
}

export function Chair({ x, z, rot = 0, color = "#2a2d34" }: { x: number; z: number; rot?: number; color?: string }) {
  return (
    <group position={[x, 0, z]} rotation-y={rot}>
      <Box p={[0, 0.45, 0]} s={[0.5, 0.08, 0.5]} c={color} />
      <Box p={[0, 0.8, 0.24]} s={[0.5, 0.62, 0.07]} c={color} />
      <Box p={[0, 0.22, 0]} s={[0.06, 0.44, 0.06]} c="#888" metalness={0.6} />
      <Box p={[0, 0.03, 0]} s={[0.55, 0.04, 0.08]} c="#555" />
      <Box p={[0, 0.03, 0]} s={[0.08, 0.04, 0.55]} c="#555" />
    </group>
  );
}

function Plant({ x, z, s = 1 }: { x: number; z: number; s?: number }) {
  return (
    <group position={[x, 0, z]} scale={s}>
      <mesh position-y={0.25} castShadow>
        <cylinderGeometry args={[0.22, 0.17, 0.5, 16]} />
        <meshStandardMaterial color="#e9e4dc" />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} position={[Math.cos(i * 1.3) * 0.15, 0.75 + i * 0.12, Math.sin(i * 1.3) * 0.15]} castShadow>
          <sphereGeometry args={[0.26 - i * 0.02, 10, 8]} />
          <meshStandardMaterial color={i % 2 ? "#4f8a3c" : "#3f7a30"} />
        </mesh>
      ))}
    </group>
  );
}

function WorkDesk({ d, active, wide = false, wood = false }: { d: Desk; active: boolean; wide?: boolean; wood?: boolean }) {
  const w = wide ? 2.6 : 2.0;
  return (
    <group position={[d.x, 0, d.z]}>
      <Box p={[0, 0.74, 0]} s={[w, 0.06, 0.95]} c={wood ? "#6b4a2f" : "#f4f4f2"} roughness={0.5} />
      <Box p={[-w / 2 + 0.06, 0.37, 0]} s={[0.06, 0.74, 0.85]} c="#3a3a3a" />
      <Box p={[w / 2 - 0.06, 0.37, 0]} s={[0.06, 0.74, 0.85]} c="#3a3a3a" />
      {/* monitor faces the seat (+z) */}
      <Box p={[0, 0.9, -0.18]} s={[0.08, 0.26, 0.08]} c="#555" />
      <Box p={[0, 1.15, -0.2]} s={[0.78, 0.46, 0.04]} c="#1d1d1f" />
      <mesh position={[0, 1.15, -0.177]}>
        <planeGeometry args={[0.72, 0.4]} />
        <meshStandardMaterial color={active ? "#7fd4ff" : "#2a3340"} emissive={active ? "#3aa8e8" : "#000"} emissiveIntensity={active ? 0.9 : 0} />
      </mesh>
      <Box p={[0, 0.78, 0.18]} s={[0.5, 0.02, 0.16]} c="#d8d8d8" />
      {/* lamp */}
      <group position={[w / 2 - 0.3, 0.77, -0.25]}>
        <Box p={[0, 0.02, 0]} s={[0.18, 0.04, 0.18]} c="#ef6c2f" />
        <mesh position={[0.05, 0.28, 0.05]} rotation-z={-0.35}>
          <cylinderGeometry args={[0.02, 0.02, 0.55]} />
          <meshStandardMaterial color="#ef6c2f" />
        </mesh>
        <mesh position={[0.17, 0.52, 0.08]} rotation-z={0.9}>
          <coneGeometry args={[0.1, 0.16, 16, 1, true]} />
          <meshStandardMaterial color="#ef6c2f" side={2} />
        </mesh>
      </group>
    </group>
  );
}

function GlassRoom({ r, gap }: { r: { minX: number; maxX: number; minZ: number; maxZ: number }; gap: [number, number] }) {
  const cx = (r.minX + r.maxX) / 2;
  const cz = (r.minZ + r.maxZ) / 2;
  const w = r.maxX - r.minX;
  const d = r.maxZ - r.minZ;
  const glass = (
    <meshPhysicalMaterial color="#cfe8f5" transparent opacity={0.18} roughness={0.05} metalness={0.1} depthWrite={false} />
  );
  // Left wall (facing the corridor) has a doorway between gap[0] and gap[1]; front wall is solid glass.
  const panes: { p: [number, number, number]; s: [number, number, number] }[] = [
    { p: [cx, WALL_H / 2, r.maxZ], s: [w, WALL_H, 0.05] },
  ];
  if (gap[0] > r.minZ) panes.push({ p: [r.minX, WALL_H / 2, (r.minZ + gap[0]) / 2], s: [0.05, WALL_H, gap[0] - r.minZ] });
  if (gap[1] < r.maxZ) panes.push({ p: [r.minX, WALL_H / 2, (gap[1] + r.maxZ) / 2], s: [0.05, WALL_H, r.maxZ - gap[1]] });
  return (
    <group>
      {panes.map((g, i) => (
        <group key={i}>
          <mesh position={g.p}>
            <boxGeometry args={g.s} />
            {glass}
          </mesh>
          {/* frame */}
          <mesh position={[g.p[0], 0.04, g.p[2]]}>
            <boxGeometry args={[Math.max(g.s[0], 0.06), 0.08, Math.max(g.s[2], 0.06)]} />
            <meshStandardMaterial color="#8b939c" />
          </mesh>
        </group>
      ))}
      <mesh rotation-x={-Math.PI / 2} position={[cx, 0.011, cz]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#cbb79a" />
      </mesh>
    </group>
  );
}

function Windows() {
  const n = 7;
  const span = 30;
  return (
    <group position={[0, 0, FLOOR.minZ]}>
      <Box p={[0, WALL_H / 2, -0.1]} s={[FLOOR.maxX - FLOOR.minX, WALL_H, 0.2]} c="#eeebe6" cast={false} />
      {Array.from({ length: n }, (_, i) => {
        const x = -span / 2 + (span / (n - 1)) * i;
        return (
          <group key={i} position={[x, 1.75, 0.02]}>
            <mesh>
              <planeGeometry args={[3.4, 2.5]} />
              <meshStandardMaterial color="#bfe3ff" emissive="#9fd3ff" emissiveIntensity={0.55} />
            </mesh>
            {[-1.7, 0, 1.7].map((dx) => (
              <Box key={dx} p={[dx, 0, 0.03]} s={[0.07, 2.56, 0.05]} c="#222" cast={false} />
            ))}
            {[-1.25, 0.35, 1.25].map((dy) => (
              <Box key={dy} p={[0, dy, 0.03]} s={[3.45, 0.07, 0.05]} c="#222" cast={false} />
            ))}
          </group>
        );
      })}
    </group>
  );
}

function Lounge() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[(LOUNGE.minX + LOUNGE.maxX) / 2, 0.012, (LOUNGE.minZ + LOUNGE.maxZ) / 2]} receiveShadow>
        <planeGeometry args={[LOUNGE.maxX - LOUNGE.minX, LOUNGE.maxZ - LOUNGE.minZ]} />
        <meshStandardMaterial color="#e7d9c3" />
      </mesh>
      {/* ping-pong table */}
      <group position={[-15.6, 0, 7]}>
        <Box p={[0, 0.76, 0]} s={[1.5, 0.05, 2.7]} c="#1f6e4a" roughness={0.4} />
        <Box p={[0, 0.76, 0]} s={[0.03, 0.055, 2.7]} c="#fff" cast={false} />
        <Box p={[0, 0.86, 0]} s={[1.6, 0.15, 0.02]} c="#e8e8e8" />
        {[[-0.6, -1.1], [0.6, -1.1], [-0.6, 1.1], [0.6, 1.1]].map(([x, z]) => (
          <Box key={`${x}${z}`} p={[x, 0.37, z]} s={[0.06, 0.74, 0.06]} c="#333" />
        ))}
      </group>
      {/* sofa facing -x */}
      <group position={[-12.4, 0, 1.2]}>
        <Box p={[0, 0.25, 0]} s={[0.9, 0.5, 2.6]} c="#6d7f99" />
        <Box p={[0.35, 0.65, 0]} s={[0.25, 0.7, 2.6]} c="#5f718b" />
        <Box p={[0, 0.5, -1.35]} s={[0.9, 0.4, 0.2]} c="#5f718b" />
        <Box p={[0, 0.5, 1.35]} s={[0.9, 0.4, 0.2]} c="#5f718b" />
      </group>
      <Box p={[-14.6, 0.22, 1.2]} s={[1.0, 0.44, 1.4]} c="#a87a4d" />
      {/* bean bags */}
      {[[-16.9, 0.4, "#e2725b"], [-17.0, 2.4, "#f2c14e"]].map(([x, z, c]) => (
        <mesh key={String(c)} position={[x as number, 0.28, z as number]} scale={[1, 0.6, 1]} castShadow>
          <sphereGeometry args={[0.5, 16, 12]} />
          <meshStandardMaterial color={c as string} />
        </mesh>
      ))}
      {/* coffee counter */}
      <group position={[-17.2, 0, -1.2]}>
        <Box p={[0, 0.5, 0]} s={[0.6, 1.0, 1.8]} c="#3b3b3b" />
        <Box p={[0, 1.2, 0.3]} s={[0.4, 0.4, 0.35]} c="#c9c9c9" metalness={0.5} />
      </group>
      <Plant x={-11.9} z={9.6} s={1.2} />
      <Plant x={-17.2} z={9.8} s={1.1} />
    </group>
  );
}

function MeetingRoom() {
  const t = MEETING.table;
  return (
    <group>
      <GlassRoom r={MEETING} gap={[1.6, 8.0]} />
      <Box p={[t.x, 0.74, t.z]} s={[1.7, 0.07, 4.6]} c="#5a3d28" roughness={0.4} />
      <Box p={[t.x, 0.37, t.z]} s={[0.25, 0.74, 3.2]} c="#2e2e2e" />
      {MEETING_SEATS.map((s, i) => (
        <Chair key={i} x={s.x} z={s.z} rot={s.face + Math.PI} color="#1d1f24" />
      ))}
      {/* wall screen */}
      <Box p={[MEETING.maxX - 0.08, 1.7, t.z]} s={[0.06, 1.2, 2.2]} c="#111" />
      <mesh position={[MEETING.maxX - 0.12, 1.7, t.z]} rotation-y={-Math.PI / 2}>
        <planeGeometry args={[2.05, 1.08]} />
        <meshStandardMaterial color="#2b5f8f" emissive="#2b5f8f" emissiveIntensity={0.6} />
      </mesh>
      <Plant x={MEETING.maxX - 0.6} z={MEETING.maxZ - 0.6} />
    </group>
  );
}

function GmOffice({ active }: { active: boolean }) {
  return (
    <group>
      <GlassRoom r={GM_OFFICE} gap={[-7.4, -5.4]} />
      <WorkDesk d={GM_DESK} active={active} wide wood />
      <Chair x={GM_DESK.seat.x} z={GM_DESK.seat.z + 0.1} color="#5a2e1c" />
      {/* bookshelf */}
      <group position={[GM_OFFICE.maxX - 0.3, 0, -8.2]}>
        <Box p={[0, 1.1, 0]} s={[0.4, 2.2, 2.4]} c="#6b4a2f" />
        {[0.5, 1.1, 1.7].map((y) =>
          [-0.8, -0.3, 0.3, 0.8].map((z, i) => (
            <Box key={`${y}${z}`} p={[-0.1, y + 0.17, z]} s={[0.25, 0.32, 0.3]} c={["#b23a48", "#2f6fb0", "#f2c14e", "#2d8a3e"][i]} />
          )),
        )}
      </group>
      <Box p={[12.2, 0.3, -9.8]} s={[1.6, 0.6, 0.8]} c="#30343b" />
      <Plant x={11.6} z={-10.3} s={1.3} />
    </group>
  );
}

function PendantLights() {
  return (
    <group>
      {ZONES.flatMap((z) =>
        [-4.4, -0.8].map((lz) => (
          <group key={`${z.cx}${lz}`} position={[z.cx, 3.2, lz]}>
            <Box p={[0, 0.3, 0]} s={[0.02, 0.6, 0.02]} c="#222" cast={false} />
            <mesh>
              <cylinderGeometry args={[0.15, 0.32, 0.25, 20, 1, true]} />
              <meshStandardMaterial color="#f5f5f0" side={2} />
            </mesh>
            <mesh position-y={-0.08}>
              <sphereGeometry args={[0.1, 12, 8]} />
              <meshStandardMaterial color="#fff6d8" emissive="#ffe8a8" emissiveIntensity={1.5} />
            </mesh>
          </group>
        )),
      )}
    </group>
  );
}

export const Furniture = memo(function Furniture({ activeDesks, gmActive, hrActive }: { activeDesks: string; gmActive: boolean; hrActive: boolean }) {
  const active = new Set(activeDesks.split(",").filter(Boolean).map(Number));
  return (
    <group>
      {/* floor */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[FLOOR.maxX - FLOOR.minX, FLOOR.maxZ - FLOOR.minZ]} />
        <meshStandardMaterial color="#d8c3a3" roughness={0.9} />
      </mesh>
      <Windows />
      <Box p={[FLOOR.minX - 0.1, WALL_H / 2, 0]} s={[0.2, WALL_H, FLOOR.maxZ - FLOOR.minZ]} c="#e5e1da" cast={false} />
      <Box p={[FLOOR.maxX + 0.1, WALL_H / 2, 0]} s={[0.2, WALL_H, FLOOR.maxZ - FLOOR.minZ]} c="#e5e1da" cast={false} />

      {/* department rugs */}
      {ZONES.map((z) => (
        <mesh key={z.cx} rotation-x={-Math.PI / 2} position={[z.cx, 0.01, -2.6]} receiveShadow>
          <planeGeometry args={[5.6, 10.4]} />
          <meshStandardMaterial color={z.color} roughness={1} />
        </mesh>
      ))}

      {DESKS.map((d, i) => (
        <group key={i}>
          <WorkDesk d={d} active={active.has(i)} />
          <Chair x={d.seat.x} z={d.seat.z + 0.1} />
        </group>
      ))}

      {/* HR corner */}
      <mesh rotation-x={-Math.PI / 2} position={[HR_DESK.x, 0.011, HR_DESK.z + 0.4]} receiveShadow>
        <planeGeometry args={[4.4, 3.6]} />
        <meshStandardMaterial color="#d7b6cd" />
      </mesh>
      <WorkDesk d={HR_DESK} active={hrActive} wide />
      <Chair x={HR_DESK.seat.x} z={HR_DESK.seat.z + 0.1} color="#6b3a5c" />
      <Chair x={HR_DESK.x + 0.6} z={HR_DESK.z - 1.1} rot={Math.PI} color="#6b3a5c" />
      <Plant x={-17.2} z={-10.2} s={1.2} />

      <GmOffice active={gmActive} />
      <MeetingRoom />
      <Lounge />
      <PendantLights />
      <Plant x={9.6} z={-10.2} s={1.3} />
      <Plant x={-10.6} z={-10.2} s={1.1} />
    </group>
  );
});
