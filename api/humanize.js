// /api/humanize.js — Naturize Humanizer v4
// Strategy: Example-driven prompting + aggressive anti-pattern rules +
//           server-side post-processing to replace predictable words &
//           inject natural human noise (fillers, em-dashes, parentheticals).

// ─────────────────────────────────────────────────────────────────────────
// WORD-LEVEL POST-PROCESSOR
// Replaces safe/predictable LLM word choices with more unexpected equivalents.
// This raises the token-level perplexity that tools like GPTZero measure.
// ─────────────────────────────────────────────────────────────────────────
function postProcess(text) {
  let t = text;

  // 1. Replace LLM-safe generic words with more idiomatic/less predictable ones
  const swaps = [
    [/\bdemonstrate(?:s|d)?\b/gi, "show"],
    [/\bprovides?\b/gi, "gives"],
    [/\bpurchase(?:d|s)?\b/gi, "buy"],
    [/\battain(?:s|ed)?\b/gi, "get"],
    [/\bcommence(?:s|d)?\b/gi, "kick off"],
    [/\bterminate(?:s|d)?\b/gi, "end"],
    [/\brequire(?:s|d)?\b/gi, "need"],
    [/\benhance(?:s|d)?\b/gi, "boost"],
    [/\bimplement(?:s|ed|ing)?\b/gi, "use"],
    [/\baccomplish(?:es|ed)?\b/gi, "pull off"],
    [/\bsubsequently\b/gi, "then"],
    [/\bpreviously\b/gi, "before"],
    [/\bcurrently\b/gi, "right now"],
    [/\bfrequently\b/gi, "often"],
    [/\bsignificant(?:ly)?\b/gi, (m) => m.endsWith("ly") ? "a lot" : "big"],
    [/\bnumerous\b/gi, "many"],
    [/\badditional\b/gi, "more"],
    [/\bsufficient\b/gi, "enough"],
    [/\binitiate(?:s|d)?\b/gi, "start"],
    [/\bexamine(?:s|d)?\b/gi, "look at"],
    [/\bascertain(?:s|ed)?\b/gi, "figure out"],
    [/\butilize(?:s|d)?\b/gi, "use"],
    [/\bobtain(?:s|ed)?\b/gi, "get"],
    [/\bfacilitate(?:s|d)?\b/gi, "help"],
    [/\bconsequently\b/gi, "so"],
    [/\bnevertheless\b/gi, "still"],
    [/\bnotwithstanding\b/gi, "despite that"],
    [/\bin order to\b/gi, "to"],
    [/\bdue to the fact that\b/gi, "because"],
    [/\bat this point in time\b/gi, "now"],
    [/\bin the event that\b/gi, "if"],
    [/\bprior to\b/gi, "before"],
    [/\bsubsequent to\b/gi, "after"],
    [/\ba large number of\b/gi, "many"],
    [/\bmake use of\b/gi, "use"],
    [/\bwith regard to\b/gi, "about"],
    [/\bin terms of\b/gi, "for"],
  ];

  for (const [pattern, replacement] of swaps) {
    if (typeof replacement === "function") {
      t = t.replace(pattern, replacement);
    } else {
      t = t.replace(pattern, replacement);
    }
  }

  // 2. Inject em-dashes at natural clause breaks (adds stylistic unpredictability)
  // Replace " - " or " — " already there, and add some at comma breaks
  t = t.replace(/,\s+(however|though|but|yet|still)\s+/gi, (_, conj) => ` — ${conj} `);
  t = t.replace(/\.\s+(And\s+|But\s+|So\s+|Plus\s+)/gi, (_, conj) => `. ${conj}`);

  // 3. Loosen some over-formal constructions
  t = t.replace(/\bI am\b/g, "I'm");
  t = t.replace(/\bthey are\b/gi, "they're");
  t = t.replace(/\bwe are\b/gi, "we're");
  t = t.replace(/\byou are\b/gi, "you're");
  t = t.replace(/\bit is\b/gi, "it's");
  t = t.replace(/\bthat is\b/gi, "that's");
  t = t.replace(/\bdo not\b/gi, "don't");
  t = t.replace(/\bcannot\b/gi, "can't");
  t = t.replace(/\bwill not\b/gi, "won't");
  t = t.replace(/\bwould not\b/gi, "wouldn't");
  t = t.replace(/\bshould not\b/gi, "shouldn't");
  t = t.replace(/\bcould not\b/gi, "couldn't");
  t = t.replace(/\bdid not\b/gi, "didn't");
  t = t.replace(/\bhas not\b/gi, "hasn't");
  t = t.replace(/\bhave not\b/gi, "haven't");
  t = t.replace(/\bwas not\b/gi, "wasn't");
  t = t.replace(/\bwere not\b/gi, "weren't");

  // 4. Break up any remaining uniform short-sentence runs
  // If 3+ consecutive sentences are under 8 words, merge two of them
  const sentParts = t.split(/(?<=[.!?])\s+/);
  const merged = [];
  let i = 0;
  while (i < sentParts.length) {
    const cur = sentParts[i];
    const next = sentParts[i + 1];
    const curLen = cur.split(" ").length;
    const nextLen = next ? next.split(" ").length : 999;
    // If both current and next are short (<= 8 words), merge with a connector
    if (curLen <= 7 && nextLen <= 7 && next && !next.match(/^(And |But |So |Plus |I |You |We )/i)) {
      const connectors = [", and ", " — ", ", so ", ", but ", ", plus "];
      const connector = connectors[Math.floor(curLen % connectors.length)];
      merged.push(cur.replace(/[.!?]$/, "") + connector + next.charAt(0).toLowerCase() + next.slice(1));
      i += 2;
    } else {
      merged.push(cur);
      i++;
    }
  }
  t = merged.join(" ");

  return t.trim();
}

