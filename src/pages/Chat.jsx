import React, { useMemo, useRef, useState, useEffect } from 'react';
import MessageBubble from '../components/MessageBubble';
import ChatInput from '../components/ChatInput';
import { FlightDashboard } from '../components/dashboard/FlightDashboard';

// Location detection utility
async function getLocationContext() {
  const now = new Date();
  const now_iso = now.toISOString();
  
  // Get timezone
  const user_tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  // Get locale
  const user_locale = navigator.language || 'en-US';
  
  // Try to get location from browser
  let user_location = {
    city: null,
    region: null,
    country: null,
    lat: null,
    lon: null
  };
  
  try {
    if (navigator.geolocation) {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 5000,
          enableHighAccuracy: false
        });
      });
      
      user_location.lat = position.coords.latitude;
      user_location.lon = position.coords.longitude;
      
      // Try to reverse geocode to get city/country
      try {
        const response = await fetch(
          `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${user_location.lat}&longitude=${user_location.lon}&localityLanguage=${user_locale}`
        );
        if (response.ok) {
          const data = await response.json();
          user_location.city = data.city || data.locality;
          user_location.region = data.principalSubdivision;
          
          // Clean up country name to remove "(the)" and other formatting issues
          let countryName = data.countryName;
          if (countryName) {
            // Remove "(the)" from country names
            countryName = countryName.replace(/\s*\(the\)\s*$/i, '');
            // Handle common country name variations
            if (countryName.toLowerCase().includes('united states')) {
              countryName = 'United States';
            } else if (countryName.toLowerCase().includes('united kingdom')) {
              countryName = 'United Kingdom';
            }
          }
          user_location.country = countryName;
        }
      } catch (e) {
        console.log('Reverse geocoding failed:', e);
      }
    }
  } catch (e) {
    console.log('Location detection failed:', e);
  }
  
  return {
    now_iso,
    user_tz,
    user_locale,
    user_location
  };
}

// Helper function to clean context data
function cleanContext(context) {
  if (!context) return context;
  
  const cleaned = { ...context };
  if (cleaned.user_location) {
    const location = { ...cleaned.user_location };
    // Remove null/undefined values
    Object.keys(location).forEach(key => {
      if (location[key] === null || location[key] === undefined) {
        delete location[key];
      }
    });
    cleaned.user_location = location;
  }
  return cleaned;
}

async function sendToApi(messages, context, sessionId) {
  // Use production Vercel backend or fallback to localhost for development
  const base = process.env.REACT_APP_API_BASE;
  console.log('API Base URL:', base);
  console.log('Making request to:', `${base}/api/chat`);
  
  const cleanedContext = cleanContext(context);
  console.log('Cleaned context:', cleanedContext);
  
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, context: cleanedContext, session_id: sessionId }),
  });
  if (!res.ok) throw new Error('API error');
  return res.json();
}

