from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv
import os
from openai import OpenAI
from datetime import datetime, timedelta
import pytz
import logging
import uuid
import asyncio

# Import our services
from services.amadeus_service import AmadeusService
from services.intent_detector import IntentDetector
from services.cache_manager import CacheManager

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
BASE_DIR = os.path.dirname(__file__)
ENV_PATH = os.path.join(BASE_DIR, ".env")
# Load local .env if present (local dev); in production, platform env vars should be used.
if os.path.exists(ENV_PATH):
    load_dotenv(dotenv_path=ENV_PATH)

api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    raise RuntimeError("OPENAI_API_KEY missing in environment variables")

print(f"OpenAI API key loaded: {api_key[:10]}..." if api_key else "No API key found")
client = OpenAI(api_key=api_key)

# Initialize services
try:
    amadeus_service = AmadeusService()
    print("AmadeusService initialized successfully")
except Exception as e:
    print(f"Error initializing AmadeusService: {e}")
    amadeus_service = None

try:
    intent_detector = IntentDetector()
    print("IntentDetector initialized successfully")
except Exception as e:
    print(f"Error initializing IntentDetector: {e}")
    intent_detector = None

try:
    cache_manager = CacheManager()
    print("CacheManager initialized successfully")
except Exception as e:
    print(f"Error initializing CacheManager: {e}")
    cache_manager = None

app = FastAPI(
    title="Smart Travel Assistant API",
    description="AI-powered travel planning API",
    version="1.0.0"
)

# CORS configuration for production
origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://smart-travel-assistant-946f9.web.app",
    "https://smart-travel-assistant-946f9.firebaseapp.com",
    # Allow Vercel frontend domains
    "https://*.vercel.app",
    # Allow any localhost for development
    "http://localhost:*",
    "https://localhost:*"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


class UserLocation(BaseModel):
    city: Optional[str] = None
    region: Optional[str] = None
    country: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None

class Context(BaseModel):
    now_iso: Optional[str] = None
    user_tz: Optional[str] = None
    user_locale: Optional[str] = None
    user_location: Optional[UserLocation] = None

class ChatRequest(BaseModel):
    messages: list  # list of {role, content}
    context: Context = None
    session_id: str = None


@app.get("/")
def root():
    return {
        "message": "Smart Travel Assistant API",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "health": "/api/health",
            "chat": "/api/chat"
        }
    }

@app.get("/api/health")
def health():
    return {"ok": True, "status": "healthy"}

@app.get("/api/test")
def test():
    return {"message": "Backend is working", "timestamp": datetime.now().isoformat()}

# Diagnostics for Amadeus integration
@app.get("/api/diag/amadeus/location")
async def diag_amadeus_location(keyword: str = "Paris"):
    try:
        logger.info(f"[DIAG] Testing Amadeus location search with keyword='{keyword}'")
        result = await amadeus_service.get_airport_city_search(keyword=keyword)
        count = (result or {}).get("count", 0)
        sample = None
        if result and result.get("locations"):
            sample = result["locations"][0]
        return {"ok": True, "count": count, "sample": sample, "raw": result}
    except Exception as e:
        logger.error(f"[DIAG] Amadeus location search failed: {e}")
        return {"ok": False, "error": str(e)}

@app.get("/api/diag/amadeus/flight")
async def diag_amadeus_flight(origin: str = "PAR", destination: str = "TYO", date: str = "2025-12-01"):
    try:
        logger.info(f"[DIAG] Testing Amadeus flight search {origin}->{destination} on {date}")
        result = await amadeus_service.search_flights(origin=origin, destination=destination, departure_date=date)
        count = (result or {}).get("count", 0)
        sample = None
        if result and result.get("flights"):
            sample = result["flights"][0]
        return {"ok": True, "count": count, "sample": sample, "raw": result}
    except Exception as e:
        logger.error(f"[DIAG] Amadeus flight search failed: {e}")
        return {"ok": False, "error": str(e)}

@app.get("/api/diag/amadeus/flight-dates")
async def diag_amadeus_flight_dates(origin: str = "PAR", destination: str = "TYO",
                                    start: str = "2025-12-01", end: str = "2026-01-01"):
    try:
        date_range = f"{start},{end}"
        logger.info(f"[DIAG] Testing Amadeus flight-dates {origin}->{destination} range {date_range}")
        result = await amadeus_service.get_cheapest_dates(
            origin=origin,
            destination=destination,
            departure_date_range=date_range
        )
        return {
            "ok": True,
            "count": (result or {}).get("count", 0),
            "dates": (result or {}).get("dates", [])[:10],
            "raw": result
        }
    except Exception as e:
        logger.error(f"[DIAG] Amadeus flight-dates failed: {e}")
        return {"ok": False, "error": str(e)}

@app.get("/api/diag/amadeus/token")
async def diag_amadeus_token():
    try:
        token = await amadeus_service._get_access_token()
        return {"ok": True, "token_present": bool(token), "token_prefix": token[:12] if token else None}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.get("/api/diag/amadeus/inspiration")
async def diag_amadeus_inspiration(origin: str = "PAR", maxPrice: int = 200):
    try:
        result = await amadeus_service.get_flight_inspiration(origin=origin, max_price=maxPrice)
        return {"ok": True, "count": (result or {}).get("count", 0), "sample": (result or {}).get("destinations", [])[:3], "raw": result}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.post("/api/test-context")
async def test_context(ctx: Context):
    """Diagnostic endpoint to verify context parsing and processing"""
    local_time = format_local_time(ctx.now_iso, ctx.user_tz)
    loc_str = get_location_string(ctx.user_location)
    
    # Log the received context for debugging
    logger.info(
        "Received context: time=%s tz=%s city=%s country=%s lat=%s lon=%s",
        ctx.now_iso, ctx.user_tz,
        ctx.user_location.city, ctx.user_location.country,
        ctx.user_location.lat, ctx.user_location.lon,
    )
    
    return {
        "ok": True,
        "received": {
            "now_iso": ctx.now_iso,
            "user_tz": ctx.user_tz,
            "local_time": local_time,
            "location": loc_str,
            "lat": ctx.user_location.lat,
            "lon": ctx.user_location.lon,
            "city": ctx.user_location.city,
            "region": ctx.user_location.region,
            "country": ctx.user_location.country,
            "user_locale": ctx.user_locale
        }
    }


def format_local_time(now_iso, user_tz):
    """Format the current time in the user's timezone with UTC offset"""
    try:
        if not now_iso or not user_tz:
            return now_iso or ""
        dt = datetime.fromisoformat(now_iso.replace('Z', '+00:00'))
        user_tz_obj = pytz.timezone(user_tz)
        local_dt = dt.astimezone(user_tz_obj)
        
        # Calculate UTC offset
        utc_offset = local_dt.strftime('%z')
        if utc_offset:
            # Format as UTC±HH:MM
            utc_offset_formatted = f"UTC{utc_offset[:3]}:{utc_offset[3:]}"
        else:
            utc_offset_formatted = "UTC+00:00"
        
        # Use ASCII bullet and include UTC offset
        return local_dt.strftime("%a, %d %b %Y - %I:%M %p").lstrip("0") + f" ({user_tz}, {utc_offset_formatted})"
    except Exception as e:
        logger.error(f"Error formatting local time: {e}")
        return now_iso

def get_location_string(user_location):
    """Get a readable location string from user_location"""
    if not user_location:
        return "Unknown location"
    parts = []
    if getattr(user_location, 'city', None):
        parts.append(user_location.city)
    if getattr(user_location, 'country', None):
        parts.append(user_location.country)
    return ", ".join(parts) if parts else "Unknown location"

