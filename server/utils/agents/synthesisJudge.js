import { callAgent } from '../gemini.js';
import { loadAgentMemory, saveAgentMemory } from '../agentMemory.js';

// The final schema that the application expects (unchanged)
const FINAL_SCHEMA = {
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
      'reasoning',
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
      reasoning: { type: 'string' },
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

// A much simpler schema for the LLM — just the narrative text!
const NARRATIVE_ONLY_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    required: ['sport', 'key_driver', 'reasoning', 'conditional_caveat'],
    properties: {
      sport: { type: 'string' },
      key_driver: { type: 'string' },
      reasoning: { type: 'string' },
      conditional_caveat: { type: 'string' },
    },
  },
};

export async function runSynthesisJudge({ trajectory, sentiment, pipeline, parity, contradictions }) {
  console.log('[Overall ranking] started');
  const start = Date.now();

  // 1. GATHER AND PRE-CALCULATE ALL MATH IN JAVASCRIPT
  // This completely eliminates the "thought" bloat from the reasoning model.

  const allSportsNames = [...new Set([
    ...trajectory.map((t) => t.sport),
    ...sentiment.map((s) => s.sport),
    ...pipeline.map((p) => p.sport),
  ])];

  const calculatedScores = allSportsNames.map((sportName) => {
    const t = trajectory.find((x) => x.sport === sportName) || { trajectory_score: 0 };
    const s = sentiment.find((x) => x.sport === sportName) || { sentiment_score: 0 };
    const p = pipeline.find((x) => x.sport === sportName) || { pipeline_growth_index: 0 };
    
    // Parity
    const parityScores = parity.sport_parity_scores || [];
    const parityMod = parityScores.find((x) => x.sport === sportName)?.parity_modifier || 0;
    
    // Contradictions (weight adjustments)
    const contra = (contradictions.contradictions || []).find((x) => x.sport === sportName);
    const weightAdj = contra?.weight_adjustment || [];
    
    // Default weights
    let wT = 0.40;
    let wS = 0.30;
    let wP = 0.30;

    // Apply contradiction overrides if any exist for this sport
    if (weightAdj.length > 0) {
      const wtOverride = weightAdj.find((w) => w.agent === 'Medal trend');
      if (wtOverride) wT = wtOverride.new_weight;
      const wsOverride = weightAdj.find((w) => w.agent === 'Press coverage');
      if (wsOverride) wS = wsOverride.new_weight;
      const wpOverride = weightAdj.find((w) => w.agent === 'Athlete development');
      if (wpOverride) wP = wpOverride.new_weight;
    }

    const tScore = t.trajectory_score || 0;
    const sScoreNorm = Math.round((s.sentiment_score || 0) * 10);
    const pScore = p.pipeline_growth_index || 0;

    // The math:
    let composite = (tScore * wT) + (sScoreNorm * wS) + (pScore * wP) + parityMod;
    composite = Math.min(Math.round(composite * 10) / 10, 100);

    const scores = [tScore, sScoreNorm, pScore];
    const confidence_interval = Math.max(...scores) - Math.min(...scores);

    let momentum_tier = "building";
    if (composite >= 80) momentum_tier = "high";
    else if (composite >= 60) momentum_tier = "rising";

    return {
      sport: sportName,
      composite_score: composite,
      confidence_interval,
      momentum_tier,
      signals: [
        { label: "Championship results", value: tScore, agentId: "Medal trend" },
        { label: "Media momentum", value: sScoreNorm, agentId: "Press coverage" },
        { label: "Talent pipeline", value: pScore, agentId: "Athlete development" }
      ],
      // We pass the raw stats down so we can build the LLM prompt
      tScore, sScoreNorm, pScore, parityMod, contra
    };
  });

  // Sort and rank all sports globally immediately
  calculatedScores.sort((a, b) => b.composite_score - a.composite_score);
  calculatedScores.forEach((s, i) => s.rank = i + 1);

  // 2. BATCH LLM CALLS JUST FOR NARRATIVE GENERATION
  // Since we aren't doing math, we can safely process in batches of 12!
  const BATCH_SIZE = 3;
  const batches = [];
  for (let i = 0; i < calculatedScores.length; i += BATCH_SIZE) {
    batches.push(calculatedScores.slice(i, i + BATCH_SIZE));
  }

  const finalResults = [];

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    console.log(`[Overall ranking] running batch ${b + 1}/${batches.length}`);

    const prompt = buildSynthesisPrompt(batch);

    const batchResult = await callAgent(
      'Overall ranking',
      prompt,
      NARRATIVE_ONLY_SCHEMA,
      { temperature: 0.2, maxOutputTokens: 8192 }
    );

    // Merge LLM narrative text back into our perfectly calculated objects
    for (const calc of batch) {
      const llmText = batchResult.find((r) => r.sport === calc.sport) || {
        key_driver: "Team USA has demonstrated consistent excellence in this sport, making it a strong contender.",
        reasoning: `(${calc.tScore}x0.4)+(${calc.sScoreNorm}x0.3)+(${calc.pScore}x0.3)+${calc.parityMod}=${calc.composite_score}`,
        conditional_caveat: "If the current wave of talent peaks at the right moment, we could see a historic performance."
      };
      
      finalResults.push({
        sport: calc.sport,
        composite_score: calc.composite_score,
        confidence_interval: calc.confidence_interval,
        momentum_tier: calc.momentum_tier,
        rank: calc.rank,
        key_driver: llmText.key_driver,
        reasoning: llmText.reasoning,
        conditional_caveat: llmText.conditional_caveat,
        signals: calc.signals
      });
    }
  }

  // Final re-sort to ensure correct order
  finalResults.sort((a, b) => a.rank - b.rank);

  console.log(`[Overall ranking] completed in ${Date.now() - start}ms`);
  return finalResults;
}

