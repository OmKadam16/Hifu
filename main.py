"""
Hifu — Skincare-analysis backend
=================================

FastAPI server wrapping a 3-agent Google ADK pipeline that runs a local
Gemma model via Ollama. The reasoning path is fully offline (only network
hop: local Ollama at http://localhost:11434). Supabase is used ONLY for
persistence after the fact — saving/loading profiles and scan history —
and every endpoint still produces its analysis if Supabase is down.

Pipeline
--------
  1. Skin Assessment Agent   — skin photo  -> skin profile
  2. Label Reader Agent      — label photo -> ordered ingredient list
  3. Reconciliation Agent    — profile + ingredients -> final verdict

HOW TO RUN
----------
  1. Make sure Ollama is running and the model is pulled:
         ollama pull gemma4:e4b-it-qat
         (Ollama serves at http://localhost:11434 by default)

  2. Install dependencies (ADK + LiteLLM assumed already installed; if not):
         pip install google-adk "litellm" fastapi uvicorn python-multipart supabase python-dotenv

  3. Supabase (optional but recommended): create a `.env` file next to this
     one containing:
         SUPABASE_URL=https://<project>.supabase.co
         SUPABASE_KEY=<anon or service key>
     Without these, analysis still works — persistence is just skipped.

  4. Start the server from this directory:
         uvicorn main:app --host 0.0.0.0 --port 8000

  Endpoints:
     POST /api/assess-skin        (multipart: image=<skin photo>,
                                   goal=<optional text>,
                                   face_id=<optional, reuse code on rescan>)
     POST /api/analyze-product    (multipart: image=<label photo>, plus
                                   face_id=<code> OR assessment=<JSON string>)
     GET  /api/profile/{face_id}  (fetch saved skin profile)
     GET  /api/history/{face_id}  (scan history, most recent first)
     POST /api/marketplace-search (form: face_id=<code>, goal=<free text> —
                                   goal-matched product recommendations)
"""

import base64
import hashlib
import json
import logging
import os
import re
import secrets
from datetime import datetime, timezone

import httpx

from dotenv import load_dotenv

# Pull SUPABASE_URL / SUPABASE_KEY (and any overrides) from a local .env.
load_dotenv()

# LiteLLM (which ADK uses under the hood for the ollama_chat/ provider) reads
# the Ollama base URL from this env var. Set it before any ADK imports.
os.environ.setdefault("OLLAMA_API_BASE", "http://localhost:11434")

from fastapi import Body, FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from supabase import Client, create_client

logger = logging.getLogger("hifu")

# ---------------------------------------------------------------------------
# Supabase — persistence only, never in the reasoning path. If the env vars
# are missing or the client fails to build, everything still runs; profile
# storage and history endpoints degrade gracefully instead of crashing.
# ---------------------------------------------------------------------------
SUPABASE_URL = os.environ.get(
    "SUPABASE_URL", "https://rgnpbwucwtnkyrjmjizy.supabase.co")
SUPABASE_KEY = os.environ.get(
    "SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnbnBid3Vjd3Rua3lyam1qaXp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0MDExNDcsImV4cCI6MjA5OTk3NzE0N30.45dMYrsEJmoKejgLyigz1pSJzQEUGtvAHX0wPnnPP4I")

supabase: Client | None = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as exc:
        logger.warning("Supabase client init failed, persistence disabled: %s", exc)
else:
    logger.warning("SUPABASE_URL/SUPABASE_KEY not set — persistence disabled.")

_OLLAMA_MODEL = "gemma4:e4b-it-qat"
_OLLAMA_URL = "http://localhost:11434/api/chat"


async def _call_ollama(system: str, text: str, image_b64: str | None = None) -> str:
    """Call Ollama chat and return the response text."""
    messages = [{"role": "system", "content": system}]
    msg: dict = {"role": "user", "content": text}
    if image_b64:
        msg["images"] = [image_b64]
    messages.append(msg)
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(_OLLAMA_URL, json={
                "model": _OLLAMA_MODEL,
                "messages": messages,
                "stream": False,
            })
            resp.raise_for_status()
            data = resp.json()
            return data.get("message", {}).get("content", "")
    except Exception as exc:
        raise RuntimeError(f"Ollama call failed: {exc}") from exc


# ---------------------------------------------------------------------------
# Agent prompts (no ADK — called directly via _call_ollama)
# ---------------------------------------------------------------------------
SKIN_ASSESSMENT_PROMPT = """You are a skin assessment module in a skincare-analysis app. You will receive one photo of a person's skin, and optionally a short user-stated goal (e.g. "reduce pimple scars", "even out tone").
Analyze the visible characteristics only. Never diagnose a medical condition — describe what is visibly present, not what it might be caused by.
Respond in exactly this format, nothing else:
Skin_Type: [oily/dry/combination/normal — based on visible shine, texture, pore size]
Visible_Conditions: [comma-separated: acne, redness, hyperpigmentation, dryness, none]
Helpful_Ingredient_Categories: [comma-separated ingredient categories that tend to help these conditions]
Avoid_Ingredient_Categories: [comma-separated ingredient categories that tend to worsen these conditions]
Scar_Regions: [comma-separated: description + rough location, e.g. "small scars, left cheek" — or "none"]
Stated_Goal: [echo back the user's goal if provided, else "none"]"""

LABEL_READER_PROMPT = """You are a label-reading module. You will receive one photo of a skincare product's ingredient list.
Read the ingredients in the exact order they appear on the label. Cosmetic labeling convention (INCI) lists ingredients in descending order by concentration — the first ingredient is the most concentrated, the last is present in only trace amounts. Preserve this order in your output, it matters.
Respond in exactly this format, nothing else:
Product_Name: [name if visible, else "Unknown"]
Ingredients_In_Order: [comma-separated, preserve label order exactly]"""

RECONCILIATION_PROMPT = """You are a reconciliation module. You will receive a skin assessment — skin type, visible conditions, helpful/avoid ingredient categories, scar regions, and an optional user-stated goal — and a product's ingredient list (in label order).
Cross-reference the ingredients against the skin profile's helpful and avoid categories. Ingredients appearing EARLY in the list matter more than ones appearing near the end — say so explicitly when relevant. Never state exact percentages — labels don't disclose them, only order.
Weigh the user's stated goal SPECIFICALLY, separately from the general skin-type match. Example: if the goal is "reduce pimple scars", check whether the product contains scar-fading or skin-repair ingredients (e.g. niacinamide, vitamin C, centella asiatica, retinoids, azelaic acid) and how early they appear — a product can be a neutral skin-type match yet still clearly help the goal, or suit the skin type while doing nothing for the goal. Use the scar regions to judge relevance where it matters.
Respond in exactly this format, nothing else:
Verdict: [Good match / Not a good match / Mixed]
Flagged_Ingredients: [ingredient — why it's a concern — where it sits in the list]
Beneficial_Ingredients: [ingredient — why it helps]
Goal_Alignment: [yes/no/partial — one-line reason tied to specific ingredients and their position — or "n/a" if no goal was stated]
Summary: [one plain-language sentence a user would actually want spoken aloud]"""

