#!/bin/bash
# ServiceSphere Quick Start Script

echo "================================"
echo "ServiceSphere - Quick Start"
echo "================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed!"
    echo "📥 Download from: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js is installed: $(node -v)"
echo ""

# Navigate to backend
cd "$(dirname "$0")/backend"

echo "📦 Installing dependencies..."
npm install

if [ $? -eq 0 ]; then
    echo "✅ Dependencies installed successfully!"
    echo ""
    echo "🚀 Starting backend server..."
    echo ""
    echo "Don't forget to:"
    echo "1. Create database and tables (see SETUP.md)"
    echo "2. Update .env with your database password"
    echo "3. Open http://localhost:3000 in your browser"
    echo ""
    npm start
else
    echo "❌ Failed to install dependencies"
    exit 1
fi
