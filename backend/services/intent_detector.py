"""
Intent Detection Service using GPT for travel query analysis
"""
import json
import logging
from typing import Dict, List, Optional, Any
from openai import OpenAI
import os
from datetime import datetime, timedelta
import re
from .iata_codes import get_iata_code

logger = logging.getLogger(__name__)


class IntentDetector:
    """
    Service for detecting travel intent from user messages using GPT
    """
    
    def __init__(self):
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY must be set")
        self.client = OpenAI(api_key=api_key)
    
    async def analyze_message(self, message: str, conversation_history: List[Dict[str, str]] = None) -> Dict[str, Any]:
        """
        Analyze user message to detect travel intent and extract parameters
        
        Returns:
            Dict with keys: type, confidence, params, has_required_params
        """
        try:
            # Create context from conversation history
            context = ""
            if conversation_history:
                recent_messages = conversation_history[-3:]  # Last 3 messages for context
                context = "Recent conversation:\n"
                for msg in recent_messages:
                    role = msg.get("role", "user")
                    content = msg.get("content", "")
                    context += f"{role}: {content}\n"
            
            # Create focused prompt for intent detection
            prompt = f"""Analyze this travel-related message and extract intent and parameters.

{context}
Current message: {message}

Detect the travel intent and extract relevant parameters. Return ONLY a JSON object with this structure:
{{
    "type": "flight_search|hotel_search|activity_search|flight_inspiration|location_search|general",
    "confidence": 0.0-1.0,
    "params": {{
        "origin": "airport/city code if mentioned",
        "destination": "airport/city code if mentioned", 
        "departure_date": "YYYY-MM-DD format if mentioned",
        "return_date": "YYYY-MM-DD format if mentioned",
        "adults": "number of passengers",
        "max_price": "budget limit as number",
        "check_in": "YYYY-MM-DD for hotels",
        "check_out": "YYYY-MM-DD for hotels",
        "latitude": "decimal for activities",
        "longitude": "decimal for activities",
        "keyword": "search term for locations"
    }},
    "has_required_params": true/false
}}

Intent types:
- flight_search: User wants to find flights between specific places
- hotel_search: User wants to find hotels in a city
- activity_search: User wants to find things to do in a location
- flight_inspiration: User wants destination suggestions from origin
- location_search: User wants to find airport/city codes
- general: General travel conversation without specific API needs

Required parameters by type:
- flight_search: origin, destination, departure_date
- hotel_search: destination (as city), check_in, check_out  
- activity_search: latitude, longitude (or destination for city lookup)
- flight_inspiration: origin
- location_search: keyword

SPECIAL PARSING RULES:
- For "flights to X to Y" format: X is the origin, Y is the destination
- For "from X to Y" format: X is the origin, Y is the destination
- For "X to Y" format: X is the origin, Y is the destination
- Examples:
  * "flights to Washington DC to Barcelona" → origin: "Washington DC", destination: "Barcelona"
  * "from New York to Paris" → origin: "New York", destination: "Paris"
  * "Tokyo to London" → origin: "Tokyo", destination: "London"

Extract dates in YYYY-MM-DD format. Convert relative dates like "tomorrow", "next week" to actual dates.
For cities/airports, use full city names (e.g., "Washington DC", "Barcelona", "New York").
For prices, extract numbers only (remove currency symbols).
For coordinates, only include if explicitly mentioned.

IMPORTANT: If no specific date is mentioned, use reasonable defaults:
- For flight searches: use a date 30 days from now
- For hotel searches: use check-in 7 days from now, check-out 3 days later
- For activities: use current date

Return only the JSON object, no other text."""

            response = self.client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "You are a travel intent detection system. Analyze messages and return structured JSON data only."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,  # Low temperature for consistent parsing
                max_tokens=500
            )
            
            # Parse JSON response
            content = response.choices[0].message.content.strip()
            
            # Clean up response in case there's extra text
            if content.startswith("```json"):
                content = content[7:]
            if content.endswith("```"):
                content = content[:-3]
            
            intent_data = json.loads(content)
            
            # Validate and clean the response
            intent_data = self._validate_intent_data(intent_data)
            
            # Post-process to convert city names to IATA codes and parse dates
            intent_data = self._post_process_intent(intent_data)
            
            logger.info(f"Intent detected: {intent_data['type']} (confidence: {intent_data['confidence']})")
            return intent_data
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse intent detection response: {e}")
            return self._get_fallback_intent(message)
        except Exception as e:
            logger.error(f"Intent detection failed: {e}")
            return self._get_fallback_intent(message)
    
    def _validate_intent_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Validate and clean intent detection data"""
        # Ensure required fields exist
        if "type" not in data:
            data["type"] = "general"
        if "confidence" not in data:
            data["confidence"] = 0.5
        if "params" not in data:
            data["params"] = {}
        if "has_required_params" not in data:
            data["has_required_params"] = False
        
        # Clean up params - remove None values and empty strings
        clean_params = {}
        for key, value in data["params"].items():
            if value is not None and value != "" and value != "null":
                clean_params[key] = value
        data["params"] = clean_params
        
        # Check if required parameters are present
        data["has_required_params"] = self._check_required_params(data["type"], data["params"])
        
        return data
    
    def _check_required_params(self, intent_type: str, params: Dict[str, Any]) -> bool:
        """Check if required parameters are present for the intent type"""
        required_params = {
            "flight_search": ["origin", "destination", "departure_date"],
            "hotel_search": ["destination", "check_in", "check_out"],
            "activity_search": ["latitude", "longitude"],  # or destination for city lookup
            "flight_inspiration": ["origin"],
            "location_search": ["keyword"]
        }
        
        if intent_type not in required_params:
            return False
        
        required = required_params[intent_type]
        
        # Special case for activity_search - can use destination instead of coordinates
        if intent_type == "activity_search":
            return (all(param in params for param in ["latitude", "longitude"]) or 
                   "destination" in params)
        
        return all(param in params for param in required)
    
    def _post_process_intent(self, intent_data: Dict[str, Any]) -> Dict[str, Any]:
        """Post-process intent data to convert cities to IATA codes and parse dates"""
        params = intent_data.get("params", {})
        
        # Convert city names to IATA codes
        if "origin" in params:
            iata_code = get_iata_code(params["origin"])
            if iata_code:
                params["origin"] = iata_code
                logger.debug(f"Converted origin '{params['origin']}' to IATA code '{iata_code}'")
        
        if "destination" in params:
            iata_code = get_iata_code(params["destination"])
            if iata_code:
                params["destination"] = iata_code
                logger.debug(f"Converted destination '{params['destination']}' to IATA code '{iata_code}'")
        
        # Parse relative dates
        for date_field in ["departure_date", "return_date", "check_in", "check_out"]:
            if date_field in params:
                parsed_date = self._parse_relative_date(params[date_field])
                if parsed_date:
                    params[date_field] = parsed_date
                    logger.debug(f"Parsed {date_field}: '{params[date_field]}' -> '{parsed_date}'")
        
        # Add default dates if missing for flight searches
        if intent_data["type"] == "flight_search":
            if "departure_date" not in params:
                # Default to 30 days from now
                default_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
                params["departure_date"] = default_date
                logger.debug(f"Added default departure_date: {default_date}")
        
        # Add default dates if missing for hotel searches
        elif intent_data["type"] == "hotel_search":
            if "check_in" not in params:
                # Default to 7 days from now
                check_in = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
                params["check_in"] = check_in
                logger.debug(f"Added default check_in: {check_in}")
            
            if "check_out" not in params:
                # Default to 3 days after check-in
                check_in_date = datetime.strptime(params.get("check_in", (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")), "%Y-%m-%d")
                check_out = (check_in_date + timedelta(days=3)).strftime("%Y-%m-%d")
                params["check_out"] = check_out
                logger.debug(f"Added default check_out: {check_out}")
        
        intent_data["params"] = params
        return intent_data
    
    def _parse_relative_date(self, date_str: str) -> Optional[str]:
        """Parse relative dates like 'tomorrow', 'next week', 'December' to YYYY-MM-DD format"""
        if not date_str or date_str in ["null", "None", ""]:
            return None
        
        # If already in YYYY-MM-DD format, return as is
        if re.match(r'\d{4}-\d{2}-\d{2}', date_str):
            return date_str
        
        date_str_lower = date_str.lower().strip()
        today = datetime.now()
        
        # Handle common relative dates
        if date_str_lower in ["today"]:
            return today.strftime("%Y-%m-%d")
        elif date_str_lower in ["tomorrow"]:
            return (today + timedelta(days=1)).strftime("%Y-%m-%d")
        elif date_str_lower in ["day after tomorrow"]:
            return (today + timedelta(days=2)).strftime("%Y-%m-%d")
        elif "next week" in date_str_lower:
            return (today + timedelta(weeks=1)).strftime("%Y-%m-%d")
        elif "next month" in date_str_lower:
            # Simple next month calculation
            if today.month == 12:
                next_month = today.replace(year=today.year + 1, month=1)
            else:
                next_month = today.replace(month=today.month + 1)
            return next_month.strftime("%Y-%m-%d")
        
        # Handle month names, optionally with explicit year like "December 2025"
        month_mapping = {
            "january": "01", "february": "02", "march": "03", "april": "04",
            "may": "05", "june": "06", "july": "07", "august": "08",
            "september": "09", "october": "10", "november": "11", "december": "12"
        }
        
        for month_name, month_num in month_mapping.items():
            if month_name in date_str_lower:
                # Try to capture explicit year if present (e.g., "December 2025")
                year_match = re.search(r"(19|20)\d{2}", date_str_lower)
                if year_match:
                    year = int(year_match.group(0))
                else:
                    # Default to current year, or next year if month has passed
                    year = today.year
                    if int(month_num) < today.month:
                        year = today.year + 1
                return f"{year}-{month_num}-01"
        
        # Handle "this month" - return a date in the current month
        if "this month" in date_str_lower:
            return today.replace(day=15).strftime("%Y-%m-%d")
        
        # Handle "this week", "this month" etc.
        if "this week" in date_str_lower:
            # Return a date 3 days from now (middle of the week)
            return (today + timedelta(days=3)).strftime("%Y-%m-%d")
        elif "this month" in date_str_lower:
            # Return 15th of current month
            return today.replace(day=15).strftime("%Y-%m-%d")
        
        # If we can't parse it, return None (will trigger API fallback)
        return None
    
    def _get_fallback_intent(self, message: str) -> Dict[str, Any]:
        """Return fallback intent when detection fails"""
        # Simple keyword-based fallback
        message_lower = message.lower()
        
        if any(word in message_lower for word in ["flight", "fly", "airplane", "airline"]):
            return {
                "type": "flight_search",
                "confidence": 0.3,
                "params": {},
                "has_required_params": False
            }
        elif any(word in message_lower for word in ["hotel", "accommodation", "stay", "room"]):
            return {
                "type": "hotel_search", 
                "confidence": 0.3,
                "params": {},
                "has_required_params": False
            }
        elif any(word in message_lower for word in ["activity", "things to do", "attraction", "tour"]):
            return {
                "type": "activity_search",
                "confidence": 0.3,
                "params": {},
                "has_required_params": False
            }
        else:
            return {
                "type": "general",
                "confidence": 0.5,
                "params": {},
                "has_required_params": False
            }
    
    def _parse_date_range(self, message: str) -> tuple:
        """Parse date ranges like '10/27 to 11/5' or 'October 27th to November 5th'"""
        import re
        from datetime import datetime, timedelta
        
        # Current year
        current_year = datetime.now().year
        
        # Pattern for MM/DD format
        date_pattern = r'(\d{1,2})/(\d{1,2})'
        dates = re.findall(date_pattern, message)
        
        if len(dates) >= 2:
            # Parse departure date
            dep_month, dep_day = int(dates[0][0]), int(dates[0][1])
            departure_date = datetime(current_year, dep_month, dep_day)
            
            # Parse return date  
            ret_month, ret_day = int(dates[1][0]), int(dates[1][1])
            return_date = datetime(current_year, ret_month, ret_day)
            
            # Handle year rollover if return date is before departure
            if return_date < departure_date:
                return_date = datetime(current_year + 1, ret_month, ret_day)
            
            return (
                departure_date.strftime("%Y-%m-%d"),
                return_date.strftime("%Y-%m-%d")
            )
        
        # Default: 30 days from now
        departure_date = datetime.now() + timedelta(days=30)
        return (departure_date.strftime("%Y-%m-%d"), None)
