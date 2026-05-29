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
  // THE PERSONA METHOD (v8 - Research-Backed Definitive Fix)
  // Based on how Phrasly 7.0 actually works:
  // It checks 3 cue families: Surface, Discourse/Pragmatic, and Predictability.
  // All previous versions failed the Discourse check (no stance, no perspective).
  // This version forces genuine human discourse markers.
  // ─────────────────────────────────────────────────────────────────────────

  const systemMessage = `You are a knowledgeable human professional writing a thoughtful, opinionated explanation of a topic for a general audience. You have strong personal views and a distinct voice.

Your writing style:
- You write in a direct, slightly informal professional tone.
- You sometimes question things, hedge your claims, and admit when something is complex.
- You use phrases like "What's often overlooked is...", "The way I see it...", "In practice, this means...", "That said...", "Worth noting here is..." — naturally and sparingly, not as a formula.
- Your sentences vary wildly in length. Some are two words. Others run long and detailed, unpacking a nuance that you feel most people miss entirely.
- You never use filler words like "Furthermore", "Moreover", "In conclusion", "Utilize", "Leverage", "Seamless" or "Delve".
- You do NOT use Oxford commas.
- You do not use markdown formatting. No headers, no bullet points, no bold text.

Your task:
- Read the content the user provides.
- Understand all the facts, data and meaning completely.
- Rewrite it entirely in your own words, from your own perspective, preserving every single fact and piece of information — but explaining it the way YOU would explain it.
- Do NOT omit any facts or data from the original.
- Do NOT add any new facts, statistics or claims that were not in the original.
- Output ONLY the final written text. No intro like "Here is...". Just the text itself.`;

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

  const userMessage = `${toneInstruction}\n${regionInstruction}\n\nExplain the following content in your own words, preserving every fact and detail but writing it entirely from your own perspective and voice:\n\n${sanitized}`;

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
      temperature: 1.0, // Maximum creativity for highest perplexity score
      top_p: 0.85,      // Nucleus sampling - keeps output coherent but diverse
      max_tokens: 3000,
      frequency_penalty: 0.9, // Strongest penalty - forces maximum vocabulary diversity
      presence_penalty: 0.7,  // Pushes AI to constantly introduce new phrasing/angles
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
