"""
Seed script to populate the database with initial data from JSON files.
Run this script after creating the database to seed conversations and questions.
"""
import json
import os
import sys

# Add the backend directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal, engine, Base
from models import Topic, Question, Conversation, ConversationLine


def seed_database():
    """Seed the database with conversations and questions from JSON files."""
    # Create all tables
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()

    try:
        # Check if already seeded
        if db.query(Topic).first() is not None:
            print("Database already seeded. Skipping...")
            return

        # Get paths to JSON files
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        conversation_path = os.path.join(base_dir, 'database', 'conversation.json')
        questionnaire_path = os.path.join(base_dir, 'database', 'questionaire.json')

        # Seed questions and topics
        print("Seeding topics and questions...")
        with open(questionnaire_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        # Extract unique topics
        topics = {}
        for q in data['speaking_test_questions']:
            topic_name = q['topic']
            if topic_name not in topics:
                topic = Topic(name=topic_name)
                db.add(topic)
                db.flush()  # Get the ID
                topics[topic_name] = topic

        # Add questions
        for q in data['speaking_test_questions']:
            question = Question(
                topic_id=topics[q['topic']].id,
                question_text=q['question']
            )
            db.add(question)

        print(f"  Added {len(topics)} topics")
        print(f"  Added {len(data['speaking_test_questions'])} questions")

        # Seed conversations
        print("Seeding conversations...")
        with open(conversation_path, 'r', encoding='utf-8') as f:
            conversations_data = json.load(f)

        for conv_key, conv_data in conversations_data.items():
            conversation = Conversation(topic=conv_data['topic'])
            db.add(conversation)
            db.flush()  # Get the ID

            # Add conversation lines
            dialogue = conv_data['dialogue']
            for line_key, line_data in dialogue.items():
                # Extract line order from id (e.g., "id1" -> 1)
                line_order = int(line_key.replace('id', ''))

                line = ConversationLine(
                    conversation_id=conversation.id,
                    line_order=line_order,
                    role=line_data['role'],
                    line_text=line_data['line']
                )
                db.add(line)

        print(f"  Added {len(conversations_data)} conversations")

        db.commit()
        print("Database seeded successfully!")

    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_database()
