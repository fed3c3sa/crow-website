// Copyright 2026 Federico Cesarini, Marco Sassarini. SPDX-License-Identifier: AGPL-3.0-or-later
// Paints the Welcome field: out-of-focus discs scaled from cached gradient sprites (never a blur filter, which
// WebKitGTK renders slowly), faint links between them, a calm middle and a dark vignette.
import { swayAt, type Glow, type Tint } from "./ambient";
import { alpha, type Palette } from "./palette";

const SPRITE = 128; // px: every glow is one of these, scaled
const FOCUS_STEPS = 4; // sprites per tint, from crisp to very soft
const REACH = 2; // a sprite's radius over the glow's visible radius: room for the soft falloff

/** Links are stroked three times, wide and faint to thin, so they read out of focus like the glows. */
const LINK_STROKES = [
  { width: 6, opacity: 0.022 },
  { width: 3, opacity: 0.04 },
  { width: 1.3, opacity: 0.07 },
];

export type SpriteOf = (tint: Tint, soft: number) => HTMLCanvasElement;

function sprite(color: string, soft: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SPRITE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const r = SPRITE / 2;
  const core = 0.46 - soft * 0.26; // a crisp glow keeps a flat core, a soft one is nearly all falloff
  const glow = ctx.createRadialGradient(r, r, 0, r, r, r);
  glow.addColorStop(0, alpha(color, 1));
  glow.addColorStop(core, alpha(color, 0.94));
  glow.addColorStop(core + (1 - core) * 0.3, alpha(color, 0.55));
  glow.addColorStop(core + (1 - core) * 0.62, alpha(color, 0.16));
  glow.addColorStop(1, alpha(color, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, SPRITE, SPRITE);
  return canvas;
}

/** The sprites for a palette, made on first use. */
export function spritesFor(p: Palette): SpriteOf {
  const colors: Record<Tint, string> = { grey: p.root, blue: p.accent, teal: p.teal, amber: p.amber, coral: p.coral };
  const made = new Map<string, HTMLCanvasElement>();
  return (tint, soft) => {
    const step = Math.round(soft * (FOCUS_STEPS - 1));
    const key = `${tint}:${step}`;
    let found = made.get(key);
    if (!found) {
      found = sprite(colors[tint], step / (FOCUS_STEPS - 1));
      made.set(key, found);
    }
    return found;
  };
}

type Scene = { field: Glow[]; links: [number, number][]; spriteOf: SpriteOf; p: Palette };

export function paintAmbient(ctx: CanvasRenderingContext2D, width: number, height: number, time: number, scene: Scene) {
  const { field, links, spriteOf, p } = scene;
  const scale = Math.max(0.75, Math.min(1.5, width / 1280));
  const at = field.map((g) => {
    const { dx, dy } = swayAt(g.sway, time);
    return { x: g.x * width + dx * scale, y: g.y * height + dy * scale };
  });

  ctx.lineCap = "round";
  for (const stroke of LINK_STROKES) {
    ctx.lineWidth = stroke.width * scale;
    ctx.strokeStyle = alpha(p.root, stroke.opacity);
    ctx.beginPath();
    for (const [a, b] of links) {
      ctx.moveTo(at[a].x, at[a].y);
      ctx.lineTo(at[b].x, at[b].y);
    }
    ctx.stroke();
  }

  field.forEach((g, i) => {
    const r = g.r * scale * REACH;
    ctx.globalAlpha = g.opacity;
    ctx.drawImage(spriteOf(g.tint, g.soft), at[i].x - r, at[i].y - r, r * 2, r * 2);
  });
  ctx.globalAlpha = 1;

  // A calm middle for the title, then the corners sink into the window.
  const middle = ctx.createRadialGradient(
    width / 2,
    height * 0.47,
    0,
    width / 2,
    height * 0.47,
    Math.min(width, height) * 0.42,
  );
  middle.addColorStop(0, alpha(p.bgDeep, 0.55));
  middle.addColorStop(1, alpha(p.bgDeep, 0));
  ctx.fillStyle = middle;
  ctx.fillRect(0, 0, width, height);
  const diagonal = Math.hypot(width, height) / 2;
  const edges = ctx.createRadialGradient(width / 2, height / 2, diagonal * 0.45, width / 2, height / 2, diagonal);
  edges.addColorStop(0, alpha(p.bgDeep, 0));
  edges.addColorStop(1, alpha(p.bgDeep, 0.8));
  ctx.fillStyle = edges;
  ctx.fillRect(0, 0, width, height);
}
