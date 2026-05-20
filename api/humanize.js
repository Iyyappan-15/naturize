// /api/humanize.js
// Vercel Serverless Function — Naturize AI Humanizer

const TONE_PROMPTS = {
  professional: `Rewrite the following text to sound natural, clear, and professionally confident. Use precise vocabulary, active voice, and varied sentence structure. Remove robotic phrasing and overly formal "AI-speak". Keep the original meaning fully intact.`,
  casual: `Rewrite the following text to sound relaxed, friendly, and conversational — like a real person talking to a friend. Keep it easy to read with natural flow. Avoid stiff or formal language. Keep the meaning intact.`,
  academic: `Rewrite the following text in a formal academic style. Use scholarly vocabulary, structured arguments, and precise language suitable for research papers or academic essays. Maintain intellectual rigor while sounding authentically human.`,
  creative: `Rewrite the following text in an engaging, vivid, and creative style. Use descriptive language, varied rhythm, and storytelling techniques to make it compelling and memorable. Keep the core meaning but make it come alive.`,
  formal: `Rewrite the following text in a highly formal, official tone suitable for business reports, legal documents, or official correspondence. Use structured, precise language with a professional and authoritative voice.`,
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const { text, tone = "professional" } = req.body;
  if (!text || typeof text !== "string" || text.trim().length === 0)
    return res.status(400).json({ error: "Invalid input: text is required." });
  if (text.trim().length > 10000)
    return res.status(400).json({ error: "Input too long. Maximum 10,000 characters allowed." });

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey || groqKey === "undefined" || groqKey.trim() === "") {
    console.error("GROQ_API_KEY is missing.");
    return res.status(500).json({ error: "Server configuration error: GROQ_API_KEY is not configured in Vercel settings." });
  }

  const sanitizedText = text.trim().replace(/[<>]/g, "");
  const validTones = Object.keys(TONE_PROMPTS);
  const selectedTone = validTones.includes(tone) ? tone : "professional";
  const toneInstruction = TONE_PROMPTS[selectedTone];

  const prompt = `${toneInstruction}

Then rate how human the rewrite sounds on a scale of 0–100 (100 = perfectly human, 0 = clearly AI).

Return ONLY a valid JSON object in this exact format:
{
  "humanized": "the complete rewritten text here",
  "humanityScore": 85
}

Text to rewrite:
${sanitizedText}`;

  try {
    const makeRequest = async (modelName) => {
      return await fetch(`https://api.groq.com/openai/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${groqKey.trim()}`
        },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          max_tokens: 2048,
          response_format: { type: "json_object" }
        }),
      });
    };

    const preferredModel = "llama-4-scout-17b";
    const fallbackModel = "llama-3.3-70b-versatile";

    let apiRes = await makeRequest(preferredModel);

    if (!apiRes.ok) {
      const errBody = await apiRes.clone().text();
      try {
        const errJson = JSON.parse(errBody);
        if (errJson.error && errJson.error.code === "model_not_found") {
          console.warn(`Model ${preferredModel} not found. Falling back to ${fallbackModel}...`);
          apiRes = await makeRequest(fallbackModel);
        }
      } catch (e) { /* not JSON, fall through */ }
    }

    if (!apiRes.ok) {
      const errBody = await apiRes.text();
      console.error("Groq API error:", errBody);
      if (apiRes.status === 401 || errBody.includes("Invalid API Key"))
        return res.status(502).json({ error: "API Key is invalid. Please check your Vercel environment variables." });
      if (apiRes.status === 429)
        return res.status(429).json({ error: "API quota exceeded. Please try again later." });
      return res.status(502).json({ error: `API error: ${errBody.slice(0, 200)}` });
    }

    const data = await apiRes.json();
    const rawText = data?.choices?.[0]?.message?.content || "";

    if (!rawText) return res.status(502).json({ error: "AI returned an empty response. Please try again." });

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
