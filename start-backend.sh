#!/bin/bash

# Start the backend server
cd "$(dirname "$0")"
echo "Starting backend server on http://localhost:8000"
echo "Press Ctrl+C to stop the server"
echo ""

# Check if Python dependencies are installed
python3 -c "import fastapi, uvicorn" 2>/dev/null || {
    echo "Error: Python dependencies not installed. Run:"
    echo "  pip install -r backend/requirements.txt"
    exit 1
}

# Check if .env file exists
if [ ! -f "backend/.env" ]; then
    echo "Warning: backend/.env file not found. Make sure you have:"
    echo "  - OPENAI_API_KEY"
    echo "  - AMADEUS_API_KEY"
    echo "  - AMADEUS_API_SECRET"
    echo ""
fi

# Start the server from backend directory
cd "$(dirname "$0")/backend"
PYTHONPATH="$(pwd)" python3 -m uvicorn main:app --reload --port 8000 --host 0.0.0.0

