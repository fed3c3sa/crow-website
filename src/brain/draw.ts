// Copyright 2026 Federico Cesarini, Marco Sassarini. SPDX-License-Identifier: AGPL-3.0-or-later
// Painting the brain as in the mock: thin grey links tinted by their folder's colour, flat discs (a large grey
// root, coloured folders, small grey notes), the top-level folders' names to the right of their disc. Big brains
// get less detail: no See-also links nor tints, links and notes painted a colour at a time, labels only when zoomed in.
import type { Box } from "./fit";
import { BIG } from "./forces";
import type { Layout } from "./graphModel";
import { placeLabels, type LabelBox } from "./labels";
import { areaColor, fade, mix, type Palette } from "./palette";

/** What the canvas shows besides the graph itself, as node indices (-1 for none). */
export type Marks = {
  hover: number;
  hoverAt: number; // when the hover began: the disc grows for a moment
  lit: number; // a note whose citation is hovered in the chat
  drop: number; // the folder under a dragged file
  inside: Uint8Array | null; // 1 for the nodes in the focused folder's subtree
  glow: { nodes: number[]; at: number } | null; // the notes the last answer read
};

/**
 * A layout's colours and orders, worked out once: per node, per link, how discs stack, which names come first (the
 * folders, then the notes), and the folders alone.
 */
export type Paint = { fills: string[]; tints: (string | null)[]; link: string; order: number[]; labels: number[]; folders: number[] };

export type Frame = {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  t: { k: number; x: number; y: number };
  layout: Layout;
  pos: Float32Array;
  palette: Palette;
  paint: Paint;
  marks: Marks;
  now: number;
};

const FADE_MS = 700; // new nodes fade in
const GROW_MS = 160; // a hovered disc grows
const GLOW_MS = 2600; // the notes an answer read glow, then fade

/** How discs follow the zoom: less than the zoom itself, so a zoomed-out brain keeps visible dots. */
export const discScale = (k: number) => Math.pow(k, 0.6);

export function paintOf(layout: Layout, palette: Palette): Paint {
  const { nodes, links } = layout;
  const fills = nodes.map((n) => {
    if (n.kind === "folder") return n.depth === 0 ? palette.root : areaColor(palette, n.area);
    return n.depth <= 2 ? palette.root : palette.note; // as in the mock, notes share the root's grey; deeper ones recede
  });
  const tints = links.map((l) => {
    const from = nodes[l.source];
    return l.kind === "contains" && from.kind === "folder" && from.depth > 0 ? mix(fills[l.source], palette.bg, 0.25) : null;
  });
  const rank = (i: number) => (nodes[i].kind === "note" ? 0 : nodes[i].depth === 0 ? 100 : 50 - nodes[i].depth);
  const order = nodes.map((_, i) => i).sort((a, b) => rank(a) - rank(b));
  // Names: top-level folders first, the biggest before the others, then subfolders, then notes.
  const named = nodes.map((_, i) => i).filter((i) => nodes[i].depth > 0);
  const weight = (i: number) => (nodes[i].kind === "note" ? 1000 : 0) + nodes[i].depth * 100 - Math.min(99, Math.sqrt(nodes[i].notes));
  const labels = named.sort((a, b) => weight(a) - weight(b));
  const folders = nodes.flatMap((n, i) => (n.kind === "folder" ? [i] : []));
  return { fills, tints, link: mix(palette.note, palette.bg, 0.42), order, labels, folders };
}