MARKETPLACE_RANKING_PROMPT = """You are a product-recommendation module. You will receive a user's skin profile — skin type, visible conditions, avoid ingredient categories, and a goal — plus a numbered list of candidate products with their ingredients in label order.
Rank ALL candidates from best to worst fit for this user's goal and profile. Favor products whose goal-relevant active ingredients appear early in the ingredient list. If a product contains anything from the user's avoid categories, it can still rank wherever it belongs overall, but the conflict must be flagged in its Concern.
Respond in exactly this format, one line per candidate, best first, nothing else:
Rank_1: [candidate number] — [one-line reason this fits the goal and profile] — Concern: [conflicting ingredient from the avoid categories, or "none"]
Rank_2: [candidate number] — [reason] — Concern: [...]
(continue until every candidate is ranked)"""

REPORT_AGENT_PROMPT = """You are a clinical-report module for a skincare-analysis app. You will receive a user's skin profile — skin type, visible conditions, scar regions, and goal — plus their product scan history (each with a verdict, flagged/beneficial ingredients, and a summary).

Analyze everything and produce a structured report. Be specific and honest — use the actual data provided, not generic statements.

Compute the SKIN HEALTH SCORE (0-100) as follows:
- Start at 65 (baseline).
- +10 if the user has scanned products (showing engagement).
- +5 per product with a "Good match" verdict (up to +20).
- -8 per product with a "Not a good match" verdict.
- -3 per product with a "Mixed" verdict.
- +5 if the stated goal appears in any product's beneficial ingredients.
- +5 if scar_regions exist and any product contains scar-fading ingredients (niacinamide, centella, vitamin C, retinoids, azelaic acid, tranexamic acid, alpha arbutin, snail mucin).
- -5 if any flagged ingredient appears in 2+ products (consistent irritant exposure).
- Clamp final score to 0-100.

For the VERDICT_BREAKDOWN, count good/mixed/bad from the scan history:
- Count products where verdict contains "good" (case-insensitive) as IMPROVING
- Count products where verdict contains "not a good match" as CONCERNING
- Count products where verdict contains "mixed" as NEUTRAL

Respond in exactly this format, nothing else:
Skin_Health_Score: [0-100 number]
Score_Trend: [improving/stable/declining]
Total_Products_Scanned: [number]
Improving_Products: [count]
Concerning_Products: [count]
Neutral_Products: [count]
Top_Strength: [one specific thing that's working well for this user, based on their actual scan data]
Top_Weakness: [one specific risk or gap in their current routine, based on actual data]
Recommendation: [one actionable sentence about what to scan or try next, tied to their actual profile]"""


# ---------------------------------------------------------------------------
# Output cleanup & parsing
# ---------------------------------------------------------------------------

# Markers Gemma-family models emit around visible reasoning. If any appear,
# everything up to and including the *last* end-of-thinking marker is dropped.
_THINK_END_MARKERS = [
    "...done thinking.",
    "…done thinking.",
    "done thinking.",
    "</think>",
    "<|think off|>",
]


def strip_thinking(text: str) -> str:
    """Remove any visible reasoning trace, keeping only the structured answer."""
    # Remove fully-delimited <think>...</think> blocks first.
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL | re.IGNORECASE)
    # Then cut everything before the last end-of-thinking marker, if present.
    lowered = text.lower()
    cut = -1
    for marker in _THINK_END_MARKERS:
        idx = lowered.rfind(marker.lower())
        if idx != -1:
            cut = max(cut, idx + len(marker))
    if cut != -1:
        text = text[cut:]
    # Drop stray markdown fences the model sometimes wraps output in.
    text = re.sub(r"^```[a-zA-Z]*\s*|\s*```$", "", text.strip())
    return text.strip()


def parse_fields(text: str, expected_fields: list,
                 optional_fields: tuple = ()) -> dict | None:
    """Extract "Key: value" fields from model output. Returns None if any
    expected field is missing (i.e. the model broke format).

    Deliberately forgiving: Gemma sometimes emits visible reasoning with no
    end-of-thinking marker, restates the format mid-reasoning, or glues a
    field onto the end of a sentence. So each field is matched ANYWHERE in
    the text (not just at line starts) and the LAST occurrence wins — the
    real answer always comes after any reasoning that echoes the format.
    A value continues across lines until the next line that looks like a
    new "Something:" field (handles wrapped ingredient lists).

    `optional_fields` are extracted the same way but their absence does not
    fail the parse — callers use .get() with a default for them."""
    result = {}
    for field in [*expected_fields, *optional_fields]:
        # value = rest of line + following lines that aren't a new field
        pattern = (rf"\**{re.escape(field)}\**\s*:\s*"
                   rf"(.+(?:\n(?!\s*\**[A-Za-z_ ]+\**\s*:).+)*)")
        matches = re.findall(pattern, text, flags=re.IGNORECASE)
        if matches:
            value = " ".join(line.strip() for line in matches[-1].splitlines())
            result[field] = value.strip().strip("[]").strip()
    if all(f in result for f in expected_fields):
        return result
    return None


def to_list(value: str) -> list:
    """Split a comma-separated field into a clean list."""
    items = [item.strip() for item in value.split(",")]
    return [i for i in items if i and i.lower() != "none"]


def to_entry_list(value: str) -> list:
    """Split a field holding "item — reason" entries. Entries are separated by
    semicolons, newlines, or a sentence boundary that starts a new
    "Ingredient — ..." pattern (the model often chains entries with ". ")."""
    items = re.split(r"[;\n]|(?<=[.!])\s+(?=[A-Z][^.—]{0,40}\s+—)", value)
    items = [i.strip(" -•") for i in items]
    items = [i for i in items if i and i.lower() not in ("none", "n/a")]
    # A fragment with no em-dash isn't a new "ingredient — reason" entry —
    # it's the continuation of the previous one (the model sometimes breaks
    # a single entry's reason across semicolons). Glue it back on.
    merged: list = []
    for item in items:
        if merged and "—" not in item and "–" not in item:
            merged[-1] += "; " + item
        else:
            merged.append(item)
    return merged


