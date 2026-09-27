"""ORM models. Mirrors the class diagram / ERD of the proposal (Figures 3.3.4 and 3.3.5)."""
from datetime import date, datetime, timezone
from enum import Enum

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator

from .database import Base
from .security import EncryptedText


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UTCDateTime(TypeDecorator):
    """Timezone-aware UTC datetimes on every backend (SQLite drops tzinfo on its own)."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc) if value is not None else None

    def process_result_value(self, value, dialect):
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value


class Role(str, Enum):
    caregiver = "caregiver"
    kader = "kader"
    officer = "officer"
    doctor = "doctor"
    admin = "admin"


class RiskLevel(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class Region(Base):
    __tablename__ = "regions"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))  # village / desa
    district: Mapped[str] = mapped_column(String(120))  # kabupaten
    province: Mapped[str] = mapped_column(String(120))
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    rural: Mapped[bool] = mapped_column(Boolean, default=True)
    prevalence_benchmark: Mapped[float | None] = mapped_column(Float, nullable=True)  # % stunting, reference data
    transport_difficulty: Mapped[int] = mapped_column(Integer, default=1)  # 1 (easy) .. 3 (island / no road)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(160))
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    role: Mapped[str] = mapped_column(String(20), default=Role.caregiver.value)
    region_id: Mapped[int | None] = mapped_column(ForeignKey("regions.id"), nullable=True)
    language: Mapped[str] = mapped_column(String(5), default="id")
    # Kaders often serve several villages; their home region plus these form their coverage area.
    covered_region_ids: Mapped[list] = mapped_column(JSON, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)

    region: Mapped[Region | None] = relationship()

    def coverage(self) -> set[int]:
        return ({self.region_id} if self.region_id else set()) | set(self.covered_region_ids or [])


class Child(Base):
    __tablename__ = "children"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    sex: Mapped[str] = mapped_column(String(10))  # male | female
    birth_date: Mapped[date] = mapped_column(Date)
    caregiver_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    kader_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    region_id: Mapped[int | None] = mapped_column(ForeignKey("regions.id"), nullable=True, index=True)
    birth_weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    birth_length_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    clean_water_access: Mapped[bool] = mapped_column(Boolean, default=True)
    sanitation_access: Mapped[bool] = mapped_column(Boolean, default=True)
    exclusive_breastfeeding: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)

    caregiver: Mapped[User] = relationship(foreign_keys=[caregiver_id])
    kader: Mapped[User | None] = relationship(foreign_keys=[kader_id])
    region: Mapped[Region | None] = relationship()
    measurements: Mapped[list["GrowthMeasurement"]] = relationship(
        back_populates="child", order_by="GrowthMeasurement.measured_at", cascade="all, delete-orphan"
    )


class GrowthMeasurement(Base):
    __tablename__ = "growth_measurements"
    id: Mapped[int] = mapped_column(primary_key=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("children.id"), index=True)
    measured_at: Mapped[date] = mapped_column(Date)
    age_months: Mapped[float] = mapped_column(Float)
    weight_kg: Mapped[float] = mapped_column(Float)
    height_cm: Mapped[float] = mapped_column(Float)
    muac_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    position: Mapped[str] = mapped_column(String(10), default="standing")  # lying | standing
    haz: Mapped[float | None] = mapped_column(Float, nullable=True)
    waz: Mapped[float | None] = mapped_column(Float, nullable=True)
    whz: Mapped[float | None] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(String(20), default="app")  # app | kader | iot
    client_uuid: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)  # offline sync idempotency
    recorded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)

    child: Mapped[Child] = relationship(back_populates="measurements")


class SymptomReport(Base):
    __tablename__ = "symptom_reports"
    id: Mapped[int] = mapped_column(primary_key=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("children.id"), index=True)
    reported_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    description: Mapped[str | None] = mapped_column(EncryptedText(), nullable=True)
    symptoms: Mapped[list] = mapped_column(JSON, default=list)
    danger_signs: Mapped[list] = mapped_column(JSON, default=list)
    appetite: Mapped[str | None] = mapped_column(String(20), nullable=True)
    duration_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    interpreted_by: Mapped[str] = mapped_column(String(20), default="rules")
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class MealLog(Base):
    __tablename__ = "meal_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("children.id"), index=True)
    logged_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    eaten_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    meal_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    items: Mapped[list] = mapped_column(JSON, default=list)
    nutrients: Mapped[dict] = mapped_column(JSON, default=dict)
    food_groups: Mapped[list] = mapped_column(JSON, default=list)
    source: Mapped[str] = mapped_column(String(20), default="manual")
    ai_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class ModelRun(Base):
    __tablename__ = "model_runs"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    algorithm: Mapped[str] = mapped_column(String(120))
    version: Mapped[str] = mapped_column(String(40))
    n_samples: Mapped[int] = mapped_column(Integer, default=0)
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    feature_importances: Mapped[dict] = mapped_column(JSON, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    trained_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class RiskAssessment(Base):
    __tablename__ = "risk_assessments"
    id: Mapped[int] = mapped_column(primary_key=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("children.id"), index=True)
    measurement_id: Mapped[int | None] = mapped_column(ForeignKey("growth_measurements.id"), nullable=True)
    symptom_report_id: Mapped[int | None] = mapped_column(ForeignKey("symptom_reports.id"), nullable=True)
    model_run_id: Mapped[int | None] = mapped_column(ForeignKey("model_runs.id"), nullable=True)
    risk_level: Mapped[str] = mapped_column(String(10))
    probabilities: Mapped[dict] = mapped_column(JSON, default=dict)
    confidence: Mapped[float] = mapped_column(Float)
    needs_review: Mapped[bool] = mapped_column(Boolean, default=False)
    guardrail: Mapped[str | None] = mapped_column(String(120), nullable=True)
    explanation: Mapped[list] = mapped_column(JSON, default=list)  # feature contributions
    reasons: Mapped[list] = mapped_column(JSON, default=list)  # human-readable reasons
    triage: Mapped[dict] = mapped_column(JSON, default=dict)
    trend: Mapped[dict] = mapped_column(JSON, default=dict)
    features: Mapped[dict] = mapped_column(JSON, default=dict)
    reviewed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_level: Mapped[str | None] = mapped_column(String(10), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class NutritionRecommendation(Base):
    __tablename__ = "nutrition_recommendations"
    id: Mapped[int] = mapped_column(primary_key=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("children.id"), index=True)
    assessment_id: Mapped[int | None] = mapped_column(ForeignKey("risk_assessments.id"), nullable=True)
    content: Mapped[dict] = mapped_column(JSON, default=dict)
    generated_by: Mapped[str] = mapped_column(String(20), default="rules")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class Case(Base):
    __tablename__ = "cases"
    id: Mapped[int] = mapped_column(primary_key=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("children.id"), index=True)
    assessment_id: Mapped[int | None] = mapped_column(ForeignKey("risk_assessments.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="open")  # open|in_progress|referred|resolved|closed
    priority: Mapped[str] = mapped_column(String(20), default="medium")  # low|medium|high|emergency
    urgency: Mapped[str | None] = mapped_column(String(40), nullable=True)
    assigned_to_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    doctor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, onupdate=utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)

    child: Mapped[Child] = relationship()
    notes: Mapped[list["CaseNote"]] = relationship(order_by="CaseNote.created_at", cascade="all, delete-orphan")


class CaseNote(Base):
    __tablename__ = "case_notes"
    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    text: Mapped[str] = mapped_column(EncryptedText())
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)

    author: Mapped[User] = relationship()


class Locker(Base):
    """A N.E.X.U.S. smart locker (kind=locker) or a supply hub / Puskesmas warehouse with drones (kind=hub)."""

    __tablename__ = "lockers"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)
    name: Mapped[str] = mapped_column(String(160))
    kind: Mapped[str] = mapped_column(String(10), default="locker")
    region_id: Mapped[int | None] = mapped_column(ForeignKey("regions.id"), nullable=True)
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(20), default="online")
    slots_total: Mapped[int] = mapped_column(Integer, default=24)
    last_heartbeat: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)

    region: Mapped[Region | None] = relationship()
    inventory: Mapped[list["InventoryItem"]] = relationship(back_populates="locker", cascade="all, delete-orphan")


class InventoryItem(Base):
    __tablename__ = "inventory_items"
    __table_args__ = (UniqueConstraint("locker_id", "item_key"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    locker_id: Mapped[int] = mapped_column(ForeignKey("lockers.id"), index=True)
    item_key: Mapped[str] = mapped_column(String(40))
    quantity: Mapped[int] = mapped_column(Integer, default=0)
    reserved: Mapped[int] = mapped_column(Integer, default=0)
    restock_threshold: Mapped[int] = mapped_column(Integer, default=5)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, onupdate=utcnow)

    locker: Mapped[Locker] = relationship(back_populates="inventory")


class SupplyRequest(Base):
    __tablename__ = "supply_requests"
    id: Mapped[int] = mapped_column(primary_key=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("children.id"), index=True)
    case_id: Mapped[int | None] = mapped_column(ForeignKey("cases.id"), nullable=True)
    requested_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    items: Mapped[list] = mapped_column(JSON, default=list)  # [{item_key, quantity}]
    urgency: Mapped[str] = mapped_column(String(20), default="routine")
    status: Mapped[str] = mapped_column(String(30), default="pending_approval")
    fulfillment: Mapped[str | None] = mapped_column(String(20), nullable=True)  # locker_stock | drone
    locker_id: Mapped[int | None] = mapped_column(ForeignKey("lockers.id"), nullable=True)
    pickup_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    qr_payload: Mapped[str | None] = mapped_column(String(255), nullable=True)
    decision: Mapped[dict] = mapped_column(JSON, default=dict)  # logistics decision rationale
    approved_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    ready_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    picked_up_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)

    child: Mapped[Child] = relationship()
    locker: Mapped[Locker | None] = relationship()


class Drone(Base):
    __tablename__ = "drones"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)
    hub_id: Mapped[int] = mapped_column(ForeignKey("lockers.id"))
    status: Mapped[str] = mapped_column(String(20), default="idle")  # idle|in_flight|charging|maintenance
    battery_pct: Mapped[float] = mapped_column(Float, default=100.0)
    max_range_km: Mapped[float] = mapped_column(Float, default=40.0)
    payload_kg: Mapped[float] = mapped_column(Float, default=3.0)

    hub: Mapped[Locker] = relationship()


class DroneDispatch(Base):
    __tablename__ = "drone_dispatches"
    id: Mapped[int] = mapped_column(primary_key=True)
    supply_request_id: Mapped[int] = mapped_column(ForeignKey("supply_requests.id"), index=True)
    drone_id: Mapped[int] = mapped_column(ForeignKey("drones.id"))
    origin_id: Mapped[int] = mapped_column(ForeignKey("lockers.id"))
    destination_id: Mapped[int] = mapped_column(ForeignKey("lockers.id"))
    distance_km: Mapped[float] = mapped_column(Float)
    eta_minutes: Mapped[float] = mapped_column(Float)
    battery_needed_pct: Mapped[float] = mapped_column(Float)
    weather_risk: Mapped[float] = mapped_column(Float, default=0.1)
    payload_kg: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(String(20), default="planned")  # planned|launched|delivered|returned|aborted
    route: Mapped[list] = mapped_column(JSON, default=list)
    launched_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)

    drone: Mapped[Drone] = relationship()


class Consent(Base):
    __tablename__ = "consents"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    child_id: Mapped[int | None] = mapped_column(ForeignKey("children.id"), nullable=True)
    scope: Mapped[str] = mapped_column(String(40))  # data_processing | ai_analysis | satusehat_sharing | research_use
    granted: Mapped[bool] = mapped_column(Boolean, default=True)
    version: Mapped[str] = mapped_column(String(10), default="1.0")
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, onupdate=utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(60))
    entity: Mapped[str] = mapped_column(String(60))
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, index=True)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    kind: Mapped[str] = mapped_column(String(30))
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    child_id: Mapped[int | None] = mapped_column(ForeignKey("children.id"), nullable=True)
    role: Mapped[str] = mapped_column(String(10))  # user | assistant
    content: Mapped[str] = mapped_column(EncryptedText())
    generated_by: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class FhirSyncLog(Base):
    __tablename__ = "fhir_sync_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("children.id"), index=True)
    triggered_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(20))  # simulated_success | blocked_no_consent
    resource_count: Mapped[int] = mapped_column(Integer, default=0)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
