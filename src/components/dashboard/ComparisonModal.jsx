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
  Cell,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis
} from 'recharts';
import {
  normalizePreferenceWeights,
  DEFAULT_PREFERENCE_WEIGHTS,
  formatWeightSummary,
} from '../../utils/preferences';

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

// Prepare data for comparison visualizations (up to 3 flights)
const prepareComparisonData = (flightsInput, preferenceWeights) => {
  const candidates = (flightsInput || []).filter(Boolean).slice(0, 3);

  if (candidates.length === 0) {
    return {
      barData: [],
      radarData: [],
      flightData: [],
    };
  }

  const normalizedWeights = normalizePreferenceWeights(
    preferenceWeights || DEFAULT_PREFERENCE_WEIGHTS,
  );

  const prices = candidates.map((f) => Number(f.price ?? 0));
  const durations = candidates.map((f) => parseDuration(f.duration || f.totalDuration || '0h'));
  const stops = candidates.map((f) => Number(f.stops ?? f.numberOfStops ?? 0));

  const maxPrice = Math.max(...prices, 1);
  const maxDuration = Math.max(...durations, 1);
  const maxStops = Math.max(...stops, 1);

  const flightData = candidates.map((flight, index) => {
    const price = Number(flight.price ?? 0);
    const durationHours = parseDuration(flight.duration || flight.totalDuration || '0h');
    const flightStops = Number(flight.stops ?? flight.numberOfStops ?? 0);
    const convenience = calculateConvenience({ stops: flightStops });
    const currency = flight.currency || 'USD';
    const dataKey = `flight_${index + 1}`;
    const priceNorm = Math.max(0, Math.min(1, 1 - price / maxPrice));
    const durationNorm = Math.max(0, Math.min(1, 1 - durationHours / maxDuration));
    const stopsNorm = Math.max(0, Math.min(1, 1 - flightStops / maxStops));
    const convenienceNorm = Math.max(0, Math.min(1, convenience));
    const convenienceComposite = (durationNorm + convenienceNorm) / 2;
    const totalWeightedScore =
      priceNorm * normalizedWeights.budget +
      stopsNorm * normalizedWeights.quality +
      convenienceComposite * normalizedWeights.convenience;
    const totalScorePct = Math.max(0, Math.min(100, totalWeightedScore * 100));

    const weightedScores = {
      price: Math.max(0, Math.min(100, priceNorm * normalizedWeights.budget * 100)),
      duration: Math.max(0, Math.min(100, durationNorm * normalizedWeights.convenience * 100)),
      stops: Math.max(0, Math.min(100, stopsNorm * normalizedWeights.quality * 100)),
      convenience: Math.max(0, Math.min(100, convenienceNorm * normalizedWeights.convenience * 100)),
      total: totalScorePct,
    };

    return {
      id: flight.id || dataKey,
      dataKey,
      name: `Option ${index + 1}`,
      fullName: `${flight.airline || 'Unknown'} ${flight.flightNumber || ''}`.trim(),
      airline: flight.airline || 'Unknown',
      originalFlight: flight,
      currency,
      actualPrice: price,
      actualDuration: formatDuration(flight.duration || flight.totalDuration || '0h'),
      actualDurationHours: durationHours,
      actualStops: flightStops,
      actualConvenience: convenience,
      priceNorm,
      durationNorm,
      stopsNorm,
      convenienceNorm,
      valueNorm: Math.max(
        0,
        Math.min(
          1,
          (maxPrice > 0 ? (maxPrice - price) / maxPrice : 0) * 0.7 + convenience * 0.3
        )
      ),
      weightedScores,
      totalScore: totalScorePct,
      weights: normalizedWeights,
    };
  });

  const defaultCurrency = flightData[0]?.currency || 'USD';
  const currencySymbol =
    defaultCurrency === 'EUR'
      ? '€'
      : defaultCurrency === 'USD'
      ? '$'
      : defaultCurrency;

  const metrics = [
    {
      key: 'actualPrice',
      label: 'Cost',
      format: (val) =>
        `${currencySymbol}${val.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
    },
    {
      key: 'actualDurationHours',
      label: 'Duration (hours)',
      format: (val) => `${val.toFixed(1)}h`,
    },
    {
      key: 'actualStops',
      label: 'Stops',
      format: (val) => (val === 0 ? 'Non-stop' : `${val} stop${val > 1 ? 's' : ''}`),
    },
    {
      key: 'actualConvenience',
      label: 'Convenience',
      format: (val) => `${Math.round(val * 100)}%`,
    },
  ];

  const barData = metrics.map((metric) => {
    const dataPoint = { metric: metric.label };
    flightData.forEach((flight) => {
      const value = flight[metric.key];
      dataPoint[flight.dataKey] = value;
      dataPoint[`${flight.dataKey}_formatted`] = metric.format(value);
      dataPoint[`${flight.dataKey}_label`] = flight.fullName || flight.name;
    });
    return dataPoint;
  });

  const radarMetrics = [
    { key: 'price', label: 'Price' },
    { key: 'duration', label: 'Duration' },
    { key: 'stops', label: 'Stops' },
    { key: 'convenience', label: 'Convenience' },
    { key: 'total', label: 'Value' },
  ];

  const radarData = radarMetrics.map((metric) => {
    const entry = { metric: metric.label };
    flightData.forEach((flight) => {
      entry[flight.dataKey] = Number(
        (flight.weightedScores?.[metric.key] ?? 0).toFixed(2),
      );
      entry[`${flight.dataKey}_label`] = flight.fullName || flight.name;
    });
    return entry;
  });

  return { barData, radarData, flightData, weights: normalizedWeights };
};

// Calculate summary insights for up to 3 flights
const calculateSummary = (flightData, weights) => {
  const insights = [];

  if (!flightData || flightData.length === 0) {
    return insights;
  }

  const normalizedWeights = normalizePreferenceWeights(weights);
  const budgetPct = Math.round(normalizedWeights.budget * 100);
  const qualityPct = Math.round(normalizedWeights.quality * 100);
  const conveniencePct = Math.round(normalizedWeights.convenience * 100);
  const weightSummaryText = formatWeightSummary(normalizedWeights);

  const formatPrice = (price, currency) => {
    const symbol =
      currency === 'EUR'
        ? '€'
        : currency === 'USD'
        ? '$'
        : currency || '€';
    return `${symbol}${price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const sortedByScore = [...flightData].sort(
    (a, b) => (b.totalScore ?? 0) - (a.totalScore ?? 0),
  );
  const topScoring = sortedByScore[0];
  if (topScoring) {
    insights.push({
      type: 'overall',
      icon: '🏆',
      text: `${topScoring.fullName || topScoring.name} leads overall with a ${topScoring.totalScore.toFixed(
        1,
      )}/100 score using your weight mix (${weightSummaryText}).`,
    });
  }

  if (flightData.length > 1) {
    const sortedByPrice = [...flightData].sort((a, b) => a.actualPrice - b.actualPrice);
    const cheapest = sortedByPrice[0];
    if (cheapest) {
      const second = sortedByPrice[1];
      const priceDifference =
        second && second.actualPrice ? second.actualPrice - cheapest.actualPrice : 0;
      insights.push({
        type: 'budget',
        icon: '💰',
        text: `${cheapest.fullName || cheapest.name} keeps costs lowest ${
          priceDifference > 0
            ? `by ${formatPrice(priceDifference, cheapest.currency)}`
            : ''
        }, supporting your ${budgetPct}% budget weight.`,
      });
    }

    const sortedByDuration = [...flightData].sort(
      (a, b) => (a.actualDurationHours ?? 0) - (b.actualDurationHours ?? 0),
    );
    const fastest = sortedByDuration[0];
    if (fastest) {
      const secondFastest = sortedByDuration[1];
      const timeDifference =
        secondFastest && typeof secondFastest.actualDurationHours === 'number'
          ? Math.abs(fastest.actualDurationHours - secondFastest.actualDurationHours)
          : 0;
      insights.push({
        type: 'duration',
        icon: '⚡',
        text: `${fastest.fullName || fastest.name} is the quickest option at ${
          fastest.actualDuration
        }${
          timeDifference > 0
            ? `, trimming ${timeDifference.toFixed(1)} hours compared to the next flight`
            : ''
        } — ideal for your ${conveniencePct}% convenience preference.`,
      });
    }

    const sortedByStops = [...flightData].sort((a, b) => a.actualStops - b.actualStops);
    const leastStops = sortedByStops[0];
    if (leastStops) {
      insights.push({
        type: 'stops',
        icon: '🛬',
        text: `${leastStops.fullName || leastStops.name} ${
          leastStops.actualStops === 0
            ? 'is non-stop'
            : `has ${leastStops.actualStops} stop${leastStops.actualStops > 1 ? 's' : ''}`
        }, aligning with your ${qualityPct}% focus on quality and comfort.`,
      });
    }
  }

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

export function ComparisonModal({
  selectedFlight,
  alternativeFlights = [],
  onClose,
  flights = [],
  preferenceWeights = DEFAULT_PREFERENCE_WEIGHTS,
}) {
  const { barData, radarData, flightData, summary, weights } = useMemo(() => {
    const combinedFlights =
      flights && flights.length > 0
        ? flights
        : [selectedFlight, ...(alternativeFlights || [])];

    if (!combinedFlights || combinedFlights.length === 0) {
      const normalizedWeights = normalizePreferenceWeights(preferenceWeights);
      return { barData: null, radarData: null, flightData: null, summary: [], weights: normalizedWeights };
    }

    const result = prepareComparisonData(combinedFlights, preferenceWeights);
    const summaryInsights = calculateSummary(result.flightData, result.weights);
    return { ...result, summary: summaryInsights };
  }, [flights, selectedFlight, alternativeFlights, preferenceWeights]);

  if (!flightData || flightData.length === 0 || !barData || barData.length === 0) {
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
          padding: '20px',
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
            position: 'relative',
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
              color: '#666',
            }}
          >
            ×
          </button>
          <h2>Flight Information</h2>
          <p>No flights available for comparison.</p>
        </div>
      </div>
    );
  }

  const colors = ['#00ADEF', '#FF6B6B', '#FFC107'];

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
        overflow: 'auto',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '960px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
          position: 'relative',
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
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => (e.target.style.backgroundColor = '#f3f4f6')}
          onMouseLeave={(e) => (e.target.style.backgroundColor = 'transparent')}
        >
          ×
        </button>

        <h2
          style={{
            marginTop: 0,
            marginBottom: '8px',
            fontSize: '24px',
            fontWeight: '600',
            color: '#004C8C',
          }}
        >
          Flight Comparison
        </h2>
        <p
          style={{
            marginTop: 0,
            marginBottom: '24px',
            color: '#666',
            fontSize: '14px',
          }}
        >
          Comparing {flightData.length} flight{flightData.length !== 1 ? 's' : ''} side by
          side
        </p>
        {weights && (
          <p
            style={{
              marginTop: '-16px',
              marginBottom: '24px',
              color: '#475569',
              fontSize: '12px',
            }}
          >
            Weight mix: {formatWeightSummary(weights)}
          </p>
        )}

        {/* Radar Chart */}
        {radarData && radarData.length > 0 && (
          <div
            style={{
              marginBottom: '32px',
              marginLeft: 'auto',
              marginRight: 'auto',
              maxWidth: '700px',
            }}
          >
            <ResponsiveContainer width="100%" height={320}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#cbd5f5" />
                <PolarAngleAxis
                  dataKey="metric"
                  tick={{ fill: '#475569', fontSize: 12 }}
                />
                <PolarRadiusAxis
                  angle={28}
                  domain={[0, 100]}
                  tick={{ fill: '#64748b', fontSize: 10 }}
                />
                {flightData.map((flight, index) => (
                  <Radar
                    key={flight.dataKey}
                    name={flight.fullName || flight.name}
                    dataKey={flight.dataKey}
                    stroke={colors[index % colors.length]}
                    fill={colors[index % colors.length]}
                    fillOpacity={0.25}
                  />
                ))}
                <Legend verticalAlign="bottom" />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Bar Chart */}
        <div
          style={{
            marginBottom: '32px',
            marginLeft: 'auto',
            marginRight: 'auto',
            maxWidth: '820px',
          }}
        >
          <ResponsiveContainer width="100%" height={400}>
            <BarChart
              data={barData}
              layout="vertical"
              margin={{ top: 20, right: 30, left: 140, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="metric"
                tick={{ fill: '#64748b', fontSize: 12 }}
                width={130}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="square" />
              {flightData.map((flight, index) => (
                <Bar
                  key={flight.dataKey}
                  dataKey={flight.dataKey}
                  name={flight.fullName || flight.name}
                  fill={colors[index % colors.length]}
                  radius={[0, 4, 4, 0]}
                >
                  {barData.map((entry, idx) => (
                    <Cell
                      key={`cell-${idx}`}
                      fill={colors[index % colors.length]}
                    />
                  ))}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>

          {/* Flight labels below chart */}
          <div
            style={{
              marginTop: '16px',
              display: 'flex',
              justifyContent: 'center',
              gap: '24px',
              fontSize: '12px',
              flexWrap: 'wrap',
            }}
          >
            {flightData.map((flight, index) => {
              const priceSymbol =
                flight.currency === 'EUR'
                  ? '€'
                  : flight.currency === 'USD'
                  ? '$'
                  : flight.currency || '€';
              return (
                <div
                  key={flight.dataKey}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: colors[index % colors.length],
                  }}
                >
                  <div
                    style={{
                      width: '12px',
                      height: '12px',
                      backgroundColor: colors[index % colors.length],
                      borderRadius: '2px',
                    }}
                  ></div>
                  <div>
                    <div style={{ fontWeight: '600' }}>
                      {flight.fullName || flight.name}
                    </div>
                    <div
                      style={{
                        marginTop: '2px',
                        fontSize: '11px',
                        color: '#64748b',
                      }}
                    >
                      {priceSymbol}
                      {flight.actualPrice.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      • {flight.actualDuration} •{' '}
                      {flight.actualStops === 0
                        ? 'Non-stop'
                        : `${flight.actualStops} stop${
                            flight.actualStops > 1 ? 's' : ''
                          }`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick Insights Section */}
        {summary && summary.length > 0 && (
          <div
            style={{
              marginBottom: '32px',
              padding: '20px',
              backgroundColor: '#f0f9ff',
              borderRadius: '8px',
              border: '1px solid #00ADEF',
            }}
          >
            <h3
              style={{
                marginTop: 0,
                marginBottom: '16px',
                fontSize: '18px',
                fontWeight: '600',
                color: '#004C8C',
              }}
            >
              Quick Insights
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {summary.map((insight, index) => (
                <div
                  key={index}
                  style={{
                    padding: '12px',
                    backgroundColor: 'white',
                    borderRadius: '6px',
                    fontSize: '14px',
                    color: '#1e40af',
                    border: '1px solid #bae6fd',
                  }}
                >
                  <span style={{ fontSize: '18px', marginRight: '10px' }}>
                    {insight.icon}
                  </span>
                  {insight.text}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Detailed Comparison Table */}
        <div style={{ marginTop: '32px' }}>
          <h3
            style={{
              marginBottom: '16px',
              fontSize: '18px',
              fontWeight: '600',
              color: '#004C8C',
            }}
          >
            Detailed Comparison
          </h3>
          <div
            style={{
              maxHeight: '400px',
              overflowY: 'auto',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '14px',
              }}
            >
              <thead
                style={{
                  position: 'sticky',
                  top: 0,
                  backgroundColor: '#f8fafc',
                  zIndex: 10,
                }}
              >
                <tr
                  style={{
                    borderBottom: '2px solid #e2e8f0',
                  }}
                >
                  <th
                    style={{
                      padding: '12px',
                      textAlign: 'left',
                      fontWeight: '600',
                      color: '#004C8C',
                      minWidth: '120px',
                      width: '25%',
                    }}
                  >
                    Item
                  </th>
                  {flightData.map((flight, idx) => (
                    <th
                      key={flight.dataKey}
                      style={{
                        padding: '12px',
                        textAlign: 'center',
                        fontWeight: '600',
                        color: colors[idx % colors.length],
                        minWidth: '150px',
                        width: `${75 / flightData.length}%`,
                      }}
                    >
                      {flight.fullName || flight.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr
                  style={{
                    borderBottom: '1px solid #e2e8f0',
                    backgroundColor: '#ffffff',
                  }}
                >
                  <td style={{ padding: '12px', fontWeight: '500' }}>Price</td>
                  {flightData.map((flight, idx) => {
                    const priceSymbol =
                      flight.currency === 'EUR'
                        ? '€'
                        : flight.currency === 'USD'
                        ? '$'
                        : flight.currency || '€';
                    return (
                      <td
                        key={`${flight.dataKey}-price`}
                        style={{ padding: '12px', textAlign: 'center' }}
                      >
                        {priceSymbol}
                        {flight.actualPrice.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                    );
                  })}
                </tr>
                <tr
                  style={{
                    borderBottom: '1px solid #e2e8f0',
                    backgroundColor: '#f8fafc',
                  }}
                >
                  <td style={{ padding: '12px', fontWeight: '500' }}>Duration</td>
                  {flightData.map((flight, idx) => (
                    <td
                      key={`${flight.dataKey}-duration`}
                      style={{ padding: '12px', textAlign: 'center' }}
                    >
                      {flight.actualDuration}
                    </td>
                  ))}
                </tr>
                <tr
                  style={{
                    borderBottom: '1px solid #e2e8f0',
                    backgroundColor: '#ffffff',
                  }}
                >
                  <td style={{ padding: '12px', fontWeight: '500' }}>Stops</td>
                  {flightData.map((flight, idx) => (
                    <td
                      key={`${flight.dataKey}-stops`}
                      style={{ padding: '12px', textAlign: 'center' }}
                    >
                      {flight.actualStops === 0
                        ? 'Non-stop'
                        : `${flight.actualStops} stop${
                            flight.actualStops > 1 ? 's' : ''
                          }`}
                    </td>
                  ))}
                </tr>
                <tr
                  style={{
                    borderBottom: '1px solid #e2e8f0',
                    backgroundColor: '#f8fafc',
                  }}
                >
                  <td style={{ padding: '12px', fontWeight: '500' }}>Airline</td>
                  {flightData.map((flight, idx) => (
                    <td
                      key={`${flight.dataKey}-airline`}
                      style={{ padding: '12px', textAlign: 'center' }}
                    >
                      {flight.airline}
                    </td>
                  ))}
                </tr>
                <tr
                  style={{
                    borderBottom: '1px solid #e2e8f0',
                    backgroundColor: '#ffffff',
                  }}
                >
                  <td style={{ padding: '12px', fontWeight: '500' }}>
                    Flight Number
                  </td>
                  {flightData.map((flight) => (
                    <td
                      key={`${flight.dataKey}-number`}
                      style={{
                        padding: '12px',
                        textAlign: 'center',
                        fontFamily: 'monospace',
                        fontSize: '13px',
                      }}
                    >
                      {flight.originalFlight?.flightNumber ||
                        flight.fullName?.split(' ').slice(1).join(' ') ||
                        'N/A'}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                  <td style={{ padding: '12px', fontWeight: '500' }}>Weighted Score</td>
                  {flightData.map((flight) => (
                    <td
                      key={`${flight.dataKey}-weighted`}
                      style={{ padding: '12px', textAlign: 'center', fontWeight: 600 }}
                    >
                      {typeof flight.totalScore === 'number' ? `${flight.totalScore.toFixed(1)}/100` : '—'}
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

