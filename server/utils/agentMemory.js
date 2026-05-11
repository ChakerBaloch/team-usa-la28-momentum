import { Firestore } from '@google-cloud/firestore';
import crypto from 'node:crypto';

const db = new Firestore();

function memoryDocId(sportId, agentId) {
  return `${sportId}_${agentId.replace(/\s+/g, '_')}`;
}

// ─── ARTICLE DEDUPLICATION ───────────────────────────────────────────────────

/**
 * Generate a stable ID for an article based on its URL or headline+date.
 */
export function articleFingerprint(article) {
  const key = article.url || `${article.headline}::${article.dateApprox}`;
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 20);
}

/**
 * Given a list of articles, return only the ones not yet analyzed.
 * Also returns the set of new article IDs so they can be saved after analysis.
 */
export async function filterNewArticles(articles, _sportId) {
  if (!articles || articles.length === 0) return { newArticles: [], newIds: [] };

  const ids = articles.map((article) => articleFingerprint(article));
  const refs = ids.map((id) => db.collection('analyzed_articles').doc(id));
  const snapshots = await db.getAll(...refs);
  const existingIds = new Set(snapshots.filter((snapshot) => snapshot.exists).map((snapshot) => snapshot.id));

  const newArticles = [];
  const newIds = [];

  articles.forEach((article, index) => {
    if (!existingIds.has(ids[index])) {
      newArticles.push({ ...article, _fingerprintId: ids[index] });
      newIds.push(ids[index]);
    }
  });

  return { newArticles, newIds };
}

/**
 * Mark a list of articles as analyzed. Call this after the agent succeeds so a
 * failed run does not mark articles as seen.
 */
export async function markArticlesAnalyzed(articles, sportId, sentimentScore) {
  if (!articles || articles.length === 0) return;

  const batch = db.batch();
  const now = new Date();

  articles.forEach((article) => {
    const id = article._fingerprintId || articleFingerprint(article);
    const ref = db.collection('analyzed_articles').doc(id);
    batch.set(ref, {
      articleId: id,
      url: article.url || null,
      headline: article.headline,
      sport: sportId,
      source: article.source || null,
      datePublished: article.dateApprox || null,
      analyzedAt: now,
      sentimentScore: sentimentScore ?? null,
    });
  });

  await batch.commit();
}

// ─── AGENT MEMORY (PREVIOUS CONCLUSIONS) ─────────────────────────────────────

/**
 * Load the previous conclusions for a specific agent + sport combination.
 * Returns null if this is the first run.
 */
export async function loadAgentMemory(sportId, agentId) {
  const doc = await db.collection('agent_memory').doc(memoryDocId(sportId, agentId)).get();

  if (!doc.exists) return null;
  return doc.data();
}

/**
 * Save the current run's conclusions as the new "current" memory, shifting the
 * old "current" to "previous".
 */
export async function saveAgentMemory(sportId, agentId, currentConclusions, changeReason, newArticlesCount) {
  const ref = db.collection('agent_memory').doc(memoryDocId(sportId, agentId));
  const existing = await ref.get();

  const now = new Date();
  const data = {
    sportId,
    agentId,
    lastRunAt: now,
    currentConclusions,
    changeReason: changeReason || 'First analysis run.',
    newArticlesCount: newArticlesCount || 0,
  };

  if (existing.exists) {
    const existingData = existing.data();
    data.previousRunAt = existingData.lastRunAt;
    data.previousConclusions = existingData.currentConclusions;
  } else {
    data.previousRunAt = null;
    data.previousConclusions = null;
  }

  await ref.set(data);
}

// ─── SCORE HISTORY TIME SERIES ───────────────────────────────────────────────

/**
 * Append a new data point to a sport's score history.
 * Called once per cron run, after synthesis completes.
 */
export async function appendScoreHistory(sportId, sportName, dataPoint) {
  const ref = db.collection('score_history').doc(sportId);
  const doc = await ref.get();

  const now = new Date();
  const newPoint = {
    runAt: now.toISOString(),
    ...dataPoint,
  };

  if (doc.exists) {
    const existing = doc.data();
    const history = existing.dataPoints || [];

    if (history.length > 0) {
      const lastScore = history[history.length - 1].composite_score;
      newPoint.changeFromLast = Math.round((dataPoint.composite_score - lastScore) * 10) / 10;
    } else {
      newPoint.changeFromLast = 0;
    }

    history.push(newPoint);

    await ref.update({
      sportId,
      sport: sportName,
      dataPoints: history.slice(-52),
      lastUpdated: now,
    });
    return;
  }

  newPoint.changeFromLast = 0;
  await ref.set({
    sportId,
    sport: sportName,
    dataPoints: [newPoint],
    lastUpdated: now,
  });
}

/**
 * Load score history for all sports. Used when building momentum-data.json.
 */
export async function loadAllScoreHistory() {
  const snapshot = await db.collection('score_history').get();
  const history = {};

  snapshot.forEach((doc) => {
    history[doc.id] = doc.data();
  });

  return history;
}
