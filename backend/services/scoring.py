from __future__ import annotations

from typing import Dict

DEFAULT_WEIGHTS: Dict[str, float] = {
    'budget': 0.33,
    'quality': 0.33,
    'convenience': 0.34,
}


def normalize_weights(weights: Dict[str, float] | None) -> Dict[str, float]:
    """Normalize preference weights so they always sum to 1."""
    if not weights:
        return DEFAULT_WEIGHTS.copy()

    budget = max(float(weights.get('budget', 0.0)), 0.0)
    quality = max(float(weights.get('quality', 0.0)), 0.0)
    convenience = max(float(weights.get('convenience', 0.0)), 0.0)

    total = budget + quality + convenience
    if total <= 0:
        return DEFAULT_WEIGHTS.copy()

    return {
        'budget': budget / total,
        'quality': quality / total,
        'convenience': convenience / total,
    }


def clamp_score(value: float) -> float:
    """Clamp a score into the 0-100 range."""
    return max(0.0, min(float(value), 100.0))


def calculate_total_score(scores: Dict[str, float], weights: Dict[str, float] | None) -> float:
    """Calculate total score by applying normalized weights to 0-100 metrics."""
    normalized_weights = normalize_weights(weights)

    budget_score = clamp_score(scores.get('budget', 0.0))
    quality_score = clamp_score(scores.get('quality', 0.0))
    convenience_score = clamp_score(scores.get('convenience', 0.0))

    total = (
        budget_score * normalized_weights['budget']
        + quality_score * normalized_weights['quality']
        + convenience_score * normalized_weights['convenience']
    )

    return round(total, 2)