def create_system_prompt(context, amadeus_data=None):
    """Create the Miles travel assistant system prompt with context and real-time data"""
    if not context:
        local_time = ""
        location = "Unknown location"
        now_iso = None
        user_tz = None
        user_locale = None
        user_location_city = None
        user_location_region = None
        user_location_country = None
        user_location_lat = None
        user_location_lon = None
    else:
        local_time = format_local_time(context.now_iso, context.user_tz)
        location = get_location_string(context.user_location)
        now_iso = context.now_iso
        user_tz = context.user_tz
        user_locale = context.user_locale
        user_location_city = getattr(context.user_location, 'city', None) if context.user_location else None
        user_location_region = getattr(context.user_location, 'region', None) if context.user_location else None
        user_location_country = getattr(context.user_location, 'country', None) if context.user_location else None
        user_location_lat = getattr(context.user_location, 'lat', None) if context.user_location else None
        user_location_lon = getattr(context.user_location, 'lon', None) if context.user_location else None
    
    # Log sanitized context for debugging
    logger.info(
        "Creating system prompt - sanitized context: time=%s tz=%s city=%s country=%s lat=%s lon=%s",
        now_iso, user_tz, user_location_city, user_location_country, user_location_lat, user_location_lon,
    )
    
    system_prompt = f"""You are "Miles," a travel-planning assistant embedded in a web app. You must produce clean, skimmable answers and use the runtime context the app sends.

Runtime context (always provided by the app):
- now_iso: {now_iso}
- user_tz: {user_tz}
- user_locale: {user_locale}
- user_location: {location}
  - city: {user_location_city or 'null'}
  - region: {user_location_region or 'null'}
  - country: {user_location_country or 'null'}
  - lat: {user_location_lat or 'null'}
  - lon: {user_location_lon or 'null'}

Rules:
- Treat now_iso as the source of truth for "today," "tomorrow," etc. Use the formatted local time provided.
- If any user_location field is missing, infer only from provided fields. If city and country are both null, ask one concise follow-up: "Which city are you in?"
- Never claim real-time booking. Provide guidance, options, and links if available.
- ALWAYS provide immediate, actionable results. Do NOT ask for more details unless absolutely necessary.
- If you have real-time data, use it immediately. If you don't have specific data, provide general guidance with the information available.
- Default answer length ≈ 140–180 words unless the user asks for more detail.

VISUAL COMPONENTS:
- For multi-day itineraries, use ```itinerary``` code blocks with JSON data
- For location recommendations, use ```location``` code blocks with JSON data
- Always include visual elements for better user experience
- NEVER use specific days of the week (Mon, Tue, Wed, etc.) unless actual dates are provided by the user
- Use "Day 1", "Day 2", "Day 3" format instead of "Day 1 (Mon)"

Style standard (strict):
- Start with the answer in one tight sentence.
- Use # and ## headers, short bullets, and compact tables. No walls of text.
- Prefer numbered steps for itineraries. One line per stop. Include travel time hints only if helpful.
- Dates: ALWAYS use the exact formatted time provided: "{local_time}"
- Currency and units: respect user_locale.
- If you need info, ask at most one question at the end.
- CRITICAL FORMATTING RULE: In ALL itineraries, EVERY single destination name, attraction, landmark, restaurant, museum, district, building, or place name MUST be formatted with **__bold and underlined__** text.
- Examples: **__Sagrada Familia__**, **__Park Güell__**, **__Gothic Quarter__**, **__Casa Batlló__**, **__La Rambla__**, **__Montjuïc__**, **__Barceloneta Beach__**, **__Picasso Museum__**, **__Born District__**
- NO EXCEPTIONS: Every place name in the itinerary must use this exact formatting: **__Place Name__**

Current local time: {local_time}
User location: {location}

Output patterns:
A) Greeting / First turn
# Ready to plan
- Local time: {local_time}
- Location: {location}

I'm here to help you plan your perfect trip! Just let me know:
- Where would you like to go?
- When are you planning to travel?
- What's your budget?
- Any specific interests or must-see attractions?

I'll wait for your request before creating any itineraries.

B) Quick fact (e.g., "What's today's date?")
# Today
- {local_time}

C) 3–5 item option set (flights, hotels, activities with real data)
# Top options for {{city,date-range}}
| Option | Why it fits | Est. price | Notes |
|---|---|---|---|
| 1. {{name}} | {{reason}} | {{price}}/night | {{1 short note}} |
| 2. ... | ... | ... | ... |

Next: Want me to refine by budget, neighborhood, or rating?

D) Day plan (clean itinerary) - USE VISUAL COMPONENTS
# {{City}} {{N}}-day plan

For multi-day itineraries, ALWAYS include this visual component:

```itinerary
{{
  "days": [
    {{
      "day": 1,
      "time": "Day 1",
      "weather": "Sunny, 22°C",
      "activities": [
        {{
          "title": "Morning: Visit {{landmark}}",
          "description": "Explore the historic district and take photos",
          "duration": "2-3 hours"
        }},
        {{
          "title": "Lunch: {{restaurant}}",
          "description": "Traditional {{cuisine}} cuisine",
          "duration": "1 hour"
        }},
        {{
          "title": "Afternoon: {{activity}}",
          "description": "Cultural experience",
          "duration": "3 hours"
        }}
      ]
    }},
    {{
      "day": 2,
      "time": "Day 2", 
      "weather": "Partly cloudy, 20°C",
      "activities": [
        {{
          "title": "Morning: {{activity}}",
          "description": "Outdoor adventure",
          "duration": "4 hours"
        }}
      ]
    }}
  ]
}}
```

## Day 1
- Morning: {{activity}} (≈ {{mins}})
- Lunch: {{place}} ({{cuisine}})
- Afternoon: {{activity}}
- Evening: {{activity}} | {{dinner}}

## Day 2
- ...

E) Flight search results (with real data)
# Flights from {{origin}} to {{destination}}
## Best Options
| Airline | Price | Duration | Stops | Departure |
|---|---|---|---|---|
| {{airline}} | {{price}} | {{duration}} | {{stops}} | {{time}} |

F) Hotel search results (with real data) - USE VISUAL COMPONENTS
# Hotels in {{city}}

For location recommendations, ALWAYS include this visual component:

```location
[
  {{
    "name": "{{Hotel Name}}",
    "description": "Luxury hotel in {{area}} with {{amenities}}",
    "image": true,
    "rating": "4.8/5",
    "price": "${{price}}/night"
  }},
  {{
    "name": "{{Hotel Name 2}}",
    "description": "Boutique hotel near {{landmark}}",
    "image": true,
    "rating": "4.6/5", 
    "price": "${{price}}/night"
  }}
]
```

## Top Recommendations
| Hotel | Price/night | Rating | Location |
|---|---|---|---|
| {{name}} | {{price}} | {{stars}} | {{area}} |

G) Safety or limitation
# Heads up
I can't book or hold prices. I can compare and draft the plan.

Behavior logic:
- ALWAYS use the exact formatted local time provided: "{local_time}"
- If the user asks for date or time, return pattern B only.
- WAIT for explicit requests before generating itineraries. Do NOT proactively plan trips.
- Only create itineraries when the user specifically asks for them (e.g., "Plan a trip", "Create an itinerary", "Give me a 3-day plan").
- If the user gives a destination and dates, return pattern D with VISUAL COMPONENTS; otherwise pattern A.
- For flight requests, use pattern E with real flight data if available.
- For hotel requests, use pattern F with VISUAL COMPONENTS and real hotel data if available.
- For list requests, use pattern C with 3–5 rows. Keep reasons short.
- ALWAYS provide immediate results. Do NOT ask for more details unless absolutely necessary.
- If you have real-time data, use it immediately in your response.
- ALWAYS include visual components (```itinerary``` or ```location```) for multi-day plans and location recommendations.
- NEVER use specific days of the week (Mon, Tue, Wed) in itineraries unless the user provides specific dates.
- Use "Day 1", "Day 2", "Day 3" format for generic itineraries.
- NEVER start planning trips unless explicitly requested.

Example rendering (with context):
Input: "What's today's date?"
Output:
# Today
- {local_time}"""
    
    # Add real-time data if available
    if amadeus_data and not amadeus_data.get('error'):
        data_section = "\n\n🚨 CRITICAL: REAL-TIME TRAVEL DATA PROVIDED 🚨\n"
        data_section += "YOU MUST USE THIS REAL-TIME DATA IN YOUR RESPONSE. DO NOT PROVIDE GENERIC ADVICE.\n"
        data_section += "PRIORITIZE THIS DATA OVER ANY GENERAL KNOWLEDGE.\n\n"
        
        if 'flights' in amadeus_data or 'outboundFlights' in amadeus_data:
            # Handle round-trip flight data with best combination
            if 'bestCombination' in amadeus_data:
                best = amadeus_data['bestCombination']
                data_section += f"🎯 BEST ROUND-TRIP DEAL (MUST BE HIGHLIGHTED IN YOUR RESPONSE):\n"
                data_section += f"Outbound: {best['outbound']['airline']} {best['outbound']['flightNumber']} - ${best['outbound']['price']} ({best['outbound']['departure']} - {best['outbound']['arrival']})\n"
                data_section += f"Return: {best['return']['airline']} {best['return']['flightNumber']} - ${best['return']['price']} ({best['return']['departure']} - {best['return']['arrival']})\n"
                data_section += f"Total Price: ${best['totalPrice']} ({best['savings']})\n\n"
                data_section += f"CRITICAL: You MUST use EXACTLY these flights in your response!\n"
                data_section += f"MANDATORY FORMAT: Start with '# Best Round-Trip Deal\\n\\n**Outbound:** {best['outbound']['airline']} {best['outbound']['flightNumber']} - ${best['outbound']['price']} ({best['outbound']['departure']} - {best['outbound']['arrival']})\\n**Return:** {best['return']['airline']} {best['return']['flightNumber']} - ${best['return']['price']} ({best['return']['departure']} - {best['return']['arrival']})\\n**Total:** ${best['totalPrice']} ({best['savings']})\\n\\n## Other Options\\nThen show other flight options below.'\n"
                data_section += f"DO NOT calculate your own totals - use the EXACT total of ${best['totalPrice']}!\n\n"
            
            # Show individual flight options
            if 'outboundFlights' in amadeus_data:
                data_section += f"OUTBOUND FLIGHTS ({len(amadeus_data['outboundFlights'])} options):\n"
                for i, flight in enumerate(amadeus_data['outboundFlights'][:3], 1):
                    data_section += f"{i}. {flight['airline']} {flight['flightNumber']} - ${flight['price']} ({flight['departure']} - {flight['arrival']})\n"
                
                data_section += f"\nRETURN FLIGHTS ({len(amadeus_data['returnFlights'])} options):\n"
                for i, flight in enumerate(amadeus_data['returnFlights'][:3], 1):
                    data_section += f"{i}. {flight['airline']} {flight['flightNumber']} - ${flight['price']} ({flight['departure']} - {flight['arrival']})\n"
            else:
                # Fallback for old format
                data_section += f"FLIGHTS ({amadeus_data.get('count', 0)} found):\n"
                for i, flight in enumerate(amadeus_data['flights'][:3], 1):
                    price = flight.get('price', 'N/A')
                    currency = flight.get('currency', 'USD')
                    data_section += f"{i}. Price: {price} {currency}\n"
                
        elif 'hotels' in amadeus_data:
            data_section += f"HOTELS ({amadeus_data.get('count', 0)} found):\n"
            for i, hotel in enumerate(amadeus_data['hotels'][:3], 1):
                name = hotel.get('name', 'N/A')
                price = hotel.get('price', 'N/A')
                currency = hotel.get('currency', 'USD')
                data_section += f"{i}. {name} - {price} {currency}\n"
                
        elif 'activities' in amadeus_data:
            data_section += f"ACTIVITIES ({amadeus_data.get('count', 0)} found):\n"
            for i, activity in enumerate(amadeus_data['activities'][:3], 1):
                name = activity.get('name', 'N/A')
                price = activity.get('price', 'N/A')
                data_section += f"{i}. {name} - {price}\n"
                
        elif 'destinations' in amadeus_data:
            data_section += f"FLIGHT DESTINATIONS ({amadeus_data.get('count', 0)} found):\n"
            for i, dest in enumerate(amadeus_data['destinations'][:3], 1):
                destination = dest.get('destination', 'N/A')
                price = dest.get('price', 'N/A')
                data_section += f"{i}. {destination} - {price}\n"
        
        data_section += f"\nData fetched at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
        system_prompt += data_section
    elif amadeus_data and amadeus_data.get('error'):
        # Handle API errors
        error_msg = amadeus_data.get('error', 'Unknown error')
        system_prompt += f"\n\n⚠️ API Error: {error_msg}\n"
        system_prompt += "Please try rephrasing your request with specific dates and locations, or try a different search.\n"
    
    return system_prompt

