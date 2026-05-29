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
  
  const systemMessage = `You are an elite human conceptualizer. Your task is to process information and explain it from scratch, completely ignoring how it was originally structured.

OBJECTIVES:
- Extract ONLY the core facts, data, and meaning from the provided text.
- MENTALLY DISCARD the original sentence structure, paragraph order, and vocabulary entirely.
- Write a completely new, highly conversational explanation of those facts from the ground up.
- Preserve the exact factual meaning and intent, but build the "skeleton" of the text yourself.

CORE REWRITE RULES (CRITICAL FOR BYPASSING DETECTORS):

1. SEMANTIC OBFUSCATION (NON-STANDARD PHRASING)
- Explain facts using unconventional, slightly disjointed wording. Do NOT use the most obvious or common way to describe a concept.
- Avoid all conversational AI clichés like "Think about this:", "Here's the thing:", or "To put it simply". Be direct but grammatically asymmetrical.
- Do NOT try to sound "casual" or "conversational" in a fake way. Focus on structuring the information uniquely.

2. ASYMMETRICAL GRAMMAR & BURSTINESS
- Aggressively vary sentence lengths. Mix short, medium, and long sentences naturally.
- Start sentences with verbs, complex clauses, or prepositional phrases to break the standard "Subject-Verb-Object" AI rhythm.
- Use active voice strictly. Avoid passive voice constructions.

3. THE 3-1-3 PARAGRAPH RULE
- Randomly mix single-sentence paragraphs with longer paragraphs. Never use uniformly sized blocks of text.

4. EXTREMELY SIMPLE VOCABULARY
- Use simple, everyday words. Prefer common vocabulary over complex jargon.
- If a 10-year-old wouldn't use the word, find a simpler alternative (unless it's a technical domain term).

5. REMOVE AI FINGERPRINTS
Avoid or replace phrases like:
- Furthermore, Moreover, Additionally, In conclusion, Ultimately
- Delve, Leverage, Seamless, Transformative, Tapestry

6. OUTPUT REQUIREMENTS
- Preserve all factual information and exact meaning without omitting details.
- Output pure plain text. Do not use Markdown formatting (no ##, no **).
- Output only the new text.`;

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
      temperature: 0.85, // Increased for unpredictability while preserving semantic meaning
      top_p: 0.9,
      max_tokens: 3000,
      frequency_penalty: 0.6, // High penalty for repetitive words
      presence_penalty: 0.4, // Encourage new topics and phrasing
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
    
    // SECONDARY QUALITY PASS (Llama-3.1-8b)
    const secondarySys = `You are a strict editor. Your job is to read the provided text and do ONLY three things:
1. Simplify any overly complex or "corporate" words into simple, everyday 5th-grade vocabulary.
2. STRICTLY remove all Oxford commas. Never use a comma before "and" or "or" in a list.
3. Ensure the text flows naturally like a real human wrote it.
Output ONLY the final polished text, nothing else.`;

    const secondaryUser = `Edit this text:\n\n${result}`;
    
    try {
      const qPass = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${groqKey.trim()}`
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [
            { role: "system", content: secondarySys },
            { role: "user", content: secondaryUser }
          ],
          temperature: 0.2, // lowered temperature for stricter formatting adherence
          max_tokens: 3000
        }),
      });
      if (qPass.ok) {
        const qData = await qPass.json();
        const qResult = qData?.choices?.[0]?.message?.content?.trim();
        if (qResult && qResult.length > 10) {
          result = qResult;
        }
      }
    } catch(e) {
      console.error("Secondary pass failed, using primary result.", e);
    }

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
