// Copyright 2026 Federico Cesarini, Marco Sassarini. SPDX-License-Identifier: AGPL-3.0-or-later
// The Welcome screen's field of soft lights: where each glow sits, its size, tint and focus, which glows are linked,
// and how they sway. Seeded, so the field is the same on every launch.

/** A seeded random (an LCG): the same numbers for the same seed. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export type Tint = "grey" | "blue" | "teal" | "amber" | "coral";

export type Sway = { ax: number; ay: number; wx: number; wy: number; px: number; py: number }; // px, rad/s, rad

export type Glow = {
  x: number; // 0–1 across the window
  y: number; // 0–1 down the window
  r: number; // radius in px for a 1280 px wide window
  tint: Tint;
  opacity: number;
  soft: number; // 0 a crisp disc … 1 mostly halo: how far out of focus the glow is
  sway: Sway;
};

/** The mock's large lights, where it put them (0–1 of the window, radius in px at 1280 wide). */
const ANCHORS: { x: number; y: number; r: number; tint: Tint }[] = [
  { x: 0.13, y: 0.565, r: 36, tint: "blue" },
  { x: 0.926, y: 0.254, r: 30, tint: "blue" },
  { x: 0.76, y: 0.902, r: 32, tint: "teal" },
  { x: 0.759, y: 0.159, r: 29, tint: "grey" },
  { x: 0.954, y: 0.49, r: 23, tint: "amber" },
  { x: 0.901, y: 0.732, r: 25, tint: "coral" },
  { x: 0.213, y: 0.188, r: 20, tint: "teal" },
  { x: 0.272, y: 0.324, r: 21, tint: "amber" },
  { x: 0.16, y: 0.779, r: 20, tint: "teal" },
  { x: 0.012, y: 0.513, r: 19, tint: "coral" },
];

/** The small lights scattered around them are mostly grey, as in the mock. */
const TINTS: [Tint, number][] = [
  ["grey", 0.78],
  ["blue", 0.07],
  ["teal", 0.05],
  ["amber", 0.05],
  ["coral", 0.05],
];

/** The oval the title sits in: glows inside it stay small, grey and few, so the text reads. */
const CLEAR = { x: 0.5, y: 0.47, rx: 0.25, ry: 0.32 };

export const insideClear = (x: number, y: number) =>
  ((x - CLEAR.x) / CLEAR.rx) ** 2 + ((y - CLEAR.y) / CLEAR.ry) ** 2 < 1;

export const LARGE = 18; // px: no glow this big sits behind the title

/** Two glows overlap in a 1280 × 820 window: the scattered ones keep clear of each other and of the anchors. */
export const overlap = (a: Pick<Glow, "x" | "y" | "r">, b: Pick<Glow, "x" | "y" | "r">) =>
  Math.hypot((a.x - b.x) * 1280, (a.y - b.y) * 820) < a.r + b.r + 10;

export function glows(count = 70, seed = 7): Glow[] {
  const rand = seeded(seed);
  const tintOf = (u: number): Tint => {
    for (const [tint, share] of TINTS) if ((u -= share) < 0) return tint;
    return "grey";
  };
  const sway = (): Sway => ({
    ax: 4 + rand() * 10,
    ay: 4 + rand() * 10,
    wx: (2 * Math.PI) / (24 + rand() * 30),
    wy: (2 * Math.PI) / (24 + rand() * 30),
    px: rand() * 2 * Math.PI,
    py: rand() * 2 * Math.PI,
  });
  const field: Glow[] = ANCHORS.map((a) => ({
    ...a,
    opacity: a.tint === "grey" ? 0.6 : 0.96,
    soft: 0.15 + rand() * 0.2, // the mock's large lights are nearly in focus; the small ones blur
    sway: sway(),
  }));
  while (field.length < count) {
    const spot = { x: rand() * 1.04 - 0.02, y: rand() * 1.04 - 0.02, r: 6 + rand() ** 1.6 * 11 };
    const behind = insideClear(spot.x, spot.y); // behind the title only a few grey glows, dimmer
    if ((behind && rand() < 0.6) || field.some((g) => overlap(g, spot))) continue;
    const tint = behind ? "grey" : tintOf(rand());
    const lit = tint === "grey" ? 0.26 + rand() * 0.3 : 0.6 + rand() * 0.3;
    field.push({ ...spot, tint, opacity: lit * (behind ? 0.6 : 1), soft: 0.3 + rand() * 0.6, sway: sway() });
  }
  return field;
}

/** Where a glow has swayed to after `t` seconds, in px. */
export const swayAt = ({ ax, ay, wx, wy, px, py }: Sway, t: number) => ({
  dx: ax * Math.sin(wx * t + px),
  dy: ay * Math.cos(wy * t + py),
});

/**
 * Each glow linked to its nearest neighbours, the large ones to more of them so they read as hubs; distances are
 * measured in window heights (`aspect` = width / height), so the web looks the same on any window shape.
 */
export function links(field: Glow[], aspect: number, reach = 0.24): [number, number][] {
  const seen = new Set<string>();
  const out: [number, number][] = [];
  field.forEach((a, i) => {
    const degree = a.r >= 22 ? 5 : a.r >= 14 ? 3 : 2;
    const near = field
      .map((b, j) => ({ j, d: Math.hypot((a.x - b.x) * aspect, a.y - b.y) }))
      .filter(({ j, d }) => j !== i && d < reach)
      .sort((p, q) => p.d - q.d)
      .slice(0, degree);
    for (const { j } of near) {
      const pair: [number, number] = i < j ? [i, j] : [j, i];
      const key = pair.join("-");
      if (!seen.has(key)) {
        seen.add(key);
        out.push(pair);
      }
    }
  });
  return out;
}
