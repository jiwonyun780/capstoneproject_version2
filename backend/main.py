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
from services.scoring import (
    normalize_weights as normalize_preference_weights,
    calculate_total_score as calculate_weighted_score,
    DEFAULT_WEIGHTS as DEFAULT_PREFERENCE_WEIGHTS,
)


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

# Mapping to translate airport codes / city names to Amadeus hotel city codes
HOTEL_CITY_CODE_OVERRIDES: Dict[str, str] = {
    # United States
    "JFK": "NYC",
    "EWR": "NYC",
    "LGA": "NYC",
    "NYC": "NYC",
    "NEW YORK": "NYC",
    "NY": "NYC",
    "BOS": "BOS",
    "BOSTON": "BOS",
    "LAX": "LAX",
    "LOS ANGELES": "LAX",
    "SFO": "SFO",
    "SAN FRANCISCO": "SFO",
    "SEA": "SEA",
    "SEATTLE": "SEA",
    "ORD": "CHI",
    "MDW": "CHI",
    "CHICAGO": "CHI",
    "MIA": "MIA",
    "MIAMI": "MIA",
    "IAD": "WAS",
    "DCA": "WAS",
    "BWI": "WAS",
    "WASHINGTON": "WAS",
    "WASHINGTON DC": "WAS",
    "DC": "WAS",
    "DEN": "DEN",
    "DENVER": "DEN",
    "DFW": "DFW",
    "DAL": "DFW",
    "DALLAS": "DFW",
    "ATL": "ATL",
    "ATLANTA": "ATL",
    # Europe
    "CDG": "PAR",
    "ORY": "PAR",
    "PAR": "PAR",
    "PARIS": "PAR",
    "LHR": "LON",
    "LGW": "LON",
    "LTN": "LON",
    "STN": "LON",
    "LCY": "LON",
    "LON": "LON",
    "LONDON": "LON",
    "FRA": "FRA",
    "FRANKFURT": "FRA",
    "MUC": "MUC",
    "MUNICH": "MUC",
    "AMS": "AMS",
    "AMSTERDAM": "AMS",
    "BCN": "BCN",
    "BARCELONA": "BCN",
    "MAD": "MAD",
    "MADRID": "MAD",
    "ROM": "ROM",
    "FCO": "ROM",
    "ROME": "ROM",
    # Asia / Pacific
    "NRT": "TYO",
    "HND": "TYO",
    "TYO": "TYO",
    "TOKYO": "TYO",
    "KIX": "OSA",
    "ITM": "OSA",
    "OSA": "OSA",
    "OSAKA": "OSA",
    "HKG": "HKG",
    "HONG KONG": "HKG",
    "SIN": "SIN",
    "SINGAPORE": "SIN",
    "ICN": "SEL",
    "GMP": "SEL",
    "SEL": "SEL",
    "SEOUL": "SEL",
    "BKK": "BKK",
    "BANGKOK": "BKK",
    # Oceania
    "SYD": "SYD",
    "SYDNEY": "SYD",
    "MEL": "MEL",
    "MELBOURNE": "MEL",
    # Middle East
    "DXB": "DXB",
    "DUBAI": "DXB",
    "DOH": "DOH",
    "DOHA": "DOH",
    # Latin America
    "GRU": "SAO",
    "CGH": "SAO",
    "SAO": "SAO",
    "SAO PAULO": "SAO",
    "EZE": "BUE",
    "BUE": "BUE",
    "BUENOS AIRES": "BUE",
}


