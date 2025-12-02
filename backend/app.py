import os
import tempfile
import base64
import json
from datetime import datetime, timedelta
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends
from typing import Optional
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from pydub import AudioSegment
from sqlalchemy.orm import Session

from database import get_db, init_db
from models import User, Topic, Question, Conversation, ConversationLine, UserResult, Class, ClassStudent, Assignment, AssignmentResult
from schemas import (
    UserCreate, UserLogin, UserResponse, Token,
    ClassCreate, ClassUpdate, ClassResponse, ClassDetailResponse, ClassStudentAdd, ClassStudentResponse,
    AssignmentCreate, AssignmentUpdate, AssignmentResponse
)
from auth import (
    get_password_hash, verify_password, create_access_token,
    get_user_by_email, get_user_by_username, authenticate_user, get_current_user
)

# Load environment variables at startup
load_dotenv(override=True)
print(f"[STARTUP] Environment loaded from .env")
print(f"[STARTUP] AZURE_SPEECH_KEY present: {bool(os.getenv('AZURE_SPEECH_KEY'))}")
print(f"[STARTUP] AZURE_SPEECH_REGION: {os.getenv('AZURE_SPEECH_REGION', 'not set')}")
print(f"[STARTUP] OPENAI_API_KEY present: {bool(os.getenv('OPENAI_API_KEY'))}")
print(f"[STARTUP] DATABASE_URL present: {bool(os.getenv('DATABASE_URL'))}")

# Initialize database
try:
    init_db()
    print("[STARTUP] Database initialized successfully")

    # Add missing columns if they don't exist
    from database import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        # Check and add teacher_scores column
        result = conn.execute(text("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name='assignment_results' AND column_name='teacher_scores'
        """))
        if not result.fetchone():
            conn.execute(text("ALTER TABLE assignment_results ADD COLUMN teacher_scores JSONB"))
            conn.commit()
            print("[STARTUP] Added teacher_scores column")

        # Check and add audio_filename column
        result = conn.execute(text("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name='assignment_results' AND column_name='audio_filename'
        """))
        if not result.fetchone():
            conn.execute(text("ALTER TABLE assignment_results ADD COLUMN audio_filename VARCHAR(255)"))
            conn.commit()
            print("[STARTUP] Added audio_filename column")
except Exception as e:
    print(f"[STARTUP] Database initialization failed: {e}")

from azure_api import AzureSpeechAPI
from openai_evaluator import OpenAIEvaluator

app = FastAPI(title="Speech Evaluation API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Configure upload
UPLOAD_FOLDER = tempfile.gettempdir()
ALLOWED_EXTENSIONS = {'wav', 'mp3', 'm4a', 'webm', 'ogg', 'aiff'}

# Results folder
RESULTS_FOLDER = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'results')
os.makedirs(RESULTS_FOLDER, exist_ok=True)

# Audio storage folder for assignment submissions
AUDIO_FOLDER = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'audio_submissions')
os.makedirs(AUDIO_FOLDER, exist_ok=True)


def allowed_file(filename: str) -> bool:
    """Check if file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def convert_to_wav(input_path: str) -> str:
    """Convert audio file to WAV format for Azure Speech API compatibility.

    Args:
        input_path: Path to the input audio file

    Returns:
        Path to the converted WAV file (or original if already WAV)
    """
    ext = input_path.rsplit('.', 1)[1].lower() if '.' in input_path else ''

    # If already WAV, return as-is
    if ext == 'wav':
        return input_path

    try:
        print(f"[Audio] Converting {ext} to WAV...")

        # Load audio file based on format
        if ext == 'webm':
            audio = AudioSegment.from_file(input_path, format='webm')
        elif ext == 'mp3':
            audio = AudioSegment.from_mp3(input_path)
        elif ext == 'm4a':
            audio = AudioSegment.from_file(input_path, format='m4a')
        elif ext == 'ogg':
            audio = AudioSegment.from_ogg(input_path)
        elif ext == 'aiff':
            audio = AudioSegment.from_file(input_path, format='aiff')
        else:
            audio = AudioSegment.from_file(input_path)

        # Convert to mono 16kHz 16-bit WAV (required for Azure Speech API)
        audio = audio.set_channels(1)
        audio = audio.set_frame_rate(16000)
        audio = audio.set_sample_width(2)  # 2 bytes = 16-bit (required by Azure)

        # Export as WAV with explicit PCM encoding
        wav_path = input_path.rsplit('.', 1)[0] + '.wav'
        audio.export(wav_path, format='wav', parameters=["-acodec", "pcm_s16le"])

        print(f"[Audio] Converted to: {wav_path}")
        return wav_path

    except Exception as e:
        print(f"[Audio] Conversion failed: {e}, using original file")
        return input_path


def calculate_azure_score(results):
    """Calculate overall score from Azure results

    Args:
        results (dict): Azure API response

    Returns:
        dict: Overall scores
    """
    speech_score = results.get('speech_score', {})
    scores = speech_score.get('scores', {})

    # Get scores (already 0-100)
    pronunciation = scores.get('pronunciation', 0) or 0
    fluency = scores.get('fluency', 0) or 0
    accuracy = scores.get('accuracy', 0) or 0

    # Calculate total score
    total = (pronunciation * 0.4 + fluency * 0.3 + accuracy * 0.3)

    result = {
        'pronunciation': pronunciation,
        'fluency': fluency,
        'accuracy': accuracy,
        'total_score': round(total, 2),
        'grade': ''
    }

    # Assign grade based on total
    if total >= 90:
        result['grade'] = 'A+'
    elif total >= 85:
        result['grade'] = 'A'
    elif total >= 80:
        result['grade'] = 'A-'
    elif total >= 75:
        result['grade'] = 'B+'
    elif total >= 70:
        result['grade'] = 'B'
    elif total >= 65:
        result['grade'] = 'B-'
    elif total >= 60:
        result['grade'] = 'C+'
    elif total >= 55:
        result['grade'] = 'C'
    elif total >= 50:
        result['grade'] = 'C-'
    else:
        result['grade'] = 'D'

    return result


@app.get("/api/health")
async def health():
    """Health check endpoint"""
    return {"status": "ok"}


# ==================== AUTH ENDPOINTS ====================

@app.post("/api/auth/register", response_model=Token)
async def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """Register a new user"""
    try:
        # Debug logging
        print(f"[REGISTER] username: {user_data.username}")
        print(f"[REGISTER] email: {user_data.email}")
        print(f"[REGISTER] password length: {len(user_data.password)}")
        print(f"[REGISTER] password type: {type(user_data.password)}")
        print(f"[REGISTER] role: {user_data.role}")

        # Validate role
        if user_data.role not in ['student', 'teacher', 'admin']:
            raise HTTPException(status_code=400, detail="Role must be 'student', 'teacher', or 'admin'")

        # Check if email already exists
        if get_user_by_email(db, user_data.email):
            raise HTTPException(status_code=400, detail="Email already registered")

        # Check if username already exists
        if get_user_by_username(db, user_data.username):
            raise HTTPException(status_code=400, detail="Username already taken")

        # Create new user
        user = User(
            username=user_data.username,
            email=user_data.email,
            password_hash=get_password_hash(user_data.password),
            role=user_data.role
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        # Create access token
        access_token = create_access_token(data={"sub": str(user.id)})
        return {"access_token": access_token, "token_type": "bearer"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[REGISTER ERROR] {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")


@app.post("/api/auth/login", response_model=Token)
async def login(user_data: UserLogin, db: Session = Depends(get_db)):
    """Login user and return JWT token"""
    print(f"[LOGIN] Attempting login for: {user_data.email}")

    # Check if user exists
    from auth import get_user_by_email, verify_password
    user_check = get_user_by_email(db, user_data.email)
    if not user_check:
        print(f"[LOGIN] User not found: {user_data.email}")
    else:
        print(f"[LOGIN] User found: {user_check.username}, hash: {user_check.password_hash[:20]}...")
        try:
            is_valid = verify_password(user_data.password, user_check.password_hash)
            print(f"[LOGIN] Password valid: {is_valid}")
        except Exception as e:
            print(f"[LOGIN] Password verification error: {e}")

    user = authenticate_user(db, user_data.email, user_data.password)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(data={"sub": str(user.id)})
    return {"access_token": access_token, "token_type": "bearer"}


@app.get("/api/auth/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current user info"""
    return current_user


