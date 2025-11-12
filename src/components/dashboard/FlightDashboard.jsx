import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FlightMap } from './FlightMap';
import { PriceChart } from './PriceChart';
import { FlightsTable } from './FlightsTable';
import { ScrollArea } from '../ui/scroll-area';
import { useFlightSelection } from '../../context/FlightSelectionContext';
import { ComparisonModal } from './ComparisonModal';
import {
  normalizePreferenceWeights,
  DEFAULT_PREFERENCE_WEIGHTS,
  formatWeightSummary,
} from '../../utils/preferences';

// Mock data for demonstration - this will be replaced with real Amadeus API data
const generateMockPriceData = (startDate = new Date()) => {
  const basePrice = 380;
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
    return {
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      price: basePrice + Math.floor(Math.random() * 100) - 50,
      optimal: basePrice
    };
  });
};

const flightsData = [
  {
    id: '1',
    airline: 'Delta Airlines',
    flightNumber: 'DL 1234',
    departure: '08:00 AM',
    arrival: '11:30 AM',
    duration: '3h 30m',
    price: 380,
    isOptimal: true,
    stops: 0,
  },
  {
    id: '2',
    airline: 'United Airlines',
    flightNumber: 'UA 5678',
    departure: '10:15 AM',
    arrival: '02:00 PM',
    duration: '3h 45m',
    price: 395,
    isOptimal: true,
    stops: 0,
  },
  {
    id: '3',
    airline: 'American Airlines',
    flightNumber: 'AA 9012',
    departure: '01:30 PM',
    arrival: '05:15 PM',
    duration: '3h 45m',
    price: 420,
    isOptimal: false,
    stops: 0,
  },
  {
    id: '4',
    airline: 'Southwest Airlines',
    flightNumber: 'WN 3456',
    departure: '06:00 AM',
    arrival: '11:45 AM',
    duration: '5h 45m',
    price: 310,
    isOptimal: true,
    stops: 1,
  },
  {
    id: '5',
    airline: 'JetBlue Airways',
    flightNumber: 'B6 7890',
    departure: '03:00 PM',
    arrival: '06:45 PM',
    duration: '3h 45m',
    price: 450,
    isOptimal: false,
    stops: 0,
  },
  {
    id: '6',
    airline: 'Spirit Airlines',
    flightNumber: 'NK 2345',
    departure: '07:30 AM',
    arrival: '01:30 PM',
    duration: '6h 00m',
    price: 290,
    isOptimal: false,
    stops: 1,
  },
];

