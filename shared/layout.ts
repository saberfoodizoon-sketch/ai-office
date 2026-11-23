// Office floor plan in world units (1 unit ≈ 1 m). X runs left→right,
// Z runs from the window wall (negative) toward the camera (positive).

export type Vec2 = { x: number; z: number };

export const FLOOR = { minX: -18, maxX: 18, minZ: -11, maxZ: 11 };

/** Department zones (colored rugs) — three blocks of 2 columns × 3 rows. */
export const ZONES = [
  { cx: -7, color: "#2bb3a3", label: "المحتوى والتسويق" },
  { cx: -1, color: "#3d7be0", label: "المنتج والتقنية" },
  { cx: 5, color: "#f08a3c", label: "البيانات والمبيعات" },
];
const ROW_Z = [-6.2, -2.6, 1.0];

export interface Desk {
  /** Desk center. */
  x: number;
  z: number;
  /** Where the person sits (in front of the desk, facing the window). */
  seat: Vec2;
  zone: number;
}

export const DESKS: Desk[] = [];
for (let row = 0; row < ROW_Z.length; row++)
  for (let zi = 0; zi < ZONES.length; zi++)
    for (const dx of [-1.4, 1.4]) {
      const x = ZONES[zi].cx + dx;
      const z = ROW_Z[row];
      DESKS.push({ x, z, seat: { x, z: z + 1.0 }, zone: zi });
    }
export const DESK_COUNT = DESKS.length; // 18

export const GM_OFFICE = { minX: 11, maxX: 17.5, minZ: -11, maxZ: -2 };
export const GM_DESK: Desk = { x: 14.2, z: -7.4, seat: { x: 14.2, z: -6.4 }, zone: -1 };

export const HR_DESK: Desk = { x: -14.6, z: -7.4, seat: { x: -14.6, z: -6.4 }, zone: -2 };

export const MEETING = { minX: 11, maxX: 17.5, minZ: 0, maxZ: 9.5, table: { x: 14.2, z: 4.8 } };
export const MEETING_SEATS: (Vec2 & { face: number })[] = [
  { x: 14.2, z: 2.2, face: 0 }, // head of table (GM)
  { x: 12.8, z: 3.5, face: Math.PI / 2 },
  { x: 15.6, z: 3.5, face: -Math.PI / 2 },
  { x: 12.8, z: 4.8, face: Math.PI / 2 },
  { x: 15.6, z: 4.8, face: -Math.PI / 2 },
  { x: 12.8, z: 6.1, face: Math.PI / 2 },
  { x: 15.6, z: 6.1, face: -Math.PI / 2 },
  { x: 14.2, z: 7.4, face: Math.PI },
];

export const LOUNGE = { minX: -17.5, maxX: -11.5, minZ: -2, maxZ: 10.5 };
export const LOUNGE_SPOTS: (Vec2 & { face: number })[] = [
  { x: -15.6, z: 5.3, face: 0 }, // ping-pong side A
  { x: -15.6, z: 8.7, face: Math.PI }, // side B
  { x: -13.0, z: 0.6, face: -Math.PI / 2 }, // sofa
  { x: -13.0, z: 1.8, face: -Math.PI / 2 },
  { x: -16.6, z: 0.4, face: Math.PI / 2 }, // bean bags
  { x: -12.8, z: 7.0, face: -Math.PI / 2 },
  { x: -16.8, z: 2.4, face: Math.PI / 2 },
];

export const ENTRANCE: Vec2 = { x: -8, z: 10.8 };

/** Walk along corridors so people don't cut through desks. */
const H_CORRIDOR_Z = 3.4;
const V_CORRIDOR_X = 9.6;
export function route(a: Vec2, b: Vec2): Vec2[] {
  // Seats on the far side of the meeting table are reached around its top end.
  const farSide = (p: Vec2) =>
    p.x > MEETING.table.x && p.x < MEETING.maxX && p.z > MEETING.minZ && p.z < MEETING.maxZ;
  const AROUND_Z = 1.9;
  const exitA: Vec2[] = farSide(a) ? [{ x: a.x, z: AROUND_Z }] : [];
  const enterB: Vec2[] = farSide(b) ? [{ x: b.x, z: AROUND_Z }] : [];
  const from = exitA.length ? exitA[0] : a;
  const to = enterB.length ? enterB[0] : b;

  const attach = (p: Vec2) =>
    p.x > V_CORRIDOR_X - 0.2 ? { x: V_CORRIDOR_X, z: p.z, v: true } : { x: p.x, z: H_CORRIDOR_Z, v: false };
  const pa = attach(from);
  const pb = attach(to);
  const path: Vec2[] = [...exitA, { x: pa.x, z: pa.z }];
  if (pa.v !== pb.v) path.push({ x: V_CORRIDOR_X, z: H_CORRIDOR_Z });
  path.push({ x: pb.x, z: pb.z }, ...enterB, { x: b.x, z: b.z });
  return path;
}
