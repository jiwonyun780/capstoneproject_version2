import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ScrollArea } from '../components/ui/scroll-area';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { saveCurrentItinerary, loadCurrentItinerary, saveConversation, saveOptimizedItinerary, loadOptimizedItinerary, loadTripState, saveTripState } from '../utils/tripState';

// Helper function to parse duration string to hours
const parseDuration = (durationStr) => {
  if (!durationStr) return 0;
  if (typeof durationStr === 'number') return durationStr;
  if (durationStr.startsWith('PT')) {
    const hoursMatch = durationStr.match(/(\d+)H/);
    const minutesMatch = durationStr.match(/(\d+)M/);
    const hours = hoursMatch ? parseInt(hoursMatch[1]) : 0;
    const minutes = minutesMatch ? parseInt(minutesMatch[1]) : 0;
    return hours + minutes / 60;
  }
  const hoursMatch = durationStr.match(/(\d+)h/);
  const minutesMatch = durationStr.match(/(\d+)m/);
  const hours = hoursMatch ? parseInt(hoursMatch[1]) : 0;
  const minutes = minutesMatch ? parseInt(minutesMatch[1]) : 0;
  return hours + minutes / 60;
};

// Calculate convenience score: 100 – (0.4×normalized_duration + 0.3×normalized_stops + 0.3×normalized_price)
const calculateConvenienceScore = (flights, totalPrice, maxPrice) => {
  if (!flights || flights.length === 0) return 0;
  
  const totalDuration = flights.reduce((sum, f) => sum + parseDuration(f.duration || f._duration || '0h'), 0);
  const totalStops = flights.reduce((sum, f) => sum + (f.stops || 0), 0);
  
  // Normalize values to 0-1 range
  const maxDuration = 24; // Assume max 24 hours for normalization
  const maxStops = 4; // Assume max 4 stops
  const maxPriceValue = maxPrice > 0 ? maxPrice : 2000; // Fallback max price
  
  const normalizedDuration = Math.min(totalDuration / maxDuration, 1);
  const normalizedStops = Math.min(totalStops / maxStops, 1);
  const normalizedPrice = Math.min(totalPrice / maxPriceValue, 1);
  
  // Calculate score: 100 – (0.4×normalized_duration + 0.3×normalized_stops + 0.3×normalized_price)
  const score = 100 - (0.4 * normalizedDuration + 0.3 * normalizedStops + 0.3 * normalizedPrice) * 100;
  return Math.max(0, Math.min(100, Math.round(score))); // Clamp between 0-100
};

// Format date for display (accepts Date object or date string)
const formatDate = (dateInput) => {
  if (!dateInput) return '';
  try {
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
    // Check if date is valid
    if (isNaN(date.getTime())) {
      console.warn('Invalid date:', dateInput);
      return '';
    }
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  } catch (e) {
    console.warn('Error formatting date:', dateInput, e);
    return '';
  }
};

// Parse date string to Date object (handles various formats including ISO YYYY-MM-DD)
const parseDate = (dateStr) => {
  if (!dateStr) {
    console.warn('parseDate: No date string provided');
    return null;
  }
  try {
    // If already a Date object, return it
    if (dateStr instanceof Date) {
      return dateStr;
    }
    
    if (typeof dateStr !== 'string') {
      console.warn('parseDate: dateStr is not a string:', typeof dateStr, dateStr);
      return null;
    }
    
    const cleaned = dateStr.trim();
    
    // 1. Try ISO format first (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)
    if (cleaned.match(/^\d{4}-\d{2}-\d{2}/)) {
      // Parse as local date to avoid timezone issues
      const parts = cleaned.split('T')[0].split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1; // Month is 0-indexed
        const day = parseInt(parts[2]);
        const date = new Date(year, month, day);
        if (!isNaN(date.getTime())) {
          // Normalize to midnight to avoid timezone issues
          date.setHours(0, 0, 0, 0);
          return date;
        }
      }
      // Fallback to standard Date parsing
      const date = new Date(cleaned);
      if (!isNaN(date.getTime())) {
        date.setHours(0, 0, 0, 0);
        return date;
      }
    }
    
    // 2. Try formats like "Nov 20, 2025" or "November 20, 2025"
    // Pattern: Month Day, Year
    const monthDayYearPattern = /(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(\d{4})/i;
    const monthDayMatch = cleaned.match(monthDayYearPattern);
    if (monthDayMatch) {
      const date = new Date(cleaned);
      if (!isNaN(date.getTime())) {
        const year = date.getFullYear();
        // Check if year is reasonable (not 2001 or before 2020)
        if (year >= 2020) {
          return date;
        } else {
          // Try to extract year from match and fix it
          const extractedYear = parseInt(monthDayMatch[3]);
          if (extractedYear >= 2020) {
            const fixedDate = new Date(cleaned);
            fixedDate.setFullYear(extractedYear);
            if (!isNaN(fixedDate.getTime())) {
              return fixedDate;
            }
          }
        }
      }
    }
    
    // 3. Try formats like "20 Nov 2025" or "20 November 2025"
    const dayMonthYearPattern = /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})/i;
    const dayMonthMatch = cleaned.match(dayMonthYearPattern);
    if (dayMonthMatch) {
      const date = new Date(cleaned);
      if (!isNaN(date.getTime())) {
        const year = date.getFullYear();
        if (year >= 2020) {
          return date;
        } else {
          // Try to extract year from match and fix it
          const extractedYear = parseInt(dayMonthMatch[3]);
          if (extractedYear >= 2020) {
            const fixedDate = new Date(cleaned);
            fixedDate.setFullYear(extractedYear);
            if (!isNaN(fixedDate.getTime())) {
              return fixedDate;
            }
          }
        }
      }
    }
    
    // 4. Try formats like "November 20" or "Nov 20" (without year - infer year)
    const monthDayOnlyPattern = /(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})/i;
    const monthDayOnlyMatch = cleaned.match(monthDayOnlyPattern);
    if (monthDayOnlyMatch && !cleaned.match(/\d{4}/)) { // Only if no year found
      const monthName = monthDayOnlyMatch[1];
      const day = parseInt(monthDayOnlyMatch[2]);
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth();
      
      // Convert month name to number
      const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                         'july', 'august', 'september', 'october', 'november', 'december'];
      const monthAbbrevs = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
                           'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      
      const monthLower = monthName.toLowerCase();
      let monthNum;
      if (monthNames.includes(monthLower)) {
        monthNum = monthNames.indexOf(monthLower);
      } else if (monthAbbrevs.includes(monthLower)) {
        monthNum = monthAbbrevs.indexOf(monthLower);
      }
      
      if (monthNum !== undefined && day >= 1 && day <= 31) {
        // If the date has already passed this year, use next year
        let year = currentYear;
        const testDate = new Date(currentYear, monthNum, day);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        testDate.setHours(0, 0, 0, 0);
        
        if (testDate < today) {
          year = currentYear + 1;
        }
        
        const date = new Date(year, monthNum, day);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }
    
    // 5. Try standard Date constructor (handles most formats)
    const date = new Date(cleaned);
    if (!isNaN(date.getTime())) {
      // Check if the year is reasonable (not 2001 or before 2020)
      const year = date.getFullYear();
      if (year < 2020) {
        // If year is 2001 or earlier, try to extract year from the string and fix it
        const yearMatch = cleaned.match(/\b(20\d{2})\b/);
        if (yearMatch && parseInt(yearMatch[1]) >= 2020) {
          const correctYear = parseInt(yearMatch[1]);
          const fixedDate = new Date(cleaned);
          fixedDate.setFullYear(correctYear);
          if (!isNaN(fixedDate.getTime())) {
            return fixedDate;
          }
        }
      } else {
        return date;
      }
    }
    
    console.warn('parseDate: Could not parse date string:', dateStr);
    return null;
  } catch (e) {
    console.warn('parseDate: Error parsing date:', dateStr, e);
    return null;
  }
};

