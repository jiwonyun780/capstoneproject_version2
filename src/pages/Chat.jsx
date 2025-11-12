import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import MessageBubble from '../components/MessageBubble';
import ChatInput from '../components/ChatInput';
import TripPreferencesForm from '../components/TripPreferencesForm';
import {
  loadPreferenceWeights,
  normalizePreferenceWeights,
  storePreferenceWeights,
  DEFAULT_PREFERENCE_WEIGHTS,
  loadRawPreferenceValues,
} from '../utils/preferences';

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
            countryName = countryName.replace(/\s*\(the\)\s*$/i, '');
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

const CHAT_STORAGE_KEY = 'sta_chat_state_v1';
const DEFAULT_CATEGORY_FLAGS = { flights: false, hotels: false, activities: false };

const TRIP_DATE_PATTERNS = [
  /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*,\s*\d{2,4})?/gi,
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*,\s*\d{2,4})?/gi,
  /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)(?:\s*,\s*\d{2,4})?/gi,
  /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(?:\s*,\s*\d{2,4})?/gi,
  /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g,
  /\b\d{4}-\d{2}-\d{2}\b/g,
];

const AUTO_ITINERARY_PATTERNS = [
  /(generate|create|make|plan)\s+(an?\s+)?itinerar[yi]\b/i,
  /(generate|create|make|plan)\s+(an?\s+)?itineary\b/i,
  /(generate|create|make|plan)\s+(an?\s+)?itenerary\b/i,
  /\bgenerate\b.*\bitinerar[yi]\b/i,
  /\bopen\b.*\bitinerar[yi]\b/i,
  /\bshow\b.*\bitinerar[yi]\b/i,
  /\bitinerar[yi]\s+page\b/i,
];

const normalizeOrdinalSuffix = (value) =>
  typeof value === 'string' ? value.replace(/(\d{1,2})(st|nd|rd|th)/gi, '$1') : value;

const cleanPlaceString = (value) => {
  if (!value || typeof value !== 'string') return null;
  return value.replace(/\s+/g, ' ').replace(/[,\.;:!?]+$/g, '').trim() || null;
};

function extractTripInfo(messageContent) {
  if (!messageContent) {
    return { origin: null, destination: null, departureDate: null, returnDate: null };
  }

  const normalized = messageContent.replace(/\s+/g, ' ').trim();

  let origin = null;
  let destination = null;

  const fromToRegex = /\bfrom\s+([A-Za-z0-9&.\-' ]+?)\s+(?:to|→|->)\s+([A-Za-z0-9&.\-' ]+?)(?=$|[\.!,])/i;
  const fromToMatch = normalized.match(fromToRegex);

  if (fromToMatch) {
    origin = cleanPlaceString(fromToMatch[1]);
    destination = cleanPlaceString(fromToMatch[2]);
  } else {
    const toRegex = /\bto\s+([A-Za-z0-9&.\-' ]+?)(?=$|[\.!,])/i;
    const toMatch = normalized.match(toRegex);
    if (toMatch) {
      destination = cleanPlaceString(toMatch[1]);
    }

    const fromRegex = /\bfrom\s+([A-Za-z0-9&.\-' ]+?)(?=$|[\.!,])/i;
    const fromMatch = normalized.match(fromRegex);
    if (fromMatch) {
      origin = cleanPlaceString(fromMatch[1]);
    }
  }

  const datesFound = [];

  TRIP_DATE_PATTERNS.forEach((pattern) => {
    const matches = normalized.match(pattern);
    if (matches) {
      matches.forEach((raw) => {
        const cleaned = normalizeOrdinalSuffix(raw.replace(/,/g, ' ').trim()).replace(/\s+/g, ' ');
        if (cleaned && !datesFound.includes(cleaned)) {
          datesFound.push(cleaned);
        }
      });
    }
  });

  return {
    origin,
    destination,
    departureDate: datesFound[0] || null,
    returnDate: datesFound[1] || null,
  };
}

const loadStoredChatState = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Unable to read stored chat state', err);
    return null;
  }
};

const persistChatState = (state) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Unable to persist chat state', err);
  }
};

