"""Progress Dashboard routes for tracking user evaluation history"""
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from database import get_db
from models import User, UserResult, AssignmentResult, Assignment, Class, ClassStudent, ClassTeacher
from auth import get_current_user
from dependencies import require_teacher, require_admin

router = APIRouter(prefix="/api/progress", tags=["Progress"])


def extract_scores(scores_data: dict) -> dict:
    """Extract normalized scores from various score formats"""
    if not scores_data:
        return {}

    combined = scores_data.get('combined_result', {})
    openai = scores_data.get('openai_result', {})
    unscripted = scores_data.get('unscripted_result', {})

    return {
        'overall_band': combined.get('overall_band'),
        'pronunciation': combined.get('pronunciation') or unscripted.get('pronunciation_band'),
        'fluency': combined.get('fluency') or unscripted.get('fluency_band'),
        'coherence': combined.get('coherence') or (openai.get('coherence', {}).get('band') if isinstance(openai.get('coherence'), dict) else None),
        'lexical_resource': combined.get('lexical_resource') or (openai.get('lexical_resource', {}).get('band') if isinstance(openai.get('lexical_resource'), dict) else None),
        'grammatical_range_accuracy': combined.get('grammatical_range_accuracy') or (openai.get('grammar', {}).get('band') if isinstance(openai.get('grammar'), dict) else None),
        'understanding': combined.get('understanding') or (openai.get('understanding', {}).get('band') if isinstance(openai.get('understanding'), dict) else None)
    }


