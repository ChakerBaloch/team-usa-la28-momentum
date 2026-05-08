import { callAgent } from '../gemini.js';

const ORCHESTRATOR_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    required: ['agentId', 'sportList', 'dataKey', 'analysisQuestion', 'confidenceRequired'],
    properties: {
      agentId: { type: 'string' },
      sportList: { type: 'array', items: { type: 'string' } },
      dataKey: { type: 'string' },
      analysisQuestion: { type: 'string' },
      confidenceRequired: { type: 'string' },
    },
  },
};

export async function runOrchestrator(sports) {
  console.log('[orchestrator] started');
  const start = Date.now();

  const sportIds = sports.map((s) => s.id);

  const prompt = `
You are the coordinator for a multi-agent sports momentum analysis system for the Team USA LA28 Olympics/Paralympics tracker.

Given this list of sport IDs: ${JSON.stringify(sportIds)}

Generate exactly 4 analysis task packets — one each for:
1. medal_trajectory — analyze historical championship trend data
2. news_sentiment — analyze recent news articles for momentum signals
3. pipeline_growth — analyze athlete development and participation depth
4. paralympic_parity — assess Paralympic vs Olympic representation balance

Each packet must describe what data to analyze and what question to answer.
Return ONLY a valid JSON array of exactly 4 task packets.
`.trim();

  const result = await callAgent('orchestrator', prompt, ORCHESTRATOR_SCHEMA);

  console.log(`[orchestrator] completed in ${Date.now() - start}ms`);
  return result;
}