# ==================== RESULTS ENDPOINTS ====================

@app.get("/api/results/{part_type}")
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


# ==================== TEACHER ENDPOINTS ====================

def require_teacher(current_user: User = Depends(get_current_user)):
    """Dependency to require teacher role"""
    if current_user.role not in ['teacher', 'admin']:
        raise HTTPException(status_code=403, detail="Teacher access required")
    return current_user


def require_admin(current_user: User = Depends(get_current_user)):
    """Dependency to require admin role"""
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def require_admin_or_teacher(current_user: User = Depends(get_current_user)):
    """Dependency to require admin or teacher role"""
    if current_user.role not in ['admin', 'teacher']:
        raise HTTPException(status_code=403, detail="Admin or teacher access required")
    return current_user


@app.get("/api/teacher/students")
async def get_all_students(
    teacher: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    """Get all students and their results (teacher only)"""
    students = db.query(User).filter(User.role == 'student').all()

    result = []
    for student in students:
        student_data = {
            "id": student.id,
            "username": student.username,
            "email": student.email,
            "created_at": student.created_at.isoformat() if student.created_at else None,
            "results": {}
        }

        # Get student's results
        for part_type in ['conversation', 'unscripted']:
            user_result = db.query(UserResult).filter(
                UserResult.user_id == student.id,
                UserResult.part_type == part_type
            ).first()

            if user_result:
                student_data["results"][part_type] = {
                    "transcript": user_result.transcript,
                    "scores": user_result.scores,
                    "updated_at": user_result.updated_at.isoformat() if user_result.updated_at else None
                }

        result.append(student_data)

    return {"students": result}


@app.get("/api/teacher/students/{student_id}/results")
async def get_student_results(
    student_id: int,
    teacher: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    """Get detailed results for a specific student (teacher only)"""
    student = db.query(User).filter(User.id == student_id, User.role == 'student').first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    results = db.query(UserResult).filter(UserResult.user_id == student_id).all()

    return {
        "student": {
            "id": student.id,
            "username": student.username,
            "email": student.email
        },
        "results": [
            {
                "part_type": r.part_type,
                "transcript": r.transcript,
                "azure_result": r.azure_result,
                "openai_result": r.openai_result,
                "scores": r.scores,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None
            }
            for r in results
        ]
    }


# ==================== ADMIN CONTENT MANAGEMENT ====================

@app.post("/api/admin/conversations")
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


@app.put("/api/admin/conversations/{conversation_id}")
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


@app.delete("/api/admin/conversations/{conversation_id}")
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


@app.post("/api/admin/questions")
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


@app.put("/api/admin/questions/{question_id}")
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


@app.delete("/api/admin/questions/{question_id}")
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


# ==================== CLASS MANAGEMENT ENDPOINTS ====================

@app.get("/api/classes")
async def get_classes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all classes (filtered by role)"""
    if current_user.role == 'admin':
        # Admin sees all classes
        classes = db.query(Class).all()
    elif current_user.role == 'teacher':
        # Teacher sees their classes
        classes = db.query(Class).filter(Class.teacher_id == current_user.id).all()
    else:
        # Student sees their enrolled classes
        enrollments = db.query(ClassStudent).filter(ClassStudent.student_id == current_user.id).all()
        class_ids = [e.class_id for e in enrollments]
        classes = db.query(Class).filter(Class.id.in_(class_ids)).all() if class_ids else []

    result = []
    for c in classes:
        student_count = db.query(ClassStudent).filter(ClassStudent.class_id == c.id).count()
        result.append({
            "id": c.id,
            "name": c.name,
            "description": c.description,
            "teacher_id": c.teacher_id,
            "teacher_name": c.teacher.username if c.teacher else None,
            "student_count": student_count,
            "created_at": c.created_at.isoformat() if c.created_at else None
        })

    return {"classes": result}


@app.get("/api/classes/{class_id}")
async def get_class_detail(
    class_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get class details"""
    class_ = db.query(Class).filter(Class.id == class_id).first()
    if not class_:
        raise HTTPException(status_code=404, detail="Class not found")

    # Check access
    if current_user.role == 'student':
        enrollment = db.query(ClassStudent).filter(
            ClassStudent.class_id == class_id,
            ClassStudent.student_id == current_user.id
        ).first()
        if not enrollment:
            raise HTTPException(status_code=403, detail="Not enrolled in this class")
    elif current_user.role == 'teacher' and class_.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your class")

    # Get students
    enrollments = db.query(ClassStudent).filter(ClassStudent.class_id == class_id).all()
    students = []
    for e in enrollments:
        students.append({
            "id": e.id,
            "student_id": e.student.id,
            "username": e.student.username,
            "email": e.student.email,
            "enrolled_at": e.enrolled_at.isoformat() if e.enrolled_at else None
        })

    return {
        "id": class_.id,
        "name": class_.name,
        "description": class_.description,
        "teacher_id": class_.teacher_id,
        "teacher_name": class_.teacher.username if class_.teacher else None,
        "students": students,
        "created_at": class_.created_at.isoformat() if class_.created_at else None
    }


@app.post("/api/classes")
async def create_class(
    class_data: ClassCreate,
    admin: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db)
):
    """Create a new class (admin or teacher)"""
    # Verify teacher exists
    teacher = db.query(User).filter(User.id == class_data.teacher_id, User.role == 'teacher').first()
    if not teacher:
        raise HTTPException(status_code=400, detail="Teacher not found")

    # Teachers can only create classes for themselves
    if admin.role == 'teacher' and class_data.teacher_id != admin.id:
        raise HTTPException(status_code=403, detail="Teachers can only create classes for themselves")

    new_class = Class(
        name=class_data.name,
        description=class_data.description,
        teacher_id=class_data.teacher_id
    )
    db.add(new_class)
    db.commit()
    db.refresh(new_class)

    return {"message": "Class created", "id": new_class.id}


@app.put("/api/classes/{class_id}")
async def update_class(
    class_id: int,
    class_data: ClassUpdate,
    admin: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db)
):
    """Update a class (admin or class teacher)"""
    class_ = db.query(Class).filter(Class.id == class_id).first()
    if not class_:
        raise HTTPException(status_code=404, detail="Class not found")

    # Teachers can only update their own classes
    if admin.role == 'teacher' and class_.teacher_id != admin.id:
        raise HTTPException(status_code=403, detail="Not your class")

    if class_data.name is not None:
        class_.name = class_data.name
    if class_data.description is not None:
        class_.description = class_data.description
    if class_data.teacher_id is not None and admin.role == 'admin':
        # Only admin can change teacher
        teacher = db.query(User).filter(User.id == class_data.teacher_id, User.role == 'teacher').first()
        if not teacher:
            raise HTTPException(status_code=400, detail="Teacher not found")
        class_.teacher_id = class_data.teacher_id

    db.commit()
    return {"message": "Class updated"}


