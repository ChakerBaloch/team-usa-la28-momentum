# Team USA LA28 Momentum Tracker

Team USA LA28 Momentum Tracker is a hackathon MVP for the Team USA x Google Cloud Hackathon, built for Challenge 3: "The Road to LA28 Games Bracket." It gives fans a clean, interactive way to compare Olympic and Paralympic sports using curated public-data-inspired momentum signals, then uses Gemini to turn those signals into fan-friendly analysis.

The app is intentionally simple: a React frontend shows a ranked leaderboard, a bracket-style top four comparison, and a detail panel. An Express backend loads a local JSON dataset, calculates deterministic momentum scores, and calls Gemini for structured narrative analysis.

## What This MVP Does

- Ranks 8 sports with equal treatment across Olympic and Paralympic categories.
- Calculates a deterministic momentum score using a transparent backend formula.
- Shows a "Momentum Bracket" for the current top 4 sports.
- Calls Gemini to generate a momentum summary, fan reasons to watch, LA28 outlook, score explanation, parity note, and caution statement.
- Uses cautious language and avoids guaranteeing future outcomes.
- Supports local development and a single-service deployment path to Google Cloud Run.

## Feature Snapshot

- Responsive hero section and polished dashboard layout
- Leaderboard cards with rank, category, score, and signal summary
- Bracket-style comparison for top momentum sports
- Detail panel with loading and error states
- `GET /api/sports` for scored dataset access
- `POST /api/analyze` for Gemini-powered structured analysis
- Optional production serving of the built React app from Express

## Tech Stack

### Frontend

- React
- Vite
- Plain CSS

### Backend

- Node.js
- Express
- CORS
- Gemini API via `@google/genai`

### Deployment

- Google Cloud Run
- Docker multi-stage build

## How Gemini Is Used

Gemini is used only on the backend. When a fan selects a sport:

1. The server loads the matching sport from the curated JSON dataset.
2. The server calculates the sport's raw and normalized momentum scores.
3. The server sends only the provided sport data and score breakdown to Gemini.
4. Gemini returns structured JSON with:
   - `momentumSummary`
   - `whyFansShouldWatch`
   - `la28Outlook`
   - `scoreExplanation`
   - `parityNote`
   - `caution`

The prompt explicitly tells Gemini to:

- Analyze only the provided dataset
- Avoid inventing athletes, medals, or exact results
- Use conditional language
- Treat Olympic and Paralympic sports with equal analytical depth

## How Google Cloud Is Used

This MVP is designed to deploy as a single containerized web service on Google Cloud Run:

- Cloud Run hosts the Express server
- The server can also serve the built React frontend from `client/dist`
- `GEMINI_API_KEY` is supplied as a Cloud Run environment variable or secret
- Cloud Run injects the runtime `PORT`, which the server already respects

## Project Structure

```text
team-usa-la28-momentum/
  client/
    package.json
    index.html
    vite.config.js
    src/
      main.jsx
      App.jsx
      api.js
      styles.css
      components/
        Hero.jsx
        Leaderboard.jsx
        Bracket.jsx
        SportDetail.jsx
  server/
    package.json
    index.js
    .env.example
    data/
      sportsMomentum.json
    utils/
      score.js
      gemini.js
  Dockerfile
  README.md
  LICENSE
  .gitignore
  .dockerignore
```

## Build Process Documentation

This section documents the full MVP build process so you can explain the work clearly during judging or handoff.

### 1. Scope the MVP Around One Clear Fan Experience

The product goal was narrowed to one simple story: show which Team USA Olympic and Paralympic sports appear to have stronger public momentum heading into LA28, then let Gemini explain why fans may want to watch them.

That meant avoiding anything that would slow the build down without helping the demo:

- No authentication
- No database
- No scraping pipeline
- No real tournament engine
- No prediction claims presented as certainty

### 2. Create a Transparent, Curated Demo Dataset

The app uses a local file at `server/data/sportsMomentum.json` with 8 sports total:

- 4 Olympic sports
- 4 Paralympic sports

The dataset is labeled as a curated public-data-inspired demo dataset. It includes momentum-style indicators such as:

- `worldChampionshipCount`
- `recentHeadlineCount`
- `growthSignalCount`
- short momentum signals
- recent news summaries
- source notes

This keeps the MVP easy to explain and deterministic while still feeling grounded in real fan-facing storytelling.

### 3. Add Deterministic Scoring in the Backend

Momentum is calculated in `server/utils/score.js` using the required formula:

```text
momentumScore =
  worldChampionshipCount * 4 +
  recentHeadlineCount * 10 +
  growthSignalCount * 8 +
  parityBonus
```

Where:

- `parityBonus = 10` for Paralympic sports
- `parityBonus = 5` for Olympic sports

The raw scores are then normalized to a `0-100` range across the 8-sport dataset. That gives the UI a clean, consistent score display while keeping the raw formula transparent.

### 4. Build the Express API Layer

Two main API routes power the app:

