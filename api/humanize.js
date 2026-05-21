// /api/humanize.js — Naturize Humanizer v3
// Key fix: Explicitly instructs the model to AVOID AI-signature vocabulary,
// ADD sentence burstiness, USE contractions, and write like a real human.

const BASE_RULES = `
STRICT RULES — Follow all of these without exception:

1. VARY sentence length aggressively. Mix very short sentences (3-7 words) with medium (12-18 words) and occasionally longer ones. This "burstiness" is the #1 marker of human writing.
2. NEVER use these AI-flagged words or phrases: furthermore, moreover, additionally, in conclusion, in summary, it is important to note, it should be noted, it is worth noting, delve, delving, showcase, showcasing, leverage, leveraging, utilize, utilizing, paradigm, paradigms, multifaceted, nuanced, in the realm of, as mentioned, needless to say, pivotal, vibrant, crucial, vital, facilitate, mitigate, comprehensive, navigate, evolving landscape, streamline, innovative, revolutionize, synergy, cutting-edge, state-of-the-art, endeavors, actualize, augment, forefront, underpinned, unrelenting, continually seek, rapidly evolving, experiential.
3. Use contractions naturally where they fit (don't, it's, I'm, we're, can't, won't, that's, there's).
4. Use active voice. Rephrase passive constructions ("is done by" → "someone does").
5. Vary word choice. Don't repeat the same adjective or verb twice.
6. Add a short punchy sentence occasionally — even a 4-word one. It creates rhythm.
7. Keep the exact same meaning and facts. Do NOT add or remove information.
8. Do NOT start multiple sentences with "The" or "This".
9. Use natural connectors humans actually say: "Plus", "And honestly", "That said", "But", "So", "Here's the thing", "What's interesting is" — sparingly.
10. Output ONLY the rewritten text — no preamble, no explanations.
`;

