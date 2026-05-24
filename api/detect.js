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
  const words = input.split(/\s+/).filter(w => w.trim().length > 0);
  const wordCount = words.length;

  if (wordCount < 50) {
    return res.status(400).json({
      error: true,
      message: "Please enter at least 50 words for accurate AI detection analysis.",
      word_count: wordCount
    });
  }

  const sentences = input.split(/[.!?]+/).filter(s => s.trim().length > 3);
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
  const prompt = `You are an Advanced Authorship Analysis Engine.

Your task is to determine whether the submitted text is more likely:
* AI Generated
* Human Written
* Uncertain

IMPORTANT PRINCIPLES
* Make a confident, decisive assessment based on the available evidence.
* Do not default to "Uncertain" just to play it safe.
* Evaluate both AI evidence and Human evidence objectively.
* Consider all signals together, giving highest weight to structural patterns, generic phrasing, and variance.
* Never assume AI just because the text is grammatically correct.
* Never assume Human just because the text contains minor typos.

---

## AI AUTHORSHIP ANALYSIS
Analyze for:
* Generic explanations
* Predictable wording
* Formulaic sentence patterns
* Repetitive transitions
* Repetitive vocabulary
* Excessive consistency
* Uniform tone
* Overly structured paragraphs
* Lack of specificity
* Lack of personal context
* Generic examples
* Excessive optimization
* Repeated explanatory style

Strong AI Evidence:
* Multiple generic paragraphs
* Consistent predictable flow
* No personal context
* No unique observations
* Repetitive structural patterns

Moderate AI Evidence:
* Generic wording
* High consistency
* Low specificity

Weak AI Evidence:
* Good grammar
* Formal writing style
* Professional tone

Weak AI evidence alone should never determine classification.

---

## HUMAN AUTHORSHIP ANALYSIS
Actively search for evidence of genuine human writing.

Strong Human Evidence:
* Personal experiences
* First-hand observations
* Unique opinions
* Personal anecdotes
* Context-specific details
* Real-world examples
* Self-corrections
* Personal reflections
* Specific situations

Moderate Human Evidence:
* Named entities
* Dates and timelines
* Emotional variation
* Natural sentence variation
* Informal language
* Personal preferences

Weak Human Evidence:
* Minor grammar inconsistencies
* Casual punctuation
* Conversational phrases

Weak Human evidence alone should never determine classification.

---

## PUNCTUATION ANALYSIS
Analyze punctuation patterns only as supporting evidence.
Examples:
* Comma usage
* Dash usage
* Parentheses
* List formatting

IMPORTANT:
A comma followed by "and" is NOT evidence of AI or Human authorship by itself.
Do not classify based on punctuation patterns alone.

---

## TEXT METRICS ANALYSIS
Evaluate the following text metrics as supporting evidence only (metrics must not override stronger contextual evidence):
- Word Count: ${wordCount}
- Sentence Count: ${sentenceCount}
- Average Sentence Length: ${avgSentenceLength}
- Sentence Length Variance (Burstiness): ${burstiness}
- Vocabulary Diversity: ${vocabDiversity}
- AI Cliché Phrases Detected: ${clicheHits.length} (${clicheHits.join(', ')})
- Transition Density: ${transitionDensity}

---

## MIXED CONTENT ANALYSIS
Some texts may contain characteristics of both AI and Human writing.
Examples:
* Human-edited AI text
* AI-generated text with personal additions
* Humanized AI text

When analyzing mixed content, weigh the evidence carefully. If AI structural patterns, clichés, and low variance are present throughout the core of the text, the underlying source is likely AI.

---

## DECISION FRAMEWORK
Analyze:
1. AI Evidence
2. Human Evidence
3. Text Metrics
4. Contextual Signals

CRITICAL ACCURACY RULES:
* Make a DECISIVE classification. Do not default to "Uncertain" just to play it safe.
* If the text contains known AI clichés (e.g., "delve", "tapestry", "crucial role") and lacks genuine personal anecdotes, it MUST be classified as "AI Generated".
* If AI signals clearly outweigh Human signals, classify as "AI Generated" with high confidence.
* If Human signals clearly outweigh AI signals, classify as "Human Written" with high confidence.
* Only use "Uncertain" if the text is completely ambiguous or lacks any identifiable signals.

Determine which evidence is stronger overall.

Possible Classifications:
* AI Generated
* Human Written
* Uncertain

---

## OUTPUT FORMAT
Return ONLY valid JSON.
{
"classification": "AI Generated" | "Human Written" | "Uncertain",
"confidence": <integer 0-100>,
"word_count": ${wordCount},
"ai_signals": [<list of strings>],
"human_signals": [<list of strings>],
"reasoning": "<string explanation>"
}

## TEXT TO ANALYZE:
"""
${input}
"""`;

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

    parsed.confidence = Math.round(parsed.confidence || 50);

    return res.status(200).json(parsed);

  } catch (err) {
    console.error("Detect error:", err);
    return res.status(500).json({ error: "Failed to analyze text. Please try again." });
  }
}
