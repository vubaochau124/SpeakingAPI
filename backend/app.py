import os
import tempfile
import base64
import json
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from typing import Optional
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv

# Load environment variables at startup
load_dotenv(override=True)
print(f"[STARTUP] Environment loaded from .env")
print(f"[STARTUP] SPEECHACE_API_KEY present: {bool(os.getenv('SPEECHACE_API_KEY'))}")
print(f"[STARTUP] OPENAI_API_KEY present: {bool(os.getenv('OPENAI_API_KEY'))}")

from speechace_api import SpeechAceAPI
from openai_evaluator import OpenAIEvaluator

app = FastAPI(title="Speech Evaluation API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Configure upload
UPLOAD_FOLDER = tempfile.gettempdir()
ALLOWED_EXTENSIONS = {'wav', 'mp3', 'm4a', 'webm', 'ogg', 'aiff'}

# Results folder
RESULTS_FOLDER = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'results')
os.makedirs(RESULTS_FOLDER, exist_ok=True)


def allowed_file(filename: str) -> bool:
    """Check if file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def calculate_speechace_score(results):
    """Calculate overall SpeechAce score from results

    Args:
        results (dict): SpeechAce API response

    Returns:
        dict: Overall scores for SpeechAce
    """
    speech_score = results.get('speech_score', {})
    ielts = speech_score.get('ielts_score', {})

    scores = {
        'pronunciation_score': ielts.get('pronunciation', 0) * 10,  # Convert 0-9 to 0-90
        'fluency_score': ielts.get('fluency', 0) * 10,
        'grammar_score': ielts.get('grammar', 0) * 10,
        'vocab_score': ielts.get('vocab', 0) * 10,
        'coherence_score': ielts.get('coherence', 0) * 10,
        'total_score': 0,
        'grade': ''
    }

    # Calculate total (weighted average)
    scores['total_score'] = round(
        (scores['pronunciation_score'] * 0.25 +
         scores['fluency_score'] * 0.15 +
         scores['grammar_score'] * 0.25 +
         scores['vocab_score'] * 0.2 +
         scores['coherence_score'] * 0.15),
        2
    )

    # Assign grade
    total = scores['total_score']
    if total >= 90:
        scores['grade'] = 'A+'
    elif total >= 85:
        scores['grade'] = 'A'
    elif total >= 80:
        scores['grade'] = 'A-'
    elif total >= 75:
        scores['grade'] = 'B+'
    elif total >= 70:
        scores['grade'] = 'B'
    elif total >= 65:
        scores['grade'] = 'B-'
    elif total >= 60:
        scores['grade'] = 'C+'
    elif total >= 55:
        scores['grade'] = 'C'
    elif total >= 50:
        scores['grade'] = 'C-'
    else:
        scores['grade'] = 'D'

    return scores


@app.get("/api/health")
async def health():
    """Health check endpoint"""
    return {"status": "ok"}


@app.get("/api/questions")
async def get_questions():
    """Get all questions from database"""
    questions_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'database', 'questionaire.json')
    with open(questions_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    questions = data.get('speaking_test_questions', [])
    topics = list(set(q['topic'] for q in questions))
    return {"questions": questions, "topics": sorted(topics)}


@app.post("/api/evaluate")
async def evaluate_audio(
    audio: UploadFile = File(...),
    question: Optional[str] = Form(None),
    dialect: Optional[str] = Form("en-us"),
    pronunciation_score_mode: Optional[str] = Form("default")
):
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

        # Get evaluation results from SpeechAce
        results = client.score_audio(
            audio_file_path=filepath,
            user_id="web-user",
            dialect=dialect or "en-us",
            relevance_context=question or "",
            pronunciation_score_mode=pronunciation_score_mode or "default",
            detect_dialect=1,
            enforce_dialect=1,
            include_ielts_feedback=1
        )

        # Store original SpeechAce results
        speechace_original = json.loads(json.dumps(results))  # Deep copy

        # Calculate SpeechAce score
        speechace_score = calculate_speechace_score(results)
        print(f"\n📊 SpeechAce Score: {speechace_score['total_score']}/100 ({speechace_score['grade']})")

        # Save SpeechAce results to unscripted_result.json
        unscripted_filepath = os.path.join(RESULTS_FOLDER, 'unscripted_result.json')
        with open(unscripted_filepath, 'w', encoding='utf-8') as f:
            json.dump(speechace_original, f, indent=2, ensure_ascii=False)
        print(f"💾 SpeechAce results saved to: {unscripted_filepath}")

        # Enhance grammar, vocab, and coherence with OpenAI
        openai_enhanced_data = None
        openai_score = None
        try:
            print("\n" + "="*60)
            print("ATTEMPTING OPENAI ENHANCEMENT")
            print("="*60)

            openai_client = OpenAIEvaluator()

            # Extract transcript from SpeechAce results
            transcript = results.get('speech_score', {}).get('transcript', '')

            if transcript:
                print(f"\n📝 Transcript extracted: {transcript[:100]}...")
                print("🤖 Sending to OpenAI GPT-4 for enhanced analysis...")

                enhanced = openai_client.enhance_evaluation(
                    transcript=transcript,
                    question=question
                )

                # Extract OpenAI score
                openai_score = enhanced.get('openai_overall_score', {})
                print(f"\n📊 OpenAI Score: {openai_score.get('total_score', 0)}/100 ({openai_score.get('grade', 'N/A')})")

                # 1. Save basic OpenAI evaluation to openai_result.json
                openai_basic_data = {
                    'transcript': transcript,
                    'question': question,
                    'grammar': enhanced.get('grammar', {}),
                    'vocab': enhanced.get('vocab', {}),
                    'coherence': enhanced.get('coherence', {}),
                    'relevance': enhanced.get('relevance', {}),
                    'enhanced_ielts': enhanced.get('enhanced_ielts', {}),
                    'timestamp': datetime.now().isoformat()
                }
                openai_result_path = os.path.join(RESULTS_FOLDER, 'openai_result.json')
                with open(openai_result_path, 'w', encoding='utf-8') as f:
                    json.dump(openai_basic_data, f, indent=2, ensure_ascii=False)
                print(f"💾 OpenAI basic results saved to: {openai_result_path}")

                # 2. Save enhanced OpenAI evaluation to openai_enhance_result.json
                openai_enhanced_data = {
                    'transcript': transcript,
                    'question': question,
                    'evaluation': enhanced,
                    'overall_score': openai_score,
                    'improved_answer': enhanced.get('improved_answer', ''),
                    'timestamp': datetime.now().isoformat()
                }
                openai_enhanced_path = os.path.join(RESULTS_FOLDER, 'openai_enhance_result.json')
                with open(openai_enhanced_path, 'w', encoding='utf-8') as f:
                    json.dump(openai_enhanced_data, f, indent=2, ensure_ascii=False)
                print(f"💾 OpenAI enhanced results saved to: {openai_enhanced_path}")

                # Replace grammar, vocab, coherence sections with OpenAI's enhanced analysis
                if 'speech_score' in results:
                    if 'grammar' in enhanced:
                        results['speech_score']['grammar'] = enhanced['grammar']
                        print("✓ Grammar analysis replaced with OpenAI")
                    if 'vocab' in enhanced:
                        results['speech_score']['vocab'] = enhanced['vocab']
                        print("✓ Vocabulary analysis replaced with OpenAI")
                    if 'coherence' in enhanced:
                        results['speech_score']['coherence'] = enhanced['coherence']
                        print("✓ Coherence analysis replaced with OpenAI")
                    if 'relevance' in enhanced:
                        results['speech_score']['relevance'] = enhanced['relevance']
                        print("✓ Relevance analysis replaced with OpenAI")

                    # Add improved answer to results
                    if 'improved_answer' in enhanced:
                        results['speech_score']['improved_answer'] = enhanced['improved_answer']
                        print("✓ Improved answer suggestion added")

                    # Optionally update IELTS scores with OpenAI's assessment
                    if 'enhanced_ielts' in enhanced and 'ielts_score' in results['speech_score']:
                        if 'grammar' in enhanced['enhanced_ielts']:
                            results['speech_score']['ielts_score']['grammar'] = enhanced['enhanced_ielts']['grammar']
                        if 'vocab' in enhanced['enhanced_ielts']:
                            results['speech_score']['ielts_score']['vocab'] = enhanced['enhanced_ielts']['vocab']
                        if 'coherence' in enhanced['enhanced_ielts']:
                            results['speech_score']['ielts_score']['coherence'] = enhanced['enhanced_ielts']['coherence']
                        print("✓ IELTS scores updated with OpenAI assessment")

                # Calculate combined score (average of both)
                combined_score = {
                    'speechace_score': speechace_score['total_score'],
                    'openai_score': openai_score.get('total_score', 0),
                    'combined_score': round((speechace_score['total_score'] + openai_score.get('total_score', 0)) / 2, 2),
                    'grade': ''
                }
                total = combined_score['combined_score']
                if total >= 90:
                    combined_score['grade'] = 'A+'
                elif total >= 85:
                    combined_score['grade'] = 'A'
                elif total >= 80:
                    combined_score['grade'] = 'A-'
                elif total >= 75:
                    combined_score['grade'] = 'B+'
                elif total >= 70:
                    combined_score['grade'] = 'B'
                elif total >= 65:
                    combined_score['grade'] = 'B-'
                elif total >= 60:
                    combined_score['grade'] = 'C+'
                elif total >= 55:
                    combined_score['grade'] = 'C'
                elif total >= 50:
                    combined_score['grade'] = 'C-'
                else:
                    combined_score['grade'] = 'D'

                results['combined_score'] = combined_score
                print(f"\n📊 Combined Score: {combined_score['combined_score']}/100 ({combined_score['grade']})")

                print("\n✅ OpenAI ENHANCEMENT COMPLETE")
                print("="*60 + "\n")
            else:
                print("⚠️  No transcript found in SpeechAce results")

        except Exception as e:
            print("\n" + "="*60)
            print("❌ OPENAI ENHANCEMENT FAILED")
            print("="*60)
            print(f"Error type: {type(e).__name__}")
            print(f"Error message: {str(e)}")
            import traceback
            print(f"Traceback:\n{traceback.format_exc()}")
            print("="*60)
            print("⚠️  Continuing with SpeechAce results only...")
            print("="*60 + "\n")

        # Save combined results (merged SpeechAce + OpenAI)
        combined_data = {
            'speechace': speechace_original,
            'openai': openai_enhanced_data.get('evaluation') if openai_enhanced_data else None,
            'scores': {
                'speechace': speechace_score,
                'openai': openai_score if openai_score else None,
                'combined': results.get('combined_score', None)
            },
            'timestamp': datetime.now().isoformat()
        }
        combined_result_path = os.path.join(RESULTS_FOLDER, 'combined_result.json')
        with open(combined_result_path, 'w', encoding='utf-8') as f:
            json.dump(combined_data, f, indent=2, ensure_ascii=False)
        print(f"💾 Combined results saved to: {combined_result_path}")

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
            audio_base64 = f"data:{mime_type};base64,{audio_data}"

        # Clean up
        os.remove(filepath)

        # Return merged results (for backward compatibility with frontend)
        # The frontend expects speech_score at the top level
        response_data = results.copy()
        response_data['audio_data'] = audio_base64

        # Add metadata for reference
        response_data['_metadata'] = {
            'speechace_score': speechace_score,
            'openai_score': openai_score if openai_score else None,
            'combined_score': results.get('combined_score', None),
            'timestamp': datetime.now().isoformat(),
            'sources': {
                'speechace_file': 'unscripted_result.json',
                'openai_file': 'openai_result.json',
                'openai_enhanced_file': 'openai_enhance_result.json',
                'combined_file': 'combined_result.json'
            }
        }

        return response_data

    except Exception as e:
        # Clean up on error
        if os.path.exists(filepath):
            os.remove(filepath)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/evaluate-scripted")
async def evaluate_scripted(
    audio: UploadFile = File(...),
    text: str = Form(...),
    dialect: Optional[str] = Form("en-us")
):
    """Endpoint to evaluate scripted audio (reading a given text)"""

    if not audio.filename:
        raise HTTPException(status_code=400, detail="No file selected")

    if not allowed_file(audio.filename):
        raise HTTPException(status_code=400, detail="Invalid file type. Allowed: wav, mp3, m4a, webm, ogg, aiff")

    if not text.strip():
        raise HTTPException(status_code=400, detail="Text is required for scripted evaluation")

    filename = audio.filename.replace(" ", "_")
    filepath = os.path.join(UPLOAD_FOLDER, filename)

    try:
        with open(filepath, "wb") as buffer:
            content = await audio.read()
            buffer.write(content)

        client = SpeechAceAPI()

        results = client.score_text(
            audio_file_path=filepath,
            text=text.strip(),
            user_id="web-user",
            dialect=dialect or "en-us",
            include_fluency=1
        )

        # Save results to JSON file (overwrite)
        result_filepath = os.path.join(RESULTS_FOLDER, 'scripted_result.json')
        with open(result_filepath, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2, ensure_ascii=False)

        # Add audio data
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

        os.remove(filepath)

        return results

    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        raise HTTPException(status_code=500, detail=str(e))


# Serve frontend static files (for production)
FRONTEND_DIST = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'frontend', 'dist')
if os.path.exists(FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        """Serve frontend for all non-API routes"""
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API endpoint not found")

        file_path = os.path.join(FRONTEND_DIST, full_path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)

        # Serve index.html for all other routes (SPA routing)
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))


if __name__ == '__main__':
    import uvicorn
    print("Backend server starting on http://localhost:5000")
    uvicorn.run(app, host="0.0.0.0", port=5000)
