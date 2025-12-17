"""API Routes"""
from .auth import router as auth_router
from .content import router as content_router
from .teacher import router as teacher_router
from .admin import router as admin_router
from .classes import router as classes_router
from .assignments import router as assignments_router
from .evaluation import router as evaluation_router
from .ai_conversation import router as ai_conversation_router
