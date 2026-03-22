#!/usr/bin/env python3
"""
SoundWeave CLI — Text to Sound Prompt Generator

Analyzes narrative text sentence-by-sentence, extracts emotional/sensory
atmosphere, and generates rich sound-effect prompts suitable for AI audio
generation tools like ElevenLabs Sound Effects.

Supports: Claude (Anthropic), GPT-4o (OpenAI), Gemini (Google)

Usage:
    python soundweave.py --provider claude --input story.txt --output mapping.json
    python soundweave.py --provider openai --api-key sk-... --input story.txt
    python soundweave.py --provider gemini --api-key AIza... --input story.txt
    cat story.txt | python soundweave.py --provider claude

JSON input (story_map.json format — keys are sentences, values have 'label'/'file'):
    python soundweave.py --provider claude --json-input story_map.json -o enriched.json
    python soundweave.py --provider claude --input story_map.json   # auto-detects .json

ElevenLabs sound generation:
    python soundweave.py --provider claude -j story_map.json -g --elevenlabs-key sk_... -d ./sounds/

Environment variables (alternative to --api-key):
    ANTHROPIC_API_KEY   — for Claude
    OPENAI_API_KEY      — for OpenAI
    GEMINI_API_KEY      — for Gemini
    ELEVENLABS_API_KEY  — for sound generation
"""

import argparse
import json
import os
import re
import sys
import textwrap
from dataclasses import dataclass, asdict

# ---------------------------------------------------------------------------
# LLM System Prompt (shared across all providers)
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = textwrap.dedent("""\
    You are an expert sound designer and emotional analyst. Given a text passage, you will:

    1. Extract each meaningful sentence
    2. Analyze the dominant emotion, sensory atmosphere, and spatial context
    3. Generate a rich, descriptive sound prompt suitable for AI sound generation
       (like ElevenLabs Sound Effects)

    For each sentence, produce:
    - "sentence": the original sentence
    - "emotion": the dominant emotion (e.g., "dread", "wonder", "urgency", "calm", "tension")
    - "category": a broad sound category (e.g., "nature", "human", "mechanical", "ambient", "animal")
    - "prompt": a detailed, evocative sound description (15-30 words) that captures not just
      WHAT is heard but HOW it feels — include texture, distance, intensity, and atmosphere.
      This prompt should work as input for an AI sound effects generator.
    - "intensity": a float from 0.0 to 1.0 representing emotional intensity
    - "timing": suggested timing — "background" (loops/ambient), "punctual" (one-shot),
      or "transitional" (crossfade)

    CRITICAL: Respond ONLY with a valid JSON array. No markdown, no backticks, no preamble.
    Just the raw JSON array.
""")

USER_PROMPT_TEMPLATE = "Analyze this text and generate sound prompts:\n\n{text}"

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class SoundMapping:
    sentence: str
    emotion: str
    category: str
    prompt: str
    intensity: float
    timing: str  # "background" | "punctual" | "transitional"


@dataclass
class StoryMapEntry:
    """Original data from a story_map.json entry."""
    label: str
    file: str


def _normalize_sentence(s: str) -> str:
    """Normalize a sentence for fuzzy matching."""
    return re.sub(r'\s+', ' ', s.strip().rstrip('.!?'))


def extract_from_story_map(json_path: str) -> tuple[str, dict[str, StoryMapEntry]]:
    """
    Read a story_map.json file and return:
      1. Numbered list of sentences for LLM input (preserves exact boundaries)
      2. Dict mapping each sentence to its StoryMapEntry (label, file)
    """
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, dict):
        raise ValueError("JSON input must be an object with sentence keys")

    original_data: dict[str, StoryMapEntry] = {}
    sentences: list[str] = []

    for sentence, meta in data.items():
        sentences.append(sentence)
        original_data[sentence] = StoryMapEntry(
            label=meta.get("label", ""),
            file=meta.get("file", ""),
        )

    text = ("Analyze each of the following sentences INDIVIDUALLY. "
            "Do NOT split, merge, or rewrite them. "
            "Return exactly one entry per sentence, preserving the original text:\n\n"
            + "\n".join(f"{i+1}. {s}" for i, s in enumerate(sentences)))
    return text, original_data


