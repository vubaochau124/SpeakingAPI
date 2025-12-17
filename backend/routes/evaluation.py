"""Speech evaluation routes"""
import os
import json
import base64
import time as time_module
import asyncio
from datetime import datetime
from typing import Optional, Dict, List
from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.orm import Session

from database import get_db
from models import User, UserResult
from auth import get_current_user
from utils.audio import allowed_file, convert_to_wav, get_mime_type, _get_safe_temp_path
from utils.scoring import calculate_azure_score
from utils.assessment_logger import log_assessment
from azure_api import AzureSpeechAPI
from openai_evaluator import OpenAIEvaluator

# Thread pool for background tasks (increased for better concurrency)
_background_executor = ThreadPoolExecutor(max_workers=8)

# Store for active streaming sessions
_streaming_sessions: Dict[str, dict] = {}

# Thread-local storage for API clients (safe for concurrent requests)
import threading
_thread_local = threading.local()


def get_azure_client() -> AzureSpeechAPI:
    """Get thread-local Azure client instance (one per thread for thread safety)."""
    if not hasattr(_thread_local, 'azure_client'):
        _thread_local.azure_client = AzureSpeechAPI()
    return _thread_local.azure_client


def get_openai_client() -> OpenAIEvaluator:
    """Get thread-local OpenAI client instance."""
    if not hasattr(_thread_local, 'openai_client'):
        _thread_local.openai_client = OpenAIEvaluator()
    return _thread_local.openai_client

router = APIRouter(prefix="/api", tags=["Evaluation"])

# Supported languages for pronunciation assessment
SUPPORTED_LANGUAGES = ['en-US', 'zh-CN', 'ja-JP', 'ko-KR']


async def save_upload_file_safe(upload_file: UploadFile) -> tuple:
    """Save uploaded file to a safe path (ASCII only) for Azure SDK compatibility.

    Args:
        upload_file: FastAPI UploadFile object

    Returns:
        tuple: (safe_path, original_extension) - safe_path uses UUID, needs cleanup after use
    """
    # Get original extension
    original_name = upload_file.filename or "audio.wav"
    ext = os.path.splitext(original_name)[1].lower() or '.wav'

    # Create safe path with UUID
    safe_path = _get_safe_temp_path(ext)

    # Save file content
    content = await upload_file.read()
    with open(safe_path, 'wb') as f:
        f.write(content)

    return safe_path, ext


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

    # Save to safe path (ASCII only) for compatibility
    filepath, ext = await save_upload_file_safe(audio)
    ext = ext.lstrip('.')

    try:
        try:
            if ext == 'webm':
                audio_segment = AudioSegment.from_file(filepath, format='webm')
            elif ext == 'mp3':
                audio_segment = AudioSegment.from_mp3(filepath)
            elif ext == 'wav':
                audio_segment = AudioSegment.from_wav(filepath)
            elif ext == 'm4a':
                audio_segment = AudioSegment.from_file(filepath, format='mp4')
            elif ext == 'ogg':
                audio_segment = AudioSegment.from_ogg(filepath)
            else:
                audio_segment = AudioSegment.from_file(filepath)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to load audio: {str(e)}")

        output_path = _get_safe_temp_path(f".{format}")

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


def _write_file(filepath: str, content: bytes):
    """Write content to file (for use with asyncio.to_thread)."""
    with open(filepath, "wb") as f:
        f.write(content)


def _run_azure_assessment(wav_path, transcript, language='en-US', whisper_result=None):
    """Run Azure pronunciation assessment (for parallel execution)

    Uses chunked processing for long audio (>45s) to speed up assessment.
    Creates its own client to ensure thread safety.
    """
    # Create client in worker thread for thread safety
    client = AzureSpeechAPI()
    return client.assess_pronunciation_chunked(wav_path, transcript, language, whisper_result=whisper_result)

def _run_openai_evaluation(transcript, question, language='en-US'):
    """Run OpenAI content evaluation (for parallel execution)"""
    start = time_module.time()
    print(f"[OPENAI-GPT] Starting content evaluation for language={language}... (t={start:.2f})", flush=True)
    result = OpenAIEvaluator().evaluate_chunked_parallel(transcript=transcript, question=question, language=language)
    elapsed = time_module.time() - start
    print(f"[OPENAI-GPT] Completed ALL content evaluation in {elapsed:.2f}s", flush=True)
    return result


