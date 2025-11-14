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
    return_date: Optional[str] = None,
    user_preferences: Optional[Dict[str, float]] = None
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
    seen_outbound_keys = set()  # 중복 체크를 위한 set (outbound 항공편)
    seen_return_keys = set()    # 중복 체크를 위한 set (return 항공편)
    
    if "flights" in flight_data and flight_data["flights"]:
        for flight in flight_data["flights"]:
            try:
                price = float(flight.get("price", 0))
                original_currency = flight.get("currency", "UNKNOWN")
                logger.info(f"[FLIGHT_FORMATTER] CURRENCY CHECK: Original currency from Amadeus: {original_currency}, Price: {price}")
                all_prices.append(price)
                
                # Process itineraries
                itineraries = flight.get("itineraries", [])
                
                # Outbound flight (first itinerary)
                if len(itineraries) > 0:
                    outbound_flight = _format_single_flight(
                        flight, itineraries[0], 0, price
                    )
                    if outbound_flight:
                        # 항공편을 고유하게 식별하는 키 생성
                        # airline + flightNumber + departure time + arrival time 조합
                        outbound_key = (
                            outbound_flight.get('airline', ''),
                            outbound_flight.get('flightNumber', ''),
                            outbound_flight.get('departure', ''),
                            outbound_flight.get('arrival', ''),
                            outbound_flight.get('duration', '')
                        )
                        
                        # 중복 체크: 이미 추가된 항공편이 아니면 추가
                        if outbound_key not in seen_outbound_keys:
                            seen_outbound_keys.add(outbound_key)
                            formatted_response["outboundFlights"].append(outbound_flight)
                            logger.info(f"[FLIGHT_FORMATTER] Added unique outbound flight: {outbound_flight.get('airline', '')} {outbound_flight.get('flightNumber', '')}")
                        else:
                            logger.info(f"[FLIGHT_FORMATTER] Skipped duplicate outbound flight: {outbound_flight.get('airline', '')} {outbound_flight.get('flightNumber', '')}")
                
                # Return flight (second itinerary if exists)
                if len(itineraries) > 1 and return_date:
                    return_flight = _format_single_flight(
                        flight, itineraries[1], 1, price
                    )
                    if return_flight:
                        # Return 항공편도 동일하게 중복 체크
                        return_key = (
                            return_flight.get('airline', ''),
                            return_flight.get('flightNumber', ''),
                            return_flight.get('departure', ''),
                            return_flight.get('arrival', ''),
                            return_flight.get('duration', '')
                        )
                        
                        if return_key not in seen_return_keys:
                            seen_return_keys.add(return_key)
                            formatted_response["returnFlights"].append(return_flight)
                            logger.info(f"[FLIGHT_FORMATTER] Added unique return flight: {return_flight.get('airline', '')} {return_flight.get('flightNumber', '')}")
                        else:
                            logger.info(f"[FLIGHT_FORMATTER] Skipped duplicate return flight: {return_flight.get('airline', '')} {return_flight.get('flightNumber', '')}")
                        
            except Exception as e:
                logger.error(f"Error formatting flight: {e}")
                continue
    
    # Generate price trend data
    formatted_response["priceData"] = _generate_price_trend_data(
        all_prices, departure_date
    )
    
    # Sort flights based on user preferences or by price
    if user_preferences and (formatted_response["outboundFlights"] or formatted_response["returnFlights"]):
        logger.info(f"[FLIGHT_FORMATTER] Sorting flights by user preferences: {user_preferences}")
        
        # Calculate preference scores for all flights
        all_flights = formatted_response["outboundFlights"] + formatted_response["returnFlights"]
        if all_flights:
            # Normalize values for scoring
            prices = [f["price"] for f in all_flights if f.get("price")]
            durations_hours = []
            for f in all_flights:
                duration_str = f.get("duration", "0h 0m")
                hours = _parse_duration_to_hours(duration_str)
                durations_hours.append(hours)
            
            min_price = min(prices) if prices else 1
            max_price = max(prices) if prices else 1
            min_duration = min(durations_hours) if durations_hours else 1
            max_duration = max(durations_hours) if durations_hours else 1
            
            # Calculate scores for outbound flights
            for flight in formatted_response["outboundFlights"]:
                score = _calculate_preference_score(
                    flight, user_preferences, min_price, max_price, min_duration, max_duration
                )
                flight['preferenceScore'] = score
                logger.info(f"[FLIGHT_FORMATTER] Flight {flight.get('flightNumber')} preference score: {score:.4f}")
            
            # Calculate scores for return flights
            for flight in formatted_response["returnFlights"]:
                score = _calculate_preference_score(
                    flight, user_preferences, min_price, max_price, min_duration, max_duration
                )
                flight['preferenceScore'] = score
            
            # Sort by preference score (higher is better)
            formatted_response["outboundFlights"].sort(key=lambda x: x.get('preferenceScore', 0), reverse=True)
            formatted_response["returnFlights"].sort(key=lambda x: x.get('preferenceScore', 0), reverse=True)
            
            logger.info(f"[FLIGHT_FORMATTER] Top outbound flight after sorting: {formatted_response['outboundFlights'][0].get('flightNumber') if formatted_response['outboundFlights'] else 'None'} (score: {formatted_response['outboundFlights'][0].get('preferenceScore', 0) if formatted_response['outboundFlights'] else 0})")
    else:
        # Default: Sort by price
        logger.info("[FLIGHT_FORMATTER] No user preferences - sorting by price")
        formatted_response["outboundFlights"].sort(key=lambda x: x["price"])
        formatted_response["returnFlights"].sort(key=lambda x: x["price"])
    
    # Mark best deals
    _mark_best_deals(formatted_response["outboundFlights"])
    _mark_best_deals(formatted_response["returnFlights"])
    
    # CRITICAL: Filter out placeholder rows with '---' values before returning
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
    
    # Filter out placeholder flights from both outbound and return
    formatted_response["outboundFlights"] = [f for f in formatted_response["outboundFlights"] if not is_placeholder_flight(f)]
    formatted_response["returnFlights"] = [f for f in formatted_response["returnFlights"] if not is_placeholder_flight(f)]
    
    logger.info(f"[FLIGHT_FORMATTER] After filtering placeholders: {len(formatted_response['outboundFlights'])} outbound, {len(formatted_response['returnFlights'])} return flights")
    
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
        logger.warning(f"[FLIGHT_FORMATTER] No segments in itinerary {itinerary_index}")
        return None
    
    first_segment = segments[0]
    last_segment = segments[-1]
    
    # Get airline codes from all segments
    airline_codes = []
    for segment in segments:
        airline_code = segment.get("airline", segment.get("carrierCode", ""))
        if airline_code:
            airline_codes.append(airline_code)
    
    # Determine airline name: if all segments have same airline, use that; otherwise "Multiple Airlines"
    if len(set(airline_codes)) == 1 and airline_codes:
        # All segments have the same airline
        airline_code = airline_codes[0]
        airline_name = _get_airline_name(airline_code)
    elif len(airline_codes) > 1:
        # Different airlines in different segments
        airline_name = "Multiple Airlines"
        airline_code = airline_codes[0]  # Use first for flight number display
    else:
        # No airline code found
        airline_code = airline_codes[0] if airline_codes else ""
        airline_name = _get_airline_name(airline_code) if airline_code else "Unknown"
    
    flight_number = first_segment.get("flight_number", first_segment.get("number", ""))
    
    logger.info(f"[FLIGHT_FORMATTER] Processing flight: {airline_code} {flight_number}, segments: {len(segments)}, airlines: {airline_codes}")
    
    # Parse departure and arrival times
    dep_time_str = first_segment.get("departure", {}).get("time", "")
    arr_time_str = last_segment.get("arrival", {}).get("time", "")
    
    dep_display = _format_time_display(dep_time_str)
    arr_display = _format_time_display(arr_time_str)
    
    # Format duration
    duration = _format_duration(itinerary.get("duration", ""))
    
    # Create flight number display
    if airline_code and flight_number:
        flight_number_display = f"{airline_code} {flight_number}"
    elif airline_code:
        flight_number_display = airline_code
    else:
        flight_number_display = "Unknown"
    
    # Get original currency from flight offer (preserve EUR from Amadeus)
    original_currency = flight_offer.get("currency", "EUR")
    logger.info(f"[FLIGHT_FORMATTER] CURRENCY CHECK: Flight {flight_number_display} - Currency: {original_currency}, Price: {price}")
    
    result = {
        "id": f"{flight_offer.get('id', '')}_{itinerary_index}",
        "airline": airline_name,
        "flightNumber": flight_number_display,
        "departure": dep_display,
        "arrival": arr_display,
        "duration": duration,
        "price": price,
        "currency": original_currency,  # Use original currency from Amadeus (EUR)
        "stops": len(segments) - 1,
        "segments": segments,  # Include segments for layover information
        "isOptimal": False,  # Will be set later
        "departureAirport": first_segment.get("departure", {}).get("iataCode", ""),
        "arrivalAirport": last_segment.get("arrival", {}).get("iataCode", ""),
        "bookingLink": _generate_booking_link(airline_name, flight_number_display.replace(' ', ''))
    }
    
    # Preserve airport metadata from multi-airport search if available
    if '_origin_airport' in flight_offer:
        result['_origin_airport'] = flight_offer['_origin_airport']
    if '_destination_airport' in flight_offer:
        result['_destination_airport'] = flight_offer['_destination_airport']
    
    # Validate that we have minimum required fields
    if not result.get('airline') or result.get('airline') == 'Unknown':
        logger.warning(f"[FLIGHT_FORMATTER] Invalid flight: missing airline")
        return None
    if not result.get('flightNumber') or result.get('flightNumber') == 'Unknown':
        logger.warning(f"[FLIGHT_FORMATTER] Invalid flight: missing flight number")
        return None
    if not result.get('departure') or result.get('departure') == 'N/A':
        logger.warning(f"[FLIGHT_FORMATTER] Invalid flight: missing departure time")
        return None
    if not result.get('arrival') or result.get('arrival') == 'N/A':
        logger.warning(f"[FLIGHT_FORMATTER] Invalid flight: missing arrival time")
        return None
    if price <= 0:
        logger.warning(f"[FLIGHT_FORMATTER] Invalid flight: invalid price {price}")
        return None
    
    logger.info(f"[FLIGHT_FORMATTER] Formatted flight: {result['airline']} {result['flightNumber']} - {dep_display} to {arr_display}")
    logger.info(f"[FLIGHT_FORMATTER] Flight details: Price=${price}, Stops={result['stops']}, DepartureAirport={result['departureAirport']}, ArrivalAirport={result['arrivalAirport']}")
    return result

