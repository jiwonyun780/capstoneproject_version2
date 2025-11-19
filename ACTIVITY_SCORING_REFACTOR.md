# Activity Scoring Pipeline Refactor

## Overview
Refactored the activity scoring pipeline to ensure user preference weights strongly influence ranking with stronger penalties/boosts for extreme preferences.

## Changes Summary

### 1. Enhanced Weight Logging
**Location**: `backend/main.py`, lines 1690-1706

- Added detailed logging of incoming raw weights before normalization
- Log normalized weights with percentages
- Added explicit flags when extreme preferences are detected (≥0.6)

**Example Log Output**:
```
[ACTIVITY_SCORE] ═══ INCOMING PREFERENCES (context=chat) ═══
[ACTIVITY_SCORE] Raw weights: budget=0.700, quality=0.200, convenience=0.100, total=1.000
[ACTIVITY_SCORE] Normalized weights: budget=0.700 (70.0%), quality=0.200 (20.0%), convenience=0.100 (10.0%)
[ACTIVITY_SCORE] 🔴 HIGH BUDGET PREFERENCE (70.0%) - Will heavily penalize expensive activities
```

### 2. Stronger Weight Influence with Penalties/Boosts
**Location**: `backend/main.py`, lines 1856-1876

#### Budget Preference ≥ 0.6:
- **Penalty**: If activity price is above 75th percentile → reduce score by 60-80%
- **Formula**: `penalty_factor = 1.0 - min(0.8, 0.6 + 0.2 * ((price - p75_price) / (max_price - p75_price + 1)))`
- **Effect**: Expensive activities get heavily penalized when user prioritizes budget

#### Quality Preference ≥ 0.6:
- **Boost**: If rating ≥ 4.5 → boost score by 20-40%
- **Penalty**: If rating < 4.0 → reduce score by 30-50%
- **Formula (Boost)**: `boost_factor = 1.0 + min(0.4, 0.2 + 0.2 * ((rating - 4.5) / 0.5))`
- **Formula (Penalty)**: `penalty_factor = 1.0 - min(0.5, 0.3 + 0.2 * ((4.0 - rating) / 2.0))`
- **Effect**: High-rated activities get aggressive boosts, low-rated ones get heavy penalties

#### Convenience Preference ≥ 0.6:
- **Boost**: If duration is below 25th percentile → boost score by 20-40%
- **Penalty**: If duration is above 75th percentile → reduce score by 30-50%
- **Formula (Boost)**: `boost_factor = 1.0 + min(0.4, 0.2 + 0.2 * ((p25_duration - duration) / (p25_duration + 0.1)))`
- **Formula (Penalty)**: `penalty_factor = 1.0 - min(0.5, 0.3 + 0.2 * ((duration - p75_duration) / (max_duration - p75_duration + 0.1)))`
- **Effect**: Short activities get prioritized, long activities get penalized

### 3. Comprehensive Debug Logging
**Location**: `backend/main.py`, lines 1891-1920

- Logs top 10 activities after scoring
- Shows individual scores (budget_score, quality_score, convenience_score)
- Shows weighted contributions: `budget_score * budget_weight`, etc.
- Shows raw values (price, rating, duration)
- Shows final total_score

**Example Log Output**:
```
[ACTIVITY_SCORE] ═══ TOP 10 ACTIVITIES (sorted by total_score DESC) ═══
[ACTIVITY_SCORE] #1: Sagrada Familia Tour | Total=78.50 | Budget=85.20*0.70=59.64 | Quality=96.00*0.20=19.20 | Convenience=90.00*0.10=9.00 | Price=$50 Rating=4.8 Duration=PT1H30M
[ACTIVITY_SCORE] #2: Park Güell Admission | Total=72.30 | Budget=92.10*0.70=64.47 | Quality=92.00*0.20=18.40 | Convenience=85.00*0.10=8.50 | Price=$12 Rating=4.6 Duration=PT2H
...
```

### 4. Guaranteed Scoring Formula
**Location**: `backend/main.py`, line 1878-1883

The scoring ALWAYS uses:
```python
total_score = (
    budget_score * budget_weight +
    quality_score * quality_weight +
    convenience_score * convenience_weight
)
```

This formula is applied after normalization and any penalties/boosts.

### 5. Strict Sorting
**Location**: `backend/main.py`, line 1891

Activities are sorted **strictly by total_score DESC**:
```python
activities.sort(key=lambda x: (x.get('long_tour', False), -x.get('total_score', 0)))
```

