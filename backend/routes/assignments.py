"""Assignment routes"""
import os
import json
import base64
import uuid
import shutil
import time as time_module
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from database import get_db
from models import User, Class, ClassTeacher, ClassStudent, Assignment, AssignmentResult
from schemas import AssignmentCreate, AssignmentUpdate
from auth import get_current_user
from dependencies import require_teacher
from utils.audio import allowed_file, AUDIO_FOLDER, get_mime_type, _get_safe_temp_path
from utils.scoring import calculate_azure_score
from utils.assessment_logger import log_assessment
from azure_api import AzureSpeechAPI
from openai_evaluator import OpenAIEvaluator


def is_class_teacher(db: Session, class_id: int, user_id: int) -> bool:
    """Check if user is a teacher of the class"""
    return db.query(ClassTeacher).filter(
        ClassTeacher.class_id == class_id,
        ClassTeacher.teacher_id == user_id
    ).first() is not None


def is_past_deadline(deadline) -> bool:
    """Check if deadline has passed"""
    if not deadline:
        return False
    now = datetime.now(timezone.utc)
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    return now > deadline


def _run_azure(client, wav_path, transcript):
    """Run Azure pronunciation assessment"""
    # Azure already has internal timing prints
    return client.assess_pronunciation_only(wav_path, transcript)

def _run_openai(transcript, question):
    """Run OpenAI content evaluation"""
    start = time_module.time()
    print(f"[OPENAI-GPT] Starting content evaluation... (t={start:.2f})", flush=True)
    result = OpenAIEvaluator().evaluate_chunked_parallel(transcript=transcript, question=question)
    elapsed = time_module.time() - start
    print(f"[OPENAI-GPT] Completed ALL content evaluation in {elapsed:.2f}s", flush=True)
    return result

router = APIRouter(tags=["Assignments"])


@router.get("/api/classes/{class_id}/assignments")
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
    elif current_user.role == 'teacher' and not is_class_teacher(db, class_id, current_user.id):
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
            "deadline": a.deadline.isoformat() if a.deadline else None,
            "is_past_deadline": is_past_deadline(a.deadline),
            "created_by": a.created_by,
            "creator_name": a.creator.username if a.creator else None,
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "is_completed": is_completed,
            "result": assignment_result,
            "submissions_count": submissions_count
        })

    return {"assignments": result}


@router.get("/api/assignments")
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
        teacher_assignments = db.query(ClassTeacher).filter(ClassTeacher.teacher_id == current_user.id).all()
        class_ids = [a.class_id for a in teacher_assignments]
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
            "deadline": a.deadline.isoformat() if a.deadline else None,
            "is_past_deadline": is_past_deadline(a.deadline),
            "created_by": a.created_by,
            "creator_name": a.creator.username if a.creator else None,
            "created_at": a.created_at.isoformat() if a.created_at else None
        })

    return {"assignments": result}


@router.post("/api/assignments")
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
    if teacher.role == 'teacher' and not is_class_teacher(db, assignment_data.class_id, teacher.id):
        raise HTTPException(status_code=403, detail="Not your class")

    assignment = Assignment(
        class_id=assignment_data.class_id,
        topic=assignment_data.topic,
        question_text=assignment_data.question_text,
        requirements=assignment_data.requirements,
        instructions=assignment_data.instructions,
        deadline=assignment_data.deadline,
        created_by=teacher.id
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)

    return {"message": "Assignment created", "id": assignment.id}


@router.put("/api/assignments/{assignment_id}")
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
    if teacher.role == 'teacher' and not is_class_teacher(db, assignment.class_id, teacher.id):
        raise HTTPException(status_code=403, detail="Not your class")

    if assignment_data.topic is not None:
        assignment.topic = assignment_data.topic
    if assignment_data.question_text is not None:
        assignment.question_text = assignment_data.question_text
    if assignment_data.requirements is not None:
        assignment.requirements = assignment_data.requirements
    if assignment_data.instructions is not None:
        assignment.instructions = assignment_data.instructions
    if assignment_data.deadline is not None:
        assignment.deadline = assignment_data.deadline

    db.commit()
    return {"message": "Assignment updated"}


