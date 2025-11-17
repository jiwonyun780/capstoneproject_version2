# Amadeus API Integration Complete

All available Amadeus APIs have been integrated!

## Integrated API List

### ✈️ Airline APIs
1. **Airline Code Lookup** - `/api/amadeus/airline/lookup`
   - Search by airline code or name
   - Endpoint: `GET /api/amadeus/airline/lookup?airline_code=UA&airline_name=United`

2. **Airline Routes** - `/api/amadeus/airline/routes`
   - Get routes for a specific airline
   - Endpoint: `GET /api/amadeus/airline/routes?airline_code=UA`

### 🛫 Airport APIs
3. **Airport Nearest Relevant** - `/api/amadeus/airport/nearest`
   - Find nearest airports by coordinates
   - Endpoint: `GET /api/amadeus/airport/nearest?latitude=40.7128&longitude=-74.0060&radius=500`

4. **Airport On-Time Performance** - `/api/amadeus/airport/on-time-performance`
   - Get airport on-time performance statistics
   - Endpoint: `GET /api/amadeus/airport/on-time-performance?airport_code=JFK&date=2024-11-15`

5. **Airport Routes** - `/api/amadeus/airport/routes`
   - Get direct routes from/to an airport
   - Endpoint: `GET /api/amadeus/airport/routes?airport_code=JFK`

### 🏙️ City APIs
6. **City Search** - `/api/amadeus/city/search`
   - Search for cities
   - Endpoint: `GET /api/amadeus/city/search?keyword=New York`

### ✈️ Flight APIs (Additional)
7. **Flight Busiest Traveling Period** - `/api/amadeus/flight/busiest-period`
   - Get busiest traveling periods for a route
   - Endpoint: `GET /api/amadeus/flight/busiest-period?origin=NYC&destination=LAX&period=2024`

8. **Flight Check-in Links** - `/api/amadeus/flight/checkin-links`
   - Get check-in links for an airline
   - Endpoint: `GET /api/amadeus/flight/checkin-links?airline_code=UA`

9. **Flight Create Orders** - `/api/amadeus/flight/order`
   - Create a flight booking
   - Endpoint: `POST /api/amadeus/flight/order`
   - Body: `{"flight_offer": {...}, "travelers": [...]}`

10. **Flight Most Booked Destinations** - `/api/amadeus/flight/most-booked`
    - Get most booked destinations from an origin
    - Endpoint: `GET /api/amadeus/flight/most-booked?origin=NYC&period=2024`

11. **Flight Most Traveled Destinations** - `/api/amadeus/flight/most-traveled`
    - Get most traveled destinations from an origin
    - Endpoint: `GET /api/amadeus/flight/most-traveled?origin=NYC&period=2024`

12. **Flight Offers Price** - `/api/amadeus/flight/offers/price`
    - Get price for a specific flight offer
    - Endpoint: `POST /api/amadeus/flight/offers/price`
    - Body: `{"flight_offer_id": "..."}`

13. **Flight Order Management** - `/api/amadeus/flight/order/{order_id}`
    - Get/cancel flight bookings
    - Endpoints:
      - `GET /api/amadeus/flight/order/{order_id}` - Get order
      - `DELETE /api/amadeus/flight/order/{order_id}` - Cancel order

14. **On Demand Flight Status** - `/api/amadeus/flight/status`
    - Get real-time flight status
    - Endpoint: `GET /api/amadeus/flight/status?carrier_code=UA&flight_number=123&scheduled_departure_date=2024-11-15`

### 🏨 Hotel APIs (Additional)
15. **Hotel List** - `/api/amadeus/hotel/list`
    - Get list of hotels by city or hotel IDs
    - Endpoint: `GET /api/amadeus/hotel/list?city_code=NYC` or `?hotel_ids=HOTEL1,HOTEL2`

16. **Hotel Name Autocomplete** - `/api/amadeus/hotel/autocomplete`
    - Autocomplete hotel names
    - Endpoint: `GET /api/amadeus/hotel/autocomplete?keyword=Marriott`

17. **Hotel Ratings** - `/api/amadeus/hotel/ratings`
    - Get hotel ratings
    - Endpoint: `GET /api/amadeus/hotel/ratings?hotel_ids=HOTEL1,HOTEL2`

18. **Hotel Booking** - `/api/amadeus/hotel/booking`
    - Create a hotel booking
    - Endpoint: `POST /api/amadeus/hotel/booking`
    - Body: `{"offer_id": "...", "guests": [...], "payments": [...]}`

**Note: Hotel prices from `/v2/shopping/hotel-offers` are REAL bookable prices, not estimates!**

### 🚗 Transfer APIs
19. **Transfer Search** - `/api/amadeus/transfer/search`
    - Search for transfer options (airport shuttles, etc.)
    - Endpoint: `GET /api/amadeus/transfer/search?origin_lat=40.7128&origin_lon=-74.0060&destination_lat=40.7580&destination_lon=-73.9855&departure_date=2024-11-15&adults=1`

20. **Transfer Booking** - `/api/amadeus/transfer/booking`
    - Create a transfer booking
    - Endpoint: `POST /api/amadeus/transfer/booking`
    - Body: `{"offer_id": "...", "passengers": [...], "payment": {...}}`

