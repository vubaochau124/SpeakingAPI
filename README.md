# SpeechAce - English Speech Evaluation

AI-powered English speech evaluation using Azure Speech API and OpenAI.

## Quick Start

### Backend
```bash
cd backend
pip install -r requirements.txt
python app.py
```
Server runs on http://localhost:5000

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Environment Variables

Create `.env` in `/backend`:
```
AZURE_SPEECH_KEY=your_key
AZURE_SPEECH_REGION=southeastasia
OPENAI_API_KEY=your_key
DATABASE_URL=postgresql://user:pass@localhost:5432/azure
SECRET_KEY=your_secret
```
