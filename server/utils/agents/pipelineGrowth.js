import { callAgent } from '../gemini.js';

const PIPELINE_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    required: [
      'sport',
      'pipeline_growth_index',
      'depth_rating',
      'new_sport_flag',
      'readiness_2028',
    ],
    properties: {
      sport: { type: 'string' },
      pipeline_growth_index: { type: 'number' },
      depth_rating: { type: 'string', enum: ['deep', 'moderate', 'thin'] },
      new_sport_flag: { type: 'boolean' },
      readiness_2028: {
        type: 'string',
        enum: ['peak_ready', 'building', 'emerging', 'uncertain'],
      },
    },
  },
};

function preparePipelineData(sports) {
  return sports.map((s) => ({
    id: s.id,
    sport: s.sport,
    category: s.category,
    pipeline: s.pipeline || {},
    growthSignalCount: s.growthSignalCount,
    isNewOlympicSport: s.isNewOlympicSport || false,
  }));
}

export async function runPipelineGrowthAgent(sports) {
  console.log('[pipeline_growth] started');
  const start = Date.now();

  const pipelineData = preparePipelineData(sports);

  const prompt = `
You are an athlete development analyst for the Team USA LA28 momentum system.

Given this participation, qualification, and pipeline data for each sport:
${JSON.stringify(pipelineData, null, 2)}

For each sport compute:
- pipeline_growth_index: 0–100 representing athlete development health and depth
  * Higher junior athlete counts, more qualification slots, and youth program expansion all push higher
  * For new Olympic sports (isNewOlympicSport=true), pipeline depth is the PRIMARY signal since Olympic history doesn't exist
  * Paralympic sports should be assessed with equal rigor as Olympic sports
- depth_rating: "deep" if the athlete base could sustain a 3-cycle program, "moderate" for 1–2 cycles, "thin" for uncertain depth
- new_sport_flag: true if this is an Olympic debut sport at LA28
- readiness_2028: peak_ready | building | emerging | uncertain

Use conditional phrasing throughout (e.g. "athlete base could support", "may indicate", "suggests").
Return ONLY valid JSON matching the schema.
`.trim();

  const result = await callAgent('pipeline_growth', prompt, PIPELINE_SCHEMA);

  console.log(`[pipeline_growth] completed in ${Date.now() - start}ms`);
  return result;
}
