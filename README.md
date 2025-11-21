# Speech Evaluation App

A full-stack web application for evaluating English pronunciation using the SpeechAce API.

## Project Structure

```
SpeechAce/
├── backend/          # Python FastAPI
│   ├── app.py
│   ├── speechace_api.py
│   ├── requirements.txt
│   └── README.md
├── frontend/         # React application
│   ├── src/
│   │   ├── components/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── README.md
├── main.py          # SpeechAce API integration
└── .env             # Environment variables (API key)
```

## Features

- **Audio Input**: Record audio directly or upload audio files
- **Playback**: Listen to your recorded/uploaded audio
- **Transcript**: See what the system heard
- **CEFR Scoring**: Get detailed scores for pronunciation, fluency, grammar, coherence, and vocabulary
- **Word Analysis**: Click on any word to see:
  - Quality score for the word
  - Individual phoneme breakdown
  - How each phoneme was pronounced
  - What each phoneme sounded like

## Setup Instructions

### 1. Backend Setup

```bash
cd backend
pip install -r requirements.txt
```

Make sure you have a `.env` file in the root directory with your SpeechAce API key:
```
SPEECHACE_API_KEY=your_api_key_here
```

### 2. Frontend Setup

```bash
cd frontend
npm install
```

## Running the Application

### Start Backend (Terminal 1)

```bash
cd backend
python -m uvicorn app:app --reload --port 5000
```

Backend will run on: `http://localhost:5000`

### Start Frontend (Terminal 2)

```bash
cd frontend
npm run dev
```

Frontend will run on: `http://localhost:3000`

## Usage

1. Open your browser to `http://localhost:3000`
2. Either:
   - Click "Start Recording" to record audio from your microphone, or
   - Click "Choose File" to upload an audio file
3. Click "Evaluate Speech"
4. View your results:
   - Play back your audio
   - Read the transcript
   - Check your CEFR scores
   - Click on any word to see detailed phoneme analysis

## Technologies

**Backend:**
- Python FastAPI
- Uvicorn (ASGI server)
- SpeechAce API

**Frontend:**
- React 18
- Vite
- Tailwind CSS
- Axios

---