// Copyright 2026 Federico Cesarini, Marco Sassarini. SPDX-License-Identifier: AGPL-3.0-or-later
// How the brain lays itself out, tuned like llmw2's own brain (web/graph.js): folders push each other apart, notes
// gather round their folder, See-also links pull gently. Unlike llmw2's, the root stays put and the branches lean
// to its right, as in the mock, where the brain opens out beside the chat card. Also the messages to and from
// graph.worker.ts.
import { hash01, type BrainNode, type Layout } from "./graphModel";

export type SimNode = { x: number; y: number; r: number; charge: number; pinned: boolean };

/** From this many nodes the brain is drawn with less detail, and laid out in fewer steps. */
export const BIG = 2500;
export type SimLink = { source: number; target: number; length: number; strength: number };

/** A node held by the pointer: grabbed, moved to a point (simulation coordinates), let go. */
export type DragMessage =
  | { type: "dragstart"; index: number }
  | { type: "drag"; index: number; x: number; y: number }
  | { type: "dragend"; index: number };

export type ToWorker =
  | { type: "layout"; generation: number; nodes: SimNode[]; links: SimLink[]; alpha: number; warm: boolean }
  | { type: "pause" }
  | { type: "resume" }
  | (DragMessage & { generation: number }); // for that layout only

export type FromWorker = { type: "positions"; generation: number; positions: Float32Array; settled: boolean };

/** How hard a node pushes the others away: folders much more than notes, so branches spread and leaves cluster. */
function charge(node: BrainNode): number {
  if (node.kind === "note") return -70;
  return node.depth === 0 ? -1000 : node.depth === 1 ? -700 : -320;
}

/** The rest length of a link between two nodes. */
function linkLength(source: BrainNode, target: BrainNode, kind: "contains" | "see_also"): number {
  if (kind === "see_also") return 120;
  if (target.kind === "folder") return target.depth === 1 ? 130 : 76;
  return source.r + 28 + 44 * hash01(target.id); // uneven, so a folder's notes read as branches, not a ring
}

/** The simulation's input for a layout: positions start at the layout's seeds. */
export function simulationOf(layout: Layout): { nodes: SimNode[]; links: SimLink[] } {
  const { nodes, links, seeds } = layout;
  return {
    nodes: nodes.map((n, i) => ({ x: seeds[2 * i], y: seeds[2 * i + 1], r: n.r, charge: charge(n), pinned: n.depth === 0 })),
    links: links.map((l) => ({
      source: l.source,
      target: l.target,
      length: linkLength(nodes[l.source], nodes[l.target], l.kind),
      strength: l.kind === "see_also" ? 0.02 : 0.7, // a See-also link must not knot two branches together
    })),
  };
}
