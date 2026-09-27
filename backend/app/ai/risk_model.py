"""Stunting risk classifier (classify() in the class diagram).

A Random Forest (Breiman, 2001) classifies each child as low / medium / high risk from
anthropometry, growth velocity, illness, diet and household/regional context. Because no
public child-level microdata is available, the model is trained on a synthetic cohort whose
distributions mirror a rural East Nusa Tenggara posyandu (as described in Chapter IV). Swap in
real, consented data with `train(X, y)` when available.

Every prediction ships with:
  * class probabilities and confidence,
  * per-feature contributions (perturbation against a healthy reference child),
  * clinical guardrails (WHO cut-offs / danger signs) that can only raise the risk level,
  * a needs_review flag for the human-in-the-loop step.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

log = logging.getLogger(__name__)

LABELS = ["low", "medium", "high"]
MODEL_VERSION = "rf-1.0"

# (name, healthy reference value used for explanations)
FEATURES: list[tuple[str, float]] = [
    ("age_months", 24.0),
    ("sex_male", 0.5),
    ("haz", 0.0),
    ("waz", 0.0),
    ("whz", 0.0),
    ("haz_velocity", 0.0),  # change in HAZ per month over recent measurements
    ("waz_velocity", 0.0),
    ("diarrhea", 0.0),
    ("fever", 0.0),
    ("respiratory", 0.0),
    ("repeated_infection", 0.0),  # >= 2 illness reports in the last 90 days
    ("poor_appetite", 0.0),
    ("dietary_diversity", 5.0),  # WHO food groups eaten per day (0-8)
    ("animal_protein_days", 5.0),  # days per week with animal-source food
    ("clean_water", 1.0),
    ("sanitation", 1.0),
    ("low_birth_weight", 0.0),
    ("rural", 0.0),
    ("regional_prevalence", 14.2),  # % stunting in region (national 2029 target as reference)
]
FEATURE_NAMES = [f for f, _ in FEATURES]
REFERENCE = np.array([v for _, v in FEATURES], dtype=float)
RISK_WEIGHTS = np.array([0.0, 0.5, 1.0])  # score = 0.5 * P(medium) + P(high)


def _latent_risk(X: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    f = {name: X[:, i] for i, name in enumerate(FEATURE_NAMES)}
    s = (
        1.6 * np.clip(-f["haz"] - 1, 0, None)
        + 1.1 * np.clip(-f["whz"] - 1, 0, None)
        + 0.6 * np.clip(-f["waz"] - 1, 0, None)
        + 12.0 * np.clip(-f["haz_velocity"], 0, None)
        + 6.0 * np.clip(-f["waz_velocity"], 0, None)
        + 0.55 * f["diarrhea"]
        + 0.3 * f["fever"]
        + 0.2 * f["respiratory"]
        + 0.6 * f["repeated_infection"]
        + 0.5 * f["poor_appetite"]
        + 0.25 * np.clip(4 - f["dietary_diversity"], 0, None)
        + 0.15 * np.clip(3 - f["animal_protein_days"], 0, None)
        + 0.3 * (1 - f["clean_water"])
        + 0.3 * (1 - f["sanitation"])
        + 0.35 * f["low_birth_weight"]
        + 0.012 * (f["regional_prevalence"] - 20)
    )
    return s + rng.normal(0, 0.3, len(s))


def _label(X: np.ndarray, s: np.ndarray) -> np.ndarray:
    haz, whz = X[:, FEATURE_NAMES.index("haz")], X[:, FEATURE_NAMES.index("whz")]
    y = np.where(s < 2.2, 0, np.where(s < 4.4, 1, 2))
    y = np.where(haz < -2, np.maximum(y, 1), y)
    y = np.where((haz < -3) | (whz < -3), 2, y)
    return y


def generate_synthetic_cohort(n: int = 6000, seed: int = 42) -> tuple[np.ndarray, np.ndarray]:
    """Synthetic under-5 cohort resembling rural NTT (mean HAZ about -1.4, ~35% stunted)."""
    rng = np.random.default_rng(seed)
    age = rng.uniform(0, 60, n)
    sex = rng.integers(0, 2, n).astype(float)
    rural = (rng.random(n) < 0.8).astype(float)
    prevalence = np.where(rural == 1, rng.normal(35, 6, n), rng.normal(22, 5, n)).clip(8, 55)
    water = (rng.random(n) < np.where(rural == 1, 0.62, 0.9)).astype(float)
    sanitation = (rng.random(n) < np.where(rural == 1, 0.55, 0.88)).astype(float)
    lbw = (rng.random(n) < 0.12).astype(float)
    diversity = np.clip(np.round(rng.normal(4.2, 1.5, n) - (1 - water) * 0.5), 0, 8)
    protein = np.clip(np.round(rng.normal(3.5, 2.0, n) + (diversity - 4) * 0.4), 0, 7)

    # Anthropometry depends on the household context so the classifier has real signal to learn.
    env = 0.35 * (1 - water) + 0.35 * (1 - sanitation) + 0.5 * lbw + 0.15 * (4 - diversity) + 0.01 * (prevalence - 25)
    haz = rng.normal(-0.9, 1.05, n) - env * 0.9 - (age / 60) * 0.5
    whz = rng.normal(-0.3, 1.0, n) - env * 0.4
    waz = 0.6 * haz + 0.55 * whz + rng.normal(0, 0.35, n)
    haz_vel = rng.normal(-0.01, 0.035, n) - env * 0.012
    waz_vel = rng.normal(-0.005, 0.04, n) - env * 0.01
    ill_p = 0.12 + 0.12 * (1 - water) + 0.1 * (1 - sanitation)
    diarrhea = (rng.random(n) < ill_p).astype(float)
    fever = (rng.random(n) < ill_p + 0.05).astype(float)
    respiratory = (rng.random(n) < 0.18).astype(float)
    repeated = (rng.random(n) < ill_p * 0.8).astype(float)
    appetite = (rng.random(n) < 0.1 + 0.25 * diarrhea + 0.15 * fever).astype(float)

    X = np.column_stack([
        age, sex, haz.clip(-5.5, 3.5), waz.clip(-5.5, 3.5), whz.clip(-5, 4), haz_vel, waz_vel,
        diarrhea, fever, respiratory, repeated, appetite, diversity, protein, water, sanitation, lbw, rural, prevalence,
    ])
    y = _label(X, _latent_risk(X, rng))
    return X, y


def _metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1, 2])
    high_total = int((y_true == 2).sum())
    high_missed = int(((y_true == 2) & (y_pred != 2)).sum())
    return {
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
        "precision_macro": round(float(precision_score(y_true, y_pred, average="macro", zero_division=0)), 4),
        "recall_macro": round(float(recall_score(y_true, y_pred, average="macro", zero_division=0)), 4),
        "f1_macro": round(float(f1_score(y_true, y_pred, average="macro", zero_division=0)), 4),
        "per_class": {
            LABELS[i]: {
                "precision": round(float(p), 4),
                "recall": round(float(r), 4),
                "f1": round(float(f), 4),
            }
            for i, (p, r, f) in enumerate(zip(
                precision_score(y_true, y_pred, average=None, labels=[0, 1, 2], zero_division=0),
                recall_score(y_true, y_pred, average=None, labels=[0, 1, 2], zero_division=0),
                f1_score(y_true, y_pred, average=None, labels=[0, 1, 2], zero_division=0),
            ))
        },
        "false_negative_rate_high": round(high_missed / high_total, 4) if high_total else 0.0,
        "confusion_matrix": {"labels": LABELS, "matrix": cm.tolist()},
    }


@dataclass
class TrainResult:
    model: RandomForestClassifier
    metrics: dict
    feature_importances: dict
    n_samples: int


def train(X: np.ndarray | None = None, y: np.ndarray | None = None, seed: int = 42) -> TrainResult:
    if X is None or y is None:
        X, y = generate_synthetic_cohort(seed=seed)
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, stratify=y, random_state=seed)

    rf = RandomForestClassifier(
        n_estimators=250, max_depth=12, min_samples_leaf=3, class_weight="balanced", random_state=seed, n_jobs=-1
    )
    rf.fit(X_tr, y_tr)
    metrics = _metrics(y_te, rf.predict(X_te))
    cv = cross_val_score(rf, X, y, cv=StratifiedKFold(5, shuffle=True, random_state=seed), scoring="f1_macro", n_jobs=-1)
    metrics["cv_f1_macro_mean"] = round(float(cv.mean()), 4)
    metrics["cv_f1_macro_std"] = round(float(cv.std()), 4)

    baseline = make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000, class_weight="balanced"))
    baseline.fit(X_tr, y_tr)
    base_m = _metrics(y_te, baseline.predict(X_te))
    metrics["baseline_logistic_regression"] = {k: base_m[k] for k in ("accuracy", "f1_macro", "false_negative_rate_high")}
    metrics["class_distribution"] = {LABELS[i]: int((y == i).sum()) for i in range(3)}
    metrics["test_size"] = int(len(y_te))

    importances = {name: round(float(v), 4) for name, v in zip(FEATURE_NAMES, rf.feature_importances_)}
    importances = dict(sorted(importances.items(), key=lambda kv: -kv[1]))
    return TrainResult(model=rf, metrics=metrics, feature_importances=importances, n_samples=int(len(y)))


@dataclass
class Prediction:
    risk_level: str
    model_level: str
    probabilities: dict
    confidence: float
    contributions: list[dict] = field(default_factory=list)
    guardrail: str | None = None
    needs_review: bool = False


class RiskModel:
    def __init__(self, model: RandomForestClassifier, model_run_id: int | None = None):
        model.n_jobs = 1  # single-row inference is faster without the thread pool
        self.model = model
        self.model_run_id = model_run_id

    @classmethod
    def load(cls, path: Path, model_run_id: int | None = None) -> "RiskModel":
        return cls(joblib.load(path), model_run_id)

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self.model, path)

    @staticmethod
    def vectorize(features: dict) -> np.ndarray:
        return np.array([float(features.get(name, ref)) for name, ref in FEATURES], dtype=float)

    def _score(self, X: np.ndarray) -> np.ndarray:
        return self.model.predict_proba(X) @ RISK_WEIGHTS

    def predict(self, features: dict, danger_signs: list[str] | None = None, review_threshold: float = 0.6) -> Prediction:
        x = self.vectorize(features)
        proba = self.model.predict_proba(x.reshape(1, -1))[0]
        model_idx = int(np.argmax(proba))
        level_idx = model_idx

        # Explanation: how much each feature moves the risk score relative to a healthy reference child.
        perturbed = np.repeat(x.reshape(1, -1), len(FEATURES), axis=0)
        for i in range(len(FEATURES)):
            if FEATURE_NAMES[i] not in ("age_months", "sex_male"):
                perturbed[i, i] = REFERENCE[i]
        base = float(self._score(x.reshape(1, -1))[0])
        deltas = base - self._score(perturbed)
        contributions = [
            {"feature": FEATURE_NAMES[i], "value": round(float(x[i]), 3), "contribution": round(float(deltas[i]), 4)}
            for i in np.argsort(-np.abs(deltas))
            if abs(deltas[i]) >= 0.01
        ][:8]

        # Clinical guardrails: WHO cut-offs and IMCI danger signs can raise, never lower, the level.
        guardrail = None
        haz, whz = features.get("haz"), features.get("whz")
        if danger_signs:
            guardrail, level_idx = "danger_signs_present", 2
        elif (haz is not None and haz < -3) or (whz is not None and whz < -3):
            guardrail, level_idx = "severe_stunting_or_wasting", 2
        elif haz is not None and haz < -2 and level_idx < 1:
            guardrail, level_idx = "stunted_minimum_medium", 1

        confidence = float(proba[model_idx])
        needs_review = confidence < review_threshold or (guardrail is not None and level_idx != model_idx)
        return Prediction(
            risk_level=LABELS[level_idx],
            model_level=LABELS[model_idx],
            probabilities={LABELS[i]: round(float(p), 4) for i, p in enumerate(proba)},
            confidence=round(confidence, 4),
            contributions=contributions,
            guardrail=guardrail,
            needs_review=needs_review,
        )
