"""Main FastAPI application"""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv

# Load environment variables at startup
load_dotenv(override=True)
print(f"[STARTUP] Environment loaded from .env")
print(f"[STARTUP] AZURE_SPEECH_KEY present: {bool(os.getenv('AZURE_SPEECH_KEY'))}")
print(f"[STARTUP] AZURE_SPEECH_REGION: {os.getenv('AZURE_SPEECH_REGION', 'not set')}")
print(f"[STARTUP] OPENAI_API_KEY present: {bool(os.getenv('OPENAI_API_KEY'))}")
print(f"[STARTUP] DATABASE_URL present: {bool(os.getenv('DATABASE_URL'))}")

# Initialize database
from database import init_db, engine
try:
    init_db()
    print("[STARTUP] Database initialized successfully")

    # Add missing columns if they don't exist
    from sqlalchemy import text
    with engine.connect() as conn:
        # Check and add teacher_scores column
        result = conn.execute(text("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name='assignment_results' AND column_name='teacher_scores'
        """))
        if not result.fetchone():
            conn.execute(text("ALTER TABLE assignment_results ADD COLUMN teacher_scores JSONB"))
            conn.commit()
            print("[STARTUP] Added teacher_scores column")

        # Check and add audio_filename column
        result = conn.execute(text("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name='assignment_results' AND column_name='audio_filename'
        """))
        if not result.fetchone():
            conn.execute(text("ALTER TABLE assignment_results ADD COLUMN audio_filename VARCHAR(255)"))
            conn.commit()
            print("[STARTUP] Added audio_filename column")
except Exception as e:
    print(f"[STARTUP] Database initialization failed: {e}")

# Create FastAPI app
app = FastAPI(title="Speech Evaluation API")

# Middleware to allow Private Network Access preflight (for dev behind HTTPS frontend)
class AllowPrivateNetworkMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        # Handle PNA preflight request from browsers
        if request.method == "OPTIONS" and request.headers.get("access-control-request-private-network") == "true":
            headers = {
                "Access-Control-Allow-Origin": request.headers.get("origin", "*"),
                "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
                "Access-Control-Allow-Headers": request.headers.get("access-control-request-headers", "*"),
                "Access-Control-Allow-Credentials": "true",
                "Access-Control-Allow-Private-Network": "true",
            }
            return Response(status_code=204, headers=headers)
        response = await call_next(request)
        # Ensure subsequent responses expose the PNA header as well (helpful for dev)
        response.headers.setdefault("Access-Control-Allow-Private-Network", "true")
        return response

app.add_middleware(AllowPrivateNetworkMiddleware)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "https://verify-certificate.sotatek.works",
        "https://127.0.0.1:8001"
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Import and include routers
from routes.auth import router as auth_router
from routes.content import router as content_router
from routes.teacher import router as teacher_router
from routes.admin import router as admin_router
from routes.classes import router as classes_router
from routes.assignments import router as assignments_router
from routes.evaluation import router as evaluation_router

app.include_router(auth_router)
app.include_router(content_router)
app.include_router(teacher_router)
app.include_router(admin_router)
app.include_router(classes_router)
app.include_router(assignments_router)
app.include_router(evaluation_router)

# Serve frontend static files (for production)
FRONTEND_DIST = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'frontend', 'dist')
if os.path.exists(FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        """Serve frontend for all non-API routes"""
        from fastapi import HTTPException
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API endpoint not found")

        file_path = os.path.join(FRONTEND_DIST, full_path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)

        # Serve index.html for all other routes (SPA routing)
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))


if __name__ == '__main__':
    import uvicorn
    import sys

    # On Windows, workers don't work with uvicorn.run() - only on Unix
    # But async handlers with asyncio.to_thread() still allow concurrent request handling
    is_windows = sys.platform == 'win32'

    if is_windows:
        print("Backend server starting on http://localhost:8001 (single worker - Windows)")
        print("Note: Concurrent requests are handled via asyncio thread pool")
        uvicorn.run(
            "app:app",
            host="0.0.0.0",
            port=8001,
            limit_concurrency=100,
            timeout_keep_alive=30,
        )
    else:
        import multiprocessing
        cpu_count = multiprocessing.cpu_count()
        workers = min((2 * cpu_count) + 1, 4)

        print(f"Backend server starting on http://localhost:8001 with {workers} workers")
        uvicorn.run(
            "app:app",
            host="0.0.0.0",
            port=8001,
            workers=workers,
            limit_concurrency=100,
            limit_max_requests=1000,
            timeout_keep_alive=30,
        )
