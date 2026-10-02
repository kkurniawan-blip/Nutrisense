"""Model registry: keeps the active risk model in memory and records every training run (ModelRun)."""
import logging
import threading

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..ai import risk_model
from ..config import get_settings
from ..models import ModelRun

log = logging.getLogger(__name__)
settings = get_settings()

_lock = threading.Lock()
_active: risk_model.RiskModel | None = None


def _path(run_id: int):
    return settings.model_dir / f"risk_model_{run_id}.joblib"


def train_and_register(db: Session, notes: str | None = None) -> ModelRun:
    global _active
    result = risk_model.train()
    run = ModelRun(
        name="stunting_risk",
        algorithm=risk_model.ALGORITHM,
        version=risk_model.MODEL_VERSION,
        n_samples=result.n_samples,
        metrics=result.metrics,
        feature_importances=result.feature_importances,
        is_active=False,
        # The model card text (synthetic data, simulator assumptions, baseline comparison) always comes first.
        notes=risk_model.model_card_notes(result.metrics) + (f"\n{notes}" if notes else ""),
    )
    db.add(run)
    db.flush()
    model = risk_model.RiskModel(result.model, run.id)
    model.save(_path(run.id))
    db.execute(update(ModelRun).where(ModelRun.name == "stunting_risk", ModelRun.id != run.id).values(is_active=False))
    run.is_active = True
    db.commit()
    with _lock:
        _active = model
    log.info("Registered risk model run %s (f1_macro=%s)", run.id, result.metrics["f1_macro"])
    return run


def get_active(db: Session) -> risk_model.RiskModel:
    global _active
    with _lock:
        if _active is not None:
            return _active
    run = db.scalar(select(ModelRun).where(ModelRun.name == "stunting_risk", ModelRun.is_active.is_(True)).order_by(ModelRun.id.desc()))
    # A run from an older model version (e.g. rf-2.0) is replaced by training the current version once.
    if run is not None and run.version == risk_model.MODEL_VERSION and _path(run.id).exists():
        model = risk_model.RiskModel.load(_path(run.id), run.id)
        with _lock:
            _active = model
        return model
    train_and_register(db)
    return _active  # type: ignore[return-value]


def reset_cache() -> None:
    global _active
    with _lock:
        _active = None
