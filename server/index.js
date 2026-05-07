import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateMomentumAnalysis } from './utils/gemini.js';
import { enrichSportsWithScores } from './utils/score.js';

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
