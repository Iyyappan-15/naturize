// /api/detect.js — Naturize AI Detector v4 (Hybrid Engine)
// Architecture: Hybrid scoring model
//   - 70% weight: LLM semantic analysis (LLaMA reads and classifies the text directly)
//   - 30% weight: Statistical NLP engine (burstiness, vocabulary, AI phrases)
// The LLM component catches what statistics miss in modern GPT-4 output.

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

  // ── PHASE 1: STATISTICAL ANALYSIS (30% weight) ────────────────────────────
  const stats = extractFeatures(sanitized);
  const { score: statScore, signals: statSignals } = computeScore(stats);

  // ── PHASE 2: LLM SEMANTIC CLASSIFICATION (70% weight) ─────────────────────
  let llmScore = null;
  let llmReasons = [];

  const classifyPrompt = `You are a forensic linguistics expert specializing in detecting AI-generated text. Your job is to analyze WRITING STYLE only — not content quality, not factual accuracy, not grammar correctness.

CRITICAL RULES:
- Grammatical errors, typos, and awkward phrasing are STRONG HUMAN signals. Humans make mistakes. AI almost never does.
- Factual errors or wrong information are HUMAN signals. AI tries to be accurate.
- Simple, short, or unsophisticated writing does NOT mean AI. Children and students write simply too.
- DO NOT penalize text for being short, simple, or factually wrong.
- DO NOT reward text for being detailed or well-structured — that could be a human expert.

REAL AI WRITING PATTERNS (raise the score):
- Perfect grammar with zero errors
- Formulaic structure: brief intro → numbered/bulleted points → summary conclusion
- Overly formal or corporate vocabulary (leverage, facilitate, furthermore, moreover, it is important to note)
- Sentences that are all similar in length and perfectly balanced
- No contractions (don't, it's, can't) — AI prefers "do not", "it is", "cannot"
- Vague, generic examples with no specific personal experience
- Suspiciously smooth transitions between every sentence
- No casual phrases, slang, or informal language at all

REAL HUMAN WRITING PATTERNS (lower the score):
- Grammatical mistakes, typos, or spelling errors
- Factual errors or wrong information
- Awkward or informal phrasing
- Sentences of very different lengths mixed together
- Contractions and casual language
- Personal opinions stated bluntly without over-qualifying
- Abrupt topic changes or uneven flow
- Simple vocabulary without trying to sound impressive

TEXT TO ANALYZE:
"""
${sanitized.slice(0, 3000)}
"""

Based ONLY on writing style (not content quality), return ONLY this JSON:
{
  "ai_probability": <integer 0-100>,
  "reasons": ["<style-based reason 1, max 12 words>", "<style-based reason 2, max 12 words>", "<style-based reason 3, max 12 words>"]
}

Score guide:
- 0-20: Clearly human (errors, casual tone, imperfect)
- 21-40: Likely human with some polished phrasing
- 41-60: Mixed signals, hard to tell
- 61-80: Likely AI (too perfect, formulaic, formal)
- 81-100: Almost certainly AI (zero errors, perfect structure, corporate tone)`;

  try {
    const apiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${groqKey.trim()}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: classifyPrompt }],
        temperature: 0.1,
        max_tokens: 300,
        response_format: { type: "json_object" }
      })
    });

    if (apiRes.ok) {
      const data = await apiRes.json();
      const raw = data?.choices?.[0]?.message?.content || "";
      try {
        let cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        const parsed = JSON.parse(cleaned);

        if (typeof parsed.ai_probability === "number") {
          llmScore = Math.min(100, Math.max(0, Math.round(parsed.ai_probability)));
        }
        if (Array.isArray(parsed.reasons) && parsed.reasons.length >= 1) {
          llmReasons = parsed.reasons.slice(0, 3).map(r => String(r).trim()).filter(r => r.length > 3);
        }
      } catch { /* fall back to stats only */ }
    }
  } catch (err) {
    console.error("LLM classify error:", err);
  }

  // ── PHASE 3: COMBINE SCORES ────────────────────────────────────────────────
  let finalScore;
  let reasons;

  if (llmScore !== null) {
    // Hybrid: 70% LLM + 30% statistical
    finalScore = Math.min(100, Math.max(0, Math.round((llmScore * 0.70) + (statScore * 0.30))));
    reasons = llmReasons.length > 0 ? llmReasons : statSignals;
  } else {
    // LLM failed — fall back to pure statistics
    finalScore = statScore;
    reasons = statSignals;
  }

  const verdict =
    finalScore >= 80 ? "AI-Generated" :
    finalScore >= 60 ? "Likely AI" :
    finalScore >= 40 ? "Mixed" :
    finalScore >= 20 ? "Likely Human" :
    "Human";

  return res.status(200).json({ score: finalScore, verdict, reasons });
}

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE EXTRACTION — Real NLP statistics
// ═══════════════════════════════════════════════════════════════════════════
function extractFeatures(text) {
  const rawSentences = text.match(/[^.!?\n]+[.!?]+/g) || [text];
  const sentences = rawSentences.map(s => s.trim()).filter(s => s.length > 3);
  const sentenceLengths = sentences.map(s =>
    s.split(/\s+/).filter(w => w.length > 0).length
  );
  const sentenceCount = sentences.length;

  const avgSentenceLength = sentenceCount > 0
    ? sentenceLengths.reduce((a, b) => a + b, 0) / sentenceCount
    : 0;

  const variance = sentenceCount > 1
    ? sentenceLengths.reduce((sum, l) => sum + Math.pow(l - avgSentenceLength, 2), 0) / sentenceCount
    : 0;
  const stdDev = Math.sqrt(variance);
  const burstiness = avgSentenceLength > 0 ? stdDev / avgSentenceLength : 0;

  const words = text.toLowerCase().match(/\b[a-z']+\b/g) || [];
  const totalWords = words.length;
  const uniqueWords = new Set(words).size;
  const ttr = totalWords > 0 ? uniqueWords / totalWords : 0;

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

  const firstPersonMatches = text.match(/\b(i|me|my|mine|myself|we|us|our|ours)\b/gi) || [];
  const firstPersonCount = firstPersonMatches.length;
  const firstPersonRatio = totalWords > 0 ? firstPersonCount / totalWords : 0;

  const passiveMatches = text.match(/\b(is|are|was|were|be|been|being)\s+\w+ed\b/gi) || [];
  const passiveCount = passiveMatches.length;

  const contractionMatches = text.match(/\b\w+'(t|s|re|ve|ll|d|m)\b/gi) || [];
  const contractionCount = contractionMatches.length;

  return {
    sentenceCount, avgSentenceLength, burstiness, ttr,
    totalWords, uniqueWords, aiPhraseCount,
    firstPersonCount, firstPersonRatio, passiveCount, contractionCount,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// STATISTICAL SCORING ENGINE (30% of final score)
// ═══════════════════════════════════════════════════════════════════════════
function computeScore(stats) {
  let aiScore = 0;
  const signals = [];

  // 1. BURSTINESS (45 points max)
  if (stats.sentenceCount > 2) {
    if (stats.burstiness < 0.20) {
      aiScore += 45;
      signals.push("Extremely uniform sentence lengths — strong AI pattern.");
    } else if (stats.burstiness < 0.35) {
      aiScore += 30;
      signals.push("Low sentence length variation, consistent with AI generation.");
    } else if (stats.burstiness < 0.45) {
      aiScore += 15;
      signals.push("Moderate sentence variation — inconclusive.");
    } else if (stats.burstiness < 0.65) {
      aiScore += 5;
      signals.push("Good sentence burstiness — leans toward human writing.");
    } else {
      aiScore += 0;
      signals.push("High sentence burstiness — strong indicator of human writing.");
    }
  } else {
    signals.push("Text is very short — sentence variation is hard to measure.");
  }

  // 2. AI SIGNATURE PHRASES (40 points max)
  if (stats.aiPhraseCount >= 4) {
    aiScore += 40;
    signals.push(`${stats.aiPhraseCount} AI-signature phrases detected (e.g., "furthermore", "leverage").`);
  } else if (stats.aiPhraseCount >= 2) {
    aiScore += 25;
    signals.push(`${stats.aiPhraseCount} known AI-favored phrases found.`);
  } else if (stats.aiPhraseCount === 1) {
    aiScore += 10;
    signals.push("One AI-associated phrase found.");
  } else {
    aiScore += 0;
    signals.push("No AI signature phrases detected.");
  }

  // 3. VOCABULARY DIVERSITY / TTR (20 points max)
  if (stats.totalWords > 40) {
    if (stats.ttr < 0.45) {
      aiScore += 20;
      signals.push("Low vocabulary diversity — AI models frequently repeat words.");
    } else if (stats.ttr < 0.55) {
      aiScore += 12;
      signals.push("Below-average vocabulary diversity.");
    }
  }

  // 4. FIRST-PERSON ABSENCE (10 points max)
  if (stats.totalWords > 60 && stats.firstPersonRatio < 0.005) {
    aiScore += 10;
    signals.push("No first-person pronouns (I, me, we) — AI rarely uses these.");
  }

  // 5. CONTRACTION ABSENCE (10 points max)
  if (stats.totalWords > 50 && stats.contractionCount === 0) {
    aiScore += 10;
    signals.push("No contractions used — AI typically avoids them.");
  }

  // 6. UNIFORM SENTENCE LENGTH BONUS (10 points)
  if (stats.sentenceCount > 2 && stats.avgSentenceLength >= 15 && stats.avgSentenceLength <= 28 && stats.burstiness < 0.35) {
    aiScore += 10;
    signals.push(`Consistent ~${stats.avgSentenceLength.toFixed(0)}-word sentences — typical AI pacing.`);
  }

  const finalScore = Math.min(100, Math.max(0, Math.round(aiScore)));
  return { score: finalScore, signals: signals.slice(0, 3) };
}
