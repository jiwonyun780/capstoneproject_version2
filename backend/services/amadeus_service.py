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
        
        try:
            response = requests.get(
                f"{self.base_url}{endpoint}",
                headers={"Authorization": f"Bearer {token}"},
                params=params or {},
                timeout=30
            )
            response.raise_for_status()
            return response.json()
            
        except requests.exceptions.HTTPError as e:
            logger.error(f"Amadeus API error {e.response.status_code}: {e.response.text}")
            if e.response.status_code == 401:
                # Token might be expired, try to refresh
                self._access_token = None
                return self._make_request(endpoint, params)
            # include body to help diagnose
            raise Exception(f"Amadeus API error: {e.response.status_code} - {e.response.text}")
        except Exception as e:
            logger.error(f"Amadeus API request failed: {e}")
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
        """Search for hotel offers"""
        params = {
            "cityCode": city_code,
            "checkInDate": check_in,
            "checkOutDate": check_out,
            "adults": adults,
            "radius": radius
        }
        
        if price_range:
            params["priceRange"] = price_range
        
        try:
            response = self._make_request("/v2/shopping/hotel-offers", params)
            return self._format_hotel_response(response)
        except Exception as e:
            logger.error(f"Hotel search failed: {e}")
            return {"error": str(e), "hotels": []}
    
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
        hotels = []
        for offer in response.get("data", []):
            hotel_data = offer.get("hotel", {})
            geo_code = hotel_data.get("geoCode", {})
            hotel_info = {
                "hotel_id": hotel_data.get("hotelId"),
                "name": hotel_data.get("name"),
                "rating": hotel_data.get("rating"),
                "price": offer.get("offers", [{}])[0].get("price", {}).get("total"),
                "currency": offer.get("offers", [{}])[0].get("price", {}).get("currency"),
                "check_in": offer.get("offers", [{}])[0].get("checkInDate"),
                "check_out": offer.get("offers", [{}])[0].get("checkOutDate"),
                "latitude": geo_code.get("latitude") if geo_code else None,
                "longitude": geo_code.get("longitude") if geo_code else None,
                "location": hotel_data.get("address", {}).get("cityName") or hotel_data.get("name", ""),
                "distance": 0  # Default distance, could be calculated if needed
            }
            hotels.append(hotel_info)
        
        return {"hotels": hotels, "count": len(hotels)}
    
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
    
    def close(self):
        """Close HTTP client"""
        if self._client:
            self._client.close()
