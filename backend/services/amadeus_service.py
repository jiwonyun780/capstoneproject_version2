"""
Amadeus API Service for travel data integration
"""
import os
import httpx
import requests
import logging
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
import json

logger = logging.getLogger(__name__)


class AmadeusService:
    """
    Service class for Amadeus API integration
    Handles OAuth2 authentication and API calls
    """
    
    def __init__(self):
        self.api_key = os.getenv("AMADEUS_API_KEY")
        self.api_secret = os.getenv("AMADEUS_API_SECRET")
        
        # Default to production if not specified, but allow override
        self.base_url = os.getenv("AMADEUS_API_BASE", "https://api.amadeus.com")
        
        if not self.api_key or not self.api_secret:
            raise ValueError("AMADEUS_API_KEY and AMADEUS_API_SECRET must be set")
        
        logger.info(f"[AMADEUS] Initialized with base URL: {self.base_url}")
        
        self._access_token = None
        self._token_expires_at = None
        self._client = None  # Initialize lazily to avoid event loop issues
    
    def _get_access_token(self) -> str:
        """Get or refresh OAuth2 access token"""
        if self._access_token and self._token_expires_at and datetime.now() < self._token_expires_at:
            return self._access_token
        
        try:
            response = requests.post(
                f"{self.base_url}/v1/security/oauth2/token",
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                data={
                    "grant_type": "client_credentials",
                    "client_id": self.api_key,
                    "client_secret": self.api_secret
                },
                timeout=30
            )
            response.raise_for_status()
            
            token_data = response.json()
            self._access_token = token_data["access_token"]
            # Set expiration 5 minutes before actual expiry for safety
            expires_in = token_data.get("expires_in", 1800) - 300
            self._token_expires_at = datetime.now() + timedelta(seconds=expires_in)
            
            logger.info("Amadeus access token refreshed successfully")
            return self._access_token
            
        except Exception as e:
            logger.error(f"Failed to get Amadeus access token: {e}")
            raise Exception(f"Amadeus authentication failed: {e}")
    
    def _make_request(self, endpoint: str, params: Dict[str, Any] = None) -> Dict[str, Any]:
        """Make authenticated request to Amadeus API"""
        token = self._get_access_token()
        params = params or {}
        
        # Log request details for debugging
        full_url = f"{self.base_url}{endpoint}"
        logger.info(f"[AMADEUS] Making request to: {full_url}")
        logger.info(f"[AMADEUS] Request params: {params}")
        
        try:
            response = requests.get(
                full_url,
                headers={"Authorization": f"Bearer {token}"},
                params=params,
                timeout=30
            )
            
            # Log response status before raising
            logger.info(f"[AMADEUS] Response status: {response.status_code}")
            if response.status_code != 200:
                logger.warning(f"[AMADEUS] Non-200 response: {response.text[:500]}")
            
            response.raise_for_status()
            result = response.json()
            logger.info(f"[AMADEUS] Response received, data keys: {list(result.keys()) if isinstance(result, dict) else 'not a dict'}")
            return result
            
        except requests.exceptions.HTTPError as e:
            logger.error(f"[AMADEUS] API error {e.response.status_code}: {e.response.text}")
            if e.response.status_code == 401:
                # Token might be expired, try to refresh
                self._access_token = None
                return self._make_request(endpoint, params)
            # include body to help diagnose
            raise Exception(f"Amadeus API error: {e.response.status_code} - {e.response.text}")
        except Exception as e:
            logger.error(f"[AMADEUS] API request failed: {e}", exc_info=True)
            raise Exception(f"Amadeus API request failed: {e}")
    
    def search_flights(self, origin: str, destination: str, departure_date: str, 
                           return_date: str = None, adults: int = 1, max_price: int = None) -> Dict[str, Any]:
        """Search for flight offers"""
        params = {
            "originLocationCode": origin,
            "destinationLocationCode": destination,
            "departureDate": departure_date,
            "adults": adults
        }
        
        if return_date:
            params["returnDate"] = return_date
        
        if max_price:
            params["maxPrice"] = max_price
        
        try:
            response = self._make_request("/v2/shopping/flight-offers", params)
            return self._format_flight_response(response)
        except Exception as e:
            logger.error(f"Flight search failed: {e}")
            return {"error": str(e), "flights": []}
    
    def get_flight_inspiration(self, origin: str, max_price: int = None, 
                                    departure_date: str = None) -> Dict[str, Any]:
        """Get flight inspiration destinations"""
        params = {"origin": origin}
        
        if max_price:
            params["maxPrice"] = max_price
        if departure_date:
            params["departureDate"] = departure_date
        
        try:
            response = self._make_request("/v1/shopping/flight-destinations", params)
            return self._format_inspiration_response(response)
        except Exception as e:
            logger.error(f"Flight inspiration failed: {e}")
            return {"error": str(e), "destinations": []}
    
    def search_hotels(self, city_code: str, check_in: str, check_out: str, 
                           adults: int = 1, radius: int = 50, price_range: str = None) -> Dict[str, Any]:
        """
        Search for hotel offers with real-time pricing
        Returns actual bookable prices (not estimates) from Amadeus Hotel Offers API
        Uses v2 API for city-based search
        """
        params = {
            "cityCode": city_code,
            "checkInDate": check_in,
            "checkOutDate": check_out,
            "adults": adults,
            "radius": radius
        }
        
        if price_range:
            params["priceRange"] = price_range
        
        logger.info(f"[AMADEUS] Searching hotels with params: cityCode={city_code}, checkIn={check_in}, checkOut={check_out}, adults={adults}")
        
        try:
            response = self._make_request("/v2/shopping/hotel-offers", params)
            logger.info(f"[AMADEUS] Hotel API response received, formatting...")
            formatted = self._format_hotel_response(response)
            logger.info(f"[AMADEUS] Formatted hotel response: {len(formatted.get('hotels', []))} hotels found, error: {formatted.get('error')}")
            return formatted
        except Exception as e:
            error_str = str(e)
            # Check if it's a 404 error - this might mean no hotels found for the date range
            if "404" in error_str or "Resource not found" in error_str:
                logger.warning(f"[AMADEUS] Hotel search returned 404 - no hotels found for cityCode={city_code}, dates={check_in} to {check_out}. This might be normal if no hotels are available for this date range.")
                # Try alternative search using coordinates if we have city name
                # For now, return empty result instead of error
                return {"hotels": [], "count": 0, "error": None}
            logger.error(f"[AMADEUS] Hotel search failed: {e}", exc_info=True)
            return {"error": str(e), "hotels": []}
    
    def search_hotels_v3(self, hotel_ids: List[str], check_in: str, check_out: str,
                         adults: int = 1, room_quantity: int = 1, currency: str = None,
                         price_range: str = None, payment_policy: str = "NONE",
                         board_type: str = None, best_rate_only: bool = False) -> Dict[str, Any]:
        """
        Search for hotel offers using v3 API with hotel IDs
        This provides more detailed pricing information including base, taxes, markups, and sellingTotal
        
        Args:
            hotel_ids: List of Amadeus property codes (8 chars, max 20 hotels)
            check_in: Check-in date (YYYY-MM-DD)
            check_out: Check-out date (YYYY-MM-DD)
            adults: Number of adult guests (1-9)
            room_quantity: Number of rooms (1-9)
            currency: Currency code (ISO 3-letter, e.g., USD, EUR)
            price_range: Price range filter (e.g., "200-300" or "-300" or "100")
            payment_policy: Payment type filter (GUARANTEE, DEPOSIT, NONE)
            board_type: Meal plan filter (ROOM_ONLY, BREAKFAST, HALF_BOARD, FULL_BOARD, ALL_INCLUSIVE)
            best_rate_only: Return only cheapest offer per hotel (default: False to compare all offers)
        
        Returns:
            Dict with hotel offers including detailed pricing information
        """
        if not hotel_ids or len(hotel_ids) == 0:
            return {"error": "hotel_ids is required", "hotels": []}
        
        if len(hotel_ids) > 20:
            hotel_ids = hotel_ids[:20]  # Limit to 20 hotels
            logger.warning(f"[AMADEUS] Hotel IDs limited to 20 (requested {len(hotel_ids)})")
        
        params = {
            "hotelIds": hotel_ids,
            "checkInDate": check_in,
            "checkOutDate": check_out,
            "adults": adults,
            "roomQuantity": room_quantity,
            "bestRateOnly": best_rate_only
        }
        
        if currency:
            params["currency"] = currency
        if price_range:
            params["priceRange"] = price_range
        if payment_policy:
            params["paymentPolicy"] = payment_policy
        if board_type:
            params["boardType"] = board_type
        
        logger.info(f"[AMADEUS] Searching hotels v3 with params: hotelIds={hotel_ids[:3]}..., checkIn={check_in}, checkOut={check_out}, adults={adults}")
        
        try:
            # v3 API requires special headers
            token = self._get_access_token()
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/vnd.amadeus+json"
            }
            
            # Build query string for hotelIds array
            query_params = []
            for hotel_id in hotel_ids:
                query_params.append(f"hotelIds={hotel_id}")
            query_params.append(f"checkInDate={check_in}")
            query_params.append(f"checkOutDate={check_out}")
            query_params.append(f"adults={adults}")
            query_params.append(f"roomQuantity={room_quantity}")
            query_params.append(f"bestRateOnly={str(best_rate_only).lower()}")
            
            if currency:
                query_params.append(f"currency={currency}")
            if price_range:
                query_params.append(f"priceRange={price_range}")
            if payment_policy:
                query_params.append(f"paymentPolicy={payment_policy}")
            if board_type:
                query_params.append(f"boardType={board_type}")
            
            query_string = "&".join(query_params)
            full_url = f"{self.base_url}/v3/shopping/hotel-offers?{query_string}"
            
            response = requests.get(full_url, headers=headers, timeout=30)
            response.raise_for_status()
            result = response.json()
            
            logger.info(f"[AMADEUS] Hotel v3 API response received, formatting...")
            formatted = self._format_hotel_v3_response(result)
            logger.info(f"[AMADEUS] Formatted hotel v3 response: {len(formatted.get('hotels', []))} hotels found")
            return formatted
        except Exception as e:
            error_str = str(e)
            if "404" in error_str or "Resource not found" in error_str:
                logger.warning(f"[AMADEUS] Hotel v3 search returned 404 - no hotels found for hotelIds={hotel_ids[:3]}..., dates={check_in} to {check_out}")
                return {"hotels": [], "count": 0, "error": None}
            logger.error(f"[AMADEUS] Hotel v3 search failed: {e}", exc_info=True)
            return {"error": str(e), "hotels": []}
    
    def get_hotel_offer_pricing(self, offer_id: str, lang: str = "EN") -> Dict[str, Any]:
        """
        Get detailed pricing for a specific hotel offer using v3 API
        This provides the most accurate and up-to-date pricing information
        
        Args:
            offer_id: Unique identifier of the offer (from search results)
            lang: Language code for descriptions (default: EN)
        
        Returns:
            Dict with detailed offer pricing including base, total, taxes, markups, sellingTotal
        """
        try:
            token = self._get_access_token()
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/vnd.amadeus+json"
            }
            
            params = {}
            if lang:
                params["lang"] = lang
            
            query_string = "&".join([f"{k}={v}" for k, v in params.items()]) if params else ""
            full_url = f"{self.base_url}/v3/shopping/hotel-offers/{offer_id}"
            if query_string:
                full_url += f"?{query_string}"
            
            response = requests.get(full_url, headers=headers, timeout=30)
            response.raise_for_status()
            result = response.json()
            
            logger.info(f"[AMADEUS] Hotel offer pricing received for offerId={offer_id}")
            formatted = self._format_hotel_offer_pricing_response(result)
            return formatted
        except Exception as e:
            logger.error(f"[AMADEUS] Hotel offer pricing failed: {e}", exc_info=True)
            return {"error": str(e), "offer": None}
    
    def search_activities(self, latitude: float, longitude: float, radius: int = 1) -> Dict[str, Any]:
        """
        Search for activities near coordinates
        API: /v1/shopping/activities
        
        Args:
            latitude: Latitude (decimal coordinates)
            longitude: Longitude (decimal coordinates)
            radius: Search radius in kilometers (0-20, default 1)
        """
        params = {
            "latitude": latitude,
            "longitude": longitude,
            "radius": min(max(radius, 0), 20)  # Clamp between 0 and 20
        }
        
        try:
            response = self._make_request("/v1/shopping/activities", params)
            return self._format_activity_response(response)
        except Exception as e:
            logger.error(f"Activity search failed: {e}")
            return {"error": str(e), "activities": []}
    
    def search_activities_by_square(self, north: float, south: float, east: float, west: float) -> Dict[str, Any]:
        """
        Search for activities within a bounding box
        API: /v1/shopping/activities/by-square
        
        Args:
            north: Latitude north of bounding box (decimal coordinates)
            south: Latitude south of bounding box (decimal coordinates)
            east: Longitude east of bounding box (decimal coordinates)
            west: Longitude west of bounding box (decimal coordinates)
        """
        params = {
            "north": north,
            "south": south,
            "east": east,
            "west": west
        }
        
        try:
            response = self._make_request("/v1/shopping/activities/by-square", params)
            return self._format_activity_response(response)
        except Exception as e:
            logger.error(f"Activity search by square failed: {e}")
            return {"error": str(e), "activities": []}
    
    def get_activity_by_id(self, activity_id: str) -> Dict[str, Any]:
        """
        Get detailed information about a specific activity
        API: /v1/shopping/activities/{activityId}
        
        Args:
            activity_id: Unique activity identifier
        """
        try:
            response = self._make_request(f"/v1/shopping/activities/{activity_id}", {})
            return self._format_single_activity_response(response)
        except Exception as e:
            logger.error(f"Get activity by ID failed: {e}")
            return {"error": str(e), "activity": None}
    
    def get_airport_city_search(self, keyword: str) -> Dict[str, Any]:
        """Search for airports and cities"""
        params = {"keyword": keyword, "subType": "AIRPORT,CITY"}
        
        try:
            response = self._make_request("/v1/reference-data/locations", params)
            return self._format_location_response(response)
        except Exception as e:
            logger.error(f"Location search failed: {e}")
            return {"error": str(e), "locations": []}
    
    def get_city_coordinates(self, city_name: str) -> Optional[Tuple[float, float]]:
        """
        Get coordinates (latitude, longitude) for a city name
        Uses the location search API to find city coordinates
        
        Args:
            city_name: Name of the city
            
        Returns:
            Tuple of (latitude, longitude) or None if not found
        """
        try:
            # Search for the city using location API
            location_data = self.get_airport_city_search(city_name)
            
            if location_data.get("error"):
                return None
            
            locations = location_data.get("locations", [])
            if not locations:
                return None
            
            # Find the first city result (not airport)
            for location in locations:
                if location.get("type") == "CITY":
                    # Check if coordinates are available in the location data
                    geo_code = location.get("geoCode")
                    if geo_code and isinstance(geo_code, dict):
                        lat = geo_code.get("latitude")
                        lon = geo_code.get("longitude")
                        if lat and lon:
                            try:
                                lat_float = float(lat) if isinstance(lat, str) else lat
                                lon_float = float(lon) if isinstance(lon, str) else lon
                                logger.info(f"Found coordinates for {city_name} from Amadeus API: {lat_float}, {lon_float}")
                                return (lat_float, lon_float)
                            except (ValueError, TypeError) as e:
                                logger.warning(f"Invalid coordinates format for {city_name}: {e}")
                    
                    # Fallback to external geocoding service if Amadeus doesn't provide coordinates
                    try:
                        # Use a free geocoding service as fallback
                        import requests
                        geo_response = requests.get(
                            f"https://nominatim.openstreetmap.org/search",
                            params={
                                "q": city_name,
                                "format": "json",
                                "limit": 1
                            },
                            timeout=5,
                            headers={"User-Agent": "SmartTravelAssistant/1.0"}
                        )
                        if geo_response.ok:
                            geo_data = geo_response.json()
                            if geo_data:
                                lat = float(geo_data[0]["lat"])
                                lon = float(geo_data[0]["lon"])
                                logger.info(f"Found coordinates for {city_name} from geocoding service: {lat}, {lon}")
                                return (lat, lon)
                    except Exception as geo_error:
                        logger.warning(f"Geocoding fallback failed for {city_name}: {geo_error}")
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to get coordinates for {city_name}: {e}")
            return None
    
    def get_cheapest_dates(self, origin: str, destination: str, 
                               departure_date_range: str) -> Dict[str, Any]:
        """Get cheapest flight dates"""
        params = {
            "origin": origin,
            "destination": destination,
            "departureDate": departure_date_range
        }
        
        try:
            response = self._make_request("/v1/shopping/flight-dates", params)
            return self._format_cheapest_dates_response(response)
        except Exception as e:
            logger.error(f"Cheapest dates search failed: {e}")
            return {"error": str(e), "dates": []}

    def get_flight_price_analysis(self, origin: str, destination: str, 
                                       departure_date: str, return_date: str = None) -> Dict[str, Any]:
        """
        Get flight price analysis to help users understand price trends
        API: /v2/analytics/itinerary-price-metrics
        """
        params = {
            "originIataCode": origin,
            "destinationIataCode": destination,
            "departureDate": departure_date
        }
        
        if return_date:
            params["returnDate"] = return_date
        
        try:
            response = self._make_request("/v2/analytics/itinerary-price-metrics", params)
            return self._format_price_analysis_response(response)
        except Exception as e:
            logger.error(f"Flight price analysis failed: {e}")
            return {"error": str(e), "analysis": None}

    def get_flight_choice_prediction(self, origin: str, destination: str,
                                         departure_date: str, return_date: str = None,
                                         cabin_class: str = "ECONOMY") -> Dict[str, Any]:
        """
        Get flight choice prediction based on user preferences
        API: /v2/shopping/flight-offers/prediction
        This can help personalize recommendations based on user preferences from onboarding
        """
        params = {
            "originLocationCode": origin,
            "destinationLocationCode": destination,
            "departureDate": departure_date,
            "cabinClass": cabin_class
        }
        
        if return_date:
            params["returnDate"] = return_date
        
        try:
            response = self._make_request("/v2/shopping/flight-offers/prediction", params)
            return self._format_choice_prediction_response(response)
        except Exception as e:
            logger.error(f"Flight choice prediction failed: {e}")
            return {"error": str(e), "predictions": []}

    def get_flight_delay_prediction(self, origin: str, destination: str,
                                        departure_date: str, departure_time: str,
                                        carrier_code: str, flight_number: str) -> Dict[str, Any]:
        """
        Get flight delay prediction for better travel planning
        API: /v1/travel/predictions/flight-delay
        """
        params = {
            "originLocationCode": origin,
            "destinationLocationCode": destination,
            "departureDate": departure_date,
            "departureTime": departure_time,
            "carrierCode": carrier_code,
            "flightNumber": flight_number
        }
        
        try:
            response = self._make_request("/v1/travel/predictions/flight-delay", params)
            return self._format_delay_prediction_response(response)
        except Exception as e:
            logger.error(f"Flight delay prediction failed: {e}")
            return {"error": str(e), "prediction": None}

    def get_seatmap_display(self, flight_offer_id: str) -> Dict[str, Any]:
        """
        Get seat map for flight selection
        API: /v1/shopping/seatmaps
        """
        params = {"flight-orderId": flight_offer_id}
        
        try:
            response = self._make_request("/v1/shopping/seatmaps", params)
            return self._format_seatmap_response(response)
        except Exception as e:
            logger.error(f"Seatmap display failed: {e}")
            return {"error": str(e), "seatmap": None}

    def get_branded_fares(self, origin: str, destination: str, 
                              departure_date: str, return_date: str = None) -> Dict[str, Any]:
        """
        Get branded fares with different service options
        API: /v2/shopping/flight-offers (with view=DELTA)
        """
        params = {
            "originLocationCode": origin,
            "destinationLocationCode": destination,
            "departureDate": departure_date,
            "view": "DELTA"  # Returns branded fares
        }
        
        if return_date:
            params["returnDate"] = return_date
        
        try:
            response = self._make_request("/v2/shopping/flight-offers", params)
            return self._format_branded_fares_response(response)
        except Exception as e:
            logger.error(f"Branded fares search failed: {e}")
            return {"error": str(e), "fares": []}
    
    def _format_flight_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Format flight search response"""
        logger.info(f"[AMADEUS] Raw API response received: {len(response.get('data', []))} offers")
        
        # Validate response structure
        if not response.get("data"):
            logger.warning("[AMADEUS] No 'data' field in response")
            return {"flights": [], "count": 0, "error": "No flight data in response"}
        
        # Log first offer structure for debugging
        if response.get("data"):
            first_offer = response["data"][0]
            logger.info(f"[AMADEUS] First offer structure: {json.dumps(first_offer, indent=2, default=str)}")
            
            # Validate required fields
            if not first_offer.get("price", {}).get("total"):
                logger.warning("[AMADEUS] Missing price information in first offer")
            if not first_offer.get("itineraries"):
                logger.warning("[AMADEUS] Missing itineraries in first offer")
        
        flights = []
        for i, offer in enumerate(response.get("data", [])):
            price_obj = offer.get('price', {})
            price_total = price_obj.get('total')
            price_currency = price_obj.get('currency')
            logger.info(f"[AMADEUS] Processing offer {i+1}: ID={offer.get('id')}, Price={price_total} {price_currency}")
            logger.info(f"[AMADEUS] CURRENCY CHECK: Offer {i+1} - Original currency from API: {price_currency}")
            
            flight_info = {
                "id": offer.get("id"),
                "price": price_total,
                "currency": price_currency,
                "itineraries": []
            }
            
            for j, itinerary in enumerate(offer.get("itineraries", [])):
                logger.info(f"[AMADEUS] Processing itinerary {j+1}: Duration={itinerary.get('duration')}, Segments={len(itinerary.get('segments', []))}")
                
                segments = []
                for k, segment in enumerate(itinerary.get("segments", [])):
                    # Extract flight number and carrier code correctly
                    carrier_code = segment.get("carrierCode", "")
                    flight_number = segment.get("number", "")
                    
                    segment_info = {
                        "departure": {
                            "airport": segment.get("departure", {}).get("iataCode"),
                            "time": segment.get("departure", {}).get("at")
                        },
                        "arrival": {
                            "airport": segment.get("arrival", {}).get("iataCode"),
                            "time": segment.get("arrival", {}).get("at")
                        },
                        "airline": carrier_code,
                        "flight_number": flight_number,
                        "duration": segment.get("duration")
                    }
                    
                    logger.info(f"[AMADEUS] Segment {k+1}: {segment_info['departure']['airport']} {segment_info['departure']['time']} -> {segment_info['arrival']['airport']} {segment_info['arrival']['time']} ({carrier_code} {flight_number})")
                    segments.append(segment_info)
                
                flight_info["itineraries"].append({
                    "duration": itinerary.get("duration"),
                    "segments": segments
                })
            
            flights.append(flight_info)
            logger.info(f"[AMADEUS] Formatted flight {i+1}: Price={flight_info['price']} {flight_info['currency']}, Itineraries={len(flight_info['itineraries'])}")
        
        # Log currency summary
        currencies = [f.get('currency') for f in flights if f.get('currency')]
        if currencies:
            unique_currencies = list(set(currencies))
            logger.info(f"[AMADEUS] CURRENCY SUMMARY: Found {len(unique_currencies)} unique currency(ies): {unique_currencies}")
        
        result = {"flights": flights, "count": len(flights)}
        logger.info(f"[AMADEUS] Final formatted result: {len(flights)} flights")
        return result
    
    def _format_inspiration_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Format flight inspiration response"""
        destinations = []
        for dest in response.get("data", []):
            destinations.append({
                "destination": dest.get("destination"),
                "price": dest.get("price", {}).get("total"),
                "currency": dest.get("price", {}).get("currency"),
                "departure_date": dest.get("departureDate"),
                "return_date": dest.get("returnDate")
            })
        
        return {"destinations": destinations, "count": len(destinations)}
    
    def _format_hotel_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Format hotel search response"""
        logger.info(f"[AMADEUS] Formatting hotel response, response keys: {list(response.keys()) if isinstance(response, dict) else 'not a dict'}")
        
        hotels = []
        data = response.get("data", [])
        logger.info(f"[AMADEUS] Hotel response data type: {type(data)}, length: {len(data) if isinstance(data, list) else 'N/A'}")
        
        if not data:
            logger.warning(f"[AMADEUS] No hotel data in response. Full response: {response}")
            return {"hotels": [], "count": 0}
        
        for offer in data:
            hotel_data = offer.get("hotel", {})
            geo_code = hotel_data.get("geoCode", {})
            
            # Get all offers and compare prices to find minimum
            offers = offer.get("offers", [])
            if not offers:
                continue
            
            # Compare all offers to find minimum and maximum prices
            all_prices = []
            all_prices_per_night = []
            check_in_str = offers[0].get("checkInDate")
            check_out_str = offers[0].get("checkOutDate")
            nights = 1
            
            # Calculate nights from first offer (all offers should have same dates)
            if check_in_str and check_out_str:
                try:
                    from datetime import datetime
                    check_in_date = datetime.strptime(check_in_str, "%Y-%m-%d")
                    check_out_date = datetime.strptime(check_out_str, "%Y-%m-%d")
                    nights = (check_out_date - check_in_date).days
                    if nights <= 0:
                        nights = 1
                except Exception as e:
                    logger.warning(f"[AMADEUS] Could not calculate nights from dates: {e}")
                    nights = 1
            
            # Extract prices from all offers
            for offer_item in offers:
                price_info = offer_item.get("price", {})
                total_price = price_info.get("total")
                if total_price:
                    try:
                        total_price_float = float(total_price)
                        all_prices.append(total_price_float)
                        price_per_night = total_price_float / nights if nights > 0 else total_price_float
                        all_prices_per_night.append(price_per_night)
                    except (ValueError, TypeError):
                        pass
            
            if not all_prices:
                continue
            
            # Find minimum and maximum prices
            min_total_price = min(all_prices)
            max_total_price = max(all_prices)
            min_price_per_night = min(all_prices_per_night)
            max_price_per_night = max(all_prices_per_night)
            
            # Use minimum price as the displayed price
            real_price = min_total_price
            price_per_night = min_price_per_night
            
            # Get currency from first offer
            price_info = offers[0].get("price", {})
            currency = price_info.get("currency", "USD")
            
            hotel_info = {
                "hotel_id": hotel_data.get("hotelId"),
                "name": hotel_data.get("name"),
                "rating": hotel_data.get("rating"),
                "price": real_price,  # Minimum total price for entire stay (real bookable price from Amadeus)
                "price_per_night": round(price_per_night, 2) if isinstance(price_per_night, (int, float)) else price_per_night,  # Minimum price per night (calculated)
                "price_min": round(min_price_per_night, 2),  # Minimum price per night
                "price_max": round(max_price_per_night, 2),  # Maximum price per night
                "price_range": f"${round(min_price_per_night, 2)} - ${round(max_price_per_night, 2)}" if min_price_per_night != max_price_per_night else f"${round(min_price_per_night, 2)}",
                "nights": nights,  # Number of nights
                "currency": currency,
                "price_type": "real",  # Mark as real price, not estimate
                "offers_count": len(offers),  # Number of offers available
                "check_in": check_in_str,
                "check_out": check_out_str,
                "latitude": geo_code.get("latitude") if geo_code else None,
                "longitude": geo_code.get("longitude") if geo_code else None,
                "location": hotel_data.get("address", {}).get("cityName") or hotel_data.get("name", ""),
                "distance": 0  # Default distance, could be calculated if needed
            }
            hotels.append(hotel_info)
            if min_price_per_night != max_price_per_night:
                logger.info(f"[AMADEUS] Added hotel: {hotel_info.get('name')} (From ${min_price_per_night:.2f}/night, range: ${min_price_per_night:.2f}-${max_price_per_night:.2f} {currency}, {len(offers)} offers, {nights} nights)")
            else:
                logger.info(f"[AMADEUS] Added hotel: {hotel_info.get('name')} (${min_price_per_night:.2f}/night {currency}, {len(offers)} offers, {nights} nights)")
        
        logger.info(f"[AMADEUS] Formatted {len(hotels)} hotels")
        return {"hotels": hotels, "count": len(hotels)}
    
    def _format_hotel_v3_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Format hotel search response from v3 API with detailed pricing"""
        logger.info(f"[AMADEUS] Formatting hotel v3 response, response keys: {list(response.keys()) if isinstance(response, dict) else 'not a dict'}")
        
        hotels = []
        data = response.get("data", [])
        
        if not data:
            logger.warning(f"[AMADEUS] No hotel data in v3 response")
            return {"hotels": [], "count": 0}
        
        for hotel_offers in data:
            hotel_data = hotel_offers.get("hotel", {})
            offers = hotel_offers.get("offers", [])
            
            if not offers:
                continue
            
            # Compare all offers to find minimum and maximum prices
            all_prices = []
            all_prices_per_night = []
            all_selling_totals = []
            check_in_str = offers[0].get("checkInDate")
            check_out_str = offers[0].get("checkOutDate")
            nights = 1
            
            # Calculate nights from first offer
            if check_in_str and check_out_str:
                try:
                    from datetime import datetime
                    check_in_date = datetime.strptime(check_in_str, "%Y-%m-%d")
                    check_out_date = datetime.strptime(check_out_str, "%Y-%m-%d")
                    nights = (check_out_date - check_in_date).days
                    if nights <= 0:
                        nights = 1
                except Exception as e:
                    logger.warning(f"[AMADEUS] Could not calculate nights from dates (v3): {e}")
                    nights = 1
            
            # Extract prices from all offers
            best_offer = None
            for offer_item in offers:
                price_info = offer_item.get("price", {})
                selling_total = price_info.get("sellingTotal")
                total_price = price_info.get("total")
                
                # Use sellingTotal if available, otherwise total
                price_to_use = selling_total if selling_total else total_price
                
                if price_to_use:
                    try:
                        price_float = float(price_to_use)
                        all_selling_totals.append(price_float)
                        price_per_night = price_float / nights if nights > 0 else price_float
                        all_prices_per_night.append(price_per_night)
                        
                        # Track the offer with minimum price
                        if best_offer is None or price_float < float(best_offer.get("price", {}).get("sellingTotal") or best_offer.get("price", {}).get("total") or float('inf')):
                            best_offer = offer_item
                    except (ValueError, TypeError):
                        pass
            
            if not all_selling_totals:
                continue
            
            # Find minimum and maximum prices
            min_price = min(all_selling_totals)
            max_price = max(all_selling_totals)
            min_price_per_night = min(all_prices_per_night)
            max_price_per_night = max(all_prices_per_night)
            
            # Use minimum price as the displayed price
            real_price = min_price
            price_per_night = min_price_per_night
            
            # Get detailed info from best offer
            offer = best_offer
            price_info = offer.get("price", {})
            base_price = price_info.get("base")
            total_price = price_info.get("total")
            selling_total = price_info.get("sellingTotal")
            taxes = price_info.get("taxes", [])
            markups = price_info.get("markups", [])
            
            hotel_info = {
                "hotel_id": hotel_data.get("hotelId"),
                "name": hotel_data.get("name"),
                "chain_code": hotel_data.get("chainCode"),
                "city_code": hotel_data.get("cityCode"),
                "latitude": hotel_data.get("latitude"),
                "longitude": hotel_data.get("longitude"),
                "price": real_price,  # Minimum total price for entire stay (real bookable price)
                "price_per_night": round(price_per_night, 2) if isinstance(price_per_night, (int, float)) else price_per_night,  # Minimum price per night (calculated)
                "price_min": round(min_price_per_night, 2),  # Minimum price per night
                "price_max": round(max_price_per_night, 2),  # Maximum price per night
                "price_range": f"${round(min_price_per_night, 2)} - ${round(max_price_per_night, 2)}" if min_price_per_night != max_price_per_night else f"${round(min_price_per_night, 2)}",
                "nights": nights,  # Number of nights
                "base_price": base_price,  # Base price before taxes (from best offer)
                "total_price": total_price,  # Total with taxes (from best offer)
                "selling_total": selling_total,  # Final price with all fees (from best offer)
                "currency": price_info.get("currency"),
                "price_type": "real",  # Real bookable price from v3 API
                "taxes": [{"amount": t.get("amount"), "currency": t.get("currency"), "code": t.get("code")} for t in taxes],
                "markups": [{"amount": m.get("amount")} for m in markups],
                "offer_id": offer.get("id"),  # Can be used for get_hotel_offer_pricing
                "offers_count": len(offers),  # Number of offers available
                "check_in": check_in_str,
                "check_out": check_out_str,
                "room_type": offer.get("room", {}).get("type"),
                "rate_code": offer.get("rateCode"),
                "board_type": offer.get("boardType"),
                "payment_type": offer.get("policies", {}).get("paymentType"),
                "available": hotel_offers.get("available", True),
                "self": offer.get("self")  # Link to refresh pricing
            }
            hotels.append(hotel_info)
            if min_price_per_night != max_price_per_night:
                logger.info(f"[AMADEUS] Added hotel v3: {hotel_info.get('name')} (From ${min_price_per_night:.2f}/night, range: ${min_price_per_night:.2f}-${max_price_per_night:.2f} {hotel_info.get('currency')}, {len(offers)} offers, {nights} nights)")
            else:
                logger.info(f"[AMADEUS] Added hotel v3: {hotel_info.get('name')} (${min_price_per_night:.2f}/night {hotel_info.get('currency')}, {len(offers)} offers, {nights} nights, base: {base_price})")
        
        logger.info(f"[AMADEUS] Formatted {len(hotels)} hotels from v3 API")
        return {"hotels": hotels, "count": len(hotels)}
    
    def _format_hotel_offer_pricing_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Format hotel offer pricing response from v3 API"""
        data = response.get("data", {})
        
        if not data:
            return {"error": "No offer data found", "offer": None}
        
        hotel_data = data.get("hotel", {})
        offers = data.get("offers", [])
        
        if not offers:
            return {"error": "No offers found", "offer": None}
        
        # Get the first offer (usually the best one)
        offer = offers[0]
        price_info = offer.get("price", {})
        
        formatted_offer = {
            "offer_id": offer.get("id"),
            "hotel": {
                "hotel_id": hotel_data.get("hotelId"),
                "name": hotel_data.get("name"),
                "chain_code": hotel_data.get("chainCode"),
                "city_code": hotel_data.get("cityCode")
            },
            "check_in": offer.get("checkInDate"),
            "check_out": offer.get("checkOutDate"),
            "pricing": {
                "currency": price_info.get("currency"),
                "base": price_info.get("base"),
                "total": price_info.get("total"),
                "selling_total": price_info.get("sellingTotal"),
                "taxes": price_info.get("taxes", []),
                "markups": price_info.get("markups", []),
                "variations": price_info.get("variations", {})
            },
            "room": offer.get("room", {}),
            "policies": offer.get("policies", {}),
            "available": data.get("available", True),
            "price_type": "real"  # Most accurate real-time price
        }
        
        return {"offer": formatted_offer, "count": 1}
    
    def _format_activity_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """
        Format activity search response according to Swagger spec
        Handles both list responses and single activity responses
        """
        activities = []
        data = response.get("data", [])
        
        # Handle both array and single object responses
        if isinstance(data, list):
            activity_list = data
        else:
            activity_list = [data] if data else []
        
        for activity in activity_list:
            # Extract price information
            price_info = activity.get("price", {})
            
            # Extract geoCode information
            geo_code = activity.get("geoCode", {})
            
            # Handle pictures - according to Swagger spec, it's an array of strings (URLs)
            pictures = activity.get("pictures", [])
            if pictures and isinstance(pictures[0], dict):
                # If it's an array of objects, extract URLs
                pictures = [pic.get("url") or pic for pic in pictures]
            
            activity_data = {
                "id": activity.get("id"),
                "type": activity.get("type", "activity"),
                "name": activity.get("name"),
                "shortDescription": activity.get("shortDescription"),
                "description": activity.get("description"),  # Full description
                "price": {
                    "amount": price_info.get("amount"),
                    "currencyCode": price_info.get("currencyCode")
                },
                "rating": activity.get("rating"),
                "pictures": pictures if isinstance(pictures, list) else [],
                "geoCode": {
                    "latitude": geo_code.get("latitude"),
                    "longitude": geo_code.get("longitude")
                } if geo_code else None,
                "minimumDuration": activity.get("minimumDuration"),
                "bookingLink": activity.get("bookingLink"),
                "self": activity.get("self", {})  # Link to get more details
            }
            
            activities.append(activity_data)
        
        # Include meta information if available
        result = {
            "activities": activities,
            "count": len(activities)
        }
        
        if "meta" in response:
            result["meta"] = response["meta"]
        
        if "warnings" in response:
            result["warnings"] = response["warnings"]
        
        return result
    
    def _format_single_activity_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """
        Format single activity detail response
        """
        activity = response.get("data", {})
        
        if not activity:
            return {"error": "No activity data found", "activity": None}
        
        # Extract price information
        price_info = activity.get("price", {})
        
        # Extract geoCode information
        geo_code = activity.get("geoCode", {})
        
        # Handle pictures - according to Swagger spec, it's an array of strings (URLs)
        pictures = activity.get("pictures", [])
        if pictures and isinstance(pictures[0], dict):
            # If it's an array of objects, extract URLs
            pictures = [pic.get("url") or pic for pic in pictures]
        
        formatted_activity = {
            "id": activity.get("id"),
            "type": activity.get("type", "activity"),
            "name": activity.get("name"),
            "shortDescription": activity.get("shortDescription"),
            "description": activity.get("description"),  # Full description
            "price": {
                "amount": price_info.get("amount"),
                "currencyCode": price_info.get("currencyCode")
            },
            "rating": activity.get("rating"),
            "pictures": pictures if isinstance(pictures, list) else [],
            "geoCode": {
                "latitude": geo_code.get("latitude"),
                "longitude": geo_code.get("longitude")
            } if geo_code else None,
            "minimumDuration": activity.get("minimumDuration"),
            "bookingLink": activity.get("bookingLink"),
            "self": activity.get("self", {})
        }
        
        result = {
            "activity": formatted_activity,
            "count": 1
        }
        
        if "meta" in response:
            result["meta"] = response["meta"]
        
        if "warnings" in response:
            result["warnings"] = response["warnings"]
        
        return result
    
    def _format_location_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Format location search response"""
        locations = []
        for location in response.get("data", []):
            # Extract geoCode if available (for coordinates)
            geo_code = location.get("geoCode", {})
            location_data = {
                "code": location.get("iataCode"),
                "name": location.get("name"),
                "type": location.get("subType"),
                "city": location.get("address", {}).get("cityName"),
                "country": location.get("address", {}).get("countryName")
            }
            
            # Add coordinates if available
            if geo_code:
                location_data["geoCode"] = {
                    "latitude": geo_code.get("latitude"),
                    "longitude": geo_code.get("longitude")
                }
            
            locations.append(location_data)
        
        return {"locations": locations, "count": len(locations)}
    
    def _format_cheapest_dates_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Format cheapest dates response"""
        dates = []
        for date_info in response.get("data", []):
            dates.append({
                "date": date_info.get("date"),
                "price": date_info.get("price", {}).get("total"),
                "currency": date_info.get("price", {}).get("currency")
            })
        
        return {"dates": dates, "count": len(dates)}

    def _format_price_analysis_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Format flight price analysis response"""
        data = response.get("data", {})
        return {
            "analysis": {
                "priceMetrics": data.get("priceMetrics", {}),
                "priceAnalysis": {
                    "minPrice": data.get("priceMetrics", {}).get("lowestPrice", {}),
                    "maxPrice": data.get("priceMetrics", {}).get("highestPrice", {}),
                    "averagePrice": data.get("priceMetrics", {}).get("averagePrice", {}),
                    "medianPrice": data.get("priceMetrics", {}).get("medianPrice", {})
                },
                "priceVariability": data.get("priceVariability", {}),
                "recommendations": self._generate_price_recommendations(data)
            },
            "count": 1
        }

    def _format_choice_prediction_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Format flight choice prediction response"""
        predictions = []
        for item in response.get("data", []):
            predictions.append({
                "flightOffer": item.get("flightOffer", {}),
                "predictionScore": item.get("predictionScore", 0),
                "recommendation": self._interpret_prediction_score(item.get("predictionScore", 0))
            })
        
        return {"predictions": predictions, "count": len(predictions)}

    def _format_delay_prediction_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Format flight delay prediction response"""
        data = response.get("data", {})
        return {
            "prediction": {
                "probability": data.get("probability", 0),
                "predictedDelay": data.get("predictedDelay", 0),
                "riskLevel": self._get_delay_risk_level(data.get("probability", 0)),
                "recommendations": self._generate_delay_recommendations(data)
            },
            "count": 1
        }

    def _format_seatmap_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Format seatmap response"""
        seatmaps = []
        for item in response.get("data", []):
            seatmaps.append({
                "flightOfferId": item.get("flightOfferId"),
                "segments": item.get("segments", []),
                "seatMap": item.get("seatMap", {})
            })
        
        return {"seatmaps": seatmaps, "count": len(seatmaps)}

    def _format_branded_fares_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Format branded fares response"""
        # Similar to flight response but includes fare options
        return self._format_flight_response(response)

    def _generate_price_recommendations(self, data: Dict[str, Any]) -> List[str]:
        """Generate price recommendations based on analysis"""
        recommendations = []
        price_metrics = data.get("priceMetrics", {})
        
        if price_metrics.get("lowestPrice", {}).get("price"):
            recommendations.append(f"Best price: {price_metrics['lowestPrice']['price']} {price_metrics['lowestPrice'].get('currency', 'USD')}")
        
        # Add more recommendation logic based on price trends
        return recommendations

    def _interpret_prediction_score(self, score: float) -> str:
        """Interpret prediction score for user recommendations"""
        if score >= 0.8:
            return "Highly recommended based on your preferences"
        elif score >= 0.6:
            return "Good match for your preferences"
        elif score >= 0.4:
            return "Moderate match"
        else:
            return "May not fully match your preferences"

    def _get_delay_risk_level(self, probability: float) -> str:
        """Get delay risk level from probability"""
        if probability >= 0.7:
            return "HIGH"
        elif probability >= 0.4:
            return "MEDIUM"
        else:
            return "LOW"

    def _generate_delay_recommendations(self, data: Dict[str, Any]) -> List[str]:
        """Generate recommendations based on delay prediction"""
        recommendations = []
        probability = data.get("probability", 0)
        
        if probability >= 0.7:
            recommendations.append("⚠️ High delay risk - consider booking flexible tickets or alternative flights")
        elif probability >= 0.4:
            recommendations.append("⚠️ Moderate delay risk - allow extra time for connections")
        else:
            recommendations.append("✅ Low delay risk - flight should be on time")
        
        return recommendations
    
    # ==================== AIRLINE APIs ====================
    
    def get_airline_code_lookup(self, airline_code: str = None, airline_name: str = None) -> Dict[str, Any]:
        """
        Lookup airline information by code or name
        API: /v1/reference-data/airlines
        """
        params = {}
        if airline_code:
            params["airlineCodes"] = airline_code
        if airline_name:
            params["keyword"] = airline_name
        
        try:
            response = self._make_request("/v1/reference-data/airlines", params)
            return self._format_airline_response(response)
        except Exception as e:
            logger.error(f"Airline code lookup failed: {e}")
            return {"error": str(e), "airlines": []}
    
    def get_airline_routes(self, airline_code: str) -> Dict[str, Any]:
        """
        Get routes for a specific airline
        API: /v1/airport/direct-destinations
        """
        params = {"airlineCodes": airline_code}
        
        try:
            response = self._make_request("/v1/airport/direct-destinations", params)
            return self._format_airline_routes_response(response)
        except Exception as e:
            logger.error(f"Airline routes lookup failed: {e}")
            return {"error": str(e), "routes": []}
    
    # ==================== AIRPORT APIs ====================
    
    def get_airport_nearest_relevant(self, latitude: float, longitude: float, radius: int = 500) -> Dict[str, Any]:
        """
        Get nearest relevant airports to coordinates
        API: /v1/reference-data/locations/airports
        """
        params = {
            "latitude": latitude,
            "longitude": longitude,
            "radius": radius
        }
        
        try:
            response = self._make_request("/v1/reference-data/locations/airports", params)
            return self._format_airport_response(response)
        except Exception as e:
            logger.error(f"Airport nearest relevant failed: {e}")
            return {"error": str(e), "airports": []}
    
    def get_airport_on_time_performance(self, airport_code: str, date: str) -> Dict[str, Any]:
        """
        Get airport on-time performance statistics
        API: /v1/airport/predictions/on-time
        """
        params = {
            "airportCode": airport_code,
            "date": date
        }
        
        try:
            response = self._make_request("/v1/airport/predictions/on-time", params)
            return self._format_on_time_performance_response(response)
        except Exception as e:
            logger.error(f"Airport on-time performance failed: {e}")
            return {"error": str(e), "performance": None}
    
    def get_airport_routes(self, airport_code: str) -> Dict[str, Any]:
        """
        Get routes from/to an airport
        API: /v1/airport/direct-destinations
        """
        params = {"departureAirportCode": airport_code}
        
        try:
            response = self._make_request("/v1/airport/direct-destinations", params)
            return self._format_airport_routes_response(response)
        except Exception as e:
            logger.error(f"Airport routes lookup failed: {e}")
            return {"error": str(e), "routes": []}
    
    # ==================== CITY APIs ====================
    
    def get_city_search(self, keyword: str) -> Dict[str, Any]:
        """
        Search for cities
        API: /v1/reference-data/locations
        """
        params = {"keyword": keyword, "subType": "CITY"}
        
        try:
            response = self._make_request("/v1/reference-data/locations", params)
            return self._format_city_response(response)
        except Exception as e:
            logger.error(f"City search failed: {e}")
            return {"error": str(e), "cities": []}
    
    # ==================== FLIGHT APIs (Additional) ====================
    
    def get_flight_busiest_traveling_period(self, origin: str, destination: str, 
                                             period: str = "2024") -> Dict[str, Any]:
        """
        Get busiest traveling periods for a route
        API: /v1/travel/analytics/air-traffic/busiest-period
        """
        params = {
            "originCityCode": origin,
            "destinationCityCode": destination,
            "period": period
        }
        
        try:
            response = self._make_request("/v1/travel/analytics/air-traffic/busiest-period", params)
            return self._format_busiest_period_response(response)
        except Exception as e:
            logger.error(f"Flight busiest traveling period failed: {e}")
            return {"error": str(e), "periods": []}
    
    def get_flight_checkin_links(self, airline_code: str) -> Dict[str, Any]:
        """
        Get check-in links for an airline
        API: /v1/reference-data/airlines
        """
        params = {"airlineCodes": airline_code}
        
        try:
            # Note: This might need to be combined with airline lookup
            response = self._make_request("/v1/reference-data/airlines", params)
            return self._format_checkin_links_response(response)
        except Exception as e:
            logger.error(f"Flight check-in links failed: {e}")
            return {"error": str(e), "links": []}
    
    def create_flight_order(self, flight_offer_data: Dict[str, Any], 
                            traveler_data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Create a flight order/booking
        API: /v1/booking/flight-orders
        """
        payload = {
            "data": {
                "type": "flight-order",
                "flightOffers": [flight_offer_data],
                "travelers": traveler_data
            }
        }
        
        try:
            token = self._get_access_token()
            response = requests.post(
                f"{self.base_url}/v1/booking/flight-orders",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json"
                },
                json=payload,
                timeout=30
            )
            response.raise_for_status()
            result = response.json()
            return self._format_flight_order_response(result)
        except Exception as e:
            logger.error(f"Flight order creation failed: {e}")
            return {"error": str(e), "order": None}
    
    def get_flight_most_booked_destinations(self, origin: str, period: str = "2024") -> Dict[str, Any]:
        """
        Get most booked destinations from an origin
        API: /v1/travel/analytics/air-traffic/booked
        """
        params = {
            "originCityCode": origin,
            "period": period
        }
        
        try:
            response = self._make_request("/v1/travel/analytics/air-traffic/booked", params)
            return self._format_most_booked_response(response)
        except Exception as e:
            logger.error(f"Flight most booked destinations failed: {e}")
            return {"error": str(e), "destinations": []}
    
    def get_flight_most_traveled_destinations(self, origin: str, period: str = "2024") -> Dict[str, Any]:
        """
        Get most traveled destinations from an origin
        API: /v1/travel/analytics/air-traffic/traveled
        """
        params = {
            "originCityCode": origin,
            "period": period
        }
        
        try:
            response = self._make_request("/v1/travel/analytics/air-traffic/traveled", params)
            return self._format_most_traveled_response(response)
        except Exception as e:
            logger.error(f"Flight most traveled destinations failed: {e}")
            return {"error": str(e), "destinations": []}
    
    def get_flight_offers_price(self, flight_offer_id: str) -> Dict[str, Any]:
        """
        Get price for a specific flight offer
        API: /v1/shopping/flight-offers/pricing
        """
        payload = {
            "data": {
                "type": "flight-offers-pricing",
                "flightOffers": [{"id": flight_offer_id}]
            }
        }
        
        try:
            token = self._get_access_token()
            response = requests.post(
                f"{self.base_url}/v1/shopping/flight-offers/pricing",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json"
                },
                json=payload,
                timeout=30
            )
            response.raise_for_status()
            result = response.json()
            return self._format_flight_price_response(result)
        except Exception as e:
            logger.error(f"Flight offers price failed: {e}")
            return {"error": str(e), "price": None}
    
    def get_flight_order(self, order_id: str) -> Dict[str, Any]:
        """
        Get flight order details
        API: /v1/booking/flight-orders/{orderId}
        """
        try:
            response = self._make_request(f"/v1/booking/flight-orders/{order_id}", {})
            return self._format_flight_order_response(response)
        except Exception as e:
            logger.error(f"Flight order retrieval failed: {e}")
            return {"error": str(e), "order": None}
    
    def delete_flight_order(self, order_id: str) -> Dict[str, Any]:
        """
        Delete/cancel a flight order
        API: /v1/booking/flight-orders/{orderId}
        """
        try:
            token = self._get_access_token()
            response = requests.delete(
                f"{self.base_url}/v1/booking/flight-orders/{order_id}",
                headers={"Authorization": f"Bearer {token}"},
                timeout=30
            )
            response.raise_for_status()
            return {"success": True, "message": "Order cancelled successfully"}
        except Exception as e:
            logger.error(f"Flight order deletion failed: {e}")
            return {"error": str(e), "success": False}
    
    def get_on_demand_flight_status(self, carrier_code: str, flight_number: str, 
                                     scheduled_departure_date: str) -> Dict[str, Any]:
        """
        Get real-time flight status
        API: /v2/schedule/flights
        """
        params = {
            "carrierCode": carrier_code,
            "flightNumber": flight_number,
            "scheduledDepartureDate": scheduled_departure_date
        }
        
        try:
            response = self._make_request("/v2/schedule/flights", params)
            return self._format_flight_status_response(response)
        except Exception as e:
            logger.error(f"On demand flight status failed: {e}")
            return {"error": str(e), "status": None}
    
    # ==================== HOTEL APIs (Additional) ====================
    
    def get_hotel_list(self, city_code: str, hotel_ids: List[str] = None) -> Dict[str, Any]:
        """
        Get list of hotels by city or hotel IDs
        API: /v1/reference-data/locations/hotels/by-city or /v1/reference-data/locations/hotels/by-hotels
        """
        if hotel_ids:
            params = {"hotelIds": ",".join(hotel_ids)}
            endpoint = "/v1/reference-data/locations/hotels/by-hotels"
        else:
            params = {"cityCode": city_code}
            endpoint = "/v1/reference-data/locations/hotels/by-city"
        
        try:
            response = self._make_request(endpoint, params)
            return self._format_hotel_list_response(response)
        except Exception as e:
            logger.error(f"Hotel list failed: {e}")
            return {"error": str(e), "hotels": []}
    
    def get_hotel_name_autocomplete(self, keyword: str) -> Dict[str, Any]:
        """
        Autocomplete hotel names
        API: /v1/reference-data/locations/hotels/by-keyword
        """
        params = {"keyword": keyword}
        
        try:
            response = self._make_request("/v1/reference-data/locations/hotels/by-keyword", params)
            return self._format_hotel_autocomplete_response(response)
        except Exception as e:
            logger.error(f"Hotel name autocomplete failed: {e}")
            return {"error": str(e), "hotels": []}
    
    def get_hotel_ratings(self, hotel_ids: List[str]) -> Dict[str, Any]:
        """
        Get hotel ratings
        API: /v2/e-reputation/hotel-sentiments
        """
        params = {"hotelIds": ",".join(hotel_ids)}
        
        try:
            response = self._make_request("/v2/e-reputation/hotel-sentiments", params)
            return self._format_hotel_ratings_response(response)
        except Exception as e:
            logger.error(f"Hotel ratings failed: {e}")
            return {"error": str(e), "ratings": []}
    
    def create_hotel_booking(self, offer_id: str, guests: List[Dict[str, Any]], 
                              payments: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Create a hotel booking
        API: /v3/booking/hotel-bookings
        """
        payload = {
            "data": {
                "type": "hotel-booking",
                "offerId": offer_id,
                "guests": guests,
                "payments": payments
            }
        }
        
        try:
            token = self._get_access_token()
            response = requests.post(
                f"{self.base_url}/v3/booking/hotel-bookings",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json"
                },
                json=payload,
                timeout=30
            )
            response.raise_for_status()
            result = response.json()
            return self._format_hotel_booking_response(result)
        except Exception as e:
            logger.error(f"Hotel booking failed: {e}")
            return {"error": str(e), "booking": None}
    
    # ==================== TRANSFER APIs ====================
    
    def search_transfers(self, origin_lat: float, origin_lon: float,
                        destination_lat: float, destination_lon: float,
                        departure_date: str, adults: int = 1) -> Dict[str, Any]:
        """
        Search for transfer options
        API: /v1/shopping/transfer-offers
        """
        params = {
            "originLatitude": origin_lat,
            "originLongitude": origin_lon,
            "destinationLatitude": destination_lat,
            "destinationLongitude": destination_lon,
            "departureDate": departure_date,
            "adults": adults
        }
        
        try:
            response = self._make_request("/v1/shopping/transfer-offers", params)
            return self._format_transfer_search_response(response)
        except Exception as e:
            logger.error(f"Transfer search failed: {e}")
            return {"error": str(e), "transfers": []}
    
    def create_transfer_booking(self, offer_id: str, passengers: List[Dict[str, Any]],
                                payment: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a transfer booking
        API: /v1/booking/transfer-bookings
        """
        payload = {
            "data": {
                "type": "transfer-booking",
                "offerId": offer_id,
                "passengers": passengers,
                "payment": payment
            }
        }
        
        try:
            token = self._get_access_token()
            response = requests.post(
                f"{self.base_url}/v1/booking/transfer-bookings",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json"
                },
                json=payload,
                timeout=30
            )
            response.raise_for_status()
            result = response.json()
            return self._format_transfer_booking_response(result)
        except Exception as e:
            logger.error(f"Transfer booking failed: {e}")
            return {"error": str(e), "booking": None}
    
    def get_transfer_booking(self, booking_id: str) -> Dict[str, Any]:
        """
        Get transfer booking details
        API: /v1/booking/transfer-bookings/{bookingId}
        """
        try:
            response = self._make_request(f"/v1/booking/transfer-bookings/{booking_id}", {})
            return self._format_transfer_booking_response(response)
        except Exception as e:
            logger.error(f"Transfer booking retrieval failed: {e}")
            return {"error": str(e), "booking": None}
    
    def cancel_transfer_booking(self, booking_id: str) -> Dict[str, Any]:
        """
        Cancel a transfer booking
        API: /v1/booking/transfer-bookings/{bookingId}
        """
        try:
            token = self._get_access_token()
            response = requests.delete(
                f"{self.base_url}/v1/booking/transfer-bookings/{booking_id}",
                headers={"Authorization": f"Bearer {token}"},
                timeout=30
            )
            response.raise_for_status()
            return {"success": True, "message": "Transfer booking cancelled successfully"}
        except Exception as e:
            logger.error(f"Transfer booking cancellation failed: {e}")
            return {"error": str(e), "success": False}
    
    # ==================== TRAVEL APIs ====================
    
    def get_travel_recommendations(self, origin: str, destination: str = None) -> Dict[str, Any]:
        """
        Get travel recommendations
        API: /v1/reference-data/recommended-locations
        """
        params = {"cityCodes": origin}
        if destination:
            params["cityCodes"] = f"{origin},{destination}"
        
        try:
            response = self._make_request("/v1/reference-data/recommended-locations", params)
            return self._format_travel_recommendations_response(response)
        except Exception as e:
            logger.error(f"Travel recommendations failed: {e}")
            return {"error": str(e), "recommendations": []}
    
    def get_travel_restrictions(self, origin: str, destination: str) -> Dict[str, Any]:
        """
        Get travel restrictions between countries
        API: /v1/duty-of-care/diseases/covid19-area-report
        """
        params = {
            "countryCode": origin,
            "cityCode": destination
        }
        
        try:
            response = self._make_request("/v1/duty-of-care/diseases/covid19-area-report", params)
            return self._format_travel_restrictions_response(response)
        except Exception as e:
            logger.error(f"Travel restrictions failed: {e}")
            return {"error": str(e), "restrictions": None}
    
    def parse_trip(self, sentence: str) -> Dict[str, Any]:
        """
        Parse trip information from natural language
        API: /v3/travel/trip-parser
        """
        payload = {
            "data": {
                "type": "trip-parser",
                "text": sentence
            }
        }
        
        try:
            token = self._get_access_token()
            response = requests.post(
                f"{self.base_url}/v3/travel/trip-parser",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json"
                },
                json=payload,
                timeout=30
            )
            response.raise_for_status()
            result = response.json()
            return self._format_trip_parser_response(result)
        except Exception as e:
            logger.error(f"Trip parser failed: {e}")
            return {"error": str(e), "parsed": None}
    
    def get_trip_purpose_prediction(self, origin: str, destination: str,
                                    departure_date: str) -> Dict[str, Any]:
        """
        Predict trip purpose (business/leisure)
        API: /v2/travel/predictions/trip-purpose
        """
        params = {
            "originLocationCode": origin,
            "destinationLocationCode": destination,
            "departureDate": departure_date
        }
        
        try:
            response = self._make_request("/v2/travel/predictions/trip-purpose", params)
            return self._format_trip_purpose_response(response)
        except Exception as e:
            logger.error(f"Trip purpose prediction failed: {e}")
            return {"error": str(e), "prediction": None}
    
    # ==================== LOCATION APIs ====================
    
    def get_location_score(self, latitude: float, longitude: float) -> Dict[str, Any]:
        """
        Get location score/rating
        API: /v1/location/analytics/category-rated-areas
        """
        params = {
            "latitude": latitude,
            "longitude": longitude
        }
        
        try:
            response = self._make_request("/v1/location/analytics/category-rated-areas", params)
            return self._format_location_score_response(response)
        except Exception as e:
            logger.error(f"Location score failed: {e}")
            return {"error": str(e), "score": None}
    
    def get_points_of_interest(self, latitude: float, longitude: float,
                                radius: int = 2, categories: List[str] = None) -> Dict[str, Any]:
        """
        Get points of interest near coordinates
        API: /v1/reference-data/locations/pois
        """
        params = {
            "latitude": latitude,
            "longitude": longitude,
            "radius": radius
        }
        
        if categories:
            params["categories"] = ",".join(categories)
        
        try:
            response = self._make_request("/v1/reference-data/locations/pois", params)
            return self._format_poi_response(response)
        except Exception as e:
            logger.error(f"Points of interest failed: {e}")
            return {"error": str(e), "pois": []}
    
    # ==================== FORMATTING METHODS ====================
    
    def _format_airline_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Format airline lookup response"""
        airlines = []
        for airline in response.get("data", []):
            airlines.append({
                "code": airline.get("iataCode"),
                "name": airline.get("businessName") or airline.get("commonName"),
                "type": airline.get("type")
            })
        return {"airlines": airlines, "count": len(airlines)}
    
    def _format_airline_routes_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Format airline routes response"""
        routes = []
        for route in response.get("data", []):
            routes.append({
                "destination": route.get("iataCode"),
                "destination_name": route.get("name")
            })
        return {"routes": routes, "count": len(routes)}
    
    def _format_airport_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Format airport response"""
        airports = []
        for airport in response.get("data", []):
            airports.append({
                "code": airport.get("iataCode"),
                "name": airport.get("name"),
                "city": airport.get("address", {}).get("cityName"),
                "country": airport.get("address", {}).get("countryName"),
                "latitude": airport.get("geoCode", {}).get("latitude"),
                "longitude": airport.get("geoCode", {}).get("longitude")
            })
        return {"airports": airports, "count": len(airports)}
    
    def _format_on_time_performance_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Format on-time performance response"""
        data = response.get("data", {})
        return {
            "performance": {
                "airportCode": data.get("airportCode"),
                "date": data.get("date"),
                "onTimePercentage": data.get("onTimePercentage"),
                "averageDelay": data.get("averageDelay"),
                "totalFlights": data.get("totalFlights")
            },
            "count": 1
        }
    
    def _format_airport_routes_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Format airport routes response"""
        routes = []
        for route in response.get("data", []):
            routes.append({
                "destination": route.get("iataCode"),
                "destination_name": route.get("name")
            })
        return {"routes": routes, "count": len(routes)}
    
    def _format_city_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Format city search response"""
        cities = []
        for city in response.get("data", []):
            cities.append({
                "code": city.get("iataCode"),
                "name": city.get("name"),
                "country": city.get("address", {}).get("countryName"),
                "latitude": city.get("geoCode", {}).get("latitude"),
                "longitude": city.get("geoCode", {}).get("longitude")
            })
        return {"cities": cities, "count": len(cities)}
    
    def _format_busiest_period_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Format busiest period response"""
        periods = []
        for period in response.get("data", []):
            periods.append({
                "month": period.get("month"),
                "year": period.get("year"),
                "analytics": period.get("analytics", {})
            })
        return {"periods": periods, "count": len(periods)}
    
    def _format_checkin_links_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Format check-in links response"""
        links = []
        for airline in response.get("data", []):
            links.append({
                "airline_code": airline.get("iataCode"),
                "airline_name": airline.get("businessName"),
                "checkin_url": airline.get("checkinUrl")
            })
        return {"links": links, "count": len(links)}
    
    def _format_flight_order_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Format flight order response"""
        data = response.get("data", {})
        return {
            "order": {
                "id": data.get("id"),
                "type": data.get("type"),
                "associatedRecords": data.get("associatedRecords", []),
                "flightOffers": data.get("flightOffers", []),
                "travelers": data.get("travelers", []),
                "ticketingAgreement": data.get("ticketingAgreement", {})
            },
            "count": 1
        }
    
    def _format_most_booked_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Format most booked destinations response"""
        destinations = []
        for dest in response.get("data", []):
            destinations.append({
                "destination": dest.get("destination"),
                "analytics": dest.get("analytics", {})
            })
        return {"destinations": destinations, "count": len(destinations)}
    
    def _format_most_traveled_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Format most traveled destinations response"""
        destinations = []
        for dest in response.get("data", []):
            destinations.append({
                "destination": dest.get("destination"),
                "analytics": dest.get("analytics", {})
            })
        return {"destinations": destinations, "count": len(destinations)}
    
    def _format_flight_price_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Format flight price response"""
        data = response.get("data", {})
        return {
            "price": {
                "flightOffers": data.get("flightOffers", []),
                "bookingRequirements": data.get("bookingRequirements", {})
            },
            "count": 1
        }
    
    def _format_flight_status_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Format flight status response"""
        flights = []
        for flight in response.get("data", []):
            flights.append({
                "type": flight.get("type"),
                "scheduledDeparture": flight.get("scheduledDeparture", {}),
                "scheduledArrival": flight.get("scheduledArrival", {}),
                "carrierCode": flight.get("carrierCode"),
                "number": flight.get("number"),
                "aircraft": flight.get("aircraft", {}),
                "duration": flight.get("duration"),
                "stops": flight.get("stops", [])
            })
        return {"flights": flights, "count": len(flights)}
    
    def _format_hotel_list_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Format hotel list response"""
        hotels = []
        for hotel in response.get("data", []):
            hotels.append({
                "hotel_id": hotel.get("hotelId"),
                "name": hotel.get("name"),
                "rating": hotel.get("rating"),
                "address": hotel.get("address", {}),
                "geoCode": hotel.get("geoCode", {})
            })
        return {"hotels": hotels, "count": len(hotels)}
    
    def _format_hotel_autocomplete_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Format hotel autocomplete response"""
        hotels = []
        for hotel in response.get("data", []):
            hotels.append({
                "hotel_id": hotel.get("hotelId"),
                "name": hotel.get("name"),
                "iataCode": hotel.get("iataCode")
            })
        return {"hotels": hotels, "count": len(hotels)}
    
    def _format_hotel_ratings_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Format hotel ratings response"""
        ratings = []
        for rating in response.get("data", []):
            ratings.append({
                "hotelId": rating.get("hotelId"),
                "overallRating": rating.get("overallRating"),
                "sentiments": rating.get("sentiments", [])
            })
        return {"ratings": ratings, "count": len(ratings)}
    
    def _format_hotel_booking_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Format hotel booking response"""
        data = response.get("data", {})
        return {
            "booking": {
                "id": data.get("id"),
                "type": data.get("type"),
                "associatedRecords": data.get("associatedRecords", []),
                "hotel": data.get("hotel", {}),
                "offers": data.get("offers", []),
                "guests": data.get("guests", [])
            },
            "count": 1
        }
    
    def _format_transfer_search_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Format transfer search response"""
        transfers = []
        for transfer in response.get("data", []):
            transfers.append({
                "id": transfer.get("id"),
                "type": transfer.get("type"),
                "price": transfer.get("price", {}),
                "vehicle": transfer.get("vehicle", {}),
                "pickup": transfer.get("pickup", {}),
                "dropoff": transfer.get("dropoff", {})
            })
        return {"transfers": transfers, "count": len(transfers)}
    
    def _format_transfer_booking_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Format transfer booking response"""
        data = response.get("data", {})
        return {
            "booking": {
                "id": data.get("id"),
                "type": data.get("type"),
                "transfer": data.get("transfer", {}),
                "passengers": data.get("passengers", []),
                "payment": data.get("payment", {})
            },
            "count": 1
        }
    
    def _format_travel_recommendations_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Format travel recommendations response"""
        recommendations = []
        for rec in response.get("data", []):
            recommendations.append({
                "name": rec.get("name"),
                "geoCode": rec.get("geoCode", {}),
                "category": rec.get("category")
            })
        return {"recommendations": recommendations, "count": len(recommendations)}
    
    def _format_travel_restrictions_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Format travel restrictions response"""
        data = response.get("data", {})
        return {
            "restrictions": {
                "area": data.get("area", {}),
                "summary": data.get("summary", {}),
                "diseaseRiskLevel": data.get("diseaseRiskLevel"),
                "diseaseInfection": data.get("diseaseInfection", {}),
                "diseaseCases": data.get("diseaseCases", {}),
                "hotspots": data.get("hotspots", []),
                "areaAccessRestriction": data.get("areaAccessRestriction", {}),
                "areaPolicy": data.get("areaPolicy", {})
            },
            "count": 1
        }
    
    def _format_trip_parser_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Format trip parser response"""
        data = response.get("data", {})
        return {
            "parsed": {
                "type": data.get("type"),
                "text": data.get("text"),
                "extractedFields": data.get("extractedFields", {})
            },
            "count": 1
        }
    
    def _format_trip_purpose_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Format trip purpose prediction response"""
        data = response.get("data", {})
        return {
            "prediction": {
                "result": data.get("result"),
                "probability": data.get("probability"),
                "confidence": self._get_confidence_level(data.get("probability", 0))
            },
            "count": 1
        }
    
    def _format_location_score_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Format location score response"""
        areas = []
        for area in response.get("data", []):
            areas.append({
                "name": area.get("name"),
                "geoCode": area.get("geoCode", {}),
                "categoryScores": area.get("categoryScores", {})
            })
        return {"areas": areas, "count": len(areas)}
    
    def _format_poi_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Format points of interest response"""
        pois = []
        for poi in response.get("data", []):
            pois.append({
                "type": poi.get("type"),
                "subType": poi.get("subType"),
                "name": poi.get("name"),
                "geoCode": poi.get("geoCode", {}),
                "category": poi.get("category")
            })
        return {"pois": pois, "count": len(pois)}
    
    def _get_confidence_level(self, probability: float) -> str:
        """Get confidence level from probability"""
        if probability >= 0.8:
            return "HIGH"
        elif probability >= 0.6:
            return "MEDIUM"
        else:
            return "LOW"
    
    def close(self):
        """Close HTTP client"""
        if self._client:
            self._client.close()
