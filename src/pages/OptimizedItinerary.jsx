import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ScrollArea } from '../components/ui/scroll-area';
import '../styles/itinerary-layout.css';
import {
  normalizePreferenceWeights,
  loadPreferenceWeights,
  storePreferenceWeights,
  DEFAULT_PREFERENCE_WEIGHTS,
  formatWeightSummary,
} from '../utils/preferences';

const formatCurrency = (amount, currency = 'USD', options = {}) => {
  const numeric = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    ...options,
  }).format(numeric);
};

const parseDuration = (value) => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (value.startsWith('PT')) {
    const hours = parseInt(value.match(/(\d+)H/)?.[1] ?? '0', 10);
    const minutes = parseInt(value.match(/(\d+)M/)?.[1] ?? '0', 10);
    return hours + minutes / 60;
  }
  const hours = parseInt(value.match(/(\d+)h/)?.[1] ?? '0', 10);
  const minutes = parseInt(value.match(/(\d+)m/)?.[1] ?? '0', 10);
  return hours + minutes / 60;
};

const formatDurationLabel = (value) => {
  if (!value) return '—';
  const total = parseDuration(value);
  const hours = Math.floor(total);
  const minutes = Math.round((total - hours) * 60);
  if (!hours && !minutes) return '—';
  return `${hours ? `${hours}h` : ''}${minutes ? ` ${minutes}m` : ''}`.trim();
};

const parseDate = (input) => {
  if (!input) return new Date();
  if (input instanceof Date) return input;
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }
  return parsed;
};

