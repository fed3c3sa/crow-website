// Copyright 2026 Federico Cesarini, Marco Sassarini. SPDX-License-Identifier: AGPL-3.0-or-later
// The brain's camera: d3-zoom pans and zooms it (a press on a node drags the node instead); until the user pans or
// zooms, it frames itself in the part of the window the chat leaves free, and glides to the new frame when that part
// changes. On the website `allow` decides which gestures are the brain's: a wheel zooms only once the brain is being
// explored (or with Ctrl/⌘), and a touch pans it only after "Explore", so the page still scrolls past it.
import { select } from "d3-selection";
import { zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import { fitTransform, type Box, type Transform } from "./fit";

const GLIDE_MS = 650;
const LABEL_ROOM = 56; // the top-level folders' names stick out to the right of the layout
const K_MIN = 0.06; // far enough out to frame a brain of thousands of notes
const K_MAX = 5;

export class Camera {
  t: ZoomTransform = zoomIdentity;
  /** The closest the brain frames itself: the app keeps a small brain small (1.3); the website lets it fill its stage. */
  frameMax = 1.3;
  private readonly zoomer: ZoomBehavior<HTMLCanvasElement, unknown>;
  private moved = false; // the user panned or zoomed: the brain stops framing itself
  private glide: { from: Transform; to: Transform; start: number } | null = null;
  private free: Box | null = null;
  private anchor: number | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    onChange: () => void,
    onNode: (x: number, y: number) => boolean, // whether a point of the canvas is on a node
    allow: (event: Event) => boolean = () => true, // whether a gesture is the brain's, or the page's
  ) {
    const local = (event: MouseEvent | TouchEvent) => {
      const point = "touches" in event ? event.touches[0] : event;
      const box = canvas.getBoundingClientRect();
      return point ? onNode(point.clientX - box.left, point.clientY - box.top) : false;
    };
    this.zoomer = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([K_MIN, K_MAX])
      .clickDistance(4)
      // d3's own filter (no right button, no ctrl but to zoom), and a press on a node is the node's.
      .filter(
        (event: MouseEvent | TouchEvent) =>
          allow(event) &&
          (!event.ctrlKey || event.type === "wheel") &&
          !("button" in event && event.button) &&
          (event.type === "wheel" || !local(event)),
      )
      .on("zoom", (event: D3ZoomEvent<HTMLCanvasElement, unknown>) => {
        this.t = event.transform;
        if (event.sourceEvent) {
          this.moved = true;
          this.glide = null;
        }
        onChange();
      });
    select(canvas).call(this.zoomer).on("dblclick.zoom", null);
  }

  /** Whether the brain still frames itself: the user has not moved it yet. */
  get framing() {
    return !this.moved;
  }

  /** Where the brain may rest (window px) and where its root sits (null: centred); true if that changed. */
  setFree(free: Box, anchor: number | null): boolean {
    const old = this.free;
    if (old && this.anchor === anchor && old.x0 === free.x0 && old.y0 === free.y0 && old.x1 === free.x1 && old.y1 === free.y1) return false;
    this.free = free;
    this.anchor = anchor;
    return true;
  }

  /** Frames the layout's `bounds`, its root at layout x `rootX`, at once or gliding there. */
  frame(bounds: Box, rootX: number | null, glide: boolean) {
    const free = this.free;
    if (!free) return;
    const area = { ...free, x1: Math.max(free.x0 + 80, free.x1 - LABEL_ROOM) };
    const anchor = this.anchor !== null && rootX !== null ? { layoutX: rootX, screenX: this.anchor } : undefined;
    const to = fitTransform(bounds, area, K_MIN, this.frameMax, anchor); // never framed closer than this: a small brain stays small
    if (glide) this.glide = { from: { k: this.t.k, x: this.t.x, y: this.t.y }, to, start: performance.now() };
    else this.apply(to);
  }

  /** Zooms by `factor` around the canvas's centre, gliding there; the brain stops framing itself. */
  zoomBy(factor: number) {
    const { width, height } = this.canvas.getBoundingClientRect();
    const k = Math.max(K_MIN, Math.min(K_MAX, this.t.k * factor));
    const cx = width / 2;
    const cy = height / 2;
    const to = { k, x: cx - ((cx - this.t.x) / this.t.k) * k, y: cy - ((cy - this.t.y) / this.t.k) * k };
    this.moved = true;
    this.glide = { from: { k: this.t.k, x: this.t.x, y: this.t.y }, to, start: performance.now() };
  }

  /** The brain frames itself again, as before the user moved it. */
  release() {
    this.moved = false;
  }

  /** Stops a glide where it is. */
  halt() {
    this.glide = null;
  }

  /** Moves a glide on to `now`; true while one is under way. */
  step(now: number): boolean {
    if (!this.glide) return false;
    const { from, to, start } = this.glide;
    const p = Math.min(1, (now - start) / GLIDE_MS);
    const e = 1 - (1 - p) ** 3;
    if (p >= 1) this.glide = null;
    this.apply({ k: from.k + (to.k - from.k) * e, x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e });
    return this.glide !== null;
  }

  destroy() {
    select(this.canvas).on(".zoom", null);
  }

  private apply({ k, x, y }: Transform) {
    this.zoomer.transform(select(this.canvas), zoomIdentity.translate(x, y).scale(k));
  }
}
