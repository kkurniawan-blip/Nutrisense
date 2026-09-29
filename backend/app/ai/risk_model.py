"""Stunting risk classifier (classify() in the class diagram).

A Random Forest (Breiman, 2001) predicts each child's risk of becoming (or staying) stunted as
low / medium / high from factors that come BEFORE the child's size: birth, feeding, illness,
diet, immunisation, the mother and the household. The child's height, and z-scores in general,
are deliberately NOT inputs: stunting is defined by height-for-age, so a model fed with height
would only re-read the answer. The child's current WHO status is shown separately, from the
measurement itself, and clinical guardrails (WHO cut-offs, danger signs) can raise, never
lower, the model's level. Regional prevalence is not an input either: a child's risk should come
from the child's own situation, not from where the family lives.

Because no public child-level microdata is available, the model is trained on a synthetic cohort
whose distributions mirror a rural East Nusa Tenggara posyandu (Chapter IV). All metrics are
therefore demo metrics. Swap in real, consented data with `train(X, y)` when available.

Every prediction ships with:
  * class probabilities and confidence,
  * per-feature contributions (perturbation against a healthy reference child),
  * clinical guardrails that can only raise the risk level,
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
MODEL_VERSION = "rf-2.0"

# (name, healthy reference value used for explanations and for unknown values)
FEATURES: list[tuple[str, float]] = [
    ("age_months", 24.0),
    ("sex_male", 0.5),
    ("low_birth_weight", 0.0),  # < 2.5 kg
    ("premature", 0.0),  # born before 37 weeks
    ("exclusive_breastfeeding", 1.0),  # ASI only for the first 6 months
    ("weight_not_gaining", 0.0),  # weighings in a row below the minimum gain (KBM): 0, 1 or 2 (2T)
    ("diarrhea", 0.0),
    ("fever", 0.0),
    ("respiratory", 0.0),
    ("repeated_infection", 0.0),  # >= 2 illness reports in the last 90 days
    ("poor_appetite", 0.0),
    ("dietary_diversity", 5.0),  # WHO food groups eaten per day (0-8)
    ("animal_protein_days", 5.0),  # days per week with animal-source food
    ("immunization_complete", 1.0),  # every vaccine due for the age is given
    ("mother_short", 0.0),  # mother's height < 150 cm
    ("mother_kek", 0.0),  # mother had KEK (LiLA < 23.5 cm) in pregnancy
    ("clean_water", 1.0),
    ("sanitation", 1.0),
    ("rural", 0.0),
]
FEATURE_NAMES = [f for f, _ in FEATURES]
REFERENCE = np.array([v for _, v in FEATURES], dtype=float)
RISK_WEIGHTS = np.array([0.0, 0.5, 1.0])  # score = 0.5 * P(medium) + P(high)
# Never model inputs: the outcome itself and area-level figures.
EXCLUDED_INPUTS = {"haz", "waz", "whz", "height_cm", "haz_velocity", "waz_velocity", "regional_prevalence"}


def _latent_risk(X: np.ndarray) -> np.ndarray:
    f = {name: X[:, i] for i, name in enumerate(FEATURE_NAMES)}
    return (
        0.9 * f["low_birth_weight"]
        + 0.6 * f["premature"]
        + 0.5 * (1 - f["exclusive_breastfeeding"])
        + 0.75 * f["weight_not_gaining"]
        + 0.5 * f["diarrhea"]
        + 0.25 * f["fever"]
        + 0.2 * f["respiratory"]
        + 0.55 * f["repeated_infection"]
        + 0.4 * f["poor_appetite"]
        + 0.3 * np.clip(4 - f["dietary_diversity"], 0, None)
        + 0.18 * np.clip(3 - f["animal_protein_days"], 0, None)
        + 0.35 * (1 - f["immunization_complete"])
        + 0.5 * f["mother_short"]
        + 0.45 * f["mother_kek"]
        + 0.3 * (1 - f["clean_water"])
        + 0.35 * (1 - f["sanitation"])
        + 0.15 * f["rural"]
        + 0.25 * np.clip(f["age_months"] - 6, 0, 18) / 18  # stunting builds up over the first two years
    )


def generate_synthetic_cohort(n: int = 6000, seed: int = 42, return_haz: bool = False):
    """Synthetic under-5 cohort resembling rural NTT (about a third stunted).

    Each child's future height-for-age is simulated from its risk factors plus noise, and the label
    comes from that outcome (high: HAZ < -2, medium: -2 to -1). The HAZ itself is never a feature.
    """
    rng = np.random.default_rng(seed)
    age = rng.uniform(0, 60, n)
    sex = rng.integers(0, 2, n).astype(float)
    rural = (rng.random(n) < 0.8).astype(float)
    water = (rng.random(n) < np.where(rural == 1, 0.62, 0.9)).astype(float)
    sanitation = (rng.random(n) < np.where(rural == 1, 0.55, 0.88)).astype(float)
    mother_short = (rng.random(n) < 0.3).astype(float)
    mother_kek = (rng.random(n) < 0.2 + 0.1 * rural).astype(float)
    lbw = (rng.random(n) < 0.08 + 0.1 * mother_kek + 0.05 * mother_short).astype(float)
    premature = (rng.random(n) < 0.06 + 0.25 * lbw).astype(float)
    ebf = (rng.random(n) < 0.7).astype(float)
    diversity = np.clip(np.round(rng.normal(4.2, 1.5, n) - (1 - water) * 0.5), 0, 8)
    protein = np.clip(np.round(rng.normal(3.5, 2.0, n) + (diversity - 4) * 0.4), 0, 7)
    imm = (rng.random(n) < 0.72).astype(float)
    ill_p = 0.12 + 0.12 * (1 - water) + 0.1 * (1 - sanitation)
    diarrhea = (rng.random(n) < ill_p).astype(float)
    fever = (rng.random(n) < ill_p + 0.05).astype(float)
    respiratory = (rng.random(n) < 0.18).astype(float)
    repeated = (rng.random(n) < ill_p * 0.8).astype(float)
    appetite = (rng.random(n) < 0.1 + 0.25 * diarrhea + 0.15 * fever).astype(float)
    faltering_p = 0.1 + 0.15 * diarrhea + 0.1 * repeated + 0.1 * (diversity < 3)
    not_gaining = (rng.random(n) < faltering_p).astype(float) + (rng.random(n) < faltering_p * 0.6).astype(float)

    X = np.column_stack([
        age, sex, lbw, premature, ebf, not_gaining, diarrhea, fever, respiratory, repeated, appetite, diversity, protein, imm,
        mother_short, mother_kek, water, sanitation, rural,
    ])
    haz = (0.05 - 0.85 * _latent_risk(X) + rng.normal(0, 0.4, n)).clip(-5.5, 3.5)
    y = np.where(haz < -2, 2, np.where(haz < -1, 1, 0))
    return (X, y, haz) if return_haz else (X, y)


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
        vals = []
        for name, ref in FEATURES:
            v = features.get(name)
            vals.append(ref if v is None else float(v))
        return np.array(vals, dtype=float)

    def _score(self, X: np.ndarray) -> np.ndarray:
        return self.model.predict_proba(X) @ RISK_WEIGHTS

    def predict(self, features: dict, danger_signs: list[str] | None = None, review_threshold: float = 0.6,
                who_status: dict | None = None) -> Prediction:
        """`features` are the model inputs. `who_status` (haz / whz from the latest measurement) is used only by the
        guardrails after the model has spoken, never as an input."""
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
        who = who_status or {}
        haz, whz = who.get("haz"), who.get("whz")
        if danger_signs:
            guardrail, level_idx = "danger_signs_present", 2
        elif who.get("oedema") or (haz is not None and haz < -3) or (whz is not None and whz < -3):
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
