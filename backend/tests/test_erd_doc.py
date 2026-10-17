"""docs/ERD.md must describe every table in the models, and say how many there are."""
import re
from pathlib import Path

from app import models  # noqa: F401  (registers the tables)
from app.database import Base

ERD = Path(__file__).resolve().parents[2] / "docs" / "ERD.md"


def test_every_table_is_in_the_erd():
    text = ERD.read_text(encoding="utf-8")
    diagrams = "\n".join(re.findall(r"```mermaid\n(.*?)```", text, re.S))
    missing = [t for t in Base.metadata.tables if not re.search(rf"^\s*{t} \{{", diagrams, re.M)]
    assert not missing, f"add these tables to a diagram in docs/ERD.md: {missing}"


def test_table_count_is_current():
    text = ERD.read_text(encoding="utf-8")
    assert f"{len(Base.metadata.tables)} tables" in text
