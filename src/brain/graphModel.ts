// Copyright 2026 Federico Cesarini, Marco Sassarini. SPDX-License-Identifier: AGPL-3.0-or-later
// The brain's data: /graph as indexed nodes and links, positions kept across refreshes, folder subtrees and names.
import type { Graph, GraphFolder, GraphLink, GraphNote } from "./types";

export type BrainNode = {
  id: string; // "/projects" for a folder ("/" for the root), "projects/q3.md" for a note
  kind: "folder" | "note";
  label: string; // as the user reads it: "Projects", "Q3 research notes"
  summary: string; // a note's summary, a folder's description
  area: string; // the top-level folder it lives in, "" at the root
  depth: number; // the root is 0; a note is one deeper than its folder
  parent: string | null;
  notes: number; // a folder's notes, its subfolders' included
  r: number; // its radius in layout units
  born: number; // when it appeared (ms), 0 if it was there on the first draw
};

export type BrainLink = { source: number; target: number; kind: GraphLink["kind"] };

export type Point = { x: number; y: number };

export type Layout = {
  nodes: BrainNode[];
  links: BrainLink[];
  index: Map<string, number>;
  seeds: Float32Array; // x0, y0, x1, y1…: the kept positions, and where each new node starts
  foldersOnly: boolean; // a very big wiki, drawn without its notes
};

const isFolder = (n: GraphFolder | GraphNote): n is GraphFolder => n.kind === "folder";

const RING = 150; // where the top-level folders of a brand-new layout start, around the root

/** Past this many notes the brain shows its folders only: that many dots would say nothing and slow the window. */
export const MAX_NOTES = 20_000;

/** The nodes a layout keeps: all of them, or the folders alone in a very big wiki. */
function kept(graph: Graph, maxNotes: number): (GraphFolder | GraphNote)[] {
  const notes = graph.nodes.reduce((sum, n) => sum + (n.kind === "note" ? 1 : 0), 0);
  return notes > maxNotes ? graph.nodes.filter(isFolder) : graph.nodes;
}

/** Disc sizes as in the mock: a large root, mid-size folders (a little larger with more notes), small notes. */
export function radius(node: Pick<BrainNode, "kind" | "depth" | "notes">): number {
  if (node.kind === "note") return node.depth <= 2 ? 5 : 3.8;
  if (node.depth === 0) return 26;
  if (node.depth === 1) return 11 + Math.min(4, Math.sqrt(node.notes) * 0.75);
  return 8 + Math.min(3, Math.sqrt(node.notes) * 0.5);
}

/**
 * The layout for `graph`: nodes that were already on screen keep their place (`previous`), new ones start next to
 * their folder and fade in from `now`. The order is stable (parents first, then by id), so the same graph always
 * lays out the same way.
 */
export function buildLayout(graph: Graph, previous: ReadonlyMap<string, Point>, now: number, maxNotes = MAX_NOTES): Layout {
  const parentOf = new Map<string, string>();
  for (const link of graph.links) if (link.kind === "contains") parentOf.set(link.target, link.source);
  const folderDepth = new Map(graph.nodes.filter(isFolder).map((f) => [f.id, f.depth]));
  const depthOf = (n: GraphFolder | GraphNote) => (isFolder(n) ? n.depth : (folderDepth.get(parentOf.get(n.id) ?? "") ?? 0) + 1);
  const shown = kept(graph, maxNotes);
  const ordered = shown
    .map((n) => ({ n, depth: depthOf(n) }))
    .sort((a, b) => a.depth - b.depth || (a.n.id < b.n.id ? -1 : a.n.id > b.n.id ? 1 : 0));
  const tops = ordered.filter(({ n, depth }) => isFolder(n) && depth === 1).map(({ n }) => n.id);

  const nodes: BrainNode[] = [];
  const index = new Map<string, number>();
  const seeds = new Float32Array(ordered.length * 2);
  const refresh = previous.size > 0;
  for (const { n, depth } of ordered) {
    const parent = parentOf.get(n.id) ?? null;
    const node: BrainNode = {
      id: n.id,
      kind: n.kind,
      label: isFolder(n) ? folderName(n.label) : n.label,
      summary: isFolder(n) ? n.description : n.summary,
      area: n.area,
      depth,
      parent,
      notes: isFolder(n) ? n.notes : 0,
      r: 0,
      born: 0,
    };
    node.r = radius(node);
    const kept = previous.get(n.id);
    if (refresh && !kept) node.born = now;
    const i = nodes.length;
    const ring = refresh ? -1 : tops.indexOf(n.id); // a new brain starts with its top folders round the root
    const at = kept ?? (ring >= 0 ? onRing(ring / tops.length) : nextTo(node, index.get(parent ?? ""), nodes, seeds));
    seeds[2 * i] = at.x;
    seeds[2 * i + 1] = at.y;
    index.set(n.id, i);
    nodes.push(node);
  }

  const links: BrainLink[] = [];
  for (const link of graph.links) {
    const source = index.get(link.source);
    const target = index.get(link.target);
    if (source !== undefined && target !== undefined && source !== target) links.push({ source, target, kind: link.kind });
  }
  return { nodes, links, index, seeds, foldersOnly: shown.length < graph.nodes.length };
}

