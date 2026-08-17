// /api/linkedin.js — Naturize LinkedIn Post Humanizer
// Rewrites AI-generated LinkedIn posts to sound authentic, personal, and native to LinkedIn.

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

  const { post, voice = "thought-leader" } = req.body;
  if (!post || typeof post !== "string" || post.trim().length === 0)
    return res.status(400).json({ error: "Post content is required." });
  if (post.trim().length > 3000)
    return res.status(400).json({ error: "Post too long. LinkedIn's limit is 3,000 characters." });

  const groqKey = process.env.GROQ_API_KEY_SOCIAL;
  if (!groqKey || groqKey.trim() === "")
    return res.status(500).json({ error: "Server configuration error. GROQ_API_KEY_SOCIAL is missing." });

  const sanitized = post.trim().replace(/[<>]/g, "");

  // Voice-specific instructions
  let voiceInstruction = "";
  switch (voice) {
    case "thought-leader":
      voiceInstruction = `Write in the voice of an experienced professional sharing a hard-won opinion. Be direct and confident. Use "I" frequently. State a clear point of view. The post should feel like advice from someone who has lived through the experience. Start with a bold, single-sentence hook that makes the reader stop scrolling.`;
      break;
    case "storyteller":
      voiceInstruction = `Write in a personal narrative format. Structure: [What happened] → [What I felt] → [What I learned]. Use "I" and "we" naturally. Make it feel like a diary entry someone chose to share publicly. The first sentence must be a scene-setter, not an announcement. Example opening style: "Three years ago, I almost quit."`;
      break;
    case "casual":
      voiceInstruction = `Write in a very direct, conversational tone. Short sentences. No corporate speak whatsoever. Read like a text message from a smart friend. Use contractions (I'm, it's, you'll). Do not use buzzwords. Do not use bullet points with dashes.`;
      break;
    default:
      voiceInstruction = `Write in the voice of an experienced professional sharing a direct, valuable insight.`;
  }

  const systemMessage = `You are a top LinkedIn content creator who has built an audience of 50,000+ followers by writing posts that sound completely human and personal.

YOUR GOAL: Rewrite the given LinkedIn post to sound authentic, engaging, and NOT AI-generated.

LINKEDIN-SPECIFIC RULES:
1. HOOK (Most Important): The FIRST sentence must be a scroll-stopper. It should be short (under 10 words), surprising, or emotionally resonant. Never start with "I want to talk about" or "Today I learned". Examples of good hooks: "I got rejected 14 times.", "Nobody tells you this part.", "This changed how I work forever."
2. SHORT PARAGRAPHS: LinkedIn readers scan. Maximum 2 sentences per paragraph. Add a line break between every paragraph.
3. PERSONAL VOICE: ${voiceInstruction}
4. ENDING: Always end with a genuine, specific question to encourage comments. Not "What do you think?" — something more specific like "Has this ever happened to you?" or "What would you have done differently?"
5. NO EMOJIS in the middle of sentences. One emoji at the start or end of the post is acceptable, not mandatory.
6. CHARACTER LIMIT: Keep the output under 1,300 characters (optimal for LinkedIn reach — posts over 1,300 chars get cut off).

BANNED WORDS AND PHRASES (these are AI giveaways on LinkedIn):
- "In today's fast-paced world", "game-changer", "paradigm shift", "leverage", "synergy", "circle back", "deep dive", "thought leadership", "bandwidth", "move the needle", "unpack", "at the end of the day", "it goes without saying", "I'm excited to share", "thrilled to announce", "humbled and honored", "Let's connect", "DM me", "drop a comment below".

OUTPUT FORMAT: Plain text only. No markdown. No bullet points with dashes. Use line breaks between paragraphs.`;

  try {
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: `Rewrite this LinkedIn post:\n\n${sanitized}` }
        ],
        temperature: 0.78,
        max_tokens: 600,
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
    console.error("LinkedIn API handler error:", err);
    return res.status(500).json({ error: "Internal server error. Please try again." });
  }
}

