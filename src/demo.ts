// Copyright 2026 Federico Cesarini, Marco Sassarini. SPDX-License-Identifier: AGPL-3.0-or-later
// "Explore a brain": the example wiki of `llmwiki2 demo` drawn by the Crow app's own brain, with its folders, its notes
// to read, a search that lights notes up, and four questions whose answers were recorded from llmwiki2 in CROW mode.
// Nothing here calls a model: the answers, the classifier's scores and the costs are the recorded ones.
import type { BrainNode } from "./brain/graphModel";
import { folderName } from "./brain/graphModel";
import type { Highlights } from "./brain/marks";
import type { Graph } from "./brain/types";
import { GraphView, type Hover } from "./brain/view";

type Note = {
  title: string;
  summary: string;
  tags: string[];
  trail: string[];
  html: string;
  sources: { title: string; file: string }[];
};
type Scored = [string, number, boolean];
type Answer = {
  question: string;
  html: string;
  citations: string[];
  read: string[];
  trace: { folders: Scored[]; subfolders: Scored[]; notes: Scored[]; fallback: boolean };
  usage: {
    writer: string;
    classifier: string;
    llmCalls: number;
    llmTokens: number;
    classifierCalls: number;
    classifierTokens: number;
    seconds: number;
    usd: number;
  };
};
type Demo = { recorded: string; engine: string; graph: Graph; notes: Record<string, Note>; answers: Answer[] };

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!;
const el = (tag: string, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarse = matchMedia("(pointer: coarse)").matches;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));

const ICON = {
  folder:
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>',
  note: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>',
  file: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>',
  chevron:
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
};

