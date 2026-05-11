import { callAgent } from '../gemini.js';
import {
  filterNewArticles,
  loadAgentMemory,
  markArticlesAnalyzed,
  saveAgentMemory,
} from '../agentMemory.js';
import { isTrustedSource } from '../trustedSources.js';

const SENTIMENT_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    required: [
      'sport',
      'sportId',
      'sentiment_score',
      'momentum_signals',
      'risk_signals',
      'notable_quote_themes',
      'article_count',
      'new_article_count',
      'recency_weight',
      'change_from_last',
      'change_explanation',
    ],
    properties: {
      sport: { type: 'string' },
      sportId: { type: 'string' },
      sentiment_score: { type: 'number' },
      momentum_signals: { type: 'array', items: { type: 'string' } },
      risk_signals: { type: 'array', items: { type: 'string' } },
      notable_quote_themes: { type: 'array', items: { type: 'string' } },
      article_count: { type: 'number' },
      new_article_count: { type: 'number' },
      recency_weight: { type: 'number' },
      change_from_last: { type: 'string', enum: ['improved', 'declined', 'stable', 'first_run'] },
      change_explanation: { type: 'string' },
    },
  },
};

function prepareSentimentData(sports) {
  return sports.map((s) => {
    const allArticles = s.newsArticles || [];
    const trustedArticles = allArticles.filter((article) => !article.url || isTrustedSource(article.url));

    return {
      id: s.id,
      sport: s.sport,
      category: s.category,
      recentHeadlineCount: s.recentHeadlineCount,
      momentumSignals: s.momentumSignals || [],
      articles: trustedArticles.map((article) => ({
        headline: article.headline,
        excerpt: article.excerpt || null,
        dateApprox: article.dateApprox || null,
        recencyWeight: article.recencyWeight,
        url: article.url || null,
        source: article.source || null,
      })),
      _allArticles: trustedArticles,
    };
  });
}