# Shareable-code alphabet: uppercase + digits, minus lookalikes 0/O and 1/I.
_FACE_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def generate_face_id() -> str:
    """7-character shareable code, e.g. 'K7PQ2MX'."""
    return "".join(secrets.choice(_FACE_ID_ALPHABET) for _ in range(7))


def error_json(status: int, message: str, raw_output: str | None = None):
    body = {"success": False, "error": message}
    if raw_output is not None:
        body["raw_output"] = raw_output
    return JSONResponse(status_code=status, content=body)


async def read_image(upload: UploadFile) -> tuple[bytes, str] | None:
    """Read an uploaded image; returns (bytes, mime_type) or None if unusable."""
    data = await upload.read()
    if not data:
        return None
    mime = upload.content_type or ""
    if not mime.startswith("image/"):
        # Fall back to sniffing common magic bytes rather than rejecting
        # outright — Flutter's multipart uploads sometimes omit the type.
        if data[:3] == b"\xff\xd8\xff":
            mime = "image/jpeg"
        elif data[:8] == b"\x89PNG\r\n\x1a\n":
            mime = "image/png"
        elif data[:4] == b"RIFF" and data[8:12] == b"WEBP":
            mime = "image/webp"
        else:
            return None
    return data, mime


# ---------------------------------------------------------------------------
# Marketplace demo catalog
# ---------------------------------------------------------------------------
# Real products with ABBREVIATED ingredient lists (first handful in label
# order) — demo data, good enough for ranking; swap for full INCI lists later.
# `targets` uses the canonical tags in _TARGET_KEYWORDS below.
PRODUCTS = [
    {"name": "Niacinamide 10% + Zinc 1%", "brand": "The Ordinary",
     "ingredients_in_order": ["Aqua", "Niacinamide", "Pentylene Glycol", "Zinc PCA", "Tamarindus Indica Seed Gum", "Xanthan Gum", "Phenoxyethanol"],
     "targets": ["acne", "oiliness", "scarring", "hyperpigmentation"]},
    {"name": "Effaclar Duo+M", "brand": "La Roche-Posay",
     "ingredients_in_order": ["Aqua", "Glycerin", "Dimethicone", "Niacinamide", "Isocetyl Stearate", "Salicylic Acid", "Zinc PCA"],
     "targets": ["acne", "scarring", "oiliness", "redness"]},
    {"name": "2% BHA Liquid Exfoliant", "brand": "Paula's Choice",
     "ingredients_in_order": ["Aqua", "Methylpropanediol", "Butylene Glycol", "Salicylic Acid", "Camellia Oleifera Leaf Extract", "Sodium Hydroxide"],
     "targets": ["acne", "texture", "oiliness"]},
    {"name": "Foaming Facial Cleanser", "brand": "CeraVe",
     "ingredients_in_order": ["Aqua", "Cocamidopropyl Hydroxysultaine", "Glycerin", "Niacinamide", "Ceramide NP", "Hyaluronic Acid"],
     "targets": ["acne", "oiliness"]},
    {"name": "Moisturizing Cream", "brand": "CeraVe",
     "ingredients_in_order": ["Aqua", "Glycerin", "Cetearyl Alcohol", "Caprylic/Capric Triglyceride", "Ceramide NP", "Ceramide AP", "Hyaluronic Acid"],
     "targets": ["dryness", "redness"]},
    {"name": "Advanced Snail 96 Mucin Power Essence", "brand": "COSRX",
     "ingredients_in_order": ["Snail Secretion Filtrate", "Betaine", "Butylene Glycol", "1,2-Hexanediol", "Sodium Hyaluronate", "Panthenol", "Allantoin"],
     "targets": ["scarring", "dryness", "dullness"]},
    {"name": "Salicylic Acid Daily Gentle Cleanser", "brand": "COSRX",
     "ingredients_in_order": ["Aqua", "Sodium Lauryl Sulfate", "Cocamidopropyl Betaine", "Salicylic Acid", "Melaleuca Alternifolia Leaf Oil"],
     "targets": ["acne", "oiliness"]},
    {"name": "Alpha Arbutin 2% + HA", "brand": "The Ordinary",
     "ingredients_in_order": ["Aqua", "Alpha-Arbutin", "Polyacrylate Crosspolymer-6", "Hydrolyzed Sodium Hyaluronate", "Propanediol", "Lactic Acid"],
     "targets": ["hyperpigmentation", "scarring", "dullness"]},
    {"name": "Azelaic Acid Suspension 10%", "brand": "The Ordinary",
     "ingredients_in_order": ["Aqua", "Isodecyl Neopentanoate", "Dimethicone", "Azelaic Acid", "Dimethicone Crosspolymer", "Isohexadecane"],
     "targets": ["redness", "acne", "hyperpigmentation", "scarring"]},
    {"name": "Discoloration Correcting Serum", "brand": "Good Molecules",
     "ingredients_in_order": ["Aqua", "Butylene Glycol", "Tranexamic Acid", "Niacinamide", "Glycerin", "Sodium Hyaluronate"],
     "targets": ["hyperpigmentation", "scarring", "dullness"]},
    {"name": "Hydro Boost Water Gel", "brand": "Neutrogena",
     "ingredients_in_order": ["Aqua", "Dimethicone", "Glycerin", "Dimethicone/Vinyl Dimethicone Crosspolymer", "Sodium Hyaluronate", "Parfum"],
     "targets": ["dryness"]},
    {"name": "Cicaplast Baume B5+", "brand": "La Roche-Posay",
     "ingredients_in_order": ["Aqua", "Hydrogenated Polyisobutene", "Dimethicone", "Glycerin", "Panthenol", "Butyrospermum Parkii Butter", "Madecassoside"],
     "targets": ["redness", "dryness", "scarring"]},
    {"name": "Niacinamide 10%", "brand": "The Inkey List",
     "ingredients_in_order": ["Aqua", "Niacinamide", "Propanediol", "Glycerin", "Betaine", "Phenoxyethanol"],
     "targets": ["acne", "oiliness", "hyperpigmentation"]},
    {"name": "Gentle Skin Cleanser", "brand": "Cetaphil",
     "ingredients_in_order": ["Aqua", "Glycerin", "Cocamidopropyl Betaine", "Panthenol", "Niacinamide", "Pantolactone"],
     "targets": ["dryness", "redness"]},
    {"name": "Minéral 89 Hyaluronic Acid Booster", "brand": "Vichy",
     "ingredients_in_order": ["Aqua", "Glycerin", "Pentylene Glycol", "Sodium Hyaluronate", "Citric Acid"],
     "targets": ["dryness", "dullness"]},
    {"name": "Hyaluronic Acid 2% + B5", "brand": "The Ordinary",
     "ingredients_in_order": ["Aqua", "Sodium Hyaluronate", "Pentylene Glycol", "Propanediol", "Panthenol", "Ahnfeltia Concinna Extract"],
     "targets": ["dryness"]},
    {"name": "Clearly Corrective Dark Spot Solution", "brand": "Kiehl's",
     "ingredients_in_order": ["Aqua", "Ascorbyl Glucoside", "Dimethicone", "Glycerin", "Salicylic Acid", "Paeonia Suffruticosa Root Extract"],
     "targets": ["hyperpigmentation", "dullness", "scarring"]},
    {"name": "Melano CC Vitamin C Essence", "brand": "Rohto Mentholatum",
     "ingredients_in_order": ["Ascorbic Acid", "Tocopheryl Acetate", "Alpinia Katsumadai Seed Extract", "Isopropyl Methylphenol"],
     "targets": ["hyperpigmentation", "scarring", "dullness", "acne"]},
    {"name": "AHA-BHA-PHA 30 Days Miracle Toner", "brand": "Some By Mi",
     "ingredients_in_order": ["Aqua", "Butylene Glycol", "Niacinamide", "Salicylic Acid", "Lactobionic Acid", "Melaleuca Alternifolia Leaf Water"],
     "targets": ["acne", "texture", "oiliness"]},
    {"name": "Aloe BHA Skin Toner", "brand": "Benton",
     "ingredients_in_order": ["Aloe Barbadensis Leaf Water", "Aqua", "Butylene Glycol", "Snail Secretion Filtrate", "Salicylic Acid", "Betaine"],
     "targets": ["acne", "redness"]},
    {"name": "Green Tea Seed Hyaluronic Serum", "brand": "Innisfree",
     "ingredients_in_order": ["Camellia Sinensis Leaf Water", "Aqua", "Glycerin", "Butylene Glycol", "Camellia Sinensis Seed Oil", "Sodium Hyaluronate"],
     "targets": ["dryness", "dullness"]},
    {"name": "Freshly Juiced Vitamin Drop", "brand": "Klairs",
     "ingredients_in_order": ["Aqua", "Propylene Glycol", "Ascorbic Acid", "Hydroxyethylcellulose", "Centella Asiatica Extract", "Citrus Junos Fruit Extract"],
     "targets": ["hyperpigmentation", "dullness", "scarring"]},
    {"name": "Centella Green Level Buffet Serum", "brand": "Purito",
     "ingredients_in_order": ["Centella Asiatica Extract", "Aqua", "Butylene Glycol", "Glycerin", "Niacinamide", "Sodium Hyaluronate", "Madecassoside"],
     "targets": ["redness", "scarring", "dryness"]},
    {"name": "Cicapair Tiger Grass Color Correcting Treatment", "brand": "Dr. Jart+",
     "ingredients_in_order": ["Aqua", "Cyclopentasiloxane", "Zinc Oxide", "Butylene Glycol", "Centella Asiatica Extract", "Chromium Oxide Greens"],
     "targets": ["redness"]},
    {"name": "Glycolic Acid 7% Exfoliating Toner", "brand": "The Ordinary",
     "ingredients_in_order": ["Aqua", "Glycolic Acid", "Rosa Damascena Flower Water", "Centaurea Cyanus Flower Water", "Propanediol", "Panthenol"],
     "targets": ["texture", "dullness", "hyperpigmentation"]},
    {"name": "Cicalfate+ Restorative Protective Cream", "brand": "Avène",
     "ingredients_in_order": ["Aqua", "Mineral Oil", "Glycerin", "Zinc Oxide", "Copper Sulfate", "Zinc Sulfate"],
     "targets": ["redness", "scarring", "dryness"]},
    {"name": "Sébium Global", "brand": "Bioderma",
     "ingredients_in_order": ["Aqua", "Glycerin", "Dimethicone", "Salicylic Acid", "Zinc Gluconate", "Bakuchiol", "Glycolic Acid"],
     "targets": ["acne", "oiliness"]},
    {"name": "Advanced Repair Cream", "brand": "Eucerin",
     "ingredients_in_order": ["Aqua", "Glycerin", "Cetearyl Alcohol", "Urea", "Ceramide NP", "Sodium Lactate"],
     "targets": ["dryness"]},
    {"name": "Sebiaclear Active Gel", "brand": "SVR",
     "ingredients_in_order": ["Aqua", "Niacinamide", "Gluconolactone", "Glycerin", "Salicylic Acid", "Zinc Gluconate"],
     "targets": ["acne", "scarring", "oiliness"]},
    {"name": "Vitamin C Complex Serum", "brand": "Naturium",
     "ingredients_in_order": ["Aqua", "Tetrahexyldecyl Ascorbate", "Glycerin", "Niacinamide", "Tocopherol", "Ferulic Acid"],
     "targets": ["hyperpigmentation", "dullness", "aging", "scarring"]},
]