const formatDate = (input) => {
  if (!input) return '';
  const date = parseDate(input);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatDateRange = (start, end) => {
  if (!start) return '';
  const startDate = parseDate(start);
  if (!end) {
    return startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  const endDate = parseDate(end);
  const sameYear = startDate.getFullYear() === endDate.getFullYear();
  const startOpts = { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' };
  const endOpts = { month: 'short', day: 'numeric', year: 'numeric' };
  return `${startDate.toLocaleDateString('en-US', startOpts)} - ${endDate.toLocaleDateString('en-US', endOpts)}`;
};

const calculateConvenienceScore = (flights, totalPrice, maxPrice) => {
  if (!flights || flights.length === 0) return 0;
  const totalDuration = flights.reduce((sum, flight) => sum + parseDuration(flight.duration), 0);
  const totalStops = flights.reduce((sum, flight) => sum + (flight.stops ?? 0), 0);

  const maxDuration = Math.max(8, totalDuration);
  const maxStops = Math.max(1, totalStops);
  const maxPriceValue = maxPrice > 0 ? maxPrice : totalPrice || 2000;
  
  const normalizedDuration = Math.min(totalDuration / maxDuration, 1);
  const normalizedStops = Math.min(totalStops / maxStops, 1);
  const normalizedPrice = Math.min((totalPrice || 0) / maxPriceValue, 1);

  const raw = 100 - (0.4 * normalizedDuration + 0.3 * normalizedStops + 0.3 * normalizedPrice) * 100;
  return Math.max(0, Math.min(100, Math.round(raw)));
};

const loadStoredPreferences = (locationState) => {
  if (locationState?.preferences?.preferences) {
    return normalizePreferenceWeights(locationState.preferences.preferences);
  }
  if (locationState?.preferences) {
    return normalizePreferenceWeights(locationState.preferences);
  }
  const stored = loadPreferenceWeights();
  if (stored) {
    return stored;
  }
  return { ...DEFAULT_PREFERENCE_WEIGHTS };
};

const storePreferences = (preferences) => {
  storePreferenceWeights(preferences);
};

const createDayByDayItinerary = (
  flight,
  hotel,
  selectedActivities,
  allActivities,
  routeInfo,
  startDateInput,
  endDateInput,
) => {
  const startDate = parseDate(startDateInput);
  const endDate = parseDate(endDateInput);
  const msPerDay = 24 * 60 * 60 * 1000;
  const stayLength = Math.max(1, Math.ceil((endDate - startDate) / msPerDay));
  const activitiesPool = (allActivities && allActivities.length > 0 ? allActivities : selectedActivities) || [];

  const days = [];
  days.push({
    day: 1,
    date: formatDate(startDate),
    items: [
      {
        type: 'flight',
        title: `${flight?.airline || 'Outbound flight'} ${flight?.flightNumber || ''}`.trim(),
        time: flight?.departure || `${routeInfo?.departureCode || routeInfo?.departure || 'Origin'} → ${routeInfo?.destinationCode || routeInfo?.destination || 'Destination'}`,
        meta: {
          departure: flight?.departure || routeInfo?.departureCode || routeInfo?.departure,
          arrival: flight?.arrival || routeInfo?.destinationCode || routeInfo?.destination,
          duration: formatDurationLabel(flight?.duration),
          stops: flight?.stops ?? 0,
          price: flight?.price ?? 0,
          currency: flight?.currency || 'USD',
        },
      },
      {
        type: 'hotel',
        title: hotel?.name || 'Accommodation check-in',
        time: 'Check-in',
        meta: {
          location: hotel?.location || routeInfo?.destination,
          rating: hotel?.rating,
          price: hotel?.price ?? 0,
          currency: hotel?.currency || 'USD',
          placeholder: Boolean(hotel?.placeholder),
        },
      },
    ],
  });

  for (let i = 1; i < stayLength; i += 1) {
    const currentDate = new Date(startDate.getTime() + i * msPerDay);
    const slot1 = activitiesPool[(i - 1) * 2];
    const slot2 = activitiesPool[(i - 1) * 2 + 1];
    const dayItems = [];

    if (slot1 || slot2) {
      [slot1, slot2].filter(Boolean).forEach((activity, index) => {
        dayItems.push({
          type: 'activity',
          title: activity.name || activity.title || 'Planned activity',
          time: activity.startTime || (index === 0 ? 'Morning' : 'Afternoon'),
          meta: {
            description: activity.shortDescription || activity.description || '',
            duration: activity.minimumDuration || activity.duration || 'Flexible',
            price:
              (typeof activity.price === 'object'
                ? Number(activity.price.amount)
                : Number(activity.price)) || 0,
              currency:
                (typeof activity.price === 'object' && activity.price.currencyCode) ||
                activity.currency ||
                'USD',
            location:
              activity.location?.address || activity.geoCode
                ? `${activity.geoCode.latitude?.toFixed?.(2) || ''} ${activity.geoCode.longitude?.toFixed?.(2) || ''}`.trim()
                : activity.location || '',
            placeholder: Boolean(activity.placeholder || activity._placeholder),
          },
        });
      });
    } else {
      dayItems.push({
        type: 'activity',
        title: 'Open exploration',
        time: 'Flexible',
        meta: {
          description: 'No specific activities scheduled yet. Use this time to explore freely.',
          duration: '—',
          price: 0,
            currency: 'USD',
          placeholder: true,
        },
      });
    }

    days.push({
      day: i + 1,
      date: formatDate(currentDate),
      items: dayItems,
    });
  }

  if (routeInfo?.returnDate) {
    const returnDate = parseDate(routeInfo.returnDate);
    days.push({
      day: days.length + 1,
      date: formatDate(returnDate),
      items: [
        {
          type: 'flight',
          title: 'Return flight',
          time: `${routeInfo.destinationCode || routeInfo.destination || 'Destination'} → ${routeInfo.departureCode || routeInfo.departure || 'Home'}`,
          meta: {
            departure: routeInfo.destinationCode || routeInfo.destination,
            arrival: routeInfo.departureCode || routeInfo.departure,
            duration: flight?.returnDuration ? formatDurationLabel(flight.returnDuration) : '—',
            stops: flight?.returnStops ?? 0,
            price: flight?.returnPrice ?? 0,
            currency: flight?.currency || 'USD',
            placeholder: true,
          },
        },
      ],
    });
  }

  return days;
};

const buildFlightCards = (itineraryData, routeInfo) => {
  if (!itineraryData) return [];
  const flights = [];
  if (itineraryData.flight) {
    flights.push({
      id: itineraryData.flight.id || 'primary-flight',
      type: 'Outbound',
      airline: itineraryData.flight.airline || 'Selected flight',
      flightNumber: itineraryData.flight.flightNumber,
      departure: itineraryData.flight.departure || routeInfo.departureCode || routeInfo.departure,
      arrival: itineraryData.flight.arrival || routeInfo.destinationCode || routeInfo.destination,
      duration: itineraryData.flight.duration,
      price: itineraryData.flight.price,
      currency: itineraryData.flight.currency || 'USD',
      stops: itineraryData.flight.stops ?? 0,
      cabin: itineraryData.flight.cabin || itineraryData.flight.travelClass || 'Economy',
      score: itineraryData.flight.scores?.total,
      breakdown: itineraryData.flight.scores,
    });
  }

  if (routeInfo?.returnDate) {
    flights.push({
      id: 'return-flight',
      type: 'Return',
      airline: itineraryData.returnFlight?.airline || 'Return flight',
      flightNumber: itineraryData.returnFlight?.flightNumber || '',
      departure: itineraryData.returnFlight?.departure || routeInfo.destinationCode || routeInfo.destination,
      arrival: itineraryData.returnFlight?.arrival || routeInfo.departureCode || routeInfo.departure,
      duration: itineraryData.returnFlight?.duration || itineraryData.flight?.returnDuration || '',
      price: itineraryData.returnFlight?.price ?? itineraryData.flight?.returnPrice ?? 0,
      currency: itineraryData.returnFlight?.currency || itineraryData.flight?.currency || 'USD',
      stops: itineraryData.returnFlight?.stops ?? itineraryData.flight?.returnStops ?? 0,
      cabin: itineraryData.returnFlight?.cabin || itineraryData.returnFlight?.travelClass || 'Economy',
      placeholder: !itineraryData.returnFlight,
      score: itineraryData.score_components?.flight,
    });
  }

  const additional = (itineraryData.flightsOptions || [])
    .filter((option) => option.id !== flights[0]?.id)
    .slice(0, 2)
    .map((option, index) => ({
      id: option.id || `alt-${index}`,
      type: 'Alternative',
      airline: option.airline || 'Flight option',
      flightNumber: option.flightNumber,
      departure: option.departure,
      arrival: option.arrival,
      duration: option.duration,
      price: option.price,
      currency: option.currency || itineraryData.flight?.currency || 'USD',
      stops: option.stops ?? 0,
      cabin: option.cabin || option.travelClass || 'Economy',
      score: option.score,
    }));

  return [...flights, ...additional];
};

const buildHotelCards = (itineraryData) => {
  if (!itineraryData) return [];
  const hotels = [];

  if (itineraryData.hotel) {
    hotels.push({
      id: itineraryData.hotel.hotel_id || 'primary-hotel',
      name: itineraryData.hotel.name || 'Accommodation',
      location: itineraryData.hotel.location || itineraryData.hotel.address || '',
      checkIn: itineraryData.hotel.checkIn || itineraryData.hotel.check_in,
      checkOut: itineraryData.hotel.checkOut || itineraryData.hotel.check_out,
      rating: itineraryData.hotel.rating || itineraryData.hotel.averageRating,
      price: itineraryData.hotel.price ?? itineraryData.hotel.total_price ?? 0,
      currency: itineraryData.hotel.currency || itineraryData.hotel.currencyCode || 'USD',
      placeholder: Boolean(itineraryData.hotel.placeholder),
      score: itineraryData.hotel.scores?.total,
      breakdown: itineraryData.hotel.scores,
    });
  }

  (itineraryData.hotelsData || [])
    .filter((hotel) => hotel.hotel_id !== hotels[0]?.id)
    .slice(0, hotels.length ? 1 : 2)
    .forEach((hotel, index) => {
      hotels.push({
        id: hotel.hotel_id || `additional-hotel-${index}`,
        name: hotel.name || 'Hotel option',
        location: hotel.location || hotel.address || '',
        checkIn: hotel.checkIn || hotel.check_in,
        checkOut: hotel.checkOut || hotel.check_out,
        rating: hotel.rating || hotel.averageRating,
        price: hotel.price ?? hotel.total_price ?? 0,
      currency: hotel.currency || hotel.currencyCode || itineraryData.hotel?.currency || 'USD',
        placeholder: Boolean(hotel.placeholder),
      score: hotel.scores?.total,
      breakdown: hotel.scores,
      });
    });

  return hotels;
};

const buildCostBreakdown = (itineraryData) => {
  if (!itineraryData) {
    return {
      total: 0,
      items: [],
      currency: 'USD',
    };
  }

  const flightCost = itineraryData.flight?.price ?? itineraryData.flight?.basePrice ?? 0;
  const hotelCost = itineraryData.hotel?.price ?? itineraryData.hotel?.total_price ?? 0;
  const activityCost =
    (typeof itineraryData.activity?.price === 'object'
      ? itineraryData.activity?.price?.amount
      : itineraryData.activity?.price) ?? 0;

  const flightCurrency = itineraryData.flight?.currency || 'USD';
  const hotelCurrency = itineraryData.hotel?.currency || itineraryData.hotel?.currencyCode || flightCurrency;
  const activityCurrency =
    (typeof itineraryData.activity?.price === 'object' && itineraryData.activity?.price?.currencyCode) ||
    itineraryData.activity?.currency ||
    flightCurrency;

  const subtotal = flightCost + hotelCost + activityCost;
  const total = itineraryData.total_price ?? subtotal;
  const totalCurrency = itineraryData.currency || flightCurrency || hotelCurrency || activityCurrency || 'USD';

  return {
    total,
    currency: totalCurrency,
    items: [
      { label: 'Flights', value: flightCost, currency: flightCurrency },
      { label: 'Accommodation', value: hotelCost, currency: hotelCurrency },
      { label: 'Activities', value: activityCost, currency: activityCurrency },
    ],
  };
};

const buildSummary = (itineraryData, routeInfo, flightsForScore) => {
  if (!itineraryData) {
    return {
      totalCost: 0,
      totalDuration: '—',
      totalStops: 0,
      convenience: 0,
      tripLength: 0,
      currency: 'USD',
    };
  }

  const duration = itineraryData.flight?.duration
    ? formatDurationLabel(itineraryData.flight.duration)
    : '—';
  const stops = itineraryData.flight?.stops ?? 0;
  const totalCost = itineraryData.total_price ?? buildCostBreakdown(itineraryData).total;
  const currency =
    itineraryData.currency ||
    itineraryData.flight?.currency ||
    itineraryData.hotel?.currency ||
    itineraryData.hotel?.currencyCode ||
    'USD';

  const flightsForCalculation =
    flightsForScore.length > 0
      ? flightsForScore
      : itineraryData.flight
      ? [itineraryData.flight]
      : [];
  const maxPrice = Math.max(
    totalCost,
    ...flightsForCalculation.map((flight) => Number(flight.price) || 0),
    0,
  );
  const convenience = calculateConvenienceScore(flightsForCalculation, totalCost, maxPrice);

  const tripLength = itineraryData.days?.length || (routeInfo?.returnDate ? null : 0);
  const totalScore = itineraryData.total_score ?? 0;
  const weights = itineraryData.weights
    ? normalizePreferenceWeights(itineraryData.weights)
    : null;
  const weightSummary =
    itineraryData.weight_summary ||
    (weights ? formatWeightSummary(weights) : '');
  const scoreComponents = itineraryData.score_components || {};

  return {
    totalCost,
    totalDuration: duration,
    totalStops: stops,
    convenience,
    tripLength,
    currency,
    totalScore,
    weightSummary,
    weights,
    scoreComponents,
  };
};

const buildStatusMessage = (hotelsData, activitiesData) => {
  if (!hotelsData?.length && !activitiesData?.length) {
    return 'We could not retrieve hotels or activities from Amadeus for these travel dates. Placeholder entries are shown so you can still review the itinerary.';
  }
  if (!hotelsData?.length) {
    return 'We could not retrieve hotels from Amadeus for these travel dates. Accommodation details are placeholders for now.';
  }
  if (!activitiesData?.length) {
    return 'We could not retrieve activities from Amadeus for these travel dates. Feel free to add your own experiences.';
  }
  return null;
};

export default function OptimizedItinerary() {
  const navigate = useNavigate();
  const location = useLocation();

  const [preferences, setPreferences] = useState(() => loadStoredPreferences(location.state));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [itineraryData, setItineraryData] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [showPreferencesModal, setShowPreferencesModal] = useState(false);
  const [conversionRates, setConversionRates] = useState({});

  const routeInfo = useMemo(
    () =>
      location.state?.routeInfo || {
    departure: 'New York',
    destination: 'Tokyo',
    departureCode: 'JFK',
    destinationCode: 'NRT',
        date: new Date().toISOString(),
        returnDate: null,
      },
    [location.state],
  );

  const allFlights = useMemo(() => {
  const flights = location.state?.flights || [];
  const outboundFlights = location.state?.outboundFlights || [];
  const returnFlights = location.state?.returnFlights || [];
    if (outboundFlights.length || returnFlights.length) {
      return [...outboundFlights, ...returnFlights];
    }
    return flights;
  }, [location.state]);

  const generateItinerary = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (!routeInfo.destination && !routeInfo.destinationCode) {
        throw new Error('Destination information is missing. Please return to the flight results and try again.');
      }

      const isLocalhost =
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1';
      const apiBase = isLocalhost
        ? 'http://localhost:8000'
        : process.env.REACT_APP_API_BASE || 'http://localhost:8000';

      const departureDate = parseDate(routeInfo.date || routeInfo.departure_display);
      const returnDate = routeInfo.returnDate || routeInfo.return_display
        ? parseDate(routeInfo.returnDate || routeInfo.return_display)
        : new Date(departureDate.getTime() + 6 * 24 * 60 * 60 * 1000);

      const flightsPayload = (allFlights.length ? allFlights : []).map((flight) => ({
        id: flight.id || flight.flightNumber || `flight-${Math.random()}`,
        price: flight.price || 0,
        duration: flight.duration || flight._duration || '0h',
        airline: flight.airline || 'Unknown carrier',
        flightNumber: flight.flightNumber || '',
        departure: flight.departure || flight.departureCode || routeInfo.departureCode,
        arrival: flight.arrival || flight.arrivalCode || routeInfo.destinationCode,
        stops: flight.stops ?? 0,
        currency: flight.currency || flight.currencyCode || 'USD',
      }));

      if (!flightsPayload.length && routeInfo.departure && routeInfo.destination) {
        flightsPayload.push({
          id: 'placeholder-flight',
          price: 600,
          duration: 'PT6H30M',
          airline: 'Sample Airline',
          flightNumber: 'SA123',
          departure: routeInfo.departureCode || routeInfo.departure,
          arrival: routeInfo.destinationCode || routeInfo.destination,
          stops: 0,
          currency: 'USD',
        });
      }

      const preferencesPayload = normalizePreferenceWeights(preferences);

      const itineraryDataResponse = await fetch(`${apiBase}/api/fetchItineraryData`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destinationCode: routeInfo.destinationCode || routeInfo.destination,
          destinationName: routeInfo.destination || routeInfo.destinationCode,
          checkIn: departureDate.toISOString().split('T')[0],
          checkOut: returnDate.toISOString().split('T')[0],
          adults: 1,
        }),
      });

      if (!itineraryDataResponse.ok) {
        const text = await itineraryDataResponse.text();
        throw new Error(`Failed to fetch hotels and experiences: ${itineraryDataResponse.status} ${text}`);
      }

      const itineraryDataJson = await itineraryDataResponse.json();
      if (!itineraryDataJson.ok) {
        throw new Error(itineraryDataJson.error || 'Unable to retrieve hotels and activities.');
      }

      const hotelsData = itineraryDataJson.hotels || [];
      const activitiesData = itineraryDataJson.activities || [];

      const optimalResponse = await fetch(`${apiBase}/api/generateOptimalItinerary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flights: flightsPayload,
          hotels: hotelsData,
          activities: activitiesData,
          preferences: preferencesPayload,
          userBudget: 5000,
        }),
      });

      if (!optimalResponse.ok) {
        const text = await optimalResponse.text();
        throw new Error(`Failed to generate itinerary: ${optimalResponse.status} ${text}`);
      }

      const optimalJson = await optimalResponse.json();
      if (!optimalJson.ok) {
        throw new Error(optimalJson.error || 'Unable to generate itinerary with the supplied data.');
      }

      const days = createDayByDayItinerary(
        optimalJson.flight,
        optimalJson.hotel,
        optimalJson.activity ? [optimalJson.activity] : [],
        activitiesData,
        routeInfo,
        departureDate,
        returnDate,
      );

      setItineraryData({
        ...optimalJson,
        hotelsData,
        activitiesData,
        flightsOptions: flightsPayload,
        routeInfo,
        days,
      });

      setStatusMessage(buildStatusMessage(hotelsData, activitiesData));
    } catch (err) {
      console.error('Itinerary generation failed', err);
      setError(err.message || 'Failed to generate itinerary. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [allFlights, preferences, routeInfo]);

  useEffect(() => {
    generateItinerary();
  }, [generateItinerary]);

  const flightCards = useMemo(() => buildFlightCards(itineraryData, routeInfo), [itineraryData, routeInfo]);
  const hotelCards = useMemo(() => buildHotelCards(itineraryData), [itineraryData]);
  const costSummary = useMemo(
    () => buildCostBreakdown(itineraryData),
    [itineraryData],
  );
  const summaryMetrics = useMemo(
    () => buildSummary(itineraryData, routeInfo, flightCards),
    [itineraryData, routeInfo, flightCards],
  );
  const tripLength = itineraryData?.days?.length || 0;
  const displayedCurrencies = useMemo(() => {
    const codes = new Set();
    flightCards.forEach((flight) => {
      if (flight?.currency) codes.add(flight.currency);
    });
    hotelCards.forEach((hotel) => {
      if (hotel?.currency) codes.add(hotel.currency);
    });
    if (itineraryData?.flight?.currency) codes.add(itineraryData.flight.currency);
    if (itineraryData?.hotel?.currency) codes.add(itineraryData.hotel.currency);
    if (itineraryData?.activity?.currency) codes.add(itineraryData.activity.currency);
    if (costSummary?.currency) codes.add(costSummary.currency);
    costSummary?.items?.forEach((item) => {
      if (item?.currency) codes.add(item.currency);
    });
    itineraryData?.days?.forEach((day) => {
      day.items?.forEach((item) => {
        if (item?.meta?.currency) codes.add(item.meta.currency);
      });
    });
    return Array.from(codes);
  }, [flightCards, hotelCards, costSummary, itineraryData]);
  useEffect(() => {
    if (!displayedCurrencies.length) return;
    const currenciesToFetch = displayedCurrencies.filter(
      (code) => code && code !== 'USD' && !conversionRates[code],
    );
    if (!currenciesToFetch.length) return;

    let cancelled = false;

    const fetchRates = async () => {
      const updates = {};
      await Promise.all(
        currenciesToFetch.map(async (code) => {
          try {
            const response = await fetch(`https://api.exchangerate.host/latest?base=${code}&symbols=USD`);
            if (!response.ok) return;
            const data = await response.json();
            const rate = data?.rates?.USD;
            if (typeof rate === 'number' && rate > 0) {
              updates[code] = rate;
            }
          } catch (err) {
            console.warn(`Unable to fetch conversion rate for ${code}:`, err);
          }
        }),
      );

      if (!cancelled && Object.keys(updates).length) {
        setConversionRates((prev) => ({ ...prev, ...updates }));
      }
    };

    fetchRates();

    return () => {
      cancelled = true;
    };
  }, [displayedCurrencies, conversionRates]);
  const renderPrice = useCallback(
    (amount, currency = 'USD') => {
      const primary = formatCurrency(amount, currency);
      if (!currency || currency === 'USD') {
        return primary;
      }

      const rate = conversionRates[currency];
      if (rate) {
        const converted = formatCurrency(amount * rate, 'USD');
        return `${primary} (${converted})`;
      }

      return primary;
    },
    [conversionRates],
  );

  if (loading) {
    return (
      <div className="itinerary-page">
        <div className="loading-state">
          <div className="loading-card">
            <div className="loading-title">Generating your itinerary…</div>
            <div className="loading-text">
              We are ranking flights, accommodations, and activities according to your preferences.
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="itinerary-page">
        <div className="error-state">
          <div className="error-card">
            <div className="error-title">We ran into a problem</div>
            <div className="error-text">{error}</div>
            <div className="modal-actions" style={{ marginTop: '24px' }}>
          <button
                type="button"
                className="itinerary-button secondary"
            onClick={() => navigate(-1)}
              >
                Back to flight results
              </button>
              <button
                type="button"
                className="itinerary-button primary"
                onClick={generateItinerary}
              >
                Try again
          </button>
        </div>
          </div>
        </div>
      </div>
    );
  }

  if (!itineraryData) {
    return null;
  }

  return (
    <div className="itinerary-page">
      <ScrollArea className="itinerary-scroll">
        <div className="itinerary-container">
          <HeaderBar
            onBack={() => navigate(-1)}
            onReoptimize={generateItinerary}
            onOpenPreferences={() => setShowPreferencesModal(true)}
          />

          <SummaryPanel
            destination={routeInfo.destination || routeInfo.destinationCode}
            dateRange={formatDateRange(routeInfo.date, routeInfo.returnDate)}
            tripLength={tripLength}
            summary={summaryMetrics}
            weightSummary={summaryMetrics.weightSummary}
            renderPrice={renderPrice}
          />

          {statusMessage && <StatusBanner message={statusMessage} />}

          <div className="itinerary-grid">
            <div className="itinerary-column">
              <FlightsSection
                flights={flightCards}
                weightSummary={summaryMetrics.weightSummary}
                totalScore={summaryMetrics.totalScore}
                renderPrice={renderPrice}
              />
              <HotelsSection hotels={hotelCards} renderPrice={renderPrice} />
              <ActivitiesSection days={itineraryData.days || []} renderPrice={renderPrice} />
        </div>

            <div className="itinerary-column">
              <CostSidebar
                cost={costSummary}
                weightSummary={summaryMetrics.weightSummary}
                totalScore={summaryMetrics.totalScore}
                scoreComponents={summaryMetrics.scoreComponents}
                renderPrice={renderPrice}
              />
              <PreferencesPanel
                preferences={preferences}
                onEdit={() => setShowPreferencesModal(true)}
              />
              <div className="itinerary-card">
                <div className="itinerary-card-header">
                  <h2 className="itinerary-card-title">Insight</h2>
                </div>
                <p className="activity-meta">
                  {itineraryData.insight ||
                    `Weights (${formatWeightSummary(preferences)}) were applied across flights, accommodation, and activities to surface the best-fitting combination for your trip.`}
                </p>
                </div>
                </div>
              </div>
            </div>
      </ScrollArea>

      {showPreferencesModal && (
        <PreferencesModal
          initialPreferences={preferences}
          onClose={() => setShowPreferencesModal(false)}
          onSave={(nextPreferences) => {
            const normalized = normalizePreferenceWeights(nextPreferences);
            setPreferences(normalized);
            storePreferences(normalized);
            setShowPreferencesModal(false);
            generateItinerary();
          }}
        />
            )}
          </div>
  );
}