function buildSynthesisPrompt(batch) {
  // Strip out full signals array to keep prompt clean
  const promptData = batch.map((b) => ({
    sport: b.sport,
    calculated_composite_score: b.composite_score,
    rank: b.rank,
    inputs_used: {
      championship_results: b.tScore,
      media_momentum: b.sScoreNorm,
      talent_pipeline: b.pScore,
      parity_modifier: b.parityMod,
      contradiction_flags: b.contra ? b.contra.agents_in_conflict : "none"
    }
  }));

  return `
You are the ranking engine for the Road to LA28 — a fan-first momentum
tracker showing everyday sports fans which Team USA sports are building
toward something special at the Los Angeles 2028 Olympic Games.

The math, sorting, and tiering have already been calculated perfectly by the system.
Here is the data for this batch of sports:
${JSON.stringify(promptData, null, 2)}

For EACH sport in the list above, write exactly these 3 fields:

key_driver:
  A fan-friendly 1-2 sentence explanation of WHAT is powering this
  sport's ranking. The fan reading this has NEVER seen the raw numbers.
  Translate the dominant signal into plain English about Team USA's story.

  BAD: "Medal trend score of 95 is the primary driver."
  GOOD: "Team USA has been one of the world's top medal-winning nations in
  this sport at every major championship in the past four years — and
  that track record of consistent excellence is the foundation of this ranking."

  BAD: "Pipeline growth index of 88 drives the score."
  GOOD: "A wave of young elite athletes entering the program suggests Team USA
  could arrive at LA28 with more competitive depth than at any recent Games."

  BAD: "Press coverage score is 50 which is moderate."
  GOOD: "Media attention around this sport has been building steadily, with
  recent coverage highlighting new program investments that could pay
  off right in time for a home Games."

reasoning:
  Internal arithmetic only. Show the math. Max 1 sentence.
  Example: "(95x0.4)+(50x0.3)+(92x0.3)+3=83.1"
  This field is for verification — it is never shown to fans.

conditional_caveat:
  One fan-friendly forward-looking sentence using "could", "may", or "might".
  Frame it as exciting possibility, not a data warning.

  BAD: "Data quality is limited due to sparse championship history."
  GOOD: "If the current athlete development wave peaks at the right moment,
  this sport could make a serious run at its best-ever LA28 result."

  BAD: "Confidence interval is wide indicating signal disagreement."
  GOOD: "This is one of the most intriguing wild cards on the bracket — the
  signals are pointing in slightly different directions, which may mean
  we are watching a program in the middle of a genuine transformation."

RULES:
- key_driver and conditional_caveat must be written for someone who
  has never looked at a sports analytics dashboard in their life
- reasoning is the only field where raw numbers belong
- Do not use the words: "score", "metric", "index", "trajectory", "signal"
  in key_driver or conditional_caveat
- Return ONLY a valid JSON array containing sport, key_driver, reasoning, and conditional_caveat.
`.trim();
}
