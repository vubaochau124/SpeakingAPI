"""Class management routes"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import User, Class, ClassStudent, Assignment
from schemas import ClassCreate, ClassUpdate, ClassStudentAdd
from auth import get_current_user
from dependencies import require_admin, require_admin_or_teacher

router = APIRouter(prefix="/api/classes", tags=["Classes"])


@router.get("")
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


@router.get("/{class_id}")
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


@router.post("")
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


@router.put("/{class_id}")
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


@router.delete("/{class_id}")
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


@router.post("/{class_id}/students")
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


@router.delete("/{class_id}/students/{student_id}")
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
