import { useState, useRef, useCallback } from "react";
import JSZip from "jszip";

const SAMPLE_TEXT = `Halting to catch my breath, I focused on the night sounds. Branches, with rustling leaves, creaked in the wind, a screech owl trilled a mournful melody, and midges hummed past my ear. Upon hearing rushing water, I reasoned that I could follow its course and escape those who sought my death. Unless the hounds were sent aft me, the advantage was mine. I stumbled my way through the gigantic roots. I could now see their torches, and my breaths quickened. In the breeze, my beloved whispered, and I followed his voice 'til an elegant white hound stood afore me. The hound was my salvation, and I latched onto his leather collar. On and on I faltered through the fog with the dog tracing a huge circle. The hound failed to break stride. From a nearby branch, a crow cawed. Assured that my pursuers would reason that I suffered from the same fate, I continued walking along the arc. When my beloved's voice returned, I signaled the hound to halt. As I emerged from the fog, the dog vanished. I stepped into the road to escape. I froze in my path, deafened by a piercing sound and sudden screeching. The earth trembled, and I was flying afore striking the pavement.`;

const SYSTEM_PROMPT = `You are an expert sound designer and emotional analyst. Given a text passage, you will:

1. Extract each meaningful sentence
2. Analyze the dominant emotion, sensory atmosphere, and spatial context
3. Generate a rich, descriptive sound prompt suitable for AI sound generation (like ElevenLabs Sound Effects)

For each sentence, produce:
- "sentence": the original sentence
- "emotion": the dominant emotion (e.g., "dread", "wonder", "urgency", "calm", "tension")
- "category": a broad sound category (e.g., "nature", "human", "mechanical", "ambient", "animal")
- "prompt": a detailed, evocative sound description (15-30 words) that captures not just WHAT is heard but HOW it feels — include texture, distance, intensity, and atmosphere. This prompt should work as input for an AI sound effects generator.
- "intensity": a float from 0.0 to 1.0 representing emotional intensity
- "timing": suggested timing — "background" (loops/ambient), "punctual" (one-shot), or "transitional" (crossfade)

CRITICAL: Respond ONLY with a valid JSON array. No markdown, no backticks, no preamble. Just the raw JSON array.

Example output for "The wind howled through the abandoned cathedral":
[{"sentence":"The wind howled through the abandoned cathedral","emotion":"desolation","category":"nature","prompt":"Howling wind echoing through a vast stone chamber, reverberant and hollow, with distant metallic creaking of old hinges","intensity":0.7,"timing":"background"}]`;

const PROVIDER_CONFIGS = {
  claude: {
    name: "Claude (Anthropic)",
    color: "#D4A574",
    icon: "◈",
    description: "Uses Claude API via built-in endpoint",
  },
  openai: {
    name: "OpenAI (GPT-4)",
    color: "#74D4A5",
    icon: "◉",
    description: "Requires API key",
  },
  gemini: {
    name: "Gemini (Google)",
    color: "#A574D4",
    icon: "◆",
    description: "Requires API key",
  },
};

const EMOTION_COLORS = {
  dread: "#8B0000",
  fear: "#A52A2A",
  tension: "#CD853F",
  urgency: "#FF6347",
  hope: "#87CEEB",
  wonder: "#9370DB",
  calm: "#98FB98",
  relief: "#90EE90",
  determination: "#DAA520",
  desperation: "#DC143C",
  loneliness: "#708090",
  awe: "#6A5ACD",
  shock: "#FF4500",
  comfort: "#F5DEB3",
  sadness: "#4682B4",
  joy: "#FFD700",
  anger: "#B22222",
  surprise: "#FF8C00",
  default: "#888",
};

function getEmotionColor(emotion) {
  const key = emotion?.toLowerCase() || "default";
  return EMOTION_COLORS[key] || EMOTION_COLORS.default;
}

async function callClaude(text) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Analyze this text and generate sound prompts:\n\n${text}` }],
    }),
  });
  const data = await response.json();
  const raw = data.content?.map((b) => b.text || "").join("") || "";
  return JSON.parse(raw.replace(/```json|```/g, "").trim());
}

async function callOpenAI(text, apiKey) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Analyze this text and generate sound prompts:\n\n${text}` },
      ],
      temperature: 0.7,
    }),
  });
  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content || "";
  return JSON.parse(raw.replace(/```json|```/g, "").trim());
}

async function callGemini(text, apiKey) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [
          {
            parts: [{ text: `Analyze this text and generate sound prompts:\n\n${text}` }],
          },
        ],
        generationConfig: { temperature: 0.7 },
      }),
    }
  );
  const data = await response.json();
  const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
  return JSON.parse(raw.replace(/```json|```/g, "").trim());
}

function WaveformIcon({ intensity = 0.5 }) {
  const bars = 7;
  return (
    <svg width="28" height="20" viewBox="0 0 28 20" style={{ display: "block" }}>
      {Array.from({ length: bars }).map((_, i) => {
        const h = 4 + Math.sin((i / bars) * Math.PI) * 14 * intensity;
        return (
          <rect
            key={i}
            x={i * 4}
            y={10 - h / 2}
            width="2.5"
            height={h}
            rx="1.25"
            fill="currentColor"
            opacity={0.5 + intensity * 0.5}
          />
        );
      })}
    </svg>
  );
}

