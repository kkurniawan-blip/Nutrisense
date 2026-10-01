"""Command-line utilities.

    python -m app.cli train      # retrain the risk model and activate it
    python -m app.cli metrics    # print the active model's evaluation (Chapter IV tables)
    python -m app.cli seed       # create tables and load demo data into an empty database

Health facilities that send check-ups (docs/FACILITY_INTEGRATION.md). A key is shown once and only its hash is kept:
    python -m app.cli facility-add "Puskesmas Baumata" [puskesmas|rs|bidan] [Kemenkes code]
    python -m app.cli facility-list
    python -m app.cli facility-rotate-key <id>   # new key; the old one stops working at once
    python -m app.cli facility-disable <id>
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
        elif cmd.startswith("facility-"):
            return _facility(db, cmd, argv[2:])
        else:
            print(__doc__)
    return 0


def _facility(db, cmd: str, args: list[str]) -> int:
    from .models import HealthFacility
    from .services.facility_sync import hash_key, new_api_key

    if cmd == "facility-list":
        for f in db.scalars(select(HealthFacility).order_by(HealthFacility.id)).all():
            print(f"{f.id:>4}  {'active  ' if f.active else 'disabled'}  {f.kind:<10} {f.code or '-':<12} {f.name}")
        return 0
    if cmd == "facility-add" and args and args[0].strip():
        key = new_api_key()
        f = HealthFacility(name=args[0].strip()[:160], kind=args[1] if len(args) > 1 else "puskesmas", code=args[2] if len(args) > 2 else None,
                           api_key_hash=hash_key(key))
        db.add(f)
    elif cmd in ("facility-rotate-key", "facility-disable") and args and args[0].isdigit() and (f := db.get(HealthFacility, int(args[0]))):
        key = None
        if cmd == "facility-rotate-key":
            key = new_api_key()
            f.api_key_hash, f.active = hash_key(key), True
        else:
            f.active = False
    else:
        print(__doc__)
        return 1
    db.commit()
    print(f"Facility {f.id}: {f.name} ({'active' if f.active else 'disabled'})")
    if key:
        print(f"API key (shown once, give it to the facility over a safe channel):\n{key}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
