// Copyright 2026 Federico Cesarini, Marco Sassarini. SPDX-License-Identifier: AGPL-3.0-or-later
// The brain's colours: the --node-* and --area-* tokens of styles/tokens.css, and a stable area → colour hash.

/** The tokens the canvas paints with; each fallback mirrors tokens.css (tests and workers have no stylesheet). */
const TOKENS = {
  bg: ["--bg", "#0f1113"],
  root: ["--node-root", "#9097a0"],
  note: ["--node-note", "#7f868f"],
  label: ["--node-label", "#8a9095"],
  labelHi: ["--node-label-hi", "#86e7f9"],
  accent: ["--accent", "#3d80fc"],
  font: ["--font", "system-ui, sans-serif"],
} as const;

const AREAS = ["#4cc4ae", "#f5b85a", "#ed6461", "#4389fe", "#a68cf7", "#5ec2f2", "#ef8fb7", "#c3cf6b"]; // --area-1…8

export type Palette = Record<keyof typeof TOKENS, string> & { areas: string[] };

export const FALLBACK: Palette = {
  ...(Object.fromEntries(Object.entries(TOKENS).map(([key, [, value]]) => [key, value])) as Record<keyof typeof TOKENS, string>),
  areas: AREAS,
};

/** The palette as the stylesheet defines it right now. */
export function readPalette(root: Element = document.documentElement): Palette {
  const style = getComputedStyle(root);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  const tokens = Object.fromEntries(Object.entries(TOKENS).map(([key, [name, value]]) => [key, read(name, value)]));
  return { ...(tokens as Record<keyof typeof TOKENS, string>), areas: AREAS.map((value, i) => read(`--area-${i + 1}`, value)) };
}

/** Any fixed value keeps colours stable; this one spreads common names (projects, people, ideas…) over distinct colours. */
const SEED = 135168;

/** Which of the 8 area colours a top-level folder gets: a hash of its name, so a new folder never repaints the others. */
export function areaIndex(area: string): number {
  let h = (0x811c9dc5 ^ SEED) >>> 0; // FNV-1a…
  for (let i = 0; i < area.length; i++) {
    h ^= area.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16; // …then murmur3's finaliser, so the low bits that pick the colour depend on every character
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) % AREAS.length;
}

/** A folder's colour: its area's, or the root's grey for the root itself. */
export const areaColor = (palette: Palette, area: string) => (area ? palette.areas[areaIndex(area)] : palette.root);

/** "#4cc4ae", "#4ca" or "rgb(76, 196, 174)" → [76, 196, 174]; anything else is a neutral grey. */
export function rgbOf(color: string): [number, number, number] {
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color.trim());
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  const hex = color.trim().replace(/^#/, "");
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return [128, 128, 128];
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The colour `t` of the way from `a` to `b`. */
export function mix(a: string, b: string, t: number): string {
  const [ra, ga, ba] = rgbOf(a);
  const [rb, gb, bb] = rgbOf(b);
  const at = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${at(ra, rb)}, ${at(ga, gb)}, ${at(ba, bb)})`;
}

/** `color` with an opacity. */
export function fade(color: string, alpha: number): string {
  const [r, g, b] = rgbOf(color);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}
