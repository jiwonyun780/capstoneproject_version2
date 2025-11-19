import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell
} from 'recharts';

// Helper function to parse duration string (e.g., "10h 35m" or "PT10H35M")
const parseDuration = (durationStr) => {
  if (!durationStr) return 0;
  
  // Handle ISO 8601 format (PT10H35M)
  if (durationStr.startsWith('PT')) {
    const hoursMatch = durationStr.match(/(\d+)H/);
    const minutesMatch = durationStr.match(/(\d+)M/);
    const hours = hoursMatch ? parseInt(hoursMatch[1]) : 0;
    const minutes = minutesMatch ? parseInt(minutesMatch[1]) : 0;
    return hours + minutes / 60;
  }
  
  // Handle human-readable format (10h 35m)
  const hoursMatch = durationStr.match(/(\d+)h/);
  const minutesMatch = durationStr.match(/(\d+)m/);
  const hours = hoursMatch ? parseInt(hoursMatch[1]) : 0;
  const minutes = minutesMatch ? parseInt(minutesMatch[1]) : 0;
  return hours + minutes / 60;
};

// Helper function to calculate convenience score
const calculateConvenience = (flight) => {
  let score = 0.5; // Base score
  
  // Non-stop flights get bonus
  if (flight.stops === 0) {
    score += 0.3;
  } else {
    // More stops = lower convenience
    score -= flight.stops * 0.1;
  }
  
  // Good departure/arrival times (assuming we have this data)
  // For now, we'll use a simple heuristic
  
  return Math.max(0, Math.min(1, score));
};

// Format duration for display
const formatDuration = (durationStr) => {
  if (!durationStr) return 'N/A';
  return durationStr; // Keep original format (e.g., "12h 15m")
};

// Prepare data for bar chart - Only compare exactly 2 flights
const prepareBarChartData = (selectedFlight, alternativeFlights) => {
  // Only take exactly 2 flights: the selected one and one alternative
  const allFlights = [selectedFlight, ...alternativeFlights.slice(0, 1)]; // Only 1 alternative = exactly 2 flights total
  
  // Find max values for normalization
  const prices = allFlights.map(f => f.price || 0);
  const durations = allFlights.map(f => parseDuration(f.duration || '0h'));
  const stops = allFlights.map(f => f.stops || 0);
  
  const maxPrice = Math.max(...prices, 1);
  const maxDuration = Math.max(...durations, 1);
  const maxStops = Math.max(...stops, 1);
  
  // Calculate normalized values and actual values for each flight
  const flightData = allFlights.map((flight, index) => {
    const price = flight.price || 0;
    const duration = parseDuration(flight.duration || '0h');
    const flightStops = flight.stops || 0;
    const convenience = calculateConvenience(flight);
    const currency = flight.currency || 'EUR'; // Get currency from flight, default to EUR
    
    return {
      id: `flight-${index}`,
      name: index === 0 ? 'Selected Flight' : `Alternative ${index}`,
      fullName: `${flight.airline || 'Unknown'} ${flight.flightNumber || ''}`,
      airline: flight.airline || 'Unknown',
      originalFlight: flight, // Store original flight object for reference
      currency: currency, // Store currency for display
      // Actual values
      actualPrice: price,
      actualDuration: formatDuration(flight.duration || '0h'),
      actualDurationHours: duration,
      actualStops: flightStops,
      actualConvenience: convenience,
      // Normalized values (0-1, inverted for lower-is-better metrics)
      priceNorm: 1 - (price / maxPrice),
      durationNorm: 1 - (duration / maxDuration),
      stopsNorm: 1 - (flightStops / maxStops),
      convenienceNorm: convenience,
      valueNorm: Math.max(0, Math.min(1, (maxPrice - price) / maxPrice * 0.7 + convenience * 0.3))
    };
  });
  
  // Get currency from first flight (all flights should have same currency from Amadeus)
  const defaultCurrency = flightData.length > 0 ? (flightData[0].currency || 'EUR') : 'EUR';
  const currencySymbol = defaultCurrency === 'EUR' ? '€' : defaultCurrency === 'USD' ? '$' : defaultCurrency;
  
  // Helper to get short flight label (defined before prepareBarChartData uses it)
  const getShortFlightLabelForChart = (flight) => {
    const airline = getShortAirlineName(flight.airline);
    const flightNumber = flight.originalFlight?.flightNumber || flight.fullName.split(' ').slice(1).join(' ') || '';
    return `${airline} ${flightNumber}`.trim();
  };
  
  // Get flight labels for chart series names
  const flightALabel = getShortFlightLabelForChart(flightData[0]);
  const flightBLabel = flightData.length > 1 ? getShortFlightLabelForChart(flightData[1]) : 'Flight B';
  
  // Transform to recharts format: separate charts for Cost and Duration
  // Simplified data structure - only metric and values, no custom tooltip columns
  // Cost chart data - format for horizontal bar chart (one data point with both flights)
  const costChartData = [{
    metric: 'Cost (USD)',
    'Flight A': flightData[0].actualPrice
  }];
  
  if (flightData.length > 1) {
    costChartData[0]['Flight B'] = flightData[1].actualPrice;
  }
  
  // Duration chart data - format for horizontal bar chart (one data point with both flights)
  const durationChartData = [{
    metric: 'Duration (hours)',
    'Flight A': flightData[0].actualDurationHours
  }];
  
  if (flightData.length > 1) {
    durationChartData[0]['Flight B'] = flightData[1].actualDurationHours;
  }
  
  return { costChartData, durationChartData, flightData, flightALabel, flightBLabel };
};

