import { callAgent } from '../gemini.js';

const CONTRADICTION_SCHEMA = {
  type: 'object',
  required: ['contradictions', 'data_quality_flags'],
  properties: {
    contradictions: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'sport',
          'agents_in_conflict',
          'description',
          'resolution_recommendation',
          'weight_adjustment',
        ],
        properties: {
          sport: { type: 'string' },
          agents_in_conflict: { type: 'array', items: { type: 'string' } },
          description: { type: 'string' },
          resolution_recommendation: { type: 'string' },
          weight_adjustment: {
            type: 'array',
            items: {
              type: 'object',
              required: ['agent_id', 'suggested_weight'],
              properties: {
                agent_id: { type: 'string' },
                suggested_weight: { type: 'number' },
              },
            },
          },
        },
      },
    },
    data_quality_flags: {
      type: 'array',
      items: {
        type: 'object',
        required: ['sport', 'issue'],
        properties: {
          sport: { type: 'string' },
          issue: { type: 'string' },
        },
      },
    },
  },
};

export async function runContradictionDetector({ trajectory, sentiment, pipeline, parity }) {
  console.log('[contradiction_detector] started');
  const start = Date.now();

  const prompt = `
You are a quality assurance analyst reviewing AI-generated sports analysis outputs for the Team USA LA28 momentum system.

Below are the outputs from 4 specialist analysis agents for each sport:

MEDAL TRAJECTORY AGENT OUTPUT:
${JSON.stringify(trajectory, null, 2)}

NEWS SENTIMENT AGENT OUTPUT:
${JSON.stringify(sentiment, null, 2)}

PIPELINE GROWTH AGENT OUTPUT:
${JSON.stringify(pipeline, null, 2)}

PARALYMPIC PARITY AGENT OUTPUT:
${JSON.stringify(parity, null, 2)}

Identify contradictions where different agents disagree significantly on the momentum direction for the same sport.
Focus on contradictions where signals diverge by a meaningful margin (e.g., trajectory score high but sentiment score low).

For each contradiction:
- Name the conflicting agents (use agent IDs: medal_trajectory, news_sentiment, pipeline_growth, paralympic_parity)
- Explain the likely cause using conditional language
- Recommend weight adjustments for the Synthesis Agent (weights must sum to 1.0 across medal_trajectory, news_sentiment, pipeline_growth)
- Flag any data quality issues (sparse data, new sport without history, etc.)

Only flag contradictions that are genuinely meaningful. Not every sport needs a contradiction.
Return ONLY valid JSON matching the schema.
`.trim();

  const result = await callAgent('contradiction_detector', prompt, CONTRADICTION_SCHEMA);

  console.log(`[contradiction_detector] completed in ${Date.now() - start}ms`);
  return result;
}
