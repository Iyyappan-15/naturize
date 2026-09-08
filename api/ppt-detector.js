// /api/ppt-detector.js — Naturize PowerPoint (.pptx) AI Precision Fusion Engine v3
// Calibrated with Layer 1 Statistical Fingerprinting, Layer 2 Forensic LLM, and Layer 3 Adaptive Fusion

import JSZip from 'jszip';
import checkRateLimit from '../utils/rateLimit.js';

function decodeXmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function extractTextFromXml(xmlString) {
  if (!xmlString) return '';
  const textMatches = [];
  const regex = /<a:t(?:\s+[^>]*)?>([\s\S]*?)<\/a:t>/gi;
  let match;
  while ((match = regex.exec(xmlString)) !== null) {
    if (match[1]) {
      textMatches.push(decodeXmlEntities(match[1]));
    }
  }
  return textMatches.join(' ').replace(/\s+/g, ' ').trim();
}

// True AI Syntactic Clichés (excluding domain nouns like tech stacks or model names)
const AI_CLICHE_LIST = [
  "delve into", "delve", "tapestry", "catalyst", "multifaceted",
  "unprecedented", "synergistic", "paradigm shift", "seamless integration",
  "holistic approach", "cutting-edge", "game-changer", "robust framework",
  "furthermore", "moreover", "in conclusion", "it is worth noting",
  "plays a crucial role", "pivotal role", "key takeaways", "fostering",
  "empower", "revolutionize", "invaluable", "testament to", "spearheaded",
  "dynamic landscape", "infallible fallback", "infallible", "streamlined",
  "transformative", "beacon of", "testament", "integral part",
  "cornerstone", "foster innovation", "unlock potential", "driving force",
  "realm of", "vast expanse", "elevate", "pinnacle", "harness the power",
  "embark on", "intertwined", "intricate", "pivotal", "paramount",
  "crucial aspect", "multifaceted approach", "ever-evolving", "at the forefront",
  "meticulous", "groundbreaking", "unravel", "deep dive"
];

