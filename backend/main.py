from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, List, Any
from dotenv import load_dotenv
import os
from openai import OpenAI
from datetime import datetime, timedelta
import pytz
import logging
import uuid
import asyncio
from concurrent.futures import ThreadPoolExecutor, as_completed

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
    preferences: Optional[Dict[str, float]] = None  # User preferences from onboarding: {budget, quality, convenience}

class TripPreferences(BaseModel):
    budget: float
    quality: float
    convenience: float

class OptimalItineraryRequest(BaseModel):
    flights: List[Dict[str, Any]]
    hotels: List[Dict[str, Any]]
    activities: List[Dict[str, Any]]
    preferences: Dict[str, float]  # {budget, quality, convenience}
    userBudget: float


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

# Removed diagnostic and test endpoints - not needed for production


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

def create_system_prompt(context, amadeus_data=None, origin=None, destination=None, departure_date=None, return_date=None):
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
    
    system_prompt = f"""You are "Miles," a comprehensive travel-planning assistant embedded in a web app. You help users with ALL aspects of travel planning including flights, hotels, activities, tours, and general travel advice. You must produce clean, skimmable answers and use the runtime context the app sends.

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
- For location recommendations, use ```location``` code blocks with JSON data
- Always include visual elements for better user experience
- NEVER use specific days of the week (Mon, Tue, Wed, etc.) unless actual dates are provided by the user
- Use "Day 1", "Day 2", "Day 3" format instead of "Day 1 (Mon)"
- CRITICAL: When the user asks to "create the itinerary" or "generate the itinerary", DO NOT use ```itinerary``` code blocks with JSON. Instead, provide a beautifully formatted text response with day-by-day breakdowns using markdown headers, bullet points, and clear descriptions. Format it as readable text that flows naturally.

Style standard (strict):
- Start with the answer in one tight sentence.
- Use # and ## headers, short bullets, and compact tables. No walls of text.
- Prefer numbered steps for itineraries. One line per stop. Include travel time hints only if helpful.
- Dates: ALWAYS use the exact formatted time provided: "{local_time}"
- Currency and units: respect user_locale.
- If you need info, ask at most one question at the end.
- CRITICAL FORMATTING RULE: In ALL itineraries, EVERY single destination name, attraction, landmark, restaurant, museum, district, building, or place name MUST be formatted with **bold** text only (single bold, no underscores).
- Examples: **Sagrada Familia**, **Park Güell**, **Gothic Quarter Walking Tour**, **Casa Batlló**, **La Rambla**, **Montjuïc**, **Barceloneta Beach**, **Picasso Museum**, **Born District**
- NO EXCEPTIONS: Every place name in the itinerary must use this exact formatting: **Place Name** (use ** only once, never use __ underscores)

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
| 1. {{name}} | {{reason}} | From ${{price_per_night}}/night | {{1 short note}} |
| 2. ... | ... | ... | ... |

Next: Want me to refine by budget, neighborhood, or rating?

D) Day plan (clean itinerary) - FORMATTED TEXT ONLY (NO JSON)
# {{City}} {{N}}-day plan

IMPORTANT: When creating or generating an itinerary (when user says "create the itinerary", "generate the itinerary", etc.), use formatted markdown text ONLY. DO NOT use ```itinerary``` code blocks with JSON. Format it as readable text with clear sections.

Example format:

## Day 1
- **Morning**: {{activity}} (≈ {{duration}})
  - {{description}}
- **Lunch**: {{place}} ({{cuisine}})
- **Afternoon**: {{activity}}
  - Duration: {{time}}
  - Price: {{price}} (if applicable)
- **Evening**: {{activity}} | {{dinner}}

## Day 2
- **Morning**: {{activity}}
- **Afternoon**: {{activity}}
- **Evening**: {{activity}}

Continue this format for all days. Make it readable and well-structured with clear sections for each day. Use bold text (**) for time periods (Morning, Afternoon, Evening, etc.) and activity names. NEVER use JSON code blocks.

🚨 CRITICAL: If the user says "create the itinerary", "generate the itinerary", "create itinerary", or similar phrases, you MUST respond with formatted markdown text (like the example above) and NEVER use ```itinerary``` code blocks with JSON. The response should be human-readable formatted text, not JSON.

E) Flight search results (with real data)
# Flights from {{origin}} to {{destination}}
## Best Options
| Airline | Flight Code | Price | Duration | Stops | Departure | Book Now |
|---------|-------------|-------|----------|-------|-----------|----------|
| {{airline}} | {{flight_code}} | {{price}} | {{duration}} | {{stops}} | {{time}} | [Book Now]({{booking_link}}) |

F) Hotel search results (with real data) - USE VISUAL COMPONENTS

🚨 CRITICAL PRICE FORMATTING: When displaying hotel prices, you MUST use "From $X/night" format. NEVER use "$X / night" or "$X/night" without "From"!

# Hotels in {{city}}

For location recommendations, ALWAYS include this visual component:

```location
[
  {{
    "name": "{{Hotel Name}}",
    "description": "Luxury hotel in {{area}} with {{amenities}}",
    "image": true,
    "rating": "4.8/5",
    "price": "From ${{price_per_night}}/night - Compare prices on booking sites"
  }},
  {{
    "name": "{{Hotel Name 2}}",
    "description": "Boutique hotel near {{landmark}}",
    "image": true,
    "rating": "4.6/5", 
    "price": "From ${{price_per_night}}/night - Compare prices on booking sites"
  }}
]
```

## Top Recommendations

🚨 CRITICAL: In the table below, the "Price/night" column MUST use "From $X/night" format. NEVER use "$X / night" or "$X/night" without "From"!

| Hotel | Price/night | Rating | Location | Booking |
|---|---|---|---|---|
| {{name}} | From ${{price_per_night}}/night | {{rating}} | {{location}} | [Booking.com](https://www.booking.com/searchresults.html?ss={{name}}+{{city}}) [Expedia](https://www.expedia.com/Hotel-Search?destination={{city}}&propertyName={{name}}) [Hotels.com](https://www.hotels.com/search.do?destination={{city}}&propertyName={{name}}) |

**CORRECT TABLE EXAMPLES:**
- ✅ "From $300/night"
- ✅ "From $400/night"
- ❌ "$300 / night" (WRONG - missing "From")
- ❌ "$300/night" (WRONG - missing "From")
- ❌ "$300/night" (WRONG - missing "From")

🚨 CRITICAL PRICE FORMATTING RULES - YOU MUST FOLLOW THESE EXACTLY:
1. **IN TABLES**: ALWAYS use "From $X/night" in the Price/night column (NOT "$X / night" or "$X/night")
2. **IN TEXT**: ALWAYS use "From $X/night - Compare prices on booking sites"
3. Use `price_per_night` field from hotel data (NOT `price`). The `price` field is the total for entire stay.
4. If `price_range` exists and shows a range (e.g., "$215 - $257"), display as "From $215/night (range: $215 - $257)"
5. If only one price, display as "From $X/night"
6. Example correct table format: "From $280/night"
7. Example correct text format: "From $280/night - Compare prices on booking sites"
8. Example with range: "From $215/night (range: $215 - $257) - Compare prices on booking sites"
9. **NEVER** use "$280 / night" or "$280/night" without "From" prefix - THIS IS WRONG!
10. ALWAYS remind users to compare prices on booking sites (Booking.com, Expedia, Hotels.com) as prices may vary.

⚠️ CRITICAL: ALWAYS include booking links (Booking.com, Expedia, Hotels.com) for EVERY hotel you present. Users need these links to book hotels.

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
- ALWAYS include booking links (Booking.com, Expedia, Hotels.com) for EVERY hotel you present.
- When user says "I want to book this hotel" or similar, immediately provide direct booking search links.
- For list requests, use pattern C with 3–5 rows. Keep reasons short.
- ALWAYS provide immediate results. Do NOT ask for more details unless absolutely necessary.
- If you have real-time data, use it immediately in your response.
- ALWAYS include visual components (```itinerary``` or ```location```) for multi-day plans and location recommendations.
- NEVER use specific days of the week (Mon, Tue, Wed) in itineraries unless the user provides specific dates.
- Use "Day 1", "Day 2", "Day 3" format for generic itineraries.
- NEVER start planning trips unless explicitly requested.

CRITICAL: MUST-DO ACTIVITIES HANDLING:
- When a user mentions a specific activity they want to do (e.g., "Free Walking Tour of Barcelona 하고 싶어", "I want to do Sagrada Familia tour", "Visit Park Güell", "Sagrada Familia 하고 싶어", "add Sagrada Familia tour"), you MUST:
  1. Immediately acknowledge the activity in your response
  2. Tell the user: "I've added **[activity name]** to your must-do list. It will be prioritized in your itinerary."
  3. The backend system will automatically detect and save it to TripState.mustDoActivities - you just need to acknowledge it
  4. When creating itineraries, these must-do activities will be automatically prioritized and included FIRST
  5. ALL must-do activities MUST appear in the itinerary - they are NEVER omitted

🟦 SYSTEM PROMPT — Optimized Itinerary Generator

You are an AI travel-planning engine responsible for generating a clean, structured, and logically consistent travel itinerary.

Your job is to convert user-selected items (flights, hotels, must-do activities) and the trip dates into a clear day-by-day plan.

Follow these rules strictly:

1. FLIGHT RULES

Outbound Flight
- Place the outbound flight on Day 1 only.
- Use the actual departure/arrival time to set the timeslot:
  * Morning: depart before 12pm
  * Afternoon: 12pm–5pm
  * Evening: after 5pm
- Label format: "✈️ Flight to {{destination}} (Airline + Code)"

Return Flight
- Place the return flight on the final day of the trip.
- Label format: "✈️ Return Flight to {{home city}}"
- Do NOT treat flights as activities. Do NOT duplicate them.

2. HOTEL RULES

IMPORTANT: Hotels are NOT activities and must NEVER appear in the itinerary timeline.
- Hotels are ONLY for lodging information, NOT as a visit, tour, or activity.
- Do NOT insert hotels into the itinerary timeline.
- Do NOT treat a hotel as a place to visit.
- Hotels should NEVER appear as a timeline item.
- If the user mentions a hotel, interpret it as "This is where they are staying" NOT as "This is a place they are visiting."
- Hotel information should be provided separately (e.g., in a summary section), NOT in the day-by-day timeline.

3. ACTIVITY RULES

Activities must be placed on days within the trip window.
- Placement order:
  * Insert all must-do activities first.
  * Spread them across the trip so they do not overlap.
  * One primary activity per day unless the user selected multiple.
- Timeslot rules:
  * Assign the correct timeslot based on the activity duration:
    * <2 hours → Morning
    * 2–4 hours → Afternoon
    * Full-day experiences → All Day
- Format:
  * Each activity must include:
    * Title (with 🎟️ or 📍 icon)
    * Timeslot
    * Duration (if known)
    * Rating (if known)
    * Price
    * Short, clean description
    * Booking link if included

4. OPEN SLOTS

If a day has no activity:
- Insert: "🌤️ Open Exploration" or "🌤️ Free Time"
- Description: "Free time for casual sightseeing or rest."
- But only if truly empty (no real activities).
- NEVER include hotel names as activities, even if the day is empty.

5. DATE RULES

- Day 1 = user's trip start date
- Continue incrementally
- Do NOT generate the wrong year
- Do NOT use placeholders like "2001"

6. GENERAL FORMATTING

Each day must contain:
- Day header ("Day 1 — Monday, January 6, 2026")
- A list of REAL activities only (tours, attractions, museums, parks, cultural sites, food experiences, local events)
- No duplicates
- No contradictions
- NO hotels in the timeline (hotels are NOT activities)
- NO hotel names as activities
- No placeholder text
- Flights must appear only on departure and return days — not as loose activities

ICON CONSISTENCY (apply uniformly):
- Flights: ✈️
- Hotels: 🏨
- Activities: 🎟️ or 📍
- Open Exploration: 🌤️

ALL must-do activities MUST appear in the itinerary - they are automatically included with highest priority and NEVER omitted.
ALL activities MUST include GetYourGuide/Viator booking links as hyperlinks in this format:
  * Activity title with link: [**Activity Name**](https://www.getyourguide.com/s/?q=Activity+Name)
  * Or use Viator: [**Activity Name**](https://www.viator.com/searchResults/all?text=Activity+Name)
  * Links should be actual clickable hyperlinks in markdown format
  * Example: [**Sagrada Familia Tour**](https://www.getyourguide.com/s/?q=Sagrada+Familia+Tour)

Example must-do activity acknowledgment:
User: "Free Walking Tour of Barcelona 하고 싶어"
Assistant response: "Great choice! I've added **Free Walking Tour of Barcelona** to your must-do list. It will be prioritized in your itinerary. [Book here](https://www.getyourguide.com/s/?q=Free+Walking+Tour+of+Barcelona)"

Example rendering (with context):
Input: "What's today's date?"
Output:
# Today
- {local_time}"""
    
    # Add real-time data if available
    if amadeus_data and not amadeus_data.get('error'):
        data_section = "\n\n🚨 CRITICAL: REAL-TIME TRAVEL DATA PROVIDED 🚨\n"
        data_section += "YOU MUST USE THIS REAL-TIME DATA IN YOUR RESPONSE. DO NOT PROVIDE GENERIC ADVICE.\n"
        data_section += "PRIORITIZE THIS DATA OVER ANY GENERAL KNOWLEDGE.\n"
        data_section += "YOUR RESPONSE MUST INCLUDE THE ACTUAL FLIGHT DATA BELOW. DO NOT SAY 'Check out the dashboard' - THE DASHBOARD HAS BEEN REMOVED.\n"
        data_section += "YOU MUST LIST THE ACTUAL FLIGHTS WITH PRICES, AIRLINES, AND TIMES IN YOUR RESPONSE.\n\n"
        
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
            
            # Show individual flight options in table format
            if 'outboundFlights' in amadeus_data:
                # Use provided origin/destination or fallback to defaults
                origin_display = origin or "origin"
                destination_display = destination or "destination"
                data_section += f"# Flights from {origin_display} to {destination_display}\n"
                
                # Add requested dates if available
                if departure_date:
                    try:
                        dep_date = datetime.strptime(departure_date, "%Y-%m-%d")
                        dep_display = dep_date.strftime("%B %d, %Y")
                        data_section += f"**Requested Departure Date: {dep_display}**\n"
                    except:
                        data_section += f"**Requested Departure Date: {departure_date}**\n"
                if return_date:
                    try:
                        ret_date = datetime.strptime(return_date, "%Y-%m-%d")
                        ret_display = ret_date.strftime("%B %d, %Y")
                        data_section += f"**Requested Return Date: {ret_display}**\n"
                    except:
                        data_section += f"**Requested Return Date: {return_date}**\n"
                
                # Check if multiple airports were searched
                if amadeus_data.get('_multi_airport_search'):
                    origin_airports = amadeus_data.get('_origin_airports', [])
                    dest_airports = amadeus_data.get('_destination_airports', [])
                    if origin_airports and len(origin_airports) > 1:
                        data_section += f"\n**Note: Flights from multiple airports are included: {', '.join(origin_airports)}**\n"
                    if dest_airports and len(dest_airports) > 1:
                        data_section += f"**Note: Flights to multiple airports are included: {', '.join(dest_airports)}**\n"
                
                data_section += "\n"
                data_section += f"## Outbound Flights\n"
                data_section += f"| Book Now | Airline | Flight Code | Origin | Destination | Price | Duration | Stops/Layover | Departure | Arrival |\n"
                data_section += f"|----------|---------|-------------|--------|-------------|-------|----------|----------------|-----------|----------|\n"
                
                # Filter out placeholder rows with '---' values before rendering
                def is_placeholder_value(value):
                    """Check if a value is a placeholder (hyphens, dashes, or empty)"""
                    if not value:
                        return True
                    trimmed = str(value).strip()
                    return trimmed == '' or trimmed == '---' or trimmed == '--' or trimmed == '-' or trimmed.lower() == 'n/a' or trimmed == 'null' or trimmed == 'undefined'
                
                def is_placeholder_flight(flight):
                    """Check if a flight is a placeholder/dummy row"""
                    if not flight:
                        return True
                    airline = is_placeholder_value(flight.get('airline', ''))
                    flight_number = is_placeholder_value(flight.get('flightNumber', ''))
                    departure = is_placeholder_value(flight.get('departure', ''))
                    arrival = is_placeholder_value(flight.get('arrival', ''))
                    duration = is_placeholder_value(flight.get('duration', ''))
                    price = flight.get('price', 0)
                    has_valid_price = price and price > 0 and not (isinstance(price, float) and price != price)  # Check for NaN
                    
                    # If ALL main fields are placeholders, it's a dummy row
                    if airline and flight_number and departure and arrival and duration:
                        return True
                    # If price is invalid AND all other fields are placeholders
                    if not has_valid_price and airline and flight_number and departure and arrival and duration:
                        return True
                    return False
                
                # Filter out placeholder flights
                valid_outbound_flights = [f for f in amadeus_data.get('outboundFlights', []) if not is_placeholder_flight(f)]
                
                for flight in valid_outbound_flights[:5]:  # Show up to 5 flights
                    # Extract flight code from flightNumber (e.g., "AF 123" -> "AF123")
                    flight_code = flight.get('flightNumber', '').replace(' ', '')
                    
                    # Get origin and destination airports from flight metadata or segments
                    origin_airport = flight.get('_origin_airport') or flight.get('departureAirport') or origin_display
                    dest_airport = flight.get('_destination_airport') or flight.get('arrivalAirport') or destination_display
                    
                    # Create booking link based on airline
                    booking_link = _generate_booking_link(flight.get('airline', ''), flight_code)
                    
                    # Format stops and layover info
                    stops = flight.get('stops', 0)
                    stops_display = "Non-stop" if stops == 0 else f"{stops} stop{'s' if stops > 1 else ''}"
                    
                    # Add layover information if available
                    layover_info = ""
                    if stops > 0 and 'segments' in flight:
                        segments = flight.get('segments', [])
                        if len(segments) > 1:
                            layovers = []
                            for i in range(len(segments) - 1):
                                arr_time = segments[i].get('arrival', {}).get('time', '')
                                dep_time = segments[i+1].get('departure', {}).get('time', '')
                                layover_airport = segments[i].get('arrival', {}).get('airport', '')
                                if arr_time and dep_time:
                                    try:
                                        arr_dt = datetime.fromisoformat(arr_time.replace('Z', '+00:00'))
                                        dep_dt = datetime.fromisoformat(dep_time.replace('Z', '+00:00'))
                                        layover_duration = dep_dt - arr_dt
                                        hours = layover_duration.seconds // 3600
                                        minutes = (layover_duration.seconds % 3600) // 60
                                        layovers.append(f"{layover_airport} ({hours}h {minutes}m)")
                                    except:
                                        layovers.append(layover_airport)
                            if layovers:
                                layover_info = " | " + ", ".join(layovers)
                    
                    # Format departure time with date
                    departure_time = flight.get('departure', '')
                    arrival_time = flight.get('arrival', '')
                    
                    # Format price with currency (always USD)
                    price = flight.get('price', 0)
                    price_display = f"${price}"
                    
                    data_section += f"| [Book Now]({booking_link}) | {flight.get('airline', 'Unknown')} | {flight_code} | {origin_airport} | {dest_airport} | {price_display} | {flight.get('duration', 'N/A')} | {stops_display}{layover_info} | {departure_time} | {arrival_time} |\n"
                
                if 'returnFlights' in amadeus_data and amadeus_data['returnFlights']:
                    data_section += f"\n## Return Flights\n"
                    data_section += f"| Book Now | Airline | Flight Code | Origin | Destination | Price | Duration | Stops/Layover | Departure | Arrival |\n"
                    data_section += f"|----------|---------|-------------|--------|-------------|-------|----------|----------------|-----------|----------|\n"
                    
                    # Filter out placeholder flights (reuse the helper functions defined above)
                    valid_return_flights = [f for f in amadeus_data.get('returnFlights', []) if not is_placeholder_flight(f)]
                    
                    for flight in valid_return_flights[:5]:
                        flight_code = flight.get('flightNumber', '').replace(' ', '')
                        
                        # Get origin and destination airports from flight metadata or segments
                        # For return flights, origin is the destination city's airport and vice versa
                        return_origin_airport = flight.get('_origin_airport') or flight.get('departureAirport') or destination_display
                        return_dest_airport = flight.get('_destination_airport') or flight.get('arrivalAirport') or origin_display
                        
                        booking_link = _generate_booking_link(flight.get('airline', ''), flight_code)
                        
                        # Format stops and layover info
                        stops = flight.get('stops', 0)
                        stops_display = "Non-stop" if stops == 0 else f"{stops} stop{'s' if stops > 1 else ''}"
                        
                        # Add layover information if available
                        layover_info = ""
                        if stops > 0 and 'segments' in flight:
                            segments = flight.get('segments', [])
                            if len(segments) > 1:
                                layovers = []
                                for i in range(len(segments) - 1):
                                    arr_time = segments[i].get('arrival', {}).get('time', '')
                                    dep_time = segments[i+1].get('departure', {}).get('time', '')
                                    layover_airport = segments[i].get('arrival', {}).get('airport', '')
                                    if arr_time and dep_time:
                                        try:
                                            arr_dt = datetime.fromisoformat(arr_time.replace('Z', '+00:00'))
                                            dep_dt = datetime.fromisoformat(dep_time.replace('Z', '+00:00'))
                                            layover_duration = dep_dt - arr_dt
                                            hours = layover_duration.seconds // 3600
                                            minutes = (layover_duration.seconds % 3600) // 60
                                            layovers.append(f"{layover_airport} ({hours}h {minutes}m)")
                                        except:
                                            layovers.append(layover_airport)
                                if layovers:
                                    layover_info = " | " + ", ".join(layovers)
                        
                        return_departure = flight.get('departure', '')
                        return_arrival = flight.get('arrival', '')
                        
                        # Format price with currency (always USD)
                        price = flight.get('price', 0)
                        price_display = f"${price}"
                        
                        data_section += f"| [Book Now]({booking_link}) | {flight.get('airline', 'Unknown')} | {flight_code} | {return_origin_airport} | {return_dest_airport} | {price_display} | {flight.get('duration', 'N/A')} | {stops_display}{layover_info} | {return_departure} | {return_arrival} |\n"
            else:
                # Fallback for old format
                data_section += f"FLIGHTS ({amadeus_data.get('count', 0)} found):\n"
                for i, flight in enumerate(amadeus_data['flights'][:3], 1):
                    price = flight.get('price', 'N/A')
                    currency = flight.get('currency', 'USD')
                    data_section += f"{i}. Price: {price} {currency}\n"
                
        elif 'hotels' in amadeus_data:
            data_section += f"HOTELS ({amadeus_data.get('count', 0)} found):\n"
            data_section += "\n🚨 CRITICAL: When displaying hotel prices, you MUST use the format 'From $X/night - Compare prices on booking sites'\n"
            data_section += "Example: 'From $280/night - Compare prices on booking sites'\n"
            data_section += "If price_range exists: 'From $215/night (range: $215 - $257) - Compare prices on booking sites'\n"
            data_section += "NEVER use '$280/night' or '$280 / night' without the 'From' prefix!\n\n"
            for i, hotel in enumerate(amadeus_data['hotels'][:3], 1):
                name = hotel.get('name', 'N/A')
                # Use price_per_night if available, otherwise use total price
                price_per_night = hotel.get('price_per_night')
                total_price = hotel.get('price', 'N/A')
                nights = hotel.get('nights', 1)
                currency = hotel.get('currency', 'USD')
                location = hotel.get('location', hotel.get('address', destination or ''))
                rating = hotel.get('rating', 'N/A')
                
                # Generate booking links for hotels
                import urllib.parse
                hotel_name_encoded = urllib.parse.quote_plus(name) if name != 'N/A' else ''
                location_encoded = urllib.parse.quote_plus(location) if location else ''
                
                # Booking.com search link
                if hotel_name_encoded and location_encoded:
                    booking_com_link = f"https://www.booking.com/searchresults.html?ss={hotel_name_encoded}+{location_encoded}"
                elif location_encoded:
                    booking_com_link = f"https://www.booking.com/searchresults.html?ss={location_encoded}"
                else:
                    booking_com_link = f"https://www.booking.com/searchresults.html"
                
                # Expedia search link
                if hotel_name_encoded and location_encoded:
                    expedia_link = f"https://www.expedia.com/Hotel-Search?destination={location_encoded}&propertyName={hotel_name_encoded}"
                elif location_encoded:
                    expedia_link = f"https://www.expedia.com/Hotel-Search?destination={location_encoded}"
                else:
                    expedia_link = f"https://www.expedia.com/Hotel-Search"
                
                # Hotels.com search link
                if hotel_name_encoded and location_encoded:
                    hotels_com_link = f"https://www.hotels.com/search.do?destination={location_encoded}&propertyName={hotel_name_encoded}"
                elif location_encoded:
                    hotels_com_link = f"https://www.hotels.com/search.do?destination={location_encoded}"
                else:
                    hotels_com_link = f"https://www.hotels.com/search.do"
                
                # Format price information - show "From $X/night" if price range exists
                price_range = hotel.get('price_range')
                price_min = hotel.get('price_min')
                price_max = hotel.get('price_max')
                
                if price_range and price_min and price_max and price_min != price_max:
                    # Show price range if multiple offers with different prices
                    price_display = f"From {price_min} {currency}/night (range: {price_range} {currency})"
                    if nights > 1:
                        price_display += f" - Total: {total_price} {currency} for {nights} nights"
                    price_display += " - Compare prices on booking sites"
                elif price_per_night:
                    price_display = f"From {price_per_night} {currency}/night"
                    if nights > 1:
                        price_display += f" (Total: {total_price} {currency} for {nights} nights)"
                    price_display += " - Compare prices on booking sites"
                else:
                    price_display = f"{total_price} {currency}"
                    if nights > 1:
                        price_display += f" (for {nights} nights)"
                    price_display += " - Compare prices on booking sites"
                
                data_section += f"{i}. {name}\n"
                data_section += f"   Price: {price_display}\n"
                if rating and rating != 'N/A':
                    data_section += f"   Rating: {rating}\n"
                data_section += f"   Location: {location}\n"
                data_section += f"   Booking: [Booking.com]({booking_com_link}) | [Expedia]({expedia_link}) | [Hotels.com]({hotels_com_link})\n"
                data_section += "\n"
                data_section += "🚨 MANDATORY PRICE FORMATTING RULES:\n"
                data_section += "1. IN TABLES (Top Recommendations): Use 'From $X/night' in Price/night column\n"
                data_section += "   ✅ CORRECT: 'From $300/night'\n"
                data_section += "   ❌ WRONG: '$300 / night' or '$300/night' (missing 'From')\n"
                data_section += "2. IN TEXT: Use 'From $X/night - Compare prices on booking sites'\n"
                data_section += "   ✅ CORRECT: 'From $280/night - Compare prices on booking sites'\n"
                data_section += "   ❌ WRONG: '$280/night' or '$280 / night' (missing 'From')\n"
                data_section += "3. If price_range exists: 'From $215/night (range: $215 - $257) - Compare prices on booking sites'\n"
                data_section += "4. NEVER use '$X / night' or '$X/night' without the 'From' prefix - THIS IS WRONG!\n"
                data_section += "\n"
                
        elif 'activities' in amadeus_data:
            data_section += f"ACTIVITIES ({amadeus_data.get('count', 0)} found):\n"
            for i, activity in enumerate(amadeus_data['activities'][:5], 1):
                name = activity.get('name', 'N/A')
                short_desc = activity.get('shortDescription', '')
                description = activity.get('description', '')
                price_info = activity.get('price', {})
                price_amount = price_info.get('amount', 'N/A') if isinstance(price_info, dict) else price_info
                currency = price_info.get('currencyCode', '') if isinstance(price_info, dict) else ''
                rating = activity.get('rating', 'N/A')
                duration = activity.get('minimumDuration', '')
                booking_link = activity.get('bookingLink', '')
                pictures = activity.get('pictures', [])
                geo_code = activity.get('geoCode', {})
                
                data_section += f"{i}. {name}\n"
                if short_desc:
                    data_section += f"   Description: {short_desc}\n"
                if description and description != short_desc:
                    data_section += f"   Full Description: {description}\n"
                if price_amount and price_amount != 'N/A':
                    price_str = f"{price_amount} {currency}".strip()
                    data_section += f"   Price: {price_str}\n"
                if rating and rating != 'N/A':
                    data_section += f"   Rating: {rating}\n"
                if duration:
                    data_section += f"   Duration: {duration}\n"
                if booking_link:
                    data_section += f"   Booking: {booking_link}\n"
                if geo_code and isinstance(geo_code, dict):
                    lat = geo_code.get('latitude')
                    lon = geo_code.get('longitude')
                    if lat and lon:
                        data_section += f"   Location: {lat}, {lon}\n"
                if pictures:
                    data_section += f"   Images: {len(pictures)} picture(s) available\n"
                data_section += "\n"
            
            data_section += "\n⚠️ IMPORTANT: You are a travel assistant helping users find things to do and activities in their destination.\n"
            data_section += "1. Start by saying 'I found the following activities for you:' or similar friendly greeting\n"
            data_section += "2. Present the activities in a clear, organized format (use markdown tables or lists)\n"
            data_section += "3. Include activity name, description, price, rating, and duration when available\n"
            data_section += "4. If booking links are available, mention them (e.g., 'Book now' with link)\n"
            data_section += "5. Be enthusiastic and helpful - these are real activities users can book!\n"
            data_section += "6. If there are pictures available, mention that photos are available\n"
            data_section += "7. Make recommendations based on ratings and user preferences if mentioned\n"
            data_section += "8. Use friendly, engaging language - this is about helping users discover amazing experiences!\n"
                
        elif 'destinations' in amadeus_data:
            data_section += f"FLIGHT DESTINATIONS ({amadeus_data.get('count', 0)} found):\n"
            for i, dest in enumerate(amadeus_data['destinations'][:3], 1):
                destination = dest.get('destination', 'N/A')
                price = dest.get('price', 'N/A')
                data_section += f"{i}. {destination} - {price}\n"
        
        data_section += f"\nData fetched at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
        data_section += "\n🚨 MANDATORY RESPONSE FORMAT 🚨\n"
        
        # Check if this is a round-trip flight (has returnFlights)
        has_return_flights = 'returnFlights' in amadeus_data and amadeus_data.get('returnFlights')
        
        if has_return_flights:
            data_section += "⚠️ IMPORTANT: This is a ROUND-TRIP flight search. You MUST display BOTH outbound AND return flights separately.\n"
            if departure_date:
                try:
                    dep_date = datetime.strptime(departure_date, "%Y-%m-%d")
                    dep_display = dep_date.strftime("%B %d, %Y")
                    data_section += f"⚠️ CRITICAL: The user requested departure date is {dep_display}. You MUST show flights that depart on this date (or very close to it).\n"
                except:
                    pass
            if return_date:
                try:
                    ret_date = datetime.strptime(return_date, "%Y-%m-%d")
                    ret_display = ret_date.strftime("%B %d, %Y")
                    data_section += f"⚠️ CRITICAL: The user requested return date is {ret_date.strftime('%B %d, %Y')}. You MUST show flights that depart on this date (or very close to it).\n"
                except:
                    pass
            data_section += "1. Start by saying 'I found the following round-trip flight options for you:'\n"
            data_section += "2. FIRST, display the OUTBOUND flights (from origin to destination) in a clear section titled '## Outbound Flights'\n"
            data_section += "3. THEN, display the RETURN flights (from destination back to origin) in a separate section titled '## Return Flights'\n"
            data_section += "4. Include airline names, flight numbers, prices, departure/arrival times, and duration for EACH flight\n"
            data_section += "5. Use markdown tables to display the flights clearly\n"
            data_section += "6. CRITICAL: Display the ACTUAL dates from the flight data in the table. The departure and arrival dates shown in the flight data MUST match the dates the user requested.\n"
            data_section += "7. DO NOT mention 'dashboard' or 'check out the dashboard' - the dashboard has been removed\n"
            data_section += "8. Make sure to show both outbound and return flights - this is a round-trip, so both directions are required!\n"
        else:
            data_section += "1. Start by saying 'I found the following flight options for you:'\n"
            data_section += "2. List the actual flights from the data above in a clear format\n"
            data_section += "3. Include airline names, flight numbers, prices, departure/arrival times, and duration\n"
            data_section += "4. DO NOT mention 'dashboard' or 'check out the dashboard' - the dashboard has been removed\n"
            data_section += "5. Present the information in a clear, user-friendly format using markdown tables or lists\n"
        
        system_prompt += data_section
    elif amadeus_data and amadeus_data.get('error'):
        # Handle API errors with specific, actionable error messages
        error_msg = amadeus_data.get('error', 'Unknown error')
        
        # Generate specific error message based on error type
        if 'Missing' in error_msg or 'missing' in error_msg.lower():
            if 'origin' in error_msg.lower() or 'destination' in error_msg.lower():
                specific_error = "MISSING INFORMATION: Please provide both origin and destination cities (e.g., 'flights from New York to Paris')."
            elif 'date' in error_msg.lower():
                specific_error = "MISSING DATE: Please provide a departure date (e.g., 'November 3rd' or '11/03/2024')."
            else:
                specific_error = f"MISSING INFORMATION: {error_msg}"
        elif 'Invalid' in error_msg or 'invalid' in error_msg.lower():
            if 'date' in error_msg.lower():
                specific_error = "INVALID DATE FORMAT: Please provide dates in a valid format (e.g., 'November 3rd, 2024', '11/03/2024', or 'Nov 3')."
            else:
                specific_error = f"INVALID INPUT: {error_msg}"
        elif 'API call failed' in error_msg:
            specific_error = "API ERROR: Unable to fetch flight data. Please check your connection and try again."
        elif 'No flights available' in error_msg:
            specific_error = "NO FLIGHTS FOUND: No flights available for the specified route and dates. Please try different dates or destinations."
        else:
            specific_error = f"ERROR: {error_msg}"
        
        system_prompt += f"\n\n⚠️ IMPORTANT: There was an error processing your flight search request.\n"
        system_prompt += f"ERROR DETAILS: {specific_error}\n\n"
        system_prompt += "YOUR RESPONSE MUST:\n"
        system_prompt += "1. Clearly state what went wrong (e.g., 'I couldn't find flights because [specific reason]')\n"
        system_prompt += "2. Tell the user exactly what information is missing or incorrect\n"
        system_prompt += "3. Provide a helpful example of the correct format\n"
        system_prompt += "4. Be friendly and helpful, not technical\n\n"
        system_prompt += "Example: 'I couldn't find flights because the departure date wasn't provided. Please try again with a date, like: \"flights from New York to Paris on November 15th\"'\n"
    
    return system_prompt

