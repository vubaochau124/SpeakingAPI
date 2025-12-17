"""Role-based access control dependencies"""
from fastapi import Depends, HTTPException
from models import User
from auth import get_current_user


def require_teacher(current_user: User = Depends(get_current_user)):
    """Any authenticated user can be a teacher (of classes they create)"""
    # No role check - any user can create and manage their own classes
    return current_user


def require_admin(current_user: User = Depends(get_current_user)):
    """Dependency to require admin role"""
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def require_admin_or_teacher(current_user: User = Depends(get_current_user)):
    """Any authenticated user can access teacher features"""
    # No role check - any user can be a teacher of their own classes
    return current_user
