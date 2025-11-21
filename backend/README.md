# Speech Evaluation Backend

Python FastAPI backend for the Speech Evaluation application.

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Make sure you have a `.env` file in the parent directory with your SpeechAce API key:
```
SPEECHACE_API_KEY=your_api_key_here
```

## Running the Server

```bash
python -m uvicorn app:app --reload --port 5000
```

The server will start on `http://localhost:5000`

You can also access the auto-generated API docs at:
- Swagger UI: `http://localhost:5000/docs`
- ReDoc: `http://localhost:5000/redoc`

## API Endpoints

### POST /api/evaluate
Evaluates an audio file and returns speech analysis results.

**Request:**
- Method: POST
- Content-Type: multipart/form-data
- Body: audio file (wav, mp3, m4a, webm, ogg, aiff)

**Response:**
```json
{
  "speech_score": {
    "transcript": "...",
    "word_score_list": [...],
    "cefr_score": {...}
  },
  "audio_data": "data:audio/webm;base64,..."
}
```

### GET /api/health
Health check endpoint.
