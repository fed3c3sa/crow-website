// Copyright 2026 Federico Cesarini, Marco Sassarini. SPDX-License-Identifier: AGPL-3.0-or-later
// Builds the site's generated files: assets/data/demo.json from the example wiki recorded in tools/data-src (see
// tools/record-demo.sh), and the two scripts, assets/js/site.js and assets/js/demo.js, bundled with esbuild.
// The page itself (index.html, assets/css) is written by hand. Run: npm run build
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";
import { resolveNoteLink, withoutTitle } from "../src/brain/notePaths.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => JSON.parse(readFileSync(root + path, "utf8"));

const graph = read("tools/data-src/graph.json");
const notes = read("tools/data-src/notes.json");
const answers = read("tools/data-src/answers.json");

const titles = Object.fromEntries(graph.nodes.filter((n) => n.kind === "note").map((n) => [n.id, n.label]));
const folderNames = Object.fromEntries(graph.nodes.filter((n) => n.kind === "folder").map((n) => [n.id, n.label]));
const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Markdown as the app shows it: relative .md links open the note in place, other links open a new tab. */
function markdown(text, from) {
  const md = new Marked({ gfm: true });
  md.use({
    renderer: {
      link({ href, tokens }) {
        const inner = this.parser.parseInline(tokens);
        const note = from ? resolveNoteLink(from, href) : null;
        if (note && titles[note]) return `<a href="#" class="note-link" data-note="${escape(note)}">${inner}</a>`;
        return `<a href="${escape(href)}" target="_blank" rel="noopener">${inner}</a>`;
      },
      heading({ tokens, depth }) {
        const inner = this.parser.parseInline(tokens);
        if (/^see also$/i.test(inner.trim())) return `<h4 class="see-also">See also</h4>\n`;
        return `<h${Math.min(6, depth + 2)}>${inner}</h${Math.min(6, depth + 2)}>\n`;
      },
      html({ text }) {
        return escape(text); // the notes are the repo's, but nothing in them is meant as markup
      },
    },
  });
  return md.parse(text);
}

/** "[a.md]" and "[a.md, b.md]" as the app's cite pills: the note's title, the path on hover. */
function withPills(text) {
  const pills = [];
  const marked = text.replace(/\[([^\[\]]+?\.md(?:\s*[;,]\s*[^\[\]]+?\.md)*)\]/g, (whole, inside) => {
    const paths = inside.split(/\s*[;,]\s*/).filter((p) => titles[p]);
    if (!paths.length) return whole;
    pills.push(paths);
    return `CITEPILL${pills.length - 1}END`;
  });
  let html = markdown(marked, null);
  html = html.replace(/\s*CITEPILL(\d+)END/g, (_, i) =>
    pills[Number(i)].map((p) => ` <button type="button" class="cite" data-note="${escape(p)}" title="${escape(p)}">${escape(titles[p])}</button>`).join(""),
  );
  return html;
}

/** "google/gemini-3.8-flash" → "Gemini 3.8 Flash", "typesafe/jev-1.13" → "Jev 1.13". */
const pretty = (model) =>
  model
    .split("/")
    .pop()
    .split("-")
    .map((w) => (/^\d/.test(w) ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ");

const trail = (path) =>
  path
    .split("/")
    .slice(0, -1)
    .map((_, i, parts) => folderNames[`/${parts.slice(0, i + 1).join("/")}`] ?? parts[i]);

const demo = {
  recorded: "2026-11-04",
  engine: "llmwiki2 0.8.0",
  graph,
  notes: Object.fromEntries(
    Object.entries(notes).map(([path, note]) => [
      path,
      {
        title: note.title,
        summary: note.summary,
        tags: note.tags ?? [],
        trail: trail(path),
        html: markdown(withoutTitle(note.body, note.title), path),
        sources: (note.frontmatter?.sources ?? []).map((s) => ({ title: s.title, file: s.resource.split("/").pop() })),
        generated: note.frontmatter?.generated ?? null,
      },
    ]),
  ),
  answers: answers.map((a) => {
    const step = (name) => a.decisions.filter((d) => d.step === name);
    const scored = (d) =>
      d
        ? Object.entries(d.scores)
            .sort((x, y) => y[1] - x[1])
            .map(([path, score]) => [path, score, d.choice.split(", ").includes(path)])
        : [];
    const [folders, subfolders] = step("retrieve_folder");
    const [picked] = step("retrieve_note");
    const llm = a.usage.llm;
    const classifier = a.usage.classifier;
    const model = (prefix) => pretty(Object.keys(a.usage.by_model).find((k) => k.startsWith(prefix))?.slice(prefix.length) ?? "");
    return {
      question: a.question,
      html: withPills(a.text),
      citations: a.citations,
      read: a.notes,
      trace: {
        folders: scored(folders),
        subfolders: scored(subfolders),
        notes: scored(picked).slice(0, 8),
        fallback: a.decisions.some((d) => d.fallback),
      },
      usage: {
        writer: model("llm:"),
        classifier: model("classifier:"),
        llmCalls: llm.calls,
        llmTokens: llm.input_tokens + llm.output_tokens,
        classifierCalls: classifier.calls,
        classifierTokens: classifier.input_tokens + classifier.output_tokens,
        seconds: Math.round((llm.seconds + classifier.seconds) * 10) / 10,
        usd: llm.cost_usd + classifier.cost_usd,
      },
    };
  }),
};

mkdirSync(root + "assets/data", { recursive: true });
writeFileSync(root + "assets/data/demo.json", JSON.stringify(demo));

await build({
  entryPoints: { site: root + "src/site.ts", demo: root + "src/demo.ts" },
  outdir: root + "assets/js",
  bundle: true,
  minify: true,
  format: "esm",
  target: ["es2020", "safari15"],
  legalComments: "eof",
  logLevel: "warning",
});
console.log("built: assets/data/demo.json, assets/js/site.js, assets/js/demo.js");
