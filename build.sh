#!/usr/bin/env bash
# Build script for Render

set -e

echo "========================================"
echo "Building Frontend..."
echo "========================================"
cd frontend
npm install
npm run build
cd ..

echo "========================================"
echo "Installing Backend Dependencies..."
echo "========================================"
cd backend
pip install -r requirements.txt
cd ..

echo "========================================"
echo "Build completed successfully!"
echo "========================================"
