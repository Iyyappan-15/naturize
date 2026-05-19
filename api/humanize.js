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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY environment variable not set.");
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
    let geminiRes;
    let success = false;
    let errBody = "";

    const fetchOptions = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          topP: 0.9,
          maxOutputTokens: 2048,
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              humanized: { type: "string" },
              humanityScore: { type: "integer" }
            },
            required: ["humanized", "humanityScore"]
          }
        },
      }),
    };

    for (let attempt = 1; attempt <= 3; attempt++) {
      geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
        fetchOptions
      );

      if (geminiRes.ok) {
        success = true;
        break;
      }

      errBody = await geminiRes.text();
      // Retry on 503 (Service Unavailable), 429 (Too Many Requests), or 500 (Internal Error)
      if (geminiRes.status === 503 || geminiRes.status === 429 || geminiRes.status === 500) {
        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
          continue;
        }
      }
      break;
    }

    if (!success) {
      console.error("Gemini API error:", errBody);
      if (geminiRes && geminiRes.status === 503) {
        return res.status(503).json({ error: "The AI model is currently experiencing high demand. Please try again in a moment." });
      }
      return res.status(502).json({ error: `Gemini error: ${errBody.slice(0, 200)}` });
    }

    const data = await geminiRes.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

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
