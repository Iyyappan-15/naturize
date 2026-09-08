// /api/ppt-image-detector.js — Naturize Presentation Image AI Detector
// Uses Sightengine GenAI model to detect whether embedded slide images are AI-generated (Midjourney, DALL-E, etc.)

import checkRateLimit from '../utils/rateLimit.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // Rate Limiting (30 image checks per minute per IP)
  const rateLimit = checkRateLimit(req, 30, 60000);
  if (!rateLimit.success) {
    return res.status(429).json({ error: 'Too many image requests. Please wait a moment.' });
  }

  const { images } = req.body || {};

  if (!Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ error: 'No images provided for analysis.' });
  }

  const apiUser = process.env.SIGHTENGINE_API_USER;
  const apiSecret = process.env.SIGHTENGINE_API_SECRET;

  if (!apiUser || !apiSecret || apiUser.trim() === '' || apiSecret.trim() === '') {
    return res.status(200).json({
      success: true,
      configured: false,
      message: 'Sightengine API key not configured yet. Visual scan running in preview mode.',
      results: images.map(img => ({
        id: img.id,
        slide_number: img.slide_number,
        filename: img.filename,
        ai_score: 10,
        verdict: 'Unchecked (API Key Required)',
        generator: 'Unknown'
      }))
    });
  }

  // Cap max images per single request to 6 to preserve user quota and prevent timeouts
  const imagesToProcess = images.slice(0, 6);
  const results = [];

  for (const item of imagesToProcess) {
    try {
      if (!item.base64) {
        continue;
      }

      const cleanBase64 = item.base64.replace(/^data:image\/[a-z0-9]+;base64,/i, '');
      const buffer = Buffer.from(cleanBase64, 'base64');

      // Create native FormData payload for Sightengine
      const formData = new FormData();
      const blob = new Blob([buffer], { type: item.mimeType || 'image/png' });
      formData.append('media', blob, item.filename || 'slide_image.png');
      formData.append('models', 'genai');
      formData.append('api_user', apiUser.trim());
      formData.append('api_secret', apiSecret.trim());

      const apiRes = await fetch('https://api.sightengine.com/1.0/check.json', {
        method: 'POST',
        body: formData
      });

      if (!apiRes.ok) {
        const errText = await apiRes.text();
        console.error('Sightengine API error:', apiRes.status, errText);
        results.push({
          id: item.id,
          slide_number: item.slide_number,
          filename: item.filename,
          ai_score: 0,
          verdict: 'Error',
          generator: 'Check failed'
        });
        continue;
      }

      const data = await apiRes.json();
      
      // Extract AI probability (0 to 1 -> convert to percentage 0-100)
      const aiProbability = typeof data.type?.ai_generated === 'number'
        ? Math.round(data.type.ai_generated * 100)
        : 0;

      // Determine top generator attribution
      let topGenerator = 'Unknown / Real';
      if (data.type_detail && typeof data.type_detail === 'object') {
        let maxVal = 0;
        for (const [gen, val] of Object.entries(data.type_detail)) {
          if (typeof val === 'number' && val > maxVal) {
            maxVal = val;
            topGenerator = formatGeneratorName(gen);
          }
        }
      }

      let verdict = 'Human / Real Photo';
      if (aiProbability >= 65) {
        verdict = 'AI Generated';
      } else if (aiProbability >= 40) {
        verdict = 'Likely AI / Enhanced';
      }

      results.push({
        id: item.id,
        slide_number: item.slide_number,
        filename: item.filename,
        ai_score: aiProbability,
        verdict,
        generator: aiProbability >= 40 ? topGenerator : 'Real Photo / Diagram'
      });

    } catch (err) {
      console.error('Error analyzing image item:', err);
      results.push({
        id: item.id,
        slide_number: item.slide_number,
        filename: item.filename,
        ai_score: 0,
        verdict: 'Skipped',
        generator: 'Unknown'
      });
    }
  }

  // Calculate overall visual AI score
  const validScores = results.filter(r => r.verdict !== 'Error' && r.verdict !== 'Skipped');
  const avgVisualAiScore = validScores.length > 0
    ? Math.round(validScores.reduce((acc, r) => acc + r.ai_score, 0) / validScores.length)
    : 0;

  return res.status(200).json({
    success: true,
    configured: true,
    total_images_analyzed: results.length,
    overall_visual_ai_score: avgVisualAiScore,
    visual_verdict: avgVisualAiScore >= 60 ? 'AI Generated Visuals' : (avgVisualAiScore >= 35 ? 'Mixed / Augmented Visuals' : 'Human / Real Photos'),
    images: results
  });
}

function formatGeneratorName(key) {
  const map = {
    midjourney: 'Midjourney',
    dall_e: 'DALL-E',
    stable_diffusion: 'Stable Diffusion',
    flux: 'Flux',
    adobe_firefly: 'Adobe Firefly',
    deepai: 'DeepAI',
    bing_image_creator: 'Bing Image Creator',
    kling: 'Kling'
  };
  return map[key.toLowerCase()] || key.charAt(0).toUpperCase() + key.slice(1);
}