def _format_time_display(time_str: str) -> str:
    """Format ISO time string to display format"""
    if not time_str:
        return "N/A"
    
    try:
        # Parse ISO format with timezone
        if time_str.endswith("Z"):
            dt = datetime.fromisoformat(time_str.replace("Z", "+00:00"))
        elif "+" in time_str or time_str.count("-") > 2:
            # Has timezone info
            dt = datetime.fromisoformat(time_str)
        else:
            # No timezone info, assume UTC
            dt = datetime.fromisoformat(time_str + "+00:00")
        
        return dt.strftime("%I:%M %p")
    except Exception as e:
        logger.warning(f"[FLIGHT_FORMATTER] Failed to parse time '{time_str}': {e}")
        # Try alternate formats
        try:
            # Try without timezone
            dt = datetime.strptime(time_str[:16], "%Y-%m-%dT%H:%M")
            return dt.strftime("%I:%M %p")
        except Exception as e2:
            logger.warning(f"[FLIGHT_FORMATTER] Failed to parse time with alternate format: {e2}")
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
        # Major US Airlines
        "UA": "United Airlines",
        "AA": "American Airlines", 
        "DL": "Delta Airlines",
        "WN": "Southwest Airlines",
        "B6": "JetBlue Airways",
        "NK": "Spirit Airlines",
        "F9": "Frontier Airlines",
        "AS": "Alaska Airlines",
        "HA": "Hawaiian Airlines",
        
        # European Airlines
        "BA": "British Airways",
        "LH": "Lufthansa",
        "AF": "Air France",
        "KL": "KLM Royal Dutch Airlines",
        "OS": "Austrian Airlines",
        "LX": "SWISS",
        "SK": "SAS Scandinavian Airlines",
        "AZ": "ITA Airways",
        "IB": "Iberia",
        "TP": "TAP Air Portugal",
        "SN": "Brussels Airlines",
        "LO": "LOT Polish Airlines",
        "OK": "Czech Airlines",
        "A3": "Aegean Airlines",
        "TK": "Turkish Airlines",
        "SU": "Aeroflot",
        "PC": "Pegasus Airlines",
        
        # Middle East & Asia
        "EK": "Emirates",
        "QR": "Qatar Airways",
        "EY": "Etihad Airways",
        "SV": "Saudia",
        "SQ": "Singapore Airlines",
        "CX": "Cathay Pacific",
        "NH": "All Nippon Airways",
        "JL": "Japan Airlines",
        "TG": "Thai Airways",
        "MH": "Malaysia Airlines",
        "GA": "Garuda Indonesia",
        "CI": "China Airlines",
        "BR": "EVA Air",
        "OZ": "Asiana Airlines",
        "KE": "Korean Air",
        
        # Other Major Airlines
        "AC": "Air Canada",
        "QF": "Qantas",
        "MS": "EgyptAir",
        "ET": "Ethiopian Airlines",
        "SA": "South African Airways",
        "AR": "Aerolíneas Argentinas",
        "LA": "LATAM Airlines",
        "CM": "Copa Airlines",
        "AV": "Avianca",
        "JJ": "LATAM Brasil",
        "AM": "Aeroméxico",
        "VS": "Virgin Atlantic",
        "VX": "Virgin America",
    }
    
    return airline_names.get(airline_code, airline_code)

