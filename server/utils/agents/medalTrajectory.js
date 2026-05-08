import { callAgent } from '../gemini.js';

const TRAJECTORY_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    required: ['sport', 'trajectory_score', 'direction', 'confidence', 'key_evidence'],
    properties: {
      sport: { type: 'string' },
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
  console.log('[medal_trajectory] started');
  const start = Date.now();

  const trajectoryData = prepareTrajectoryData(sports);

  const prompt = `
You are a sports statistics analyst specializing in trend detection for the Team USA LA28 momentum system.

Given this championship trajectory data for each sport (EWMA = exponentially weighted moving average, decay=0.75):
${JSON.stringify(trajectoryData, null, 2)}

For each sport, compute:
- trajectory_score: a number from 0–100 representing historical championship strength and momentum trend
  * Use EWMA values where provided as a key input
  * New Olympic sports (isNewOlympicSport=true) should have their world championship data weighted more heavily than history
  * Paralympic sports should receive the same analytical depth as Olympic sports
- direction: "accelerating" if recent years show improvement, "stable" if flat, "declining" if dropping
- confidence: "high" if ≥4 years of data, "medium" if 2–3 years, "low" if 1 or fewer
- key_evidence: 2–3 specific observations from the data that most influenced the score

Use conditional language in key_evidence (e.g. "could indicate", "suggests", "may reflect").
Return ONLY valid JSON matching the schema.
`.trim();

  const result = await callAgent('medal_trajectory', prompt, TRAJECTORY_SCHEMA);

  console.log(`[medal_trajectory] completed in ${Date.now() - start}ms`);
  return result;
}