def _generate_booking_link(airline_name, flight_code):
    """Generate booking link for a flight based on airline and flight code"""
    if not airline_name or not flight_code:
        return "https://www.google.com/search?q=flight+booking"
    
    # Map airline names to their booking URLs
    airline_booking_urls = {
        "Air France": "https://www.airfrance.com",
        "Delta Airlines": "https://www.delta.com",
        "American Airlines": "https://www.aa.com",
        "United Airlines": "https://www.united.com",
        "Lufthansa": "https://www.lufthansa.com",
        "British Airways": "https://www.britishairways.com",
        "KLM": "https://www.klm.com",
        "Iberia": "https://www.iberia.com",
        "Alitalia": "https://www.alitalia.com",
        "Swiss": "https://www.swiss.com",
        "Austrian": "https://www.austrian.com",
        "SAS": "https://www.sas.se",
        "TAP Air Portugal": "https://www.flytap.com",
        "Virgin Atlantic": "https://www.virgin-atlantic.com",
        "Emirates": "https://www.emirates.com",
        "Qatar Airways": "https://www.qatarairways.com",
        "Turkish Airlines": "https://www.turkishairlines.com",
        "Aeroflot": "https://www.aeroflot.com",
        "Air Canada": "https://www.aircanada.com",
        "WestJet": "https://www.westjet.com",
        "JetBlue": "https://www.jetblue.com",
        "Southwest": "https://www.southwest.com",
        "Alaska Airlines": "https://www.alaskaair.com",
        "Hawaiian Airlines": "https://www.hawaiianairlines.com",
        "Spirit Airlines": "https://www.spirit.com",
        "Frontier Airlines": "https://www.flyfrontier.com",
        "Allegiant Air": "https://www.allegiantair.com"
    }
    
    # Get the base URL for the airline
    base_url = airline_booking_urls.get(airline_name, "https://www.google.com/search?q=flight+booking")
    
    # For most airlines, we'll use the base URL and let users search for the specific flight
    # Some airlines have specific flight search patterns, but for simplicity, we'll use the base URL
    return base_url

def clean_markdown_formatting(text):
    """Remove excessive markdown formatting like __ and clean up ** patterns"""
    import re
    
    # Remove __ patterns (excessive underscores)
    text = re.sub(r'__+', '', text)
    
    # Clean up excessive ** patterns (remove triple or more asterisks)
    text = re.sub(r'\*{3,}', '**', text)
    
    # Remove standalone ** patterns (where there's no content between)
    text = re.sub(r'\*\*\s*\*\*', '', text)
    
    # Fix patterns like **__text__** to just **text**
    text = re.sub(r'\*\*__([^*]+)__\*\*', r'**\1**', text)
    
    # Fix patterns where closing ** appears at wrong places (e.g., "**Name** Text**")
    # This handles cases like "**Gothic Quarter** Walking Tour**"
    text = re.sub(r'\*\*([^*]+)\*\*([^*]+?)\*\*(\s|$|\.|,|;|:|\|)', r'**\1**\2\3', text)
    
    # Remove orphaned ** at end of text, words, or after punctuation
    text = re.sub(r'\*\*(\s|$|\.|,|;|:|\|)', r'\1', text)
    
    # Fix patterns where ** appears multiple times incorrectly (e.g., "**Name** **Text**")
    # Only if there's text between them that shouldn't be bold
    text = re.sub(r'\*\*([^*\s]+)\*\*\s+\*\*([^*\s]+)\*\*', r'**\1** \2', text)
    
    return text

def format_place_names(text):
    """Format place names in text with bold formatting (single bold, no underscores)"""
    import re
    
    # First, clean any existing excessive markdown formatting
    text = clean_markdown_formatting(text)
    
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
            # Only format if not already formatted with ** (avoid double formatting)
            escaped_match = re.escape(match)
            # Check if already formatted (with word boundaries to avoid partial matches)
            if not re.search(r'\*\*' + escaped_match + r'\*\*', text):
                # Replace the match with formatted version
                text = text.replace(match, f'**{match}**')
    
    # Final cleanup to ensure no excessive formatting
    text = clean_markdown_formatting(text)
    
    return text

