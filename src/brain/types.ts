// Copyright 2026 Federico Cesarini, Marco Sassarini. SPDX-License-Identifier: AGPL-3.0-or-later
// The /graph shapes, as in the Crow app (src/lib/types.ts).


export type GraphFolder = {
  id: string; // "/projects", "/" for the root
  kind: "folder";
  label: string;
  description: string;
  area: string; // the top-level folder's name, "" for the root
  depth: number;
  notes: number;
};

export type GraphNote = { id: string; kind: "note"; label: string; summary: string; area: string };

export type GraphLink = { source: string; target: string; kind: "contains" | "see_also" };

export type Graph = { nodes: (GraphFolder | GraphNote)[]; links: GraphLink[] };

