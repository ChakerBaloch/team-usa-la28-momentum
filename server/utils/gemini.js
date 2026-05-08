import { GoogleGenAI } from '@google/genai';

const ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'momentumSummary',
    'whyFansShouldWatch',
    'la28Outlook',
    'scoreExplanation',
    'parityNote',
    'caution',
  ],
  properties: {
    momentumSummary: { type: 'string' },
    whyFansShouldWatch: { type: 'string' },
    la28Outlook: { type: 'string' },
    scoreExplanation: { type: 'string' },
    parityNote: { type: 'string' },
    caution: { type: 'string' },
  },
};

const SYSTEM_INSTRUCTION = `
You are a Team USA fan engagement analyst.
Analyze only the provided data.
Do not invent facts, athletes, medals, exact results, or exact article titles.
Use cautious language such as "could show," "may indicate," "might suggest," and "could help fans follow."
Give Olympic and Paralympic sports equal analytical depth and respect.
Keep the tone exciting, clear, and fan-friendly.
Return structured JSON only.
`.trim();

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY. Add it to server/.env before requesting analysis.');
  }

  return new GoogleGenAI({ apiKey });
}

function parseAnalysisResponse(rawText) {
  const normalizedText = rawText.trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim();
  const parsed = JSON.parse(normalizedText);

  for (const field of ANALYSIS_SCHEMA.required) {
    if (typeof parsed[field] !== 'string' || !parsed[field].trim()) {
      throw new Error(`Gemini response was missing the "${field}" field.`);
    }
  }

  return parsed;
}

// ── Shared multi-agent helper ─────────────────────────────────────────────────

/**
 * Generic Gemini call used by all specialist agents.
 * @param {string} agentId - for logging
 * @param {string} promptText - the full agent prompt
 * @param {object} jsonSchema - JSON schema for structured output
 * @param {object} [opts] - optional overrides: { temperature, systemInstruction, model }
 */
export async function callAgent(agentId, promptText, jsonSchema, opts = {}) {
  const client = getClient();
  const model = opts.model || process.env.GEMINI_MODEL || 'gemini-2.5-flash-preview-04-17';

  const response = await client.models.generateContent({
    model,
    contents: promptText,
    config: {
      systemInstruction: opts.systemInstruction || SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseJsonSchema: jsonSchema,
      temperature: opts.temperature ?? 0.5,
    },
  });

  const rawText = response.text;
  const normalizedText = rawText.trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim();
  return JSON.parse(normalizedText);
}

// ── Legacy single-sport analysis (used by POST /api/analyze) ──────────────────

export async function generateMomentumAnalysis({ sport, datasetLabel }) {
  const client = getClient();
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash-preview-04-17';

  const prompt = `
Dataset label: ${datasetLabel}

Analyze the following Team USA sport using only the provided curated data.

Sport record:
${JSON.stringify(
    {
      id: sport.id,
      sport: sport.sport,
      category: sport.category,
      la28Status: sport.la28Status,
      worldChampionshipCount: sport.worldChampionshipCount,
      recentHeadlineCount: sport.recentHeadlineCount,
      growthSignalCount: sport.growthSignalCount,
      momentumSignals: sport.momentumSignals,
      recentNewsSummaries: sport.recentNewsSummaries,
      sourceNotes: sport.sourceNotes,
      rawMomentumScore: sport.rawMomentumScore,
      normalizedMomentumScore: sport.momentumScore,
      scoreBreakdown: sport.scoreBreakdown,
    },
    null,
    2,
  )}

Return JSON with exactly these fields:
{
  "momentumSummary": "...",
  "whyFansShouldWatch": "...",
  "la28Outlook": "...",
  "scoreExplanation": "...",
  "parityNote": "...",
  "caution": "..."
}

Writing rules:
- Keep each field to 1-3 sentences.
- Stay grounded in the supplied data only.
- Do not guarantee future performance.
- Do not claim geography, body type, or past success guarantees outcomes.
- Explain the parity bonus as a fairness-minded scoring choice, not a prediction.
`.trim();

  const response = await client.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseJsonSchema: ANALYSIS_SCHEMA,
      temperature: 0.6,
    },
  });

  return parseAnalysisResponse(response.text);
}
