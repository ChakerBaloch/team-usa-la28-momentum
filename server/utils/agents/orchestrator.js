export async function runOrchestrator(sports) {
  console.log('[orchestrator] started');
  const start = Date.now();

  const sportIds = sports.map((s) => s.id);

  const result = [
    {
      agentId: 'medal_trajectory',
      sportList: sportIds,
      dataKey: 'worldChampionshipCount',
      analysisQuestion: 'What is the historical championship trend?',
      confidenceRequired: 'high',
    },
    {
      agentId: 'news_sentiment',
      sportList: sportIds,
      dataKey: 'recentNewsSummaries',
      analysisQuestion: 'What are the momentum signals in recent news?',
      confidenceRequired: 'medium',
    },
    {
      agentId: 'pipeline_growth',
      sportList: sportIds,
      dataKey: 'growthSignalCount',
      analysisQuestion: 'What is the state of athlete development and participation depth?',
      confidenceRequired: 'medium',
    },
    {
      agentId: 'paralympic_parity',
      sportList: sportIds,
      dataKey: 'category',
      analysisQuestion: 'How does Paralympic representation balance with Olympic?',
      confidenceRequired: 'high',
    },
  ];

  console.log(`[orchestrator] completed in ${Date.now() - start}ms`);
  return result;
}
