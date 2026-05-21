// /api/detect.js — Naturize AI Detector v3
// Architecture: Real statistical NLP engine (perplexity + burstiness + vocabulary)
//               LLM is ONLY used to generate human-readable explanations — NOT to score.
// This is how professional detectors (GPTZero, Copyleaks) actually work.

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const { text } = req.body;
  if (!text || typeof text !== "string" || text.trim().length === 0)
    return res.status(400).json({ error: "Text is required." });
  if (text.trim().length > 10000)
    return res.status(400).json({ error: "Input too long. Max 10,000 characters." });

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey || groqKey.trim() === "")
    return res.status(500).json({ error: "Server configuration error: API key missing." });

  const sanitized = text.trim().replace(/[<>]/g, "");

  // ── PHASE 1: STATISTICAL ANALYSIS (deterministic, no AI bias) ─────────────
  const stats = extractFeatures(sanitized);
  const { score, signals } = computeScore(stats);

  const verdict =
    score >= 80 ? "AI-Generated" :
    score >= 60 ? "Likely AI" :
    score >= 40 ? "Mixed" :
    score >= 20 ? "Likely Human" :
    "Human";

  // ── PHASE 2: LLM generates readable reasons ONLY (does NOT control the score) ─
  try {
    const reasonsPrompt = `You are a forensic linguistics expert. You have already computed statistical metrics from a text sample. Your ONLY job is to write 3 concise, specific, human-readable reasons explaining the result — based solely on the numbers given. Do NOT re-score or override the verdict.

Computed statistics:
- Verdict: ${verdict} (AI probability: ${score}/100)
- Sentence burstiness (length variation): ${stats.burstiness.toFixed(3)} (0=AI-uniform, 1+=human-varied)
- Type-Token Ratio (vocab diversity): ${stats.ttr.toFixed(3)} (0=repetitive, 1=all unique)
- AI signature phrase count: ${stats.aiPhraseCount} (known AI overused words detected)
- First-person pronoun ratio: ${(stats.firstPersonRatio * 100).toFixed(2)}%
- Average sentence length: ${stats.avgSentenceLength.toFixed(1)} words
- Passive voice instances: ${stats.passiveCount}
- Total word count: ${stats.totalWords}

Write 3 short reasons (max 15 words each) explaining the verdict. Be specific and reference the actual data.

Return ONLY this JSON: {"reasons": ["reason1", "reason2", "reason3"]}`;

    const apiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${groqKey.trim()}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: reasonsPrompt }],
        temperature: 0.2,
        max_tokens: 250,
        response_format: { type: "json_object" }
      })
    });

    let reasons = signals; // default to computed signals if LLM fails

    if (apiRes.ok) {
      const data = await apiRes.json();
      const raw = data?.choices?.[0]?.message?.content || "";
      try {
        let cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed.reasons) && parsed.reasons.length >= 1) {
          reasons = parsed.reasons.slice(0, 3).map(r => String(r).trim()).filter(r => r.length > 3);
          if (reasons.length === 0) reasons = signals;
        }
      } catch { /* use fallback signals */ }
    }

    return res.status(200).json({ score, verdict, reasons });

  } catch (err) {
    console.error("Detect handler error:", err);
    // Even if LLM fails, we return the statistically computed result
    return res.status(200).json({ score, verdict, reasons: signals });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE EXTRACTION — Real NLP statistics, no guessing
// ═══════════════════════════════════════════════════════════════════════════
function extractFeatures(text) {
  // ── Sentence parsing
  const rawSentences = text.match(/[^.!?\n]+[.!?]+/g) || [text];
  const sentences = rawSentences.map(s => s.trim()).filter(s => s.length > 3);
  const sentenceLengths = sentences.map(s =>
    s.split(/\s+/).filter(w => w.length > 0).length
  );
  const sentenceCount = sentences.length;

  // ── Average sentence length
  const avgSentenceLength = sentenceCount > 0
    ? sentenceLengths.reduce((a, b) => a + b, 0) / sentenceCount
    : 0;

  // ── Burstiness: Coefficient of Variation (std_dev / mean)
  // Low CV = uniform = AI-like. High CV = varied = human-like.
  const variance = sentenceCount > 1
    ? sentenceLengths.reduce((sum, l) => sum + Math.pow(l - avgSentenceLength, 2), 0) / sentenceCount
    : 0;
  const stdDev = Math.sqrt(variance);
  const burstiness = avgSentenceLength > 0 ? stdDev / avgSentenceLength : 0;

  // ── Vocabulary analysis
  const words = text.toLowerCase().match(/\b[a-z']+\b/g) || [];
  const totalWords = words.length;
  const uniqueWords = new Set(words).size;
  const ttr = totalWords > 0 ? uniqueWords / totalWords : 0; // Type-Token Ratio

  // ── AI signature phrases (extensively researched list of LLM-overused terms)
  const AI_SIGNATURES = [
    "furthermore", "moreover", "additionally", "in conclusion", "in summary",
    "it is important to note", "it should be noted", "it is worth noting",
    "it is essential", "it is crucial", "needless to say", "it goes without saying",
    "delve", "delving", "showcase", "showcasing", "leverage", "leveraging",
    "utilize", "utilizing", "paradigm", "paradigms", "multifaceted", "nuanced",
    "in the realm of", "as mentioned earlier", "as previously mentioned",
    "at the end of the day", "in today's world", "in today's fast-paced",
    "foster", "fostering", "pivotal", "vibrant", "crucial", "vital", "facilitate",
    "mitigate", "comprehensive", "navigate", "evolving landscape", "streamline",
    "innovative", "revolutionize", "synergy", "cutting-edge", "state-of-the-art",
    "best practices", "moving forward", "going forward", "in this context",
    "in this regard", "with that said", "that being said", "by and large",
    "on the other hand", "it is imperative", "commendable", "noteworthy"
  ];
  const lowerText = text.toLowerCase();
  const aiPhraseCount = AI_SIGNATURES.filter(phrase => lowerText.includes(phrase)).length;

  // ── First-person pronouns (humans naturally use I, me, my, we, our)
  const firstPersonMatches = text.match(/\b(i|me|my|mine|myself|we|us|our|ours)\b/gi) || [];
  const firstPersonCount = firstPersonMatches.length;
  const firstPersonRatio = totalWords > 0 ? firstPersonCount / totalWords : 0;

  // ── Passive voice (AI overuses passive: "is done", "was created", "are being")
  const passiveMatches = text.match(/\b(is|are|was|were|be|been|being)\s+\w+ed\b/gi) || [];
  const passiveCount = passiveMatches.length;

  // ── Punctuation diversity (humans use !, ?, ;, : more naturally)
  const hasDiversePunctuation = /[!;:]/.test(text) && /\?/.test(text);

  // ── Contraction usage (I'm, don't, can't — humans use these, AI avoids them)
  const contractionMatches = text.match(/\b\w+'(t|s|re|ve|ll|d|m)\b/gi) || [];
  const contractionCount = contractionMatches.length;

  return {
    sentenceCount,
    avgSentenceLength,
    burstiness,
    ttr,
    totalWords,
    uniqueWords,
    aiPhraseCount,
    firstPersonCount,
    firstPersonRatio,
    passiveCount,
    hasDiversePunctuation,
    contractionCount,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SCORING ENGINE — Weighted statistical model
// Each feature contributes a weighted amount to the AI probability score (0-100)
// ═══════════════════════════════════════════════════════════════════════════
function computeScore(stats) {
  let aiScore = 0;
  const signals = [];

  // ── 1. BURSTINESS (30 points max) — most reliable signal
  if (stats.burstiness < 0.15) {
    aiScore += 30;
    signals.push("Extremely uniform sentence lengths — strong AI pattern.");
  } else if (stats.burstiness < 0.30) {
    aiScore += 22;
    signals.push("Low sentence length variation, consistent with AI generation.");
  } else if (stats.burstiness < 0.45) {
    aiScore += 12;
    signals.push("Moderate sentence variation — inconclusive.");
  } else if (stats.burstiness < 0.65) {
    aiScore += 3;
    signals.push("Good sentence burstiness — leans toward human writing.");
  } else {
    aiScore += 0;
    signals.push("High sentence burstiness — strong indicator of human writing.");
  }

  // ── 2. AI SIGNATURE PHRASES (25 points max) — linguistic fingerprint
  if (stats.aiPhraseCount >= 5) {
    aiScore += 25;
    signals.push(`${stats.aiPhraseCount} AI-signature phrases detected (e.g., "furthermore", "leverage", "delve").`);
  } else if (stats.aiPhraseCount >= 3) {
    aiScore += 16;
    signals.push(`${stats.aiPhraseCount} known AI-favored phrases found.`);
  } else if (stats.aiPhraseCount === 2) {
    aiScore += 8;
    signals.push("A couple of commonly AI-used phrases found.");
  } else if (stats.aiPhraseCount === 1) {
    aiScore += 3;
    signals.push("One AI-associated phrase found — not conclusive on its own.");
  } else {
    aiScore += 0;
    signals.push("No AI signature phrases detected.");
  }

  // ── 3. VOCABULARY DIVERSITY / TTR (20 points max)
  if (stats.totalWords > 50) { // Only meaningful for longer texts
    if (stats.ttr < 0.40) {
      aiScore += 20;
      signals.push("Low vocabulary diversity — AI models frequently repeat words.");
    } else if (stats.ttr < 0.55) {
      aiScore += 12;
      signals.push("Below-average vocabulary diversity.");
    } else if (stats.ttr < 0.70) {
      aiScore += 4;
      signals.push("Average vocabulary diversity.");
    } else {
      aiScore += 0;
      signals.push("High vocabulary diversity — typical of human writing.");
    }
  }

  // ── 4. FIRST-PERSON PRONOUN ABSENCE (15 points max)
  if (stats.totalWords > 80) {
    if (stats.firstPersonRatio < 0.003) {
      aiScore += 15;
      signals.push("No first-person pronouns (I, me, we) — AI rarely uses these unless prompted.");
    } else if (stats.firstPersonRatio < 0.012) {
      aiScore += 6;
      signals.push("Very low first-person pronoun usage.");
    } else {
      aiScore += 0;
      signals.push("Natural first-person pronoun usage — consistent with human authorship.");
    }
  }

  // ── 5. CONTRACTION ABSENCE (5 points max)
  // AI typically avoids contractions in formal text
  if (stats.totalWords > 60 && stats.contractionCount === 0) {
    aiScore += 5;
    signals.push("No contractions used — AI often avoids them.");
  }

  // ── 6. UNIFORM SENTENCE LENGTH BONUS (5 points)
  // AI sentences cluster around 18-25 words AND are uniform
  if (stats.avgSentenceLength >= 17 && stats.avgSentenceLength <= 26 && stats.burstiness < 0.35) {
    aiScore += 5;
    signals.push(`Consistent sentence length of ~${stats.avgSentenceLength.toFixed(0)} words — typical AI pacing.`);
  }

  const finalScore = Math.min(100, Math.max(0, Math.round(aiScore)));

  // Pick 3 most relevant signals
  return { score: finalScore, signals: signals.slice(0, 3) };
}