export default function OptimizedItinerary() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [itineraryData, setItineraryData] = useState(null);
  const [error, setError] = useState(null);
  const [expandedDays, setExpandedDays] = useState(new Set([1]));
  const [expandedItems, setExpandedItems] = useState(new Set());
  const [showPreferencesModal, setShowPreferencesModal] = useState(false);
  
  // Get preferences from location state or tripState or localStorage, with defaults
  const getInitialPreferences = () => {
    // First try from location state
    if (location.state?.preferences?.preferences) {
      const prefs = location.state.preferences.preferences;
      // Validate preferences are numbers
      if (typeof prefs.budget === 'number' && typeof prefs.quality === 'number' && typeof prefs.convenience === 'number') {
        return prefs;
      }
    }
    // Try tripState (most reliable for persistence)
    try {
      const { loadTripState } = require('../utils/tripState');
      const currentTripState = loadTripState();
      if (currentTripState?.preferences) {
        const prefs = currentTripState.preferences;
        // Validate preferences are numbers
        if (typeof prefs.budget === 'number' && typeof prefs.quality === 'number' && typeof prefs.convenience === 'number') {
          return prefs;
        }
      }
    } catch (e) {
      console.warn('Error loading preferences from tripState:', e);
    }
    // Try localStorage
    try {
      const stored = localStorage.getItem('travelPreferences');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.preferences) {
          const prefs = parsed.preferences;
          // Validate preferences are numbers
          if (typeof prefs.budget === 'number' && typeof prefs.quality === 'number' && typeof prefs.convenience === 'number') {
            return prefs;
          }
        }
      }
    } catch (e) {
      console.warn('Error loading preferences from localStorage:', e);
    }
    // Default: equal weighting
    return { budget: 0.33, quality: 0.33, convenience: 0.34 };
  };
  
  const [preferences, setPreferences] = useState(getInitialPreferences());
  
  // Ensure preferences are saved to tripState when loaded
  useEffect(() => {
    if (preferences && Object.keys(preferences).length > 0) {
      try {
        const { saveTripState, loadTripState } = require('../utils/tripState');
        const currentState = loadTripState();
        if (!currentState.preferences || 
            currentState.preferences.budget !== preferences.budget ||
            currentState.preferences.quality !== preferences.quality ||
            currentState.preferences.convenience !== preferences.convenience) {
          saveTripState({
            ...currentState,
            preferences: preferences
          });
        }
      } catch (e) {
        console.warn('Error saving preferences to tripState:', e);
      }
    }
  }, [preferences]);

  // Memoize tripState to avoid re-reading on every render
  const tripState = useMemo(() => {
    try {
      const { loadTripState } = require('../utils/tripState');
      return loadTripState();
    } catch (e) {
      console.warn('Could not load tripState:', e);
      return null;
    }
  }, []); // Only load once on mount
  
  // Memoize route info based on location.state and tripState
  // Also try to load latest tripState to get most up-to-date origin/destination
  const routeInfo = useMemo(() => {
    const routeInfoFromState = location.state?.routeInfo || {};
    
    // Try to load latest tripState for this calculation
    let latestTripState = tripState;
    try {
      const { loadTripState } = require('../utils/tripState');
      const loaded = loadTripState();
      if (loaded && (loaded.origin || loaded.destination)) {
        latestTripState = loaded;
      }
    } catch (e) {
      // Use memoized tripState if load fails
    }
    
    const route = {
      departure: routeInfoFromState.departure || latestTripState?.origin || 'Unknown',
      destination: routeInfoFromState.destination || latestTripState?.destination || 'Unknown',
      departureCode: routeInfoFromState.departureCode || latestTripState?.originCode || '',
      destinationCode: routeInfoFromState.destinationCode || latestTripState?.destinationCode || '',
      date: routeInfoFromState.date || routeInfoFromState.departure_display || latestTripState?.startDate || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      returnDate: routeInfoFromState.returnDate || routeInfoFromState.return_display || latestTripState?.endDate || null
    };
    
    return route;
  }, [location.state?.routeInfo, tripState]);
  
  // Memoize flights based on location.state
  const allFlights = useMemo(() => {
    const flights = location.state?.flights || tripState?.flights || [];
    const outboundFlights = location.state?.outboundFlights || [];
    const returnFlights = location.state?.returnFlights || [];
    
    return [...outboundFlights, ...returnFlights].length > 0 
      ? [...outboundFlights, ...returnFlights] 
      : flights;
  }, [location.state?.flights, location.state?.outboundFlights, location.state?.returnFlights, tripState?.flights]);

  const generateItinerary = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Re-read tripState inside callback to get latest data
      let currentTripState = null;
      try {
        currentTripState = loadTripState();
        console.log('Loaded tripState in generateItinerary:', currentTripState);
      } catch (e) {
        console.warn('Could not load tripState:', e);
      }
      
      // FIRST: Try to restore from tripState.optimizedItinerary
      if (currentTripState?.optimizedItinerary) {
        console.log('Found optimized itinerary in tripState, restoring...');
        setItineraryData(currentTripState.optimizedItinerary);
        setLoading(false);
        return;
      }
      
      // SECOND: Try to restore from localStorage
      const savedItinerary = loadOptimizedItinerary();
      if (savedItinerary?.optimizedItinerary) {
        console.log('Found saved itinerary in localStorage, restoring...');
        // Restore to tripState
        saveOptimizedItinerary(savedItinerary.optimizedItinerary);
        // Restore other related data
        if (savedItinerary.selectedOutboundFlight) {
          const { selectOutboundFlight } = require('../utils/tripState');
          selectOutboundFlight(savedItinerary.selectedOutboundFlight);
        }
        if (savedItinerary.selectedReturnFlight) {
          const { selectReturnFlight } = require('../utils/tripState');
          selectReturnFlight(savedItinerary.selectedReturnFlight);
        }
        if (savedItinerary.selectedHotel) {
          const { selectHotel } = require('../utils/tripState');
          selectHotel(savedItinerary.selectedHotel);
        }
        if (savedItinerary.mustDoActivities) {
          const { recordMustDoActivities } = require('../utils/tripState');
          recordMustDoActivities(savedItinerary.mustDoActivities);
        }
        if (savedItinerary.preferenceWeights) {
          saveTripState({
            ...currentTripState,
            preferenceWeights: savedItinerary.preferenceWeights
          });
        }
        setItineraryData(savedItinerary.optimizedItinerary);
        setLoading(false);
        return;
      }
      
      // Get current route info (re-compute to ensure we have latest)
      const routeInfoFromState = location.state?.routeInfo || {};
      const currentRouteInfo = {
        departure: routeInfoFromState.departure || currentTripState?.origin || 'Unknown',
        destination: routeInfoFromState.destination || currentTripState?.destination || 'Unknown',
        departureCode: routeInfoFromState.departureCode || currentTripState?.originCode || '',
        destinationCode: routeInfoFromState.destinationCode || currentTripState?.destinationCode || '',
        date: routeInfoFromState.date || routeInfoFromState.departure_display || currentTripState?.startDate || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        returnDate: routeInfoFromState.returnDate || routeInfoFromState.return_display || currentTripState?.endDate || null
      };
      
      // Get current flights
      const flights = location.state?.flights || currentTripState?.flights || [];
      const outboundFlights = location.state?.outboundFlights || [];
      const returnFlights = location.state?.returnFlights || [];
      const currentAllFlights = [...outboundFlights, ...returnFlights].length > 0 
        ? [...outboundFlights, ...returnFlights] 
        : flights;
      
      // Check if we should update existing itinerary instead of creating new one
      const shouldUpdateExisting = location.state?.updateExistingItinerary;
      // Only load existing itinerary if we're explicitly updating it
      // For new trips, don't load old itinerary data
      const existingItineraryData = shouldUpdateExisting 
        ? (location.state?.existingItineraryData || loadCurrentItinerary())
        : null;
      
      if (shouldUpdateExisting && existingItineraryData) {
        console.log('Updating existing itinerary with new data');
        
        // Load existing itinerary
        const existingDays = existingItineraryData.days || [];
        const existingRouteInfo = existingItineraryData.routeInfo || routeInfo;
        
        // Get new flight data from location.state (from chat)
        const newOutboundFlight = location.state?.optimalOutboundFlight;
        const newReturnFlight = location.state?.optimalReturnFlight;
        const newOutboundFlights = location.state?.outboundFlights || [];
        const newReturnFlights = location.state?.returnFlights || [];
        
        // Update flights in existing days
        const updatedDays = [...existingDays];
        
        // Update Day 1 with new outbound flight if available
        if (newOutboundFlight && updatedDays.length > 0) {
          const day1 = updatedDays[0];
          if (!day1.items) day1.items = [];
          
          // Find flight item or "Flight Needed" placeholder in Day 1
          const flightItemIndex = day1.items.findIndex(item => 
            item.type === 'flight' || 
            (item.type === 'activity' && item.title === 'Flight Needed')
          );
          
          const departureTime = newOutboundFlight.departure?.match(/(\d{1,2}:\d{2})/)?.[1] || 'TBD';
          const flightItem = {
            type: 'flight',
            title: `✈️ Flight to ${routeInfo.destination || 'destination'} (${newOutboundFlight.airline || 'Airline'} ${newOutboundFlight.flightNumber || ''})`,
            time: departureTime,
            details: {
              departure: newOutboundFlight.departure || `${existingRouteInfo.departureCode || 'N/A'} ${departureTime}`,
              arrival: newOutboundFlight.arrival || `${existingRouteInfo.destinationCode || 'N/A'} TBD`,
              duration: newOutboundFlight.duration ? (typeof newOutboundFlight.duration === 'number' ? `${newOutboundFlight.duration.toFixed(1)}h` : newOutboundFlight.duration) : 'N/A',
              stops: newOutboundFlight.stops || 0,
              price: newOutboundFlight.price || 0,
              airline: newOutboundFlight.airline,
              flightNumber: newOutboundFlight.flightNumber
            }
          };
          
          if (flightItemIndex >= 0) {
            // Replace existing flight or placeholder
            day1.items[flightItemIndex] = flightItem;
          } else {
            // Add new flight at the beginning of Day 1
            day1.items.unshift(flightItem);
          }
        }
        
        // Update last day with new return flight if available (for round trips)
        if (newReturnFlight && updatedDays.length > 1) {
          const lastDay = updatedDays[updatedDays.length - 1];
          if (!lastDay.items) lastDay.items = [];
          
          // Find return flight item or "Return Flight Needed" placeholder in last day
          const flightItemIndex = lastDay.items.findIndex(item => 
            item.type === 'flight' || 
            (item.type === 'activity' && (item.title === 'Return Flight Needed' || item.title === 'Flight Needed'))
          );
          
          const departureTime = newReturnFlight.departure?.match(/(\d{1,2}:\d{2})/)?.[1] || 'TBD';
          const flightItem = {
            type: 'flight',
            title: `✈️ Return Flight to ${routeInfo.departure || 'home city'}`,
            time: departureTime,
            details: {
              departure: newReturnFlight.departure || `${existingRouteInfo.destinationCode || 'N/A'} ${departureTime}`,
              arrival: newReturnFlight.arrival || `${existingRouteInfo.departureCode || 'N/A'} TBD`,
              duration: newReturnFlight.duration ? (typeof newReturnFlight.duration === 'number' ? `${newReturnFlight.duration.toFixed(1)}h` : newReturnFlight.duration) : 'N/A',
              stops: newReturnFlight.stops || 0,
              price: newReturnFlight.price || 0,
              airline: newReturnFlight.airline,
              flightNumber: newReturnFlight.flightNumber
            }
          };
          
          if (flightItemIndex >= 0) {
            // Replace existing return flight or placeholder
            lastDay.items[flightItemIndex] = flightItem;
          } else {
            // Add new return flight at the end of last day
            lastDay.items.push(flightItem);
          }
        }
        
        // Update itineraryData with merged data
        const updatedItineraryData = {
          ...existingItineraryData,
          days: updatedDays,
          routeInfo: existingRouteInfo,
          // Update flight reference if new flight was added
          flight: newOutboundFlight || existingItineraryData.flight,
          // Recalculate totals if needed
          total_price: (existingItineraryData.total_price || 0) + 
                       (newOutboundFlight?.price || 0) + 
                       (newReturnFlight?.price || 0)
        };
        
        setItineraryData(updatedItineraryData);
        setLoading(false);
        console.log('Updated existing itinerary with new flight data');
        return;
      }

      // Validate routeInfo
      if (!currentRouteInfo.destination && !currentRouteInfo.destinationCode) {
        throw new Error('Destination information is missing. Please go back and search for flights again.');
      }

      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const base = isLocalhost 
        ? 'http://localhost:8000'
        : (process.env.REACT_APP_API_BASE || 'http://localhost:8000');

      // Get dates from tripState first, fallback to routeInfo
      // currentTripState is already loaded above
      
      const startDateStr = currentTripState?.startDate || currentRouteInfo.date || currentRouteInfo.departure_display;
      const endDateStr = currentTripState?.endDate || currentRouteInfo.returnDate || currentRouteInfo.return_display;
      
      const departureDate = parseDate(startDateStr);
      const returnDate = endDateStr ? parseDate(endDateStr) : null;
      
      // Validate dates
      if (!departureDate) {
        console.error('Invalid departure date:', startDateStr);
        throw new Error(`Invalid departure date: ${startDateStr}`);
      }
      
      // Normalize dates to midnight to avoid timezone issues
      departureDate.setHours(0, 0, 0, 0);
      if (returnDate) {
        returnDate.setHours(0, 0, 0, 0);
      }
      
      // Calculate actual trip duration
      // For round trip: use returnDate
      // For one-way: only show departure day (1 day itinerary)
      let tripEndDate = returnDate;
      let isRoundTrip = !!returnDate;
      
      if (!tripEndDate) {
        // One-way trip: only show departure day
        tripEndDate = new Date(departureDate); // Same as departure date for one-way
        tripEndDate.setHours(0, 0, 0, 0);
      }
      
      console.log('Date parsing result:', {
        startDateStr,
        endDateStr,
        departureDate: departureDate.toISOString().split('T')[0],
        returnDate: returnDate ? returnDate.toISOString().split('T')[0] : null,
        tripEndDate: tripEndDate.toISOString().split('T')[0]
      });
      
      // Calculate check-in and check-out dates for hotel search
      // For hotel search, use a reasonable check-out date even for one-way
      const checkInDate = departureDate.toISOString().split('T')[0];
      const checkOutDateForHotel = returnDate 
        ? returnDate.toISOString().split('T')[0]
        : new Date(departureDate.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 2 days for hotel search
      
      // Calculate actual trip duration in days for itinerary display
      // Include both start and end dates: Nov 20 to Nov 27 = 8 days
      // Calculate days difference (inclusive of both start and end dates)
      const daysDiff = Math.floor((tripEndDate - departureDate) / (1000 * 60 * 60 * 24));
      const tripDurationDays = Math.max(1, daysDiff + 1); // Always at least 1 day
      
      console.log('Trip duration calculation:', {
        departureDate: departureDate.toISOString().split('T')[0],
        tripEndDate: tripEndDate.toISOString().split('T')[0],
        isRoundTrip,
        tripDurationDays,
        daysDiff: daysDiff,
        calculated: Math.floor((tripEndDate - departureDate) / (1000 * 60 * 60 * 24))
      });
      // First, fetch hotels and activities
      // Only fetch if destination is valid (not "Unknown")
      let hotelsData = [];
      let activitiesData = [];
      
      const destinationCode = currentRouteInfo.destinationCode || '';
      const destinationName = currentRouteInfo.destination || '';
      const hasValidDestination = destinationCode && destinationCode !== '' || 
                                   (destinationName && destinationName !== 'Unknown' && destinationName !== '');
      
      console.log('fetchItineraryData parameters:', {
        destinationCode,
        destinationName,
        checkInDate,
        checkOutDateForHotel,
        hasValidDestination
      });
      
      if (hasValidDestination) {
        try {
          const requestBody = {
            destinationCode: destinationCode || destinationName,
            destinationName: destinationName || destinationCode,
            checkIn: checkInDate,
            checkOut: checkOutDateForHotel,
            adults: 1
          };
          
          console.log('Calling fetchItineraryData with:', JSON.stringify(requestBody, null, 2));
          console.log('Date values:', {
            checkInDate,
            checkOutDateForHotel,
            checkInType: typeof checkInDate,
            checkOutType: typeof checkOutDateForHotel
          });
          
          const dataResponse = await fetch(`${base}/api/fetchItineraryData`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
          });

          console.log('fetchItineraryData response status:', dataResponse.status);

          if (dataResponse.ok) {
            const dataResult = await dataResponse.json();
            console.log('fetchItineraryData result:', {
              ok: dataResult.ok,
              hotelsCount: dataResult.hotels?.length || 0,
              activitiesCount: dataResult.activities?.length || 0,
              error: dataResult.error
            });
            
            if (dataResult.ok) {
              hotelsData = dataResult.hotels || [];
              activitiesData = dataResult.activities || [];
              console.log(`Successfully fetched ${hotelsData.length} hotels and ${activitiesData.length} activities`);
            } else {
              console.warn('fetchItineraryData returned error:', dataResult.error);
              // Continue without hotels/activities
            }
          } else {
            const errorText = await dataResponse.text();
            console.warn('fetchItineraryData request failed:', dataResponse.status, errorText);
            // Continue without hotels/activities
          }
        } catch (e) {
          console.error('Error fetching hotels and activities:', e);
          // Continue without hotels/activities
        }
      } else {
        console.warn('No valid destination - skipping hotels/activities fetch', {
          destinationCode,
          destinationName
        });
      }
      
      console.log(`Final: Fetched ${hotelsData.length} hotels and ${activitiesData.length} activities`);

      // Prepare flights data - use optimalFlight from tripState if available
      // Include tripState.flights if allFlights is empty
      let flightsToUse = currentAllFlights.length > 0 ? currentAllFlights : (currentTripState?.flights || []);
      let optimalOutboundFlight = null;
      let optimalReturnFlight = null;
      
      // First, check if optimal flights were explicitly passed in location.state
      if (location.state?.optimalOutboundFlight) {
        optimalOutboundFlight = location.state.optimalOutboundFlight;
        console.log('Using optimalOutboundFlight from location.state:', optimalOutboundFlight?.flightNumber);
      }
      if (location.state?.optimalReturnFlight) {
        optimalReturnFlight = location.state.optimalReturnFlight;
        console.log('Using optimalReturnFlight from location.state:', optimalReturnFlight?.flightNumber);
      }
      
      // Helper function to extract airport code from flight (must be declared before use)
      const getFlightOrigin = (flight) => {
        if (!flight) return null;
        return flight.origin || 
               flight.departureAirport || 
               flight.departureCode ||
               (flight.departure?.match(/([A-Z]{3})/)?.[1]) ||
               null;
      };
      
      const getFlightDestination = (flight) => {
        if (!flight) return null;
        return flight.destination || 
               flight.arrivalAirport || 
               flight.arrivalCode ||
               (flight.arrival?.match(/([A-Z]{3})/)?.[1]) ||
               null;
      };
      
      // Helper function to check if a flight is a dummy/placeholder
      const isDummyFlight = (flight) => {
        if (!flight || typeof flight !== 'object') return true;
        if (flight.id === 'dummy-flight') return true;
        if (flight.flightNumber === 'FL123' && flight.airline === 'Airline') return true;
        // Check if it's an empty object
        if (Object.keys(flight).length === 0) return true;
        return false;
      };
      
      // Get origin and destination codes for matching
      // Try to extract from flight data if not in tripState
      let originCodeForMatching = currentTripState?.originCode || currentRouteInfo.departureCode;
      let destinationCodeForMatching = currentTripState?.destinationCode || currentRouteInfo.destinationCode;
      
      // Also try to update tripState.origin/destination from flight data if missing
      if (!currentTripState?.origin && (outboundFlights?.length > 0 || currentTripState?.flights?.length > 0)) {
        const flightToCheck = outboundFlights?.[0] || currentTripState?.flights?.[0] || currentTripState?.optimalFlight;
        if (flightToCheck) {
          const flightOrigin = getFlightOrigin(flightToCheck);
          const flightDestination = getFlightDestination(flightToCheck);
          
          // Try to get city names from flight data
          // This is a fallback if tripState.origin is null
          if (flightOrigin && !originCodeForMatching) {
            originCodeForMatching = flightOrigin;
            console.log('Extracted originCode from flight:', originCodeForMatching);
          }
          if (flightDestination && !destinationCodeForMatching) {
            destinationCodeForMatching = flightDestination;
            console.log('Extracted destinationCode from flight:', destinationCodeForMatching);
          }
        }
      }
      
      // If codes are still empty, try to extract from tripState.flights or tripState.optimalFlight
      if ((!originCodeForMatching || !destinationCodeForMatching) && currentTripState?.flights?.length > 0) {
        const firstFlight = currentTripState.flights[0];
        const flightOrigin = getFlightOrigin(firstFlight);
        const flightDestination = getFlightDestination(firstFlight);
        if (flightOrigin && !originCodeForMatching) {
          originCodeForMatching = flightOrigin;
          console.log('Extracted originCode from tripState.flights:', originCodeForMatching);
        }
        if (flightDestination && !destinationCodeForMatching) {
          destinationCodeForMatching = flightDestination;
          console.log('Extracted destinationCode from tripState.flights:', destinationCodeForMatching);
        }
      }
      
      // If still empty, try from tripState.optimalFlight
      if ((!originCodeForMatching || !destinationCodeForMatching) && currentTripState?.optimalFlight) {
        const flightOrigin = getFlightOrigin(currentTripState.optimalFlight);
        const flightDestination = getFlightDestination(currentTripState.optimalFlight);
        if (flightOrigin && !originCodeForMatching) {
          originCodeForMatching = flightOrigin;
          console.log('Extracted originCode from tripState.optimalFlight:', originCodeForMatching);
        }
        if (flightDestination && !destinationCodeForMatching) {
          destinationCodeForMatching = flightDestination;
          console.log('Extracted destinationCode from tripState.optimalFlight:', destinationCodeForMatching);
        }
      }
      
      // If not in location.state, try to get from tripState
      // Use tripState.optimalFlight if available, even if codes don't match (codes might be missing)
      if (!optimalOutboundFlight && currentTripState?.optimalFlight) {
        const flightOrigin = getFlightOrigin(currentTripState.optimalFlight);
        const flightDestination = getFlightDestination(currentTripState.optimalFlight);
        
        // If we have codes, try to match; otherwise use it directly if it looks like an outbound flight
        if (originCodeForMatching && destinationCodeForMatching) {
          if (flightOrigin === originCodeForMatching && flightDestination === destinationCodeForMatching) {
            optimalOutboundFlight = currentTripState.optimalFlight;
            console.log('Using tripState.optimalFlight as outbound (matched by codes):', optimalOutboundFlight?.flightNumber);
          }
        } else {
          // No codes available - use optimalFlight as outbound if it's not clearly a return flight
          // Check if it's likely a return by seeing if origin matches destination city name
          const isLikelyReturn = currentTripState?.destination && 
            (flightOrigin?.toLowerCase().includes(currentTripState.destination.toLowerCase()) ||
             flightDestination?.toLowerCase().includes(currentTripState.origin?.toLowerCase() || ''));
          
          if (!isLikelyReturn) {
            optimalOutboundFlight = currentTripState.optimalFlight;
            console.log('Using tripState.optimalFlight as outbound (no codes, assumed outbound):', optimalOutboundFlight?.flightNumber);
          }
        }
      }
      
      if (!optimalReturnFlight && currentTripState?.optimalFlight && currentTripState?.optimalFlight !== optimalOutboundFlight) {
        const flightOrigin = getFlightOrigin(currentTripState.optimalFlight);
        const flightDestination = getFlightDestination(currentTripState.optimalFlight);
        
        if (originCodeForMatching && destinationCodeForMatching) {
          if (flightOrigin === destinationCodeForMatching && flightDestination === originCodeForMatching) {
            optimalReturnFlight = currentTripState.optimalFlight;
            console.log('Using tripState.optimalFlight as return (matched by codes):', optimalReturnFlight?.flightNumber);
          }
        } else {
          // Check if it's likely a return flight
          const isLikelyReturn = currentTripState?.destination && 
            (flightOrigin?.toLowerCase().includes(currentTripState.destination.toLowerCase()) ||
             flightDestination?.toLowerCase().includes(currentTripState.origin?.toLowerCase() || ''));
          
          if (isLikelyReturn) {
            optimalReturnFlight = currentTripState.optimalFlight;
            console.log('Using tripState.optimalFlight as return (no codes, assumed return):', optimalReturnFlight?.flightNumber);
          }
        }
      }
      
      // If not found in location.state, find optimal flights from all flights using origin/destination matching
      // Also include flights from tripState.flights even if they don't have optimal flags
      if (!optimalOutboundFlight || !optimalReturnFlight) {
        const allFlightsToCheck = [
          ...(outboundFlights || []), 
          ...(returnFlights || []), 
          ...(currentAllFlights || []),
          ...(currentTripState?.flights || [])
        ];
        
        // First try flights with optimal flags
        const allOptimalFlights = allFlightsToCheck.filter(f => f.optimalFlight || f.isOptimal);
        
        for (const flight of allOptimalFlights) {
          const flightOrigin = getFlightOrigin(flight);
          const flightDestination = getFlightDestination(flight);
          
          // If we have codes, match by codes; otherwise use first available
          if (originCodeForMatching && destinationCodeForMatching) {
            if (flightOrigin === originCodeForMatching && flightDestination === destinationCodeForMatching && !optimalOutboundFlight) {
              optimalOutboundFlight = flight;
              console.log('Found optimal outbound flight:', flight.flightNumber);
            } else if (flightOrigin === destinationCodeForMatching && flightDestination === originCodeForMatching && !optimalReturnFlight) {
              optimalReturnFlight = flight;
              console.log('Found optimal return flight:', flight.flightNumber);
            }
          } else {
            // No codes - use first optimal flight as outbound if we don't have one
            if (!optimalOutboundFlight && !isDummyFlight(flight)) {
              optimalOutboundFlight = flight;
              console.log('Using first optimal flight as outbound (no codes):', flight.flightNumber);
            }
          }
        }
        
        // If still no flights and we have codes, try all flights (not just optimal)
        if ((!optimalOutboundFlight || !optimalReturnFlight) && originCodeForMatching && destinationCodeForMatching) {
          for (const flight of allFlightsToCheck) {
            if (isDummyFlight(flight)) continue;
            
            const flightOrigin = getFlightOrigin(flight);
            const flightDestination = getFlightDestination(flight);
            
            if (flightOrigin === originCodeForMatching && flightDestination === destinationCodeForMatching && !optimalOutboundFlight) {
              optimalOutboundFlight = flight;
              console.log('Found outbound flight (no optimal flag):', flight.flightNumber);
            } else if (flightOrigin === destinationCodeForMatching && flightDestination === originCodeForMatching && !optimalReturnFlight) {
              optimalReturnFlight = flight;
              console.log('Found return flight (no optimal flag):', flight.flightNumber);
            }
          }
        }
      }
      
      // Fallback: use outboundFlights/returnFlights arrays if available
      if (!optimalOutboundFlight && outboundFlights && outboundFlights.length > 0) {
        optimalOutboundFlight = outboundFlights.find(f => f.optimalFlight || f.isOptimal) || outboundFlights[0];
      }
      
      if (!optimalReturnFlight && returnFlights && returnFlights.length > 0) {
        optimalReturnFlight = returnFlights.find(f => f.optimalFlight || f.isOptimal) || returnFlights[0];
      }
      
      // Final fallback: use flights from tripState.flights array
      // Try to find both outbound and return flights from the array
      if (currentTripState?.flights?.length > 0) {
        const validFlights = currentTripState.flights.filter(f => !isDummyFlight(f));
        
        if (validFlights.length > 0) {
          // If we have codes, try to match flights by direction
          if (originCodeForMatching && destinationCodeForMatching) {
            for (const flight of validFlights) {
              const flightOrigin = getFlightOrigin(flight);
              const flightDestination = getFlightDestination(flight);
              
              // Outbound: origin -> destination
              if (!optimalOutboundFlight && 
                  flightOrigin === originCodeForMatching && 
                  flightDestination === destinationCodeForMatching) {
                optimalOutboundFlight = flight;
                console.log('Found outbound flight from tripState.flights:', flight.flightNumber);
              }
              
              // Return: destination -> origin
              if (!optimalReturnFlight && 
                  flightOrigin === destinationCodeForMatching && 
                  flightDestination === originCodeForMatching) {
                optimalReturnFlight = flight;
                console.log('Found return flight from tripState.flights:', flight.flightNumber);
              }
            }
          }
          
          // If still no flights found, use first valid flight as outbound
          if (!optimalOutboundFlight && validFlights.length > 0) {
            optimalOutboundFlight = validFlights[0];
            console.log('Using first tripState flight as outbound (final fallback):', optimalOutboundFlight?.flightNumber);
          }
          
          // If we have outbound but no return, and there's a second flight, use it as return
          if (optimalOutboundFlight && !optimalReturnFlight && validFlights.length > 1) {
            const returnCandidate = validFlights.find(f => f !== optimalOutboundFlight);
            if (returnCandidate) {
              // Check if it looks like a return flight (opposite direction)
              const flightOrigin = getFlightOrigin(returnCandidate);
              const flightDestination = getFlightDestination(returnCandidate);
              const outboundOrigin = getFlightOrigin(optimalOutboundFlight);
              const outboundDestination = getFlightDestination(optimalOutboundFlight);
              
              // If directions are opposite, it's likely a return flight
              if (flightOrigin === outboundDestination && flightDestination === outboundOrigin) {
                optimalReturnFlight = returnCandidate;
                console.log('Found return flight from tripState.flights (opposite direction):', optimalReturnFlight?.flightNumber);
              } else if (!originCodeForMatching || !destinationCodeForMatching) {
                // No codes available - assume second flight is return
                optimalReturnFlight = returnCandidate;
                console.log('Using second tripState flight as return (no codes, assumed return):', optimalReturnFlight?.flightNumber);
              }
            }
          }
        }
      }
      
      // Final fallback: use tripState.optimalFlight (already checked above, but keep for completeness)
      // This is redundant now since we check tripState.optimalFlight earlier, but keeping for safety
      
      console.log('Final flight selection:', {
        outbound: optimalOutboundFlight?.flightNumber || 'N/A',
        return: optimalReturnFlight?.flightNumber || 'N/A',
        hasOptimalOutbound: !!optimalOutboundFlight,
        hasOptimalReturn: !!optimalReturnFlight,
        optimalOutboundFlight: optimalOutboundFlight ? {
          flightNumber: optimalOutboundFlight.flightNumber,
          airline: optimalOutboundFlight.airline,
          origin: getFlightOrigin(optimalOutboundFlight),
          destination: getFlightDestination(optimalOutboundFlight)
        } : null,
        optimalReturnFlight: optimalReturnFlight ? {
          flightNumber: optimalReturnFlight.flightNumber,
          airline: optimalReturnFlight.airline,
          origin: getFlightOrigin(optimalReturnFlight),
          destination: getFlightDestination(optimalReturnFlight)
        } : null,
        allFlightsCount: currentAllFlights.length,
        outboundFlightsCount: outboundFlights?.length || 0,
        returnFlightsCount: returnFlights?.length || 0,
        tripStateFlightsCount: currentTripState?.flights?.length || 0,
        originCodeForMatching: originCodeForMatching,
        destinationCodeForMatching: destinationCodeForMatching
      });
      
      // Validate that we have flight data - NO DUMMY DATA ALLOWED
      // Simplified check: if optimal flight exists and is not explicitly dummy, consider it valid
      const hasOptimalOutbound = optimalOutboundFlight && !isDummyFlight(optimalOutboundFlight);
      const hasOptimalReturn = optimalReturnFlight && !isDummyFlight(optimalReturnFlight);
      const hasOptimalFlights = hasOptimalOutbound || hasOptimalReturn;
      
      // Also check tripState.flights as a fallback
      const hasTripStateFlights = currentTripState?.flights && Array.isArray(currentTripState.flights) && currentTripState.flights.length > 0;
      const hasFlightArrays = (outboundFlights && outboundFlights.length > 0) || 
                             (returnFlights && returnFlights.length > 0) || 
                             currentAllFlights.length > 0 ||
                             hasTripStateFlights;
      
      console.log('Flight validation:', {
        hasOptimalOutbound,
        hasOptimalReturn,
        hasOptimalFlights,
        hasFlightArrays,
        hasTripStateFlights,
        willPass: hasOptimalFlights || hasFlightArrays,
        optimalOutboundFlightExists: !!optimalOutboundFlight,
        optimalReturnFlightExists: !!optimalReturnFlight,
        optimalOutboundFlightKeys: optimalOutboundFlight ? Object.keys(optimalOutboundFlight) : [],
        optimalReturnFlightKeys: optimalReturnFlight ? Object.keys(optimalReturnFlight) : [],
        optimalOutboundFlightId: optimalOutboundFlight?.id,
        optimalOutboundFlightNumber: optimalOutboundFlight?.flightNumber,
        optimalOutboundFlightAirline: optimalOutboundFlight?.airline,
        optimalReturnFlightId: optimalReturnFlight?.id,
        optimalReturnFlightNumber: optimalReturnFlight?.flightNumber,
        optimalReturnFlightAirline: optimalReturnFlight?.airline,
        tripStateFlightsCount: tripState?.flights?.length || 0,
        tripStateOptimalFlight: tripState?.optimalFlight ? {
          id: tripState.optimalFlight.id,
          flightNumber: tripState.optimalFlight.flightNumber,
          airline: tripState.optimalFlight.airline
        } : null
      });
      
      // Allow itinerary generation without flights for activity-based itineraries
      // Only warn if we don't have flights, but don't throw error
      if (!hasOptimalFlights && !hasFlightArrays) {
        console.warn('No flight data available - generating activity-based itinerary without flights:', {
          optimalOutboundFlight: optimalOutboundFlight ? {
            id: optimalOutboundFlight.id,
            flightNumber: optimalOutboundFlight.flightNumber,
            airline: optimalOutboundFlight.airline,
            keys: Object.keys(optimalOutboundFlight)
          } : null,
          optimalReturnFlight: optimalReturnFlight ? {
            id: optimalReturnFlight.id,
            flightNumber: optimalReturnFlight.flightNumber,
            airline: optimalReturnFlight.airline,
            keys: Object.keys(optimalReturnFlight)
          } : null,
          outboundFlights: outboundFlights?.length || 0,
          returnFlights: returnFlights?.length || 0,
          allFlights: currentAllFlights.length,
          hasOptimalOutbound,
          hasOptimalReturn,
          hasOptimalFlights,
          hasFlightArrays
        });
        // Set flights to null so placeholders will be displayed
        optimalOutboundFlight = null;
        optimalReturnFlight = null;
      }
      
      // Build flightsData - include optimal flights if available
      const flightsToMap = [...flightsToUse];
      
      // Also include tripState.flights if not already included
      if (currentTripState?.flights && Array.isArray(currentTripState.flights) && currentTripState.flights.length > 0) {
        currentTripState.flights.forEach(flight => {
          if (!flightsToMap.find(f => f.id === flight.id || (f.flightNumber === flight.flightNumber && f.airline === flight.airline))) {
            flightsToMap.push(flight);
          }
        });
      }
      
      if (optimalOutboundFlight && !flightsToMap.find(f => f.id === optimalOutboundFlight.id || (f.flightNumber === optimalOutboundFlight.flightNumber && f.airline === optimalOutboundFlight.airline))) {
        flightsToMap.push(optimalOutboundFlight);
      }
      if (optimalReturnFlight && !flightsToMap.find(f => f.id === optimalReturnFlight.id || (f.flightNumber === optimalReturnFlight.flightNumber && f.airline === optimalReturnFlight.airline))) {
        flightsToMap.push(optimalReturnFlight);
      }
      
      // Also try to use tripState.optimalFlight if we don't have optimal flights yet
      if (!optimalOutboundFlight && !optimalReturnFlight && currentTripState?.optimalFlight) {
        if (!flightsToMap.find(f => f.id === currentTripState.optimalFlight.id || (f.flightNumber === currentTripState.optimalFlight.flightNumber && f.airline === currentTripState.optimalFlight.airline))) {
          flightsToMap.push(currentTripState.optimalFlight);
        }
      }
      
      const flightsData = flightsToMap.length > 0 ? flightsToMap.map(flight => ({
        id: flight.id || flight.flightNumber || `flight-${Math.random()}`,
        price: flight.price || 0,
        duration: flight.duration || '0h',
        airline: flight.airline || 'Unknown',
        flightNumber: flight.flightNumber || '',
        departure: flight.departure || '',
        arrival: flight.arrival || '',
        stops: flight.stops || 0
      })) : [];
      
      console.log('flightsData after building:', {
        flightsDataLength: flightsData.length,
        flightsToMapLength: flightsToMap.length,
        flightsToUseLength: flightsToUse.length,
        hasOptimalOutbound: !!optimalOutboundFlight,
        hasOptimalReturn: !!optimalReturnFlight,
        hasTripStateOptimalFlight: !!currentTripState?.optimalFlight
      });
      
      // Validate that we have at least some data - NO DUMMY DATA
      // If we have optimal flights OR flightsData, we can proceed
      // For activity-based itineraries, flights are optional
      if (flightsData.length === 0 && !optimalOutboundFlight && !optimalReturnFlight) {
        console.warn('No flightsData and no optimal flights - proceeding with activity-based itinerary:', {
          flightsDataLength: flightsData.length,
          optimalOutboundFlight: optimalOutboundFlight,
          optimalReturnFlight: optimalReturnFlight,
          flightsToUseLength: flightsToUse.length,
          tripStateFlightsLength: currentTripState?.flights?.length || 0
        });
        // Don't throw error - allow activity-based itinerary generation without flights
        // Flight placeholders will be displayed in the itinerary
      }
      
      if (hotelsData.length === 0 && activitiesData.length === 0) {
        console.warn('No hotels or activities found. Continuing with flights only.');
      }

      // Format preferences for backend - backend expects {budget, quality, convenience} as floats
      const formattedPreferences = {
        budget: typeof preferences.budget === 'number' ? preferences.budget : parseFloat(preferences.budget) || 0.33,
        quality: typeof preferences.quality === 'number' ? preferences.quality : parseFloat(preferences.quality) || 0.33,
        convenience: typeof preferences.convenience === 'number' ? preferences.convenience : parseFloat(preferences.convenience) || 0.34
      };

      // Generate optimal itinerary with user preferences
      console.log('Generating optimal itinerary with:', {
        flightsCount: flightsData.length,
        hotelsCount: hotelsData.length,
        activitiesCount: activitiesData.length,
        preferences: formattedPreferences
      });

      // If no flights, skip backend API and create activity-based itinerary directly
      const hasAnyFlights = flightsData.length > 0 || (optimalOutboundFlight && !isDummyFlight(optimalOutboundFlight)) || (optimalReturnFlight && !isDummyFlight(optimalReturnFlight));
      
      let result = null;
      
      if (hasAnyFlights) {
        // Call backend API only if we have flights
        const itineraryResponse = await fetch(`${base}/api/generateOptimalItinerary`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            flights: flightsData,
            hotels: hotelsData,
            activities: activitiesData,
            preferences: formattedPreferences,
            userBudget: 5000 // Default budget
          })
        });

        if (!itineraryResponse.ok) {
          const errorText = await itineraryResponse.text();
          console.error('generateOptimalItinerary error:', errorText);
          throw new Error(`Failed to generate itinerary: ${itineraryResponse.status} ${errorText}`);
        }

        result = await itineraryResponse.json();
        console.log('generateOptimalItinerary result:', result);
        
        if (!result.ok) {
          const errorMsg = result.error || 'Failed to generate itinerary';
          // Provide more helpful error messages
          if (errorMsg.includes('No valid combination found within budget')) {
            throw new Error('Unable to find a combination within the budget. Try adjusting your preferences or increasing your budget.');
          } else if (errorMsg.includes('No hotels') || errorMsg.includes('No activities')) {
            throw new Error('Unable to find hotels or activities for this destination. The itinerary will show flights only.');
          } else {
            throw new Error(errorMsg);
          }
        }
      } else {
        // No flights - create activity-based itinerary without backend API
        console.log('No flights available - creating activity-based itinerary directly');
        result = {
          ok: true,
          hotel: hotelsData.length > 0 ? hotelsData[0] : null, // Use first hotel if available
          activity: null // Don't use single activity - use all activities in createDayByDayItinerary
        };
      }
      
      // Select hotel based on user preferences BEFORE creating itinerary
      // Get hotel preferences from tripState
      const hotelPrefs = currentTripState?.filters || {};
      const hotelPriceMax = hotelPrefs.hotelPriceMax;
      const hotelPriceMin = hotelPrefs.hotelPriceMin;
      const hotelMinimumRating = hotelPrefs.hotelMinimumRating;
      const hotelPreferredLocation = hotelPrefs.hotelPreferredLocation;
      const hotelSpecificName = hotelPrefs.hotelSpecificName;
      
      console.log('Hotel preferences from TripState:', {
        hotelPriceMax,
        hotelPriceMin,
        hotelMinimumRating,
        hotelPreferredLocation,
        hotelSpecificName
      });
      
      // Extract price helper function (needed for hotel selection)
      const extractPriceForSelection = (item) => {
        if (!item) return 0;
        if (typeof item.price === 'number') return item.price;
        if (typeof item.price === 'object') {
          return item.price.amount || item.price.total || item.price.value || 0;
        }
        const parsed = parseFloat(item.price);
        return isNaN(parsed) ? 0 : parsed;
      };
      
      // Function to select the best hotel based on preferences
      const selectBestHotelForItinerary = (hotelsList) => {
        if (!hotelsList || hotelsList.length === 0) {
          return null;
        }
        
        // Priority 1: If specific hotel name is mentioned, find and use it
        if (hotelSpecificName) {
          const specificHotel = hotelsList.find(h => {
            const hotelName = (h.name || '').toLowerCase();
            const searchName = hotelSpecificName.toLowerCase();
            return hotelName.includes(searchName) || searchName.includes(hotelName);
          });
          
          if (specificHotel) {
            console.log('Found specific hotel requested by user:', specificHotel.name);
            return specificHotel;
          } else {
            console.warn('User requested specific hotel but not found in list:', hotelSpecificName);
          }
        }
        
        // Priority 2: Select hotel that best matches preferences
        const scoredHotels = hotelsList.map(h => {
          let score = 0;
          const hotelPrice = extractPriceForSelection(h) || 0;
          const hotelRating = h.rating || h.score || 0;
          const hotelLocation = (h.location || h.address || '').toLowerCase();
          const hotelName = (h.name || '').toLowerCase();
          
          // Budget match (priceMax is most important)
          if (hotelPriceMax) {
            if (hotelPrice <= hotelPriceMax) {
              const priceRatio = hotelPrice / hotelPriceMax;
              score += (1 - priceRatio) * 40;
            } else {
              score -= 20;
            }
          }
          
          // PriceMin match
          if (hotelPriceMin) {
            if (hotelPrice >= hotelPriceMin) {
              score += 10;
            } else {
              score -= 10;
            }
          }
          
          // Rating match
          if (hotelMinimumRating) {
            if (hotelRating >= hotelMinimumRating) {
              const ratingBonus = (hotelRating - hotelMinimumRating) * 10;
              score += 30 + Math.min(ratingBonus, 20);
            } else {
              const ratingPenalty = (hotelMinimumRating - hotelRating) * 15;
              score -= ratingPenalty;
            }
          }
          
          // Location match
          if (hotelPreferredLocation) {
            const preferredLocationLower = hotelPreferredLocation.toLowerCase();
            if (hotelLocation.includes(preferredLocationLower) || 
                hotelName.includes(preferredLocationLower) ||
                preferredLocationLower.includes('city center') && (hotelLocation.includes('center') || hotelLocation.includes('downtown')) ||
                preferredLocationLower.includes('waterfront') && (hotelLocation.includes('waterfront') || hotelLocation.includes('beach'))) {
              score += 30;
            } else {
              const locationWords = preferredLocationLower.split(/\s+/);
              const matchCount = locationWords.filter(word => 
                hotelLocation.includes(word) || hotelName.includes(word)
              ).length;
              if (matchCount > 0) {
                score += matchCount * 5;
              }
            }
          }
          
          // Base score from rating (if no preferences, still prefer higher rated)
          if (!hotelPriceMax && !hotelMinimumRating && !hotelPreferredLocation) {
            score += hotelRating * 10;
          }
          
          return { hotel: h, score };
        });
        
        scoredHotels.sort((a, b) => b.score - a.score);
        const bestHotel = scoredHotels[0]?.hotel || null;
        if (bestHotel) {
          console.log('Selected best matching hotel for itinerary:', {
            name: bestHotel.name,
            score: scoredHotels[0].score,
            price: extractPriceForSelection(bestHotel),
            rating: bestHotel.rating || bestHotel.score
          });
        }
        
        return bestHotel;
      };
      
      // Select hotel based on preferences
      const selectedHotelFromState = currentTripState?.selectedHotel || null;
      let finalHotelForItinerary = null;
      
      console.log('Hotel selection debug:', {
        hotelsDataLength: hotelsData.length,
        selectedHotelFromState: selectedHotelFromState?.name,
        resultHotel: result.hotel?.name,
        hotelSpecificName,
        hotelPriceMax,
        hotelPriceMin,
        hotelMinimumRating,
        hotelPreferredLocation
      });
      
      // If user has preferences, select best matching hotel
      if (hotelSpecificName || hotelPriceMax || hotelPriceMin || hotelMinimumRating || hotelPreferredLocation) {
        const bestMatchingHotel = selectBestHotelForItinerary(hotelsData);
        if (bestMatchingHotel) {
          finalHotelForItinerary = bestMatchingHotel;
          console.log('Using hotel selected based on preferences for itinerary:', finalHotelForItinerary.name);
        } else if (hotelSpecificName && hotelsData.length === 0) {
          // User specified a hotel name but no hotel data is available from API
          // Try to fetch hotel data again with hotel name search
          console.log('Attempting to fetch hotel data for specific hotel:', hotelSpecificName);
          
          try {
            // Try fetching hotels again - sometimes API needs retry
            const retryResponse = await fetch(`${base}/api/fetchItineraryData`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                destinationCode: destinationCode || destinationName,
                destinationName: destinationName || destinationCode,
                checkIn: checkInDate,
                checkOut: checkOutDateForHotel,
                adults: 1,
                hotelName: hotelSpecificName // Pass hotel name for search
              })
            });
            
            if (retryResponse.ok) {
              const retryData = await retryResponse.json();
              if (retryData.ok && retryData.hotels && retryData.hotels.length > 0) {
                // Try to find the specific hotel in the results
                const hotelNameLower = hotelSpecificName.toLowerCase();
                const foundHotel = retryData.hotels.find(h => {
                  const hName = (h.name || '').toLowerCase();
                  return hName.includes(hotelNameLower) || hotelNameLower.includes(hName);
                });
                
                if (foundHotel) {
                  finalHotelForItinerary = foundHotel;
                  console.log('Found hotel from retry API call:', foundHotel.name, 'price:', foundHotel.price);
                }
              }
            }
          } catch (retryError) {
            console.warn('Retry hotel search failed:', retryError);
          }
          
          // If still no hotel found, create from user preference but try to get real price
          if (!finalHotelForItinerary) {
            // Try to get real price from external source or use user's price preference
            let realPrice = hotelPriceMax || hotelPriceMin;
            
            // If user specified a price range, use the max as estimate
            // Otherwise, estimate based on hotel name patterns (luxury hotels)
            if (!realPrice) {
              const hotelNameLower = hotelSpecificName.toLowerCase();
              
              // Estimate prices for known luxury hotels
              const luxuryHotelPatterns = [
                { pattern: /le meurice|meurice/i, price: 800 },
                { pattern: /hôtel de crillon|hotel de crillon|crillon/i, price: 900 },
                { pattern: /ritz|ritz paris/i, price: 850 },
                { pattern: /four seasons|fourseasons/i, price: 700 },
                { pattern: /shangri-la|shangrila/i, price: 600 },
                { pattern: /mandarin oriental|mandarin/i, price: 650 },
                { pattern: /peninsula|peninsula hotel/i, price: 750 },
                { pattern: /w hotel|w barcelona|w paris/i, price: 350 },
                { pattern: /arts barcelona|hotel arts/i, price: 350 },
                { pattern: /majestic|majestic hotel/i, price: 320 },
                { pattern: /palace|palace hotel/i, price: 400 },
                { pattern: /grand|grand hotel/i, price: 300 },
              ];
              
              // Check if hotel name matches any luxury pattern
              const matchedPattern = luxuryHotelPatterns.find(p => p.pattern.test(hotelNameLower));
              if (matchedPattern) {
                realPrice = matchedPattern.price;
                console.log(`Estimated price for ${hotelSpecificName} based on pattern: $${realPrice}/night`);
              } else {
                // Default estimate based on hotel name characteristics
                // If hotel name contains luxury indicators, estimate higher
                if (hotelNameLower.includes('palace') || hotelNameLower.includes('ritz') || 
                    hotelNameLower.includes('crillon') || hotelNameLower.includes('meurice')) {
                  realPrice = 800; // Luxury hotel default
                } else if (hotelNameLower.includes('grand') || hotelNameLower.includes('royal')) {
                  realPrice = 400; // Upscale hotel
                } else {
                  realPrice = 300; // Standard hotel default
                }
                console.log(`Estimated price for ${hotelSpecificName} (default): $${realPrice}/night`);
              }
            }
            
            finalHotelForItinerary = {
              name: hotelSpecificName,
              location: hotelPreferredLocation || destinationName || destinationCode || 'Paris',
              price: realPrice,
              currency: 'USD',
              rating: hotelMinimumRating || 4.5,
              check_in: checkInDate,
              check_out: checkOutDateForHotel,
              // Mark as user-specified hotel (not from API)
              isUserSpecified: true,
              priceUnavailable: false // We have an estimated price
            };
            console.log('Created hotel object from user preference (no API data available):', finalHotelForItinerary.name, 'estimated price:', realPrice);
          }
        } else {
          finalHotelForItinerary = selectedHotelFromState || result.hotel || null;
          console.log('No hotel matched preferences, using fallback:', finalHotelForItinerary?.name || 'none');
        }
      } else {
        // No preferences - use selected hotel, result.hotel, or first available hotel
        finalHotelForItinerary = selectedHotelFromState || result.hotel || (hotelsData.length > 0 ? hotelsData[0] : null);
        console.log('No preferences - using hotel:', finalHotelForItinerary?.name || 'none');
      }
      
      // Update result.hotel with the selected hotel
      // Check if result.hotel is a valid object (not a string like "Hotel information not available")
      if (finalHotelForItinerary && typeof finalHotelForItinerary === 'object' && finalHotelForItinerary.name && finalHotelForItinerary.name !== 'Hotel information not available') {
        result.hotel = finalHotelForItinerary;
        console.log('Final hotel for itinerary:', result.hotel.name);
      } else {
        // Clear invalid hotel data
        result.hotel = null;
        console.warn('No valid hotel available for itinerary!', {
          finalHotelForItinerary,
          type: typeof finalHotelForItinerary,
          name: finalHotelForItinerary?.name
        });
      }
      
      // Create day-by-day itinerary structure
      // Flight is optional: if user asks for itinerary based on activities first, flight can be empty
      // Use selected flights from tripState first, then optimal flights, otherwise null
      
      // Priority: selectedOutboundFlight > optimalOutboundFlight > null
      let outboundFlight = null;
      let returnFlight = null;
      
      // Check for user-selected flights from tripState first
      const selectedOutbound = currentTripState?.selectedOutboundFlight;
      const selectedReturn = currentTripState?.selectedReturnFlight;
      
      if (selectedOutbound && !isDummyFlight(selectedOutbound)) {
        outboundFlight = selectedOutbound;
        console.log('Using selected outbound flight from tripState:', outboundFlight?.flightNumber);
      } else if (optimalOutboundFlight && !isDummyFlight(optimalOutboundFlight)) {
        outboundFlight = optimalOutboundFlight;
        console.log('Using optimal outbound flight:', outboundFlight?.flightNumber);
      } else {
        console.log('No outbound flight - creating activity-based itinerary without flight');
      }
      
      // Priority: selectedReturnFlight > optimalReturnFlight > null
      if (selectedReturn && !isDummyFlight(selectedReturn)) {
        returnFlight = selectedReturn;
        console.log('Using selected return flight from tripState:', returnFlight?.flightNumber);
      } else if (returnDate && optimalReturnFlight && !isDummyFlight(optimalReturnFlight)) {
        returnFlight = optimalReturnFlight;
        console.log('Using optimal return flight:', returnFlight?.flightNumber);
      } else if (returnDate && !optimalReturnFlight && !selectedReturn) {
        console.log('No return flight - itinerary will show return flight placeholder');
      }
      
      console.log('Using flights for itinerary:', {
        outbound: outboundFlight?.flightNumber || 'N/A',
        return: returnFlight?.flightNumber || 'N/A',
        hasOptimalOutbound: !!optimalOutboundFlight,
        hasOptimalReturn: !!optimalReturnFlight,
        outboundFlightData: optimalOutboundFlight ? {
          airline: optimalOutboundFlight.airline,
          flightNumber: optimalOutboundFlight.flightNumber,
          departure: optimalOutboundFlight.departure,
          arrival: optimalOutboundFlight.arrival,
          price: optimalOutboundFlight.price
        } : null,
        returnFlightData: optimalReturnFlight ? {
          airline: optimalReturnFlight.airline,
          flightNumber: optimalReturnFlight.flightNumber,
          departure: optimalReturnFlight.departure,
          arrival: optimalReturnFlight.arrival,
          price: optimalReturnFlight.price
        } : null,
        startDate: departureDate.toISOString().split('T')[0],
        endDate: tripEndDate.toISOString().split('T')[0]
      });
      
      // Use the same flight and hotel data that will be displayed in Summary
      // Priority: selectedOutboundFlight > optimalOutboundFlight > result.flight
      const finalOutboundFlight = selectedOutbound || optimalOutboundFlight || outboundFlight || result.flight || null;
      const finalReturnFlight = selectedReturn || optimalReturnFlight || returnFlight || null;
      const finalHotelForTimeline = selectedHotelFromState || result.hotel || finalHotelForItinerary || null;
      
      console.log('createDayByDayItinerary inputs:', {
        finalOutboundFlight: finalOutboundFlight ? {
          flightNumber: finalOutboundFlight.flightNumber,
          airline: finalOutboundFlight.airline,
          departure: finalOutboundFlight.departure,
          arrival: finalOutboundFlight.arrival,
          price: finalOutboundFlight.price
        } : 'N/A',
        finalReturnFlight: finalReturnFlight ? {
          flightNumber: finalReturnFlight.flightNumber,
          airline: finalReturnFlight.airline
        } : 'N/A',
        finalHotelForTimeline: finalHotelForTimeline ? {
          name: finalHotelForTimeline.name || finalHotelForTimeline.hotelName,
          location: finalHotelForTimeline.location,
          price: finalHotelForTimeline.price || finalHotelForTimeline.price_per_night
        } : 'N/A',
        resultHotel: result.hotel ? {
          name: result.hotel.name || result.hotel.hotelName
        } : 'N/A',
        selectedHotelFromState: selectedHotelFromState ? {
          name: selectedHotelFromState.name || selectedHotelFromState.hotelName
        } : 'N/A',
        selectedOutbound: selectedOutbound ? {
          flightNumber: selectedOutbound.flightNumber
        } : 'N/A',
        optimalOutboundFlight: optimalOutboundFlight ? {
          flightNumber: optimalOutboundFlight.flightNumber
        } : 'N/A'
      });
      
      const { days, hotelStays } = createDayByDayItinerary(
        finalOutboundFlight, // Use final outbound flight
        finalHotelForTimeline, // Use final hotel
        result.activity ? [result.activity] : [],
        activitiesData,
        currentRouteInfo,
        departureDate, // startDate
        tripEndDate, // endDate
        finalReturnFlight // Use final return flight
      );

      const finalItineraryData = {
        ...result,
        days: days,
        hotelStays: hotelStays, // Store hotelStays for summary
        routeInfo: currentRouteInfo,
        hotelsData: hotelsData,
        activitiesData: activitiesData,
        // Store flight and hotel data for reference
        flight: finalOutboundFlight || result.flight,
        hotel: finalHotelForTimeline || result.hotel,
        returnFlight: finalReturnFlight || null
      };
      
      console.log('Final itinerary data:', {
        daysCount: days.length,
        firstDayItems: days[0]?.items?.length || 0,
        firstDayItemTypes: days[0]?.items?.map(i => i.type) || [],
        hotelStaysCount: hotelStays.length,
        hasFlight: !!finalOutboundFlight,
        hasHotel: !!finalHotelForTimeline,
        hasReturnFlight: !!finalReturnFlight
      });
      
      setItineraryData(finalItineraryData);
      
      // Save optimized itinerary to tripState and localStorage
      saveOptimizedItinerary(finalItineraryData);
    } catch (err) {
      console.error('Error generating itinerary:', err);
      setError(err.message || 'Failed to generate itinerary. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [preferences, location.state]);

  useEffect(() => {
    generateItinerary();
  }, [generateItinerary]);

  // Helper function to build date range from start to end date
  const buildDateRange = (startDate, endDate) => {
    const dates = [];
    const start = startDate instanceof Date ? startDate : parseDate(startDate);
    const end = endDate instanceof Date ? endDate : parseDate(endDate);
    
    if (!start || isNaN(start.getTime())) {
      return dates;
    }
    
    const endDateObj = (end && !isNaN(end.getTime())) ? end : start;
    
    // Normalize dates to midnight (00:00:00) to avoid timezone issues
    const startNormalized = new Date(start);
    startNormalized.setHours(0, 0, 0, 0);
    
    const endNormalized = new Date(endDateObj);
    endNormalized.setHours(0, 0, 0, 0);
    
    const currentDate = new Date(startNormalized);
    
    // Generate all dates from start to end (inclusive)
    // IMPORTANT: Include the end date by using <= comparison
    while (currentDate <= endNormalized) {
      dates.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    console.log('buildDateRange:', {
      start: startNormalized.toISOString().split('T')[0],
      end: endNormalized.toISOString().split('T')[0],
      count: dates.length,
      dates: dates.map(d => d.toISOString().split('T')[0])
    });
    
    return dates;
  };

  const createDayByDayItinerary = (flight, hotel, selectedActivity, allActivities, routeInfo, startDate, endDate, returnFlight = null) => {
    const days = [];
    
    // Load must-do activities from TripState
    const { loadTripState } = require('../utils/tripState');
    const tripState = loadTripState();
    const mustDoActivities = tripState?.mustDoActivities || [];
    const preferences = tripState?.preferences || {};
    
    console.log('Must-do activities from TripState:', mustDoActivities);
    console.log('User preferences:', preferences);
    
    // Use tripState dates as primary source, fallback to function parameters
    const tripStartDate = tripState?.startDate || startDate;
    const tripEndDate = tripState?.endDate || endDate;
    
    // Parse dates - ensure they are Date objects
    let endDateObj = null;
    let startDateObj = null;
    
    // Parse tripState dates first
    if (tripStartDate) {
      if (tripStartDate instanceof Date) {
        startDateObj = new Date(tripStartDate);
        startDateObj.setHours(0, 0, 0, 0); // Normalize to midnight
      } else {
        startDateObj = parseDate(tripStartDate);
        if (startDateObj) {
          startDateObj.setHours(0, 0, 0, 0); // Normalize to midnight
        }
      }
    }
    
    if (tripEndDate) {
      if (tripEndDate instanceof Date) {
        endDateObj = new Date(tripEndDate);
        endDateObj.setHours(0, 0, 0, 0); // Normalize to midnight
      } else {
        endDateObj = parseDate(tripEndDate);
        if (endDateObj) {
          endDateObj.setHours(0, 0, 0, 0); // Normalize to midnight
        }
      }
    }
    
    // Fallback to function parameters if tripState dates are not available
    if (!startDateObj || isNaN(startDateObj.getTime())) {
      if (startDate instanceof Date) {
        startDateObj = new Date(startDate);
        startDateObj.setHours(0, 0, 0, 0); // Normalize to midnight
      } else if (startDate) {
        startDateObj = parseDate(startDate);
        if (startDateObj) {
          startDateObj.setHours(0, 0, 0, 0); // Normalize to midnight
        }
      }
    }
    
    if (!endDateObj || isNaN(endDateObj.getTime())) {
      if (endDate instanceof Date) {
        endDateObj = new Date(endDate);
        endDateObj.setHours(0, 0, 0, 0); // Normalize to midnight
      } else if (endDate) {
        endDateObj = parseDate(endDate);
        if (endDateObj) {
          endDateObj.setHours(0, 0, 0, 0); // Normalize to midnight
        }
      }
    }
    
    // Validate dates
    if (!startDateObj || isNaN(startDateObj.getTime())) {
      console.error('Invalid startDate:', tripStartDate, startDate);
      throw new Error(`Invalid start date: ${tripStartDate || startDate}`);
    }
    
    // For one-way trips, endDate might be null or same as startDate
    // But if we have a valid endDate from tripState, use it (don't default to startDate)
    // Only default to startDate if endDate is truly missing
    if (!endDateObj || isNaN(endDateObj.getTime())) {
      // Check if we have endDate from function parameter
      if (endDate && endDate instanceof Date && !isNaN(endDate.getTime())) {
        endDateObj = new Date(endDate);
        endDateObj.setHours(0, 0, 0, 0);
      } else {
        endDateObj = new Date(startDateObj); // Use startDate as endDate for one-way trips
        endDateObj.setHours(0, 0, 0, 0);
      }
    }
    
    // Build date range: tripState.startDate ~ tripState.endDate (inclusive, ascending order)
    const dateRange = buildDateRange(startDateObj, endDateObj);
    const daysDiff = dateRange.length;
    
    console.log('createDayByDayItinerary dates:', {
      tripStateStartDate: tripState?.startDate,
      tripStateEndDate: tripState?.endDate,
      startDate: startDateObj.toISOString().split('T')[0],
      endDate: endDateObj.toISOString().split('T')[0],
      daysDiff: daysDiff,
      dateRangeLength: dateRange.length
    });
    
    // Check if this is a round trip (endDate is different from startDate)
    const isRoundTrip = endDateObj && endDateObj.getTime() !== startDateObj.getTime();
    
    console.log(`Creating itinerary for ${daysDiff} days (${startDateObj.toISOString().split('T')[0]} to ${endDateObj.toISOString().split('T')[0]})`);
    
    // Flight is optional - activity-based itineraries can be created without flights
    // Helper function to extract price from item
    const extractPrice = (item) => {
      if (!item) return 0;
      if (item.price === null || item.price === undefined) return 0;
      if (typeof item.price === 'number') return item.price;
      if (typeof item.price === 'object' && item.price !== null) {
        return item.price.amount || item.price.total || item.price.value || 0;
      }
      if (typeof item.price === 'string') {
        const parsed = parseFloat(item.price);
        return isNaN(parsed) ? 0 : parsed;
      }
      return 0;
    };
    
    // Helper function to create booking link
    const createBookingLink = (activityName) => {
      const encodedName = encodeURIComponent(activityName);
      return `https://www.getyourguide.com/s/?q=${encodedName}`;
    };
    
    // Helper function to determine time slot based on category and duration
    const getTimeSlotForCategory = (category, duration, index, existingSlots = []) => {
      const categoryLower = (category || '').toLowerCase();
      const durationStr = (duration || '').toString().toLowerCase();
      
      // Avoid conflicts with existing slots
      const getAvailableSlot = (preferred) => {
        if (!existingSlots.includes(preferred)) {
          return preferred;
        }
        // Try alternatives
        const alternatives = {
          'Morning': ['Afternoon', 'Evening'],
          'Afternoon': ['Morning', 'Evening'],
          'Evening': ['Afternoon', 'Morning'],
          'Lunch': ['Afternoon', 'Morning'],
          'Dinner': ['Evening', 'Afternoon']
        };
        const alt = alternatives[preferred] || ['Morning', 'Afternoon', 'Evening'];
        for (const slot of alt) {
          if (!existingSlots.includes(slot)) {
            return slot;
          }
        }
        return preferred; // Fallback
      };
      
      // Category-based time slots (more specific)
      if (categoryLower.includes('nightlife') || categoryLower.includes('dinner') || categoryLower.includes('evening') || categoryLower.includes('night')) {
        return getAvailableSlot('Evening');
      }
      if (categoryLower.includes('lunch') || categoryLower.includes('restaurant') || categoryLower.includes('dining') || categoryLower.includes('food')) {
        return getAvailableSlot('Lunch');
      }
      if (categoryLower.includes('breakfast') || categoryLower.includes('morning') || categoryLower.includes('museum') || categoryLower.includes('gallery')) {
        return getAvailableSlot('Morning');
      }
      if (categoryLower.includes('afternoon') || categoryLower.includes('tour') || categoryLower.includes('walking')) {
        return getAvailableSlot('Afternoon');
      }
      
      // Duration-based: long activities prefer morning/afternoon
      if (durationStr.includes('4') || durationStr.includes('5') || durationStr.includes('6') || durationStr.includes('full')) {
        return getAvailableSlot('Morning');
      }
      
      // Default: distribute Morning/Afternoon/Evening
      const slots = ['Morning', 'Afternoon', 'Evening'];
      const slotIndex = index % slots.length;
      return getAvailableSlot(slots[slotIndex]);
    };
    
    // Day 1: Outbound flight (optional) + arrival
    // Flight is optional - if not provided, show placeholder (activity-based itinerary)
    const day1Items = [];
    
    console.log('createDayByDayItinerary flight check:', {
      hasFlight: !!flight,
      flightType: typeof flight,
      flightId: flight?.id,
      flightNumber: flight?.flightNumber,
      airline: flight?.airline,
      isDummy: flight?.id === 'dummy-flight' || flight?.flightNumber === 'FL123' || flight?.airline === 'Airline',
      flightKeys: flight ? Object.keys(flight) : []
    });
    
    // Check if flight is valid - more lenient check
    // Accept flight if it has flightNumber OR airline (not both required)
    const isValidFlight = flight && 
                          typeof flight === 'object' &&
                          (flight.flightNumber || flight.airline) &&
                          flight.flightNumber !== 'FL123' &&
                          flight.airline !== 'Airline' &&
                          flight.id !== 'dummy-flight' &&
                          !flight.isDummy;
    
    if (isValidFlight) {
      // Extract time from departure string (e.g., "20 Nov 2025, 06:05" -> "06:05")
      let departureTime = 'TBD';
      if (flight.departure) {
        const timeMatch = flight.departure.match(/(\d{1,2}:\d{2})/);
        if (timeMatch) {
          departureTime = timeMatch[1];
        } else {
          departureTime = flight.departure;
        }
      } else if (flight.departureTime) {
        departureTime = flight.departureTime;
      }
      
      // Extract airport codes
      const departureAirport = flight.departureAirport || 
                               (flight.departure?.match(/([A-Z]{3})/) ? flight.departure.match(/([A-Z]{3})/)[1] : null) ||
                               routeInfo.departureCode || 'N/A';
      const arrivalAirport = flight.arrivalAirport || 
                             (flight.arrival?.match(/([A-Z]{3})/) ? flight.arrival.match(/([A-Z]{3})/)[1] : null) ||
                             routeInfo.destinationCode || 'N/A';
      
      // Format: "✈️ Flight to {destination} (Airline + Code)"
      const flightTitle = `✈️ Flight to ${routeInfo.destination || 'destination'} (${flight.airline || 'Airline'} ${flight.flightNumber || ''})`;
      day1Items.push({
        type: 'flight',
        title: flightTitle,
        time: departureTime,
        details: {
          departure: flight.departure || `${departureAirport} ${departureTime}`,
          arrival: flight.arrival || `${arrivalAirport} TBD`,
          duration: flight.duration ? (typeof flight.duration === 'number' ? `${flight.duration.toFixed(1)}h` : flight.duration) : 'N/A',
          stops: flight.stops || 0,
          price: flight.price || 0,
          airline: flight.airline,
          flightNumber: flight.flightNumber
        }
      });
      console.log('Added flight to Day 1:', flight.flightNumber);
    } else {
      // No flight provided - add placeholder message
      day1Items.push({
        type: 'activity',
        title: '✈️ Flight Needed',
        time: 'Morning',
        details: {
          description: 'Please search for flights in the chat to add flight information to your itinerary.',
          duration: 'N/A',
          bookingLink: null
        }
      });
      console.log('No flight provided for Day 1 - adding placeholder');
    }
    
    // Create hotelStays structure from hotel data
    // Hotels are NOT activities but should be shown as "stays" in the timeline
    let hotelStays = [];
    
    console.log('createDayByDayItinerary hotel check:', {
      hotel: hotel?.name || hotel?.hotelName || 'null',
      hotelType: typeof hotel,
      isDummy: hotel?.isDummy,
      isString: typeof hotel === 'string',
      hasName: !!(hotel?.name || hotel?.hotelName),
      nameValue: hotel?.name || hotel?.hotelName,
      startDateObj: startDateObj?.toISOString(),
      endDateObj: endDateObj?.toISOString(),
      hotelKeys: hotel ? Object.keys(hotel) : []
    });
    
    // Check if hotel is valid (not a string, not dummy, has name)
    // More lenient check - accept hotel.name or hotel.hotelName
    const hotelName = hotel?.name || hotel?.hotelName;
    const isValidHotel = hotel && 
                        typeof hotel === 'object' && 
                        !hotel.isDummy && 
                        hotelName && 
                        hotelName !== 'Hotel information not available' &&
                        startDateObj && 
                        endDateObj;
    
    if (isValidHotel) {
      const checkInDate = new Date(startDateObj);
      const checkOutDate = new Date(endDateObj);
      
      // Calculate nights (check-out date is exclusive, so subtract 1 day)
      const nights = Math.max(1, Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24)));
      
      // Extract price per night
      const pricePerNight = extractPrice(hotel) || 0;
      const totalPrice = pricePerNight * nights;
      
      hotelStays.push({
        name: hotelName || 'Hotel',
        checkInDate: checkInDate,
        checkOutDate: checkOutDate,
        nights: nights,
        pricePerNight: pricePerNight,
        totalPrice: totalPrice,
        location: hotel.location || routeInfo.destination || '',
        rating: hotel.rating || 0
      });
      
      console.log('Created hotel stay:', hotelStays[0]);
    }
    
    // Add hotel stay to Day 1 (check-in day) if hotel exists
    if (hotelStays.length > 0 && dateRange.length > 0) {
      const hotelStay = hotelStays[0];
      const checkInDate = hotelStay.checkInDate;
      const checkOutDate = hotelStay.checkOutDate;
      
      // Format dates for display (e.g., "Jan 5 – Jan 10")
      const formatDateShort = (date) => {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[date.getMonth()]} ${date.getDate()}`;
      };
      
      const dateRangeStr = `${formatDateShort(checkInDate)} – ${formatDateShort(checkOutDate)}`;
      const nightsStr = hotelStay.nights === 1 ? '1 night' : `${hotelStay.nights} nights`;
      const priceStr = hotelStay.pricePerNight > 0 
        ? `~$${Math.round(hotelStay.pricePerNight)}/night` 
        : (hotelStay.priceUnavailable ? 'Price on request' : 'Included in hotel budget');
      
      // Add hotel stay card to Day 1 (after flight, before activities)
      day1Items.push({
        type: 'hotel',
        title: `🏨 Stay at ${hotelStay.name} (${dateRangeStr}, ${nightsStr}, ${priceStr})`,
        time: 'Check-in',
        isHotelStay: true,
        isCheckIn: true,
        details: {
          name: hotelStay.name,
          checkInDate: checkInDate,
          checkOutDate: checkOutDate,
          nights: hotelStay.nights,
          pricePerNight: hotelStay.pricePerNight,
          totalPrice: hotelStay.totalPrice,
          location: hotelStay.location,
          rating: hotelStay.rating
        }
      });
    }
    
    // Day 1 (startDate): Outbound flight - use first date from dateRange
    if (dateRange.length > 0) {
      days.push({
        day: null, // Will be set after sorting
        date: formatDate(dateRange[0]),
        dateObj: dateRange[0],
        items: day1Items
      });
    }

    // Middle days: Only for trips with more than 1 day
    // Day 1 = outbound flight, Last Day = return flight (if round trip)
    // Middle days = daysDiff - 1 (exclude Day 1) for one-way, daysDiff - 2 (exclude Day 1 and Last Day) for round trip
    // Create all days: Day 1, Day 2, ..., Day N
    if (daysDiff > 1) {
      // Middle days = total days minus Day 1 (and Last Day for round trip)
      // Generate all middle days using dateRange FIRST
      // Day 1 = outbound flight (already added), Last Day = return flight (will be added separately)
      // Middle days = Day 2 to Day (daysDiff-1) for round trip, or Day 2 to Day N for one-way
      // Use dateRange to get actual dates (ascending order)
      const middleDays = isRoundTrip ? dateRange.slice(1, -1) : dateRange.slice(1);
      const actualMiddleDays = middleDays.length;
      
      const maxMiddleDays = isRoundTrip 
        ? daysDiff - 2  // Round trip: exclude Day 1 and Last Day
        : daysDiff - 1; // One-way: exclude Day 1 only (but this shouldn't happen for one-way)
      
      console.log('Middle days calculation:', {
        daysDiff,
        isRoundTrip,
        maxMiddleDays,
        actualMiddleDays,
        middleDaysLength: middleDays.length
      });
      
      // Separate must-do activities from regular activities
      // IMPORTANT: First filter out hotels from must-do activities
      // Hotels are NOT activities and must NEVER appear in the itinerary timeline
      const filteredMustDoActivities = mustDoActivities.filter(mustDo => {
        const name = (mustDo.name || '').toLowerCase();
        const description = (mustDo.description || '').toLowerCase();
        
        // Check if this is a hotel (not an activity)
        const hotelKeywords = ['hotel', 'stay at', 'accommodation', 'resort', 'inn', 'lodge', 'hostel', 'motel'];
        const isHotel = hotelKeywords.some(keyword => 
          name.includes(keyword) || 
          description.includes(keyword) ||
          name.includes('to stay at') ||
          name.includes('staying at')
        );
        
        if (isHotel) {
          console.log('Filtered out hotel from must-do activities:', mustDo.name);
          return false; // Exclude hotels
        }
        return true; // Include real activities
      });
      
      // Filter out must-do activities from allActivities to avoid duplication
      const regularActivities = (allActivities || []).filter(act => {
        const actName = (act.name || '').toLowerCase().trim();
        return !filteredMustDoActivities.some(mustDo => {
          const mustDoName = (mustDo.name || '').toLowerCase().trim();
          return actName === mustDoName || actName.includes(mustDoName) || mustDoName.includes(actName);
        });
      });
      
      // Distribute must-do activities first (1-2 per day, evenly)
      // Use filteredMustDoActivities (hotels already filtered out)
      const mustDoPerDay = actualMiddleDays > 0 ? Math.ceil(filteredMustDoActivities.length / actualMiddleDays) : 0;
      const mustDoDistribution = [];
      let mustDoIndex = 0;
      
      // Create distribution plan for must-do activities
      for (let i = 0; i < actualMiddleDays; i++) {
        const count = Math.min(2, filteredMustDoActivities.length - mustDoIndex);
        if (count > 0) {
          mustDoDistribution.push(filteredMustDoActivities.slice(mustDoIndex, mustDoIndex + count));
          mustDoIndex += count;
        } else {
          mustDoDistribution.push([]);
        }
      }
      
      console.log('Must-do distribution plan:', mustDoDistribution);
      
      // Filter regular activities based on preferences
      const filteredRegularActivities = regularActivities.filter(act => {
        // If no preferences, include all
        if (!preferences || Object.keys(preferences).length === 0) return true;
        
        // Check category match
        const actCategory = (act.category || act.type || '').toLowerCase();
        const preferredCategories = (preferences.categories || []).map(c => c.toLowerCase());
        
        // If guidedTour preference is true, prioritize tours
        if (preferences.guidedTour && (actCategory.includes('tour') || actCategory.includes('guided'))) {
          return true;
        }
        
        // Check if category matches preferences
        if (preferredCategories.length > 0) {
          return preferredCategories.some(prefCat => 
            actCategory.includes(prefCat) || act.name?.toLowerCase().includes(prefCat)
          );
        }
        
        return true; // Include by default if no specific filter
      });
      
      for (let i = 0; i < middleDays.length; i++) {
        const currentDate = middleDays[i];
        
        const dayItems = [];
        // dayIndex for must-do distribution: Day 2 -> index 0, Day 3 -> index 1, etc.
        const dayIndex = i;
        
        // FIRST: Add must-do activities for this day (priority)
        // Must-do activities are placed FIRST and take priority over everything else
        // IMPORTANT: Filter out hotels from must-do activities - hotels are NOT activities
        const mustDoForDay = (mustDoDistribution[dayIndex] || []).filter(mustDo => {
          const name = (mustDo.name || '').toLowerCase();
          const description = (mustDo.description || '').toLowerCase();
          
          // Check if this is a hotel (not an activity)
          const hotelKeywords = ['hotel', 'stay at', 'accommodation', 'resort', 'inn', 'lodge', 'hostel', 'motel'];
          const isHotel = hotelKeywords.some(keyword => 
            name.includes(keyword) || 
            description.includes(keyword) ||
            name.includes('to stay at') ||
            name.includes('staying at')
          );
          
          if (isHotel) {
            console.log('Filtered out hotel from must-do activities:', mustDo.name);
            return false; // Exclude hotels
          }
          return true; // Include real activities
        });
        
        mustDoForDay.forEach((mustDo, idx) => {
          const existingTimes = dayItems.map(item => item.time);
          const timeSlot = getTimeSlotForCategory(
            mustDo.category || mustDo.type, 
            mustDo.duration, 
            idx, 
            existingTimes
          );
          
          // Create booking link (GetYourGuide or Viator)
          const bookingLink = mustDo.bookingLink || createBookingLink(mustDo.name);
          
          // Extract description - clean up "User requested:" prefix if present
          let description = mustDo.description || '';
          if (description && description.startsWith('User requested:')) {
            // Remove "User requested:" prefix and clean up
            description = description.replace(/^User requested:\s*/i, '').trim();
            // If description is now empty or just the name, create a better description
            if (!description || description === mustDo.name) {
              // Create a more descriptive message based on activity name
              const activityName = mustDo.name || '';
              if (activityName.toLowerCase().includes('sagrada familia')) {
                description = 'Visit the iconic Sagrada Familia, Antoni Gaudí\'s unfinished masterpiece and one of Barcelona\'s most famous landmarks.';
              } else if (activityName.toLowerCase().includes('park güell')) {
                description = 'Explore Park Güell, a colorful public park with unique architecture and stunning city views designed by Antoni Gaudí.';
              } else if (activityName.toLowerCase().includes('museum')) {
                description = `Visit ${activityName}, a fascinating museum showcasing art, history, and culture.`;
              } else if (activityName.toLowerCase().includes('beach')) {
                description = `Enjoy ${activityName}, a beautiful beach perfect for relaxation and water activities.`;
              } else {
                description = `Visit ${activityName}, a must-see attraction in ${routeInfo.destination || 'the city'}.`;
              }
            }
          }
          // If still no description, use a default
          if (!description || description.trim() === '') {
            description = `Explore ${mustDo.name}, a must-see attraction in ${routeInfo.destination || 'the city'}.`;
          }
          
          // Extract price - handle different formats (number, object, string)
          const priceValue = (() => {
            if (mustDo.price === null || mustDo.price === undefined) return null; // Return null instead of 0 to indicate "not available"
            if (typeof mustDo.price === 'number') {
              return mustDo.price > 0 ? mustDo.price : null;
            }
            if (typeof mustDo.price === 'object') {
              const amount = mustDo.price.amount || mustDo.price.total || mustDo.price.value;
              return amount && amount > 0 ? amount : null;
            }
            const parsed = parseFloat(mustDo.price);
            return !isNaN(parsed) && parsed > 0 ? parsed : null;
          })();
          
          // Add activity icon (🎟️ for tours/experiences, 📍 for locations/attractions)
          const activityIcon = (mustDo.category || mustDo.type || '').toLowerCase().includes('tour') || 
                              (mustDo.name || '').toLowerCase().includes('tour') ? '🎟️' : '📍';
          dayItems.push({
            type: 'activity',
            title: `${activityIcon} ${mustDo.name}`,
            time: timeSlot,
            isMustDo: true, // Mark as must-do
            details: {
              // Use cleaned description
              description: description,
              duration: mustDo.duration || '2-3 hours',
              category: mustDo.category || mustDo.type || 'general',
              location: mustDo.location || routeInfo.destination || '',
              bookingLink: bookingLink || mustDo.bookingLink || mustDo.booking_link, // Always include booking link
              // Use extracted price value
              price: priceValue,
              // Preserve rating - handle different formats
              rating: (() => {
                if (mustDo.rating === null || mustDo.rating === undefined) return null;
                if (typeof mustDo.rating === 'number') return mustDo.rating;
                const parsed = parseFloat(mustDo.rating);
                return isNaN(parsed) ? null : parsed;
              })()
            }
          });
        });
        
        // SECOND: Fill remaining slots with regular activities (max 2 total per day)
        const remainingSlots = Math.max(0, 2 - dayItems.length);
        if (remainingSlots > 0 && filteredRegularActivities.length > 0 && actualMiddleDays > 0) {
          const activitiesPerDay = Math.ceil(filteredRegularActivities.length / actualMiddleDays);
          const startIdx = dayIndex * activitiesPerDay;
          const endIdx = Math.min(startIdx + remainingSlots, filteredRegularActivities.length);
          const dayActivities = filteredRegularActivities.slice(startIdx, endIdx);
          
          dayActivities.forEach((activity, idx) => {
            const existingTimes = dayItems.map(item => item.time);
            const timeSlot = getTimeSlotForCategory(
              activity.category || activity.type, 
              activity.minimumDuration || activity.duration,
              idx, 
              existingTimes
            );
            
            // Create booking link (GetYourGuide or Viator) - always include
            const bookingLink = activity.bookingLink || 
                               activity.url || 
                               createBookingLink(activity.name || 'Activity');
            
            // Add activity icon (🎟️ for tours/experiences, 📍 for locations/attractions)
            const activityIcon = (activity.category || activity.type || '').toLowerCase().includes('tour') || 
                                (activity.name || '').toLowerCase().includes('tour') ? '🎟️' : '📍';
            dayItems.push({
              type: 'activity',
              title: `${activityIcon} ${activity.name || 'Activity'}`,
              time: timeSlot,
              details: {
                description: activity.description || activity.shortDescription || '',
                duration: activity.minimumDuration || activity.duration || 'N/A',
                rating: activity.rating || 0,
                price: activity.price?.amount || activity.price || 0,
                location: activity.geoCode ? `${activity.geoCode.latitude}, ${activity.geoCode.longitude}` : (activity.location || ''),
                bookingLink: bookingLink // Always include booking link as hyperlink
              }
            });
          });
        }
        
        // If no activities (or only hotel), add "Open Exploration" card
        // Format: "🌤️ Open Exploration — Free time for casual sightseeing or rest."
        const hasActivities = dayItems.some(item => item.type === 'activity' && !item.isOpenExploration);
        if (!hasActivities) {
          dayItems.push({
            type: 'activity',
            title: '🌤️ Open Exploration',
            time: 'All Day',
            isOpenExploration: true,
            details: {
              description: 'Free time for casual sightseeing or rest.',
              duration: 'Flexible',
              bookingLink: null
            }
          });
        }
        
        // Add hotel stay indicator for ongoing stays (after check-in day)
        // Show small indicator for days between check-in and check-out
        if (hotelStays.length > 0) {
          const hotelStay = hotelStays[0];
          const dayDate = new Date(currentDate);
          dayDate.setHours(0, 0, 0, 0);
          
          const checkInDate = new Date(hotelStay.checkInDate);
          checkInDate.setHours(0, 0, 0, 0);
          const checkOutDate = new Date(hotelStay.checkOutDate);
          checkOutDate.setHours(0, 0, 0, 0);
          
          // If current date is after check-in and before check-out, show ongoing stay indicator
          if (dayDate > checkInDate && dayDate < checkOutDate) {
            dayItems.push({
              type: 'hotel',
              title: `Hotel: ${hotelStay.name} (ongoing stay)`,
              time: 'Overnight',
              isHotelStay: true,
              isOngoing: true,
              details: {
                name: hotelStay.name,
                location: hotelStay.location
              }
            });
          }
        }
      
        days.push({
          day: null, // Will be set after sorting
          date: formatDate(currentDate),
          dateObj: currentDate,
          items: dayItems,
          hasOpenExploration: dayItems.some(item => item.isOpenExploration)
        });
      }
    }

    // Last day (endDate): Return flight (only for round trips)
    // Use last date from dateRange
    if (isRoundTrip && dateRange.length > 0) {
      const lastDate = dateRange[dateRange.length - 1];
      const lastDayItems = [];
      
      // Add check-out if this is the check-out day
      if (hotelStays.length > 0) {
        const hotelStay = hotelStays[0];
        const checkOutDate = new Date(hotelStay.checkOutDate);
        checkOutDate.setHours(0, 0, 0, 0);
        const lastDateNormalized = new Date(lastDate);
        lastDateNormalized.setHours(0, 0, 0, 0);
        
        // Check if last day is the check-out day
        if (checkOutDate.getTime() === lastDateNormalized.getTime()) {
          const formatDateShort = (date) => {
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            return `${months[date.getMonth()]} ${date.getDate()}`;
          };
          
          const priceStr = hotelStay.pricePerNight > 0 
            ? `~$${Math.round(hotelStay.pricePerNight)}/night` 
            : (hotelStay.priceUnavailable ? 'Price on request' : 'Included in hotel budget');
          
          lastDayItems.push({
            type: 'hotel',
            title: `🏨 Check-out from ${hotelStay.name} (${formatDateShort(checkOutDate)}, ${priceStr})`,
            time: 'Check-out',
            isHotelStay: true,
            isCheckOut: true,
            details: {
              name: hotelStay.name,
              checkInDate: hotelStay.checkInDate,
              checkOutDate: checkOutDate,
              nights: hotelStay.nights,
              pricePerNight: hotelStay.pricePerNight,
              totalPrice: hotelStay.totalPrice,
              location: hotelStay.location,
              rating: hotelStay.rating
            }
          });
        }
      }
      
      // Validate return flight - NO DUMMY DATA
      if (!returnFlight) {
        console.warn('No return flight provided for last day - creating itinerary without return flight');
        // Don't throw error, just skip return flight and add a note
        lastDayItems.push({
          type: 'activity',
          title: '✈️ Return Flight Needed',
          time: 'All Day',
          details: {
            description: 'Please search for return flights in the chat to complete your itinerary.',
            duration: 'N/A',
            bookingLink: null
          }
        });
        
        days.push({
          day: null,
          date: formatDate(lastDate),
          dateObj: lastDate,
          items: lastDayItems
        });
      } else if (returnFlight.id === 'dummy-flight' || returnFlight.flightNumber === 'FL123' || returnFlight.airline === 'Airline') {
        console.warn('Dummy return flight data detected - creating itinerary without return flight');
        // Don't throw error, just skip dummy return flight and add a note
        lastDayItems.push({
          type: 'activity',
          title: '✈️ Return Flight Needed',
          time: 'All Day',
          details: {
            description: 'Please search for return flights in the chat to complete your itinerary.',
            duration: 'N/A',
            bookingLink: null
          }
        });
        
        days.push({
          day: null,
          date: formatDate(lastDate),
          dateObj: lastDate,
          items: lastDayItems
        });
      } else {
        // Use actual return flight data
        const returnFlightData = returnFlight;
      
      console.log('Processing return flight for last day:', {
        returnFlight: returnFlightData,
        airline: returnFlightData?.airline,
        flightNumber: returnFlightData?.flightNumber,
        departure: returnFlightData?.departure,
        arrival: returnFlightData?.arrival,
        departureAirport: returnFlightData?.departureAirport,
        arrivalAirport: returnFlightData?.arrivalAirport,
        duration: returnFlightData?.duration,
        price: returnFlightData?.price
      });
      
      // Extract time from departure string (e.g., "27 Nov 2025, 10:30" -> "10:30")
      let departureTime = 'TBD';
      if (returnFlightData.departure) {
        const timeMatch = returnFlightData.departure.match(/(\d{1,2}:\d{2})/);
        if (timeMatch) {
          departureTime = timeMatch[1];
        } else {
          departureTime = returnFlightData.departure;
        }
      } else if (returnFlightData.departureTime) {
        departureTime = returnFlightData.departureTime;
      }
      
      // Extract airport codes - return flight departs from destination, arrives at origin
      const departureAirport = returnFlightData.departureAirport || 
                               (returnFlightData.departure?.match(/([A-Z]{3})/) ? returnFlightData.departure.match(/([A-Z]{3})/)[1] : null) ||
                               routeInfo.destinationCode || 'N/A';
      const arrivalAirport = returnFlightData.arrivalAirport || 
                             (returnFlightData.arrival?.match(/([A-Z]{3})/) ? returnFlightData.arrival.match(/([A-Z]{3})/)[1] : null) ||
                             routeInfo.departureCode || 'N/A';
      
      // Ensure we have valid flight information
      const airline = returnFlightData.airline || 'Return Flight';
      const flightNumber = returnFlightData.flightNumber || '';
      const departureDisplay = returnFlightData.departure || `${departureAirport} ${departureTime}`;
      const arrivalDisplay = returnFlightData.arrival || `${arrivalAirport} TBD`;
      const duration = returnFlightData.duration ? (typeof returnFlightData.duration === 'number' ? `${returnFlightData.duration.toFixed(1)}h` : returnFlightData.duration) : 'TBD';
      const stops = returnFlightData.stops !== undefined ? returnFlightData.stops : 0;
      const price = returnFlightData.price !== undefined ? returnFlightData.price : 0;
      
      // Format: "✈️ Return Flight to {home city}"
      const returnFlightTitle = `✈️ Return Flight to ${routeInfo.departure || 'home city'}`;
      
      // Add return flight to lastDayItems (check-out was already added if applicable)
      lastDayItems.push({
        type: 'flight',
        title: returnFlightTitle,
        time: departureTime,
        details: {
          departure: departureDisplay,
          arrival: arrivalDisplay,
          duration: duration,
          stops: stops,
          price: price,
          airline: airline,
          flightNumber: flightNumber
        }
      });
      
      days.push({
        day: null, // Will be set after sorting
        date: formatDate(lastDate),
        dateObj: lastDate,
        items: lastDayItems
      });
      }
    }

    // Sort days by date (ascending)
    days.sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
    
    // Assign day numbers (Day 1, Day 2, etc.)
    days.forEach((day, index) => {
      day.day = index + 1;
    });

    console.log(`Created ${days.length} days for itinerary (sorted and labeled)`);
    
    // Return both days and hotelStays for use in summary
    return { days, hotelStays };
  };

  const toggleDay = (day) => {
    const newExpanded = new Set(expandedDays);
    if (newExpanded.has(day)) {
      newExpanded.delete(day);
    } else {
      newExpanded.add(day);
    }
    setExpandedDays(newExpanded);
  };

  const toggleItem = (day, itemIndex) => {
    const key = `${day}-${itemIndex}`;
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedItems(newExpanded);
  };

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        flexDirection: 'column',
        gap: '16px',
        background: 'linear-gradient(to bottom, #EAF9FF 0%, #ffffff 100%)'
      }}>
        <div style={{ fontSize: '48px' }}>✈️</div>
        <div style={{ fontSize: '20px', color: '#004C8C', fontWeight: 600 }}>Generating your optimized itinerary...</div>
        <div style={{ fontSize: '14px', color: '#64748b' }}>This may take a moment</div>
      </div>
    );
  }

  if (error) {
    return (
      <ScrollArea className="h-full">
        <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ 
            padding: '24px', 
            backgroundColor: '#fee2e2', 
            borderRadius: '12px', 
            border: '1px solid #fca5a5',
            marginBottom: '24px'
          }}>
            <h2 style={{ color: '#dc2626', marginBottom: '8px' }}>Error</h2>
            <p style={{ color: '#991b1b' }}>{error}</p>
          </div>
          <button
            onClick={() => navigate(-1)}
            style={{
              padding: '12px 24px',
              backgroundColor: '#00ADEF',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 600
            }}
          >
            Back to Search Results
          </button>
        </div>
      </ScrollArea>
    );
  }

  if (!itineraryData) {
    // Show empty state when no itinerary is found
    return (
      <ScrollArea className="h-full">
        <div style={{ 
          padding: '24px', 
          maxWidth: '1200px', 
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          gap: '24px'
        }}>
          <div style={{ fontSize: '64px' }}>📋</div>
          <div style={{ 
            fontSize: '24px', 
            color: '#004C8C', 
            fontWeight: 600,
            textAlign: 'center'
          }}>
            No Itinerary Found
          </div>
          <div style={{ 
            fontSize: '16px', 
            color: '#64748b',
            textAlign: 'center',
            maxWidth: '500px'
          }}>
            We couldn't find a saved itinerary. Please go back to the chat and generate a new one.
          </div>
          <button
            onClick={() => navigate('/chat')}
            style={{
              padding: '12px 24px',
              backgroundColor: '#00ADEF',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 600,
              marginTop: '8px'
            }}
          >
            Back to Chat
          </button>
        </div>
      </ScrollArea>
    );
  }

  const { flight, hotel, activity, days, total_price, total_score } = itineraryData;
  
  // Load TripState to get selected flights/hotel and must-do activities
  const { loadTripState } = require('../utils/tripState');
  const currentTripState = loadTripState();
  
  // Debug: Log tripState to see what's actually stored
  console.log('=== OptimizedItinerary Debug: tripState ===');
  console.log('currentTripState:', currentTripState);
  console.log('currentTripState.origin:', currentTripState?.origin);
  console.log('currentTripState.destination:', currentTripState?.destination);
  console.log('currentTripState.originCode:', currentTripState?.originCode);
  console.log('currentTripState.destinationCode:', currentTripState?.destinationCode);
  console.log('tripState (memoized):', tripState);
  console.log('tripState.origin:', tripState?.origin);
  console.log('routeInfo:', routeInfo);
  console.log('routeInfo.departure:', routeInfo.departure);
  
  // Get selected flights/hotel from TripState (if user selected specific items)
  const selectedOutboundFlight = currentTripState?.selectedOutboundFlight || null;
  const selectedReturnFlight = currentTripState?.selectedReturnFlight || null;
  const selectedHotel = currentTripState?.selectedHotel || null;
  const mustDoActivities = currentTripState?.mustDoActivities || [];
  
  // Use selected flights if available, otherwise use optimized flights from API response
  // Hotel selection is already handled in generateItinerary based on preferences
  const outboundFlight = selectedOutboundFlight || flight || null;
  const returnFlight = selectedReturnFlight || null; // Return flight is separate
  
  // Use hotel from itineraryData (already selected based on preferences in generateItinerary)
  // Fallback to selectedHotel from tripState if available
  const finalHotel = selectedHotel || hotel || null;
  
  // Extract price helper function
  const extractPrice = (item) => {
    if (!item) return 0;
    // First check for price_per_night (common for hotels)
    if (item.price_per_night !== null && item.price_per_night !== undefined) {
      if (typeof item.price_per_night === 'number') return item.price_per_night;
      if (typeof item.price_per_night === 'string') {
        const parsed = parseFloat(item.price_per_night);
        if (!isNaN(parsed)) return parsed;
      }
    }
    // Then check for price field
    if (item.price === null || item.price === undefined) return 0;
    if (typeof item.price === 'number') return item.price;
    if (typeof item.price === 'object' && item.price !== null) {
      return item.price.amount || item.price.total || item.price.value || 0;
    }
    if (typeof item.price === 'string') {
      const parsed = parseFloat(item.price);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  };
  
  // Calculate costs from selected items or API response
  // extractPrice is already defined above
  
  const outboundFlightCost = extractPrice(outboundFlight);
  const returnFlightCost = extractPrice(returnFlight);
  const flightsCost = outboundFlightCost + returnFlightCost;
  
  // Calculate hotel cost: use totalPrice from hotelStays if available, otherwise calculate from price × nights
  let hotelsCost = 0;
  console.log('=== Hotel Cost Calculation Debug ===');
  console.log('finalHotel:', finalHotel);
  console.log('itineraryData?.hotelStays:', itineraryData?.hotelStays);
  if (itineraryData?.hotelStays && itineraryData.hotelStays.length > 0 && itineraryData.hotelStays[0].totalPrice > 0) {
    hotelsCost = itineraryData.hotelStays[0].totalPrice;
    console.log('Using hotelStays totalPrice:', hotelsCost);
  } else if (finalHotel) {
    // First check if hotel has a total_price or totalPrice field (already calculated total)
    if (finalHotel.total_price !== null && finalHotel.total_price !== undefined && finalHotel.total_price > 0) {
      hotelsCost = typeof finalHotel.total_price === 'number' ? finalHotel.total_price : parseFloat(finalHotel.total_price) || 0;
      console.log('Using hotel.total_price:', hotelsCost);
    } else if (finalHotel.totalPrice !== null && finalHotel.totalPrice !== undefined && finalHotel.totalPrice > 0) {
      hotelsCost = typeof finalHotel.totalPrice === 'number' ? finalHotel.totalPrice : parseFloat(finalHotel.totalPrice) || 0;
      console.log('Using hotel.totalPrice:', hotelsCost);
    } else {
      // Calculate from price_per_night × nights
      const pricePerNight = extractPrice(finalHotel);
      console.log('Extracted pricePerNight:', pricePerNight);
      console.log('finalHotel.price:', finalHotel.price);
      console.log('finalHotel.price_per_night:', finalHotel.price_per_night);
      if (pricePerNight > 0) {
        // Calculate nights from check-in/check-out dates
        let checkIn = null;
        let checkOut = null;
        
        // Try to get dates from hotel object first
        if (finalHotel.check_in && finalHotel.check_out) {
          checkIn = finalHotel.check_in;
          checkOut = finalHotel.check_out;
        } else if (routeInfo?.date && routeInfo?.returnDate) {
          // Fallback to routeInfo dates
          checkIn = routeInfo.date;
          checkOut = routeInfo.returnDate;
        } else if (itineraryData?.routeInfo?.date && itineraryData?.routeInfo?.returnDate) {
          // Fallback to itineraryData routeInfo dates
          checkIn = itineraryData.routeInfo.date;
          checkOut = itineraryData.routeInfo.returnDate;
        }
        
        if (checkIn && checkOut) {
          try {
            const checkInDate = new Date(checkIn);
            const checkOutDate = new Date(checkOut);
            const nights = Math.max(1, Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24)));
            hotelsCost = pricePerNight * nights;
            console.log('Calculated hotelsCost from pricePerNight × nights:', hotelsCost, `(${pricePerNight} × ${nights})`);
          } catch (e) {
            console.warn('Failed to calculate hotel nights from dates:', e);
            // Fallback: use pricePerNight as estimate (assume 1 night minimum)
            hotelsCost = pricePerNight;
            console.log('Using pricePerNight as fallback (1 night):', hotelsCost);
          }
        } else {
          // No dates available, use pricePerNight as estimate (assume 1 night minimum)
          hotelsCost = pricePerNight;
          console.log('No dates available, using pricePerNight as estimate (1 night):', hotelsCost);
        }
      } else {
        console.warn('pricePerNight is 0 or invalid, hotelsCost remains 0');
      }
    }
  }
  console.log('Final hotelsCost:', hotelsCost);
  
  // Calculate activities cost from must-do activities and API response
  let activitiesCost = 0;
  if (activity?.price) {
    activitiesCost += extractPrice(activity);
  }
  // Add must-do activities costs
  mustDoActivities.forEach(mustDo => {
    if (mustDo.price) {
      activitiesCost += extractPrice(mustDo);
    }
  });
  
  // Always calculate total cost from individual components (don't trust API total_price)
  const totalCost = flightsCost + hotelsCost + activitiesCost;
  
  // Calculate total travel time: outbound + return flight durations
  const outboundDuration = parseDuration(outboundFlight?.duration || '0h');
  const returnDuration = parseDuration(returnFlight?.duration || '0h');
  const totalDuration = outboundDuration + returnDuration;
  
  // Calculate total stops: outbound + return flight stops
  const outboundStops = outboundFlight?.stops || 0;
  const returnStops = returnFlight?.stops || 0;
  const totalStops = outboundStops + returnStops;
  
  // Calculate convenience score: use backend score if available, otherwise calculate
  const maxPrice = Math.max(...allFlights.map(f => f.price || 0), total_price || 0, 2000);
  let convenienceScore = 0;
  if (total_score !== undefined && total_score !== null) {
    // Use backend convenience score if available
    convenienceScore = Math.round(total_score * 100);
  } else {
    // Calculate convenience score from flights
    const flightsForScore = [outboundFlight, returnFlight].filter(f => f);
    convenienceScore = calculateConvenienceScore(
      flightsForScore,
      totalCost,
      maxPrice
    );
  }
  
  // Check if we have any data at all
  const hasData = (outboundFlight || returnFlight || finalHotel || mustDoActivities.length > 0 || activity);

  // Prepare chart data for summary
  const summaryChartData = [
    { name: 'Cost', value: totalCost, max: maxPrice },
    { name: 'Duration', value: totalDuration, max: 24 },
    { name: 'Stops', value: totalStops, max: 4 },
    { name: 'Convenience', value: convenienceScore, max: 100 }
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(to bottom, #EAF9FF 0%, #ffffff 100%)' }}>
      <ScrollArea className="h-full">
        <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
          {/* Header */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '32px',
            flexWrap: 'wrap',
            gap: '16px'
          }}>
            <div>
              <h1 style={{ 
                fontSize: '36px', 
                fontWeight: 700, 
                color: '#004C8C',
                marginBottom: '8px'
              }}>
                Optimized Itinerary
              </h1>
              <p style={{ color: '#64748b', fontSize: '18px' }}>
                {(() => {
                  // Priority: currentTripState (latest) > tripState (memoized) > routeInfo > default
                  // Get departure/origin - prefer full city name from currentTripState, fallback to tripState, then routeInfo
                  // Also check location.state.routeInfo which is passed from Chat.jsx
                  const routeInfoFromState = location.state?.routeInfo || {};
                  const departure = currentTripState?.origin || tripState?.origin || routeInfoFromState.departure || routeInfo.departure || routeInfo.departureCode || null;
                  const departureCode = currentTripState?.originCode || tripState?.originCode || routeInfoFromState.departureCode || routeInfo.departureCode || '';
                  
                  // Get destination - prefer full city name from currentTripState, fallback to tripState, then routeInfo
                  const destination = currentTripState?.destination || tripState?.destination || routeInfo.destination || routeInfo.destinationCode || null;
                  const destinationCode = currentTripState?.destinationCode || tripState?.destinationCode || routeInfo.destinationCode || '';
                  
                  // Debug: Log what we're getting
                  console.log('Route display debug:', {
                    currentTripStateOrigin: currentTripState?.origin,
                    tripStateOrigin: tripState?.origin,
                    routeInfoDeparture: routeInfo.departure,
                    routeInfoDepartureCode: routeInfo.departureCode,
                    finalDeparture: departure,
                    finalDepartureCode: departureCode,
                    currentTripStateDestination: currentTripState?.destination,
                    tripStateDestination: tripState?.destination,
                    routeInfoDestination: routeInfo.destination,
                    finalDestination: destination
                  });
                  
                  // Format: Use proper city names (not lowercase), "to" instead of "→"
                  let departureDisplay = '';
                  let destinationDisplay = '';
                  
                  // Get departure city name (prefer full name, fallback to code)
                  if (departure && departure !== 'Unknown' && departure.trim() !== '') {
                    departureDisplay = departure;
                  } else if (departureCode && departureCode.trim() !== '') {
                    departureDisplay = departureCode;
                  }
                  
                  // Get destination city name (prefer full name, fallback to code)
                  if (destination && destination !== 'Unknown' && destination.trim() !== '') {
                    destinationDisplay = destination;
                  } else if (destinationCode && destinationCode.trim() !== '') {
                    destinationDisplay = destinationCode;
                  }
                  
                  // Get dates - Priority: currentTripState (latest) > tripState > routeInfo
                  const startDateStr = currentTripState?.startDate || tripState?.startDate || routeInfo.date || routeInfo.departure_display || '';
                  const endDateStr = currentTripState?.endDate || tripState?.endDate || routeInfo.returnDate || routeInfo.return_display || '';
                  
                  // Format dates for display (parse and format if needed)
                  let startDateDisplay = startDateStr;
                  let endDateDisplay = endDateStr;
                  
                  if (startDateStr) {
                    const parsedStart = parseDate(startDateStr);
                    if (parsedStart && !isNaN(parsedStart.getTime())) {
                      startDateDisplay = formatDate(parsedStart);
                    }
                  }
                  
                  if (endDateStr) {
                    const parsedEnd = parseDate(endDateStr);
                    if (parsedEnd && !isNaN(parsedEnd.getTime())) {
                      endDateDisplay = formatDate(parsedEnd);
                    }
                  }
                  
                  const dateRange = endDateDisplay && endDateDisplay !== startDateDisplay 
                    ? `${startDateDisplay} - ${endDateDisplay}` 
                    : startDateDisplay || 'Date TBD';
                  
                  // Format: "washington dc to barcelona • Tuesday, January 6, 2026 - Sunday, January 11, 2026"
                  if (departureDisplay && destinationDisplay) {
                    return `${departureDisplay} to ${destinationDisplay} • ${dateRange}`;
                  } else if (destinationDisplay) {
                    return `${destinationDisplay} • ${dateRange}`;
                  } else {
                    return dateRange;
                  }
                })()}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button
                onClick={() => setShowPreferencesModal(true)}
                style={{
                  padding: '12px 24px',
                  backgroundColor: 'white',
                  color: '#004C8C',
                  border: '2px solid #004C8C',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: 600,
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#f0f9ff';
                  e.target.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'white';
                  e.target.style.transform = 'translateY(0)';
                }}
              >
                Preferences
              </button>
              <button
                onClick={() => {
                  // Save current itinerary state before navigating back to chat
                  if (itineraryData) {
                    saveCurrentItinerary(itineraryData);
                    // Save full optimized itinerary to tripState and localStorage
                    saveOptimizedItinerary(itineraryData);
                    console.log('Saved current itinerary state before navigating back to chat');
                  }
                  
                  // Navigate to chat with flag to restore saved conversation
                  navigate('/chat', {
                    state: {
                      restoreConversation: true,
                      hasExistingItinerary: true
                    }
                  });
                }}
                style={{
                  padding: '12px 24px',
                  backgroundColor: 'white',
                  color: '#00ADEF',
                  border: '2px solid #00ADEF',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: 600,
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#E6F7FF';
                  e.target.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'white';
                  e.target.style.transform = 'translateY(0)';
                }}
              >
                Back to Results
              </button>
              <button
                onClick={generateItinerary}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#00ADEF',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: 600,
                  transition: 'all 0.2s',
                  boxShadow: '0 2px 4px rgba(0, 173, 239, 0.3)'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#006AAF';
                  e.target.style.transform = 'translateY(-1px)';
                  e.target.style.boxShadow = '0 4px 8px rgba(0, 173, 239, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = '#00ADEF';
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = '0 2px 4px rgba(0, 173, 239, 0.3)';
                }}
              >
                Re-optimize
              </button>
            </div>
          </div>

          {/* Preferences Display */}
          <div style={{
            backgroundColor: '#f0f9ff',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '24px',
            border: '1px solid #bae6fd'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px', fontWeight: 500 }}>Optimization Weights</div>
                <div style={{ display: 'flex', gap: '32px', fontSize: '16px', flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ color: '#004C8C', fontWeight: 500 }}>Budget: </span>
                    <span style={{ color: '#00ADEF', fontWeight: 700 }}>
                      {preferences && typeof preferences.budget === 'number' 
                        ? (preferences.budget * 100).toFixed(0) 
                        : '33'}%
                    </span>
                  </div>
                  <div>
                    <span style={{ color: '#004C8C', fontWeight: 500 }}>Quality: </span>
                    <span style={{ color: '#00ADEF', fontWeight: 700 }}>
                      {preferences && typeof preferences.quality === 'number' 
                        ? (preferences.quality * 100).toFixed(0) 
                        : '33'}%
                    </span>
                  </div>
                  <div>
                    <span style={{ color: '#004C8C', fontWeight: 500 }}>Convenience: </span>
                    <span style={{ color: '#00ADEF', fontWeight: 700 }}>
                      {preferences && typeof preferences.convenience === 'number' 
                        ? (preferences.convenience * 100).toFixed(0) 
                        : '34'}%
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowPreferencesModal(true)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'white',
                  color: '#00ADEF',
                  border: '1px solid #00ADEF',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500
                }}
              >
                Edit
              </button>
            </div>
          </div>

          {/* Summary Section */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            padding: '32px',
            marginBottom: '32px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
              <h2 style={{ 
                fontSize: '28px', 
                fontWeight: 700, 
                color: '#004C8C',
                margin: 0
              }}>
                Trip Summary
              </h2>
              {itineraryData?.total_score && (
                <div style={{
                  padding: '12px 20px',
                  backgroundColor: '#f0f9ff',
                  borderRadius: '12px',
                  border: '2px solid #bae6fd'
                }}>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', fontWeight: 500 }}>Optimization Score</div>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: '#00ADEF' }}>
                    {Math.round(itineraryData.total_score * 100)}%
                  </div>
                </div>
              )}
            </div>
            {!hasData ? (
              <div style={{ 
                padding: '40px', 
                backgroundColor: '#f8fafc', 
                borderRadius: '12px',
                textAlign: 'center',
                border: '2px dashed #cbd5e1'
              }}>
                <div style={{ fontSize: '18px', color: '#64748b', marginBottom: '8px', fontWeight: 500 }}>
                  No trip data yet – please pick flights and activities first.
                </div>
                <div style={{ fontSize: '14px', color: '#94a3b8', marginTop: '8px' }}>
                  Go back to chat to search for flights and add activities to your itinerary.
                </div>
              </div>
            ) : (
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '24px',
                marginBottom: '32px'
              }}>
                <div style={{ padding: '20px', backgroundColor: '#f8fafc', borderRadius: '12px' }}>
                  <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px', fontWeight: 500 }}>Total Cost</div>
                  <div style={{ fontSize: '32px', fontWeight: 700, color: '#00ADEF' }}>
                    ${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                    Flights: ${flightsCost.toFixed(2)} • Hotels: ${hotelsCost.toFixed(2)} • Activities: ${activitiesCost.toFixed(2)}
                  </div>
                  {itineraryData?.hotelStays && itineraryData.hotelStays.length > 0 && itineraryData.hotelStays[0] && (
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #e2e8f0' }}>
                      <span style={{ fontWeight: 600, color: '#004C8C' }}>Hotels: </span>
                      <span style={{ color: '#00ADEF' }}>
                        {itineraryData.hotelStays[0].name} ({itineraryData.hotelStays[0].nights} {itineraryData.hotelStays[0].nights === 1 ? 'night' : 'nights'}, 
                        {itineraryData.hotelStays[0].pricePerNight > 0 
                          ? ` ~$${Math.round(itineraryData.hotelStays[0].pricePerNight)}/night`
                          : (itineraryData.hotelStays[0].totalPrice > 0 
                            ? ` ~$${Math.round(itineraryData.hotelStays[0].totalPrice).toLocaleString()}`
                            : ' Included in hotel budget')})
                      </span>
                    </div>
                  )}
                </div>
                <div style={{ padding: '20px', backgroundColor: '#f8fafc', borderRadius: '12px' }}>
                  <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px', fontWeight: 500 }}>Total Travel Time</div>
                  <div style={{ fontSize: '32px', fontWeight: 700, color: '#00ADEF' }}>
                    {totalDuration.toFixed(1)}h
                  </div>
                  {outboundDuration > 0 && returnDuration > 0 && (
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                      Outbound: {outboundDuration.toFixed(1)}h • Return: {returnDuration.toFixed(1)}h
                    </div>
                  )}
                </div>
                <div style={{ padding: '20px', backgroundColor: '#f8fafc', borderRadius: '12px' }}>
                  <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px', fontWeight: 500 }}>Number of Stops</div>
                  <div style={{ fontSize: '32px', fontWeight: 700, color: '#00ADEF' }}>
                    {totalStops}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                    {totalStops === 0 ? 'Non-stop flight' : `${totalStops} stop${totalStops > 1 ? 's' : ''}`}
                    {outboundStops > 0 && returnStops > 0 && ` (Outbound: ${outboundStops}, Return: ${returnStops})`}
                  </div>
                </div>
                <div style={{ padding: '20px', backgroundColor: '#f8fafc', borderRadius: '12px' }}>
                  <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px', fontWeight: 500 }}>Convenience Score</div>
                  <div style={{ fontSize: '32px', fontWeight: 700, color: '#00ADEF' }}>
                    {convenienceScore}/100
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                    Based on duration, stops, and price
                  </div>
                </div>
              </div>
            )}

            {/* Selected Flights and Hotel Cards */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '24px',
              marginTop: '32px'
            }}>
              {/* Outbound Flight Card */}
              {outboundFlight && (
                <div style={{
                  padding: '20px',
                  backgroundColor: '#f8fafc',
                  borderRadius: '12px',
                  border: '2px solid #e2e8f0'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <div style={{ fontSize: '24px' }}>✈️</div>
                    <div>
                      <div style={{ fontSize: '14px', color: '#64748b', fontWeight: 500 }}>Outbound Flight</div>
                      <div style={{ fontSize: '18px', fontWeight: 600, color: '#004C8C' }}>
                        {outboundFlight.airline || 'Airline'} {outboundFlight.flightNumber || ''}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '14px' }}>
                    <div>
                      <div style={{ color: '#64748b', marginBottom: '4px' }}>Departure</div>
                      <div style={{ fontWeight: 600, color: '#004C8C' }}>{outboundFlight.departure || 'N/A'}</div>
                    </div>
                    <div>
                      <div style={{ color: '#64748b', marginBottom: '4px' }}>Arrival</div>
                      <div style={{ fontWeight: 600, color: '#004C8C' }}>{outboundFlight.arrival || 'N/A'}</div>
                    </div>
                    <div>
                      <div style={{ color: '#64748b', marginBottom: '4px' }}>Duration</div>
                      <div style={{ fontWeight: 600, color: '#004C8C' }}>{outboundFlight.duration || 'N/A'}</div>
                    </div>
                    <div>
                      <div style={{ color: '#64748b', marginBottom: '4px' }}>Price</div>
                      <div style={{ fontWeight: 700, color: '#00ADEF', fontSize: '16px' }}>
                        ${outboundFlightCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Return Flight Card */}
              {returnFlight && (
                <div style={{
                  padding: '20px',
                  backgroundColor: '#f8fafc',
                  borderRadius: '12px',
                  border: '2px solid #e2e8f0'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <div style={{ fontSize: '24px' }}>✈️</div>
                    <div>
                      <div style={{ fontSize: '14px', color: '#64748b', fontWeight: 500 }}>Return Flight</div>
                      <div style={{ fontSize: '18px', fontWeight: 600, color: '#004C8C' }}>
                        {returnFlight.airline || 'Airline'} {returnFlight.flightNumber || ''}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '14px' }}>
                    <div>
                      <div style={{ color: '#64748b', marginBottom: '4px' }}>Departure</div>
                      <div style={{ fontWeight: 600, color: '#004C8C' }}>{returnFlight.departure || 'N/A'}</div>
                    </div>
                    <div>
                      <div style={{ color: '#64748b', marginBottom: '4px' }}>Arrival</div>
                      <div style={{ fontWeight: 600, color: '#004C8C' }}>{returnFlight.arrival || 'N/A'}</div>
                    </div>
                    <div>
                      <div style={{ color: '#64748b', marginBottom: '4px' }}>Duration</div>
                      <div style={{ fontWeight: 600, color: '#004C8C' }}>{returnFlight.duration || 'N/A'}</div>
                    </div>
                    <div>
                      <div style={{ color: '#64748b', marginBottom: '4px' }}>Price</div>
                      <div style={{ fontWeight: 700, color: '#00ADEF', fontSize: '16px' }}>
                        ${returnFlightCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Hotel Card */}
              {finalHotel && (
                <div style={{
                  padding: '20px',
                  backgroundColor: '#f8fafc',
                  borderRadius: '12px',
                  border: '2px solid #e2e8f0'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <div style={{ fontSize: '24px' }}>🏨</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', color: '#64748b', fontWeight: 500 }}>Hotel</div>
                      <div style={{ fontSize: '18px', fontWeight: 600, color: '#004C8C' }}>
                        {finalHotel.name || finalHotel.hotelName || 'Hotel'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '14px' }}>
                    {finalHotel.rating && (
                      <div>
                        <div style={{ color: '#64748b', marginBottom: '4px' }}>Rating</div>
                        <div style={{ fontWeight: 600, color: '#004C8C' }}>
                          ⭐ {typeof finalHotel.rating === 'number' ? finalHotel.rating.toFixed(1) : finalHotel.rating}
                        </div>
                      </div>
                    )}
                    {finalHotel.location && (
                      <div>
                        <div style={{ color: '#64748b', marginBottom: '4px' }}>Location</div>
                        <div style={{ fontWeight: 600, color: '#004C8C' }}>{finalHotel.location}</div>
                      </div>
                    )}
                    {finalHotel.price_per_night && (
                      <div>
                        <div style={{ color: '#64748b', marginBottom: '4px' }}>Price/Night</div>
                        <div style={{ fontWeight: 700, color: '#00ADEF', fontSize: '16px' }}>
                          ${finalHotel.price_per_night.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/night
                        </div>
                      </div>
                    )}
                    {finalHotel.price && !finalHotel.price_per_night && (
                      <div>
                        <div style={{ color: '#64748b', marginBottom: '4px' }}>Price</div>
                        <div style={{ fontWeight: 700, color: '#00ADEF', fontSize: '16px' }}>
                          ${extractPrice(finalHotel).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                    )}
                    {finalHotel.check_in && finalHotel.check_out && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <div style={{ color: '#64748b', marginBottom: '4px' }}>Dates</div>
                        <div style={{ fontWeight: 600, color: '#004C8C' }}>
                          {formatDate(parseDate(finalHotel.check_in))} - {formatDate(parseDate(finalHotel.check_out))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Summary Chart */}
            <div style={{ height: '250px', marginTop: '24px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summaryChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'white', 
                      border: '1px solid #e2e8f0', 
                      borderRadius: '8px',
                      padding: '8px'
                    }}
                  />
                  <Bar dataKey="value" fill="#00ADEF" radius={[8, 8, 0, 0]}>
                    {summaryChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill="#00ADEF" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Day-by-Day Timeline */}
          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ 
              fontSize: '28px', 
              fontWeight: 700, 
              color: '#004C8C',
              marginBottom: '24px'
            }}>
              Itinerary Timeline
            </h2>
            {days.map((day, dayIndex) => (
              <DaySection
                key={day.day}
                day={day}
                isExpanded={expandedDays.has(day.day)}
                expandedItems={expandedItems}
                onToggleDay={() => toggleDay(day.day)}
                onToggleItem={(itemIndex) => toggleItem(day.day, itemIndex)}
              />
            ))}
          </div>
        </div>
      </ScrollArea>

      {/* Preferences Modal */}
      {showPreferencesModal && (
        <PreferencesModal
          preferences={preferences}
          onSave={(newPreferences) => {
            setPreferences(newPreferences);
            setShowPreferencesModal(false);
            // Save to localStorage
            try {
              localStorage.setItem('travelPreferences', JSON.stringify({ preferences: newPreferences }));
            } catch (e) {
              console.log('Could not save preferences to localStorage:', e);
            }
            // Regenerate itinerary with new preferences - will be triggered by useEffect when preferences updates
          }}
          onClose={() => setShowPreferencesModal(false)}
        />
      )}
    </div>
  );
}

// Preferences Modal Component
function PreferencesModal({ preferences, onSave, onClose }) {
  const [budget, setBudget] = useState(Math.round(preferences.budget * 5));
  const [quality, setQuality] = useState(Math.round(preferences.quality * 5));
  const [convenience, setConvenience] = useState(Math.round(preferences.convenience * 5));

  const normalizeWeights = (budgetVal, qualityVal, convenienceVal) => {
    const total = budgetVal + qualityVal + convenienceVal;
    if (total === 0) return { budget: 0.33, quality: 0.33, convenience: 0.34 };
    return {
      budget: budgetVal / total,
      quality: qualityVal / total,
      convenience: convenienceVal / total
    };
  };

  const handleSave = () => {
    const weights = normalizeWeights(budget, quality, convenience);
    onSave(weights);
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          padding: '40px',
          maxWidth: '600px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
          position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'none',
            border: 'none',
            fontSize: '28px',
            cursor: 'pointer',
            color: '#666',
            padding: '4px 8px',
            borderRadius: '4px',
            transition: 'background-color 0.2s',
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onMouseEnter={(e) => e.target.style.backgroundColor = '#f3f4f6'}
          onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
        >
          ×
        </button>

        <h2 style={{ 
          fontSize: '28px', 
          fontWeight: 700, 
          color: '#004C8C',
          marginBottom: '8px',
          marginTop: 0
        }}>
          Trip Preferences
        </h2>
        <p style={{ 
          fontSize: '14px', 
          color: '#64748b', 
          marginBottom: '32px'
        }}>
          Adjust the importance of each factor (1 = least important, 5 = most important)
        </p>

        {/* Budget Slider */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '12px'
          }}>
            <label style={{ 
              fontSize: '18px', 
              fontWeight: 600, 
              color: '#004C8C'
            }}>
              Budget
            </label>
            <span style={{ 
              fontSize: '24px', 
              fontWeight: 700, 
              color: '#00ADEF',
              minWidth: '40px',
              textAlign: 'right'
            }}>
              {budget}
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="5"
            value={budget}
            onChange={(e) => setBudget(parseInt(e.target.value))}
            style={{
              width: '100%',
              height: '10px',
              borderRadius: '5px',
              background: `linear-gradient(to right, #00ADEF 0%, #00ADEF ${((budget - 1) / 4) * 100}%, #EAF9FF ${((budget - 1) / 4) * 100}%, #EAF9FF 100%)`,
              outline: 'none',
              WebkitAppearance: 'none',
              cursor: 'pointer',
            }}
          />
        </div>

        {/* Quality Slider */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '12px'
          }}>
            <label style={{ 
              fontSize: '18px', 
              fontWeight: 600, 
              color: '#004C8C'
            }}>
              Quality
            </label>
            <span style={{ 
              fontSize: '24px', 
              fontWeight: 700, 
              color: '#00ADEF',
              minWidth: '40px',
              textAlign: 'right'
            }}>
              {quality}
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="5"
            value={quality}
            onChange={(e) => setQuality(parseInt(e.target.value))}
            style={{
              width: '100%',
              height: '10px',
              borderRadius: '5px',
              background: `linear-gradient(to right, #00ADEF 0%, #00ADEF ${((quality - 1) / 4) * 100}%, #EAF9FF ${((quality - 1) / 4) * 100}%, #EAF9FF 100%)`,
              outline: 'none',
              WebkitAppearance: 'none',
              cursor: 'pointer',
            }}
          />
        </div>

        {/* Convenience Slider */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '12px'
          }}>
            <label style={{ 
              fontSize: '18px', 
              fontWeight: 600, 
              color: '#004C8C'
            }}>
              Convenience
            </label>
            <span style={{ 
              fontSize: '24px', 
              fontWeight: 700, 
              color: '#00ADEF',
              minWidth: '40px',
              textAlign: 'right'
            }}>
              {convenience}
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="5"
            value={convenience}
            onChange={(e) => setConvenience(parseInt(e.target.value))}
            style={{
              width: '100%',
              height: '10px',
              borderRadius: '5px',
              background: `linear-gradient(to right, #00ADEF 0%, #00ADEF ${((convenience - 1) / 4) * 100}%, #EAF9FF ${((convenience - 1) / 4) * 100}%, #EAF9FF 100%)`,
              outline: 'none',
              WebkitAppearance: 'none',
              cursor: 'pointer',
            }}
          />
        </div>

        {/* Weight Display */}
        <div style={{ 
          marginBottom: '32px',
          padding: '20px',
          background: '#EAF9FF',
          borderRadius: '12px'
        }}>
          <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '12px', fontWeight: 500 }}>
            Normalized Weights:
          </div>
          <div style={{ display: 'flex', gap: '32px', fontSize: '18px', flexWrap: 'wrap' }}>
            <div>
              <span style={{ color: '#004C8C', fontWeight: 600 }}>Budget: </span>
              <span style={{ color: '#00ADEF', fontWeight: 700 }}>
                {(normalizeWeights(budget, quality, convenience).budget * 100).toFixed(1)}%
              </span>
            </div>
            <div>
              <span style={{ color: '#004C8C', fontWeight: 600 }}>Quality: </span>
              <span style={{ color: '#00ADEF', fontWeight: 700 }}>
                {(normalizeWeights(budget, quality, convenience).quality * 100).toFixed(1)}%
              </span>
            </div>
            <div>
              <span style={{ color: '#004C8C', fontWeight: 600 }}>Convenience: </span>
              <span style={{ color: '#00ADEF', fontWeight: 700 }}>
                {(normalizeWeights(budget, quality, convenience).convenience * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '12px 24px',
              backgroundColor: 'white',
              color: '#64748b',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 600
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '12px 24px',
              backgroundColor: '#00ADEF',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 600
            }}
          >
            Apply & Re-optimize
          </button>
        </div>
      </div>
    </div>
  );
}