export default function Chat({ onShowDashboard, showDashboard, dashboardData, onHideDashboard }) {
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState(null);
  const [context, setContext] = useState(null);
  const [, setIsLoadingContext] = useState(true);
  const [sessionId, setSessionId] = useState(null);
  const scrollRef = useRef(null);

  const quickReplies = ['Plan a trip to Paris', 'Budget accommodations', 'Check weather'];

  // Initialize context and welcome message
  useEffect(() => {
    const initializeChat = async () => {
      try {
        const locationContext = await getLocationContext();
        setContext(locationContext);
        
        // Generate session ID for cache continuity
        const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        setSessionId(newSessionId);
        
        // Create welcome message with location context
        let welcomeMessage = "Hi! I'm Miles, your AI travel assistant. I'm here to help you plan the perfect trip.";
        
        if (locationContext.user_location.city && locationContext.user_location.country) {
          welcomeMessage += ` I can see you're in ${locationContext.user_location.city}, ${locationContext.user_location.country}.`;
        } else if (locationContext.user_location.country) {
          welcomeMessage += ` I can see you're in ${locationContext.user_location.country}.`;
        }
        
        welcomeMessage += " Where would you like to go?";
        
        setMessages([{
          role: 'assistant',
          content: welcomeMessage,
          timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        }]);
      } catch (e) {
        console.error('Failed to initialize context:', e);
        setMessages([{
          role: 'assistant',
          content: "Hi! I'm Miles, your AI travel assistant. I'm here to help you plan the perfect trip. Where would you like to go?",
          timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        }]);
      } finally {
        setIsLoadingContext(false);
      }
    };
    
    initializeChat();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  // Function to extract dates from user message
  const extractDatesFromMessage = (message) => {
    const lowerMessage = message.toLowerCase();
    
    // Look for month names and dates
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                       'july', 'august', 'september', 'october', 'november', 'december'];
    const monthAbbrevs = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
                         'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    
    let departureDate = null;
    let returnDate = null;
    
    // Look for patterns like "december 1" or "dec 1"
    const datePatterns = [
      /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})/gi,
      /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})/gi,
      /(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)/gi,
      /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/gi
    ];
    
    const matches = [];
    datePatterns.forEach(pattern => {
      const found = lowerMessage.match(pattern);
      if (found) {
        console.log('Date pattern matched:', pattern, 'Found:', found);
        matches.push(...found);
      }
    });
    
    console.log('All date matches:', matches);
    
    if (matches.length > 0) {
      // Parse the first date as departure
      const firstMatch = matches[0];
      const monthMatch = firstMatch.match(/(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i);
      const dayMatch = firstMatch.match(/(\d{1,2})/);
      
      if (monthMatch && dayMatch) {
        const monthName = monthMatch[0].toLowerCase();
        const day = parseInt(dayMatch[1]);
        const year = new Date().getFullYear();
        
        // Convert month name to number
        let monthNum;
        if (monthNames.includes(monthName)) {
          monthNum = monthNames.indexOf(monthName);
        } else if (monthAbbrevs.includes(monthName)) {
          monthNum = monthAbbrevs.indexOf(monthName);
        }
        
        if (monthNum !== undefined) {
          departureDate = new Date(year, monthNum, day);
          
          // If there's a second date, use it as return date
          if (matches.length > 1) {
            const secondMatch = matches[1];
            const secondMonthMatch = secondMatch.match(/(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i);
            const secondDayMatch = secondMatch.match(/(\d{1,2})/);
            
            if (secondMonthMatch && secondDayMatch) {
              const secondMonthName = secondMonthMatch[0].toLowerCase();
              const secondDay = parseInt(secondDayMatch[1]);
              
              let secondMonthNum;
              if (monthNames.includes(secondMonthName)) {
                secondMonthNum = monthNames.indexOf(secondMonthName);
              } else if (monthAbbrevs.includes(secondMonthName)) {
                secondMonthNum = monthAbbrevs.indexOf(secondMonthName);
              }
              
              if (secondMonthNum !== undefined) {
                returnDate = new Date(year, secondMonthNum, secondDay);
              }
            }
          }
        }
      }
    }
    
    return { departureDate, returnDate };
  };

  // Function to extract cities from user message
  const extractCitiesFromMessage = (message) => {
    const lowerMessage = message.toLowerCase();
    
    // Common city mappings
    const cityMappings = {
      'new york': { name: 'New York', code: 'JFK' },
      'nyc': { name: 'New York', code: 'JFK' },
      'washington dc': { name: 'Washington DC', code: 'DCA' },
      'washington': { name: 'Washington DC', code: 'DCA' },
      'dc': { name: 'Washington DC', code: 'DCA' },
      'barcelona': { name: 'Barcelona', code: 'BCN' },
      'paris': { name: 'Paris', code: 'CDG' },
      'london': { name: 'London', code: 'LHR' },
      'tokyo': { name: 'Tokyo', code: 'NRT' },
      'los angeles': { name: 'Los Angeles', code: 'LAX' },
      'lax': { name: 'Los Angeles', code: 'LAX' },
      'miami': { name: 'Miami', code: 'MIA' },
      'chicago': { name: 'Chicago', code: 'ORD' },
      'rome': { name: 'Rome', code: 'FCO' },
      'madrid': { name: 'Madrid', code: 'MAD' },
      'berlin': { name: 'Berlin', code: 'BER' },
      'amsterdam': { name: 'Amsterdam', code: 'AMS' },
      'dublin': { name: 'Dublin', code: 'DUB' },
      'sydney': { name: 'Sydney', code: 'SYD' },
      'melbourne': { name: 'Melbourne', code: 'MEL' },
      'toronto': { name: 'Toronto', code: 'YYZ' },
      'vancouver': { name: 'Vancouver', code: 'YVR' },
      'mexico city': { name: 'Mexico City', code: 'MEX' },
      'sao paulo': { name: 'São Paulo', code: 'GRU' },
      'rio de janeiro': { name: 'Rio de Janeiro', code: 'GIG' },
      'buenos aires': { name: 'Buenos Aires', code: 'EZE' },
      'lima': { name: 'Lima', code: 'LIM' },
      'bogota': { name: 'Bogotá', code: 'BOG' },
      'santiago': { name: 'Santiago', code: 'SCL' },
      'montevideo': { name: 'Montevideo', code: 'MVD' },
      'caracas': { name: 'Caracas', code: 'CCS' },
      'havana': { name: 'Havana', code: 'HAV' },
      'kingston': { name: 'Kingston', code: 'KIN' },
      'nassau': { name: 'Nassau', code: 'NAS' },
      'san juan': { name: 'San Juan', code: 'SJU' },
      'prague': { name: 'Prague', code: 'PRG' },
      'vienna': { name: 'Vienna', code: 'VIE' },
      'budapest': { name: 'Budapest', code: 'BUD' },
      'warsaw': { name: 'Warsaw', code: 'WAW' },
      'moscow': { name: 'Moscow', code: 'SVO' },
      'istanbul': { name: 'Istanbul', code: 'IST' },
      'cairo': { name: 'Cairo', code: 'CAI' },
      'cape town': { name: 'Cape Town', code: 'CPT' },
      'johannesburg': { name: 'Johannesburg', code: 'JNB' },
      'casablanca': { name: 'Casablanca', code: 'CMN' },
      'marrakech': { name: 'Marrakech', code: 'RAK' },
      'tunis': { name: 'Tunis', code: 'TUN' },
      'algiers': { name: 'Algiers', code: 'ALG' },
      'lagos': { name: 'Lagos', code: 'LOS' },
      'nairobi': { name: 'Nairobi', code: 'NBO' },
      'addis ababa': { name: 'Addis Ababa', code: 'ADD' },
      'dakar': { name: 'Dakar', code: 'DKR' },
      'accra': { name: 'Accra', code: 'ACC' },
      'abidjan': { name: 'Abidjan', code: 'ABJ' },
      'douala': { name: 'Douala', code: 'DLA' },
      'kinshasa': { name: 'Kinshasa', code: 'FIH' },
      'luanda': { name: 'Luanda', code: 'LAD' },
      'maputo': { name: 'Maputo', code: 'MPM' },
      'harare': { name: 'Harare', code: 'HRE' },
      'windhoek': { name: 'Windhoek', code: 'WDH' },
      'antananarivo': { name: 'Antananarivo', code: 'TNR' },
      'port louis': { name: 'Port Louis', code: 'MRU' },
      'victoria': { name: 'Victoria', code: 'SEZ' },
      'moroni': { name: 'Moroni', code: 'HAH' },
      'djibouti': { name: 'Djibouti', code: 'JIB' },
      'asmera': { name: 'Asmara', code: 'ASM' },
      'khartoum': { name: 'Khartoum', code: 'KRT' },
      'juba': { name: 'Juba', code: 'JUB' },
      'bangui': { name: 'Bangui', code: 'BGF' },
      'ndjamena': { name: 'N\'Djamena', code: 'NDJ' },
      'yaounde': { name: 'Yaoundé', code: 'YAO' },
      'libreville': { name: 'Libreville', code: 'LBV' },
      'malabo': { name: 'Malabo', code: 'SSG' },
      'brazzaville': { name: 'Brazzaville', code: 'BZV' },
      'bujumbura': { name: 'Bujumbura', code: 'BJM' },
      'kigali': { name: 'Kigali', code: 'KGL' },
      'kampala': { name: 'Kampala', code: 'EBB' },
      'dodoma': { name: 'Dodoma', code: 'DOD' },
      'dar es salaam': { name: 'Dar es Salaam', code: 'DAR' },
      'lusaka': { name: 'Lusaka', code: 'LUN' },
      'gaborone': { name: 'Gaborone', code: 'GBE' },
      'maseru': { name: 'Maseru', code: 'MSU' },
      'mbabane': { name: 'Mbabane', code: 'SHO' },
      'pretoria': { name: 'Pretoria', code: 'PRY' },
      'bloemfontein': { name: 'Bloemfontein', code: 'BFN' },
      'durban': { name: 'Durban', code: 'DUR' },
      'port elizabeth': { name: 'Port Elizabeth', code: 'PLZ' },
      'east london': { name: 'East London', code: 'ELS' },
      'kimberley': { name: 'Kimberley', code: 'KIM' },
      'polokwane': { name: 'Polokwane', code: 'PTG' },
      'nelspruit': { name: 'Nelspruit', code: 'NLP' },
      'richards bay': { name: 'Richards Bay', code: 'RCB' },
      'george': { name: 'George', code: 'GRJ' },
      'upington': { name: 'Upington', code: 'UTN' },
      'springbok': { name: 'Springbok', code: 'SBU' },
      'calvinia': { name: 'Calvinia', code: 'CVI' },
      'sutherland': { name: 'Sutherland', code: 'SUT' },
      'clanwilliam': { name: 'Clanwilliam', code: 'CLW' },
      'vredendal': { name: 'Vredendal', code: 'VRD' },
      'vanrhynsdorp': { name: 'Vanrhynsdorp', code: 'VRS' },
      'nieuwoudtville': { name: 'Nieuwoudtville', code: 'NWV' },
      'loeriesfontein': { name: 'Loeriesfontein', code: 'LRS' }
    };
    
    let origin = null;
    let destination = null;
    
    // Look for various route patterns
    const routePatterns = [
      // "flights to Washington DC to Barcelona from December 1 to December 5"
      /flights?\s+to\s+([^to]+?)\s+to\s+([^from]+?)(?:\s+from|\s+to|$)/gi,
      // "from X to Y"
      /from\s+([^to]+?)\s+to\s+([^from]+?)(?:\s+from|\s+to|$)/gi,
      // "X to Y"
      /([^to]+?)\s+to\s+([^from]+?)(?:\s+from|\s+to|$)/gi
    ];
    
    for (const pattern of routePatterns) {
      const match = lowerMessage.match(pattern);
      if (match) {
        console.log('Pattern matched:', pattern, 'Match:', match[0]);
        const parts = match[0].split(/\s+to\s+/i);
        console.log('Split parts:', parts);
        
        if (parts.length >= 2) {
          const originPart = parts[0].replace(/^(from|flights?)\s+/i, '').trim();
          const destPart = parts[1].trim();
          
          console.log('Origin part:', originPart, 'Dest part:', destPart);
          
          // Try to find cities in the mappings
          for (const [key, value] of Object.entries(cityMappings)) {
            if (originPart.includes(key)) {
              origin = value;
              console.log('Found origin:', key, '->', value);
            }
            if (destPart.includes(key)) {
              destination = value;
              console.log('Found destination:', key, '->', value);
            }
          }
          
          if (origin && destination) break;
        }
      }
    }
    
    // Fallback: if no pattern matched, try to find cities anywhere in the message
    if (!origin || !destination) {
      const foundCities = [];
      for (const [key, value] of Object.entries(cityMappings)) {
        if (lowerMessage.includes(key)) {
          foundCities.push(value);
        }
      }
      
      if (foundCities.length >= 2) {
        origin = foundCities[0];
        destination = foundCities[1];
      }
    }
    
    console.log('City extraction debug:', {
      message: lowerMessage,
      origin,
      destination,
      foundCities: !origin || !destination ? Object.keys(cityMappings).filter(key => lowerMessage.includes(key)) : []
    });
    
    return { origin, destination };
  };

  // Check if message contains flight/price related keywords
  const shouldShowDashboard = (message) => {
    const flightKeywords = [
      // Core flight terms
      'flight', 'flights', 'airline', 'airlines', 'airplane', 'aircraft', 'plane',
      'ticket', 'tickets', 'booking', 'book', 'reserve', 'reservation',
      
      // Travel terms
      'travel', 'trip', 'journey', 'vacation', 'holiday', 'getaway',
      'destination', 'departure', 'arrival', 'airport', 'terminal',
      
      // Price and cost terms
      'price', 'prices', 'cost', 'costs', 'expensive', 'cheap', 'cheapest', 
      'budget', 'affordable', 'fare', 'fares', 'rate', 'rates',
      
      // Action terms
      'search', 'find', 'look for', 'show me', 'get me', 'need', 'want',
      'compare', 'comparison', 'options', 'available', 'schedule',
      
      // Location terms
      'to', 'from', 'between', 'route', 'way', 'path',
      
      // Time terms
      'today', 'tomorrow', 'next week', 'this month', 'soon', 'when',
      
      // Common phrases
      'search flights', 'find flights', 'book flights', 'flight search',
      'airline tickets', 'plane tickets', 'flight booking', 'travel booking'
    ];
    
    const lowerMessage = message.toLowerCase();
    const shouldShow = flightKeywords.some(keyword => lowerMessage.includes(keyword));
    
    console.log('Dashboard trigger check:', { 
      message, 
      shouldShow, 
      matchedKeywords: flightKeywords.filter(k => lowerMessage.includes(k)) 
    });
    
    return shouldShow;
  };

  // Function to handle dashboard data processing
  const handleDashboardData = (data) => {
    console.log('Processing dashboard data:', data);
    
    // Check if we have real flight data
    if (data.dashboard_data && data.dashboard_data.hasRealData) {
      // Use real Amadeus data
      console.log('Using real flight data from API');
      onShowDashboard(data.dashboard_data);
    } else if (data.flights && data.flights.length > 0) {
      // Legacy format - convert to new format
      console.log('Converting legacy format to new format');
      const dashboardData = {
        hasRealData: true,
        route: data.route || {},
        outboundFlights: data.flights,
        returnFlights: [],
        priceData: data.priceData || []
      };
      onShowDashboard(dashboardData);
    } else {
      // No real data - show mock dashboard
      console.log('Using fallback mock data');
      onShowDashboard({
        hasRealData: false,
        route: {
          departure: 'Washington DC',
          destination: 'Istanbul',
          departureCode: 'IAD',
          destinationCode: 'IST',
          date: new Date().toLocaleDateString()
        }
      });
    }
  };

  const handleSend = async (text) => {
    const userMsg = { role: 'user', content: text, timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) };
    setMessages((prev) => [...prev, userMsg]);
    setError(null);
    setIsTyping(true);
        try {
          const payload = [...messages, userMsg];
          console.log('Sending to API:', { payload, context, sessionId });
          const data = await sendToApi(payload, context, sessionId);
          console.log('API Response:', data);
          const reply = data.reply || '';
          setMessages((prev) => [...prev, { role: 'assistant', content: reply, timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) }]);
          
          // Check if we should show dashboard
          if (shouldShowDashboard(text) && onShowDashboard) {
            console.log('Triggering dashboard for text:', text);
            console.log('API Response data:', data);
            handleDashboardData(data);
          }
        } catch (e) {
          console.error('API Error:', e);
          setError('Something went wrong. Please try again.');
          setMessages((prev) => [...prev, { role: 'assistant', content: 'Sorry, there was an error reaching the server.', timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) }]);
        } finally {
          setIsTyping(false);
        }
  };

  const rendered = useMemo(() => messages.map((m, idx) => (
    <MessageBubble key={idx} role={m.role} content={m.content} timestamp={m.timestamp} />
  )), [messages]);

  // If dashboard should be shown, render split view
  if (showDashboard) {
    console.log('Rendering split view with dashboard data:', dashboardData);
    console.log('showDashboard state:', showDashboard);
    return (
      <div style={{ 
        height: '100vh', 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr', 
        gap: '16px',
        padding: '16px',
        background: '#ffffff'
      }}>
        {/* Left: Chat Interface */}
        <div style={{ 
          height: '100%', 
          display: 'flex', 
          flexDirection: 'column',
          background: '#ffffff',
          borderRadius: '12px',
          border: '1px solid rgba(2, 6, 23, 0.06)',
          boxShadow: '0 1px 2px rgba(2, 6, 23, 0.06), 0 4px 12px rgba(2, 6, 23, 0.04)'
        }}>
          {/* Chat Header */}
          <div style={{ 
            padding: '16px 20px', 
            borderBottom: '1px solid rgba(2, 6, 23, 0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '32px', height: '32px', background: '#E6F7FF', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src={process.env.PUBLIC_URL + '/Miles_logo.png'} alt="Miles" style={{ width: '24px', height: '24px' }} />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#004C8C' }}>Miles</h2>
                <p style={{ margin: 0, fontSize: '12px', color: 'rgba(2, 6, 23, 0.6)' }}>Travel Assistant</p>
              </div>
            </div>
            <button 
              onClick={onHideDashboard}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(2, 6, 23, 0.6)',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px'
              }}
              title="Close Dashboard"
            >
              ✕
            </button>
          </div>
          
          {/* Chat Messages */}
          <div style={{ flex: 1, overflow: 'auto', padding: '16px' }} ref={scrollRef}>
            {rendered}
            {isTyping && (
              <div className="message-row">
                <div className="avatar avatar-assistant">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="8" fill="#00ADEF"/>
                  </svg>
                </div>
                <div className="typing">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                </div>
              </div>
            )}
          </div>
          
          {/* Chat Input */}
          <div style={{ padding: '16px', borderTop: '1px solid rgba(2, 6, 23, 0.06)' }}>
            <ChatInput onSend={handleSend} disabled={isTyping} />
          </div>
        </div>
        
        {/* Right: Flight Dashboard */}
        <div style={{ height: '100%' }}>
          <FlightDashboard searchData={dashboardData} />
        </div>
      </div>
    );
  }

  return (
    <div className="chat-page">
      <header className="chat-header">
        <div className="container">
          <div className="chat-header-content">
            <button className="back-button" onClick={() => window.location.href = '/'}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Back to Home
            </button>
            <div className="chat-header-info">
              <div className="chat-header-icon" style={{ width: '48px', height: '48px', padding: '6px', background: '#E6F7FF', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src={process.env.PUBLIC_URL + '/Miles_logo.png'} alt="Miles" style={{ width: '36px', height: '36px' }} />
              </div>
              <div>
                <h1 className="chat-title">Miles</h1>
                <p className="chat-status" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00ff00', display: 'inline-block' }}></span>
                  Online • Ready to help plan your trip
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="chat-messages" ref={scrollRef}>
        <div className="container">
          {rendered}
          {isTyping && (
            <div className="message-row">
              <div className="avatar avatar-assistant">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="8" fill="#00ADEF"/>
                </svg>
              </div>
              <div className="typing">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
              </div>
            </div>
          )}
          {error && (
            <div className="card" style={{ padding: 12, marginTop: 8 }}>
              <div className="muted">{error}</div>
            </div>
          )}
        </div>
      </div>

      <div className="chat-input-dock">
        <div className="container">
          {messages.length === 1 && (
            <div className="quick-replies">
              {quickReplies.map((text, idx) => (
                <button key={idx} className="quick-reply-btn" onClick={() => handleSend(text)}>
                  {text}
                </button>
              ))}
            </div>
          )}
          <ChatInput onSend={handleSend} disabled={isTyping} />
        </div>
      </div>
    </div>
  );
}