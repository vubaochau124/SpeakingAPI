import os
import tempfile
import base64
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from speechace_api import SpeechAceAPI

app = FastAPI(title="Speech Evaluation API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Configure upload
UPLOAD_FOLDER = tempfile.gettempdir()
ALLOWED_EXTENSIONS = {'wav', 'mp3', 'm4a', 'webm', 'ogg', 'aiff'}


def allowed_file(filename: str) -> bool:
    """Check if file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


@app.get("/api/health")
async def health():
    """Health check endpoint"""
    return {"status": "ok"}


@app.post("/api/evaluate")
async def evaluate_audio(audio: UploadFile = File(...)):
    """Endpoint to evaluate audio file"""

    # Validate file
    if not audio.filename:
        raise HTTPException(status_code=400, detail="No file selected")

    if not allowed_file(audio.filename):
        raise HTTPException(status_code=400, detail="Invalid file type. Allowed: wav, mp3, m4a, webm, ogg, aiff")

    # Save uploaded file temporarily
    filename = audio.filename.replace(" ", "_")
    filepath = os.path.join(UPLOAD_FOLDER, filename)

    try:
        # Save file
        with open(filepath, "wb") as buffer:
            content = await audio.read()
            buffer.write(content)

        # Initialize SpeechAce API
        client = SpeechAceAPI()

        # Get evaluation results
        results = client.score_audio(
            audio_file_path=filepath,
            user_id="web-user",
            dialect="en-us",
            pronunciation_score_mode="default",
            detect_dialect=1,
            enforce_dialect=1
        )

        # Read audio file and convert to base64
        with open(filepath, 'rb') as audio_file:
            audio_data = base64.b64encode(audio_file.read()).decode('utf-8')
            ext = filename.rsplit('.', 1)[1].lower()
            mime_types = {
                'wav': 'audio/wav',
                'mp3': 'audio/mpeg',
                'm4a': 'audio/mp4',
                'webm': 'audio/webm',
                'ogg': 'audio/ogg',
                'aiff': 'audio/aiff'
            }
            mime_type = mime_types.get(ext, 'audio/wav')
            results['audio_data'] = f"data:{mime_type};base64,{audio_data}"

        # Clean up
        os.remove(filepath)

        return results

    except Exception as e:
        # Clean up on error
        if os.path.exists(filepath):
            os.remove(filepath)
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == '__main__':
    import uvicorn
    print("Backend server starting on http://localhost:5000")
    uvicorn.run(app, host="0.0.0.0", port=5000)
