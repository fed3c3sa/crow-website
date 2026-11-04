// Copyright 2026 Federico Cesarini, Marco Sassarini. SPDX-License-Identifier: AGPL-3.0-or-later
// The brain on a canvas, as the Crow app's graphView.ts draws it: the camera to pan and zoom, a quadtree for hover,
// clicks and node drags, and the app's own painting. The layout runs on this thread (sim.ts) instead of a worker.
// It draws only when something changed and sleeps otherwise.
import { Camera } from "./camera";
import { discScale, drawBrain, paintOf, type Marks, type Paint } from "./draw";
import { boundsOf, type Box } from "./fit";
import { simulationOf, type DragMessage } from "./forces";
import { buildLayout, type BrainNode, type Layout } from "./graphModel";
import { Picker } from "./hitTest";
import { marksFor, type Highlights } from "./marks";
import { NodeDrag } from "./nodeDrag";
import { readPalette, type Palette } from "./palette";
import { Sim } from "./sim";
import type { Graph } from "./types";

/** A node under the pointer, with where it is drawn (canvas px). */
export type Hover = { node: BrainNode; x: number; y: number; r: number };

export type ViewEvents = {
  hover: (hover: Hover | null) => void;
  note: (node: BrainNode) => void; // a note was clicked
  folder: (node: BrainNode | null) => void; // a folder was clicked, or empty space (null)
  moved: () => void; // the user panned, zoomed or dragged
};

const SLOP = 6; // px around a disc that still count as on it

/** Which gestures are the brain's: a wheel may zoom it, a touch may pan it and drag its nodes. */
export type Gate = { wheel: (event: WheelEvent) => boolean; touch: () => boolean };

