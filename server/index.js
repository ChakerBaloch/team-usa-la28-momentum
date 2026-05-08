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
    response.status(500).json({
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
    response.status(500).json({
      error: error.message || 'Multi-agent analysis failed.',
    });
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
