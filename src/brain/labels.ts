// Copyright 2026 Federico Cesarini, Marco Sassarini. SPDX-License-Identifier: AGPL-3.0-or-later
// Where the brain's names go: to the right of their disc as in the mock, else to its left, never over another name,
// another folder's disc or past the canvas's edge; a name with no room is left out (the hover card still tells it).
import type { Box } from "./fit";

/** A name to place: its disc (centre, radius) and the size of its text, in canvas px. */
export type LabelBox = { i: number; x: number; y: number; r: number; width: number; height: number };

/** Where a placed name starts (its left end, its middle line). */
export type Placed = { i: number; x: number; y: number };

const GAP = 9; // between a disc and its name

/**
 * Places names in the order given, most important first, around `obstacles` (the folders' discs); `keep` names are
 * placed even with no free room.
 */
export function placeLabels(labels: LabelBox[], canvasWidth: number, obstacles: Box[] = [], keep: (i: number) => boolean = () => false): Placed[] {
  const taken: Box[] = [...obstacles];
  const placed: Placed[] = [];
  const free = (b: Box) =>
    b.x0 >= 2 && b.x1 <= canvasWidth - 2 && taken.every((o) => b.x1 <= o.x0 || b.x0 >= o.x1 || b.y1 <= o.y0 || b.y0 >= o.y1);
  for (const label of labels) {
    const y0 = label.y - label.height / 2;
    const y1 = label.y + label.height / 2;
    const right = { x0: label.x + label.r + GAP, y0, x1: label.x + label.r + GAP + label.width, y1 };
    const left = { x0: label.x - label.r - GAP - label.width, y0, x1: label.x - label.r - GAP, y1 };
    const box = free(right) ? right : free(left) ? left : keep(label.i) ? right : null;
    if (!box) continue;
    taken.push(box);
    placed.push({ i: label.i, x: box.x0, y: label.y });
  }
  return placed;
}
