// /api/detect.js — Naturize AI Detector v3 (High-Precision)

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
    return res.status(500).json({ error: "Server configuration error." });

  const input = text.trim().replace(/[<>]/g, "").slice(0, 5000);

  // ─── STEP 1: FAST STATISTICAL PRE-ANALYSIS ───────────────────────────────
  const words = input.split(/\s+/);
  const sentences = input.split(/[.!?]+/).filter(s => s.trim().length > 3);
  const wordCount = words.length;
  const sentenceCount = sentences.length;
  const avgSentenceLength = sentenceCount > 0 ? (wordCount / sentenceCount).toFixed(1) : 0;

  // Burstiness (variance of sentence lengths — humans have HIGH variance)
  const sentLengths = sentences.map(s => s.trim().split(/\s+/).length);
  const mean = sentLengths.reduce((a, b) => a + b, 0) / (sentLengths.length || 1);
  const variance = sentLengths.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (sentLengths.length || 1);
  const burstiness = parseFloat(variance.toFixed(2));

  // Vocabulary diversity (unique word ratio — AI tends to be lower for short texts, higher uniformly)
  const uniqueWords = new Set(words.map(w => w.toLowerCase().replace(/[^a-z]/g, '')));
  const vocabDiversity = parseFloat((uniqueWords.size / (wordCount || 1)).toFixed(3));

  // AI cliché word detection — these words appear HEAVILY in AI but rarely in natural human writing
  const aiCliches = [
    "delve", "tapestry", "nuanced", "pivotal", "moreover", "furthermore",
    "in conclusion", "it is important to note", "it is worth noting",
    "in today's world", "in the realm of", "leverage", "underscore",
    "multifaceted", "comprehensive", "notably", "shed light", "when it comes to",
    "in summary", "plays a crucial role", "plays a vital role", "as a result",
    "in addition", "on the other hand", "first and foremost", "last but not least",
    "in essence", "to summarize", "at the end of the day", "needless to say",
    "it goes without saying", "as mentioned earlier", "this article will",
    "this essay will", "by and large", "in terms of", "with that said",
    "having said that", "in this regard", "it should be noted", "as we can see",
    "as discussed", "this highlights", "this demonstrates", "this suggests",
    "various aspects", "key aspects", "key elements", "key factors",
    "a wide range", "a variety of", "diverse range", "wide array"
  ];
  const inputLower = input.toLowerCase();
  const clicheHits = aiCliches.filter(c => inputLower.includes(c));
  const clicheScore = Math.min(100, clicheHits.length * 12);

  // Transition phrase density
  const transitions = ["however", "therefore", "thus", "hence", "consequently",
    "nevertheless", "nonetheless", "accordingly", "subsequently", "alternatively",
    "in contrast", "on the contrary", "for example", "for instance",
    "in particular", "specifically", "in fact", "indeed", "ultimately"];
  const transitionHits = transitions.filter(t => inputLower.includes(t)).length;
  const transitionDensity = parseFloat((transitionHits / (sentenceCount || 1)).toFixed(3));

  // Uniform paragraph structure detector (AI loves: intro → 3 body → conclusion)
  const paragraphs = input.split(/\n\n+/).filter(p => p.trim().length > 20);
  const paragraphCount = paragraphs.length;

  // Pre-score hints for the LLM
  const statAiHints = [];
  const statHumanHints = [];

  if (clicheHits.length >= 4) statAiHints.push(`Contains ${clicheHits.length} AI cliché phrases: "${clicheHits.slice(0,3).join('", "')}"`);
  else if (clicheHits.length === 0) statHumanHints.push("No AI cliché phrases detected");

  if (transitionDensity > 0.3) statAiHints.push(`High transition phrase density (${transitionDensity} per sentence)`);
  if (burstiness < 8 && sentenceCount > 5) statAiHints.push(`Very low sentence-length variance (burstiness=${burstiness}) — characteristic of AI`);
  else if (burstiness > 25) statHumanHints.push(`High sentence-length variance (burstiness=${burstiness}) — human writing pattern`);

  if (avgSentenceLength > 20) statAiHints.push(`Long average sentence length (${avgSentenceLength} words) — typical of AI`);
  if (wordCount < 80) statHumanHints.push("Short text — insufficient for high-confidence AI detection");

  // ─── STEP 2: LLM DEEP ANALYSIS ───────────────────────────────────────────
  const prompt = `You are a forensic AI-text detection expert trained on millions of samples from ChatGPT, Gemini, Claude, and human writers. You must ACCURATELY classify whether the text below was written by an AI or a human.

## STATISTICAL PRE-ANALYSIS (computed externally — treat as objective facts):
- Word count: ${wordCount}
- Sentence count: ${sentenceCount}
- Average sentence length: ${avgSentenceLength} words
- Sentence burstiness (variance): ${burstiness} ${burstiness < 8 ? "(LOW = AI-like)" : burstiness > 25 ? "(HIGH = Human-like)" : "(MODERATE)"}
- Vocabulary diversity ratio: ${vocabDiversity}
- AI cliché phrases detected: ${clicheHits.length} → [${clicheHits.slice(0,5).join(", ")}]
- Transition phrase density: ${transitionDensity} per sentence ${transitionDensity > 0.3 ? "(HIGH = AI-like)" : ""}
- Paragraph count: ${paragraphCount}
${statAiHints.length ? `- Statistical AI indicators: ${statAiHints.join("; ")}` : ""}
${statHumanHints.length ? `- Statistical human indicators: ${statHumanHints.join("; ")}` : ""}

## STRONG AI WRITING INDICATORS — score heavily if present:
1. Uses "delve", "tapestry", "nuanced", "pivotal", "furthermore", "moreover", "underscore", "leverage", "multifaceted", "shed light", "realm of"
2. Formulaic structure: Introduction → numbered points or body paragraphs → conclusion
3. Overly polished, zero grammar mistakes, no contractions, no informal language
4. Every paragraph is roughly the same length (robotic uniformity)
5. Passive voice overuse, excessive hedging ("it is important to note")
6. Claims "comprehensive" coverage without specific personal knowledge
7. Transitions feel mechanical: "Furthermore", "In addition", "On the other hand"
8. No first-person opinions, no emotional language, no colloquialisms
9. Uses em-dashes and commas in a characteristic AI pattern
10. Ends with a generic "conclusion" or "summary" paragraph

## STRONG HUMAN WRITING INDICATORS — score heavily if present:
1. Specific personal anecdotes, emotions, or opinions ("I think", "honestly", "tbh")
2. Informal contractions: don't, I've, it's, we're
3. Irregular or imperfect grammar, run-on sentences, sentence fragments
4. Natural topic drift — humans don't stay perfectly on-topic
5. Cultural references, humor, sarcasm, slang
6. High sentence length variance — very short and very long mixed together
7. References to specific real people, places, dates, prices
8. Typos, corrections, self-interruptions

## IMPORTANT CALIBRATION RULES:
- ChatGPT/Gemini text will almost ALWAYS have cliché AI phrases, uniform structure, and zero informal language → classify as AI with HIGH confidence (80-95+)
- If the text is purely factual with no personality, no errors, and perfect structure → strong AI signal
- Do NOT classify as "Uncertain" just to be safe. Make a DECISIVE call based on evidence weight.
- If AI signals clearly outweigh human signals → classify as "AI" (not "Uncertain")
- Only use "Uncertain" when evidence is genuinely balanced with roughly equal weight on both sides
- Short texts under 80 words may warrant "Uncertain" due to insufficient data

## TEXT TO ANALYZE:
"""
${input}
"""

Return ONLY valid JSON, no markdown, no explanation:
{
  "classification": "AI" | "Human" | "Uncertain",
  "confidence": <integer 0-100>,
  "ai_score": <integer 0-100>,
  "human_score": <integer 0-100>,
  "ai_signals": [<up to 5 specific evidence strings>],
  "human_signals": [<up to 5 specific evidence strings>],
  "metrics_analysis": {
    "word_count": ${wordCount},
    "sentence_count": ${sentenceCount},
    "avg_sentence_length": "${avgSentenceLength} words",
    "burstiness_variance": ${burstiness},
    "vocabulary_diversity": ${vocabDiversity},
    "ai_cliche_phrases": ${clicheHits.length},
    "transition_density": ${transitionDensity}
  },
  "reasoning": "<2-3 sentence decisive explanation of the verdict>"
}`;

  try {
    const apiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${groqKey.trim()}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        max_tokens: 900,
        response_format: { type: "json_object" }
      })
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error("Groq API error:", errText);
      throw new Error("API error");
    }

    const data = await apiRes.json();
    const raw = data?.choices?.[0]?.message?.content || "";
    let cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(cleaned);

    // Sanity-check: if stats strongly indicate AI but LLM said uncertain, override
    if (parsed.classification === "Uncertain" && clicheHits.length >= 5 && burstiness < 10) {
      parsed.classification = "AI";
      parsed.ai_score = Math.max(parsed.ai_score, 75);
      parsed.confidence = Math.max(parsed.confidence, 75);
      parsed.reasoning = `Statistical analysis detected ${clicheHits.length} AI cliché phrases and very low sentence variance (${burstiness}), strongly indicating AI authorship. ` + parsed.reasoning;
    }

    // Ensure scores are integers
    parsed.ai_score = Math.round(parsed.ai_score || 0);
    parsed.human_score = Math.round(parsed.human_score || 0);
    parsed.confidence = Math.round(parsed.confidence || 50);

    return res.status(200).json(parsed);

  } catch (err) {
    console.error("Detect error:", err);
    return res.status(500).json({ error: "Failed to analyze text. Please try again." });
  }
}