// ─────────────────────────────────────────────────────────────────────────
// HUMANITY SCORE (consistent with detector stats)
// ─────────────────────────────────────────────────────────────────────────
function estimateHumanityScore(text) {
  const sentences = text.match(/[^.!?\n]+[.!?]+/g) || [text];
  const lens = sentences.map(s => s.trim().split(/\s+/).length);
  const avg = lens.reduce((a, b) => a + b, 0) / (lens.length || 1);
  const variance = lens.reduce((s, l) => s + Math.pow(l - avg, 2), 0) / (lens.length || 1);
  const burstiness = avg > 0 ? Math.sqrt(variance) / avg : 0;
  const words = text.toLowerCase().match(/\b[a-z']+\b/g) || [];
  const ttr = words.length > 0 ? new Set(words).size / words.length : 0;
  const AI_SIGS = ["furthermore","moreover","pivotal","leverage","paradigm","multifaceted","delve","facilitate","mitigate","comprehensive","navigate","synergy","cutting-edge","endeavors","augment","forefront"];
  const aiHits = AI_SIGS.filter(p => text.toLowerCase().includes(p)).length;
  const fp = (text.match(/\b(i|me|my|mine|we|us|our)\b/gi) || []).length;
  const contr = (text.match(/\b\w+'(t|s|re|ve|ll|d|m)\b/gi) || []).length;
  let score = 50 + Math.min(25, burstiness * 40) + Math.min(15, ttr * 20) - aiHits * 8 + Math.min(10, fp * 2) + Math.min(10, contr * 2.5);
  return Math.min(99, Math.max(40, Math.round(score)));
}

// ─────────────────────────────────────────────────────────────────────────
// TONE PROMPTS — Example-driven, forensic-level instruction
// ─────────────────────────────────────────────────────────────────────────
function buildPrompt(tone, sanitized) {
  const BAD_WORDS = "furthermore, moreover, additionally, in conclusion, in summary, it is important to note, it should be noted, needless to say, delve, showcase, leverage, utilize, paradigm, multifaceted, nuanced, in the realm of, as mentioned, pivotal, vibrant, facilitate, mitigate, comprehensive, navigate, evolving landscape, streamline, synergy, cutting-edge, state-of-the-art, endeavors, actualize, augment, forefront, underpinned, unrelenting";

  const UNIVERSAL_RULES = `
STRICT RULES (never break these):
- NEVER use any of these words: ${BAD_WORDS}
- ALWAYS use contractions: it's, don't, I'm, we're, can't, won't, that's, isn't, there's
- START some sentences with "And", "But", "So", "Or" — real humans do this
- VARY sentence length dramatically: mix 4-word punchy sentences with 20-word complex ones
- USE em-dashes (—) for natural pauses and asides, like a human thinking mid-sentence
- ADD parenthetical thoughts (like this) occasionally
- USE colloquial phrases: "honestly", "look", "the thing is", "in my experience", "you'd be surprised"
- REPLACE abstract nouns with concrete, specific ones where possible
- KEEP the exact same meaning, facts, and scope — don't add or remove information
- Output ONLY the rewritten text. No intro sentence, no "Here is the rewritten text:"`;

  const toneConfigs = {
    casual: {
      instruction: `Rewrite the text as if a smart, articulate friend sent it in a WhatsApp message or wrote a casual blog post. Conversational, relaxed, real. Grammar rules can bend — fragments are fine. Use "you" to address the reader directly.`,
      badExample: `Artificial intelligence is significantly transforming numerous industries. It is important to note that organizations must adapt to this paradigm shift.`,
      goodExample: `AI is changing everything — fast. And honestly? Companies that don't adapt are going to get left behind. It's just that simple.`,
    },
    professional: {
      instruction: `Rewrite the text as a confident, experienced professional would write it — clear, direct, and smart. Not stiff or robotic. Think: a respected expert writing a LinkedIn post or a sharp internal memo.`,
      badExample: `The implementation of AI technologies has demonstrated significant potential for enhancing operational efficiency across multiple sectors.`,
      goodExample: `AI is delivering real results — faster workflows, better decisions, measurable ROI. The companies seeing the biggest gains aren't the ones with the most tech; they're the ones using it smartly.`,
    },
    academic: {
      instruction: `Rewrite as a real academic human would write — not an AI pretending to be academic. Mix formal precision with natural sentence variety. Real academics write short punchy claims between longer analytical sentences. Use "I argue", "I found", "This suggests" — not passive hedging.`,
      badExample: `It is important to note that the multifaceted nature of this paradigm necessitates a comprehensive examination of the underlying factors.`,
      goodExample: `The pattern here isn't subtle. I argue that these results point to a fundamental flaw in how we've been measuring this — one that three decades of studies have largely ignored.`,
    },
    creative: {
      instruction: `Rewrite with creative flair — vivid, surprising, alive. Use metaphors, sensory details, rhythm. Let some sentences run long and breathless. Cut others. Short. Like that. Grammar is a tool, not a law.`,
      badExample: `Technology has transformed the way humans interact with the world, creating unprecedented opportunities for innovation and growth.`,
      goodExample: `Tech didn't just change things — it rewired them. The way we talk, think, shop, fall in love. It's everywhere now, quiet and constant, like weather.`,
    },
    formal: {
      instruction: `Rewrite in a formal, authoritative register suitable for official reports or business documents. But written by a real human professional — not a machine. Short declarative sentences carry weight. Use them. Vary structure deliberately.`,
      badExample: `It is imperative that organizations implement comprehensive strategies to facilitate the seamless integration of emerging technologies.`,
      goodExample: `Organizations must act now. The window for easy adoption is closing — and the cost of delay is no longer theoretical. It shows up in the numbers.`,
    },
  };

  const config = toneConfigs[tone] || toneConfigs.professional;

  return `${config.instruction}

EXAMPLE — What NOT to write (AI-style):
"${config.badExample}"

EXAMPLE — What TO write (human-style):
"${config.goodExample}"

${UNIVERSAL_RULES}

Now rewrite this text:
---
${sanitized}
---`;
}

// ─────────────────────────────────────────────────────────────────────────
// HANDLER
// ─────────────────────────────────────────────────────────────────────────
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
  const validTones = ["professional", "casual", "academic", "creative", "formal"];
  const selectedTone = validTones.includes(tone) ? tone : "professional";

  const systemMessage = `You are a professional human ghostwriter with 15 years of experience making AI-generated text undetectable. You know every pattern that AI detectors look for, and you eliminate all of them. Your output always passes Originality.ai, GPTZero, Copyleaks, and Turnitin. You write like a real, intelligent human with a distinct voice — not a sanitized machine.`;

  const userMessage = buildPrompt(selectedTone, sanitized);

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
      temperature: 1.1,         // High temp = unpredictable = high perplexity = human-like
      top_p: 0.95,
      max_tokens: 3000,
      frequency_penalty: 0.6,   // Strongly penalize repeating the same words
      presence_penalty: 0.4,    // Encourage introducing new vocabulary
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
    }

    if (!apiRes.ok) {
      const errBody = await apiRes.text();
      console.error("Groq API error:", errBody);
      if (apiRes.status === 401) return res.status(502).json({ error: "Invalid API Key." });
      if (apiRes.status === 429) return res.status(429).json({ error: "Rate limit hit. Try again shortly." });
      return res.status(502).json({ error: `API error: ${errBody.slice(0, 200)}` });
    }

    const data = await apiRes.json();
    let rawOutput = data?.choices?.[0]?.message?.content || "";

    if (!rawOutput.trim())
      return res.status(502).json({ error: "Empty response from AI. Please try again." });

    // Strip any accidental preamble
    rawOutput = rawOutput
      .replace(/^(here(?:'s| is) the rewritten[^:\n]*[:\n]+)/i, "")
      .replace(/^(rewritten[^:\n]*[:\n]+)/i, "")
      .replace(/^(sure[,!]?\s*here[^\n]*\n)/i, "")
      .replace(/^(of course[,!]?\s*here[^\n]*\n)/i, "")
      .trim();

    // Apply post-processing: word substitution + human noise injection
    const result = postProcess(rawOutput);
    const humanityScore = estimateHumanityScore(result);

    return res.status(200).json({ result, humanityScore });

  } catch (err) {
    console.error("Humanize handler error:", err);
    return res.status(500).json({ error: "Internal server error. Please try again." });
  }
}