def _match_original(sentence: str, original_data: dict[str, StoryMapEntry],
                    sentences_list: list[str], index: int) -> StoryMapEntry | None:
    """Three-tier matching: exact → normalized → index fallback."""
    # Exact match
    if sentence in original_data:
        return original_data[sentence]
    # Normalized match
    norm = _normalize_sentence(sentence)
    for key, entry in original_data.items():
        if _normalize_sentence(key) == norm:
            return entry
    # Index fallback
    if 0 <= index < len(sentences_list) and sentences_list[index] in original_data:
        return original_data[sentences_list[index]]
    return None


# ---------------------------------------------------------------------------
# Provider implementations
# ---------------------------------------------------------------------------

def _parse_response(raw: str) -> list[dict]:
    """Strip markdown fences and parse JSON."""
    cleaned = re.sub(r"```json\s*|```\s*", "", raw).strip()
    return json.loads(cleaned)


def call_claude(text: str, api_key: str, model: str = "claude-sonnet-4-20250514") -> list[dict]:
    """Call Anthropic Messages API."""
    try:
        import anthropic
    except ImportError:
        sys.exit("Error: pip install anthropic  (or use --provider openai/gemini)")

    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model=model,
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": USER_PROMPT_TEMPLATE.format(text=text)}],
    )
    raw = "".join(block.text for block in message.content if hasattr(block, "text"))
    return _parse_response(raw)


def call_openai(text: str, api_key: str, model: str = "gpt-4o") -> list[dict]:
    """Call OpenAI Chat Completions API."""
    try:
        import openai
    except ImportError:
        sys.exit("Error: pip install openai  (or use --provider claude/gemini)")

    client = openai.OpenAI(api_key=api_key)
    response = client.chat.completions.create(
        model=model,
        temperature=0.7,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": USER_PROMPT_TEMPLATE.format(text=text)},
        ],
    )
    raw = response.choices[0].message.content or ""
    return _parse_response(raw)


def call_gemini(text: str, api_key: str, model: str = "gemini-2.0-flash") -> list[dict]:
    """Call Google Generative AI (Gemini) API."""
    try:
        import google.generativeai as genai
    except ImportError:
        sys.exit("Error: pip install google-generativeai  (or use --provider claude/openai)")

    genai.configure(api_key=api_key)
    gen_model = genai.GenerativeModel(
        model_name=model,
        system_instruction=SYSTEM_PROMPT,
    )
    response = gen_model.generate_content(
        USER_PROMPT_TEMPLATE.format(text=text),
        generation_config=genai.GenerationConfig(temperature=0.7),
    )
    raw = response.text or ""
    return _parse_response(raw)


PROVIDERS = {
    "claude": {"fn": call_claude, "env_key": "ANTHROPIC_API_KEY"},
    "openai": {"fn": call_openai, "env_key": "OPENAI_API_KEY"},
    "gemini": {"fn": call_gemini, "env_key": "GEMINI_API_KEY"},
}


# ---------------------------------------------------------------------------
# Output formatters
# ---------------------------------------------------------------------------

def format_json(mappings: list[SoundMapping]) -> str:
    return json.dumps([asdict(m) for m in mappings], indent=2, ensure_ascii=False)


def format_prompts_only(mappings: list[SoundMapping]) -> str:
    """Plain-text list of prompts for quick copy-paste into ElevenLabs."""
    lines = []
    for i, m in enumerate(mappings, 1):
        lines.append(f"[{i}] {m.prompt}")
        lines.append(f"    Emotion: {m.emotion}  |  Intensity: {m.intensity:.1f}  |  Timing: {m.timing}")
        lines.append("")
    return "\n".join(lines)


def format_elevenlabs_batch(mappings: list[SoundMapping]) -> str:
    """JSON array of just the prompts — ready for batch generation scripts."""
    return json.dumps(
        [{"id": i + 1, "prompt": m.prompt, "duration_hint": "short" if m.timing == "punctual" else "medium"}
         for i, m in enumerate(mappings)],
        indent=2,
    )


def format_table(mappings: list[SoundMapping]) -> str:
    """Pretty terminal table."""
    lines = []
    header = f"{'#':>3}  {'Emotion':<14} {'Cat':<12} {'Int':>4}  {'Timing':<14} Prompt"
    lines.append(header)
    lines.append("─" * min(len(header) + 40, 120))
    for i, m in enumerate(mappings, 1):
        prompt_short = m.prompt[:60] + "…" if len(m.prompt) > 60 else m.prompt
        lines.append(
            f"{i:>3}  {m.emotion:<14} {m.category:<12} {m.intensity:>4.1f}  {m.timing:<14} {prompt_short}"
        )
    return "\n".join(lines)


