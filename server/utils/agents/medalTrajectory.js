import { callAgent } from '../gemini.js';
import { loadAgentMemory, saveAgentMemory } from '../agentMemory.js';

const TRAJECTORY_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    required: ['sport', 'reasoning', 'trajectory_score', 'direction', 'confidence', 'key_evidence'],
    properties: {
      sport: { type: 'string' },
      reasoning: { type: 'string' },
      trajectory_score: { type: 'number' },
      direction: { type: 'string', enum: ['accelerating', 'stable', 'declining'] },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      key_evidence: { type: 'array', items: { type: 'string' } },
    },
  },
};

/**
 * Compute an exponentially weighted moving average of medal counts.
 * More recent years carry more weight (decay = 0.75).
 */
function computeEWMA(counts, decay = 0.75) {
  if (!counts || counts.length === 0) return 0;
  return counts.reduce((acc, val, i) => (i === 0 ? val : decay * acc + (1 - decay) * val), counts[0]);
}

function prepareTrajectoryData(sports) {
  return sports.map((s) => ({
    id: s.id,
    sport: s.sport,
    category: s.category,
    isNewOlympicSport: s.isNewOlympicSport || false,
    years: s.trajectory?.years || [],
    medalCounts: s.trajectory?.medalCounts || [],
    ewma: s.trajectory ? Math.round(computeEWMA(s.trajectory.medalCounts)) : null,
    worldChampionshipCount: s.worldChampionshipCount,
  }));
}

export async function runMedalTrajectoryAgent(sports) {
  console.log('[Medal trend] started');
  const start = Date.now();

  const trajectoryData = prepareTrajectoryData(sports);

  const memoriesBySport = {};
  await Promise.all(
    sports.map(async (sport) => {
      const memory = await loadAgentMemory(sport.id, 'Medal trend');
      memoriesBySport[sport.id] = memory;
    }),
  );

  const enrichedData = trajectoryData.map((sportData) => ({
    ...sportData,
    previousAnalysis: memoriesBySport[sportData.id]
      ? {
        runDate: memoriesBySport[sportData.id].lastRunAt,
        trajectoryScore: memoriesBySport[sportData.id].currentConclusions?.trajectory_score,
        direction: memoriesBySport[sportData.id].currentConclusions?.direction,
        keyEvidence: memoriesBySport[sportData.id].currentConclusions?.key_evidence,
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
You are tracking how Team USA's championship performance is trending
in each sport, heading into the Los Angeles 2028 Games.

You have access to historical championship data AND your previous
analysis conclusions. Use both to produce a grounded, consistent
assessment that evolves as new data emerges.

Championship trajectory data for this batch (including your previous conclusions
where they exist):
${JSON.stringify(batch, null, 2)}

FOR EACH SPORT:

reasoning (write FIRST):
  Explain the trend in 2–3 plain-English sentences a fan would
  understand. Reference actual numbers from the data. If this is
  not the first run, compare to your previous conclusions.

  FIRST RUN EXAMPLE:
  "Team USA has competed in world championships in this sport for
  4 of the last 5 tracked years, collecting medals at an increasing
  rate — the most recent year being their strongest. A recency-weighted
  average of roughly 6 medals per cycle suggests consistent
  competitive presence that could be building toward a peak."

  UPDATE EXAMPLE (when previousAnalysis exists):
  "Since the last analysis, no new championship data has been added —
  the trajectory picture is unchanged. The previous score of 74 remains
  appropriate given the stable 4-cycle upward trend. If new championship
  results become available before LA28, this score may shift significantly."

trajectory_score (0–100):
  If previousAnalysis exists:
  - Only change the score if new data in the dataset justifies it
  - A score should not move more than 5 points without new championship
    results to justify the change
  - Explain any change in the reasoning field

  Score guide:
  - 85–100: 4+ years of data, clear upward EWMA trend, count ≥ 8
  - 65–84:  2–3 years or moderate trend, count 4–7
  - 40–64:  Limited data, flat or mixed results
  - Below 40: Declining trend or very sparse data

direction: "accelerating", "stable", or "declining"

confidence: "high" (4+ years), "medium" (2–3 years), "low" (1 or fewer)

key_evidence (2–3 items):
  Plain-English sentences referencing actual numbers.
  If this is not the first run and the picture is unchanged, you may
  carry forward the strongest evidence from previousAnalysis, but note
  that it is unchanged.

Return ONLY valid JSON matching the schema.
`.trim();

    const batchResult = await callAgent('Medal trend', prompt, TRAJECTORY_SCHEMA, { temperature: 0.3 });
    result.push(...batchResult);
  }

  await Promise.all(
    result.map(async (sportResult) => {
      const sport = sports.find((entry) => entry.sport === sportResult.sport);
      if (!sport) return;

      await saveAgentMemory(
        sport.id,
        'Medal trend',
        sportResult,
        `Score: ${sportResult.trajectory_score}, Direction: ${sportResult.direction}`,
        0,
      );
    }),
  );

  console.log(`[Medal trend] completed in ${Date.now() - start}ms`);
  return result;
}
