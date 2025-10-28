"""
Flight Response Formatter for Smart Travel Assistant
Formats Amadeus API responses for frontend dashboard display
"""

from typing import Dict, List, Any, Optional
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

def format_flight_for_dashboard(
    flight_data: Dict[str, Any],
    origin_city: str,
    dest_city: str,
    origin_code: str,
    dest_code: str,
    departure_date: str,
    return_date: Optional[str] = None
) -> Dict[str, Any]:
    """
    Format Amadeus flight data for frontend dashboard display
    
    Args:
        flight_data: Raw flight data from Amadeus API
        origin_city: Origin city name
        dest_city: Destination city name
        origin_code: Origin IATA code
        dest_code: Destination IATA code
        departure_date: Departure date string
        return_date: Return date string (optional)
        
    Returns:
        Formatted data for dashboard display
    """
    
    formatted_response = {
        "hasRealData": True,
        "route": {
            "departure": origin_city,
            "destination": dest_city,
            "departureCode": origin_code,
            "destinationCode": dest_code,
            "date": _format_date_display(departure_date),
            "departure_display": _format_date_display(departure_date),
            "return_display": _format_date_display(return_date) if return_date else None
        },
        "outboundFlights": [],
        "returnFlights": [],
        "priceData": []
    }
    
    # Process flight offers
    all_prices = []
    
    if "flights" in flight_data and flight_data["flights"]:
        for flight in flight_data["flights"]:
            try:
                price = float(flight.get("price", 0))
                all_prices.append(price)
                
                # Process itineraries
                itineraries = flight.get("itineraries", [])
                
                # Outbound flight (first itinerary)
                if len(itineraries) > 0:
                    outbound_flight = _format_single_flight(
                        flight, itineraries[0], 0, price
                    )
                    if outbound_flight:
                        formatted_response["outboundFlights"].append(outbound_flight)
                
                # Return flight (second itinerary if exists)
                if len(itineraries) > 1 and return_date:
                    return_flight = _format_single_flight(
                        flight, itineraries[1], 1, price
                    )
                    if return_flight:
                        formatted_response["returnFlights"].append(return_flight)
                        
            except Exception as e:
                logger.error(f"Error formatting flight: {e}")
                continue
    
    # Generate price trend data
    formatted_response["priceData"] = _generate_price_trend_data(
        all_prices, departure_date
    )
    
    # Sort flights by price
    formatted_response["outboundFlights"].sort(key=lambda x: x["price"])
    formatted_response["returnFlights"].sort(key=lambda x: x["price"])
    
    # Mark best deals
    _mark_best_deals(formatted_response["outboundFlights"])
    _mark_best_deals(formatted_response["returnFlights"])
    
    return formatted_response

def _format_single_flight(
    flight_offer: Dict[str, Any],
    itinerary: Dict[str, Any],
    itinerary_index: int,
    price: float
) -> Optional[Dict[str, Any]]:
    """Format a single flight itinerary"""
    
    segments = itinerary.get("segments", [])
    if not segments:
        return None
    
    first_segment = segments[0]
    last_segment = segments[-1]
    
    # Get airline info
    airline_code = first_segment.get("airline", first_segment.get("carrierCode", ""))
    flight_number = first_segment.get("number", "")
    
    # Parse departure and arrival times
    dep_time_str = first_segment.get("departure", {}).get("time", "")
    arr_time_str = last_segment.get("arrival", {}).get("time", "")
    
    dep_display = _format_time_display(dep_time_str)
    arr_display = _format_time_display(arr_time_str)
    
    # Format duration
    duration = _format_duration(itinerary.get("duration", ""))
    
    return {
        "id": f"{flight_offer.get('id', '')}_{itinerary_index}",
        "airline": _get_airline_name(airline_code),
        "flightNumber": f"{airline_code} {flight_number}",
        "departure": dep_display,
        "arrival": arr_display,
        "duration": duration,
        "price": price,
        "stops": len(segments) - 1,
        "isOptimal": False,  # Will be set later
        "departureAirport": first_segment.get("departure", {}).get("iataCode", ""),
        "arrivalAirport": last_segment.get("arrival", {}).get("iataCode", "")
    }

