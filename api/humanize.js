// /api/humanize.js — Naturize Humanizer v6 (Semantic Bypass Engine)
// Strategy: Balance high semantic retention (don't lose the meaning) with 
// high perplexity (unpredictable vocabulary) and concise bursty structures.

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const { text, tone = "professional", region = "US" } = req.body;
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
  
  const systemMessage = `You are a human writer with a highly unpredictable but deeply professional writing style. Your task is to rewrite the provided text so that it completely bypasses AI detectors like Turnitin, GPTZero, and Phrasly 7.0.

To do this, you MUST break the statistical predictability of an LLM.

CRITICAL RULES (NON-NEGOTIABLE):

1. ABSOLUTE MEANING RETENTION
- You must preserve the EXACT meaning, facts, and intent of the original text. Do not omit data. Do not add hallucinated data.
- Re-conceptualize the flow of the facts without changing the facts themselves.

2. SYNTACTIC ASYMMETRY (BURSTINESS)
- Never use standard "Subject-Verb-Object" sentence structures repeatedly.
- Start sentences with dependent clauses, prepositional phrases, or single adverbs.
- Mix extremely long, complex sentences with very short 2-3 word sentences.

3. HIGH PERPLEXITY VOCABULARY
- Do not use the most obvious or statistically probable word. Replace generic verbs (utilize, ensure, provide) and nouns with highly specific, less common alternatives, while maintaining a 5th-grade reading level.
- STRICTLY remove all Oxford commas. Never use a comma before "and" or "or" in a list.

4. THE "UNPOLISHED" ILLUSION
- Humans write with slight structural imperfections and non-linear logic.
- Avoid standard AI transition words completely (Furthermore, Moreover, Additionally, In conclusion, Ultimately).
- Do not use typical AI clichés (Delve, Leverage, Seamless, Transformative, Tapestry).

5. OUTPUT REQUIREMENTS
- Output ONLY the final text. No preamble, no "Here is the text". Do NOT use markdown.`;

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

  let regionInstruction = "";
  switch(region) {
    case "UK":
      regionInstruction = "Region: Use British English spelling (e.g., colour, organise) and phrasing.";
      break;
    case "AU":
      regionInstruction = "Region: Use Australian English spelling and phrasing.";
      break;
    case "CA":
      regionInstruction = "Region: Use Canadian English spelling and phrasing.";
      break;
    case "IN":
      regionInstruction = "Region: Use Indian English phrasing and conventions.";
      break;
    default:
      regionInstruction = "Region: Use American English spelling and phrasing.";
  }

  const userMessage = `${toneInstruction}\n${regionInstruction}\n\nRead the following text, extract its facts, entirely discard its structure, and build a new human explanation from scratch applying all rules above:\n\n${sanitized}`;

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
      temperature: 0.95, // Maximum creativity/unpredictability before hallucination
      top_p: 0.8, // Nucleus sampling constraint
      max_tokens: 3000,
      frequency_penalty: 0.8, // Aggressively high penalty to prevent repeating words
      presence_penalty: 0.6, // Forces shifting sentence structures and topics
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

    // Draconian Preamble Cleanup
    rawOutput = rawOutput
      .replace(/^(here(?:'s| is)[^\n:]*:\s*)/i, "")
      .replace(/^(sure[,!]?\s*here[^\n:]*:\s*)/i, "")
      .replace(/^(below is[^\n:]*:\s*)/i, "")
      .replace(/^(here are[^\n:]*:\s*)/i, "")
      .replace(/^(rewritten[^:\n]*[:\n]+)/i, "")
      .trim();

    // Minor post-processing just for basic humanization
    let result = rawOutput;
    result = result.replace(/\bI am\b/g, "I'm");
    result = result.replace(/\bdo not\b/g, "don't");
    result = result.replace(/\bcannot\b/g, "can't");
    result = result.replace(/\bit is\b/g, "it's");
    

    // STRICT REGEX COMMA CLEANUP (Runs AFTER secondary pass to guarantee removal)
    // Remove comma before 'and'
    result = result.replace(/,\s+and\b/gi, " and");
    // Remove comma after 'and'
    result = result.replace(/\band\s+,/gi, "and ");
    // Remove comma before 'or'
    result = result.replace(/,\s+or\b/gi, " or");
    // Remove comma after 'or'
    result = result.replace(/\bor\s+,/gi, "or ");

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
