"""Admin routes - Content management and user management"""
import json
from fastapi import APIRouter, Depends, HTTPException, Form
from sqlalchemy.orm import Session

from database import get_db
from models import User, Topic, Question, Conversation, ConversationLine
from dependencies import require_admin

router = APIRouter(prefix="/api/admin", tags=["Admin"])


# ==================== USER MANAGEMENT ====================

@router.get("/users")
async def get_all_users(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Get all users (admin only)"""
    users = db.query(User).all()
    return {
        "users": [
            {
                "id": u.id,
                "username": u.username,
                "email": u.email,
                "role": u.role,
                "created_at": u.created_at.isoformat() if u.created_at else None
            }
            for u in users
        ]
    }


@router.get("/teachers")
async def get_all_teachers(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Get all teachers (admin only)"""
    teachers = db.query(User).filter(User.role == 'teacher').all()
    return {
        "teachers": [
            {
                "id": t.id,
                "username": t.username,
                "email": t.email,
                "created_at": t.created_at.isoformat() if t.created_at else None
            }
            for t in teachers
        ]
    }


@router.get("/students")
async def get_all_students(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Get all students (admin only)"""
    students = db.query(User).filter(User.role == 'student').all()
    return {
        "students": [
            {
                "id": s.id,
                "username": s.username,
                "email": s.email,
                "created_at": s.created_at.isoformat() if s.created_at else None
            }
            for s in students
        ]
    }


# ==================== CONTENT MANAGEMENT ====================

@router.post("/conversations")
async def create_conversation(
    topic: str = Form(...),
    dialogue: str = Form(...),  # JSON string
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Create a new conversation (admin only)"""
    try:
        dialogue_data = json.loads(dialogue)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid dialogue JSON")

    conversation = Conversation(topic=topic)
    db.add(conversation)
    db.flush()

    for line_key, line_data in dialogue_data.items():
        line_order = int(line_key.replace('id', ''))
        line = ConversationLine(
            conversation_id=conversation.id,
            line_order=line_order,
            role=line_data['role'],
            line_text=line_data['line']
        )
        db.add(line)

    db.commit()
    return {"message": "Conversation created", "id": conversation.id}


@router.put("/conversations/{conversation_id}")
async def update_conversation(
    conversation_id: int,
    topic: str = Form(...),
    dialogue: str = Form(...),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Update an existing conversation (admin only)"""
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    try:
        dialogue_data = json.loads(dialogue)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid dialogue JSON")

    conversation.topic = topic

    # Delete existing lines
    db.query(ConversationLine).filter(ConversationLine.conversation_id == conversation_id).delete()

    # Add new lines
    for line_key, line_data in dialogue_data.items():
        line_order = int(line_key.replace('id', ''))
        line = ConversationLine(
            conversation_id=conversation.id,
            line_order=line_order,
            role=line_data['role'],
            line_text=line_data['line']
        )
        db.add(line)

    db.commit()
    return {"message": "Conversation updated"}


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Delete a conversation (admin only)"""
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    db.query(ConversationLine).filter(ConversationLine.conversation_id == conversation_id).delete()
    db.delete(conversation)
    db.commit()
    return {"message": "Conversation deleted"}


@router.post("/questions")
async def create_question(
    topic_name: str = Form(...),
    question_text: str = Form(...),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Create a new question (admin only)"""
    # Find or create topic
    topic = db.query(Topic).filter(Topic.name == topic_name).first()
    if not topic:
        topic = Topic(name=topic_name)
        db.add(topic)
        db.flush()

    question = Question(topic_id=topic.id, question_text=question_text)
    db.add(question)
    db.commit()
    return {"message": "Question created", "id": question.id}


@router.put("/questions/{question_id}")
async def update_question(
    question_id: int,
    topic_name: str = Form(...),
    question_text: str = Form(...),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Update an existing question (admin only)"""
    question = db.query(Question).filter(Question.id == question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    # Find or create topic
    topic = db.query(Topic).filter(Topic.name == topic_name).first()
    if not topic:
        topic = Topic(name=topic_name)
        db.add(topic)
        db.flush()

    question.topic_id = topic.id
    question.question_text = question_text
    db.commit()
    return {"message": "Question updated"}


@router.delete("/questions/{question_id}")
async def delete_question(
    question_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Delete a question (admin only)"""
    question = db.query(Question).filter(Question.id == question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    db.delete(question)
    db.commit()
    return {"message": "Question deleted"}
