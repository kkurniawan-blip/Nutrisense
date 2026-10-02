"""Stunting risk classifier (classify() in the class diagram).

A multinomial logistic regression (class-weighted, on standardised inputs) predicts each child's risk
of becoming (or staying) stunted as low / medium / high from factors that come BEFORE the child's size:
birth, feeding, illness, diet, immunisation, the mother and the household. The child's height, and
z-scores in general, are deliberately NOT inputs: stunting is defined by height-for-age, so a model fed
with height would only re-read the answer. The child's current WHO status is shown separately, from the
measurement itself, and clinical guardrails (WHO cut-offs, 2T, danger signs) can raise, never lower, the
model's level. Regional prevalence is not an input either: a child's risk should come from the child's
own situation, not from where the family lives.

Model choice (version lr-3.0, replacing rf-2.0): in repeated 5-fold cross-validation on the synthetic
cohort the logistic regression beat the earlier Random Forest on macro F1 and on the high-risk miss rate
(false-negative rate), and its probabilities are better calibrated. `train()` re-runs that comparison
every time and stores both models' mean +/- sd in the metrics, so the choice stays checkable.

Because no public child-level microdata is available, the model is trained on a synthetic cohort whose
distributions mirror a rural East Nusa Tenggara posyandu (Chapter IV). All metrics are therefore demo
metrics, and the effect of each factor is an assumption written into the simulator (`_latent_risk`), not
evidence. Swap in real, consented data with `train(X, y)` when available.

Data quality: every input is range-checked (`clean_features`). Impossible values are rejected and
treated as missing; missing values are imputed with the cohort average (never as "healthy" or zero),
left out of the explanation, and listed so the result is sent for human review.

Every prediction ships with:
  * class probabilities and confidence,
  * per-feature contributions (perturbation against a healthy reference child),
  * clinical guardrails that can only raise the risk level,
  * a needs_review flag for the human-in-the-loop step,
  * the inputs that were missing or rejected.
"""
from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import RepeatedStratifiedKFold, train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

log = logging.getLogger(__name__)

LABELS = ["low", "medium", "high"]
MODEL_VERSION = "lr-3.0"
ALGORITHM = "LogisticRegression(multinomial, class_weight=balanced, standardised); baseline RandomForest(250)"

# (name, healthy reference value used for explanations)
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
EXCLUDED_INPUTS = {"haz", "waz", "whz", "height_cm", "haz_velocity", "waz_velocity", "regional_prevalence", "muac_cm"}

# Possible range of each input. A value outside it is a data error: it is rejected (treated as missing) and flagged.
_BINARY = (0.0, 1.0)
RANGES: dict[str, tuple[float, float]] = {name: _BINARY for name in FEATURE_NAMES}
RANGES.update({"age_months": (0.0, 60.0), "weight_not_gaining": (0.0, 2.0), "dietary_diversity": (0.0, 8.0), "animal_protein_days": (0.0, 7.0)})
AGE_CLIP_MONTHS = 61.0  # a check-up a few days after the 5th birthday is clipped to 60 months; beyond that it is an error
# Inputs whose absence makes the result unreliable: the result then needs a human review.
KEY_INPUTS = ("low_birth_weight", "exclusive_breastfeeding", "dietary_diversity", "animal_protein_days")

# WHO / Kemenkes cut-offs used by the guardrails (applied after the model, never as inputs).
#   WHZ < -2 wasted, < -3 severely wasted; HAZ < -2 stunted, < -3 severely stunted: WHO Child Growth Standards 2006;
#   Permenkes 2/2020 Standar Antropometri Anak (Kemenkes 2020).
#   Child MUAC (LiLA) 6-59 months: < 11.5 cm severe, < 12.5 cm moderate acute malnutrition: WHO 2013 guideline
#   "Updates on the management of severe acute malnutrition"; Kemenkes 2019 Pedoman Pencegahan dan Tata Laksana Gizi Buruk.
#   2T (no weight gain at two weighings in a row): Kemenkes 2020 (Buku KIA, KBM); a referral trigger for the Posyandu.
WHZ_WASTED, WHZ_SEVERE = -2.0, -3.0
HAZ_STUNTED, HAZ_SEVERE = -2.0, -3.0
MUAC_MODERATE_CM, MUAC_SEVERE_CM = 12.5, 11.5
MUAC_MIN_AGE_MONTHS = 6.0


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


