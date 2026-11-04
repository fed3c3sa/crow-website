// Copyright 2026 Federico Cesarini, Marco Sassarini. SPDX-License-Identifier: AGPL-3.0-or-later
// Where the brain rests: the zoom that fits the layout into the part of the window the chat card leaves free.

export type Box = { x0: number; y0: number; x1: number; y1: number };
export type Transform = { k: number; x: number; y: number };

/** A layout x that must land on a screen x (the root, just past the chat card's edge). */
export type Anchor = { layoutX: number; screenX: number };

/** The layout's bounds, discs included; null when there is nothing to frame. */
export function boundsOf(pos: Float32Array, radii: ArrayLike<number>): Box | null {
  if (radii.length === 0) return null;
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (let i = 0; i < radii.length; i++) {
    const x = pos[2 * i];
    const y = pos[2 * i + 1];
    box.x0 = Math.min(box.x0, x - radii[i]);
    box.x1 = Math.max(box.x1, x + radii[i]);
    box.y0 = Math.min(box.y0, y - radii[i]);
    box.y1 = Math.max(box.y1, y + radii[i]);
  }
  return box;
}

/**
 * The transform that fits `bounds` into `area` as large as it can, the scale kept within [kMin, kMax]. Centred;
 * or, with an anchor, that layout x lands on that screen x and only what lies to its right has to fit (what lies
 * to its left may go under the card).
 */
export function fitTransform(bounds: Box, area: Box, kMin: number, kMax: number, anchor?: Anchor): Transform {
  const height = Math.max(1, bounds.y1 - bounds.y0);
  const tall = (area.y1 - area.y0) / height;
  const y = (k: number) => (area.y0 + area.y1) / 2 - (k * (bounds.y0 + bounds.y1)) / 2;
  if (anchor) {
    const right = Math.max(1, bounds.x1 - anchor.layoutX);
    const k = Math.max(kMin, Math.min(kMax, (area.x1 - anchor.screenX) / right, tall));
    return { k, x: anchor.screenX - k * anchor.layoutX, y: y(k) };
  }
  const width = Math.max(1, bounds.x1 - bounds.x0);
  const k = Math.max(kMin, Math.min(kMax, (area.x1 - area.x0) / width, tall));
  return { k, x: (area.x0 + area.x1) / 2 - (k * (bounds.x0 + bounds.x1)) / 2, y: y(k) };
}
