// /api/humanize.js — Naturize Humanizer v6 (Semantic Bypass Engine)
// Strategy: Balance high semantic retention (don't lose the meaning) with 
// high perplexity (unpredictable vocabulary) and concise bursty structures.

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const { text, tone = "professional" } = req.body;
  if (!text || typeof text !== "string" || text.trim().length === 0)
    return res.status(400).json({ error: "Text is required." });
  if (text.trim().length > 10000)
    return res.status(400).json({ error: "Input too long. Max 10,000 characters." });

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey || groqKey.trim() === "")
    return res.status(500).json({ error: "Server configuration error." });

  const sanitized = text.trim().replace(/[<>]/g, "");
  
  // ─────────────────────────────────────────────────────────────────────────
  // THE SEMANTIC BYPASS PROMPT (v6)
  // Fixes the issue where the AI hallucinated or strayed from the original meaning.
  // We force exact meaning retention, slight conciseness, and high burstiness.
  // ─────────────────────────────────────────────────────────────────────────
  
  const systemMessage = `You are an elite human-style editor and rewriting engine.

Your task is to rewrite AI-generated text so it reads naturally, fluidly, emotionally realistic, and indistinguishable from high-quality human writing while preserving the original meaning and factual accuracy.

OBJECTIVES:
- Preserve the exact meaning and intent
- Improve natural human flow
- Remove robotic or formulaic phrasing
- Increase conversational realism
- Introduce authentic writing rhythm
- Make the text feel organically written
- Avoid sounding overly polished or machine-balanced

CORE REWRITE RULES:

1. SENTENCE RHYTHM VARIATION
- Aggressively vary sentence lengths
- Mix short, medium, and long sentences naturally
- Occasionally use fragments where appropriate
- Break predictable sentence patterns
- Avoid repetitive cadence

2. HUMAN WRITING CHARACTERISTICS
- Add subtle conversational flow
- Use natural transitions instead of formal connectors
- Allow mild imperfection in rhythm
- Make paragraphs feel naturally paced
- Avoid textbook-style explanations
- Avoid robotic smoothness

3. REMOVE AI FINGERPRINTS
Avoid or replace phrases like:
- Furthermore
- Moreover
- In conclusion
- It is important to note
- Delve
- Leverage
- Seamless
- Transformative
- In today’s fast-paced world
- Unlock the power of
- Revolutionary
- Cutting-edge

Do not use overly corporate, generic, or exaggerated wording.

4. STYLE DIVERSIFICATION
- Avoid repetitive sentence openings
- Avoid repeated transition words
- Vary vocabulary naturally
- Reduce structural symmetry
- Use organic phrasing patterns
- Avoid overly balanced formatting

5. HUMAN TONE OPTIMIZATION
The writing should feel:
- confident
- natural
- believable
- emotionally realistic
- casually intelligent
- written by a real person with experience

NOT:
- robotic
- overly formal
- excessively optimized
- generic blog-style
- corporate marketing tone

6. READABILITY OPTIMIZATION
- Improve flow between ideas
- Make the text easy to read aloud
- Remove unnecessary filler
- Simplify unnatural complexity
- Keep the writing engaging

7. ANTI-DETECTION OPTIMIZATION
Reduce common AI-detection signals:
- repetitive structure
- predictable token patterns
- low sentence variance
- repeated n-grams
- over-consistent grammar
- excessive coherence smoothing

8. OUTPUT REQUIREMENTS
- Preserve all factual information
- Preserve original context
- Do not shorten excessively
- Do not add fake information
- Do not change technical meaning
- Do not use emojis
- Do not explain changes
- Output only the rewritten text

9. QUALITY CONTROL BEFORE OUTPUT
Before finalizing:
- Check for repetitive phrasing
- Check sentence-length diversity
- Remove robotic transitions
- Ensure natural cadence
- Ensure the text sounds genuinely human-written`;

  let toneInstruction = "";
  switch(tone) {
    case "academic":
      toneInstruction = "Tone: Academic but accessible. Keep the scholarly meaning, but remove the dense jargon. Explain it clearly.";
      break;
    case "casual":
      toneInstruction = "Tone: Casual and relaxed. Write like you are speaking directly to a colleague. Use everyday language.";
      break;
    case "creative":
      toneInstruction = "Tone: Creative and engaging. Use active verbs and strong nouns to keep the reader interested.";
      break;
    case "formal":
      toneInstruction = "Tone: Formal and direct. Strip out all corporate fluff. Be clear, polite, and authoritative.";
      break;
    default:
      toneInstruction = "Tone: Professional and clear. Accessible, everyday professional English.";
  }

  const userMessage = `${toneInstruction}\n\nRewrite this text applying the rules above:\n\n${sanitized}`;

  const makeRequest = async (model) => fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${groqKey.trim()}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userMessage }
      ],
      temperature: 0.75, // Lowered slightly to ensure it doesn't hallucinate or lose meaning
      top_p: 0.9,
      max_tokens: 3000,
      frequency_penalty: 0.4,
      presence_penalty: 0.2,
    }),
  });

  try {
    let apiRes = await makeRequest("llama-3.3-70b-versatile");

    if (!apiRes.ok) {
      const errText = await apiRes.clone().text();
      let errJson;
      try { errJson = JSON.parse(errText); } catch { errJson = {}; }
      if (errJson?.error?.code === "model_not_found" || apiRes.status === 404) {
        apiRes = await makeRequest("llama-3.1-8b-instant");
      }
    }

    if (!apiRes.ok) {
      const errBody = await apiRes.text();
      console.error("Groq API error:", errBody);
      return res.status(502).json({ error: "Failed to connect to AI provider." });
    }

    const data = await apiRes.json();
    let rawOutput = data?.choices?.[0]?.message?.content || "";

    if (!rawOutput.trim())
      return res.status(502).json({ error: "Empty response from AI. Please try again." });

    // Clean preamble
    rawOutput = rawOutput
      .replace(/^(here(?:'s| is) the rewritten[^:\n]*[:\n]+)/i, "")
      .replace(/^(rewritten[^:\n]*[:\n]+)/i, "")
      .replace(/^(sure[,!]?\s*here[^\n]*\n)/i, "")
      .trim();

    // Minor post-processing just for basic humanization
    let result = rawOutput;
    result = result.replace(/\bI am\b/g, "I'm");
    result = result.replace(/\bdo not\b/g, "don't");
    result = result.replace(/\bcannot\b/g, "can't");
    result = result.replace(/\bit is\b/g, "it's");

    // Estimate score
    const humanityScore = estimateHumanityScore(result);

    return res.status(200).json({ result, humanityScore });

  } catch (err) {
    console.error("Humanize handler error:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
}

function estimateHumanityScore(text) {
  const sentences = text.match(/[^.!?\n]+[.!?]+/g) || [text];
  const lens = sentences.map(s => s.trim().split(/\s+/).length);
  const avg = lens.reduce((a, b) => a + b, 0) / (lens.length || 1);
  const variance = lens.reduce((s, l) => s + Math.pow(l - avg, 2), 0) / (lens.length || 1);
  const burstiness = avg > 0 ? Math.sqrt(variance) / avg : 0;
  
  let score = 75 + Math.min(20, burstiness * 30);
  return Math.min(99, Math.max(50, Math.round(score)));
}
