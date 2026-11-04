// Copyright 2026 Federico Cesarini, Marco Sassarini. SPDX-License-Identifier: AGPL-3.0-or-later
// Which node is under a point: a quadtree over the node positions, then the disc that holds the point (or whose edge
// is close enough to touch), the deepest inside winning so a big folder is not shadowed by a dot on its rim. While the
// layout moves, the quadtree is kept until some node has drifted far enough to need a new one.
import { quadtree, type Quadtree } from "d3-quadtree";

export type HitIndex = { tree: Quadtree<number>; reach: number };

export type HitOptions = {
  slop: number; // how far outside a disc still counts as on it
  scale?: number; // the radii as drawn right now, relative to `radii`
  accept?: (i: number) => boolean; // rules nodes out, e.g. all but folders
  drift?: number; // how far nodes may have moved since the quadtree was built
};

/** How far (layout units) nodes may move before their quadtree is built again. */
export const DRIFT = 2;

/** A quadtree of node indices; `pos` holds x0, y0, x1, y1… and `radii` each node's radius, in the same units. */
export function buildHitIndex(pos: Float32Array, radii: ArrayLike<number>): HitIndex {
  let reach = 0;
  for (let i = 0; i < radii.length; i++) reach = Math.max(reach, radii[i]);
  const tree = quadtree<number>()
    .x((i) => pos[2 * i])
    .y((i) => pos[2 * i + 1])
    .addAll(Array.from({ length: radii.length }, (_, i) => i));
  return { tree, reach };
}

/** The index of the node at (x, y), or -1. */
export function hitTest(index: HitIndex, pos: Float32Array, radii: ArrayLike<number>, x: number, y: number, options: HitOptions): number {
  const { slop, scale = 1, accept, drift = 0 } = options;
  const reach = index.reach * scale + slop + drift; // quads hold where nodes were: look a drift further
  let best = -1;
  let bestGap = Infinity;
  index.tree.visit((quad, x0, y0, x1, y1) => {
    if ("data" in quad) {
      for (let leaf: typeof quad | undefined = quad; leaf; leaf = leaf.next) {
        const i = leaf.data;
        const gap = Math.hypot(pos[2 * i] - x, pos[2 * i + 1] - y) - radii[i] * scale; // < 0 inside the disc
        if (gap <= slop && gap < bestGap && (!accept || accept(i))) {
          best = i;
          bestGap = gap;
        }
      }
    }
    return x0 > x + reach || x1 < x - reach || y0 > y + reach || y1 < y - reach; // skip quads out of reach
  });
  return best;
}

/** Hit-testing a layout whose positions keep changing (one Picker per layout). */
export class Picker {
  private index: HitIndex | null = null;
  private indexed: Float32Array | null = null; // the positions the quadtree was built from
  private pos: Float32Array = new Float32Array(0);

  constructor(private readonly radii: ArrayLike<number>) {}

  /** New positions; the quadtree stays while every node is within DRIFT of where it was indexed. */
  update(pos: Float32Array) {
    this.pos = pos;
    if (this.indexed && drifted(this.indexed, pos)) this.index = this.indexed = null;
  }

  pick(x: number, y: number, options: HitOptions): number {
    if (!this.index) {
      this.index = buildHitIndex(this.pos, this.radii);
      this.indexed = this.pos;
    }
    return hitTest(this.index, this.pos, this.radii, x, y, { ...options, drift: DRIFT });
  }
}

function drifted(a: Float32Array, b: Float32Array): boolean {
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > DRIFT) return true;
  return false;
}
