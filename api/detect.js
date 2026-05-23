// /api/detect.js — Naturize AI Detector v5 (Advanced Authorship Analysis System)

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

IMPORTANT:
A comma followed by "and" is NOT evidence of AI by itself.
Example: "I finished my work, and then I left."
This pattern occurs naturally in human writing. Treat punctuation patterns only as supporting evidence.

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
Potential AI Indicators: Very low sentence variance, Very high consistency, High repetition, Low specificity, Predictable structure
Potential Human Indicators: Higher sentence variance, Specific details, Context-rich examples, Personal references, Natural stylistic irregularities

==================================================
DECISION FRAMEWORK
==================
Step 1: Calculate AI Evidence Score (0-100)
Step 2: Calculate Human Evidence Score (0-100)
Step 3: Compare both scores.

Classification Rules:
* AI: AI Evidence Score is significantly higher than Human Evidence Score.
* Human: Human Evidence Score is significantly higher than AI Evidence Score.
* Uncertain: Evidence is mixed, weak, or insufficient.

==================================================
TEXT TO ANALYZE:
"""
${sanitized.slice(0, 5000)}
"""
==================================================
OUTPUT FORMAT
=============
Return ONLY valid JSON.
{
"classification": "AI" | "Human" | "Uncertain",
"confidence": 0,
"ai_score": 0,
"human_score": 0,
"ai_signals": [""],
"human_signals": [""],
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
}`;

  try {
    const apiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": \`Bearer \${groqKey.trim()}\`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: classifyPrompt }],
        temperature: 0.1,
        max_tokens: 1500,
        response_format: { type: "json_object" }
      })
    });

    if (apiRes.ok) {
      const data = await apiRes.json();
      const raw = data?.choices?.[0]?.message?.content || "";
      try {
        let cleaned = raw.trim().replace(/^```(?:json)?\\s*/i, "").replace(/\\s*```$/, "");
        const parsed = JSON.parse(cleaned);

        // Map the new format back to the frontend's expected { score, verdict, reasons } format
        // so we don't break the UI, while still executing the requested LLM logic.
        
        let finalScore = parsed.ai_score || 0;
        let finalVerdict = "Mixed";
        if (parsed.classification === "AI") {
            finalVerdict = finalScore >= 80 ? "AI-Generated" : "Likely AI";
        } else if (parsed.classification === "Human") {
            finalVerdict = finalScore <= 20 ? "Human" : "Likely Human";
            // ensure the ai_score shown on the meter is low if it's human
            if (finalScore > 40) finalScore = Math.max(0, 100 - (parsed.human_score || 80));
        } else {
            finalVerdict = "Mixed";
            finalScore = 50;
        }

        const reasons = [
            ...((parsed.ai_signals || []).map(s => \`🔴 \${s}\`)),
            ...((parsed.human_signals || []).map(s => \`🟢 \${s}\`))
        ].filter(r => r.length > 5);

        return res.status(200).json({ 
            score: finalScore, 
            verdict: finalVerdict, 
            reasons: reasons,
            raw_analysis: parsed // Include the full parsed JSON in case the frontend wants to use it later
        });

      } catch (e) { 
        return res.status(500).json({ error: "Failed to parse AI response" });
      }
    } else {
        const errorData = await apiRes.text();
        return res.status(apiRes.status).json({ error: "Detection API error: " + errorData });
    }
  } catch (err) {
    console.error("LLM classify error:", err);
    return res.status(500).json({ error: "Internal server error during detection." });
  }
}