FORMATTERS = {
    "json": format_json,
    "prompts": format_prompts_only,
    "elevenlabs": format_elevenlabs_batch,
    "table": format_table,
}


def format_merged_json(mappings: list[SoundMapping],
                       original_data: dict[str, StoryMapEntry],
                       sentences_list: list[str]) -> str:
    """JSON output merging original label/file with AI-generated fields."""
    merged = []
    for i, m in enumerate(mappings):
        entry: dict = {"sentence": m.sentence}
        orig = _match_original(m.sentence, original_data, sentences_list, i)
        if orig:
            entry["label"] = orig.label
            entry["file"] = orig.file
        entry.update({
            "emotion": m.emotion,
            "category": m.category,
            "prompt": m.prompt,
            "intensity": m.intensity,
            "timing": m.timing,
        })
        merged.append(entry)
    return json.dumps(merged, indent=2, ensure_ascii=False)


# ---------------------------------------------------------------------------
# ElevenLabs sound generation
# ---------------------------------------------------------------------------

def generate_sounds(mappings: list[SoundMapping], api_key: str, output_dir: str,
                    duration: float | None = None, prompt_influence: float = 0.3) -> None:
    """Generate sound effects via the ElevenLabs API and save as MP3 files."""
    import requests

    os.makedirs(output_dir, exist_ok=True)

    for i, m in enumerate(mappings, 1):
        print(f"[SoundWeave] Generating sound {i}/{len(mappings)}: {m.emotion} ...", file=sys.stderr)

        body: dict = {
            "text": m.prompt,
            "prompt_influence": prompt_influence,
        }
        if duration is not None:
            body["duration_seconds"] = duration

        response = requests.post(
            "https://api.elevenlabs.io/v1/sound-generation",
            headers={
                "Content-Type": "application/json",
                "xi-api-key": api_key,
            },
            json=body,
        )

        if not response.ok:
            print(f"[SoundWeave] WARNING: Failed to generate sound {i} — "
                  f"{response.status_code}: {response.text[:200]}", file=sys.stderr)
            continue

        filename = f"{i:02d}-{m.emotion}.mp3"
        filepath = os.path.join(output_dir, filename)
        with open(filepath, "wb") as f:
            f.write(response.content)
        print(f"[SoundWeave] Saved {filepath}", file=sys.stderr)

    print(f"[SoundWeave] Sound generation complete. Files in {output_dir}/", file=sys.stderr)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="SoundWeave — Transform narrative text into AI sound-generation prompts.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""\
            Examples:
              %(prog)s --provider claude -i story.txt -o mapping.json
              %(prog)s --provider openai --api-key sk-... -i story.txt -f table
              cat story.txt | %(prog)s --provider gemini --api-key AIza... -f prompts

            JSON input (story_map.json format):
              %(prog)s --provider claude -j story_map.json -o enriched.json
              %(prog)s --provider claude -i story_map.json   # auto-detects .json

            ElevenLabs sound generation:
              %(prog)s --provider claude -j story_map.json -g --elevenlabs-key sk_...
        """),
    )
    parser.add_argument(
        "--provider", "-p",
        choices=list(PROVIDERS.keys()),
        default="claude",
        help="LLM provider (default: claude)",
    )
    parser.add_argument(
        "--api-key", "-k",
        default=None,
        help="API key (or set via env var: ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY)",
    )
    parser.add_argument(
        "--model", "-m",
        default=None,
        help="Override the default model for the chosen provider",
    )
    parser.add_argument(
        "--input", "-i",
        default=None,
        help="Input text file (reads from stdin if omitted). Auto-detects .json files.",
    )
    parser.add_argument(
        "--json-input", "-j",
        default=None,
        help="Input JSON file (story_map.json format: keys are sentences, values have 'label'/'file')",
    )
    parser.add_argument(
        "--output", "-o",
        default=None,
        help="Output file (prints to stdout if omitted)",
    )
    parser.add_argument(
        "--format", "-f",
        choices=list(FORMATTERS.keys()),
        default="json",
        help="Output format (default: json)",
    )
    # ElevenLabs sound generation arguments
    parser.add_argument(
        "--generate-sounds", "-g",
        action="store_true",
        help="Generate sound effects via ElevenLabs API after prompt creation",
    )
    parser.add_argument(
        "--elevenlabs-key",
        default=None,
        help="ElevenLabs API key (or set ELEVENLABS_API_KEY env var)",
    )
    parser.add_argument(
        "--sound-output-dir", "-d",
        default="./sounds",
        help="Directory to save generated .mp3 files (default: ./sounds)",
    )
    parser.add_argument(
        "--duration",
        type=float,
        default=None,
        help="Duration in seconds for generated sounds (default: auto)",
    )
    parser.add_argument(
        "--prompt-influence",
        type=float,
        default=0.3,
        help="How closely ElevenLabs follows the prompt, 0.0-1.0 (default: 0.3)",
    )
    args = parser.parse_args()

    # --- Resolve API key ---
    cfg = PROVIDERS[args.provider]
    api_key = args.api_key or os.environ.get(cfg["env_key"], "")
    if not api_key:
        sys.exit(
            f"Error: No API key. Pass --api-key or set {cfg['env_key']} env var."
        )

    # --- Read input ---
    original_data: dict[str, StoryMapEntry] | None = None
    sentences_list: list[str] = []

    if args.json_input:
        if args.input:
            sys.exit("Error: Cannot use both --input and --json-input. Pick one.")
        text, original_data = extract_from_story_map(args.json_input)
        sentences_list = list(original_data.keys())
        print(f"[SoundWeave] Loaded {len(sentences_list)} sentences from JSON.", file=sys.stderr)
    elif args.input:
        if args.input.endswith(".json"):
            try:
                text, original_data = extract_from_story_map(args.input)
                sentences_list = list(original_data.keys())
                print(f"[SoundWeave] Detected JSON input, extracted {len(sentences_list)} sentences.", file=sys.stderr)
            except (json.JSONDecodeError, ValueError):
                with open(args.input, "r", encoding="utf-8") as f:
                    text = f.read()
        else:
            with open(args.input, "r", encoding="utf-8") as f:
                text = f.read()
    elif not sys.stdin.isatty():
        text = sys.stdin.read()
    else:
        sys.exit("Error: Provide --input FILE, --json-input FILE, or pipe text via stdin.")

    if not text.strip():
        sys.exit("Error: Input text is empty.")

    # --- Call LLM ---
    print(f"[SoundWeave] Using {args.provider} ...", file=sys.stderr)
    call_fn = cfg["fn"]
    kwargs = {"text": text, "api_key": api_key}
    if args.model:
        kwargs["model"] = args.model

    try:
        raw_results = call_fn(**kwargs)
    except json.JSONDecodeError as e:
        sys.exit(f"Error: Could not parse LLM response as JSON — {e}")
    except Exception as e:
        sys.exit(f"Error calling {args.provider}: {e}")

    # --- Validate & convert ---
    mappings: list[SoundMapping] = []
    for item in raw_results:
        mappings.append(SoundMapping(
            sentence=item.get("sentence", ""),
            emotion=item.get("emotion", "unknown"),
            category=item.get("category", "unknown"),
            prompt=item.get("prompt", ""),
            intensity=float(item.get("intensity", 0.5)),
            timing=item.get("timing", "punctual"),
        ))

    print(f"[SoundWeave] Generated {len(mappings)} sound prompts.", file=sys.stderr)

    # --- Output ---
    if original_data is not None and args.format == "json":
        formatted = format_merged_json(mappings, original_data, sentences_list)
        print("[SoundWeave] Merged original JSON data with AI-generated fields.", file=sys.stderr)
    else:
        formatted = FORMATTERS[args.format](mappings)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(formatted)
        print(f"[SoundWeave] Written to {args.output}", file=sys.stderr)
    else:
        print(formatted)

    # --- Generate sounds (optional) ---
    if args.generate_sounds:
        el_key = args.elevenlabs_key or os.environ.get("ELEVENLABS_API_KEY", "")
        if not el_key:
            sys.exit("Error: No ElevenLabs API key. Pass --elevenlabs-key or set ELEVENLABS_API_KEY env var.")
        generate_sounds(
            mappings,
            api_key=el_key,
            output_dir=args.sound_output_dir,
            duration=args.duration,
            prompt_influence=args.prompt_influence,
        )


if __name__ == "__main__":
    main()
