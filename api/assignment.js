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

  const { topic, pages = "1", level = "High School" } = req.body;
  if (!topic || typeof topic !== "string" || topic.trim().length === 0)
    return res.status(400).json({ error: "Topic is required." });

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey || groqKey.trim() === "")
    return res.status(500).json({ error: "Server configuration error." });

  const sanitizedTopic = topic.trim().replace(/[<>]/g, "");
  
  // Approximate word count: 250 words per page
  const wordTarget = parseInt(pages, 10) * 250;

  const systemMessage = `You are an expert academic writer that generates high-quality, fully human-sounding assignments and essays. 
Your writing must bypass AI detectors completely. It should sound like a real student at the requested academic level wrote it.

OBJECTIVES:
- Write a highly structured essay/assignment on the given topic.
- Match the requested academic level (${level}).
- Aim for approximately ${wordTarget} words.
- Include an introduction, body paragraphs, and a natural conclusion.

HUMANIZATION RULES (CRITICAL):
- Aggressively vary sentence lengths. Mix short, medium, and long sentences naturally.
- Use simple, everyday vocabulary appropriate for the academic level. Avoid overly complex or "academic-sounding" jargon unless strictly necessary.
- Do NOT use robotic transitional phrases like "Moreover", "Furthermore", "Additionally", "In conclusion", "Ultimately", "It is important to note".
- Do NOT use AI clichés like "delve", "leverage", "tapestry", "seamless", "crucial", "transformative", "cutting-edge".
- Remove unnecessary commas to make the flow more conversational.
- The tone should be confident, natural, and casually intelligent.

FORMATTING (CRITICAL):
- Do NOT use any Markdown formatting symbols (no ##, no **, no *).
- Output pure plain text.
- Separate paragraphs with a single blank line.
- Do NOT add a title like "Here is your essay:" just output the text itself.`;

  const userMessage = `Write an assignment on the following topic:\n\nTopic: ${sanitizedTopic}\nLength: ~${wordTarget} words\nLevel: ${level}`;

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
      temperature: 0.8,
      top_p: 0.9,
      max_tokens: 4000,
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
    console.error("Assignment Gen Error:", error);
    res.status(500).json({ error: error.message || "Something went wrong" });
  }
}
