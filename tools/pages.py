#!/usr/bin/env python3
# Copyright 2026 Federico Cesarini, Marco Sassarini. SPDX-License-Identifier: AGPL-3.0-or-later
"""The site's content pages and its structured data.

    python3 tools/pages.py          (from the repo root)

- content/<slug>.html -> <slug>/index.html. A source starts with <!--meta {json} -->, then the body HTML; the FAQ
  sits between <!--faq--> and <!--/faq--> as <details class="acc"> items. The header and footer are the homepage's.
- The JSON-LD of every page, the homepage's included, comes from ENTITIES below, so the names, authors and versions
  are written once. Each FAQPage is made from the visible FAQ of its page, so the two never drift.
- sitemap.xml lists the homepage, the privacy page and every content page.
"""
import html
import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://crowllmwiki.com"
HOME_MODIFIED = "2026-11-11"  # bump when the homepage changes
OTHER_PAGES = {"/privacy/": "2026-11-09"}

PEOPLE = {
    "federico": {
        "@type": "Person",
        "@id": f"{SITE}/#federico",
        "name": "Federico Cesarini",
        "url": "https://www.federicocesarini.com/",
        "sameAs": ["https://github.com/fed3c3sa", "https://www.linkedin.com/in/federico-cesarini-4a9482209", "https://x.com/fed3c3sa"],
    },
    "marco": {
        "@type": "Person",
        "@id": f"{SITE}/#marco",
        "name": "Marco Sassarini",
        "url": "https://github.com/sassarini-marco",
        "sameAs": ["https://github.com/sassarini-marco", "https://www.linkedin.com/in/marco-sassarini-95b342200", "https://x.com/MarcoSassarini"],
    },
}
AUTHORS = [{"@id": f"{SITE}/#federico"}, {"@id": f"{SITE}/#marco"}]