function calculateDeckMetrics(slidesData) {
  const fullText = slidesData.map(s => (s.text + " " + s.notes)).join(" ");
  const words = fullText.split(/\s+/).filter(w => w.trim().length > 0);
  const totalWords = words.length;

  if (totalWords === 0) {
    return { totalWords: 0, statScore: 0, burstiness: 0, clicheHits: [], contractionCount: 0 };
  }

  // 1. Cliché matches
  const clicheHits = [];
  AI_CLICHE_LIST.forEach(phrase => {
    const regex = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    const matches = fullText.match(regex);
    if (matches && matches.length > 0) {
      clicheHits.push(phrase);
    }
  });

  // 2. Sentence & Bullet burstiness (length variance)
  const sentences = fullText.split(/(?<=[.!?])\s+(?=[A-Z0-9])|\n+/).filter(s => s.trim().split(/\s+/).length >= 3);
  const sentenceCount = Math.max(sentences.length, 1);
  const sentLengths = sentences.map(s => s.trim().split(/\s+/).length);
  const avgLen = sentLengths.reduce((a, b) => a + b, 0) / sentenceCount;
  const variance = sentLengths.reduce((a, b) => a + Math.pow(b - avgLen, 2), 0) / sentenceCount;
  const stdDev = Math.sqrt(variance);
  const burstiness = parseFloat(((stdDev / (avgLen || 1)) * 100).toFixed(1));

  // 3. Contractions (Human marker)
  const contractionMatches = fullText.match(/\b([a-zA-Z]+'t|[a-zA-Z]+'ve|[a-zA-Z]+'re|[a-zA-Z]+'ll|[a-zA-Z]+'d|[a-zA-Z]+'m)\b/gi) || [];
  const contractionCount = contractionMatches.length;

  // 4. Compute Statistical Score (0-100)
  let statScore = 38; // Neutral baseline

  // Clichés: strong weight
  if (clicheHits.length >= 6) statScore += 32;
  else if (clicheHits.length >= 4) statScore += 22;
  else if (clicheHits.length >= 2) statScore += 14;
  else if (clicheHits.length >= 1) statScore += 7;

  // Burstiness (Uniform sentence lengths = AI)
  if (burstiness < 15 && sentenceCount >= 5) statScore += 18;
  else if (burstiness < 25 && sentenceCount >= 4) statScore += 10;
  else if (burstiness >= 45) statScore -= 16;
  else if (burstiness >= 30) statScore -= 8;

  // Contractions (Human presence)
  if (contractionCount >= 4) statScore -= 18;
  else if (contractionCount >= 2) statScore -= 10;
  else if (contractionCount === 0 && totalWords > 150) statScore += 6;

  statScore = Math.max(5, Math.min(95, statScore));

  return {
    totalWords,
    statScore,
    burstiness,
    clicheHits,
    contractionCount,
    stdDev,
    avgLen
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // Rate Limiting (15 requests per minute per IP)
  const rateLimit = checkRateLimit(req, 15, 60000);
  if (!rateLimit.success) {
    return res.status(429).json({ error: 'Too many requests. Please try again in a minute.' });
  }

  const { slides: incomingSlides, fileBase64, filename = 'presentation.pptx' } = req.body || {};

  let slidesData = [];

  // Option 1: Direct client-side extracted slides
  if (Array.isArray(incomingSlides) && incomingSlides.length > 0) {
    slidesData = incomingSlides.map((s, idx) => {
      const text = typeof s.text === 'string' ? s.text.trim() : '';
      const notes = typeof s.notes === 'string' ? s.notes.trim() : '';
      const words = (text + ' ' + notes).split(/\s+/).filter(w => w.trim().length > 0);
      const wordCount = words.length;

      let title = s.title || `Slide ${s.slide_number || idx + 1}`;
      if (!s.title && text.length > 0) {
        const firstSentence = text.split(/[.\n\r]/)[0].trim();
        if (firstSentence.length > 0 && firstSentence.length < 70) {
          title = firstSentence;
        } else {
          title = text.slice(0, 50).trim() + (text.length > 50 ? '...' : '');
        }
      }

      return {
        slide_number: s.slide_number || idx + 1,
        title,
        text,
        notes,
        word_count: wordCount
      };
    });
  } 
  // Option 2: Fallback server-side unzipping
  else if (fileBase64 && typeof fileBase64 === 'string') {
    const base64Data = fileBase64.replace(/^data:.*?;base64,/, '');
    let buffer;
    try {
      buffer = Buffer.from(base64Data, 'base64');
    } catch (err) {
      return res.status(400).json({ error: 'Invalid file encoding.' });
    }

    if (buffer.length > 4.5 * 1024 * 1024) {
      return res.status(400).json({ error: 'File size exceeds server limits.' });
    }

    let zip;
    try {
      zip = await JSZip.loadAsync(buffer);
    } catch (err) {
      return res.status(400).json({ error: 'Could not read .pptx archive.' });
    }

    const slideEntries = [];
    zip.forEach((relativePath, file) => {
      const match = relativePath.match(/^ppt\/slides\/slide(\d+)\.xml$/i);
      if (match) {
        slideEntries.push({ num: parseInt(match[1], 10), file });
      }
    });

    if (slideEntries.length === 0) {
      return res.status(400).json({ error: 'No slides found in presentation.' });
    }

    slideEntries.sort((a, b) => a.num - b.num);

    for (const slide of slideEntries) {
      try {
        const xmlContent = await slide.file.async('string');
        const text = extractTextFromXml(xmlContent);

        let notesText = '';
        const notesFile = zip.file(`ppt/notesSlides/notesSlide${slide.num}.xml`);
        if (notesFile) {
          const notesXml = await notesFile.async('string');
          notesText = extractTextFromXml(notesXml);
        }

        const words = (text + ' ' + notesText).split(/\s+/).filter(w => w.trim().length > 0);
        let title = `Slide ${slide.num}`;
        if (text.length > 0) {
          const firstSentence = text.split(/[.\n\r]/)[0].trim();
          if (firstSentence.length > 0 && firstSentence.length < 70) {
            title = firstSentence;
          } else {
            title = text.slice(0, 50).trim() + (text.length > 50 ? '...' : '');
          }
        }

        slidesData.push({
          slide_number: slide.num,
          title,
          text,
          notes: notesText,
          word_count: words.length
        });
      } catch (e) {
        slidesData.push({
          slide_number: slide.num,
          title: `Slide ${slide.num}`,
          text: '',
          notes: '',
          word_count: 0
        });
      }
    }
  } else {
    return res.status(400).json({ error: 'No presentation content provided for analysis.' });
  }

  // Pre-compute metrics
  const metrics = calculateDeckMetrics(slidesData);
  const totalWords = metrics.totalWords;

  // Zero text edge case
  if (totalWords === 0) {
    return res.status(200).json({
      success: true,
      filename,
      total_slides: slidesData.length,
      total_words: 0,
      overall_classification: 'Insufficient Text',
      overall_score: 0,
      confidence_level: 'Low',
      confidence_reason: 'No readable text was found across all slides.',
      reasoning: 'The presentation contains slides, but no extractable text was found.',
      slides: slidesData.map(s => ({
        ...s,
        ai_score: 0,
        verdict: 'No Text',
        key_signals: ['No text found']
      })),
      ai_signals: [],
      human_signals: []
    });
  }

  // Low text edge case
  if (totalWords < 30) {
    return res.status(200).json({
      success: true,
      filename,
      total_slides: slidesData.length,
      total_words: totalWords,
      overall_classification: 'Uncertain / Low Sample',
      overall_score: metrics.statScore,
      confidence_level: 'Low',
      confidence_reason: `Only ${totalWords} words found in deck. AI detectors require at least 30-50 words for high accuracy.`,
      reasoning: 'The deck has very short bullet points. Statistical patterns cannot be determined conclusively on minimal word samples.',
      slides: slidesData.map(s => ({
        ...s,
        ai_score: s.word_count > 0 ? metrics.statScore : 0,
        verdict: 'Low Text',
        key_signals: ['Sample size too small']
      })),
      ai_signals: metrics.clicheHits,
      human_signals: ['Low sample size']
    });
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey || groqKey.trim() === '') {
    return res.status(500).json({ error: 'Server configuration error: Missing AI provider credentials.' });
  }

  // Construct structured text summary for LLM
  let deckTextForPrompt = '';
  slidesData.forEach(s => {
    deckTextForPrompt += `\n--- SLIDE ${s.slide_number}: "${s.title}" (${s.word_count} words) ---\n`;
    if (s.text) deckTextForPrompt += `Slide Content: ${s.text}\n`;
    if (s.notes) deckTextForPrompt += `Speaker Notes: ${s.notes}\n`;
  });
  deckTextForPrompt = deckTextForPrompt.slice(0, 12000);

  const systemPrompt = `You are a forensic AI vs. Human text analysis engine specializing in presentation slide decks and project proposals.
Your task is to analyze the text of the slides and determine whether they were written by a human or generated by an AI model (such as ChatGPT, Claude, or Gemini).

━━━ CRITICAL DETECTION RULES ━━━
1. DO NOT flag technical tool names (e.g. "FastAPI", "Docker", "Python", "Sentinel-2", "Mask2Former", "React") as AI signals! Humans naturally list their technical tools and dataset names in presentations.
2. AI SIGNALS TO LOOK FOR:
   - Overly grand, robotic phrases: "delve", "catalyst", "tapestry", "multifaceted", "seamless integration", "robust framework", "furthermore", "fostering", "revolutionary paradigm", "in conclusion"
   - Symmetrical, robotic bullet phrasing with uniform length and zero informal notes
   - Vague corporate fluff with no specific team context
3. HUMAN SIGNALS TO LOOK FOR:
   - Natural, conversational notes, informal shorthand, irregular bullet structures
   - Direct personal project context, specific trade-offs, authentic problem formulation

━━━ PRE-COMPUTED STATISTICAL DATA ━━━
- Pre-computed Statistical Score: ${metrics.statScore}/100
- Burstiness (Sentence length variance): ${metrics.burstiness}% ${metrics.burstiness >= 30 ? "(High -> Likely Human)" : "(Low -> Likely AI)"}
- Contractions found: ${metrics.contractionCount}
- AI Clichés found (${metrics.clicheHits.length}): ${metrics.clicheHits.length > 0 ? '"' + metrics.clicheHits.join('", "') + '"' : "None"}

Return ONLY valid JSON matching this schema:
{
  "classification": "AI Generated" | "Human Written" | "Mixed / Uncertain",
  "confidence": <integer 50-98 indicating confidence in verdict>,
  "reasoning": "<2-3 sentences explaining exactly why this deck is classified as AI, Human, or Mixed>",
  "ai_signals": [<up to 4 specific quoted AI phrases or structural template patterns, NOT simple tool names>],
  "human_signals": [<up to 4 specific human writing traits or authentic patterns>],
  "slides_breakdown": [
    {
      "slide_number": <integer>,
      "ai_score": <integer 0-100>,
      "verdict": "AI" | "Human" | "Uncertain" | "Low Text",
      "key_signals": [<1-2 short bullet observations>]
    }
  ]
}`;

  const makeRequest = async (model) =>
    fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqKey.trim()}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Analyze this presentation deck:\n\n${deckTextForPrompt}` }
        ],
        temperature: 0.1,
        max_tokens: 2500,
        response_format: { type: 'json_object' }
      })
    });

  try {
    let apiRes = await makeRequest('openai/gpt-oss-120b');
    if (!apiRes.ok) {
      console.warn('120b model failed in ppt-detector, falling back to 20b...');
      apiRes = await makeRequest('openai/gpt-oss-20b');
    }

    if (!apiRes.ok) {
      const errBody = await apiRes.text();
      console.error('Groq API error in ppt-detector:', apiRes.status, errBody);
      return res.status(502).json({ error: 'Failed to connect to AI analysis engine. Please try again.' });
    }

    const data = await apiRes.json();
    const rawContent = data.choices?.[0]?.message?.content;

    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch (parseErr) {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse AI detection JSON response');
      }
    }

    // LAYER 3: ADAPTIVE WEIGHTED FUSION
    const llmIsAI = parsed.classification === "AI Generated";
    const llmIsHuman = parsed.classification === "Human Written";
    const llmIsUncertain = parsed.classification === "Mixed / Uncertain" || parsed.classification === "Uncertain";
    const llmConf = Math.max(50, Math.min(98, parseInt(parsed.confidence, 10) || 65));

    let llmAiProb;
    if (llmIsAI) llmAiProb = llmConf;
    else if (llmIsHuman) llmAiProb = 100 - llmConf;
    else llmAiProb = 50;

    let llmWeight = 0.60;
    let statWeight = 0.40;
    if (llmIsUncertain) {
      llmWeight = 0.35;
      statWeight = 0.65;
    } else if (llmConf >= 85) {
      llmWeight = 0.70;
      statWeight = 0.30;
    }

    let fusedAiScore = Math.round((metrics.statScore * statWeight) + (llmAiProb * llmWeight));

    // Hard override rules based on objective signals
    if (metrics.clicheHits.length >= 4 && metrics.burstiness < 15 && metrics.contractionCount === 0) {
      fusedAiScore = Math.max(fusedAiScore, 78);
    }
    if (metrics.clicheHits.length === 0 && metrics.burstiness >= 35 && metrics.contractionCount >= 2 && llmIsHuman) {
      fusedAiScore = Math.min(fusedAiScore, 24);
    }

    fusedAiScore = Math.max(5, Math.min(98, fusedAiScore));

    let finalClassification;
    if (fusedAiScore >= 58) {
      finalClassification = 'AI Generated';
    } else if (fusedAiScore <= 42) {
      finalClassification = 'Human Written';
    } else {
      finalClassification = 'Mixed / Uncertain';
    }

    // Merge slide breakdown
    const slideBreakdownMap = new Map();
    if (Array.isArray(parsed.slides_breakdown)) {
      parsed.slides_breakdown.forEach(sb => {
        slideBreakdownMap.set(sb.slide_number, sb);
      });
    }

    const mergedSlides = slidesData.map(s => {
      const breakdown = slideBreakdownMap.get(s.slide_number) || {};
      let slideScore = typeof breakdown.ai_score === 'number' ? breakdown.ai_score : fusedAiScore;

      const slideLower = (s.text + " " + s.notes).toLowerCase();
      const hasCliche = AI_CLICHE_LIST.some(c => slideLower.includes(c));
      if (hasCliche && slideScore < 60) {
        slideScore = Math.min(90, slideScore + 20);
      }

      let verdict = breakdown.verdict || (slideScore >= 58 ? 'AI' : (slideScore <= 42 ? 'Human' : 'Uncertain'));
      if (s.word_count < 10) {
        verdict = 'Low Text';
        slideScore = Math.min(slideScore, 25);
      }

      return {
        ...s,
        ai_score: slideScore,
        verdict,
        key_signals: Array.isArray(breakdown.key_signals) ? breakdown.key_signals : []
      };
    });

    // Combine detected AI signals cleanly (filter out bare technical terms)
    let cleanAiSignals = Array.isArray(parsed.ai_signals) ? parsed.ai_signals : [];
    cleanAiSignals = cleanAiSignals.filter(sig => {
      const lower = sig.toLowerCase();
      // Drop signals that are just tool names
      if (/^(fastapi|docker|python|sentinel|landsat|mongodb|react|git)$/i.test(sig.trim())) return false;
      return true;
    });

    metrics.clicheHits.slice(0, 3).forEach(cliche => {
      const formatted = `AI Cliché: "${cliche}"`;
      if (!cleanAiSignals.some(s => s.toLowerCase().includes(cliche))) {
        cleanAiSignals.unshift(formatted);
      }
    });

    return res.status(200).json({
      success: true,
      filename,
      total_slides: slidesData.length,
      total_words: totalWords,
      overall_classification: finalClassification,
      overall_score: fusedAiScore,
      confidence_level: totalWords > 250 ? 'High' : (totalWords > 80 ? 'Moderate' : 'Low'),
      confidence_reason: `Precision fusion evaluated ${totalWords} words across ${slidesData.length} slides using burstiness variance (${metrics.burstiness}%) and syntactic markers.`,
      reasoning: parsed.reasoning || `Evaluated linguistic variance, phrase authenticity, and slide composition.`,
      ai_signals: cleanAiSignals,
      human_signals: Array.isArray(parsed.human_signals) ? parsed.human_signals : [],
      slides: mergedSlides
    });
  } catch (err) {
    console.error('PPT detector handler exception:', err);
    return res.status(500).json({
      error: 'An unexpected error occurred while analyzing the presentation. Please try again.'
    });
  }
}