@router.post("/evaluate")
async def evaluate_audio(
    audio: UploadFile = File(...),
    question: Optional[str] = Form(None),
    question_id: Optional[int] = Form(None),
    language: Optional[str] = Form("en-US"),
    chunk_transcripts: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Evaluate audio: Whisper transcription first, then Azure + OpenAI in parallel

    If chunk_transcripts is provided (JSON array from real-time recording),
    skip Whisper API call and use the pre-transcribed chunks instead.
    """
    if not audio.filename:
        raise HTTPException(status_code=400, detail="No file selected")
    if not allowed_file(audio.filename):
        raise HTTPException(status_code=400, detail="Invalid file type. Allowed: wav, mp3, m4a, webm, ogg, aiff")
    if language not in SUPPORTED_LANGUAGES:
        raise HTTPException(status_code=400, detail=f"Unsupported language. Supported: {SUPPORTED_LANGUAGES}")

    # Save to safe path (ASCII only) for Azure SDK compatibility
    filepath, _ = await save_upload_file_safe(audio)
    filename = os.path.basename(filepath)

    try:
        # Step 1: Prepare audio and get transcript
        client = get_azure_client()
        wav_path, needs_cleanup = await asyncio.to_thread(client.prepare_audio, filepath)

        # Check if we have pre-transcribed chunks from real-time recording
        whisper_result = None
        transcript = ''

        if chunk_transcripts:
            try:
                chunks_data = json.loads(chunk_transcripts)
                if chunks_data and isinstance(chunks_data, list):
                    # Merge chunk transcripts into full transcript
                    transcript = ' '.join(c.get('transcript', '') for c in chunks_data if c.get('transcript'))
                    # Build whisper_result format for Azure chunked assessment
                    words = []
                    for chunk in chunks_data:
                        chunk_text = chunk.get('transcript', '')
                        start_time = chunk.get('startTime', 0)
                        end_time = chunk.get('endTime', 0)
                        # Approximate word timestamps within chunk
                        chunk_words = chunk_text.split()
                        if chunk_words and end_time > start_time:
                            word_duration = (end_time - start_time) / len(chunk_words)
                            for i, word in enumerate(chunk_words):
                                words.append({
                                    'word': word,
                                    'start': start_time + i * word_duration,
                                    'end': start_time + (i + 1) * word_duration
                                })
                    whisper_result = {'text': transcript, 'words': words}
                    print(f"[EVALUATE] Using {len(chunks_data)} pre-transcribed chunks (saved Whisper API call)", flush=True)
            except json.JSONDecodeError:
                print(f"[EVALUATE] Invalid chunk_transcripts JSON, falling back to Whisper", flush=True)

        # Fall back to Whisper if no valid pre-transcribed chunks
        if not transcript:
            whisper_result = await asyncio.to_thread(client.transcribe_only, wav_path, language, True)
            transcript = whisper_result.get('text', '')

        # Step 2: Run Azure and OpenAI in PARALLEL (non-blocking)
        azure_result = None
        openai_eval = None

        if transcript:
            # Use asyncio.to_thread to run blocking calls without blocking the event loop
            azure_result, openai_eval = await asyncio.gather(
                asyncio.to_thread(_run_azure_assessment, wav_path, transcript, language, whisper_result),
                asyncio.to_thread(_run_openai_evaluation, transcript, question, language)
            )

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
            openai_client = get_openai_client()
            combined_result = openai_client._calculate_combined_result(
                openai_result, pronunciation_band, fluency_band
            )
            # Generate improved answer
            try:
                improved = openai_client._generate_improved_answer(transcript, question, openai_result, language)
                openai_result['improved_answer'] = improved
            except Exception:
                pass

        # Read audio as base64
        with open(filepath, 'rb') as audio_file:
            audio_data = base64.b64encode(audio_file.read()).decode('utf-8')
            audio_base64 = f"data:{get_mime_type(filename)};base64,{audio_data}"

        os.remove(filepath)

        # Save to database - use Whisper transcript (has filler words, proper punctuation/casing)
        db_transcript = transcript
        scores_data = {
            'unscripted_result': azure_score,
            'openai_result': openai_result,
            'combined_result': combined_result
        }

        # Always INSERT new record to preserve history for progress tracking
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

        # Log assessment to file
        log_assessment(
            user_id=current_user.id,
            username=current_user.username,
            assessment_type='unscripted',
            question=question,
            transcript=db_transcript,
            azure_result=azure_result,
            openai_result=openai_result,
            combined_result=combined_result,
            scores=scores_data
        )

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

    # Save to safe path (ASCII only) for Azure SDK compatibility
    filepath, _ = await save_upload_file_safe(audio)
    filename = os.path.basename(filepath)

    try:
        # Run all blocking operations in thread pool
        client = AzureSpeechAPI()  # Create new client for thread safety
        wav_path, needs_cleanup = await asyncio.to_thread(client.prepare_audio, filepath)
        transcript = await asyncio.to_thread(client.transcribe_only, wav_path, language)
        azure_result = await asyncio.to_thread(client.assess_pronunciation_only, wav_path, transcript, language)

        if needs_cleanup and os.path.exists(wav_path):
            try:
                os.remove(wav_path)
            except Exception:
                pass

        azure_score = calculate_azure_score(azure_result)

        # Non-blocking file read
        def _read_audio_base64(fp, fname):
            with open(fp, 'rb') as f:
                data = base64.b64encode(f.read()).decode('utf-8')
            return f"data:{get_mime_type(fname)};base64,{data}"

        audio_base64 = await asyncio.to_thread(_read_audio_base64, filepath, filename)
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
    language: Optional[str] = Form("en-US"),
    current_user: User = Depends(get_current_user)
):
    """OpenAI evaluation endpoint (parallel processing)"""
    if not transcript or not transcript.strip():
        raise HTTPException(status_code=400, detail="Transcript is required")
    if language not in SUPPORTED_LANGUAGES:
        raise HTTPException(status_code=400, detail=f"Unsupported language. Supported: {SUPPORTED_LANGUAGES}")

    try:
        openai_client = get_openai_client()
        evaluation = openai_client.enhance_evaluation(
            transcript=transcript,
            question=question,
            azure_pronunciation_band=pronunciation_band,
            azure_fluency_band=fluency_band,
            language=language
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
    language: Optional[str] = Form("en-US"),
    current_user: User = Depends(get_current_user)
):
    """Streaming OpenAI evaluation - returns results progressively via SSE"""
    if not transcript or not transcript.strip():
        raise HTTPException(status_code=400, detail="Transcript is required")
    if language not in SUPPORTED_LANGUAGES:
        raise HTTPException(status_code=400, detail=f"Unsupported language. Supported: {SUPPORTED_LANGUAGES}")

    def generate_sse():
        try:
            openai_client = get_openai_client()
            for chunk in openai_client.evaluate_chunked_streaming(
                transcript=transcript,
                question=question,
                azure_pronunciation_band=pronunciation_band,
                azure_fluency_band=fluency_band,
                language=language
            ):
                yield f"data: {json.dumps(chunk)}\n\n"
                if chunk.get('type') == 'complete':
                    try:
                        improved = openai_client.generate_improved_answer_async(
                            transcript, question, chunk.get('openai_result', {}), language
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


def _save_result_to_db(user_id, username, question_id, question, transcript, azure_result, openai_result, scores_data):
    """Background task: Save result to database and log to file (runs in separate thread)"""
    try:
        from database import SessionLocal
        db = SessionLocal()
        try:
            # Always INSERT new record to preserve history for progress tracking
            db.add(UserResult(
                user_id=user_id,
                part_type='unscripted',
                question_id=question_id,
                transcript=transcript,
                azure_result=azure_result,
                openai_result=openai_result,
                scores=scores_data
            ))
            db.commit()
            print(f"[DB] Result saved for user {user_id}", flush=True)

            # Log assessment to file
            log_assessment(
                user_id=user_id,
                username=username,
                assessment_type='unscripted',
                question=question,
                transcript=transcript,
                azure_result=azure_result,
                openai_result=openai_result,
                combined_result=scores_data.get('combined_result'),
                scores=scores_data
            )
        finally:
            db.close()
    except Exception as e:
        print(f"[DB] Error saving result: {e}", flush=True)


@router.post("/evaluate-stream")
async def evaluate_stream(
    audio: UploadFile = File(...),
    question: Optional[str] = Form(None),
    question_id: Optional[int] = Form(None),
    language: Optional[str] = Form("en-US"),
    chunk_transcripts: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user)
):
    """
    Optimized streaming endpoint - returns results progressively via SSE.

    If chunk_transcripts is provided (JSON array from real-time recording),
    skip Whisper API call and use the pre-transcribed chunks instead.

    Flow:
    1. Stream: audio_received
    2. Stream: transcription_complete (with transcript)
    3. Stream: azure_complete (pronunciation/fluency scores) - parallel with OpenAI
    4. Stream: criterion updates (coherence, lexical, grammar, topic) - as each completes
    5. Stream: complete (final combined result)
    6. Stream: improved_answer (background, after main response)
    7. Background: Save to database (non-blocking)
    """
    if not audio.filename:
        raise HTTPException(status_code=400, detail="No file selected")
    if not allowed_file(audio.filename):
        raise HTTPException(status_code=400, detail="Invalid file type. Allowed: wav, mp3, m4a, webm, ogg, aiff")
    if language not in SUPPORTED_LANGUAGES:
        raise HTTPException(status_code=400, detail=f"Unsupported language. Supported: {SUPPORTED_LANGUAGES}")

    # Save to safe path (ASCII only) for Azure SDK compatibility
    filepath, _ = await save_upload_file_safe(audio)
    filename = os.path.basename(filepath)

    async def generate_sse_async():
        start_time = time_module.time()
        wav_path = None
        needs_cleanup = False
        azure_result = None
        openai_result = {}
        combined_result = None
        transcript = ""
        audio_base64 = ""

        try:

            # Encode audio to base64 immediately (user can preview while processing)
            with open(filepath, 'rb') as audio_file:
                audio_data = base64.b64encode(audio_file.read()).decode('utf-8')
                audio_base64 = f"data:{get_mime_type(filename)};base64,{audio_data}"

            yield f"data: {json.dumps({'type': 'audio_received', 'audio_data': audio_base64, 'elapsed': round(time_module.time() - start_time, 2)})}\n\n"

            # Step 2: Prepare audio and get transcript
            client = get_azure_client()
            wav_path, needs_cleanup = await asyncio.to_thread(client.prepare_audio, filepath)

            # Check if we have pre-transcribed chunks from real-time recording
            whisper_result = None

            if chunk_transcripts:
                try:
                    chunks_data = json.loads(chunk_transcripts)
                    if chunks_data and isinstance(chunks_data, list):
                        # Merge chunk transcripts into full transcript
                        transcript = ' '.join(c.get('transcript', '') for c in chunks_data if c.get('transcript'))
                        # Build whisper_result format for Azure chunked assessment
                        words = []
                        for chunk in chunks_data:
                            chunk_text = chunk.get('transcript', '')
                            start_time_chunk = chunk.get('startTime', 0)
                            end_time_chunk = chunk.get('endTime', 0)
                            # Approximate word timestamps within chunk
                            chunk_words = chunk_text.split()
                            if chunk_words and end_time_chunk > start_time_chunk:
                                word_duration = (end_time_chunk - start_time_chunk) / len(chunk_words)
                                for i, word in enumerate(chunk_words):
                                    words.append({
                                        'word': word,
                                        'start': start_time_chunk + i * word_duration,
                                        'end': start_time_chunk + (i + 1) * word_duration
                                    })
                        whisper_result = {'text': transcript, 'words': words}
                        print(f"[STREAM] Using {len(chunks_data)} pre-transcribed chunks (saved Whisper API call)", flush=True)
                except json.JSONDecodeError:
                    print(f"[STREAM] Invalid chunk_transcripts JSON, falling back to Whisper", flush=True)

            # Fall back to Whisper if no valid pre-transcribed chunks
            if not transcript:
                whisper_result = await asyncio.to_thread(client.transcribe_only, wav_path, language, True)
                transcript = whisper_result.get('text', '')

            yield f"data: {json.dumps({'type': 'transcription_complete', 'transcript': transcript, 'elapsed': round(time_module.time() - start_time, 2)})}\n\n"

            if not transcript:
                yield f"data: {json.dumps({'type': 'error', 'message': 'No speech detected'})}\n\n"
                return

            # Step 3: Run Azure and OpenAI in PARALLEL with streaming (non-blocking)
            openai_client = get_openai_client()
            pronunciation_band = 5.0
            fluency_band = 5.0

            # Create all tasks upfront (don't pass client - each thread creates its own)
            azure_task = asyncio.create_task(
                asyncio.to_thread(_run_azure_assessment, wav_path, transcript, language, whisper_result)
            )

            criteria = ['coherence', 'lexical_resource', 'grammar', 'understanding']
            criterion_tasks = {
                asyncio.create_task(
                    asyncio.to_thread(openai_client._evaluate_single_criterion, criterion, transcript, question, language)
                ): criterion
                for criterion in criteria
            }

            # Stream results as they complete (non-blocking)
            all_tasks = list(criterion_tasks.keys()) + [azure_task]

            for coro in asyncio.as_completed(all_tasks):
                completed_task = await coro

                # Find which task completed
                if azure_task.done() and completed_task == azure_task.result():
                    azure_result = completed_task
                    azure_score = calculate_azure_score(azure_result) if azure_result else {}
                    pronunciation_band = azure_score.get('pronunciation_band', 5.0)
                    fluency_band = azure_score.get('fluency_band', 5.0)

                    yield f"data: {json.dumps({'type': 'azure_complete', 'azure_result': azure_result, 'azure_scores': {'pronunciation_band': pronunciation_band, 'fluency_band': fluency_band, 'raw_scores': azure_score.get('raw_scores', {})}, 'elapsed': round(time_module.time() - start_time, 2)})}\n\n"
                else:
                    # Find which criterion completed
                    for task, criterion in criterion_tasks.items():
                        if task.done() and not hasattr(task, '_yielded'):
                            try:
                                _, result = task.result()
                                openai_result[criterion] = result
                                task._yielded = True
                                yield f"data: {json.dumps({'type': 'criterion', 'criterion': criterion, 'result': result, 'elapsed': round(time_module.time() - start_time, 2)})}\n\n"
                            except Exception:
                                pass

            # Ensure azure result is captured if not yet
            if azure_result is None and azure_task.done():
                azure_result = azure_task.result()
                azure_score = calculate_azure_score(azure_result) if azure_result else {}
                pronunciation_band = azure_score.get('pronunciation_band', 5.0)
                fluency_band = azure_score.get('fluency_band', 5.0)
                yield f"data: {json.dumps({'type': 'azure_complete', 'azure_result': azure_result, 'azure_scores': {'pronunciation_band': pronunciation_band, 'fluency_band': fluency_band, 'raw_scores': azure_score.get('raw_scores', {})}, 'elapsed': round(time_module.time() - start_time, 2)})}\n\n"

            # Step 4: Calculate combined result
            combined_result = openai_client._calculate_combined_result(
                openai_result, pronunciation_band, fluency_band
            )

            yield f"data: {json.dumps({'type': 'complete', 'openai_result': openai_result, 'combined_result': combined_result, 'elapsed': round(time_module.time() - start_time, 2)})}\n\n"

            # Step 5: Generate improved answer in background (non-blocking for main response)
            try:
                improved = await asyncio.to_thread(openai_client._generate_improved_answer, transcript, question, openai_result, language)
                if improved:
                    openai_result['improved_answer'] = improved
                    yield f"data: {json.dumps({'type': 'improved_answer', 'result': improved, 'elapsed': round(time_module.time() - start_time, 2)})}\n\n"
            except Exception as e:
                print(f"[Stream] Improved answer error: {e}", flush=True)

            # Step 6: Save to database in background thread (non-blocking)
            # Use Whisper transcript (has filler words, proper punctuation/casing) instead of Azure's
            db_transcript = transcript
            scores_data = {
                'unscripted_result': calculate_azure_score(azure_result) if azure_result else {},
                'openai_result': openai_result,
                'combined_result': combined_result
            }

            _background_executor.submit(
                _save_result_to_db,
                current_user.id,
                current_user.username,
                question_id,
                question,
                db_transcript,
                azure_result,
                openai_result,
                scores_data
            )

            yield f"data: {json.dumps({'type': 'done', 'elapsed': round(time_module.time() - start_time, 2)})}\n\n"

        except Exception as e:
            print(f"[Stream] Error: {e}", flush=True)
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        finally:
            # Cleanup
            if os.path.exists(filepath):
                try:
                    os.remove(filepath)
                except Exception:
                    pass
            if needs_cleanup and wav_path and os.path.exists(wav_path):
                try:
                    os.remove(wav_path)
                except Exception:
                    pass

    return StreamingResponse(
        generate_sse_async(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*"
        }
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

    # Save to safe path (ASCII only) for Azure SDK compatibility
    filepath, _ = await save_upload_file_safe(audio)
    filename = os.path.basename(filepath)

    try:
        results = get_azure_client().score_text(audio_file_path=filepath, text=text.strip())

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

    # Save to safe path (ASCII only) for Azure SDK compatibility
    filepath, _ = await save_upload_file_safe(audio)
    filename = os.path.basename(filepath)
    wav_filepath = None

    try:
        wav_filepath, _ = convert_to_wav(filepath)
        results = get_azure_client().score_text(audio_file_path=wav_filepath, text=" ".join(texts_list).strip())

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

        # Always INSERT new record to preserve history for progress tracking
        db.add(UserResult(
            user_id=current_user.id,
            part_type='conversation',
            conversation_id=conversation_id,
            transcript=transcript,
            azure_result=results,
            scores=scores_data
        ))
        db.commit()

        # Log assessment to file
        log_assessment(
            user_id=current_user.id,
            username=current_user.username,
            assessment_type='conversation',
            question=" ".join(texts_list),
            transcript=transcript,
            azure_result=results,
            openai_result=None,
            combined_result=None,
            scores=scores_data
        )

        return results

    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        if wav_filepath and wav_filepath != filepath and os.path.exists(wav_filepath):
            os.remove(wav_filepath)
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# REAL-TIME STREAMING EVALUATION (WebSocket)
# =============================================================================

class RealtimeSession:
    """Manages a real-time recording session with chunk processing."""

    def __init__(self, session_id: str, language: str = 'en-US', question: str = ''):
        self.session_id = session_id
        self.language = language
        self.question = question
        self.chunks: List[dict] = []  # List of {audio_data, start_ms, end_ms, result}
        self.total_duration_ms = 0
        self.azure_client = get_azure_client()
        self.start_time = time_module.time()
        self.is_processing = False
        self.pending_chunks: List[bytes] = []

    def add_chunk(self, audio_data: bytes, start_ms: int, end_ms: int):
        """Add a new audio chunk to the session."""
        self.chunks.append({
            'audio_data': audio_data,
            'start_ms': start_ms,
            'end_ms': end_ms,
            'result': None,
            'processed': False
        })
        self.total_duration_ms = max(self.total_duration_ms, end_ms)

    async def process_chunk(self, chunk_index: int) -> dict:
        """Process a single chunk and return Azure result."""
        from utils.audio import _get_safe_temp_path

        chunk = self.chunks[chunk_index]
        if chunk['processed']:
            return chunk['result']

        # Save chunk to temp file - use safe path for Azure SDK compatibility
        temp_path = _get_safe_temp_path('.webm')
        try:
            with open(temp_path, 'wb') as f:
                f.write(chunk['audio_data'])

            # Convert to WAV
            wav_path, needs_cleanup = self.azure_client._convert_to_wav(temp_path)

            # Transcribe chunk
            transcript = self.azure_client.transcribe_only(wav_path, self.language)

            if transcript:
                # Run pronunciation assessment
                result = self.azure_client.assess_pronunciation_only(wav_path, transcript, self.language)
                chunk['result'] = result
                chunk['transcript'] = transcript
            else:
                chunk['result'] = None
                chunk['transcript'] = ''

            chunk['processed'] = True

            # Cleanup
            if needs_cleanup and os.path.exists(wav_path):
                os.remove(wav_path)

            return chunk['result']

        except Exception as e:
            print(f"[RT-CHUNK {chunk_index}] Error: {e}")
            chunk['result'] = None
            chunk['processed'] = True
            return None
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

    def merge_results(self) -> dict:
        """Merge all chunk results into final result."""
        all_words = []
        all_transcripts = []
        weighted_scores = {'accuracy': 0, 'fluency': 0, 'prosody': 0, 'pronunciation': 0}
        total_word_count = 0

        for chunk in self.chunks:
            if not chunk.get('result'):
                continue

            result = chunk['result']
            speech_score = result.get('speech_score', {})
            words = speech_score.get('word_score_list', [])
            word_count = len(words)

            if word_count == 0:
                continue

            # Adjust word timings with chunk offset
            for word in words:
                if 'extent' in word:
                    word['extent'][0] += chunk['start_ms']
                    word['extent'][1] += chunk['start_ms']

            all_words.extend(words)
            all_transcripts.append(chunk.get('transcript', ''))

            # Weight scores by word count
            scores = speech_score.get('scores', {})
            for key in weighted_scores:
                if scores.get(key) is not None:
                    weighted_scores[key] += scores[key] * word_count

            total_word_count += word_count

        # Calculate weighted averages
        final_scores = {}
        for key in weighted_scores:
            if total_word_count > 0:
                final_scores[key] = round(weighted_scores[key] / total_word_count, 1)
            else:
                final_scores[key] = 0

        return {
            'status': 'success',
            'speech_score': {
                'transcript': ' '.join(all_transcripts),
                'word_score_list': all_words,
                'scores': final_scores
            },
            '_realtime': True,
            '_chunk_count': len(self.chunks),
            '_total_duration_ms': self.total_duration_ms
        }


@router.post("/transcribe-chunk")
async def transcribe_audio_chunk(
    audio: UploadFile = File(...),
    language: Optional[str] = Form("en-US"),
    chunk_index: Optional[int] = Form(0),
    start_time: Optional[float] = Form(0),
    end_time: Optional[float] = Form(0),
    current_user: User = Depends(get_current_user)
):
    """
    Transcribe a single audio chunk using Whisper API.
    This endpoint is called every 5 seconds during recording for real-time transcription.
    """
    if not audio.filename:
        raise HTTPException(status_code=400, detail="No file selected")
    if not allowed_file(audio.filename):
        raise HTTPException(status_code=400, detail="Invalid file type")
    if language not in SUPPORTED_LANGUAGES:
        raise HTTPException(status_code=400, detail=f"Unsupported language. Supported: {SUPPORTED_LANGUAGES}")

    # Save to safe path (ASCII only) for compatibility
    filepath, _ = await save_upload_file_safe(audio)

    try:
        start = time_module.time()
        print(f"[CHUNK-{chunk_index}] Received chunk {start_time:.1f}s-{end_time:.1f}s", flush=True)

        # Prepare audio and transcribe
        client = get_azure_client()
        wav_path, needs_cleanup = await asyncio.to_thread(client.prepare_audio, filepath)
        transcript = await asyncio.to_thread(client.transcribe_only, wav_path, language)

        # Cleanup
        if needs_cleanup and os.path.exists(wav_path):
            try:
                os.remove(wav_path)
            except Exception:
                pass

        if os.path.exists(filepath):
            os.remove(filepath)

        elapsed = time_module.time() - start
        print(f"[CHUNK-{chunk_index}] Transcribed in {elapsed:.2f}s: '{transcript[:100]}'", flush=True)

        return {
            'status': 'success',
            'chunk_index': chunk_index,
            'transcript': transcript,
            'start_time': start_time,
            'end_time': end_time,
            'processing_time': round(elapsed, 2)
        }

    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        print(f"[CHUNK-{chunk_index}] Error: {e}", flush=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.websocket("/ws/evaluate-realtime")
async def websocket_realtime_evaluate(websocket: WebSocket):
    """
    WebSocket endpoint for real-time audio evaluation during recording.

    Protocol:
    1. Client connects and sends: {"type": "init", "language": "en-US", "question": "..."}
    2. Client sends chunks: {"type": "chunk", "audio": "<base64>", "start_ms": 0, "end_ms": 5000}
    3. Server responds with chunk result: {"type": "chunk_result", "index": 0, "result": {...}}
    4. Client sends: {"type": "finish"}
    5. Server responds with final merged result: {"type": "final", "result": {...}}
    """
    await websocket.accept()
    session: Optional[RealtimeSession] = None

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get('type')

            if msg_type == 'init':
                # Initialize session
                session_id = f"rt_{time_module.time()}_{id(websocket)}"
                language = data.get('language', 'en-US')
                question = data.get('question', '')

                if language not in SUPPORTED_LANGUAGES:
                    await websocket.send_json({
                        'type': 'error',
                        'message': f'Unsupported language. Supported: {SUPPORTED_LANGUAGES}'
                    })
                    continue

                session = RealtimeSession(session_id, language, question)
                _streaming_sessions[session_id] = session

                await websocket.send_json({
                    'type': 'init_ok',
                    'session_id': session_id
                })
                print(f"[RT-WS] Session initialized: {session_id}, lang={language}")

            elif msg_type == 'chunk':
                if not session:
                    await websocket.send_json({
                        'type': 'error',
                        'message': 'Session not initialized. Send init first.'
                    })
                    continue

                # Decode audio chunk
                audio_b64 = data.get('audio', '')
                start_ms = data.get('start_ms', 0)
                end_ms = data.get('end_ms', 0)

                try:
                    audio_data = base64.b64decode(audio_b64)
                except Exception:
                    await websocket.send_json({
                        'type': 'error',
                        'message': 'Invalid base64 audio data'
                    })
                    continue

                chunk_index = len(session.chunks)
                session.add_chunk(audio_data, start_ms, end_ms)

                print(f"[RT-WS] Chunk {chunk_index} received: {start_ms}ms - {end_ms}ms ({len(audio_data)} bytes)")

                # Process chunk in background and send result
                await websocket.send_json({
                    'type': 'chunk_received',
                    'index': chunk_index,
                    'processing': True
                })

                # Process the chunk
                result = await session.process_chunk(chunk_index)

                if result:
                    speech_score = result.get('speech_score', {})
                    scores = speech_score.get('scores', {})
                    transcript = speech_score.get('transcript', '')

                    await websocket.send_json({
                        'type': 'chunk_result',
                        'index': chunk_index,
                        'transcript': transcript,
                        'scores': scores,
                        'word_count': len(speech_score.get('word_score_list', []))
                    })
                    print(f"[RT-WS] Chunk {chunk_index} processed: {transcript[:50]}...")
                else:
                    await websocket.send_json({
                        'type': 'chunk_result',
                        'index': chunk_index,
                        'transcript': '',
                        'scores': {},
                        'word_count': 0
                    })

            elif msg_type == 'finish':
                if not session:
                    await websocket.send_json({
                        'type': 'error',
                        'message': 'No active session'
                    })
                    continue

                print(f"[RT-WS] Finishing session with {len(session.chunks)} chunks")

                # Merge all chunk results
                merged_result = session.merge_results()

                # Calculate IELTS-style scores
                azure_score = calculate_azure_score(merged_result) if merged_result else {}

                # Run OpenAI evaluation if we have a transcript
                transcript = merged_result.get('speech_score', {}).get('transcript', '')
                openai_result = {}
                combined_result = {}

                if transcript:
                    try:
                        openai_client = get_openai_client()
                        openai_result = openai_client.evaluate_chunked_parallel(
                            transcript=transcript,
                            question=session.question,
                            language=session.language
                        )
                        combined_result = openai_client._calculate_combined_result(
                            openai_result,
                            azure_score.get('pronunciation_band', 5.0),
                            azure_score.get('fluency_band', 5.0)
                        )
                    except Exception as e:
                        print(f"[RT-WS] OpenAI evaluation error: {e}")

                await websocket.send_json({
                    'type': 'final',
                    'azure_result': merged_result,
                    'azure_scores': azure_score,
                    'openai_result': openai_result,
                    'combined_result': combined_result,
                    'elapsed': round(time_module.time() - session.start_time, 2)
                })

                # Cleanup session
                if session.session_id in _streaming_sessions:
                    del _streaming_sessions[session.session_id]

                print(f"[RT-WS] Session complete, total time: {time_module.time() - session.start_time:.2f}s")
                break

            elif msg_type == 'cancel':
                # Cancel session
                if session and session.session_id in _streaming_sessions:
                    del _streaming_sessions[session.session_id]
                await websocket.send_json({'type': 'cancelled'})
                break

    except WebSocketDisconnect:
        print("[RT-WS] Client disconnected")
        if session and session.session_id in _streaming_sessions:
            del _streaming_sessions[session.session_id]
    except Exception as e:
        print(f"[RT-WS] Error: {e}")
        try:
            await websocket.send_json({'type': 'error', 'message': str(e)})
        except Exception:
            pass
        if session and session.session_id in _streaming_sessions:
            del _streaming_sessions[session.session_id]