def resolve_hotel_city_code(destination_code: Optional[str], destination_name: Optional[str]) -> Optional[str]:
    """
    Resolve a destination code or name to a city code supported by the Amadeus hotel API.
    Prioritises known overrides that translate airport codes (e.g. NRT) to city codes (e.g. TYO).
    """
    candidates: List[str] = []

    if destination_code:
        candidates.append(destination_code.strip().upper())
    if destination_name:
        candidates.append(destination_name.strip().upper())

    for candidate in candidates:
        if candidate in HOTEL_CITY_CODE_OVERRIDES:
            return HOTEL_CITY_CODE_OVERRIDES[candidate]

    # Try falling back to a direct lookup using our IATA helper
    try:
        from services.iata_codes import get_iata_code
        for value in candidates:
            code = get_iata_code(value)
            if code:
                normalised = code.strip().upper()
                if normalised in HOTEL_CITY_CODE_OVERRIDES:
                    return HOTEL_CITY_CODE_OVERRIDES[normalised]
                return normalised
    except Exception as lookup_error:
        logger.warning(f"[ITINERARY_DATA] Failed to resolve city code via IATA lookup: {lookup_error}")

    return None


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

@app.get("/api/test")
def test():
    return {"message": "Backend is working", "timestamp": datetime.now().isoformat()}

