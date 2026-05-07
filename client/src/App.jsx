import { startTransition, useEffect, useState } from 'react';
import { analyzeSport, fetchSports } from './api';
import Hero from './components/Hero';
import Leaderboard from './components/Leaderboard';
import Bracket from './components/Bracket';
import SportDetail from './components/SportDetail';

function App() {
  const [sports, setSports] = useState([]);
  const [datasetLabel, setDatasetLabel] = useState('');
  const [sportsLoading, setSportsLoading] = useState(true);
  const [sportsError, setSportsError] = useState('');
  const [selectedSportId, setSelectedSportId] = useState('');
  const [analysisBySport, setAnalysisBySport] = useState({});
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState('');

  useEffect(() => {
    async function loadSports() {
      try {
        setSportsLoading(true);
        setSportsError('');

        const payload = await fetchSports();
        setSports(payload.sports || []);
        setDatasetLabel(payload.datasetLabel || '');

        if (payload.sports?.length) {
          setSelectedSportId(payload.sports[0].id);
        }
      } catch (error) {
        setSportsError(error.message || 'Unable to load sports.');
      } finally {
        setSportsLoading(false);
      }
    }

    loadSports();
  }, []);

  useEffect(() => {
    async function loadAnalysis() {
      if (!selectedSportId || analysisBySport[selectedSportId]) {
        return;
      }

      try {
        setAnalysisLoading(true);
        setAnalysisError('');
        const payload = await analyzeSport(selectedSportId);

        setAnalysisBySport((current) => ({
          ...current,
          [selectedSportId]: payload.analysis,
        }));
      } catch (error) {
        setAnalysisError(error.message || 'Unable to analyze this sport yet.');
      } finally {
        setAnalysisLoading(false);
      }
    }

    loadAnalysis();
  }, [analysisBySport, selectedSportId]);

  const selectedSport = sports.find((sport) => sport.id === selectedSportId) || null;
  const topFourSports = sports.slice(0, 4);
  const selectedAnalysis = selectedSportId ? analysisBySport[selectedSportId] : null;

  function handleSelectSport(sportId) {
    setAnalysisError('');
    startTransition(() => {
      setSelectedSportId(sportId);
    });
  }

  return (
    <div className="app-shell">
      <div className="background-orbit background-orbit-left" aria-hidden="true" />
      <div className="background-orbit background-orbit-right" aria-hidden="true" />
      <main className="page">
        <Hero sports={sports} />

        <section className="dashboard-grid">
          <div className="main-column">
            <Leaderboard
              sports={sports}
              isLoading={sportsLoading}
              error={sportsError}
              selectedSportId={selectedSportId}
              onSelectSport={handleSelectSport}
            />

            <Bracket sports={topFourSports} isLoading={sportsLoading} />
          </div>

          <SportDetail
            sport={selectedSport}
            analysis={selectedAnalysis}
            isLoading={analysisLoading || sportsLoading}
            error={analysisError}
            datasetLabel={datasetLabel}
          />
        </section>

        <footer className="app-footer">
          This is a demo project using curated public-data-inspired signals. Gemini
          explains patterns from the provided dataset and does not guarantee future
          results.
        </footer>
      </main>
    </div>
  );
}

export default App;
