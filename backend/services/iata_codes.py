"""
IATA Code Lookup for Common Cities
Provides fast lookup for city names to IATA codes to reduce API calls
Fixed version with proper Washington DC airport codes
"""
from typing import Dict, Optional, List

# Common city to IATA code mappings
COMMON_IATA_CODES: Dict[str, str] = {
    # Major US cities - FIXED Washington DC mapping
    "washington dc": "IAD",  # Dulles for international flights
    "washington": "IAD",     # Dulles for international flights  
    "dc": "IAD",             # Dulles for international flights
    "dulles": "IAD",
    "reagan": "DCA",         # Reagan for domestic
    "baltimore": "BWI",
    "new york": "JFK",       # JFK for international
    "new york city": "JFK",
    "nyc": "JFK",
    "newark": "EWR",
    "laguardia": "LGA",
    "los angeles": "LAX",
    "chicago": "ORD",
    "miami": "MIA",
    "boston": "BOS",
    "san francisco": "SFO",
    "seattle": "SEA",
    "atlanta": "ATL",
    "dallas": "DFW",
    "denver": "DEN",
    "las vegas": "LAS",
    "phoenix": "PHX",
    "orlando": "MCO",
    "tampa": "TPA",
    "detroit": "DTW",
    "minneapolis": "MSP",
    "charlotte": "CLT",
    "philadelphia": "PHL",
    "houston": "IAH",
    "austin": "AUS",
    "san diego": "SAN",
    "portland": "PDX",
    "sacramento": "SMF",
    "salt lake city": "SLC",
    "kansas city": "MCI",
    "st louis": "STL",
    "indianapolis": "IND",
    "columbus": "CMH",
    "cincinnati": "CVG",
    "pittsburgh": "PIT",
    "cleveland": "CLE",
    "milwaukee": "MKE",
    "nashville": "BNA",
    "memphis": "MEM",
    "new orleans": "MSY",
    "raleigh": "RDU",
    
    # European cities
    "istanbul": "IST",       # Main Istanbul airport
    "paris": "CDG",
    "london": "LHR",
    "berlin": "BER",
    "munich": "MUC",
    "frankfurt": "FRA",
    "rome": "FCO",
    "milan": "MXP",
    "madrid": "MAD",
    "barcelona": "BCN",
    "amsterdam": "AMS",
    "brussels": "BRU",
    "zurich": "ZRH",
    "vienna": "VIE",
    "prague": "PRG",
    "warsaw": "WAW",
    "moscow": "SVO",
    "athens": "ATH",
    "lisbon": "LIS",
    "dublin": "DUB",
    "copenhagen": "CPH",
    "stockholm": "ARN",
    "oslo": "OSL",
    "helsinki": "HEL",
    
    # Asian cities
    "tokyo": "NRT",
    "beijing": "PEK",
    "shanghai": "PVG",
    "hong kong": "HKG",
    "singapore": "SIN",
    "bangkok": "BKK",
    "kuala lumpur": "KUL",
    "jakarta": "CGK",
    "manila": "MNL",
    "seoul": "ICN",
    "taipei": "TPE",
    "mumbai": "BOM",
    "delhi": "DEL",
    "bangalore": "BLR",
    
    # Middle East
    "dubai": "DXB",
    "abu dhabi": "AUH",
    "doha": "DOH",
    "riyadh": "RUH",
    "tel aviv": "TLV",
    "cairo": "CAI",
    "amman": "AMM",
    
    # Other major cities
    "toronto": "YYZ",
    "vancouver": "YVR",
    "montreal": "YUL",
    "sydney": "SYD",
    "melbourne": "MEL",
    "auckland": "AKL",
    "sao paulo": "GRU",
    "rio de janeiro": "GIG",
    "buenos aires": "EZE",
    "mexico city": "MEX",
    "cancun": "CUN",
    "johannesburg": "JNB",
    "cape town": "CPT",
}

# Airport code to city name mapping
AIRPORT_CODES: Dict[str, str] = {
    "IAD": "Washington Dulles",
    "DCA": "Washington Reagan",
    "BWI": "Baltimore/Washington",
    "JFK": "New York JFK",
    "EWR": "Newark",
    "LGA": "LaGuardia",
    "IST": "Istanbul",
    "SAW": "Istanbul Sabiha",
    "ORD": "Chicago O'Hare",
    "MDW": "Chicago Midway",
    "LAX": "Los Angeles",
    "SFO": "San Francisco",
    "ATL": "Atlanta",
    "DFW": "Dallas Fort Worth",
    "MIA": "Miami",
    "BOS": "Boston",
    "SEA": "Seattle",
    "DEN": "Denver",
    "LAS": "Las Vegas",
    "PHX": "Phoenix",
    "MCO": "Orlando",
    "CDG": "Paris Charles de Gaulle",
    "ORY": "Paris Orly",
    "LHR": "London Heathrow",
    "LGW": "London Gatwick",
    "NRT": "Tokyo Narita",
    "HND": "Tokyo Haneda",
}

def get_iata_code(city_name: str) -> Optional[str]:
    """
    Get IATA code for a city name
    
    Args:
        city_name: City name (case insensitive)
        
    Returns:
        IATA code if found, None otherwise
    """
    if not city_name:
        return None
    
    # Normalize city name
    normalized = city_name.lower().strip()
    
    # Direct lookup
    if normalized in COMMON_IATA_CODES:
        return COMMON_IATA_CODES[normalized]
    
    # Check if it's already an airport code
    if normalized.upper() in AIRPORT_CODES:
        return normalized.upper()
    
    # Try partial matches for common patterns
    for city, code in COMMON_IATA_CODES.items():
        if normalized in city or city in normalized:
            return code
    
    return None

def get_airport_name(iata_code: str) -> str:
    """Get airport name from IATA code"""
    return AIRPORT_CODES.get(iata_code.upper(), iata_code.upper())

def get_all_airport_codes(city_name: str) -> List[str]:
    """
    Get all possible airport codes for a city
    Special handling for multi-airport cities
    """
    normalized = city_name.lower().strip()
    
    # Special cases for cities with multiple airports
    multi_airport_cities = {
        "new york": ["JFK", "EWR", "LGA"],
        "nyc": ["JFK", "EWR", "LGA"],
        "washington": ["IAD", "DCA", "BWI"],
        "washington dc": ["IAD", "DCA", "BWI"],
        "dc": ["IAD", "DCA", "BWI"],
        "chicago": ["ORD", "MDW"],
        "london": ["LHR", "LGW", "STN", "LCY"],
        "paris": ["CDG", "ORY"],
        "tokyo": ["NRT", "HND"],
        "istanbul": ["IST", "SAW"],
        "los angeles": ["LAX", "BUR", "SNA", "LGB"],
        "san francisco": ["SFO", "OAK", "SJC"],
    }
    
    if normalized in multi_airport_cities:
        return multi_airport_cities[normalized]
    
    # Otherwise return single airport
    iata_code = get_iata_code(city_name)
    if iata_code:
        return [iata_code]
    return []
