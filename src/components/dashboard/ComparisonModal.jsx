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
  
  // Transform to recharts format: each metric is a data point
  // Show actual values (not normalized) for better readability
  const metrics = [
    { key: 'actualPrice', label: 'Cost (USD)', format: (val) => `${currencySymbol}${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
    { key: 'actualDurationHours', label: 'Duration (hours)', format: (val) => {
      const hours = Math.floor(val);
      const minutes = Math.round((val - hours) * 60);
      return hours > 0 && minutes > 0 ? `${hours}h ${minutes}m` : hours > 0 ? `${hours}h` : `${minutes}m`;
    }},
    { key: 'actualStops', label: 'Stops', format: (val) => val === 0 ? 'Non-stop' : `${val} stop${val > 1 ? 's' : ''}` },
    { key: 'actualConvenience', label: 'Convenience score', format: (val) => `${Math.round(val * 100)}%` }
  ];
  
  const barData = metrics.map(metric => {
    const dataPoint = { metric: metric.label };
    flightData.forEach((flight) => {
      const value = flight[metric.key];
      dataPoint[flight.id] = value;
      dataPoint[`${flight.id}_formatted`] = metric.format(value);
      dataPoint[`${flight.id}_label`] = flight.fullName; // Store label for tooltip
    });
    return dataPoint;
  });
  
  return { barData, flightData };
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
  
  // Find best overall value (balance of cost and convenience)
  const calculateValueScore = (flight) => {
    const maxPrice = Math.max(flight1.actualPrice, flight2.actualPrice);
    const priceScore = 1 - (flight.actualPrice / maxPrice);
    const convenienceScore = flight.actualConvenience;
    return (priceScore * 0.6) + (convenienceScore * 0.4);
  };
  
  const score1 = calculateValueScore(flight1);
  const score2 = calculateValueScore(flight2);
  const bestValue = score1 > score2 ? flight1 : flight2;
  const bestLabel = score1 > score2 ? label1 : label2;
  
  // Determine why it's better
  const isCheaper = bestValue.actualPrice < (score1 > score2 ? flight2.actualPrice : flight1.actualPrice);
  const isFaster = bestValue.actualDurationHours < (score1 > score2 ? flight2.actualDurationHours : flight1.actualDurationHours);
  const sameStops = bestValue.actualStops === (score1 > score2 ? flight2.actualStops : flight1.actualStops);
  
  let reason = '';
  if (isCheaper && isFaster) {
    reason = 'Lower cost and much shorter travel time';
  } else if (isCheaper) {
    reason = 'Lower cost';
  } else if (isFaster) {
    reason = 'Much shorter travel time';
  } else {
    reason = 'Better overall value';
  }
  if (sameStops && (isCheaper || isFaster)) {
    reason += ' with the same number of stops';
  }
  
  insights.push({
    type: 'overall',
    icon: '✅',
    label: 'Overall',
    text: `${bestLabel} offers better value for most travelers.`
  });
  
  return { insights, recommendedFlight: bestValue, recommendedLabel: bestLabel, reason };
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
        <p style={{ margin: '0 0 8px 0', fontWeight: '600', color: '#004C8C' }}>
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
  const { barData, flightData, summary } = useMemo(() => {
    console.log('ComparisonModal - selectedFlight:', selectedFlight);
    console.log('ComparisonModal - alternativeFlights:', alternativeFlights);
    
    if (!selectedFlight) {
      console.log('No selectedFlight');
      return { barData: null, flightData: null, summary: null };
    }
    
    // Can compare even with just the selected flight (no alternatives needed)
    const altFlights = alternativeFlights.length > 0 ? alternativeFlights : [];
    const result = prepareBarChartData(selectedFlight, altFlights);
    const summaryResult = calculateSummary(result.flightData);
    console.log('ComparisonModal - prepared data:', result);
    return { ...result, summary: summaryResult };
  }, [selectedFlight, alternativeFlights]);
  
  console.log('ComparisonModal render - barData:', barData, 'flightData:', flightData);
  
  if (!selectedFlight) {
    console.log('ComparisonModal - No selectedFlight, returning null');
    return null;
  }
  
  // Show at least the selected flight
  if (!barData || !flightData || barData.length === 0 || flightData.length === 0) {
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
  
  // Use consistent colors for exactly 2 flights
  const colors = ['#00ADEF', '#FF6B6B'];
  
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
          color: '#004C8C'
        }}>
          {title}
        </h2>
        
        {/* Summary header line */}
        {(routeDisplay || dateDisplay) && (
          <p style={{ 
            marginTop: 0, 
            marginBottom: '16px',
            color: '#64748b',
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
            backgroundColor: '#f8fafc',
            borderRadius: '8px',
            border: '1px solid #e2e8f0'
          }}>
            <h3 style={{
              marginTop: 0,
              marginBottom: '16px',
              fontSize: '18px',
              fontWeight: '600',
              color: '#004C8C'
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
                    <strong style={{ color: '#1e293b', marginRight: '6px' }}>{insight.label}</strong>
                    <span style={{ color: '#475569' }}>– {insight.text}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Bar Chart */}
        <div style={{ marginBottom: '32px', marginLeft: 'auto', marginRight: 'auto', maxWidth: '800px' }}>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart
              data={barData}
              layout="vertical"
              margin={{ top: 20, right: 30, left: 140, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis 
                type="number" 
                tick={{ fill: '#64748b', fontSize: 11 }}
              />
              <YAxis 
                type="category" 
                dataKey="metric" 
                tick={{ fill: '#64748b', fontSize: 12 }}
                width={140}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                wrapperStyle={{ paddingTop: '20px' }}
                iconType="square"
              />
              {flightData.map((flight, index) => (
                <Bar
                  key={flight.id}
                  dataKey={flight.id}
                  name={flight.fullName}
                  fill={colors[index % colors.length]}
                  radius={[0, 4, 4, 0]}
                >
                  {barData.map((entry, idx) => (
                    <Cell key={`cell-${idx}`} fill={colors[index % colors.length]} />
                  ))}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
          
          {/* Flight labels below chart */}
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
                    <div style={{ marginTop: '2px', fontSize: '11px', color: '#64748b' }}>
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
            marginBottom: '16px',
            fontSize: '18px',
            fontWeight: '600',
            color: '#004C8C'
          }}>
            Detailed Comparison
          </h3>
          <div style={{ 
            maxHeight: '400px', 
            overflowY: 'auto',
            border: '1px solid #e2e8f0',
            borderRadius: '8px'
          }}>
            <table style={{ 
              width: '100%', 
              borderCollapse: 'collapse',
              fontSize: '14px'
            }}>
              <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f8fafc', zIndex: 10 }}>
                <tr style={{ 
                  borderBottom: '2px solid #e2e8f0'
                }}>
                  <th style={{ 
                    padding: '12px', 
                    textAlign: 'left',
                    fontWeight: '600',
                    color: '#004C8C',
                    minWidth: '120px',
                    width: '25%'
                  }}>Item</th>
                  {flightData.map((flight, idx) => (
                    <th key={flight.id} style={{ 
                      padding: '12px', 
                      textAlign: 'center',
                      fontWeight: '600',
                      color: colors[idx],
                      minWidth: '150px',
                      width: `${75 / flightData.length}%`
                    }}>
                      {getShortFlightLabel(flight)}
                    </th>
                  ))}
                  {flightData.length === 2 && (
                    <th style={{ 
                      padding: '12px', 
                      textAlign: 'center',
                      fontWeight: '600',
                      color: '#004C8C',
                      minWidth: '100px',
                      width: '15%'
                    }}>
                      Better Option
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: '#ffffff' }}>
                  <td style={{ padding: '12px', fontWeight: '500' }}>Price</td>
                  {flightData.map((flight, idx) => {
                    const priceSymbol = flight.currency === 'EUR' ? '€' : flight.currency === 'USD' ? '$' : flight.currency || '€';
                    const isBetter = flightData.length === 2 && idx === (flightData[0].actualPrice < flightData[1].actualPrice ? 0 : 1);
                    return (
                      <React.Fragment key={flight.id}>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <span style={{ fontWeight: '700', color: '#059669' }}>
                            {priceSymbol}{Math.round(flight.actualPrice).toLocaleString('en-US')}
                          </span>
                        </td>
                        {flightData.length === 2 && (
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            {isBetter ? '✅' : '–'}
                          </td>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tr>
                <tr style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                  <td style={{ padding: '12px', fontWeight: '500' }}>Duration</td>
                  {flightData.map((flight, idx) => {
                    const isBetter = flightData.length === 2 && idx === (flightData[0].actualDurationHours < flightData[1].actualDurationHours ? 0 : 1);
                    return (
                      <React.Fragment key={flight.id}>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <span style={{ fontWeight: '700', color: '#1e293b' }}>
                            {flight.actualDuration}
                          </span>
                        </td>
                        {flightData.length === 2 && (
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            {isBetter ? '✅' : '–'}
                          </td>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tr>
                <tr style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: '#ffffff' }}>
                  <td style={{ padding: '12px', fontWeight: '500' }}>Stops</td>
                  {flightData.map((flight, idx) => {
                    const isBetter = flightData.length === 2 && idx === (flightData[0].actualStops < flightData[1].actualStops ? 0 : 1);
                    return (
                      <React.Fragment key={flight.id}>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          {flight.actualStops === 0 ? 'Non-stop' : `${flight.actualStops} stop${flight.actualStops > 1 ? 's' : ''}`}
                        </td>
                        {flightData.length === 2 && (
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            {isBetter ? '✅' : '–'}
                          </td>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tr>
                <tr style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                  <td style={{ padding: '12px', fontWeight: '500' }}>Airline</td>
                  {flightData.map((flight, idx) => (
                    <React.Fragment key={flight.id}>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        {getShortAirlineName(flight.airline)}
                      </td>
                      {flightData.length === 2 && (
                        <td style={{ padding: '12px', textAlign: 'center' }}>–</td>
                      )}
                    </React.Fragment>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: '#ffffff' }}>
                  <td style={{ padding: '12px', fontWeight: '500' }}>Flight Number</td>
                  {flightData.map((flight) => (
                    <React.Fragment key={flight.id}>
                      <td style={{ padding: '12px', textAlign: 'center', fontFamily: 'monospace', fontSize: '13px' }}>
                        {flight.originalFlight?.flightNumber || flight.fullName.split(' ').slice(1).join(' ') || 'N/A'}
                      </td>
                      {flightData.length === 2 && (
                        <td style={{ padding: '12px', textAlign: 'center' }}>–</td>
                      )}
                    </React.Fragment>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        
      </div>
    </div>
  );
}