function HeaderBar({ onBack, onReoptimize, onOpenPreferences }) {
  return (
    <header className="itinerary-header">
      <div className="itinerary-brand">
        <div className="itinerary-brand-icon">✈️</div>
            <div>
          <div className="itinerary-brand-title">Optimized Itinerary</div>
          <div className="itinerary-card-subtitle">
            Ranked in real-time using your budget, quality, and convenience preferences.
              </div>
            </div>
              </div>
      <div className="itinerary-actions">
        <button type="button" className="itinerary-button secondary" onClick={onOpenPreferences}>
          Adjust preferences
        </button>
        <button type="button" className="itinerary-button secondary" onClick={onBack}>
          Back to results
        </button>
        <button type="button" className="itinerary-button primary" onClick={onReoptimize}>
          Re-optimize
        </button>
            </div>
    </header>
  );
}

function SummaryPanel({ destination, dateRange, tripLength, summary, weightSummary, renderPrice }) {
  return (
    <section className="itinerary-summary">
      <div className="itinerary-summary-header">
            <div>
          <div className="itinerary-summary-destination">
            {destination || 'Selected destination'}
              </div>
          <div className="itinerary-summary-dates">
            {dateRange || 'Flexible dates'} {tripLength ? `• ${tripLength} days` : ''}
            </div>
          {weightSummary ? (
            <div className="activity-meta">Optimised with {weightSummary}</div>
          ) : null}
              </div>
            </div>
      <div className="itinerary-summary-grid">
        <SummaryTile
          label="Total investment"
          value={renderPrice(summary.totalCost, summary.currency)}
        />
        <SummaryTile
          label="Overall score"
          value={`${summary.totalScore.toFixed(1)}/100`}
          subtext={weightSummary}
        />
        <SummaryTile label="Total travel time" value={summary.totalDuration || '—'} />
        <SummaryTile label="Total stops" value={summary.totalStops ?? 0} />
        <SummaryTile label="Convenience score" value={`${summary.convenience}/100`} />
          </div>
    </section>
  );
}