@router.delete("/api/assignments/{assignment_id}")
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
    if teacher.role == 'teacher' and not is_class_teacher(db, assignment.class_id, teacher.id):
        raise HTTPException(status_code=403, detail="Not your class")

    # Delete related results first
    db.query(AssignmentResult).filter(AssignmentResult.assignment_id == assignment_id).delete()
    db.delete(assignment)
    db.commit()
    return {"message": "Assignment deleted"}


@router.get("/api/assignments/{assignment_id}")
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
    elif current_user.role == 'teacher' and not is_class_teacher(db, assignment.class_id, current_user.id):
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
        "deadline": assignment.deadline.isoformat() if assignment.deadline else None,
        "is_past_deadline": is_past_deadline(assignment.deadline),
        "created_by": assignment.created_by,
        "creator_name": assignment.creator.username if assignment.creator else None,
        "created_at": assignment.created_at.isoformat() if assignment.created_at else None,
        "is_completed": is_completed,
        "result": assignment_result
    }


@router.post("/api/assignments/{assignment_id}/submit")
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

    # Check deadline
    if is_past_deadline(assignment.deadline):
        raise HTTPException(status_code=400, detail="Submission deadline has passed")

    # Validate file
    if not audio.filename:
        raise HTTPException(status_code=400, detail="No file selected")

    if not allowed_file(audio.filename):
        raise HTTPException(status_code=400, detail="Invalid file type")

    # Get original extension
    original_ext = os.path.splitext(audio.filename)[1].lower() or '.wav'

    # Save to safe path (ASCII only) for Azure SDK compatibility
    filepath = _get_safe_temp_path(original_ext)

    try:
        content = await audio.read()
        with open(filepath, "wb") as buffer:
            buffer.write(content)

        # Step 1: Prepare audio and get transcript (Whisper)
        client = AzureSpeechAPI()
        wav_path, needs_cleanup = client.prepare_audio(filepath)
        transcript = client.transcribe_only(wav_path)

        # Step 2: Run Azure and OpenAI in PARALLEL
        azure_result = None
        openai_eval = None

        if transcript:
            with ThreadPoolExecutor(max_workers=2) as executor:
                azure_future = executor.submit(_run_azure, client, wav_path, transcript)
                openai_future = executor.submit(_run_openai, transcript, assignment.question_text)

                azure_result = azure_future.result()
                openai_eval = openai_future.result()

        if needs_cleanup and os.path.exists(wav_path):
            try:
                os.remove(wav_path)
            except Exception:
                pass

        # Step 3: Combine results with actual Azure bands
        azure_score = calculate_azure_score(azure_result) if azure_result else {}
        pronunciation_band = azure_score.get('pronunciation_band', 5.0)
        fluency_band = azure_score.get('fluency_band', 5.0)

        openai_result = openai_eval.get('openai_result', {}) if openai_eval else {}
        combined_result = None

        if openai_eval:
            openai_client = OpenAIEvaluator()
            combined_result = openai_client._calculate_combined_result(
                openai_result, pronunciation_band, fluency_band
            )
            try:
                improved = openai_client._generate_improved_answer(transcript, assignment.question_text, openai_result)
                openai_result['improved_answer'] = improved
            except Exception:
                pass

        scores_data = {
            'unscripted_result': azure_score,
            'openai_result': openai_result,
            'combined_result': combined_result
        }

        # Read audio for response
        with open(filepath, 'rb') as audio_file:
            audio_data = base64.b64encode(audio_file.read()).decode('utf-8')
            audio_base64 = f"data:{get_mime_type(filename)};base64,{audio_data}"

        db_transcript = azure_result.get('speech_score', {}).get('transcript', '') if azure_result else transcript

        # Save audio file permanently
        ext = filename.rsplit('.', 1)[1].lower()
        audio_filename = f"{assignment_id}_{current_user.id}_{uuid.uuid4().hex[:8]}.{ext}"
        shutil.move(filepath, os.path.join(AUDIO_FOLDER, audio_filename))

        # Save to database
        assignment_result = AssignmentResult(
            assignment_id=assignment_id,
            student_id=current_user.id,
            transcript=db_transcript,
            audio_filename=audio_filename,
            azure_result=azure_result,
            openai_result=openai_result,
            scores=scores_data
        )
        db.add(assignment_result)
        db.commit()
        db.refresh(assignment_result)

        # Log assessment to file
        log_assessment(
            user_id=current_user.id,
            username=current_user.username,
            assessment_type='assignment',
            question=assignment.question_text,
            transcript=db_transcript,
            azure_result=azure_result,
            openai_result=openai_result,
            combined_result=combined_result,
            scores=scores_data,
            extra_data={'assignment_id': assignment_id, 'assignment_title': assignment.title}
        )

        return {
            'speech_score': azure_result.get('speech_score', {}) if azure_result else {},
            'unscripted_result': azure_result,
            'openai_result': openai_result,
            'combined_result': combined_result,
            'audio_data': audio_base64,
            'assignment_result_id': assignment_result.id,
            'scores_summary': scores_data
        }

    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/assignments/{assignment_id}/result")
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