- Regular activities (not long_tour) are sorted by total_score descending
- Long tours are placed after regular activities, also sorted by total_score descending

## How Scoring Behaves for Extreme Preferences

### Example 1: High Budget Preference (Budget=70%, Quality=20%, Convenience=10%)

**Scenario**: User strongly prioritizes budget-friendly activities

**Behavior**:
1. Raw weights normalized: budget=0.70, quality=0.20, convenience=0.10
2. Activities above 75th percentile price get 60-80% penalty on budget_score
3. Budget_score has 70% weight in total_score calculation
4. Result: Cheap activities rank much higher, expensive ones rank lower

**Example**:
- Activity A: $12, Rating=4.6, Duration=2h → Budget=92 (high), Total=78
- Activity B: $150, Rating=4.9, Duration=1h → Budget=20 (penalized), Total=45

### Example 2: High Quality Preference (Budget=10%, Quality=80%, Convenience=10%)

**Scenario**: User strongly prioritizes high-rated experiences

**Behavior**:
1. Raw weights normalized: budget=0.10, quality=0.80, convenience=0.10
2. Activities with rating ≥ 4.5 get 20-40% boost on quality_score
3. Activities with rating < 4.0 get 30-50% penalty on quality_score
4. Quality_score has 80% weight in total_score calculation
5. Result: Highly-rated activities dominate rankings

**Example**:
- Activity A: $75, Rating=4.9, Duration=3h → Quality=98 (boosted), Total=82
- Activity B: $30, Rating=3.2, Duration=2h → Quality=25 (penalized), Total=28

### Example 3: High Convenience Preference (Budget=20%, Quality=10%, Convenience=70%)

**Scenario**: User strongly prioritizes short, convenient activities

**Behavior**:
1. Raw weights normalized: budget=0.20, quality=0.10, convenience=0.70
2. Activities below 25th percentile duration get 20-40% boost on convenience_score
3. Activities above 75th percentile duration get 30-50% penalty on convenience_score
4. Convenience_score has 70% weight in total_score calculation
5. Result: Short activities rank much higher

**Example**:
- Activity A: $45, Rating=4.5, Duration=1h → Convenience=95 (boosted), Total=76
- Activity B: $35, Rating=4.8, Duration=6h → Convenience=15 (penalized), Total=25

## Data Flow

1. **Frontend** (`src/pages/Chat.jsx`):
   - User sets preferences in preference page
   - Preferences stored as: `{ preferences: { budget, quality, convenience } }`
   - Sent to backend in API request: `requestBody.preferences = preferences.preferences`

2. **Backend** (`backend/main.py`, `/api/chat` endpoint):
   - Receives `req.preferences` dict with `{ budget, quality, convenience }`
   - Passes to `apply_preference_filters_to_activities()` function

3. **Scoring Function** (`backend/main.py`, `apply_preference_filters_to_activities`):
   - Normalizes preferences
   - Normalizes activity metrics (price → 0-100, rating → 0-100, duration → 0-100)
   - Applies penalties/boosts based on extreme preferences
   - Calculates total_score using weighted formula
   - Sorts by total_score DESC
   - Returns sorted activities with scores

## Verification Points

✅ **Preferences passed from frontend**: Verified in `src/pages/Chat.jsx:133-138`
✅ **Preferences received in backend**: Logged in `backend/main.py:2510, 3163-3176`
✅ **Weights extracted correctly**: Logged in `backend/main.py:1700-1703`
✅ **Scoring formula always used**: Confirmed in `backend/main.py:1878-1883`
✅ **Normalization happens first**: Done before scoring in `backend/main.py:1759-1772`
✅ **Sorting by total_score DESC**: Confirmed in `backend/main.py:1891`
✅ **Debug logs show top 10**: Implemented in `backend/main.py:1901-1920`

## Files Modified

1. `backend/main.py`:
   - Enhanced preference logging (lines 1690-1706)
   - Added penalties/boosts for extreme preferences (lines 1856-1876)
   - Added comprehensive debug logging (lines 1891-1920)

## Testing

To verify the changes:

1. **Set extreme preference** (e.g., Budget=80%, Quality=10%, Convenience=10%)
2. **Search for activities**
3. **Check backend logs** for:
   - Incoming preferences
   - Normalized weights
   - Top 10 scored activities
   - Individual scores and weighted contributions
4. **Verify results** are sorted by user's preference (cheap activities first)

## Next Steps (Optional)

- Add distance-from-center calculation for convenience_score
- Add user feedback mechanism to tune penalty/boost factors
- Consider machine learning to optimize weights based on user selections