export function FlightDashboard({ searchData = null }) {
  const navigate = useNavigate();
  const {
    selectedFlights,
    getSelectedFlights,
    clearSelectedFlights,
  } = useFlightSelection();
  const [showComparison, setShowComparison] = useState(false);
  
  // Debug logging
  console.log('FlightDashboard received searchData:', searchData);
  console.log('FlightDashboard route from searchData:', searchData?.route);
  console.log('FlightDashboard hasRealData:', searchData?.hasRealData);
  console.log('FlightDashboard error:', searchData?.error);
  console.log('FlightDashboard flights count:', searchData?.flights?.length);
  
  // Use real data if provided, otherwise use mock data
  const hasRealData = searchData?.hasRealData || false;
  const errorMessage = searchData?.error || null;
  const displayPriceData = searchData?.priceData?.length > 0 ? searchData.priceData : generateMockPriceData();
  const displayFlightsData = searchData?.flights?.length > 0 ? searchData.flights : flightsData;
  const routeInfo = searchData?.route || {
    departure: 'New York',
    destination: 'Tokyo',
    departureCode: 'JFK',
    destinationCode: 'NRT',
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  };
  
  console.log('FlightDashboard using data:', {
    hasRealData,
    errorMessage,
    priceDataLength: displayPriceData.length,
    flightsDataLength: displayFlightsData.length,
    routeInfo,
    outboundFlights: searchData?.outboundFlights?.length,
    returnFlights: searchData?.returnFlights?.length,
    hasFlights: displayFlightsData.length > 0 || (searchData?.outboundFlights && searchData.outboundFlights.length > 0) || (searchData?.returnFlights && searchData.returnFlights.length > 0)
  });

  // Format error message to be more user-friendly
  const getErrorMessage = (error) => {
    if (!error) return null;
    
    // Parse error message to provide specific guidance
    if (error.includes('MISSING INFORMATION')) {
      if (error.includes('origin') || error.includes('destination')) {
        return "Please provide both origin and destination cities (e.g., 'flights from New York to Paris').";
      } else if (error.includes('date')) {
        return "Please provide a departure date (e.g., 'November 3rd' or '11/03/2024').";
      }
      return error.replace('MISSING INFORMATION: ', '');
    } else if (error.includes('INVALID DATE FORMAT')) {
      return "Please provide dates in a valid format (e.g., 'November 3rd, 2024', '11/03/2024', or 'Nov 3').";
    } else if (error.includes('INVALID INPUT')) {
      return error.replace('INVALID INPUT: ', '');
    } else if (error.includes('API ERROR') || error.includes('API call failed')) {
      return "Unable to fetch flight data. Please check your connection and try again.";
    } else if (error.includes('NO FLIGHTS FOUND') || error.includes('No flights available')) {
      return "No flights available for the specified route and dates. Please try different dates or destinations.";
    }
    
    // Return the error message as-is if it doesn't match any pattern
    return error;
  };

  const formattedErrorMessage = getErrorMessage(errorMessage);

  const preferenceWeights = useMemo(() => {
    const weightsSource =
      searchData?.preferences?.preferences ??
      searchData?.preferences ??
      searchData?.preferenceWeights ??
      null;
    if (weightsSource) {
      return normalizePreferenceWeights(weightsSource);
    }
    return DEFAULT_PREFERENCE_WEIGHTS;
  }, [searchData]);

  const comparisonFlights = useMemo(() => {
    return selectedFlights.slice(0, 3);
  }, [selectedFlights]);

  const hasSelection = selectedFlights.length > 0;

  const handleGenerateItinerary = () => {
    if (!hasSelection) {
      return;
    }

    const flightsPayload = getSelectedFlights().map((flight) => ({
      id: flight.id,
      airline: flight.airline,
      flightNumber: flight.flightNumber,
      departure: flight.departure,
      arrival: flight.arrival,
      duration: flight.duration,
      price: flight.price,
      currency: flight.currency || 'USD',
      stops: flight.stops ?? 0,
      bookingLink: flight.bookingLink || null,
      cabin: flight.cabin || flight.cabinClass || null,
    }));

    const itineraryMessage = `Please generate a personalized itinerary based on the selected flight(s) to ${routeInfo.destination} on ${routeInfo.date}.`;
    const structuredPayload = {
      intent: 'generate_itinerary_from_selection',
      routeInfo,
      selectedFlights: flightsPayload,
      preferenceWeights,
    };

    if (searchData?.onGenerateItinerary) {
      searchData.onGenerateItinerary({
        message: `${itineraryMessage}\n\nSelected Flights:\n${flightsPayload
          .map(
            (flight, index) =>
              `${index + 1}. ${flight.airline} ${flight.flightNumber} — departs ${flight.departure}, arrives ${flight.arrival}, ${flight.duration}, ${flight.stops === 0 ? 'non-stop' : `${flight.stops} stop${flight.stops > 1 ? 's' : ''}`}, ${flight.currency}${Number(flight.price || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          )
          .join('\n')}\n\n<flight_selection>${JSON.stringify(structuredPayload)}</flight_selection>`,
        routeInfo,
        selectedFlights: flightsPayload,
        metadata: structuredPayload,
        preferenceWeights,
      });
    } else {
      navigate('/itinerary', {
        state: {
          routeInfo,
          flights: flightsPayload,
          outboundFlights: searchData?.outboundFlights || [],
          returnFlights: searchData?.returnFlights || [],
          preferences: { preferences: preferenceWeights },
        },
      });
    }
  };

  const handleCompareSelected = () => {
    if (!hasSelection) {
      return;
    }
    setShowComparison(true);
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">Flight Search Results</h2>
          <p className="text-muted-foreground">
            {routeInfo.departure} ({routeInfo.departureCode}) → {routeInfo.destination} ({routeInfo.destinationCode}) {routeInfo.date ? `• ${routeInfo.date}` : ''}
          </p>
        </div>

        {/* Error Message - Show prominently if hasRealData is false */}
        {!hasRealData && formattedErrorMessage && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="text-lg font-semibold text-red-800">Unable to Find Flights</h3>
            </div>
            <p className="text-red-700">{formattedErrorMessage}</p>
          </div>
        )}

        {/* Flight Map Animation */}
        <FlightMap
          key={`flight-map-${routeInfo.departureCode}-${routeInfo.destinationCode}`}
          departure={routeInfo.departure}
          destination={routeInfo.destination}
          departureCode={routeInfo.departureCode}
          destinationCode={routeInfo.destinationCode}
        />

        {/* Price Chart */}
        <PriceChart key={`price-chart-${displayPriceData[0]?.date}-${displayPriceData[0]?.price}`} data={displayPriceData} />

               {/* Outbound Flights Table */}
               {searchData?.outboundFlights && searchData.outboundFlights.length > 0 && (
                 <div className="mb-6">
                   <h3 className="text-lg font-semibold mb-3 text-gray-800">
                     Outbound Flights - {routeInfo.departure} to {routeInfo.destination} ({routeInfo.departure_display || routeInfo.date})
                   </h3>
                   <FlightsTable 
                     key={`outbound-flights-${searchData.outboundFlights[0]?.id}-${searchData.outboundFlights[0]?.price}`} 
                     flights={searchData.outboundFlights} 
                   />
                 </div>
               )}

               {/* Return Flights Table */}
               {searchData?.returnFlights && searchData.returnFlights.length > 0 && (
                 <div className="mb-6">
                   <h3 className="text-lg font-semibold mb-3 text-gray-800">
                     Return Flights - {routeInfo.destination} to {routeInfo.departure} ({routeInfo.return_display})
                   </h3>
                   <FlightsTable 
                     key={`return-flights-${searchData.returnFlights[0]?.id}-${searchData.returnFlights[0]?.price}`} 
                     flights={searchData.returnFlights} 
                   />
                 </div>
               )}

        {/* Fallback: Single Flights Table (for backward compatibility) */}
        {(!searchData?.outboundFlights || searchData.outboundFlights.length === 0) && 
         (!searchData?.returnFlights || searchData.returnFlights.length === 0) && (
          <FlightsTable key={`flights-table-${displayFlightsData[0]?.id}-${displayFlightsData[0]?.price}`} flights={displayFlightsData} />
        )}

        {/* Selection Actions */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            marginTop: '24px',
            paddingTop: '24px',
            borderTop: '1px solid #e2e8f0',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px', color: '#0f172a' }}>
                {hasSelection ? `✅ ${selectedFlights.length} flight${selectedFlights.length > 1 ? 's' : ''} selected.` : 'Select flights to create your itinerary.'}
              </span>
              {hasSelection && (
                <button
                  type="button"
                  onClick={clearSelectedFlights}
                  style={{
                    fontSize: '12px',
                    color: '#0f172a',
                    textDecoration: 'underline',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Clear selection
                </button>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <div
                style={{
                  fontSize: '12px',
                  color: '#475569',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
                title="Generate a custom itinerary based on your chosen flights."
              >
                ℹ️ Generate a custom itinerary based on your chosen flights.
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: '#475569',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
                title="Compare prices, duration, and stops for selected flights."
              >
                📊 Compare prices and travel duration between selected flights.
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: '#0f172a',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontWeight: 500,
                }}
                title="These weights shape every score and recommendation."
              >
                🎯 Weights applied: {formatWeightSummary(preferenceWeights)}
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <button
              onClick={handleGenerateItinerary}
              disabled={!hasSelection}
              className="inline-flex items-center justify-center px-6 py-3 bg-[#00ADEF] text-white font-semibold rounded-lg transition-colors shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: hasSelection ? '#00ADEF' : '#94a3b8',
                color: 'white',
                fontWeight: '600',
                padding: '12px 24px',
                borderRadius: '8px',
                border: 'none',
                cursor: hasSelection ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s ease',
                boxShadow: hasSelection ? '0 2px 4px rgba(0, 173, 239, 0.3)' : 'none',
              }}
              onMouseEnter={(e) => {
                if (!hasSelection) return;
                e.target.style.backgroundColor = '#006AAF';
                e.target.style.transform = 'translateY(-1px)';
                e.target.style.boxShadow = '0 4px 8px rgba(0, 173, 239, 0.4)';
              }}
              onMouseLeave={(e) => {
                if (!hasSelection) return;
                e.target.style.backgroundColor = '#00ADEF';
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = '0 2px 4px rgba(0, 173, 239, 0.3)';
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                style={{ marginRight: '8px' }}
              >
                <path
                  d="M10 2L3 7V17C3 17.5304 3.21071 18.0391 3.58579 18.4142C3.96086 18.7893 4.46957 19 5 19H15C15.5304 19 16.0391 18.7893 16.4142 18.4142C16.7893 18.0391 17 17.5304 17 17V7L10 2Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
                <path
                  d="M10 10V19"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M3 7L10 12L17 7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Generate Itinerary
            </button>

            <button
              onClick={handleCompareSelected}
              disabled={!hasSelection}
              className="inline-flex items-center justify-center px-6 py-3 bg-white text-[#00ADEF] font-semibold rounded-lg border-2 border-[#00ADEF] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: hasSelection ? 'white' : '#f8fafc',
                color: hasSelection ? '#00ADEF' : '#94a3b8',
                fontWeight: '600',
                padding: '12px 24px',
                borderRadius: '8px',
                border: `2px solid ${hasSelection ? '#00ADEF' : '#cbd5f5'}`,
                cursor: hasSelection ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                if (!hasSelection) return;
                e.target.style.backgroundColor = '#E6F7FF';
              }}
              onMouseLeave={(e) => {
                if (!hasSelection) return;
                e.target.style.backgroundColor = 'white';
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                style={{ marginRight: '8px' }}
              >
                <path
                  d="M10.833 4.167H15.833V9.167"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M9.167 15.833H4.167V10.833"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M15.833 4.167L11.667 8.333"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M4.167 15.833L8.333 11.667"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Compare Selected
            </button>

            <button
              onClick={() => {
                if (searchData?.onSaveTrip) {
                  searchData.onSaveTrip({
                    destination: routeInfo.destination || routeInfo.destinationCode,
                    destinationCode: routeInfo.destinationCode,
                    departureDate: routeInfo.date || routeInfo.departure_display,
                    returnDate: routeInfo.return_display,
                    selectedFlights,
                    preferenceWeights,
                  });
                }
              }}
              className="inline-flex items-center justify-center px-6 py-3 bg-white text-[#00ADEF] font-semibold rounded-lg border-2 border-[#00ADEF] hover:bg-[#E6F7FF] transition-colors"
              style={{
                backgroundColor: 'white',
                color: '#00ADEF',
                fontWeight: '600',
                padding: '12px 24px',
                borderRadius: '8px',
                border: '2px solid #00ADEF',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#E6F7FF';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'white';
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                style={{ marginRight: '8px' }}
              >
                <path
                  d="M17.5 2.5L9.16667 10.8333L2.5 4.16667"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M15 2.5H17.5V5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M17.5 2.5V7.5C17.5 8.03043 17.2893 8.53914 16.9142 8.91421C16.5391 9.28929 16.0304 9.5 15.5 9.5H4.5C3.96957 9.5 3.46086 9.28929 3.08579 8.91421C2.71071 8.53914 2.5 8.03043 2.5 7.5V4.5C2.5 3.96957 2.71071 3.46086 3.08579 3.08579C3.46086 2.71071 3.96957 2.5 4.5 2.5H7.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Save Trip
            </button>
          </div>
        </div>
        {showComparison && comparisonFlights.length > 0 && (
          <ComparisonModal
            selectedFlight={comparisonFlights[0]}
            alternativeFlights={comparisonFlights.slice(1)}
            onClose={() => setShowComparison(false)}
            flights={comparisonFlights}
            preferenceWeights={preferenceWeights}
          />
        )}
      </div>
    </ScrollArea>
  );
}