export async function runNewsSentimentAgent(sports) {
  console.log('[Press coverage] started');
  const start = Date.now();

  const sentimentData = prepareSentimentData(sports);

  const enrichedData = await Promise.all(
    sentimentData.map(async (sportData) => {
      const { newArticles, newIds } = await filterNewArticles(sportData._allArticles, sportData.id);
      const memory = await loadAgentMemory(sportData.id, 'Press coverage');

      return {
        ...sportData,
        newArticles,
        newArticleIds: newIds,
        previousMemory: memory,
        hasNewContent: newArticles.length > 0,
      };
    }),
  );

  const promptData = enrichedData.map((sportData) => ({
    id: sportData.id,
    sport: sportData.sport,
    category: sportData.category,
    newArticles: sportData.newArticles.map((article) => ({
      headline: article.headline,
      excerpt: article.excerpt || null,
      dateApprox: article.dateApprox || null,
      recencyWeight: article.recencyWeight,
      source: article.source || null,
    })),
    previousAnalysis: sportData.previousMemory
      ? {
        runDate: sportData.previousMemory.lastRunAt,
        sentimentScore: sportData.previousMemory.currentConclusions?.sentiment_score,
        momentumSignals: sportData.previousMemory.currentConclusions?.momentum_signals,
        riskSignals: sportData.previousMemory.currentConclusions?.risk_signals,
        themes: sportData.previousMemory.currentConclusions?.notable_quote_themes,
      }
      : null,
    hasNewContent: sportData.hasNewContent,
    newArticleCount: sportData.newArticles.length,
    trustedArticleCount: sportData.articles.length,
    totalPreviousArticles: sportData.articles.length - sportData.newArticles.length,
  }));

  const BATCH_SIZE = 3;
  const batches = [];
  for (let i = 0; i < promptData.length; i += BATCH_SIZE) {
    batches.push(promptData.slice(i, i + BATCH_SIZE));
  }

  const result = [];
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const prompt = `
You are reading recent news and press coverage about Team USA sports
to understand what the media is saying heading into the Los Angeles
2028 Olympic and Paralympic Games.

CRITICAL RULES ABOUT ARTICLES:
1. Only the "newArticles" array contains articles you have NOT seen before
2. "previousAnalysis" shows what you concluded the LAST time you analyzed
   this sport — treat it as your memory of what you already know
3. If newArticles is empty for a sport, carry forward the previous score
   with a small decay (subtract 0.3 to reflect that no new news means
   momentum may be cooling slightly) and explain this in change_explanation
4. If this is the first run and newArticles is empty, use a neutral score
   near 4.5 and explain that trusted-source coverage is sparse
5. All articles provided are from trusted sources only (major wire services,
   official federation sites, ESPN, NBC Sports, AP, Reuters, USOPC, LA28)
6. Read the full excerpt of every article — do not just scan headlines

Here is the data for this batch of sports:
${JSON.stringify(batch, null, 2)}

FOR EACH SPORT, PRODUCE:

sport: the sport name
sportId: the exact id field from the input

sentiment_score (0–10):
  This is your UPDATED score combining what you already knew (previousAnalysis)
  with what the new articles reveal.

  Score guide:
  - 8–10: Strong new positive coverage from multiple trusted sources,
           specific programs or achievements mentioned, clear upward story
  - 6–7:  Some new positive coverage, mixed signals, or few new articles
  - 4–5:  Little new coverage, neutral tone, or no new articles this run
  - Below 4: New articles raise concerns, or a previously strong story
               seems to be going quiet

  IMPORTANT: If previousAnalysis exists, anchor your score to it.
  Do not wildly change the score without new evidence.
  A score should only move more than 2 points if new articles clearly
  justify a significant shift in the media story.

article_count:
  Total trusted articles available for this sport in the input.

new_article_count:
  How many new articles were analyzed this run.

change_from_last:
  - "improved" if sentiment_score went up from previousAnalysis
  - "declined" if sentiment_score went down from previousAnalysis
  - "stable" if the score changed by less than 0.5 points
  - "first_run" if no previousAnalysis exists

change_explanation:
  Write 2 plain-English sentences explaining what changed since last time
  and why. Be specific — reference actual articles or the absence of them.

momentum_signals (2–4 items):
  Pull specific facts from the new article excerpts.
  If there are no new articles, carry forward the strongest 2 signals
  from previousAnalysis with a note that they are carried forward.

risk_signals (1–3 items, empty array if none):
  What concerns appear in the new articles? Carry forward unresolved
  risks from previousAnalysis if they have not been addressed in
  the new articles.

notable_quote_themes (2–3 items):
  Recurring themes across all coverage — both new and previous.
  These are story arcs, not quotes.

recency_weight:
  Average recencyWeight of the new articles analyzed this run. Use 0
  when there are no new articles.

REMEMBER: You are building a picture of momentum over time.
Your job is to show fans how the media story around Team USA is
evolving week by week — not just what a single batch of articles says.

Return ONLY valid JSON matching the schema.
`.trim();

    const batchResult = await callAgent('Press coverage', prompt, SENTIMENT_SCHEMA, { temperature: 0.3 });
    result.push(...batchResult);
  }

  await Promise.all(
    enrichedData.map(async (sportData) => {
      const sportResult = result.find((entry) => entry.sportId === sportData.id || entry.sport === sportData.sport);
      if (!sportResult) return;

      if (sportData.newArticles.length > 0) {
        await markArticlesAnalyzed(sportData.newArticles, sportData.id, sportResult.sentiment_score);
      }

      await saveAgentMemory(
        sportData.id,
        'Press coverage',
        sportResult,
        sportResult.change_explanation,
        sportData.newArticles.length,
      );
    }),
  );

  console.log(`[Press coverage] completed in ${Date.now() - start}ms`);
  return result;
}
