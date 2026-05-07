const PARITY_BONUS = {
  Olympic: 5,
  Paralympic: 10,
};

export function calculateRawMomentumScore(sport) {
  return (
    sport.worldChampionshipCount * 4 +
    sport.recentHeadlineCount * 10 +
    sport.growthSignalCount * 8 +
    (PARITY_BONUS[sport.category] || 0)
  );
}

export function normalizeMomentumScore(rawScore, minScore, maxScore) {
  if (maxScore === minScore) {
    return 100;
  }

  return Math.round(((rawScore - minScore) / (maxScore - minScore)) * 100);
}

export function enrichSportsWithScores(sports) {
  const withRawScores = sports.map((sport) => {
    const parityBonus = PARITY_BONUS[sport.category] || 0;

    return {
      ...sport,
      rawMomentumScore: calculateRawMomentumScore(sport),
      scoreBreakdown: {
        worldChampionshipContribution: sport.worldChampionshipCount * 4,
        recentHeadlineContribution: sport.recentHeadlineCount * 10,
        growthSignalContribution: sport.growthSignalCount * 8,
        parityBonus,
      },
    };
  });

  const rawScores = withRawScores.map((sport) => sport.rawMomentumScore);
  const minScore = Math.min(...rawScores);
  const maxScore = Math.max(...rawScores);

  return withRawScores
    .map((sport) => ({
      ...sport,
      momentumScore: normalizeMomentumScore(sport.rawMomentumScore, minScore, maxScore),
    }))
    .sort((left, right) => {
      if (right.momentumScore !== left.momentumScore) {
        return right.momentumScore - left.momentumScore;
      }

      if (right.rawMomentumScore !== left.rawMomentumScore) {
        return right.rawMomentumScore - left.rawMomentumScore;
      }

      return left.sport.localeCompare(right.sport);
    })
    .map((sport, index) => ({
      ...sport,
      rank: index + 1,
    }));
}
