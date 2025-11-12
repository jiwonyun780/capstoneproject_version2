import React, { useMemo, useState } from 'react';
import {
  normalizePreferenceWeights,
  storePreferenceWeights,
} from '../utils/preferences';

const TripPreferencesForm = ({ onComplete, defaultRawValues }) => {
  const initialBudget = defaultRawValues?.budget ?? 3;
  const initialQuality = defaultRawValues?.quality ?? 3;
  const initialConvenience = defaultRawValues?.convenience ?? 3;

  const [budget, setBudget] = useState(initialBudget);
  const [quality, setQuality] = useState(initialQuality);
  const [convenience, setConvenience] = useState(initialConvenience);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const currentWeights = useMemo(
    () => normalizePreferenceWeights({ budget, quality, convenience }),
    [budget, quality, convenience],
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResults(null);

    const weights = normalizePreferenceWeights({ budget, quality, convenience });

    try {
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const base = isLocalhost 
        ? 'http://localhost:8000'
        : (process.env.REACT_APP_API_BASE || 'http://localhost:8000');

      console.log('Sending trip optimization request to:', `${base}/api/optimizeTrip`);
      console.log('Request payload:', weights);

      const response = await fetch(`${base}/api/optimizeTrip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(weights),
      });

      console.log('Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`Server error: ${response.status} - ${errorText || 'Unknown error'}`);
      }

      const data = await response.json();
      console.log('Trip optimization response:', data);
      setResults(data);
      storePreferenceWeights(weights, { budget, quality, convenience });
      
      // Call onComplete callback with preferences
      if (onComplete) {
        onComplete({
          weights,
          rawValues: { budget, quality, convenience },
        });
      }
    } catch (err) {
      console.error('Error optimizing trip:', err);
      if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
        setError('Cannot connect to server. Please make sure the backend server is running on http://localhost:8000');
      } else {
        setError(err.message || 'Failed to generate trip recommendations. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      maxWidth: '800px', 
      margin: '0 auto', 
      padding: '32px',
      background: 'white',
      borderRadius: '12px',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
    }}>
      <h2 style={{ 
        fontSize: '28px', 
        fontWeight: 600, 
        color: '#004C8C',
        marginBottom: '8px',
        textAlign: 'center'
      }}>
        Tell us what matters most so we can personalize your trip.
      </h2>
      <p style={{ 
        fontSize: '16px', 
        color: '#64748b', 
        textAlign: 'center',
        marginBottom: '32px'
      }}>
        Rank each preference from 1 (least important) to 5 (most important)
      </p>

      <form onSubmit={handleSubmit}>
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
              fontWeight: 500, 
              color: '#004C8C'
            }}>
              Budget
            </label>
            <span style={{ 
              fontSize: '20px', 
              fontWeight: 600, 
              color: '#00ADEF',
              minWidth: '30px',
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
              height: '8px',
              borderRadius: '4px',
              background: `linear-gradient(to right, #00ADEF 0%, #00ADEF ${((budget - 1) / 4) * 100}%, #EAF9FF ${((budget - 1) / 4) * 100}%, #EAF9FF 100%)`,
              outline: 'none',
              WebkitAppearance: 'none',
              cursor: 'pointer',
            }}
          />
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            fontSize: '12px',
            color: '#64748b',
            marginTop: '4px'
          }}>
            <span>Least Important</span>
            <span>Most Important</span>
          </div>
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
              fontWeight: 500, 
              color: '#004C8C'
            }}>
              Quality
            </label>
            <span style={{ 
              fontSize: '20px', 
              fontWeight: 600, 
              color: '#00ADEF',
              minWidth: '30px',
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
              height: '8px',
              borderRadius: '4px',
              background: `linear-gradient(to right, #00ADEF 0%, #00ADEF ${((quality - 1) / 4) * 100}%, #EAF9FF ${((quality - 1) / 4) * 100}%, #EAF9FF 100%)`,
              outline: 'none',
              WebkitAppearance: 'none',
              cursor: 'pointer',
            }}
          />
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            fontSize: '12px',
            color: '#64748b',
            marginTop: '4px'
          }}>
            <span>Least Important</span>
            <span>Most Important</span>
          </div>
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
              fontWeight: 500, 
              color: '#004C8C'
            }}>
              Convenience
            </label>
            <span style={{ 
              fontSize: '20px', 
              fontWeight: 600, 
              color: '#00ADEF',
              minWidth: '30px',
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
              height: '8px',
              borderRadius: '4px',
              background: `linear-gradient(to right, #00ADEF 0%, #00ADEF ${((convenience - 1) / 4) * 100}%, #EAF9FF ${((convenience - 1) / 4) * 100}%, #EAF9FF 100%)`,
              outline: 'none',
              WebkitAppearance: 'none',
              cursor: 'pointer',
            }}
          />
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            fontSize: '12px',
            color: '#64748b',
            marginTop: '4px'
          }}>
            <span>Least Important</span>
            <span>Most Important</span>
          </div>
        </div>

        {/* Weight Display */}
        <div style={{ 
          marginBottom: '32px',
          padding: '16px',
          background: '#EAF9FF',
          borderRadius: '8px'
        }}>
          <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>
            Normalized Weights:
          </div>
          <div style={{ display: 'flex', gap: '24px', fontSize: '16px' }}>
            <div>
              <span style={{ color: '#004C8C', fontWeight: 500 }}>Budget: </span>
              <span style={{ color: '#00ADEF', fontWeight: 600 }}>
                {(currentWeights.budget * 100).toFixed(1)}%
              </span>
            </div>
            <div>
              <span style={{ color: '#004C8C', fontWeight: 500 }}>Quality: </span>
              <span style={{ color: '#00ADEF', fontWeight: 600 }}>
                {(currentWeights.quality * 100).toFixed(1)}%
              </span>
            </div>
            <div>
              <span style={{ color: '#004C8C', fontWeight: 500 }}>Convenience: </span>
              <span style={{ color: '#00ADEF', fontWeight: 600 }}>
                {(currentWeights.convenience * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '16px',
            fontSize: '18px',
            fontWeight: 600,
            color: 'white',
            background: loading ? '#94a3b8' : '#00ADEF',
            border: 'none',
            borderRadius: '8px',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s',
          }}
          onMouseOver={(e) => {
            if (!loading) e.target.style.background = '#0099CC';
          }}
          onMouseOut={(e) => {
            if (!loading) e.target.style.background = '#00ADEF';
          }}
        >
          {loading ? 'Generating Your Trip...' : 'Generate My Trip'}
        </button>

        {error && (
          <div style={{
            marginTop: '16px',
            padding: '12px',
            background: '#fee2e2',
            color: '#dc2626',
            borderRadius: '8px',
            fontSize: '14px'
          }}>
            {error}
          </div>
        )}
      </form>

      {/* Results Display */}
      {results && results.options && results.options.length > 0 && (
        <div style={{ marginTop: '32px' }}>
          <h3 style={{ 
            fontSize: '24px', 
            fontWeight: 600, 
            color: '#004C8C',
            marginBottom: '24px',
            textAlign: 'center'
          }}>
            Top Trip Recommendations
          </h3>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '16px'
          }}>
            {results.options.map((option, index) => (
              <div
                key={index}
                style={{
                  padding: '20px',
                  background: '#ffffff',
                  border: '2px solid #EAF9FF',
                  borderRadius: '12px',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
                }}
              >
                <div style={{ 
                  fontSize: '14px', 
                  fontWeight: 600, 
                  color: '#00ADEF',
                  marginBottom: '8px'
                }}>
                  #{index + 1} Recommendation
                </div>
                <h4 style={{ 
                  fontSize: '20px', 
                  fontWeight: 600, 
                  color: '#004C8C',
                  marginBottom: '16px'
                }}>
                  {option.destination}
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b', fontSize: '14px' }}>Price:</span>
                    <span style={{ color: '#004C8C', fontWeight: 600 }}>${option.price.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b', fontSize: '14px' }}>Rating:</span>
                    <span style={{ color: '#004C8C', fontWeight: 600 }}>
                      {'★'.repeat(Math.round(option.rating))}
                      {'☆'.repeat(5 - Math.round(option.rating))} {option.rating.toFixed(1)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b', fontSize: '14px' }}>Travel Time:</span>
                    <span style={{ color: '#004C8C', fontWeight: 600 }}>{option.travelTime}h</span>
                  </div>
                  <div style={{ 
                    marginTop: '12px',
                    padding: '8px',
                    background: '#EAF9FF',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: '#004C8C',
                    textAlign: 'center',
                    fontWeight: 500
                  }}>
                    Score: {option.score.toFixed(1)}/100
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TripPreferencesForm;