def _parse_duration_to_hours(duration_str: str) -> float:
    """Parse duration string (e.g., '8h 30m') to hours as float"""
    if not duration_str:
        return 0.0
    
    import re
    # Match patterns like "8h 30m" or "PT8H30M"
    match = re.match(r'(?:PT)?(?:(\d+)H)?(?:(\d+)M)?', duration_str.replace(' ', ''))
    if match:
        hours = float(match.group(1) or 0)
        minutes = float(match.group(2) or 0)
        return hours + (minutes / 60.0)
    
    return 0.0

def _calculate_preference_score(
    flight: Dict[str, Any],
    preferences: Dict[str, float],
    min_price: float,
    max_price: float,
    min_duration: float,
    max_duration: float
) -> float:
    """
    Calculate preference score for a flight based on user preferences
    
    Score formula:
    score = budget_weight * normalized_price_score + 
            quality_weight * normalized_quality_score + 
            convenience_weight * normalized_convenience_score
    
    Where:
    - normalized_price_score: (max_price - price) / (max_price - min_price) [lower price is better]
    - normalized_quality_score: based on stops (non-stop = 1.0, 1 stop = 0.7, 2+ stops = 0.4) and airline rating
    - normalized_convenience_score: (max_duration - duration) / (max_duration - min_duration) [shorter is better]
    """
    budget_weight = preferences.get('budget', 0.33)
    quality_weight = preferences.get('quality', 0.33)
    convenience_weight = preferences.get('convenience', 0.34)
    
    # Normalize price score (lower price = higher score)
    price = flight.get('price', max_price)
    if max_price > min_price:
        normalized_price_score = (max_price - price) / (max_price - min_price)
    else:
        normalized_price_score = 0.5  # Default if all prices are same
    
    # Calculate quality score (based on stops - fewer stops = higher quality)
    stops = flight.get('stops', 0)
    if stops == 0:
        quality_score = 1.0  # Non-stop is best
    elif stops == 1:
        quality_score = 0.7  # 1 stop is acceptable
    else:
        quality_score = 0.4  # 2+ stops is lower quality
    
    # Normalize convenience score (shorter duration = higher score)
    duration_str = flight.get('duration', '0h 0m')
    duration_hours = _parse_duration_to_hours(duration_str)
    
    if max_duration > min_duration:
        normalized_convenience_score = (max_duration - duration_hours) / (max_duration - min_duration)
    else:
        normalized_convenience_score = 0.5  # Default if all durations are same
    
    # Calculate weighted score
    total_score = (
        budget_weight * normalized_price_score +
        quality_weight * quality_score +
        convenience_weight * normalized_convenience_score
    )
    
    logger.debug(f"[FLIGHT_FORMATTER] Score calculation for {flight.get('flightNumber')}: "
                f"price_score={normalized_price_score:.3f} (weight={budget_weight}), "
                f"quality_score={quality_score:.3f} (weight={quality_weight}), "
                f"convenience_score={normalized_convenience_score:.3f} (weight={convenience_weight}), "
                f"total={total_score:.3f}")
    
    return total_score

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