ENTITIES = {
    "website": {
        "@type": "WebSite",
        "@id": f"{SITE}/#website",
        "url": f"{SITE}/",
        "name": "Crow",
        "alternateName": ["Crow LLM Wiki", "crowllmwiki.com"],
        "description": "Crow, the desktop app; llm-wiki-v2, the engine; CROW, the paper.",
        "inLanguage": "en",
        "publisher": {"@id": f"{SITE}/#org"},
    },
    "org": {
        "@type": "Organization",
        "@id": f"{SITE}/#org",
        "name": "CROW",
        "alternateName": "crow-hq",
        "description": "Classifier-routed LLM wikis: open-source tools and research.",
        "url": f"{SITE}/",
        "logo": f"{SITE}/assets/img/apple-touch-icon.png",
        "email": "crowhq.community@gmail.com",
        "founder": AUTHORS,
        "sameAs": ["https://github.com/crow-hq", "https://pypi.org/org/crow-hq/"],
    },
    "crow": {
        "@type": "SoftwareApplication",
        "@id": f"{SITE}/#crow",
        "name": "Crow",
        "alternateName": "Crow LLM Wiki",
        "url": f"{SITE}/",
        "description": "A desktop app that turns the documents on your computer into a second brain: a wiki of Markdown notes, filed by topic and linked to each other, that you can chat with.",
        "disambiguatingDescription": "Crow is a free, open-source desktop app that builds an LLM wiki from your own documents. It is not a language model and not a model API.",
        "applicationCategory": "ProductivityApplication",
        "operatingSystem": "macOS, Windows, Linux",
        "softwareVersion": "0.1.5",
        "datePublished": "2026-10-16",
        "dateModified": "2026-11-04",
        "license": "https://www.gnu.org/licenses/agpl-3.0.html",
        "isAccessibleForFree": True,
        "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"},
        "downloadUrl": "https://github.com/crow-hq/crow-desktop/releases/latest",
        "codeRepository": "https://github.com/crow-hq/crow-desktop",
        "sameAs": ["https://github.com/crow-hq/crow-desktop"],
        "image": f"{SITE}/assets/img/og.jpg",
        "author": AUTHORS,
        "publisher": {"@id": f"{SITE}/#org"},
    },
    "engine": {
        "@type": "SoftwareSourceCode",
        "@id": f"{SITE}/#llm-wiki-v2",
        "name": "llm-wiki-v2 (llmwiki2)",
        "alternateName": ["llmwiki2", "llm-wiki-v2"],
        "url": f"{SITE}/llmwiki2/",
        "description": "An open-source Python engine that turns documents into an LLM wiki of Markdown notes, with CROW classifier routing: a library, a command line, a web page and an MCP memory for AI agents.",
        "codeRepository": "https://github.com/crow-hq/llm-wiki-v2",
        "programmingLanguage": "Python",
        "runtimePlatform": "Python 3.11 or later",
        "version": "1.0.0",
        "dateModified": "2026-11-10",
        "license": "https://www.gnu.org/licenses/agpl-3.0.html",
        "sameAs": ["https://github.com/crow-hq/llm-wiki-v2", "https://pypi.org/project/llmwiki2/"],
        "author": AUTHORS,
        "publisher": {"@id": f"{SITE}/#org"},
    },
    "paper": {
        "@type": "ScholarlyArticle",
        "@id": f"{SITE}/#paper",
        "headline": "CROW: Classifier-Routed Organization of LLM Wikis",
        "name": "CROW: Classifier-Routed Organization of LLM Wikis",
        "url": f"{SITE}/paper/",
        "author": AUTHORS,
        "datePublished": "2026-09-22",
        "dateModified": "2026-10-09",
        "publisher": {"@type": "Organization", "name": "Zenodo", "url": "https://zenodo.org/"},
        "identifier": {"@type": "PropertyValue", "propertyID": "DOI", "value": "10.5281/zenodo.22898752"},
        "sameAs": ["https://doi.org/10.5281/zenodo.22898752", "https://zenodo.org/records/23260209"],
        "license": "https://creativecommons.org/licenses/by/4.0/",
        "encoding": {
            "@type": "MediaObject",
            "encodingFormat": "application/pdf",
            "contentUrl": f"{SITE}/assets/paper/CROW_Cesarini_Sassarini_2026_v1.0_doi-23260209.pdf",
        },
        "isPartOf": {"@id": f"{SITE}/#website"},
    },
}

# Which entities each page carries besides the website, the organization and the two authors.
PAGE_ENTITIES = {"llm-wiki": ["crow", "engine", "paper"], "llmwiki2": ["engine", "crow"], "paper": ["paper", "engine"]}
PAGE_MAIN = {"llmwiki2": "engine", "paper": "paper"}  # the page is about this entity


def clean(s: str) -> str:
    s = re.sub(r"</(?:li|p|h[1-6])>|<br\s*/?>", " ", s)  # list items and paragraphs stay apart
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s))).strip()


def esc(s: str) -> str:
    return html.escape(s, quote=True)


def long_date(iso: str) -> str:
    d = date.fromisoformat(iso)
    return f"{d.day} {d.strftime('%B')} {d.year}"


def faq_items(fragment: str):
    """(question, answer text) for each <details class="acc ..."> in the fragment."""
    out = []
    for d in re.findall(r"<details class=\"acc[^\"]*\">(.*?)</details>", fragment, re.S):
        q = re.search(r"<summary>(.*?)</summary>", d, re.S)
        a = re.search(r"<div class=\"acc-body\">(.*)</div>\s*$", d.strip(), re.S)
        if q and a:
            out.append((clean(q.group(1)), clean(a.group(1))))
    return out


def faq_node(url: str, items):
    return {
        "@type": "FAQPage",
        "@id": f"{url}#faq",
        "url": url,
        "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in items],
    }


def graph(nodes) -> str:
    body = json.dumps({"@context": "https://schema.org", "@graph": nodes}, ensure_ascii=False, indent=2)
    return f'<script type="application/ld+json">\n{body}\n</script>'


def base_nodes():
    return [ENTITIES["website"], ENTITIES["org"], PEOPLE["federico"], PEOPLE["marco"]]