async function main() {
  const root = $("[data-explore]");
  const canvas = $<HTMLCanvasElement>(".ws-canvas", root);
  const stage = $(".ws-stage", root);
  const card = $(".ws-card", root);
  const cardTitle = $(".ws-card-title", card);
  const cardBody = $(".ws-card-body", card);
  const hoverCard = $(".ws-hover", root);
  const input = $<HTMLInputElement>(".ws-input", root);
  const results = $(".ws-results", root);
  const refit = $<HTMLButtonElement>("[data-act=fit]", root);

  const demo: Demo = await fetch(new URL("../data/demo.json", import.meta.url)).then((r) => r.json());
  const nodes = new Map(demo.graph.nodes.map((n) => [n.id, n]));
  const noteIds = demo.graph.nodes.filter((n) => n.kind === "note").map((n) => n.id);

  // -- what the brain shows --------------------------------------------------------------------------------------
  const wanted: Highlights = { focus: null, lit: null, drop: null, glow: null, only: null };
  const show = (change: Partial<Highlights>) => {
    Object.assign(wanted, change);
    view.setHighlights({ ...wanted });
    markTree();
  };

  // A touch is the page's until "Explore the brain"; a wheel zooms once the brain was pressed, or with Ctrl/⌘.
  let touchOn = !coarse;
  let engaged = false;
  stage.addEventListener("pointerdown", () => (engaged = true));
  stage.addEventListener("pointerleave", () => (engaged = false));
  const lockTouch = (on: boolean) => {
    touchOn = on;
    canvas.style.touchAction = on ? "none" : "pan-y";
    root.toggleAttribute("data-touch-on", on);
  };

  const view = new GraphView(
    canvas,
    {
      hover: (hover) => showHover(hover),
      note: (node) => openNote(node.id),
      folder: (node) => (node ? openFolder(node.id) : clearFocus()),
      moved: () => (refit.hidden = false),
    },
    { wheel: (e) => engaged || e.ctrlKey || e.metaKey, touch: () => touchOn },
  );
  lockTouch(touchOn);
  view.setGraph(demo.graph);
  layoutFree();
  new ResizeObserver(layoutFree).observe(stage);

  /** The brain frames itself in the part of the stage the card leaves free. */
  function layoutFree() {
    const box = stage.getBoundingClientRect();
    const wide = box.width >= 820;
    const cardOpen = !card.hidden && wide;
    const right = cardOpen ? card.getBoundingClientRect().width + 36 : 24;
    view.setFree({ x0: 24, y0: 24, x1: Math.max(120, box.width - right), y1: box.height - (wide ? 110 : 96) });
  }

  // -- the hover card ---------------------------------------------------------------------------------------------
  function showHover(hover: Hover | null) {
    if (!hover) {
      hoverCard.hidden = true;
      return;
    }
    const { node, x, y, r } = hover;
    const note = node.kind === "note";
    hoverCard.replaceChildren();
    hoverCard.append(el("p", "hc-title", node.label));
    if (node.summary) hoverCard.append(el("p", "hc-summary", node.summary));
    const meta = el("p", "hc-meta");
    meta.innerHTML = note ? ICON.folder : ICON.note;
    meta.append(
      note
        ? demo.notes[node.id]?.trail.join(" › ") || "Your wiki"
        : `${node.notes} ${node.notes === 1 ? "note" : "notes"}`,
    );
    hoverCard.append(meta);
    hoverCard.hidden = false;
    const box = stage.getBoundingClientRect();
    const width = 270;
    const toRight = x + r + 14 + width <= box.width - 12;
    hoverCard.style.left = toRight ? `${x + r + 14}px` : "";
    hoverCard.style.right = toRight ? "" : `${box.width - (x - r - 14)}px`;
    hoverCard.style.top = `${Math.max(8, Math.min(y - 16, box.height - 150))}px`;
  }

  // -- the sidebar: questions and folders -------------------------------------------------------------------------
  const questionList = $(".ws-questions", root);
  demo.answers.forEach((a, i) => {
    const li = el("li");
    const b = el("button", "ws-row", a.question) as HTMLButtonElement;
    b.type = "button";
    b.dataset.answer = String(i);
    b.addEventListener("click", () => void ask(i));
    li.append(b);
    questionList.append(li);
  });

  const tree = $(".ws-tree", root);
  const children = (id: string) =>
    demo.graph.links.filter((l) => l.kind === "contains" && l.source === id).map((l) => nodes.get(l.target)!);
  const color = (id: string) => view.colorOf(id);
  function branch(id: string, depth: number): HTMLElement {
    const ul = el("ul", depth ? "ws-sub" : "");
    const kids = children(id).sort((a, b) => (a.kind === b.kind ? a.label.localeCompare(b.label) : a.kind === "folder" ? -1 : 1));
    for (const kid of kids) {
      const li = el("li");
      const b = el("button", `ws-row ws-${kid.kind}`) as HTMLButtonElement;
      b.type = "button";
      b.dataset.id = kid.id;
      b.style.paddingLeft = `${12 + depth * 14}px`;
      if (kid.kind === "folder") {
        const dot = el("span", "ws-dot");
        dot.style.background = color(kid.id);
        b.append(dot, el("span", "ws-name", folderName(kid.label)), el("span", "ws-count", String(kid.notes)));
        b.addEventListener("click", () => openFolder(kid.id));
        li.append(b, branch(kid.id, depth + 1));
      } else {
        b.innerHTML = ICON.file;
        b.append(el("span", "ws-name", kid.label));
        b.addEventListener("click", () => openNote(kid.id));
        b.addEventListener("pointerenter", () => show({ lit: kid.id }));
        b.addEventListener("pointerleave", () => show({ lit: null }));
        li.append(b);
      }
      ul.append(li);
    }
    return ul;
  }
  tree.append(branch("/", 0));
  function markTree() {
    tree.querySelectorAll<HTMLElement>("[data-id]").forEach((b) => {
      const id = b.dataset.id!;
      b.toggleAttribute("data-current", id === current.note || id === wanted.focus);
    });
    questionList.querySelectorAll<HTMLElement>("[data-answer]").forEach((b) => b.toggleAttribute("data-current", Number(b.dataset.answer) === current.answer));
  }

  // -- the card ---------------------------------------------------------------------------------------------------
  const current = { note: null as string | null, answer: -1, back: null as (() => void) | null, token: 0 };
  $("[data-act=close]", card).addEventListener("click", () => {
    closeCard();
    clearFocus();
  });
  /** Shows the card; on a phone, where it sits under the brain, a tap brings it into view (an automatic answer does not). */
  function openCard(title: string, reveal = true) {
    const wasHidden = card.hidden;
    card.hidden = false;
    cardTitle.textContent = title;
    cardBody.scrollTop = 0;
    if (wasHidden) layoutFree();
    if (reveal && matchMedia("(max-width: 819px)").matches) card.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }
  function closeCard() {
    card.hidden = true;
    current.note = null;
    current.answer = -1;
    current.token++;
    show({ lit: null, glow: null });
    layoutFree();
  }
  function clearFocus() {
    show({ focus: null, only: null });
  }

  cardBody.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-note]");
    if (!target) return;
    event.preventDefault();
    const from = current.answer;
    openNote(target.dataset.note!, from >= 0 ? () => void ask(from, true) : current.note ? reopen(current.note) : null);
  });
  cardBody.addEventListener("pointerover", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>(".cite, .note-link, [data-note]");
    show({ lit: target?.dataset.note ?? null });
  });
  cardBody.addEventListener("pointerleave", () => show({ lit: null }));
  const reopen = (id: string) => () => openNote(id);

  function openNote(id: string, back: (() => void) | null = null) {
    const note = demo.notes[id];
    if (!note) return;
    current.token++;
    current.note = id;
    current.answer = -1;
    if (wanted.focus && !id.startsWith(`${wanted.focus.slice(1)}/`)) show({ focus: null });
    if (wanted.only && !wanted.only.includes(id)) show({ only: null });
    openCard(note.title);
    const body = el("div", "ws-note");
    if (back) {
      const b = el("button", "ws-back", "Back") as HTMLButtonElement;
      b.type = "button";
      b.addEventListener("click", back);
      body.append(b);
    }
    const trail = el("p", "ws-trail");
    trail.innerHTML = ICON.folder;
    trail.append(note.trail.map(folderName).join(" › ") || "Your wiki");
    const md = el("div", "md");
    md.innerHTML = note.html;
    body.append(trail, md);
    if (note.sources.length) {
      const src = el("div", "ws-sources");
      src.append(el("p", "ws-label", "Filed from"));
      for (const s of note.sources) {
        const row = el("p", "ws-source");
        row.innerHTML = ICON.file;
        row.append(el("span", "", s.title), el("span", "ws-file", `raw/${s.file}`));
        src.append(row);
      }
      body.append(src);
    }
    cardBody.replaceChildren(body);
    show({ glow: { paths: [id], at: performance.now() } });
  }

  function openFolder(id: string) {
    const folder = nodes.get(id);
    if (!folder || folder.kind !== "folder") return;
    current.token++;
    current.note = null;
    current.answer = -1;
    show({ focus: id, only: null });
    openCard(folderName(folder.label));
    const body = el("div", "ws-folder");
    if (folder.description) body.append(el("p", "ws-desc", folder.description));
    body.append(el("p", "ws-label", `${folder.notes} ${folder.notes === 1 ? "note" : "notes"}`));
    const list = el("div", "ws-list");
    const inside = noteIds.filter((n) => n.startsWith(`${id.slice(1)}/`));
    for (const n of inside) {
      const b = el("button", "ws-item") as HTMLButtonElement;
      b.type = "button";
      b.dataset.note = n;
      b.append(el("span", "ws-item-title", demo.notes[n].title), el("span", "ws-item-sum", demo.notes[n].summary));
      list.append(b);
    }
    body.append(list);
    cardBody.replaceChildren(body);
  }

  // -- the recorded questions -------------------------------------------------------------------------------------
  async function ask(i: number, instant = false, reveal = true) {
    const a = demo.answers[i];
    const token = ++current.token;
    current.answer = i;
    current.note = null;
    show({ focus: null, only: null, lit: null });
    openCard(a.question, reveal);
    const thread = el("div", "ws-thread");
    const you = el("div", "ws-turn");
    you.append(el("span", "ws-you-dot"), el("div", "ws-turn-body"));
    you.lastElementChild!.append(el("p", "ws-who", "You"), el("p", "ws-question", a.question));
    const ans = el("div", "ws-turn");
    const mark = el("img", "ws-crow") as HTMLImageElement;
    mark.src = new URL("../img/crow-mark.png", import.meta.url).href;
    mark.alt = "";
    const answerBody = el("div", "ws-turn-body");
    answerBody.append(el("p", "ws-who", "Answer"));
    const searching = el("p", "ws-shimmer", "Searching your wiki…");
    answerBody.append(searching);
    ans.append(mark, answerBody);
    thread.append(you, ans);
    cardBody.replaceChildren(thread);
    markTree();

    if (!instant) {
      // The classifier walks the folders first: they glow, then the notes it picked.
      await sleep(350);
      if (token !== current.token) return;
      show({ glow: { paths: a.trace.folders.filter((f) => f[2]).slice(0, 3).map((f) => f[0]), at: performance.now() } });
      await sleep(900);
      if (token !== current.token) return;
    }
    searching.remove();
    const text = el("div", "md ws-answer");
    text.innerHTML = a.html;
    if (!instant) text.classList.add("rise");
    answerBody.append(text, traceOf(a));
    show({ glow: { paths: a.read, at: performance.now() } });
  }

  function traceOf(a: Answer): HTMLElement {
    const box = el("details", "ws-trace");
    const summary = el("summary");
    summary.innerHTML = ICON.chevron;
    summary.append("How CROW found it");
    box.append(summary);
    const bars = (title: string, rows: Scored[], label: (id: string) => string) => {
      if (!rows.length) return;
      box.append(el("p", "ws-trace-step", title));
      const list = el("div", "ws-bars");
      for (const [id, score, chosen] of rows) {
        const row = el("div", `ws-bar${chosen ? " chosen" : ""}`);
        const fill = el("span", "ws-bar-fill");
        fill.style.width = `${Math.max(2, score * 100)}%`;
        row.append(el("span", "ws-bar-name", label(id)), el("span", "ws-bar-track"), el("span", "ws-bar-score", score.toFixed(2)));
        row.children[1].append(fill);
        if (id.endsWith(".md")) row.dataset.note = id;
        list.append(row);
      }
      box.append(list);
    };
    const folderLabel = (id: string) => id.split("/").filter(Boolean).map(folderName).join(" › ");
    bars(`1 · ${a.usage.classifier || "The classifier"} scores every top-level folder`, a.trace.folders, folderLabel);
    bars("2 · then the folders inside them", a.trace.subfolders, folderLabel);
    bars("3 · then the notes in the folders it kept", a.trace.notes, (id) => demo.notes[id]?.title ?? id);
    const u = a.usage;
    box.append(
      el(
        "p",
        "ws-trace-step",
        `4 · ${u.writer || "The LLM"} writes the answer from the ${a.read.length} ${a.read.length === 1 ? "note" : "notes"} read`,
      ),
    );
    const cost = el("p", "ws-usage");
    cost.textContent = `Classifier: ${u.classifierCalls} calls, ${u.classifierTokens.toLocaleString("en")} tokens. LLM: ${u.llmCalls} call, ${u.llmTokens.toLocaleString("en")} tokens. About ${u.seconds} s and $${u.usd.toFixed(4)} in all.`;
    box.append(cost);
    return box;
  }

  // -- find a note ------------------------------------------------------------------------------------------------
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const haystack = new Map(noteIds.map((id) => [id, norm(`${demo.notes[id].title} ${demo.notes[id].summary} ${demo.notes[id].tags.join(" ")} ${id}`)]));
  let found: string[] = [];
  function search() {
    const words = norm(input.value).split(/\s+/).filter(Boolean);
    found = words.length ? noteIds.filter((id) => words.every((w) => haystack.get(id)!.includes(w))) : [];
    show({ only: words.length ? found : null, focus: null });
    results.replaceChildren();
    results.hidden = !words.length;
    if (!words.length) return;
    if (!found.length) {
      results.append(el("p", "ws-none", "No note matches. Try “price”, “decaf” or “Guji”."));
      return;
    }
    for (const id of found.slice(0, 5)) {
      const b = el("button", "ws-item") as HTMLButtonElement;
      b.type = "button";
      b.dataset.note = id;
      b.append(el("span", "ws-item-title", demo.notes[id].title), el("span", "ws-item-sum", demo.notes[id].trail.map(folderName).join(" › ")));
      results.append(b);
    }
  }
  input.addEventListener("input", search);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      input.value = "";
      search();
    }
  });
  $("form.ws-composer", root).addEventListener("submit", (e) => {
    e.preventDefault();
    if (found[0]) openNote(found[0]);
  });
  results.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-note]");
    if (b) openNote(b.dataset.note!);
  });
  results.addEventListener("pointerover", (e) => show({ lit: (e.target as HTMLElement).closest<HTMLElement>("[data-note]")?.dataset.note ?? null }));
  results.addEventListener("pointerleave", () => show({ lit: null }));

  // -- tools ------------------------------------------------------------------------------------------------------
  root.querySelectorAll<HTMLButtonElement>("[data-act]").forEach((b) => {
    const act = b.dataset.act;
    if (act === "in") b.addEventListener("click", () => view.zoomBy(1.35));
    if (act === "out") b.addEventListener("click", () => view.zoomBy(1 / 1.35));
    if (act === "fit")
      b.addEventListener("click", () => {
        view.refit();
        b.hidden = true;
      });
    if (act === "shake") b.addEventListener("click", () => view.shake());
    if (act === "explore") b.addEventListener("click", () => lockTouch(true));
    if (act === "done") b.addEventListener("click", () => lockTouch(false));
  });

  root.setAttribute("data-ready", "");
  if (new URLSearchParams(location.search).has("debug")) Object.assign(window, { crowDemo: { view, demo } });
  // Start on the question the demo itself suggests, once the brain is on screen.
  const io = new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      if (current.answer < 0 && !current.note && card.hidden) void ask(0, false, false);
    },
    { threshold: 0.55 },
  );
  io.observe(stage);
}

// site.js loads this file as the section comes near.
if (document.querySelector("[data-explore]")) void main().catch((error) => console.error("[crow demo]", error));

export type { BrainNode };