function SentenceCard({ item, index, isSelected, onSelect, originalMeta }) {
  const emotionColor = getEmotionColor(item.emotion);
  return (
    <div
      onClick={() => onSelect(index)}
      style={{
        padding: "16px 20px",
        borderLeft: `3px solid ${emotionColor}`,
        background: isSelected ? "rgba(255,255,255,0.06)" : "transparent",
        cursor: "pointer",
        transition: "all 0.2s ease",
        display: "flex",
        gap: "16px",
        alignItems: "flex-start",
      }}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.background = "rgba(255,255,255,0.03)";
      }}
      onMouseLeave={(e) => {
        if (!isSelected) e.currentTarget.style.background = "transparent";
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontSize: "13.5px",
            lineHeight: 1.6,
            color: isSelected ? "#E8E0D4" : "#A89B8C",
            fontFamily: "'Newsreader', Georgia, serif",
            fontStyle: "italic",
          }}
        >
          "{item.sentence}"
        </p>
        <div style={{ display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: "10px",
              padding: "2px 8px",
              borderRadius: "10px",
              background: `${emotionColor}22`,
              color: emotionColor,
              fontFamily: "'DM Mono', monospace",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            {item.emotion}
          </span>
          <span
            style={{
              fontSize: "10px",
              padding: "2px 8px",
              borderRadius: "10px",
              background: "rgba(255,255,255,0.05)",
              color: "#7A6F63",
              fontFamily: "'DM Mono', monospace",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            {item.category}
          </span>
          <span
            style={{
              fontSize: "10px",
              padding: "2px 8px",
              borderRadius: "10px",
              background: "rgba(255,255,255,0.05)",
              color: "#7A6F63",
              fontFamily: "'DM Mono', monospace",
              letterSpacing: "0.5px",
            }}
          >
            {item.timing}
          </span>
          {originalMeta && (
            <>
              <span
                style={{
                  fontSize: "10px",
                  padding: "2px 8px",
                  borderRadius: "10px",
                  background: "rgba(74,212,165,0.1)",
                  color: "#4AD4A5",
                  fontFamily: "'DM Mono', monospace",
                  letterSpacing: "0.5px",
                }}
              >
                {originalMeta.label}
              </span>
              <span
                style={{
                  fontSize: "10px",
                  padding: "2px 8px",
                  borderRadius: "10px",
                  background: "rgba(74,165,212,0.1)",
                  color: "#4AA5D4",
                  fontFamily: "'DM Mono', monospace",
                  letterSpacing: "0.5px",
                }}
              >
                {originalMeta.file}
              </span>
            </>
          )}
        </div>
      </div>
      <div style={{ color: emotionColor, flexShrink: 0, marginTop: "2px" }}>
        <WaveformIcon intensity={item.intensity} />
      </div>
    </div>
  );
}

async function generateElevenLabsSound(prompt, { loop = false, durationSeconds = null, promptInfluence = 0.3 } = {}) {
  const body = { text: prompt, loop, prompt_influence: promptInfluence };
  if (durationSeconds !== null) {
    body.duration_seconds = durationSeconds;
  }
  const response = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": import.meta.env.VITE_ELEVENLABS_API_KEY,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ElevenLabs API error: ${response.status} ${err}`);
  }
  return await response.blob();
}

function PromptDetail({ item, originalMeta, onUpdatePrompt, index, onSoundGenerated }) {
  const [generating, setGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [genError, setGenError] = useState(null);
  const [loop, setLoop] = useState(false);
  const [durationEnabled, setDurationEnabled] = useState(true);
  const [durationSeconds, setDurationSeconds] = useState(5);
  const [promptInfluence, setPromptInfluence] = useState(0.3);
  const prevPromptRef = useRef(null);

  // Reset audio state when a different sentence is selected
  if (item?.prompt !== prevPromptRef.current) {
    prevPromptRef.current = item?.prompt || null;
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    if (audioUrl || genError) {
      setAudioUrl(null);
      setGenError(null);
    }
  }

  const filename = `${String(index + 1).padStart(2, "0")}-${item.emotion}.mp3`;

  const handleGenerate = async () => {
    setGenerating(true);
    setGenError(null);
    try {
      const blob = await generateElevenLabsSound(item.prompt, { loop, durationSeconds: durationEnabled ? durationSeconds : null, promptInfluence });
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      onSoundGenerated?.(index, filename);
    } catch (e) {
      setGenError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!audioUrl) return;
    const a = document.createElement("a");
    a.href = audioUrl;
    a.download = filename;
    a.click();
  };

  if (!item) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "#5A5048",
          fontFamily: "'DM Mono', monospace",
          fontSize: "12px",
        }}
      >
        Select a sentence to view its sound prompt
      </div>
    );
  }

  const emotionColor = getEmotionColor(item.emotion);

  return (
    <div style={{ padding: "24px" }}>
      <div style={{ marginBottom: "24px" }}>
        <label
          style={{
            display: "block",
            fontSize: "9px",
            textTransform: "uppercase",
            letterSpacing: "1.5px",
            color: "#6A5F53",
            fontFamily: "'DM Mono', monospace",
            marginBottom: "8px",
          }}
        >
          Sound Generation Prompt
        </label>
        <textarea
          value={item.prompt}
          onChange={(e) => onUpdatePrompt?.(e.target.value)}
          rows={3}
          style={{
            width: "100%",
            padding: "16px",
            background: "rgba(255,255,255,0.04)",
            borderRadius: "8px",
            border: "1px solid rgba(255,255,255,0.06)",
            fontSize: "14px",
            lineHeight: 1.7,
            color: "#E8E0D4",
            fontFamily: "'Newsreader', Georgia, serif",
            resize: "vertical",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <div>
          <label
            style={{
              display: "block",
              fontSize: "9px",
              textTransform: "uppercase",
              letterSpacing: "1.5px",
              color: "#6A5F53",
              fontFamily: "'DM Mono', monospace",
              marginBottom: "6px",
            }}
          >
            Emotion
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: emotionColor,
              }}
            />
            <span
              style={{
                fontSize: "13px",
                color: "#C4B8A8",
                textTransform: "capitalize",
              }}
            >
              {item.emotion}
            </span>
          </div>
        </div>
        <div>
          <label
            style={{
              display: "block",
              fontSize: "9px",
              textTransform: "uppercase",
              letterSpacing: "1.5px",
              color: "#6A5F53",
              fontFamily: "'DM Mono', monospace",
              marginBottom: "6px",
            }}
          >
            Category
          </label>
          <span style={{ fontSize: "13px", color: "#C4B8A8", textTransform: "capitalize" }}>
            {item.category}
          </span>
        </div>
        <div>
          <label
            style={{
              display: "block",
              fontSize: "9px",
              textTransform: "uppercase",
              letterSpacing: "1.5px",
              color: "#6A5F53",
              fontFamily: "'DM Mono', monospace",
              marginBottom: "6px",
            }}
          >
            Intensity
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              style={{
                flex: 1,
                height: "4px",
                background: "rgba(255,255,255,0.08)",
                borderRadius: "2px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${item.intensity * 100}%`,
                  height: "100%",
                  background: emotionColor,
                  borderRadius: "2px",
                  transition: "width 0.4s ease",
                }}
              />
            </div>
            <span style={{ fontSize: "11px", color: "#7A6F63", fontFamily: "'DM Mono', monospace" }}>
              {item.intensity.toFixed(1)}
            </span>
          </div>
        </div>
        <div>
          <label
            style={{
              display: "block",
              fontSize: "9px",
              textTransform: "uppercase",
              letterSpacing: "1.5px",
              color: "#6A5F53",
              fontFamily: "'DM Mono', monospace",
              marginBottom: "6px",
            }}
          >
            Timing
          </label>
          <span style={{ fontSize: "13px", color: "#C4B8A8", textTransform: "capitalize" }}>
            {item.timing}
          </span>
        </div>
      </div>

      <div>
        <label
          style={{
            display: "block",
            fontSize: "9px",
            textTransform: "uppercase",
            letterSpacing: "1.5px",
            color: "#6A5F53",
            fontFamily: "'DM Mono', monospace",
            marginBottom: "6px",
          }}
        >
          Copy Prompt for ElevenLabs
        </label>
        <button
          onClick={() => navigator.clipboard?.writeText(item.prompt)}
          style={{
            padding: "8px 16px",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "6px",
            color: "#C4B8A8",
            fontSize: "12px",
            cursor: "pointer",
            fontFamily: "'DM Mono', monospace",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.06)";
          }}
        >
          Copy to Clipboard
        </button>
      </div>

      {/* ElevenLabs Generate & Play */}
      <div style={{ marginTop: "24px" }}>
        <label
          style={{
            display: "block",
            fontSize: "9px",
            textTransform: "uppercase",
            letterSpacing: "1.5px",
            color: "#6A5F53",
            fontFamily: "'DM Mono', monospace",
            marginBottom: "6px",
          }}
        >
          Generate Sound Effect
        </label>

        {/* ElevenLabs Parameters */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "12px",
            marginBottom: "12px",
            padding: "12px",
            background: "rgba(255,255,255,0.02)",
            borderRadius: "8px",
            border: "1px solid rgba(255,255,255,0.04)",
          }}
        >
          {/* Duration */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
              <label
                style={{
                  fontSize: "9px",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  color: "#5A5048",
                  fontFamily: "'DM Mono', monospace",
                }}
              >
                Duration {durationEnabled ? `(${durationSeconds}s)` : "(auto)"}
              </label>
              <button
                onClick={() => setDurationEnabled(!durationEnabled)}
                style={{
                  padding: "1px 6px",
                  background: durationEnabled ? "rgba(116,212,165,0.2)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${durationEnabled ? "rgba(116,212,165,0.4)" : "rgba(255,255,255,0.08)"}`,
                  borderRadius: "3px",
                  color: durationEnabled ? "#74D4A5" : "#5A5048",
                  fontSize: "8px",
                  cursor: "pointer",
                  fontFamily: "'DM Mono', monospace",
                  lineHeight: 1.4,
                }}
              >
                {durationEnabled ? "ON" : "OFF"}
              </button>
            </div>
            <input
              type="range"
              min="0.5"
              max="30"
              step="0.5"
              value={durationSeconds}
              disabled={!durationEnabled}
              onChange={(e) => setDurationSeconds(parseFloat(e.target.value))}
              style={{ width: "100%", accentColor: "#74D4A5", opacity: durationEnabled ? 1 : 0.3 }}
            />
          </div>

          {/* Prompt Influence */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "9px",
                textTransform: "uppercase",
                letterSpacing: "1px",
                color: "#5A5048",
                fontFamily: "'DM Mono', monospace",
                marginBottom: "4px",
              }}
            >
              Influence ({promptInfluence.toFixed(1)})
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={promptInfluence}
              onChange={(e) => setPromptInfluence(parseFloat(e.target.value))}
              style={{ width: "100%", accentColor: "#74D4A5" }}
            />
          </div>

          {/* Loop Toggle */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "9px",
                textTransform: "uppercase",
                letterSpacing: "1px",
                color: "#5A5048",
                fontFamily: "'DM Mono', monospace",
                marginBottom: "4px",
              }}
            >
              Loop
            </label>
            <button
              onClick={() => setLoop(!loop)}
              style={{
                padding: "4px 12px",
                background: loop ? "rgba(116,212,165,0.2)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${loop ? "rgba(116,212,165,0.4)" : "rgba(255,255,255,0.08)"}`,
                borderRadius: "4px",
                color: loop ? "#74D4A5" : "#5A5048",
                fontSize: "11px",
                cursor: "pointer",
                fontFamily: "'DM Mono', monospace",
                transition: "all 0.2s ease",
              }}
            >
              {loop ? "ON" : "OFF"}
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{
              padding: "8px 16px",
              background: generating
                ? "rgba(255,255,255,0.04)"
                : "rgba(116,212,165,0.15)",
              border: `1px solid ${generating ? "rgba(255,255,255,0.06)" : "rgba(116,212,165,0.3)"}`,
              borderRadius: "6px",
              color: generating ? "#6A5F53" : "#74D4A5",
              fontSize: "12px",
              cursor: generating ? "wait" : "pointer",
              fontFamily: "'DM Mono', monospace",
              transition: "all 0.2s ease",
            }}
          >
            {generating ? "Generating..." : "Generate with ElevenLabs"}
          </button>
          {audioUrl && (
            <button
              onClick={handleDownload}
              style={{
                padding: "8px 16px",
                background: "rgba(212,165,116,0.15)",
                border: "1px solid rgba(212,165,116,0.3)",
                borderRadius: "6px",
                color: "#D4A574",
                fontSize: "12px",
                cursor: "pointer",
                fontFamily: "'DM Mono', monospace",
                transition: "all 0.2s ease",
              }}
            >
              Download MP3
            </button>
          )}
        </div>
        {audioUrl && (
          <audio
            controls
            src={audioUrl}
            style={{
              marginTop: "12px",
              width: "100%",
              height: "36px",
              opacity: 0.8,
            }}
          />
        )}
        {genError && (
          <div
            style={{
              marginTop: "8px",
              fontSize: "11px",
              color: "#E8A0A0",
              fontFamily: "'DM Mono', monospace",
            }}
          >
            {genError}
          </div>
        )}
      </div>

      {originalMeta && (
        <div style={{
          marginTop: "24px",
          padding: "16px",
          background: "rgba(74,212,165,0.05)",
          borderRadius: "8px",
          border: "1px solid rgba(74,212,165,0.15)",
        }}>
          <label style={{
            display: "block",
            fontSize: "9px",
            textTransform: "uppercase",
            letterSpacing: "1.5px",
            color: "#6A5F53",
            fontFamily: "'DM Mono', monospace",
            marginBottom: "10px",
          }}>
            Original Mapping
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <span style={{ fontSize: "10px", color: "#6A5F53", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "1px" }}>
                Label
              </span>
              <div style={{ fontSize: "13px", color: "#4AD4A5", marginTop: "4px" }}>
                {originalMeta.label}
              </div>
            </div>
            <div>
              <span style={{ fontSize: "10px", color: "#6A5F53", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "1px" }}>
                Audio File
              </span>
              <div style={{ fontSize: "13px", color: "#4AA5D4", fontFamily: "'DM Mono', monospace", marginTop: "4px" }}>
                {originalMeta.file}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [text, setText] = useState("");
  const [provider, setProvider] = useState("claude");
  const [apiKey, setApiKey] = useState("");
  const [results, setResults] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [view, setView] = useState("input"); // input | results
  const [importedData, setImportedData] = useState(null);
  const [inputMode, setInputMode] = useState("text"); // text | json
  const [generatingAll, setGeneratingAll] = useState(false);
  const [genAllProgress, setGenAllProgress] = useState({ current: 0, total: 0 });
  const [generatedFiles, setGeneratedFiles] = useState({}); // { index: filename }
  const generatedFilesRef = useRef({});
  const fileInputRef = useRef(null);

  const findOriginalMeta = useCallback((sentence, index) => {
    if (!importedData) return null;
    const normalize = (s) => s.trim().replace(/[.!?]+$/, "").replace(/\s+/g, " ");
    // Exact match
    if (importedData[sentence]) return importedData[sentence];
    // Normalized match
    const norm = normalize(sentence);
    const keys = Object.keys(importedData);
    const matchKey = keys.find((k) => normalize(k) === norm);
    if (matchKey) return importedData[matchKey];
    // Index fallback
    if (index < keys.length) return importedData[keys[index]];
    return null;
  }, [importedData]);

  const handleJsonImport = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (typeof data !== "object" || Array.isArray(data)) {
          setError("Invalid JSON: expected an object with sentence keys");
          return;
        }
        const sentences = Object.keys(data);
        if (sentences.length === 0) {
          setError("JSON file contains no sentences");
          return;
        }
        setImportedData(data);
        setText(sentences.join(" "));
        setError(null);
      } catch (err) {
        setError(`Failed to parse JSON: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }, []);

  const analyze = useCallback(async () => {
    if (!text.trim()) return;
    if (provider !== "claude" && !apiKey.trim()) {
      setError(`Please enter your ${PROVIDER_CONFIGS[provider].name} API key`);
      return;
    }

    // When imported from JSON, send sentences as a numbered list
    // so the LLM preserves exact sentence boundaries
    let prompt = text;
    if (importedData) {
      const sentences = Object.keys(importedData);
      prompt = "Analyze each of the following sentences INDIVIDUALLY. Do NOT split, merge, or rewrite them. Return exactly one entry per sentence, preserving the original text:\n\n"
        + sentences.map((s, i) => `${i + 1}. ${s}`).join("\n");
    }

    setLoading(true);
    setError(null);
    try {
      let data;
      if (provider === "claude") data = await callClaude(prompt);
      else if (provider === "openai") data = await callOpenAI(prompt, apiKey);
      else data = await callGemini(prompt, apiKey);

      setResults(data);
      setSelected(0);
      setView("results");
    } catch (e) {
      setError(`Analysis failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [text, provider, apiKey, importedData]);

  const exportJSON = useCallback(() => {
    if (!results) return;
    const normalize = (s) => s.trim().replace(/[.!?]+$/, "").replace(/\s+/g, " ");
    const importedKeys = importedData ? Object.keys(importedData) : [];
    const exportData = results.map((r, idx) => {
      const entry = { sentence: r.sentence };
      if (importedData) {
        // Three-tier matching: exact → normalized → index fallback
        let orig = importedData[r.sentence];
        if (!orig) {
          const norm = normalize(r.sentence);
          const matchKey = importedKeys.find((k) => normalize(k) === norm);
          if (matchKey) orig = importedData[matchKey];
        }
        if (!orig && idx < importedKeys.length) {
          orig = importedData[importedKeys[idx]];
        }
        if (orig) {
          entry.label = orig.label;
          entry.file = orig.file;
        }
      }
      entry.emotion = r.emotion;
      entry.category = r.category;
      entry.prompt = r.prompt;
      entry.intensity = r.intensity;
      entry.timing = r.timing;
      const genFile = generatedFilesRef.current[idx];
      if (genFile) {
        entry.generated_sound = genFile;
      }
      return entry;
    });
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = importedData ? "enriched-story-map.json" : "sound-mapping.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [results, importedData, generatedFiles]);

  const exportElevenLabsPrompts = useCallback(() => {
    if (!results) return;
    const prompts = results.map((r, i) => `[${i + 1}] ${r.prompt}`).join("\n\n");
    const blob = new Blob([prompts], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "elevenlabs-prompts.txt";
    a.click();
    URL.revokeObjectURL(url);
  }, [results]);

  const generateAllSounds = useCallback(async () => {
    if (!results || generatingAll) return;
    setGeneratingAll(true);
    setGenAllProgress({ current: 0, total: results.length });
    setError(null);

    const zip = new JSZip();
    const fileMap = {};

    for (let i = 0; i < results.length; i++) {
      setGenAllProgress({ current: i + 1, total: results.length });
      try {
        const blob = await generateElevenLabsSound(results[i].prompt);
        const arrayBuffer = await blob.arrayBuffer();
        const filename = `${String(i + 1).padStart(2, "0")}-${results[i].emotion}.mp3`;
        zip.file(filename, arrayBuffer);
        fileMap[i] = filename;
      } catch (e) {
        console.error(`Failed to generate sound ${i + 1}:`, e);
      }
    }

    generatedFilesRef.current = fileMap;
    setGeneratedFiles(fileMap);

    // Download as ZIP
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "soundweave-sounds.zip";
    a.click();
    URL.revokeObjectURL(url);

    setGeneratingAll(false);
  }, [results, generatingAll]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#1A1714",
        color: "#C4B8A8",
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400&family=DM+Sans:wght@300;400;500&family=Newsreader:ital,wght@0,300;0,400;1,300;1,400&display=swap"
        rel="stylesheet"
      />

      {/* Header */}
      <div
        style={{
          padding: "20px 32px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ display: "flex", gap: "2px" }}>
            {[0.3, 0.6, 1, 0.8, 0.5, 0.9, 0.4].map((h, i) => (
              <div
                key={i}
                style={{
                  width: "3px",
                  height: `${10 + h * 14}px`,
                  background: `hsl(${30 + i * 5}, 50%, ${45 + h * 20}%)`,
                  borderRadius: "1.5px",
                  alignSelf: "center",
                }}
              />
            ))}
          </div>
          <span
            style={{
              fontSize: "14px",
              fontWeight: 500,
              letterSpacing: "0.5px",
              color: "#E8E0D4",
            }}
          >
            SoundWeave
          </span>
          <span
            style={{
              fontSize: "10px",
              color: "#5A5048",
              fontFamily: "'DM Mono', monospace",
              letterSpacing: "1px",
              textTransform: "uppercase",
            }}
          >
            Text → Sound Prompt Engine
          </span>
        </div>
        {view === "results" && (
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => {
                setView("input");
                setResults(null);
                setSelected(null);
                setImportedData(null);
                setInputMode("text");
                setGeneratedFiles({});
                generatedFilesRef.current = {};
              }}
              style={{
                padding: "6px 14px",
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "6px",
                color: "#8A7F73",
                fontSize: "11px",
                cursor: "pointer",
                fontFamily: "'DM Mono', monospace",
              }}
            >
              New Text
            </button>
            <button
              onClick={exportJSON}
              style={{
                padding: "6px 14px",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "6px",
                color: "#C4B8A8",
                fontSize: "11px",
                cursor: "pointer",
                fontFamily: "'DM Mono', monospace",
              }}
            >
              Export JSON
            </button>
            <button
              onClick={exportElevenLabsPrompts}
              style={{
                padding: "6px 14px",
                background: "rgba(212,165,116,0.15)",
                border: "1px solid rgba(212,165,116,0.3)",
                borderRadius: "6px",
                color: "#D4A574",
                fontSize: "11px",
                cursor: "pointer",
                fontFamily: "'DM Mono', monospace",
              }}
            >
              Export Prompts
            </button>
            <button
              onClick={generateAllSounds}
              disabled={generatingAll}
              style={{
                padding: "6px 14px",
                background: generatingAll
                  ? "rgba(255,255,255,0.04)"
                  : "rgba(116,212,165,0.15)",
                border: `1px solid ${generatingAll ? "rgba(255,255,255,0.06)" : "rgba(116,212,165,0.3)"}`,
                borderRadius: "6px",
                color: generatingAll ? "#6A5F53" : "#74D4A5",
                fontSize: "11px",
                cursor: generatingAll ? "wait" : "pointer",
                fontFamily: "'DM Mono', monospace",
              }}
            >
              {generatingAll
                ? `Generating ${genAllProgress.current}/${genAllProgress.total}...`
                : "Generate All MP3s"}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div
          style={{
            margin: "16px 32px 0",
            padding: "12px 16px",
            background: "rgba(180,60,60,0.15)",
            border: "1px solid rgba(180,60,60,0.3)",
            borderRadius: "8px",
            fontSize: "12px",
            color: "#E8A0A0",
            fontFamily: "'DM Mono', monospace",
          }}
        >
          {error}
        </div>
      )}

      {/* Input View */}
      {view === "input" && (
        <div style={{ maxWidth: "720px", margin: "0 auto", padding: "48px 32px" }}>
          <h1
            style={{
              fontSize: "28px",
              fontFamily: "'Newsreader', Georgia, serif",
              fontWeight: 300,
              color: "#E8E0D4",
              marginBottom: "8px",
            }}
          >
            Transform text into sound
          </h1>
          <p
            style={{
              fontSize: "13px",
              color: "#7A6F63",
              marginBottom: "36px",
              lineHeight: 1.6,
            }}
          >
            Paste any narrative text. The AI will analyze each sentence's emotional landscape and
            generate detailed sound prompts ready for ElevenLabs or any audio generation tool.
          </p>

          {/* Provider Selection */}
          <label
            style={{
              display: "block",
              fontSize: "9px",
              textTransform: "uppercase",
              letterSpacing: "1.5px",
              color: "#6A5F53",
              fontFamily: "'DM Mono', monospace",
              marginBottom: "10px",
            }}
          >
            AI Provider
          </label>
          <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
            {Object.entries(PROVIDER_CONFIGS).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => setProvider(key)}
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  background: provider === key ? "rgba(255,255,255,0.06)" : "transparent",
                  border: `1px solid ${provider === key ? cfg.color + "44" : "rgba(255,255,255,0.06)"}`,
                  borderRadius: "8px",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.2s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                  <span style={{ color: cfg.color, fontSize: "14px" }}>{cfg.icon}</span>
                  <span style={{ fontSize: "12px", color: "#C4B8A8", fontWeight: 500 }}>
                    {cfg.name}
                  </span>
                </div>
                <span style={{ fontSize: "10px", color: "#5A5048", fontFamily: "'DM Mono', monospace" }}>
                  {cfg.description}
                </span>
              </button>
            ))}
          </div>

          {/* API Key Input (for non-Claude providers) */}
          {provider !== "claude" && (
            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "9px",
                  textTransform: "uppercase",
                  letterSpacing: "1.5px",
                  color: "#6A5F53",
                  fontFamily: "'DM Mono', monospace",
                  marginBottom: "8px",
                }}
              >
                API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={`Enter your ${PROVIDER_CONFIGS[provider].name} API key`}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "8px",
                  color: "#E8E0D4",
                  fontSize: "13px",
                  fontFamily: "'DM Mono', monospace",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
          )}

          {/* Input Source Toggle */}
          <label
            style={{
              display: "block",
              fontSize: "9px",
              textTransform: "uppercase",
              letterSpacing: "1.5px",
              color: "#6A5F53",
              fontFamily: "'DM Mono', monospace",
              marginBottom: "10px",
            }}
          >
            Input Source
          </label>
          <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
            <button
              onClick={() => { setInputMode("text"); setImportedData(null); setText(""); }}
              style={{
                flex: 1,
                padding: "10px 16px",
                background: inputMode === "text" ? "rgba(255,255,255,0.06)" : "transparent",
                border: `1px solid ${inputMode === "text" ? "rgba(212,165,116,0.4)" : "rgba(255,255,255,0.06)"}`,
                borderRadius: "8px",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.2s ease",
              }}
            >
              <div style={{ fontSize: "12px", color: "#C4B8A8", fontWeight: 500, marginBottom: "2px" }}>
                Paste Text
              </div>
              <span style={{ fontSize: "10px", color: "#5A5048", fontFamily: "'DM Mono', monospace" }}>
                Enter narrative text directly
              </span>
            </button>
            <button
              onClick={() => setInputMode("json")}
              style={{
                flex: 1,
                padding: "10px 16px",
                background: inputMode === "json" ? "rgba(255,255,255,0.06)" : "transparent",
                border: `1px solid ${inputMode === "json" ? "rgba(212,165,116,0.4)" : "rgba(255,255,255,0.06)"}`,
                borderRadius: "8px",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.2s ease",
              }}
            >
              <div style={{ fontSize: "12px", color: "#C4B8A8", fontWeight: 500, marginBottom: "2px" }}>
                Import JSON
              </div>
              <span style={{ fontSize: "10px", color: "#5A5048", fontFamily: "'DM Mono', monospace" }}>
                Upload a story_map.json file
              </span>
            </button>
          </div>

          {/* Text Input */}
          {inputMode === "text" && (
            <>
              <label
                style={{
                  display: "block",
                  fontSize: "9px",
                  textTransform: "uppercase",
                  letterSpacing: "1.5px",
                  color: "#6A5F53",
                  fontFamily: "'DM Mono', monospace",
                  marginBottom: "8px",
                }}
              >
                Narrative Text
              </label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste your text here..."
                rows={12}
                style={{
                  width: "100%",
                  padding: "16px",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "10px",
                  color: "#E8E0D4",
                  fontSize: "14px",
                  fontFamily: "'Newsreader', Georgia, serif",
                  lineHeight: 1.8,
                  resize: "vertical",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </>
          )}

          {/* JSON Import */}
          {inputMode === "json" && !importedData && (
            <div
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = "rgba(212,165,116,0.5)"; }}
              onDragLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                const file = e.dataTransfer.files[0];
                if (file && file.name.endsWith(".json")) handleJsonImport(file);
                else setError("Please drop a .json file");
              }}
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: "48px",
                border: "2px dashed rgba(255,255,255,0.08)",
                borderRadius: "10px",
                textAlign: "center",
                cursor: "pointer",
                color: "#7A6F63",
                fontSize: "13px",
                fontFamily: "'DM Mono', monospace",
                transition: "border-color 0.2s ease",
              }}
            >
              Drop a story_map.json file here, or click to browse
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) handleJsonImport(file);
                }}
              />
            </div>
          )}

          {inputMode === "json" && importedData && (
            <div style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(212,165,116,0.2)",
              borderRadius: "10px",
              overflow: "hidden",
            }}>
              <div style={{
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
              }}>
                <span style={{ fontSize: "12px", fontFamily: "'DM Mono', monospace", color: "#C4B8A8" }}>
                  {Object.keys(importedData).length} sentences imported
                </span>
                <button
                  onClick={() => { setImportedData(null); setText(""); }}
                  style={{
                    padding: "4px 10px",
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "4px",
                    color: "#7A6F63",
                    fontSize: "11px",
                    cursor: "pointer",
                    fontFamily: "'DM Mono', monospace",
                  }}
                >
                  Clear
                </button>
              </div>
              <div style={{ maxHeight: "320px", overflowY: "auto" }}>
                {Object.entries(importedData).map(([sentence, meta], i) => (
                  <div
                    key={i}
                    style={{
                      padding: "10px 16px",
                      borderBottom: "1px solid rgba(255,255,255,0.03)",
                      fontSize: "12px",
                    }}
                  >
                    <p style={{
                      margin: 0,
                      color: "#A89B8C",
                      fontFamily: "'Newsreader', Georgia, serif",
                      fontStyle: "italic",
                      lineHeight: 1.5,
                      marginBottom: "6px",
                    }}>
                      "{sentence}"
                    </p>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <span style={{
                        fontSize: "10px",
                        padding: "2px 8px",
                        borderRadius: "10px",
                        background: "rgba(74,212,165,0.1)",
                        color: "#4AD4A5",
                        fontFamily: "'DM Mono', monospace",
                      }}>
                        {meta.label}
                      </span>
                      <span style={{
                        fontSize: "10px",
                        padding: "2px 8px",
                        borderRadius: "10px",
                        background: "rgba(74,165,212,0.1)",
                        color: "#4AA5D4",
                        fontFamily: "'DM Mono', monospace",
                      }}>
                        {meta.file}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: "12px", marginTop: "16px", alignItems: "center" }}>
            <button
              onClick={analyze}
              disabled={loading || !text.trim()}
              style={{
                padding: "12px 28px",
                background: loading
                  ? "rgba(255,255,255,0.04)"
                  : "linear-gradient(135deg, #D4A574, #C49464)",
                border: "none",
                borderRadius: "8px",
                color: loading ? "#6A5F53" : "#1A1714",
                fontSize: "13px",
                fontWeight: 500,
                cursor: loading ? "wait" : "pointer",
                transition: "all 0.3s ease",
                letterSpacing: "0.3px",
              }}
            >
              {loading ? "Analyzing..." : "Analyze & Generate Prompts"}
            </button>
            <button
              onClick={() => setText(SAMPLE_TEXT)}
              style={{
                padding: "12px 20px",
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "8px",
                color: "#7A6F63",
                fontSize: "12px",
                cursor: "pointer",
                fontFamily: "'DM Mono', monospace",
              }}
            >
              Load sample
            </button>
          </div>
        </div>
      )}

      {/* Results View */}
      {view === "results" && results && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            height: "calc(100vh - 61px)",
          }}
        >
          {/* Sentence List */}
          <div
            style={{
              borderRight: "1px solid rgba(255,255,255,0.06)",
              overflowY: "auto",
            }}
          >
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "1.5px",
                  color: "#5A5048",
                  fontFamily: "'DM Mono', monospace",
                }}
              >
                {results.length} Sentences Analyzed
              </span>
              <span
                style={{
                  fontSize: "10px",
                  color: PROVIDER_CONFIGS[provider].color,
                  fontFamily: "'DM Mono', monospace",
                }}
              >
                {PROVIDER_CONFIGS[provider].icon} {PROVIDER_CONFIGS[provider].name}
              </span>
            </div>
            {results.map((item, i) => (
              <SentenceCard
                key={i}
                item={item}
                index={i}
                isSelected={selected === i}
                onSelect={setSelected}
                originalMeta={findOriginalMeta(item.sentence, i)}
              />
            ))}
          </div>

          {/* Detail Panel */}
          <div style={{ overflowY: "auto" }}>
            <PromptDetail
              item={selected !== null ? results[selected] : null}
              originalMeta={selected !== null ? findOriginalMeta(results[selected]?.sentence, selected) : null}
              onUpdatePrompt={(newPrompt) => {
                if (selected === null) return;
                setResults((prev) => prev.map((r, i) =>
                  i === selected ? { ...r, prompt: newPrompt } : r
                ));
              }}
              index={selected}
              onSoundGenerated={(idx, fname) => {
                generatedFilesRef.current = { ...generatedFilesRef.current, [idx]: fname };
                setGeneratedFiles((prev) => ({ ...prev, [idx]: fname }));
              }}
            />
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {loading && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(26,23,20,0.8)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            backdropFilter: "blur(4px)",
          }}
        >
          <div style={{ display: "flex", gap: "4px", marginBottom: "16px" }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                style={{
                  width: "3px",
                  height: "24px",
                  background: "#D4A574",
                  borderRadius: "1.5px",
                  animation: `pulse 1s ease-in-out ${i * 0.15}s infinite`,
                }}
              />
            ))}
          </div>
          <p style={{ fontSize: "13px", color: "#8A7F73", fontFamily: "'DM Mono', monospace" }}>
            Analyzing emotional landscape...
          </p>
          <style>{`
            @keyframes pulse {
              0%, 100% { transform: scaleY(0.4); opacity: 0.4; }
              50% { transform: scaleY(1); opacity: 1; }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
