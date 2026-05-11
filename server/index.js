import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateMomentumAnalysis } from './utils/gemini.js';
import { enrichSportsWithScores } from './utils/score.js';
import { runOrchestrator } from './utils/agents/orchestrator.js';
import { runMedalTrajectoryAgent } from './utils/agents/medalTrajectory.js';
import { runNewsSentimentAgent } from './utils/agents/newsSentiment.js';
import { runPipelineGrowthAgent } from './utils/agents/pipelineGrowth.js';
import { runParalympicParityAgent } from './utils/agents/paralympicParity.js';
import { runContradictionDetector } from './utils/agents/contradictionDetector.js';
import { runSynthesisJudge } from './utils/agents/synthesisJudge.js';
import { runNarrativeAgent } from './utils/agents/narrative.js';
import { appendScoreHistory, loadAllScoreHistory } from './utils/agentMemory.js';
import { writeResultsToStorage } from './utils/storage.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT) || 8080;
const dataPath = path.join(__dirname, 'data', 'sportsMomentum.json');
const clientDistPath = path.resolve(__dirname, '../client/dist');

const configuredOrigins = (process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || configuredOrigins.length === 0 || configuredOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin not allowed by CORS.'));
    },
  }),
);

app.use(express.json());

async function readSportsDataset() {
  const rawFile = await readFile(dataPath, 'utf-8');
  const dataset = JSON.parse(rawFile);

  return {
    datasetLabel: dataset.datasetLabel,
    sports: enrichSportsWithScores(dataset.sports),
  };
}

function getErrorStatus(error) {
  if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 600) {
    return error.status;
  }

  if (Number.isInteger(error?.code) && error.code >= 400 && error.code < 600) {
    return error.code;
  }

  const rawMessage = `${error?.message || error || ''}`.toLowerCase();
  const causeCode = `${error?.cause?.code || ''}`.toLowerCase();

  if (
    rawMessage.includes('resource_exhausted')
    || rawMessage.includes('quota')
    || rawMessage.includes('prepayment credits are depleted')
  ) {
    return 429;
  }

  if (
    rawMessage.includes('fetch failed')
    || rawMessage.includes('connect timeout')
    || causeCode === 'und_err_connect_timeout'
  ) {
    return 503;
  }

  return 500;
}

app.get('/api/health', (_request, response) => {
  response.json({ ok: true });
});

app.get('/api/sports', async (_request, response) => {
  try {
    const dataset = await readSportsDataset();
    response.json(dataset);
  } catch (error) {
    response.status(500).json({
      error: 'Unable to load the curated sports dataset.',
      details: error.message,
    });
  }
});

// ── Legacy single-sport analysis (kept for backward compatibility) ─────────────
app.post('/api/analyze', async (request, response) => {
  const { sportId } = request.body || {};

  if (!sportId || typeof sportId !== 'string') {
    response.status(400).json({ error: 'sportId is required.' });
    return;
  }

  try {
    const dataset = await readSportsDataset();
    const sport = dataset.sports.find((entry) => entry.id === sportId);

    if (!sport) {
      response.status(404).json({ error: 'Sport not found.' });
      return;
    }

    const analysis = await generateMomentumAnalysis({
      sport,
      datasetLabel: dataset.datasetLabel,
    });

    response.json({
      sportId,
      momentumScore: sport.momentumScore,
      analysis,
    });
  } catch (error) {
    response.status(getErrorStatus(error)).json({
      error: error.message || 'Unable to analyze this sport right now.',
    });
  }
});

// ── Multi-agent full analysis ─────────────────────────────────────────────────
app.post('/api/analyze-all', async (_request, response) => {
  const globalStart = Date.now();

  try {
    const dataset = await readSportsDataset();
    const { sports } = dataset;

    // Agent 0: Orchestrator
    const agentTimings = {};
    const t0 = Date.now();
    await runOrchestrator(sports);
    agentTimings.orchestrator = Date.now() - t0;

    // Agents 1–4: Run in parallel
    const parallelStart = Date.now();
    const [trajectory, sentiment, pipeline, parity] = await Promise.all([
      runMedalTrajectoryAgent(sports),
      runNewsSentimentAgent(sports),
      runPipelineGrowthAgent(sports),
      runParalympicParityAgent(sports),
    ]);
    agentTimings.parallel = Date.now() - parallelStart;

    // Agent 5: Contradiction detection (sequential — needs all 4 outputs)
    const t5 = Date.now();
    const contradictions = await runContradictionDetector({ trajectory, sentiment, pipeline, parity });
    agentTimings.contradiction_detector = Date.now() - t5;

    // Agent 6: Synthesis (sequential — needs contradictions)
    const t6 = Date.now();
    const synthesis = await runSynthesisJudge({ trajectory, sentiment, pipeline, parity, contradictions });
    agentTimings.synthesis_judge = Date.now() - t6;

    // Agent 7: Narrative (sequential — needs synthesis)
    const t7 = Date.now();
    const narratives = await runNarrativeAgent(synthesis);
    agentTimings.narrative = Date.now() - t7;

    agentTimings.total = Date.now() - globalStart;

    // Merge narrative data into the synthesis ranked array by sport id
    const narrativeMap = {};
    for (const n of narratives) {
      narrativeMap[n.sport] = n;
    }

    const ranked = synthesis.map((s) => ({
      ...s,
      narrative: narrativeMap[s.sport]?.bracket_narrative || null,
      momentum_emoji_tier: narrativeMap[s.sport]?.momentum_emoji_tier || null,
      para_note: narrativeMap[s.sport]?.para_note || null,
      headline: narrativeMap[s.sport]?.headline || null,
      why_watch: narrativeMap[s.sport]?.why_watch || null,
      momentum_story: narrativeMap[s.sport]?.momentum_story || null,
      la28_prediction: narrativeMap[s.sport]?.la28_prediction || null,
      fan_signal: narrativeMap[s.sport]?.fan_signal || null,
    }));

    response.json({
      ranked,
      agentOutputs: {
        trajectory,
        sentiment,
        pipeline,
        parity,
        contradictions,
      },
      executionMeta: {
        parallelAgents: ['medal_trajectory', 'news_sentiment', 'pipeline_growth', 'paralympic_parity'],
        sequentialAgents: ['orchestrator', 'contradiction_detector', 'synthesis_judge', 'narrative'],
        timingsMs: agentTimings,
      },
    });
  } catch (error) {
    console.error('[analyze-all] error:', error);
    response.status(getErrorStatus(error)).json({
      error: error.message || 'Multi-agent analysis failed.',
    });
  }
});