// Helper function to clean context data
function cleanContext(context) {
  if (!context) return context;

  const cleaned = { ...context };
  if (cleaned.user_location) {
    const location = { ...cleaned.user_location };
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
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const base = isLocalhost 
    ? 'http://localhost:8000'
    : (process.env.REACT_APP_API_BASE || 'http://localhost:8000');

  const cleanedContext = cleanContext(context);

  const requestBody = {
    messages,
    context: cleanedContext,
    session_id: sessionId
  };

  const resolvedPreferences = preferences?.preferences ? preferences.preferences : preferences;
  if (resolvedPreferences) {
    const normalizedPreferences = normalizePreferenceWeights(resolvedPreferences);
    requestBody.preferences = normalizedPreferences;
  }

  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });
  if (!res.ok) throw new Error('API error');
  return res.json();
}

export default function Chat({ pendingMessage, pendingMessageMetadata, onPendingMessageSent, onShowDashboard, showDashboard, dashboardData, onHideDashboard }) {
  const navigate = useNavigate();

  const storedChatState = useMemo(() => loadStoredChatState(), []);
  const storedRawPreferences = useMemo(() => loadRawPreferenceValues(), []);
  const storedWeightPreferences = useMemo(() => loadPreferenceWeights(), []);

  const [messages, setMessages] = useState(() => storedChatState?.messages || []);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState(null);
  const [context, setContext] = useState(null);
  const [, setIsLoadingContext] = useState(true);
  const [sessionId, setSessionId] = useState(() => storedChatState?.sessionId || null);
  const [userPreferences, setUserPreferences] = useState(
    () => storedChatState?.userPreferences || storedWeightPreferences || DEFAULT_PREFERENCE_WEIGHTS,
  );
  const [rawPreferenceValues, setRawPreferenceValues] = useState(
    () => storedRawPreferences || { budget: 3, quality: 3, convenience: 3 },
  );
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [requestedCategories, setRequestedCategories] = useState(
    () => storedChatState?.requestedCategories || { ...DEFAULT_CATEGORY_FLAGS },
  );
  const [tripContext, setTripContext] = useState(() => storedChatState?.tripContext || {});

  const mergeTripContext = useCallback((partial = {}) => {
    if (!partial) {
      return;
    }

    setTripContext((prevContext = {}) => {
      let updated = false;
      const nextContext = { ...(prevContext || {}) };

      const apply = (field, rawValue) => {
        if (rawValue === undefined || rawValue === null) return;

        let cleanedValue = rawValue;
        if (typeof rawValue === 'string') {
          if (field === 'origin' || field === 'destination') {
            cleanedValue = cleanPlaceString(rawValue);
          } else if (field === 'departureDate' || field === 'returnDate') {
            cleanedValue = normalizeOrdinalSuffix(rawValue.replace(/,/g, ' ').trim()).replace(/\s+/g, ' ');
          } else {
            cleanedValue = rawValue.trim();
          }
        }

        if (!cleanedValue) return;
        if (typeof cleanedValue === 'string' && cleanedValue.toLowerCase() === 'unknown') return;
        if (nextContext[field] === cleanedValue) return;

        nextContext[field] = cleanedValue;
        updated = true;
      };

      apply('origin', partial.origin);
      apply('destination', partial.destination);
      apply('originCode', partial.originCode);
      apply('destinationCode', partial.destinationCode);
      apply('departureDate', partial.departureDate);
      apply('returnDate', partial.returnDate);

      return updated ? nextContext : prevContext;
    });
  }, []);

  const scrollRef = useRef(null);
  const pendingMessageSentRef = useRef(false);
  const latestItineraryDataRef = useRef(null);

  const quickReplies = ['Plan a trip to Paris', 'Budget accommodations', 'Check weather'];

  const navigateToItinerary = useCallback(
    (explicitRouteInfo = null, extraState = {}) => {
      const baseRoute = explicitRouteInfo || {
        departure: tripContext?.origin || 'Unknown',
        destination: tripContext?.destination || 'Unknown',
        departureCode: tripContext?.originCode || '',
        destinationCode: tripContext?.destinationCode || '',
        date:
          tripContext?.departureDate ||
          new Date().toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
        returnDate: tripContext?.returnDate || null,
      };

      if (!baseRoute.destination || baseRoute.destination === 'Unknown') {
        setError('I need a destination to generate the itinerary. Please share where you want to go.');
        return false;
      }

      navigate('/itinerary', {
        state: {
          routeInfo: baseRoute,
          flights: [],
          outboundFlights: [],
          returnFlights: [],
          preferences: { preferences: userPreferences },
          ...extraState,
        },
      });
      return true;
    },
    [navigate, tripContext, userPreferences],
  );

  const requestItineraryGeneration = useCallback(
    (sourceMessage) => {
      const itineraryPayload = {
        type: 'generate_itinerary',
        route: {
          departure: tripContext?.origin,
          destination: tripContext?.destination,
          departureCode: tripContext?.originCode,
          destinationCode: tripContext?.destinationCode,
          date: tripContext?.departureDate,
          returnDate: tripContext?.returnDate,
        },
        sourceMessage,
      };

      mergeTripContext(itineraryPayload.route || {});
      navigateToItinerary(itineraryPayload.route, { itineraryRequest: itineraryPayload });
    },
    [mergeTripContext, navigateToItinerary, tripContext],
  );

  const handleOnboardingComplete = (preferencesPayload) => {
    const weightsSource =
      preferencesPayload?.weights ??
      preferencesPayload?.preferences ??
      preferencesPayload;
    const normalizedWeights = normalizePreferenceWeights(weightsSource || DEFAULT_PREFERENCE_WEIGHTS);
    setUserPreferences(normalizedWeights);
    setOnboardingComplete(true);
    const rawValues = preferencesPayload?.rawValues ?? null;
    if (rawValues) {
      setRawPreferenceValues(rawValues);
    }
    storePreferenceWeights(normalizedWeights, rawValues);

    setRequestedCategories({ ...DEFAULT_CATEGORY_FLAGS });
    setTripContext({});

    // Clear chat history when onboarding is completed (fresh conversation per session start)
    setMessages([
      {
        role: 'assistant',
        content: "Great! Preferences saved. Let me know how I can help with your trip.",
        timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setError(null);
    setIsTyping(false);
  };

  // Initialize context and welcome message
  useEffect(() => {
    let cancelled = false;

    const initializeChat = async () => {
      try {
        const locationContext = await getLocationContext();
        if (cancelled) return;

        setContext(locationContext);

        const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        setSessionId((prev) => prev || newSessionId);

        if (!storedChatState?.messages?.length) {
          let welcomeMessage = "Hi! I'm Miles, your AI travel assistant. I'm here to help you plan the perfect trip.";

          if (locationContext.user_location.city && locationContext.user_location.country) {
            welcomeMessage += ` I can see you're in ${locationContext.user_location.city}, ${locationContext.user_location.country}.`;
          } else if (locationContext.user_location.country) {
            welcomeMessage += ` I can see you're in ${locationContext.user_location.country}.`;
          }

          welcomeMessage += " Where would you like to go?";

          setMessages([
            {
              role: 'assistant',
              content: welcomeMessage,
              timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            },
          ]);
        }
      } catch (e) {
        console.error('Failed to initialize context:', e);
        if (storedChatState?.messages?.length || cancelled) {
          return;
        }
        setMessages([
          {
            role: 'assistant',
            content: "Hi! I'm Miles, your AI travel assistant. I'm here to help you plan the perfect trip. Where would you like to go?",
            timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      } finally {
        if (!cancelled) {
          setIsLoadingContext(false);
        }
      }
    };

    initializeChat();

    return () => {
      cancelled = true;
    };
  }, [storedChatState]);

  useEffect(() => {
    if (!onboardingComplete) {
      return;
    }

    persistChatState({
      messages,
      onboardingComplete,
      userPreferences,
      sessionId,
      requestedCategories,
      tripContext,
    });
  }, [messages, onboardingComplete, userPreferences, sessionId, requestedCategories, tripContext]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  // Handle pending message from Generate Itinerary / Save Trip button
  useEffect(() => {
    if (pendingMessage && !pendingMessageSentRef.current && onboardingComplete && !isTyping && messages.length > 0) {
      pendingMessageSentRef.current = true;
      const timer = setTimeout(() => {
        handleSend(pendingMessage, { metadata: pendingMessageMetadata });
        if (onPendingMessageSent) {
          onPendingMessageSent();
        }
        pendingMessageSentRef.current = false;
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [pendingMessage, pendingMessageMetadata, onboardingComplete, isTyping, messages.length, onPendingMessageSent]);

  const handleSend = async (text, options = {}) => {
    const lowerText = String(text || '').toLowerCase();
    const autoGenerateItinerary = AUTO_ITINERARY_PATTERNS.some((pattern) => pattern.test(text || ''));

    const messageTripInfo = extractTripInfo(text || '');
    if (
      messageTripInfo.origin ||
      messageTripInfo.destination ||
      messageTripInfo.departureDate ||
      messageTripInfo.returnDate
    ) {
      mergeTripContext(messageTripInfo);
    }

    setRequestedCategories((prev) => ({
      flights:
        autoGenerateItinerary ||
        prev.flights ||
        /(flight|flights|airline|airlines|plane|planes|fly|ticket|tickets)/.test(lowerText),
      hotels:
        autoGenerateItinerary ||
        prev.hotels ||
        /(hotel|hotels|accommodation|stay|lodging|resort)/.test(lowerText),
      activities:
        autoGenerateItinerary ||
        prev.activities ||
        /(activity|activities|tour|tours|thing to do|things to do|experience|experiences|attraction|attractions|event|events)/.test(lowerText),
    }));

    const metadata = options.metadata || null;
    const userMsg = { role: 'user', content: text, timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) };
    if (metadata) {
      userMsg.metadata = metadata;
    }
    setMessages((prev) => [...prev, userMsg]);
    setError(null);

    if (autoGenerateItinerary) {
      requestItineraryGeneration(text);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Great! Opening your itinerary page so we can build the plan there.',
          timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
      return;
    }

    setIsTyping(true);
    try {
      const payload = [...messages, userMsg];
      console.log('Sending to API:', { payload, context, sessionId, preferences: userPreferences });
      const data = await sendToApi(payload, context, sessionId, userPreferences);
      console.log('API Response:', data);
      const reply = data.reply || '';

      let dashboardPayload = null;
      if (data.amadeus_data) {
        dashboardPayload = prepareDashboardPayload(data.amadeus_data, userPreferences);
        if (dashboardPayload) {
          if (dashboardPayload.route) {
            mergeTripContext({
              origin: dashboardPayload.route.departure,
              destination: dashboardPayload.route.destination,
              originCode: dashboardPayload.route.departureCode,
              destinationCode: dashboardPayload.route.destinationCode,
              departureDate: dashboardPayload.route.date || dashboardPayload.route.departure_display,
              returnDate: dashboardPayload.route.returnDate || dashboardPayload.route.return_display,
            });
          }

          latestItineraryDataRef.current = dashboardPayload;
          if (onShowDashboard) {
            onShowDashboard(dashboardPayload);
          }
        } else if (onHideDashboard && latestItineraryDataRef.current) {
          onHideDashboard();
          latestItineraryDataRef.current = null;
        }
      }

      if (autoGenerateItinerary) {
        requestItineraryGeneration(text);
      }

      setMessages((prev) => [...prev, { role: 'assistant', content: reply, timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) }]);
    } catch (e) {
      console.error('API Error:', e);
      setError('Something went wrong. Please try again.');
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Sorry, there was an error reaching the server.', timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) }]);
    } finally {
      setIsTyping(false);
    }
  };

  const prepareDashboardPayload = (rawData, weightOverride = null) => {
    if (!rawData || rawData.error) {
      return null;
    }

    const outboundFlights = rawData.outboundFlights || [];
    const returnFlights = rawData.returnFlights || [];
    const fallbackFlights = outboundFlights.length > 0 ? outboundFlights : (rawData.flights || []);
    const routeInfo = rawData.route;

    if (!routeInfo) {
      return null;
    }

    const normalizedFromResponse = rawData.preferences
      ? normalizePreferenceWeights(rawData.preferences)
      : null;
    const normalizedWeights = weightOverride
      ? normalizePreferenceWeights(weightOverride)
      : normalizedFromResponse;

    return {
      ...rawData,
      route: routeInfo,
      flights: fallbackFlights,
      outboundFlights,
      returnFlights,
      priceData: rawData.priceData || [],
      hasRealData: rawData.hasRealData ?? rawData._is_real_data ?? true,
      preferences: normalizedWeights ? { preferences: normalizedWeights } : rawData.preferences,
    };
  };

  const handleGenerateItinerary = (messageContentOrData) => {
    let routeData = null;
    let messageContent = messageContentOrData;

    try {
      routeData = JSON.parse(messageContentOrData);
      if (routeData.messageContent) {
        messageContent = routeData.messageContent;
      }
    } catch (e) {
      messageContent = messageContentOrData;
    }

    const dashboardSource =
      (dashboardData && dashboardData.route)
        ? dashboardData
        : latestItineraryDataRef.current && latestItineraryDataRef.current.route
        ? latestItineraryDataRef.current
        : null;

    if (dashboardSource && dashboardSource.route) {
      mergeTripContext({
        origin: dashboardSource.route.departure,
        destination: dashboardSource.route.destination,
        originCode: dashboardSource.route.departureCode,
        destinationCode: dashboardSource.route.destinationCode,
        departureDate: dashboardSource.route.date || dashboardSource.route.departure_display,
        returnDate: dashboardSource.route.returnDate || dashboardSource.route.return_display || null,
      });

      navigateToItinerary(dashboardSource.route, {
        flights: dashboardSource.flights && dashboardSource.flights.length > 0
          ? dashboardSource.flights
          : dashboardSource.outboundFlights || [],
        outboundFlights: dashboardSource.outboundFlights || [],
        returnFlights: dashboardSource.returnFlights || [],
        priceData: dashboardSource.priceData || [],
      });
      return;
    }

    if (routeData && routeData.flightSummary) {
      const summary = routeData.flightSummary;
      const msgContent = routeData.messageContent || messageContent;

      const routeMatch = msgContent.match(/from\s+([^to]+)\s+to\s+([^\n]+)/i);
      let departure = summary.originCity || summary.origin || 'Unknown';
      let destination = summary.destCity || summary.destination || 'Unknown';
      let departureCode = summary.originCode || '';
      let destinationCode = summary.destCode || '';

      if (routeMatch) {
        departure = routeMatch[1].trim();
        destination = routeMatch[2].trim().split(/\s+/)[0];
      }

      const codeMatch = msgContent.match(/([A-Z]{3})\s*[→-]\s*([A-Z]{3})/);
      if (codeMatch && !departureCode && !destinationCode) {
        departureCode = codeMatch[1];
        destinationCode = codeMatch[2];
      }

      const datePatterns = [
        /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})/gi,
        /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})/gi,
      ];
      const dateMatches = [];
      datePatterns.forEach((pattern) => {
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
        departure,
        destination,
        departureCode,
        destinationCode,
        date:
          departureDate ||
          new Date().toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
        returnDate: returnDate || null,
      };

      const cachedFlights =
        latestItineraryDataRef.current?.flights ||
        latestItineraryDataRef.current?.outboundFlights ||
        [];

      navigateToItinerary(routeInfo, {
        flights: cachedFlights,
        outboundFlights: latestItineraryDataRef.current?.outboundFlights || [],
        returnFlights: latestItineraryDataRef.current?.returnFlights || [],
      });
      return;
    }

    const tripInfo = extractTripInfo(messageContent || '');

    if (
      tripInfo.origin ||
      tripInfo.destination ||
      tripInfo.departureDate ||
      tripInfo.returnDate
    ) {
      mergeTripContext(tripInfo);
    }

    let departure = tripInfo.origin || tripContext?.origin || 'Unknown';
    let destination = tripInfo.destination || tripContext?.destination || 'Unknown';
    let departureCode = tripContext?.originCode || '';
    let destinationCode = tripContext?.destinationCode || '';

    const routeMatch = (messageContent || '').match(
      /\bfrom\s+([A-Za-z0-9&.\-' ]+?)\s+(?:to|→|->)\s+([A-Za-z0-9&.\-' ]+?)(?=$|[\.!,])/i,
    );
    if (routeMatch) {
      departure = cleanPlaceString(routeMatch[1]) || departure;
      destination = cleanPlaceString(routeMatch[2]) || destination;
    }

    const codeMatch = (messageContent || '').match(/([A-Z]{3})\s*[→-]\s*([A-Z]{3})/);
    if (codeMatch) {
      if (!departureCode) {
        departureCode = codeMatch[1];
      }
      if (!destinationCode) {
        destinationCode = codeMatch[2];
      }
    }

    const departureDateValue =
      tripInfo.departureDate ||
      tripContext?.departureDate ||
      new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    const returnDateValue = tripInfo.returnDate || tripContext?.returnDate || null;

    if (!destination || destination === 'Unknown') {
      setError('I need a destination to generate the itinerary. Please share where you want to go.');
      return;
    }

    const routeInfo = {
      departure: departure || 'Unknown',
      destination,
      departureCode,
      destinationCode,
      date: departureDateValue,
      returnDate: returnDateValue,
    };

    mergeTripContext(routeInfo);

    navigateToItinerary(routeInfo);
  };

  const handleSaveTrip = (messageContent) => {
    const tripInfo = extractTripInfo(messageContent || '');
    const destination = tripInfo.destination || 'your destination';
    let dates = tripInfo.departureDate ? ` for ${tripInfo.departureDate}` : '';
    if (tripInfo.returnDate) {
      dates += ` to ${tripInfo.returnDate}`;
    }
    const message = `Would you like me to find hotels and activities in ${destination}${dates}?`;
    handleSend(message);
  };

  const itineraryEligible = useMemo(() => {
    return Object.values(requestedCategories).filter(Boolean).length >= 2;
  }, [requestedCategories]);

  const rendered = useMemo(() => messages.map((m, idx) => (
    <MessageBubble 
      key={idx} 
      role={m.role} 
      content={m.content} 
      timestamp={m.timestamp}
      onGenerateItinerary={m.role === 'assistant' && itineraryEligible ? (messageContent) => handleGenerateItinerary(messageContent) : null}
      onSaveTrip={m.role === 'assistant' ? (messageContent) => handleSaveTrip(messageContent) : null}
    />
  )), [messages, dashboardData, userPreferences, itineraryEligible]);

  if (!onboardingComplete) {
    // When showing onboarding we explicitly clear stored chat state to start fresh
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(CHAT_STORAGE_KEY);
    }

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
          <TripPreferencesForm onComplete={handleOnboardingComplete} defaultRawValues={rawPreferenceValues} />
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
                  Online • Ready to plan your trip
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>
      <div className="chat-content">
        <div className="chat-messages" ref={scrollRef}>
          {rendered}
          {isTyping && (
            <div className="typing">
              <span className="dot"></span>
              <span className="dot"></span>
              <span className="dot"></span>
            </div>
          )}
        </div>
        <div className="chat-input-dock">
          {error && <div className="error-message">{error}</div>}
          <ChatInput onSend={handleSend} disabled={isTyping} />
        </div>
      </div>
    </div>
  );
}