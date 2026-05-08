import { callAgent } from '../gemini.js';

const PARITY_SCHEMA = {
  type: 'object',
  required: ['parity_flags', 'strong_paralympic_momentum', 'overall_parity_grade', 'recommendation', 'sport_parity_scores'],
  properties: {
    parity_flags: {
      type: 'array',
      items: {
        type: 'object',
        required: ['sport', 'issue', 'severity'],
        properties: {
          sport: { type: 'string' },
          issue: { type: 'string' },
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
      },
    },
    strong_paralympic_momentum: { type: 'array', items: { type: 'string' } },
    overall_parity_grade: { type: 'string' },
    recommendation: { type: 'string' },
    sport_parity_scores: {
      type: 'array',
      items: {
        type: 'object',
        required: ['sport', 'parity_score', 'modifier'],
        properties: {
          sport: { type: 'string' },
          parity_score: { type: 'number' },
          modifier: { type: 'number' },
        },
      },
    },
  },
};

export async function runParalympicParityAgent(sports) {
  console.log('[paralympic_parity] started');
  const start = Date.now();

  const parityData = sports.map((s) => ({
    id: s.id,
    sport: s.sport,
    category: s.category,
    la28Status: s.la28Status,
    isNewOlympicSport: s.isNewOlympicSport || false,
    worldChampionshipCount: s.worldChampionshipCount,
    recentHeadlineCount: s.recentHeadlineCount,
    growthSignalCount: s.growthSignalCount,
  }));

  const prompt = `
You are a Paralympic inclusion analyst for the Team USA LA28 momentum system.

Given this data for all tracked sports:
${JSON.stringify(parityData, null, 2)}

Your job:
1. Check whether each Olympic sport has a corresponding Paralympic discipline represented in the dataset
2. Flag any sports where Paralympic data is missing or underweighted
3. For each sport, assign a parity_score (0–10) and a score modifier (-5 to +5 points) to use in synthesis
   * Paralympic sports that ARE represented in the dataset get a +2 to +5 modifier
   * Olympic sports with strong parallel Paralympic programs get a +1 to +3 modifier
   * New Olympic sports with no Paralympic equivalent get a small negative modifier or 0
4. Identify 2–3 Paralympic sports where Team USA shows particularly strong momentum
5. Assign an overall_parity_grade: A / B / C / D

Return ONLY valid JSON matching the schema.
`.trim();

  const result = await callAgent('paralympic_parity', prompt, PARITY_SCHEMA);

  console.log(`[paralympic_parity] completed in ${Date.now() - start}ms`);
  return result;
}
