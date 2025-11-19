import React, { useState } from 'react';

const TripPreferencesForm = ({ onComplete }) => {
  const [budget, setBudget] = useState(3);
  const [quality, setQuality] = useState(3);
  const [convenience, setConvenience] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const normalizeWeights = (budgetVal, qualityVal, convenienceVal) => {
    const total = budgetVal + qualityVal + convenienceVal;
    if (total === 0) return { budget: 0.33, quality: 0.33, convenience: 0.34 };
    return {
      budget: budgetVal / total,
      quality: qualityVal / total,
      convenience: convenienceVal / total
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log('[TripPreferencesForm] Form submitted with values:', { budget, quality, convenience });
    setLoading(true);
    setError(null);

    const weights = normalizeWeights(budget, quality, convenience);
    console.log('[TripPreferencesForm] Normalized weights:', weights);

    try {
      // Immediately save preferences and start chat - no need to call optimizeTrip API
      // Trip optimization will happen later when user provides destination details
      if (onComplete) {
        const preferencesData = {
          preferences: weights,
          rawValues: { budget, quality, convenience }
        };
        console.log('[TripPreferencesForm] Calling onComplete with:', preferencesData);
        onComplete(preferencesData);
        console.log('[TripPreferencesForm] onComplete called successfully');
      } else {
        console.error('[TripPreferencesForm] ⚠️ onComplete is not defined!');
      }
    } catch (err) {
      console.error('[TripPreferencesForm] Error saving preferences:', err);
      setError(err.message || 'Failed to save preferences. Please try again.');
      setLoading(false);
    }
    // Note: We don't set loading to false here because onComplete will navigate away
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
        Let’s plan a new trip! What matters most to you?
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
                {(normalizeWeights(budget, quality, convenience).budget * 100).toFixed(1)}%
              </span>
            </div>
            <div>
              <span style={{ color: '#004C8C', fontWeight: 500 }}>Quality: </span>
              <span style={{ color: '#00ADEF', fontWeight: 600 }}>
                {(normalizeWeights(budget, quality, convenience).quality * 100).toFixed(1)}%
              </span>
            </div>
            <div>
              <span style={{ color: '#004C8C', fontWeight: 500 }}>Convenience: </span>
              <span style={{ color: '#00ADEF', fontWeight: 600 }}>
                {(normalizeWeights(budget, quality, convenience).convenience * 100).toFixed(1)}%
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
          {loading ? 'Starting...' : 'Continue to Chat'}
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
    </div>
  );
};

export default TripPreferencesForm;