def generateOptimalItinerary(flights: List[Dict[str, Any]], hotels: List[Dict[str, Any]], 
                              activities: List[Dict[str, Any]], preferences: Dict[str, float],
                              userBudget: float) -> Dict[str, Any]:
    """
    Generate optimal itinerary by combining flights, hotels, and activities
    based on weighted user preferences.
    
    Args:
        flights: List of flight objects with price, duration, rating, etc.
        hotels: List of hotel objects with price, rating, distance, etc.
        activities: List of activity objects with price, rating, duration, etc.
        preferences: Dict with budget, quality, convenience weights (0-1, should sum to 1)
        userBudget: Maximum total budget for the combination
        
    Returns:
        Dict containing optimal combination with scores and insights
    """
    budget_weight = preferences.get('budget', 0.33)
    quality_weight = preferences.get('quality', 0.33)
    convenience_weight = preferences.get('convenience', 0.34)
    
    # Normalize weights to ensure they sum to 1
    total_weight = budget_weight + quality_weight + convenience_weight
    if total_weight > 0:
        budget_weight /= total_weight
        quality_weight /= total_weight
        convenience_weight /= total_weight
    else:
        budget_weight = quality_weight = convenience_weight = 1/3
    
    logger.info(f"[OPTIMAL_ITINERARY] Weights: budget={budget_weight:.3f}, quality={quality_weight:.3f}, convenience={convenience_weight:.3f}")
    
    # Normalize metrics on 0-1 scale for each category
    def normalize_flight_metrics(flight_list):
        """Extract and normalize flight metrics"""
        if not flight_list:
            return []
        
        # Extract prices, durations, and ratings
        prices = []
        durations = []  # in hours
        ratings = []
        
        for flight in flight_list:
            # Extract price (handle different formats)
            price = flight.get('price', 0)
            if isinstance(price, dict):
                price = price.get('total', price.get('amount', 0))
            prices.append(float(price) if price else 0)
            
            # Extract duration (convert ISO duration to hours)
            duration_str = flight.get('duration', 'PT0H')
            if isinstance(duration_str, str) and duration_str.startswith('PT'):
                duration_str = duration_str[2:]
                hours = 0
                minutes = 0
                if 'H' in duration_str:
                    hours = int(duration_str.split('H')[0])
                    duration_str = duration_str.split('H')[1]
                if 'M' in duration_str:
                    minutes = int(duration_str.split('M')[0])
                durations.append(hours + minutes / 60.0)
            else:
                # Try to extract from itineraries
                itineraries = flight.get('itineraries', [])
                if itineraries:
                    dur_str = itineraries[0].get('duration', 'PT0H')
                    if isinstance(dur_str, str) and dur_str.startswith('PT'):
                        dur_str = dur_str[2:]
                        h = int(dur_str.split('H')[0]) if 'H' in dur_str else 0
                        m = int(dur_str.split('H')[1].split('M')[0]) if 'H' in dur_str and 'M' in dur_str.split('H')[1] else (int(dur_str.split('M')[0]) if 'M' in dur_str else 0)
                        durations.append(h + m / 60.0)
                    else:
                        durations.append(8.0)  # Default
                else:
                    durations.append(8.0)  # Default
            
            # Extract rating (flights typically don't have ratings, use 4.0 default)
            rating = flight.get('rating', 4.0)
            if rating is None:
                rating = 4.0
            ratings.append(float(rating) if rating else 4.0)
        
        # Find max values for normalization
        max_price = max(prices) if prices else 1
        max_duration = max(durations) if durations else 1
        max_rating = max(ratings) if ratings else 5
        
        # Normalize each flight
        normalized_flights = []
        for i, flight in enumerate(flight_list):
            price = prices[i]
            duration = durations[i]
            rating = ratings[i]
            
            # Budget score: 1 - (price / maxPrice) - lower price is better
            budget_score = 1 - (price / max_price) if max_price > 0 else 0.5
            
            # Quality score: rating / 5 - higher rating is better
            quality_score = rating / 5.0
            
            # Convenience score: 1 - (duration / maxDuration) - shorter duration is better
            convenience_score = 1 - (duration / max_duration) if max_duration > 0 else 0.5
            
            # Calculate category score
            category_score = (
                budget_weight * budget_score +
                quality_weight * quality_score +
                convenience_weight * convenience_score
            )
            
            normalized_flights.append({
                **flight,
                '_budget_score': budget_score,
                '_quality_score': quality_score,
                '_convenience_score': convenience_score,
                '_category_score': category_score,
                '_price': price,
                '_duration': duration,
                '_rating': rating
            })
        
        return normalized_flights
    
    def normalize_hotel_metrics(hotel_list):
        """Extract and normalize hotel metrics"""
        if not hotel_list:
            return []
        
        prices = []
        ratings = []
        distances = []  # distance from city center (km)
        
        for hotel in hotel_list:
            # Extract price - prefer price_per_night for comparison, fallback to total price
            price = hotel.get('price_per_night')
            if not price:
                price = hotel.get('price', 0)
            if isinstance(price, dict):
                price = price.get('total', price.get('amount', 0))
            prices.append(float(price) if price else 0)
            
            # Extract rating
            rating = hotel.get('rating', 3.0)
            if rating is None:
                rating = 3.0
            ratings.append(float(rating) if rating else 3.0)
            
            # Extract distance (default to 5km if not available)
            distance = hotel.get('distance', hotel.get('distanceFromCenter', 5.0))
            distances.append(float(distance) if distance else 5.0)
        
        max_price = max(prices) if prices else 1
        max_rating = max(ratings) if ratings else 5
        max_distance = max(distances) if distances else 1
        
        normalized_hotels = []
        for i, hotel in enumerate(hotel_list):
            price = prices[i]
            rating = ratings[i]
            distance = distances[i]
            
            budget_score = 1 - (price / max_price) if max_price > 0 else 0.5
            quality_score = rating / 5.0
            convenience_score = 1 - (distance / max_distance) if max_distance > 0 else 0.5
            
            category_score = (
                budget_weight * budget_score +
                quality_weight * quality_score +
                convenience_weight * convenience_score
            )
            
            normalized_hotels.append({
                **hotel,
                '_budget_score': budget_score,
                '_quality_score': quality_score,
                '_convenience_score': convenience_score,
                '_category_score': category_score,
                '_price': price,
                '_rating': rating,
                '_distance': distance
            })
        
        return normalized_hotels
    
    def normalize_activity_metrics(activity_list):
        """Extract and normalize activity metrics"""
        if not activity_list:
            return []
        
        prices = []
        ratings = []
        durations = []  # in hours
        
        for activity in activity_list:
            # Extract price
            price_info = activity.get('price', {})
            if isinstance(price_info, dict):
                price = price_info.get('amount', price_info.get('total', 0))
            else:
                price = price_info if price_info else 0
            prices.append(float(price) if price else 0)
            
            # Extract rating
            rating = activity.get('rating', 4.0)
            if rating is None:
                rating = 4.0
            ratings.append(float(rating) if rating else 4.0)
            
            # Extract duration
            duration_str = activity.get('minimumDuration', activity.get('duration', 'PT2H'))
            if isinstance(duration_str, str) and duration_str.startswith('PT'):
                duration_str = duration_str[2:]
                hours = int(duration_str.split('H')[0]) if 'H' in duration_str else 0
                minutes = int(duration_str.split('H')[1].split('M')[0]) if 'H' in duration_str and 'M' in duration_str.split('H')[1] else (int(duration_str.split('M')[0]) if 'M' in duration_str else 0)
                durations.append(hours + minutes / 60.0)
            elif isinstance(duration_str, (int, float)):
                durations.append(float(duration_str))
            else:
                durations.append(2.0)  # Default 2 hours
        
        max_price = max(prices) if prices else 1
        max_rating = max(ratings) if ratings else 5
        max_duration = max(durations) if durations else 1
        
        normalized_activities = []
        for i, activity in enumerate(activity_list):
            price = prices[i]
            rating = ratings[i]
            duration = durations[i]
            
            budget_score = 1 - (price / max_price) if max_price > 0 else 0.5
            quality_score = rating / 5.0
            convenience_score = 1 - (duration / max_duration) if max_duration > 0 else 0.5
            
            category_score = (
                budget_weight * budget_score +
                quality_weight * quality_score +
                convenience_weight * convenience_score
            )
            
            normalized_activities.append({
                **activity,
                '_budget_score': budget_score,
                '_quality_score': quality_score,
                '_convenience_score': convenience_score,
                '_category_score': category_score,
                '_price': price,
                '_rating': rating,
                '_duration': duration
            })
        
        return normalized_activities
    
    # Normalize all categories
    normalized_flights = normalize_flight_metrics(flights)
    normalized_hotels = normalize_hotel_metrics(hotels)
    normalized_activities = normalize_activity_metrics(activities)
    
    logger.info(f"[OPTIMAL_ITINERARY] Normalized: {len(normalized_flights)} flights, {len(normalized_hotels)} hotels, {len(normalized_activities)} activities")
    
    # Handle cases where hotels or activities are missing
    if len(normalized_flights) == 0:
        return {
            'error': 'No flights provided',
            'ok': False
        }
    
    # If no hotels or activities, create dummy entries with zero price
    if len(normalized_hotels) == 0:
        logger.warning("[OPTIMAL_ITINERARY] No hotels found, using dummy hotel")
        normalized_hotels = [{
            'id': 'dummy-hotel',
            'name': 'Hotel information not available',
            '_price': 0,
            '_rating': 3.0,
            '_distance': 5.0,
            '_budget_score': 0.5,
            '_quality_score': 0.6,
            '_convenience_score': 0.5,
            '_category_score': 0.53
        }]
    
    if len(normalized_activities) == 0:
        logger.warning("[OPTIMAL_ITINERARY] No activities found, using dummy activity")
        normalized_activities = [{
            'id': 'dummy-activity',
            'name': 'Activity information not available',
            '_price': 0,
            '_rating': 4.0,
            '_duration': 2.0,
            '_budget_score': 0.5,
            '_quality_score': 0.8,
            '_convenience_score': 0.5,
            '_category_score': 0.6
        }]
    
    # Find best combination
    best_combination = None
    best_total_score = -1
    total_combinations = len(normalized_flights) * len(normalized_hotels) * len(normalized_activities)
    
    logger.info(f"[OPTIMAL_ITINERARY] Evaluating {total_combinations} combinations...")
    
    for flight in normalized_flights:
        for hotel in normalized_hotels:
            for activity in normalized_activities:
                # Calculate total price
                total_price = flight['_price'] + hotel['_price'] + activity['_price']
                
                # Filter out if exceeds budget (but allow if hotels/activities are dummy with 0 price)
                if total_price > userBudget and hotel.get('id') != 'dummy-hotel' and activity.get('id') != 'dummy-activity':
                    continue
                
                # Calculate total combined score (average of three category scores)
                total_score = (
                    flight['_category_score'] +
                    hotel['_category_score'] +
                    activity['_category_score']
                ) / 3.0
                
                # Update best if this is better
                if total_score > best_total_score:
                    best_total_score = total_score
                    best_combination = {
                        'flight': flight,
                        'hotel': hotel,
                        'activity': activity,
                        'total_price': total_price,
                        'total_score': total_score,
                        'flight_score': flight['_category_score'],
                        'hotel_score': hotel['_category_score'],
                        'activity_score': activity['_category_score']
                    }
    
    if not best_combination:
        return {
            'error': 'No valid combination found within budget. Try increasing your budget or adjusting preferences.',
            'ok': False
        }
    
    # Generate insight text
    flight = best_combination['flight']
    hotel = best_combination['hotel']
    activity = best_combination['activity']
    
    insights = []
    if budget_weight > 0.4:
        insights.append("excellent value")
    if quality_weight > 0.4:
        insights.append("high quality options")
    if convenience_weight > 0.4:
        insights.append("minimal travel time")
    
    if not insights:
        insights.append("balanced combination")
    
    insight_text = f"This combination offers the best balance of {', '.join(insights)} while staying within your budget."
    
    if budget_weight > 0.4 and best_combination['total_price'] < userBudget * 0.8:
        insight_text += " You're saving significantly while still getting great options."
    elif quality_weight > 0.4:
        insight_text += " Premium quality selections that match your preferences."
    elif convenience_weight > 0.4:
        insight_text += " Optimized for convenience and minimal hassle."
    
    result = {
        'ok': True,
        'flight': {
            'id': flight.get('id'),
            'airline': flight.get('airline', 'Unknown'),
            'flightNumber': flight.get('flightNumber', flight.get('flight_number', 'N/A')),
            'price': flight['_price'],
            'duration': flight['_duration'],
            'rating': flight['_rating'],
            'departure': flight.get('departure', flight.get('departureAirport', 'N/A')),
            'arrival': flight.get('arrival', flight.get('arrivalAirport', 'N/A')),
            'scores': {
                'budget': flight['_budget_score'],
                'quality': flight['_quality_score'],
                'convenience': flight['_convenience_score'],
                'total': flight['_category_score']
            }
        },
        'hotel': {
            'id': hotel.get('hotel_id', hotel.get('id')),
            'name': hotel.get('name', 'Unknown Hotel'),
            'price': hotel['_price'],  # Price per night (for comparison)
            'price_total': hotel.get('price', hotel.get('price_total')),  # Total price for entire stay
            'price_per_night': hotel.get('price_per_night', hotel['_price']),  # Price per night
            'nights': hotel.get('nights', 1),  # Number of nights
            'rating': hotel['_rating'],
            'distance': hotel.get('_distance', hotel.get('distance', 0)),
            'location': hotel.get('location', hotel.get('city', 'N/A')),
            'scores': {
                'budget': hotel['_budget_score'],
                'quality': hotel['_quality_score'],
                'convenience': hotel['_convenience_score'],
                'total': hotel['_category_score']
            },
            'isDummy': hotel.get('id') == 'dummy-hotel'
        },
        'activity': {
            'id': activity.get('id'),
            'name': activity.get('name', 'Unknown Activity'),
            'price': activity['_price'],
            'rating': activity['_rating'],
            'duration': activity.get('_duration', activity.get('duration', 0)),
            'description': activity.get('shortDescription', activity.get('description', '')),
            'scores': {
                'budget': activity['_budget_score'],
                'quality': activity['_quality_score'],
                'convenience': activity['_convenience_score'],
                'total': activity['_category_score']
            },
            'isDummy': activity.get('id') == 'dummy-activity'
        },
        'total_price': best_combination['total_price'],
        'total_score': best_combination['total_score'],
        'insight': insight_text
    }
    
    logger.info(f"[OPTIMAL_ITINERARY] Best combination found: score={best_total_score:.3f}, price=${best_combination['total_price']:.2f}")
    
    return result


def apply_preference_weights_to_hotels(hotels: List[Dict[str, Any]], preferences: Optional[Dict[str, float]], context_label: str = "chat") -> List[Dict[str, Any]]:
    """
    Score and sort hotels using user preference weights.
    """
    if not hotels or not preferences:
        return hotels
    
    try:
        budget_weight = float(preferences.get('budget', 0.33))
        quality_weight = float(preferences.get('quality', 0.33))
        convenience_weight = float(preferences.get('convenience', 0.34))
        total_weight = budget_weight + quality_weight + convenience_weight
        if total_weight <= 0:
            budget_weight = quality_weight = convenience_weight = 1 / 3
        else:
            budget_weight /= total_weight
            quality_weight /= total_weight
            convenience_weight /= total_weight
        
        def _safe_float(value):
            try:
                if value is None:
                    return None
                if isinstance(value, str):
                    stripped = value.strip()
                    if stripped == "":
                        return None
                    return float(stripped)
                return float(value)
            except (ValueError, TypeError):
                return None
        
        price_values = [_safe_float(h.get('price_per_night') or h.get('price')) for h in hotels]
        price_values = [p for p in price_values if p is not None]
        min_price = min(price_values) if price_values else None
        max_price = max(price_values) if price_values else None
        
        distance_values = [_safe_float(h.get('distance')) for h in hotels]
        distance_values = [d for d in distance_values if d is not None]
        min_distance = min(distance_values) if distance_values else None
        max_distance = max(distance_values) if distance_values else None
        
        def inverse_normalize(value, min_val, max_val):
            if value is None or min_val is None or max_val is None or max_val == min_val:
                return 0.5
            ratio = (value - min_val) / (max_val - min_val)
            ratio = max(0.0, min(1.0, ratio))
            return 1 - ratio
        
        for hotel in hotels:
            price = _safe_float(hotel.get('price_per_night') or hotel.get('price'))
            rating = _safe_float(hotel.get('rating'))
            distance = _safe_float(hotel.get('distance'))
            
            price_score = inverse_normalize(price, min_price, max_price) if min_price is not None else 0.5
            rating_value = min(max(rating, 0.0), 5.0) if rating is not None else None
            rating_score = (rating_value / 5.0) if rating_value is not None else 0.5
            distance_score = inverse_normalize(distance, min_distance, max_distance) if min_distance is not None else 0.5
            
            total_score = (
                budget_weight * price_score +
                quality_weight * rating_score +
                convenience_weight * distance_score
            )
            
            hotel['_preference_score'] = round(total_score, 4)
            hotel['_preference_components'] = {
                'price': round(price_score, 4),
                'rating': round(rating_score, 4),
                'distance': round(distance_score, 4)
            }
        
        hotels.sort(key=lambda h: h.get('_preference_score', 0), reverse=True)
        logger.info(
            "[PREF_SCORING] Applied preference weights to %s hotels (context=%s)",
            len(hotels),
            context_label
        )
    except Exception as e:
        logger.error(f"[PREF_SCORING] Failed to apply hotel preference weights ({context_label}): {e}", exc_info=True)
    
    return hotels


def apply_intent_overrides(message: str, intent_type: str) -> str:
    """
    Apply intent overrides to ensure correct routing:
    - Activity/tour queries → activity_search (GENERAL_ACTIVITIES)
    - Transfer queries only when clearly about airport↔hotel transfers
    """
    text = message.lower()
    
    transfer_keywords = [
        "airport", "terminal", "pick up", "pickup", "drop off", "drop-off",
        "to the hotel", "from the hotel", "hotel transfer",
        "private car", "shuttle", "ride", "transfer"
    ]
    
    activity_keywords = [
        "activity", "activities", "things to do", "fun things to do",
        "tour", "tours", "day trip", "day trips",
        "experience", "experiences", "sightseeing"
    ]
    
    # If user talks about activities/tours and NOT clearly about airport transfer → activity_search
    if any(k in text for k in activity_keywords) and not any(k in text for k in transfer_keywords):
        logger.info(f"[INTENT_OVERRIDE] Overriding to activity_search (activity keywords found, no transfer keywords)")
        return "activity_search"
    
    # TRANSFER/PRIVATE_CAR should only be kept when transfer keywords are present
    if intent_type in ("transfer_search", "points_of_interest") and any(k in text for k in transfer_keywords):
        # Check if it's specifically about airport/hotel transfer
        if any(k in text for k in ["airport", "hotel", "terminal", "pick up", "drop off"]):
            logger.info(f"[INTENT_OVERRIDE] Keeping {intent_type} (transfer keywords found)")
            return intent_type
        else:
            # Has transfer keyword but not specifically airport/hotel → treat as activity
            logger.info(f"[INTENT_OVERRIDE] Overriding {intent_type} to activity_search (transfer keyword but not airport/hotel)")
            return "activity_search"
    
    # If intent is transfer-related but no transfer keywords → change to activity_search
    if intent_type in ("transfer_search", "points_of_interest") and not any(k in text for k in transfer_keywords):
        logger.info(f"[INTENT_OVERRIDE] Overriding {intent_type} to activity_search (no transfer keywords)")
        return "activity_search"
    
    return intent_type