# -- the homepage: its JSON-LD only ----------------------------------------------------------------------------------
def homepage(index: str) -> str:
    start = index.index('<div class="faq">')
    faq = faq_items(index[start : index.index("</section>", start)])
    page = {
        "@type": "WebPage",
        "@id": f"{SITE}/#webpage",
        "url": f"{SITE}/",
        "name": clean(re.search(r"<title>(.*?)</title>", index, re.S).group(1)),
        "isPartOf": {"@id": f"{SITE}/#website"},
        "about": {"@id": f"{SITE}/#crow"},
        "mainEntity": {"@id": f"{SITE}/#crow"},
        "dateModified": HOME_MODIFIED,
        "inLanguage": "en",
        "primaryImageOfPage": f"{SITE}/assets/img/og.jpg",
    }
    nodes = base_nodes() + [ENTITIES["crow"], ENTITIES["engine"], ENTITIES["paper"], page, faq_node(f"{SITE}/", faq)]
    return re.sub(r'<script type="application/ld\+json">.*?</script>', lambda _: graph(nodes), index, count=1, flags=re.S)


# -- content pages ----------------------------------------------------------------------------------------------------
def chrome(index: str):
    """The homepage's header and footer, with links that work from any page."""
    header = re.search(r'<header class="nav">.*?</header>', index, re.S).group(0)
    footer = re.search(r'<footer class="footer">.*?</footer>', index, re.S).group(0)
    nav = "\n".join(
        f'      <li><a href="{h}">{t}</a></li>'
        for h, t in [("/#brain", "Brain"), ("/#features", "Features"), ("/llm-wiki/", "LLM wiki"), ("/llmwiki2/", "Engine"), ("/paper/", "Paper"), ("/#download", "Download"), ("/#faq", "FAQ")]
    )
    header = re.sub(r'<ul class="nav-links">.*?</ul>', f'<ul class="nav-links">\n{nav}\n    </ul>', header, flags=re.S)

    def absolute(block: str) -> str:
        block = block.replace('href="#top"', 'href="/"')
        block = re.sub(r'href="#', 'href="/#', block)
        return re.sub(r'(href|src)="assets/', r'\1="/assets/', block)

    return absolute(header), absolute(footer)


