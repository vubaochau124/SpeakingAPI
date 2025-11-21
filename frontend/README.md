# Speech Evaluation Frontend

React frontend for the Speech Evaluation application.

## Features

- Record audio directly from your microphone
- Upload audio files (wav, mp3, m4a, webm, ogg, aiff)
- Play back your audio
- View transcript of what was said
- See CEFR scores (Pronunciation, Fluency, Grammar, Coherence, Vocab, Overall)
- Interactive word analysis - click on any word to see detailed phoneme breakdown
- View pronunciation scores for each phoneme

## Setup

1. Install dependencies:
```bash
npm install
```

## Running the App

```bash
npm run dev
```

The app will start on `http://localhost:3000`

Make sure the backend is running on `http://localhost:5000` before using the app.

## Building for Production

```bash
npm run build
```

## Technologies Used

- React 18
- Vite
- Tailwind CSS
- Axios
