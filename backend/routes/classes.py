"""Class management routes"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import User, Class, ClassTeacher, ClassStudent, Assignment
from schemas import ClassCreate, ClassUpdate, ClassStudentAdd, ClassTeacherAdd
from auth import get_current_user
from dependencies import require_admin, require_admin_or_teacher

router = APIRouter(prefix="/api/classes", tags=["Classes"])


def is_class_teacher(db: Session, class_id: int, user_id: int) -> bool:
    """Check if user is a teacher of the class"""
    return db.query(ClassTeacher).filter(
        ClassTeacher.class_id == class_id,
        ClassTeacher.teacher_id == user_id
    ).first() is not None


def get_class_teachers(db: Session, class_id: int) -> list:
    """Get list of teachers for a class"""
    assignments = db.query(ClassTeacher).filter(ClassTeacher.class_id == class_id).all()
    return [
        {
            "id": a.id,
            "teacher_id": a.teacher.id,
            "username": a.teacher.username,
            "email": a.teacher.email
        }
        for a in assignments
    ]


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
        # Teacher sees classes they teach
        teacher_assignments = db.query(ClassTeacher).filter(ClassTeacher.teacher_id == current_user.id).all()
        class_ids = [a.class_id for a in teacher_assignments]
        classes = db.query(Class).filter(Class.id.in_(class_ids)).all() if class_ids else []
    else:
        # Student sees their enrolled classes
        enrollments = db.query(ClassStudent).filter(ClassStudent.student_id == current_user.id).all()
        class_ids = [e.class_id for e in enrollments]
        classes = db.query(Class).filter(Class.id.in_(class_ids)).all() if class_ids else []

    result = []
    for c in classes:
        student_count = db.query(ClassStudent).filter(ClassStudent.class_id == c.id).count()
        teachers = get_class_teachers(db, c.id)
        result.append({
            "id": c.id,
            "name": c.name,
            "description": c.description,
            "teachers": teachers,
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

    # Check access (admin can access all classes)
    if current_user.role == 'student':
        enrollment = db.query(ClassStudent).filter(
            ClassStudent.class_id == class_id,
            ClassStudent.student_id == current_user.id
        ).first()
        if not enrollment:
            raise HTTPException(status_code=403, detail="Not enrolled in this class")
    elif current_user.role == 'teacher' and not is_class_teacher(db, class_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not your class")
    # Admin role has access to all classes (no restriction needed)

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
        "teachers": get_class_teachers(db, class_id),
        "students": students,
        "created_at": class_.created_at.isoformat() if class_.created_at else None
    }


@router.post("")
async def create_class(
    class_data: ClassCreate,
    user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db)
):
    """Create a new class (admin or teacher)"""
    # Verify all teachers exist
    for teacher_id in class_data.teacher_ids:
        teacher = db.query(User).filter(User.id == teacher_id, User.role == 'teacher').first()
        if not teacher:
            raise HTTPException(status_code=400, detail=f"Teacher with id {teacher_id} not found")

    # Teachers can only create classes with themselves as a teacher
    if user.role == 'teacher' and user.id not in class_data.teacher_ids:
        raise HTTPException(status_code=403, detail="Teachers must include themselves when creating a class")

    new_class = Class(
        name=class_data.name,
        description=class_data.description
    )
    db.add(new_class)
    db.flush()

    # Add teachers to class
    for teacher_id in class_data.teacher_ids:
        teacher_assignment = ClassTeacher(class_id=new_class.id, teacher_id=teacher_id)
        db.add(teacher_assignment)

    db.commit()
    db.refresh(new_class)

    return {"message": "Class created", "id": new_class.id}


@router.put("/{class_id}")
async def update_class(
    class_id: int,
    class_data: ClassUpdate,
    user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db)
):
    """Update a class (admin or class teacher)"""
    class_ = db.query(Class).filter(Class.id == class_id).first()
    if not class_:
        raise HTTPException(status_code=404, detail="Class not found")

    # Teachers can only update their own classes
    if user.role == 'teacher' and not is_class_teacher(db, class_id, user.id):
        raise HTTPException(status_code=403, detail="Not your class")

    if class_data.name is not None:
        class_.name = class_data.name
    if class_data.description is not None:
        class_.description = class_data.description

    # Only admin can change teachers
    if class_data.teacher_ids is not None and user.role == 'admin':
        # Verify all teachers exist
        for teacher_id in class_data.teacher_ids:
            teacher = db.query(User).filter(User.id == teacher_id, User.role == 'teacher').first()
            if not teacher:
                raise HTTPException(status_code=400, detail=f"Teacher with id {teacher_id} not found")

        # Remove existing teachers and add new ones
        db.query(ClassTeacher).filter(ClassTeacher.class_id == class_id).delete()
        for teacher_id in class_data.teacher_ids:
            teacher_assignment = ClassTeacher(class_id=class_id, teacher_id=teacher_id)
            db.add(teacher_assignment)

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

    # Delete enrollments, teachers, and assignments first
    db.query(ClassStudent).filter(ClassStudent.class_id == class_id).delete()
    db.query(ClassTeacher).filter(ClassTeacher.class_id == class_id).delete()
    db.query(Assignment).filter(Assignment.class_id == class_id).delete()
    db.delete(class_)
    db.commit()
    return {"message": "Class deleted"}


@router.post("/{class_id}/teachers")
async def add_teacher_to_class(
    class_id: int,
    teacher_data: ClassTeacherAdd,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Add a teacher to a class (admin only)"""
    class_ = db.query(Class).filter(Class.id == class_id).first()
    if not class_:
        raise HTTPException(status_code=404, detail="Class not found")

    # Verify teacher exists
    teacher = db.query(User).filter(User.id == teacher_data.teacher_id, User.role == 'teacher').first()
    if not teacher:
        raise HTTPException(status_code=400, detail="Teacher not found")

    # Check if already assigned
    existing = db.query(ClassTeacher).filter(
        ClassTeacher.class_id == class_id,
        ClassTeacher.teacher_id == teacher_data.teacher_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Teacher already assigned to this class")

    assignment = ClassTeacher(class_id=class_id, teacher_id=teacher_data.teacher_id)
    db.add(assignment)
    db.commit()
    return {"message": "Teacher added to class"}


@router.delete("/{class_id}/teachers/{teacher_id}")
async def remove_teacher_from_class(
    class_id: int,
    teacher_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Remove a teacher from a class (admin only)"""
    class_ = db.query(Class).filter(Class.id == class_id).first()
    if not class_:
        raise HTTPException(status_code=404, detail="Class not found")

    assignment = db.query(ClassTeacher).filter(
        ClassTeacher.class_id == class_id,
        ClassTeacher.teacher_id == teacher_id
    ).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Teacher not assigned to this class")

    # Ensure at least one teacher remains
    teacher_count = db.query(ClassTeacher).filter(ClassTeacher.class_id == class_id).count()
    if teacher_count <= 1:
        raise HTTPException(status_code=400, detail="Cannot remove the last teacher from a class")

    db.delete(assignment)
    db.commit()
    return {"message": "Teacher removed from class"}


@router.post("/{class_id}/students")
async def add_student_to_class(
    class_id: int,
    student_data: ClassStudentAdd,
    user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db)
):
    """Add a student to a class (admin or class teacher)"""
    class_ = db.query(Class).filter(Class.id == class_id).first()
    if not class_:
        raise HTTPException(status_code=404, detail="Class not found")

    # Teachers can only modify their own classes
    if user.role == 'teacher' and not is_class_teacher(db, class_id, user.id):
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
    user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db)
):
    """Remove a student from a class (admin or class teacher)"""
    class_ = db.query(Class).filter(Class.id == class_id).first()
    if not class_:
        raise HTTPException(status_code=404, detail="Class not found")

    # Teachers can only modify their own classes
    if user.role == 'teacher' and not is_class_teacher(db, class_id, user.id):
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