21. **Transfer Management** - `/api/amadeus/transfer/booking/{booking_id}`
    - Get/cancel transfer bookings
    - Endpoints:
      - `GET /api/amadeus/transfer/booking/{booking_id}` - Get booking
      - `DELETE /api/amadeus/transfer/booking/{booking_id}` - Cancel booking

### 🌍 Travel APIs
22. **Travel Recommendations** - `/api/amadeus/travel/recommendations`
    - Get travel recommendations
    - Endpoint: `GET /api/amadeus/travel/recommendations?origin=NYC&destination=PAR`

23. **Travel Restrictions** - `/api/amadeus/travel/restrictions`
    - Get travel restrictions between countries
    - Endpoint: `GET /api/amadeus/travel/restrictions?origin=US&destination=FR`

24. **Trip Parser** - `/api/amadeus/travel/trip-parser`
    - Parse trip information from natural language
    - Endpoint: `POST /api/amadeus/travel/trip-parser`
    - Body: `{"sentence": "I want to go to Paris on November 15th"}`

25. **Trip Purpose Prediction** - `/api/amadeus/travel/trip-purpose`
    - Predict trip purpose (business/leisure)
    - Endpoint: `GET /api/amadeus/travel/trip-purpose?origin=NYC&destination=LAX&departure_date=2024-11-15`

### 📍 Location APIs
26. **Location Score** - `/api/amadeus/location/score`
    - Get location score/rating
    - Endpoint: `GET /api/amadeus/location/score?latitude=40.7128&longitude=-74.0060`

27. **Points Of Interest** - `/api/amadeus/location/pois`
    - Get points of interest near coordinates
    - Endpoint: `GET /api/amadeus/location/pois?latitude=40.7128&longitude=-74.0060&radius=2&categories=RESTAURANT,ATTRACTION`

## Already Implemented APIs

- ✅ Flight Offers Search
- ✅ Flight Inspiration Search
- ✅ Flight Cheapest Date Search
- ✅ Airport & City Search
- ✅ Hotel Search (with REAL prices)
- ✅ Activities (Tours and Activities)
- ✅ Flight Price Analysis
- ✅ Flight Choice Prediction
- ✅ Flight Delay Prediction
- ✅ SeatMap Display
- ✅ Branded Fares Upsell

## Usage

### 1. Direct API Calls
All endpoints are accessible via FastAPI:
```bash
# Example: Airline code lookup
curl "http://localhost:8000/api/amadeus/airline/lookup?airline_code=UA"

# Example: Nearest airports
curl "http://localhost:8000/api/amadeus/airport/nearest?latitude=40.7128&longitude=-74.0060&radius=500"
```

### 2. From Python Code
```python
from services.amadeus_service import AmadeusService

amadeus = AmadeusService()

# Lookup airline information
airline_info = amadeus.get_airline_code_lookup(airline_code="UA")

# Get airport on-time performance
performance = amadeus.get_airport_on_time_performance("JFK", "2024-11-15")

# Get travel restrictions
restrictions = amadeus.get_travel_restrictions("US", "FR")
```

### 3. From Frontend
```javascript
// Lookup airline information
const response = await fetch('/api/amadeus/airline/lookup?airline_code=UA');
const data = await response.json();

// Search transfers
const transferResponse = await fetch(
  `/api/amadeus/transfer/search?origin_lat=40.7128&origin_lon=-74.0060&destination_lat=40.7580&destination_lon=-73.9855&departure_date=2024-11-15&adults=1`
);
const transfers = await transferResponse.json();
```

## API Summary by Category

| Category | API Count | Main Features |
|----------|----------|---------------|
| Airline | 2 | Airline info, routes |
| Airport | 3 | Airport search, on-time performance, routes |
| City | 1 | City search |
| Flight | 8 | Booking, status, statistics, pricing |
| Hotel | 4 | List, autocomplete, ratings, booking |
| Transfer | 3 | Search, booking, management |
| Travel | 4 | Recommendations, restrictions, parsing, prediction |
| Location | 2 | Score, points of interest |

**Total: 27 new API endpoints added!**

## Important Notes

1. **Authentication**: All APIs automatically manage Amadeus OAuth2 tokens.
2. **Error Handling**: All methods return `{"error": "...", ...}` format on error.
3. **Quota**: Check monthly request limits for each API and use accordingly.
4. **Testing**: Some APIs may only be available in test environment.

## Hotel Prices

**Hotel prices from Amadeus Hotel Offers API (`/v2/shopping/hotel-offers`) are REAL bookable prices, not estimates!**

The API returns actual prices that include:
- Base room rate
- All taxes and fees
- Real-time availability
- Bookable offers

Each hotel result includes:
- `price`: Real bookable price (total including taxes)
- `currency`: Currency code
- `price_type`: "real" (marked as real price, not estimate)

## Next Steps

1. Test each API with real use cases
2. Integrate needed APIs in frontend
3. Improve error handling and user feedback
4. Optimize caching strategy (CacheManager already in use)

## References

- All API methods are implemented in `backend/services/amadeus_service.py`
- All endpoints are defined in `backend/main.py`
- FastAPI auto-documentation: Check `http://localhost:8000/docs` for all endpoints