const onRing = (turn: number): Point => ({ x: Math.cos(turn * Math.PI * 2) * RING, y: Math.sin(turn * Math.PI * 2) * RING });

/** Where a node without a kept position starts: next to its folder, at an angle of its own. */
function nextTo(node: BrainNode, parent: number | undefined, nodes: BrainNode[], seeds: Float32Array): Point {
  const turn = hash01(node.id);
  if (parent === undefined) return node.depth === 0 ? { x: 0, y: 0 } : onRing(turn);
  const reach = nodes[parent].r + node.r + (node.kind === "folder" ? 60 : 14);
  const angle = turn * Math.PI * 2;
  return { x: seeds[2 * parent] + Math.cos(angle) * reach, y: seeds[2 * parent + 1] + Math.sin(angle) * reach };
}

/** A stable number in [0, 1) for an id (FNV-1a): the same node gets the same start, and the same link length. */
export function hash01(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  return (h >>> 0) / 4294967296;
}

/** Whether a refresh brought the same nodes and links: then nothing needs to move. */
export function sameShape(layout: Layout, graph: Graph, maxNotes = MAX_NOTES): boolean {
  const { index } = layout;
  const nodes = kept(graph, maxNotes);
  const links = graph.links.filter((l) => l.source !== l.target && index.has(l.source) && index.has(l.target));
  return layout.nodes.length === nodes.length && nodes.every((n) => index.has(n.id)) && links.length === layout.links.length;
}

/** The node positions by id, to keep them in the next layout. */
export function positionsOf(layout: Layout, pos: Float32Array): Map<string, Point> {
  return new Map(layout.nodes.map((n, i) => [n.id, { x: pos[2 * i], y: pos[2 * i + 1] }]));
}

/** The folder a note is filed in: "a/b/n.md" → "/a/b", "n.md" → "/". */
export function folderOf(notePath: string): string {
  return `/${notePath.split("/").slice(0, -1).join("/")}`;
}

/** Whether a node lies in a folder's subtree; folders are "/a/b", notes "a/b/n.md", the root "/". */
export function inSubtree(id: string, folder: string): boolean {
  if (folder === "/") return true;
  return id === folder || id.startsWith(`${folder}/`) || id.startsWith(`${folder.slice(1)}/`);
}

/** A folder's name as the user reads it: "meeting-notes" → "Meeting notes". */
export function folderName(name: string): string {
  const spaced = name.replace(/[-_]+/g, " ").trim();
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : name;
}

/** The folders a note or folder lives in, readable: "projects/crow/q3.md" → ["Projects", "Crow"]. */
export function folderTrail(path: string): string[] {
  const parts = path.split("/").filter(Boolean);
  if (parts.length && parts[parts.length - 1].endsWith(".md")) parts.pop();
  return parts.map(folderName);
}
