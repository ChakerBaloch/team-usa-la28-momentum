function Hero({ sports }) {
  const olympicCount = sports.filter((sport) => sport.category === 'Olympic').length;
  const paralympicCount = sports.filter((sport) => sport.category === 'Paralympic').length;

  return (
    <section className="hero-card">
      <div className="hero-copy">
        <p className="eyebrow">Challenge 3 • Road to LA28 Games Bracket</p>
        <h1>Team USA LA28 Momentum Tracker</h1>
        <p className="hero-subtitle">
          An AI-powered fan analyst ranking Olympic and Paralympic sports by
          public momentum signals heading toward LA28.
        </p>
      </div>

      <div className="hero-stats">
        <div className="hero-stat">
          <span className="hero-stat-value">{sports.length || 8}</span>
          <span className="hero-stat-label">Sports Tracked</span>
        </div>
        <div className="hero-stat">
          <span className="hero-stat-value">{olympicCount || 4}</span>
          <span className="hero-stat-label">Olympic</span>
        </div>
        <div className="hero-stat">
          <span className="hero-stat-value">{paralympicCount || 4}</span>
          <span className="hero-stat-label">Paralympic</span>
        </div>
      </div>
    </section>
  );
}

export default Hero;
