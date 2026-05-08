import { callAgent } from '../gemini.js';

const SYNTHESIS_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    required: [
      'sport',
      'composite_score',
      'confidence_interval',
      'momentum_tier',
      'rank',
      'key_driver',
      'conditional_caveat',
      'signals',
    ],
    properties: {
      sport: { type: 'string' },
      composite_score: { type: 'number' },
      confidence_interval: { type: 'number' },
      momentum_tier: { type: 'string', enum: ['high', 'rising', 'building'] },
      rank: { type: 'number' },
      key_driver: { type: 'string' },
      conditional_caveat: { type: 'string' },
      signals: {
        type: 'array',
        items: {
          type: 'object',
          required: ['label', 'value', 'agentId'],
          properties: {
            label: { type: 'string' },
            value: { type: 'number' },
            agentId: { type: 'string' },
          },
        },
      },
    },
  },
};

export async function runSynthesisJudge({ trajectory, sentiment, pipeline, parity, contradictions }) {
  console.log('[synthesis_judge] started');
  const start = Date.now();

  // Trim each agent output to only the numeric scores — avoids token overflow
  const trimTrajectory = trajectory.map((t) => ({
    sport: t.sport,
    trajectory_score: t.trajectory_score,
    direction: t.direction,
    confidence: t.confidence,
  }));

  const trimSentiment = sentiment.map((s) => ({
    sport: s.sport,
    sentiment_score: s.sentiment_score,
    recency_weight: s.recency_weight,
    article_count: s.article_count,
  }));

  const trimPipeline = pipeline.map((p) => ({
    sport: p.sport,
    pipeline_growth_index: p.pipeline_growth_index,
    depth_rating: p.depth_rating,
    new_sport_flag: p.new_sport_flag,
    readiness_2028: p.readiness_2028,
  }));

  const trimParity = {
    overall_parity_grade: parity.overall_parity_grade,
    sport_parity_scores: parity.sport_parity_scores,
  };

  const trimContradictions = {
    contradictions: (contradictions.contradictions || []).map((c) => ({
      sport: c.sport,
      agents_in_conflict: c.agents_in_conflict,
      weight_adjustment: c.weight_adjustment,
    })),
  };

  const prompt = `
You are the final judge for the Team USA LA28 National Momentum Ranking System.

MEDAL TRAJECTORY (Agent 1) — trajectory_score 0–100:
${JSON.stringify(trimTrajectory)}

NEWS SENTIMENT (Agent 2) — sentiment_score 0–10:
${JSON.stringify(trimSentiment)}

PIPELINE GROWTH (Agent 3) — pipeline_growth_index 0–100:
${JSON.stringify(trimPipeline)}

PARALYMPIC PARITY modifiers (Agent 4):
${JSON.stringify(trimParity)}

CONTRADICTION adjustments (Agent 5):
${JSON.stringify(trimContradictions)}

Rules:
- Default weights: medal_trajectory 40%, news_sentiment 30% (scale 0–10 → 0–100), pipeline_growth 30%
- Apply parity modifier from sport_parity_scores as ±5 additive, cap composite at 100
- If contradiction agent provides weight_adjustment for a sport, use those weights instead
- momentum_tier: "high" ≥ 85, "rising" 70–84, "building" < 70
- signals array: 3 items — Medal Trajectory, News Sentiment, Pipeline Growth — with their 0–100 values
- conditional_caveat: one sentence, conditional language, explains main uncertainty

Sort by rank ascending (rank 1 = highest score). Include all sports.
Return ONLY valid JSON.
`.trim();

  const result = await callAgent('synthesis_judge', prompt, SYNTHESIS_SCHEMA, { temperature: 0.3 });

  console.log(`[synthesis_judge] completed in ${Date.now() - start}ms`);
  return result;
}
