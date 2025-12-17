"""AI Conversation Routes - Interactive conversation with AI"""
import os
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from database import get_db
from models import (
    User, AIConversationTopic, AIConversationSession, AIConversationTurn
)
from auth import get_current_user
from ai_conversation_service import get_ai_conversation_service, TTS_AUDIO_FOLDER
from schemas import (
    AIConversationStartRequest,
    AIConversationStartResponse,
    AIConversationTurnResponse,
    AIConversationEndResponse,
    AITopicResponse,
    AISessionHistoryItem,
    AITopicCreateRequest,
    AITopicUpdateRequest,
    AITopicAdminResponse,
)

router = APIRouter(prefix="/api/ai-conversation", tags=["AI Conversation"])


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/topics", response_model=list[AITopicResponse])
async def get_topics(
    language: str = 'en-US',
    db: Session = Depends(get_db)
):
    """Get available conversation topics"""
    topics = db.query(AIConversationTopic).filter(
        AIConversationTopic.is_active == True,
        AIConversationTopic.language == language
    ).all()

    return [
        AITopicResponse(
            id=t.id,
            name=t.name,
            name_vi=t.name_vi,
            description=t.description,
            language=t.language
        )
        for t in topics
    ]


@router.post("/start", response_model=AIConversationStartResponse)
async def start_session(
    request: AIConversationStartRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Start a new AI conversation session"""
    service = get_ai_conversation_service()

    # Determine topic and system prompt
    topic_name = None
    system_prompt = None
    opening_message = None

    if request.topic_id:
        # Use predefined topic
        topic = db.query(AIConversationTopic).filter(
            AIConversationTopic.id == request.topic_id
        ).first()
        if not topic:
            raise HTTPException(status_code=404, detail="Topic not found")

        topic_name = topic.name
        system_prompt = topic.system_prompt
        opening_message = topic.opening_message

    elif request.custom_topic:
        # Custom topic
        topic_name = request.custom_topic
        system_prompt = service.DEFAULT_SYSTEM_PROMPT
        opening_message = service.generate_opening_message(
            topic_name, system_prompt, request.language
        )
    else:
        raise HTTPException(status_code=400, detail="Either topic_id or custom_topic is required")

    # Create session
    session = AIConversationSession(
        user_id=current_user.id,
        topic_id=request.topic_id,
        custom_topic=request.custom_topic if request.custom_topic else None,
        language=request.language,
        status='active'
    )
    db.add(session)
    db.flush()  # Get session ID

    # Create first turn (AI greeting)
    ai_audio_url = service.generate_tts_audio(
        opening_message, request.language, session.id, 0
    )

    first_turn = AIConversationTurn(
        session_id=session.id,
        turn_order=0,
        ai_text=opening_message,
        ai_audio_url=ai_audio_url
    )
    db.add(first_turn)
    db.commit()

    return AIConversationStartResponse(
        session_id=session.id,
        ai_message=opening_message,
        ai_audio_url=ai_audio_url,
        topic=topic_name
    )


@router.post("/{session_id}/turn", response_model=AIConversationTurnResponse)
async def submit_turn(
    session_id: int,
    audio: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Submit user audio and get AI response"""
    service = get_ai_conversation_service()

    # Get session
    session = db.query(AIConversationSession).filter(
        AIConversationSession.id == session_id,
        AIConversationSession.user_id == current_user.id
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status != 'active':
        raise HTTPException(status_code=400, detail="Session is not active")

    # Get topic info
    topic_name = session.custom_topic
    system_prompt = service.DEFAULT_SYSTEM_PROMPT

    if session.topic_id:
        topic = db.query(AIConversationTopic).get(session.topic_id)
        if topic:
            topic_name = topic.name
            system_prompt = topic.system_prompt

    # Get current turn order
    last_turn = db.query(AIConversationTurn).filter(
        AIConversationTurn.session_id == session_id
    ).order_by(AIConversationTurn.turn_order.desc()).first()

    turn_order = (last_turn.turn_order + 1) if last_turn else 1

    # Save user audio
    audio_filename = service.save_user_audio(audio, session_id, turn_order)
    audio_path = os.path.join(service.azure_client.speech_config.region if hasattr(service, 'audio_folder') else '',
                              audio_filename)

    # Get full path for processing
    from utils.audio import UPLOAD_FOLDER
    full_audio_path = os.path.join(UPLOAD_FOLDER, audio_filename)

    # Transcribe user audio
    transcription_result = service.transcribe_user_audio(full_audio_path, session.language)
    user_transcript = transcription_result['transcript']

    if not user_transcript:
        raise HTTPException(status_code=400, detail="Could not transcribe audio. Please try again.")

    # Assess pronunciation (async, don't block response)
    azure_result = service.assess_pronunciation(full_audio_path, user_transcript, session.language)

    # Get conversation history
    turns = db.query(AIConversationTurn).filter(
        AIConversationTurn.session_id == session_id
    ).order_by(AIConversationTurn.turn_order).all()

    conversation_history = service._get_conversation_history(turns)

    # Generate AI response
    ai_text = service.generate_ai_response(
        user_transcript, conversation_history, system_prompt, topic_name
    )

    # Generate TTS for AI response
    ai_audio_url = service.generate_tts_audio(
        ai_text, session.language, session_id, turn_order + 1
    )

    # Save user turn
    user_turn = AIConversationTurn(
        session_id=session_id,
        turn_order=turn_order,
        user_transcript=user_transcript,
        user_audio_filename=audio_filename,
        azure_result=azure_result
    )
    db.add(user_turn)

    # Save AI turn
    ai_turn = AIConversationTurn(
        session_id=session_id,
        turn_order=turn_order + 1,
        ai_text=ai_text,
        ai_audio_url=ai_audio_url
    )
    db.add(ai_turn)

    db.commit()

    return AIConversationTurnResponse(
        user_transcript=user_transcript,
        ai_text=ai_text,
        ai_audio_url=ai_audio_url,
        turn_number=(turn_order + 1) // 2  # User turn number
    )


@router.post("/{session_id}/end", response_model=AIConversationEndResponse)
async def end_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """End conversation and get final evaluation"""
    service = get_ai_conversation_service()

    # Get session
    session = db.query(AIConversationSession).filter(
        AIConversationSession.id == session_id,
        AIConversationSession.user_id == current_user.id
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status == 'completed':
        # Return existing evaluation
        return AIConversationEndResponse(
            overall_band=session.final_scores.get('overall_band', 5.0) if session.final_scores else 5.0,
            summary=session.final_scores.get('summary', {}) if session.final_scores else {},
            encouragement=session.final_scores.get('encouragement', '') if session.final_scores else '',
            turn_count=session.final_scores.get('turn_count', 0) if session.final_scores else 0,
            duration_minutes=session.final_scores.get('duration_minutes'),
            pronunciation_score=session.final_scores.get('pronunciation_score')
        )

    # Get topic name
    topic_name = session.custom_topic
    if session.topic_id:
        topic = db.query(AIConversationTopic).get(session.topic_id)
        if topic:
            topic_name = topic.name

    # Get all turns
    turns = db.query(AIConversationTurn).filter(
        AIConversationTurn.session_id == session_id
    ).order_by(AIConversationTurn.turn_order).all()

    # Calculate final evaluation
    evaluation = service.calculate_final_evaluation(turns, topic_name)

    # Update session
    session.status = 'completed'
    session.ended_at = datetime.utcnow()
    session.final_scores = evaluation
    session.final_feedback = evaluation.get('encouragement', '')

    db.commit()

    return AIConversationEndResponse(
        overall_band=evaluation.get('overall_band', 5.0),
        summary=evaluation.get('summary', {}),
        encouragement=evaluation.get('encouragement', ''),
        turn_count=evaluation.get('turn_count', 0),
        duration_minutes=evaluation.get('duration_minutes'),
        pronunciation_score=evaluation.get('pronunciation_score')
    )


@router.get("/history", response_model=list[AISessionHistoryItem])
async def get_history(
    limit: int = 10,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's conversation history"""
    sessions = db.query(AIConversationSession).filter(
        AIConversationSession.user_id == current_user.id
    ).order_by(AIConversationSession.started_at.desc()).limit(limit).all()

    result = []
    for session in sessions:
        # Get topic name
        topic_name = session.custom_topic
        if session.topic_id:
            topic = db.query(AIConversationTopic).get(session.topic_id)
            if topic:
                topic_name = topic.name

        # Count turns
        turn_count = db.query(AIConversationTurn).filter(
            AIConversationTurn.session_id == session.id,
            AIConversationTurn.user_transcript != None
        ).count()

        result.append(AISessionHistoryItem(
            id=session.id,
            topic=topic_name or "Unknown",
            language=session.language,
            status=session.status,
            started_at=session.started_at,
            ended_at=session.ended_at,
            final_scores=session.final_scores,
            turn_count=turn_count
        ))

    return result


@router.get("/{session_id}")
async def get_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get session details with all turns"""
    session = db.query(AIConversationSession).filter(
        AIConversationSession.id == session_id,
        AIConversationSession.user_id == current_user.id
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Get topic name
    topic_name = session.custom_topic
    if session.topic_id:
        topic = db.query(AIConversationTopic).get(session.topic_id)
        if topic:
            topic_name = topic.name

    # Get turns
    turns = db.query(AIConversationTurn).filter(
        AIConversationTurn.session_id == session_id
    ).order_by(AIConversationTurn.turn_order).all()

    return {
        "id": session.id,
        "topic": topic_name,
        "language": session.language,
        "status": session.status,
        "started_at": session.started_at,
        "ended_at": session.ended_at,
        "final_scores": session.final_scores,
        "turns": [
            {
                "turn_order": t.turn_order,
                "ai_text": t.ai_text,
                "ai_audio_url": t.ai_audio_url,
                "user_transcript": t.user_transcript,
                "created_at": t.created_at
            }
            for t in turns
        ]
    }


# ============================================================================
# TTS Audio Serving
# ============================================================================

@router.get("/audio/tts/{filename}")
async def get_tts_audio(filename: str):
    """Serve TTS audio files"""
    filepath = os.path.join(TTS_AUDIO_FOLDER, filename)
    print(f"[TTS-SERVE] Requested: {filename}")
    print(f"[TTS-SERVE] Full path: {filepath}")
    print(f"[TTS-SERVE] TTS_AUDIO_FOLDER: {TTS_AUDIO_FOLDER}")
    print(f"[TTS-SERVE] File exists: {os.path.exists(filepath)}")

    if not os.path.exists(filepath):
        # List files in folder for debugging
        if os.path.exists(TTS_AUDIO_FOLDER):
            files = os.listdir(TTS_AUDIO_FOLDER)
            print(f"[TTS-SERVE] Files in folder: {files[:10]}...")  # Show first 10
        raise HTTPException(status_code=404, detail=f"Audio file not found: {filename}")

    return FileResponse(
        filepath,
        media_type="audio/wav",
        filename=filename
    )


# ============================================================================
# Admin: Topic Management
# ============================================================================

@router.get("/admin/topics", response_model=list[AITopicAdminResponse])
async def get_all_topics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all topics including inactive ones (admin only)"""
    if current_user.role not in ['admin', 'teacher']:
        raise HTTPException(status_code=403, detail="Admin or teacher access required")

    topics = db.query(AIConversationTopic).order_by(
        AIConversationTopic.language,
        AIConversationTopic.name
    ).all()

    return [
        AITopicAdminResponse(
            id=t.id,
            name=t.name,
            name_vi=t.name_vi,
            description=t.description,
            system_prompt=t.system_prompt,
            opening_message=t.opening_message,
            language=t.language,
            is_active=t.is_active
        )
        for t in topics
    ]


@router.post("/admin/topics", response_model=AITopicAdminResponse)
async def create_topic(
    request: AITopicCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new conversation topic (admin only)"""
    if current_user.role not in ['admin', 'teacher']:
        raise HTTPException(status_code=403, detail="Admin or teacher access required")

    topic = AIConversationTopic(
        name=request.name,
        name_vi=request.name_vi,
        description=request.description,
        system_prompt=request.system_prompt,
        opening_message=request.opening_message,
        language=request.language,
        is_active=True
    )
    db.add(topic)
    db.commit()
    db.refresh(topic)

    return AITopicAdminResponse(
        id=topic.id,
        name=topic.name,
        name_vi=topic.name_vi,
        description=topic.description,
        system_prompt=topic.system_prompt,
        opening_message=topic.opening_message,
        language=topic.language,
        is_active=topic.is_active
    )


@router.put("/admin/topics/{topic_id}", response_model=AITopicAdminResponse)
async def update_topic(
    topic_id: int,
    request: AITopicUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a conversation topic (admin only)"""
    if current_user.role not in ['admin', 'teacher']:
        raise HTTPException(status_code=403, detail="Admin or teacher access required")

    topic = db.query(AIConversationTopic).get(topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    # Update fields if provided
    if request.name is not None:
        topic.name = request.name
    if request.name_vi is not None:
        topic.name_vi = request.name_vi
    if request.description is not None:
        topic.description = request.description
    if request.system_prompt is not None:
        topic.system_prompt = request.system_prompt
    if request.opening_message is not None:
        topic.opening_message = request.opening_message
    if request.language is not None:
        topic.language = request.language
    if request.is_active is not None:
        topic.is_active = request.is_active

    db.commit()
    db.refresh(topic)

    return AITopicAdminResponse(
        id=topic.id,
        name=topic.name,
        name_vi=topic.name_vi,
        description=topic.description,
        system_prompt=topic.system_prompt,
        opening_message=topic.opening_message,
        language=topic.language,
        is_active=topic.is_active
    )


@router.delete("/admin/topics/{topic_id}")
async def delete_topic(
    topic_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete (deactivate) a topic"""
    if current_user.role not in ['admin', 'teacher']:
        raise HTTPException(status_code=403, detail="Admin or teacher access required")

    topic = db.query(AIConversationTopic).get(topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    topic.is_active = False
    db.commit()

    return {"message": "Topic deactivated"}
