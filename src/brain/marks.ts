// Copyright 2026 Federico Cesarini, Marco Sassarini. SPDX-License-Identifier: AGPL-3.0-or-later
// What the rest of the app asks the brain to show, by id (the folder in focus, a cited note, the folder under a
// dragged file, the notes an answer read), as the node indices the canvas draws. The website adds `only`: the notes a
// search found, with the folders above them, stay lit while the rest of the brain dims.
import type { Marks } from "./draw";
import { folderOf, inSubtree, type Layout } from "./graphModel";

export type Highlights = {
  focus: string | null;
  lit: string | null;
  drop: string | null;
  glow: { paths: string[]; at: number } | null;
  only?: string[] | null;
};

export function marksFor(layout: Layout, wanted: Highlights): Pick<Marks, "lit" | "drop" | "inside" | "glow"> {
  // A brain drawn without its notes shows a note by its folder; otherwise a note no longer there shows nothing.
  const folder = (id: string) => (layout.foldersOnly ? layout.index.get(folderOf(id)) : undefined);
  const at = (id: string | null) => (id === null ? -1 : (layout.index.get(id) ?? folder(id) ?? -1));
  const { focus, lit, drop, glow, only } = wanted;
  const above = (id: string, n: { id: string; kind: string }) => n.kind === "folder" && (n.id === "/" || inSubtree(id, n.id));
  return {
    lit: at(lit),
    drop: at(drop),
    inside: only
      ? Uint8Array.from(layout.nodes, (n) => (only.includes(n.id) || only.some((id) => above(id, n)) ? 1 : 0))
      : focus && focus !== "/"
        ? Uint8Array.from(layout.nodes, (n) => (inSubtree(n.id, focus) ? 1 : 0))
        : null,
    glow: glow && { nodes: glow.paths.map(at).filter((i) => i >= 0), at: glow.at },
  };
}
