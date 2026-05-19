// /api/humanize.js
// Vercel Serverless Function — Naturize AI Humanizer
// Returns humanized text + humanity score in one Gemini call

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const { text } = req.body;
  if (!text || typeof text !== "string" || text.trim().length === 0)
    return res.status(400).json({ error: "Invalid input: text is required." });
  if (text.trim().length > 10000)
    return res.status(400).json({ error: "Input too long. Maximum 10,000 characters allowed." });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error("GROQ_API_KEY environment variable not set.");
    return res.status(500).json({ error: "Server configuration error." });
  }

  const sanitizedText = text.trim().replace(/[<>]/g, "");

  const prompt = `Rewrite the following text to sound natural, engaging, and authentically human while maintaining a highly professional tone. Vary sentence length and structure to flow better. Remove robotic phrasing, repetitive transitions, and overly formal "AI-speak". Keep the original meaning and core information fully intact. Do NOT use casual slang, emojis, or unprofessional imperfections.

Then rate how human the rewrite sounds on a scale of 0–100 (100 = perfectly human, 0 = clearly AI).

Return ONLY a valid JSON object in this exact format:
{
  "humanized": "the complete rewritten text here",
  "humanityScore": 85
}

Text to rewrite:
${sanitizedText}`;

  try {
    let apiRes;
    let success = false;
    let errBody = "";

    const fetchOptions = {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "llama3-70b-8192",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 2048,
        response_format: { type: "json_object" }
      }),
    };

    for (let attempt = 1; attempt <= 3; attempt++) {
      apiRes = await fetch(
        `https://api.groq.com/openai/v1/chat/completions`,
        fetchOptions
      );

      if (apiRes.ok) {
        success = true;
        break;
      }

      errBody = await apiRes.text();
      if (apiRes.status === 503 || apiRes.status === 429 || apiRes.status === 500) {
        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
          continue;
        }
      }
      break;
    }

    if (!success) {
      console.error("Groq API error:", errBody);
      if (apiRes && apiRes.status === 429) {
        return res.status(429).json({ error: "API quota exceeded. Please try again later." });
      }
      return res.status(502).json({ error: `API error: ${errBody.slice(0, 200)}` });
    }

    const data = await apiRes.json();
    const rawText = data?.choices?.[0]?.message?.content || "";

    if (!rawText) return res.status(502).json({ error: "AI returned an empty response. Please try again." });

    // Robust JSON parsing
    let cleaned = rawText.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (m) {
        try { parsed = JSON.parse(m[0]); }
        catch { return res.status(502).json({ error: "Failed to parse AI response. Please try again." }); }
      } else {
        // Fallback: treat whole response as plain text, score 75
        return res.status(200).json({ result: rawText.trim(), humanityScore: 75 });
      }
    }

    const result = typeof parsed.humanized === "string" ? parsed.humanized.trim() : rawText.trim();
    const humanityScore = typeof parsed.humanityScore === "number"
      ? Math.min(100, Math.max(0, Math.round(parsed.humanityScore))) : 75;

    return res.status(200).json({ result, humanityScore });
  } catch (err) {
    console.error("Humanize handler error:", err);
    return res.status(500).json({ error: "Internal server error. Please try again later." });
  }
}
