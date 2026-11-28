import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef, type RefObject } from "react";
import type { Group } from "three";
import { route, type Vec2 } from "../../../shared/layout";
import type { EmployeeView } from "../../../shared/types";

export interface Spot extends Vec2 {
  face: number;
  sit: boolean;
  /** What the hands do once arrived. */
  pose: "type" | "rest" | "play" | "talk";
}

const SKIN = ["#f1c7a5", "#d9a47c", "#b77b55", "#8d5a3b", "#e8b896"];
const HAIR = ["#1f1a17", "#3b2618", "#6b4423", "#121212", "#8a5a2b"];
const PANTS = ["#2b2f3a", "#3a3f4b", "#1f2937", "#44403c"];
const SPEED = 3.6;

const ACTIVITY_LABEL: Record<EmployeeView["activity"], string> = {
  working: "بيشتغل",
  meeting: "في اجتماع",
  idle: "متاح",
  break: "استراحة",
};

interface Props {
  employee: EmployeeView;
  target: Spot;
  start: Vec2;
  selected: boolean;
  showLabel: boolean;
  onSelect: (id: string) => void;
  /** Fixed DOM container for labels (avoids drei re-targeting the first label). */
  portal: RefObject<HTMLElement>;
}

function CharacterImpl({ employee: e, target, start, selected, showLabel, onSelect, portal }: Props) {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const legL = useRef<Group>(null);
  const legR = useRef<Group>(null);
  const armL = useRef<Group>(null);
  const armR = useRef<Group>(null);
  const head = useRef<Group>(null);

  const st = useRef({
    pos: { x: start.x, z: start.z },
    path: [] as Vec2[],
    tx: NaN,
    tz: NaN,
    heading: target.face,
    arrived: false,
    sitBlend: 0,
  });

  const look = useMemo(() => {
    const female = e.look % 2 === 0;
    return {
      female,
      skin: SKIN[e.look % SKIN.length],
      hair: HAIR[(e.look >> 1) % HAIR.length],
      pants: PANTS[(e.look >> 2) % PANTS.length],
      phase: (e.look * 1.37) % (Math.PI * 2),
    };
  }, [e.look]);

  // If this person disappears while hovered, don't leave the pointer cursor behind.
  useEffect(() => () => void (document.body.style.cursor = ""), []);

  useFrame((state, dt) => {
    const s = st.current;
    const t = state.clock.elapsedTime + look.phase;
    dt = Math.min(dt, 0.05);

    // New destination → plan a corridor route from where we are.
    if (target.x !== s.tx || target.z !== s.tz) {
      const first = Number.isNaN(s.tx);
      s.tx = target.x;
      s.tz = target.z;
      const d = Math.hypot(target.x - s.pos.x, target.z - s.pos.z);
      s.path = first && d < 0.01 ? [] : d < 1.2 ? [target] : route(s.pos, target);
      s.arrived = s.path.length === 0;
    }

    let moving = false;
    if (s.path.length) {
      const wp = s.path[0];
      const dx = wp.x - s.pos.x;
      const dz = wp.z - s.pos.z;
      const d = Math.hypot(dx, dz);
      const step = SPEED * dt;
      if (d <= step) {
        s.pos = { x: wp.x, z: wp.z };
        s.path.shift();
        if (!s.path.length) s.arrived = true;
      } else {
        s.pos.x += (dx / d) * step;
        s.pos.z += (dz / d) * step;
        moving = true;
        // Model faces +Z; rotate toward travel direction.
        s.heading = lerpAngle(s.heading, Math.atan2(dx, dz), Math.min(1, dt * 10));
      }
    }
    if (!moving && s.arrived) s.heading = lerpAngle(s.heading, target.face, Math.min(1, dt * 6));

    const sitting = !moving && s.arrived && target.sit;
    s.sitBlend += ((sitting ? 1 : 0) - s.sitBlend) * Math.min(1, dt * 8);
    const sb = s.sitBlend;

    if (root.current) {
      root.current.position.set(s.pos.x, 0, s.pos.z);
      root.current.rotation.y = s.heading;
    }
    if (body.current) {
      const bob = moving ? Math.abs(Math.sin(t * 9)) * 0.05 : Math.sin(t * 2) * 0.008;
      // Seat height ~0.5 → lower the hips by 0.36 when sitting.
      body.current.position.y = bob - sb * 0.36;
    }

    const swing = moving ? Math.sin(t * 9) * 0.6 : 0;
    const legSit = -Math.PI / 2 * sb;
    if (legL.current) legL.current.rotation.x = swing * (1 - sb) + legSit;
    if (legR.current) legR.current.rotation.x = -swing * (1 - sb) + legSit;

    let aL = -swing * 0.8;
    let aR = swing * 0.8;
    if (!moving && s.arrived) {
      if (target.pose === "type") {
        aL = -1.15 + Math.sin(t * 14) * 0.08;
        aR = -1.15 + Math.cos(t * 13) * 0.08;
      } else if (target.pose === "play") {
        aR = -1.2 + Math.sin(t * 5) * 0.7;
        aL = -0.2;
      } else if (target.pose === "talk") {
        aR = -0.6 + Math.sin(t * 3) * 0.35;
        aL = -0.3;
      } else {
        aL = aR = -0.15 * sb;
      }
    }
    if (armL.current) armL.current.rotation.x += (aL - armL.current.rotation.x) * Math.min(1, dt * 12);
    if (armR.current) armR.current.rotation.x += (aR - armR.current.rotation.x) * Math.min(1, dt * 12);
    if (head.current) head.current.rotation.y = !moving && target.pose !== "type" ? Math.sin(t * 0.7) * 0.35 : 0;
  });

  const suit = e.color;
  const working = e.activity === "working";

  return (
    <group
      ref={root}
      onClick={(ev) => {
        ev.stopPropagation();
        onSelect(e.id);
      }}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      {selected && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
          <ringGeometry args={[0.42, 0.55, 40]} />
          <meshBasicMaterial color="#ffb020" />
        </mesh>
      )}
      <group ref={body}>
        {/* legs (pivot at hip) */}
        {[-0.11, 0.11].map((x, i) => (
          <group key={x} ref={i === 0 ? legL : legR} position={[x, 0.86, 0]}>
            <mesh position-y={-0.4} castShadow>
              <boxGeometry args={[0.17, 0.8, 0.19]} />
              <meshStandardMaterial color={look.pants} />
            </mesh>
            <mesh position={[0, -0.82, 0.05]} castShadow>
              <boxGeometry args={[0.18, 0.08, 0.3]} />
              <meshStandardMaterial color="#1b1b1b" />
            </mesh>
          </group>
        ))}
        {/* torso */}
        <mesh position-y={1.17} castShadow>
          <boxGeometry args={[0.52, 0.64, 0.3]} />
          <meshStandardMaterial color={suit} roughness={0.7} />
        </mesh>
        <mesh position={[0, 1.36, 0.152]}>
          <boxGeometry args={[0.16, 0.24, 0.01]} />
          <meshStandardMaterial color="#f5f5f5" />
        </mesh>
        {/* arms (pivot at shoulder) */}
        {[-0.34, 0.34].map((x, i) => (
          <group key={x} ref={i === 0 ? armL : armR} position={[x, 1.45, 0]}>
            <mesh position-y={-0.3} castShadow>
              <boxGeometry args={[0.14, 0.6, 0.16]} />
              <meshStandardMaterial color={suit} roughness={0.7} />
            </mesh>
            <mesh position-y={-0.64}>
              <boxGeometry args={[0.12, 0.12, 0.12]} />
              <meshStandardMaterial color={look.skin} />
            </mesh>
          </group>
        ))}
        {/* head */}
        <group ref={head} position-y={1.56}>
          <mesh position-y={0.04}>
            <cylinderGeometry args={[0.07, 0.08, 0.1]} />
            <meshStandardMaterial color={look.skin} />
          </mesh>
          <mesh position-y={0.24} castShadow>
            <sphereGeometry args={[0.18, 20, 16]} />
            <meshStandardMaterial color={look.skin} />
          </mesh>
          <mesh position-y={0.3} scale={[1.05, 0.8, 1.05]}>
            <sphereGeometry args={[0.18, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color={look.hair} />
          </mesh>
          {look.female && (
            <mesh position={[0, 0.16, -0.1]}>
              <boxGeometry args={[0.36, 0.38, 0.14]} />
              <meshStandardMaterial color={look.hair} />
            </mesh>
          )}
          {/* eyes */}
          {[-0.06, 0.06].map((x) => (
            <mesh key={x} position={[x, 0.26, 0.165]}>
              <sphereGeometry args={[0.022, 8, 8]} />
              <meshBasicMaterial color="#1a1a1a" />
            </mesh>
          ))}
        </group>
      </group>

      {showLabel && (
        <Html portal={portal} position={[0, 2.25, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
          <div className={`tag ${selected ? "tag--sel" : ""}`}>
            <span className="tag__dot" style={{ background: suit }} />
            <b>{e.name}</b>
            {(!working || selected) && <span className="tag__role">{e.title}</span>}
            {working && e.doingProgress !== undefined ? (
              <span className="tag__bar">
                <i style={{ width: `${Math.round(e.doingProgress * 100)}%` }} />
              </span>
            ) : (
              <span className={`tag__act tag__act--${e.activity}`}>{ACTIVITY_LABEL[e.activity]}</span>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

function lerpAngle(a: number, b: number, t: number) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Re-render only when something this character shows or targets changes. */
export const Character = memo(CharacterImpl, (a, b) => {
  const ea = a.employee;
  const eb = b.employee;
  return (
    a.selected === b.selected &&
    a.showLabel === b.showLabel &&
    a.onSelect === b.onSelect &&
    a.portal === b.portal &&
    a.target.x === b.target.x &&
    a.target.z === b.target.z &&
    a.target.face === b.target.face &&
    a.target.sit === b.target.sit &&
    a.target.pose === b.target.pose &&
    ea.name === eb.name &&
    ea.title === eb.title &&
    ea.color === eb.color &&
    ea.look === eb.look &&
    ea.activity === eb.activity &&
    Math.round((ea.doingProgress ?? -1) * 20) === Math.round((eb.doingProgress ?? -1) * 20)
  );
});
