function SportDetail({ sport, analysis, isLoading, error, datasetLabel }) {
  return (
    <aside className="panel detail-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Sport Detail</p>
          <h2>{sport ? sport.sport : 'Select a sport'}</h2>
        </div>
        {sport ? (
          <span className={`sport-tag sport-tag-${sport.category.toLowerCase()}`}>
            {sport.category}
          </span>
        ) : null}
      </div>

      {sport ? (
        <div className="detail-meta">
          <div className="detail-score">
            <span className="detail-score-value">{sport.momentumScore}</span>
            <span className="detail-score-label">Momentum score</span>
          </div>

          <div className="detail-highlights">
            <p>{sport.la28Status}</p>
            <p>{datasetLabel}</p>
          </div>
        </div>
      ) : (
        <div className="state-card">Choose a sport to see the AI analysis.</div>
      )}

      {error ? <div className="state-card state-card-error">{error}</div> : null}

      {isLoading && sport ? <div className="state-card">Gemini is building the fan analysis...</div> : null}

      {sport ? (
        <div className="detail-content">
          {!isLoading && analysis ? (
            <>
              <DetailBlock title="Momentum Summary" body={analysis.momentumSummary} />
              <DetailBlock title="Why Fans Should Watch" body={analysis.whyFansShouldWatch} />
              <DetailBlock title="LA28 Outlook" body={analysis.la28Outlook} />
              <DetailBlock title="Score Explanation" body={analysis.scoreExplanation} />
              <DetailBlock title="Parity Note" body={analysis.parityNote} />
              <DetailBlock title="Caution" body={analysis.caution} />
            </>
          ) : null}

          <div className="support-grid">
            <section>
              <h3>Momentum Signals</h3>
              <ul>
                {sport.momentumSignals.map((signal) => (
                  <li key={signal}>{signal}</li>
                ))}
              </ul>
            </section>

            <section>
              <h3>Recent News Summaries</h3>
              <ul>
                {sport.recentNewsSummaries.map((summary) => (
                  <li key={summary}>{summary}</li>
                ))}
              </ul>
            </section>

            <section>
              <h3>Source Notes</h3>
              <ul>
                {sport.sourceNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function DetailBlock({ title, body }) {
  return (
    <section className="detail-block">
      <h3>{title}</h3>
      <p>{body}</p>
    </section>
  );
}

export default SportDetail;
