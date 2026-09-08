// /api/ppt-detector.js — Naturize PowerPoint (.pptx) AI Precision Detection Engine v2
// Two-Layer Hybrid Architecture:
// Layer 1: Forensic Presentation Statistical Fingerprinting (Cliché density, bullet uniformity, colon patterns)
// Layer 2: LLM Presentation Analysis with explicit calibration against AI-generated hackathon / pitch deck templates
// Layer 3: Weighted Calibration Fusion

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

// Comprehensive Presentation AI Clichés & Synthetic Markers
const PRESENTATION_AI_CLICHES = [
  "delve into", "delve", "tapestry", "catalyst", "multifaceted",
  "unprecedented", "synergistic", "paradigm shift", "seamless integration",
  "holistic approach", "cutting-edge", "game-changer", "robust framework",
  "furthermore", "moreover", "in conclusion", "it is worth noting",
  "plays a crucial role", "pivotal role", "key takeaways", "fostering",
  "empower", "revolutionize", "invaluable", "testament to", "spearheaded",
  "dynamic landscape", "synthetic pre-training", "infallible fallback",
  "infallible", "zero-cost", "streamlined", "leveraging", "leverage",
  "transformative", "beacon of", "testament", "integral part",
  "cornerstone", "foster innovation", "unlock potential", "driving force",
  "realm of", "vast expanse", "elevate", "pinnacle", "harness the power",
  "embark on", "intertwined", "intricate", "pivotal", "paramount",
  "crucial aspect", "multifaceted approach", "ever-evolving", "at the forefront",
  "meticulous", "groundbreaking", "unravel", "deep dive"
];

