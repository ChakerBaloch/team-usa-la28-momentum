function Bracket({ sports, isLoading }) {
  const [seedOne, seedTwo, seedThree, seedFour] = sports;
  const finalists = [seedOne, seedTwo].filter(Boolean);
  const spotlight = sports[0];

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Momentum Bracket</p>
          <h2>Top 4 Sports Snapshot</h2>
        </div>
        <p className="panel-caption">
          A simple visual bracket comparing the strongest current momentum signals.
        </p>
      </div>

      {isLoading ? (
        <div className="state-card">Building the bracket...</div>
      ) : (
        <div className="bracket-grid">
          <div className="bracket-column">
            <p className="bracket-label">Semi 1</p>
            {seedOne ? <BracketCard sport={seedOne} /> : null}
            {seedFour ? <BracketCard sport={seedFour} /> : null}
          </div>

          <div className="bracket-column">
            <p className="bracket-label">Semi 2</p>
            {seedTwo ? <BracketCard sport={seedTwo} /> : null}
            {seedThree ? <BracketCard sport={seedThree} /> : null}
          </div>

          <div className="bracket-spotlight">
            <p className="bracket-label">Final Focus</p>
            <div className="bracket-spotlight-card">
              <h3>{spotlight?.sport || 'Momentum spotlight pending'}</h3>
              <p>
                {spotlight
                  ? `${spotlight.category} sport with a score of ${spotlight.momentumScore}.`
                  : 'Top performers will appear here after scores load.'}
              </p>
              {finalists.length ? (
                <div className="finalist-row">
                  {finalists.map((sport) => (
                    <span key={sport.id} className="finalist-chip">
                      #{sport.rank} {sport.sport}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function BracketCard({ sport }) {
  return (
    <article className="bracket-card">
      <div>
        <p className="bracket-seed">Seed #{sport.rank}</p>
        <h3>{sport.sport}</h3>
      </div>
      <div className="bracket-score">{sport.momentumScore}</div>
    </article>
  );
}

export default Bracket;
