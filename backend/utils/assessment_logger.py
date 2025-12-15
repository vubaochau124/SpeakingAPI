"""Assessment logging utility - stores all speech assessment results to a JSON file"""
import os
import json
import threading
from datetime import datetime
from typing import Optional, Dict, Any

# Thread lock for safe file writing
_log_lock = threading.Lock()

# Default log file path
LOG_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'logs')
LOG_FILE = os.path.join(LOG_DIR, 'assessments.json')


def _ensure_log_dir():
    """Ensure the logs directory exists."""
    if not os.path.exists(LOG_DIR):
        os.makedirs(LOG_DIR, exist_ok=True)


def log_assessment(
    user_id: int,
    username: str,
    assessment_type: str,
    question: Optional[str],
    transcript: str,
    azure_result: Optional[Dict[str, Any]],
    openai_result: Optional[Dict[str, Any]],
    combined_result: Optional[Dict[str, Any]],
    scores: Optional[Dict[str, Any]] = None,
    extra_data: Optional[Dict[str, Any]] = None
) -> bool:
    """
    Log an assessment result to the JSON log file.

    Args:
        user_id: The user's ID
        username: The user's username/email
        assessment_type: Type of assessment (e.g., 'unscripted', 'conversation', 'scripted', 'assignment')
        question: The question being answered (if applicable)
        transcript: The transcribed speech
        azure_result: Azure pronunciation assessment result
        openai_result: OpenAI content evaluation result
        combined_result: Combined/final scores
        scores: Additional score data
        extra_data: Any additional data to log

    Returns:
        bool: True if logged successfully, False otherwise
    """
    try:
        _ensure_log_dir()

        log_entry = {
            'timestamp': datetime.now().isoformat(),
            'user_id': user_id,
            'username': username,
            'assessment_type': assessment_type,
            'question': question,
            'transcript': transcript,
            'azure_result': azure_result,
            'openai_result': openai_result,
            'combined_result': combined_result,
            'scores': scores,
            'extra_data': extra_data
        }

        with _log_lock:
            # Read existing logs
            logs = []
            if os.path.exists(LOG_FILE):
                try:
                    with open(LOG_FILE, 'r', encoding='utf-8') as f:
                        logs = json.load(f)
                except (json.JSONDecodeError, IOError):
                    logs = []

            # Append new entry
            logs.append(log_entry)

            # Write back
            with open(LOG_FILE, 'w', encoding='utf-8') as f:
                json.dump(logs, f, indent=2, ensure_ascii=False, default=str)

        print(f"[ASSESSMENT-LOG] Logged {assessment_type} assessment for user {username} (id={user_id})", flush=True)
        return True

    except Exception as e:
        print(f"[ASSESSMENT-LOG] ERROR: Failed to log assessment: {e}", flush=True)
        return False


def get_assessment_logs(
    user_id: Optional[int] = None,
    assessment_type: Optional[str] = None,
    limit: int = 100
) -> list:
    """
    Retrieve assessment logs with optional filtering.

    Args:
        user_id: Filter by user ID (optional)
        assessment_type: Filter by assessment type (optional)
        limit: Maximum number of entries to return

    Returns:
        list: List of log entries (most recent first)
    """
    try:
        if not os.path.exists(LOG_FILE):
            return []

        with open(LOG_FILE, 'r', encoding='utf-8') as f:
            logs = json.load(f)

        # Filter if needed
        if user_id is not None:
            logs = [l for l in logs if l.get('user_id') == user_id]
        if assessment_type is not None:
            logs = [l for l in logs if l.get('assessment_type') == assessment_type]

        # Return most recent first, limited
        return logs[-limit:][::-1]

    except Exception as e:
        print(f"[ASSESSMENT-LOG] ERROR: Failed to read logs: {e}", flush=True)
        return []