@lru_cache
def population_mean() -> np.ndarray:
    """Cohort average of each input, used to impute a missing value (an 'average child', never a healthy one).
    Replace with the training data's means when real data is used."""
    X, _ = generate_synthetic_cohort(seed=42)
    return X.mean(axis=0)


@lru_cache
def _plausible_bounds() -> dict[str, tuple[float, float]]:
    """(risk-raising, risk-lowering) plausible values of each key input: 10th / 90th cohort percentile, 0 / 1 for yes-no."""
    X, _ = generate_synthetic_cohort(seed=42)
    col = {n: i for i, n in enumerate(FEATURE_NAMES)}
    q = {k: (float(np.quantile(X[:, col[k]], 0.1)), float(np.quantile(X[:, col[k]], 0.9))) for k in KEY_INPUTS}
    return {"low_birth_weight": (1.0, 0.0), "exclusive_breastfeeding": (0.0, 1.0),
            "dietary_diversity": q["dietary_diversity"], "animal_protein_days": q["animal_protein_days"]}


def clean_features(features: dict) -> tuple[dict, list[str], list[str]]:
    """Range-check the model inputs. Returns (values with None for missing or rejected, missing names, rejected names)."""
    clean: dict = {}
    missing: list[str] = []
    rejected: list[str] = []
    for name in FEATURE_NAMES:
        v = features.get(name)
        if v is None:
            clean[name] = None
            missing.append(name)
            continue
        try:
            v = float(v)
        except (TypeError, ValueError):
            v = math.nan
        lo, hi = RANGES[name]
        if name == "age_months" and hi < v <= AGE_CLIP_MONTHS:
            v = hi
        if not math.isfinite(v) or v < lo or v > hi:
            clean[name] = None
            rejected.append(name)
            continue
        clean[name] = v
    return clean, missing, rejected


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
        "high_predicted_low": int(((y_true == 2) & (y_pred == 0)).sum()),
        "confusion_matrix": {"labels": LABELS, "matrix": cm.tolist()},
    }


def _ece(P: np.ndarray, y: np.ndarray, bins: int = 10) -> float:
    """Expected calibration error of the top-class confidence."""
    conf, correct = P.max(1), (P.argmax(1) == y)
    edges = np.linspace(0, 1, bins + 1)
    return float(sum(((conf > a) & (conf <= b)).mean() * abs(conf[(conf > a) & (conf <= b)].mean() - correct[(conf > a) & (conf <= b)].mean())
                     for a, b in zip(edges[:-1], edges[1:]) if ((conf > a) & (conf <= b)).any()))


def _brier(P: np.ndarray, y: np.ndarray) -> float:
    return float(np.mean(np.sum((P - np.eye(3)[y]) ** 2, axis=1)))


def _calibration(P: np.ndarray, y: np.ndarray) -> dict:
    return {"ece": round(_ece(P, y), 4), "brier": round(_brier(P, y), 4),
            "auc_high_vs_rest": round(float(roc_auc_score(y == 2, P[:, 2])), 4),
            "mean_p_high": round(float(P[:, 2].mean()), 4), "observed_high_rate": round(float((y == 2).mean()), 4)}


def make_logistic_regression():
    return make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000, class_weight="balanced"))


def make_random_forest(seed: int = 42):
    return RandomForestClassifier(n_estimators=250, max_depth=12, min_samples_leaf=3, class_weight="balanced", random_state=seed, n_jobs=-1)