# Canonical condition/goal tags → keywords that map free text onto them.
_TARGET_KEYWORDS = {
    "acne": ["acne", "pimple", "breakout", "blemish", "zit", "blackhead", "whitehead", "spot-prone"],
    "scarring": ["scar", "mark", "post-acne", "pih", "pitted"],
    "hyperpigmentation": ["hyperpigmentation", "dark spot", "pigment", "even out", "uneven tone", "melasma", "discolor", "sun spot"],
    "redness": ["redness", "red", "rosacea", "irritat", "sensitive", "calm", "sooth"],
    "dryness": ["dry", "flak", "dehydrat", "hydrat", "moistur", "tight"],
    "oiliness": ["oily", "oil control", "shine", "greasy", "sebum", "pores"],
    "aging": ["aging", "wrinkle", "fine line", "firm", "sagging"],
    "dullness": ["dull", "glow", "bright", "radian"],
    "texture": ["texture", "rough", "bumpy", "smooth", "exfoliat"],
}


def _wanted_tags(profile: dict, goal: str) -> set:
    """Map the profile's visible conditions + free-text goal onto catalog tags."""
    text = " ".join([
        goal.lower(),
        (profile.get("stated_goal") or "").lower(),
        *[c.lower() for c in (profile.get("visible_conditions") or [])],
    ])
    tags = set()
    for tag, keywords in _TARGET_KEYWORDS.items():
        if tag in text or any(kw in text for kw in keywords):
            tags.add(tag)
    return tags


