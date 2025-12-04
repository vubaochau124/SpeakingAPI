"""Speech evaluation routes"""
import os
import json
import base64
import time as time_module
from datetime import datetime
from typing import Optional
from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.orm import Session

from database import get_db
from models import User, UserResult
from auth import get_current_user
from utils.audio import allowed_file, convert_to_wav, UPLOAD_FOLDER, get_mime_type
from utils.scoring import calculate_azure_score
from azure_api import AzureSpeechAPI
from openai_evaluator import OpenAIEvaluator

router = APIRouter(prefix="/api", tags=["Evaluation"])

# Supported languages for pronunciation assessment
SUPPORTED_LANGUAGES = ['en-US', 'zh-CN', 'ja-JP', 'ko-KR']


@router.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "ok"}


@router.get("/results/{part_type}")
async def get_user_result(
    part_type: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's result for a specific part (conversation or unscripted)"""
    if part_type not in ['conversation', 'unscripted']:
        raise HTTPException(status_code=400, detail="part_type must be 'conversation' or 'unscripted'")

    result = db.query(UserResult).filter(
        UserResult.user_id == current_user.id,
        UserResult.part_type == part_type
    ).first()

    if not result:
        return {"result": None}

    return {
        "result": {
            "id": result.id,
            "part_type": result.part_type,
            "conversation_id": result.conversation_id,
            "question_id": result.question_id,
            "transcript": result.transcript,
            "azure_result": result.azure_result,
            "openai_result": result.openai_result,
            "scores": result.scores,
            "created_at": result.created_at.isoformat() if result.created_at else None,
            "updated_at": result.updated_at.isoformat() if result.updated_at else None
        }
    }


@router.post("/convert-audio")
async def convert_audio(
    audio: UploadFile = File(...),
    format: str = Form("mp3")
):
    """Convert audio file to MP3 or WAV format"""
    from pydub import AudioSegment

    if format not in ['mp3', 'wav']:
        raise HTTPException(status_code=400, detail="Format must be 'mp3' or 'wav'")

    filename = audio.filename.replace(" ", "_")
    filepath = os.path.join(UPLOAD_FOLDER, filename)

    try:
        with open(filepath, "wb") as buffer:
            content = await audio.read()
            buffer.write(content)

        ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else 'webm'
        try:
            if ext == 'webm':
                audio_segment = AudioSegment.from_file(filepath, format='webm')
            elif ext == 'mp3':
                audio_segment = AudioSegment.from_mp3(filepath)
            elif ext == 'wav':
                audio_segment = AudioSegment.from_wav(filepath)
            elif ext == 'm4a':
                audio_segment = AudioSegment.from_file(filepath, format='m4a')
            elif ext == 'ogg':
                audio_segment = AudioSegment.from_ogg(filepath)
            else:
                audio_segment = AudioSegment.from_file(filepath)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to load audio: {str(e)}")

        output_path = os.path.join(UPLOAD_FOLDER, f"converted.{format}")

        if format == 'mp3':
            audio_segment.export(output_path, format='mp3', bitrate='128k')
            mime_type = 'audio/mpeg'
        else:
            audio_segment = audio_segment.set_frame_rate(16000).set_channels(1).set_sample_width(2)
            audio_segment.export(output_path, format='wav')
            mime_type = 'audio/wav'

        with open(output_path, 'rb') as f:
            converted_data = f.read()

        os.remove(filepath)
        os.remove(output_path)

        return Response(
            content=converted_data,
            media_type=mime_type,
            headers={'Content-Disposition': f'attachment; filename="recording.{format}"'}
        )

    except HTTPException:
        raise
    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        raise HTTPException(status_code=500, detail=str(e))


def _run_azure_assessment(client, wav_path, transcript, language='en-US'):
    """Run Azure pronunciation assessment (for parallel execution)"""
    # Azure already has internal timing prints
    return client.assess_pronunciation_only(wav_path, transcript, language)

def _run_openai_evaluation(transcript, question):
    """Run OpenAI content evaluation (for parallel execution)"""
    start = time_module.time()
    print(f"[OPENAI-GPT] Starting content evaluation... (t={start:.2f})", flush=True)
    result = OpenAIEvaluator().evaluate_chunked_parallel(transcript=transcript, question=question)
    elapsed = time_module.time() - start
    print(f"[OPENAI-GPT] Completed ALL content evaluation in {elapsed:.2f}s", flush=True)
    return result


@router.post("/evaluate")
async def evaluate_audio(
    audio: UploadFile = File(...),
    question: Optional[str] = Form(None),
    question_id: Optional[int] = Form(None),
    language: Optional[str] = Form("en-US"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Evaluate audio: Whisper transcription first, then Azure + OpenAI in parallel"""
    if not audio.filename:
        raise HTTPException(status_code=400, detail="No file selected")
    if not allowed_file(audio.filename):
        raise HTTPException(status_code=400, detail="Invalid file type. Allowed: wav, mp3, m4a, webm, ogg, aiff")
    if language not in SUPPORTED_LANGUAGES:
        raise HTTPException(status_code=400, detail=f"Unsupported language. Supported: {SUPPORTED_LANGUAGES}")

    filename = audio.filename.replace(" ", "_")
    filepath = os.path.join(UPLOAD_FOLDER, filename)

    try:
        with open(filepath, "wb") as buffer:
            buffer.write(await audio.read())

        # Step 1: Prepare audio and get transcript (Whisper)
        client = AzureSpeechAPI()
        wav_path, needs_cleanup = client.prepare_audio(filepath)
        transcript = client.transcribe_only(wav_path, language)

        # Step 2: Run Azure and OpenAI in PARALLEL
        azure_result = None
        openai_eval = None

        if transcript:
            with ThreadPoolExecutor(max_workers=2) as executor:
                azure_future = executor.submit(_run_azure_assessment, client, wav_path, transcript, language)
                openai_future = executor.submit(_run_openai_evaluation, transcript, question)

                azure_result = azure_future.result()
                openai_eval = openai_future.result()

        # Cleanup temp WAV
        if needs_cleanup and os.path.exists(wav_path):
            try:
                os.remove(wav_path)
            except Exception:
                pass

        # Step 3: Combine results - use Azure bands for final score
        azure_score = calculate_azure_score(azure_result) if azure_result else {}
        pronunciation_band = azure_score.get('pronunciation_band', 5.0)
        fluency_band = azure_score.get('fluency_band', 5.0)

        openai_result = openai_eval.get('openai_result', {}) if openai_eval else {}

        # Recalculate combined result with actual Azure bands
        combined_result = None
        if openai_eval:
            openai_client = OpenAIEvaluator()
            combined_result = openai_client._calculate_combined_result(
                openai_result, pronunciation_band, fluency_band
            )
            # Generate improved answer
            try:
                improved = openai_client._generate_improved_answer(transcript, question, openai_result)
                openai_result['improved_answer'] = improved
            except Exception:
                pass

        # Read audio as base64
        with open(filepath, 'rb') as audio_file:
            audio_data = base64.b64encode(audio_file.read()).decode('utf-8')
            audio_base64 = f"data:{get_mime_type(filename)};base64,{audio_data}"

        os.remove(filepath)

        # Save to database
        db_transcript = azure_result.get('speech_score', {}).get('transcript', '') if azure_result else transcript
        scores_data = {
            'unscripted_result': azure_score,
            'openai_result': openai_result,
            'combined_result': combined_result
        }

        existing_result = db.query(UserResult).filter(
            UserResult.user_id == current_user.id,
            UserResult.part_type == 'unscripted'
        ).first()

        if existing_result:
            existing_result.question_id = question_id
            existing_result.transcript = db_transcript
            existing_result.azure_result = azure_result
            existing_result.openai_result = openai_result
            existing_result.scores = scores_data
            existing_result.updated_at = datetime.now()
        else:
            db.add(UserResult(
                user_id=current_user.id,
                part_type='unscripted',
                question_id=question_id,
                transcript=db_transcript,
                azure_result=azure_result,
                openai_result=openai_result,
                scores=scores_data
            ))
        db.commit()

        return {
            'speech_score': azure_result.get('speech_score', {}) if azure_result else {},
            'audio_data': audio_base64,
            'unscripted_result': azure_result,
            'openai_result': openai_result,
            'combined_result': combined_result
        }

    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/evaluate-azure")
async def evaluate_azure_only(
    audio: UploadFile = File(...),
    question: Optional[str] = Form(None),
    language: Optional[str] = Form("en-US"),
    current_user: User = Depends(get_current_user)
):
    """Fast endpoint - Azure pronunciation assessment only"""
    if not audio.filename:
        raise HTTPException(status_code=400, detail="No file selected")
    if not allowed_file(audio.filename):
        raise HTTPException(status_code=400, detail="Invalid file type")
    if language not in SUPPORTED_LANGUAGES:
        raise HTTPException(status_code=400, detail=f"Unsupported language. Supported: {SUPPORTED_LANGUAGES}")

    filename = audio.filename.replace(" ", "_")
    filepath = os.path.join(UPLOAD_FOLDER, filename)

    try:
        with open(filepath, "wb") as buffer:
            buffer.write(await audio.read())

        client = AzureSpeechAPI()
        wav_path, needs_cleanup = client.prepare_audio(filepath)
        transcript = client.transcribe_only(wav_path, language)
        azure_result = client.assess_pronunciation_only(wav_path, transcript, language)

        if needs_cleanup and os.path.exists(wav_path):
            try:
                os.remove(wav_path)
            except Exception:
                pass

        azure_score = calculate_azure_score(azure_result)

        with open(filepath, 'rb') as audio_file:
            audio_data = base64.b64encode(audio_file.read()).decode('utf-8')
            audio_base64 = f"data:{get_mime_type(filename)};base64,{audio_data}"

        os.remove(filepath)

        return {
            'status': 'azure_complete',
            'transcript': transcript,
            'question': question,
            'audio_data': audio_base64,
            'speech_score': azure_result.get('speech_score', {}),
            'azure_scores': {
                'pronunciation_band': azure_score.get('pronunciation_band', 5.0),
                'fluency_band': azure_score.get('fluency_band', 5.0),
                'raw_scores': azure_score.get('raw_scores', {})
            }
        }

    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/evaluate-openai")
async def evaluate_openai_only(
    transcript: str = Form(...),
    question: Optional[str] = Form(None),
    pronunciation_band: float = Form(5.0),
    fluency_band: float = Form(5.0),
    current_user: User = Depends(get_current_user)
):
    """OpenAI evaluation endpoint (parallel processing)"""
    if not transcript or not transcript.strip():
        raise HTTPException(status_code=400, detail="Transcript is required")

    try:
        openai_client = OpenAIEvaluator()
        evaluation = openai_client.enhance_evaluation(
            transcript=transcript,
            question=question,
            azure_pronunciation_band=pronunciation_band,
            azure_fluency_band=fluency_band
        )
        return {
            'status': 'openai_complete',
            'openai_result': evaluation.get('openai_result', {}),
            'combined_result': evaluation.get('combined_result', {})
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/evaluate-openai-stream")
async def evaluate_openai_streaming(
    transcript: str = Form(...),
    question: Optional[str] = Form(None),
    pronunciation_band: float = Form(5.0),
    fluency_band: float = Form(5.0),
    current_user: User = Depends(get_current_user)
):
    """Streaming OpenAI evaluation - returns results progressively via SSE"""
    if not transcript or not transcript.strip():
        raise HTTPException(status_code=400, detail="Transcript is required")

    def generate_sse():
        try:
            openai_client = OpenAIEvaluator()
            for chunk in openai_client.evaluate_chunked_streaming(
                transcript=transcript,
                question=question,
                azure_pronunciation_band=pronunciation_band,
                azure_fluency_band=fluency_band
            ):
                yield f"data: {json.dumps(chunk)}\n\n"
                if chunk.get('type') == 'complete':
                    try:
                        improved = openai_client.generate_improved_answer_async(
                            transcript, question, chunk.get('openai_result', {})
                        )
                        yield f"data: {json.dumps({'type': 'improved_answer', 'result': improved})}\n\n"
                    except Exception:
                        pass
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        generate_sse(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"}
    )


@router.post("/evaluate-scripted")
async def evaluate_scripted(
    audio: UploadFile = File(...),
    text: str = Form(...)
):
    """Evaluate scripted audio (reading a given text)"""
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
            buffer.write(await audio.read())

        results = AzureSpeechAPI().score_text(audio_file_path=filepath, text=text.strip())

        with open(filepath, 'rb') as audio_file:
            audio_data = base64.b64encode(audio_file.read()).decode('utf-8')
            results['audio_data'] = f"data:{get_mime_type(filename)};base64,{audio_data}"

        os.remove(filepath)
        return results

    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/evaluate-conversation")
async def evaluate_conversation(
    audio: UploadFile = File(...),
    texts: str = Form(...),
    conversation_id: Optional[int] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Evaluate conversation roleplay audio"""
    if not audio.filename:
        raise HTTPException(status_code=400, detail="No file selected")
    if not allowed_file(audio.filename):
        raise HTTPException(status_code=400, detail="Invalid file type. Allowed: wav, mp3, m4a, webm, ogg, aiff")

    try:
        texts_list = json.loads(texts)
        if not texts_list or not isinstance(texts_list, list):
            raise HTTPException(status_code=400, detail="Texts must be a non-empty JSON array")
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format for texts")

    filename = audio.filename.replace(" ", "_")
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    wav_filepath = None

    try:
        with open(filepath, "wb") as buffer:
            buffer.write(await audio.read())

        wav_filepath = convert_to_wav(filepath)
        results = AzureSpeechAPI().score_text(audio_file_path=wav_filepath, text=" ".join(texts_list).strip())

        with open(filepath, 'rb') as audio_file:
            audio_data = base64.b64encode(audio_file.read()).decode('utf-8')
            results['audio_data'] = f"data:{get_mime_type(filename)};base64,{audio_data}"

        results['conversation_texts'] = texts_list

        # Clean up temp files
        if os.path.exists(filepath):
            os.remove(filepath)
        if wav_filepath and wav_filepath != filepath and os.path.exists(wav_filepath):
            os.remove(wav_filepath)

        # Save to database
        transcript = results.get('speech_score', {}).get('transcript', '')
        azure_scores = results.get('speech_score', {}).get('azure_scores', {})
        scores_data = {
            'azure_accuracy': azure_scores.get('accuracy', 0),
            'azure_fluency': azure_scores.get('fluency', 0),
            'azure_prosody': azure_scores.get('prosody', 0)
        }

        existing_result = db.query(UserResult).filter(
            UserResult.user_id == current_user.id,
            UserResult.part_type == 'conversation'
        ).first()

        if existing_result:
            existing_result.conversation_id = conversation_id
            existing_result.transcript = transcript
            existing_result.azure_result = results
            existing_result.scores = scores_data
            existing_result.updated_at = datetime.now()
        else:
            db.add(UserResult(
                user_id=current_user.id,
                part_type='conversation',
                conversation_id=conversation_id,
                transcript=transcript,
                azure_result=results,
                scores=scores_data
            ))
        db.commit()

        return results

    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        if wav_filepath and wav_filepath != filepath and os.path.exists(wav_filepath):
            os.remove(wav_filepath)
        raise HTTPException(status_code=500, detail=str(e))
