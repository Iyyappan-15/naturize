// /api/detect.js
// Vercel Serverless Function — Naturize AI Detector
// Securely proxies requests to the Google Gemini API

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { text } = req.body;

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return res.status(400).json({ error: "Invalid input: text is required." });
  }

  if (text.trim().length > 10000) {
    return res
      .status(400)
      .json({ error: "Input too long. Maximum 10,000 characters allowed." });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("GEMINI_API_KEY environment variable not set.");
    return res.status(500).json({ error: "Server configuration error." });
  }

  const sanitizedText = text.trim().replace(/[<>]/g, "");

  const prompt = `Analyze the following text and determine how likely it is to have been written by AI.

Return ONLY valid JSON in this exact format, with no markdown code fences, no extra text:
{
  "score": <integer from 0 to 100>,
  "verdict": "<one of: Human | Likely Human | Mixed | Likely AI | AI-Generated>",
  "reasons": [
    "<specific reason 1>",
    "<specific reason 2>",
    "<specific reason 3>"
  ]
}

Score meaning:
0 = fully human written
100 = definitely AI-generated

Text:
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
          temperature: 0.2,
          topP: 0.9,
          maxOutputTokens: 512,
          responseMimeType: "application/json",
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

    if (!rawText) {
      return res
        .status(502)
        .json({ error: "AI returned an empty response. Please try again." });
    }

    // Robust JSON parsing: strip markdown fences if present
    let cleaned = rawText.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Fallback: try to extract JSON from the string
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch {
          return res.status(502).json({
            error: "Failed to parse AI response. Please try again.",
          });
        }
      } else {
        console.error("Failed to parse Gemini response:", rawText);
        return res
          .status(502)
          .json({ error: "AI returned an unexpected format. Please retry." });
      }
    }

    // Validate and sanitize response
    const score =
      typeof parsed.score === "number"
        ? Math.min(100, Math.max(0, Math.round(parsed.score)))
        : 50;

    const validVerdicts = [
      "Human",
      "Likely Human",
      "Mixed",
      "Likely AI",
      "AI-Generated",
    ];
    const verdict = validVerdicts.includes(parsed.verdict)
      ? parsed.verdict
      : "Mixed";

    const reasons = Array.isArray(parsed.reasons)
      ? parsed.reasons.slice(0, 5).map((r) => String(r).trim())
      : ["Analysis completed."];

    return res.status(200).json({ score, verdict, reasons });
  } catch (err) {
    console.error("Detect handler error:", err);
    return res
      .status(500)
      .json({ error: "Internal server error. Please try again later." });
  }
}