def _generate_booking_link(airline_name: str, flight_code: str) -> str:
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
        "KLM Royal Dutch Airlines": "https://www.klm.com",
        "Iberia": "https://www.iberia.com",
        "ITA Airways": "https://www.ita-airways.com",
        "SWISS": "https://www.swiss.com",
        "Austrian Airlines": "https://www.austrian.com",
        "SAS Scandinavian Airlines": "https://www.sas.se",
        "TAP Air Portugal": "https://www.flytap.com",
        "Virgin Atlantic": "https://www.virgin-atlantic.com",
        "Emirates": "https://www.emirates.com",
        "Qatar Airways": "https://www.qatarairways.com",
        "Turkish Airlines": "https://www.turkishairlines.com",
        "Aeroflot": "https://www.aeroflot.com",
        "Air Canada": "https://www.aircanada.com",
        "JetBlue Airways": "https://www.jetblue.com",
        "Southwest Airlines": "https://www.southwest.com",
        "Alaska Airlines": "https://www.alaskaair.com",
        "Spirit Airlines": "https://www.spirit.com",
        "Frontier Airlines": "https://www.flyfrontier.com",
        "Hawaiian Airlines": "https://www.hawaiianairlines.com",
        "Singapore Airlines": "https://www.singaporeair.com",
        "Cathay Pacific": "https://www.cathaypacific.com",
        "All Nippon Airways": "https://www.ana.co.jp",
        "Japan Airlines": "https://www.jal.co.jp",
        "Thai Airways": "https://www.thaiairways.com",
        "Malaysia Airlines": "https://www.malaysiaairlines.com",
        "Garuda Indonesia": "https://www.garuda-indonesia.com",
        "China Airlines": "https://www.china-airlines.com",
        "EVA Air": "https://www.evaair.com",
        "Asiana Airlines": "https://www.flyasiana.com",
        "Korean Air": "https://www.koreanair.com",
        "Qantas": "https://www.qantas.com",
        "EgyptAir": "https://www.egyptair.com",
        "Ethiopian Airlines": "https://www.ethiopianairlines.com",
        "South African Airways": "https://www.flysaa.com",
        "Aerolíneas Argentinas": "https://www.aerolineas.com.ar",
        "LATAM Airlines": "https://www.latam.com",
        "Copa Airlines": "https://www.copaair.com",
        "Avianca": "https://www.avianca.com",
        "LATAM Brasil": "https://www.latam.com",
        "Aeroméxico": "https://www.aeromexico.com",
        "Virgin America": "https://www.virginamerica.com",
    }
    
    return airline_booking_urls.get(airline_name, f"https://www.google.com/search?q={airline_name}+{flight_code}+booking")

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
