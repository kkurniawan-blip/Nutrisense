"""Request bodies (responses are serialised in serializers.py)."""
from datetime import date
from typing import Annotated

from pydantic import AfterValidator, BaseModel, EmailStr, Field, StringConstraints

# Passwords people commonly pick first; refused even though they meet the length rule.
WEAK_PASSWORDS = {"12345678", "password", "87654321", "qwertyui", "11111111", "00000000"}


def _not_weak(value: str) -> str:
    if value.lower() in WEAK_PASSWORDS:
        raise ValueError("This password is too easy to guess; choose another one")
    return value


# Max 128 so a huge password cannot make the PBKDF2 hash expensive.
NewPassword = Annotated[str, Field(min_length=8, max_length=128), AfterValidator(_not_weak)]
Password = Annotated[str, Field(max_length=128)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]


class RegisterIn(BaseModel):
    email: EmailStr | None = Field(default=None, description="Email, or leave empty and give a phone number")
    password: NewPassword
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
    password: NewPassword
    full_name: str = Field(min_length=2, max_length=160)
    role: str = Field(pattern="^(caregiver|kader|officer|doctor|admin)$")
    phone: str | None = None
    region_id: int | None = None
    covered_region_ids: list[int] = []
    language: str = "id"


class LoginIn(BaseModel):
    email: str | None = Field(default=None, description="Email or phone number")
    phone: str | None = None
    password: Password


class StaffAreaIn(BaseModel):
    """Admin only: a health worker's home region and the extra villages they cover (their access area)."""

    region_id: int | None = None
    covered_region_ids: list[int] | None = None


class ProfileUpdateIn(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=160)
    phone: str | None = Field(default=None, max_length=32)
    language: str | None = Field(default=None, pattern="^(id|en)$")
    region_id: int | None = None


class PasswordChangeIn(BaseModel):
    current_password: Password
    new_password: NewPassword


class ChildIn(BaseModel):
    name: Name
    sex: str = Field(pattern="^(male|female)$")
    birth_date: date
    region_id: int | None = None
    caregiver_email: EmailStr | None = Field(default=None, description="Kader registering a child on behalf of a caregiver")
    caregiver_phone: str | None = Field(default=None, max_length=20, description="...or the caregiver's phone number")
    birth_weight_kg: float | None = Field(default=None, gt=0.3, lt=7)
    birth_length_cm: float | None = Field(default=None, gt=25, lt=65)
    clean_water_access: bool = True
    sanitation_access: bool = True
    exclusive_breastfeeding: bool | None = None


class ChildUpdateIn(BaseModel):
    name: Name | None = None
    birth_gestational_weeks: float | None = Field(default=None, ge=22, le=44)
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
    measured_by: str | None = Field(default=None, pattern="^(mother|kader)$", description="Who measured: the mother or a Kader")
    oedema: bool | None = Field(default=None, description="Pitting oedema of both feet")
    client_uuid: str | None = Field(default=None, max_length=64, description="Idempotency key for offline sync")
    run_assessment: bool = True


class SymptomIn(BaseModel):
    description: str = Field(default="", max_length=3000)
    symptoms: list[str] = []
    appetite: str | None = Field(default=None, pattern="^(good|reduced|poor)$")
    duration_days: int | None = Field(default=None, ge=0, le=365)
    client_uuid: str | None = Field(default=None, max_length=64, description="Idempotency key for offline sync")


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
    client_uuid: str | None = Field(default=None, max_length=64, description="Idempotency key for offline sync")


class KitchenIn(BaseModel):
    food_keys: list[str] = Field(default_factory=list, max_length=40, description="Foods on hand (from NutriScan or picked)")


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
    share_with_family: bool = Field(default=False, description="Show this note to the caregiver as a health-worker recommendation")


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


class MotherRegisterIn(BaseModel):
    """A Kader registers a pregnant mother who has no smartphone or email: she logs in later with her phone number."""

    full_name: str = Field(min_length=2, max_length=160)
    phone: str = Field(min_length=8, max_length=20)
    region_id: int | None = None
    hpht: date | None = None
    gestational_weeks: float | None = Field(default=None, ge=1, le=42)
    mother_height_cm: float | None = Field(default=None, gt=120, lt=200)
    education: str | None = Field(default=None, pattern="^(none|sd|smp|sma|higher)$")
    gravida: int | None = Field(default=None, ge=1, le=15)
    consent_given: bool = Field(description="The mother agreed (verbally, witnessed by the Kader) to her data being recorded")


class KiaIn(BaseModel):
    item_key: str = Field(max_length=20)
    given_at: date | None = None


class AsiIn(BaseModel):
    day: date | None = None
    asi_only: bool
    feeds: int | None = Field(default=None, ge=0, le=30)
    other: list[str] = Field(default_factory=list, max_length=6)
    client_uuid: str | None = Field(default=None, max_length=64)