/** Paints one frame; true while something is still moving (a fade-in, a glow, a growing disc). */
export function drawBrain(frame: Frame): boolean {
  const { ctx, width, height, t, layout, pos, palette, paint, marks, now } = frame;
  const { nodes, links } = layout;
  const big = nodes.length > BIG;
  const scale = discScale(t.k);
  const sx = (i: number) => t.x + pos[2 * i] * t.k;
  const sy = (i: number) => t.y + pos[2 * i + 1] * t.k;
  let moving = false;
  const shown = (i: number) => {
    const born = nodes[i].born;
    const fadeIn = born ? Math.min(1, Math.max(0, (now - born) / FADE_MS)) : 1;
    if (fadeIn < 1) moving = true;
    return (marks.inside && !marks.inside[i] ? 0.13 : 1) * fadeIn;
  };
  const off = (x: number, y: number, pad: number) => x < -pad || y < -pad || x > width + pad || y > height + pad;
  ctx.clearRect(0, 0, width, height);

  ctx.lineWidth = 1;
  const lines = big ? new Batch() : null;
  for (let li = 0; li < links.length; li++) {
    const { source, target, kind } = links[li];
    if (kind === "see_also" && (big || t.k < 0.4)) continue;
    const x1 = sx(source);
    const y1 = sy(source);
    const x2 = sx(target);
    const y2 = sy(target);
    if (off(x1, y1, 0) && off(x2, y2, 0) && Math.hypot(x2 - x1, y2 - y1) < width) continue;
    const alpha = Math.min(shown(source), shown(target)) * (kind === "see_also" ? 0.1 : 0.85);
    if (lines) {
      const path = lines.path(paint.link, alpha);
      path.moveTo(x1, y1);
      path.lineTo(x2, y2);
      continue;
    }
    ctx.globalAlpha = alpha;
    const tint = paint.tints[li];
    if (tint) {
      const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
      gradient.addColorStop(0, tint);
      gradient.addColorStop(0.7, paint.link);
      ctx.strokeStyle = gradient;
    } else {
      ctx.strokeStyle = paint.link;
    }
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  lines?.paint(ctx, "stroke");

  if (marks.glow) {
    const p = (now - marks.glow.at) / GLOW_MS;
    if (p < 1) {
      moving = true;
      const strength = p < 0.12 ? p / 0.12 : 1 - (p - 0.12) / 0.88;
      for (const i of marks.glow.nodes) halo(ctx, sx(i), sy(i), Math.max(14, nodes[i].r * scale * 5), palette.accent, 0.6 * strength);
    }
  }

  const grow = marks.hover >= 0 ? Math.min(1, (now - marks.hoverAt) / GROW_MS) : 0;
  if (grow > 0 && grow < 1) moving = true;
  const radiusOf = (i: number) => {
    const r = nodes[i].r * scale;
    if (i === marks.lit || i === marks.drop) return r * 1.35;
    return i === marks.hover ? r * (1 + 0.25 * (1 - (1 - grow) ** 3)) : r;
  };
  const dots = big ? new Batch() : null; // the notes, which come first in the painting order
  for (const i of paint.order) {
    const x = sx(i);
    const y = sy(i);
    const r = radiusOf(i);
    if (dots && nodes[i].kind !== "note") dots.paint(ctx, "fill"); // the folders go over them
    if (off(x, y, r + 2)) continue;
    const path = dots && nodes[i].kind === "note" ? dots.path(paint.fills[i], shown(i)) : null;
    if (!path) {
      ctx.globalAlpha = shown(i);
      ctx.fillStyle = paint.fills[i];
      ctx.beginPath();
    }
    const disc = path ?? ctx;
    if (r < 1.2) disc.rect(x - 0.8, y - 0.8, 1.6, 1.6);
    else {
      disc.moveTo(x + r, y);
      disc.arc(x, y, r, 0, Math.PI * 2);
    }
    if (!path) ctx.fill();
  }
  dots?.paint(ctx, "fill");
  for (const i of [marks.lit, marks.drop]) {
    if (i < 0) continue;
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = palette.labelHi;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(sx(i), sy(i), radiusOf(i) + 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawLabels(frame, radiusOf, shown);
  ctx.globalAlpha = 1;
  return moving;
}

/** Names beside their disc: top-level folders always, subfolders and notes as the zoom brings them close. */
function drawLabels(frame: Frame, radiusOf: (i: number) => number, shown: (i: number) => number) {
  const { ctx, width, height, t, layout, pos, palette, paint, marks } = frame;
  const { nodes } = layout;
  const marked = [marks.hover, marks.lit, marks.drop].filter((i) => i >= 0);
  const notesToo = t.k > 2.8 && nodes.length < BIG;
  const wanted = (i: number) => nodes[i].depth === 1 || t.k > 1.6;
  const sizeOf = (i: number) => (nodes[i].kind === "note" ? 12.5 : nodes[i].depth === 1 ? 15 : 13.5);
  const textOf = (i: number) => (nodes[i].label.length > 42 ? `${nodes[i].label.slice(0, 41)}…` : nodes[i].label);
  const fontOf = (i: number) => `400 ${sizeOf(i)}px ${palette.font}`;
  const boxes: LabelBox[] = [];
  const discs: Box[] = paint.folders.map((i) => {
    const x = t.x + pos[2 * i] * t.k; // names keep off the folders' discs
    const y = t.y + pos[2 * i + 1] * t.k;
    const r = radiusOf(i);
    return { x0: x - r, y0: y - r, x1: x + r, y1: y + r };
  });
  const add = (i: number) => {
    const x = t.x + pos[2 * i] * t.k;
    const y = t.y + pos[2 * i + 1] * t.k;
    if (x < -300 || x > width + 40 || y < -20 || y > height + 20) return;
    ctx.font = fontOf(i);
    boxes.push({ i, x, y, r: radiusOf(i), width: ctx.measureText(textOf(i)).width, height: sizeOf(i) + 4 });
  };
  marked.forEach(add); // the hovered, cited and dropped-on names first: they are always shown
  for (const i of paint.labels) {
    if (nodes[i].kind === "note" && !notesToo) break; // the notes come last: none of them when zoomed out
    if (!marked.includes(i) && (nodes[i].kind === "note" || wanted(i))) add(i);
  }
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 4; // a rim of background keeps a name readable over links and dots
  ctx.strokeStyle = palette.bg;
  for (const { i, x, y } of placeLabels(boxes, width, discs, (j) => marked.includes(j))) {
    ctx.font = fontOf(i);
    ctx.globalAlpha = shown(i);
    ctx.strokeText(textOf(i), x, y + 0.5);
    ctx.fillStyle = marked.includes(i) ? palette.labelHi : palette.label;
    ctx.fillText(textOf(i), x, y + 0.5);
  }
}

/** Links or dots of one colour and opacity gathered in one path, painted with one call. */
class Batch {
  private readonly paths = new Map<string, Path2D>();

  path(color: string, alpha: number): Path2D {
    const key = `${color}|${Math.round(alpha * 10) / 10}`; // opacities in tenths: a handful of paths
    let path = this.paths.get(key);
    if (!path) this.paths.set(key, (path = new Path2D()));
    return path;
  }

  paint(ctx: CanvasRenderingContext2D, how: "fill" | "stroke") {
    for (const [key, path] of this.paths) {
      const [color, alpha] = key.split("|");
      ctx.globalAlpha = Number(alpha);
      if (how === "fill") {
        ctx.fillStyle = color;
        ctx.fill(path);
      } else {
        ctx.strokeStyle = color;
        ctx.stroke(path);
      }
    }
    this.paths.clear();
  }
}

function halo(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, alpha: number) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, fade(color, alpha));
  gradient.addColorStop(1, fade(color, 0));
  ctx.globalAlpha = 1;
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}
