import { callAgent } from '../gemini.js';

const NARRATIVE_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    required: ['sport', 'bracket_narrative', 'momentum_emoji_tier', 'para_note'],
    properties: {
      sport: { type: 'string' },
      bracket_narrative: { type: 'string' },
      momentum_emoji_tier: { type: 'string', enum: ['🔥', '📈', '🌱'] },
      para_note: {
        type: 'object',
        required: ['grade', 'note'],
        properties: {
          grade: { type: 'string' },
          note: { type: 'string' },
        },
      },
    },
  },
};

export async function runNarrativeAgent(synthesis) {
  console.log('[narrative] started');
  const start = Date.now();

  // Only send what the narrative agent needs — saves ~60% of input tokens
  const trimmed = synthesis.map((s) => ({
    sport: s.sport,
    momentum_tier: s.momentum_tier,
    rank: s.rank,
    composite_score: s.composite_score,
    confidence_interval: s.confidence_interval,
    key_driver: s.key_driver,
    conditional_caveat: s.conditional_caveat,
  }));

  const prompt = `
You are a sports storyteller for Team USA fans heading to LA28.

Final momentum rankings:
${JSON.stringify(trimmed)}

For each sport write:
1. bracket_narrative: 2 sentences max. Open with an energetic hook, close with a conditional LA28 forward-look. Use "could", "may", "might". Wrap in quotes.
2. momentum_emoji_tier: "🔥" for high, "📈" for rising, "🌱" for building
3. para_note.grade: "A+" / "A" / "B" / "N/A" — Paralympic representation quality
4. para_note.note: 1 sentence about Paralympic dimension (conditional language)

Return ONLY valid JSON.
`.trim();

  const result = await callAgent('narrative', prompt, NARRATIVE_SCHEMA, { temperature: 0.75 });

  console.log(`[narrative] completed in ${Date.now() - start}ms`);
  return result;
}