def build_page(src: Path, header: str, footer: str) -> tuple[str, str, dict]:
    text = src.read_text(encoding="utf-8")
    m = re.match(r"\s*<!--meta\s*(\{.*?\})\s*-->\s*", text, re.S)
    if not m:
        sys.exit(f"{src}: no <!--meta {{...}} --> block")
    meta = json.loads(m.group(1))
    rest = text[m.end() :]
    fm = re.search(r"<!--faq-->(.*?)<!--/faq-->", rest, re.S)
    faq_html = fm.group(1).strip() if fm else ""
    body = (rest[: fm.start()] + rest[fm.end() :]).strip() if fm else rest.strip()
    slug = meta["slug"]
    url = f"{SITE}/{slug}/"
    items = faq_items(faq_html)

    # each code block gets the homepage's copy button (site.js wires every [data-copy])
    counter = iter(range(1, 1000))

    def copyable(m):
        n = next(counter)
        return (f'<div class="code"><div class="code-head"><span>{m.group(1)}</span>'
                f'<button class="copy" type="button" data-copy="code-{slug}-{n}" aria-label="Copy"></button></div>'
                f'<pre id="code-{slug}-{n}">')

    body = re.sub(r'<div class="code">\s*<div class="code-head"><span>(.*?)</span></div>\s*<pre>', copyable, body, flags=re.S)

    # JSON-LD
    article_type = None if slug in PAGE_MAIN else "TechArticle"
    page = {
        "@type": "WebPage",
        "@id": f"{url}#webpage",
        "url": url,
        "name": meta["title"],
        "description": meta["description"],
        "isPartOf": {"@id": f"{SITE}/#website"},
        "breadcrumb": {"@id": f"{url}#breadcrumb"},
        "inLanguage": "en",
        "datePublished": meta["published"],
        "dateModified": meta["modified"],
        "primaryImageOfPage": f"{SITE}/assets/img/og.jpg",
    }
    nodes = base_nodes()
    if slug in PAGE_MAIN:
        page["about"] = {"@id": ENTITIES[PAGE_MAIN[slug]]["@id"]}
        page["mainEntity"] = {"@id": ENTITIES[PAGE_MAIN[slug]]["@id"]}
    if article_type == "TechArticle":
        page["mainEntity"] = {"@id": f"{url}#article"}
        nodes.append(
            {
                "@type": "TechArticle",
                "@id": f"{url}#article",
                "headline": meta["h1"],
                "description": meta["description"],
                "author": AUTHORS,
                "publisher": {"@id": f"{SITE}/#org"},
                "datePublished": meta["published"],
                "dateModified": meta["modified"],
                "mainEntityOfPage": {"@id": f"{url}#webpage"},
                "image": f"{SITE}/assets/img/og.jpg",
                "inLanguage": "en",
                "keywords": meta.get("about", []),
                "about": [{"@type": "Thing", "name": a} for a in meta.get("about", [])[:2]],
                "mentions": [{"@id": ENTITIES[k]["@id"]} for k in PAGE_ENTITIES.get(slug, [])],
            }
        )
    for k in PAGE_ENTITIES.get(slug, []):
        node = dict(ENTITIES[k])
        if k == "paper" and slug == "paper" and meta.get("citation", {}).get("abstract"):
            node["abstract"] = meta["citation"]["abstract"]
            node["keywords"] = meta["citation"].get("keywords", [])
            node["mainEntityOfPage"] = {"@id": f"{url}#webpage"}
        nodes.append(node)
    nodes.append(page)
    nodes.append(
        {
            "@type": "BreadcrumbList",
            "@id": f"{url}#breadcrumb",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "Crow", "item": f"{SITE}/"},
                {"@type": "ListItem", "position": 2, "name": meta["crumb"], "item": url},
            ],
        }
    )
    if items:
        nodes.append(faq_node(url, items))

    # Google Scholar's tags, for the paper
    scholar = ""
    c = meta.get("citation")
    if c:
        tags = [("citation_title", c["title"])]
        tags += [("citation_author", a) for a in c["authors"]]
        tags += [
            ("citation_publication_date", c["publication_date"]),
            ("citation_online_date", c.get("online_date", c["publication_date"])),
            ("citation_doi", c["doi"]),
            ("citation_publisher", c["publisher"]),
            ("citation_pdf_url", c["pdf_url"]),
            ("citation_abstract_html_url", url),
            ("citation_language", "en"),
        ]
        if c.get("keywords"):
            tags.append(("citation_keywords", "; ".join(c["keywords"])))
        scholar = "\n".join(f'<meta name="{n}" content="{esc(v)}">' for n, v in tags) + "\n"

    sources = "".join(f'<li><a href="{esc(s["url"])}">{esc(s["title"])}</a></li>' for s in meta.get("sources", []))
    others = [(s, t, d) for s, t, d in [
        ("llm-wiki", "What is an LLM wiki?", "Karpathy's idea, RAG, and how to build one"),
        ("llmwiki2", "llmwiki2, the engine", "The Python library, command line and MCP memory"),
        ("paper", "The CROW paper", "Classifier-Routed Organization of LLM Wikis"),
    ] if s != slug]
    next_cards = "".join(f'<a class="link-card" href="/{s}/"><b>{esc(t)}</b><span>{esc(d)}</span></a>' for s, t, d in others)
    next_cards += '<a class="link-card" href="/#brain"><b>Explore a brain</b><span>An example wiki drawn by Crow\'s own code</span></a>'

    page_html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{esc(meta["title"])}</title>
