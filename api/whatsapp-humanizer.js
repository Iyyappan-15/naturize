import checkRateLimit from '../utils/rateLimit.js';

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  // Rate Limiting (15 requests per minute per IP)
  const rateLimit = checkRateLimit(req, 15, 60000);
  if (!rateLimit.success) {
    return res.status(429).json({ error: "Too many requests. Please try again in a minute." });
  }

  const { text, vibe = "Casual & Friendly", emojis = true, slang = false } = req.body;
  if (!text || typeof text !== "string" || text.trim().length === 0)
    return res.status(400).json({ error: "Message text is required." });

  if (text.trim().length > 2000)
    return res.status(400).json({ error: "Message too long. Keep it under 2,000 characters." });

  const groqKey = process.env.GROQ_API_KEY_SOCIAL || process.env.GROQ_API_KEY;
  if (!groqKey || groqKey.trim() === "")
    return res.status(500).json({ error: "Server configuration error." });

  const sanitized = text.trim().replace(/[<>]/g, "");

  let vibeInstruction = "";
  if (vibe === "Professional") {
    vibeInstruction = "Keep it polite and professional, suitable for a boss, colleague, or client, but still natural for a WhatsApp chat (not an email).";
  } else if (vibe === "Casual & Friendly") {
    vibeInstruction = "Keep it very casual, warm, and friendly. Talk like you're texting a good friend. Use short sentences.";
  } else if (vibe === "Family") {
    vibeInstruction = "Keep it loving, casual, and respectful, suitable for family members like parents or siblings.";
  }

  const emojiInstruction = emojis ? "Use a few relevant emojis naturally, but don't overdo it." : "Do NOT use any emojis.";
  const slangInstruction = slang ? "Use common texting abbreviations (e.g., tbh, rn, omg) and casual slang where appropriate." : "Write in proper, readable words. Do not use extreme slang, but keep the tone natural.";

  const systemMessage = `You are an expert at writing natural, authentic WhatsApp messages. Your goal is to take a stiff, formal, or AI-sounding message and rewrite it so it sounds like a real person typed it on their phone.

YOUR GOAL: Rewrite the given message for WhatsApp.

RULES:
1. VIBE: ${vibeInstruction}
2. EMOJIS: ${emojiInstruction}
3. SLANG: ${slangInstruction}
4. FORMATTING: WhatsApp messages are usually sent in short bursts. Feel free to use short paragraphs. Avoid long, unbroken blocks of text. Do NOT use bullet points unless absolutely necessary for a list.
5. NO EMAIL PHRASES: Do NOT use phrases like "I hope this message finds you well", "Looking forward to hearing from you", "Best regards", or any other email signatures.

BANNED AI WORDS: "Delve", "Tapestry", "Crucial", "Moreover", "Furthermore", "In conclusion".

OUTPUT: Output ONLY the rewritten WhatsApp message. Do not include any intro, outro, or quotes around the message.`;

  const userMessage = `Rewrite this for WhatsApp:\n\n${sanitized}`;

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
      temperature: 0.75,
      top_p: 0.9,
      max_tokens: 1000,
    }),
  });

  try {
    let apiRes = await makeRequest("openai/gpt-oss-120b");

    if (!apiRes.ok) {
      const errText = await apiRes.clone().text();
      let errJson;
      try { errJson = JSON.parse(errText); } catch { errJson = {}; }
      if (errJson?.error?.code === "model_not_found" || apiRes.status === 404) {
        apiRes = await makeRequest("openai/gpt-oss-20b");
      }
      if (!apiRes.ok) throw new Error(errJson?.error?.message || "Groq API error");
    }

    const json = await apiRes.json();
    let textOut = json.choices?.[0]?.message?.content || "";
    if (!textOut) throw new Error("Empty response from AI");

    res.status(200).json({ result: textOut.trim() });
  } catch (error) {
    console.error("WhatsApp Humanizer Error:", error);
    res.status(500).json({ error: error.message || "Something went wrong" });
  }
}

