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
  puskesmas_name?: string | null;
  puskesmas_phone?: string | null;
  facility_km?: number | null;
}

/** Nearest Puskesmas for the emergency card: phone, distance and the ambulance number. */
export interface Facility {
  name: string;
  phone: string | null;
  distance_km: number | null;
  transport_difficulty: number;
  ambulance: string;
}

export interface Posyandu {
  date: string;
  days: number;
  place: string;
}

/** "Every figure shows its source and year." */
export interface SourceRef {
  label: string | { id: string; en: string };
  year: number;
}

export interface User {
  id: number;
  email: string | null;
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
  measured_by?: 'mother' | 'kader' | null;
  oedema?: boolean | null;
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
  birth_gestational_weeks?: number | null;
  exclusive_breastfeeding?: boolean | null;
  clean_water_access: boolean;
  sanitation_access: boolean;
  weight_gain?: WeightGain;
  latest_measurement: Measurement | null;
  measurement_count: number;
  latest_assessment: Assessment | null;
  care_team?: CareMember[];
  professional_recommendations?: ProRecommendation[];
  last_reviewed?: ProRecommendation | null;
  facility?: Facility | null;
  posyandu?: Posyandu | null;
}

/** KMS weighing results: N (naik), T (tidak naik, below the minimum gain) or O (not judged). */
export interface WeightGain {
  weighings: { date: string; result: 'N' | 'T' | 'O'; gain_g: number; kbm_g: number }[];
  not_gaining: number;
  two_t: boolean;
  source: string;
}

export interface KiaItem {
  key: string;
  age: number;
  vaccines?: string[];
  dose?: 'biru' | 'merah';
  target_date: string;
  status: VisitStatus;
  given_at: string | null;
}

export interface KiaSchedule {
  age_months: number;
  immunization: KiaItem[];
  vitamin_a: KiaItem[];
  deworming: KiaItem[];
  next: KiaItem | null;
  source: string;
}

export interface AsiTracker {
  age_months: number;
  in_window: boolean;
  days_logged: number;
  days_asi_only: number;
  broken: boolean;
  until: string;
  streak: number;
  week: { day: string; asi_only: boolean | null; feeds: number | null }[];
  today: { asi_only: boolean; feeds: number | null; other: string[] } | null;
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
  items: { key: string; status: ChecklistStatus; text: string; action: 'measure' | 'meal' | 'symptoms' | 'pickups' | 'asi' | 'kia'; count?: number }[];
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
  type: 'locker_stock' | 'courier';
  locker_name: string;
  locker_code: string;
  hub_name?: string;
  distance_km?: number;
  distance_to_family_km?: number;
  eta_minutes: number;
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
  family?: { name: string; phone: string | null } | null;
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

export type VisitStatus = 'done' | 'due' | 'overdue' | 'upcoming';

export interface AncVisit {
  number: number;
  trimester: 1 | 2 | 3;
  from_week: number;
  to_week: number;
  target_week: number;
  doctor: boolean;
  window_start: string;
  window_end: string;
  target_date: string;
  status: VisitStatus;
  visit_date: string | null;
  place: string | null;
}

export interface NifasVisit {
  code: string;
  who: 'mother' | 'baby';
  from_day: number;
  to_day: number;
  window_start: string;
  window_end: string;
  status: VisitStatus;
}

export interface MotherFlag {
  code: 'kek' | 'anemia' | 'severe_anemia' | 'short_stature';
  status: 'action' | 'urgent' | 'monitor';
  value: number;
}

export interface Pregnancy {
  id: number;
  mother_id: number;
  mother_name: string;
  region: Region | null;
  status: 'active' | 'delivered' | 'ended';
  hpht: string;
  hpl: string;
  gestational_days: number;
  gestational_weeks: number;
  gestational_extra_days: number;
  trimester: 1 | 2 | 3;
  days_to_hpl: number;
  mother_height_cm: number | null;
  education: string | null;
  gravida: number | null;
  birth_plan: { place?: string; transport?: string; companion?: string; helper?: string; blood_donor?: string; funding?: string };
  measurements: { id: number; measured_at: string; gestational_weeks: number; muac_cm: number | null; hb_g_dl: number | null; weight_kg: number | null }[];
  latest: { muac_cm: number | null; hb_g_dl: number | null };
  flags: MotherFlag[];
  risk: MotherRisk;
  facility: Facility | null;
  anc: AncVisit[];
  next_anc: AncVisit | null;
  anc_done: number;
  anc_missed: number;
  daily_week: { day: string; ttd: boolean; pmt: boolean }[];
  today_log: { ttd: boolean; pmt: boolean };
  ttd_total: number;
  pmt_needed: boolean;
  today: { key: string; status: ChecklistStatus; text: string; action: 'supplements' | 'anc' | 'measure' | 'danger' }[];
  care_team: { role: string; emoji: string; name: string; label: string; phone?: string | null }[];
  delivered_at: string | null;
  child_id: number | null;
  birth_info: { place?: string | null; attendant?: string | null; gestational_weeks?: number | null };
  nifas: NifasVisit[] | null;
}

/** One level for the mother: Belum dicek, Risiko rendah, Perlu dipantau, Risiko sedang, Risiko tinggi. */
export interface MotherRisk {
  key: 'unknown' | 'ok' | 'monitor' | 'action' | 'urgent';
  label: string;
  reasons: string[];
  contact: boolean;
}