CANDIDATES = {"logistic_regression": lambda seed: make_logistic_regression(), "random_forest": make_random_forest}
SHIPPED = "logistic_regression"


def compare_models(X: np.ndarray, y: np.ndarray, repeats: int = 3, seed: int = 42) -> dict:
    """Repeated stratified 5-fold CV (`repeats` different shuffles) for every candidate: mean and sd per metric."""
    rows: dict[str, list[list[float]]] = {k: [] for k in CANDIDATES}
    for tr, te in RepeatedStratifiedKFold(n_splits=5, n_repeats=repeats, random_state=seed).split(X, y):
        for name, make in CANDIDATES.items():
            P = make(seed).fit(X[tr], y[tr]).predict_proba(X[te])
            p, yt = P.argmax(1), y[te]
            rows[name].append([f1_score(yt, p, average="macro"), ((yt == 2) & (p != 2)).sum() / max(1, (yt == 2).sum()),
                               accuracy_score(yt, p), _ece(P, yt), _brier(P, yt)])
    cols = ["f1_macro", "false_negative_rate_high", "accuracy", "ece", "brier"]
    out: dict = {"protocol": f"stratified 5-fold CV x {repeats} repeats ({5 * repeats} folds)"}
    for name, r in rows.items():
        a = np.array(r)
        out[name] = {c: {"mean": round(float(a[:, i].mean()), 4), "sd": round(float(a[:, i].std()), 4)} for i, c in enumerate(cols)}
    return out


def _group_metrics(X: np.ndarray, y: np.ndarray, pred: np.ndarray) -> dict:
    """Fairness check on the hold-out: performance per group (synthetic groups; real data needed to mean anything)."""
    col = {n: i for i, n in enumerate(FEATURE_NAMES)}
    groups = {
        "rural": X[:, col["rural"]] == 1, "urban": X[:, col["rural"]] == 0,
        "boys": X[:, col["sex_male"]] == 1, "girls": X[:, col["sex_male"]] == 0,
        "age_0_6": X[:, col["age_months"]] < 6, "age_6_24": (X[:, col["age_months"]] >= 6) & (X[:, col["age_months"]] < 24),
        "age_24_60": X[:, col["age_months"]] >= 24, "no_clean_water": X[:, col["clean_water"]] == 0,
        "mother_kek": X[:, col["mother_kek"]] == 1,
    }
    out = {}
    for g, m in groups.items():
        if m.sum() < 20:
            continue
        yt, p = y[m], pred[m]
        nh = int((yt == 2).sum())
        out[g] = {"n": int(m.sum()), "accuracy": round(float((yt == p).mean()), 4),
                  "f1_macro": round(float(f1_score(yt, p, average="macro", zero_division=0)), 4),
                  "false_negative_rate_high": round(float(((yt == 2) & (p != 2)).sum() / nh), 4) if nh else None, "n_high": nh}
    return out


def _threshold_options(P: np.ndarray, y: np.ndarray) -> list[dict]:
    """What a lower P(high) cut-off for "high" would cost. Reported only; the cut-off is a programme decision (not applied)."""
    out = []
    p_high, is_high = P[:, 2], y == 2
    for target in (0.10, 0.05):
        t = float(np.quantile(p_high[is_high], target))  # flags (1 - target) of the truly high-risk children
        flagged = p_high >= t
        out.append({"target_false_negative_rate_high": target, "p_high_threshold": round(t, 3),
                    "share_flagged_high": round(float(flagged.mean()), 3),
                    "precision_high": round(float((flagged & is_high).sum() / max(1, flagged.sum())), 3)})
    return out


@dataclass
class TrainResult:
    model: object
    metrics: dict
    feature_importances: dict
    n_samples: int


