import { useEffect, useState } from 'react';
import { analyzeAll, fetchSports, loadMomentumData } from './api';
import './styles.css';
import usFlag from './us-flag.svg';

const AGENTS = [
  { id: 'medal_trajectory', label: 'Medal trend' },
  { id: 'news_sentiment', label: 'Press coverage' },
  { id: 'pipeline_growth', label: 'Athlete development' },
  { id: 'paralympic_parity', label: 'Paralympic' },
  { id: 'synthesis_judge', label: 'Overall ranking' },
];

const SCORE_COLOR = {
  high: '#E8451A',
  rising: '#1A6FE8',
  building: '#888',
};

const TOAST_LIFETIME_MS = 4200;
const TOAST_FADE_MS = 320;

function AgentStrip({ agentState }) {
  return (
    <div className="agent-strip">
      {AGENTS.map((agent) => {
        const state = agentState[agent.id] || 'idle';
        const statusLabel =
          state === 'done'
            ? 'Complete'
            : state === 'live'
              ? agent.id === 'synthesis_judge'
                ? 'Ranking…'
                : 'Running…'
              : state === 'error'
                ? 'Paused — retrying'
                : 'Waiting';

        return (
          <div key={agent.id} className="agent-item">
            <div className="ai-name">{agent.label}</div>
            <div className="ai-status">
              <span className={`dot dot-${state}`} />
              {statusLabel}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GCloudBadge() {
  return (
    <div className="gcloud">
      <div className="gdots">
        <div className="gd" style={{ background: '#4285F4' }} />
        <div className="gd" style={{ background: '#EA4335' }} />
        <div className="gd" style={{ background: '#FBBC05' }} />
        <div className="gd" style={{ background: '#34A853' }} />
      </div>
      <span className="gcloud-text">Vertex AI · Gemini · Cloud Run</span>
    </div>
  );
}

function ErrorToast({ message, visible }) {
  if (!message) {
    return null;
  }

  return (
    <div className={`error-toast${visible ? ' error-toast-visible' : ''}`} role="status" aria-live="polite">
      <div className="error-toast-label">Analysis update</div>
      <div className="error-toast-body">{message}</div>
    </div>
  );
}

function SportRow({ sportData, rankedData, isActive, onSelect }) {
  const score = rankedData?.composite_score ?? sportData?.momentumScore ?? '—';
  const tier = rankedData?.momentum_tier ?? getTierFromScore(Number(score) || 0);
  const tierClass = tier === 'high' ? 't-fire' : tier === 'rising' ? 't-rise' : 't-build';
  const tierLabel = tier === 'high' ? 'High' : tier === 'rising' ? 'Rising' : 'Building';
  const name = rankedData?.sport ?? sportData?.sport ?? '';
  const category = sportData?.category ?? '';
  const isNew = sportData?.isNewOlympicSport;
  const rank = rankedData?.rank ?? sportData?.rank ?? '—';
  const summary = (sportData?.momentumSignals ?? []).slice(0, 2).join(' · ');

  return (
    <button
      type="button"
      className={`sport-row ${tierClass}${isActive ? ' active' : ''}`}
      onClick={onSelect}
    >
      <span className="sr-rank">{String(rank).padStart(2, '0')}</span>

      <div className="sr-body">
        <div className="sr-name">
          {name}
          {category === 'Paralympic' ? <span className="badge badge-para">Paralympic</span> : null}
          {isNew ? <span className="badge badge-new">New</span> : null}
        </div>
        <div className="sr-sub">{summary}</div>
      </div>

      <div className="sr-right">
        <div className="sr-score">{score}</div>
        <div className="sr-tier">{tierLabel}</div>
      </div>
    </button>
  );
}

function TierSection({ label, children }) {
  if (!children.length) {
    return null;
  }

  return (
    <>
      <div className="tier-div">
        <span className="tier-div-label">{label}</span>
      </div>
      {children}
    </>
  );
}

function SkeletonRows() {
  return Array.from({ length: 8 }, (_, index) => (
    <div key={index} className="sport-row-skeleton">
      <div className="skel" style={{ width: 36, height: 36 }} />
      <div className="sport-row-skeleton-body">
        <div className="skel" style={{ width: '55%', height: 20 }} />
        <div className="skel" style={{ width: '88%', height: 12 }} />
      </div>
      <div className="skel" style={{ width: 44, height: 44 }} />
    </div>
  ));
}

function DetailPanel({ detail }) {
  if (!detail) {
    return <div className="right" id="detail-panel" />;
  }

  const color = SCORE_COLOR[detail.momentum_tier] || '#888';

  return (
    <div className="right" id="detail-panel" key={detail.sport}>
      <div className="panel-sport-name">{detail.sport}</div>

      <div className="panel-score-row">
        <div className="panel-score" style={{ color }}>
          {detail.composite_score}
        </div>
        <div className="panel-ci">± {detail.confidence_interval} pt margin</div>
      </div>

      <div className="signals">
        {detail.signals.map((signal) => (
          <div key={signal.label} className="sig-row">
            <span className="sig-label">{signal.label}</span>
            <div className="sig-track">
              <div
                className="sig-fill"
                style={{ width: `${signal.value}%`, background: signal.color }}
              />
            </div>
            <span className="sig-val">{signal.value}</span>
          </div>
        ))}
      </div>

      {detail.contradiction ? (
        <div className="conflict-flag">⚠ The data is mixed — {detail.contradiction}</div>
      ) : (
        <div className="no-conflict">✓ Ranking factors agree</div>
      )}

      {detail.headline ? (
        <div className="vibe-container">
          <h2 className="vibe-headline">{detail.headline}</h2>
          <div className="vibe-why-watch">
            <span className="vibe-label">Why Watch</span>
            <p>{detail.why_watch}</p>
          </div>
          <p className="vibe-story">{detail.momentum_story}</p>
          <div className="vibe-fan-signal">
            <span className="vibe-fan-icon">🔥</span>
            {detail.fan_signal}
          </div>
          <div className="vibe-prediction">
            <span className="vibe-label">LA28 Outlook</span>
            <p>{detail.la28_prediction}</p>
          </div>
        </div>
      ) : (
        <div className="narrative">{detail.narrative}</div>
      )}

      <div className="para-block">
        <div className="para-label">Paralympic coverage</div>
        {detail.paraNote.grade === 'N/A' ? (
          <span className="para-note para-note-muted">{detail.paraNote.note}</span>
        ) : (
          <>
            <span className="para-grade">{detail.paraNote.grade}</span>
            <span className="para-note">{detail.paraNote.note}</span>
          </>
        )}
      </div>

      <GCloudBadge />
    </div>
  );
}

// Maps any old/server label to the approved copy
const SIGNAL_LABEL_MAP = {
  'Medal trajectory': 'Medal trend',
  'Medal Trajectory': 'Medal trend',
  'News sentiment': 'Press coverage',
  'News Sentiment': 'Press coverage',
  'Pipeline growth': 'Athlete development',
  'Pipeline Growth': 'Athlete development',
  'Para parity': 'Paralympic',
  'Para Parity': 'Paralympic',
  'Paralympic parity': 'Paralympic',
  'Paralympic Parity': 'Paralympic',
  'Synthesis judge': 'Overall ranking',
  'Synthesis Judge': 'Overall ranking',
};

function normalizeSignalLabel(label) {
  return SIGNAL_LABEL_MAP[label] || label;
}

function getTierFromScore(score) {
  if (score >= 85) {
    return 'high';
  }

  if (score >= 70) {
    return 'rising';
  }

  return 'building';
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function findSportMatch(name, sports) {
  if (!name) {
    return null;
  }

  const normalizedName = name.toLowerCase().replace(/[^a-z0-9]/g, '');

  return (
    sports.find((sport) => {
      const normalizedSport = sport.sport.toLowerCase().replace(/[^a-z0-9]/g, '');
      return sport.sport === name || sport.id === normalizedName || normalizedSport === normalizedName;
    }) || null
  );
}

function buildFallbackDetail(sport) {
  const tier = getTierFromScore(sport.momentumScore);
  const narrativeSeed = sport.recentNewsSummaries?.[0]
    || `${sport.sport} could be one of the more watchable Team USA storylines heading toward LA28.`;

  const paraNote =
    sport.category === 'Paralympic'
      ? {
        grade: 'A',
        note: 'This Paralympic sport carries full analytical weight in the rankings.',
      }
      : sport.isNewOlympicSport
        ? {
          grade: 'N/A',
          note: 'No Paralympic counterpart exists for this sport in the current dataset.',
        }
        : {
          grade: 'B',
          note: 'Paralympic coverage will be clearer once the full analysis is complete.',
        };

  return {
    sport: sport.sport,
    composite_score: sport.momentumScore,
    confidence_interval: 6,
    momentum_tier: tier,
    signals: [
      {
        label: 'Medal trend',
        value: clampScore(sport.worldChampionshipCount * 8),
        color: '#E8451A',
      },
      {
        label: 'Press coverage',
        value: clampScore(sport.recentHeadlineCount * 20),
        color: '#1A6FE8',
      },
      {
        label: 'Athlete development',
        value: clampScore(sport.growthSignalCount * 20),
        color: '#22c55e',
      },
    ],
    contradiction: null,
    narrative: `"${narrativeSeed}"`,
    paraNote,
  };
}

function buildRankedDetail(rankedSport, sportData, contradiction) {
  return {
    sport: rankedSport.sport,
    composite_score: rankedSport.composite_score,
    confidence_interval: rankedSport.confidence_interval,
    momentum_tier: rankedSport.momentum_tier,
    signals: (rankedSport.signals || []).map((signal, index) => ({
      label: normalizeSignalLabel(signal.label),
      value: signal.value,
      color: ['#E8451A', '#1A6FE8', '#22c55e'][index % 3],
    })),
    contradiction: contradiction || null,
    headline: rankedSport.headline || null,
    why_watch: rankedSport.why_watch || null,
    momentum_story: rankedSport.momentum_story || null,
    la28_prediction: rankedSport.la28_prediction || null,
    fan_signal: rankedSport.fan_signal || null,
    narrative: rankedSport.narrative || buildFallbackDetail(sportData).narrative,
    paraNote: rankedSport.para_note || buildFallbackDetail(sportData).paraNote,
  };
}

function getFriendlyErrorMessage(error, context) {
  const rawMessage = `${error?.message || error || ''}`.toLowerCase();

  if (
    rawMessage.includes('resource_exhausted')
    || rawMessage.includes('prepayment credits are depleted')
    || rawMessage.includes('quota')
    || rawMessage.includes('rate limit')
    || rawMessage.includes('429')
  ) {
    return 'Analysis is paused. We\'ll resume shortly, but you can keep exploring the current rankings.';
  }

  if (
    rawMessage.includes('service_disabled')
    || rawMessage.includes('permission_denied')
    || rawMessage.includes('generativelanguage')
    || rawMessage.includes('api is not available')
    || rawMessage.includes('api has not been used')
  ) {
    return 'The analysis service is still starting up. Try again in a few minutes.';
  }

  if (rawMessage.includes('missing gemini_api_key')) {
    return 'Analysis is not configured for this deployment yet.';
  }

  if (
    rawMessage.includes('failed to fetch')
    || rawMessage.includes('networkerror')
    || rawMessage.includes('network request failed')
  ) {
    return context === 'sports'
      ? 'Can\'t reach the service right now. Please refresh and try again.'
      : 'Can\'t reach the analysis service right now. Try again in a moment.';
  }

  return context === 'sports'
    ? 'Could not load the sport list right now. Please refresh and try again.'
    : 'Could not refresh the rankings right now. Try again in a moment.';
}

export default function App() {
  const [sports, setSports] = useState([]);
  const [sportsLoading, setSportsLoading] = useState(true);
  const [sportsError, setSportsError] = useState('');
  const [ranked, setRanked] = useState([]);
  const [contradictionMap, setContradictionMap] = useState({});
  const [analysisError, setAnalysisError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [dataSource, setDataSource] = useState('loading'); // 'gcs' | 'fallback' | 'live' | 'loading'
  const [toast, setToast] = useState({ message: '', visible: false, key: 0 });
  const [agentState, setAgentState] = useState({
    medal_trajectory: 'idle',
    news_sentiment: 'idle',
    pipeline_growth: 'idle',
    paralympic_parity: 'idle',
    synthesis_judge: 'idle',
  });

  useEffect(() => {
    if (!toast.message || !toast.visible) {
      return undefined;
    }

    const hideTimer = setTimeout(() => {
      setToast((current) => ({ ...current, visible: false }));
    }, TOAST_LIFETIME_MS);

    return () => clearTimeout(hideTimer);
  }, [toast.key, toast.message, toast.visible]);

  useEffect(() => {
    if (!toast.message || toast.visible) {
      return undefined;
    }

    const clearTimer = setTimeout(() => {
      setToast((current) => (current.visible ? current : { message: '', visible: false, key: 0 }));
    }, TOAST_FADE_MS);

    return () => clearTimeout(clearTimer);
  }, [toast.message, toast.visible]);

  function showFriendlyToast(message) {
    setToast({ message, visible: true, key: Date.now() });
  }

  function dismissToast() {
    setToast((current) => (current.message ? { ...current, visible: false } : current));
  }

  useEffect(() => {
    async function loadSports() {
      try {
        setSportsLoading(true);
        setSportsError('');

        const payload = await fetchSports();
        const list = payload.sports || [];
        setSports(list);

        if (list.length) {
          setSelectedId(list[0].id);
        }
      } catch (error) {
        setSportsError(error.message || 'Unable to load sports.');
        showFriendlyToast(getFriendlyErrorMessage(error, 'sports'));
      } finally {
        setSportsLoading(false);
      }
    }

    loadSports();
  }, []);

  async function runAnalysis() {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    setAnalysisError('');
    setAgentState({
      medal_trajectory: 'live',
      news_sentiment: 'live',
      pipeline_growth: 'live',
      paralympic_parity: 'live',
      synthesis_judge: 'idle',
    });

    const synthTimer = setTimeout(() => {
      setAgentState((current) => ({ ...current, synthesis_judge: 'live' }));
    }, 1600);

    try {
      const result = await analyzeAll();
      clearTimeout(synthTimer);

      // RULE 3: Live results stay in React state only.
      // They are never written to Cloud Storage, localStorage, or any persistence API.
      // Refreshing the page will show the cron data, not this live run.
      setRanked(result.ranked || []);
      setDataSource('live');
      setAgentState({
        medal_trajectory: 'done',
        news_sentiment: 'done',
        pipeline_growth: 'done',
        paralympic_parity: 'done',
        synthesis_judge: 'done',
      });

      const nextContradictions = {};
      for (const contradiction of result.agentOutputs?.contradictions?.contradictions || []) {
        nextContradictions[contradiction.sport] = contradiction.description;
      }
      setContradictionMap(nextContradictions);

      if (result.ranked?.length) {
        const topSport = findSportMatch(result.ranked[0].sport, sports);
        if (topSport) {
          setSelectedId(topSport.id);
        }
      }
    } catch (error) {
      clearTimeout(synthTimer);
      setAnalysisError(error.message || 'Unable to finish the multi-agent ranking.');
      showFriendlyToast(getFriendlyErrorMessage(error, 'analysis'));
      setAgentState({
        medal_trajectory: 'error',
        news_sentiment: 'error',
        pipeline_growth: 'error',
        paralympic_parity: 'error',
        synthesis_judge: 'error',
      });
    } finally {
      setIsAnalyzing(false);
    }
  }

  // RULE 1: Page load fetches from Cloud Storage — zero Gemini calls.
  // Falls back to local sportsMomentum.json seed if GCS is empty.
  useEffect(() => {
    async function loadFromStorage() {
      try {
        const data = await loadMomentumData();
        setRanked(data.ranked || []);

        const nextContradictions = {};
        for (const c of data.agentOutputs?.contradictions?.contradictions || []) {
          nextContradictions[c.sport] = c.description;
        }
        setContradictionMap(nextContradictions);
        setDataSource('gcs');

        // Set agents to done since we loaded cached data
        setAgentState({
          medal_trajectory: 'done',
          news_sentiment: 'done',
          pipeline_growth: 'done',
          paralympic_parity: 'done',
          synthesis_judge: 'done',
        });

        if (data.ranked?.length && sports.length) {
          const topSport = findSportMatch(data.ranked[0].sport, sports);
          if (topSport) setSelectedId(topSport.id);
        }
      } catch {
        // GCS empty or unavailable — fall back to local sports data
        setDataSource('fallback');
      }
    }

    if (!sportsLoading && sports.length) {
      loadFromStorage();
    }
  }, [sportsLoading, sports]);

  const displaySports =
    ranked.length > 0
      ? ranked
        .map((rankedSport) => {
          const sport = findSportMatch(rankedSport.sport, sports);
          return sport ? { sport, ranked: rankedSport } : null;
        })
        .filter(Boolean)
      : sports.map((sport) => ({ sport, ranked: null }));

  const groupedSports = {
    high: displaySports.filter(({ sport, ranked: rankedSport }) => {
      const tier = rankedSport?.momentum_tier ?? getTierFromScore(sport.momentumScore);
      return tier === 'high';
    }),
    rising: displaySports.filter(({ sport, ranked: rankedSport }) => {
      const tier = rankedSport?.momentum_tier ?? getTierFromScore(sport.momentumScore);
      return tier === 'rising';
    }),
    building: displaySports.filter(({ sport, ranked: rankedSport }) => {
      const tier = rankedSport?.momentum_tier ?? getTierFromScore(sport.momentumScore);
      return tier === 'building';
    }),
  };

  const selectedSport = sports.find((sport) => sport.id === selectedId) || displaySports[0]?.sport || null;
  const selectedRanked =
    ranked.find((rankedSport) => {
      const match = findSportMatch(rankedSport.sport, sports);
      return match?.id === selectedSport?.id;
    }) || null;

  const selectedDetail =
    selectedSport && selectedRanked
      ? buildRankedDetail(
        selectedRanked,
        selectedSport,
        contradictionMap[selectedRanked.sport],
      )
      : selectedSport
        ? buildFallbackDetail(selectedSport)
        : null;

  function renderRows(group) {
    return group.map(({ sport, ranked: rankedSport }) => (
      <SportRow
        key={sport.id}
        sportData={sport}
        rankedData={rankedSport}
        isActive={selectedSport?.id === sport.id}
        onSelect={() => {
          dismissToast();
          setSelectedId(sport.id);
        }}
      />
    ));
  }

  return (
    <>
      <ErrorToast message={toast.message} visible={toast.visible} />


      <div className="nav">
        <div className="nav-left">
          <div className="nav-rings">
            <span className="ring r1" />
            <span className="ring r2" />
            <span className="ring r3" />
            <span className="ring r4" />
            <span className="ring r5" />
          </div>
          <span className="nav-wordmark">Road to LA28</span>
        </div>
        <div className="nav-right-group">
          <span className="nav-right">Team USA Performance Outlook</span>
          <button
            type="button"
            className={`nav-refresh${isAnalyzing ? ' nav-refresh-busy' : ''}`}
            onClick={runAnalysis}
            disabled={isAnalyzing || sportsLoading}
            aria-label="Refresh Rankings"
          >
            {isAnalyzing ? (
              <><span className="nav-spinner" />Analyzing…</>
            ) : (
              <>&#8635; Refresh Rankings</>
            )}
          </button>
        </div>
      </div>

      <div className="hero">
        <div className="hero-content">
          <div className="hero-kicker">Team USA · Los Angeles 2028 Olympics</div>
          <div className="hero-h">
            Which sports
            <br />
            look strongest
            <br />
            heading into <em>LA28</em>
          </div>
          <div className="hero-body">
            Compare Team USA sports using recent results, press coverage,
            athlete development, and Paralympic performance.
          </div>
        </div>
        <img src={usFlag} alt="US Flag" className="hero-image" />
      </div>

      {dataSource === 'fallback' && (
        <div className="data-banner">
          Showing baseline data — live analysis pending.
        </div>
      )}

      <AgentStrip agentState={agentState} />

      <div className="layout">
        <div className="left" id="sport-list">
          {sportsLoading ? (
            <SkeletonRows />
          ) : (
            <>
              <TierSection label="High momentum">{renderRows(groupedSports.high)}</TierSection>
              <TierSection label="Rising">{renderRows(groupedSports.rising)}</TierSection>
              <TierSection label="Building">{renderRows(groupedSports.building)}</TierSection>
            </>
          )}
        </div>

        <DetailPanel detail={selectedDetail} />
      </div>
    </>
  );
}
