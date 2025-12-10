from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(100), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default='student')  # 'student', 'teacher', or 'admin'
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    results = relationship("UserResult", back_populates="user")
    teaching_assignments = relationship("ClassTeacher", back_populates="teacher")
    class_enrollments = relationship("ClassStudent", back_populates="student")


class Topic(Base):
    __tablename__ = "topics"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)

    questions = relationship("Question", back_populates="topic")


class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    topic_id = Column(Integer, ForeignKey("topics.id"))
    question_text = Column(Text, nullable=False)

    topic = relationship("Topic", back_populates="questions")


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    topic = Column(String(200), nullable=False)

    lines = relationship("ConversationLine", back_populates="conversation", order_by="ConversationLine.line_order")


class ConversationLine(Base):
    __tablename__ = "conversation_lines"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"))
    line_order = Column(Integer, nullable=False)
    role = Column(String(10), nullable=False)  # 'me' or 'you'
    line_text = Column(Text, nullable=False)

    conversation = relationship("Conversation", back_populates="lines")


class UserResult(Base):
    __tablename__ = "user_results"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    part_type = Column(String(20), nullable=False)  # 'conversation' or 'unscripted'
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=True)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=True)
    transcript = Column(Text)
    azure_result = Column(JSONB)
    openai_result = Column(JSONB)
    scores = Column(JSONB)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="results")

    __table_args__ = (
        UniqueConstraint('user_id', 'part_type', name='uq_user_part_type'),
    )


class Class(Base):
    __tablename__ = "classes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    teachers = relationship("ClassTeacher", back_populates="class_")
    students = relationship("ClassStudent", back_populates="class_")
    assignments = relationship("Assignment", back_populates="class_")


class ClassTeacher(Base):
    __tablename__ = "class_teachers"

    id = Column(Integer, primary_key=True, index=True)
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=False)
    teacher_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_at = Column(DateTime(timezone=True), server_default=func.now())

    class_ = relationship("Class", back_populates="teachers")
    teacher = relationship("User", back_populates="teaching_assignments")

    __table_args__ = (
        UniqueConstraint('class_id', 'teacher_id', name='uq_class_teacher'),
    )


class ClassStudent(Base):
    __tablename__ = "class_students"

    id = Column(Integer, primary_key=True, index=True)
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=False)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    enrolled_at = Column(DateTime(timezone=True), server_default=func.now())

    class_ = relationship("Class", back_populates="students")
    student = relationship("User", back_populates="class_enrollments")

    __table_args__ = (
        UniqueConstraint('class_id', 'student_id', name='uq_class_student'),
    )


class Assignment(Base):
    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True, index=True)
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=False)
    topic = Column(String(200), nullable=False)
    question_text = Column(Text, nullable=False)
    requirements = Column(Text, nullable=True)
    instructions = Column(Text, nullable=True)
    deadline = Column(DateTime(timezone=True), nullable=True)  # Submission deadline
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    class_ = relationship("Class", back_populates="assignments")
    creator = relationship("User")
    results = relationship("AssignmentResult", back_populates="assignment")


class AssignmentResult(Base):
    __tablename__ = "assignment_results"

    id = Column(Integer, primary_key=True, index=True)
    assignment_id = Column(Integer, ForeignKey("assignments.id"), nullable=False)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    transcript = Column(Text)
    audio_filename = Column(String(255), nullable=True)
    azure_result = Column(JSONB)
    openai_result = Column(JSONB)
    scores = Column(JSONB)  # AI scores
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())
    teacher_feedback = Column(Text, nullable=True)
    teacher_scores = Column(JSONB, nullable=True)  # Teacher's manual scores
    feedback_at = Column(DateTime(timezone=True), nullable=True)

    assignment = relationship("Assignment", back_populates="results")
    student = relationship("User")

    __table_args__ = (
        UniqueConstraint('assignment_id', 'student_id', name='uq_assignment_student'),
    )
