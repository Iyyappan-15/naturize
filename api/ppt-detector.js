// /api/ppt-detector.js — Naturize PowerPoint (.pptx) AI Detector
// Extracts text & speaker notes from OOXML slides and evaluates AI vs Human writing

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
  
  // Extract all text inside <a:t>...</a:t> or <a:t xml:space="...">...</a:t>
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

  const { fileBase64, filename = 'presentation.pptx' } = req.body || {};

  if (!fileBase64 || typeof fileBase64 !== 'string') {
    return res.status(400).json({ error: 'No PowerPoint file provided. Please upload a valid .pptx file.' });
  }

  // Strip possible data URI header
  const base64Data = fileBase64.replace(/^data:.*?;base64,/, '');

  let buffer;
  try {
    buffer = Buffer.from(base64Data, 'base64');
  } catch (err) {
    return res.status(400).json({ error: 'Invalid file encoding. Could not process uploaded file.' });
  }

  // Size limit check: 4.5MB raw buffer
  if (buffer.length > 4.5 * 1024 * 1024) {
    return res.status(400).json({
      error: 'File size exceeds 4.5MB limit. Please compress images in your PowerPoint and try again.'
    });
  }

  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (err) {
    return res.status(400).json({
      error: 'Could not read presentation file. Please ensure it is an unencrypted .pptx file (older .ppt formats are not supported).'
    });
  }

  // Identify all slide XML files in ppt/slides/
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
    return res.status(400).json({
      error: 'No slides found in the uploaded file. Please make sure this is a valid PowerPoint (.pptx) deck.'
    });
  }

  // Sort slides in numerical order (slide1, slide2, ..., slide10)
  slideEntries.sort((a, b) => a.num - b.num);

  const slidesData = [];
  let totalWords = 0;

  for (const slide of slideEntries) {
    try {
      const xmlContent = await slide.file.async('string');
      const text = extractTextFromXml(xmlContent);

      // Check for associated notes slide
      // Look for ppt/notesSlides/notesSlide{N}.xml or relationship
      let notesText = '';
      const notesFile = zip.file(`ppt/notesSlides/notesSlide${slide.num}.xml`);
      if (notesFile) {
        const notesXml = await notesFile.async('string');
        notesText = extractTextFromXml(notesXml);
      }

      const words = (text + ' ' + notesText).split(/\s+/).filter(w => w.trim().length > 0);
      const slideWordCount = words.length;
      totalWords += slideWordCount;

      // Infer title from the first ~60 characters or first clause of text
      let title = `Slide ${slide.num}`;
      if (text.length > 0) {
        const firstSentence = text.split(/[.\n\r]/)[0].trim();
        if (firstSentence.length > 0 && firstSentence.length < 70) {
          title = firstSentence;
        } else if (text.length > 0) {
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
      console.error(`Error processing slide ${slide.num}:`, e);
      slidesData.push({
        slide_number: slide.num,
        title: `Slide ${slide.num}`,
        text: '',
        notes: '',
        word_count: 0
      });
    }
  }

  // Edge Case: Entire presentation has 0 or minimal words
  if (totalWords === 0) {
    return res.status(200).json({
      success: true,
      filename,
      total_slides: slidesData.length,
      total_words: 0,
      overall_classification: 'Insufficient Text',
      overall_score: 0,
      confidence_level: 'Low',
      confidence_reason: 'No readable text was found across all slides. The presentation may contain only screenshots or images.',
      reasoning: 'The file contains presentation slides, but no extractable text was found in shapes, text boxes, or speaker notes.',
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

  if (totalWords < 30) {
    return res.status(200).json({
      success: true,
      filename,
      total_slides: slidesData.length,
      total_words: totalWords,
      overall_classification: 'Uncertain / Low Sample',
      overall_score: 15,
      confidence_level: 'Low',
      confidence_reason: `Only ${totalWords} words found in the entire deck. AI detectors require at least 30-50 words for reliable analysis.`,
      reasoning: 'The deck has very short bullet points or sparse text. Statistical patterns cannot be determined reliably on small word samples.',
      slides: slidesData.map(s => ({
        ...s,
        ai_score: s.word_count > 0 ? 20 : 0,
        verdict: 'Low Text',
        key_signals: ['Sample size too small for confident analysis']
      })),
      ai_signals: [],
      human_signals: ['Insufficient sample size for AI verdict']
    });
  }

  // Prepare LLM analysis payload
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

  // Bound prompt size to prevent exceeding token limit
  deckTextForPrompt = deckTextForPrompt.slice(0, 12000);

  const systemPrompt = `You are a forensic AI detection engine specialized in PowerPoint presentation decks.
Analyze the provided slide deck text and speaker notes. Evaluate whether the content was generated by an AI LLM (ChatGPT, Claude, Gemini, etc.) or written by a human.

Detect key AI markers in presentation decks:
- Predictable robotic phrasing: "In conclusion", "It is important to note", "Key takeaways", "Delve into", "Tapestry", "Catalyst"
- Overly uniform 3-part bullet lists with identical grammatical structures
- Generic high-level corporate buzzwords lacking specific context or personal data
- Synthetic, textbook-style speaker notes

Detect human markers:
- Authentic conversational cadence, informal notes, typos, specific personal/company jargon
- Irregular bullet styles, organic abbreviations, real-world data points

Return ONLY valid JSON matching this exact schema with zero markdown wrapping:
{
  "overall_classification": "AI Generated" | "Human Written" | "Mixed / Uncertain",
  "overall_score": <integer 0-100 indicating probability of AI generation>,
  "confidence_level": "High" | "Moderate" | "Low",
  "confidence_reason": "<1 sentence explaining confidence based on total word count and signal clarity>",
  "reasoning": "<2-3 sentences explaining the overarching evaluation of the deck>",
  "ai_signals": [<array of up to 4 specific quoted AI phrases or stylistic patterns detected>],
  "human_signals": [<array of up to 4 specific human writing traits or data patterns detected>],
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
          { role: 'user', content: `Analyze this PowerPoint deck:\n\n${deckTextForPrompt}` }
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
      return res.status(502).json({ error: 'Failed to connect to AI analysis engine. Please try again in a moment.' });
    }

    const data = await apiRes.json();
    const rawContent = data.choices?.[0]?.message?.content;

    let analysis;
    try {
      analysis = JSON.parse(rawContent);
    } catch (parseErr) {
      // Fallback regex extractor if LLM added formatting
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse AI detection JSON response');
      }
    }

    // Merge slide breakdown with extracted slide text & metadata
    const slideBreakdownMap = new Map();
    if (Array.isArray(analysis.slides_breakdown)) {
      analysis.slides_breakdown.forEach(sb => {
        slideBreakdownMap.set(sb.slide_number, sb);
      });
    }

    const mergedSlides = slidesData.map(s => {
      const breakdown = slideBreakdownMap.get(s.slide_number) || {};
      return {
        ...s,
        ai_score: typeof breakdown.ai_score === 'number' ? breakdown.ai_score : (s.word_count < 10 ? 0 : analysis.overall_score),
        verdict: breakdown.verdict || (s.word_count < 10 ? 'Low Text' : (analysis.overall_score > 60 ? 'AI' : 'Human')),
        key_signals: Array.isArray(breakdown.key_signals) ? breakdown.key_signals : []
      };
    });

    return res.status(200).json({
      success: true,
      filename,
      total_slides: slidesData.length,
      total_words: totalWords,
      overall_classification: analysis.overall_classification || (analysis.overall_score >= 60 ? 'AI Generated' : 'Human Written'),
      overall_score: Math.min(100, Math.max(0, parseInt(analysis.overall_score, 10) || 0)),
      confidence_level: analysis.confidence_level || (totalWords > 250 ? 'High' : (totalWords > 80 ? 'Moderate' : 'Low')),
      confidence_reason: analysis.confidence_reason || `Analysis based on ${totalWords} words across ${slidesData.length} slides.`,
      reasoning: analysis.reasoning || 'Evaluated linguistic patterns, bullet point uniformity, and speaker note composition.',
      ai_signals: Array.isArray(analysis.ai_signals) ? analysis.ai_signals : [],
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
