#!/bin/bash

# Start both frontend and backend for development

echo "🚀 Starting Smart Travel Assistant Development Environment..."
echo ""

# Check if backend is running
if ! curl -s http://localhost:8000/api/health > /dev/null 2>&1; then
    echo "📡 Starting backend server on http://localhost:8000..."
    cd "$(dirname "$0")"
    
    # Start backend in background
    python3 -m uvicorn backend.main:app --reload --port 8000 --host 0.0.0.0 > backend.log 2>&1 &
    BACKEND_PID=$!
    echo "Backend started with PID: $BACKEND_PID"
    
    # Wait a bit for backend to start
    sleep 3
    
    # Check if backend started successfully
    if curl -s http://localhost:8000/api/health > /dev/null 2>&1; then
        echo "✅ Backend is running on http://localhost:8000"
    else
        echo "❌ Backend failed to start. Check backend.log for errors."
        echo "Make sure you have:"
        echo "  - Python dependencies installed: pip install -r backend/requirements.txt"
        echo "  - backend/.env file with OPENAI_API_KEY, AMADEUS_API_KEY, AMADEUS_API_SECRET"
        exit 1
    fi
else
    echo "✅ Backend is already running on http://localhost:8000"
fi

echo ""
echo "🌐 Starting frontend development server on http://localhost:3000..."
echo "   (This will open automatically in your browser)"
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""

# Start frontend
npm start

