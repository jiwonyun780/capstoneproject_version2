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
    { key: 'actualPrice', label: 'Cost', format: (val) => `${currencySymbol}${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
    { key: 'actualDurationHours', label: 'Duration (hours)', format: (val) => `${val.toFixed(1)}h` },
    { key: 'actualStops', label: 'Stops', format: (val) => val === 0 ? 'Non-stop' : `${val} stop${val > 1 ? 's' : ''}` },
    { key: 'actualConvenience', label: 'Convenience', format: (val) => `${Math.round(val * 100)}%` }
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

// Calculate summary insights for exactly 2 flights
const calculateSummary = (flightData) => {
  const insights = [];
  
  if (flightData.length !== 2) {
    return insights; // Only works with exactly 2 flights
  }
  
  const [flight1, flight2] = flightData;
  
  // Helper function to format price with currency
  const formatPrice = (price, currency) => {
    const symbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency || '€';
    return `${symbol}${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  
  // Find cheaper flight
  const cheaper = flight1.actualPrice < flight2.actualPrice ? flight1 : flight2;
  const moreExpensive = flight1.actualPrice < flight2.actualPrice ? flight2 : flight1;
  const priceDifference = Math.abs(flight1.actualPrice - flight2.actualPrice);
  insights.push({
    type: 'cheapest',
    icon: '💰',
    text: `${cheaper.fullName} is cheaper by ${formatPrice(priceDifference, cheaper.currency)} (${formatPrice(cheaper.actualPrice, cheaper.currency)} vs ${formatPrice(moreExpensive.actualPrice, moreExpensive.currency)}).`
  });
  
  // Find faster flight
  const faster = flight1.actualDurationHours < flight2.actualDurationHours ? flight1 : flight2;
  const slower = flight1.actualDurationHours < flight2.actualDurationHours ? flight2 : flight1;
  const timeDifference = Math.abs(flight1.actualDurationHours - flight2.actualDurationHours);
  insights.push({
    type: 'fastest',
    icon: '⚡',
    text: `${faster.fullName} is faster by ${timeDifference.toFixed(1)} hours (${faster.actualDuration} vs ${slower.actualDuration}).`
  });
  
  // Find best overall value (balance of cost and convenience)
  // Calculate value score: lower price and higher convenience = better
  const calculateValueScore = (flight) => {
    // Normalize: lower price = higher score, higher convenience = higher score
    const maxPrice = Math.max(flight1.actualPrice, flight2.actualPrice);
    const priceScore = 1 - (flight.actualPrice / maxPrice); // 0-1, higher is better
    const convenienceScore = flight.actualConvenience; // 0-1, higher is better
    return (priceScore * 0.6) + (convenienceScore * 0.4); // Weight price more
  };
  
  const score1 = calculateValueScore(flight1);
  const score2 = calculateValueScore(flight2);
  const bestValue = score1 > score2 ? flight1 : flight2;
  const otherFlight = score1 > score2 ? flight2 : flight1;
  
  insights.push({
    type: 'best',
    icon: '✅',
    text: `${bestValue.fullName} offers the best overall value — balances cost (${formatPrice(bestValue.actualPrice, bestValue.currency)}) and convenience better than ${otherFlight.fullName}.`
  });
  
  return insights;
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
    const summaryInsights = calculateSummary(result.flightData);
    console.log('ComparisonModal - prepared data:', result);
    return { ...result, summary: summaryInsights };
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
        
        <h2 style={{ 
          marginTop: 0, 
          marginBottom: '8px',
          fontSize: '24px',
          fontWeight: '600',
          color: '#004C8C'
        }}>
          Flight Comparison
        </h2>
        <p style={{ 
          marginTop: 0, 
          marginBottom: '24px',
          color: '#666',
          fontSize: '14px'
        }}>
          Comparing {flightData.length} flight{flightData.length !== 1 ? 's' : ''} side by side
        </p>
        
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
                width={130}
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
                    <div style={{ fontWeight: '600' }}>{flight.fullName}</div>
                    <div style={{ marginTop: '2px', fontSize: '11px', color: '#64748b' }}>
                      {priceSymbol}{flight.actualPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} • {flight.actualDuration} • {flight.actualStops === 0 ? 'Non-stop' : `${flight.actualStops} stop${flight.actualStops > 1 ? 's' : ''}`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Quick Insights Section */}
        {summary && summary.length > 0 && (
          <div style={{
            marginBottom: '32px',
            padding: '20px',
            backgroundColor: '#f0f9ff',
            borderRadius: '8px',
            border: '1px solid #00ADEF'
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {summary.map((insight, index) => (
                <div key={index} style={{
                  padding: '12px',
                  backgroundColor: 'white',
                  borderRadius: '6px',
                  fontSize: '14px',
                  color: '#1e40af',
                  border: '1px solid #bae6fd'
                }}>
                  <span style={{ fontSize: '18px', marginRight: '10px' }}>{insight.icon}</span>
                  {insight.text}
                </div>
              ))}
            </div>
          </div>
        )}
        
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
                      {flight.fullName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: '#ffffff' }}>
                  <td style={{ padding: '12px', fontWeight: '500' }}>Price</td>
                  {flightData.map((flight, idx) => {
                    const priceSymbol = flight.currency === 'EUR' ? '€' : flight.currency === 'USD' ? '$' : flight.currency || '€';
                    return (
                      <td key={flight.id} style={{ padding: '12px', textAlign: 'center' }}>
                        {priceSymbol}{flight.actualPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    );
                  })}
                </tr>
                <tr style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                  <td style={{ padding: '12px', fontWeight: '500' }}>Duration</td>
                  {flightData.map((flight, idx) => (
                    <td key={flight.id} style={{ padding: '12px', textAlign: 'center' }}>
                      {flight.actualDuration}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: '#ffffff' }}>
                  <td style={{ padding: '12px', fontWeight: '500' }}>Stops</td>
                  {flightData.map((flight, idx) => (
                    <td key={flight.id} style={{ padding: '12px', textAlign: 'center' }}>
                      {flight.actualStops === 0 ? 'Non-stop' : `${flight.actualStops} stop${flight.actualStops > 1 ? 's' : ''}`}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                  <td style={{ padding: '12px', fontWeight: '500' }}>Airline</td>
                  {flightData.map((flight, idx) => (
                    <td key={flight.id} style={{ padding: '12px', textAlign: 'center' }}>
                      {flight.airline}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: '#ffffff' }}>
                  <td style={{ padding: '12px', fontWeight: '500' }}>Flight Number</td>
                  {flightData.map((flight) => (
                    <td key={flight.id} style={{ padding: '12px', textAlign: 'center', fontFamily: 'monospace', fontSize: '13px' }}>
                      {flight.originalFlight?.flightNumber || flight.fullName.split(' ').slice(1).join(' ') || 'N/A'}
                    </td>
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

