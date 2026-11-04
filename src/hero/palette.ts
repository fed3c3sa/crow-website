// Copyright 2026 Federico Cesarini, Marco Sassarini. SPDX-License-Identifier: AGPL-3.0-or-later
// The colours the onboarding's canvases paint with, read from the design tokens so they never drift from tokens.css.

const TOKENS = {
  bgDeep: "--bg-deep",
  accent: "--accent",
  teal: "--area-1",
  amber: "--area-2",
  coral: "--area-3",
  root: "--node-root",
  note: "--node-note",
} as const;

/** Folder hubs take these by size, biggest first; as in the mock, only the four named by cards are coloured. */
export const HUB_TOKENS = [
  "--area-4",
  "--area-1",
  "--area-2",
  "--area-3",
  "--node-root",
  "--node-root",
  "--node-root",
  "--node-root",
];

export type Palette = Record<keyof typeof TOKENS, string> & { hubs: string[] };

const MISSING = "#808080"; // a visible grey, should a token ever go missing

let read: Palette | null = null;

/** The token colours, read once the stylesheet is in. */
export function palette(): Palette {
  if (!read) {
    const style = getComputedStyle(document.documentElement);
    const token = (name: string) => style.getPropertyValue(name).trim() || MISSING;
    const named = Object.fromEntries(Object.entries(TOKENS).map(([key, name]) => [key, token(name)]));
    read = { ...(named as Record<keyof typeof TOKENS, string>), hubs: HUB_TOKENS.map(token) };
  }
  return read;
}

/** A token colour (#rgb or #rrggbb) as its channels; null for any other syntax. */
export function channels(color: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())?.[1];
  if (!hex) return null;
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Channels at an opacity, for canvas strokes and gradients. */
export const rgba = ([r, g, b]: readonly number[], opacity: number) =>
  `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${clamp01(opacity)})`;

/** A token colour at an opacity; other colour syntaxes pass through opaque. */
export function alpha(color: string, opacity: number): string {
  const rgb = channels(color);
  return rgb ? rgba(rgb, opacity) : color;
}
