# Smart Travel Assistant v2.0.0

AI-powered travel planning assistant with interactive flight dashboard, price analysis, and intelligent chat interface.

## 🚀 **ONE-COMMAND START**

```bash
cd D:\STA\my-project
./start.sh
```

**Open:** http://localhost:3000

## 🎯 **What You Get**

- 🤖 **AI Chat Interface** - Intelligent travel planning with location detection
- 🗺️ **Flight Tracker Dashboard** - Ask about flights to see:
  - **Animated Flight Map** - Moving airplane with real-time progress
  - **Professional Price Charts** - Interactive line charts using Recharts
  - **Smart Flights Table** - Clean table with "Best Deal" badges
  - **Split-view Layout** - Chat interface + dashboard side-by-side
  - **Wayfinder Design System** - Complete brand color integration

## 🧪 **Test It Now**

In the chat, try:
- "Find flights to Paris"
- "Show me ticket prices"
- "Compare flight prices from NYC to LA"
- "Search for flights to Tokyo"
- "Book a flight to Barcelona"

## 📋 **Prerequisites**
- Node.js 18+ (use `nvm use 18` if needed)
- Python 3.11+
- Modern web browser

## 🔧 **Alternative Start Methods**

### Method 1: Quick Start (Recommended)
```bash
./start.sh
```

### Method 2: Development Mode
```bash
npm install
npm start
```

### Method 3: Build & Serve
```bash
npm run build
cd build && python3 -m http.server 3000
```

## ✨ Features

### v2.0.0 New Features
- 🎯 **Flight Tracker Dashboard**: Complete interactive flight search experience
- 🗺️ **Animated Flight Map**: Moving airplane with real-time progress indicator
- 📊 **Professional Price Charts**: Recharts integration with smooth visualizations
- 📋 **Smart Flights Table**: Clean table design with "Best Deal" badges
- 🎨 **Wayfinder Design System**: Complete brand color integration (`#004C8C`, `#00ADEF`, `#EAF9FF`)
- 🤖 **AI Chat Interface**: Intelligent travel planning assistant
- 📱 **Responsive Design**: Works on all devices
- 🔄 **Dynamic Updates**: Charts and tables update based on chat queries

### Core Features
- AI-powered travel recommendations
- Real-time flight data integration (via Amadeus API)
- Location detection and personalization
- Multi-destination trip planning
- Price comparison and optimization
- Weather and safety information

## 🏗️ Project Structure

```
src/
├── components/
│   ├── dashboard/           # Flight Tracker Dashboard components
│   │   ├── FlightDashboard.jsx    # Main dashboard with split-view
│   │   ├── FlightMap.jsx          # Animated flight map with moving airplane
│   │   ├── PriceChart.jsx         # Professional Recharts integration
│   │   └── FlightsTable.jsx       # Smart table with badges
│   ├── ui/                  # Reusable UI components
│   │   ├── card.jsx              # Card, CardHeader, CardContent, etc.
│   │   ├── badge.jsx             # Badge component with variants
│   │   ├── table.jsx             # Table components
│   │   └── scroll-area.jsx       # ScrollArea component
│   ├── ChatInput.jsx
│   ├── ChatMockup.jsx
│   └── MessageBubble.jsx
├── pages/
│   ├── Home.jsx            # Landing page
│   └── Chat.jsx            # Chat interface with dashboard integration
├── styles/
│   ├── globals.css         # Wayfinder design system colors
│   └── site.css            # Custom CSS with utility classes
└── App.js                  # Main app with dashboard routing
```

## 🔧 Backend

The backend is deployed and running at:
```
https://capstone-79wenhjg2-berkes-projects-f48a9605.vercel.app
```

### Backend Features
- **FastAPI** - Modern Python web framework
- **OpenAI Integration** - GPT-4 powered chat responses
- **Amadeus API Integration** - Real-time flight data
- **Intent Detection** - Smart message analysis
- **Caching System** - Optimized API usage
- **Location Services** - User location detection

### API Endpoints
- `GET /api/health` - Health check
- `POST /api/chat` - Main chat endpoint
- `GET /api/diag/amadeus/*` - Diagnostic endpoints

## 🧪 Testing

1. **Home Page**: Modern landing page with feature overview
2. **Chat Interface**: Click "Start Planning" to access AI chat
3. **Dashboard**: Ask about flights to see the interactive dashboard:
   - "Find flights to Paris"
   - "Compare flight prices from NYC to LA"
   - "Search for flights to Tokyo"

## 📦 Build

```bash
npm run build
```

The build output will be in the `build/` directory.

## 🚀 Deployment

The app is ready for deployment to any static hosting service:
- Vercel
- Netlify
- GitHub Pages
- Firebase Hosting

## 🎯 Version History

### v2.0.0 (Current)
- Added interactive flight dashboard
- Implemented price trend visualization
- Created flight map animations
- Enhanced chat interface with split-view
- Improved UI/UX design
- Added responsive layout
- Integrated Amadeus API for real-time data

### v1.0.0
- Basic chat interface
- AI travel recommendations
- Backend API integration

## 🔧 Technical Stack

### Frontend
- **React 18.2.0** - Main framework
- **Recharts 3.3.0** - Professional chart library
- **Custom CSS** - Wayfinder design system
- **Responsive Design** - Mobile-first approach

### Backend
- **Python 3.11+** - Backend language
- **FastAPI** - Web framework
- **OpenAI API** - AI chat responses
- **Amadeus API** - Travel data integration
- **Pydantic** - Data validation
- **Uvicorn** - ASGI server

## 🎨 Design System

### Wayfinder Brand Colors
- **Primary**: `#004C8C` (Wayfinder blue)
- **Accent**: `#00ADEF` (Wayfinder light blue)
- **Background**: `#EAF9FF` (Wayfinder light background)
- **Chart Colors**: Orange and blue variants

### Components
- **Cards**: Clean white cards with subtle borders
- **Badges**: Rounded badges with proper color variants
- **Tables**: Professional table design with hover effects
- **Charts**: Smooth Recharts integration with Wayfinder colors

## 🚨 Troubleshooting

### Dashboard Not Appearing
1. Use keywords: "flight", "price", "ticket", "booking"
2. Check browser console (F12) for errors
3. Restart: `./start.sh`

### Server Won't Start
```bash
pkill -f "python3 -m http.server"
./start.sh
```

### Build Errors
```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

## 📚 Documentation

- `QUICK_START.md` - One-page quick start guide
- `CURRENT_STATE.md` - Current project status
- `SUMMARY.md` - Complete project summary
- `backend/AMADEUS_INTEGRATION.md` - API integration details

---

**Built with React, FastAPI, and modern web technologies.**

**Last Updated:** January 2025  
**Version:** 2.0.0  
**Status:** ✅ Complete & Working