@app.delete("/api/classes/{class_id}")
async def delete_class(
    class_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Delete a class (admin only)"""
    class_ = db.query(Class).filter(Class.id == class_id).first()
    if not class_:
        raise HTTPException(status_code=404, detail="Class not found")

    # Delete enrollments and assignments first
    db.query(ClassStudent).filter(ClassStudent.class_id == class_id).delete()
    db.query(Assignment).filter(Assignment.class_id == class_id).delete()
    db.delete(class_)
    db.commit()
    return {"message": "Class deleted"}


@app.post("/api/classes/{class_id}/students")
async def add_student_to_class(
    class_id: int,
    student_data: ClassStudentAdd,
    admin: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db)
):
    """Add a student to a class (admin or class teacher)"""
    class_ = db.query(Class).filter(Class.id == class_id).first()
    if not class_:
        raise HTTPException(status_code=404, detail="Class not found")

    # Teachers can only modify their own classes
    if admin.role == 'teacher' and class_.teacher_id != admin.id:
        raise HTTPException(status_code=403, detail="Not your class")

    # Verify student exists
    student = db.query(User).filter(User.id == student_data.student_id, User.role == 'student').first()
    if not student:
        raise HTTPException(status_code=400, detail="Student not found")

    # Check if already enrolled
    existing = db.query(ClassStudent).filter(
        ClassStudent.class_id == class_id,
        ClassStudent.student_id == student_data.student_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Student already enrolled in this class")

    enrollment = ClassStudent(class_id=class_id, student_id=student_data.student_id)
    db.add(enrollment)
    db.commit()
    return {"message": "Student added to class"}


@app.delete("/api/classes/{class_id}/students/{student_id}")
async def remove_student_from_class(
    class_id: int,
    student_id: int,
    admin: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db)
):
    """Remove a student from a class (admin or class teacher)"""
    class_ = db.query(Class).filter(Class.id == class_id).first()
    if not class_:
        raise HTTPException(status_code=404, detail="Class not found")

    # Teachers can only modify their own classes
    if admin.role == 'teacher' and class_.teacher_id != admin.id:
        raise HTTPException(status_code=403, detail="Not your class")

    enrollment = db.query(ClassStudent).filter(
        ClassStudent.class_id == class_id,
        ClassStudent.student_id == student_id
    ).first()
    if not enrollment:
        raise HTTPException(status_code=404, detail="Student not enrolled in this class")

    db.delete(enrollment)
    db.commit()
    return {"message": "Student removed from class"}


# ==================== ASSIGNMENT ENDPOINTS ====================

@app.get("/api/classes/{class_id}/assignments")
async def get_class_assignments(
    class_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get assignments for a class"""
    class_ = db.query(Class).filter(Class.id == class_id).first()
    if not class_:
        raise HTTPException(status_code=404, detail="Class not found")

    # Check access
    if current_user.role == 'student':
        enrollment = db.query(ClassStudent).filter(
            ClassStudent.class_id == class_id,
            ClassStudent.student_id == current_user.id
        ).first()
        if not enrollment:
            raise HTTPException(status_code=403, detail="Not enrolled in this class")
    elif current_user.role == 'teacher' and class_.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your class")

    assignments = db.query(Assignment).filter(Assignment.class_id == class_id).all()

    result = []
    for a in assignments:
        # Check if student has completed this assignment
        is_completed = False
        assignment_result = None
        submissions_count = 0

        if current_user.role == 'student':
            existing_result = db.query(AssignmentResult).filter(
                AssignmentResult.assignment_id == a.id,
                AssignmentResult.student_id == current_user.id
            ).first()
            if existing_result:
                is_completed = True
                assignment_result = {
                    "transcript": existing_result.transcript,
                    "scores": existing_result.scores,
                    "azure_result": existing_result.azure_result,
                    "openai_result": existing_result.openai_result,
                    "audio_url": f"/api/audio/{existing_result.audio_filename}" if existing_result.audio_filename else None,
                    "submitted_at": existing_result.submitted_at.isoformat() if existing_result.submitted_at else None,
                    "teacher_feedback": getattr(existing_result, 'teacher_feedback', None),
                    "teacher_scores": getattr(existing_result, 'teacher_scores', None),
                    "feedback_at": existing_result.feedback_at.isoformat() if getattr(existing_result, 'feedback_at', None) else None
                }
        else:
            # For teachers/admins, count submissions
            submissions_count = db.query(AssignmentResult).filter(
                AssignmentResult.assignment_id == a.id
            ).count()

        result.append({
            "id": a.id,
            "class_id": a.class_id,
            "class_name": class_.name,
            "topic": a.topic,
            "question_text": a.question_text,
            "requirements": a.requirements,
            "instructions": a.instructions,
            "created_by": a.created_by,
            "creator_name": a.creator.username if a.creator else None,
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "is_completed": is_completed,
            "result": assignment_result,
            "submissions_count": submissions_count
        })

    return {"assignments": result}


@app.get("/api/assignments")
async def get_my_assignments(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all assignments for current user (students see their class assignments)"""
    if current_user.role == 'admin':
        # Admin sees all assignments
        assignments = db.query(Assignment).all()
    elif current_user.role == 'teacher':
        # Teacher sees assignments for their classes
        class_ids = [c.id for c in db.query(Class).filter(Class.teacher_id == current_user.id).all()]
        assignments = db.query(Assignment).filter(Assignment.class_id.in_(class_ids)).all() if class_ids else []
    else:
        # Student sees assignments from enrolled classes
        enrollments = db.query(ClassStudent).filter(ClassStudent.student_id == current_user.id).all()
        class_ids = [e.class_id for e in enrollments]
        assignments = db.query(Assignment).filter(Assignment.class_id.in_(class_ids)).all() if class_ids else []

    result = []
    for a in assignments:
        result.append({
            "id": a.id,
            "class_id": a.class_id,
            "class_name": a.class_.name if a.class_ else None,
            "topic": a.topic,
            "question_text": a.question_text,
            "requirements": a.requirements,
            "instructions": a.instructions,
            "created_by": a.created_by,
            "creator_name": a.creator.username if a.creator else None,
            "created_at": a.created_at.isoformat() if a.created_at else None
        })

    return {"assignments": result}


@app.post("/api/assignments")
async def create_assignment(
    assignment_data: AssignmentCreate,
    teacher: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    """Create an assignment (teacher for their class)"""
    class_ = db.query(Class).filter(Class.id == assignment_data.class_id).first()
    if not class_:
        raise HTTPException(status_code=404, detail="Class not found")

    # Teachers can only create assignments for their own classes
    if teacher.role == 'teacher' and class_.teacher_id != teacher.id:
        raise HTTPException(status_code=403, detail="Not your class")

    assignment = Assignment(
        class_id=assignment_data.class_id,
        topic=assignment_data.topic,
        question_text=assignment_data.question_text,
        requirements=assignment_data.requirements,
        instructions=assignment_data.instructions,
        created_by=teacher.id
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)

    return {"message": "Assignment created", "id": assignment.id}


@app.put("/api/assignments/{assignment_id}")
async def update_assignment(
    assignment_id: int,
    assignment_data: AssignmentUpdate,
    teacher: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    """Update an assignment (teacher for their class)"""
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    # Check class ownership
    class_ = db.query(Class).filter(Class.id == assignment.class_id).first()
    if teacher.role == 'teacher' and class_.teacher_id != teacher.id:
        raise HTTPException(status_code=403, detail="Not your class")

    if assignment_data.topic is not None:
        assignment.topic = assignment_data.topic
    if assignment_data.question_text is not None:
        assignment.question_text = assignment_data.question_text
    if assignment_data.requirements is not None:
        assignment.requirements = assignment_data.requirements
    if assignment_data.instructions is not None:
        assignment.instructions = assignment_data.instructions

    db.commit()
    return {"message": "Assignment updated"}


@app.delete("/api/assignments/{assignment_id}")
async def delete_assignment(
    assignment_id: int,
    teacher: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    """Delete an assignment (teacher for their class)"""
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    # Check class ownership
    class_ = db.query(Class).filter(Class.id == assignment.class_id).first()
    if teacher.role == 'teacher' and class_.teacher_id != teacher.id:
        raise HTTPException(status_code=403, detail="Not your class")

    # Delete related results first
    db.query(AssignmentResult).filter(AssignmentResult.assignment_id == assignment_id).delete()
    db.delete(assignment)
    db.commit()
    return {"message": "Assignment deleted"}


@app.get("/api/assignments/{assignment_id}")
async def get_assignment(
    assignment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a single assignment with completion status"""
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    # Check access
    class_ = db.query(Class).filter(Class.id == assignment.class_id).first()
    if current_user.role == 'student':
        enrollment = db.query(ClassStudent).filter(
            ClassStudent.class_id == assignment.class_id,
            ClassStudent.student_id == current_user.id
        ).first()
        if not enrollment:
            raise HTTPException(status_code=403, detail="Not enrolled in this class")
    elif current_user.role == 'teacher' and class_.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your class")

    # Check completion status for students
    is_completed = False
    assignment_result = None
    if current_user.role == 'student':
        existing_result = db.query(AssignmentResult).filter(
            AssignmentResult.assignment_id == assignment_id,
            AssignmentResult.student_id == current_user.id
        ).first()
        if existing_result:
            is_completed = True
            assignment_result = {
                "id": existing_result.id,
                "transcript": existing_result.transcript,
                "azure_result": existing_result.azure_result,
                "openai_result": existing_result.openai_result,
                "scores": existing_result.scores,
                "submitted_at": existing_result.submitted_at.isoformat() if existing_result.submitted_at else None
            }

    return {
        "id": assignment.id,
        "class_id": assignment.class_id,
        "class_name": class_.name if class_ else None,
        "topic": assignment.topic,
        "question_text": assignment.question_text,
        "requirements": assignment.requirements,
        "instructions": assignment.instructions,
        "created_by": assignment.created_by,
        "creator_name": assignment.creator.username if assignment.creator else None,
        "created_at": assignment.created_at.isoformat() if assignment.created_at else None,
        "is_completed": is_completed,
        "result": assignment_result
    }


@app.post("/api/assignments/{assignment_id}/submit")
async def submit_assignment(
    assignment_id: int,
    audio: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Submit assignment answer (student only, one-time submission)"""
    if current_user.role != 'student':
        raise HTTPException(status_code=403, detail="Only students can submit assignments")

    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    # Check if enrolled in the class
    enrollment = db.query(ClassStudent).filter(
        ClassStudent.class_id == assignment.class_id,
        ClassStudent.student_id == current_user.id
    ).first()
    if not enrollment:
        raise HTTPException(status_code=403, detail="Not enrolled in this class")

    # Check if already submitted
    existing_result = db.query(AssignmentResult).filter(
        AssignmentResult.assignment_id == assignment_id,
        AssignmentResult.student_id == current_user.id
    ).first()
    if existing_result:
        raise HTTPException(status_code=400, detail="Assignment already submitted")

    # Validate file
    if not audio.filename:
        raise HTTPException(status_code=400, detail="No file selected")

    if not allowed_file(audio.filename):
        raise HTTPException(status_code=400, detail="Invalid file type")

    # Save and process audio
    filename = audio.filename.replace(" ", "_")
    filepath = os.path.join(UPLOAD_FOLDER, filename)

    try:
        with open(filepath, "wb") as buffer:
            content = await audio.read()
            buffer.write(content)

        # Initialize Azure Speech API
        client = AzureSpeechAPI()

        # Get evaluation results
        results = client.score_audio(
            audio_file_path=filepath,
            relevance_context=assignment.question_text
        )

        azure_original = json.loads(json.dumps(results))
        azure_score = calculate_azure_score(results)

        # OpenAI enhancement
        openai_enhanced_data = None
        openai_score = None
        try:
            openai_client = OpenAIEvaluator()
            transcript = results.get('speech_score', {}).get('transcript', '')

            if transcript:
                enhanced = openai_client.enhance_evaluation(
                    transcript=transcript,
                    question=assignment.question_text
                )
                openai_score = enhanced.get('openai_overall_score', {})
                openai_enhanced_data = enhanced

                # Update results with OpenAI data
                if 'speech_score' in results:
                    if 'grammar' in enhanced:
                        results['speech_score']['grammar'] = enhanced['grammar']
                    if 'vocab' in enhanced:
                        results['speech_score']['vocab'] = enhanced['vocab']
                    if 'coherence' in enhanced:
                        results['speech_score']['coherence'] = enhanced['coherence']
                    if 'relevance' in enhanced:
                        results['speech_score']['relevance'] = enhanced['relevance']
                    if 'improved_answer' in enhanced:
                        results['speech_score']['improved_answer'] = enhanced['improved_answer']

        except Exception as e:
            print(f"OpenAI enhancement failed: {e}")

        # Calculate combined score
        scores_data = {
            'azure': azure_score,
            'openai': openai_score if openai_score else None,
        }
        if openai_score:
            combined_total = (azure_score['total_score'] + openai_score.get('total_score', 0)) / 2
            scores_data['combined'] = {
                'azure_score': azure_score['total_score'],
                'openai_score': openai_score.get('total_score', 0),
                'combined_score': round(combined_total, 2)
            }

        # Read audio for response
        with open(filepath, 'rb') as audio_file:
            audio_data = base64.b64encode(audio_file.read()).decode('utf-8')
            ext = filename.rsplit('.', 1)[1].lower()
            mime_types = {
                'wav': 'audio/wav', 'mp3': 'audio/mpeg', 'm4a': 'audio/mp4',
                'webm': 'audio/webm', 'ogg': 'audio/ogg', 'aiff': 'audio/aiff'
            }
            mime_type = mime_types.get(ext, 'audio/wav')
            audio_base64 = f"data:{mime_type};base64,{audio_data}"

        transcript = results.get('speech_score', {}).get('transcript', '')

        # Save audio file permanently with unique name (for future use when column is added)
        import uuid
        audio_filename = f"{assignment_id}_{current_user.id}_{uuid.uuid4().hex[:8]}.{ext}"
        permanent_audio_path = os.path.join(AUDIO_FOLDER, audio_filename)
        import shutil
        shutil.move(filepath, permanent_audio_path)

        # Save to database
        assignment_result = AssignmentResult(
            assignment_id=assignment_id,
            student_id=current_user.id,
            transcript=transcript,
            audio_filename=audio_filename,
            azure_result=azure_original,
            openai_result=openai_enhanced_data,
            scores=scores_data
        )
        db.add(assignment_result)
        db.commit()
        db.refresh(assignment_result)

        # Return results
        results['audio_data'] = audio_base64
        results['assignment_result_id'] = assignment_result.id
        results['scores_summary'] = scores_data

        return results

    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/assignments/{assignment_id}/result")
async def get_assignment_result(
    assignment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get assignment result for current student"""
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    # Students can only see their own results
    if current_user.role == 'student':
        result = db.query(AssignmentResult).filter(
            AssignmentResult.assignment_id == assignment_id,
            AssignmentResult.student_id == current_user.id
        ).first()
    elif current_user.role in ['teacher', 'admin']:
        # Teachers/admins need to specify student_id via query param
        raise HTTPException(status_code=400, detail="Use /api/assignments/{id}/results/{student_id} for teacher view")
    else:
        raise HTTPException(status_code=403, detail="Access denied")

    if not result:
        raise HTTPException(status_code=404, detail="No submission found for this assignment")

    return {
        "id": result.id,
        "assignment_id": result.assignment_id,
        "student_id": result.student_id,
        "transcript": result.transcript,
        "azure_result": result.azure_result,
        "openai_result": result.openai_result,
        "scores": result.scores,
        "submitted_at": result.submitted_at.isoformat() if result.submitted_at else None,
        "teacher_feedback": result.teacher_feedback,
        "feedback_at": result.feedback_at.isoformat() if result.feedback_at else None
    }


@app.get("/api/assignments/{assignment_id}/submissions")
async def get_assignment_submissions(
    assignment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get assignment with all student submissions (teacher only)"""
    if current_user.role not in ['teacher', 'admin']:
        raise HTTPException(status_code=403, detail="Only teachers can view submissions")

    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    # Verify teacher owns the class (unless admin)
    class_ = db.query(Class).filter(Class.id == assignment.class_id).first()
    if current_user.role == 'teacher' and class_.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your class")

    # Get all students in the class
    enrolled_students = db.query(ClassStudent, User).join(
        User, ClassStudent.student_id == User.id
    ).filter(ClassStudent.class_id == assignment.class_id).all()

    # Get all submissions for this assignment
    submissions = db.query(AssignmentResult).filter(
        AssignmentResult.assignment_id == assignment_id
    ).all()

    submission_map = {s.student_id: s for s in submissions}

    # Build response with all students (submitted and not submitted)
    student_submissions = []
    for enrollment, student in enrolled_students:
        submission = submission_map.get(student.id)
        if submission:
            # Determine review status
            if submission.teacher_feedback or getattr(submission, 'teacher_scores', None):
                review_status = "reviewed"
            else:
                review_status = "waiting_for_teacher"

            student_submissions.append({
                "id": submission.id,
                "student_id": student.id,
                "student_name": student.username,
                "student_email": student.email,
                "transcript": submission.transcript,
                "scores": submission.scores,
                "azure_result": submission.azure_result,
                "openai_result": submission.openai_result,
                "audio_url": f"/api/audio/{submission.audio_filename}" if submission.audio_filename else None,
                "submitted_at": submission.submitted_at.isoformat() if submission.submitted_at else None,
                "teacher_feedback": submission.teacher_feedback,
                "teacher_scores": getattr(submission, 'teacher_scores', None),
                "feedback_at": submission.feedback_at.isoformat() if submission.feedback_at else None,
                "status": "submitted",
                "review_status": review_status
            })
        else:
            student_submissions.append({
                "id": None,
                "student_id": student.id,
                "student_name": student.username,
                "student_email": student.email,
                "transcript": None,
                "scores": None,
                "azure_result": None,
                "openai_result": None,
                "audio_url": None,
                "submitted_at": None,
                "teacher_feedback": None,
                "teacher_scores": None,
                "feedback_at": None,
                "status": "pending",
                "review_status": None
            })

    return {
        "id": assignment.id,
        "class_id": assignment.class_id,
        "class_name": class_.name,
        "topic": assignment.topic,
        "question_text": assignment.question_text,
        "requirements": assignment.requirements,
        "instructions": assignment.instructions,
        "created_at": assignment.created_at.isoformat() if assignment.created_at else None,
        "total_students": len(enrolled_students),
        "submitted_count": len(submissions),
        "submissions": student_submissions
    }


@app.post("/api/assignments/{assignment_id}/submissions/{submission_id}/feedback")
async def add_teacher_feedback(
    assignment_id: int,
    submission_id: int,
    feedback_data: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add teacher feedback to a student submission"""
    if current_user.role not in ['teacher', 'admin']:
        raise HTTPException(status_code=403, detail="Only teachers can add feedback")

    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    # Verify teacher owns the class (unless admin)
    class_ = db.query(Class).filter(Class.id == assignment.class_id).first()
    if current_user.role == 'teacher' and class_.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your class")

    submission = db.query(AssignmentResult).filter(
        AssignmentResult.id == submission_id,
        AssignmentResult.assignment_id == assignment_id
    ).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    feedback_text = feedback_data.get('feedback', '').strip()
    teacher_scores = feedback_data.get('teacher_scores', None)

    # At least one of feedback or scores must be provided
    if not feedback_text and not teacher_scores:
        raise HTTPException(status_code=400, detail="Feedback text or scores are required")

    if feedback_text:
        submission.teacher_feedback = feedback_text
    if teacher_scores:
        try:
            submission.teacher_scores = teacher_scores
        except AttributeError:
            pass  # Column doesn't exist yet
    submission.feedback_at = datetime.utcnow()
    db.commit()
    db.refresh(submission)

    return {
        "message": "Feedback added successfully",
        "submission_id": submission.id,
        "teacher_feedback": submission.teacher_feedback,
        "teacher_scores": getattr(submission, 'teacher_scores', None),
        "feedback_at": submission.feedback_at.isoformat() if submission.feedback_at else None
    }


@app.get("/api/audio/{filename}")
async def get_audio_file(
    filename: str,
    current_user: User = Depends(get_current_user)
):
    """Serve audio files for assignment submissions"""
    filepath = os.path.join(AUDIO_FOLDER, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Audio file not found")

    # Determine mime type
    ext = filename.rsplit('.', 1)[-1].lower()
    mime_types = {
        'wav': 'audio/wav', 'mp3': 'audio/mpeg', 'm4a': 'audio/mp4',
        'webm': 'audio/webm', 'ogg': 'audio/ogg', 'aiff': 'audio/aiff'
    }
    mime_type = mime_types.get(ext, 'audio/wav')

    return FileResponse(filepath, media_type=mime_type)


# ==================== ADMIN ENDPOINTS ====================

@app.get("/api/admin/users")
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


@app.get("/api/admin/teachers")
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


@app.post("/api/convert-audio")
async def convert_audio(
    audio: UploadFile = File(...),
    format: str = Form("mp3")
):
    """Convert audio file to MP3 or WAV format"""
    from fastapi.responses import Response

    if format not in ['mp3', 'wav']:
        raise HTTPException(status_code=400, detail="Format must be 'mp3' or 'wav'")

    # Save uploaded file temporarily
    filename = audio.filename.replace(" ", "_")
    filepath = os.path.join(UPLOAD_FOLDER, filename)

    try:
        # Save file
        with open(filepath, "wb") as buffer:
            content = await audio.read()
            buffer.write(content)

        # Import pydub
        try:
            from pydub import AudioSegment
        except ImportError:
            raise HTTPException(status_code=500, detail="pydub not installed. Cannot convert audio.")

        # Load audio
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

        # Convert to target format
        output_path = os.path.join(UPLOAD_FOLDER, f"converted.{format}")

        if format == 'mp3':
            # Export as MP3 (128kbps)
            audio_segment.export(output_path, format='mp3', bitrate='128k')
            mime_type = 'audio/mpeg'
        else:
            # Export as WAV (16kHz, mono, 16-bit for compatibility)
            audio_segment = audio_segment.set_frame_rate(16000).set_channels(1).set_sample_width(2)
            audio_segment.export(output_path, format='wav')
            mime_type = 'audio/wav'

        # Read converted file
        with open(output_path, 'rb') as f:
            converted_data = f.read()

        # Clean up
        os.remove(filepath)
        os.remove(output_path)

        return Response(
            content=converted_data,
            media_type=mime_type,
            headers={
                'Content-Disposition': f'attachment; filename="recording.{format}"'
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        # Clean up on error
        if os.path.exists(filepath):
            os.remove(filepath)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/questions")
async def get_questions(db: Session = Depends(get_db)):
    """Get all questions from database"""
    questions = db.query(Question).all()

    if not questions:
        # Fallback to JSON file if database is empty
        questions_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'database', 'questionaire.json')
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


@app.get("/api/conversations")
async def get_conversations(db: Session = Depends(get_db)):
    """Get all conversations from database"""
    conversations = db.query(Conversation).all()

    if not conversations:
        # Fallback to JSON file if database is empty
        conversations_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'database', 'conversation.json')
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


@app.post("/api/evaluate")
async def evaluate_audio(
    audio: UploadFile = File(...),
    question: Optional[str] = Form(None),
    question_id: Optional[int] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Endpoint to evaluate audio file (unscripted speech)"""

    # Validate file
    if not audio.filename:
        raise HTTPException(status_code=400, detail="No file selected")

    if not allowed_file(audio.filename):
        raise HTTPException(status_code=400, detail="Invalid file type. Allowed: wav, mp3, m4a, webm, ogg, aiff")

    # Save uploaded file temporarily
    filename = audio.filename.replace(" ", "_")
    filepath = os.path.join(UPLOAD_FOLDER, filename)

    try:
        # Save file
        with open(filepath, "wb") as buffer:
            content = await audio.read()
            buffer.write(content)

        # Initialize Azure Speech API
        client = AzureSpeechAPI()

        # Get evaluation results from Azure
        results = client.score_audio(
            audio_file_path=filepath,
            relevance_context=question or ""
        )

        # Store original Azure results
        azure_original = json.loads(json.dumps(results))  # Deep copy

        # Calculate Azure score
        azure_score = calculate_azure_score(results)
        print(f"\n Azure Score: {azure_score['total_score']}/100 ({azure_score['grade']})")

        # Save Azure results to unscripted_result.json
        unscripted_filepath = os.path.join(RESULTS_FOLDER, 'unscripted_result.json')
        with open(unscripted_filepath, 'w', encoding='utf-8') as f:
            json.dump(azure_original, f, indent=2, ensure_ascii=False)
        print(f" Azure results saved to: {unscripted_filepath}")

        # Enhance grammar, vocab, and coherence with OpenAI
        openai_enhanced_data = None
        openai_score = None
        try:
            print("\n" + "="*60)
            print("ATTEMPTING OPENAI ENHANCEMENT")
            print("="*60)

            openai_client = OpenAIEvaluator()

            # Extract transcript from Azure results
            transcript = results.get('speech_score', {}).get('transcript', '')

            if transcript:
                print(f"\n Transcript extracted: {transcript[:100]}...")
                print(" Sending to OpenAI GPT-4 for enhanced analysis...")

                enhanced = openai_client.enhance_evaluation(
                    transcript=transcript,
                    question=question
                )

                # Extract OpenAI score
                openai_score = enhanced.get('openai_overall_score', {})
                print(f"\n OpenAI Score: {openai_score.get('total_score', 0)}/100 ({openai_score.get('grade', 'N/A')})")

                # 1. Save basic OpenAI evaluation to openai_result.json
                openai_basic_data = {
                    'transcript': transcript,
                    'question': question,
                    'grammar': enhanced.get('grammar', {}),
                    'vocab': enhanced.get('vocab', {}),
                    'coherence': enhanced.get('coherence', {}),
                    'relevance': enhanced.get('relevance', {}),
                    'scores': enhanced.get('scores', {}),
                    'timestamp': datetime.now().isoformat()
                }
                openai_result_path = os.path.join(RESULTS_FOLDER, 'openai_result.json')
                with open(openai_result_path, 'w', encoding='utf-8') as f:
                    json.dump(openai_basic_data, f, indent=2, ensure_ascii=False)
                print(f" OpenAI basic results saved to: {openai_result_path}")

                # 2. Save enhanced OpenAI evaluation to openai_enhance_result.json
                openai_enhanced_data = {
                    'transcript': transcript,
                    'question': question,
                    'evaluation': enhanced,
                    'overall_score': openai_score,
                    'improved_answer': enhanced.get('improved_answer', ''),
                    'timestamp': datetime.now().isoformat()
                }
                openai_enhanced_path = os.path.join(RESULTS_FOLDER, 'openai_enhance_result.json')
                with open(openai_enhanced_path, 'w', encoding='utf-8') as f:
                    json.dump(openai_enhanced_data, f, indent=2, ensure_ascii=False)
                print(f" OpenAI enhanced results saved to: {openai_enhanced_path}")

                # Replace grammar, vocab, coherence sections with OpenAI's enhanced analysis
                if 'speech_score' in results:
                    if 'grammar' in enhanced:
                        results['speech_score']['grammar'] = enhanced['grammar']
                        print(" Grammar analysis added from OpenAI")
                    if 'vocab' in enhanced:
                        results['speech_score']['vocab'] = enhanced['vocab']
                        print(" Vocabulary analysis added from OpenAI")
                    if 'coherence' in enhanced:
                        results['speech_score']['coherence'] = enhanced['coherence']
                        print(" Coherence analysis added from OpenAI")
                    if 'relevance' in enhanced:
                        results['speech_score']['relevance'] = enhanced['relevance']
                        print(" Relevance analysis added from OpenAI")

                    # Add improved answer to results
                    if 'improved_answer' in enhanced:
                        results['speech_score']['improved_answer'] = enhanced['improved_answer']
                        print(" Improved answer suggestion added")

                    # Update scores with OpenAI's assessment (0-100)
                    if 'scores' in enhanced and 'scores' in results['speech_score']:
                        if 'grammar' in enhanced['scores']:
                            results['speech_score']['scores']['grammar'] = enhanced['scores']['grammar']
                        if 'vocab' in enhanced['scores']:
                            results['speech_score']['scores']['vocab'] = enhanced['scores']['vocab']
                        if 'coherence' in enhanced['scores']:
                            results['speech_score']['scores']['coherence'] = enhanced['scores']['coherence']
                        print(" Scores updated with OpenAI assessment")

                # Calculate combined score
                combined_score = {
                    'azure_score': azure_score['total_score'],
                    'openai_score': openai_score.get('total_score', 0),
                    'combined_score': round((azure_score['total_score'] + openai_score.get('total_score', 0)) / 2, 2),
                    'grade': ''
                }
                total = combined_score['combined_score']
                if total >= 90:
                    combined_score['grade'] = 'A+'
                elif total >= 85:
                    combined_score['grade'] = 'A'
                elif total >= 80:
                    combined_score['grade'] = 'A-'
                elif total >= 75:
                    combined_score['grade'] = 'B+'
                elif total >= 70:
                    combined_score['grade'] = 'B'
                elif total >= 65:
                    combined_score['grade'] = 'B-'
                elif total >= 60:
                    combined_score['grade'] = 'C+'
                elif total >= 55:
                    combined_score['grade'] = 'C'
                elif total >= 50:
                    combined_score['grade'] = 'C-'
                else:
                    combined_score['grade'] = 'D'

                results['combined_score'] = combined_score
                print(f"\n Combined Score: {combined_score['combined_score']}/100 ({combined_score['grade']})")

                print("\n OPENAI ENHANCEMENT COMPLETE")
                print("="*60 + "\n")
            else:
                print(" No transcript found in Azure results")

        except Exception as e:
            print("\n" + "="*60)
            print(" OPENAI ENHANCEMENT FAILED")
            print("="*60)
            print(f"Error type: {type(e).__name__}")
            print(f"Error message: {str(e)}")
            import traceback
            print(f"Traceback:\n{traceback.format_exc()}")
            print("="*60)
            print(" Continuing with Azure results only...")
            print("="*60 + "\n")

        # Save combined results (merged Azure + OpenAI)
        combined_data = {
            'azure': azure_original,
            'openai': openai_enhanced_data.get('evaluation') if openai_enhanced_data else None,
            'scores': {
                'azure': azure_score,
                'openai': openai_score if openai_score else None,
                'combined': results.get('combined_score', None)
            },
            'timestamp': datetime.now().isoformat()
        }
        combined_result_path = os.path.join(RESULTS_FOLDER, 'combined_result.json')
        with open(combined_result_path, 'w', encoding='utf-8') as f:
            json.dump(combined_data, f, indent=2, ensure_ascii=False)
        print(f" Combined results saved to: {combined_result_path}")

        # Read audio file and convert to base64
        with open(filepath, 'rb') as audio_file:
            audio_data = base64.b64encode(audio_file.read()).decode('utf-8')
            ext = filename.rsplit('.', 1)[1].lower()
            mime_types = {
                'wav': 'audio/wav',
                'mp3': 'audio/mpeg',
                'm4a': 'audio/mp4',
                'webm': 'audio/webm',
                'ogg': 'audio/ogg',
                'aiff': 'audio/aiff'
            }
            mime_type = mime_types.get(ext, 'audio/wav')
            audio_base64 = f"data:{mime_type};base64,{audio_data}"

        # Clean up
        os.remove(filepath)

        # Save result to database (upsert - update or insert)
        existing_result = db.query(UserResult).filter(
            UserResult.user_id == current_user.id,
            UserResult.part_type == 'unscripted'
        ).first()

        transcript = results.get('speech_score', {}).get('transcript', '')
        scores_data = {
            'azure': azure_score,
            'openai': openai_score if openai_score else None,
            'combined': results.get('combined_score', None)
        }

        if existing_result:
            # Update existing result
            existing_result.question_id = question_id
            existing_result.transcript = transcript
            existing_result.azure_result = azure_original
            existing_result.openai_result = openai_enhanced_data.get('evaluation') if openai_enhanced_data else None
            existing_result.scores = scores_data
            existing_result.updated_at = datetime.now()
        else:
            # Create new result
            new_result = UserResult(
                user_id=current_user.id,
                part_type='unscripted',
                question_id=question_id,
                transcript=transcript,
                azure_result=azure_original,
                openai_result=openai_enhanced_data.get('evaluation') if openai_enhanced_data else None,
                scores=scores_data
            )
            db.add(new_result)

        db.commit()
        print(f" Result saved to database for user {current_user.username}")

        # Return merged results (for backward compatibility with frontend)
        response_data = results.copy()
        response_data['audio_data'] = audio_base64

        # Add metadata for reference
        response_data['_metadata'] = {
            'azure_score': azure_score,
            'openai_score': openai_score if openai_score else None,
            'combined_score': results.get('combined_score', None),
            'timestamp': datetime.now().isoformat(),
            'sources': {
                'azure_file': 'unscripted_result.json',
                'openai_file': 'openai_result.json',
                'openai_enhanced_file': 'openai_enhance_result.json',
                'combined_file': 'combined_result.json'
            }
        }

        return response_data

    except Exception as e:
        # Clean up on error
        if os.path.exists(filepath):
            os.remove(filepath)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/evaluate-scripted")
async def evaluate_scripted(
    audio: UploadFile = File(...),
    text: str = Form(...)
):
    """Endpoint to evaluate scripted audio (reading a given text)"""

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
            content = await audio.read()
            buffer.write(content)

        client = AzureSpeechAPI()

        results = client.score_text(
            audio_file_path=filepath,
            text=text.strip()
        )

        # Save results to JSON file (overwrite)
        result_filepath = os.path.join(RESULTS_FOLDER, 'scripted_result.json')
        with open(result_filepath, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2, ensure_ascii=False)

        # Add audio data
        with open(filepath, 'rb') as audio_file:
            audio_data = base64.b64encode(audio_file.read()).decode('utf-8')
            ext = filename.rsplit('.', 1)[1].lower()
            mime_types = {
                'wav': 'audio/wav',
                'mp3': 'audio/mpeg',
                'm4a': 'audio/mp4',
                'webm': 'audio/webm',
                'ogg': 'audio/ogg',
                'aiff': 'audio/aiff'
            }
            mime_type = mime_types.get(ext, 'audio/wav')
            results['audio_data'] = f"data:{mime_type};base64,{audio_data}"

        os.remove(filepath)

        return results

    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/evaluate-conversation")
async def evaluate_conversation(
    audio: UploadFile = File(...),
    texts: str = Form(...),  # JSON array of texts the user spoke
    conversation_id: Optional[int] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Endpoint to evaluate conversation roleplay audio (combined audio with multiple texts)"""

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

    # Combine all texts into one expected text
    combined_text = " ".join(texts_list)

    filename = audio.filename.replace(" ", "_")
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    wav_filepath = None

    try:
        with open(filepath, "wb") as buffer:
            content = await audio.read()
            buffer.write(content)

        # Convert to WAV for Azure compatibility
        wav_filepath = convert_to_wav(filepath)

        client = AzureSpeechAPI()

        # Use score_text for scripted evaluation with combined text
        results = client.score_text(
            audio_file_path=wav_filepath,
            text=combined_text.strip()
        )

        # Save results to JSON file
        result_filepath = os.path.join(RESULTS_FOLDER, 'scripted_result.json')
        with open(result_filepath, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2, ensure_ascii=False)

        # Add audio data
        with open(filepath, 'rb') as audio_file:
            audio_data = base64.b64encode(audio_file.read()).decode('utf-8')
            ext = filename.rsplit('.', 1)[1].lower()
            mime_types = {
                'wav': 'audio/wav',
                'mp3': 'audio/mpeg',
                'm4a': 'audio/mp4',
                'webm': 'audio/webm',
                'ogg': 'audio/ogg',
                'aiff': 'audio/aiff'
            }
            mime_type = mime_types.get(ext, 'audio/wav')
            results['audio_data'] = f"data:{mime_type};base64,{audio_data}"

        # Add metadata about the individual texts
        results['conversation_texts'] = texts_list

        # Clean up files
        if os.path.exists(filepath):
            os.remove(filepath)
        if wav_filepath and wav_filepath != filepath and os.path.exists(wav_filepath):
            os.remove(wav_filepath)

        # Save result to database (upsert - update or insert)
        existing_result = db.query(UserResult).filter(
            UserResult.user_id == current_user.id,
            UserResult.part_type == 'conversation'
        ).first()

        transcript = results.get('speech_score', {}).get('transcript', '')
        azure_scores = results.get('speech_score', {}).get('azure_scores', {})
        scores_data = {
            'azure_accuracy': azure_scores.get('accuracy', 0),
            'azure_fluency': azure_scores.get('fluency', 0),
            'azure_prosody': azure_scores.get('prosody', 0)
        }

        if existing_result:
            # Update existing result
            existing_result.conversation_id = conversation_id
            existing_result.transcript = transcript
            existing_result.azure_result = results
            existing_result.scores = scores_data
            existing_result.updated_at = datetime.now()
        else:
            # Create new result
            new_result = UserResult(
                user_id=current_user.id,
                part_type='conversation',
                conversation_id=conversation_id,
                transcript=transcript,
                azure_result=results,
                scores=scores_data
            )
            db.add(new_result)

        db.commit()
        print(f" Conversation result saved to database for user {current_user.username}")

        return results

    except Exception as e:
        # Clean up on error
        if os.path.exists(filepath):
            os.remove(filepath)
        if wav_filepath and wav_filepath != filepath and os.path.exists(wav_filepath):
            os.remove(wav_filepath)
        raise HTTPException(status_code=500, detail=str(e))


# Serve frontend static files (for production)
FRONTEND_DIST = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'frontend', 'dist')
if os.path.exists(FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        """Serve frontend for all non-API routes"""
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API endpoint not found")

        file_path = os.path.join(FRONTEND_DIST, full_path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)

        # Serve index.html for all other routes (SPA routing)
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))


if __name__ == '__main__':
    import uvicorn
    print("Backend server starting on http://localhost:5000")
    uvicorn.run(app, host="0.0.0.0", port=5000)
