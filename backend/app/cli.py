"""Command-line utilities.

    python -m app.cli train      # retrain the risk model and activate it
    python -m app.cli metrics    # print the active model's evaluation (Chapter IV tables)
    python -m app.cli seed       # create tables and load demo data into an empty database
"""
import json
import sys

from sqlalchemy import select

from .config import get_settings
from .database import Base, SessionLocal, engine, ensure_columns
from .models import ModelRun


def main(argv: list[str]) -> int:
    cmd = argv[1] if len(argv) > 1 else "help"
    get_settings().model_dir.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(engine)
    ensure_columns()
    with SessionLocal() as db:
        if cmd == "train":
            from .services.model_registry import train_and_register

            run = train_and_register(db, notes="Trained from CLI")
            print(json.dumps({"model_run_id": run.id, **run.metrics}, indent=2))
        elif cmd == "metrics":
            run = db.scalar(select(ModelRun).where(ModelRun.is_active.is_(True)).order_by(ModelRun.id.desc()))
            if run is None:
                print("No trained model yet; run `python -m app.cli train`.")
                return 1
            print(json.dumps({"model_run_id": run.id, "algorithm": run.algorithm, "metrics": run.metrics,
                              "feature_importances": run.feature_importances}, indent=2))
        elif cmd == "seed":
            from .seed import seed_if_empty

            print("Seeded demo data." if seed_if_empty(db) else "Database already has users; nothing to do.")
        else:
            print(__doc__)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