def train(X: np.ndarray | None = None, y: np.ndarray | None = None, seed: int = 42, cv_repeats: int = 3) -> TrainResult:
    synthetic = X is None or y is None
    if synthetic:
        X, y = generate_synthetic_cohort(seed=seed)
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, stratify=y, random_state=seed)

    model = make_logistic_regression().fit(X_tr, y_tr)
    P = model.predict_proba(X_te)
    pred = P.argmax(1)
    metrics = _metrics(y_te, pred)
    metrics["calibration"] = _calibration(P, y_te)

    comparison = compare_models(X, y, repeats=cv_repeats, seed=seed)
    metrics["model_comparison"] = comparison
    metrics["cv_f1_macro_mean"] = comparison[SHIPPED]["f1_macro"]["mean"]
    metrics["cv_f1_macro_std"] = comparison[SHIPPED]["f1_macro"]["sd"]
    lr_cv, rf_cv = comparison["logistic_regression"], comparison["random_forest"]
    metrics["selection"] = {
        "shipped": SHIPPED,
        "rule": "ship the model with higher mean macro F1 AND lower mean high-risk false-negative rate in CV, if it is calibrated (ECE < 0.05)",
        "holds": bool(lr_cv["f1_macro"]["mean"] >= rf_cv["f1_macro"]["mean"]
                      and lr_cv["false_negative_rate_high"]["mean"] <= rf_cv["false_negative_rate_high"]["mean"]
                      and lr_cv["ece"]["mean"] < 0.05),
    }

    # Baseline on the same hold-out: the earlier Random Forest (rf-2.0).
    rf = make_random_forest(seed).fit(X_tr, y_tr)
    P_rf = rf.predict_proba(X_te)
    base_m = _metrics(y_te, P_rf.argmax(1))
    metrics["baseline"] = {"name": "random_forest", **{k: base_m[k] for k in ("accuracy", "f1_macro", "false_negative_rate_high")},
                           "ece": round(_ece(P_rf, y_te), 4)}
    # Kept for the app's model card (it reads this key); it now holds the shipped logistic regression's hold-out figures.
    metrics["baseline_logistic_regression"] = {k: metrics[k] for k in ("accuracy", "f1_macro", "false_negative_rate_high")}
    metrics["groups"] = _group_metrics(X_te, y_te, pred)
    metrics["high_threshold_options"] = _threshold_options(P, y_te)
    metrics["decision_rule"] = "argmax of class probabilities (unchanged); WHO/Kemenkes guardrails can only raise the level"
    metrics["class_distribution"] = {LABELS[i]: int((y == i).sum()) for i in range(3)}
    metrics["test_size"] = int(len(y_te))
    metrics["data"] = "synthetic" if synthetic else "provided"

    # Permutation importance on the hold-out (model-agnostic): drop in macro F1 when a feature is shuffled.
    pi = permutation_importance(model, X_te, y_te, scoring="f1_macro", n_repeats=5, random_state=seed)
    raw = np.clip(pi.importances_mean, 0, None)
    total = raw.sum() or 1.0
    importances = {name: round(float(v / total), 4) for name, v in zip(FEATURE_NAMES, raw)}
    importances = dict(sorted(importances.items(), key=lambda kv: -kv[1]))
    return TrainResult(model=model, metrics=metrics, feature_importances=importances, n_samples=int(len(y)))


def _pm(m: dict) -> str:
    return f"{m['mean']:.3f} ± {m['sd']:.3f}"


