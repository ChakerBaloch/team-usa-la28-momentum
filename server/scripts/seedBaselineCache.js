import dotenv from 'dotenv';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
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

function getTierFromScore(score) {
  if (score >= 85) return 'high';
  if (score >= 70) return 'rising';
  return 'building';
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function buildParaNote(sport) {
  if (sport.category === 'Paralympic') {
    return {
      grade: 'A',
      note: 'This Paralympic sport carries full analytical weight in the rankings.',
    };
  }

  if (sport.isNewOlympicSport) {
    return {
      grade: 'N/A',
      note: 'No Paralympic counterpart exists for this sport in the current dataset.',
    };
  }

  return {
    grade: 'B',
    note: 'Paralympic coverage will be clearer once the full analysis is complete.',
  };
}

async function readSportsDataset() {
  const rawFile = await readFile(dataPath, 'utf-8');
  const dataset = JSON.parse(rawFile);
  return enrichSportsWithScores(dataset.sports);
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

try {
  const sports = await readSportsDataset();
  const ranked = sports.map((sport) => ({
    rank: sport.rank,
    sport: sport.sport,
    composite_score: sport.momentumScore,
    confidence_interval: 6,
    momentum_tier: getTierFromScore(sport.momentumScore),
    signals: [
      {
        label: 'Medal trend',
        value: clampScore(sport.worldChampionshipCount * 8),
      },
      {
        label: 'Press coverage',
        value: clampScore(sport.recentHeadlineCount * 20),
      },
      {
        label: 'Athlete development',
        value: clampScore(sport.growthSignalCount * 20),
      },
    ],
    narrative: sport.recentNewsSummaries?.[0]
      || `${sport.sport} has visible momentum signals in the baseline dataset.`,
    momentum_emoji_tier: null,
    para_note: buildParaNote(sport),
  }));

  const result = {
    ranked,
    generatedAt: new Date().toISOString(),
    agentOutputs: {
      trajectory: [],
      sentiment: [],
      pipeline: [],
      parity: [],
      contradictions: { contradictions: [] },
    },
    executionMeta: {
      source: 'baseline-local-seed',
      timingsMs: { total: 0 },
    },
  };

  await uploadWithGsutil(result);
  console.log(`[baseline-cache] uploaded ${ranked.length} baseline rankings`);
  console.log(`[baseline-cache] generatedAt ${result.generatedAt}`);
  console.log(`[baseline-cache] url ${storageUrl}`);
} catch (error) {
  console.error('[baseline-cache] failed:', error);
  process.exitCode = 1;
}
