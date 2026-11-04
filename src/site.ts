// Copyright 2026 Federico Cesarini, Marco Sassarini. SPDX-License-Identifier: AGPL-3.0-or-later
// The page around the brain: the Welcome field of soft lights behind the hero, the download buttons for this
// computer, the latest release from GitHub, copy buttons, the videos that play while on screen, the nav.
import { glows, links } from "./hero/ambient";
import { paintAmbient, spritesFor, type SpriteOf } from "./hero/paintAmbient";
import { palette } from "./hero/palette";

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

// -- the hero's field, as on Crow's Welcome screen ----------------------------------------------------------------
function ambient(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const field = glows();
  let web: { aspect: number; links: [number, number][]; spriteOf: SpriteOf } | null = null;
  let width = 0;
  let height = 0;
  let frame = 0;
  let visible = true;
  const began = performance.now();
  const draw = (now: number) => {
    if (!width || !height) return;
    const aspect = width / height;
    if (!web || Math.abs(web.aspect - aspect) > 0.08) web = { aspect, links: links(field, aspect), spriteOf: web?.spriteOf ?? spritesFor(palette()) };
    ctx.clearRect(0, 0, width, height);
    paintAmbient(ctx, width, height, reduced ? 0 : (now - began) / 1000, { field, links: web.links, spriteOf: web.spriteOf, p: palette() });
  };
  const tick = (now: number) => {
    draw(now);
    frame = visible && !reduced && !document.hidden ? requestAnimationFrame(tick) : 0;
  };
  const run = () => {
    if (!frame && visible && !reduced && !document.hidden) frame = requestAnimationFrame(tick);
  };
  const resize = () => {
    const density = Math.min(2, window.devicePixelRatio || 1);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * density);
    canvas.height = Math.round(height * density);
    ctx.setTransform(density, 0, 0, density, 0, 0);
    draw(performance.now());
  };
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    run();
  }).observe(canvas);
  document.addEventListener("visibilitychange", run);
  resize();
  run();
}

// -- downloads ------------------------------------------------------------------------------------------------------
type Kind = "mac-arm" | "mac-intel" | "win-exe" | "win-msi" | "linux-appimage" | "linux-deb" | "linux-rpm";
const PATTERNS: [Kind, RegExp][] = [
  ["mac-arm", /_aarch64\.dmg$/],
  ["mac-intel", /_x64\.dmg$/],
  ["win-exe", /_x64-setup\.exe$/],
  ["win-msi", /_x64_en-US\.msi$/],
  ["linux-appimage", /_amd64\.AppImage$/],
  ["linux-deb", /_amd64\.deb$/],
  ["linux-rpm", /\.x86_64\.rpm$/],
];
const LABEL: Record<Kind, string> = {
  "mac-arm": "Download for macOS",
  "mac-intel": "Download for macOS (Intel)",
  "win-exe": "Download for Windows",
  "win-msi": "Download for Windows (.msi)",
  "linux-appimage": "Download for Linux",
  "linux-deb": "Download for Linux (.deb)",
  "linux-rpm": "Download for Linux (.rpm)",
};
const NOTE: Record<Kind, string> = {
  "mac-arm": "Apple silicon",
  "mac-intel": "Intel Mac",
  "win-exe": "Windows 10 and 11",
  "win-msi": "Windows installer for IT",
  "linux-appimage": "AppImage, any distribution",
  "linux-deb": "Debian, Ubuntu",
  "linux-rpm": "Fedora, openSUSE",
};