def format_place_names(text):
    """Format place names in text with bold and underlined formatting"""
    import re
    
    # Common place names and patterns to format
    place_patterns = [
        # Barcelona attractions
        r'\bSagrada Familia\b', r'\bPark Güell\b', r'\bGothic Quarter\b', r'\bCasa Batlló\b',
        r'\bLa Rambla\b', r'\bMontjuïc\b', r'\bBarceloneta Beach\b', r'\bPicasso Museum\b',
        r'\bBorn District\b', r'\bCasa Milà\b', r'\bLas Ramblas\b', r'\bBarri Gòtic\b',
        r'\bEl Born\b', r'\bMontserrat\b', r'\bCamp Nou\b', r'\bParc de la Ciutadella\b',
        r'\bPlaça de Catalunya\b', r'\bPlaça Reial\b', r'\bPasseig de Gràcia\b',
        
        # General patterns for museums, churches, parks, etc.
        r'\b[A-Z][a-z]+ Museum\b', r'\b[A-Z][a-z]+ Cathedral\b', r'\b[A-Z][a-z]+ Church\b',
        r'\b[A-Z][a-z]+ Park\b', r'\b[A-Z][a-z]+ Beach\b', r'\b[A-Z][a-z]+ District\b',
        r'\b[A-Z][a-z]+ Quarter\b', r'\b[A-Z][a-z]+ Square\b', r'\b[A-Z][a-z]+ Palace\b',
        
        # Restaurant patterns
        r'\b[A-Z][a-z]+ Restaurant\b', r'\b[A-Z][a-z]+ Bar\b', r'\b[A-Z][a-z]+ Café\b',
        r'\b[A-Z][a-z]+ Tapas\b', r'\b[A-Z][a-z]+ Market\b'
    ]
    
    for pattern in place_patterns:
        # Find all matches and format them
        matches = re.findall(pattern, text)
        for match in matches:
            if not match.startswith('**__') and not match.endswith('__**'):
                text = text.replace(match, f'**__{match}__**')
    
    return text

