function Leaderboard({ sports, isLoading, error, selectedSportId, onSelectSport }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Momentum Leaderboard</p>
          <h2>National Momentum Signals</h2>
        </div>
        <p className="panel-caption">
          Deterministic ranking using championship volume, recent headlines, growth
          signals, and a category parity bonus.
        </p>
      </div>

      {isLoading ? (
        <div className="state-card">Loading scored sports...</div>
      ) : null}

      {error ? <div className="state-card state-card-error">{error}</div> : null}

      {!isLoading && !error ? (
        <div className="leaderboard-list">
          {sports.map((sport) => {
            const shortSummary = sport.momentumSignals.slice(0, 2).join(' • ');

            return (
              <button
                key={sport.id}
                className={`leaderboard-card${
                  selectedSportId === sport.id ? ' leaderboard-card-active' : ''
                }`}
                type="button"
                onClick={() => onSelectSport(sport.id)}
              >
                <div className="leaderboard-rank">#{sport.rank}</div>

                <div className="leaderboard-copy">
                  <div className="leaderboard-heading">
                    <h3>{sport.sport}</h3>
                    <span className={`sport-tag sport-tag-${sport.category.toLowerCase()}`}>
                      {sport.category}
                    </span>
                  </div>

                  <p className="leaderboard-summary">{shortSummary}</p>
                </div>

                <div className="score-pill">
                  <span className="score-pill-value">{sport.momentumScore}</span>
                  <span className="score-pill-label">Momentum</span>
                </div>
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

export default Leaderboard;
