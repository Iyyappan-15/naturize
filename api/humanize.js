// /api/humanize.js — Naturize Humanizer v5 (Deep Bypass Engine)
// Strategy: Bypassing advanced detectors (Phrasly, Originality, Turnitin) requires
// manipulating Token Perplexity and Reading Level, NOT just adding slang.
// We force an 8th-9th grade reading level, high burstiness, and active voice.

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
  // THE DEEP BYPASS PROMPT
  // AI detectors (like Phrasly) flag high-school/college level text with perfect grammar.
  // The secret to bypassing them is targeting a lower reading level (8th grade),
  // forcing active voice, and explicitly banning predictable n-grams.
  // ─────────────────────────────────────────────────────────────────────────
  
  const systemMessage = `You are an expert human editor. Your job is to completely rewrite the provided text so it bypasses all AI detectors (like Turnitin, Originality.ai, and Phrasly) scoring 100% human. 

To achieve this, you MUST follow these forensic rules:
1. READING LEVEL: Write at an 8th-to-9th grade reading level. Do not use complex, multi-clause sentences.
2. PERPLEXITY: Avoid standard AI vocabulary. Do NOT use words like: furthermore, moreover, crucial, vital, delve, multifaceted, dynamic, testament, tapestry, landscape, resonate, navigate, leverage, utilize, seamless, foster.
3. BURSTINESS: Strictly alternate between very short sentences (4-6 words) and medium sentences (10-15 words). Never write three sentences of the same length in a row.
4. SYNTAX: Use active voice only. Avoid passive voice completely.
5. IMPERFECTIONS: Real humans don't write perfectly. Start a few sentences with "And", "But", or "Because". Use contractions heavily (don't, it's, they're).
6. TONE: Avoid overly dramatic colloquialisms (do not use "honestly", "look", "let's be real"). Just write simple, clear, direct human text.
7. Output ONLY the final rewritten text. No introductions, no explanations.`;

  let toneInstruction = "";
  switch(tone) {
    case "academic":
      toneInstruction = "Maintain an academic focus, but simplify the language dramatically. Write as if explaining a concept clearly to a smart high school student. Avoid academic jargon.";
      break;
    case "casual":
      toneInstruction = "Make it sound like a direct, casual email to a colleague. Very natural, simple words.";
      break;
    case "creative":
      toneInstruction = "Tell it like a story. Use concrete, visual nouns. Short, punchy pacing.";
      break;
    case "formal":
      toneInstruction = "Keep it professional and polite, but completely strip out corporate jargon and buzzwords. Use plain, simple English.";
      break;
    default:
      toneInstruction = "Keep it professional but highly accessible. Clear, plain English.";
  }

  const userMessage = `${toneInstruction}\n\nRewrite this text completely applying the bypass rules:\n\n${sanitized}`;

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
      temperature: 0.85, 
      top_p: 0.9,
      max_tokens: 3000,
      frequency_penalty: 0.3,
      presence_penalty: 0.3,
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