def _parse_ranking(text: str, count: int) -> list:
    """Parse "Rank_N: [num] — reason — Concern: ..." lines into
    [(candidate_index, reason, concern_or_None), ...] in ranked order."""
    out, seen = [], set()
    for line in text.splitlines():
        m = re.search(r"Rank[_\s]*\d+\s*:\s*\[?(\d+)\]?\s*[—–-]+\s*(.+)",
                      line.strip(), flags=re.IGNORECASE)
        if not m:
            continue
        idx = int(m.group(1))
        if idx < 1 or idx > count or idx in seen:
            continue
        seen.add(idx)
        rest = m.group(2).strip()
        # Word-internal hyphens ("non-comedogenic") don't match: the split
        # needs a dash immediately followed by "Concern:".
        pieces = re.split(r"[—–-]+\s*Concern\s*:\s*", rest, flags=re.IGNORECASE)
        reason = pieces[0].strip(" —–-[]")
        concern = None
        if len(pieces) > 1:
            c = pieces[1].strip(" .[]")
            if c and c.lower() not in ("none", "n/a"):
                concern = c
        out.append((idx, reason, concern))
    return out


# ---------------------------------------------------------------------------
# Auth — simple user store with hashed passwords
# ---------------------------------------------------------------------------
# In-memory store: email -> {name, face_id, password_hash, token}
# Best-effort persisted to Supabase `users` table when available.
_USERS: dict[str, dict] = {}


def _hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def _generate_token() -> str:
    return secrets.token_urlsafe(32)


def _auth_face_id() -> str:
    """7-char shareable code, usable as a face_id."""
    alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alpha) for _ in range(7))


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(title="Hifu Skincare Analysis API")

# CORS wide open so the Flutter web/dev frontend can call us from any origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get("http://localhost:11434/api/tags")
            if resp.status_code == 200:
                data = resp.json()
                models = data.get("models", [])
                gemma = any("gemma4" in (m.get("name") or "") for m in models)
                return {"status": "ok" if gemma else "degraded",
                        "model": "ollama_chat/gemma4:e4b-it-qat",
                        "ollama": "connected",
                        "gemma4_available": gemma}
    except Exception:
        pass
    return JSONResponse(status_code=503,
                        content={"status": "offline",
                                 "reason": "Ollama/Gemma4 unreachable"})


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------


@app.post("/api/auth/signup")
async def auth_signup(body: dict = Body(...)):
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    name = (body.get("name") or "User").strip()
    if not email or "@" not in email:
        return JSONResponse(status_code=400, content={"success": False, "error": "Valid email is required."})
    if len(password) < 4:
        return JSONResponse(status_code=400, content={"success": False, "error": "Password must be at least 4 characters."})
    if email in _USERS:
        return JSONResponse(status_code=409, content={"success": False, "error": "An account with this email already exists."})

    face_id = _auth_face_id()
    token = _generate_token()
    _USERS[email] = {
        "name": name,
        "face_id": face_id,
        "password_hash": _hash_password(password),
        "token": token,
    }

    if supabase is not None:
        try:
            supabase.table("users").upsert({
                "email": email,
                "name": name,
                "face_id": face_id,
                "password_hash": _hash_password(password),
                "token": token,
            }, on_conflict="email").execute()
        except Exception as exc:
            logger.warning("user upsert failed for %s: %s", email, exc)

    return {"success": True, "token": token, "face_id": face_id, "name": name}


@app.post("/api/auth/login")
async def auth_login(body: dict = Body(...)):
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    if not email:
        return JSONResponse(status_code=400, content={"success": False, "error": "Email is required."})

    user = _USERS.get(email)
    if user is None and supabase is not None:
        try:
            res = (supabase.table("users").select("*").eq("email", email).limit(1).execute())
            if res.data:
                row = res.data[0]
                user = {
                    "name": row.get("name", "User"),
                    "face_id": row.get("face_id"),
                    "password_hash": row.get("password_hash"),
                    "token": row.get("token"),
                }
                _USERS[email] = user
        except Exception:
            pass

    if user is None:
        return JSONResponse(status_code=401, content={"success": False, "error": "No account found with this email."})

    if user["password_hash"] != _hash_password(password):
        return JSONResponse(status_code=401, content={"success": False, "error": "Incorrect password."})

    token = _generate_token()
    user["token"] = token
    if supabase is not None:
        try:
            supabase.table("users").update({"token": token}).eq("email", email).execute()
        except Exception:
            pass

    return {"success": True, "token": token, "face_id": user["face_id"], "name": user["name"]}


@app.post("/api/auth/me")
async def auth_me(body: dict = Body(...)):
    token = (body.get("token") or "").strip()
    if not token:
        return JSONResponse(status_code=401, content={"success": False, "error": "Token is required."})
    for email, user in _USERS.items():
        if user["token"] == token:
            return {"success": True, "email": email, "face_id": user["face_id"], "name": user["name"]}
    return JSONResponse(status_code=401, content={"success": False, "error": "Invalid or expired token."})


@app.post("/api/assess-skin")
async def assess_skin(
    image: UploadFile = File(...),
    goal: str = Form(""),
    face_id: str = Form(""),
):
    """Run the Skin Assessment Agent on a skin photo.

    `goal` is an optional plain-text form field with the user's stated goal
    (e.g. "reduce pimple scars"); it is passed to the agent and echoed back.
    `face_id` is optional: pass the existing code on a rescan to update that
    profile in place (keeps the shareable code stable); omit it on a first
    scan and a fresh code is generated.
    """
    img = await read_image(image)
    if img is None:
        return error_json(400, "Uploaded file is empty or not a readable image (jpeg/png/webp).")
    data, mime = img

    goal = goal.strip()
    prompt_text = (
        f'Analyze this skin photo. User-stated goal: "{goal}"'
        if goal else "Analyze this skin photo. No user goal provided."
    )
    image_b64 = base64.b64encode(data).decode("ascii")

    try:
        raw = await _call_ollama(SKIN_ASSESSMENT_PROMPT, prompt_text, image_b64)
    except Exception as exc:
        return error_json(502, f"Model call failed — is Ollama running with gemma4:e4b-it-qat pulled? ({exc})")

    cleaned = strip_thinking(raw)
    fields = parse_fields(
        cleaned,
        ["Skin_Type", "Visible_Conditions",
         "Helpful_Ingredient_Categories", "Avoid_Ingredient_Categories"],
        optional_fields=("Scar_Regions", "Stated_Goal"),
    )
    if fields is None:
        return error_json(422, "Model output did not match the expected skin-assessment format.", cleaned)

    # Scar regions use commas INSIDE a single region ("small scars, left
    # cheek"), so split on entry boundaries (; / newline / sentence+dash),
    # not commas. Falls back to the user's own goal if the model forgot to
    # echo it.
    stated_goal = fields.get("Stated_Goal", "").strip() or (goal or "none")
    profile = {
        "skin_type": fields["Skin_Type"],
        "visible_conditions": to_list(fields["Visible_Conditions"]),
        "helpful_ingredient_categories": to_list(fields["Helpful_Ingredient_Categories"]),
        "avoid_ingredient_categories": to_list(fields["Avoid_Ingredient_Categories"]),
        "scar_regions": to_entry_list(fields.get("Scar_Regions", "none")),
        "stated_goal": stated_goal,
    }

    face_id = face_id.strip().upper() or generate_face_id()

    # Persist (best-effort): UPSERT so a rescan with the same face_id updates
    # the existing row. created_at is left to the DB default; last_updated is
    # refreshed on every write, including the conflict/update path.
    persisted = False
    if supabase is not None:
        try:
            supabase.table("skin_profiles").upsert(
                {
                    "face_id": face_id,
                    **profile,
                    "last_updated": datetime.now(timezone.utc).isoformat(),
                },
                on_conflict="face_id",
            ).execute()
            persisted = True
        except Exception as exc:
            logger.warning("skin_profiles upsert failed for %s: %s", face_id, exc)

    return {"success": True, "face_id": face_id, "persisted": persisted,
            "data": profile}