<meta name="description" content="{esc(meta["description"])}">
<meta name="author" content="Federico Cesarini, Marco Sassarini">
<meta name="theme-color" content="#0f1113">
<meta name="color-scheme" content="dark">
<link rel="canonical" href="{url}">
<link rel="icon" type="image/png" href="/assets/img/favicon.png">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Crow">
<meta property="og:title" content="{esc(meta.get("og_title", meta["h1"]))}">
<meta property="og:description" content="{esc(meta["description"])}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{SITE}/assets/img/og.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="article:published_time" content="{meta["published"]}">
<meta property="article:modified_time" content="{meta["modified"]}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:creator" content="@fed3c3sa">
{scholar}<link rel="preload" href="/assets/fonts/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/site.css">
<script type="module" src="/assets/js/site.js"></script>
{graph(nodes)}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>

{header}

<main id="main" class="article">
  <div class="wrap">
    <article class="article-col">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Crow</a><span aria-hidden="true">/</span><span aria-current="page">{esc(meta["crumb"])}</span></nav>
      <span class="eyebrow" style="--dot: var(--crow)">{esc(meta["eyebrow"])}</span>
      <h1>{esc(meta["h1"])}</h1>
      <p class="lede">{esc(meta["lede"])}</p>
      <p class="byline">By <a href="https://www.federicocesarini.com/">Federico Cesarini</a> and <a href="https://github.com/sassarini-marco">Marco Sassarini</a> · Updated <time datetime="{meta["modified"]}">{long_date(meta["modified"])}</time></p>
      <div class="article-body">
{body}
      </div>
{f'''      <section class="article-faq" aria-labelledby="faq-h">
        <h2 id="faq-h">Questions</h2>
        <div class="faq">
{faq_html}
        </div>
      </section>
''' if faq_html else ''}{f'''      <section class="article-sources" aria-labelledby="sources-h">
        <h2 id="sources-h">Sources</h2>
        <ul>{sources}</ul>
      </section>
''' if sources else ''}      <nav class="article-next links" aria-label="Keep reading">{next_cards}</nav>
    </article>
  </div>

  <section class="final">
    <div class="wrap">
      <div class="final-box reveal">
        <canvas class="hero-field" aria-hidden="true"></canvas>
        <img class="crow-mark" src="/assets/img/crow-mark.png" width="76" height="54" alt="">
        <h2>Turn the documents on your computer into an LLM wiki you can chat with.</h2>
        <div class="hero-cta">
          <a class="btn btn-cta btn-lg" href="/#download">Download Crow, free</a>
          <a class="btn btn-outline" href="https://github.com/crow-hq/llm-wiki-v2">Star llm-wiki-v2</a>
        </div>
        <p class="dl-note">macOS, Windows and Linux · open source</p>
      </div>
    </div>
  </section>
</main>

{footer}
</body>
</html>
"""
    return slug, page_html, meta


def sitemap(pages) -> str:
    rows = [("/", HOME_MODIFIED)] + list(OTHER_PAGES.items()) + [(f"/{m['slug']}/", m["modified"]) for m in pages]
    urls = "\n".join(f"  <url>\n    <loc>{SITE}{p}</loc>\n    <lastmod>{d}</lastmod>\n  </url>" for p, d in rows)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}\n</urlset>\n'


def main():
    index_path = ROOT / "index.html"
    index = homepage(index_path.read_text(encoding="utf-8"))
    index_path.write_text(index, encoding="utf-8")
    header, footer = chrome(index)
    metas = []
    for src in sorted((ROOT / "content").glob("*.html")):
        slug, page_html, meta = build_page(src, header, footer)
        out = ROOT / slug / "index.html"
        out.parent.mkdir(exist_ok=True)
        out.write_text(page_html, encoding="utf-8")
        metas.append(meta)
        print(f"wrote {slug}/index.html")
    (ROOT / "sitemap.xml").write_text(sitemap(metas), encoding="utf-8")
    print(f"wrote sitemap.xml ({len(metas) + 1 + len(OTHER_PAGES)} URLs) and the homepage's JSON-LD")


if __name__ == "__main__":
    main()
