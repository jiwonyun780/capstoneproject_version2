const DEFAULT_WEIGHTS = { budget: 0.33, quality: 0.33, convenience: 0.34 };

export const PREFERENCE_WEIGHTS_KEY = 'sta_preference_weights';
export const PREFERENCE_RAW_KEY = 'sta_preference_raw';

const clamp = (value, min = 0, max = 1) => {
  if (Number.isNaN(value) || value === null || value === undefined) {
    return 0;
  }
  return Math.min(Math.max(Number(value), min), max);
};

export const normalizePreferenceWeights = (input) => {
  if (!input || typeof input !== 'object') {
    return { ...DEFAULT_WEIGHTS };
  }

  const raw = {
    budget: clamp(input.budget, 0, Number.MAX_SAFE_INTEGER),
    quality: clamp(input.quality, 0, Number.MAX_SAFE_INTEGER),
    convenience: clamp(input.convenience, 0, Number.MAX_SAFE_INTEGER),
  };

  const total = raw.budget + raw.quality + raw.convenience;

  if (!total) {
    return { ...DEFAULT_WEIGHTS };
  }

  return {
    budget: raw.budget / total,
    quality: raw.quality / total,
    convenience: raw.convenience / total,
  };
};

export const loadPreferenceWeights = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = window.sessionStorage.getItem(PREFERENCE_WEIGHTS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return normalizePreferenceWeights(parsed);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[preferences] Unable to read session weights', err);
  }

  try {
    const legacy = window.localStorage.getItem('travelPreferences');
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (parsed?.preferences) {
        return normalizePreferenceWeights(parsed.preferences);
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[preferences] Unable to read legacy preferences', err);
  }

  return null;
};

export const loadRawPreferenceValues = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = window.sessionStorage.getItem(PREFERENCE_RAW_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[preferences] Unable to read raw preference values', err);
  }

  return null;
};

export const storePreferenceWeights = (weights, rawValues) => {
  if (typeof window === 'undefined') {
    return;
  }

  const normalized = normalizePreferenceWeights(weights);

  try {
    window.sessionStorage.setItem(PREFERENCE_WEIGHTS_KEY, JSON.stringify(normalized));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[preferences] Unable to persist weights to sessionStorage', err);
  }

  if (rawValues) {
    try {
      window.sessionStorage.setItem(PREFERENCE_RAW_KEY, JSON.stringify(rawValues));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[preferences] Unable to persist raw values to sessionStorage', err);
    }
  }

  try {
    window.localStorage.setItem('travelPreferences', JSON.stringify({ preferences: normalized }));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[preferences] Unable to persist weights to localStorage', err);
  }
};

export const formatWeightSummary = (weights) => {
  const normalized = normalizePreferenceWeights(weights);
  return `Budget ${(normalized.budget * 100).toFixed(0)}%, Quality ${(normalized.quality * 100).toFixed(
    0,
  )}%, Convenience ${(normalized.convenience * 100).toFixed(0)}%`;
};

export const DEFAULT_PREFERENCE_WEIGHTS = { ...DEFAULT_WEIGHTS };

