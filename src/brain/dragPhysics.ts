// Copyright 2026 Federico Cesarini, Marco Sassarini. SPDX-License-Identifier: AGPL-3.0-or-later
// Dragging a node, with llm-wiki-v2's d3.drag physics (web/graph.js): while a node is held the simulation runs warm
// (alphaTarget 0.2) and the node is pinned under the pointer; let go, the simulation cools (alphaTarget 0) and the
// node is free again. A node that was pinned before (the root, which holds the composition) glides back to its pin.

/** What dragging needs of a d3-force node. */
type Pinnable = { x?: number; y?: number; fx?: number | null; fy?: number | null };

/** What dragging needs of a d3-force simulation. */
type Sim<N extends Pinnable> = { nodes(): N[]; alphaTarget(target: number): unknown };

/** llm-wiki-v2's `sim.alphaTarget(0.2)` while a node is held. */
export const HELD_ALPHA = 0.2;

const RETURN_MS = 350; // a pinned node let go of glides back to its pin

type Pin = { fx: number; fy: number } | null;

export class Drags<N extends Pinnable> {
  private readonly held = new Map<number, Pin>(); // the nodes held, with the pin each had before
  private readonly returning = new Map<number, { x: number; y: number; to: { fx: number; fy: number }; at: number }>();

  /** Whether the simulation must keep ticking: a node is held, or one is gliding back to its pin. */
  get moving() {
    return this.held.size > 0 || this.returning.size > 0;
  }

  /** d3.drag's start: warm the simulation if no other node is held, and pin the node where it is. */
  start(sim: Sim<N>, index: number) {
    const node = sim.nodes()[index];
    if (!node || this.held.has(index)) return;
    if (this.held.size === 0) sim.alphaTarget(HELD_ALPHA);
    const wasReturning = this.returning.get(index);
    this.returning.delete(index);
    const pinned = node.fx != null && node.fy != null;
    this.held.set(index, wasReturning ? wasReturning.to : pinned ? { fx: node.fx as number, fy: node.fy as number } : null);
    node.fx = node.x;
    node.fy = node.y;
  }

  /** d3.drag's drag: the node follows the pointer (in simulation coordinates). */
  move(sim: Sim<N>, index: number, x: number, y: number) {
    const node = sim.nodes()[index];
    if (!node || !this.held.has(index)) return;
    node.fx = x;
    node.fy = y;
  }

  /** d3.drag's end: cool the simulation once no node is held, and free the node, or send it back to its old pin. */
  end(sim: Sim<N>, index: number, now: number) {
    const node = sim.nodes()[index];
    if (!node || !this.held.has(index)) return;
    const pin = this.held.get(index) ?? null;
    this.held.delete(index);
    if (this.held.size === 0) sim.alphaTarget(0);
    if (!pin) {
      node.fx = null;
      node.fy = null;
      return;
    }
    this.returning.set(index, { x: node.fx ?? node.x ?? pin.fx, y: node.fy ?? node.y ?? pin.fy, to: pin, at: now });
  }

  /** Moves the nodes gliding back toward their pins; call before each tick. */
  step(sim: Sim<N>, now: number) {
    for (const [index, back] of this.returning) {
      const node = sim.nodes()[index];
      const p = Math.min(1, Math.max(0, (now - back.at) / RETURN_MS));
      const eased = 1 - (1 - p) ** 3;
      if (node) {
        node.fx = back.x + (back.to.fx - back.x) * eased;
        node.fy = back.y + (back.to.fy - back.y) * eased;
      }
      if (p >= 1) this.returning.delete(index);
    }
  }

  /** Forgets every drag: the layout was rebuilt. */
  reset() {
    this.held.clear();
    this.returning.clear();
  }
}