// ── Cron-only orchestration — writes to Cloud Storage ──────────────────────────
app.post('/api/cron/orchestrate', async (request, response) => {
  if (process.env.ENABLE_CRON_ORCHESTRATION !== 'true') {
    response.status(404).json({ error: 'Cron orchestration is disabled.' });
    return;
  }

  const secret = request.headers['x-cron-secret'];

  if (!secret || secret !== process.env.CRON_SECRET) {
    response.status(401).json({ error: 'Unauthorized.' });
    return;
  }

  const globalStart = Date.now();

  try {
    const dataset = await readSportsDataset();
    const { sports } = dataset;

    await runOrchestrator(sports);

    const [trajectory, sentiment, pipeline, parity] = await Promise.all([
      runMedalTrajectoryAgent(sports),
      runNewsSentimentAgent(sports),
      runPipelineGrowthAgent(sports),
      runParalympicParityAgent(sports),
    ]);

    const contradictions = await runContradictionDetector({ trajectory, sentiment, pipeline, parity });
    const synthesis = await runSynthesisJudge({ trajectory, sentiment, pipeline, parity, contradictions });
    const narratives = await runNarrativeAgent(synthesis);

    const narrativeMap = {};
    for (const n of narratives) {
      narrativeMap[n.sport] = n;
    }

    const ranked = synthesis.map((s) => ({
      ...s,
      narrative: narrativeMap[s.sport]?.bracket_narrative || null,
      momentum_emoji_tier: narrativeMap[s.sport]?.momentum_emoji_tier || null,
      para_note: narrativeMap[s.sport]?.para_note || null,
      headline: narrativeMap[s.sport]?.headline || null,
      why_watch: narrativeMap[s.sport]?.why_watch || null,
      momentum_story: narrativeMap[s.sport]?.momentum_story || null,
      la28_prediction: narrativeMap[s.sport]?.la28_prediction || null,
      fan_signal: narrativeMap[s.sport]?.fan_signal || null,
    }));

    await Promise.all(
      ranked.map(async (sport) => {
        const trajectoryResult = trajectory.find((entry) => entry.sport === sport.sport);
        const sentimentResult = sentiment.find((entry) => entry.sport === sport.sport);
        const pipelineResult = pipeline.find((entry) => entry.sport === sport.sport);

        await appendScoreHistory(
          sport.sport.toLowerCase().replace(/\s+/g, '_'),
          sport.sport,
          {
            composite_score: sport.composite_score,
            momentum_tier: sport.momentum_tier,
            trajectory_score: trajectoryResult?.trajectory_score || null,
            sentiment_score: sentimentResult?.sentiment_score || null,
            pipeline_score: pipelineResult?.pipeline_growth_index || null,
            newArticlesCount: sentimentResult?.new_article_count || 0,
          },
        );
      }),
    );

    const scoreHistory = await loadAllScoreHistory();

    const result = {
      ranked,
      scoreHistory,
      generatedAt: new Date().toISOString(),
      agentOutputs: { trajectory, sentiment, pipeline, parity, contradictions },
      executionMeta: { timingsMs: { total: Date.now() - globalStart } },
    };

    // RULE 2: Only cron writes to Cloud Storage. Never partial results.
    await writeResultsToStorage(result);

    console.log(`[cron/orchestrate] success in ${Date.now() - globalStart}ms`);
    response.json({ success: true, generatedAt: result.generatedAt });
  } catch (error) {
    console.error('[cron/orchestrate] error:', error);
    response.status(getErrorStatus(error)).json({ error: error.message || 'Orchestration failed.' });
  }
});

async function maybeServeClient() {
  try {
    await access(clientDistPath);
    app.use(express.static(clientDistPath));
    app.get(/^(?!\/api\/).*/, (_request, response) => {
      response.sendFile(path.join(clientDistPath, 'index.html'));
    });
  } catch {
    // Client build is optional in local API-only development.
  }
}

await maybeServeClient();

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
