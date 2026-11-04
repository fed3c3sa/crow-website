// Copyright 2026 Federico Cesarini, Marco Sassarini. SPDX-License-Identifier: AGPL-3.0-or-later
// The brain's layout on the page's own thread: the Crow app's graph.worker.ts, with the same forces, seed and drag
// physics, stepped by the view's frames instead of a worker's timer. The example brain is small enough for that.
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { Drags } from "./dragPhysics";
import { BIG, type DragMessage, type SimLink, type SimNode } from "./forces";

type Node = SimulationNodeDatum & SimNode;
type Link = SimulationLinkDatum<Node> & Pick<SimLink, "length" | "strength">;

const WARM_MS = 400; // a new brain settles this long before it is first shown
const LEAN = 110; // how far right of the root the branches are drawn to

export class Sim {
  private sim: Simulation<Node, Link> | null = null;
  private readonly drags = new Drags<Node>();

  start(nodes: SimNode[], links: SimLink[], alpha: number, warm: boolean): Float32Array {
    this.drags.reset();
    this.sim = forceSimulation<Node, Link>(nodes.map((n) => ({ ...n, fx: n.pinned ? n.x : undefined, fy: n.pinned ? n.y : undefined })))
      .randomSource(seeded(7)) // the same wiki always draws the same brain
      .force(
        "link",
        forceLink<Node, Link>(links.map((l) => ({ ...l })))
          .distance((l) => l.length)
          .strength((l) => l.strength),
      )
      .force("charge", forceManyBody<Node>().strength((n) => n.charge).distanceMax(900).theta(0.9))
      .force("collide", forceCollide<Node>((n) => n.r + 4).iterations(2))
      .force("x", forceX<Node>((n) => (n.pinned ? 0 : LEAN)).strength(0.045))
      .force("y", forceY<Node>(0).strength(0.026))
      .alpha(alpha)
      .alphaDecay(nodes.length > BIG ? 0.045 : 0.0228)
      .stop();
    if (warm) {
      const until = performance.now() + WARM_MS;
      while (this.sim.alpha() > 0.03 && performance.now() < until) this.sim.tick();
    }
    return this.positions();
  }

  drag(message: DragMessage) {
    if (!this.sim) return;
    if (message.type === "dragstart") this.drags.start(this.sim, message.index);
    else if (message.type === "drag") this.drags.move(this.sim, message.index, message.x, message.y);
    else this.drags.end(this.sim, message.index, performance.now());
  }

  /** Gives the layout a shake, as a refresh does in the app: everything moves a little and settles again. */
  reheat(alpha = 0.35) {
    this.sim?.alpha(Math.max(this.sim.alpha(), alpha));
  }

  /** Whether another step is due. */
  get running() {
    return !!this.sim && (this.sim.alpha() >= this.sim.alphaMin() || this.drags.moving);
  }

  /** One step; the positions after it. */
  step(now: number): Float32Array {
    if (!this.sim) return new Float32Array(0);
    this.drags.step(this.sim, now);
    this.sim.tick();
    return this.positions();
  }

  private positions(): Float32Array {
    const nodes = this.sim!.nodes();
    const positions = new Float32Array(nodes.length * 2);
    nodes.forEach((n, i) => {
      positions[2 * i] = n.x ?? 0;
      positions[2 * i + 1] = n.y ?? 0;
    });
    return positions;
  }
}

/** A seeded random source (an LCG): d3-force only uses it to separate nodes that start on the same spot. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
