#!/usr/bin/env bash
# Start script for Render

cd backend
uvicorn app:app --host 0.0.0.0 --port $PORT
