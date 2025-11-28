from pydantic import BaseModel, EmailStr
from typing import Optional, List, Any
from datetime import datetime


# Auth schemas
class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    role: str = 'student'  # 'student' or 'teacher'


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    role: str
    created_at: datetime

    class Config:
        from_attributes = True


class StudentResultResponse(BaseModel):
    student_id: int
    username: str
    email: str
    part_type: str
    transcript: Optional[str]
    scores: Optional[dict]
    updated_at: Optional[datetime]


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    user_id: Optional[int] = None


# Question schemas
class QuestionResponse(BaseModel):
    id: int
    topic: str
    question: str

    class Config:
        from_attributes = True


# Conversation schemas
class ConversationLineResponse(BaseModel):
    id: str
    role: str
    line: str


class ConversationResponse(BaseModel):
    id: int
    topic: str
    dialogue: dict

    class Config:
        from_attributes = True


# Result schemas
class UserResultResponse(BaseModel):
    id: int
    part_type: str
    conversation_id: Optional[int]
    question_id: Optional[int]
    transcript: Optional[str]
    azure_result: Optional[dict]
    openai_result: Optional[dict]
    scores: Optional[dict]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Class schemas
class ClassCreate(BaseModel):
    name: str
    description: Optional[str] = None
    teacher_id: int


class ClassUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    teacher_id: Optional[int] = None


class ClassStudentAdd(BaseModel):
    student_id: int


class ClassStudentResponse(BaseModel):
    id: int
    student_id: int
    username: str
    email: str
    enrolled_at: datetime


class ClassResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    teacher_id: int
    teacher_name: Optional[str] = None
    student_count: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


class ClassDetailResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    teacher_id: int
    teacher_name: Optional[str] = None
    students: List[ClassStudentResponse] = []
    created_at: datetime

    class Config:
        from_attributes = True


# Assignment schemas
class AssignmentCreate(BaseModel):
    class_id: int
    topic: str
    question_text: str
    requirements: Optional[str] = None
    instructions: Optional[str] = None


class AssignmentUpdate(BaseModel):
    topic: Optional[str] = None
    question_text: Optional[str] = None
    requirements: Optional[str] = None
    instructions: Optional[str] = None


class AssignmentResponse(BaseModel):
    id: int
    class_id: int
    class_name: Optional[str] = None
    topic: str
    question_text: str
    requirements: Optional[str]
    instructions: Optional[str]
    created_by: int
    creator_name: Optional[str] = None
    created_at: datetime
    is_completed: bool = False
    result: Optional[dict] = None

    class Config:
        from_attributes = True


# Assignment Result schemas
class AssignmentResultResponse(BaseModel):
    id: int
    assignment_id: int
    student_id: int
    transcript: Optional[str]
    azure_result: Optional[dict]
    openai_result: Optional[dict]
    scores: Optional[dict]
    submitted_at: datetime
    teacher_feedback: Optional[str] = None
    feedback_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Teacher feedback schema
class TeacherFeedbackCreate(BaseModel):
    feedback: str


# Student submission for teacher view
class StudentSubmissionResponse(BaseModel):
    id: int
    student_id: int
    student_name: str
    student_email: str
    transcript: Optional[str]
    scores: Optional[dict]
    submitted_at: datetime
    teacher_feedback: Optional[str] = None
    feedback_at: Optional[datetime] = None


# Assignment with submissions for teacher
class AssignmentWithSubmissionsResponse(BaseModel):
    id: int
    class_id: int
    class_name: str
    topic: str
    question_text: str
    requirements: Optional[str]
    instructions: Optional[str]
    created_at: datetime
    total_students: int
    submitted_count: int
    submissions: List[StudentSubmissionResponse] = []