/** This computer's system and, on a Mac, a guess at its chip from the GPU's name (Safari tells nothing else). */
async function detect(): Promise<Kind | null> {
  const ua = navigator.userAgent;
  const data = (navigator as Navigator & { userAgentData?: { platform?: string; getHighEntropyValues?: (h: string[]) => Promise<{ architecture?: string }> } }).userAgentData;
  const platform = (data?.platform || navigator.platform || "").toLowerCase();
  if (/iphone|ipad|android/i.test(ua)) return null;
  if (platform.includes("mac") || /mac os x/i.test(ua)) {
    if (data?.getHighEntropyValues) {
      try {
        const { architecture } = await data.getHighEntropyValues(["architecture"]);
        if (architecture === "x86") return "mac-intel";
        if (architecture === "arm") return "mac-arm";
      } catch {
        /* fall through to the GPU */
      }
    }
    try {
      const gl = document.createElement("canvas").getContext("webgl");
      const info = gl?.getExtension("WEBGL_debug_renderer_info");
      const gpu = info && gl ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
      if (/intel|amd|radeon|nvidia/i.test(gpu)) return "mac-intel";
    } catch {
      /* the default below */
    }
    return "mac-arm";
  }
  if (platform.includes("win") || /windows/i.test(ua)) return "win-exe";
  if (platform.includes("linux") || /linux|x11/i.test(ua)) return "linux-appimage";
  return null;
}