def apply_preference_filters_to_activities(
    activities: List[Dict[str, Any]], 
    preferences: Optional[Dict[str, float]] = None,
    trip_duration_days: Optional[int] = None,
    context_label: str = "chat"
) -> List[Dict[str, Any]]:
    """
    Apply preference-based filters, scoring, and sorting to activities:
    - Trip-length filter: Mark activities longer than trip duration
    - Budget filter: Mark expensive activities when budget preference is high
    - Quality filter: Mark low-rated activities when quality preference is high
    - Scoring: Calculate budget_score, quality_score, convenience_score (0-1 normalized, then multiplied by weights)
    - Sorting: Sort STRICTLY by total_score (descending), with long_tour items after regular ones
    
    Args:
        activities: List of activity objects (ALL activities in request for normalization)
        preferences: User preferences dict with budget, quality, convenience weights
        trip_duration_days: Trip duration in days (optional)
        context_label: Context for logging
        
    Returns:
        List of activities with filter flags and scores added, sorted by preference
    """
    if not activities:
        return activities
    
    # ADD: Check DEBUG mode at function start (os already imported at top level)
    DEBUG_MODE = os.getenv("DEBUG", "false").lower() == "true"
    
    try:
        def _safe_float(value):
            """Safely convert value to float"""
            try:
                if value is None:
                    return None
                if isinstance(value, dict):
                    return float(value.get('amount', value.get('total', 0)))
                if isinstance(value, str):
                    stripped = value.strip()
                    if stripped == "":
                        return None
                    return float(stripped)
                return float(value)
            except (ValueError, TypeError):
                return None
        
        def _extract_duration_hours(duration_str):
            """Extract duration in hours from duration string or number"""
            if duration_str is None:
                return None
            
            # If it's already a number (assume hours)
            if isinstance(duration_str, (int, float)):
                return float(duration_str)
            
            # If it's a string, try to parse ISO duration format
            if isinstance(duration_str, str):
                # ISO 8601 duration format: PT#H#M, P#D, etc.
                if duration_str.startswith('P'):
                    # Check for days first (P1D, P2D)
                    if 'D' in duration_str and 'T' not in duration_str:
                        try:
                            days = int(duration_str.replace('P', '').replace('D', ''))
                            return float(days * 24)  # Convert days to hours
                        except ValueError:
                            pass
                    
                    # Parse hours and minutes (PT2H30M, PT24H)
                    if 'T' in duration_str:
                        time_part = duration_str.split('T')[1]
                        hours = 0
                        minutes = 0
                        if 'H' in time_part:
                            hours = int(time_part.split('H')[0])
                        if 'M' in time_part:
                            minutes = int(time_part.split('M')[0].split('H')[-1] if 'H' in time_part else time_part.split('M')[0])
                        return hours + minutes / 60.0
            
            return None
        
        def _extract_duration_days(duration_str):
            """Extract duration in days from duration string or number"""
            hours = _extract_duration_hours(duration_str)
            if hours is None:
                return None
            return hours / 24.0
        
        # Normalize preferences and log incoming weights
        if preferences:
            raw_budget = float(preferences.get('budget', 0.33))
            raw_quality = float(preferences.get('quality', 0.33))
            raw_convenience = float(preferences.get('convenience', 0.34))
            total_weight = raw_budget + raw_quality + raw_convenience
            
            logger.info(f"[ACTIVITY_SCORE] ═══ INCOMING PREFERENCES (context={context_label}) ═══")
            logger.info(f"[ACTIVITY_SCORE] Raw weights: budget={raw_budget:.3f}, quality={raw_quality:.3f}, convenience={raw_convenience:.3f}, total={total_weight:.3f}")
            
            if total_weight <= 0:
                budget_weight = quality_weight = convenience_weight = 1 / 3
                logger.warning(f"[ACTIVITY_SCORE] Invalid preferences total weight ({total_weight}), using default 1/3 each")
            else:
                budget_weight = raw_budget / total_weight
                quality_weight = raw_quality / total_weight
                convenience_weight = raw_convenience / total_weight
            
            logger.info(f"[ACTIVITY_SCORE] Normalized weights: budget={budget_weight:.3f} ({budget_weight*100:.1f}%), quality={quality_weight:.3f} ({quality_weight*100:.1f}%), convenience={convenience_weight:.3f} ({convenience_weight*100:.1f}%)")
            
            # Check for extreme preferences to apply penalties/boosts
            if budget_weight >= 0.6:
                logger.info(f"[ACTIVITY_SCORE] 🔴 HIGH BUDGET PREFERENCE ({budget_weight*100:.1f}%) - Will heavily penalize expensive activities")
            if quality_weight >= 0.6:
                logger.info(f"[ACTIVITY_SCORE] ⭐ HIGH QUALITY PREFERENCE ({quality_weight*100:.1f}%) - Will aggressively boost high-rated activities")
            if convenience_weight >= 0.6:
                logger.info(f"[ACTIVITY_SCORE] 🚀 HIGH CONVENIENCE PREFERENCE ({convenience_weight*100:.1f}%) - Will prioritize shorter duration activities")
        else:
            budget_weight = quality_weight = convenience_weight = 1 / 3
            logger.warning(f"[ACTIVITY_SCORE] ⚠️ No preferences provided (context={context_label}), using default equal weights (1/3 each)")
        
        # A. Trip-length filter
        if trip_duration_days is not None:
            for activity in activities:
                duration_str = activity.get('minimumDuration') or activity.get('duration')
                activity_duration_days = _extract_duration_days(duration_str)
                
                if activity_duration_days is not None and activity_duration_days > trip_duration_days:
                    activity['long_tour'] = True
                    logger.debug(f"[ACTIVITY_SCORE] Marked '{activity.get('name')}' as long_tour: {activity_duration_days:.1f} days > {trip_duration_days} days")
                else:
                    activity['long_tour'] = False
        else:
            # If no trip duration, mark all as not long_tour
            for activity in activities:
                activity['long_tour'] = False
        
        # Collect all metrics for normalization
        prices = []
        ratings = []
        durations = []  # in hours
        distances = []  # in km (if available)
        
        for activity in activities:
            # Extract price
            price_info = activity.get('price', {})
            if isinstance(price_info, dict):
                price = _safe_float(price_info.get('amount') or price_info.get('total'))
            else:
                price = _safe_float(price_info)
            if price is not None and price >= 0:
                prices.append(price)
            
            # Extract rating
            rating = _safe_float(activity.get('rating'))
            if rating is not None and rating >= 0:
                ratings.append(rating)
            
            # Extract duration
            duration_str = activity.get('minimumDuration') or activity.get('duration')
            duration_hours = _extract_duration_hours(duration_str)
            if duration_hours is not None and duration_hours >= 0:
                durations.append(duration_hours)
            
            # Extract distance (if available, from geoCode or distance field)
            distance = None
            geo_code = activity.get('geoCode')
            if geo_code and isinstance(geo_code, dict):
                # Distance might be in a separate field, or we might need to calculate
                # For now, we'll use a placeholder - in production, you'd calculate distance from city center
                pass
        
        # Calculate min/max for normalization
        min_price = min(prices) if prices else None
        max_price = max(prices) if prices else None
        
        min_rating = min(ratings) if ratings else None
        max_rating = max(ratings) if ratings else None
        # Default rating range: 0-5
        if min_rating is None:
            min_rating = 0.0
        if max_rating is None:
            max_rating = 5.0
        
        min_duration = min(durations) if durations else None
        max_duration = max(durations) if durations else None
        
        # MODIFY: Normalize to 0-1 range (then multiply by weights)
        def inverse_normalize(value, min_val, max_val):
            """Normalize to 0-1, where higher original value = lower score (inverse)"""
            if value is None or min_val is None or max_val is None or max_val == min_val:
                return 0.5  # Default middle score
            ratio = (value - min_val) / (max_val - min_val)
            ratio = max(0.0, min(1.0, ratio))
            # Inverse: higher value = lower score (0-1 range)
            return 1.0 - ratio
        
        def forward_normalize(value, min_val, max_val):
            """Normalize to 0-1, where higher original value = higher score"""
            if value is None or min_val is None or max_val is None or max_val == min_val:
                return 0.5  # Default middle score
            ratio = (value - min_val) / (max_val - min_val)
            ratio = max(0.0, min(1.0, ratio))
            return ratio  # 0-1 range
        
        # ADD: Log normalization ranges (min/max calculated from ALL activities in request)
        if DEBUG_MODE:
            logger.info(f"[ACTIVITY_SCORE] Normalization ranges (for {len(activities)} activities): price=[{min_price}, {max_price}], rating=[{min_rating}, {max_rating}], duration=[{min_duration}, {max_duration}]")
        
        # B. Budget filter: Mark expensive activities when budget preference is high (>= 0.6)
        if preferences:
            budget_pref = float(preferences.get('budget', 0.33))
            
            if budget_pref >= 0.6:
                if prices:
                    mean_price = sum(prices) / len(prices)
                    threshold = mean_price * 1.6
                    
                    for activity in activities:
                        price_info = activity.get('price', {})
                        if isinstance(price_info, dict):
                            price = _safe_float(price_info.get('amount') or price_info.get('total'))
                        else:
                            price = _safe_float(price_info)
                        
                        if price is not None and price > threshold:
                            activity['too_expensive_for_budget'] = True
                            logger.debug(f"[ACTIVITY_SCORE] Marked '{activity.get('name')}' as too_expensive: ${price:.2f} > ${threshold:.2f}")
                        else:
                            activity['too_expensive_for_budget'] = False
                else:
                    for activity in activities:
                        activity['too_expensive_for_budget'] = False
            else:
                for activity in activities:
                    activity['too_expensive_for_budget'] = False
        
        # C. Quality filter: Mark low-rated activities when quality preference is high (>= 0.6)
        if preferences:
            quality_pref = float(preferences.get('quality', 0.33))
            
            if quality_pref >= 0.6:
                low_quality_threshold = 3.5
                
                for activity in activities:
                    rating = _safe_float(activity.get('rating'))
                    
                    if rating is not None and rating < low_quality_threshold:
                        activity['low_quality_for_preference'] = True
                        logger.debug(f"[ACTIVITY_SCORE] Marked '{activity.get('name')}' as low_quality: {rating:.1f} < {low_quality_threshold}")
                    else:
                        activity['low_quality_for_preference'] = False
            else:
                for activity in activities:
                    activity['low_quality_for_preference'] = False
        
        # D. Calculate scores for each activity
        for activity in activities:
            # Extract values
            price_info = activity.get('price', {})
            if isinstance(price_info, dict):
                price = _safe_float(price_info.get('amount') or price_info.get('total'))
            else:
                price = _safe_float(price_info)
            
            rating = _safe_float(activity.get('rating'))
            if rating is None:
                rating = 3.5  # Default rating
            
            duration_str = activity.get('minimumDuration') or activity.get('duration')
            duration_hours = _extract_duration_hours(duration_str)
            if duration_hours is None:
                duration_hours = 2.0  # Default 2 hours
            
            # MODIFY: Normalize to 0-1 range (then multiply by weights)
            # Normalize price to 0-1 (inverse: cheaper = higher score)
            if price is not None and min_price is not None and max_price is not None and max_price > min_price:
                base_budget_norm = inverse_normalize(price, min_price, max_price)  # 0-1 range
            elif price is not None:
                # All prices are the same or only one price
                base_budget_norm = 0.5
            else:
                base_budget_norm = 0.5  # No price data
            
            # Normalize rating to 0-1 (forward: higher rating = higher score)
            base_quality_norm = forward_normalize(rating, 0.0, 5.0)  # 0-1 range
            
            # Normalize duration to 0-1 (inverse: shorter = higher score)
            if min_duration is not None and max_duration is not None and max_duration > min_duration:
                base_convenience_norm = inverse_normalize(duration_hours, min_duration, max_duration)  # 0-1 range
            elif duration_hours is not None:
                base_convenience_norm = 0.5
            else:
                base_convenience_norm = 0.5
            
            # MODIFY: Apply EXTREME penalties/boosts for high preferences (≥0.7: MUCH stronger, ≥0.6: strong)
            # Use exponential scaling for budget to dramatically favor cheap activities
            budget_norm = base_budget_norm
            quality_norm = base_quality_norm
            convenience_norm = base_convenience_norm
            
            if preferences:
                # Budget-heavy: Use EXPONENTIAL scaling to dramatically favor cheap activities
                if budget_weight >= 0.7:
                    # EXTREME: Use squared or exponential transformation for budget_weight >= 0.7
                    # Transform: budget_norm^2 * (1 + budget_weight) to amplify cheap activities
                    if base_budget_norm > 0:
                        # Exponential boost: cheap activities get much higher scores
                        # Formula: budget_norm^2 * (1 + 0.5 * (budget_weight - 0.7) / 0.3)
                        boost_factor = 1.0 + 0.8 * ((budget_weight - 0.7) / 0.3)  # 0.7→1.0, 1.0→1.8
                        budget_norm = min(1.0, (base_budget_norm ** 1.5) * boost_factor)
                        if DEBUG_MODE:
                            logger.debug(f"[ACTIVITY_SCORE] 🔴 EXTREME BUDGET MODE: {activity.get('name')[:40]}: price=${price:.2f}, base={base_budget_norm:.3f} → {budget_norm:.3f} (boost_factor={boost_factor:.2f})")
                    # Penalty: exponentially penalize expensive activities
                    if price is not None and prices and len(prices) > 0:
                        sorted_prices = sorted(prices)
                        p75_price = sorted_prices[int(len(sorted_prices) * 0.75)] if len(sorted_prices) > 3 else sorted_prices[-1]
                        if price > p75_price and max_price > p75_price:
                            # Exponential penalty: (price/max)^2 penalty up to 90%
                            price_ratio = (price - p75_price) / (max_price - p75_price + 0.01)
                            penalty = min(0.9, 0.7 * (price_ratio ** 1.5))
                            budget_norm = max(0.0, budget_norm - penalty)
                            if DEBUG_MODE:
                                logger.debug(f"[ACTIVITY_SCORE] 🔴 EXTREME PENALTY: {activity.get('name')[:40]}: price=${price:.2f} > p75=${p75_price:.2f}, penalty={penalty:.3f}, budget_norm: {budget_norm:.3f}")
                elif budget_weight >= 0.6:
                    # STRONG: Use squared transformation for budget_weight >= 0.6
                    if base_budget_norm > 0:
                        budget_norm = min(1.0, base_budget_norm ** 1.3)
                        if DEBUG_MODE:
                            logger.debug(f"[ACTIVITY_SCORE] ⚠️ STRONG BUDGET MODE: {activity.get('name')[:40]}: base={base_budget_norm:.3f} → {budget_norm:.3f}")
                    # Penalty for expensive activities
                    if price is not None and prices and len(prices) > 0:
                        sorted_prices = sorted(prices)
                        p50_price = sorted_prices[len(sorted_prices) // 2] if len(sorted_prices) > 1 else sorted_prices[0]
                        if price > p50_price and max_price > p50_price:
                            price_ratio = (price - p50_price) / (max_price - p50_price + 0.01)
                            penalty = min(0.7, 0.5 * (price_ratio ** 1.2))
                            budget_norm = max(0.0, budget_norm - penalty)
                            if DEBUG_MODE:
                                logger.debug(f"[ACTIVITY_SCORE] ⚠️ STRONG PENALTY: {activity.get('name')[:40]}: price=${price:.2f} > median=${p50_price:.2f}, penalty={penalty:.3f}")
                
                # Quality-heavy: Boost high ratings exponentially
                if quality_weight >= 0.7:
                    # EXTREME: Exponential boost for high ratings
                    if rating >= 4.5:
                        # Squared boost for very high ratings
                        boost = min(0.3, 0.2 * ((rating - 4.5) / 0.5) ** 1.5)
                        quality_norm = min(1.0, base_quality_norm + boost)
                        if DEBUG_MODE:
                            logger.debug(f"[ACTIVITY_SCORE] ⭐ EXTREME QUALITY BOOST: {activity.get('name')[:40]}: rating={rating:.1f} >= 4.5, boost={boost:.3f}, quality_norm: {base_quality_norm:.3f} → {quality_norm:.3f}")
                    elif rating < 4.0:
                        # Exponential penalty for low ratings
                        penalty = min(0.6, 0.4 * ((4.0 - rating) / 4.0) ** 1.5)
                        quality_norm = max(0.0, base_quality_norm - penalty)
                        if DEBUG_MODE:
                            logger.debug(f"[ACTIVITY_SCORE] ⭐ EXTREME QUALITY PENALTY: {activity.get('name')[:40]}: rating={rating:.1f} < 4.0, penalty={penalty:.3f}")
                elif quality_weight >= 0.6:
                    # STRONG: Boost for high ratings
                    if rating >= 4.5:
                        boost = min(0.2, 0.15 * ((rating - 4.5) / 0.5))
                        quality_norm = min(1.0, base_quality_norm + boost)
                    elif rating < 4.0:
                        penalty = min(0.4, 0.3 * ((4.0 - rating) / 4.0))
                        quality_norm = max(0.0, base_quality_norm - penalty)
                
                # Convenience-heavy: Exponential boost for short duration activities
                if convenience_weight >= 0.7:
                    # EXTREME: Exponential transformation for convenience_weight >= 0.7
                    if duration_hours is not None and durations and len(durations) > 0:
                        sorted_durations = sorted(durations)
                        p25_duration = sorted_durations[int(len(sorted_durations) * 0.25)] if len(sorted_durations) > 3 else sorted_durations[0]
                        if duration_hours <= p25_duration:
                            # Exponential boost: shorter activities get much higher scores
                            boost_factor = 1.0 + 0.6 * ((convenience_weight - 0.7) / 0.3)
                            duration_ratio = (p25_duration - duration_hours) / (p25_duration + 0.1)
                            boost = min(0.4, 0.3 * (duration_ratio ** 1.5) * boost_factor)
                            convenience_norm = min(1.0, base_convenience_norm + boost)
                            if DEBUG_MODE:
                                logger.debug(f"[ACTIVITY_SCORE] 🚀 EXTREME CONVENIENCE BOOST: {activity.get('name')[:40]}: duration={duration_hours:.1f}h <= p25={p25_duration:.1f}h, boost={boost:.3f}, convenience_norm: {base_convenience_norm:.3f} → {convenience_norm:.3f}")
                        else:
                            # Exponential penalty for long activities
                            p75_duration = sorted_durations[int(len(sorted_durations) * 0.75)] if len(sorted_durations) > 3 else sorted_durations[-1]
                            if duration_hours > p75_duration and max_duration > p75_duration:
                                duration_ratio = (duration_hours - p75_duration) / (max_duration - p75_duration + 0.1)
                                penalty = min(0.7, 0.5 * (duration_ratio ** 1.5))
                                convenience_norm = max(0.0, base_convenience_norm - penalty)
                                if DEBUG_MODE:
                                    logger.debug(f"[ACTIVITY_SCORE] 🚀 EXTREME CONVENIENCE PENALTY: {activity.get('name')[:40]}: duration={duration_hours:.1f}h > p75={p75_duration:.1f}h, penalty={penalty:.3f}")
                elif convenience_weight >= 0.6:
                    # STRONG: Boost for short activities
                    if duration_hours is not None and durations and len(durations) > 0:
                        sorted_durations = sorted(durations)
                        p50_duration = sorted_durations[len(sorted_durations) // 2] if len(sorted_durations) > 1 else sorted_durations[0]
                        if duration_hours <= p50_duration:
                            boost = min(0.3, 0.25 * ((p50_duration - duration_hours) / (p50_duration + 0.1)))
                            convenience_norm = min(1.0, base_convenience_norm + boost)
                        else:
                            p75_duration = sorted_durations[int(len(sorted_durations) * 0.75)] if len(sorted_durations) > 3 else sorted_durations[-1]
                            if duration_hours > p75_duration and max_duration > p75_duration:
                                penalty = min(0.5, 0.4 * ((duration_hours - p75_duration) / (max_duration - p75_duration + 0.1)))
                                convenience_norm = max(0.0, base_convenience_norm - penalty)
            
            # Calculate total_score: normalized values (0-1) * weights
            # ALWAYS uses this formula
            total_score = (
                budget_norm * budget_weight +
                quality_norm * quality_weight +
                convenience_norm * convenience_weight
            )
            
            # Store scores in activity (for backward compatibility, also store 0-100 range)
            activity['budget_score'] = round(budget_norm * 100, 2)  # 0-100 for display
            activity['quality_score'] = round(quality_norm * 100, 2)
            activity['convenience_score'] = round(convenience_norm * 100, 2)
            activity['total_score'] = round(total_score, 4)  # Keep more precision for sorting
            
            # ADD: Debug logging for each activity - raw scores and total_score (always logged for sorting verification)
            logger.debug(
                f"[ACTIVITY_SCORE] Activity: {activity.get('name')[:50]} | "
                f"budget_score={activity['budget_score']:.2f} | "
                f"quality_score={activity['quality_score']:.2f} | "
                f"convenience_score={activity['convenience_score']:.2f} | "
                f"total_score={activity['total_score']:.6f}"
            )
            
            # ADD: Detailed debug logging for each activity (only in DEBUG mode)
            if DEBUG_MODE:
                budget_contrib = budget_norm * budget_weight
                quality_contrib = quality_norm * quality_weight
                convenience_contrib = convenience_norm * convenience_weight
                logger.info(
                    f"[ACTIVITY_SCORE] ─────────────────────────────────────────────────────────"
                )
                logger.info(
                    f"[ACTIVITY_SCORE] Activity: {activity.get('name')[:60]}"
                )
                logger.info(
                    f"[ACTIVITY_SCORE]   Raw values: price=${price:.2f} | rating={rating:.1f}/5.0 | duration={duration_hours:.1f}h"
                )
                logger.info(
                    f"[ACTIVITY_SCORE]   Normalized (0-1): budget={budget_norm:.4f} | quality={quality_norm:.4f} | convenience={convenience_norm:.4f}"
                )
                logger.info(
                    f"[ACTIVITY_SCORE]   Weights: budget={budget_weight:.3f} ({budget_weight*100:.1f}%) | quality={quality_weight:.3f} ({quality_weight*100:.1f}%) | convenience={convenience_weight:.3f} ({convenience_weight*100:.1f}%)"
                )
                logger.info(
                    f"[ACTIVITY_SCORE]   Contributions: budget={budget_contrib:.4f} | quality={quality_contrib:.4f} | convenience={convenience_contrib:.4f}"
                )
                logger.info(
                    f"[ACTIVITY_SCORE]   ⭐ TOTAL_SCORE = {total_score:.6f}"
                )
        
        # E. Sort activities STRICTLY by total_score DESC
        # MODIFY: Separate regular and long_tour activities, sort each group by total_score DESC
        regular_activities = [a for a in activities if not a.get('long_tour', False)]
        long_tour_activities = [a for a in activities if a.get('long_tour', False)]
        
        # Sort each group by total_score DESC
        regular_activities.sort(key=lambda x: x.get('total_score', 0), reverse=True)
        long_tour_activities.sort(key=lambda x: x.get('total_score', 0), reverse=True)
        
        # Combine: regular first, then long_tour
        activities = regular_activities + long_tour_activities
        
        # ADD: Log sorted scores for verification (after sorting)
        logger.debug(f"[ACTIVITY_SCORE] ═══ SORTED ACTIVITIES (for preference comparison) ═══")
        for idx, act in enumerate(activities, 1):
            logger.debug(
                f"[ACTIVITY_SCORE] #{idx:2d}. {act.get('name')[:50]} | "
                f"budget={act.get('budget_score', 0):.2f} | "
                f"quality={act.get('quality_score', 0):.2f} | "
                f"convenience={act.get('convenience_score', 0):.2f} | "
                f"total_score={act.get('total_score', 0):.6f}"
            )
        
        # ADD: Log top 10 results with weight influence
        logger.info(f"[ACTIVITY_SCORE] ════════════════════════════════════════════════════════════════")
        logger.info(f"[ACTIVITY_SCORE] ═══ SORTING COMPLETE (context={context_label}) ═══")
        logger.info(f"[ACTIVITY_SCORE] ════════════════════════════════════════════════════════════════")
        logger.info(f"[ACTIVITY_SCORE] Sorted {len(regular_activities)} regular + {len(long_tour_activities)} long_tour activities")
        logger.info(f"[ACTIVITY_SCORE] Weights applied: budget={budget_weight:.3f} ({budget_weight*100:.1f}%), quality={quality_weight:.3f} ({quality_weight*100:.1f}%), convenience={convenience_weight:.3f} ({convenience_weight*100:.1f}%)")
        logger.info(f"[ACTIVITY_SCORE] ═══ TOP 10 ACTIVITIES (sorted by total_score DESC) ═══")
        
        top_10 = activities[:10] if len(activities) >= 10 else activities
        for idx, act in enumerate(top_10, 1):
            name = act.get('name', 'Unknown')[:60]  # Truncate long names
            price_val = act.get('price', {}).get('amount') if isinstance(act.get('price'), dict) else act.get('price')
            rating_val = act.get('rating', 'N/A')
            duration_val = act.get('minimumDuration') or act.get('duration', 'N/A')
            budget_s = act.get('budget_score', 0) / 100.0  # Convert to 0-1 range
            quality_s = act.get('quality_score', 0) / 100.0  # Convert to 0-1 range
            convenience_s = act.get('convenience_score', 0) / 100.0  # Convert to 0-1 range
            total_s = act.get('total_score', 0)  # Already 0-1 range
            
            # Calculate weighted contributions (using 0-1 normalized values)
            budget_contrib = budget_s * budget_weight
            quality_contrib = quality_s * quality_weight
            convenience_contrib = convenience_s * convenience_weight
            
            logger.info(
                f"[ACTIVITY_SCORE] #{idx:2d}. {name}"
            )
            logger.info(
                f"[ACTIVITY_SCORE]     Total Score: {total_s:.6f} | Raw: price=${price_val} | rating={rating_val} | duration={duration_val}"
            )
            logger.info(
                f"[ACTIVITY_SCORE]     Contributions: budget={budget_contrib:.4f} ({budget_s:.3f}*{budget_weight:.3f}) | quality={quality_contrib:.4f} ({quality_s:.3f}*{quality_weight:.3f}) | convenience={convenience_contrib:.4f} ({convenience_s:.3f}*{convenience_weight:.3f})"
            )
        
        logger.info(f"[ACTIVITY_SCORE] ═══ END SCORING REPORT ═══")
        logger.info(f"[ACTIVITY_SCORE] ════════════════════════════════════════════════════════════════")
        
        # ADD: Log top 3 for quick comparison (budget 9% vs 71% test)
        logger.info(f"[ACTIVITY_SCORE] ─── TOP 3 SUMMARY (for weight comparison test) ───")
        for idx, act in enumerate(top_10[:3], 1):
            name = act.get('name', 'Unknown')[:50]
            price_val = act.get('price', {}).get('amount') if isinstance(act.get('price'), dict) else act.get('price')
            total_s = act.get('total_score', 0)
            logger.info(f"[ACTIVITY_SCORE] #{idx}: {name} | Score: {total_s:.6f} | Price: ${price_val}")
        
    except Exception as e:
        logger.error(f"[ACTIVITY_SCORE] Failed to score activities ({context_label}): {e}", exc_info=True)
    
    return activities


# ==================== AIRLINE API ENDPOINTS ====================

@app.get("/api/amadeus/airline/lookup")
def airline_lookup(airline_code: Optional[str] = None, airline_name: Optional[str] = None):
    """Lookup airline information by code or name"""
    if not amadeus_service:
        raise HTTPException(status_code=503, detail="Amadeus service not available")
    
    result = amadeus_service.get_airline_code_lookup(airline_code, airline_name)
    return result

@app.get("/api/amadeus/airline/routes")
def airline_routes(airline_code: str):
    """Get routes for a specific airline"""
    if not amadeus_service:
        raise HTTPException(status_code=503, detail="Amadeus service not available")
    
    result = amadeus_service.get_airline_routes(airline_code)
    return result

# ==================== AIRPORT API ENDPOINTS ====================

@app.get("/api/amadeus/airport/nearest")
def airport_nearest(latitude: float, longitude: float, radius: int = 500):
    """Get nearest relevant airports to coordinates"""
    if not amadeus_service:
        raise HTTPException(status_code=503, detail="Amadeus service not available")
    
    result = amadeus_service.get_airport_nearest_relevant(latitude, longitude, radius)
    return result

@app.get("/api/amadeus/airport/on-time-performance")
def airport_on_time_performance(airport_code: str, date: str):
    """Get airport on-time performance statistics"""
    if not amadeus_service:
        raise HTTPException(status_code=503, detail="Amadeus service not available")
    
    result = amadeus_service.get_airport_on_time_performance(airport_code, date)
    return result

@app.get("/api/amadeus/airport/routes")
def airport_routes(airport_code: str):
    """Get routes from/to an airport"""
    if not amadeus_service:
        raise HTTPException(status_code=503, detail="Amadeus service not available")
    
    result = amadeus_service.get_airport_routes(airport_code)
    return result

# ==================== CITY API ENDPOINTS ====================

@app.get("/api/amadeus/city/search")
def city_search(keyword: str):
    """Search for cities"""
    if not amadeus_service:
        raise HTTPException(status_code=503, detail="Amadeus service not available")
    
    result = amadeus_service.get_city_search(keyword)
    return result

# ==================== FLIGHT API ENDPOINTS (Additional) ====================

@app.get("/api/amadeus/flight/busiest-period")
def flight_busiest_period(origin: str, destination: str, period: str = "2024"):
    """Get busiest traveling periods for a route"""
    if not amadeus_service:
        raise HTTPException(status_code=503, detail="Amadeus service not available")
    
    result = amadeus_service.get_flight_busiest_traveling_period(origin, destination, period)
    return result

@app.get("/api/amadeus/flight/checkin-links")
def flight_checkin_links(airline_code: str):
    """Get check-in links for an airline"""
    if not amadeus_service:
        raise HTTPException(status_code=503, detail="Amadeus service not available")
    
    result = amadeus_service.get_flight_checkin_links(airline_code)
    return result

class FlightOrderRequest(BaseModel):
    flight_offer: Dict[str, Any]
    travelers: List[Dict[str, Any]]

@app.post("/api/amadeus/flight/order")
def create_flight_order(req: FlightOrderRequest):
    """Create a flight order/booking"""
    if not amadeus_service:
        raise HTTPException(status_code=503, detail="Amadeus service not available")
    
    result = amadeus_service.create_flight_order(req.flight_offer, req.travelers)
    return result

@app.get("/api/amadeus/flight/most-booked")
def flight_most_booked(origin: str, period: str = "2024"):
    """Get most booked destinations from an origin"""
    if not amadeus_service:
        raise HTTPException(status_code=503, detail="Amadeus service not available")
    
    result = amadeus_service.get_flight_most_booked_destinations(origin, period)
    return result

@app.get("/api/amadeus/flight/most-traveled")
def flight_most_traveled(origin: str, period: str = "2024"):
    """Get most traveled destinations from an origin"""
    if not amadeus_service:
        raise HTTPException(status_code=503, detail="Amadeus service not available")
    
    result = amadeus_service.get_flight_most_traveled_destinations(origin, period)
    return result

class FlightPriceRequest(BaseModel):
    flight_offer_id: str

@app.post("/api/amadeus/flight/offers/price")
def flight_offers_price(req: FlightPriceRequest):
    """Get price for a specific flight offer"""
    if not amadeus_service:
        raise HTTPException(status_code=503, detail="Amadeus service not available")
    
    result = amadeus_service.get_flight_offers_price(req.flight_offer_id)
    return result

@app.get("/api/amadeus/flight/order/{order_id}")
def get_flight_order(order_id: str):
    """Get flight order details"""
    if not amadeus_service:
        raise HTTPException(status_code=503, detail="Amadeus service not available")
    
    result = amadeus_service.get_flight_order(order_id)
    return result

@app.delete("/api/amadeus/flight/order/{order_id}")
def delete_flight_order(order_id: str):
    """Delete/cancel a flight order"""
    if not amadeus_service:
        raise HTTPException(status_code=503, detail="Amadeus service not available")
    
    result = amadeus_service.delete_flight_order(order_id)
    return result

@app.get("/api/amadeus/flight/status")
def on_demand_flight_status(carrier_code: str, flight_number: str, scheduled_departure_date: str):
    """Get real-time flight status"""
    if not amadeus_service:
        raise HTTPException(status_code=503, detail="Amadeus service not available")
    
    result = amadeus_service.get_on_demand_flight_status(carrier_code, flight_number, scheduled_departure_date)
    return result

# ==================== HOTEL API ENDPOINTS (Additional) ====================

@app.get("/api/amadeus/hotel/list")
def hotel_list(city_code: Optional[str] = None, hotel_ids: Optional[str] = None):
    """Get list of hotels by city or hotel IDs"""
    if not amadeus_service:
        raise HTTPException(status_code=503, detail="Amadeus service not available")
    
    hotel_ids_list = hotel_ids.split(",") if hotel_ids else None
    result = amadeus_service.get_hotel_list(city_code, hotel_ids_list)
    return result

@app.get("/api/amadeus/hotel/autocomplete")
def hotel_name_autocomplete(keyword: str):
    """Autocomplete hotel names"""
    if not amadeus_service:
        raise HTTPException(status_code=503, detail="Amadeus service not available")
    
    result = amadeus_service.get_hotel_name_autocomplete(keyword)
    return result

@app.get("/api/amadeus/hotel/ratings")
def hotel_ratings(hotel_ids: str):
    """Get hotel ratings"""
    if not amadeus_service:
        raise HTTPException(status_code=503, detail="Amadeus service not available")
    
    hotel_ids_list = hotel_ids.split(",")
    result = amadeus_service.get_hotel_ratings(hotel_ids_list)
    return result

class HotelBookingRequest(BaseModel):
    offer_id: str
    guests: List[Dict[str, Any]]
    payments: List[Dict[str, Any]]

@app.post("/api/amadeus/hotel/booking")
def create_hotel_booking(req: HotelBookingRequest):
    """Create a hotel booking"""
    if not amadeus_service:
        raise HTTPException(status_code=503, detail="Amadeus service not available")
    
    result = amadeus_service.create_hotel_booking(req.offer_id, req.guests, req.payments)
    return result

class HotelSearchV3Request(BaseModel):
    hotel_ids: List[str]
    check_in: str
    check_out: str
    adults: int = 1
    room_quantity: int = 1
    currency: Optional[str] = None
    price_range: Optional[str] = None
    payment_policy: str = "NONE"
    board_type: Optional[str] = None
    best_rate_only: bool = False

@app.post("/api/amadeus/hotel/search-v3")
def search_hotels_v3(req: HotelSearchV3Request):
    """Search hotels using v3 API with hotel IDs (provides detailed pricing with base, taxes, markups, sellingTotal)"""
    if not amadeus_service:
        raise HTTPException(status_code=503, detail="Amadeus service not available")
    
    result = amadeus_service.search_hotels_v3(
        hotel_ids=req.hotel_ids,
        check_in=req.check_in,
        check_out=req.check_out,
        adults=req.adults,
        room_quantity=req.room_quantity,
        currency=req.currency,
        price_range=req.price_range,
        payment_policy=req.payment_policy,
        board_type=req.board_type,
        best_rate_only=req.best_rate_only
    )
    return result

@app.get("/api/amadeus/hotel/offer-pricing/{offer_id}")
def get_hotel_offer_pricing(offer_id: str, lang: str = "EN"):
    """Get detailed pricing for a specific hotel offer (most accurate real-time price from v3 API)"""
    if not amadeus_service:
        raise HTTPException(status_code=503, detail="Amadeus service not available")
    
    result = amadeus_service.get_hotel_offer_pricing(offer_id, lang)
    return result

# ==================== TRANSFER API ENDPOINTS ====================

@app.get("/api/amadeus/transfer/search")
def search_transfers(origin_lat: float, origin_lon: float, destination_lat: float, 
                     destination_lon: float, departure_date: str, adults: int = 1):
    """Search for transfer options"""
    if not amadeus_service:
        raise HTTPException(status_code=503, detail="Amadeus service not available")
    
    result = amadeus_service.search_transfers(origin_lat, origin_lon, destination_lat, 
                                              destination_lon, departure_date, adults)
    return result

class TransferBookingRequest(BaseModel):
    offer_id: str
    passengers: List[Dict[str, Any]]
    payment: Dict[str, Any]

@app.post("/api/amadeus/transfer/booking")
def create_transfer_booking(req: TransferBookingRequest):
    """Create a transfer booking"""
    if not amadeus_service:
        raise HTTPException(status_code=503, detail="Amadeus service not available")
    
    result = amadeus_service.create_transfer_booking(req.offer_id, req.passengers, req.payment)
    return result

@app.get("/api/amadeus/transfer/booking/{booking_id}")
def get_transfer_booking(booking_id: str):
    """Get transfer booking details"""
    if not amadeus_service:
        raise HTTPException(status_code=503, detail="Amadeus service not available")
    
    result = amadeus_service.get_transfer_booking(booking_id)
    return result

@app.delete("/api/amadeus/transfer/booking/{booking_id}")
def cancel_transfer_booking(booking_id: str):
    """Cancel a transfer booking"""
    if not amadeus_service:
        raise HTTPException(status_code=503, detail="Amadeus service not available")
    
    result = amadeus_service.cancel_transfer_booking(booking_id)
    return result

# ==================== TRAVEL API ENDPOINTS ====================

@app.get("/api/amadeus/travel/recommendations")
def travel_recommendations(origin: str, destination: Optional[str] = None):
    """Get travel recommendations"""
    if not amadeus_service:
        raise HTTPException(status_code=503, detail="Amadeus service not available")
    
    result = amadeus_service.get_travel_recommendations(origin, destination)
    return result

@app.get("/api/amadeus/travel/restrictions")
def travel_restrictions(origin: str, destination: str):
    """Get travel restrictions between countries"""
    if not amadeus_service:
        raise HTTPException(status_code=503, detail="Amadeus service not available")
    
    result = amadeus_service.get_travel_restrictions(origin, destination)
    return result

class TripParserRequest(BaseModel):
    sentence: str

@app.post("/api/amadeus/travel/trip-parser")
def parse_trip(req: TripParserRequest):
    """Parse trip information from natural language"""
    if not amadeus_service:
        raise HTTPException(status_code=503, detail="Amadeus service not available")
    
    result = amadeus_service.parse_trip(req.sentence)
    return result

@app.get("/api/amadeus/travel/trip-purpose")
def trip_purpose_prediction(origin: str, destination: str, departure_date: str):
    """Predict trip purpose (business/leisure)"""
    if not amadeus_service:
        raise HTTPException(status_code=503, detail="Amadeus service not available")
    
    result = amadeus_service.get_trip_purpose_prediction(origin, destination, departure_date)
    return result

# ==================== LOCATION API ENDPOINTS ====================

@app.get("/api/amadeus/location/score")
def location_score(latitude: float, longitude: float):
    """Get location score/rating"""
    if not amadeus_service:
        raise HTTPException(status_code=503, detail="Amadeus service not available")
    
    result = amadeus_service.get_location_score(latitude, longitude)
    return result

@app.get("/api/amadeus/location/pois")
def points_of_interest(latitude: float, longitude: float, radius: int = 2, 
                       categories: Optional[str] = None):
    """Get points of interest near coordinates"""
    if not amadeus_service:
        raise HTTPException(status_code=503, detail="Amadeus service not available")
    
    categories_list = categories.split(",") if categories else None
    result = amadeus_service.get_points_of_interest(latitude, longitude, radius, categories_list)
    return result

# ==================== EXISTING ENDPOINTS ====================

@app.post("/api/generateOptimalItinerary")
async def generate_optimal_itinerary_endpoint(req: OptimalItineraryRequest):
    """
    Generate optimal itinerary combining flights, hotels, and activities
    """
    try:
        result = generateOptimalItinerary(
            flights=req.flights,
            hotels=req.hotels,
            activities=req.activities,
            preferences=req.preferences,
            userBudget=req.userBudget
        )
        return result
    except Exception as e:
        logger.error(f"[OPTIMAL_ITINERARY] Error: {e}")
        raise HTTPException(status_code=500, detail=f"Error generating optimal itinerary: {str(e)}")

@app.post("/api/fetchItineraryData")
async def fetch_itinerary_data(req: Dict[str, Any]):
    """
    Fetch hotels and activities for itinerary generation
    """
    try:
        destination_code = req.get('destinationCode', '')
        destination_name = req.get('destinationName', '')
        check_in = req.get('checkIn', '')
        check_out = req.get('checkOut', '')
        adults = req.get('adults', 1)
        
        logger.info(f"[ITINERARY_DATA] Received request: destinationCode={destination_code}, destinationName={destination_name}, checkIn={check_in}, checkOut={check_out}, adults={adults}")
        
        if not amadeus_service:
            return {
                'ok': False,
                'error': 'Amadeus service not available',
                'hotels': [],
                'activities': []
            }
        
        hotels = []
        activities = []
        
        # Fetch hotels - try with destination_code or destination_name
        if check_in and check_out:
            try:
                from services.iata_codes import get_iata_code
                # Try to get city code from destination code or name
                city_code = destination_code
                
                # If no destination_code or it's not a valid IATA code (3 uppercase letters), try to get from destination_name
                if not city_code or city_code == '' or (len(city_code) != 3 or not city_code.isupper()):
                    # Try to get IATA code from destination_name first
                    if destination_name:
                        city_code = get_iata_code(destination_name)
                        logger.info(f"[ITINERARY_DATA] Converted destination_name '{destination_name}' to IATA code: {city_code}")
                    
                    # If still no code, try destination_code (might be a city name)
                    if not city_code and destination_code:
                        city_code = get_iata_code(destination_code)
                        logger.info(f"[ITINERARY_DATA] Converted destination_code '{destination_code}' to IATA code: {city_code}")
                    
                    # If still no code, use destination_code as fallback (might work for some APIs)
                    if not city_code:
                        city_code = destination_code if destination_code else destination_name
                        logger.warn(f"[ITINERARY_DATA] Could not convert to IATA code, using as-is: {city_code}")
                
                if city_code:
                    logger.info(f"[ITINERARY_DATA] Searching hotels with city_code: {city_code}, destination_name: {destination_name}")
                    hotel_result = amadeus_service.search_hotels(
                        city_code=city_code,
                        check_in=check_in,
                        check_out=check_out,
                        adults=adults
                    )
                    
                    if not hotel_result.get('error') and hotel_result.get('hotels'):
                        hotels = hotel_result['hotels'][:20]  # Limit to 20 hotels
                        request_preferences = req.get('preferences')
                        if request_preferences:
                            hotels = apply_preference_weights_to_hotels(hotels, request_preferences, context_label="fetch_itinerary")
                        logger.info(f"[ITINERARY_DATA] Found {len(hotels)} hotels")
                    else:
                        logger.warn(f"[ITINERARY_DATA] Hotel search returned error or no hotels: {hotel_result.get('error', 'No hotels found')}")
                        # Try fallback: get coordinates and search by location
                        if destination_name:
                            try:
                                logger.info(f"[ITINERARY_DATA] Attempting fallback: getting coordinates for {destination_name}")
                                coords = amadeus_service.get_city_coordinates(destination_name)
                                if coords:
                                    latitude, longitude = coords
                                    logger.info(f"[ITINERARY_DATA] Got coordinates: {latitude}, {longitude}")
                                    # Note: Amadeus hotel API doesn't support coordinate-based search directly
                                    # But we can log this for future implementation
                                    logger.info(f"[ITINERARY_DATA] Coordinate-based hotel search not yet implemented in Amadeus API")
                            except Exception as coord_error:
                                logger.warn(f"[ITINERARY_DATA] Could not get coordinates for fallback: {coord_error}")
                else:
                    logger.warn(f"[ITINERARY_DATA] No valid city code found for destination: {destination_name}")
            except Exception as e:
                logger.error(f"[ITINERARY_DATA] Error fetching hotels: {e}")
        else:
            logger.warn(f"[ITINERARY_DATA] Missing check_in or check_out dates: check_in={check_in}, check_out={check_out}")
        
        # Fetch activities - need coordinates for activities
        # For now, we'll return empty activities list and let frontend handle it
        # In production, you'd need to geocode the destination to get coordinates
        try:
            # Try to get coordinates from hotel data if available
            if hotels and len(hotels) > 0:
                first_hotel = hotels[0]
                latitude = first_hotel.get('latitude')
                longitude = first_hotel.get('longitude')
                
                if latitude and longitude:
                    activity_result = amadeus_service.search_activities(
                        latitude=float(latitude),
                        longitude=float(longitude),
                        radius=20  # 20km radius
                    )
                    
                    if not activity_result.get('error') and activity_result.get('activities'):
                        activities = activity_result['activities'][:30]  # Limit to 30 activities
                        
                        # Apply preference filters to activities
                        # Calculate trip duration from check_in/check_out
                        trip_duration_days = None
                        if check_in and check_out:
                            try:
                                check_in_dt = datetime.strptime(check_in, "%Y-%m-%d")
                                check_out_dt = datetime.strptime(check_out, "%Y-%m-%d")
                                trip_duration_days = (check_out_dt - check_in_dt).days
                            except (ValueError, TypeError) as date_error:
                                logger.debug(f"[ITINERARY_DATA] Could not parse dates for trip duration: {date_error}")
                        
                        # Get preferences from request
                        request_preferences = req.get('preferences')
                        
                        # Apply filters
                        activities = apply_preference_filters_to_activities(
                            activities,
                            preferences=request_preferences,
                            trip_duration_days=trip_duration_days,
                            context_label="fetch_itinerary"
                        )
                        
                        # Generate fixed header template for activities
                        destination_city = destination_name or destination_code or "your destination"
                        activity_result['_header_title'] = f"Top activities in {destination_city}"
                        activity_result['_subtitle'] = "Ranked by how well they match your preferences."
                        
                        logger.info(f"[ITINERARY_DATA] Found {len(activities)} activities")
        except Exception as e:
            logger.error(f"[ITINERARY_DATA] Error fetching activities: {e}")
        
        return {
            'ok': True,
            'hotels': hotels,
            'activities': activities
        }
    except Exception as e:
        logger.error(f"[ITINERARY_DATA] Error: {e}")
        return {
            'ok': False,
            'error': str(e),
            'hotels': [],
            'activities': []
        }

@app.post("/api/optimizeTrip")
async def optimize_trip(preferences: TripPreferences):
    """
    Optimize trip recommendations based on user preferences.
    Uses weighted scoring: score = budgetWeight * (1/price) + qualityWeight * rating + convenienceWeight * (1/travelTime)
    """
    try:
        budget_weight = preferences.budget
        quality_weight = preferences.quality
        convenience_weight = preferences.convenience
        
        logger.info(f"[OPTIMIZE_TRIP] Received preferences: budget={budget_weight}, quality={quality_weight}, convenience={convenience_weight}")
        
        # Sample travel options (simulated data)
        # In production, this would come from real flight/hotel APIs
        sample_options = [
            {"destination": "Paris, France", "price": 850.00, "rating": 4.5, "travelTime": 8.5},
            {"destination": "Tokyo, Japan", "price": 1200.00, "rating": 4.8, "travelTime": 14.0},
            {"destination": "Barcelona, Spain", "price": 750.00, "rating": 4.3, "travelTime": 7.5},
            {"destination": "Bali, Indonesia", "price": 1100.00, "rating": 4.7, "travelTime": 20.0},
            {"destination": "New York, USA", "price": 600.00, "rating": 4.2, "travelTime": 5.5},
            {"destination": "Dubai, UAE", "price": 950.00, "rating": 4.6, "travelTime": 12.0},
            {"destination": "Rome, Italy", "price": 800.00, "rating": 4.4, "travelTime": 9.0},
            {"destination": "Bangkok, Thailand", "price": 900.00, "rating": 4.5, "travelTime": 16.0},
            {"destination": "London, UK", "price": 700.00, "rating": 4.3, "travelTime": 7.0},
            {"destination": "Sydney, Australia", "price": 1300.00, "rating": 4.7, "travelTime": 22.0},
        ]
        
        # Normalize prices and travel times for scoring
        # Find min/max for normalization
        prices = [opt["price"] for opt in sample_options]
        travel_times = [opt["travelTime"] for opt in sample_options]
        min_price = min(prices)
        max_price = max(prices)
        min_travel_time = min(travel_times)
        max_travel_time = max(travel_times)
        
        # Calculate normalized scores for each option
        scored_options = []
        for option in sample_options:
            price = option["price"]
            rating = option["rating"]
            travel_time = option["travelTime"]
            
            # Normalize price (lower is better, so use inverse)
            # Normalize to 0-1 range: (max - value) / (max - min)
            normalized_price_score = (max_price - price) / (max_price - min_price) if max_price > min_price else 0.5
            
            # Normalize travel time (lower is better, so use inverse)
            normalized_time_score = (max_travel_time - travel_time) / (max_travel_time - min_travel_time) if max_travel_time > min_travel_time else 0.5
            
            # Normalize rating (higher is better, already 0-5 scale, normalize to 0-1)
            normalized_rating_score = rating / 5.0
            
            # Calculate weighted score
            # Note: Using normalized_price_score and normalized_time_score ensures all components are 0-1 scale
            score = (
                budget_weight * normalized_price_score +
                quality_weight * normalized_rating_score +
                convenience_weight * normalized_time_score
            )
            
            scored_options.append({
                **option,
                "score": score
            })
        
        # Sort by score (highest first) and return top 3
        scored_options.sort(key=lambda x: x["score"], reverse=True)
        top_options = scored_options[:3]
        
        logger.info(f"[OPTIMIZE_TRIP] Returning top 3 options: {[opt['destination'] for opt in top_options]}")
        
        return {
            "ok": True,
            "options": top_options,
            "weights": {
                "budget": budget_weight,
                "quality": quality_weight,
                "convenience": convenience_weight
            }
        }
    
    except Exception as e:
        logger.error(f"[OPTIMIZE_TRIP] Error: {e}")
        raise HTTPException(status_code=500, detail=f"Error optimizing trip: {str(e)}")

@app.post("/api/chat")
async def chat(req: ChatRequest):
    try:
        # ADD: End-to-end trace of preferences from FE → BE
        logger.info(f"[PREF_TRACE] ═══ PREFERENCES FLOW TRACE (FE → BE) ═══")
        logger.info(f"[PREF_TRACE] Received request with preferences: {req.preferences}")
        if req.preferences:
            logger.info(f"[PREF_TRACE] Preferences type: {type(req.preferences)}, keys: {list(req.preferences.keys()) if isinstance(req.preferences, dict) else 'N/A'}")
            logger.info(f"[PREF_TRACE] Raw values: budget={req.preferences.get('budget')}, quality={req.preferences.get('quality')}, convenience={req.preferences.get('convenience')}")
            if isinstance(req.preferences, dict):
                raw_budget = req.preferences.get('budget', 0)
                raw_quality = req.preferences.get('quality', 0)
                raw_convenience = req.preferences.get('convenience', 0)
                total_raw = raw_budget + raw_quality + raw_convenience
                logger.info(f"[PREF_TRACE] Sum check: {raw_budget:.3f} + {raw_quality:.3f} + {raw_convenience:.3f} = {total_raw:.3f}")
        else:
            logger.warning(f"[PREF_TRACE] ⚠️ No preferences in request body!")
        
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
        
        # Check if message contains activity-related keywords FIRST (before flight keywords)
        # This is important to prioritize activity context over generic travel keywords
        activity_keywords = [
            'activity', 'activities', 'tour', 'tours', 'guided tour', 'walking tour',
            'attraction', 'attractions', 'things to do', 'sightseeing', 'sightsee',
            'visit', 'explore', 'see', 'museum', 'museums', 'park', 'beach',
            'below', 'under', 'cheap', 'affordable', 'budget'
        ]
        has_activity_keywords = any(keyword in user_message.lower() for keyword in activity_keywords)
        logger.info(f"Activity keyword check: {has_activity_keywords}")
        
        # Check if message contains flight-related keywords
        flight_keywords = [
            'flight', 'flights', 'airline', 'airlines', 'airplane', 'aircraft', 'plane',
            'ticket', 'tickets', 'booking', 'book', 'reserve', 'reservation',
            'destination', 'departure', 'arrival', 'airport', 'terminal',
            'fare', 'fares',
            'search flights', 'find flights', 'book flights', 'flight search',
            'airline tickets', 'plane tickets', 'flight booking', 'travel booking'
        ]
        
        has_flight_keywords = any(keyword in user_message.lower() for keyword in flight_keywords)
        logger.info(f"Flight keyword check: {has_flight_keywords}")
        
        # Use intent detection for proper parsing
        logger.info(f"Processing message for session {session_id}: {user_message[:100]}...")
        
        # Extract context variables from request
        now_iso = req.context.now_iso if req.context else None
        user_tz = req.context.user_tz if req.context else None
        user_location_obj = req.context.user_location if req.context else None
        
        # Convert Pydantic model to dict for intent detector
        user_location = None
        if user_location_obj:
            user_location = {
                'city': user_location_obj.city if hasattr(user_location_obj, 'city') else None,
                'region': user_location_obj.region if hasattr(user_location_obj, 'region') else None,
                'country': user_location_obj.country if hasattr(user_location_obj, 'country') else None,
                'lat': user_location_obj.lat if hasattr(user_location_obj, 'lat') else None,
                'lon': user_location_obj.lon if hasattr(user_location_obj, 'lon') else None
            }
        
        # Detect intent using the intent detector
        if intent_detector:
            try:
                # Create context object with current date and location
                context = {
                    'now_iso': now_iso,
                    'user_tz': user_tz,
                    'user_location': user_location
                }
                raw_intent_data = await intent_detector.analyze_message(user_message, req.messages, context)
                logger.info(f"Raw intent detection result: type={raw_intent_data['type']}, confidence={raw_intent_data['confidence']}, has_required_params={raw_intent_data['has_required_params']}")
                logger.info(f"Extracted parameters: {raw_intent_data['params']}")
                
                # Apply intent overrides to ensure correct routing
                raw_intent_type = raw_intent_data['type']
                final_intent_type = apply_intent_overrides(user_message, raw_intent_type)
                
                # Update intent type if override was applied
                if final_intent_type != raw_intent_type:
                    logger.info(f"[INTENT_OVERRIDE] Changed intent from '{raw_intent_type}' to '{final_intent_type}'")
                    raw_intent_data['type'] = final_intent_type
                
                intent = raw_intent_data
                logger.info(f"Final intent after overrides: type={intent['type']}, confidence={intent['confidence']}, has_required_params={intent['has_required_params']}")
                
                # Check conversation context to override incorrect intent detection
                # Priority: If activity keywords are present OR previous context is about activities
                should_override_to_activity = False
                destination = None
                max_price = None
                import re
                
                if len(req.messages) >= 2:
                    previous_assistant_msg = None
                    previous_user_msg = None
                    # Find the most recent assistant and user messages
                    for msg in reversed(req.messages[:-1]):
                        if msg.get("role") == "assistant" and not previous_assistant_msg:
                            previous_assistant_msg = msg.get("content", "").lower()
                        if msg.get("role") == "user" and not previous_user_msg:
                            previous_user_msg = msg.get("content", "").lower()
                        if previous_assistant_msg and previous_user_msg:
                            break
                    
                    # Check if previous context is about activities
                    previous_context_is_activity = False
                    if previous_assistant_msg and any(word in previous_assistant_msg for word in 
                                                      ["activity", "activities", "tour", "tours", "attraction", 
                                                       "visit", "things to do", "recommendations", "fantastic activities"]):
                        previous_context_is_activity = True
                    
                    # Check if current message has activity-related keywords
                    activity_refinement_keywords = ["tour", "guided tour", "walking tour", "under", "below", 
                                                    "budget", "cheap", "affordable", "less than", "$"]
                    has_activity_refinement = any(keyword in user_message.lower() for keyword in activity_refinement_keywords)
                    
                    # Override to activity_search if:
                    # 1. Previous context is about activities AND user is refining, OR
                    # 2. Current message has activity keywords
                    if (previous_context_is_activity and has_activity_refinement) or has_activity_keywords:
                        if intent["type"] != "activity_search" or not intent.get("has_required_params"):
                            should_override_to_activity = True
                            logger.info(f"[MAIN] Should override to activity_search - previous_context: {previous_context_is_activity}, has_activity_refinement: {has_activity_refinement}, has_activity_keywords: {has_activity_keywords}")
                    
                    if should_override_to_activity:
                        # Try to extract destination from previous assistant message
                        if previous_assistant_msg:
                            # Pattern: "activities in Barcelona" or "to Barcelona" or "**Barcelona" 
                            destination_patterns = [
                                r'\b(activities in|tours in|things to do in|to)\s+([A-Z][a-zA-Z\s]+)',
                                r'\*\*([A-Z][a-zA-Z]+)\*\*',  # **Barcelona**
                                r'\b([A-Z][a-zA-Z]+)\s+from',  # "Barcelona from"
                            ]
                            for pattern in destination_patterns:
                                dest_match = re.search(pattern, previous_assistant_msg)
                                if dest_match:
                                    destination = dest_match.group(2) if len(dest_match.groups()) > 1 else dest_match.group(1)
                                    destination = destination.strip()
                                    if destination and len(destination.split()) <= 3:  # Valid city name
                                        break
                        
                        # Try to extract from previous user messages
                        if not destination:
                            for msg in reversed(req.messages):
                                if msg.get("role") == "user":
                                    user_content = msg.get("content", "")
                                    # Pattern: "activities in Barcelona" or "Top activities in Barcelona"
                                    dest_patterns = [
                                        r'\b(activities|tours|things to do)\s+(in|at)\s+([A-Z][a-zA-Z\s]+)',
                                        r'\b(in|at)\s+([A-Z][a-zA-Z]+)\s+from',  # "in Barcelona from"
                                        r'\b(in|at)\s+([A-Z][a-zA-Z\s]+)(?:\s+from|\s+to|$)',  # "in Barcelona"
                                    ]
                                    for pattern in dest_patterns:
                                        dest_match = re.search(pattern, user_content)
                                        if dest_match:
                                            destination = dest_match.group(3) if len(dest_match.groups()) >= 3 else dest_match.group(2)
                                            destination = destination.strip()
                                            # Clean up common trailing words
                                            destination = re.sub(r'\s+(from|to|on|in|at)$', '', destination)
                                            if destination and len(destination.split()) <= 3:
                                                break
                                    if destination:
                                        break
                        
                        # Extract max_price if mentioned (handle both $20 and "below $20", "under 20")
                        price_patterns = [
                            r'\$(\d+)',
                            r'(?:below|under|less than|cheaper than)\s+\$?(\d+)',
                            r'\$?(\d+)\s+(?:or less|or under|or below)'
                        ]
                        for pattern in price_patterns:
                            price_match = re.search(pattern, user_message.lower())
                            if price_match:
                                max_price = int(price_match.group(1))
                                break
                        
                        # Always set has_required_params to True since we have a default destination
                        final_destination = destination or "Barcelona"
                        intent = {
                            "type": "activity_search",
                            "confidence": 0.9,
                            "params": {
                                "destination": final_destination,  # Default to Barcelona if not found
                                "max_price": max_price
                            },
                            "has_required_params": True  # Always True since we have destination (default or extracted)
                        }
                        logger.info(f"[MAIN] Overridden intent to activity_search: destination={final_destination}, max_price={max_price}, has_required_params=True")
            except Exception as e:
                logger.error(f"Intent detection failed: {e}")
                intent = {"type": "general", "confidence": 0.0, "has_required_params": False, "params": {}}
        else:
            intent = {"type": "general", "confidence": 0.0, "has_required_params": False, "params": {}}
        
        amadeus_data = None
        
        # Initialize route variables for system prompt
        route_origin = None
        route_destination = None
        route_departure_date = None
        route_return_date = None
        
        # Always fetch flight data if flight keywords are detected, regardless of intent detection
        # BUT skip if we've determined it should be activity_search
        route_info_extracted = None  # Store extracted route info for fallback
        if has_flight_keywords and intent.get("type") != "activity_search":
            logger.info("Flight keywords detected - using intent detection for route and dates")
            
            # Use intent detection results if available, otherwise fallback to extraction
            if intent["type"] == "flight_search" and intent["has_required_params"]:
                logger.info("Using intent detection results for flight search")
                origin = intent["params"].get("origin", "")
                destination = intent["params"].get("destination", "")
                departure_date = intent["params"].get("departure_date", "")
                return_date = intent["params"].get("return_date")
                adults = intent["params"].get("adults", 1)
                max_price = intent["params"].get("max_price")
                
                # Store for system prompt
                route_origin = origin
                route_destination = destination
                route_departure_date = departure_date
                route_return_date = return_date
            else:
                logger.info("Intent detection incomplete - falling back to message extraction")
                # Extract route information from the user's message
                route_info_extracted = extract_route_from_message(user_message)
                logger.info(f"Extracted route info: {route_info_extracted}")
                
                # Extract dates from the user's message
                date_info = extract_dates_from_message(user_message)
                logger.info(f"Extracted date info: {date_info}")
                
                # Combine route and date information
                if route_info_extracted:
                    route_info_extracted.update(date_info)
                
                origin = route_info_extracted.get('departureCode', '') if route_info_extracted else ''
                destination = route_info_extracted.get('destinationCode', '') if route_info_extracted else ''
                departure_date = route_info_extracted.get('departure_date', '') if route_info_extracted else ''
                return_date = route_info_extracted.get('return_date') if route_info_extracted else None
                adults = 1
                max_price = None
                
                # Store for system prompt
                route_origin = origin
                route_destination = destination
                route_departure_date = departure_date
                route_return_date = return_date
            
            # Call real Amadeus API if we have the required parameters
            if origin and destination and departure_date and amadeus_service:
                try:
                    # Validate dates before API call
                    try:
                        parsed_date = datetime.strptime(departure_date, "%Y-%m-%d")
                        if parsed_date < datetime.now():
                            logger.warning(f"[MAIN] ⚠️ Departure date {departure_date} is in the past! This will cause API error.")
                    except ValueError:
                        logger.warning(f"[MAIN] ⚠️ Invalid departure date format: {departure_date}")
                    
                    # Check if origin needs airport code conversion and find all airports
                    origin_airports = []
                    if not _is_iata_code(origin):
                        logger.info(f"[MAIN] Converting origin '{origin}' to IATA code(s)")
                        location_result = amadeus_service.get_airport_city_search(keyword=origin)
                        if location_result and not location_result.get('error') and location_result.get('locations'):
                            airports = [loc for loc in location_result['locations'] if loc.get('type') == 'AIRPORT']
                            if airports:
                                origin_airports = [a.get('code') for a in airports if a.get('code')]
                                logger.info(f"[MAIN] Found {len(origin_airports)} airports for {origin}: {origin_airports}")
                            else:
                                # No airports found, use first location
                                origin_airports = [location_result['locations'][0].get('code', origin)]
                    else:
                        origin_airports = [origin]
                    
                    # Check if destination needs airport code conversion and find all airports
                    dest_airports = []
                    if not _is_iata_code(destination):
                        logger.info(f"[MAIN] Converting destination '{destination}' to IATA code(s)")
                        location_result = amadeus_service.get_airport_city_search(keyword=destination)
                        if location_result and not location_result.get('error') and location_result.get('locations'):
                            airports = [loc for loc in location_result['locations'] if loc.get('type') == 'AIRPORT']
                            if airports:
                                dest_airports = [a.get('code') for a in airports if a.get('code')]
                                logger.info(f"[MAIN] Found {len(dest_airports)} airports for {destination}: {dest_airports}")
                            else:
                                dest_airports = [location_result['locations'][0].get('code', destination)]
                    else:
                        dest_airports = [destination]
                    
                    # Search flights from all origin airports to all destination airports
                    all_flights = []
                    total_searches = len(origin_airports) * len(dest_airports)
                    
                    if total_searches > 1:
                        logger.info(f"[MAIN] Searching {total_searches} airport combinations in parallel...")
                        # Use ThreadPoolExecutor for parallel API calls
                        with ThreadPoolExecutor(max_workers=min(6, total_searches)) as executor:
                            future_to_route = {}
                            for orig_airport in origin_airports:
                                for dest_airport in dest_airports:
                                    future = executor.submit(
                                        amadeus_service.search_flights,
                                        origin=orig_airport,
                                        destination=dest_airport,
                                        departure_date=departure_date,
                                        return_date=return_date,
                                        adults=adults,
                                        max_price=max_price
                                    )
                                    future_to_route[future] = (orig_airport, dest_airport)
                            
                            for future in as_completed(future_to_route):
                                orig_airport, dest_airport = future_to_route[future]
                                try:
                                    airport_flights = future.result()
                                    if airport_flights and not airport_flights.get('error') and airport_flights.get('flights'):
                                        # Add airport info to each flight for tracking
                                        for flight in airport_flights['flights']:
                                            flight['_origin_airport'] = orig_airport
                                            flight['_destination_airport'] = dest_airport
                                        all_flights.extend(airport_flights['flights'])
                                        logger.info(f"[MAIN] Found {len(airport_flights['flights'])} flights from {orig_airport} to {dest_airport}")
                                    else:
                                        logger.info(f"[MAIN] No flights found from {orig_airport} to {dest_airport}")
                                except Exception as e:
                                    logger.error(f"[MAIN] Error searching {orig_airport} -> {dest_airport}: {e}")
                        
                        # Combine all results
                        if all_flights:
                            amadeus_data = {
                                "flights": all_flights,
                                "count": len(all_flights),
                                "_multi_airport_search": True,
                                "_origin_airports": origin_airports,
                                "_destination_airports": dest_airports
                            }
                            # Use first airport codes for display
                            origin = origin_airports[0]
                            destination = dest_airports[0]
                            logger.info(f"[MAIN] Combined results: {len(all_flights)} total flights from {len(origin_airports)} origin(s) to {len(dest_airports)} destination(s)")
                        else:
                            # Fallback to single search if no results
                            logger.warning(f"[MAIN] No flights found from any airport combination, using first airports")
                            origin = origin_airports[0]
                            destination = dest_airports[0]
                            amadeus_data = amadeus_service.search_flights(
                                origin=origin,
                                destination=destination,
                                departure_date=departure_date,
                                return_date=return_date,
                                adults=adults,
                                max_price=max_price
                            )
                    else:
                        # Single airport search
                        origin = origin_airports[0]
                        destination = dest_airports[0]
                        logger.info(f"[MAIN] Calling Amadeus API: {origin} -> {destination} on {departure_date}")
                        amadeus_data = amadeus_service.search_flights(
                            origin=origin,
                            destination=destination,
                            departure_date=departure_date,
                            return_date=return_date,
                            adults=adults,
                            max_price=max_price
                        )
                    
                    logger.info(f"[MAIN] Amadeus API returned: {amadeus_data.get('count', 0) if amadeus_data else 0} flights")
                    
                    # Log whether we got real data or error
                    if amadeus_data and not amadeus_data.get('error'):
                        logger.info(f"[MAIN] ✅ Using REAL Amadeus data - {len(amadeus_data.get('flights', []))} flights")
                        if amadeus_data.get('flights'):
                            first_flight = amadeus_data['flights'][0]
                            logger.info(f"[MAIN] First flight sample: Price={first_flight.get('price')}, Currency={first_flight.get('currency')}")
                        
                        # Convert flights format to outboundFlights/returnFlights format if needed
                        if 'flights' in amadeus_data and 'outboundFlights' not in amadeus_data:
                            logger.info("[MAIN] Converting flights format to outboundFlights/returnFlights format")
                            from services.flight_formatter import format_flight_for_dashboard
                            
                            # Get city names for display
                            origin_city = route_info_extracted.get('departure', origin) if route_info_extracted else origin
                            destination_city = route_info_extracted.get('destination', destination) if route_info_extracted else destination
                            
                            # Get user preferences if available
                            user_prefs = req.preferences if req.preferences else None
                            if user_prefs:
                                logger.info(f"[MAIN] Using user preferences for sorting: {user_prefs}")
                                logger.info(f"[MAIN] Preferences type: {type(user_prefs)}, keys: {user_prefs.keys() if isinstance(user_prefs, dict) else 'N/A'}")
                                logger.info(f"[MAIN] Preferences values: budget={user_prefs.get('budget') if isinstance(user_prefs, dict) else 'N/A'}, quality={user_prefs.get('quality') if isinstance(user_prefs, dict) else 'N/A'}, convenience={user_prefs.get('convenience') if isinstance(user_prefs, dict) else 'N/A'}")
                            else:
                                logger.warning(f"[MAIN] ⚠️ No user preferences provided! req.preferences = {req.preferences}")
                            
                            try:
                                formatted_data = format_flight_for_dashboard(
                                    flight_data=amadeus_data,
                                    origin_city=origin_city,
                                    dest_city=destination_city,
                                    origin_code=origin,
                                    dest_code=destination,
                                    departure_date=departure_date,
                                    return_date=return_date,
                                    user_preferences=user_prefs
                                )
                                
                                # Update amadeus_data with formatted data
                                amadeus_data['outboundFlights'] = formatted_data.get('outboundFlights', [])
                                amadeus_data['returnFlights'] = formatted_data.get('returnFlights', [])
                                logger.info(f"[MAIN] Converted to {len(amadeus_data['outboundFlights'])} outbound and {len(amadeus_data.get('returnFlights', []))} return flights")
                            except Exception as e:
                                logger.error(f"[MAIN] Error converting flight data format: {e}")
                                # Keep original format if conversion fails
                        
                        # Mark that we have real data to prevent mock data generation
                        amadeus_data['_is_real_data'] = True
                    else:
                        logger.warning(f"[MAIN] ⚠️ Amadeus API returned error: {amadeus_data.get('error', 'Unknown error')}")
                except Exception as e:
                    logger.error(f"[MAIN] Amadeus API call failed: {e}")
                    amadeus_data = {"error": f"API call failed: {str(e)}"}
            else:
                logger.warning("[MAIN] Missing required parameters for Amadeus API call")
                # Provide specific error message based on what's missing
                if not origin or not destination:
                    amadeus_data = {"error": "Missing origin or destination. Please provide both origin and destination cities (e.g., 'flights from New York to Paris')."}
                elif not departure_date:
                    amadeus_data = {"error": "Missing departure date. Please provide a departure date (e.g., 'November 3rd' or '11/03/2024')."}
                else:
                    amadeus_data = {"error": "Missing required parameters. Please provide origin, destination, and departure date."}
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
                        
                        # Validate required parameters before API call
                        origin = intent["params"].get("origin", "")
                        destination = intent["params"].get("destination", "")
                        departure_date = intent["params"].get("departure_date", "")
                        
                        # Check for missing required parameters
                        if not origin or not destination:
                            logger.warning(f"Missing origin or destination: origin={origin}, destination={destination}")
                            amadeus_data = {"error": "Missing origin or destination. Please provide both origin and destination cities (e.g., 'flights from New York to Paris')."}
                        elif not departure_date:
                            logger.warning(f"Missing departure date: departure_date={departure_date}")
                            amadeus_data = {"error": "Missing departure date. Please provide a departure date (e.g., 'November 3rd' or '11/03/2024')."}
                        else:
                            # Check if origin needs airport code conversion and find all airports
                            origin_airports = []
                            if not _is_iata_code(origin):
                                logger.info(f"Converting origin '{origin}' to IATA code(s)")
                                location_result = amadeus_service.get_airport_city_search(keyword=origin)
                                if location_result and not location_result.get('error') and location_result.get('locations'):
                                    airports = [loc for loc in location_result['locations'] if loc.get('type') == 'AIRPORT']
                                    if airports:
                                        origin_airports = [a.get('code') for a in airports if a.get('code')]
                                        logger.info(f"Found {len(origin_airports)} airports for {origin}: {origin_airports}")
                                    else:
                                        origin_airports = [location_result['locations'][0].get('code', origin)]
                            else:
                                origin_airports = [origin]
                            
                            # Check if destination needs airport code conversion and find all airports
                            dest_airports = []
                            if not _is_iata_code(destination):
                                logger.info(f"Converting destination '{destination}' to IATA code(s)")
                                location_result = amadeus_service.get_airport_city_search(keyword=destination)
                                if location_result and not location_result.get('error') and location_result.get('locations'):
                                    airports = [loc for loc in location_result['locations'] if loc.get('type') == 'AIRPORT']
                                    if airports:
                                        dest_airports = [a.get('code') for a in airports if a.get('code')]
                                        logger.info(f"Found {len(dest_airports)} airports for {destination}: {dest_airports}")
                                    else:
                                        dest_airports = [location_result['locations'][0].get('code', destination)]
                            else:
                                dest_airports = [destination]
                            
                            # Search flights from all origin airports to all destination airports
                            all_flights = []
                            total_searches = len(origin_airports) * len(dest_airports)
                            
                            if total_searches > 1:
                                logger.info(f"Searching {total_searches} airport combinations in parallel...")
                                # Use ThreadPoolExecutor for parallel API calls
                                with ThreadPoolExecutor(max_workers=min(6, total_searches)) as executor:
                                    future_to_route = {}
                                    for orig_airport in origin_airports:
                                        for dest_airport in dest_airports:
                                            future = executor.submit(
                                                amadeus_service.search_flights,
                                                origin=orig_airport,
                                                destination=dest_airport,
                                                departure_date=departure_date,
                                                return_date=intent["params"].get("return_date"),
                                                adults=intent["params"].get("adults", 1),
                                                max_price=intent["params"].get("max_price")
                                            )
                                            future_to_route[future] = (orig_airport, dest_airport)
                                    
                                    for future in as_completed(future_to_route):
                                        orig_airport, dest_airport = future_to_route[future]
                                        try:
                                            airport_flights = future.result()
                                            if airport_flights and not airport_flights.get('error') and airport_flights.get('flights'):
                                                # Add airport info to each flight for tracking
                                                for flight in airport_flights['flights']:
                                                    flight['_origin_airport'] = orig_airport
                                                    flight['_destination_airport'] = dest_airport
                                                all_flights.extend(airport_flights['flights'])
                                                logger.info(f"Found {len(airport_flights['flights'])} flights from {orig_airport} to {dest_airport}")
                                            else:
                                                logger.info(f"No flights found from {orig_airport} to {dest_airport}")
                                        except Exception as e:
                                            logger.error(f"Error searching {orig_airport} -> {dest_airport}: {e}")
                                
                                # Combine all results
                                if all_flights:
                                    amadeus_data = {
                                        "flights": all_flights,
                                        "count": len(all_flights),
                                        "_multi_airport_search": True,
                                        "_origin_airports": origin_airports,
                                        "_destination_airports": dest_airports
                                    }
                                    # Use first airport codes for display
                                    origin = origin_airports[0]
                                    destination = dest_airports[0]
                                    logger.info(f"Combined results: {len(all_flights)} total flights from {len(origin_airports)} origin(s) to {len(dest_airports)} destination(s)")
                                else:
                                    # Fallback to single search if no results
                                    logger.warning(f"No flights found from any airport combination, using first airports")
                                    origin = origin_airports[0]
                                    destination = dest_airports[0]
                                    amadeus_data = amadeus_service.search_flights(
                                        origin=origin,
                                        destination=destination,
                                        departure_date=departure_date,
                                        return_date=intent["params"].get("return_date"),
                                        adults=intent["params"].get("adults", 1),
                                        max_price=intent["params"].get("max_price")
                                    )
                            else:
                                # Single airport search
                                origin = origin_airports[0]
                                destination = dest_airports[0]
                                amadeus_data = amadeus_service.search_flights(
                                    origin=origin,
                                    destination=destination,
                                    departure_date=departure_date,
                                    return_date=intent["params"].get("return_date"),
                                    adults=intent["params"].get("adults", 1),
                                    max_price=intent["params"].get("max_price")
                                )
                            
                            logger.info(f"Amadeus flight search returned count={(amadeus_data or {}).get('count')} for {origin}->{destination}")
                    elif intent["type"] == "hotel_search":
                        logger.info(f"Calling hotel search with params: {intent['params']}")
                        amadeus_data = amadeus_service.search_hotels(
                            city_code=intent["params"]["destination"],
                            check_in=intent["params"]["check_in"],
                            check_out=intent["params"]["check_out"],
                            adults=intent["params"].get("adults", 1),
                            radius=intent["params"].get("radius", 50),
                            price_range=intent["params"].get("price_range")
                        )
                        if amadeus_data and amadeus_data.get('hotels') and req.preferences:
                            amadeus_data['hotels'] = apply_preference_weights_to_hotels(
                                amadeus_data['hotels'],
                                req.preferences,
                                context_label="chat"
                            )
                            amadeus_data['_preference_weights'] = req.preferences
                        logger.info(f"Amadeus hotel search returned count={(amadeus_data or {}).get('count')}")
                    elif intent["type"] == "activity_search":
                        logger.info(f"Calling activity search with params: {intent['params']}")
                        # ADD: Log preferences before activity search
                        logger.info(f"[PREF_TRACE] Activity search detected. Preferences for scoring: {req.preferences}")
                        if req.preferences:
                            logger.info(f"[PREF_TRACE] ✅ Preferences will be applied to activities: budget={req.preferences.get('budget', 0):.3f}, quality={req.preferences.get('quality', 0):.3f}, convenience={req.preferences.get('convenience', 0):.3f}")
                        else:
                            logger.warning(f"[PREF_TRACE] ⚠️ No preferences available for activity scoring!")
                        
                        if "latitude" in intent["params"] and "longitude" in intent["params"]:
                            # Direct coordinate search
                            amadeus_data = amadeus_service.search_activities(
                                latitude=float(intent["params"]["latitude"]),
                                longitude=float(intent["params"]["longitude"]),
                                radius=intent["params"].get("radius", 1)
                            )
                        elif "destination" in intent["params"]:
                            # City-based search - convert city name to coordinates
                            city_name = intent["params"]["destination"]
                            logger.info(f"[ACTIVITY_SEARCH] Converting city name '{city_name}' to coordinates")
                            coordinates = amadeus_service.get_city_coordinates(city_name)
                            
                            if coordinates:
                                lat, lon = coordinates
                                logger.info(f"[ACTIVITY_SEARCH] Found coordinates for {city_name}: {lat}, {lon}")
                                amadeus_data = amadeus_service.search_activities(
                                    latitude=lat,
                                    longitude=lon,
                                    radius=intent["params"].get("radius", 1)
                                )
                            else:
                                logger.error(f"[ACTIVITY_SEARCH] Could not find coordinates for city: {city_name}")
                                logger.error(f"[ACTIVITY_SEARCH] Intent params: {intent.get('params')}")
                                amadeus_data = {"error": f"Could not find location coordinates for {city_name}"}
                        else:
                            logger.warning("Activity search requires coordinates or destination city")
                            amadeus_data = {"error": "Activity search requires location coordinates or a destination city name"}
                        
                        # Apply preference filters to activities
                        if amadeus_data and amadeus_data.get('activities'):
                            # ADD: Log before passing to scoring function
                            logger.info(f"[PREF_TRACE] Passing {len(amadeus_data['activities'])} activities to scoring function with preferences: {req.preferences}")
                            
                            # Calculate trip duration from dates if available
                            trip_duration_days = None
                            
                            # Try to get dates from intent params (check_in/check_out or departure_date/return_date)
                            check_in = intent["params"].get("check_in")
                            check_out = intent["params"].get("check_out")
                            departure_date = intent["params"].get("departure_date")
                            return_date = intent["params"].get("return_date")
                            
                            try:
                                if check_in and check_out:
                                    check_in_dt = datetime.strptime(check_in, "%Y-%m-%d")
                                    check_out_dt = datetime.strptime(check_out, "%Y-%m-%d")
                                    trip_duration_days = (check_out_dt - check_in_dt).days
                                elif departure_date and return_date:
                                    dep_dt = datetime.strptime(departure_date, "%Y-%m-%d")
                                    ret_dt = datetime.strptime(return_date, "%Y-%m-%d")
                                    trip_duration_days = (ret_dt - dep_dt).days
                            except (ValueError, TypeError) as date_error:
                                logger.debug(f"[ACTIVITY_FILTER] Could not parse dates for trip duration: {date_error}")
                            
                            # Apply filters and scoring
                            logger.info(f"[ACTIVITY_SEARCH] Applying preference filters. Activities count before: {len(amadeus_data['activities'])}, preferences: {req.preferences}")
                            amadeus_data['activities'] = apply_preference_filters_to_activities(
                                amadeus_data['activities'],
                                preferences=req.preferences,
                                trip_duration_days=trip_duration_days,
                                context_label="chat"
                            )
                            logger.info(f"[ACTIVITY_SEARCH] After preference filtering. Activities count: {len(amadeus_data['activities'])}")
                            
                            if req.preferences:
                                amadeus_data['_preference_weights'] = req.preferences
                                logger.info(f"[ACTIVITY_SEARCH] Preference weights saved: {req.preferences}")
                            else:
                                logger.warning(f"[ACTIVITY_SEARCH] ⚠️ No preferences in request! req.preferences = {req.preferences}")
                            if trip_duration_days is not None:
                                amadeus_data['_trip_duration_days'] = trip_duration_days
                            
                            # Generate fixed header template (not from GPT)
                            destination_city = intent["params"].get("destination", "your destination")
                            amadeus_data['_header_title'] = f"Top activities in {destination_city}"
                            amadeus_data['_subtitle'] = "Ranked by how well they match your preferences."
                        
                        logger.info(f"Amadeus activity search returned count={(amadeus_data or {}).get('count')}")
                    elif intent["type"] == "flight_inspiration":
                        logger.info(f"Calling flight inspiration with params: {intent['params']}")
                        amadeus_data = amadeus_service.get_flight_inspiration(
                            origin=intent["params"]["origin"],
                            max_price=intent["params"].get("max_price"),
                            departure_date=intent["params"].get("departure_date")
                        )
                        logger.info(f"Amadeus flight inspiration returned count={(amadeus_data or {}).get('count')}")
                    elif intent["type"] == "location_search":
                        logger.info(f"Calling location search with params: {intent['params']}")
                        amadeus_data = amadeus_service.get_airport_city_search(
                            keyword=intent["params"]["keyword"]
                        )
                        logger.info(f"Amadeus location search returned count={(amadeus_data or {}).get('count')}")
                    elif intent["type"] == "travel_recommendations":
                        logger.info(f"Calling travel recommendations with params: {intent['params']}")
                        amadeus_data = amadeus_service.get_travel_recommendations(
                            origin=intent["params"].get("origin", ""),
                            destination=intent["params"].get("destination")
                        )
                        logger.info(f"Amadeus travel recommendations returned count={(amadeus_data or {}).get('count')}")
                    elif intent["type"] == "travel_restrictions":
                        logger.info(f"Calling travel restrictions with params: {intent['params']}")
                        amadeus_data = amadeus_service.get_travel_restrictions(
                            origin=intent["params"].get("origin", ""),
                            destination=intent["params"].get("destination", "")
                        )
                        logger.info(f"Amadeus travel restrictions returned")
                    elif intent["type"] == "flight_status":
                        logger.info(f"Calling flight status with params: {intent['params']}")
                        amadeus_data = amadeus_service.get_on_demand_flight_status(
                            carrier_code=intent["params"].get("carrier_code", ""),
                            flight_number=intent["params"].get("flight_number", ""),
                            scheduled_departure_date=intent["params"].get("scheduled_departure_date", "")
                        )
                        logger.info(f"Amadeus flight status returned count={(amadeus_data or {}).get('count')}")
                    elif intent["type"] == "airport_performance":
                        logger.info(f"Calling airport performance with params: {intent['params']}")
                        amadeus_data = amadeus_service.get_airport_on_time_performance(
                            airport_code=intent["params"].get("airport_code", ""),
                            date=intent["params"].get("date", "")
                        )
                        logger.info(f"Amadeus airport performance returned")
                    elif intent["type"] == "points_of_interest":
                        logger.info(f"Calling points of interest with params: {intent['params']}")
                        # For GENERAL_ACTIVITIES or general activity searches, use activity_search API instead
                        # This avoids PRIVATE_CAR category restriction and uses the standard activities API
                        if "latitude" in intent["params"] and "longitude" in intent["params"]:
                            # Use activity_search API instead of points_of_interest for general activities
                            amadeus_data = amadeus_service.search_activities(
                                latitude=float(intent["params"]["latitude"]),
                                longitude=float(intent["params"]["longitude"]),
                                radius=intent["params"].get("radius", 1)
                            )
                            # Generate fixed header template (use destination if available, otherwise generic)
                            if amadeus_data and not amadeus_data.get('error'):
                                destination_city = intent["params"].get("destination", "your destination")
                                amadeus_data['_header_title'] = f"Top activities in {destination_city}"
                                amadeus_data['_subtitle'] = "Ranked by how well they match your preferences."
                            logger.info(f"Using activity_search API instead of points_of_interest (GENERAL_ACTIVITIES)")
                        elif "destination" in intent["params"]:
                            # City-based search - convert city name to coordinates
                            city_name = intent["params"]["destination"]
                            logger.info(f"Converting city name '{city_name}' to coordinates for activity search")
                            coordinates = amadeus_service.get_city_coordinates(city_name)
                            
                            if coordinates:
                                lat, lon = coordinates
                                logger.info(f"Found coordinates for {city_name}: {lat}, {lon}")
                                amadeus_data = amadeus_service.search_activities(
                                    latitude=lat,
                                    longitude=lon,
                                    radius=intent["params"].get("radius", 1)
                                )
                            else:
                                logger.warning(f"Could not find coordinates for city: {city_name}")
                                amadeus_data = {"error": f"Could not find location coordinates for {city_name}"}
                        else:
                            # Fallback to original points_of_interest API (but exclude PRIVATE_CAR)
                            categories = intent["params"].get("categories", [])
                            if isinstance(categories, str):
                                categories = [c.strip() for c in categories.split(",")]
                            # Exclude PRIVATE_CAR category
                            if categories:
                                categories = [c for c in categories if c.upper() != "PRIVATE_CAR"]
                        amadeus_data = amadeus_service.get_points_of_interest(
                            latitude=float(intent["params"].get("latitude", 0)),
                            longitude=float(intent["params"].get("longitude", 0)),
                            radius=intent["params"].get("radius", 2),
                                categories=categories if categories else None
                        )
                        logger.info(f"Amadeus activity search returned count={(amadeus_data or {}).get('count')}")
                    elif intent["type"] == "most_booked_destinations":
                        logger.info(f"Calling most booked destinations with params: {intent['params']}")
                        amadeus_data = amadeus_service.get_flight_most_booked_destinations(
                            origin=intent["params"].get("origin", ""),
                            period=intent["params"].get("period", "2024")
                        )
                        logger.info(f"Amadeus most booked destinations returned count={(amadeus_data or {}).get('count')}")
                    elif intent["type"] == "most_traveled_destinations":
                        logger.info(f"Calling most traveled destinations with params: {intent['params']}")
                        amadeus_data = amadeus_service.get_flight_most_traveled_destinations(
                            origin=intent["params"].get("origin", ""),
                            period=intent["params"].get("period", "2024")
                        )
                        logger.info(f"Amadeus most traveled destinations returned count={(amadeus_data or {}).get('count')}")
                    elif intent["type"] == "busiest_period":
                        logger.info(f"Calling busiest period with params: {intent['params']}")
                        amadeus_data = amadeus_service.get_flight_busiest_traveling_period(
                            origin=intent["params"].get("origin", ""),
                            destination=intent["params"].get("destination", ""),
                            period=intent["params"].get("period", "2024")
                        )
                        logger.info(f"Amadeus busiest period returned count={(amadeus_data or {}).get('count')}")
                    elif intent["type"] == "trip_purpose":
                        logger.info(f"Calling trip purpose prediction with params: {intent['params']}")
                        amadeus_data = amadeus_service.get_trip_purpose_prediction(
                            origin=intent["params"].get("origin", ""),
                            destination=intent["params"].get("destination", ""),
                            departure_date=intent["params"].get("departure_date", "")
                        )
                        logger.info(f"Amadeus trip purpose prediction returned")
                    elif intent["type"] == "airline_lookup":
                        logger.info(f"Calling airline lookup with params: {intent['params']}")
                        amadeus_data = amadeus_service.get_airline_code_lookup(
                            airline_code=intent["params"].get("airline_code"),
                            airline_name=intent["params"].get("airline_name")
                        )
                        logger.info(f"Amadeus airline lookup returned count={(amadeus_data or {}).get('count')}")
                    elif intent["type"] == "airport_routes":
                        logger.info(f"Calling airport routes with params: {intent['params']}")
                        amadeus_data = amadeus_service.get_airport_routes(
                            airport_code=intent["params"].get("airport_code", "")
                        )
                        logger.info(f"Amadeus airport routes returned count={(amadeus_data or {}).get('count')}")
                    elif intent["type"] == "hotel_ratings":
                        logger.info(f"Calling hotel ratings with params: {intent['params']}")
                        hotel_ids = intent["params"].get("hotel_ids", [])
                        if isinstance(hotel_ids, str):
                            hotel_ids = hotel_ids.split(",")
                        amadeus_data = amadeus_service.get_hotel_ratings(hotel_ids)
                        logger.info(f"Amadeus hotel ratings returned count={(amadeus_data or {}).get('count')}")
                    elif intent["type"] == "transfer_search":
                        logger.info(f"Calling transfer search with params: {intent['params']}")
                        amadeus_data = amadeus_service.search_transfers(
                            origin_lat=float(intent["params"].get("origin_lat", 0)),
                            origin_lon=float(intent["params"].get("origin_lon", 0)),
                            destination_lat=float(intent["params"].get("destination_lat", 0)),
                            destination_lon=float(intent["params"].get("destination_lon", 0)),
                            departure_date=intent["params"].get("departure_date", ""),
                            adults=intent["params"].get("adults", 1)
                        )
                        logger.info(f"Amadeus transfer search returned count={(amadeus_data or {}).get('count')}")
                    
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
            # Check for specific missing parameters to provide better error messages
            params = intent.get("params", {})
            
            if intent["type"] == "flight_search":
                origin = params.get("origin", "")
                destination = params.get("destination", "")
                departure_date = params.get("departure_date", "")
                
                if not origin or not destination:
                    amadeus_data = {"error": "Missing origin or destination. Please provide both origin and destination cities (e.g., 'flights from New York to Paris')."}
                elif not departure_date:
                    amadeus_data = {"error": "Missing departure date. Please provide a departure date (e.g., 'November 3rd' or '11/03/2024')."}
                else:
                    amadeus_data = {"error": "Unable to fetch real-time flight data. Please try rephrasing your request with specific dates and locations."}
            elif intent["type"] == "activity_search":
                destination = params.get("destination", "")
                latitude = params.get("latitude")
                longitude = params.get("longitude")
                
                if not destination and not (latitude and longitude):
                    amadeus_data = {"error": "Missing location. Please provide a city name (e.g., 'activities in Paris' or 'things to do in Barcelona') or coordinates."}
                else:
                    amadeus_data = {"error": "Unable to fetch activity data. Please try rephrasing your request with a specific city name."}
            elif intent["type"] == "hotel_search":
                destination = params.get("destination", "")
                check_in = params.get("check_in", "")
                check_out = params.get("check_out", "")
                
                if not destination:
                    amadeus_data = {"error": "Missing destination. Please provide a city name (e.g., 'hotels in Paris')."}
                elif not check_in or not check_out:
                    amadeus_data = {"error": "Missing dates. Please provide check-in and check-out dates (e.g., 'hotels in Paris from December 1 to December 5')."}
                else:
                    amadeus_data = {"error": "Unable to fetch hotel data. Please try rephrasing your request with specific dates and location."}
            else:
                amadeus_data = {"error": "Unable to fetch real-time data. Please try rephrasing your request with more specific information."}
        
        # Generate response using OpenAI
        # If there's an error, return error message directly without calling GPT
        if amadeus_data and amadeus_data.get('error'):
            error_msg = amadeus_data.get('error', 'Unknown error')
            
            # Generate user-friendly error message based on intent type
            intent_type = intent.get("type", "general")
            
            if 'Missing' in error_msg or 'missing' in error_msg.lower():
                if intent_type == "activity_search":
                    if 'location' in error_msg.lower() or 'city' in error_msg.lower():
                        reply = "I'd be happy to help you find activities! Please tell me which city you'd like to explore. For example:\n- 'What activities are available in Paris?'\n- 'Things to do in Barcelona'\n- 'Activities in Tokyo'"
                    else:
                        reply = f"I need more information to find activities for you. {error_msg.replace('Missing', '').replace('missing', '').strip()}"
                elif intent_type == "hotel_search":
                    if 'destination' in error_msg.lower():
                        reply = "I'd be happy to help you find hotels! Please tell me which city you'd like to stay in. For example:\n- 'Hotels in Paris'\n- 'Accommodations in New York'"
                    elif 'date' in error_msg.lower():
                        reply = "I need check-in and check-out dates to search for hotels. For example:\n- 'Hotels in Paris from December 1 to December 5'\n- 'Hotels in New York from November 15 to November 20'"
                    else:
                        reply = f"I need more information to find hotels for you. {error_msg.replace('Missing', '').replace('missing', '').strip()}"
                elif intent_type == "flight_search":
                    if 'origin' in error_msg.lower() or 'destination' in error_msg.lower():
                        reply = "I'd be happy to help you find flights! Please provide both your departure and destination cities. For example:\n- 'Flights from New York to Paris'\n- 'Flights from Los Angeles to Tokyo'"
                    elif 'date' in error_msg.lower():
                        reply = "I need a departure date to search for flights. For example:\n- 'Flights from New York to Paris on November 15th'\n- 'Flights from LA to Tokyo on December 1'"
                    else:
                        reply = f"I need more information to find flights for you. {error_msg.replace('Missing', '').replace('missing', '').strip()}"
                else:
                    reply = f"I need more information. {error_msg.replace('Missing', '').replace('missing', '').strip()}"
            elif 'Invalid' in error_msg or 'invalid' in error_msg.lower():
                if 'date' in error_msg.lower():
                    reply = "Please provide dates in a valid format. For example:\n- 'November 15th, 2024'\n- '12/15/2024'\n- 'Dec 15'"
                else:
                    reply = f"Please check your input: {error_msg.replace('Invalid', '').replace('invalid', '').strip()}"
            elif 'API call failed' in error_msg:
                if intent_type == "activity_search":
                    reply = "I'm having trouble connecting to the activities database right now. Please try again in a moment, or try asking about a different city."
                elif intent_type == "hotel_search":
                    reply = "I'm having trouble connecting to the hotel database right now. Please try again in a moment."
                else:
                    reply = "I'm having trouble connecting to the travel database right now. Please check your connection and try again."
            elif 'Could not find location coordinates' in error_msg:
                reply = "I couldn't find that location. Please try:\n- Using the full city name (e.g., 'Paris' instead of 'Par')\n- Specifying the city and country (e.g., 'Paris, France')\n- Asking about a different city"
            elif 'No flights available' in error_msg:
                reply = "I couldn't find any flights for that route and dates. Please try:\n- Different dates\n- Different destinations\n- A nearby airport"
            else:
                # Make error message more friendly and context-aware
                if intent_type == "activity_search":
                    reply = f"I couldn't find activities right now. {error_msg}. Please try asking about a specific city, like 'activities in Paris' or 'things to do in Barcelona'."
                elif intent_type == "hotel_search":
                    reply = f"I couldn't find hotels right now. {error_msg}. Please try asking with specific dates and a city name."
                elif intent_type == "flight_search":
                    reply = f"I couldn't find flights right now. {error_msg}. Please try rephrasing your request with specific dates and locations."
                else:
                    reply = f"I encountered an issue: {error_msg}. Please try rephrasing your request."
            
            logger.info(f"Returning error message directly: {reply}")
        else:
            # No error, proceed with GPT call
            try:
                # Create system prompt with context and data
                system_prompt = create_system_prompt(
                    req.context, 
                    amadeus_data,
                    origin=route_origin,
                    destination=route_destination,
                    departure_date=route_departure_date,
                    return_date=route_return_date
                )
                
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
                
                # Post-process the reply to format place names with bold text (single bold, no underscores)
                reply = format_place_names(reply)
            except Exception as e:
                logger.error(f"OpenAI API error: {e}")
                # If there's an error in amadeus_data, show that error message instead of generic fallback
                if amadeus_data and amadeus_data.get('error'):
                    error_msg = amadeus_data.get('error', 'Unknown error')
                    # Generate user-friendly error message
                    if 'Missing' in error_msg or 'missing' in error_msg.lower():
                        if 'origin' in error_msg.lower() or 'destination' in error_msg.lower():
                            reply = "**Error:** Please provide both origin and destination cities (e.g., 'flights from New York to Paris')."
                        elif 'date' in error_msg.lower():
                            reply = "**Error:** Please provide a departure date (e.g., 'November 3rd' or '11/03/2024')."
                        else:
                            reply = f"**Error:** {error_msg}"
                    elif 'Invalid' in error_msg or 'invalid' in error_msg.lower():
                        if 'date' in error_msg.lower():
                            reply = "**Error:** Please provide dates in a valid format (e.g., 'November 3rd, 2024', '11/03/2024', or 'Nov 3')."
                        else:
                            reply = f"**Error:** {error_msg}"
                    elif 'API call failed' in error_msg:
                        reply = "**Error:** Unable to fetch flight data. Please check your connection and try again."
                    elif 'No flights available' in error_msg:
                        reply = "**Error:** No flights available for the specified route and dates. Please try different dates or destinations."
                    else:
                        reply = f"**Error:** {error_msg}"
                elif has_flight_keywords and amadeus_data and not amadeus_data.get('error'):
                    # If we have flight data but GPT failed, create a basic response with the data
                    reply = "I found the following flight options for you:\n\n"
                    if 'flights' in amadeus_data:
                        for i, flight in enumerate(amadeus_data['flights'][:5], 1):
                            price = flight.get('price', 'N/A')
                            currency = flight.get('currency', 'USD')
                            reply += f"{i}. Price: {price} {currency}\n"
                    elif 'outboundFlights' in amadeus_data:
                        for i, flight in enumerate(amadeus_data['outboundFlights'][:5], 1):
                            airline = flight.get('airline', 'Unknown')
                            flight_num = flight.get('flightNumber', 'N/A')
                            price = flight.get('price', 'N/A')
                            departure = flight.get('departure', 'N/A')
                            arrival = flight.get('arrival', 'N/A')
                            duration = flight.get('duration', 'N/A')
                            reply += f"{i}. {airline} {flight_num} - ${price} | Departure: {departure} | Arrival: {arrival} | Duration: {duration}\n"
                    else:
                        reply = "I found some great flight options for you! However, I'm having trouble processing the details right now. Please try again."
                elif has_flight_keywords:
                    reply = "I'm having trouble fetching flight information right now. Please try again."
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
    
    # Helper function to normalize city names (remove dots, extra spaces, etc.)
    def normalize_city_name(city_str):
        """Normalize city name for matching"""
        # Remove dots, extra spaces, and normalize
        normalized = re.sub(r'[.\.,]+', '', city_str.lower().strip())
        normalized = re.sub(r'\s+', ' ', normalized)  # Multiple spaces to single
        return normalized
    
    # Helper function to find city in mappings
    def find_city_in_mappings(city_str, mappings):
        """Find city in mappings with fuzzy matching"""
        normalized = normalize_city_name(city_str)
        
        # Direct match
        if normalized in mappings:
            return normalized
        
        # Try matching without common suffixes
        for key in mappings.keys():
            if normalized.startswith(key) or key in normalized:
                # Check if it's a reasonable match (not too different)
                if abs(len(normalized) - len(key)) <= 3:
                    return key
        
        return None
    
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
        'washington dc': 'IAD', 'washington d c': 'IAD', 'washington d.c.': 'IAD', 
        'washington': 'IAD', 'dc': 'IAD', 'dca': 'DCA',
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
        'mexico city': 'MEX', 'mex': 'MEX',
        'istanbul': 'IST', 'ist': 'IST'
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
        'washington dc': 'Washington DC', 'washington d c': 'Washington DC', 'washington d.c.': 'Washington DC',
        'washington': 'Washington DC', 'dc': 'Washington DC', 'dca': 'Washington DC',
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
        'mexico city': 'Mexico City', 'mex': 'Mexico City',
        'istanbul': 'Istanbul', 'ist': 'Istanbul'
    }
    
    message_lower = message.lower()
    logger.debug(f"Processing message: '{message_lower}'")
    
    origin_city = None
    destination_city = None
    
    # Improved regex patterns to handle various formats (including dots and special characters)
    # Pattern 1: "flights from X to Y" or "search flights from X to Y"
    patterns = [
        (r'(?:search|find|get|book)\s+flights?\s+from\s+([a-z\s.]+?)\s+to\s+([a-z\s.]+?)(?:\s+from|\s+on|\s+|$)', 'search flights from'),
        (r'flights?\s+from\s+([a-z\s.]+?)\s+to\s+([a-z\s.]+?)(?:\s+from|\s+on|\s+|$)', 'flights from'),
        (r'from\s+([a-z\s.]+?)\s+to\s+([a-z\s.]+?)(?:\s+from|\s+on|\s+(?:nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep|oct)|$)', 'from to'),
        (r'flights?\s+to\s+([a-z\s.]+?)\s+to\s+([a-z\s.]+?)(?:\s+from|\s+on|\s+|$)', 'flights to to'),
    ]
    
    for pattern, pattern_name in patterns:
        match = re.search(pattern, message_lower)
        if match:
            origin_city_raw = match.group(1).strip()
            destination_city_raw = match.group(2).strip()
            
            # Normalize and find in mappings
            origin_key = find_city_in_mappings(origin_city_raw, airport_mappings)
            dest_key = find_city_in_mappings(destination_city_raw, airport_mappings)
            
            if origin_key and dest_key:
                origin_city = origin_key
                destination_city = dest_key
                logger.info(f"Pattern '{pattern_name}' matched - origin: '{origin_city_raw}' -> '{origin_city}', destination: '{destination_city_raw}' -> '{destination_city}'")
                break
    
    # If no pattern matched, try to find cities anywhere in the message
    if not origin_city or not destination_city:
        # Extract all potential city names from the message
        found_cities = []
        for key in airport_mappings.keys():
            # Check if the key appears in the message (with word boundaries)
            pattern = r'\b' + re.escape(key) + r'\b'
            if re.search(pattern, message_lower):
                found_cities.append(key)
        
        # Also try normalized search for cities with dots/spaces
        normalized_msg = normalize_city_name(message_lower)
        for key in airport_mappings.keys():
            normalized_key = normalize_city_name(key)
            if normalized_key in normalized_msg and key not in found_cities:
                found_cities.append(key)
        
        if len(found_cities) >= 2:
            origin_city = found_cities[0]
            destination_city = found_cities[1]
            logger.info(f"Found cities in message - origin: '{origin_city}', destination: '{destination_city}'")
        elif len(found_cities) == 1:
            # Only one city found, need to determine if it's origin or destination
            # Try to extract from context (e.g., "from X" or "to X")
            if re.search(r'from\s+', message_lower):
                origin_city = found_cities[0]
            elif re.search(r'to\s+', message_lower):
                destination_city = found_cities[0]
    
    # If still no cities found, return None values instead of fallback
    if not origin_city or not destination_city:
        logger.warning(f"Could not extract route from message: '{message}'")
        return {
            'departure': None,
            'destination': None,
            'departureCode': None,
            'destinationCode': None
        }
    
    # Map cities to airport codes and proper names
    origin_code = airport_mappings.get(origin_city, 'JFK')
    destination_code = airport_mappings.get(destination_city, 'BCN')
    origin_name = city_mappings.get(origin_city, ' '.join(word.capitalize() for word in origin_city.split()))
    destination_name = city_mappings.get(destination_city, ' '.join(word.capitalize() for word in destination_city.split()))
    
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
        # Pattern with "from" keyword and year: "from January 6th, 2026 to January 11th, 2026" - MOST SPECIFIC FIRST
        r'from\s+(\w+)\s+(\d+)(?:st|nd|rd|th)?,?\s+(\d{4})\s+to\s+(\w+)\s+(\d+)(?:st|nd|rd|th)?,?\s+(\d{4})',
        # Pattern with "from" keyword without year: "from January 6th to January 11th"
        r'from\s+(\w+)\s+(\d+)(?:st|nd|rd|th)?\s+to\s+(\w+)\s+(\d+)(?:st|nd|rd|th)?',
        # Pattern with year but no "from": "January 6th, 2026 to January 11th, 2026"
        r'(\w+)\s+(\d+)(?:st|nd|rd|th)?,?\s+(\d{4})\s+to\s+(\w+)\s+(\d+)(?:st|nd|rd|th)?,?\s+(\d{4})',
        # Dash format without second month: "dec 10-17" (assume same month)
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
        
        if len(groups) == 6 or len(groups) == 7:
            # Format with year: "from January 6th, 2026 to January 11th, 2026" or "January 6th, 2026 to January 11th, 2026"
            # Groups: [month1, day1, year1, month2, day2, year2] or [month1, day1, year1, month2, day2, year2, ...]
            month1, day1, year1, month2, day2, year2 = groups[:6]
            # Extract day numbers (remove ordinal suffixes if present)
            day1 = int(re.sub(r'(st|nd|rd|th)$', '', str(day1)))
            day2 = int(re.sub(r'(st|nd|rd|th)$', '', str(day2)))
            year1 = int(year1)
            year2 = int(year2)
            
            month1_num = month_names.get(month1.lower(), 1)
            month2_num = month_names.get(month2.lower(), 1)
            
            departure_date = datetime(year1, month1_num, day1)
            return_date = datetime(year2, month2_num, day2)
        elif len(groups) == 4:
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
            
            # Use current year
            current_year = datetime.now().year
            departure_date = datetime(current_year, month1_num, day1)
            return_date = datetime(current_year, month2_num, day2)
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


