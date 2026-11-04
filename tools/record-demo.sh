#!/usr/bin/env bash
# Copyright 2026 Federico Cesarini, Marco Sassarini. SPDX-License-Identifier: AGPL-3.0-or-later
# How tools/data-src was recorded (4 November 2026): llmwiki2 0.8.0 serves a copy of its own example wiki, and the
# graph, every note and four answers are saved as the HTTP API returns them. Asking needs an OpenRouter key; with the
# defaults the wiki runs in CROW mode, Jev 1.13 deciding and Gemini 3.8 Flash writing (the four answers cost about $0.006).
# Run from the repo root with a clone of crow-hq/llm-wiki-v2 at $LLM_WIKI (default ../llm-wiki-v2), then npm run build.
set -euo pipefail
: "${OPENROUTER_API_KEY:?set OPENROUTER_API_KEY to record the answers}"
LLM_WIKI="${LLM_WIKI:-../llm-wiki-v2}"
PORT="${PORT:-8792}"
work="$(mktemp -d)"
git -C "$LLM_WIKI" archive origin/main src/llmw2/demo | tar -x -C "$work"
OKF_CONFIG="$work/none.json" uvx --from 'llmwiki2==0.8.0' llmwiki2 --bundle "$work/src/llmw2/demo" serve --host 127.0.0.1 --port "$PORT" &
server=$!
trap 'kill $server' EXIT
until curl -sf "127.0.0.1:$PORT/health" >/dev/null; do sleep 1; done
curl -s "127.0.0.1:$PORT/graph" > tools/data-src/graph.json
python3 - "$PORT" <<'PY'
import json, sys, urllib.parse, urllib.request
port = sys.argv[1]
base = f"http://127.0.0.1:{port}"
graph = json.load(open("tools/data-src/graph.json"))
notes = {}
for n in graph["nodes"]:
    if n["kind"] == "note":
        notes[n["id"]] = json.load(urllib.request.urlopen(f"{base}/note?path={urllib.parse.quote(n['id'])}"))
json.dump(notes, open("tools/data-src/notes.json", "w"), ensure_ascii=False, indent=1)
questions = [
    "What did we decide about prices in May?",            # the question the demo's own "About this demo" note suggests
    "How long do customers have to ask for a refund?",   # the README's example
    "Why do subscribers cancel, and what could keep them?",
    "How is a subscription order roasted and shipped?",
]
answers = []
for q in questions:
    req = urllib.request.Request(f"{base}/ask", data=json.dumps({"question": q}).encode(), headers={"content-type": "application/json"})
    answers.append({"question": q, **json.load(urllib.request.urlopen(req, timeout=180))})
json.dump(answers, open("tools/data-src/answers.json", "w"), ensure_ascii=False, indent=1)
PY
echo "recorded: tools/data-src/{graph,notes,answers}.json"
