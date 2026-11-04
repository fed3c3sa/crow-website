<p align="center"><img src="assets/img/crow-mark.png" width="96" alt="Crow, a pixel-art crow"></p>

<h1 align="center">The Crow website</h1>

<p align="center">One page for everything about Crow: the desktop app, the llm-wiki-v2 engine, the CROW paper, the films, the news, and a brain you can explore.</p>

**Crow** is a free, open-source desktop app that turns the documents on your computer into an LLM wiki you can chat
with. It is by Federico Cesarini and Marco Sassarini: [crow-hq/crow-desktop](https://github.com/crow-hq/crow-desktop),
[crow-hq/llm-wiki-v2](https://github.com/crow-hq/llm-wiki-v2),
[the paper](https://doi.org/10.5281/zenodo.22898752).

## What is on the page

- **Explore a brain.** The example wiki of `llmwiki2 demo` drawn by Crow's own brain code (ported from the app:
  `src/brain`): drag the dots, pan and zoom, focus a folder, read a note, find one, and play four questions whose
  answers, classifier scores and costs were recorded from llmwiki2 0.8.0 (`tools/record-demo.sh`). Nothing calls a
  model.
- **Downloads.** Direct links to every installer of the latest Crow release. The page carries the links of 0.1.5 and,
  when GitHub has a newer release, swaps them for its files; the main button picks the file for the visitor's system.
- Features, the AI apps Crow connects (MCP), why a wiki and not RAG, install help, the engine, the paper with BibTeX,
  the films, the timeline, the LinkedIn and X posts, the authors and the FAQ. Every fact comes from the repos' READMEs
  and release notes, Zenodo, PyPI and the authors' own posts.

## Where it is published

**https://crowllmwiki.com/**, by GitHub Pages from `main`, folder `/ (root)`. The site is static (no build on GitHub),
`.nojekyll` keeps Pages from processing it, and `CNAME` holds the domain. The domain's DNS is on Cloudflare, **DNS
only** (not proxied, so GitHub can issue the HTTPS certificate): four `A` records to `185.199.108-111.153`, four
`AAAA` to `2606:50c0:8000-8003::153`, and `www` as a `CNAME` to `fed3c3sa.github.io`, which Pages redirects to the
apex. `index.html` (canonical, Open Graph, JSON-LD), `sitemap.xml`, `robots.txt` and `llms.txt` use that address.

## Change it

The page is plain HTML and CSS (`index.html`, `assets/css/site.css`). The scripts and the example wiki's data are
generated:

```bash
npm install
npm run build       # assets/data/demo.json, assets/js/site.js, assets/js/demo.js
npm run typecheck
python3 -m http.server 8781   # then open http://127.0.0.1:8781/
```

`tools/og.html` is the source of `assets/img/og.jpg` (the social card); render it at 1200×630 with headless Chrome.

## Licence

GNU AGPL v3.0 or later, as Crow; see [LICENSE](LICENSE) and [NOTICE](NOTICE) for the parts that come from elsewhere.