@app.post("/api/analyze-product")
async def analyze_product(
    image: UploadFile = File(...),
    assessment: str = Form(""),
    face_id: str = Form(""),
):
    """Run Label Reader then Reconciliation.

    Provide the skin profile one of two ways:
      - `face_id`: the code from /api/assess-skin — the profile is fetched
        from Supabase (preferred; frontend doesn't resend the whole object).
      - `assessment`: JSON string of /api/assess-skin's "data" object
        (backward-compatible path; works without Supabase).
    If both are sent, the explicit `assessment` wins and `face_id` is still
    used to log the scan into history.
    """
    # --- resolve the skin profile ---------------------------------------
    face_id = face_id.strip().upper()
    skin = None
    if assessment.strip():
        try:
            skin = json.loads(assessment)
            if not isinstance(skin, dict) or "skin_type" not in skin:
                raise ValueError
        except (json.JSONDecodeError, ValueError):
            return error_json(400, "`assessment` must be the JSON object returned in /api/assess-skin's `data` field.")
    elif face_id:
        if supabase is None:
            return error_json(503, "Profile lookup by face_id requires Supabase, which is not configured on the server. Send the `assessment` JSON instead.")
        try:
            res = (supabase.table("skin_profiles").select("*")
                   .eq("face_id", face_id).limit(1).execute())
        except Exception as exc:
            return error_json(502, f"Could not reach the profile database ({exc}).")
        if not res.data:
            return error_json(404, f"No skin profile found for face ID {face_id}. Scan your skin first.")
        skin = res.data[0]
    else:
        return error_json(400, "Provide either `face_id` or `assessment`.")

    img = await read_image(image)
    if img is None:
        return error_json(400, "Uploaded file is empty or not a readable image (jpeg/png/webp).")
    data, mime = img

    # --- step 1: Label Reader Agent --------------------------------------
    image_b64 = base64.b64encode(data).decode("ascii")
    try:
        raw_label = await _call_ollama(LABEL_READER_PROMPT, "Read the ingredient label in this photo.", image_b64)
    except Exception as exc:
        return error_json(502, f"Model call failed during label reading — is Ollama running? ({exc})")

    label_fields = parse_fields(
        strip_thinking(raw_label), ["Product_Name", "Ingredients_In_Order"]
    )
    if label_fields is None:
        return error_json(422, "Could not read an ingredient list from the label photo. Try a sharper, closer photo of the label.", strip_thinking(raw_label))

    ingredients = to_list(label_fields["Ingredients_In_Order"])
    if not ingredients:
        return error_json(422, "No ingredients were detected on the label. Try a clearer photo.", strip_thinking(raw_label))

    # --- step 2: Reconciliation Agent ------------------------------------
    # Both prior outputs are handed over as plain text, keeping label order.
    stated_goal = (skin.get("stated_goal") or "none").strip()
    scar_regions = skin.get("scar_regions") or []
    reconciliation_input = (
        "SKIN ASSESSMENT:\n"
        f"Skin_Type: {skin.get('skin_type', 'unknown')}\n"
        f"Visible_Conditions: {', '.join(skin.get('visible_conditions', [])) or 'none'}\n"
        f"Helpful_Ingredient_Categories: {', '.join(skin.get('helpful_ingredient_categories', [])) or 'none'}\n"
        f"Avoid_Ingredient_Categories: {', '.join(skin.get('avoid_ingredient_categories', [])) or 'none'}\n"
        f"Scar_Regions: {'; '.join(scar_regions) or 'none'}\n"
        f"Stated_Goal: {stated_goal}\n"
        "\n"
        "PRODUCT:\n"
        f"Product_Name: {label_fields['Product_Name']}\n"
        f"Ingredients_In_Order (first = most concentrated): {', '.join(ingredients)}\n"
    )
    try:
        raw_verdict = await _call_ollama(RECONCILIATION_PROMPT, reconciliation_input)
    except Exception as exc:
        return error_json(502, f"Model call failed during reconciliation — is Ollama running? ({exc})")

    verdict_fields = parse_fields(
        strip_thinking(raw_verdict),
        ["Verdict", "Flagged_Ingredients", "Beneficial_Ingredients", "Summary"],
        optional_fields=("Goal_Alignment",),
    )
    if verdict_fields is None:
        return error_json(422, "Model output did not match the expected verdict format.", strip_thinking(raw_verdict))

    goal_alignment = verdict_fields.get("Goal_Alignment", "").strip() or "n/a"
    # Normalized yes/no/partial/n/a token pulled off the front of the field,
    # so the UI can badge it without string-matching the free-text reason.
    match = re.match(r"\s*\**(yes|no|partial|n/?a)\b", goal_alignment,
                     flags=re.IGNORECASE)
    goal_alignment_label = (
        match.group(1).lower().replace("na", "n/a") if match else "unclear")

    # --- persist to scan_history (best-effort, never blocks the verdict) --
    logged = False
    if supabase is not None and face_id:
        try:
            supabase.table("scan_history").insert({
                "face_id": face_id,
                "product_name": label_fields["Product_Name"],
                "ingredients_in_order": ingredients,
                "verdict": verdict_fields["Verdict"],
                "flagged_ingredients": to_entry_list(verdict_fields["Flagged_Ingredients"]),
                "beneficial_ingredients": to_entry_list(verdict_fields["Beneficial_Ingredients"]),
                "goal_alignment": goal_alignment,
                "goal_alignment_label": goal_alignment_label,
                "summary": verdict_fields["Summary"],
                "scanned_at": datetime.now(timezone.utc).isoformat(),
            }).execute()
            logged = True
        except Exception as exc:
            logger.warning("scan_history insert failed for %s: %s", face_id, exc)

    return {
        "success": True,
        "logged_to_history": logged,
        "data": {
            "product_name": label_fields["Product_Name"],
            "ingredients_in_order": ingredients,
            "verdict": verdict_fields["Verdict"],
            "flagged_ingredients": to_entry_list(verdict_fields["Flagged_Ingredients"]),
            "beneficial_ingredients": to_entry_list(verdict_fields["Beneficial_Ingredients"]),
            "goal_alignment": goal_alignment,
            "goal_alignment_label": goal_alignment_label,
            "summary": verdict_fields["Summary"],
        },
    }


