"""Content routes - Questions and Conversations"""
import os
import json
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import Question, Conversation

router = APIRouter(prefix="/api", tags=["Content"])


@router.get("/questions")
async def get_questions(db: Session = Depends(get_db)):
    """Get all questions from database"""
    questions = db.query(Question).all()

    if not questions:
        # Fallback to JSON file if database is empty
        questions_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'database', 'questionaire.json')
        with open(questions_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        questions_list = data.get('speaking_test_questions', [])
        topics = list(set(q['topic'] for q in questions_list))
        return {"questions": questions_list, "topics": sorted(topics)}

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

    if not conversations:
        # Fallback to JSON file if database is empty
        conversations_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'database', 'conversation.json')
        with open(conversations_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        conversations_list = []
        for key, value in data.items():
            conversations_list.append({
                "id": key,
                "topic": value.get("topic", ""),
                "dialogue": value.get("dialogue", {})
            })
        return {"conversations": conversations_list}

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
