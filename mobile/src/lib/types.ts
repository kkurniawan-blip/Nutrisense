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
  reviewed_by_name?: string | null;
  reviewed_by_role?: Role | null;
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
  care_team?: CareMember[];
  professional_recommendations?: ProRecommendation[];
  last_reviewed?: ProRecommendation | null;
}

export interface CareMember {
  role: 'caregiver' | 'kader' | 'facility';
  emoji: string;
  name: string;
  label: string;
  phone?: string | null;
}

export interface ProRecommendation {
  kind: 'review' | 'note';
  author: string;
  role: Role;
  role_label?: string;
  text: string;
  reviewed_level?: RiskLevel | null;
  at: string;
}

export type ChecklistStatus = 'ok' | 'monitor' | 'action' | 'urgent' | 'info';

export interface TodayChecklist {
  child_id: number;
  items: { key: string; status: ChecklistStatus; text: string; action: 'measure' | 'meal' | 'symptoms' | 'pickups'; count?: number }[];
  groups_today: string[];
}

export interface Development {
  band_months: number | null;
  domains: {
    key: 'motor' | 'language' | 'social' | 'cognitive';
    label: string;
    emoji: string;
    status: 'on_track' | 'monitor' | 'unknown';
    items: { key: string; text: string; achieved: boolean | null }[];
  }[];
  activities: { emoji: string; text: string }[];
  note: string;
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
  recipes: Recipe[];
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
  notes: { id: number; author: string; author_role: string; text: string; visible_to_caregiver?: boolean; created_at: string }[];
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

export interface Recipe {
  key: string;
  name: string;
  min_age_months: number;
  minutes: number;
  cost: number;
  cost_label: string;
  meal: 'main' | 'snack';
  foods: string[];
  food_groups: string[];
  ingredients: string[];
  steps: string[];
  targets: string[];
  why?: string;
  adds_groups?: string[];
}

/** NutriScan: a recipe ranked for the foods on hand. */
export interface KitchenRecipe extends Recipe {
  have: { key: string; name: string }[];
  need: { key: string; name: string; price_idr: number; where: string }[];
  need_cost_idr: number;
  total_cost_idr: number;
  benefits: { key: string; text: string }[];
  highlights: string[];
}

export interface KitchenResult {
  child_id: number;
  child_name: string;
  age_months: number;
  detected: { key: string; name: string }[];
  swaps: { key: string; text: string }[];
  best: KitchenRecipe | null;
  others: KitchenRecipe[];
  ai_ideas: MenuIdea[];
  age_note: string | null;
  price_note: string;
  generated_by: string;
}

export interface MenuIdea {
  name: string;
  minutes: number;
  ingredients: string[];
  steps: string[];
  why: string;
}

export interface MenuSuggestions {
  groups_today: string[];
  missing_groups: { key: string; label: string }[];
  present_groups?: { key: string; label: string }[];
  simple_idea?: { text: string; recipe_key: string | null } | null;
  suggestions: Recipe[];
  ai_ideas: MenuIdea[];
  generated_by: string;
  note?: string;
}

export type AreaGroup = 'followup' | 'attention' | 'monitored' | 'unassessed';
export interface AreaChildRow {
  child_id: number;
  name: string;
  age_months: number;
  sex: 'male' | 'female';
  region: string | null;
  region_id: number | null;
  group: AreaGroup;
  risk_level: RiskLevel | null;
  urgency: Assessment['triage']['urgency'] | null;
  reason: string | null;
  last_measured_at: string | null;
  days_since_measured: number | null;
  open_case: boolean;
  needs_visit: boolean;
  is_new: boolean;
}
export interface AreaChildren {
  counts: Record<AreaGroup | 'total', number>;
  matched: number;
  rows: AreaChildRow[];
  offset: number;
  limit: number;
  regions: { id: number; name: string }[];
}
