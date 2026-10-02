from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings

settings = get_settings()

_connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=_connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Columns added after the first release. create_all() creates new tables but never alters existing
# ones, so add missing columns in place (portable ADD COLUMN on SQLite and PostgreSQL).
_ADDED_COLUMNS = {
    "case_notes": {"visible_to_caregiver": "BOOLEAN DEFAULT FALSE"},
    "meal_logs": {"client_uuid": "VARCHAR(64)"},
    "symptom_reports": {"client_uuid": "VARCHAR(64)"},
    "regions": {"puskesmas_name": "VARCHAR(160)", "puskesmas_phone": "VARCHAR(40)", "facility_km": "FLOAT", "posyandu_day": "INTEGER"},
    "children": {"birth_gestational_weeks": "FLOAT"},
    "growth_measurements": {"measured_by": "VARCHAR(10)", "oedema": "BOOLEAN"},
    "users": {"token_version": "INTEGER DEFAULT 0"},
    "pregnancies": {"birth_info": "JSON", "facility_sync": "BOOLEAN DEFAULT FALSE", "link_code": "VARCHAR(12)",
                    "linked_facility_id": "INTEGER", "last_sync_at": "TIMESTAMP WITH TIME ZONE"},
}
# Columns that became optional: phone-only accounts have no email.
_RELAXED_NOT_NULL = {"users": ["email"]}
# Indexes declared on existing columns later (create_all only indexes new tables). Names follow SQLAlchemy's ix_<table>_<column>.
_ADDED_INDEXES = {"ix_users_phone": ("users", "phone"), "ix_cases_status": ("cases", "status"),
                  "ix_supply_requests_pickup_code": ("supply_requests", "pickup_code")}


def ensure_columns() -> None:
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    with engine.begin() as conn:
        for table, cols in _ADDED_COLUMNS.items():
            if not insp.has_table(table):
                continue
            existing = {c["name"] for c in insp.get_columns(table)}
            for name, ddl in cols.items():
                if name not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
        for table, names in _RELAXED_NOT_NULL.items():
            if not insp.has_table(table):
                continue
            strict = [c["name"] for c in insp.get_columns(table) if c["name"] in names and not c["nullable"]]
            if not strict:
                continue
            if engine.dialect.name == "sqlite":
                _sqlite_rebuild(conn, table)
            else:
                for name in strict:
                    conn.execute(text(f"ALTER TABLE {table} ALTER COLUMN {name} DROP NOT NULL"))
        for name, (table, column) in _ADDED_INDEXES.items():
            if insp.has_table(table):
                conn.execute(text(f"CREATE INDEX IF NOT EXISTS {name} ON {table} ({column})"))


def _sqlite_rebuild(conn, table: str) -> None:
    """SQLite cannot drop NOT NULL in place: rebuild the table from the current model (sqlite.org/lang_altertable.html)."""
    from sqlalchemy import inspect, text
    from sqlalchemy.schema import CreateIndex, CreateTable

    t = Base.metadata.tables[table]
    old = {c["name"] for c in inspect(conn).get_columns(table)}
    cols = ", ".join(c.name for c in t.columns if c.name in old)
    conn.execute(text("PRAGMA foreign_keys=OFF"))
    ddl = str(CreateTable(t).compile(conn)).replace(f"CREATE TABLE {table} ", f"CREATE TABLE {table}__new ", 1)
    conn.execute(text(ddl))
    conn.execute(text(f"INSERT INTO {table}__new ({cols}) SELECT {cols} FROM {table}"))
    conn.execute(text(f"DROP TABLE {table}"))
    conn.execute(text(f"ALTER TABLE {table}__new RENAME TO {table}"))
    for ix in t.indexes:
        conn.execute(CreateIndex(ix))
    conn.execute(text("PRAGMA foreign_keys=ON"))
