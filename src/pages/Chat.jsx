import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import MessageBubble from '../components/MessageBubble';
import ChatInput from '../components/ChatInput';
import TripPreferencesForm from '../components/TripPreferencesForm';

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

async function sendToApi(messages, context, sessionId, preferences = null) {
  // Use production Vercel backend or fallback to localhost for development
  // For local development (localhost), always use localhost backend
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const base = isLocalhost 
    ? 'http://localhost:8000'  // Force localhost for local development
    : (process.env.REACT_APP_API_BASE || 'http://localhost:8000');
  console.log('API Base URL:', base);
  console.log('Making request to:', `${base}/api/chat`);
  
  const cleanedContext = cleanContext(context);
  console.log('Cleaned context:', cleanedContext);
  console.log('User preferences:', preferences);
  
  // Include preferences in request if available
  const requestBody = {
    messages,
    context: cleanedContext,
    session_id: sessionId
  };
  
  if (preferences && preferences.preferences) {
    requestBody.preferences = preferences.preferences;
  }
  
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });
  if (!res.ok) throw new Error('API error');
  return res.json();
}

export default function Chat({ pendingMessage, onPendingMessageSent, onShowDashboard, showDashboard, dashboardData, onHideDashboard }) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState(null);
  const [context, setContext] = useState(null);
  const [, setIsLoadingContext] = useState(true);
  const [sessionId, setSessionId] = useState(null);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [userPreferences, setUserPreferences] = useState(null);
  const scrollRef = useRef(null);
  const pendingMessageSentRef = useRef(false);

  const quickReplies = ['Plan a trip to Paris', 'Budget accommodations', 'Check weather'];

  const handleOnboardingComplete = (preferences) => {
    setUserPreferences(preferences);
    setOnboardingComplete(true);
    // Note: We don't save to localStorage so the form shows every time the user visits
  };

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

  // Handle pending message from Generate Itinerary / Save Trip button
  useEffect(() => {
    if (pendingMessage && !pendingMessageSentRef.current && onboardingComplete && !isTyping && messages.length > 0) {
      pendingMessageSentRef.current = true;
      // Small delay to ensure UI is ready
      const timer = setTimeout(() => {
        handleSend(pendingMessage);
        if (onPendingMessageSent) {
          onPendingMessageSent();
        }
        pendingMessageSentRef.current = false;
      }, 300);
      
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingMessage, onboardingComplete, isTyping, messages.length]);

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



  const handleSend = async (text) => {
    const userMsg = { role: 'user', content: text, timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) };
    setMessages((prev) => [...prev, userMsg]);
    setError(null);
    setIsTyping(true);
        try {
          const payload = [...messages, userMsg];
          console.log('Sending to API:', { payload, context, sessionId, preferences: userPreferences });
          const data = await sendToApi(payload, context, sessionId, userPreferences);
          console.log('API Response:', data);
          const reply = data.reply || '';
          setMessages((prev) => [...prev, { role: 'assistant', content: reply, timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) }]);
        } catch (e) {
          console.error('API Error:', e);
          setError('Something went wrong. Please try again.');
          setMessages((prev) => [...prev, { role: 'assistant', content: 'Sorry, there was an error reaching the server.', timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) }]);
        } finally {
          setIsTyping(false);
        }
  };

  // Extract destination and dates from message content
  const extractTripInfo = (messageContent) => {
    let destination = null;
    let departureDate = null;
    let returnDate = null;
    
    // Try to extract destination from various patterns
    // Pattern 1: "Flights from X to Y"
    const fromToPattern = /Flights?\s+from\s+[^to]+\s+to\s+([A-Z][a-zA-Z\s]+)/i;
    const fromToMatch = messageContent.match(fromToPattern);
    if (fromToMatch) {
      destination = fromToMatch[1].trim();
    }
    
    // Pattern 2: "from X to Y" (without "Flights" prefix)
    const simpleFromToPattern = /from\s+[^to]+\s+to\s+([A-Z][a-zA-Z\s]+)/i;
    const simpleMatch = messageContent.match(simpleFromToPattern);
    if (simpleMatch && !destination) {
      destination = simpleMatch[1].trim();
    }
    
    // Pattern 3: Just look for city names after "to"
    const toPattern = /\s+to\s+([A-Z][a-zA-Z\s]+?)(?:\s|$|,|\.|\n)/i;
    const toMatch = messageContent.match(toPattern);
    if (toMatch && !destination) {
      destination = toMatch[1].trim();
    }
    
    // Extract dates
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                       'july', 'august', 'september', 'october', 'november', 'december'];
    const monthAbbrevs = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
                         'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    
    // Look for date patterns
    const datePatterns = [
      /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})/gi,
      /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})/gi,
      /(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)/gi,
      /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/gi,
      /(\d{1,2}\/\d{1,2}\/\d{4})/g,
      /(\d{4}-\d{2}-\d{2})/g
    ];
    
    const dateMatches = [];
    datePatterns.forEach(pattern => {
      const matches = messageContent.match(pattern);
      if (matches) {
        dateMatches.push(...matches);
      }
    });
    
    if (dateMatches.length > 0) {
      departureDate = dateMatches[0];
      if (dateMatches.length > 1) {
        returnDate = dateMatches[1];
      }
    }
    
    return { destination, departureDate, returnDate };
  };

  // Handle Generate Itinerary button click - navigate to itinerary page
  const handleGenerateItinerary = (messageContentOrData) => {
    // Try to parse as JSON first (if it contains route data from MessageBubble)
    let routeData = null;
    let messageContent = messageContentOrData;
    
    try {
      routeData = JSON.parse(messageContentOrData);
      if (routeData.messageContent) {
        messageContent = routeData.messageContent;
      }
    } catch (e) {
      // Not JSON, treat as plain message content
      messageContent = messageContentOrData;
    }
    
    // Use dashboardData if available (most reliable)
    if (dashboardData && dashboardData.route) {
      // Navigate with existing dashboard data
      navigate('/itinerary', {
        state: {
          routeInfo: dashboardData.route,
          flights: dashboardData.flights || [],
          outboundFlights: dashboardData.outboundFlights || [],
          returnFlights: dashboardData.returnFlights || [],
          preferences: userPreferences ? { preferences: userPreferences } : null
        }
      });
      return;
    }
    
    // Extract from routeData if available (from MessageBubble table extraction)
    if (routeData && routeData.flightSummary) {
      const summary = routeData.flightSummary;
      // Extract from message content if summary doesn't have all info
      const msgContent = routeData.messageContent || messageContent;
      
      // Try to extract route from message patterns
      const routeMatch = msgContent.match(/from\s+([^to]+)\s+to\s+([^\n]+)/i);
      let departure = summary.originCity || summary.origin || 'Unknown';
      let destination = summary.destCity || summary.destination || 'Unknown';
      let departureCode = summary.originCode || '';
      let destinationCode = summary.destCode || '';
      
      if (routeMatch) {
        departure = routeMatch[1].trim();
        destination = routeMatch[2].trim().split(/\s+/)[0];
      }
      
      // Try to extract airport codes from message
      const codeMatch = msgContent.match(/([A-Z]{3})\s*[→-]\s*([A-Z]{3})/);
      if (codeMatch && !departureCode && !destinationCode) {
        departureCode = codeMatch[1];
        destinationCode = codeMatch[2];
      }
      
      // Extract dates from message
      const datePatterns = [
        /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})/gi,
        /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})/gi,
      ];
      const dateMatches = [];
      datePatterns.forEach(pattern => {
        const matches = msgContent.match(pattern);
        if (matches) dateMatches.push(...matches);
      });
      
      let departureDate = summary.departureDate || null;
      let returnDate = summary.returnDate || null;
      
      if (dateMatches.length > 0 && !departureDate) {
        departureDate = dateMatches[0];
      }
      if (dateMatches.length > 1 && !returnDate) {
        returnDate = dateMatches[1];
      }
      
      const routeInfo = {
        departure: departure,
        destination: destination,
        departureCode: departureCode,
        destinationCode: destinationCode,
        date: departureDate || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        returnDate: returnDate || null
      };
      
      navigate('/itinerary', {
        state: {
          routeInfo: routeInfo,
          flights: [],
          outboundFlights: [],
          returnFlights: [],
          preferences: userPreferences ? { preferences: userPreferences } : null
        }
      });
      return;
    }
    
    // Fallback: Extract from message content
    const tripInfo = extractTripInfo(messageContent);
    
    // Try to extract route info from message patterns
    const routeMatch = messageContent.match(/from\s+([^to]+)\s+to\s+([^\n]+)/i);
    let departure = 'Unknown';
    let destination = 'Unknown';
    let departureCode = '';
    let destinationCode = '';
    
    if (routeMatch) {
      departure = routeMatch[1].trim();
      destination = routeMatch[2].trim().split(/\s+/)[0]; // Get first word after "to"
    }
    
    // Try to extract airport codes (e.g., "IAD → BCN" or "JFK to CDG")
    const codeMatch = messageContent.match(/([A-Z]{3})\s*[→-]\s*([A-Z]{3})/);
    if (codeMatch) {
      departureCode = codeMatch[1];
      destinationCode = codeMatch[2];
    }
    
    const routeInfo = {
      departure: departure,
      destination: tripInfo.destination || destination,
      departureCode: departureCode,
      destinationCode: destinationCode,
      date: tripInfo.departureDate || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      returnDate: tripInfo.returnDate || null
    };
    
    navigate('/itinerary', {
      state: {
        routeInfo: routeInfo,
        flights: [],
        outboundFlights: [],
        returnFlights: [],
        preferences: userPreferences ? { preferences: userPreferences } : null
      }
    });
  };

  // Handle Save Trip button click
  const handleSaveTrip = (messageContent) => {
    const tripInfo = extractTripInfo(messageContent);
    const destination = tripInfo.destination || 'your destination';
    let dates = tripInfo.departureDate ? ` for ${tripInfo.departureDate}` : '';
    if (tripInfo.returnDate) {
      dates += ` to ${tripInfo.returnDate}`;
    }
    const message = `Would you like me to find hotels and activities in ${destination}${dates}?`;
    handleSend(message);
  };

  const rendered = useMemo(() => messages.map((m, idx) => (
    <MessageBubble 
      key={idx} 
      role={m.role} 
      content={m.content} 
      timestamp={m.timestamp}
      onGenerateItinerary={m.role === 'assistant' ? (messageContent) => handleGenerateItinerary(messageContent) : null}
      onSaveTrip={m.role === 'assistant' ? (messageContent) => handleSaveTrip(messageContent) : null}
    />
    // eslint-disable-next-line react-hooks/exhaustive-deps
  )), [messages, dashboardData, userPreferences]);

  // Show onboarding form if not completed
  if (!onboardingComplete) {
    return (
      <div className="chat-page" style={{ 
        minHeight: '100vh', 
        background: 'linear-gradient(to bottom, #EAF9FF 0%, #ffffff 100%)',
        padding: '40px 20px'
      }}>
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
                    Online • Let's personalize your experience
                  </p>
                </div>
              </div>
            </div>
          </div>
        </header>
        <div style={{ marginTop: '40px' }}>
          <TripPreferencesForm onComplete={handleOnboardingComplete} />
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