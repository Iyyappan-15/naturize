// /api/detect.js — Naturize AI Detector v4 (Hybrid Fusion Engine)
// 3-layer system:
//   Layer 1: Statistical fingerprinting (burstiness, passive voice, clichés, N-gram repetition, formality)
//   Layer 2: LLM per-sentence deep analysis
//   Layer 3: Weighted score fusion  →  final classification + sentence heat map data
// Calibrated to correctly identify Naturize-humanized text as "Human Written"

import checkRateLimit from '../utils/rateLimit.js';

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  // Rate Limiting (15 requests per minute per IP)
  const rateLimit = checkRateLimit(req, 15, 60000);
  if (!rateLimit.success) {
    return res.status(429).json({ error: "Too many requests. Please try again in a minute." });
  }

  const { text } = req.body;
  if (!text || typeof text !== "string" || text.trim().length === 0)
    return res.status(400).json({ error: "Text is required." });
  if (text.trim().length > 10000)
    return res.status(400).json({ error: "Input too long. Max 10,000 characters." });

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey || groqKey.trim() === "")
    return res.status(500).json({ error: "Server configuration error." });

  const input = text.trim().replace(/[<>]/g, "").slice(0, 5000);

  // ══════════════════════════════════════════════════════════════
  // LAYER 1: STATISTICAL FINGERPRINTING ENGINE
  // ══════════════════════════════════════════════════════════════

  const words = input.split(/\s+/).filter(w => w.trim().length > 0);
  const wordCount = words.length;

  if (wordCount < 50) {
    return res.status(400).json({
      error: true,
      message: "Please enter at least 50 words for accurate AI detection analysis.",
      word_count: wordCount
    });
  }

  const sentences = input.split(/[.!?]+/).filter(s => s.trim().split(/\s+/).length > 3);
  const sentenceCount = sentences.length;
  const avgSentenceLength = sentenceCount > 0 ? parseFloat((wordCount / sentenceCount).toFixed(1)) : 0;

  // ── Burstiness (sentence-length variance) ──────────────────────
  // HIGH variance = human. LOW variance = AI.
  const sentLengths = sentences.map(s => s.trim().split(/\s+/).length);
  const meanLen = sentLengths.reduce((a, b) => a + b, 0) / (sentLengths.length || 1);
  const variance = sentLengths.reduce((a, b) => a + Math.pow(b - meanLen, 2), 0) / (sentLengths.length || 1);
  const burstiness = parseFloat(variance.toFixed(2));

  // ── Vocabulary diversity ────────────────────────────────────────
  const uniqueWords = new Set(words.map(w => w.toLowerCase().replace(/[^a-z]/g, "")));
  const vocabDiversity = parseFloat((uniqueWords.size / (wordCount || 1)).toFixed(3));

  // ── AI cliché phrases ───────────────────────────────────────────
  const aiCliches = [
    "delve", "tapestry", "nuanced", "pivotal", "moreover", "furthermore",
    "in conclusion", "it is important to note", "it is worth noting",
    "in today's world", "in the realm of", "leverage", "underscore",
    "multifaceted", "comprehensive", "notably", "shed light", "when it comes to",
    "in summary", "plays a crucial role", "plays a vital role",
    "in addition", "on the other hand", "first and foremost", "last but not least",
    "in essence", "to summarize", "at the end of the day", "needless to say",
    "it goes without saying", "as mentioned earlier", "this article will",
    "this essay will", "by and large", "in terms of", "with that said",
    "having said that", "in this regard", "it should be noted", "as we can see",
    "as discussed", "this highlights", "this demonstrates", "this suggests",
    "various aspects", "key aspects", "key elements", "key factors",
    "a wide range", "a variety of", "diverse range", "wide array",
    "in the context of", "moving forward", "going forward", "in light of",
    "take into account", "due to the fact", "in order to",
    "can be attributed", "plays an important role",
    "significant impact", "profound impact", "key role", "vital role",
    "it is clear that", "one can argue", "it can be argued",
    "as a society", "the modern world", "today's society"
  ];
  const inputLower = input.toLowerCase();
  const clicheHits = aiCliches.filter(c => inputLower.includes(c));

  // ── Passive voice rate ──────────────────────────────────────────
  // AI massively over-uses passive voice ("is used", "was found", "are considered")
  const passivePattern = /\b(?:is|are|was|were|be|been|being)\s+\w+(?:ed|en)\b/gi;
  const passiveMatches = (input.match(passivePattern) || []).length;
  const passiveRate = parseFloat((passiveMatches / (sentenceCount || 1)).toFixed(2));

  // ── N-gram repetition score ─────────────────────────────────────
  // AI reuses sentence-opening structures (bigrams)
  const bigrams = {};
  const wordList = words.map(w => w.toLowerCase().replace(/[^a-z]/g, ""));
  for (let i = 0; i < wordList.length - 1; i++) {
    if (wordList[i].length < 3 || wordList[i + 1].length < 3) continue;
    const bg = `${wordList[i]} ${wordList[i + 1]}`;
    bigrams[bg] = (bigrams[bg] || 0) + 1;
  }
  const repeatedBigrams = Object.values(bigrams).filter(c => c > 2).length;

  // ── Formality index ─────────────────────────────────────────────
  // Positive = formal/academic (AI signal). Negative = casual (human signal).
  const contractions = [
    "don't", "can't", "won't", "isn't", "aren't", "wasn't", "weren't",
    "it's", "that's", "i'm", "you're", "we're", "they're", "i've", "i'll",
    "doesn't", "didn't", "couldn't", "wouldn't", "shouldn't", "haven't", "hadn't",
    "here's", "there's", "what's", "let's", "i'd", "he'd", "she'd"
  ];
  const contractionCount = contractions.filter(c => inputLower.includes(c)).length;
  const formalAcademicWords = [
    "however", "therefore", "thus", "hence", "consequently",
    "nevertheless", "nonetheless", "accordingly", "subsequently", "alternatively",
    "notwithstanding", "aforementioned", "henceforth", "therein", "wherein",
    "thereby", "thereof", "herein", "pursuant", "aforementioned"
  ];
  const formalCount = formalAcademicWords.filter(w => inputLower.includes(w)).length;
  const formalityIndex = formalCount - contractionCount;

  // ── Transition density ──────────────────────────────────────────
  const transitions = [
    "however", "therefore", "thus", "hence", "consequently",
    "nevertheless", "nonetheless", "accordingly", "subsequently", "alternatively",
    "in contrast", "on the contrary", "for example", "for instance",
    "in particular", "specifically", "in fact", "indeed", "ultimately"
  ];
  const transitionHits = transitions.filter(t => inputLower.includes(t)).length;
  const transitionDensity = parseFloat((transitionHits / (sentenceCount || 1)).toFixed(3));

  // ── STATISTICAL SCORE (0–100, where 100 = definitely AI) ───────
  let statScore = 0;

  // Cliché density (max 30 pts)
  statScore += Math.min(30, clicheHits.length * 5);

  // Burstiness — inverted (low burstiness = AI)
  if (burstiness < 5 && sentenceCount > 4)       statScore += 22;
  else if (burstiness < 10 && sentenceCount > 4)  statScore += 14;
  else if (burstiness < 18)                        statScore += 6;
  else if (burstiness >= 30)                       statScore -= 12; // strong human signal
  else if (burstiness >= 22)                       statScore -= 6;  // moderate human signal

  // Passive voice (max 15 pts)
  statScore += Math.min(15, Math.round(passiveRate * 8));

  // Transition density (max 12 pts)
  statScore += Math.min(12, Math.round(transitionDensity * 20));

  // Formality index (max 10 pts positive, -12 for casual)
  if (formalityIndex > 0) statScore += Math.min(10, formalityIndex * 3);
  else statScore += Math.max(-12, formalityIndex * 4); // contractions = strong human signal

  // N-gram repetition (max 10 pts)
  statScore += Math.min(10, repeatedBigrams * 2);

  // No clichés + high burstiness = humanized or human text (big reduction)
  if (clicheHits.length === 0 && burstiness > 20) statScore -= 15;
  if (contractionCount > 2) statScore -= 8;

  statScore = Math.max(0, Math.min(100, Math.round(statScore)));

  // ══════════════════════════════════════════════════════════════
  // LAYER 2: LLM PER-SENTENCE DEEP ANALYSIS
  // ══════════════════════════════════════════════════════════════

  const sentenceList = sentences.slice(0, 25);
  const numberedSentences = sentenceList.map((s, i) => `[${i}] ${s.trim()}`).join("\n");

  const prompt = `You are an expert AI authorship detection system with two tasks:
1. Classify the OVERALL text as "AI Generated", "Human Written", or "Uncertain"
2. Score EACH SENTENCE individually: 0 = definitely human, 100 = definitely AI

━━━ CRITICAL CALIBRATION RULES ━━━
- Text humanized by a rewriter (e.g. Naturize) that shows: HIGH sentence-length variance, ZERO AI clichés, concrete vocabulary, and short punchy sentences mixed with longer ones — classify as "Human Written". Do NOT flag humanized text as AI.
- Raw AI text has: UNIFORM sentence lengths, academic clichés ("moreover", "furthermore", "plays a crucial role"), heavy passive voice, and no personal perspective.
- Contractions (don't, can't, it's) are a STRONG human signal.
- Very short sentences (under 6 words) mixed with longer ones = human burstiness pattern.
- If the text lacks all AI clichés and has high variance, lean toward "Human Written" even if grammar is perfect.

━━━ PRE-COMPUTED TEXT METRICS ━━━
- Burstiness (sentence length variance): ${burstiness} ${burstiness >= 30 ? "✅ HIGH — strong human / humanized signal" : burstiness >= 20 ? "✅ MODERATE-HIGH — likely human" : burstiness < 8 ? "🤖 LOW — strong AI signal" : "⚠️ MODERATE"}
- AI Clichés found: ${clicheHits.length} ${clicheHits.length === 0 ? "✅ NONE — human signal" : `🤖 FOUND: "${clicheHits.slice(0, 5).join('", "')}"`}
- Passive voice per sentence: ${passiveRate} ${passiveRate > 1.5 ? "🤖 HIGH — AI signal" : "✅ normal"}
- Formality index: ${formalityIndex} ${formalityIndex < -2 ? "✅ CASUAL — human signal" : formalityIndex > 3 ? "🤖 VERY FORMAL — AI signal" : "⚠️ neutral"}
- Contractions count: ${contractionCount} ${contractionCount > 2 ? "✅ MULTIPLE — strong human signal" : ""}
- Statistical AI Score (Layer 1): ${statScore}/100

━━━ NUMBERED SENTENCES TO CLASSIFY ━━━
${numberedSentences}

━━━ OUTPUT FORMAT ━━━
Return ONLY valid JSON — no markdown, no explanation outside JSON:
{
  "classification": "AI Generated" | "Human Written" | "Uncertain",
  "confidence": <integer 0-100>,
  "sentence_scores": [<array of integers 0-100, one per sentence, 0=human 100=AI>],
  "ai_signals": [<up to 4 specific text observations proving AI authorship>],
  "human_signals": [<up to 4 specific text observations proving human authorship>],
  "reasoning": "<2-3 sentence clear explanation of your verdict>"
}`;

  try {
    const makeRequest = async (modelName) =>
      fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${groqKey.trim()}`
        },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: "user", content: prompt }],
          temperature: 0,
          max_tokens: 1400
        })
      });

    let apiRes = await makeRequest("llama-3.3-70b-versatile");
    if (!apiRes.ok) {
      console.log("70b failed, falling back to 8b...");
      apiRes = await makeRequest("llama-3.1-8b-instant");
    }

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error("Groq API error:", errText);
      throw new Error(errText);
    }

    const data = await apiRes.json();
    const raw = data?.choices?.[0]?.message?.content || "";
    let cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(cleaned);

    // ══════════════════════════════════════════════════════════════
    // LAYER 3: WEIGHTED SCORE FUSION
    // ══════════════════════════════════════════════════════════════

    const llmIsAI    = parsed.classification === "AI Generated";
    const llmIsHuman = parsed.classification === "Human Written";
    const llmConf    = Math.max(0, Math.min(100, parseInt(parsed.confidence) || 50));

    // Convert LLM output to a 0–100 AI probability
    const llmAiProb = llmIsAI ? llmConf : llmIsHuman ? (100 - llmConf) : 50;

    // Weighted fusion: stats contribute 35%, LLM contributes 65%
    const fusedAiScore = Math.round((statScore * 0.35) + (llmAiProb * 0.65));

    // Final classification thresholds
    let finalClassification, finalConfidence;
    if (fusedAiScore >= 62) {
      finalClassification = "AI Generated";
      finalConfidence     = Math.min(99, fusedAiScore + 5);
    } else if (fusedAiScore <= 38) {
      finalClassification = "Human Written";
      finalConfidence     = Math.min(99, 100 - fusedAiScore + 5);
    } else {
      finalClassification = "Uncertain";
      finalConfidence     = Math.round(50 + Math.abs(fusedAiScore - 50) * 1.6);
    }

    // Validate and normalise sentence scores array
    const rawScores = Array.isArray(parsed.sentence_scores) ? parsed.sentence_scores : [];
    const sentenceScores = sentenceList.map((_, i) =>
      Math.max(0, Math.min(100, Number(rawScores[i]) || fusedAiScore))
    );

    return res.status(200).json({
      classification: finalClassification,
      confidence:     Math.min(99, finalConfidence),
      word_count:     wordCount,
      ai_signals:     parsed.ai_signals    || [],
      human_signals:  parsed.human_signals || [],
      reasoning:      parsed.reasoning     || "",
      sentences:      sentenceList,
      sentence_scores: sentenceScores,
      metrics: {
        burstiness,
        avg_sentence_length:   avgSentenceLength,
        vocab_diversity:       vocabDiversity,
        cliche_count:          clicheHits.length,
        cliches_found:         clicheHits.slice(0, 6).join(", ") || "none",
        passive_rate:          passiveRate,
        formality_index:       formalityIndex,
        contraction_count:     contractionCount,
        statistical_ai_score:  statScore,
        llm_ai_probability:    llmAiProb,
        fused_ai_score:        fusedAiScore
      }
    });

  } catch (err) {
    console.error("Detect error:", err);
    return res.status(500).json({ error: "Failed to analyze text. Please try again." });
  }
}