export class GraphView {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly sim = new Sim();
  private readonly camera: Camera;
  private readonly palette: Palette = readPalette();
  private readonly resizer = new ResizeObserver(() => this.resize());
  private layout: Layout | null = null;
  private paint: Paint | null = null;
  private radii = new Float32Array(0);
  private pos: Float32Array = new Float32Array(0);
  private picker = new Picker([]);
  private readonly drag: NodeDrag;
  private size = { width: 0, height: 0, dpr: 1 };
  private shown = false;
  private settledOnce = false;
  private wanted: Highlights = { focus: null, lit: null, drop: null, glow: null };
  private marks: Marks = { hover: -1, hoverAt: 0, lit: -1, drop: -1, inside: null, glow: null };
  private reported = "";
  private frame = 0;
  private visible = true;
  private pointer = "mouse"; // the kind of the last press: a touch is the page's until the brain is explored

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly events: ViewEvents,
    gate: Gate,
  ) {
    this.ctx = canvas.getContext("2d")!;
    canvas.addEventListener("pointerdown", (event) => (this.pointer = event.pointerType), { capture: true });
    const allow = (event: Event) =>
      event.type === "wheel" ? gate.wheel(event as WheelEvent) : event.type.startsWith("touch") ? gate.touch() : true;
    this.camera = new Camera(
      canvas,
      () => {
        if (!this.camera.framing) this.events.moved();
        this.invalidate();
      },
      (x, y) => this.pick(x, y, SLOP) >= 0,
      allow,
    );
    this.camera.frameMax = 1.75;
    this.drag = new NodeDrag(canvas, {
      pick: (x, y) => (this.pointer === "touch" && !gate.touch() ? -1 : this.pick(x, y, this.pointer === "touch" ? 14 : SLOP)),
      toSim: (x, y) => [(x - this.camera.t.x) / this.camera.t.k, (y - this.camera.t.y) / this.camera.t.k],
      at: (i) => [this.pos[2 * i], this.pos[2 * i + 1]],
      send: (message) => this.send(message),
      hold: (i) => this.hold(i),
    });
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerleave", this.onLeave);
    canvas.addEventListener("click", this.onClick);
    this.resizer.observe(canvas);
    new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting; // off screen, the brain stops stepping and painting
      this.invalidate();
    }).observe(canvas);
    void document.fonts?.ready.then(() => this.invalidate()); // labels drawn before Inter loaded
  }

  setGraph(graph: Graph) {
    const layout = buildLayout(graph, new Map(), performance.now());
    this.layout = layout;
    this.paint = paintOf(layout, this.palette);
    this.radii = Float32Array.from(layout.nodes, (n) => n.r);
    this.resolve();
    const { nodes, links } = simulationOf(layout);
    this.pos = this.sim.start(nodes, links, 1, true);
    this.picker = new Picker(this.radii);
    this.picker.update(this.pos);
    this.shown = true;
    this.frameIt(false);
    this.invalidate();
  }

  /** The part of the canvas the card leaves free (canvas px). */
  setFree(free: Box) {
    if (this.camera.setFree(free, null) && this.shown && this.camera.framing) this.frameIt(true);
  }

  setHighlights(highlights: Highlights) {
    this.wanted = highlights;
    this.resolve();
    this.invalidate();
  }

  zoomBy(factor: number) {
    this.camera.zoomBy(factor);
    this.events.moved();
    this.invalidate();
  }

  /** Frames the whole brain again, and lets it keep framing itself. */
  refit() {
    this.camera.release();
    this.frameIt(true);
  }

  /** Shakes the layout a little, so it can be watched settling again. */
  shake() {
    this.sim.reheat(0.6);
    this.invalidate();
  }

  /** Where a node is drawn, by id (canvas px), or null. */
  screenOf(id: string): { x: number; y: number } | null {
    const i = this.layout?.index.get(id);
    if (i === undefined) return null;
    const { k, x, y } = this.camera.t;
    return { x: x + this.pos[2 * i] * k, y: y + this.pos[2 * i + 1] * k };
  }

  colorOf(id: string): string {
    const i = this.layout?.index.get(id);
    return (i !== undefined && this.paint?.fills[i]) || this.palette.root;
  }

  private send(message: DragMessage) {
    this.sim.drag(message);
    if (message.type === "dragstart") this.events.moved();
    this.invalidate();
  }

  private resolve() {
    if (!this.layout) return;
    Object.assign(this.marks, marksFor(this.layout, this.wanted));
    if (this.marks.hover >= this.layout.nodes.length) this.marks.hover = -1;
  }

  private frameIt(glide: boolean) {
    const bounds = boundsOf(this.pos, this.radii);
    if (!bounds || !this.size.width || this.drag.dragging) return;
    this.camera.frame(bounds, null, glide);
    this.invalidate();
  }

  private pick(x: number, y: number, slop: number, accept?: (i: number) => boolean): number {
    if (!this.layout || !this.shown) return -1;
    const { k, x: tx, y: ty } = this.camera.t;
    return this.picker.pick((x - tx) / k, (y - ty) / k, { slop: slop / k, scale: discScale(k) / k, accept });
  }

  private hold(index: number | null) {
    if (index !== null) {
      this.camera.halt();
      this.marks.hover = index;
    }
    this.canvas.style.cursor = index !== null ? "grabbing" : this.marks.hover >= 0 ? "grab" : "";
    this.invalidate();
  }

  private local(event: MouseEvent): [number, number] {
    const box = this.canvas.getBoundingClientRect();
    return [event.clientX - box.left, event.clientY - box.top];
  }

  private readonly onMove = (event: PointerEvent) => {
    if (event.buttons || !this.shown) return; // panning
    const i = this.pick(...this.local(event), event.pointerType === "touch" ? 14 : SLOP);
    if (i === this.marks.hover) return;
    this.marks.hover = i;
    this.marks.hoverAt = performance.now();
    this.canvas.style.cursor = i >= 0 ? "grab" : "";
    this.invalidate();
  };

  private readonly onLeave = () => {
    if (this.marks.hover < 0) return;
    this.marks.hover = -1;
    this.canvas.style.cursor = "";
    this.invalidate();
  };

  private readonly onClick = (event: MouseEvent) => {
    if (this.drag.swallowClick()) return; // the end of a drag
    const i = this.pick(...this.local(event), (event as PointerEvent).pointerType === "touch" ? 14 : SLOP);
    const node = i >= 0 ? this.layout!.nodes[i] : null;
    if (node?.kind === "note") this.events.note(node);
    else this.events.folder(node && node.depth > 0 ? node : null);
  };

  private resize() {
    const box = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.size = { width: box.width, height: box.height, dpr };
    this.canvas.width = Math.max(1, Math.round(box.width * dpr));
    this.canvas.height = Math.max(1, Math.round(box.height * dpr));
    if (this.shown && this.camera.framing) this.frameIt(false);
    this.invalidate();
  }

  private invalidate() {
    if (!this.frame) this.frame = requestAnimationFrame(this.draw);
  }

  private readonly draw = () => {
    this.frame = 0;
    if (!this.layout || !this.paint || !this.shown || !this.visible || document.hidden) return;
    const now = performance.now();
    let moving = false;
    if (this.sim.running) {
      this.pos = this.sim.step(now);
      this.picker.update(this.pos);
      moving = true;
      if (!this.sim.running && this.camera.framing && !this.settledOnce) {
        this.settledOnce = true;
        this.frameIt(true); // the layout grew while it settled: glide to the new frame
      }
    }
    const gliding = this.camera.step(now);
    const { width, height, dpr } = this.size;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const frame = { ctx: this.ctx, width, height, t: this.camera.t, layout: this.layout, pos: this.pos, palette: this.palette };
    if (drawBrain({ ...frame, paint: this.paint, marks: this.marks, now }) || gliding || moving) this.invalidate();
    this.report();
  };

  private report() {
    const i = this.drag.dragging ? -1 : this.marks.hover;
    const node = i >= 0 ? this.layout?.nodes[i] : undefined;
    const { k, x, y } = this.camera.t;
    const hover = node && { node, x: x + this.pos[2 * i] * k, y: y + this.pos[2 * i + 1] * k, r: node.r * discScale(k) };
    const key = hover ? `${i}:${Math.round(hover.x)}:${Math.round(hover.y)}` : "";
    if (key === this.reported) return;
    this.reported = key;
    this.events.hover(hover ?? null);
  }
}
