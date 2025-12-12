import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/speechace")

# Configure connection pooling for better concurrency
engine = create_engine(
    DATABASE_URL,
    pool_size=25,  # Number of persistent connections (tăng từ 10 → 25)
    max_overflow=75,  # Additional connections allowed beyond pool_size (tăng từ 20 → 75)
    pool_timeout=30,  # Seconds to wait for a connection from pool
    pool_recycle=1800,  # Recycle connections after 30 minutes
    pool_pre_ping=True,  # Test connections before using them
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency to get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialize database tables."""
    from models import User, Topic, Question, Conversation, ConversationLine, UserResult, Class, ClassTeacher, ClassStudent, Assignment, AssignmentResult
    Base.metadata.create_all(bind=engine)

    # Run migrations for new columns
    run_migrations()

    # Seed initial content from JSON files
    seed_content()


def run_migrations():
    """Add new columns to existing tables if they don't exist."""
    from sqlalchemy import text

    migrations = [
        # Add teacher_feedback and feedback_at to assignment_results
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assignment_results' AND column_name='teacher_feedback') THEN
                ALTER TABLE assignment_results ADD COLUMN teacher_feedback TEXT;
            END IF;
        END $$;
        """,
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assignment_results' AND column_name='feedback_at') THEN
                ALTER TABLE assignment_results ADD COLUMN feedback_at TIMESTAMP WITH TIME ZONE;
            END IF;
        END $$;
        """,
        # Create class_teachers table if not exists
        """
        CREATE TABLE IF NOT EXISTS class_teachers (
            id SERIAL PRIMARY KEY,
            class_id INTEGER NOT NULL REFERENCES classes(id),
            teacher_id INTEGER NOT NULL REFERENCES users(id),
            assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(class_id, teacher_id)
        );
        """,
        # Migrate existing teacher_id from classes to class_teachers
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='classes' AND column_name='teacher_id') THEN
                INSERT INTO class_teachers (class_id, teacher_id)
                SELECT id, teacher_id FROM classes WHERE teacher_id IS NOT NULL
                ON CONFLICT DO NOTHING;
            END IF;
        END $$;
        """,
        # Drop teacher_id column from classes (after migration)
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='classes' AND column_name='teacher_id') THEN
                ALTER TABLE classes DROP COLUMN teacher_id;
            END IF;
        END $$;
        """,
        # Add deadline column to assignments
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assignments' AND column_name='deadline') THEN
                ALTER TABLE assignments ADD COLUMN deadline TIMESTAMP WITH TIME ZONE;
            END IF;
        END $$;
        """
    ]

    with engine.connect() as conn:
        for migration in migrations:
            try:
                conn.execute(text(migration))
                conn.commit()
            except Exception as e:
                print(f"Migration warning: {e}")


def seed_content():
    """Seed questions and conversations from JSON files if database is empty."""
    import os
    import json
    from models import Topic, Question, Conversation, ConversationLine

    db = SessionLocal()
    try:
        # Check if data already exists
        if db.query(Question).count() > 0:
            print("Questions already seeded, skipping...")
            return

        # Get path to JSON files
        base_path = os.path.dirname(os.path.dirname(__file__))
        questions_path = os.path.join(base_path, 'database', 'questionaire.json')
        conversations_path = os.path.join(base_path, 'database', 'conversation.json')

        # Seed questions
        if os.path.exists(questions_path):
            with open(questions_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            questions_data = data.get('speaking_test_questions', [])
            topics_cache = {}

            for q in questions_data:
                topic_name = q.get('topic', 'Unknown')
                if topic_name not in topics_cache:
                    topic = db.query(Topic).filter(Topic.name == topic_name).first()
                    if not topic:
                        topic = Topic(name=topic_name)
                        db.add(topic)
                        db.flush()
                    topics_cache[topic_name] = topic

                question = Question(
                    topic_id=topics_cache[topic_name].id,
                    question_text=q.get('question', '')
                )
                db.add(question)

            db.commit()
            print(f"Seeded {len(questions_data)} questions")

        # Seed conversations
        if os.path.exists(conversations_path):
            with open(conversations_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            for key, value in data.items():
                conversation = Conversation(topic=value.get('topic', ''))
                db.add(conversation)
                db.flush()

                dialogue = value.get('dialogue', {})
                for line_key, line_data in dialogue.items():
                    line_order = int(line_key.replace('id', ''))
                    line = ConversationLine(
                        conversation_id=conversation.id,
                        line_order=line_order,
                        role=line_data.get('role', 'me'),
                        line_text=line_data.get('line', '')
                    )
                    db.add(line)

            db.commit()
            print(f"Seeded {len(data)} conversations")

    except Exception as e:
        print(f"Seed error: {e}")
        db.rollback()
    finally:
        db.close()