function SummaryTile({ label, value, subtext }) {
  return (
    <div className="itinerary-summary-tile">
      <div className="itinerary-summary-label">{label}</div>
      <div className="itinerary-summary-value">{value}</div>
      {subtext ? <div className="oi-summary-subtext">{subtext}</div> : null}
    </div>
  );
}

function FlightsSection({ flights, weightSummary, totalScore, renderPrice }) {
  return (
    <section className="itinerary-card">
      <div className="itinerary-card-header">
        <div>
          <div className="itinerary-card-title">Flights</div>
          <div className="itinerary-card-subtitle">
            Best scoring flight options matched to your preferences.
          </div>
          {weightSummary ? (
            <div className="activity-meta">
              Overall itinerary score {totalScore?.toFixed?.(1) || '—'}/100 • Weights: {weightSummary}
            </div>
          ) : null}
        </div>
          </div>
      {flights.length === 0 ? (
        <div className="empty-state">No flight options available for this search.</div>
      ) : (
        <div className="itinerary-column">
          {flights.map((flight) => (
            <div key={flight.id} className="flight-card">
              <div className="flight-header">
                <div>
                  <div className="flight-airline">{flight.airline}</div>
                  <div className="activity-meta">
                    {flight.flightNumber ? `${flight.flightNumber} • ` : ''}
                    {flight.cabin}
        </div>
                </div>
                <div className="flight-tags">
                  <span className="itinerary-tag">{flight.type}</span>
                  <span className="itinerary-tag">
                    {flight.stops === 0 ? 'Non-stop' : `${flight.stops} stop${flight.stops > 1 ? 's' : ''}`}
            </span>
                  {typeof flight.score === 'number' ? (
                    <span className="itinerary-tag">Score {flight.score.toFixed(1)}/100</span>
                  ) : null}
          </div>
        </div>
              <div className="flight-route">
            <div>
                  <div className="flight-time">{flight.departure || '—'}</div>
                  <div className="flight-airport">Departure</div>
            </div>
                <div className="flight-duration">
                  <span>{formatDurationLabel(flight.duration)}</span>
            </div>
            <div>
                  <div className="flight-time">{flight.arrival || '—'}</div>
                  <div className="flight-airport">Arrival</div>
            </div>
          </div>
              <div className="flight-price">{renderPrice(flight.price, flight.currency || 'USD')}</div>
              {flight.placeholder && (
                <div className="activity-meta">
                  Return flight details will appear once the Amadeus API provides inventory for the selected range.
        </div>
              )}
        </div>
          ))}
      </div>
      )}
    </section>
  );
}

