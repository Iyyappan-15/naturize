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

  const { jobTitle, company, skills } = req.body;
  if (!jobTitle || !skills || typeof jobTitle !== "string" || typeof skills !== "string")
    return res.status(400).json({ error: "Job title and skills are required." });

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey || groqKey.trim() === "")
    return res.status(500).json({ error: "Server configuration error." });

  const sanitizedJob = jobTitle.trim().replace(/[<>]/g, "");
  const sanitizedCompany = company ? company.trim().replace(/[<>]/g, "") : "[Company Name]";
  const sanitizedSkills = skills.trim().replace(/[<>]/g, "");

  const systemMessage = `You are an expert career coach and cover letter writer. Your task is to generate a highly compelling, modern, and human-sounding cover letter.

OBJECTIVES:
- Write a professional but natural cover letter for the role of ${sanitizedJob} at ${sanitizedCompany}.
- Seamlessly integrate the user's provided skills and experience.
- Hook the reader in the first sentence with enthusiasm and immediate value.
- Keep it concise (3-4 short paragraphs).
- End with a confident, polite call to action.
- Use placeholders like [Your Name], [Your Email], [Your Phone] at the top or bottom as appropriate.

HUMANIZATION RULES (CRITICAL):
- Make it sound like a real person wrote it—conversational, confident, and direct.
- Aggressively vary sentence lengths.
- Use simple, everyday vocabulary.
- Do NOT use typical AI clichés or robotic jargon like "I am writing to express my interest", "I am a highly motivated individual", "Delve", "Transformative", "Tapestry", "Leverage".
- Do NOT use transitional clichés like "Moreover", "Furthermore", "Additionally".
- Remove unnecessary commas to make the flow more conversational.

FORMATTING (CRITICAL):
- Output only the cover letter text.
- Do NOT include any intro like "Here is your cover letter:".
- Do NOT use any Markdown formatting symbols (no ##, no **, no *). Output plain text only.`;

  const userMessage = `My Skills & Experience:\n\n${sanitizedSkills}`;

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
      max_tokens: 1500,
      frequency_penalty: 0.3,
      presence_penalty: 0.2,
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
      if (!apiRes.ok) throw new Error(errJson?.error?.message || "Groq API error");
    }

    const json = await apiRes.json();
    let textOut = json.choices?.[0]?.message?.content || "";
    if (!textOut) throw new Error("Empty response from AI");

    res.status(200).json({ result: textOut.trim() });
  } catch (error) {
    console.error("Cover Letter Gen Error:", error);
    res.status(500).json({ error: error.message || "Something went wrong" });
  }
}