def _format_time_display(time_str: str) -> str:
    """Format ISO time string to display format"""
    if not time_str:
        return "N/A"
    
    try:
        # Parse ISO format
        dt = datetime.fromisoformat(time_str.replace("Z", "+00:00"))
        return dt.strftime("%I:%M %p")
    except:
        # Try alternate formats
        try:
            dt = datetime.strptime(time_str[:16], "%Y-%m-%dT%H:%M")
            return dt.strftime("%I:%M %p")
        except:
            return time_str

def _format_date_display(date_str: str) -> str:
    """Format date string for display"""
    if not date_str:
        return ""
    
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        return dt.strftime("%b %d, %Y")
    except:
        return date_str

def _format_duration(duration_str: str) -> str:
    """Format ISO duration to readable format"""
    if not duration_str:
        return "N/A"
    
    # ISO duration format: PT3H30M
    import re
    
    match = re.match(r'PT(?:(\d+)H)?(?:(\d+)M)?', duration_str)
    if match:
        hours = match.group(1) or "0"
        minutes = match.group(2) or "0"
        return f"{hours}h {minutes}m"
    
    return duration_str

def _get_airline_name(airline_code: str) -> str:
    """Get airline name from code"""
    
    airline_names = {
        "TK": "Turkish Airlines",
        "UA": "United Airlines",
        "AA": "American Airlines",
        "DL": "Delta Airlines",
        "BA": "British Airways",
        "LH": "Lufthansa",
        "AF": "Air France",
        "KL": "KLM",
        "EK": "Emirates",
        "QR": "Qatar Airways",
        "SQ": "Singapore Airlines",
        "AC": "Air Canada",
        "NH": "All Nippon Airways",
        "JL": "Japan Airlines",
        "CX": "Cathay Pacific",
        "QF": "Qantas",
        "EY": "Etihad Airways",
        "OS": "Austrian Airlines",
        "LX": "SWISS",
        "SK": "SAS",
        "AZ": "ITA Airways",
        "IB": "Iberia",
        "TP": "TAP Air Portugal",
        "SN": "Brussels Airlines",
        "LO": "LOT Polish Airlines",
        "OK": "Czech Airlines",
        "A3": "Aegean Airlines",
        "TG": "Thai Airways",
        "SV": "Saudia",
        "MS": "EgyptAir",
        "ET": "Ethiopian Airlines",
        "WN": "Southwest Airlines",
        "B6": "JetBlue",
        "NK": "Spirit Airlines",
        "F9": "Frontier Airlines",
        "AS": "Alaska Airlines",
    }
    
    return airline_names.get(airline_code, airline_code)

def _generate_price_trend_data(
    prices: List[float],
    departure_date: str
) -> List[Dict[str, Any]]:
    """Generate price trend data for chart"""
    
    if not prices:
        # Generate mock data if no prices
        base_price = 500
    else:
        base_price = min(prices)
    
    trend_data = []
    
    # Generate 7 days of price data
    try:
        base_date = datetime.strptime(departure_date, "%Y-%m-%d")
    except:
        base_date = datetime.now()
    
    for i in range(-3, 4):  # -3 to +3 days from departure
        date = base_date.replace(day=base_date.day + i)
        
        # Simulate price variation
        if i < 0:
            # Past dates - slightly higher
            price_variation = base_price * (1 + abs(i) * 0.05)
        elif i == 0:
            # Departure date - use base price
            price_variation = base_price
        else:
            # Future dates - gradually increase
            price_variation = base_price * (1 + i * 0.03)
        
        trend_data.append({
            "date": date.strftime("%b %d"),
            "price": round(price_variation, 2),
            "optimal": round(base_price, 2)
        })
    
    return trend_data

def _mark_best_deals(flights: List[Dict[str, Any]]) -> None:
    """Mark the best deals in a list of flights"""
    
    if not flights:
        return
    
    # Sort by price
    flights.sort(key=lambda x: x["price"])
    
    # Mark top 3 cheapest as optimal
    for i, flight in enumerate(flights[:3]):
        flight["isOptimal"] = True
    
    # Also mark any direct flights in top 5
    for flight in flights[:5]:
        if flight["stops"] == 0:
            flight["isOptimal"] = True
