import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/speechace")

engine = create_engine(DATABASE_URL)
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
    from models import User, Topic, Question, Conversation, ConversationLine, UserResult, Class, ClassStudent, Assignment, AssignmentResult
    Base.metadata.create_all(bind=engine)

    # Run migrations for new columns
    run_migrations()


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
        """
    ]

    with engine.connect() as conn:
        for migration in migrations:
            try:
                conn.execute(text(migration))
                conn.commit()
            except Exception as e:
                print(f"Migration warning: {e}")