const mb = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`;

type Asset = { name: string; size: number; browser_download_url: string };
type Release = { tag_name: string; html_url: string; published_at: string; assets: Asset[] };

/** The latest release, from GitHub: newer than the one written in the page, its links replace those. */
async function latestRelease() {
  const shown = document.documentElement.dataset.crowVersion;
  let release: Release;
  try {
    const cached = sessionStorage.getItem("crow-release");
    release = cached ? JSON.parse(cached) : await fetch("https://api.github.com/repos/crow-hq/crow-desktop/releases/latest").then((r) => (r.ok ? r.json() : Promise.reject(r.status)));
    if (!cached) sessionStorage.setItem("crow-release", JSON.stringify(release));
  } catch {
    return; // the page's own links stay
  }
  const version = release.tag_name.replace(/^v/, "");
  if (!release.assets?.length || version === shown) return;
  for (const [kind, pattern] of PATTERNS) {
    const asset = release.assets.find((a) => pattern.test(a.name));
    if (!asset) continue;
    document.querySelectorAll<HTMLAnchorElement>(`[data-dl="${kind}"]`).forEach((a) => {
      a.href = asset.browser_download_url;
      a.querySelectorAll("[data-dl-file]").forEach((n) => (n.textContent = asset.name));
      a.querySelectorAll("[data-dl-size]").forEach((n) => (n.textContent = mb(asset.size)));
    });
  }
  document.querySelectorAll("[data-crow-version]").forEach((n) => (n.textContent = version));
  document.querySelectorAll<HTMLAnchorElement>("[data-release-page]").forEach((a) => (a.href = release.html_url));
  const date = new Date(release.published_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  document.querySelectorAll("[data-crow-date]").forEach((n) => (n.textContent = date));
}

async function downloads() {
  const kind = await detect();
  const primary = document.querySelectorAll<HTMLAnchorElement>("[data-dl-primary]");
  if (kind) {
    const source = document.querySelector<HTMLAnchorElement>(`.dl-table [data-dl="${kind}"]`);
    primary.forEach((a) => {
      a.dataset.dl = kind;
      if (source) a.href = source.href;
      a.querySelector("[data-dl-label]")!.textContent = LABEL[kind];
      const note = a.closest(".hero-inner, .final-box")?.querySelector("[data-dl-note]");
      if (note) note.textContent = NOTE[kind];
    });
    document.querySelectorAll(`.dl-card[data-os="${kind.split("-")[0]}"]`).forEach((c) => c.setAttribute("data-mine", ""));
  } else {
    primary.forEach((a) => {
      a.href = "#download";
      a.removeAttribute("download");
      a.querySelector("[data-dl-label]")!.textContent = "Download Crow";
      const note = a.closest(".hero-inner, .final-box")?.querySelector("[data-dl-note]");
      if (note) note.textContent = "Desktop app";
    });
  }
  await latestRelease();
  // The primary buttons follow the table, which a newer release may have just rewritten.
  if (kind) {
    const source = document.querySelector<HTMLAnchorElement>(`.dl-table [data-dl="${kind}"]`);
    if (source) primary.forEach((a) => (a.href = source.href));
  }
}

// -- live numbers -------------------------------------------------------------------------------------------------
async function stars() {
  try {
    const repo = await fetch("https://api.github.com/repos/crow-hq/llm-wiki-v2").then((r) => (r.ok ? r.json() : Promise.reject()));
    if (typeof repo.stargazers_count === "number")
      document.querySelectorAll("[data-stars]").forEach((n) => (n.textContent = repo.stargazers_count.toLocaleString("en")));
    if (typeof repo.forks_count === "number") document.querySelectorAll("[data-forks]").forEach((n) => (n.textContent = repo.forks_count.toLocaleString("en")));
  } catch {
    /* the numbers written in the page stay */
  }
  try {
    const pypi = await fetch("https://pypi.org/pypi/llmwiki2/json").then((r) => (r.ok ? r.json() : Promise.reject()));
    if (pypi?.info?.version) document.querySelectorAll("[data-pypi-version]").forEach((n) => (n.textContent = pypi.info.version));
  } catch {
    /* idem */
  }
}

// -- small things ---------------------------------------------------------------------------------------------------
function copyButtons() {
  document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      const target = document.getElementById(button.dataset.copy!);
      const text = target?.innerText.trim() ?? "";
      try {
        await navigator.clipboard.writeText(text);
        button.dataset.copied = "";
        button.setAttribute("aria-label", "Copied");
        setTimeout(() => {
          delete button.dataset.copied;
          button.setAttribute("aria-label", "Copy");
        }, 1600);
      } catch {
        /* nothing to copy with */
      }
    });
  });
}

function videos() {
  const io = new IntersectionObserver(
    (entries) => {
      for (const { target, isIntersecting } of entries) {
        const video = target as HTMLVideoElement;
        if (isIntersecting && !reduced) void video.play().catch(() => {});
        else video.pause();
      }
    },
    { threshold: 0.35 },
  );
  document.querySelectorAll<HTMLVideoElement>("video[data-autoplay]").forEach((v) => io.observe(v));
}

function nav() {
  const bar = document.querySelector(".nav");
  const toggle = document.querySelector<HTMLButtonElement>(".nav-toggle");
  const onScroll = () => bar?.toggleAttribute("data-scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  toggle?.addEventListener("click", () => {
    const open = !bar?.hasAttribute("data-open");
    bar?.toggleAttribute("data-open", open);
    toggle.setAttribute("aria-expanded", String(open));
  });
  bar?.querySelectorAll(".nav-links a").forEach((a) =>
    a.addEventListener("click", () => {
      bar.removeAttribute("data-open");
      toggle?.setAttribute("aria-expanded", "false");
    }),
  );
  // The section on screen is marked in the nav.
  const links = new Map<string, HTMLElement>();
  document.querySelectorAll<HTMLAnchorElement>(".nav-links a[href^='#']").forEach((a) => links.set(a.hash.slice(1), a));
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        links.forEach((a) => a.removeAttribute("aria-current"));
        links.get(entry.target.id)?.setAttribute("aria-current", "true");
      }
    },
    { rootMargin: "-45% 0px -50% 0px" },
  );
  links.forEach((_, id) => {
    const section = document.getElementById(id);
    if (section) io.observe(section);
  });
}

function reveal() {
  if (reduced) return;
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("in");
        io.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px" },
  );
  document.querySelectorAll(".reveal").forEach((n) => io.observe(n));
  document.documentElement.classList.add("reveals");
}

document.querySelectorAll<HTMLCanvasElement>(".hero-field").forEach(ambient);

// The brain's code and data load only as its section comes near.
const explore = document.querySelector("[data-explore]");
if (explore) {
  const near = new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting) return;
      near.disconnect();
      const demo = new URL("./demo.js", import.meta.url).href;
      void import(/* the second bundle, built beside this one */ demo);
    },
    { rootMargin: "800px 0px" },
  );
  near.observe(explore);
}
reveal();
nav();
copyButtons();
videos();
void downloads();
void stars();
