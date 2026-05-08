import { callAgent } from '../gemini.js';

const SENTIMENT_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    required: [
      'sport',
      'sentiment_score',
      'momentum_signals',
      'risk_signals',
      'notable_quote_themes',
      'article_count',
      'recency_weight',
    ],
    properties: {
      sport: { type: 'string' },
      sentiment_score: { type: 'number' },
      momentum_signals: { type: 'array', items: { type: 'string' } },
      risk_signals: { type: 'array', items: { type: 'string' } },
      notable_quote_themes: { type: 'array', items: { type: 'string' } },
      article_count: { type: 'number' },
      recency_weight: { type: 'number' },
    },
  },
};

function prepareSentimentData(sports) {
  return sports.map((s) => ({
    id: s.id,
    sport: s.sport,
    category: s.category,
    recentHeadlineCount: s.recentHeadlineCount,
    momentumSignals: (s.momentumSignals || []).slice(0, 3),
    // Only headline + recencyWeight — no full excerpts to save tokens
    articles: (s.newsArticles || []).map((a) => ({
      headline: a.headline,
      recencyWeight: a.recencyWeight,
    })),
  }));
}

export async function runNewsSentimentAgent(sports) {
  console.log('[news_sentiment] started');
  const start = Date.now();

  const sentimentData = prepareSentimentData(sports);

  const prompt = `
You are a sports intelligence analyst for the Team USA LA28 momentum system.

Below is recent news data for each sport:
${JSON.stringify(sentimentData, null, 2)}

For each sport, analyze the articles and return:
- sentiment_score: 0–10, where 10 = peak public momentum (use recencyWeight to boost more recent articles)
- momentum_signals: specific positive momentum events found in the articles (2–4 items)
- risk_signals: potential headwinds or concerns from the articles (1–3 items, or empty array if none)
- notable_quote_themes: recurring narrative themes in the coverage, NOT specific quotes (2–3 items)
- article_count: total articles analyzed
- recency_weight: average recency weight of the articles (0–1)

Rules:
- Use conditional language throughout (e.g., "could indicate", "suggests", "may reflect")
- Give equal analytical depth to Paralympic and Olympic sports
- A sport with 3 very recent articles should score higher than one with 5 older articles if signals are equivalent
- Do NOT invent articles or facts not present in the provided data

Return ONLY valid JSON matching the schema.
`.trim();

  const result = await callAgent('news_sentiment', prompt, SENTIMENT_SCHEMA);

  console.log(`[news_sentiment] completed in ${Date.now() - start}ms`);
  return result;
}
