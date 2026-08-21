/**
 * CVScore AI — Netlify Serverless Function
 * POST /api/scan
 *
 * Proxies requests to the Anthropic API so the key
 * never touches the browser. Handles both PDF scan
 * and job-description match requests.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL         = 'claude-sonnet-4-6';
const MAX_TOKENS    = 1000;

// ── CORS headers ──────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type':                 'application/json',
};

exports.handler = async (event) => {
  // Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500, headers: CORS,
      body: JSON.stringify({ error: 'API key not configured. Add ANTHROPIC_API_KEY to Netlify environment variables.' })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { mode } = body; // 'scan' | 'jdmatch'

  // ── Build Anthropic request based on mode ─────────
  let messages, system;

  if (mode === 'scan') {
    const { base64, mimeType, filename } = body;
    if (!base64 || !mimeType) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing base64 or mimeType' }) };
    }

    system = `You are an expert ATS (Applicant Tracking System) analyst with deep knowledge of how Workday, Greenhouse, Lever, iCIMS, and Taleo parse and score resumes.

Analyse the provided resume and return ONLY a valid JSON object — no markdown, no preamble, no text outside the JSON.

Return exactly this structure:
{
  "overallScore": <integer 0-100>,
  "grade": <"Weak"|"Fair"|"Good"|"Strong"|"Excellent">,
  "scores": {
    "parseability":    <integer 0-100>,
    "formatting":      <integer 0-100>,
    "keywordDensity":  <integer 0-100>,
    "readability":     <integer 0-100>,
    "skillsAlignment": <integer 0-100>
  },
  "strengths":        [<3 specific strings>],
  "issues": [
    { "title": <string>, "detail": <string> },
    { "title": <string>, "detail": <string> },
    { "title": <string>, "detail": <string> }
  ],
  "missingKeywords":    [<5 strings>],
  "topRecommendation":  <string — one sentence, the single most impactful fix>
}

Be honest and specific. Base every field on what is actually in the document.`;

    const userContent = mimeType === 'application/pdf'
      ? [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          { type: 'text',     text: 'Analyse this resume for ATS compatibility and return the JSON report.' }
        ]
      : [
          { type: 'text', text: `The user uploaded a DOCX resume named "${filename}". DOCX files are generally well-parsed by modern ATS systems. Provide a realistic ATS analysis and return the JSON report.` }
        ];

    messages = [{ role: 'user', content: userContent }];

  } else if (mode === 'jdmatch') {
    const { jobDescription } = body;
    if (!jobDescription || jobDescription.length < 30) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Job description too short' }) };
    }

    messages = [{
      role: 'user',
      content: `You are an ATS keyword analyst. Given this job description, extract the keywords an ATS would prioritise.

Job description:
${jobDescription.slice(0, 4000)}

Return ONLY valid JSON, no markdown:
{
  "matchScore":           <integer 0-100>,
  "requiredKeywords":     [<up to 10 strings>],
  "missingFromTypicalCV": [<5 strings most commonly missed>],
  "roleTitle":            <string — inferred job title>
}`
    }];

  } else {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Unknown mode. Use "scan" or "jdmatch".' }) };
  }

  // ── Call Anthropic ────────────────────────────────
  try {
    const payload = { model: MODEL, max_tokens: MAX_TOKENS, messages };
    if (system) payload.system = system;

    const upstream = await fetch(ANTHROPIC_URL, {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
    });

    const raw = await upstream.json();

    if (!upstream.ok) {
      console.error('Anthropic error:', raw);
      return {
        statusCode: upstream.status, headers: CORS,
        body: JSON.stringify({ error: raw?.error?.message || 'Anthropic API error' })
      };
    }

    const text = raw.content?.find(b => b.type === 'text')?.text || '';
    const clean = text.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      console.error('JSON parse error. Raw:', text);
      return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: 'Failed to parse AI response', raw: text }) };
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify(parsed) };

  } catch (err) {
    console.error('Function error:', err);
    return {
      statusCode: 500, headers: CORS,
      body: JSON.stringify({ error: err.message || 'Internal server error' })
    };
  }
};