@app.get("/api/profile/{face_id}")
async def get_profile(face_id: str):
    """Fetch a saved skin profile by its shareable face_id."""
    if supabase is None:
        return error_json(503, "Profile storage is not configured on the server (missing SUPABASE_URL/SUPABASE_KEY).")
    face_id = face_id.strip().upper()
    try:
        res = (supabase.table("skin_profiles").select("*")
               .eq("face_id", face_id).limit(1).execute())
    except Exception as exc:
        return error_json(502, f"Could not reach the profile database ({exc}).")
    if not res.data:
        return error_json(404, f"No skin profile found for face ID {face_id}.")
    row = res.data[0]

    def _ensure_list(v):
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return []

    return {
        "success": True,
        "face_id": face_id,
        "data": {
            "skin_type": row.get("skin_type") or "unknown",
            "visible_conditions": _ensure_list(row.get("visible_conditions")),
            "helpful_ingredient_categories": _ensure_list(row.get("helpful_ingredient_categories")),
            "avoid_ingredient_categories": _ensure_list(row.get("avoid_ingredient_categories")),
            "scar_regions": _ensure_list(row.get("scar_regions")),
            "stated_goal": row.get("stated_goal") or "none",
            "scanned_at": row.get("last_updated") or row.get("created_at"),
        },
    }


@app.get("/api/history/{face_id}")
async def get_history(face_id: str):
    """Scan history for a face_id, most recent first."""
    if supabase is None:
        return error_json(503, "History storage is not configured on the server (missing SUPABASE_URL/SUPABASE_KEY).")
    face_id = face_id.strip().upper()
    try:
        res = (supabase.table("scan_history").select("*")
               .eq("face_id", face_id)
               .order("scanned_at", desc=True).execute())
    except Exception as exc:
        return error_json(502, f"Could not reach the history database ({exc}).")

    def _ensure_list(v):
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return []

    def _normalize(row: dict) -> dict:
        gal = row.get("goal_alignment_label") or ""
        if not gal:
            ga = (row.get("goal_alignment") or "").strip().lower()
            if re.match(r"\s*y\s*e\s*s\b", ga):
                gal = "yes"
            elif re.match(r"\s*n\s*o\b", ga):
                gal = "no"
            elif "partial" in ga:
                gal = "partial"
            else:
                gal = "n/a"
        return {
            "product_name": row.get("product_name") or "Unknown",
            "ingredients_in_order": _ensure_list(row.get("ingredients_in_order")),
            "verdict": row.get("verdict") or "Unknown",
            "flagged_ingredients": _ensure_list(row.get("flagged_ingredients")),
            "beneficial_ingredients": _ensure_list(row.get("beneficial_ingredients")),
            "goal_alignment": row.get("goal_alignment") or "",
            "goal_alignment_label": gal,
            "summary": row.get("summary") or "",
            "scanned_at": row.get("scanned_at") or "",
            "face_id": row.get("face_id") or face_id,
        }

    data = [_normalize(r) for r in (res.data or [])]
    return {"success": True, "face_id": face_id, "data": data}


