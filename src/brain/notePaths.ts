// Copyright 2026 Federico Cesarini, Marco Sassarini. SPDX-License-Identifier: AGPL-3.0-or-later
// Links inside a note: a relative .md link opens that note in place, the title heading is not shown twice.

/** The wiki path a link in note `from` points to, or null if it is not a note of the wiki. */
export function resolveNoteLink(from: string, href: string): string | null {
  const bare = href.split(/[?#]/)[0];
  if (!bare.toLowerCase().endsWith(".md") || /^[a-z][a-z0-9+.-]*:/i.test(bare)) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(bare);
  } catch {
    return null;
  }
  const parts = decoded.startsWith("/") ? [] : from.split("/").slice(0, -1);
  for (const part of decoded.split("/")) {
    if (part === "..") {
      if (!parts.length) return null; // above the wiki
      parts.pop();
    } else if (part && part !== ".") {
      parts.push(part);
    }
  }
  return parts.length ? parts.join("/") : null;
}

/** A note's body without a first "# Title" heading that only repeats its title. */
export function withoutTitle(body: string, title: string): string {
  const match = /^\s*#\s+(.+?)\s*#*\s*(?:\n|$)/.exec(body);
  if (!match || match[1].trim().toLowerCase() !== title.trim().toLowerCase()) return body;
  return body.slice(match[0].length).replace(/^\s+/, "");
}
