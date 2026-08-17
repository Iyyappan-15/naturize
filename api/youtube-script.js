// /api/youtube-script.js — Naturize YouTube Script Humanizer
// Rewrites AI-generated scripts to sound natural when spoken aloud.

import checkRateLimit from '../utils/rateLimit.js';

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  // Stricter rate limit for social tools (5 req/min) due to longer token usage
  const rateLimit = checkRateLimit(req, 5, 60000);
  if (!rateLimit.success) {
    return res.status(429).json({ error: "Too many requests. Please wait a minute before trying again." });
  }

  const { script, style = "casual-vlog" } = req.body;
  if (!script || typeof script !== "string" || script.trim().length === 0)
    return res.status(400).json({ error: "Script content is required." });
  if (script.trim().length > 6000)
    return res.status(400).json({ error: "Script too long. Max 6,000 characters." });

  const groqKey = process.env.GROQ_API_KEY_SOCIAL;
  if (!groqKey || groqKey.trim() === "")
    return res.status(500).json({ error: "Server configuration error. GROQ_API_KEY_SOCIAL is missing." });

  const sanitized = script.trim().replace(/[<>]/g, "");

  // Style-specific instructions
  let styleInstruction = "";
  switch (style) {
    case "casual-vlog":
      styleInstruction = `Write in a very conversational, friendly tone. Use "you" and "I" frequently. It should feel like talking to a friend over coffee. Use contractions (I'm, you'll, we've). It is okay to start sentences with "And" or "But". Keep the pacing snappy.`;
      break;
    case "educational-explainer":
      styleInstruction = `Write like a friendly teacher explaining a concept clearly. Break down complex ideas into simple, digestible pieces. Use analogies if helpful. Be engaging but clear. Avoid academic jargon.`;
      break;
    case "pro-documentary":
      styleInstruction = `Write in an authoritative, narrative voice, like a high-quality video essay or nature documentary. The tone is serious but captivating. Use descriptive language to paint a picture. Pacing should be steady and deliberate.`;
      break;
    default:
      styleInstruction = `Write in a natural, conversational tone suitable for a YouTube video.`;
  }

  const systemMessage = `You are a professional YouTube scriptwriter and vocal coach. Your job is to take AI-generated text and rewrite it so it sounds completely natural when SPOKEN ALOUD by a human on camera.

YOUR GOAL: Rewrite the script to eliminate robotic phrasing and improve the spoken flow.

RULES FOR SPOKEN WORD:
1. STYLE: ${styleInstruction}
2. SHORT SENTENCES: People need to breathe. Break long, complex sentences into shorter ones. No sentence should take more than one breath to say.
3. ELIMINATE FILLER/AI WORDS: Never use: "In today's video", "It is important to note", "Furthermore", "Moreover", "In conclusion", "Delve into", "Tapestry", "Crucial", "Paramount". Instead use natural transitions like "So...", "Now...", "But here's the thing...", "Think about it like this...".
4. PACING MARKERS: Insert natural pause markers where the speaker should take a breath or emphasize a point. Use an em dash "—" for a short pause, or insert the tag "[pause]" for a dramatic beat. Do NOT overuse these.
5. NO ACADEMIC STRUCTURE: Do not write like an essay. Speak like a human.

OUTPUT FORMAT: Plain text only. No markdown formatting. No headers. No bullet points. Just the script text, ready to be read from a teleprompter.`;

  try {
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-4-scout-17b-16e-instruct",
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: `Rewrite this YouTube script so it sounds natural when spoken:\n\n${sanitized}` }
        ],
        temperature: 0.75,
        max_tokens: 1500, // Higher max tokens for scripts
      }),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error("Groq API error:", errText);
      return res.status(502).json({ error: "AI service temporarily unavailable. Please try again." });
    }

    const groqData = await groqRes.json();
    const result = groqData.choices?.[0]?.message?.content?.trim();

    if (!result) {
      return res.status(500).json({ error: "No output generated. Please try again." });
    }

    return res.status(200).json({ result });

  } catch (err) {
    console.error("YouTube Script API handler error:", err);
    return res.status(500).json({ error: "Internal server error. Please try again." });
  }
}
