"""Content routes - Questions and Conversations"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import Question, Conversation

router = APIRouter(prefix="/api", tags=["Content"])


@router.get("/questions")
async def get_questions(db: Session = Depends(get_db)):
    """Get all questions from database"""
    questions = db.query(Question).all()

    # Build response from database
    questions_list = []
    topics_set = set()
    for q in questions:
        topic_name = q.topic.name if q.topic else "Unknown"
        questions_list.append({
            "id": q.id,
            "topic": topic_name,
            "question": q.question_text
        })
        topics_set.add(topic_name)

    return {"questions": questions_list, "topics": sorted(topics_set)}


@router.get("/conversations")
async def get_conversations(db: Session = Depends(get_db)):
    """Get all conversations from database"""
    conversations = db.query(Conversation).all()

    # Build response from database
    conversations_list = []
    for conv in conversations:
        dialogue = {}
        for line in conv.lines:
            dialogue[f"id{line.line_order}"] = {
                "role": line.role,
                "line": line.line_text
            }
        conversations_list.append({
            "id": conv.id,
            "topic": conv.topic,
            "dialogue": dialogue
        })

    return {"conversations": conversations_list}
