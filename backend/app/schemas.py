"""Request bodies (responses are serialised in serializers.py)."""
from datetime import date

from pydantic import BaseModel, EmailStr, Field


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=2, max_length=160)
    phone: str | None = None
    region_id: int | None = None
    language: str = "id"
    consent_data_processing: bool = Field(description="Required: consent to process the child's health data")
    consent_ai_analysis: bool = True
    consent_satusehat_sharing: bool = False
    consent_research_use: bool = False


class StaffCreateIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str
    role: str = Field(pattern="^(caregiver|kader|officer|doctor|admin)$")
    phone: str | None = None
    region_id: int | None = None
    covered_region_ids: list[int] = []
    language: str = "id"


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ProfileUpdateIn(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    language: str | None = Field(default=None, pattern="^(id|en)$")
    region_id: int | None = None


class ChildIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    sex: str = Field(pattern="^(male|female)$")
    birth_date: date
    region_id: int | None = None
    caregiver_email: EmailStr | None = Field(default=None, description="Kader registering a child on behalf of a caregiver")
    birth_weight_kg: float | None = Field(default=None, gt=0.3, lt=7)
    birth_length_cm: float | None = Field(default=None, gt=25, lt=65)
    clean_water_access: bool = True
    sanitation_access: bool = True
    exclusive_breastfeeding: bool | None = None


class ChildUpdateIn(BaseModel):
    name: str | None = None
    region_id: int | None = None
    kader_id: int | None = None
    clean_water_access: bool | None = None
    sanitation_access: bool | None = None
    exclusive_breastfeeding: bool | None = None


class MeasurementIn(BaseModel):
    measured_at: date | None = None
    weight_kg: float = Field(gt=0.5, lt=40)
    height_cm: float = Field(gt=35, lt=135)
    muac_cm: float | None = Field(default=None, gt=5, lt=30)
    position: str = Field(default="standing", pattern="^(lying|standing)$")
    source: str = Field(default="app", pattern="^(app|kader|iot)$")
    client_uuid: str | None = Field(default=None, max_length=64, description="Idempotency key for offline sync")
    run_assessment: bool = True


class SymptomIn(BaseModel):
    description: str = Field(default="", max_length=3000)
    symptoms: list[str] = []
    appetite: str | None = Field(default=None, pattern="^(good|reduced|poor)$")
    duration_days: int | None = Field(default=None, ge=0, le=365)


class MealItemIn(BaseModel):
    food_key: str
    grams: float | None = Field(default=None, gt=0, le=1500)
    name: str | None = None


class MealIn(BaseModel):
    items: list[MealItemIn] = Field(min_length=1)
    meal_type: str | None = Field(default=None, pattern="^(breakfast|lunch|dinner|snack)$")
    eaten_at: str | None = None
    source: str = "manual"
    ai_notes: str | None = None


class MenuSuggestIn(BaseModel):
    items: list[MealItemIn] = Field(default_factory=list, description="Foods just scanned/selected but not saved yet")


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    child_id: int | None = None


class ReviewIn(BaseModel):
    reviewed_level: str = Field(pattern="^(low|medium|high)$")
    note: str = Field(default="", max_length=2000)


class CaseUpdateIn(BaseModel):
    status: str | None = Field(default=None, pattern="^(open|in_progress|referred|resolved|closed)$")
    priority: str | None = Field(default=None, pattern="^(low|medium|high|emergency)$")
    assigned_to_id: int | None = None
    doctor_id: int | None = None
    note: str | None = Field(default=None, max_length=4000)


class SupplyRequestIn(BaseModel):
    child_id: int
    items: list[dict] = Field(min_length=1, description="[{item_key, quantity}]")
    urgency: str = Field(default="routine", pattern="^(routine|kader_7d|doctor_48h|emergency)$")


class ApproveIn(BaseModel):
    option_index: int | None = Field(default=None, description="Override the recommended logistics option")


class RejectIn(BaseModel):
    reason: str = ""


class PickupIn(BaseModel):
    pickup_code: str | None = None
    qr_payload: str | None = None


class RestockIn(BaseModel):
    item_key: str
    quantity: int = Field(gt=0, le=10000)


class ConsentIn(BaseModel):
    scope: str = Field(pattern="^(data_processing|ai_analysis|satusehat_sharing|research_use)$")
    granted: bool
    child_id: int | None = None


class SyncBatchIn(BaseModel):
    """Offline-first: measurements captured without connectivity, uploaded later."""

    measurements: list[dict] = Field(default_factory=list, description="[{child_id, ...MeasurementIn}]")