- `GET /api/sports`
  Returns all sports with calculated scores and ranking.
- `POST /api/analyze`
  Accepts `{ "sportId": "swimming" }`, calculates the score, and sends the selected record to Gemini for structured analysis.

The backend also:

- loads `GEMINI_API_KEY` from environment variables
- uses `process.env.PORT` for Cloud Run compatibility
- enables CORS for configured frontend origins
- serves the production React build when present

### 5. Use Gemini for Structured Fan-Friendly Analysis

The Gemini helper in `server/utils/gemini.js` uses a structured JSON schema so the frontend receives predictable fields for display.

This was chosen to keep the demo reliable:

- no parsing of loose prose blobs
- no markdown cleanup in the UI
- easy loading and error handling
- simple judge-friendly explanation of the AI workflow

### 6. Build a Focused React Frontend

The frontend centers on four pieces:

1. Hero section
2. Momentum leaderboard
3. Bracket-style top four comparison
4. Detail panel with Gemini analysis

The UI is intentionally polished but lightweight, using plain CSS and responsive cards rather than a component framework.

### 7. Prepare a Simple Cloud Run Deployment Path

The included `Dockerfile` builds the React client, installs server dependencies, and runs the Express app as a single Cloud Run service. That makes the deployment story much easier for a hackathon:

- one service
- one URL
- one environment variable for Gemini

### 8. Verify Locally

The final verification path is:

1. Run the Express API locally on port `8080`
2. Run the Vite frontend locally on port `5173`
3. Use the UI to fetch the sports list and request Gemini analysis for a selected sport
4. Run a production client build to confirm the app is ready for container deployment

## Local Development Setup

### Prerequisites

- Node.js 20 or later
- A Gemini API key

### Backend Setup

```bash
cd server
npm install
cp .env.example .env
```

Edit `server/.env`:

```env
GEMINI_API_KEY=your_key_here
PORT=8080
FRONTEND_ORIGIN=http://localhost:5173
GEMINI_MODEL=gemini-3-flash-preview
```

`FRONTEND_ORIGIN` is optional when the frontend and backend are deployed together on Cloud Run. Keep it for local split-origin development or if the frontend is hosted separately.

Start the backend:

```bash
npm run dev
```

### Frontend Setup

Open a second terminal:

```bash
cd client
npm install
npm run dev
```

The Vite dev server runs on `http://localhost:5173` and proxies `/api` requests to `http://localhost:8080`.

## API Reference

### `GET /api/sports`

Returns the curated dataset plus calculated scores and rank.

Example response shape:

```json
{
  "datasetLabel": "curated public-data-inspired demo dataset",
  "sports": [
    {
      "id": "swimming",
      "sport": "Swimming",
      "category": "Olympic",
      "momentumScore": 84,
      "rank": 4
    }
  ]
}
```

### `POST /api/analyze`

Request:

```json
{
  "sportId": "swimming"
}
```

Response shape:

```json
{
  "sportId": "swimming",
  "momentumScore": 84,
  "analysis": {
    "momentumSummary": "...",
    "whyFansShouldWatch": "...",
    "la28Outlook": "...",
    "scoreExplanation": "...",
    "parityNote": "...",
    "caution": "..."
  }
}
```

## Deploying to Google Cloud Run

### 1. Authenticate and Select a Project

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

### 2. Enable Required Services

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

### 3. Deploy From the Project Root

From `team-usa-la28-momentum/`:

```bash
gcloud run deploy team-usa-la28-momentum \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY=YOUR_GEMINI_API_KEY
```

If you prefer using Secret Manager, replace the plain env var with a secret-backed configuration.

### 4. Optional CORS Configuration

If you later split the frontend and backend into separate services, add the deployed frontend origin:

```bash
gcloud run services update team-usa-la28-momentum \
  --region us-central1 \
  --update-env-vars FRONTEND_ORIGIN=https://your-frontend-domain
```

### 5. Test the Deployed Service

- Open the Cloud Run service URL
- Confirm the leaderboard loads
- Click a sport and verify Gemini analysis appears

## Judging Notes

This MVP is easy to demo live:

1. Show the ranked sports list.
2. Explain that the score is deterministic and transparent.
3. Click into a sport to show Gemini turning structured signals into fan-friendly analysis.
4. Point out the parity bonus and equal treatment of Olympic and Paralympic sports.
5. Reinforce that the language is cautious and does not guarantee future performance.

## Verification Notes

The MVP was checked with:

- dependency installation in both `client/` and `server/`
- a successful Vite production build
- a live smoke test confirming:
  - `GET /api/health` returns `200`
  - `GET /api/sports` returns 8 scored sports
  - `GET /` serves the built React app through Express
  - `POST /api/analyze` correctly reports a missing `GEMINI_API_KEY` until a real key is supplied

## Data Disclaimer

This project uses a curated public-data-inspired demo dataset for hackathon purposes. Gemini explains patterns from the provided dataset and does not guarantee future results, athlete outcomes, or Team USA performance at LA28.
