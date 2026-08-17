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

  const { points, type = "Professional", tone = "Professional" } = req.body;
  if (!points || typeof points !== "string" || points.trim().length === 0)
    return res.status(400).json({ error: "Email points/context is required." });

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey || groqKey.trim() === "")
    return res.status(500).json({ error: "Server configuration error." });

  const sanitizedPoints = points.trim().replace(/[<>]/g, "");

  const systemMessage = `You are an expert human communicator and email copywriter. Your goal is to take a user's rough points and write a natural, realistic, ready-to-send email.

OBJECTIVES:
- Write an email of type: ${type}
- Use tone: ${tone}
- Keep the email concise and to the point. Nobody likes reading long emails.
- Include placeholders like [Your Name] or [Date] if needed.

HUMANIZATION RULES (CRITICAL):
- Make it sound like a real person wrote it—conversational, polite, and direct.
- Aggressively vary sentence lengths. Mix short, medium, and long sentences naturally.
- Use simple, everyday vocabulary.
- Do NOT use robotic, overly formal, or cliché AI phrases like "I hope this email finds you well", "Delve", "Seamless", "Looking forward to hearing from you soon" (unless it truly fits naturally).
- Do NOT use transitional clichés like "Moreover", "Furthermore", "Additionally".
- Remove unnecessary commas to make the flow more conversational.

FORMATTING (CRITICAL):
- Output only the email itself. Provide a "Subject:" line at the very top.
- Do NOT include any intro like "Here is your email:".
- Do NOT use any Markdown formatting symbols (no ##, no **, no *). Output plain text only.`;

  const userMessage = `Write an email based on these points/context:\n\n${sanitizedPoints}`;

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
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 1000,
      frequency_penalty: 0.3,
      presence_penalty: 0.2,
    }),
  });

  try {
    let apiRes = await makeRequest("llama-4-scout-17b-16e-instruct");

    if (!apiRes.ok) {
      const errText = await apiRes.clone().text();
      let errJson;
      try { errJson = JSON.parse(errText); } catch { errJson = {}; }
      if (errJson?.error?.code === "model_not_found" || apiRes.status === 404) {
        apiRes = await makeRequest("llama-3.1-8b-instant");
      }
      if (!apiRes.ok) throw new Error(errJson?.error?.message || "Groq API error");
    }

    const json = await apiRes.json();
    let textOut = json.choices?.[0]?.message?.content || "";
    if (!textOut) throw new Error("Empty response from AI");

    res.status(200).json({ result: textOut.trim() });
  } catch (error) {
    console.error("Email Gen Error:", error);
    res.status(500).json({ error: error.message || "Something went wrong" });
  }
}