// Day Section Component
function DaySection({ day, isExpanded, expandedItems, onToggleDay, onToggleItem }) {
  const getIcon = (type) => {
    switch (type) {
      case 'flight': return '✈️';
      case 'hotel': return '🏨';
      case 'activity': return '🎫';
      default: return '📍';
    }
  };

  const getColor = (type) => {
    switch (type) {
      case 'flight': return '#00ADEF';
      case 'hotel': return '#8b5cf6';
      case 'activity': return '#10b981';
      default: return '#64748b';
    }
  };

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '16px',
      marginBottom: '20px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      border: '1px solid #e2e8f0',
      overflow: 'hidden',
      transition: 'all 0.3s ease'
    }}>
      {/* Day Header */}
      <button
        onClick={onToggleDay}
        style={{
          width: '100%',
          padding: '24px',
          backgroundColor: isExpanded ? '#f0f9ff' : 'white',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          transition: 'background-color 0.2s'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            backgroundColor: '#00ADEF',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '24px',
            fontWeight: 700,
            boxShadow: '0 2px 8px rgba(0, 173, 239, 0.3)'
          }}>
            {day.day}
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#004C8C', marginBottom: '4px' }}>
              Day {day.day}
            </div>
            <div style={{ fontSize: '14px', color: '#64748b' }}>
              {day.date}
            </div>
          </div>
          <div style={{
            fontSize: '14px',
            color: '#64748b',
            padding: '4px 12px',
            backgroundColor: '#f8fafc',
            borderRadius: '12px'
          }}>
            {day.items.length} item{day.items.length > 1 ? 's' : ''}
          </div>
        </div>
        <div style={{ fontSize: '24px', color: '#64748b' }}>
          {isExpanded ? '▼' : '▶'}
        </div>
      </button>

      {/* Day Items */}
      {isExpanded && (
        <div style={{ padding: '24px', borderTop: '1px solid #e2e8f0', backgroundColor: '#fafbfc' }}>
          {day.items.map((item, itemIndex) => (
            <ItemCard
              key={itemIndex}
              item={item}
              icon={getIcon(item.type)}
              color={getColor(item.type)}
              isExpanded={expandedItems.has(`${day.day}-${itemIndex}`)}
              onToggle={() => onToggleItem(itemIndex)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Item Card Component
function ItemCard({ item, icon, color, isExpanded, onToggle }) {
  // For ongoing hotel stays, show as a small badge/sub-line instead of full card
  if (item.isOngoing && item.type === 'hotel') {
    return (
      <div style={{
        marginBottom: '8px',
        padding: '8px 12px',
        backgroundColor: '#f8fafc',
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        <span style={{ fontSize: '16px' }}>🏨</span>
        <span style={{ fontSize: '14px', color: '#64748b', fontWeight: 500 }}>
          {item.title}
        </span>
      </div>
    );
  }
  
  return (
    <div style={{
      marginBottom: '16px',
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
      overflow: 'hidden',
      backgroundColor: 'white',
      transition: 'all 0.2s'
    }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          padding: '20px',
          backgroundColor: isExpanded ? '#f0f9ff' : 'white',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          transition: 'background-color 0.2s'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ 
            fontSize: '32px',
            width: '48px',
            height: '48px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: `${color}20`,
            borderRadius: '12px'
          }}>
            {icon}
          </div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 600, color: '#004C8C', marginBottom: '4px' }}>
              {item.title}
            </div>
            <div style={{ fontSize: '14px', color: '#64748b' }}>
              {item.time}
            </div>
          </div>
        </div>
        <div style={{ fontSize: '18px', color: '#64748b' }}>
          {isExpanded ? '▼' : '▶'}
        </div>
      </button>

      {isExpanded && (
        <div style={{ 
          padding: '20px', 
          backgroundColor: '#f8fafc',
          borderTop: `3px solid ${color}`
        }}>
          {item.type === 'flight' && (
            <FlightDetails details={item.details} />
          )}
          {item.type === 'hotel' && (
            <HotelDetails details={item.details} isOngoing={item.isOngoing} />
          )}
          {item.type === 'activity' && (
            <ActivityDetails details={item.details} />
          )}
        </div>
      )}
    </div>
  );
}

function FlightDetails({ details }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px' }}>
      <div>
        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px', fontWeight: 500 }}>Departure</div>
        <div style={{ fontSize: '16px', fontWeight: 600, color: '#004C8C' }}>{details.departure}</div>
      </div>
      <div>
        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px', fontWeight: 500 }}>Arrival</div>
        <div style={{ fontSize: '16px', fontWeight: 600, color: '#004C8C' }}>{details.arrival}</div>
      </div>
      <div>
        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px', fontWeight: 500 }}>Duration</div>
        <div style={{ fontSize: '16px', fontWeight: 600, color: '#004C8C' }}>{details.duration}</div>
      </div>
      <div>
        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px', fontWeight: 500 }}>Stops</div>
        <div style={{ fontSize: '16px', fontWeight: 600, color: '#004C8C' }}>
          {details.stops === 0 ? 'Non-stop' : `${details.stops} stop${details.stops > 1 ? 's' : ''}`}
        </div>
      </div>
      <div>
        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px', fontWeight: 500 }}>Airline</div>
        <div style={{ fontSize: '16px', fontWeight: 600, color: '#004C8C' }}>{details.airline || 'N/A'}</div>
      </div>
      <div>
        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px', fontWeight: 500 }}>Price</div>
        <div style={{ fontSize: '18px', fontWeight: 700, color: '#00ADEF' }}>
          ${details.price != null && details.price !== undefined ? details.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
        </div>
      </div>
    </div>
  );
}

function HotelDetails({ details, isOngoing }) {
  // For hotel stays, show different information than regular hotel search results
  if (details.nights || details.isHotelStay) {
    // Hotel stay format
    const formatDateShort = (date) => {
      if (!date) return 'N/A';
      const d = date instanceof Date ? date : new Date(date);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${months[d.getMonth()]} ${d.getDate()}`;
    };
    
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px' }}>
        <div>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px', fontWeight: 500 }}>Type</div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#004C8C' }}>Hotel stay</div>
        </div>
        {details.nights && (
          <div>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px', fontWeight: 500 }}>Nights</div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: '#004C8C' }}>
              {details.nights} {details.nights === 1 ? 'night' : 'nights'}
            </div>
          </div>
        )}
        {details.checkInDate && details.checkOutDate && (
          <div>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px', fontWeight: 500 }}>Dates</div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: '#004C8C' }}>
              {formatDateShort(details.checkInDate)} – {formatDateShort(details.checkOutDate)}
            </div>
          </div>
        )}
        {details.pricePerNight !== undefined && details.pricePerNight !== null && (
          <div>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px', fontWeight: 500 }}>Price</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#00ADEF' }}>
              {details.pricePerNight > 0 
                ? `~$${Math.round(details.pricePerNight)}/night`
                : 'Included in hotel budget'}
            </div>
          </div>
        )}
        {details.location && (
          <div>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px', fontWeight: 500 }}>Location</div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: '#004C8C' }}>{details.location}</div>
          </div>
        )}
        {details.rating && details.rating > 0 && (
          <div>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px', fontWeight: 500 }}>Rating</div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: '#004C8C' }}>
              ⭐ {details.rating.toFixed(1)}
            </div>
          </div>
        )}
      </div>
    );
  }
  
  // Regular hotel search result format (fallback)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px' }}>
      <div>
        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px', fontWeight: 500 }}>Location</div>
        <div style={{ fontSize: '16px', fontWeight: 600, color: '#004C8C' }}>{details.location || 'N/A'}</div>
      </div>
      {details.distance !== undefined && (
        <div>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px', fontWeight: 500 }}>Distance from Center</div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#004C8C' }}>{details.distance} km</div>
        </div>
      )}
      {details.rating !== undefined && details.rating !== null && (
        <div>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px', fontWeight: 500 }}>Rating</div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#004C8C' }}>
            ⭐ {details.rating.toFixed(1)}
          </div>
        </div>
      )}
      {details.price !== undefined && details.price !== null && (
        <div>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px', fontWeight: 500 }}>Price per Night</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#00ADEF' }}>
            ${details.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      )}
    </div>
  );
}

function ActivityDetails({ details }) {
  // Guard against undefined details
  if (!details) {
    return <div style={{ color: '#64748b', fontSize: '14px' }}>No details available</div>;
  }
  
  return (
    <div>
      {details.description && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px', fontWeight: 500 }}>Description</div>
          <div style={{ fontSize: '14px', color: '#004C8C', lineHeight: '1.6' }}>{details.description}</div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px' }}>
        <div>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px', fontWeight: 500 }}>Duration</div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#004C8C' }}>{details.duration || 'N/A'}</div>
        </div>
        <div>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px', fontWeight: 500 }}>Rating</div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#004C8C' }}>
            ⭐ {details.rating != null && details.rating !== undefined && typeof details.rating === 'number' ? details.rating.toFixed(1) : 'N/A'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px', fontWeight: 500 }}>Price</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#00ADEF' }}>
            ${details.price != null && details.price !== undefined && typeof details.price === 'number' && details.price > 0 ? `$${details.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Check booking link for pricing'}
          </div>
        </div>
      </div>
    </div>
  );
}

