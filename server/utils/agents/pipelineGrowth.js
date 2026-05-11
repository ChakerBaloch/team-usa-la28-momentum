import { callAgent } from '../gemini.js';
import { loadAgentMemory, saveAgentMemory } from '../agentMemory.js';

const PIPELINE_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    required: [
      'sport',
      'reasoning',
      'pipeline_growth_index',
      'depth_rating',
      'new_sport_flag',
      'readiness_2028',
    ],
    properties: {
      sport: { type: 'string' },
      reasoning: { type: 'string' },
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
  console.log('[Athlete development] started');
  const start = Date.now();

  const pipelineData = preparePipelineData(sports);

  const memoriesBySport = {};
  await Promise.all(
    sports.map(async (sport) => {
      const memory = await loadAgentMemory(sport.id, 'Athlete development');
      memoriesBySport[sport.id] = memory;
    }),
  );

  const enrichedData = pipelineData.map((sportData) => ({
    ...sportData,
    previousAnalysis: memoriesBySport[sportData.id]
      ? {
        runDate: memoriesBySport[sportData.id].lastRunAt,
        pipelineGrowthIndex: memoriesBySport[sportData.id].currentConclusions?.pipeline_growth_index,
        depthRating: memoriesBySport[sportData.id].currentConclusions?.depth_rating,
        readiness2028: memoriesBySport[sportData.id].currentConclusions?.readiness_2028,
      }
      : null,
  }));

  const BATCH_SIZE = 3;
  const batches = [];
  for (let i = 0; i < enrichedData.length; i += BATCH_SIZE) {
    batches.push(enrichedData.slice(i, i + BATCH_SIZE));
  }

  const result = [];
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const prompt = `
You are an athlete development analyst for the Team USA LA28 momentum system.

Given this participation, qualification, and pipeline data for this batch of sports:
${JSON.stringify(batch, null, 2)}

CONTINUITY RULES:
If previousAnalysis exists for a sport, anchor your pipeline_growth_index
to it. Only change the score by more than 5 points if the new data
shows a clear structural change — a new youth program, a significant
drop in qualification slots, or a major pipeline development.

Explain any score change in the reasoning field. If the picture is
unchanged, say so clearly — stability is a valid and informative finding.

A sport that has had a stable pipeline score of 68 for three runs is
telling fans: "this program's depth is consistent and reliable."
That is a useful signal. Do not manufacture change where none exists.

For each sport compute:
- reasoning: 2–3 plain-English sentences explaining the pipeline picture and any change since the previous run
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

    const batchResult = await callAgent('Athlete development', prompt, PIPELINE_SCHEMA, { temperature: 0.3 });
    result.push(...batchResult);
  }

  await Promise.all(
    result.map(async (sportResult) => {
      const sport = sports.find((entry) => entry.sport === sportResult.sport);
      if (!sport) return;

      await saveAgentMemory(
        sport.id,
        'Athlete development',
        sportResult,
        `Score: ${sportResult.pipeline_growth_index}, Readiness: ${sportResult.readiness_2028}`,
        0,
      );
    }),
  );

  console.log(`[Athlete development] completed in ${Date.now() - start}ms`);
  return result;
}
