"""AI Conversation Routes - Interactive conversation with AI (No session saving)"""
import os
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from database import get_db
from models import User, AIConversationTopic
from auth import get_current_user
from ai_conversation_service import get_ai_conversation_service, TTS_AUDIO_FOLDER
from schemas import (
    AIConversationStartRequest,
    AIConversationStartResponse,
    AIConversationTurnResponse,
    AIConversationEndResponse,
    AITopicResponse,
    AITopicCreateRequest,
    AITopicUpdateRequest,
    AITopicAdminResponse,
)

router = APIRouter(prefix="/api/ai-conversation", tags=["AI Conversation"])

# In-memory storage for active sessions (no database saving)
_active_sessions = {}


class InMemorySession:
    """Temporary session storage - not saved to database"""
    def __init__(self, session_id: str, topic: str, language: str, system_prompt: str):
        self.id = session_id
        self.topic = topic
        self.language = language
        self.system_prompt = system_prompt
        self.turns = []  # List of {"role": "ai"|"user", "text": str}
        self.started_at = datetime.utcnow()


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
    """Start a new AI conversation session (in-memory only, not saved to database)"""
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

    # Create in-memory session (not saved to database)
    session_id = str(uuid.uuid4())[:8]  # Short unique ID

    session = InMemorySession(
        session_id=session_id,
        topic=topic_name,
        language=request.language,
        system_prompt=system_prompt
    )

    # Add AI's opening message to conversation history
    session.turns.append({"role": "ai", "text": opening_message})

    # Store session in memory
    _active_sessions[session_id] = session

    return AIConversationStartResponse(
        session_id=session_id,
        ai_message=opening_message,
        ai_audio_url=None,  # Not using Azure TTS anymore
        topic=topic_name
    )


@router.post("/{session_id}/turn", response_model=AIConversationTurnResponse)
async def submit_turn(
    session_id: str,
    audio: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Submit user audio and get AI response (no database saving)"""
    service = get_ai_conversation_service()

    # Get session from memory
    session = _active_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired")

    # Save user audio temporarily for processing
    turn_order = len(session.turns)
    audio_filename = service.save_user_audio(audio, session_id, turn_order)

    # Get full path for processing
    from utils.audio import UPLOAD_FOLDER
    full_audio_path = os.path.join(UPLOAD_FOLDER, audio_filename)

    # Transcribe user audio
    transcription_result = service.transcribe_user_audio(full_audio_path, session.language)
    user_transcript = transcription_result['transcript']

    if not user_transcript:
        raise HTTPException(status_code=400, detail="Could not transcribe audio. Please try again.")

    # Add user message to conversation history
    session.turns.append({"role": "user", "text": user_transcript})

    # Build conversation history for OpenAI
    conversation_history = [
        {"role": "assistant" if t["role"] == "ai" else "user", "content": t["text"]}
        for t in session.turns[:-1]  # Exclude last message (will be added by generate_ai_response)
    ]

    # Generate AI response
    ai_text = service.generate_ai_response(
        user_transcript, conversation_history, session.system_prompt, session.topic
    )

    # Add AI response to conversation history
    session.turns.append({"role": "ai", "text": ai_text})

    # Clean up audio file after processing
    try:
        if os.path.exists(full_audio_path):
            os.remove(full_audio_path)
    except Exception:
        pass

    return AIConversationTurnResponse(
        user_transcript=user_transcript,
        ai_text=ai_text,
        ai_audio_url=None,  # Not using Azure TTS anymore
        turn_number=len([t for t in session.turns if t["role"] == "user"])
    )


@router.post("/{session_id}/end", response_model=AIConversationEndResponse)
async def end_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """End conversation and get final evaluation (then delete session from memory)"""
    service = get_ai_conversation_service()

    # Get session from memory
    session = _active_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired")

    # Build turns for evaluation
    class TurnWrapper:
        """Wrapper to match the expected interface for calculate_final_evaluation"""
        def __init__(self, ai_text=None, user_transcript=None, created_at=None, azure_result=None):
            self.ai_text = ai_text
            self.user_transcript = user_transcript
            self.created_at = created_at or datetime.utcnow()
            self.azure_result = azure_result

    turns = []
    for i, t in enumerate(session.turns):
        if t["role"] == "ai":
            turns.append(TurnWrapper(ai_text=t["text"]))
        else:
            turns.append(TurnWrapper(user_transcript=t["text"]))

    # Calculate final evaluation
    evaluation = service.calculate_final_evaluation(turns, session.topic)

    # Delete session from memory
    del _active_sessions[session_id]

    return AIConversationEndResponse(
        overall_band=evaluation.get('overall_band', 5.0),
        summary=evaluation.get('summary', {}),
        encouragement=evaluation.get('encouragement', ''),
        turn_count=evaluation.get('turn_count', 0),
        duration_minutes=evaluation.get('duration_minutes'),
        pronunciation_score=evaluation.get('pronunciation_score')
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
