const TRIP_STATE_KEY = 'sta_trip_state_v1';
const OPTIMIZED_ITINERARY_KEY = 'miles:lastOptimizedItinerary';

const defaultTripState = {
  flights: [],
  accommodation: [],
  activities: [],
  route: null,
  origin: null,
  destination: null,
  originCode: null,
  destinationCode: null,
  startDate: null,
  endDate: null,
  preferenceWeights: null,
  optimalFlight: null,  // The flight with highest preference score
  selectedOutboundFlight: null,  // User-selected outbound flight
  selectedReturnFlight: null,    // User-selected return flight
  selectedHotel: null,            // User-selected hotel
  optimizedItinerary: null,        // Full optimized itinerary object from backend
  filters: {
    activityBudgetMax: null,
    // Hotel preferences
    hotelPriceMax: null,
    hotelPriceMin: null,
    hotelMinimumRating: null,
    hotelPreferredLocation: null,
    hotelSpecificName: null,
  },
  preferences: {
    guidedTour: false,
    categories: [],
  },
  mustDoActivities: [],
  lastUpdated: null,
};

const ensureWindow = () => (typeof window !== 'undefined' ? window : null);

const readState = () => {
  const win = ensureWindow();
  if (!win) return null;
  try {
    const raw = win.sessionStorage.getItem(TRIP_STATE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return {
      ...defaultTripState,
      ...parsed,
      flights: Array.isArray(parsed?.flights) ? parsed.flights : [],
      accommodation: Array.isArray(parsed?.accommodation) ? parsed.accommodation : [],
      activities: Array.isArray(parsed?.activities) ? parsed.activities : [],
      filters: {
        ...defaultTripState.filters,
        ...(parsed?.filters || {}),
      },
      preferences: {
        ...defaultTripState.preferences,
        ...(parsed?.preferences || {}),
      },
      mustDoActivities: Array.isArray(parsed?.mustDoActivities) ? parsed.mustDoActivities : [],
    };
  } catch (err) {
    console.warn('Unable to read trip state', err);
    return null;
  }
};

const writeState = (state) => {
  const win = ensureWindow();
  if (!win) return;
  try {
    win.sessionStorage.setItem(TRIP_STATE_KEY, JSON.stringify(state));
    win.dispatchEvent(new CustomEvent('tripStateUpdated', { detail: state }));
  } catch (err) {
    console.warn('Unable to persist trip state', err);
  }
};

const upsertItem = (items, item) => {
  const list = Array.isArray(items) ? [...items] : [];
  const index = list.findIndex((existing) => existing.id === item.id);
  if (index >= 0) {
    list[index] = { ...list[index], ...item, updatedAt: new Date().toISOString() };
  } else {
    list.push({ ...item, updatedAt: new Date().toISOString() });
  }
  return list;
};

export const loadTripState = () => readState() || { ...defaultTripState };

export const saveTripState = (nextState) => {
  const state = {
    ...defaultTripState,
    ...nextState,
    flights: Array.isArray(nextState?.flights) ? nextState.flights : [],
    accommodation: Array.isArray(nextState?.accommodation) ? nextState.accommodation : [],
    activities: Array.isArray(nextState?.activities) ? nextState.activities : [],
    filters: {
      ...defaultTripState.filters,
      ...(nextState?.filters || {}),
    },
    preferences: {
      ...defaultTripState.preferences,
      ...(nextState?.preferences || {}),
    },
    mustDoActivities: Array.isArray(nextState?.mustDoActivities) ? nextState.mustDoActivities : [],
    lastUpdated: new Date().toISOString(),
  };

  writeState(state);
  return state;
};

export const recordTripSelection = (category, selection, options = {}) => {
  if (!selection || !category) return loadTripState();

  const state = loadTripState();
  const nextState = { ...state };
  const normalizedSelection = {
    ...selection,
    category,
    recordedAt: new Date().toISOString(),
  };

  if (category === 'flight') {
    nextState.flights = upsertItem(state.flights, normalizedSelection);
  } else if (category === 'hotel') {
    nextState.accommodation = upsertItem(state.accommodation, normalizedSelection);
  } else if (category === 'activity') {
    nextState.activities = upsertItem(state.activities, normalizedSelection);
  }

  if (options.route) {
    nextState.route = {
      ...state.route,
      ...options.route,
      updatedAt: new Date().toISOString(),
    };
  }

  if (options.preferenceWeights) {
    nextState.preferenceWeights = { ...options.preferenceWeights };
  }

  if (options.filters) {
    nextState.filters = {
      ...defaultTripState.filters,
      ...(state.filters || {}),
      ...options.filters,
    };
  }

  if (options.preferences) {
    nextState.preferences = {
      ...defaultTripState.preferences,
      ...(state.preferences || {}),
      ...options.preferences,
    };
  }

  if (options.mustDoActivities) {
    const combined = Array.isArray(state.mustDoActivities) ? [...state.mustDoActivities] : [];
    options.mustDoActivities.forEach((activity) => {
      if (!activity?.name) return;
      const exists = combined.some(
        (existing) => existing.name.toLowerCase() === activity.name.toLowerCase(),
      );
      if (!exists) {
        combined.push({ ...activity, recordedAt: new Date().toISOString() });
      }
    });
    nextState.mustDoActivities = combined;
  }

  return saveTripState(nextState);
};

export const updateTripRoute = (route) => {
  if (!route) return loadTripState();
  const state = loadTripState();
  const nextState = {
    ...state,
    route: {
      ...state.route,
      ...route,
      updatedAt: new Date().toISOString(),
    },
  };

  // Only update if the new value is not null/undefined and not empty
  // Don't overwrite existing valid data with null/empty values
  if (route.departure !== null && route.departure !== undefined && route.departure.trim() !== '' && route.departure !== 'Unknown') {
    nextState.origin = route.departure;
  }
  if (route.destination !== null && route.destination !== undefined && route.destination.trim() !== '' && route.destination !== 'Unknown') {
    nextState.destination = route.destination;
  }
  if (route.departureCode !== null && route.departureCode !== undefined && route.departureCode.trim() !== '') {
    nextState.originCode = route.departureCode;
  }
  if (route.destinationCode !== null && route.destinationCode !== undefined && route.destinationCode.trim() !== '') {
    nextState.destinationCode = route.destinationCode;
  }
  if (route.date) {
    nextState.startDate = route.date;
  }
  if (route.returnDate) {
    nextState.endDate = route.returnDate;
  }

  return saveTripState(nextState);
};

export const updateTripFilters = (partial = {}) => {
  if (!partial || typeof partial !== 'object') {
    return loadTripState();
  }
  const state = loadTripState();
  const nextState = {
    ...state,
    filters: {
      ...defaultTripState.filters,
      ...(state.filters || {}),
      ...partial,
      updatedAt: new Date().toISOString(),
    },
  };
  return saveTripState(nextState);
};

export const recordBudgetConstraint = (amount) => {
  const numeric =
    typeof amount === 'number'
      ? amount
      : Number(String(amount).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return loadTripState();
  }
  return updateTripFilters({ activityBudgetMax: numeric, budget: numeric });
};

/**
 * Update hotel preferences in TripState
 * @param {Object} hotelPrefs - Hotel preference object
 * @param {number} hotelPrefs.priceMax - Maximum price per night
 * @param {number} hotelPrefs.priceMin - Minimum price per night
 * @param {number} hotelPrefs.minimumRating - Minimum rating (e.g., 4.5)
 * @param {string} hotelPrefs.preferredLocation - Preferred location (e.g., "Las Ramblas", "waterfront", "city center")
 * @param {string} hotelPrefs.specificName - Specific hotel name the user wants to stay at
 */
export const updateHotelPreferences = (hotelPrefs = {}) => {
  if (!hotelPrefs || typeof hotelPrefs !== 'object') {
    return loadTripState();
  }
  
  const updates = {};
  
  // Handle priceMax
  if (hotelPrefs.priceMax !== undefined && hotelPrefs.priceMax !== null) {
    const priceMax = typeof hotelPrefs.priceMax === 'number' 
      ? hotelPrefs.priceMax 
      : Number(String(hotelPrefs.priceMax).replace(/[^0-9.]/g, ''));
    if (Number.isFinite(priceMax) && priceMax > 0) {
      updates.hotelPriceMax = priceMax;
    }
  }
  
  // Handle priceMin
  if (hotelPrefs.priceMin !== undefined && hotelPrefs.priceMin !== null) {
    const priceMin = typeof hotelPrefs.priceMin === 'number' 
      ? hotelPrefs.priceMin 
      : Number(String(hotelPrefs.priceMin).replace(/[^0-9.]/g, ''));
    if (Number.isFinite(priceMin) && priceMin > 0) {
      updates.hotelPriceMin = priceMin;
    }
  }
  
  // Handle minimumRating
  if (hotelPrefs.minimumRating !== undefined && hotelPrefs.minimumRating !== null) {
    const rating = typeof hotelPrefs.minimumRating === 'number' 
      ? hotelPrefs.minimumRating 
      : Number(String(hotelPrefs.minimumRating).replace(/[^0-9.]/g, ''));
    if (Number.isFinite(rating) && rating >= 0 && rating <= 5) {
      updates.hotelMinimumRating = rating;
    }
  }
  
  // Handle preferredLocation
  if (hotelPrefs.preferredLocation !== undefined && hotelPrefs.preferredLocation !== null) {
    const location = String(hotelPrefs.preferredLocation).trim();
    if (location.length > 0) {
      updates.hotelPreferredLocation = location;
    }
  }
  
  // Handle specific hotel name
  if (hotelPrefs.specificName !== undefined && hotelPrefs.specificName !== null) {
    const name = String(hotelPrefs.specificName).trim();
    if (name.length > 0) {
      updates.hotelSpecificName = name;
    }
  }
  
  if (Object.keys(updates).length === 0) {
    return loadTripState();
  }
  
  console.log('Updating hotel preferences:', updates);
  return updateTripFilters(updates);
};

export const recordMustDoActivities = (activities) => {
  if (!Array.isArray(activities) || activities.length === 0) {
    return loadTripState();
  }
  const state = loadTripState();
  const existing = Array.isArray(state.mustDoActivities) ? [...state.mustDoActivities] : [];

  activities.forEach((activity) => {
    if (!activity?.name) return;
    const normalisedName = activity.name.trim();
    if (!normalisedName) return;
    const alreadyExists = existing.some(
      (entry) => entry.name.toLowerCase() === normalisedName.toLowerCase(),
    );
    if (!alreadyExists) {
      existing.push({ ...activity, name: normalisedName, recordedAt: new Date().toISOString() });
    }
  });

  return saveTripState({
    ...state,
    mustDoActivities: existing,
  });
};

export const updateTripPreferences = (partial = {}) => {
  if (!partial || typeof partial !== 'object') {
    return loadTripState();
  }
  const state = loadTripState();
  const mergedCategories = new Set([...(state.preferences?.categories || [])]);
  if (Array.isArray(partial.categories)) {
    partial.categories.forEach((category) => {
      if (typeof category === 'string' && category.trim()) {
        mergedCategories.add(category.trim().toLowerCase());
      }
    });
  }

  const nextState = {
    ...state,
    preferences: {
      ...defaultTripState.preferences,
      ...(state.preferences || {}),
      ...partial,
      categories: Array.from(mergedCategories),
    },
  };

  return saveTripState(nextState);
};

export const clearTripState = () => {
  const state = { ...defaultTripState, lastUpdated: new Date().toISOString() };
  writeState(state);
  return state;
};

// Save current itinerary state (for Back to Results -> Add to Itinerary flow)
export const saveCurrentItinerary = (itineraryData) => {
  const state = loadTripState();
  return saveTripState({
    ...state,
    currentItinerary: itineraryData, // Save full itinerary data including days
    hasExistingItinerary: true,
  });
};

// Load current itinerary state
export const loadCurrentItinerary = () => {
  const state = loadTripState();
  return state?.currentItinerary || null;
};

// Clear current itinerary
export const clearCurrentItinerary = () => {
  const state = loadTripState();
  if (state.currentItinerary) {
    delete state.currentItinerary;
    state.hasExistingItinerary = false;
    return saveTripState(state);
  }
  return state;
};

// Save conversation messages (for Back to Results -> Chat flow)
export const saveConversation = (messages, sessionId = null, context = null, userPreferences = null) => {
  const state = loadTripState();
  return saveTripState({
    ...state,
    savedConversation: {
      messages: messages || [],
      sessionId: sessionId,
      context: context,
      userPreferences: userPreferences,
      savedAt: new Date().toISOString()
    },
    hasSavedConversation: true
  });
};

// Load saved conversation
export const loadConversation = () => {
  const state = loadTripState();
  return state?.savedConversation || null;
};

// Clear saved conversation
export const clearConversation = () => {
  const state = loadTripState();
  if (state.savedConversation) {
    delete state.savedConversation;
    state.hasSavedConversation = false;
    return saveTripState(state);
  }
  return state;
};

// Reset all trip data (conversation + tripState) - for starting a new trip
export const resetAllTripData = () => {
  // Clear conversation first
  clearConversation();
  
  // Clear current itinerary before clearing trip state
  clearCurrentItinerary();
  
  // Clear optimized itinerary
  clearOptimizedItinerary();
  
  // Clear trip state completely (this will reset everything to default)
  clearTripState();
  
  // Ensure sessionStorage is completely cleared for trip state
  const win = ensureWindow();
  if (win) {
    try {
      win.sessionStorage.removeItem(TRIP_STATE_KEY);
    } catch (err) {
      console.warn('Unable to clear trip state from sessionStorage', err);
    }
  }
  
  // Return fresh default state
  return { ...defaultTripState, lastUpdated: new Date().toISOString() };
};

// Select outbound flight (user selection)
export const selectOutboundFlight = (flight) => {
  if (!flight) return loadTripState();
  const state = loadTripState();
  return saveTripState({
    ...state,
    selectedOutboundFlight: {
      ...flight,
      selectedAt: new Date().toISOString()
    }
  });
};

// Select return flight (user selection)
export const selectReturnFlight = (flight) => {
  if (!flight) return loadTripState();
  const state = loadTripState();
  return saveTripState({
    ...state,
    selectedReturnFlight: {
      ...flight,
      selectedAt: new Date().toISOString()
    }
  });
};

// Select hotel (user selection)
export const selectHotel = (hotel) => {
  if (!hotel) return loadTripState();
  const state = loadTripState();
  return saveTripState({
    ...state,
    selectedHotel: {
      ...hotel,
      selectedAt: new Date().toISOString()
    }
  });
};

// Save optimized itinerary to both tripState and localStorage
export const saveOptimizedItinerary = (itineraryData) => {
  if (!itineraryData) {
    console.warn('saveOptimizedItinerary: No itinerary data provided');
    return loadTripState();
  }
  
  const state = loadTripState();
  const updatedState = saveTripState({
    ...state,
    optimizedItinerary: itineraryData,
  });
  
  // Also save to localStorage for persistence across sessions
  const win = ensureWindow();
  if (win) {
    try {
      const dataToSave = {
        optimizedItinerary: itineraryData,
        selectedOutboundFlight: state.selectedOutboundFlight,
        selectedReturnFlight: state.selectedReturnFlight,
        selectedHotel: state.selectedHotel,
        mustDoActivities: state.mustDoActivities,
        preferenceWeights: state.preferenceWeights,
        savedAt: new Date().toISOString(),
      };
      win.localStorage.setItem(OPTIMIZED_ITINERARY_KEY, JSON.stringify(dataToSave));
      console.log('Saved optimized itinerary to localStorage');
    } catch (err) {
      console.warn('Unable to save optimized itinerary to localStorage', err);
    }
  }
  
  return updatedState;
};

// Load optimized itinerary from localStorage
export const loadOptimizedItinerary = () => {
  const win = ensureWindow();
  if (!win) return null;
  
  try {
    const raw = win.localStorage.getItem(OPTIMIZED_ITINERARY_KEY);
    if (!raw) return null;
    
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (err) {
    console.warn('Unable to load optimized itinerary from localStorage', err);
    return null;
  }
};

// Clear optimized itinerary from both tripState and localStorage
export const clearOptimizedItinerary = () => {
  const state = loadTripState();
  const updatedState = saveTripState({
    ...state,
    optimizedItinerary: null,
  });
  
  // Also remove from localStorage
  const win = ensureWindow();
  if (win) {
    try {
      win.localStorage.removeItem(OPTIMIZED_ITINERARY_KEY);
      console.log('Cleared optimized itinerary from localStorage');
    } catch (err) {
      console.warn('Unable to clear optimized itinerary from localStorage', err);
    }
  }
  
  return updatedState;
};

export { TRIP_STATE_KEY, OPTIMIZED_ITINERARY_KEY };

