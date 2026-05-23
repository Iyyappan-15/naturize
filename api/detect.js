// /api/detect.js — Naturize AI Detector (Advanced Authorship Analysis System)

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

  const classifyPrompt = `You are an Advanced Authorship Analysis System.

Your task is to determine whether the provided text is more likely:
* AI-generated
* Human-written
* Uncertain

IMPORTANT RULES:
* Evaluate both AI evidence and Human evidence equally.
* Never classify based on a single feature.
* Never assume AI because the writing is grammatically correct.
* Never assume Human because the writing contains mistakes.
* Consider all evidence together.
* Be conservative when confidence is low.
* If the text contains insufficient evidence, return "Uncertain".
* If the text is under 100 words, reduce confidence accordingly.

==================================================
AI AUTHORSHIP INDICATORS
========================

Analyze for:

1. Repetition Patterns
* Repeated sentence structures
* Repeated transitions
* Repeated vocabulary

2. Predictability
* Highly predictable wording
* Formulaic phrasing
* Common AI-style expressions

3. Structural Consistency
* Uniform sentence lengths
* Excessively consistent grammar
* Overly organized structure

4. Generic Content
* Generic explanations
* Generic examples
* Broad statements without specifics

5. Excessive Optimization
* Over-polished writing
* Excessive clarity
* Consistent tone throughout
* Mechanically structured paragraphs

6. AI Writing Patterns
* Frequent transition phrases
* Repetitive explanatory style
* Balanced but generic arguments
* Lack of genuine personal context

==================================================
HUMAN AUTHORSHIP INDICATORS
===========================

Actively search for evidence that the text may be human-written.

Strong Human Signals:
* Personal experiences
* First-hand observations
* Unique opinions
* Context-specific details
* References to real events
* Personal anecdotes
* Self-corrections
* Natural topic shifts
* Uneven sentence lengths
* Emotional variation
* Creative or unexpected phrasing

Moderate Human Signals:
* Mixed writing styles
* Natural repetition
* Informal language
* Personal preferences
* Incomplete thoughts

Weak Human Signals:
* Minor grammar inconsistencies
* Casual punctuation
* Small spelling mistakes

IMPORTANT:
Human signals must be considered equally with AI signals.

==================================================
PUNCTUATION ANALYSIS
====================

Analyze:
* Comma usage
* Dash usage
* Parentheses usage
* List formatting
* Repeated punctuation patterns

==================================================
TEXT METRICS EVALUATION
=======================

Analyze:
* Word Count
* Sentence Count
* Average Sentence Length
* Sentence Length Variance
* Vocabulary Diversity
* Unique Word Ratio
* Repetition Score
* Readability Score
* Personal Pronoun Frequency
* Specific Entity Frequency
* Transition Phrase Frequency

Metric Interpretation:

Potential AI Indicators:
* Very low sentence variance
* Very high consistency
* High repetition
* Low specificity
* Predictable structure

Potential Human Indicators:
* Higher sentence variance
* Specific details
* Context-rich examples
* Personal references
* Natural stylistic irregularities

==================================================
DECISION FRAMEWORK
==================

Step 1:
Calculate AI Evidence Score (0-100)

Step 2:
Calculate Human Evidence Score (0-100)

Step 3:
Compare both scores.

Classification Rules:
* AI:
  AI Evidence Score is significantly higher than Human Evidence Score.
* Human:
  Human Evidence Score is significantly higher than AI Evidence Score.
* Uncertain:
  Evidence is mixed, weak, or insufficient.

==================================================
OUTPUT FORMAT
=============

Return ONLY valid JSON.

{
"classification": "AI" | "Human" | "Uncertain",
"confidence": 0,
"ai_score": 0,
"human_score": 0,
"ai_signals": [
""
],
"human_signals": [
""
],
"metrics_analysis": {
"word_count": 0,
"sentence_count": 0,
"average_sentence_length": 0,
"sentence_variance": 0,
"vocabulary_diversity": 0,
"repetition_score": 0,
"readability_score": 0
},
"reasoning": ""
}

TEXT TO ANALYZE:
"""
${sanitized.slice(0, 5000)}
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
        messages: [{ role: "user", content: classifyPrompt }],
        temperature: 0.1,
        max_tokens: 1024,
        response_format: { type: "json_object" }
      })
    });

    if (!apiRes.ok) {
      throw new Error("API responded with an error");
    }

    const data = await apiRes.json();
    const raw = data?.choices?.[0]?.message?.content || "";
    
    let cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(cleaned);

    return res.status(200).json(parsed);

  } catch (err) {
    console.error("LLM classify error:", err);
    return res.status(500).json({ error: "Failed to analyze text." });
  }
}
