// /api/humanize.js
// Vercel Serverless Function — Naturize AI Humanizer

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

  const geminiKey = process.env.GEMINI_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY || process.env.GROQ_API_KEY;

  if (!geminiKey && (!openRouterKey || openRouterKey === "undefined" || openRouterKey.trim() === "")) {
    console.error("No valid API key environment variables set.");
    return res.status(500).json({ error: "Server configuration error: No API key provided in Vercel settings." });
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
    let errBody = "";
    
    // Prefer Gemini if available, fallback to OpenRouter
    if (geminiKey && geminiKey !== "undefined" && geminiKey.trim() !== "") {
      apiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey.trim()}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
          }),
        }
      );
    } else {
      apiRes = await fetch(
        `https://openrouter.ai/api/v1/chat/completions`,
        {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${openRouterKey.trim()}`,
            "HTTP-Referer": "https://naturize-web.vercel.app",
            "X-Title": "Naturize AI"
          },
          body: JSON.stringify({
            model: "google/gemini-2.0-flash-exp:free", // Using a reliable, free model on OpenRouter
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
            max_tokens: 2048,
            response_format: { type: "json_object" }
          }),
        }
      );
    }

    if (!apiRes.ok) {
      errBody = await apiRes.text();
      console.error("AI API error:", errBody);
      if (apiRes.status === 401 || errBody.includes("Authentication")) {
        return res.status(502).json({ error: "API Key is invalid or expired. Please check your Vercel environment variables." });
      }
      if (apiRes.status === 429) {
        return res.status(429).json({ error: "API quota exceeded. Please try again later." });
      }
      return res.status(502).json({ error: `API error: ${errBody.slice(0, 200)}` });
    }

    const data = await apiRes.json();
    let rawText = "";

    // Extract text depending on which API was used
    if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
      rawText = data.candidates[0].content.parts[0].text;
    } else if (data.choices && data.choices[0]?.message?.content) {
      rawText = data.choices[0].message.content;
    }

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
