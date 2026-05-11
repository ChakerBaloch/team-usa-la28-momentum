import dotenv from 'dotenv';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { runContradictionDetector } from '../utils/agents/contradictionDetector.js';
import { runMedalTrajectoryAgent } from '../utils/agents/medalTrajectory.js';
import { runNarrativeAgent } from '../utils/agents/narrative.js';
import { runNewsSentimentAgent } from '../utils/agents/newsSentiment.js';
import { runOrchestrator } from '../utils/agents/orchestrator.js';
import { runParalympicParityAgent } from '../utils/agents/paralympicParity.js';
import { runPipelineGrowthAgent } from '../utils/agents/pipelineGrowth.js';
import { runSynthesisJudge } from '../utils/agents/synthesisJudge.js';
import { appendScoreHistory, loadAllScoreHistory } from '../utils/agentMemory.js';
import { enrichSportsWithScores } from '../utils/score.js';

dotenv.config();

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataPath = path.resolve(__dirname, '../data/sportsMomentum.json');
const bucketName = process.env.GCS_BUCKET_NAME || 'la28-momentum-cache';
const fileName = process.env.GCS_FILE_NAME || 'momentum-data.json';
const storagePath = `gs://${bucketName}/${fileName}`;
const storageUrl = `https://storage.googleapis.com/${bucketName}/${fileName}`;

async function readSportsDataset() {
  const rawFile = await readFile(dataPath, 'utf-8');
  const dataset = JSON.parse(rawFile);

  return {
    datasetLabel: dataset.datasetLabel,
    sports: enrichSportsWithScores(dataset.sports),
  };
}

async function buildMomentumData() {
  const globalStart = Date.now();
  const agentTimings = {};
  const dataset = await readSportsDataset();
  const { sports } = dataset;

  const t0 = Date.now();
  await runOrchestrator(sports);
  agentTimings.orchestrator = Date.now() - t0;

  const parallelStart = Date.now();
  const [trajectory, sentiment, pipeline, parity] = await Promise.all([
    runMedalTrajectoryAgent(sports),
    runNewsSentimentAgent(sports),
    runPipelineGrowthAgent(sports),
    runParalympicParityAgent(sports),
  ]);
  agentTimings.parallel = Date.now() - parallelStart;

  const t5 = Date.now();
  const contradictions = await runContradictionDetector({ trajectory, sentiment, pipeline, parity });
  agentTimings.contradiction_detector = Date.now() - t5;

  const t6 = Date.now();
  const synthesis = await runSynthesisJudge({ trajectory, sentiment, pipeline, parity, contradictions });
  agentTimings.synthesis_judge = Date.now() - t6;

  const t7 = Date.now();
  const narratives = await runNarrativeAgent(synthesis);
  agentTimings.narrative = Date.now() - t7;
  agentTimings.total = Date.now() - globalStart;

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

  return {
    ranked,
    scoreHistory,
    generatedAt: new Date().toISOString(),
    agentOutputs: { trajectory, sentiment, pipeline, parity, contradictions },
    executionMeta: {
      source: 'local-machine',
      timingsMs: agentTimings,
    },
  };
}

async function uploadWithGsutil(data) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'momentum-cache-'));
  const tempFile = path.join(tempDir, fileName);

  try {
    await writeFile(tempFile, JSON.stringify(data), 'utf-8');
    await execFileAsync('gsutil', [
      '-h',
      'Content-Type:application/json',
      '-h',
      'Cache-Control:public, max-age=3600',
      'cp',
      tempFile,
      storagePath,
    ]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function isQuotaError(error) {
  const raw = `${error?.message || error || ''}`.toLowerCase();
  return error?.status === 429
    || raw.includes('resource_exhausted')
    || raw.includes('quota')
    || raw.includes('rate limit');
}

function getRetryDelay(error) {
  const raw = `${error?.message || ''}`;
  const match = raw.match(/retryDelay":"?(\d+)s/i) || raw.match(/retry in ([\d.]+)s/i);
  return match ? Math.ceil(Number(match[1])) : null;
}

try {
  console.log('[local-cache] running local orchestration');
  const result = await buildMomentumData();

  // Local admin path: authenticated gsutil is the intended writer while cron is paused.
  await uploadWithGsutil(result);

  console.log(`[local-cache] uploaded ${result.ranked.length} rankings`);
  console.log(`[local-cache] generatedAt ${result.generatedAt}`);
  console.log(`[local-cache] url ${storageUrl}`);
} catch (error) {
  if (isQuotaError(error)) {
    const retryDelay = getRetryDelay(error);
    console.error('[local-cache] Gemini quota was exhausted. No Cloud Storage upload was attempted.');
    if (retryDelay) {
      console.error(`[local-cache] Gemini suggested retrying after about ${retryDelay}s.`);
    }
    console.error('[local-cache] Try again after quota resets, switch GEMINI_MODEL/API key, or enable billing for the Gemini project.');
  } else {
    console.error('[local-cache] failed:', error);
  }

  process.exitCode = 1;
}