@router.get("/api/assignments/{assignment_id}/submissions")
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

    # Verify teacher owns the class
    class_ = db.query(Class).filter(Class.id == assignment.class_id).first()
    if current_user.role == 'teacher' and not is_class_teacher(db, assignment.class_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not your class")

    # Get all students in the class
    enrolled_students = db.query(ClassStudent, User).join(
        User, ClassStudent.student_id == User.id
    ).filter(ClassStudent.class_id == assignment.class_id).all()

    # Get all submissions
    submissions = db.query(AssignmentResult).filter(
        AssignmentResult.assignment_id == assignment_id
    ).all()

    submission_map = {s.student_id: s for s in submissions}

    # Build response
    student_submissions = []
    for enrollment, student in enrolled_students:
        submission = submission_map.get(student.id)
        if submission:
            review_status = "reviewed" if submission.teacher_feedback or getattr(submission, 'teacher_scores', None) else "waiting_for_teacher"
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
        "deadline": assignment.deadline.isoformat() if assignment.deadline else None,
        "is_past_deadline": is_past_deadline(assignment.deadline),
        "created_at": assignment.created_at.isoformat() if assignment.created_at else None,
        "total_students": len(enrolled_students),
        "submitted_count": len(submissions),
        "submissions": student_submissions
    }


@router.post("/api/assignments/{assignment_id}/submissions/{submission_id}/feedback")
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

    # Verify teacher owns the class
    if current_user.role == 'teacher' and not is_class_teacher(db, assignment.class_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not your class")

    submission = db.query(AssignmentResult).filter(
        AssignmentResult.id == submission_id,
        AssignmentResult.assignment_id == assignment_id
    ).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    feedback_text = feedback_data.get('feedback', '').strip()
    teacher_scores = feedback_data.get('teacher_scores', None)

    if not feedback_text and not teacher_scores:
        raise HTTPException(status_code=400, detail="Feedback text or scores are required")

    if feedback_text:
        submission.teacher_feedback = feedback_text
    if teacher_scores:
        try:
            submission.teacher_scores = teacher_scores
        except AttributeError:
            pass
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


@router.get("/api/audio/{filename}")
async def get_audio_file(
    filename: str,
    current_user: User = Depends(get_current_user)
):
    """Serve audio files for assignment submissions"""
    filepath = os.path.join(AUDIO_FOLDER, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Audio file not found")

    mime_type = get_mime_type(filename)
    return FileResponse(filepath, media_type=mime_type)