function analyzeDeckStatistics(slidesData, totalWords) {
  const fullText = slidesData.map(s => (s.text + " " + s.notes)).join(" ");
  const lowerFull = fullText.toLowerCase();

  // 1. Cliché detection
  const detectedCliches = [];
  PRESENTATION_AI_CLICHES.forEach(phrase => {
    const regex = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    const matches = fullText.match(regex);
    if (matches && matches.length > 0) {
      detectedCliches.push({ phrase, count: matches.length });
    }
  });

  const totalClicheHits = detectedCliches.reduce((acc, c) => acc + c.count, 0);

  // 2. Sentence & bullet count & lengths
  const sentences = fullText.split(/(?<=[.!?])\s+(?=[A-Z0-9])|\n+/).filter(s => s.trim().split(/\s+/).length >= 3);
  const sentenceCount = Math.max(sentences.length, 1);
  const sentLengths = sentences.map(s => s.trim().split(/\s+/).length);
  const avgLen = sentLengths.reduce((a, b) => a + b, 0) / sentenceCount;
  const variance = sentLengths.reduce((a, b) => a + Math.pow(b - avgLen, 2), 0) / sentenceCount;
  const stdDev = Math.sqrt(variance);
  const burstiness = parseFloat(((stdDev / (avgLen || 1)) * 100).toFixed(1));

  // 3. Contractions (Human signal)
  const contractionMatches = fullText.match(/\b([a-zA-Z]+'t|[a-zA-Z]+'ve|[a-zA-Z]+'re|[a-zA-Z]+'ll|[a-zA-Z]+'d|[a-zA-Z]+'m)\b/gi) || [];
  const contractionCount = contractionMatches.length;

  // 4. Overly structured colon headers (e.g., "Architecture: High Performance Engine")
  const colonHeaders = (fullText.match(/[A-Z][a-zA-Z0-9\s]{2,30}:\s+[A-Z]/g) || []).length;
  const colonRatio = colonHeaders / Math.max(slidesData.length, 1);

  // 5. Compute base statistical score (0-100)
  let statScore = 45; // Neutral start

  // Clichés: strong weight
  if (totalClicheHits >= 8) statScore += 35;
  else if (totalClicheHits >= 5) statScore += 26;
  else if (totalClicheHits >= 3) statScore += 18;
  else if (totalClicheHits >= 1) statScore += 10;

  // Uniform sentence length (low burstiness is classic AI)
  if (burstiness < 20 && sentenceCount >= 6) statScore += 16;
  else if (burstiness < 30 && sentenceCount >= 4) statScore += 10;
  else if (burstiness >= 50) statScore -= 14;

  // Colon pattern density
  if (colonRatio > 1.2) statScore += 12;
  else if (colonRatio > 0.6) statScore += 6;

  // Contractions (Human)
  if (contractionCount >= 4) statScore -= 18;
  else if (contractionCount >= 2) statScore -= 10;
  else if (contractionCount === 0 && totalWords > 200) statScore += 8;

  statScore = Math.max(5, Math.min(95, statScore));

  return {
    statScore,
    detectedCliches: detectedCliches.map(c => c.phrase),
    burstiness,
    totalClicheHits,
    contractionCount
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
  let totalWords = 0;

  // Client-side extracted slides
  if (Array.isArray(incomingSlides) && incomingSlides.length > 0) {
    slidesData = incomingSlides.map((s, idx) => {
      const text = typeof s.text === 'string' ? s.text.trim() : '';
      const notes = typeof s.notes === 'string' ? s.notes.trim() : '';
      const words = (text + ' ' + notes).split(/\s+/).filter(w => w.trim().length > 0);
      const wordCount = words.length;
      totalWords += wordCount;

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
  // Fallback server-side unzipping
  else if (fileBase64 && typeof fileBase64 === 'string') {
    const base64Data = fileBase64.replace(/^data:.*?;base64,/, '');
    let buffer;
    try {
      buffer = Buffer.from(base64Data, 'base64');
    } catch (err) {
      return res.status(400).json({ error: 'Invalid file encoding. Could not process uploaded file.' });
    }

    if (buffer.length > 4.5 * 1024 * 1024) {
      return res.status(400).json({
        error: 'File size exceeds server limits. Please upload via client extractor.'
      });
    }

    let zip;
    try {
      zip = await JSZip.loadAsync(buffer);
    } catch (err) {
      return res.status(400).json({
        error: 'Could not read presentation file. Please ensure it is a valid .pptx file.'
      });
    }

    const slideEntries = [];
    zip.forEach((relativePath, file) => {
      const match = relativePath.match(/^ppt\/slides\/slide(\d+)\.xml$/i);
      if (match) {
        slideEntries.push({
          num: parseInt(match[1], 10),
          path: relativePath,
          file
        });
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
        const slideWordCount = words.length;
        totalWords += slideWordCount;

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
          word_count: slideWordCount
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

  // Edge Case: 0 words
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
        key_signals: ['No readable text found on slide']
      })),
      ai_signals: [],
      human_signals: []
    });
  }

  // Run Statistical Engine
  const stats = analyzeDeckStatistics(slidesData, totalWords);

  // Sparse text check
  if (totalWords < 30) {
    return res.status(200).json({
      success: true,
      filename,
      total_slides: slidesData.length,
      total_words: totalWords,
      overall_classification: 'Uncertain / Low Sample',
      overall_score: stats.statScore,
      confidence_level: 'Low',
      confidence_reason: `Only ${totalWords} words found in deck. AI detectors require at least 30-50 words for high accuracy.`,
      reasoning: 'The deck has very sparse text. Statistical patterns cannot be determined conclusively on minimal word samples.',
      slides: slidesData.map(s => ({
        ...s,
        ai_score: s.word_count > 0 ? stats.statScore : 0,
        verdict: 'Low Text',
        key_signals: ['Sample size too small for confident classification']
      })),
      ai_signals: stats.detectedCliches,
      human_signals: ['Insufficient word count']
    });
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey || groqKey.trim() === '') {
    return res.status(500).json({ error: 'Server configuration error: Missing AI provider credentials.' });
  }

  let deckTextForPrompt = '';
  slidesData.forEach(s => {
    deckTextForPrompt += `\n--- SLIDE ${s.slide_number}: "${s.title}" (${s.word_count} words) ---\n`;
    if (s.text) deckTextForPrompt += `Slide Content: ${s.text}\n`;
    if (s.notes) deckTextForPrompt += `Speaker Notes: ${s.notes}\n`;
  });

  deckTextForPrompt = deckTextForPrompt.slice(0, 12000);

  const systemPrompt = `You are a strict, forensic AI detection engine specialized in PowerPoint slide decks, hackathon submissions, and technical pitch decks (e.g. Smart India Hackathon / SIH, startup proposals, academic decks).

CRITICAL CALIBRATION DIRECTIVE:
Modern AI models (ChatGPT, Claude, Gemini) frequently generate entire technical proposal presentations containing:
- Specific technical architectures (FastAPI, Celery, Docker, PyTorch, LoRA, React, MongoDB, etc.)
- Fabricated or generalized cost estimates ($15K-30K, ₹5 Lakhs, 40% reduction, ROI metrics)
- Structured academic citation lists (Author, Year, Journal)
- Formulaic slide progression (Problem Statement -> Solution -> Technical Feasibility -> Business Model -> Impact)
- Synthetic high-sounding phrases: "Zero-Cost Orbital Data", "Synthetic Pre-Training", "Infallible fallback", "Holistic framework", "Cutting-edge paradigm"

DO NOT BE FOOLED: Technical keywords, cost numbers, and citations are standard ChatGPT template outputs!
If the writing features formulaic bullet points, symmetrical phrasing, textbook corporate cadence, and typical AI vocabulary ("leveraging", "delve", "catalyst", "seamless integration", "robust framework"), you MUST classify it as AI Generated.

True human presentations feature:
- Informal notes, typos, non-symmetrical bullet styles, organic abbreviations, messy bullet phrasing
- Direct personal team anecdotes or specific non-generic organizational context

Return ONLY valid JSON matching this schema with ZERO surrounding markdown:
{
  "llm_score": <integer 0-100 indicating probability of AI generation>,
  "verdict": "AI Generated" | "Human Written" | "Mixed / Uncertain",
  "reasoning": "<2-3 sentences explaining exactly why this deck is AI or Human, specifically noting formulaic template structure or authentic cadence>",
  "ai_signals": [<up to 4 specific quoted AI phrases or structural template patterns detected>],
  "human_signals": [<up to 4 specific human writing traits or organic patterns detected>],
  "slides_breakdown": [
    {
      "slide_number": <integer>,
      "ai_score": <integer 0-100>,
      "verdict": "AI" | "Human" | "Uncertain" | "Low Text",
      "key_signals": [<1-2 short bullet observations for this slide>]
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
          { role: 'user', content: `Analyze this presentation deck thoroughly:\n\n${deckTextForPrompt}` }
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

    let analysis;
    try {
      analysis = JSON.parse(rawContent);
    } catch (parseErr) {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse AI detection JSON response');
      }
    }

    const llmScore = Math.min(100, Math.max(0, parseInt(analysis.llm_score, 10) || 50));

    // LAYER 3: FUSION ENGINE (50% Statistical + 50% LLM with Hard Overrides)
    let finalScore = Math.round((stats.statScore * 0.45) + (llmScore * 0.55));

    // Override 1: If 4+ AI clichés detected -> minimum 75% AI
    if (stats.totalClicheHits >= 4) {
      finalScore = Math.max(finalScore, 78);
    } else if (stats.totalClicheHits >= 2) {
      finalScore = Math.max(finalScore, 65);
    }

    // Override 2: If LLM is decisive AI (>= 75) and statistical score is >= 50 -> force strong AI score
    if (llmScore >= 75 && stats.statScore >= 50) {
      finalScore = Math.max(finalScore, 82);
    }

    // Override 3: If zero clichés, contractions present, and high burstiness -> force Human score
    if (stats.totalClicheHits === 0 && stats.contractionCount >= 2 && stats.burstiness >= 40 && llmScore <= 40) {
      finalScore = Math.min(finalScore, 25);
    }

    let overallClassification = 'Mixed / Uncertain';
    if (finalScore >= 60) {
      overallClassification = 'AI Generated';
    } else if (finalScore <= 35) {
      overallClassification = 'Human Written';
    }

    // Merge slide breakdown
    const slideBreakdownMap = new Map();
    if (Array.isArray(analysis.slides_breakdown)) {
      analysis.slides_breakdown.forEach(sb => {
        slideBreakdownMap.set(sb.slide_number, sb);
      });
    }

    const mergedSlides = slidesData.map(s => {
      const breakdown = slideBreakdownMap.get(s.slide_number) || {};
      let slideAiScore = typeof breakdown.ai_score === 'number' ? breakdown.ai_score : finalScore;

      // Adjust slide score with cliché checks on that specific slide
      const slideLower = (s.text + " " + s.notes).toLowerCase();
      const hasCliche = PRESENTATION_AI_CLICHES.some(c => slideLower.includes(c));
      if (hasCliche) {
        slideAiScore = Math.max(slideAiScore, 70);
      }

      let verdict = breakdown.verdict || (slideAiScore >= 60 ? 'AI' : (slideAiScore <= 35 ? 'Human' : 'Uncertain'));
      if (s.word_count < 10) {
        verdict = 'Low Text';
        slideAiScore = Math.min(slideAiScore, 30);
      }

      return {
        ...s,
        ai_score: slideAiScore,
        verdict,
        key_signals: Array.isArray(breakdown.key_signals) ? breakdown.key_signals : []
      };
    });

    // Combine detected AI signals from both statistical engine and LLM
    const combinedAiSignals = [...(analysis.ai_signals || [])];
    stats.detectedCliches.forEach(cliche => {
      const formatted = `AI Cliché: "${cliche}"`;
      if (!combinedAiSignals.includes(formatted) && combinedAiSignals.length < 5) {
        combinedAiSignals.unshift(formatted);
      }
    });

    return res.status(200).json({
      success: true,
      filename,
      total_slides: slidesData.length,
      total_words: totalWords,
      overall_classification: overallClassification,
      overall_score: finalScore,
      confidence_level: totalWords > 250 ? 'High' : (totalWords > 80 ? 'Moderate' : 'Low'),
      confidence_reason: `Precision fusion evaluated ${totalWords} words across ${slidesData.length} slides against synthetic presentation patterns.`,
      reasoning: analysis.reasoning || `Deck evaluated using statistical burstiness (${stats.burstiness}%), formulaic phrasing, and semantic template checks.`,
      ai_signals: combinedAiSignals,
      human_signals: Array.isArray(analysis.human_signals) ? analysis.human_signals : [],
      slides: mergedSlides
    });
  } catch (err) {
    console.error('PPT detector handler exception:', err);
    return res.status(500).json({
      error: 'An unexpected error occurred while analyzing the presentation. Please try again.'
    });
  }
}