# Diagnostics for Amadeus integration
@app.get("/api/diag/amadeus/location")
async def diag_amadeus_location(keyword: str = "Paris"):
    try:
        logger.info(f"[DIAG] Testing Amadeus location search with keyword='{keyword}'")
        result = amadeus_service.get_airport_city_search(keyword=keyword)
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
        result = amadeus_service.search_flights(origin=origin, destination=destination, departure_date=date)
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
        result = amadeus_service.get_cheapest_dates(
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
        token = amadeus_service._get_access_token()
        return {"ok": True, "token_present": bool(token), "token_prefix": token[:12] if token else None}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.get("/api/diag/amadeus/inspiration")
async def diag_amadeus_inspiration(origin: str = "PAR", maxPrice: int = 200):
    try:
        result = amadeus_service.get_flight_inspiration(origin=origin, max_price=maxPrice)
        return {"ok": True, "count": (result or {}).get("count", 0), "sample": (result or {}).get("destinations", [])[:3], "raw": result}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.get("/api/diag/flight-raw")
async def diag_flight_raw(origin: str = "JFK", destination: str = "CDG", date: str = "2024-12-10"):
    """Diagnostic endpoint to show raw Amadeus response vs formatted data"""
    try:
        logger.info(f"[DIAG] Testing flight search: {origin} -> {destination} on {date}")
        
        # Get raw Amadeus response
        raw_response = amadeus_service._make_request("/v2/shopping/flight-offers", {
            "originLocationCode": origin,
            "destinationLocationCode": destination,
            "departureDate": date,
            "adults": 1
        })
        
        # Get formatted response
        formatted_response = amadeus_service._format_flight_response(raw_response)
        
        return {
            "ok": True,
            "api_base_url": amadeus_service.base_url,
            "raw_response": raw_response,
            "formatted_response": formatted_response,
            "comparison": {
                "raw_offers": len(raw_response.get("data", [])),
                "formatted_flights": len(formatted_response.get("flights", [])),
                "first_raw_offer": raw_response.get("data", [{}])[0] if raw_response.get("data") else None,
                "first_formatted_flight": formatted_response.get("flights", [{}])[0] if formatted_response.get("flights") else None
            }
        }
    except Exception as e:
        logger.error(f"[DIAG] Flight raw test failed: {e}")
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
| Airline | Flight Code | Price | Duration | Stops | Departure | Book Now |
|---------|-------------|-------|----------|-------|-----------|----------|
| {{airline}} | {{flight_code}} | {{price}} | {{duration}} | {{stops}} | {{time}} | [Book Now]({{booking_link}}) |

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
                    from datetime import datetime
                    try:
                        dep_date = datetime.strptime(departure_date, "%Y-%m-%d")
                        dep_display = dep_date.strftime("%B %d, %Y")
                        data_section += f"**Requested Departure Date: {dep_display}**\n"
                    except:
                        data_section += f"**Requested Departure Date: {departure_date}**\n"
                if return_date:
                    from datetime import datetime
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
                
                for flight in amadeus_data['outboundFlights'][:5]:  # Show up to 5 flights
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
                                        from datetime import datetime
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
                    
                    for flight in amadeus_data['returnFlights'][:5]:
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
                                            from datetime import datetime
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
            for i, hotel in enumerate(amadeus_data['hotels'][:3], 1):
                name = hotel.get('name', 'N/A')
                price = hotel.get('price', 'N/A')
                currency = hotel.get('currency', 'USD')
                data_section += f"{i}. {name} - {price} {currency}\n"
                
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
                from datetime import datetime
                try:
                    dep_date = datetime.strptime(departure_date, "%Y-%m-%d")
                    dep_display = dep_date.strftime("%B %d, %Y")
                    data_section += f"⚠️ CRITICAL: The user requested departure date is {dep_display}. You MUST show flights that depart on this date (or very close to it).\n"
                except:
                    pass
            if return_date:
                from datetime import datetime
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

def format_links(text):
    """Ensure all markdown links are bold and underlined"""
    import re

    link_pattern = re.compile(r'\[(?P<label>[^\]]+)\]\((?P<url>https?://[^\)]+)\)')

    def wrap_link(match):
        original = match.group(0)
        if original.startswith('__**[') and original.endswith(')**__'):
            return original
        label = match.group('label')
        url = match.group('url')
        return f'__**[{label}]({url})**__'

    return link_pattern.sub(wrap_link, text)

def format_provider_mentions(text):
    """Replace provider names with bold underlined hyperlinks"""
    import re

    providers = {
        'GetYourGuide': 'https://www.getyourguide.com/',
        'Viator': 'https://www.viator.com/',
    }

    for name, url in providers.items():
        pattern = re.compile(rf'(?<!\[)(?<!\()(?<!\w){name}(?![\w/])')
        replacement = f'__**[{name}]({url})**__'
        text = pattern.sub(replacement, text)

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
    normalized_weights = normalize_preference_weights(preferences or DEFAULT_PREFERENCE_WEIGHTS)
    budget_weight = normalized_weights['budget']
    quality_weight = normalized_weights['quality']
    convenience_weight = normalized_weights['convenience']

    logger.info(
        "[OPTIMAL_ITINERARY] Weights: budget=%.3f, quality=%.3f, convenience=%.3f",
        budget_weight,
        quality_weight,
        convenience_weight,
    )
    
    if not flights:
        logger.warning("[OPTIMAL_ITINERARY] No flights supplied; cannot generate itinerary")
        return {
            'ok': False,
            'error': 'No flight options available to optimise. Please run a flight search first.'
        }

    if not hotels:
        logger.warning("[OPTIMAL_ITINERARY] No hotels supplied - creating placeholder entry")
        hotels = [{
            'id': 'placeholder-hotel',
            'name': 'Hotel options coming soon',
            'price': 0,
            'currency': 'USD',
            'rating': 4.0,
            'distance': 0.5,
            'location': '',
            'notes': 'No hotel data returned yet – this placeholder keeps the itinerary balanced.',
            '_placeholder': True
        }]

    if not activities:
        logger.warning("[OPTIMAL_ITINERARY] No activities supplied - creating placeholder entry")
        activities = [{
            'id': 'placeholder-activity',
            'name': 'Activities coming soon',
            'price': {'amount': 0, 'currencyCode': 'USD'},
            'rating': 4.2,
            'minimumDuration': 'PT2H',
            'shortDescription': 'Local experiences will appear here once available.',
            'notes': 'No activity data returned yet – this placeholder keeps the itinerary balanced.',
            '_placeholder': True
        }]
    
    # Helper to clamp between 0 and 1
    def clamp01(value: float) -> float:
        return max(0.0, min(1.0, value))

    # Normalize metrics on 0-100 scale for each category
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
            budget_score = clamp01(1 - (price / max_price) if max_price > 0 else 0.5)
            
            # Quality score: rating / 5 - higher rating is better
            quality_score = clamp01(rating / 5.0)
            
            # Convenience score: 1 - (duration / maxDuration) - shorter duration is better
            convenience_score = clamp01(1 - (duration / max_duration) if max_duration > 0 else 0.5)
            
            # Convert to 0-100 scale before weighting
            budget_score_pct = budget_score * 100
            quality_score_pct = quality_score * 100
            convenience_score_pct = convenience_score * 100
            
            score_components = {
                'budget': budget_score_pct,
                'quality': quality_score_pct,
                'convenience': convenience_score_pct,
            }

            category_score = calculate_weighted_score(score_components, normalized_weights)

            normalized_flights.append({
                **flight,
                '_budget_score': budget_score_pct,
                '_quality_score': quality_score_pct,
                '_convenience_score': convenience_score_pct,
                '_category_score': category_score,
                '_score_components': score_components,
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
            # Extract price
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
            
            budget_score = clamp01(1 - (price / max_price) if max_price > 0 else 0.5)
            quality_score = clamp01(rating / 5.0)
            convenience_score = clamp01(1 - (distance / max_distance) if max_distance > 0 else 0.5)
            
            budget_score_pct = budget_score * 100
            quality_score_pct = quality_score * 100
            convenience_score_pct = convenience_score * 100
            
            category_score = (
                budget_weight * budget_score_pct +
                quality_weight * quality_score_pct +
                convenience_weight * convenience_score_pct
            )
            
            normalized_hotels.append({
                **hotel,
                '_budget_score': budget_score_pct,
                '_quality_score': quality_score_pct,
                '_convenience_score': convenience_score_pct,
                '_category_score': category_score,
                '_score_components': {
                    'budget': budget_score_pct,
                    'quality': quality_score_pct,
                    'convenience': convenience_score_pct,
                },
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
            
            budget_score = clamp01(1 - (price / max_price) if max_price > 0 else 0.5)
            quality_score = clamp01(rating / 5.0)
            convenience_score = clamp01(1 - (duration / max_duration) if max_duration > 0 else 0.5)
            
            budget_score_pct = budget_score * 100
            quality_score_pct = quality_score * 100
            convenience_score_pct = convenience_score * 100
            
            category_score = (
                budget_weight * budget_score_pct +
                quality_weight * quality_score_pct +
                convenience_weight * convenience_score_pct
            )
            
            normalized_activities.append({
                **activity,
                '_budget_score': budget_score_pct,
                '_quality_score': quality_score_pct,
                '_convenience_score': convenience_score_pct,
                '_category_score': category_score,
                '_score_components': {
                    'budget': budget_score_pct,
                    'quality': quality_score_pct,
                    'convenience': convenience_score_pct,
                },
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
                
                # Filter out if exceeds budget
                if total_price > userBudget:
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
            'error': 'No valid combination found within budget',
            'ok': False
        }
    
    # Generate insight text
    flight = best_combination['flight']
    hotel = best_combination['hotel']
    activity = best_combination['activity']

    flight_currency = (
        flight.get('currency')
        or flight.get('currencyCode')
        or flight.get('price', {}).get('currency')
        or 'USD'
    )
    hotel_currency = (
        hotel.get('currency')
        or hotel.get('currencyCode')
        or hotel.get('price', {}).get('currency')
        or 'USD'
    )
    if isinstance(activity.get('price'), dict):
        activity_currency = (
            activity.get('price', {}).get('currencyCode')
            or activity.get('price', {}).get('currency')
            or 'USD'
        )
    else:
        activity_currency = activity.get('currency', 'USD')
    
    budget_weight_pct = round(budget_weight * 100)
    quality_weight_pct = round(quality_weight * 100)
    convenience_weight_pct = round(convenience_weight * 100)
    weight_summary_text = (
        f"Budget {budget_weight_pct}%, Quality {quality_weight_pct}%, Convenience {convenience_weight_pct}%"
    )
    
    primary_focus = []
    if budget_weight_pct > quality_weight_pct and budget_weight_pct > convenience_weight_pct:
        primary_focus.append("maximising savings")
    if quality_weight_pct > budget_weight_pct and quality_weight_pct > convenience_weight_pct:
        primary_focus.append("delivering premium quality")
    if convenience_weight_pct > budget_weight_pct and convenience_weight_pct > quality_weight_pct:
        primary_focus.append("reducing travel time")
    
    if not primary_focus:
        primary_focus.append("balancing cost, quality, and convenience")
    
    insight_text = (
        f"This combination scored highest after ranking every option on a 0–100 scale using your weights "
        f"({weight_summary_text}). It excels at {', '.join(primary_focus)} while staying within your budget."
    )
    
    result = {
        'ok': True,
        'flight': {
            'id': flight.get('id'),
            'airline': flight.get('airline', 'Unknown'),
            'flightNumber': flight.get('flightNumber', flight.get('flight_number', 'N/A')),
            'price': flight['_price'],
            'currency': flight_currency,
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
            'price': hotel['_price'],
            'currency': hotel_currency,
            'rating': hotel['_rating'],
            'distance': hotel['_distance'],
            'location': hotel.get('location', hotel.get('city', 'N/A')),
            'placeholder': bool(hotel.get('_placeholder')),
            'notes': hotel.get('notes', ''),
            'scores': {
                'budget': hotel['_budget_score'],
                'quality': hotel['_quality_score'],
                'convenience': hotel['_convenience_score'],
                'total': hotel['_category_score']
            }
        },
        'activity': {
            'id': activity.get('id'),
            'name': activity.get('name', 'Unknown Activity'),
            'price': activity['_price'],
            'currency': activity_currency,
            'rating': activity['_rating'],
            'duration': activity['_duration'],
            'description': activity.get('shortDescription', activity.get('description', '')),
            'placeholder': bool(activity.get('_placeholder')),
            'notes': activity.get('notes', ''),
            'scores': {
                'budget': activity['_budget_score'],
                'quality': activity['_quality_score'],
                'convenience': activity['_convenience_score'],
                'total': activity['_category_score']
            }
        },
        'total_price': best_combination['total_price'],
        'total_score': round(best_combination['total_score'], 2),
        'score_components': {
            'flight': round(flight['_category_score'], 2),
            'hotel': round(hotel['_category_score'], 2),
            'activity': round(activity['_category_score'], 2),
        },
        'weights': {
            'budget': budget_weight,
            'quality': quality_weight,
            'convenience': convenience_weight,
        },
        'weights_percent': {
            'budget': budget_weight_pct,
            'quality': quality_weight_pct,
            'convenience': convenience_weight_pct,
        },
        'weight_summary': weight_summary_text,
        'currency': flight_currency,
        'insight': insight_text
    }
    
    logger.info(f"[OPTIMAL_ITINERARY] Best combination found: score={best_total_score:.3f}, price=${best_combination['total_price']:.2f}")
    
    return result


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
        
        if not amadeus_service:
            return {
                'ok': False,
                'error': 'Amadeus service not available',
                'hotels': [],
                'activities': []
            }
        
        hotels = []
        activities = []
        
        # Fetch hotels
        if destination_code and check_in and check_out:
            try:
                city_code = resolve_hotel_city_code(destination_code, destination_name)
                if not city_code:
                    city_code = destination_code.strip().upper()
                logger.info(f"[ITINERARY_DATA] Using city_code='{city_code}' for hotel search (input code='{destination_code}', name='{destination_name}')")

                hotel_result = amadeus_service.search_hotels(
                    city_code=city_code,
                    check_in=check_in,
                    check_out=check_out,
                    adults=adults
                )
                
                if not hotel_result.get('error') and hotel_result.get('hotels'):
                    hotels = hotel_result['hotels'][:20]  # Limit to 20 hotels
                    logger.info(f"[ITINERARY_DATA] Found {len(hotels)} hotels")
                else:
                    logger.warning(f"[ITINERARY_DATA] Hotel search returned no results for city_code='{city_code}' - response: {hotel_result}")
            except Exception as e:
                logger.error(f"[ITINERARY_DATA] Error fetching hotels: {e}")
        
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
    Each option is scored on a 0–100 scale for budget, quality, and convenience, then weighted by the user's preferences.
    """
    try:
        preferences_normalized = normalize_preference_weights({
            'budget': preferences.budget,
            'quality': preferences.quality,
            'convenience': preferences.convenience,
        })

        logger.info(
            "[OPTIMIZE_TRIP] Received preferences: budget=%.3f, quality=%.3f, convenience=%.3f",
            preferences_normalized['budget'],
            preferences_normalized['quality'],
            preferences_normalized['convenience'],
        )
        
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

            normalized_price_score = (max_price - price) / (max_price - min_price) if max_price > min_price else 0.5
            normalized_time_score = (max_travel_time - travel_time) / (max_travel_time - min_travel_time) if max_travel_time > min_travel_time else 0.5
            normalized_rating_score = rating / 5.0

            score_components = {
                'budget': max(0.0, min(100.0, normalized_price_score * 100)),
                'quality': max(0.0, min(100.0, normalized_rating_score * 100)),
                'convenience': max(0.0, min(100.0, normalized_time_score * 100)),
            }

            total_score = calculate_weighted_score(score_components, preferences_normalized)

            scored_options.append({
                **option,
                "score": total_score,
                "score_components": score_components,
            })

        scored_options.sort(key=lambda x: x["score"], reverse=True)
        top_options = scored_options[:3]

        logger.info(f"[OPTIMIZE_TRIP] Returning top 3 options: {[opt['destination'] for opt in top_options]}")

        return {
            "ok": True,
            "options": top_options,
            "weights": preferences_normalized,
        }
    
    except Exception as e:
        logger.error(f"[OPTIMIZE_TRIP] Error: {e}")
        raise HTTPException(status_code=500, detail=f"Error optimizing trip: {str(e)}")

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
            'ticket', 'tickets', 'fare', 'fares', 'airfare',
            'airport', 'terminal', 'gate',
            'boarding pass', 'check-in', 'layover', 'stopover',
            'nonstop flight', 'direct flight',
            'round trip', 'one-way flight',
            'flight booking', 'book flight', 'flight schedule',
            'flight option', 'flight options',
            'airline tickets', 'plane tickets', 'flight search', 'search flights'
        ]
        
        has_flight_keywords = any(keyword in user_message.lower() for keyword in flight_keywords)
        logger.info(f"Flight keyword check: {has_flight_keywords}")
        
        # Use intent detection for proper parsing
        logger.info(f"Processing message for session {session_id}: {user_message[:100]}...")
        
        # Detect intent using the intent detector
        if intent_detector:
            try:
                # Create context object with current date and location
                context = {
                    'now_iso': now_iso,
                    'user_tz': user_tz,
                    'user_location': user_location
                }
                intent = await intent_detector.analyze_message(user_message, req.messages, context)
                logger.info(f"Intent detection result: type={intent['type']}, confidence={intent['confidence']}, has_required_params={intent['has_required_params']}")
                logger.info(f"Extracted parameters: {intent['params']}")
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
        route_info_extracted = None  # Store extracted route info for fallback
        if has_flight_keywords:
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
                    from datetime import datetime
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
                                amadeus_data['route'] = formatted_data.get('route', {
                                    "departure": origin_city,
                                    "destination": destination_city,
                                    "departureCode": origin,
                                    "destinationCode": destination,
                                    "date": departure_date,
                                    "departure_display": departure_date,
                                    "return_display": return_date
                                })
                                amadeus_data['priceData'] = formatted_data.get('priceData', [])
                                amadeus_data['hasRealData'] = formatted_data.get('hasRealData', True)
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
                        logger.info(f"Amadeus hotel search returned count={(amadeus_data or {}).get('count')}")
                    elif intent["type"] == "activity_search":
                        logger.info(f"Calling activity search with params: {intent['params']}")
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
                            logger.info(f"Converting city name '{city_name}' to coordinates")
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
                            logger.warning("Activity search requires coordinates or destination city")
                            amadeus_data = {"error": "Activity search requires location coordinates or a destination city name"}
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
                
                # Post-process the reply to format place names with bold and underlined text
                reply = format_place_names(reply)
                reply = format_links(reply)
                reply = format_provider_mentions(reply)
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