@app.post("/api/chat")
async def chat(req: ChatRequest):
    try:
        # Validate that we have messages
        if not req.messages or len(req.messages) == 0:
            raise HTTPException(status_code=400, detail="No messages provided")
        
        # Make sure the last message is from the user
        if req.messages[-1]["role"] != "user":
            raise HTTPException(status_code=400, detail="Last message must be from user")
        
        # Generate session ID if not provided
        session_id = req.session_id or str(uuid.uuid4())
        
        # Get the user's latest message
        user_message = req.messages[-1]["content"]
        
        # Check if message contains flight-related keywords
        flight_keywords = [
            'flight', 'flights', 'airline', 'airlines', 'airplane', 'aircraft', 'plane',
            'ticket', 'tickets', 'booking', 'book', 'reserve', 'reservation',
            'travel', 'trip', 'journey', 'vacation', 'holiday', 'getaway',
            'destination', 'departure', 'arrival', 'airport', 'terminal',
            'price', 'prices', 'cost', 'costs', 'expensive', 'cheap', 'cheapest', 
            'budget', 'affordable', 'fare', 'fares', 'rate', 'rates',
            'search', 'find', 'look for', 'show me', 'get me', 'need', 'want',
            'compare', 'comparison', 'options', 'available', 'schedule',
            'to', 'from', 'between', 'route', 'way', 'path',
            'today', 'tomorrow', 'next week', 'this month', 'soon', 'when',
            'search flights', 'find flights', 'book flights', 'flight search',
            'airline tickets', 'plane tickets', 'flight booking', 'travel booking'
        ]
        
        has_flight_keywords = any(keyword in user_message.lower() for keyword in flight_keywords)
        logger.info(f"Flight keyword check: {has_flight_keywords}")
        
        # Skip intent detection for now - just use basic logic
        logger.info(f"Processing message for session {session_id}: {user_message[:100]}...")
        intent = {"type": "general", "confidence": 0.0, "has_required_params": False, "params": {}}
        
        # Debug logging for intent detection
        logger.info(f"Intent detection result: type={intent['type']}, confidence={intent['confidence']}, has_required_params={intent['has_required_params']}")
        logger.info(f"Extracted parameters: {intent['params']}")
        
        amadeus_data = None
        
        # Always fetch flight data if flight keywords are detected, regardless of intent detection
        if has_flight_keywords:
            logger.info("Flight keywords detected - extracting route and fetching data")
            # Extract route information from the user's message
            route_info = extract_route_from_message(user_message)
            logger.info(f"Extracted route info: {route_info}")
            
            # Extract dates from the user's message
            date_info = extract_dates_from_message(user_message)
            logger.info(f"Extracted date info: {date_info}")
            
            # Combine route and date information
            route_info.update(date_info)
            
            # Temporarily use mock data to test enhanced features
            logger.info("Using enhanced mock data for testing")
            amadeus_data = generate_mock_flight_data(route_info)
            
            logger.info(f"Final amadeus_data with route: {amadeus_data.get('route', 'NO ROUTE')}")
        # If travel intent detected and has required parameters, fetch data
        elif intent["type"] != "general" and intent["has_required_params"] and intent["confidence"] > 0.5:
            logger.info(f"Detected {intent['type']} intent with confidence {intent['confidence']}")
            
            # Check cache first
            cache_key_params = intent["params"].copy()
            cache_key_params["type"] = intent["type"]
            
            cached_data = cache_manager.get(session_id, intent["type"], cache_key_params)
            
            if cached_data:
                logger.info("Using cached data")
                amadeus_data = cached_data
            else:
                logger.info("Fetching fresh data from Amadeus API")
                try:
                    # Call appropriate Amadeus API based on intent
                    if intent["type"] == "flight_search":
                        logger.info(f"Calling flight search with params: {intent['params']}")
                        # If origin/destination are not IATA codes, try to get them via location search
                        origin = intent["params"]["origin"]
                        destination = intent["params"]["destination"]
                        
                        # Check if we need to convert city names to IATA codes
                        if not _is_iata_code(origin):
                            logger.info(f"Converting origin '{origin}' to IATA code")
                            location_result = await amadeus_service.get_airport_city_search(keyword=origin)
                            if location_result and not location_result.get('error') and location_result.get('locations'):
                                # Use the first result's IATA code from normalized schema
                                origin = location_result['locations'][0].get('code', origin)
                                logger.info(f"Converted origin to IATA code: {origin}")
                        
                        if not _is_iata_code(destination):
                            logger.info(f"Converting destination '{destination}' to IATA code")
                            location_result = await amadeus_service.get_airport_city_search(keyword=destination)
                            if location_result and not location_result.get('error') and location_result.get('locations'):
                                # Use the first result's IATA code from normalized schema
                                destination = location_result['locations'][0].get('code', destination)
                                logger.info(f"Converted destination to IATA code: {destination}")
                        
                        amadeus_data = await amadeus_service.search_flights(
                            origin=origin,
                            destination=destination,
                            departure_date=intent["params"]["departure_date"],
                            return_date=intent["params"].get("return_date"),
                            adults=intent["params"].get("adults", 1),
                            max_price=intent["params"].get("max_price")
                        )
                        logger.info(f"Amadeus flight search returned count={(amadeus_data or {}).get('count')} for {origin}->{destination}")
                    elif intent["type"] == "hotel_search":
                        logger.info(f"Calling hotel search with params: {intent['params']}")
                        amadeus_data = await amadeus_service.search_hotels(
                            city_code=intent["params"]["destination"],
                            check_in=intent["params"]["check_in"],
                            check_out=intent["params"]["check_out"],
                            adults=intent["params"].get("adults", 1),
                            radius=intent["params"].get("radius", 50),
                            price_range=intent["params"].get("price_range")
                        )
                        logger.info(f"Amadeus hotel search returned count={(amadeus_data or {}).get('count')}")
                    elif intent["type"] == "activity_search":
                        logger.info(f"Calling activity search with params: {intent['params']}")
                        if "latitude" in intent["params"] and "longitude" in intent["params"]:
                            amadeus_data = await amadeus_service.search_activities(
                                latitude=float(intent["params"]["latitude"]),
                                longitude=float(intent["params"]["longitude"]),
                                radius=intent["params"].get("radius", 20)
                            )
                        else:
                            # For city-based activity search, we'd need to get coordinates first
                            logger.warning("Activity search requires coordinates")
                            amadeus_data = {"error": "Activity search requires location coordinates"}
                    elif intent["type"] == "flight_inspiration":
                        logger.info(f"Calling flight inspiration with params: {intent['params']}")
                        amadeus_data = await amadeus_service.get_flight_inspiration(
                            origin=intent["params"]["origin"],
                            max_price=intent["params"].get("max_price"),
                            departure_date=intent["params"].get("departure_date")
                        )
                        logger.info(f"Amadeus flight inspiration returned count={(amadeus_data or {}).get('count')}")
                    elif intent["type"] == "location_search":
                        logger.info(f"Calling location search with params: {intent['params']}")
                        amadeus_data = await amadeus_service.get_airport_city_search(
                            keyword=intent["params"]["keyword"]
                        )
                        logger.info(f"Amadeus location search returned count={(amadeus_data or {}).get('count')}")
                    
                    # Cache the response
                    if amadeus_data and not amadeus_data.get('error'):
                        cache_manager.set(session_id, intent["type"], cache_key_params, amadeus_data)
                        logger.info(f"Cached {intent['type']} data for session {session_id}")
                        
                except Exception as e:
                    logger.error(f"Amadeus API call failed: {e}")
                    amadeus_data = {"error": f"API call failed: {str(e)}"}
                    
        # Add fallback for when no data is fetched but intent was detected
        elif intent["type"] != "general" and intent["confidence"] > 0.5:
            logger.warning(f"Intent detected but no API call made: {intent}")
            amadeus_data = {"error": "Unable to fetch real-time data. Please try rephrasing your request with specific dates and locations."}
        
        # Generate response using OpenAI
        try:
            # Create system prompt with context and data
            system_prompt = create_system_prompt(req.context, amadeus_data)
            
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    *req.messages
                ],
                temperature=0.7,
                max_tokens=1000
            )
            
            reply = response.choices[0].message.content
            logger.info(f"Generated reply: {reply[:100]}...")
            
            # Post-process the reply to format place names with bold and underlined text
            reply = format_place_names(reply)
            
        except Exception as e:
            logger.error(f"OpenAI API error: {e}")
            if has_flight_keywords:
                reply = "I found some great flight options for you! Check out the dashboard for detailed information, prices, and booking options."
            else:
                reply = "I'm sorry, I'm having trouble processing your request right now. Please try again."
            
        return {
            "reply": reply,
            "session_id": session_id,
            "intent_detected": intent["type"],
            "data_fetched": amadeus_data is not None and not amadeus_data.get('error'),
            "amadeus_data": amadeus_data if amadeus_data is not None else None
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in chat endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

def transform_amadeus_data(raw_data, route_info, departure_date):
    """Transform Amadeus API data to match frontend dashboard format"""
    from datetime import datetime, timedelta
    import random
    
    flights = []
    airlines = ['Delta Airlines', 'United Airlines', 'American Airlines', 'Southwest Airlines', 'JetBlue Airways', 'Spirit Airlines']
    
    # Transform each flight offer
    for i, offer in enumerate(raw_data.get('flights', [])[:6]):  # Limit to 6 flights
        price = float(offer.get('price', 0))
        currency = offer.get('currency', 'USD')
        
        # Get first itinerary (outbound flight)
        itinerary = offer.get('itineraries', [{}])[0]
        segments = itinerary.get('segments', [])
        
        if segments:
            first_segment = segments[0]
            last_segment = segments[-1]
            
            # Format times
            departure_time = first_segment.get('departure', {}).get('time', '')
            arrival_time = last_segment.get('arrival', {}).get('time', '')
            
            # Convert ISO time to readable format
            if departure_time:
                try:
                    dt = datetime.fromisoformat(departure_time.replace('Z', '+00:00'))
                    departure_time = dt.strftime('%I:%M %p').lstrip('0')
                except:
                    departure_time = f"{random.randint(6, 22):02d}:{random.choice(['00', '15', '30', '45'])}"
            
            if arrival_time:
                try:
                    dt = datetime.fromisoformat(arrival_time.replace('Z', '+00:00'))
                    arrival_time = dt.strftime('%I:%M %p').lstrip('0')
                except:
                    arrival_time = f"{random.randint(8, 23):02d}:{random.choice(['00', '15', '30', '45'])}"
            
            # Calculate duration
            duration = itinerary.get('duration', 'PT3H30M')
            if duration.startswith('PT'):
                duration = duration[2:]
                hours = 0
                minutes = 0
                if 'H' in duration:
                    hours = int(duration.split('H')[0])
                    duration = duration.split('H')[1]
                if 'M' in duration:
                    minutes = int(duration.split('M')[0])
                duration = f"{hours}h {minutes}m"
            
            # Count stops
            stops = len(segments) - 1
            
            # Get airline name
            carrier_code = first_segment.get('airline', '')
            airline_name = airlines[i % len(airlines)]  # Fallback to predefined list
            
            flight = {
                "id": str(i + 1),
                "airline": airline_name,
                "flightNumber": f"{carrier_code}{random.randint(1000, 9999)}" if carrier_code else f"FL{random.randint(1000, 9999)}",
                "departure": departure_time,
                "arrival": arrival_time,
                "duration": duration,
                "price": int(price),
                "isOptimal": i == 0,  # First flight is optimal
                "stops": stops,
                "origin": first_segment.get('departure', {}).get('airport', route_info['departureCode']),
                "destination": last_segment.get('arrival', {}).get('airport', route_info['destinationCode'])
            }
            flights.append(flight)
    
    # Generate price data for the next 7 days
    price_data = []
    base_price = int(price) if price > 0 else 400
    base_date = datetime.strptime(departure_date, '%Y-%m-%d')
    
    for i in range(7):
        date = (base_date + timedelta(days=i)).strftime("%b %d")
        price_variation = base_price + random.randint(-50, 100)
        optimal_price = base_price - 20
        price_data.append({
            "date": date,
            "price": price_variation,
            "optimal": optimal_price
        })
    
    return {
        "flights": flights,
        "priceData": price_data,
        "route": {
            "departure": route_info['departure'],
            "destination": route_info['destination'],
            "departureCode": route_info['departureCode'],
            "destinationCode": route_info['destinationCode'],
            "date": base_date.strftime("%b %d, %Y")
        },
        "hasRealData": True,
        "message": f"Here are real flight options from {route_info['departure']} to {route_info['destination']}! Check out the dashboard for detailed information, prices, and booking options."
    }

def get_city_name_from_code(code):
    """Get city name from airport code"""
    airport_codes = {
        'JFK': 'New York', 'LAX': 'Los Angeles', 'ORD': 'Chicago', 'DFW': 'Dallas',
        'ATL': 'Atlanta', 'DEN': 'Denver', 'SFO': 'San Francisco', 'SEA': 'Seattle',
        'MIA': 'Miami', 'BOS': 'Boston', 'LAS': 'Las Vegas', 'PHX': 'Phoenix',
        'IAH': 'Houston', 'MCO': 'Orlando', 'CLT': 'Charlotte', 'DTW': 'Detroit',
        'MSP': 'Minneapolis', 'PHL': 'Philadelphia', 'LGA': 'New York',
        'BWI': 'Baltimore', 'DCA': 'Washington', 'IAD': 'Washington'
    }
    return airport_codes.get(code, code)

def extract_route_from_message(message):
    """Extract route information from user message using dynamic parsing"""
    import re
    
    # Common airport codes and city mappings
    airport_mappings = {
        'miami': 'MIA', 'dfw': 'DFW', 'dallas': 'DFW', 'fort worth': 'DFW',
        'new york': 'JFK', 'nyc': 'JFK', 'jfk': 'JFK', 'lga': 'LGA', 'newyork': 'JFK',
        'los angeles': 'LAX', 'lax': 'LAX', 'la': 'LAX',
        'chicago': 'ORD', 'ord': 'ORD', 'ohare': 'ORD',
        'atlanta': 'ATL', 'atl': 'ATL',
        'denver': 'DEN', 'den': 'DEN',
        'san francisco': 'SFO', 'sfo': 'SFO', 'sf': 'SFO',
        'seattle': 'SEA', 'sea': 'SEA',
        'boston': 'BOS', 'bos': 'BOS',
        'phoenix': 'PHX', 'phx': 'PHX',
        'las vegas': 'LAS', 'las': 'LAS',
        'orlando': 'MCO', 'mco': 'MCO',
        'washington dc': 'DCA', 'washington': 'DCA', 'dc': 'DCA', 'dca': 'DCA',
        'ohio': 'CMH', 'columbus': 'CMH', 'cleveland': 'CLE', 'cincinnati': 'CVG', 'cmh': 'CMH', 'cle': 'CLE', 'cvg': 'CVG',
        'houston': 'IAH', 'iah': 'IAH',
        'detroit': 'DTW', 'dtw': 'DTW',
        'minneapolis': 'MSP', 'msp': 'MSP',
        'philadelphia': 'PHL', 'phl': 'PHL',
        'baltimore': 'BWI', 'bwi': 'BWI',
        'barcelona': 'BCN', 'bcn': 'BCN',
        'madrid': 'MAD', 'mad': 'MAD',
        'london': 'LHR', 'lhr': 'LHR',
        'paris': 'CDG', 'cdg': 'CDG',
        'rome': 'FCO', 'fco': 'FCO',
        'berlin': 'BER', 'ber': 'BER',
        'amsterdam': 'AMS', 'ams': 'AMS',
        'tokyo': 'NRT', 'nrt': 'NRT',
        'mexico city': 'MEX', 'mex': 'MEX'
    }
    
    city_mappings = {
        'miami': 'Miami', 'dfw': 'Dallas', 'dallas': 'Dallas', 'fort worth': 'Dallas',
        'new york': 'New York', 'nyc': 'New York', 'jfk': 'New York', 'lga': 'New York', 'newyork': 'New York',
        'los angeles': 'Los Angeles', 'lax': 'Los Angeles', 'la': 'Los Angeles',
        'chicago': 'Chicago', 'ord': 'Chicago', 'ohare': 'Chicago',
        'atlanta': 'Atlanta', 'atl': 'Atlanta',
        'denver': 'Denver', 'den': 'Denver',
        'san francisco': 'San Francisco', 'sfo': 'San Francisco', 'sf': 'San Francisco',
        'seattle': 'Seattle', 'sea': 'Seattle',
        'boston': 'Boston', 'bos': 'Boston',
        'phoenix': 'Phoenix', 'phx': 'Phoenix',
        'las vegas': 'Las Vegas', 'las': 'Las Vegas',
        'orlando': 'Orlando', 'mco': 'Orlando',
        'washington dc': 'Washington DC', 'washington': 'Washington DC', 'dc': 'Washington DC', 'dca': 'Washington DC',
        'ohio': 'Ohio', 'columbus': 'Ohio', 'cleveland': 'Ohio', 'cincinnati': 'Ohio', 'cmh': 'Ohio', 'cle': 'Ohio', 'cvg': 'Ohio',
        'houston': 'Houston', 'iah': 'Houston',
        'detroit': 'Detroit', 'dtw': 'Detroit',
        'minneapolis': 'Minneapolis', 'msp': 'Minneapolis',
        'philadelphia': 'Philadelphia', 'phl': 'Philadelphia',
        'baltimore': 'Baltimore', 'bwi': 'Baltimore',
        'barcelona': 'Barcelona', 'bcn': 'Barcelona',
        'madrid': 'Madrid', 'mad': 'Madrid',
        'london': 'London', 'lhr': 'London',
        'paris': 'Paris', 'cdg': 'Paris',
        'rome': 'Rome', 'fco': 'Rome',
        'berlin': 'Berlin', 'ber': 'Berlin',
        'amsterdam': 'Amsterdam', 'ams': 'Amsterdam',
        'tokyo': 'Tokyo', 'nrt': 'Tokyo',
        'mexico city': 'Mexico City', 'mex': 'Mexico City'
    }
    
    message_lower = message.lower()
    logger.debug(f"Processing message: '{message_lower}'")
    
    # Improved regex patterns to handle various formats
    # Pattern 1: "flights to X to Y" format (highest priority)
    flights_to_pattern = r'flights?\s+to\s+([a-z\s]+?)\s+to\s+([a-z\s]+?)(?:\s+(?:nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep|oct)[\s\-]*\d+|\s|$)'
    match = re.search(flights_to_pattern, message_lower)
    logger.debug(f"flights_to_pattern match: {match}")
    
    if match:
        origin_city = match.group(1).strip()
        destination_city = match.group(2).strip()
        logger.debug(f"flights_to matched - origin: '{origin_city}', destination: '{destination_city}'")
    else:
        # Pattern 2: "from X to Y" (more flexible with dates)
        from_to_pattern = r'from\s+([a-z\s]+?)\s+to\s+([a-z\s]+?)(?:\s+(?:nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep|oct)[\s\-]*\d+|\s|$)'
        match = re.search(from_to_pattern, message_lower)
        logger.debug(f"from_to_pattern match: {match}")
        
        if match:
            origin_city = match.group(1).strip()
            destination_city = match.group(2).strip()
            logger.debug(f"from_to matched - origin: '{origin_city}', destination: '{destination_city}'")
        else:
            # Pattern 3: "X to Y" but avoid matching "show me" patterns
            to_pattern = r'(?:^|^[^a-z]*)([a-z\s]{2,}?)\s+to\s+([a-z\s]+?)(?:\s+(?:nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep|oct)[\s\-]*\d+|\s|$)'
            match = re.search(to_pattern, message_lower)
            logger.debug(f"to_pattern match: {match}")
            if match:
                origin_city = match.group(1).strip()
                destination_city = match.group(2).strip()
                # Skip if origin contains common phrases that shouldn't be cities
                if not any(phrase in origin_city for phrase in ['show me', 'find me', 'get me', 'need', 'want', 'looking for', 'flights']):
                    print(f"DEBUG: to matched - origin: '{origin_city}', destination: '{destination_city}'")
                else:
                    match = None
            
            if not match:
                # Pattern 4: Handle "to X to Y" format (like "to new york to barcelona")
                to_to_pattern = r'to\s+([a-z\s]+?)\s+to\s+([a-z\s]+?)(?:\s+(?:nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep|oct)[\s\-]*\d+|\s|$)'
                match = re.search(to_to_pattern, message_lower)
                logger.debug(f"to_to_pattern match: {match}")
                if match:
                    origin_city = match.group(1).strip()
                    destination_city = match.group(2).strip()
                    print(f"DEBUG: to_to matched - origin: '{origin_city}', destination: '{destination_city}'")
                else:
                    # Default fallback
                    origin_city = 'new york'
                    destination_city = 'los angeles'
                    print(f"DEBUG: Using fallback - origin: '{origin_city}', destination: '{destination_city}'")
    
    # Map cities to airport codes and proper names
    origin_code = airport_mappings.get(origin_city.lower(), 'JFK')
    destination_code = airport_mappings.get(destination_city.lower(), 'CMH')
    origin_name = city_mappings.get(origin_city.lower(), ' '.join(word.capitalize() for word in origin_city.split()))
    destination_name = city_mappings.get(destination_city.lower(), ' '.join(word.capitalize() for word in destination_city.split()))
    
    return {
        'departure': origin_name,
        'destination': destination_name,
        'departureCode': origin_code,
        'destinationCode': destination_code
    }

def extract_departure_date(message):
    """Extract departure date from user message"""
    import re
    from datetime import datetime, timedelta
    
    message_lower = message.lower()
    
    # Look for date patterns like "10/26 to 10/30" or "Oct 26 to Oct 30"
    date_patterns = [
        r'(\d{1,2})/(\d{1,2})\s+to\s+(\d{1,2})/(\d{1,2})',  # 10/26 to 10/30
        r'(oct|nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep)\s+(\d{1,2})\s+to\s+(oct|nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep)\s+(\d{1,2})',  # Oct 26 to Oct 30
        r'(\d{1,2})/(\d{1,2})',  # Single date 10/26
        r'(oct|nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep)\s+(\d{1,2})',  # Single date Oct 26
    ]
    
    for pattern in date_patterns:
        match = re.search(pattern, message_lower)
        if match:
            if '/' in pattern:  # MM/DD format
                if len(match.groups()) == 2:  # Single date
                    month, day = int(match.group(1)), int(match.group(2))
                else:  # Date range, use first date
                    month, day = int(match.group(1)), int(match.group(2))
                
                # Assume current year
                current_year = datetime.now().year
                try:
                    return datetime(current_year, month, day).strftime("%Y-%m-%d")
                except ValueError:
                    continue
            else:  # Month name format
                month_names = {
                    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
                    'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12
                }
                if len(match.groups()) == 2:  # Single date
                    month = month_names.get(match.group(1), 10)
                    day = int(match.group(2))
                else:  # Date range, use first date
                    month = month_names.get(match.group(1), 10)
                    day = int(match.group(2))
                
                current_year = datetime.now().year
                try:
                    return datetime(current_year, month, day).strftime("%Y-%m-%d")
                except ValueError:
                    continue
    
    # Default to 30 days from now if no date found
    default_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
    logger.debug(f"No date found in message, using default: {default_date}")
    return default_date

def extract_dates_from_message(message):
    """Extract departure and return dates from user message"""
    import re
    from datetime import datetime, timedelta
    
    message_lower = message.lower()
    logger.debug(f"Extracting dates from: '{message_lower}'")
    
    # Enhanced patterns for various date formats (ordered by specificity)
    date_patterns = [
        # Dash format without second month: "dec 10-17" (assume same month) - MOST SPECIFIC FIRST
        r'(\w+)\s+(\d+)\s*-\s*(\d+)',
        # Dash format with concatenated month+day: "dec 10-dec17" (same month)
        r'(\w+)\s+(\d+)\s*-\s*(\w+)(\d+)',
        # Dash format with spaces: "dec 10-dec 17" (same month)
        r'(\w+)\s+(\d+)\s*-\s*(\w+)\s+(\d+)',
        # Dash format with no spaces: "dec10-dec17" (same month) - specific month pattern
        r'\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(\d+)\s*-\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(\d+)\b',
        # Full month names with ordinal numbers: "december 1st to december 5th"
        r'(\w+)\s+(\d+)(?:st|nd|rd|th)?\s+to\s+(\w+)\s+(\d+)(?:st|nd|rd|th)?',
        # Full month names: "december 1 to december 5"
        r'(\w+)\s+(\d+)\s+to\s+(\w+)\s+(\d+)',
        # Abbreviated months with ordinal: "dec 1st to dec 5th"
        r'(\w+)\s+(\d+)(?:st|nd|rd|th)?\s+to\s+(\w+)\s+(\d+)(?:st|nd|rd|th)?',
        # Abbreviated months: "dec 1 to dec 5"
        r'(\w+)\s+(\d+)\s+to\s+(\w+)\s+(\d+)',
        # Dash format with ordinals: "december 1st-december 5th"
        r'(\w+)\s+(\d+)(?:st|nd|rd|th)?\s*-\s*(\w+)\s*(\d+)(?:st|nd|rd|th)?',
        # Dash format: "dec 1-dec 5" (same month, different days)
        r'(\w+)\s+(\d+)\s*-\s*(\w+)\s*(\d+)',
        # Through format: "december 1 through december 5"
        r'(\w+)\s+(\d+)\s+through\s+(\w+)\s+(\d+)',
    ]
    
    match = None
    matched_pattern = None
    for i, pattern in enumerate(date_patterns):
        test_match = re.search(pattern, message_lower)
        if test_match:
            logger.debug(f"Pattern {i} matched: {pattern} -> {test_match.groups()}")
            if not match:  # Use first match
                match = test_match
                matched_pattern = pattern
    
    if match:
        groups = match.groups()
        logger.debug(f"Using pattern: {matched_pattern}")
        logger.debug(f"Date pattern matched: {groups}")
        
        month_names = {
            'jan': 1, 'january': 1, 'feb': 2, 'february': 2, 'mar': 3, 'march': 3,
            'apr': 4, 'april': 4, 'may': 5, 'jun': 6, 'june': 6,
            'jul': 7, 'july': 7, 'aug': 8, 'august': 8, 'sep': 9, 'september': 9,
            'oct': 10, 'october': 10, 'nov': 11, 'november': 11, 'dec': 12, 'december': 12
        }
        
        if len(groups) == 4:
            # Format: "dec 10-dec 17" or "december 1 to december 5" or "dec 10-dec17"
            month1, day1, month2, day2 = groups
            # Extract day numbers (remove ordinal suffixes if present)
            day1 = int(re.sub(r'(st|nd|rd|th)$', '', day1))
            day2 = int(re.sub(r'(st|nd|rd|th)$', '', day2))
            
            # Check if this is one of the special concatenated formats
            if matched_pattern in [r'(\w+)\s+(\d+)\s*-\s*(\w+)(\d+)', r'\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(\d+)\s*-\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(\d+)\b']:
                # For "dec 10-dec17" or "dec10-dec17", we need to handle concatenated month+day
                logger.debug(f"Concatenated format detected: {month1} {day1}-{month2}{day2}")
                
                # Check if month2 starts with month1 (e.g., "dec1" starts with "dec")
                if month2.lower().startswith(month1.lower()):
                    # This is the concatenated format like "dec 10-dec17" -> "dec", "10", "dec1", "7"
                    # We need to extract the correct day from the concatenated part
                    remaining_part = month2[len(month1):]  # "1" from "dec1"
                    actual_day2_str = remaining_part + str(day2)  # "1" + "7" = "17"
                    logger.debug(f"Reconstructed: month1={month1}, day1={day1}, month2={month1}, day2={actual_day2_str}")
                    
                    month1_num = month_names.get(month1.lower(), 11)
                    month2_num = month1_num  # Same month
                    day2 = int(actual_day2_str)  # Update day2 with the correct value
                else:
                    # Regular case where months are different
                    month1_num = month_names.get(month1.lower(), 11)
                    month2_num = month_names.get(month2.lower(), 11)
            elif matched_pattern == r'(\w+)\s+(\d+)\s*-\s*(\w+)\s+(\d+)':
                # For "dec 10-dec 17" format (with spaces)
                logger.debug(f"Spaced format detected: {month1} {day1}-{month2} {day2}")
                
                # Check if both months are the same
                if month1.lower() == month2.lower():
                    month1_num = month_names.get(month1.lower(), 11)
                    month2_num = month1_num  # Same month
                    logger.debug(f"Same month detected: {month1}")
                else:
                    month1_num = month_names.get(month1.lower(), 11)
                    month2_num = month_names.get(month2.lower(), 11)
            else:
                # Regular 4-group format
                month1_num = month_names.get(month1.lower(), 11)
                month2_num = month_names.get(month2.lower(), 11)
        elif len(groups) == 3:
            # Format: "dec 10-17" (same month, different days)
            month1, day1, day2 = groups
            # Extract day numbers (remove ordinal suffixes if present)
            day1 = int(re.sub(r'(st|nd|rd|th)$', '', day1))
            day2 = int(re.sub(r'(st|nd|rd|th)$', '', day2))
            
            month1_num = month_names.get(month1.lower(), 11)
            month2_num = month1_num  # Same month for both dates
        
        # Use current year
        current_year = datetime.now().year
        departure_date = datetime(current_year, month1_num, day1)
        return_date = datetime(current_year, month2_num, day2)
        
        departure_display = departure_date.strftime("%b %d, %Y")
        return_display = return_date.strftime("%b %d, %Y")
        
        return {
            'departure_date': departure_date.strftime("%Y-%m-%d"),
            'return_date': return_date.strftime("%Y-%m-%d"),
            'departure_display': departure_display,
            'return_display': return_display
        }
    
    return {}

def calculate_value_score(flight):
    """Calculate a value score for a flight (lower is better)"""
    price = flight.get('price', 1000)
    duration_str = flight.get('duration', '0h 0m')
    stops = flight.get('stops', 3)
    
    # Parse duration (e.g., "7h 30m" -> 7.5 hours)
    duration_hours = 0
    if 'h' in duration_str:
        hours_part = duration_str.split('h')[0]
        duration_hours = float(hours_part.strip())
        if 'm' in duration_str:
            mins_part = duration_str.split('h')[1].split('m')[0]
            duration_hours += float(mins_part.strip()) / 60
    
    # Value score: price + (duration * 20) + (stops * 50)
    # Lower score = better value
    value_score = price + (duration_hours * 20) + (stops * 50)
    return value_score

def generate_flights_for_route(origin, destination, origin_code, dest_code, date, is_return=False):
    """Generate flights for a specific route and date"""
    import random
    
    airlines = ['Delta Airlines', 'United Airlines', 'American Airlines', 'Southwest Airlines', 'JetBlue Airways', 'Spirit Airlines', 'Alaska Airlines', 'Frontier Airlines', 'Hawaiian Airlines', 'Virgin America']
    
    flights = []
    for i in range(6):
        airline = random.choice(airlines)
        price = random.randint(200, 900)
        duration_hours = random.randint(2, 8)
        duration_mins = random.randint(0, 59)
        duration = f"{duration_hours}h {duration_mins}m"
        stops = random.randint(0, 2)
        
        departure_hour = random.randint(6, 22)
        departure_min = random.choice(['00', '15', '30', '45'])
        arrival_hour = (departure_hour + duration_hours) % 24
        arrival_min = departure_min
        
        flight = {
            "id": f"{'return' if is_return else 'outbound'}_{i + 1}",
            "airline": airline,
            "flightNumber": f"{airline.split()[0][:2].upper()}{random.randint(1000, 9999)}",
            "departure": f"{departure_hour:02d}:{departure_min}",
            "arrival": f"{arrival_hour:02d}:{arrival_min}",
            "duration": duration,
            "price": price,
            "stops": stops,
            "origin": origin_code,
            "destination": dest_code,
            "isOptimal": False  # Will be set later
        }
        flights.append(flight)
    
    return flights

def generate_mock_flight_data(route_info=None, user_message=""):
    """Generate enhanced mock flight data with separate outbound/return flights and best combinations"""
    import random
    from datetime import datetime, timedelta
    
    logger.debug(f"generate_mock_flight_data called with route_info: {route_info}")
    
    # Extract dates from user message
    date_info = extract_dates_from_message(user_message)
    
    # Use provided dates or generate random dates
    if route_info and 'departure_date' in route_info:
        departure_date = route_info['departure_date']
        return_date = route_info['return_date']
        departure_display = route_info.get('departure_display', departure_date)
        return_display = route_info.get('return_display', return_date)
        print(f"DEBUG: Using provided dates - departure: {departure_date}, return: {return_date}")
    else:
        # Generate random dates as fallback
        base_date = datetime.now() + timedelta(days=random.randint(1, 30))
        departure_date = base_date.strftime("%Y-%m-%d")
        return_date = (base_date + timedelta(days=random.randint(1, 7))).strftime("%Y-%m-%d")
        departure_display = base_date.strftime("%b %d, %Y")
        return_display = (base_date + timedelta(days=random.randint(1, 7))).strftime("%b %d, %Y")
        print(f"DEBUG: Using random dates - departure: {departure_date}, return: {return_date}")
    
    # Use provided route info or fallback to random route
    if route_info:
        route = route_info
        logger.debug(f"Using provided route: {route}")
    else:
        # Fallback route combinations
        route_combinations = [
            {"departure": "New York", "destination": "Los Angeles", "departureCode": "JFK", "destinationCode": "LAX"},
            {"departure": "Chicago", "destination": "Miami", "departureCode": "ORD", "destinationCode": "MIA"},
            {"departure": "San Francisco", "destination": "New York", "departureCode": "SFO", "destinationCode": "JFK"},
            {"departure": "Seattle", "destination": "Denver", "departureCode": "SEA", "destinationCode": "DEN"},
            {"departure": "Boston", "destination": "Las Vegas", "departureCode": "BOS", "destinationCode": "LAS"},
            {"departure": "Atlanta", "destination": "Phoenix", "departureCode": "ATL", "destinationCode": "PHX"},
            {"departure": "Dallas", "destination": "Seattle", "departureCode": "DFW", "destinationCode": "SEA"},
            {"departure": "Miami", "destination": "Chicago", "departureCode": "MIA", "destinationCode": "ORD"}
        ]
        route = random.choice(route_combinations)
    
    # Generate outbound flights (X to Y)
    outbound_flights = generate_flights_for_route(
        route['departure'], route['destination'], 
        route['departureCode'], route['destinationCode'], 
        departure_date, is_return=False
    )
    
    # Generate return flights (Y to X)
    return_flights = generate_flights_for_route(
        route['destination'], route['departure'], 
        route['destinationCode'], route['departureCode'], 
        return_date, is_return=True
    )
    
    # Find best value flights from each direction
    best_outbound = min(outbound_flights, key=calculate_value_score)
    best_return = min(return_flights, key=calculate_value_score)
    
    # Mark the best value flights as optimal
    for flight in outbound_flights:
        flight['isOptimal'] = flight == best_outbound
    for flight in return_flights:
        flight['isOptimal'] = flight == best_return
    
    # Create best combination
    total_price = best_outbound['price'] + best_return['price']
    savings_amount = random.randint(50, 150)
    best_combination = {
        'outbound': best_outbound,
        'return': best_return,
        'totalPrice': total_price,
        'savings': f"Save up to 15% when booking together"
    }
    
    # Combine all flights for backward compatibility
    flights = outbound_flights + return_flights
    
    # Generate consistent price data for the next 7 days
    price_data = []
    base_price = random.randint(250, 600)  # More varied base price
    
    for i in range(7):
        date = (datetime.now() + timedelta(days=i)).strftime("%b %d")
        price_variation = random.randint(-50, 100)
        price = max(200, base_price + price_variation)
        optimal = max(180, base_price - random.randint(10, 40))
        price_data.append({
            "date": date,
            "price": price,
            "optimal": optimal
        })
    
    return {
        "outboundFlights": outbound_flights,
        "returnFlights": return_flights,
        "bestCombination": best_combination,
        "flights": flights,  # Keep for backward compatibility
        "priceData": price_data,
        "route": {
            "departure": route["departure"],
            "destination": route["destination"], 
            "departureCode": route["departureCode"],
            "destinationCode": route["destinationCode"],
            "date": departure_display,
            "departure_date": departure_date,
            "return_date": return_date,
            "departure_display": departure_display,
            "return_display": return_display
        },
        "hasRealData": False,
        "message": f"Here are great flight options from {route['departure']} to {route['destination']}! Check out the dashboard for detailed information, prices, and booking options."
    }

def _is_iata_code(code: str) -> bool:
    """Check if a string is likely an IATA code (3 letters)"""
    if not code:
        return False
    return len(code) == 3 and code.isalpha() and code.isupper()

# Vercel handles port configuration automatically

# For Vercel deployment, we need to export the app
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)


