"""Role-based access control dependencies"""
from fastapi import Depends, HTTPException
from models import User
from auth import get_current_user


def require_teacher(current_user: User = Depends(get_current_user)):
    """Dependency to require teacher role"""
    if current_user.role not in ['teacher', 'admin']:
        raise HTTPException(status_code=403, detail="Teacher access required")
    return current_user


def require_admin(current_user: User = Depends(get_current_user)):
    """Dependency to require admin role"""
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def require_admin_or_teacher(current_user: User = Depends(get_current_user)):
    """Dependency to require admin or teacher role"""
    if current_user.role not in ['admin', 'teacher']:
        raise HTTPException(status_code=403, detail="Admin or teacher access required")
    return current_user