const TONE_INSTRUCTIONS = {
  professional: `
Tone: Professional and confident, like a skilled human expert writing a report or email.
- Sound authoritative but approachable — not robotic.
- Use industry vocabulary but keep it conversational enough to hold attention.
- Vary sentence rhythm: a crisp short statement, then a fuller explanation.
- Example feel: "This works. Here's why it matters — and why most people miss it."
${BASE_RULES}`,

  casual: `
Tone: Casual and natural, like texting a smart friend or writing a personal blog post.
- Use everyday language. Short words over long ones.
- Contractions are essential (don't, it's, you're, we've).
- It's okay to start sentences with "And" or "But" — real people do this.
- Humor, light sarcasm, or enthusiasm is welcome if it fits.
- Example feel: "Honestly? It's simpler than it sounds. You just need to..."
${BASE_RULES}`,

  academic: `
Tone: Academic and scholarly, but written by an actual human academic — not an AI pretending to be one.
- Use precise terminology, but vary sentence length dramatically. Real academics write short punchy statements between long analytical ones.
- First-person is fine for academic writing ("I argue that...", "We found...").
- Avoid hedging AI-speak like "it is important to note". Instead, just state it directly.
- Example feel: "The results are clear. When we control for X, the effect nearly doubles — a finding that challenges prior assumptions."
${BASE_RULES}`,

  creative: `
Tone: Creative, vivid, and engaging — like a human author who loves language.
- Use sensory details, metaphors, and imagery.
- Let sentences breathe: sometimes long and flowing, sometimes cut short. Abruptly.
- Break grammar rules occasionally for effect. Fragments work. So does this.
- Example feel: "It's not just a tool. It's the difference between a late night of frustration and getting home on time."
${BASE_RULES}`,

  formal: `
Tone: Formal and authoritative, like a legal document or official business communication written by a real professional.
- Use precise, unambiguous language.
- Avoid contractions, but still vary sentence structure for readability.
- Short declarative sentences carry authority. Use them between longer explanatory ones.
- Example feel: "The process is straightforward. Each step builds on the last, and the final outcome is measurable."
${BASE_RULES}`,
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const { text, tone = "professional" } = req.body;

  if (!text || typeof text !== "string" || text.trim().length === 0)
    return res.status(400).json({ error: "Text is required." });
  if (text.trim().length > 10000)
    return res.status(400).json({ error: "Input too long. Max 10,000 characters." });

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey || groqKey.trim() === "")
    return res.status(500).json({ error: "Server configuration error." });

  const sanitized = text.trim().replace(/[<>]/g, "");
  const validTones = Object.keys(TONE_INSTRUCTIONS);
  const selectedTone = validTones.includes(tone) ? tone : "professional";
  const toneInstruction = TONE_INSTRUCTIONS[selectedTone];

  const systemMessage = `You are a world-class human ghostwriter. Your entire purpose is to take text and rewrite it so it sounds like a real, skilled human wrote it — not an AI. You are intimately familiar with all the patterns that make text sound robotic and AI-generated, and you eliminate every single one. Your rewrites consistently pass all AI detectors because they reflect genuine human writing patterns.`;

  const userMessage = `${toneInstruction}

Rewrite the following text:
---
${sanitized}
---

Remember: Output ONLY the rewritten text. No intro. No explanation. Just the humanized version.`;

  try {
    const makeRequest = async (modelName) => {
      return await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${groqKey.trim()}`
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: "system", content: systemMessage },
            { role: "user", content: userMessage }
          ],
          temperature: 0.92,   // Higher = more creative/varied word choices (less predictable)
          top_p: 0.95,         // Broader vocabulary sampling
          max_tokens: 3000,
          frequency_penalty: 0.5,  // Penalize word repetition strongly
          presence_penalty: 0.3,   // Encourage new topics/words
        }),
      });
    };

    const preferredModel = "llama-3.3-70b-versatile";
    const fallbackModel = "llama-3.1-8b-instant";

    let apiRes = await makeRequest(preferredModel);

    if (!apiRes.ok) {
      const errBody = await apiRes.clone().text();
      try {
        const errJson = JSON.parse(errBody);
        if (errJson.error && (errJson.error.code === "model_not_found" || apiRes.status === 404)) {
          console.warn(`Model ${preferredModel} not found. Falling back to ${fallbackModel}...`);
          apiRes = await makeRequest(fallbackModel);
        }
      } catch (e) { /* not JSON */ }
    }

    if (!apiRes.ok) {
      const errBody = await apiRes.text();
      console.error("Groq API error:", errBody);
      if (apiRes.status === 401 || errBody.includes("Invalid API Key"))
        return res.status(502).json({ error: "API Key is invalid. Please check your Vercel environment variables." });
      if (apiRes.status === 429)
        return res.status(429).json({ error: "Rate limit reached. Please try again in a moment." });
      return res.status(502).json({ error: `API error: ${errBody.slice(0, 200)}` });
    }

    const data = await apiRes.json();
    const rawOutput = data?.choices?.[0]?.message?.content || "";

    if (!rawOutput.trim())
      return res.status(502).json({ error: "AI returned an empty response. Please try again." });

    // Clean up any accidental preamble the model might add
    let result = rawOutput.trim();
    const preamblePatterns = [
      /^(here('s| is) the rewritten text[:\s]*)/i,
      /^(rewritten[:\s]*)/i,
      /^(humanized version[:\s]*)/i,
      /^(sure[,!]?\s*here[^\n]*\n)/i,
    ];
    for (const pattern of preamblePatterns) {
      result = result.replace(pattern, "");
    }
    result = result.trim();

    // Calculate humanity score using same statistical model as detector
    const humanityScore = estimateHumanityScore(result);

    return res.status(200).json({ result, humanityScore });

  } catch (err) {
    console.error("Humanize handler error:", err);
    return res.status(500).json({ error: "Internal server error. Please try again." });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HUMANITY SCORE — Same statistical model as the detector, inverted
// This gives a realistic score consistent with the detector's output
// ═══════════════════════════════════════════════════════════════════════════
function estimateHumanityScore(text) {
  const sentences = text.match(/[^.!?\n]+[.!?]+/g) || [text];
  const sentenceLengths = sentences.map(s => s.trim().split(/\s+/).filter(w => w.length > 0).length);
  const avgLen = sentenceLengths.reduce((a, b) => a + b, 0) / (sentenceLengths.length || 1);
  const variance = sentenceLengths.reduce((sum, l) => sum + Math.pow(l - avgLen, 2), 0) / (sentenceLengths.length || 1);
  const burstiness = avgLen > 0 ? Math.sqrt(variance) / avgLen : 0;

  const words = text.toLowerCase().match(/\b[a-z']+\b/g) || [];
  const ttr = words.length > 0 ? new Set(words).size / words.length : 0;

  const AI_SIGNATURES = [
    "furthermore", "moreover", "additionally", "in conclusion", "delve", "delving",
    "showcase", "leverage", "utilize", "paradigm", "multifaceted", "pivotal",
    "vibrant", "facilitate", "mitigate", "comprehensive", "navigate", "streamline",
    "synergy", "cutting-edge", "endeavors", "actualize", "augment", "forefront",
    "underpinned", "unrelenting"
  ];
  const lowerText = text.toLowerCase();
  const aiPhraseCount = AI_SIGNATURES.filter(p => lowerText.includes(p)).length;
  const firstPersonCount = (text.match(/\b(i|me|my|mine|we|us|our)\b/gi) || []).length;
  const contractionCount = (text.match(/\b\w+'(t|s|re|ve|ll|d|m)\b/gi) || []).length;

  // Build score (0-100, higher = more human)
  let score = 50;
  score += Math.min(25, burstiness * 40);           // High burstiness = human
  score += Math.min(15, ttr * 20);                   // High diversity = human
  score -= aiPhraseCount * 8;                         // AI phrases = penalize
  score += Math.min(10, firstPersonCount * 2);        // First person = human
  score += Math.min(10, contractionCount * 2.5);      // Contractions = human

  return Math.min(99, Math.max(40, Math.round(score)));
}