def model_card_notes(metrics: dict) -> str:
    """Plain model-card text stored with each training run (shown as `notes` on the dashboard's model card)."""
    c = metrics.get("model_comparison", {})
    lines = [
        "Synthetic data (demo): trained and tested on a simulated rural-NTT cohort, not on real children. Not a clinical validation.",
        "Factor effects (which inputs raise risk, and by how much) are assumptions written into the simulator, not evidence.",
    ]
    if "logistic_regression" in c and "random_forest" in c:
        lr, rf = c["logistic_regression"], c["random_forest"]
        lines.append(
            f"Baseline comparison ({c.get('protocol', 'cross-validation')}): logistic regression macro F1 {_pm(lr['f1_macro'])}, "
            f"high-risk miss rate {_pm(lr['false_negative_rate_high'])}, calibration error {_pm(lr['ece'])}; "
            f"random forest macro F1 {_pm(rf['f1_macro'])}, high-risk miss rate {_pm(rf['false_negative_rate_high'])}, "
            f"calibration error {_pm(rf['ece'])}. Shipped: logistic regression"
            + (" (better on F1, miss rate and calibration)." if metrics.get("selection", {}).get("holds") else
               " (NOTE: the comparison no longer favours it on this data; review).")
        )
    lines.append("WHO/Kemenkes cut-offs (HAZ, WHZ, MUAC, oedema), 2T and danger signs are applied after the model and can only raise the level. "
                 "Missing inputs are imputed with the cohort average and the result is sent for review.")
    return "\n".join(lines)


@dataclass
class Prediction:
    risk_level: str
    model_level: str
    probabilities: dict
    confidence: float
    contributions: list[dict] = field(default_factory=list)
    guardrail: str | None = None
    needs_review: bool = False
    overrides: list[str] = field(default_factory=list)  # every WHO/Kemenkes rule that applied
    missing_inputs: list[str] = field(default_factory=list)
    rejected_inputs: list[str] = field(default_factory=list)
    incomplete: bool = False  # a key input was missing or rejected
    missing_changes_level: bool = False  # plausible values for the missing key inputs give different levels


def who_overrides(who: dict, age_months: float | None, weight_not_gaining: float | None) -> tuple[list[str], list[str]]:
    """WHO / Kemenkes rules that set a minimum level: (rules for at least "high", rules for at least "medium")."""
    haz, whz, muac = who.get("haz"), who.get("whz"), who.get("muac_cm")
    muac_ok = muac is not None and (age_months is None or age_months >= MUAC_MIN_AGE_MONTHS)
    high, medium = [], []
    if who.get("oedema"):
        high.append("oedema")
    if whz is not None and whz < WHZ_SEVERE:
        high.append("whz_below_-3")
    if muac_ok and muac < MUAC_SEVERE_CM:
        high.append("muac_below_11.5")
    if haz is not None and haz < HAZ_SEVERE:
        high.append("haz_below_-3")
    if whz is not None and WHZ_SEVERE <= whz < WHZ_WASTED:
        medium.append("whz_below_-2")
    if muac_ok and MUAC_SEVERE_CM <= muac < MUAC_MODERATE_CM:
        medium.append("muac_below_12.5")
    if haz is not None and HAZ_SEVERE <= haz < HAZ_STUNTED:
        medium.append("haz_below_-2")  # to verify (clinical sign-off): HAZ -2..-3 keeps "at least medium"
    if weight_not_gaining is not None and weight_not_gaining >= 2:
        medium.append("2t")
    return high, medium


