"""Teacher-only routes"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import User, UserResult
from dependencies import require_teacher

router = APIRouter(prefix="/api/teacher", tags=["Teacher"])


@router.get("/students")
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


@router.get("/students/{student_id}/results")
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
