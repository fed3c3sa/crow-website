// Copyright 2026 Federico Cesarini, Marco Sassarini. SPDX-License-Identifier: AGPL-3.0-or-later
// Dragging a node of the brain: a press on a node that moves 3px or more becomes a drag the layout worker follows
// (dragPhysics.ts); a shorter press stays a click. A press on empty space is left to d3-zoom, which pans. A press also
// ends when the pointer capture is lost or the window loses focus (WebKit may send neither pointerup nor pointercancel
// then): a press left behind would keep the hover off, the layout warm and every later press ignored.
import type { DragMessage } from "./forces";

const CLICK_PX = 3;

export type DragHost = {
  pick: (x: number, y: number) => number; // the node under a point of the canvas, or -1
  toSim: (x: number, y: number) => [number, number]; // a point of the canvas in simulation coordinates
  at: (index: number) => [number, number]; // where a node is, in simulation coordinates
  send: (message: DragMessage) => void;
  hold: (index: number | null) => void; // a node is held, or let go
};

type Press = { index: number; pointer: number; x0: number; y0: number; grab: [number, number]; node: [number, number]; dragging: boolean };

export class NodeDrag {
  private press: Press | null = null;
  private swallow = false; // the click that ends a drag is not a click on the node

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly host: DragHost,
  ) {
    canvas.addEventListener("pointerdown", this.down);
    canvas.addEventListener("pointermove", this.move);
    canvas.addEventListener("pointerup", this.up);
    canvas.addEventListener("pointercancel", this.up);
    canvas.addEventListener("lostpointercapture", this.up);
    if (typeof window !== "undefined") window.addEventListener("blur", this.abandon);
  }

  /** Whether a node is being dragged right now. */
  get dragging() {
    return this.press?.dragging ?? false;
  }

  /** True once for the click that ends a drag: that click is not a click on the node. */
  swallowClick(): boolean {
    const swallow = this.swallow;
    this.swallow = false;
    return swallow;
  }

  /** Lets go of the node without a drop: the layout was rebuilt under it (the worker forgets its drags then). */
  cancel() {
    const held = this.press?.dragging;
    this.press = null;
    if (held) this.host.hold(null);
  }

  destroy() {
    this.canvas.removeEventListener("pointerdown", this.down);
    this.canvas.removeEventListener("pointermove", this.move);
    this.canvas.removeEventListener("pointerup", this.up);
    this.canvas.removeEventListener("pointercancel", this.up);
    this.canvas.removeEventListener("lostpointercapture", this.up);
    if (typeof window !== "undefined") window.removeEventListener("blur", this.abandon);
  }

  private local(event: PointerEvent): [number, number] {
    const box = this.canvas.getBoundingClientRect();
    return [event.clientX - box.left, event.clientY - box.top];
  }

  private readonly down = (event: PointerEvent) => {
    this.swallow = false;
    if (event.button !== 0) return;
    if (this.press) this.end(this.press, false); // one left behind (its release never came): this press replaces it
    const [x, y] = this.local(event);
    const index = this.host.pick(x, y);
    if (index < 0) return;
    this.canvas.setPointerCapture(event.pointerId);
    this.press = { index, pointer: event.pointerId, x0: x, y0: y, grab: this.host.toSim(x, y), node: this.host.at(index), dragging: false };
  };

  private readonly move = (event: PointerEvent) => {
    const press = this.press;
    if (!press || event.pointerId !== press.pointer) return;
    const [x, y] = this.local(event);
    if (!press.dragging) {
      if (Math.hypot(x - press.x0, y - press.y0) < CLICK_PX) return;
      press.dragging = true;
      this.host.send({ type: "dragstart", index: press.index });
      this.host.hold(press.index);
    }
    // As with d3.drag, the node keeps its offset from the pointer instead of jumping under it.
    const [sx, sy] = this.host.toSim(x, y);
    this.host.send({ type: "drag", index: press.index, x: press.node[0] + sx - press.grab[0], y: press.node[1] + sy - press.grab[1] });
  };

  /** pointerup, pointercancel or lostpointercapture (which also follows a normal release: the press is gone by then). */
  private readonly up = (event: PointerEvent) => {
    const press = this.press;
    if (!press || event.pointerId !== press.pointer) return;
    this.end(press, event.type === "pointerup");
  };

  private readonly abandon = () => {
    if (this.press) this.end(this.press, false);
  };

  private end(press: Press, released: boolean) {
    this.press = null;
    if (!press.dragging) return; // a click: the canvas's click handler opens or focuses the node
    this.swallow = released; // only a real release is followed by a click to swallow
    this.host.send({ type: "dragend", index: press.index });
    this.host.hold(null);
  }
}