class RiskModel:
    def __init__(self, model, model_run_id: int | None = None):
        if hasattr(model, "n_jobs"):
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
        """Model input vector: range-checked, with missing or rejected values imputed by the cohort average."""
        clean, _, _ = clean_features(features)
        mean = population_mean()
        return np.array([mean[i] if clean[n] is None else clean[n] for i, n in enumerate(FEATURE_NAMES)], dtype=float)

    def _score(self, X: np.ndarray) -> np.ndarray:
        return self.model.predict_proba(X) @ RISK_WEIGHTS

    def predict(self, features: dict, danger_signs: list[str] | None = None, review_threshold: float = 0.6,
                who_status: dict | None = None) -> Prediction:
        """`features` are the model inputs. `who_status` (haz / whz / muac_cm / oedema from the latest measurement) is used
        only by the guardrails after the model has spoken, never as an input."""
        clean, missing, rejected = clean_features(features)
        x = self.vectorize(features)
        proba = self.model.predict_proba(x.reshape(1, -1))[0]
        model_idx = int(np.argmax(proba))
        level_idx = model_idx

        # Explanation: how much each known feature moves the risk score, against a healthy reference child of the same
        # age and sex. The average of "remove it from this child" and "add it to the healthy child", so that a child whose
        # risk is already near 100% (or 0%) still gets its drivers listed. Imputed features are left out: their value is a
        # guess, not the child's.
        unknown = set(missing) | set(rejected)
        ref = REFERENCE.copy()
        ref[:2] = x[:2]  # age_months, sex_male
        removed = np.repeat(x.reshape(1, -1), len(FEATURES), axis=0)
        added = np.repeat(ref.reshape(1, -1), len(FEATURES), axis=0)
        for i in range(len(FEATURES)):
            if FEATURE_NAMES[i] not in ("age_months", "sex_male") and FEATURE_NAMES[i] not in unknown:
                removed[i, i] = ref[i]
                added[i, i] = x[i]
        base = float(self._score(x.reshape(1, -1))[0])
        ref_score = float(self._score(ref.reshape(1, -1))[0])
        deltas = 0.5 * ((base - self._score(removed)) + (self._score(added) - ref_score))
        contributions = [
            {"feature": FEATURE_NAMES[i], "value": round(float(x[i]), 3), "contribution": round(float(deltas[i]), 4)}
            for i in np.argsort(-np.abs(deltas))
            if abs(deltas[i]) >= 0.01
        ][:8]

        # Clinical guardrails: danger signs and WHO/Kemenkes cut-offs can raise, never lower, the level.
        guardrail = None
        high_rules, medium_rules = who_overrides(who_status or {}, clean["age_months"], clean["weight_not_gaining"])
        if danger_signs:
            guardrail, level_idx = "danger_signs_present", 2
        elif high_rules:
            guardrail, level_idx = "severe_stunting_or_wasting", 2
        elif medium_rules and level_idx < 1:
            level_idx = 1
            if {"whz_below_-2", "muac_below_12.5"} & set(medium_rules):
                guardrail = "wasted_minimum_medium"
            elif "haz_below_-2" in medium_rules:
                guardrail = "stunted_minimum_medium"
            else:
                guardrail = "two_t_minimum_medium"

        confidence = float(proba[model_idx])
        # Missing data: a key input that is missing or was rejected makes the result "incomplete" (always shown as a plain
        # reason). It needs a human review when a value was rejected (a data error) or when plausible values for the
        # missing key inputs would give a different level, i.e. the level depends on data we do not have.
        unknown_key = [k for k in KEY_INPUTS if k in unknown]
        incomplete = bool(unknown_key) or bool(rejected)
        changes = False
        if unknown_key:
            bounds = _plausible_bounds()
            worse = {**clean, **{k: bounds[k][0] for k in unknown_key}}
            better = {**clean, **{k: bounds[k][1] for k in unknown_key}}
            pw = self.model.predict_proba(self.vectorize(worse).reshape(1, -1))[0]
            pb = self.model.predict_proba(self.vectorize(better).reshape(1, -1))[0]
            changes = int(np.argmax(pw)) != int(np.argmax(pb))
        needs_review = (confidence < review_threshold or (guardrail is not None and level_idx != model_idx) or bool(rejected)
                        or (changes and level_idx < 2))
        return Prediction(
            risk_level=LABELS[level_idx],
            model_level=LABELS[model_idx],
            probabilities={LABELS[i]: round(float(p), 4) for i, p in enumerate(proba)},
            confidence=round(confidence, 4),
            contributions=contributions,
            guardrail=guardrail,
            needs_review=needs_review,
            overrides=(["danger_signs"] if danger_signs else []) + high_rules + medium_rules,
            missing_inputs=missing,
            rejected_inputs=rejected,
            incomplete=incomplete,
            missing_changes_level=changes,
        )