@app.post("/api/marketplace-search")
async def marketplace_search(face_id: str = Form(...), goal: str = Form("")):
    """Recommend catalog products for a saved profile + free-text goal.

    Fast path first: keyword-filter PRODUCTS down to the top candidates by
    target overlap (no model involved), then ONE Gemma call ranks those
    candidates and flags avoid-category conflicts. If the model call or its
    parse fails, the keyword-filtered order is returned so the endpoint
    still answers.
    """
    # --- fetch the profile ------------------------------------------------
    if supabase is None:
        return error_json(503, "Marketplace search needs the saved profile, but Supabase is not configured on the server.")
    face_id = face_id.strip().upper()
    try:
        res = (supabase.table("skin_profiles").select("*")
               .eq("face_id", face_id).limit(1).execute())
    except Exception as exc:
        return error_json(502, f"Could not reach the profile database ({exc}).")
    if not res.data:
        return error_json(404, f"No skin profile found for face ID {face_id}. Scan your skin first.")
    profile = res.data[0]
    goal = goal.strip()
    effective_goal = goal or (profile.get("stated_goal") or "none")

    # --- fast keyword filter (no model call) ------------------------------
    tags = _wanted_tags(profile, goal)
    scored = []
    for product in PRODUCTS:
        overlap = set(product["targets"]) & tags
        if overlap:
            scored.append((len(overlap), product, overlap))
    scored.sort(key=lambda t: -t[0])
    candidates = [(p, o) for _, p, o in scored[:8]]
    if not candidates:
        # Odd goal that matched no tags — let the model rank a slice of the
        # catalog rather than returning nothing.
        candidates = [(p, set()) for p in PRODUCTS[:8]]

    # --- one ranking call --------------------------------------------------
    catalog_lines = [
        f"{i}. {p['name']} — {p['brand']} — targets: {', '.join(p['targets'])}"
        f" — ingredients (label order): {', '.join(p['ingredients_in_order'])}"
        for i, (p, _) in enumerate(candidates, start=1)
    ]
    ranking_input = (
        "USER PROFILE:\n"
        f"Skin_Type: {profile.get('skin_type', 'unknown')}\n"
        f"Visible_Conditions: {', '.join(profile.get('visible_conditions') or []) or 'none'}\n"
        f"Avoid_Ingredient_Categories: {', '.join(profile.get('avoid_ingredient_categories') or []) or 'none'}\n"
        f"Goal: {effective_goal}\n"
        "\n"
        "CANDIDATE PRODUCTS:\n" + "\n".join(catalog_lines)
    )

    ranked, ranked_by = [], "model"
    try:
        raw = await _call_ollama(MARKETPLACE_RANKING_PROMPT, ranking_input)
        ranked = _parse_ranking(strip_thinking(raw), len(candidates))
    except Exception as exc:
        logger.warning("marketplace ranking call failed: %s", exc)

    results = []
    # Base prices for demo catalog (index → $)
    _BASE_PRICES = [14.99, 24.99, 16.50, 12.99, 19.99, 29.99, 15.99, 22.50,
                    18.99, 26.00, 21.49, 27.99, 11.99, 13.99, 31.99, 17.99,
                    34.99, 23.99, 20.99, 15.49, 28.99, 25.99, 32.99, 39.99,
                    16.99, 24.50, 19.49, 21.99, 14.49, 27.50]

    def _match_score(idx: int, total: int) -> int:
        return max(72, 98 - (idx - 1) * (26 // max(total - 1, 1)))

    if ranked:
        for idx, reason, concern in ranked:
            product, _ = candidates[idx - 1]
            pidx = PRODUCTS.index(product)
            results.append({
                "name": product["name"], "brand": product["brand"],
                "reason": reason, "concern_flag": concern,
                "match_score": _match_score(idx, len(candidates)),
                "price": _BASE_PRICES[pidx % len(_BASE_PRICES)],
            })
        ranked_idx = {i for i, _, _ in ranked}
        for i, (product, overlap) in enumerate(candidates, start=1):
            if i not in ranked_idx:
                pidx = PRODUCTS.index(product)
                results.append({
                    "name": product["name"], "brand": product["brand"],
                    "reason": f"Targets {', '.join(sorted(overlap)) or 'general care'} for your profile.",
                    "concern_flag": None,
                    "match_score": _match_score(i, len(candidates)),
                    "price": _BASE_PRICES[pidx % len(_BASE_PRICES)],
                })
    else:
        ranked_by = "filter_only"
        for i, (product, overlap) in enumerate(candidates, start=1):
            pidx = PRODUCTS.index(product)
            results.append({
                "name": product["name"], "brand": product["brand"],
                "reason": f"Targets {', '.join(sorted(overlap)) or 'general care'} for your profile.",
                "concern_flag": None,
                "match_score": _match_score(i, len(candidates)),
                "price": _BASE_PRICES[pidx % len(_BASE_PRICES)],
            })

    return {"success": True, "face_id": face_id, "goal": effective_goal,
            "matched_tags": sorted(tags), "ranked_by": ranked_by,
            "results": results}


@app.post("/api/generate-report")
async def generate_report(face_id: str = Form(...)):
    """Run the Report Agent on a saved profile + scan history.

    Produces a structured skin health score and clinical insights using
    the LLM, based on actual scan data — not heuristics on the frontend.
    Falls back to a rule-based score if the model call fails.
    """
    face_id = face_id.strip().upper()

    # --- fetch profile + history -------------------------------------------
    if supabase is None:
        return error_json(503, "Report generation needs Supabase, which is not configured.")

    try:
        prof_res = (supabase.table("skin_profiles").select("*")
                    .eq("face_id", face_id).limit(1).execute())
        hist_res = (supabase.table("scan_history").select("*")
                    .eq("face_id", face_id).order("scanned_at", desc=True).execute())
    except Exception as exc:
        return error_json(502, f"Database error ({exc}).")

    if not prof_res.data:
        return error_json(404, f"No skin profile found for face ID {face_id}.")

    profile = prof_res.data[0]
    history = hist_res.data or []

    # --- build the report input --------------------------------------------
    scar_regions = profile.get("scar_regions") or []
    history_lines = []
    for h in history[:20]:
        flagged = h.get("flagged_ingredients") or []
        beneficial = h.get("beneficial_ingredients") or []
        flagged_str = "; ".join(flagged[:3]) if flagged else "none"
        beneficial_str = "; ".join(beneficial[:3]) if beneficial else "none"
        history_lines.append(
            f"- Product: {h.get('product_name', 'Unknown')} | "
            f"Verdict: {h.get('verdict', 'N/A')} | "
            f"Flagged: {flagged_str} | "
            f"Beneficial: {beneficial_str} | "
            f"Summary: {h.get('summary', 'N/A')}"
        )

    report_input = (
        "SKIN PROFILE:\n"
        f"Skin_Type: {profile.get('skin_type', 'unknown')}\n"
        f"Visible_Conditions: {', '.join(profile.get('visible_conditions') or []) or 'none'}\n"
        f"Scar_Regions: {'; '.join(scar_regions) or 'none'}\n"
        f"Stated_Goal: {profile.get('stated_goal') or 'none'}\n"
        "\n"
        "PRODUCT SCAN HISTORY:\n" + ("\n".join(history_lines) or "No products scanned yet.")
    )

    # --- run the report agent ----------------------------------------------
    try:
        raw = await _call_ollama(REPORT_AGENT_PROMPT, report_input)
    except Exception as exc:
        logger.warning("report agent call failed: %s", exc)
        raw = ""

    # --- parse or fallback -------------------------------------------------
    cleaned = strip_thinking(raw)
    fields = parse_fields(
        cleaned,
        ["Skin_Health_Score", "Score_Trend", "Total_Products_Scanned",
         "Improving_Products", "Concerning_Products", "Neutral_Products",
         "Top_Strength", "Top_Weakness", "Recommendation"],
    )

    if fields is None:
        # Fallback rule-based score
        good = sum(1 for h in history if "good" in (h.get("verdict") or "").lower())
        bad = sum(1 for h in history if "not a good match" in (h.get("verdict") or "").lower())
        mixed = sum(1 for h in history if "mixed" in (h.get("verdict") or "").lower())
        total = len(history)
        score = 65
        if total > 0:
            score += 10
            score += min(good * 5, 20)
            score -= bad * 8
            score -= mixed * 3
        score = max(0, min(100, score))
        trend = "improving" if good > bad else "declining" if bad > good else "stable"
        fields = {
            "Skin_Health_Score": str(score),
            "Score_Trend": trend,
            "Total_Products_Scanned": str(total),
            "Improving_Products": str(good),
            "Concerning_Products": str(bad),
            "Neutral_Products": str(mixed),
            "Top_Strength": "You have completed a skin assessment — consistent scanning builds a clearer picture over time.",
            "Top_Weakness": "Scan more products to get personalized recommendations and track your progress.",
            "Recommendation": "Scan products you currently use to see how they align with your skin profile.",
        }

    return {
        "success": True,
        "face_id": face_id,
        "data": {
            "skin_health_score": int(fields["Skin_Health_Score"]),
            "score_trend": fields["Score_Trend"],
            "total_products_scanned": int(fields["Total_Products_Scanned"]),
            "improving_products": int(fields["Improving_Products"]),
            "concerning_products": int(fields["Concerning_Products"]),
            "neutral_products": int(fields["Neutral_Products"]),
            "top_strength": fields["Top_Strength"],
            "top_weakness": fields["Top_Weakness"],
            "recommendation": fields["Recommendation"],
        },
    }