// Helper to get short airline name (e.g., "KLM" from "KLM Royal Dutch Airlines")
const getShortAirlineName = (fullName) => {
  if (!fullName) return 'Unknown';
  // Extract first word or common airline abbreviations
  const firstWord = fullName.split(' ')[0];
  // Common airline name mappings
  const airlineMap = {
    'KLM': 'KLM',
    'United': 'United',
    'American': 'American',
    'Delta': 'Delta',
    'Lufthansa': 'Lufthansa',
    'British': 'British Airways',
    'Air': 'Air France',
    'Turkish': 'Turkish Airlines',
    'Emirates': 'Emirates',
    'Qatar': 'Qatar Airways'
  };
  return airlineMap[firstWord] || firstWord;
};

// Helper to format short flight label (e.g., "KLM KL652")
const getShortFlightLabel = (flight) => {
  const airline = getShortAirlineName(flight.airline);
  const flightNumber = flight.originalFlight?.flightNumber || flight.fullName.split(' ').slice(1).join(' ') || '';
  return `${airline} ${flightNumber}`.trim();
};

// Calculate summary insights for exactly 2 flights (short, scannable format)
const calculateSummary = (flightData) => {
  const insights = [];
  
  if (flightData.length !== 2) {
    return insights; // Only works with exactly 2 flights
  }
  
  const [flight1, flight2] = flightData;
  
  // Helper function to format price with currency (rounded)
  const formatPrice = (price, currency, round = true) => {
    const symbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency || '€';
    if (round) {
      return `${symbol}${Math.round(price).toLocaleString('en-US')}`;
    }
    return `${symbol}${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  
  const label1 = getShortFlightLabel(flight1);
  const label2 = getShortFlightLabel(flight2);
  
  // Find cheaper flight
  const cheaper = flight1.actualPrice < flight2.actualPrice ? flight1 : flight2;
  const moreExpensive = flight1.actualPrice < flight2.actualPrice ? flight2 : flight1;
  const priceDifference = Math.abs(flight1.actualPrice - flight2.actualPrice);
  const cheaperLabel = flight1.actualPrice < flight2.actualPrice ? label1 : label2;
  const moreExpensiveLabel = flight1.actualPrice < flight2.actualPrice ? label2 : label1;
  
  insights.push({
    type: 'price',
    icon: '💰',
    label: 'Price',
    text: `${cheaperLabel} is ${formatPrice(priceDifference, cheaper.currency)} cheaper (${formatPrice(cheaper.actualPrice, cheaper.currency)} vs ${formatPrice(moreExpensive.actualPrice, moreExpensive.currency)}).`
  });
  
  // Find faster flight
  const faster = flight1.actualDurationHours < flight2.actualDurationHours ? flight1 : flight2;
  const slower = flight1.actualDurationHours < flight2.actualDurationHours ? flight2 : flight1;
  const timeDifference = Math.abs(flight1.actualDurationHours - flight2.actualDurationHours);
  const fasterLabel = flight1.actualDurationHours < flight2.actualDurationHours ? label1 : label2;
  const slowerLabel = flight1.actualDurationHours < flight2.actualDurationHours ? label2 : label1;
  
  // Format duration difference nicely
  const hours = Math.floor(timeDifference);
  const minutes = Math.round((timeDifference - hours) * 60);
  let durationDiff = '';
  if (hours > 0 && minutes > 0) {
    durationDiff = `${hours}h ${minutes}m`;
  } else if (hours > 0) {
    durationDiff = `${hours}h`;
  } else {
    durationDiff = `${minutes}m`;
  }
  
  insights.push({
    type: 'duration',
    icon: '⚡',
    label: 'Duration',
    text: `${fasterLabel} is ${durationDiff} faster (${faster.actualDuration} vs ${slower.actualDuration}).`
  });
  
  // Determine recommended flight based on price and duration
  const isCheaper = cheaper === flight1;
  const isFaster = faster === flight1;
  
  // Recommend based on which flight is cheaper or faster
  let recommendedFlight, recommendedLabel, reason;
  if (isCheaper && isFaster) {
    recommendedFlight = flight1;
    recommendedLabel = label1;
    reason = 'Lower cost and shorter travel time';
  } else if (!isCheaper && !isFaster) {
    recommendedFlight = flight2;
    recommendedLabel = label2;
    reason = 'Lower cost and shorter travel time';
  } else if (isCheaper) {
    recommendedFlight = flight1;
    recommendedLabel = label1;
    reason = 'Lower cost';
  } else {
    recommendedFlight = flight2;
    recommendedLabel = label2;
    reason = 'Lower cost';
  }
  
  return { insights, recommendedFlight, recommendedLabel, reason };
};

// Custom tooltip for bar chart
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        backgroundColor: 'white',
        padding: '12px',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
      }}>
        <p style={{ margin: '0 0 8px 0', fontWeight: '600', color: '#2D6CDF' }}>
          {label}
        </p>
        {payload.map((entry, index) => {
          const flightId = entry.dataKey;
          const formattedValue = entry.payload[`${flightId}_formatted`] || entry.value;
          const flightLabel = entry.payload[`${flightId}_label`] || entry.name;
          
          return (
            <p key={index} style={{ 
              margin: '4px 0', 
              color: entry.color,
              fontSize: '13px'
            }}>
              <strong>{flightLabel}:</strong> {formattedValue}
            </p>
          );
        })}
      </div>
    );
  }
  return null;
};

export function ComparisonModal({ selectedFlight, alternativeFlights = [], onClose }) {
  const { costChartData, durationChartData, flightData, summary, flightALabel, flightBLabel } = useMemo(() => {
    console.log('ComparisonModal - selectedFlight:', selectedFlight);
    console.log('ComparisonModal - alternativeFlights:', alternativeFlights);
    
    if (!selectedFlight) {
      console.log('No selectedFlight');
      return { costChartData: null, durationChartData: null, flightData: null, summary: null, flightALabel: null, flightBLabel: null };
    }
    
    // Can compare even with just the selected flight (no alternatives needed)
    const altFlights = alternativeFlights.length > 0 ? alternativeFlights : [];
    const result = prepareBarChartData(selectedFlight, altFlights);
    const summaryResult = calculateSummary(result.flightData);
    console.log('ComparisonModal - prepared data:', result);
    return { ...result, summary: summaryResult };
  }, [selectedFlight, alternativeFlights]);
  
  console.log('ComparisonModal render - costChartData:', costChartData, 'durationChartData:', durationChartData, 'flightData:', flightData);
  
  if (!selectedFlight) {
    console.log('ComparisonModal - No selectedFlight, returning null');
    return null;
  }
  
  // Show at least the selected flight
  if (!costChartData || !durationChartData || !flightData || flightData.length === 0) {
    console.log('ComparisonModal - Invalid data, creating fallback');
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
          zIndex: 1000,
          padding: '20px'
        }}
        onClick={onClose}
      >
        <div
          style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '600px',
            width: '100%',
            position: 'relative'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#666'
            }}
          >
            ×
          </button>
          <h2>Flight Information</h2>
          <p>No alternative flights available for comparison.</p>
          <p>Selected Flight: {selectedFlight.airline} {selectedFlight.flightNumber}</p>
        </div>
      </div>
    );
  }
  
  // Use consistent colors for exactly 2 flights - Miles UI color palette
  const colors = ['#4A90E2', '#FF8A80']; // PrimaryBlue, SoftRed
  
  // Get short labels for flights
  const getFlightLabels = () => {
    if (flightData.length === 2) {
      return {
        label1: getShortFlightLabel(flightData[0]),
        label2: getShortFlightLabel(flightData[1])
      };
    }
    return { label1: getShortFlightLabel(flightData[0]), label2: '' };
  };
  
  const flightLabels = getFlightLabels();
  const title = flightData.length === 2 
    ? `${flightLabels.label1} vs ${flightLabels.label2} – Flight Comparison`
    : 'Compare 2 Flights';
  
  // Extract route info from flights (if available)
  const getRouteInfo = () => {
    // Try to get from original flight objects
    const flight1 = flightData[0]?.originalFlight;
    const origin = flight1?.origin || flight1?.departureCode || '';
    const destination = flight1?.destination || flight1?.arrivalCode || '';
    const date = flight1?.departureDate || flight1?.date || '';
    
    return { origin, destination, date };
  };
  
  const routeInfo = getRouteInfo();
  const routeDisplay = routeInfo.origin && routeInfo.destination 
    ? `${routeInfo.origin} → ${routeInfo.destination}`
    : '';
  const dateDisplay = routeInfo.date ? ` · ${routeInfo.date}` : '';
  
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
        zIndex: 9999,
        padding: '20px',
        overflow: 'auto'
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '900px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
          position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'none',
            border: 'none',
            fontSize: '24px',
            cursor: 'pointer',
            color: '#666',
            padding: '4px 8px',
            borderRadius: '4px',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={(e) => e.target.style.backgroundColor = '#f3f4f6'}
          onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
        >
          ×
        </button>
        
        {/* Title */}
        <h2 style={{ 
          marginTop: 0, 
          marginBottom: '8px',
          fontSize: '24px',
          fontWeight: '700',
          color: '#2D6CDF'
        }}>
          {title}
        </h2>
        
        {/* Summary header line */}
        {(routeDisplay || dateDisplay) && (
          <p style={{ 
            marginTop: 0, 
            marginBottom: '16px',
            color: '#4A4A4A',
            fontSize: '14px',
            fontWeight: '500'
          }}>
            {routeDisplay}{dateDisplay}
          </p>
        )}
        
        {/* Recommendation Banner */}
        {summary && summary.recommendedFlight && flightData.length === 2 && (
          <div style={{
            marginBottom: '24px',
            padding: '16px 20px',
            backgroundColor: '#f0fdf4',
            borderRadius: '8px',
            border: '1px solid #86efac',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px'
          }}>
            <span style={{ fontSize: '20px', lineHeight: '1.2' }}>✅</span>
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: '16px',
                fontWeight: '600',
                color: '#166534',
                marginBottom: '4px'
              }}>
                Recommended: {summary.recommendedLabel}
              </div>
              <div style={{
                fontSize: '14px',
                color: '#15803d',
                lineHeight: '1.4'
              }}>
                {summary.reason}.
              </div>
            </div>
          </div>
        )}
        
        {/* Quick Insights Section */}
        {summary && summary.insights && summary.insights.length > 0 && (
          <div style={{
            marginBottom: '32px',
            padding: '20px',
            backgroundColor: '#F7F9FB',
            borderRadius: '8px',
            border: '1px solid #DADDE2'
          }}>
            <h3 style={{
              marginTop: 0,
              marginBottom: '16px',
              fontSize: '18px',
              fontWeight: '600',
              color: '#2D6CDF'
            }}>
              Quick Insights
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {summary.insights.map((insight, index) => (
                <div key={index} style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  padding: '10px',
                  backgroundColor: 'white',
                  borderRadius: '6px',
                  fontSize: '14px',
                  lineHeight: '1.5'
                }}>
                  <span style={{ fontSize: '18px', lineHeight: '1.2', flexShrink: 0 }}>{insight.icon}</span>
                  <div>
                    <strong style={{ color: '#4A4A4A', marginRight: '6px' }}>{insight.label}</strong>
                    <span style={{ color: '#4A4A4A', opacity: 0.8 }}>– {insight.text}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Cost Comparison Bar Chart */}
        <div style={{ marginBottom: '32px', marginLeft: 'auto', marginRight: 'auto', maxWidth: '800px' }}>
          <h3 style={{ 
            marginBottom: '16px',
            fontSize: '18px',
            fontWeight: '600',
            color: '#2D6CDF',
            textAlign: 'center'
          }}>
            Cost Comparison (USD)
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={costChartData}
              layout="vertical"
              margin={{ top: 20, right: 30, left: 100, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#DADDE2" />
              <XAxis 
                type="number" 
                tick={{ fill: '#4A4A4A', fontSize: 11 }}
                domain={[0, 'dataMax']}
              />
              <YAxis 
                type="category" 
                dataKey="metric" 
                tick={{ fill: '#4A4A4A', fontSize: 12 }}
                width={140}
              />
              <Tooltip 
                shared={false}
                formatter={(value, name) => {
                  // Format the value with currency symbol
                  const priceSymbol = flightData[0]?.currency === 'EUR' ? '€' : flightData[0]?.currency === 'USD' ? '$' : '$';
                  return `${priceSymbol}${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                }}
              />
              <Legend 
                wrapperStyle={{ paddingTop: '20px' }}
                iconType="square"
              />
              <Bar
                dataKey="Flight A"
                name={flightALabel || 'Flight A'}
                fill={colors[0]}
                radius={[0, 4, 4, 0]}
              />
              {flightData.length > 1 && (
                <Bar
                  dataKey="Flight B"
                  name={flightBLabel || 'Flight B'}
                  fill={colors[1]}
                  radius={[0, 4, 4, 0]}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
        
        {/* Duration Comparison Bar Chart */}
        <div style={{ marginBottom: '32px', marginLeft: 'auto', marginRight: 'auto', maxWidth: '800px' }}>
          <h3 style={{ 
            marginBottom: '16px',
            fontSize: '18px',
            fontWeight: '600',
            color: '#2D6CDF',
            textAlign: 'center'
          }}>
            Duration Comparison (hours)
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={durationChartData}
              layout="vertical"
              margin={{ top: 20, right: 30, left: 100, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#DADDE2" />
              <XAxis 
                type="number" 
                tick={{ fill: '#4A4A4A', fontSize: 11 }}
                domain={[0, 'dataMax']}
              />
              <YAxis 
                type="category" 
                dataKey="metric" 
                tick={{ fill: '#4A4A4A', fontSize: 12 }}
                width={140}
              />
              <Tooltip 
                shared={false}
                formatter={(value, name) => {
                  // Format duration value (hours with 2 decimal places)
                  return typeof value === 'number' ? `${value.toFixed(2)}h` : value;
                }}
              />
              <Legend 
                wrapperStyle={{ paddingTop: '20px' }}
                iconType="square"
              />
              <Bar
                dataKey="Flight A"
                name={flightALabel || 'Flight A'}
                fill={colors[0]}
                radius={[0, 4, 4, 0]}
              />
              {flightData.length > 1 && (
                <Bar
                  dataKey="Flight B"
                  name={flightBLabel || 'Flight B'}
                  fill={colors[1]}
                  radius={[0, 4, 4, 0]}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
          
          {/* Flight labels below charts */}
          <div style={{ 
            marginTop: '16px', 
            display: 'flex', 
            justifyContent: 'center',
            gap: '24px',
            fontSize: '12px'
          }}>
            {flightData.map((flight, index) => {
              const priceSymbol = flight.currency === 'EUR' ? '€' : flight.currency === 'USD' ? '$' : flight.currency || '€';
              return (
                <div key={flight.id} style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px',
                  color: colors[index % colors.length]
                }}>
                  <div style={{ 
                    width: '12px', 
                    height: '12px', 
                    backgroundColor: colors[index % colors.length],
                    borderRadius: '2px'
                  }}></div>
                  <div>
                    <div style={{ fontWeight: '600' }}>{getShortFlightLabel(flight)}</div>
                    <div style={{ marginTop: '2px', fontSize: '11px', color: '#4A4A4A' }}>
                      {priceSymbol}{Math.round(flight.actualPrice).toLocaleString('en-US')} • {flight.actualDuration} • {flight.actualStops === 0 ? 'Non-stop' : `${flight.actualStops} stop${flight.actualStops > 1 ? 's' : ''}`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Detailed Comparison Table */}
        <div style={{ marginTop: '32px' }}>
          <h3 style={{ 
            marginBottom: '12px',
            fontSize: '18px',
            fontWeight: '600',
            color: '#2D6CDF'
          }}>
            Detailed Comparison
          </h3>
          <div style={{ 
            maxHeight: '400px', 
            overflowY: 'auto',
            overflowX: 'auto',
            border: '1px solid #DADDE2',
            borderRadius: '8px',
            backgroundColor: '#F7F9FB'
          }}>
            <table style={{ 
              width: '100%', 
              borderCollapse: 'collapse',
              fontSize: '14px',
              minWidth: '400px'
            }}>
              <thead style={{ position: 'sticky', top: 0, backgroundColor: '#F7F9FB', zIndex: 10 }}>
                <tr style={{ 
                  borderBottom: '2px solid #DADDE2'
                }}>
                  <th style={{ 
                    padding: '8px 12px', 
                    textAlign: 'left',
                    fontWeight: '600',
                    color: '#2D6CDF',
                    width: '30%'
                  }}>Item</th>
                  {flightData.map((flight, idx) => (
                    <th key={flight.id} style={{ 
                      padding: '8px 12px', 
                      textAlign: 'center',
                      fontWeight: '600',
                      color: colors[idx],
                      width: '35%'
                    }}>
                      {getShortFlightLabel(flight)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Price Row */}
                <tr style={{ borderBottom: '1px solid #DADDE2', backgroundColor: '#ffffff' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F7F9FB'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}>
                  <td style={{ padding: '8px 12px', fontWeight: '500', color: '#4A4A4A' }}>Price</td>
                  {flightData.map((flight, idx) => {
                    const priceSymbol = flight.currency === 'EUR' ? '€' : flight.currency === 'USD' ? '$' : flight.currency || '€';
                    const isBetter = flightData.length === 2 && idx === (flightData[0].actualPrice < flightData[1].actualPrice ? 0 : 1);
                    return (
                      <td key={flight.id} style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: '700', color: '#4A4A4A' }}>
                            {priceSymbol}{Math.round(flight.actualPrice).toLocaleString('en-US')}
                          </span>
                          {isBetter && (
                            <span style={{
                              fontSize: '11px',
                              color: '#3CB878',
                              fontWeight: '600',
                              backgroundColor: '#E9F8F1',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              whiteSpace: 'nowrap'
                            }}>
                              ✓ Best
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
                {/* Duration Row */}
                <tr style={{ borderBottom: '1px solid #DADDE2', backgroundColor: '#F7F9FB' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F7F9FB'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#F7F9FB'}>
                  <td style={{ padding: '8px 12px', fontWeight: '500', color: '#4A4A4A' }}>Duration</td>
                  {flightData.map((flight, idx) => {
                    const isBetter = flightData.length === 2 && idx === (flightData[0].actualDurationHours < flightData[1].actualDurationHours ? 0 : 1);
                    return (
                      <td key={flight.id} style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: '700', color: '#4A4A4A' }}>
                            {flight.actualDuration || '—'}
                          </span>
                          {isBetter && (
                            <span style={{
                              fontSize: '11px',
                              color: '#3CB878',
                              fontWeight: '600',
                              backgroundColor: '#E9F8F1',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              whiteSpace: 'nowrap'
                            }}>
                              ✓ Best
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
                {/* Stops Row */}
                <tr style={{ borderBottom: '1px solid #DADDE2', backgroundColor: '#ffffff' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F7F9FB'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}>
                  <td style={{ padding: '8px 12px', fontWeight: '500', color: '#4A4A4A' }}>Stops</td>
                  {flightData.map((flight, idx) => {
                    const isBetter = flightData.length === 2 && idx === (flightData[0].actualStops < flightData[1].actualStops ? 0 : 1);
                    const stopsText = flight.actualStops === 0 ? 'Non-stop' : `${flight.actualStops} stop${flight.actualStops > 1 ? 's' : ''}`;
                    return (
                      <td key={flight.id} style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: '400', color: '#4A4A4A' }}>
                            {stopsText || '—'}
                          </span>
                          {isBetter && (
                            <span style={{
                              fontSize: '11px',
                              color: '#3CB878',
                              fontWeight: '600',
                              backgroundColor: '#E9F8F1',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              whiteSpace: 'nowrap'
                            }}>
                              ✓ Best
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
                {/* Airline Row */}
                <tr style={{ borderBottom: '1px solid #DADDE2', backgroundColor: '#F7F9FB' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F7F9FB'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#F7F9FB'}>
                  <td style={{ padding: '8px 12px', fontWeight: '500', color: '#4A4A4A' }}>Airline</td>
                  {flightData.map((flight) => (
                    <td key={flight.id} style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <span style={{ fontWeight: '400', color: '#4A4A4A', fontSize: '13px', opacity: 0.7 }}>
                        {getShortAirlineName(flight.airline) || '—'}
                      </span>
                    </td>
                  ))}
                </tr>
                {/* Flight Number Row */}
                <tr style={{ borderBottom: '1px solid #DADDE2', backgroundColor: '#ffffff' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F7F9FB'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}>
                  <td style={{ padding: '8px 12px', fontWeight: '500', color: '#4A4A4A' }}>Flight Number</td>
                  {flightData.map((flight) => {
                    const flightNumber = flight.originalFlight?.flightNumber || flight.fullName.split(' ').slice(1).join(' ') || null;
                    return (
                      <td key={flight.id} style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '13px', color: '#4A4A4A', fontWeight: '400', opacity: 0.7 }}>
                          {flightNumber || '—'}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
          
          {/* Summary Line */}
          {flightData.length === 2 && (() => {
            const flight1 = flightData[0];
            const flight2 = flightData[1];
            const label1 = getShortFlightLabel(flight1);
            const label2 = getShortFlightLabel(flight2);
            
            const wins1 = [];
            const wins2 = [];
            
            // Price comparison
            if (flight1.actualPrice < flight2.actualPrice) {
              wins1.push('Price');
            } else if (flight2.actualPrice < flight1.actualPrice) {
              wins2.push('Price');
            }
            
            // Duration comparison
            if (flight1.actualDurationHours < flight2.actualDurationHours) {
              wins1.push('Duration');
            } else if (flight2.actualDurationHours < flight1.actualDurationHours) {
              wins2.push('Duration');
            }
            
            // Stops comparison (only if different)
            if (flight1.actualStops < flight2.actualStops) {
              wins1.push('Stops');
            } else if (flight2.actualStops < flight1.actualStops) {
              wins2.push('Stops');
            }
            
            const summaryParts = [];
            if (wins1.length > 0) {
              const winsText = wins1.length === 1 ? wins1[0] : wins1.slice(0, -1).join(', ') + ' and ' + wins1[wins1.length - 1];
              summaryParts.push(`${label1} wins on ${winsText}`);
            }
            if (wins2.length > 0) {
              const winsText = wins2.length === 1 ? wins2[0] : wins2.slice(0, -1).join(', ') + ' and ' + wins2[wins2.length - 1];
              summaryParts.push(`${label2} wins on ${winsText}`);
            }
            
            if (summaryParts.length > 0) {
              return (
                <div style={{
                  marginTop: '12px',
                  padding: '10px 14px',
                  backgroundColor: '#F7F9FB',
                  borderRadius: '6px',
                  fontSize: '13px',
                  color: '#4A4A4A',
                  lineHeight: '1.5',
                  border: '1px solid #DADDE2'
                }}>
                  {summaryParts.join('. ')}.
                </div>
              );
            }
            return null;
          })()}
        </div>
        
      </div>
    </div>
  );
}