@router.get("/student")
async def get_student_progress(
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current user's progress over time (works for any role viewing their own data)"""

    # Build date filters for practice results
    filters = [UserResult.user_id == current_user.id]
    if start_date:
        try:
            filters.append(UserResult.created_at >= datetime.fromisoformat(start_date))
        except ValueError:
            pass
    if end_date:
        try:
            filters.append(UserResult.created_at <= datetime.fromisoformat(end_date) + timedelta(days=1))
        except ValueError:
            pass

    # Get practice results
    practice_query = db.query(UserResult).filter(*filters).order_by(desc(UserResult.created_at))
    total_practice = practice_query.count()
    practice_results = practice_query.offset(offset).limit(limit).all()

    # Get assignment results
    assignment_filters = [AssignmentResult.student_id == current_user.id]
    if start_date:
        try:
            assignment_filters.append(AssignmentResult.submitted_at >= datetime.fromisoformat(start_date))
        except ValueError:
            pass
    if end_date:
        try:
            assignment_filters.append(AssignmentResult.submitted_at <= datetime.fromisoformat(end_date) + timedelta(days=1))
        except ValueError:
            pass

    assignment_query = db.query(AssignmentResult).filter(*assignment_filters).order_by(desc(AssignmentResult.submitted_at))
    total_assignments = assignment_query.count()
    assignment_results = assignment_query.all()

    # Combine and format results
    all_results = []

    for r in practice_results:
        scores = extract_scores(r.scores)
        all_results.append({
            "id": r.id,
            "type": "practice",
            "part_type": r.part_type,
            "date": r.created_at.isoformat() if r.created_at else None,
            "scores": scores
        })

    for r in assignment_results:
        scores = extract_scores(r.scores)
        all_results.append({
            "id": r.id,
            "type": "assignment",
            "assignment_id": r.assignment_id,
            "date": r.submitted_at.isoformat() if r.submitted_at else None,
            "scores": scores,
            "teacher_scores": r.teacher_scores,
            "has_feedback": bool(r.teacher_feedback or r.teacher_scores)
        })

    # Sort by date (newest first)
    all_results.sort(key=lambda x: x['date'] or '', reverse=True)

    # Calculate averages
    score_lists = {
        "overall_band": [], "pronunciation": [], "fluency": [],
        "coherence": [], "lexical_resource": [],
        "grammatical_range_accuracy": [], "understanding": []
    }

    for r in all_results:
        for key in score_lists:
            value = r['scores'].get(key)
            if value is not None:
                score_lists[key].append(value)

    averages = {k: round(sum(v)/len(v), 1) if v else None for k, v in score_lists.items()}

    return {
        "results": all_results,
        "total_practice": total_practice,
        "total_assignments": total_assignments,
        "averages": averages,
        "pagination": {"limit": limit, "offset": offset}
    }


@router.get("/teacher/class/{class_id}")
async def get_class_progress(
    class_id: int,
    teacher: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    """Get progress summary for all students in a class (teacher only)"""

    # Verify teacher owns class (admins can see all)
    if teacher.role == 'teacher':
        is_teacher = db.query(ClassTeacher).filter(
            ClassTeacher.class_id == class_id,
            ClassTeacher.teacher_id == teacher.id
        ).first()
        if not is_teacher:
            raise HTTPException(status_code=403, detail="Not your class")

    # Get class info
    class_obj = db.query(Class).filter(Class.id == class_id).first()
    if not class_obj:
        raise HTTPException(status_code=404, detail="Class not found")

    # Get all students in class
    enrollments = db.query(ClassStudent, User).join(
        User, ClassStudent.student_id == User.id
    ).filter(ClassStudent.class_id == class_id).all()

    students_progress = []
    for enrollment, student in enrollments:
        # Get assignment results for this student in this class
        results = db.query(AssignmentResult).join(Assignment).filter(
            Assignment.class_id == class_id,
            AssignmentResult.student_id == student.id
        ).order_by(AssignmentResult.submitted_at).all()

        scores_over_time = []
        bands = []
        for r in results:
            scores = extract_scores(r.scores)
            overall = scores.get('overall_band')
            scores_over_time.append({
                "date": r.submitted_at.isoformat() if r.submitted_at else None,
                "assignment_id": r.assignment_id,
                "overall_band": overall,
                "scores": scores
            })
            if overall is not None:
                bands.append(overall)

        avg_band = round(sum(bands) / len(bands), 1) if bands else None

        students_progress.append({
            "student_id": student.id,
            "student_name": student.username,
            "student_email": student.email,
            "submission_count": len(results),
            "average_band": avg_band,
            "scores_over_time": scores_over_time
        })

    # Sort by average band (highest first), None values at end
    students_progress.sort(key=lambda x: (x['average_band'] is None, -(x['average_band'] or 0)))

    return {
        "class_id": class_id,
        "class_name": class_obj.name,
        "students": students_progress,
        "total_students": len(enrollments)
    }


@router.get("/teacher/student/{student_id}")
async def get_student_detail_progress(
    student_id: int,
    teacher: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    """Get detailed progress for a specific student (teacher only)"""

    student = db.query(User).filter(User.id == student_id, User.role == 'student').first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Get all practice results
    practice_results = db.query(UserResult).filter(
        UserResult.user_id == student_id
    ).order_by(desc(UserResult.created_at)).all()

    # Get all assignment results with assignment info
    assignment_results = db.query(AssignmentResult, Assignment).join(
        Assignment
    ).filter(AssignmentResult.student_id == student_id).order_by(
        desc(AssignmentResult.submitted_at)
    ).all()

    results = []

    for r in practice_results:
        scores = extract_scores(r.scores)
        results.append({
            "id": r.id,
            "type": "practice",
            "part_type": r.part_type,
            "date": r.created_at.isoformat() if r.created_at else None,
            "scores": scores
        })

    for ar, assignment in assignment_results:
        scores = extract_scores(ar.scores)
        results.append({
            "id": ar.id,
            "type": "assignment",
            "assignment_id": ar.assignment_id,
            "assignment_topic": assignment.topic,
            "class_id": assignment.class_id,
            "date": ar.submitted_at.isoformat() if ar.submitted_at else None,
            "scores": scores,
            "teacher_scores": ar.teacher_scores,
            "has_feedback": bool(ar.teacher_feedback or ar.teacher_scores)
        })

    # Sort by date
    results.sort(key=lambda x: x['date'] or '', reverse=True)

    # Calculate averages
    score_lists = {
        "overall_band": [], "pronunciation": [], "fluency": [],
        "coherence": [], "lexical_resource": [],
        "grammatical_range_accuracy": [], "understanding": []
    }

    for r in results:
        for key in score_lists:
            value = r['scores'].get(key)
            if value is not None:
                score_lists[key].append(value)

    averages = {k: round(sum(v)/len(v), 1) if v else None for k, v in score_lists.items()}

    return {
        "student": {
            "id": student.id,
            "username": student.username,
            "email": student.email
        },
        "results": results,
        "total_practice": len(practice_results),
        "total_assignments": len(assignment_results),
        "averages": averages
    }


@router.get("/admin/stats")
async def get_admin_stats(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Get system-wide usage statistics (admin only)"""

    # User counts
    total_users = db.query(func.count(User.id)).scalar()
    students = db.query(func.count(User.id)).filter(User.role == 'student').scalar()
    teachers = db.query(func.count(User.id)).filter(User.role == 'teacher').scalar()
    admins = db.query(func.count(User.id)).filter(User.role == 'admin').scalar()

    # Practice session counts
    total_practice = db.query(func.count(UserResult.id)).scalar()

    # Assignment counts
    total_assignments = db.query(func.count(Assignment.id)).scalar()
    total_submissions = db.query(func.count(AssignmentResult.id)).scalar()

    # Class counts
    total_classes = db.query(func.count(Class.id)).scalar()

    # Activity over last 30 days
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)

    daily_practice = db.query(
        func.date(UserResult.created_at).label('date'),
        func.count(UserResult.id).label('count')
    ).filter(
        UserResult.created_at >= thirty_days_ago
    ).group_by(func.date(UserResult.created_at)).order_by(func.date(UserResult.created_at)).all()

    daily_submissions = db.query(
        func.date(AssignmentResult.submitted_at).label('date'),
        func.count(AssignmentResult.id).label('count')
    ).filter(
        AssignmentResult.submitted_at >= thirty_days_ago
    ).group_by(func.date(AssignmentResult.submitted_at)).order_by(func.date(AssignmentResult.submitted_at)).all()

    # Calculate average scores across all users
    all_scores = db.query(UserResult.scores).filter(UserResult.scores.isnot(None)).limit(1000).all()

    overall_bands = []
    for (scores,) in all_scores:
        if scores:
            extracted = extract_scores(scores)
            if extracted.get('overall_band'):
                overall_bands.append(extracted['overall_band'])

    avg_overall_band = round(sum(overall_bands) / len(overall_bands), 1) if overall_bands else None

    return {
        "users": {
            "total": total_users,
            "students": students,
            "teachers": teachers,
            "admins": admins
        },
        "activity": {
            "total_practice_sessions": total_practice,
            "total_assignments": total_assignments,
            "total_submissions": total_submissions,
            "total_classes": total_classes
        },
        "average_overall_band": avg_overall_band,
        "daily_activity": {
            "practice": [{"date": str(d.date), "count": d.count} for d in daily_practice],
            "submissions": [{"date": str(d.date), "count": d.count} for d in daily_submissions]
        }
    }
