import { callAgent } from '../gemini.js';

const NARRATIVE_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    required: [
      'sport',
      'bracket_narrative',
      'momentum_emoji_tier',
      'para_note',
      'headline',
      'why_watch',
      'momentum_story',
      'la28_prediction',
      'fan_signal'
    ],
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
      headline: { type: 'string' },
      why_watch: { type: 'string' },
      momentum_story: { type: 'string' },
      la28_prediction: { type: 'string' },
      fan_signal: { type: 'string' }
    },
  },
};

export async function runNarrativeAgent(synthesis) {
  console.log('[narrative] started');
  const start = Date.now();

  // Only send what the narrative agent needs
  const trimmed = synthesis.map((s) => ({
    sport: s.sport,
    momentum_tier: s.momentum_tier,
    rank: s.rank,
    composite_score: s.composite_score,
    confidence_interval: s.confidence_interval,
    key_driver: s.key_driver,
    conditional_caveat: s.conditional_caveat,
    scoreChange: s.changeFromLast || 0,
    changeDirection: s.changeFromLast > 0
      ? 'rising'
      : s.changeFromLast < 0
        ? 'falling'
        : 'stable',
  }));

  const CHUNK_SIZE = 3;
  const chunks = [];
  for (let i = 0; i < trimmed.length; i += CHUNK_SIZE) {
    chunks.push(trimmed.slice(i, i + CHUNK_SIZE));
  }

  let result = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    const prompt = `
You are a sports storyteller for Team USA fans heading to LA28.
This is batch ${i + 1} of ${chunks.length}.

Final momentum rankings for this batch:
${JSON.stringify(chunk)}

MOMENTUM CURVE LANGUAGE:
Each sport now has a scoreChange value showing whether it has
risen, fallen, or stayed stable since the last analysis run.

Use this in your bracket_narrative when meaningful:
- If scoreChange > 2: mention that momentum appears to be building
- If scoreChange < -2: mention that the score has dipped and why
  (from the conditional_caveat) but keep the tone constructive
- If scoreChange is near 0: describe the sport as consistent

For each sport write:
1. headline: A punchy magazine-cover line with no numbers.
2. why_watch: Answers the fan's question of whether they should care.
3. momentum_story: Two sentences translating the data into a growth narrative.
4. la28_prediction: What could happen at the Games.
5. fan_signal: The single most shareable, exciting fact about this sport right now.
6. bracket_narrative: 2 sentences max. Open with an energetic hook, close with a conditional LA28 forward-look. Use "could", "may", "might". Wrap in quotes.
7. momentum_emoji_tier: "🔥" for high, "📈" for rising, "🌱" for building
8. para_note.grade: "A+" / "A" / "B" / "N/A" — Paralympic representation quality
9. para_note.note: 1 sentence about Paralympic dimension (conditional language)

Include all ${chunk.length} sports listed in this batch.
Return ONLY valid JSON.
`.trim();

    console.log(`[narrative] running batch ${i + 1}/${chunks.length}`);
    const chunkResult = await callAgent('narrative', prompt, NARRATIVE_SCHEMA, { temperature: 0.75 });
    result = result.concat(chunkResult);
  }

  console.log(`[narrative] completed in ${Date.now() - start}ms`);
  return result;
}
