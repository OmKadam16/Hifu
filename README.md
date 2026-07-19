# Hifu AI — Clinical Naturalism Skincare Analysis Platform

## What It Is

Hifu AI is an end-to-end skincare analysis platform that combines computer vision, large language model reasoning, and a clinical-grade reporting engine to give users personalized, actionable skincare guidance. Users take or upload a photo of their skin and a photo of any product's ingredient label, and the system produces a structured skin profile, a product compatibility verdict, ranked marketplace recommendations, and a clinical-style skin health report — all powered by **Google Gemma 4** running locally via Ollama.

## Problem It Solves

Most skincare advice is generic, brand-driven, or based on incomplete self-reporting. Consumers cannot evaluate whether a product's ingredient list actually matches their unique skin conditions and goals. There is no accessible tool that:

- Analyzes visible skin characteristics from a photo (oiliness, acne, redness, scarring, pigmentation)
- Reads a product's INCI ingredient label in label order and cross-references it against the user's skin profile
- Ranks real marketplace products by goal-and-profile fit
- Generates a quantified, trend-aware skin health report over time

Hifu AI closes this gap entirely using offline-first AI, ensuring privacy (no images ever leave the user's machine for inference — Ollama runs locally) while delivering dermatologist-level reasoning.

## How We Used Gemma 4

Gemma 4 (`gemma4:e4b-it-qat`) serves as the sole reasoning engine across all five agents. Each agent is defined by a structured prompt that constrains Gemma 4's output to a strict key-value format, which the backend parses programmatically into JSON for the frontend.

The backend calls Ollama's `/api/chat` endpoint directly via `httpx`. Gemma 4 handles:

- **Multimodal input** — skin and label photos are base64-encoded and sent as images in the Ollama chat messages array
- **Structured text generation** — each agent outputs strictly formatted `Key: value` lines parsed by regex
- **Numerical scoring** — the report agent computes a 0–100 skin health score based on scan history statistics embedded in its prompt

## Architecture

### Agent Count: 5

| # | Agent | Input | Output |
|---|-------|-------|--------|
| 1 | Skin Assessment | Skin photo + optional goal | Skin type, conditions, scar regions, ingredient categories |
| 2 | Label Reader | Label photo | Product name, ordered ingredient list (INCI order) |
| 3 | Reconciliation | Agent 1 + 2 outputs | Verdict, flagged/beneficial ingredients, goal alignment |
| 4 | Marketplace Ranking | Profile + candidate products | Ranked recommendation list with conflict flags |
| 5 | Report Generator | Profile + scan history | Skin health score (0–100), trend, clinical insights |

### System Layout

```
┌──────────────────────────────────────────────────────┐
│              Frontend (React + Vite + TypeScript)     │
│   Auth → Skin Scan → Product Scan → Marketplace →   │
│   Profile → Reports                                  │
│       ↕ HTTP (fetch)                        ↕ Auth   │
└──────────────────────┬───────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────┐
│              Backend (FastAPI / Python 3.12)          │
│                                                       │
│   5-Agent Pipeline:                                   │
│   Agent 1 (Skin Assessment)  ← skin photo            │
│   Agent 2 (Label Reader)     ← label photo           │
│   Agent 3 (Reconciliation)   ← profile + ingredients │
│   Agent 4 (Marketplace)      ← profile + candidates  │
│   Agent 5 (Report Generator) ← profile + history     │
│                                                       │
│   Auth: POST /api/auth/signup, /login, /me           │
│   Supabase (optional): skin_profiles, scan_history   │
└──────────────────────┬───────────────────────────────┘
                       │ httpx /api/chat
┌──────────────────────▼───────────────────────────────┐
│              Ollama (localhost:11434)                 │
│              Gemma 4 (e4b-it-qat)                    │
│              Offline inference                        │
└──────────────────────────────────────────────────────┘
```

### Key Design Decisions

- **Offline-first**: All model inference runs on-device through Ollama — no cloud LLM calls, no images leave the machine
- **5 specialized agents**: Each prompt is narrowly scoped (skin assessment, label OCR, reconciliation, ranking, reporting) — improving output quality over a single monolithic prompt
- **Best-effort persistence**: Supabase is optional; the app works fully without it using in-memory state + localStorage
- **O(1) marketplace mock**: 50 products grouped into lookup keys for instant mock results on known skincare keywords, with API fallback
- **Auth gate**: Session persisted as `hifu_session_token`, `hifu_face_id`, `hifu_user_name` in localStorage
- **Live camera scanner**: Native `getUserMedia` capture with dual mode (face oval guide, environment scanning)

## Tech Stack

- **Frontend**: React 19, TypeScript 6, Vite 8, Tailwind CSS 4, React Router 7, Lucide icons
- **Backend**: Python 3.12, FastAPI, httpx
- **Model**: Google Gemma 4 (`gemma4:e4b-it-qat`) via Ollama
- **Database**: Optional Supabase (PostgreSQL)

## How to Run

```bash
# Backend
pip install fastapi uvicorn httpx python-dotenv supabase python-multipart
ollama pull gemma4:e4b-it-qat
uvicorn main:app --host 0.0.0.0 --port 8000

# Frontend
npm install
npm run dev
```
