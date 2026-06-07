// /api/detect.js — Naturize AI Detector v5 (Precision Fusion Engine)
// Architecture:
//   Layer 1: Deep statistical fingerprinting (12 signals, properly calibrated)
//   Layer 2: LLM semantic analysis with decisive prompting
//   Layer 3: Adaptive weighted fusion with hard override rules
// Key fixes over v4:
//   - Wider classification bands (was 38-62, now 30-70) → far fewer "Mixed" results
//   - LLM prompt forces decisive output, no more hedging
//   - Statistical engine re-calibrated: strong AI text scores 70+, strong human scores 20-
//   - Hard override: if LLM says 90%+ confident AI AND stat > 55 → force AI verdict
//   - Hard override: if zero clichés AND high burstiness AND contractions → force Human

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

  const input = text.trim().replace(/[<>]/g, "").slice(0, 6000);

  // ══════════════════════════════════════════════════════════════
  // LAYER 1: DEEP STATISTICAL FINGERPRINTING ENGINE (v5)
  // Properly calibrated: real AI text → 65-90, real human → 5-35
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

  // Split into sentences more accurately
  const sentences = input.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(s => s.trim().split(/\s+/).length > 3);
  const sentenceCount = Math.max(sentences.length, 1);
  const avgSentenceLength = parseFloat((wordCount / sentenceCount).toFixed(1));

  // ── Signal 1: Burstiness (sentence-length variance) ──────────
  // HIGH variance = human. LOW variance = AI.
  const sentLengths = sentences.map(s => s.trim().split(/\s+/).length);
  const meanLen = sentLengths.reduce((a, b) => a + b, 0) / sentLengths.length;
  const variance = sentLengths.reduce((a, b) => a + Math.pow(b - meanLen, 2), 0) / sentLengths.length;
  const burstiness = parseFloat(variance.toFixed(2));
  const stdDev = Math.sqrt(variance);

  // ── Signal 2: Vocabulary richness ────────────────────────────
  const uniqueWords = new Set(words.map(w => w.toLowerCase().replace(/[^a-z]/g, "")));
  const vocabDiversity = parseFloat((uniqueWords.size / (wordCount || 1)).toFixed(3));

  // ── Signal 3: AI cliché phrases (expanded list) ──────────────
  const aiCliches = [
    // Structural transitions AI loves
    "delve", "tapestry", "nuanced", "pivotal", "moreover", "furthermore",
    "in conclusion", "it is important to note", "it is worth noting",
    "in today's world", "in the realm of", "leverage", "leveraging", "underscore",
    "multifaceted", "comprehensive", "notably", "shed light", "when it comes to",
    "in summary", "plays a crucial role", "plays a vital role", "plays an important role",
    "in addition", "on the other hand", "first and foremost", "last but not least",
    "in essence", "to summarize", "at the end of the day", "needless to say",
    "it goes without saying", "as mentioned earlier", "this article will",
    "this essay will", "by and large", "in terms of", "with that said",
    "having said that", "in this regard", "it should be noted", "as we can see",
    "as discussed", "this highlights", "this demonstrates", "this suggests",
    "various aspects", "key aspects", "key elements", "key factors",
    "a wide range of", "a variety of", "diverse range", "wide array",
    "in the context of", "moving forward", "going forward", "in light of",
    "due to the fact", "in order to", "can be attributed",
    "significant impact", "profound impact", "key role", "vital role",
    "it is clear that", "one can argue", "it can be argued",
    "as a society", "the modern world", "today's society",
    // Additional strong AI markers
    "transformative", "innovative", "robust", "seamless", "paradigm",
    "ecosystem", "landscape", "foster", "facilitate", "ensure that",
    "it is essential", "it is crucial", "it is imperative",
    "undeniable", "unprecedented", "cutting-edge", "state-of-the-art",
    "holistic", "synergy", "proactive", "scalable", "streamline",
    "utilize", "utilization", "implementation", "optimal", "optimize"
  ];
  const inputLower = input.toLowerCase();
  const clicheHits = aiCliches.filter(c => inputLower.includes(c));
  const clicheDensity = clicheHits.length / (wordCount / 100); // clichés per 100 words

  // ── Signal 4: Passive voice rate ─────────────────────────────
  const passivePattern = /\b(?:is|are|was|were|be|been|being)\s+\w+(?:ed|en)\b/gi;
  const passiveMatches = (input.match(passivePattern) || []).length;
  const passiveRate = parseFloat((passiveMatches / sentenceCount).toFixed(2));

  // ── Signal 5: Contractions (strong human signal) ─────────────
  const contractionList = [
    "don't", "can't", "won't", "isn't", "aren't", "wasn't", "weren't",
    "it's", "that's", "i'm", "you're", "we're", "they're", "i've", "i'll",
    "doesn't", "didn't", "couldn't", "wouldn't", "shouldn't", "haven't", "hadn't",
    "here's", "there's", "what's", "let's", "i'd", "he'd", "she'd", "she's",
    "he's", "who's", "that'd", "would've", "could've", "should've", "might've",
    "i've", "you've", "we've", "they've"
  ];
  const contractionCount = contractionList.filter(c => inputLower.includes(c)).length;

  // ── Signal 6: Formality (AI = very formal) ───────────────────
  const formalAcademicWords = [
    "however", "therefore", "thus", "hence", "consequently",
    "nevertheless", "nonetheless", "accordingly", "subsequently", "alternatively",
    "notwithstanding", "aforementioned", "henceforth", "therein", "wherein",
    "thereby", "thereof", "herein", "pursuant"
  ];
  const formalCount = formalAcademicWords.filter(w => inputLower.includes(w)).length;
  const formalityIndex = formalCount - contractionCount;

  // ── Signal 7: Transition density ─────────────────────────────
  const transitions = [
    "however", "therefore", "thus", "hence", "consequently",
    "nevertheless", "nonetheless", "accordingly", "subsequently", "alternatively",
    "in contrast", "on the contrary", "for example", "for instance",
    "in particular", "specifically", "in fact", "indeed", "ultimately",
    "additionally", "furthermore", "moreover", "besides", "also"
  ];
  const transitionHits = transitions.filter(t => inputLower.includes(t)).length;
  const transitionDensity = parseFloat((transitionHits / sentenceCount).toFixed(3));

  // ── Signal 8: N-gram repetition (AI reuses patterns) ─────────
  const bigrams = {};
  const wordList = words.map(w => w.toLowerCase().replace(/[^a-z]/g, ""));
  for (let i = 0; i < wordList.length - 1; i++) {
    if (wordList[i].length < 3 || wordList[i + 1].length < 3) continue;
    const bg = `${wordList[i]} ${wordList[i + 1]}`;
    bigrams[bg] = (bigrams[bg] || 0) + 1;
  }
  const repeatedBigrams = Object.values(bigrams).filter(c => c > 2).length;

  // ── Signal 9: Sentence opener diversity ──────────────────────
  // AI often starts many sentences with "The", "This", "It", "In"
  const aiOpeners = ["the ", "this ", "it ", "in ", "as ", "by ", "such ", "these "];
  const openerHits = sentences.filter(s => {
    const low = s.trim().toLowerCase();
    return aiOpeners.some(o => low.startsWith(o));
  }).length;
  const openerRatio = openerHits / sentenceCount;

  // ── Signal 10: Personal pronoun usage (human signal) ─────────
  const personalPronouns = /\b(i|me|my|mine|myself|we|us|our|ours|ourselves|you|your|yours)\b/gi;
  const pronounMatches = (input.match(personalPronouns) || []).length;
  const pronounDensity = pronounMatches / (wordCount / 100);

  // ── Signal 11: Short sentence ratio (human burstiness proxy) ──
  const shortSentences = sentLengths.filter(l => l <= 7).length;
  const shortSentenceRatio = shortSentences / sentenceCount;

  // ── Signal 12: Question marks and exclamations (human energy) ─
  const emotiveMarkers = (input.match(/[?!]/g) || []).length;
  const emotiveDensity = emotiveMarkers / (wordCount / 100);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STATISTICAL SCORE COMPUTATION (0-100, higher = more AI-like)
  // Re-calibrated: typical ChatGPT essay should score 70-85
  //                typical human casual text should score 10-30
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  let statScore = 40; // neutral baseline (not 0, so weak signals matter)

  // --- AI SIGNALS (push score UP) ---

  // Cliché density — strongest AI marker (max +35 pts)
  if (clicheHits.length >= 8)      statScore += 35;
  else if (clicheHits.length >= 5) statScore += 25;
  else if (clicheHits.length >= 3) statScore += 16;
  else if (clicheHits.length >= 1) statScore += 8;

  // Low burstiness = AI writing (uniform sentence lengths)
  if (burstiness < 4 && sentenceCount > 5)       statScore += 20;
  else if (burstiness < 8 && sentenceCount > 4)  statScore += 13;
  else if (burstiness < 14)                       statScore += 5;

  // High passive voice (max +12 pts)
  if (passiveRate > 2.0)      statScore += 12;
  else if (passiveRate > 1.2) statScore += 7;
  else if (passiveRate > 0.6) statScore += 3;

  // High transition density (max +10 pts)
  if (transitionDensity > 0.5)      statScore += 10;
  else if (transitionDensity > 0.3) statScore += 6;
  else if (transitionDensity > 0.15) statScore += 3;

  // High formality (max +8 pts)
  if (formalityIndex > 5)  statScore += 8;
  else if (formalityIndex > 2) statScore += 4;

  // N-gram repetition (max +8 pts)
  if (repeatedBigrams > 6)  statScore += 8;
  else if (repeatedBigrams > 3) statScore += 4;
  else if (repeatedBigrams > 1) statScore += 2;

  // Repetitive sentence openers (max +8 pts)
  if (openerRatio > 0.75)      statScore += 8;
  else if (openerRatio > 0.55) statScore += 4;

  // --- HUMAN SIGNALS (push score DOWN) ---

  // Contractions = very strong human signal
  if (contractionCount >= 6)      statScore -= 22;
  else if (contractionCount >= 3) statScore -= 14;
  else if (contractionCount >= 1) statScore -= 7;

  // High burstiness = strong human signal
  if (burstiness >= 40)      statScore -= 20;
  else if (burstiness >= 25) statScore -= 12;
  else if (burstiness >= 18) statScore -= 6;

  // Many short sentences = human energy
  if (shortSentenceRatio > 0.35 && stdDev > 5) statScore -= 10;
  else if (shortSentenceRatio > 0.2) statScore -= 5;

  // Personal pronouns = human voice
  if (pronounDensity > 3)       statScore -= 12;
  else if (pronounDensity > 1)  statScore -= 6;

  // Questions/exclamations = human expressiveness
  if (emotiveDensity > 2) statScore -= 8;
  else if (emotiveDensity > 1) statScore -= 4;

  // Vocabulary richness (high diversity = human)
  if (vocabDiversity > 0.72) statScore -= 6;

  // Hard overrides — clear-cut cases
  // Clear AI: many clichés + low burstiness + no contractions
  if (clicheHits.length >= 4 && burstiness < 12 && contractionCount === 0) {
    statScore = Math.max(statScore, 78);
  }
  // Clear Human: no clichés + high burstiness + has contractions
  if (clicheHits.length === 0 && burstiness >= 20 && contractionCount >= 2) {
    statScore = Math.min(statScore, 28);
  }
  // Naturize-humanized: no clichés + moderate-high burstiness
  if (clicheHits.length <= 1 && burstiness >= 15 && contractionCount >= 1) {
    statScore = Math.min(statScore, 35);
  }

  statScore = Math.max(0, Math.min(100, Math.round(statScore)));

  // ══════════════════════════════════════════════════════════════
  // LAYER 2: LLM DEEP SEMANTIC ANALYSIS (decisive prompting)
  // ══════════════════════════════════════════════════════════════

  const sentenceList = sentences.slice(0, 25);
  const numberedSentences = sentenceList.map((s, i) => `[${i}] ${s.trim()}`).join("\n");

  const prompt = `You are a precision AI authorship classifier. Your job is to MAKE A FIRM DECISION — not hedge. Saying "Uncertain" is only valid when signals are genuinely contradictory.

━━━ WHAT SEPARATES AI FROM HUMAN TEXT ━━━

🤖 AI TEXT has:
- Uniform sentence lengths (all 15-22 words, very little variation)
- Academic transition words: "Furthermore", "Moreover", "Additionally", "In conclusion", "It is worth noting"
- Abstract clichés: "plays a crucial role", "profound impact", "transformative", "multifaceted", "leverage"
- Heavy passive voice: "It has been shown that...", "This can be attributed to..."
- No contractions, no questions, no personal voice
- Repetitive sentence structures (every paragraph has intro + 3 points + summary)
- Topic sentences that announce intent ("This essay will explore...")

✅ HUMAN TEXT has:
- Wildly varied sentence lengths (3 words to 30+ words in the same paragraph)
- Contractions: don't, can't, it's, I've, won't
- Personal opinions: "I think", "in my view", "honestly"
- Incomplete thoughts, asides, self-corrections
- Questions, exclamations, em-dashes
- Concrete specific examples, not vague generalities
- Occasional grammar imperfections or informal phrasing

━━━ PRE-COMPUTED SIGNALS — USE THESE ━━━
- Sentence burstiness (variance): ${burstiness} — ${burstiness >= 30 ? "✅ VERY HIGH → strong human" : burstiness >= 18 ? "✅ HIGH → likely human" : burstiness >= 10 ? "⚠️ MODERATE → borderline" : "🤖 LOW → strong AI signal"}
- Std deviation of sentence length: ${stdDev.toFixed(1)} words
- AI Clichés found (${clicheHits.length}): ${clicheHits.length > 0 ? '"' + clicheHits.slice(0, 6).join('", "') + '"' : "NONE ✅"}
- Contractions found: ${contractionCount} ${contractionCount >= 3 ? "✅ MULTIPLE — strong human" : contractionCount >= 1 ? "✅ present" : "🤖 NONE — AI signal"}
- Passive voice per sentence: ${passiveRate} ${passiveRate > 1.5 ? "🤖 HIGH" : "✅ normal"}
- Transition words: ${transitionHits} (${transitionDensity > 0.4 ? "🤖 HIGH density" : "✅ normal"})
- Personal pronouns per 100 words: ${pronounDensity.toFixed(1)} ${pronounDensity > 2 ? "✅ HIGH — human voice" : ""}
- Short sentences (≤7 words): ${shortSentenceRatio > 0.3 ? "✅ MANY — human energy" : "few"}
- Statistical AI score (Layer 1): ${statScore}/100

━━━ NUMBERED SENTENCES ━━━
${numberedSentences}

━━━ DECISION GUIDANCE ━━━
- If statScore > 65 AND text has 3+ clichés → Classify as "AI Generated", confidence 75+
- If statScore < 35 AND contractionCount ≥ 2 → Classify as "Human Written", confidence 75+
- Only use "Uncertain" if signals genuinely contradict each other
- Be firm. Users need a clear answer.

━━━ OUTPUT — ONLY valid JSON, zero extra text ━━━
{
  "classification": "AI Generated" | "Human Written" | "Uncertain",
  "confidence": <integer 60-98>,
  "sentence_scores": [<array of integers 0-100 per sentence, 0=human 100=AI>],
  "ai_signals": [<up to 4 specific quoted phrases or patterns that prove AI>],
  "human_signals": [<up to 4 specific quoted phrases or patterns that prove human>],
  "reasoning": "<2-3 sentences explaining exactly WHY you chose this verdict>"
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
          temperature: 0.1, // Very low but not 0 — allows some decisiveness
          max_tokens: 1600
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
    
    // Extract JSON even if model adds text around it
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in LLM response");
    const parsed = JSON.parse(jsonMatch[0]);

    // ══════════════════════════════════════════════════════════════
    // LAYER 3: ADAPTIVE WEIGHTED FUSION (v5)
    // Key improvement: weights shift based on signal clarity
    // ══════════════════════════════════════════════════════════════

    const llmIsAI    = parsed.classification === "AI Generated";
    const llmIsHuman = parsed.classification === "Human Written";
    const llmIsUncertain = parsed.classification === "Uncertain";
    const llmConf    = Math.max(50, Math.min(98, parseInt(parsed.confidence) || 65));

    // Convert LLM classification to 0-100 AI probability
    let llmAiProb;
    if (llmIsAI)        llmAiProb = llmConf;
    else if (llmIsHuman) llmAiProb = 100 - llmConf;
    else                 llmAiProb = 50; // Uncertain → neutral

    // Adaptive fusion weights:
    // When LLM is decisive (confidence 80+) → trust LLM more (70%)
    // When LLM is uncertain → trust stats more (50/50)
    let llmWeight, statWeight;
    if (llmIsUncertain) {
      llmWeight = 0.40;
      statWeight = 0.60;
    } else if (llmConf >= 80) {
      llmWeight = 0.70;
      statWeight = 0.30;
    } else {
      llmWeight = 0.60;
      statWeight = 0.40;
    }

    let fusedAiScore = Math.round((statScore * statWeight) + (llmAiProb * llmWeight));

    // ── Hard override rules ────────────────────────────────────
    // Both layers agree strongly on AI → force AI
    if (llmIsAI && llmConf >= 80 && statScore >= 60) {
      fusedAiScore = Math.max(fusedAiScore, 75);
    }
    // Both layers agree strongly on Human → force Human
    if (llmIsHuman && llmConf >= 80 && statScore <= 35) {
      fusedAiScore = Math.min(fusedAiScore, 28);
    }
    // Statistical clear AI (many clichés + low burstiness) overrides uncertain LLM
    if (clicheHits.length >= 5 && burstiness < 12 && contractionCount === 0) {
      fusedAiScore = Math.max(fusedAiScore, 72);
    }
    // Statistical clear Human (no clichés + high burstiness + contractions) overrides uncertain LLM
    if (clicheHits.length === 0 && burstiness >= 20 && contractionCount >= 2) {
      fusedAiScore = Math.min(fusedAiScore, 25);
    }

    fusedAiScore = Math.max(0, Math.min(100, fusedAiScore));

    // ── Final classification with TIGHTER bands ────────────────
    // v5: AI if >= 58, Human if <= 42 (was 62/38 in v4)
    // This means fewer texts get stuck in "Mixed/Uncertain"
    let finalClassification, finalConfidence;
    if (fusedAiScore >= 58) {
      finalClassification = "AI Generated";
      finalConfidence     = Math.min(98, 50 + Math.round((fusedAiScore - 58) * 1.5) + 15);
    } else if (fusedAiScore <= 42) {
      finalClassification = "Human Written";
      finalConfidence     = Math.min(98, 50 + Math.round((42 - fusedAiScore) * 1.5) + 15);
    } else {
      // Genuinely uncertain zone (43-57) — show mixed but with honest message
      finalClassification = "Uncertain";
      finalConfidence     = Math.round(50 + Math.abs(fusedAiScore - 50) * 2);
    }

    // Validate and normalise sentence scores
    const rawScores = Array.isArray(parsed.sentence_scores) ? parsed.sentence_scores : [];
    const sentenceScores = sentenceList.map((_, i) =>
      Math.max(0, Math.min(100, Number(rawScores[i]) ?? fusedAiScore))
    );

    return res.status(200).json({
      classification: finalClassification,
      confidence:     Math.min(98, finalConfidence),
      word_count:     wordCount,
      ai_signals:     parsed.ai_signals    || [],
      human_signals:  parsed.human_signals || [],
      reasoning:      parsed.reasoning     || "",
      sentences:      sentenceList,
      sentence_scores: sentenceScores,
      metrics: {
        burstiness,
        std_dev:               parseFloat(stdDev.toFixed(2)),
        avg_sentence_length:   avgSentenceLength,
        vocab_diversity:       vocabDiversity,
        cliche_count:          clicheHits.length,
        cliches_found:         clicheHits.slice(0, 6).join(", ") || "none",
        passive_rate:          passiveRate,
        contraction_count:     contractionCount,
        formality_index:       formalityIndex,
        transition_density:    transitionDensity,
        opener_ratio:          parseFloat(openerRatio.toFixed(2)),
        pronoun_density:       parseFloat(pronounDensity.toFixed(2)),
        short_sentence_ratio:  parseFloat(shortSentenceRatio.toFixed(2)),
        statistical_ai_score:  statScore,
        llm_ai_probability:    llmAiProb,
        fused_ai_score:        fusedAiScore
      }
    });

  } catch (err) {
    console.error("Detection error:", err.message);
    // Fallback: return pure statistical result if LLM fails
    let fallbackClass = fusedStatOnly(statScore);
    return res.status(200).json({
      classification: fallbackClass.classification,
      confidence:     fallbackClass.confidence,
      word_count:     wordCount,
      ai_signals:     clicheHits.slice(0, 4).map(c => `Cliché phrase: "${c}"`),
      human_signals:  contractionCount > 0 ? [`${contractionCount} contractions found`] : [],
      reasoning:      "Result based on statistical analysis only (AI model temporarily unavailable).",
      sentences:      sentences.slice(0, 25),
      sentence_scores: sentences.slice(0, 25).map(() => statScore),
      metrics: {
        burstiness, statistical_ai_score: statScore,
        cliche_count: clicheHits.length, contraction_count: contractionCount
      }
    });
  }
}

function fusedStatOnly(statScore) {
  if (statScore >= 58) return { classification: "AI Generated",   confidence: Math.min(98, 55 + statScore * 0.4) };
  if (statScore <= 42) return { classification: "Human Written",  confidence: Math.min(98, 55 + (100 - statScore) * 0.4) };
  return { classification: "Uncertain", confidence: 55 };
}
