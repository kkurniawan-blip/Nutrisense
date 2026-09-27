export type Role = 'caregiver' | 'kader' | 'officer' | 'doctor' | 'admin';
export type RiskLevel = 'low' | 'medium' | 'high';
export type Lang = 'id' | 'en';

export interface Region {
  id: number;
  name: string;
  district: string;
  province: string;
  lat: number;
  lng: number;
  rural: boolean;
  prevalence_benchmark: number | null;
  transport_difficulty: number;
}

export interface User {
  id: number;
  email: string;
  full_name: string;
  phone: string | null;
  role: Role;
  region_id: number | null;
  region: Region | null;
  language: Lang;
  covered_region_ids: number[];
}

export interface Measurement {
  id: number;
  child_id: number;
  measured_at: string;
  age_months: number;
  weight_kg: number;
  height_cm: number;
  muac_cm: number | null;
  position: 'lying' | 'standing';
  haz: number | null;
  waz: number | null;
  whz: number | null;
  haz_class: string;
  waz_class: string;
  whz_class: string;
  source: string;
}

export interface Reason {
  code: string;
  text: string;
}

export interface Action {
  code: string;
  text: string;
}

export interface Supply {
  item_key: string;
  quantity: number;
  name: string;
  needs_doctor: boolean;
}

export interface Projection {
  age_months: number;
  haz: number;
  expected_height_cm: number | null;
  median_height_cm: number | null;
}

export interface Trend {
  status: 'no_data' | 'insufficient_history' | 'projected_stunting' | 'declining' | 'catching_up' | 'stable';
  current_haz?: number;
  haz_velocity_per_month?: number;
  projections?: Projection[];
}

export interface Assessment {
  id: number;
  child_id: number;
  risk_level: RiskLevel;
  model_risk_level: RiskLevel;
  probabilities: Record<RiskLevel, number>;
  confidence: number;
  needs_review: boolean;
  guardrail: string | null;
  explanation: { feature: string; value: number; contribution: number }[];
  reasons: Reason[];
  triage: {
    urgency: 'emergency' | 'doctor_48h' | 'kader_7d' | 'routine';
    referral: string;
    escalate: boolean;
    actions: Action[];
    supplies: Supply[];
    disclaimer: string;
  };
  trend: Trend;
  features: Record<string, unknown>;
  reviewed_level: RiskLevel | null;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  child_name?: string;
}

export interface Child {
  id: number;
  name: string;
  sex: 'male' | 'female';
  birth_date: string;
  age_months: number;
  caregiver_id: number;
  caregiver_name: string | null;
  kader_id: number | null;
  region_id: number | null;
  region: Region | null;
  birth_weight_kg: number | null;
  clean_water_access: boolean;
  sanitation_access: boolean;
  latest_measurement: Measurement | null;
  measurement_count: number;
  latest_assessment: Assessment | null;
}

export interface SymptomReport {
  id: number;
  child_id: number;
  description: string | null;
  symptoms: string[];
  danger_signs: string[];
  appetite: string | null;
  duration_days: number | null;
  interpreted_by: string;
  summary: string | null;
  created_at: string;
}

export interface Food {
  key: string;
  name: string;
  group: string;
  group_name: string;
  portion_g: number;
  per100: Record<string, number>;
}

export interface MealItem {
  food_key: string;
  name: string;
  grams: number;
  known?: boolean;
  confidence?: number;
}

export interface Meal {
  id: number;
  child_id: number;
  eaten_at: string;
  meal_type: string | null;
  items: MealItem[];
  nutrients: Record<string, number>;
  food_groups: string[];
  source: string;
}

export interface NutritionPlan {
  id: number;
  headline: string;
  daily_targets: Record<string, number>;
  intake: {
    days_logged: number;
    average: Record<string, number> | null;
    percent_of_need: Record<string, number | null> | null;
    gaps: string[];
    gap_labels?: string[];
    dietary_diversity: number | null;
    mdd_met: boolean | null;
  };
  focus_nutrients: { key: string; label: string }[];
  priority_foods: { key: string; name: string; portion_g: number }[];
  recipes: { key: string; name: string; steps: string; min_age_months: number; targets: string[] }[];
  tips: string[];
  meal_plan: { meal: string; menu: string; why: string }[];
  cautions: string[];
  generated_by: string;
  created_at: string;
}

export interface Locker {
  id: number;
  code: string;
  name: string;
  kind: 'locker' | 'hub';
  lat: number;
  lng: number;
  status: string;
  inventory: { item_key: string; name: string; quantity: number; reserved: number; available: number; restock_threshold: number; low: boolean }[];
}

export interface LogisticsOption {
  type: 'locker_stock' | 'drone' | 'courier';
  locker_name: string;
  locker_code: string;
  hub_name?: string;
  drone_code?: string | null;
  distance_km?: number;
  distance_to_family_km?: number;
  eta_minutes: number;
  battery_needed_pct?: number;
  weather_risk?: number;
  feasible: boolean;
  reason: string;
}

export interface SupplyRequest {
  id: number;
  child_id: number;
  child_name: string;
  case_id: number | null;
  items: Supply[];
  urgency: string;
  status: string;
  fulfillment: string | null;
  locker: { id: number; code: string; name: string; lat: number; lng: number } | null;
  pickup_code: string | null;
  qr_payload: string | null;
  decision: { chosen?: LogisticsOption | null; options?: LogisticsOption[] };
  expires_at: string | null;
  ready_at: string | null;
  picked_up_at: string | null;
  created_at: string;
}

export interface CaseItem {
  id: number;
  child_id: number;
  child_name: string;
  region: Region | null;
  status: string;
  priority: 'low' | 'medium' | 'high' | 'emergency';
  urgency: string | null;
  assigned_to_id: number | null;
  assessment: Assessment | null;
  created_at: string;
  notes: { id: number; author: string; author_role: string; text: string; created_at: string }[];
}

export interface Notification {
  id: number;
  kind: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read: boolean;
  created_at: string;
}
