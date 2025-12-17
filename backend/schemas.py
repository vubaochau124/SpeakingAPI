from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List, Any
from datetime import datetime


# Auth schemas
class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    role: str = 'student'  # 'student' or 'teacher'

    @field_validator('username')
    @classmethod
    def username_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError('Username cannot be empty')
        if len(v.strip()) < 2:
            raise ValueError('Username must be at least 2 characters')
        if len(v.strip()) > 50:
            raise ValueError('Username must be at most 50 characters')
        return v.strip()

    @field_validator('password')
    @classmethod
    def password_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError('Password cannot be empty')
        if len(v) < 6:
            raise ValueError('Password must be at least 6 characters')
        return v


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
    teacher_ids: List[int]  # Multiple teachers


class ClassUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    teacher_ids: Optional[List[int]] = None  # Update teachers list


class ClassTeacherAdd(BaseModel):
    teacher_id: int


class ClassStudentAdd(BaseModel):
    student_id: int


class ClassStudentResponse(BaseModel):
    id: int
    student_id: int
    username: str
    email: str
    enrolled_at: datetime


class ClassTeacherResponse(BaseModel):
    id: int
    teacher_id: int
    username: str
    email: str


class ClassResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    teachers: List[ClassTeacherResponse] = []
    student_count: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


class ClassDetailResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    teachers: List[ClassTeacherResponse] = []
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
    deadline: Optional[datetime] = None


class AssignmentUpdate(BaseModel):
    topic: Optional[str] = None
    question_text: Optional[str] = None
    requirements: Optional[str] = None
    instructions: Optional[str] = None
    deadline: Optional[datetime] = None


class AssignmentResponse(BaseModel):
    id: int
    class_id: int
    class_name: Optional[str] = None
    topic: str
    question_text: str
    requirements: Optional[str]
    instructions: Optional[str]
    deadline: Optional[datetime] = None
    created_by: int
    creator_name: Optional[str] = None
    created_at: datetime
    is_completed: bool = False
    is_past_deadline: bool = False
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


# ============================================================================
# AI Conversation schemas
# ============================================================================

class AIConversationStartRequest(BaseModel):
    topic_id: Optional[int] = None
    custom_topic: Optional[str] = None
    language: str = 'en-US'


class AIConversationStartResponse(BaseModel):
    session_id: int
    ai_message: str
    ai_audio_url: Optional[str] = None
    topic: str


class AIConversationTurnResponse(BaseModel):
    user_transcript: str
    ai_text: str
    ai_audio_url: Optional[str] = None
    turn_number: int


class AIConversationEndResponse(BaseModel):
    overall_band: float
    summary: dict
    encouragement: str
    turn_count: int
    duration_minutes: Optional[float] = None
    pronunciation_score: Optional[float] = None


class AITopicResponse(BaseModel):
    id: int
    name: str
    name_vi: Optional[str] = None
    description: Optional[str] = None
    language: str


class AISessionHistoryItem(BaseModel):
    id: int
    topic: str
    language: str
    status: str
    started_at: datetime
    ended_at: Optional[datetime] = None
    final_scores: Optional[dict] = None
    turn_count: int


class AITopicCreateRequest(BaseModel):
    name: str
    name_vi: Optional[str] = None
    description: Optional[str] = None
    system_prompt: str
    opening_message: str
    language: str = 'en-US'


class AITopicUpdateRequest(BaseModel):
    name: Optional[str] = None
    name_vi: Optional[str] = None
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    opening_message: Optional[str] = None
    language: Optional[str] = None
    is_active: Optional[bool] = None


class AITopicAdminResponse(BaseModel):
    id: int
    name: str
    name_vi: Optional[str] = None
    description: Optional[str] = None
    system_prompt: str
    opening_message: str
    language: str
    is_active: bool