function HotelsSection({ hotels, renderPrice }) {
  return (
    <section className="itinerary-card">
      <div className="itinerary-card-header">
          <div>
          <div className="itinerary-card-title">Accommodation</div>
          <div className="itinerary-card-subtitle">
            Lodging options near your activities, sorted by your quality and budget settings.
            </div>
            </div>
          </div>
      {hotels.length === 0 ? (
        <div className="empty-state">No hotels were returned for the selected dates.</div>
      ) : (
        <div className="itinerary-column">
          {hotels.map((hotel) => (
            <div key={hotel.id} className="hotel-card">
              <div className="hotel-header">
                <div className="hotel-info">
                  <div className="hotel-name">{hotel.name}</div>
                  {hotel.location && <div className="hotel-meta">{hotel.location}</div>}
                  {(hotel.checkIn || hotel.checkOut) && (
                    <div className="hotel-meta">
                      {hotel.checkIn ? `Check-in: ${hotel.checkIn}` : ''}
                      {hotel.checkOut ? ` • Check-out: ${hotel.checkOut}` : ''}
        </div>
                  )}
                  {hotel.rating && (
                    <div className="hotel-meta">
                      Rated {hotel.rating}/5 by recent travellers
        </div>
                  )}
                </div>
                <div className="hotel-price">{renderPrice(hotel.price, hotel.currency || 'USD')}</div>
              </div>
          {typeof hotel.score === 'number' ? (
            <div className="activity-meta">Score {hotel.score.toFixed(1)}/100</div>
          ) : null}
              {hotel.placeholder && (
                <div className="activity-meta">
                  We&apos;ll populate concrete accommodation matches once the Amadeus API returns hotel offers for these dates.
        </div>
      )}
    </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ActivitiesSection({ days, renderPrice }) {
  return (
    <section className="itinerary-card">
      <div className="itinerary-card-header">
          <div>
          <div className="itinerary-card-title">Daily activities</div>
          <div className="itinerary-card-subtitle">
            A day-by-day view of suggested experiences. Expand each day to review timing and details.
            </div>
            </div>
          </div>
      {days.length === 0 ? (
        <div className="empty-state">Activities will appear here after your itinerary is generated.</div>
      ) : (
        <div className="itinerary-column">
          {days.map((day) => (
            <div key={day.day} className="activities-day">
              <div className="activities-day-header">
                <div className="activities-day-title">Day {day.day}</div>
                <div className="activities-day-date">{day.date}</div>
        </div>
              <div className="itinerary-column">
                {day.items.map((item, index) => (
                  <div key={`${day.day}-${index}`} className="activity-card">
                    <div className="activity-item">
                      <div className="activity-time">{item.time}</div>
                      <div className="activity-details">
                        <div className="activity-title">{item.title}</div>
                        {item.meta?.description && (
                          <div className="activity-meta">{item.meta.description}</div>
                        )}
                        <div className="activity-meta">
                          {item.meta?.duration ? `Duration: ${item.meta.duration}` : ''}
                          {item.meta?.price
                            ? ` • ${renderPrice(item.meta.price, item.meta?.currency || 'USD')}`
                            : ''}
                        </div>
                        {item.meta?.placeholder && (
                          <div className="activity-meta">
                            We&apos;ll fill this slot as soon as live availability returns from the provider.
        </div>
      )}
    </div>
      </div>
      </div>
                ))}
      </div>
        </div>
          ))}
      </div>
      )}
    </section>
  );
}

function CostSidebar({ cost, weightSummary, totalScore, scoreComponents, renderPrice }) {
  return (
    <aside className="cost-card">
      <div>
        <div className="itinerary-card-title">Investment overview</div>
        <div className="itinerary-card-subtitle">
          Optimized to reach {totalScore?.toFixed?.(1) ?? '—'}/100 overall score
          {weightSummary ? ` using ${weightSummary}` : ''}.
        </div>
      </div>
      <div className="cost-total">
        <div className="cost-total-label">Estimated total</div>
        <div className="cost-total-value">{renderPrice(cost.total, cost.currency || 'USD')}</div>
        </div>
      <div className="cost-list">
        {cost.items.map((item) => (
          <div key={item.label} className="cost-entry">
            <span>{item.label}</span>
            <span className="cost-entry-value">{renderPrice(item.value, item.currency || cost.currency || 'USD')}</span>
      </div>
        ))}
        </div>
      {scoreComponents && Object.keys(scoreComponents).length > 0 ? (
        <div className="oi-cost-breakdown">
          <div className="oi-cost-item">
            <span>Flight score</span>
            <span className="oi-cost-value">
              {typeof scoreComponents.flight === 'number' ? `${scoreComponents.flight.toFixed(1)}/100` : '—'}
            </span>
          </div>
          <div className="oi-cost-item">
            <span>Hotel score</span>
            <span className="oi-cost-value">
              {typeof scoreComponents.hotel === 'number' ? `${scoreComponents.hotel.toFixed(1)}/100` : '—'}
            </span>
          </div>
          <div className="oi-cost-item">
            <span>Activity score</span>
            <span className="oi-cost-value">
              {typeof scoreComponents.activity === 'number' ? `${scoreComponents.activity.toFixed(1)}/100` : '—'}
            </span>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function PreferencesPanel({ preferences, onEdit }) {
  return (
    <section className="preferences-card">
      <div className="itinerary-card-title">Optimization weights</div>
      <div className="activity-meta">These weights were applied to every score in this itinerary.</div>
      <div className="preferences-grid">
        <PreferenceRow label="Budget" value={preferences.budget} />
        <PreferenceRow label="Quality" value={preferences.quality} />
        <PreferenceRow label="Convenience" value={preferences.convenience} />
      </div>
      <button type="button" className="itinerary-button secondary" onClick={onEdit}>
        Edit weights
      </button>
    </section>
  );
}

function PreferenceRow({ label, value }) {
  return (
    <div className="preference-row">
      <span>{label}</span>
      <span className="preference-value">{(value * 100).toFixed(0)}%</span>
    </div>
  );
}

function StatusBanner({ message }) {
  return <div className="status-banner">{message}</div>;
}

function PreferencesModal({ initialPreferences, onSave, onClose }) {
  const [localPreferences, setLocalPreferences] = useState(() => ({ ...initialPreferences }));

  const updatePreference = (key, value) => {
    setLocalPreferences((prev) => ({
      ...prev,
      [key]: Number(value),
    }));
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <div className="modal-title">Adjust optimization weights</div>
          <div className="modal-subtitle">
            Fine-tune how we rank flights, accommodations, and activities. The weights will automatically rebalance to total 100%.
        </div>
        </div>
        <div className="modal-form">
          <SliderRow
            label="Budget"
            value={localPreferences.budget}
            onChange={(value) => updatePreference('budget', value)}
          />
          <SliderRow
            label="Quality"
            value={localPreferences.quality}
            onChange={(value) => updatePreference('quality', value)}
          />
          <SliderRow
            label="Convenience"
            value={localPreferences.convenience}
            onChange={(value) => updatePreference('convenience', value)}
          />
          </div>
        <div className="modal-actions">
          <button type="button" className="itinerary-button secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="itinerary-button primary"
            onClick={() => onSave(localPreferences)}
          >
            Save and re-optimize
          </button>
        </div>
          </div>
        </div>
  );
}

function SliderRow({ label, value, onChange }) {
  return (
    <div className="slider-row">
      <div className="slider-label">
        <span>{label}</span>
        <span>{(value * 100).toFixed(0)}%</span>
      </div>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={value}
        className="slider-input"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

