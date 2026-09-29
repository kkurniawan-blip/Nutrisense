"""Demo data: a simulated posyandu network in East Nusa Tenggara (NTT), the proposal's pilot context.

All people and children are fictional. Village coordinates are approximate. Puskesmas phone numbers are
placeholders (000 exchange), not real numbers. Regional benchmarks use the NTT provincial SSGI 2024 value
(37.0%) and should be replaced with district-level SSGI figures.

Demo logins (password for all: Demo1234!)
  admin@nutrisense.id, officer@nutrisense.id, doctor@nutrisense.id,
  kader.oesapa@nutrisense.id, kader.soe@nutrisense.id, kader.baa@nutrisense.id,
  ibu.maria@nutrisense.id, ibu.yuliana@nutrisense.id, ibu.sarah@nutrisense.id
"""
from __future__ import annotations

import logging
import random
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from .ai import nutrition, symptoms
from .ai.growth import _lms, _value_at, age_in_months, compute_z_scores
from .ai import kia
from .models import (AncVisit, BreastfeedingLog, Child, Consent, Drone, GrowthMeasurement, InventoryItem, KiaRecord, Locker,
                     MaternalMeasurement, MealLog, Pregnancy, PregnancyDailyLog, Region, SupplyRequest, SymptomReport, User)
from .security import hash_password
from .services import logistics, model_registry
from .services.assessment import run_assessment

log = logging.getLogger(__name__)

DEMO_PASSWORD = "Demo1234!"
NTT_SSGI_2024 = 37.0

REGIONS = [
    # name, district, lat, lng, rural, transport difficulty, (Puskesmas, placeholder phone, km to it, posyandu day of month)
    ("Oesapa", "Kota Kupang", -10.1445, 123.6365, False, 1, ("Puskesmas Oesapa", "0380-000-101", 1.2, 8)),
    ("Baumata", "Kabupaten Kupang", -10.2167, 123.6833, True, 1, ("Puskesmas Baumata", "0380-000-102", 2.5, 12)),
    ("Uitao (Pulau Semau)", "Kabupaten Kupang", -10.2050, 123.4000, True, 3, ("Puskesmas Uitao", "0380-000-103", 6.0, 15)),
    ("Kota Soe", "Timor Tengah Selatan", -9.8600, 124.2833, True, 2, ("Puskesmas Soe", "0388-000-104", 1.8, 10)),
    ("Oinlasi", "Timor Tengah Selatan", -9.9700, 124.4700, True, 3, ("Puskesmas Oinlasi", "0388-000-105", 9.5, 20)),
    ("Baa", "Rote Ndao", -10.7333, 123.0667, True, 3, ("Puskesmas Baa", "0380-000-106", 3.0, 5)),
]


def _user(db: Session, email: str, name: str, role: str, region: Region | None, phone: str | None = None) -> User:
    u = User(email=email, password_hash=hash_password(DEMO_PASSWORD), full_name=name, role=role,
             region_id=region.id if region else None, phone=phone, language="id")
    db.add(u)
    db.flush()
    if role == "caregiver":
        for scope, granted in (("data_processing", True), ("ai_analysis", True), ("satusehat_sharing", True), ("research_use", False)):
            db.add(Consent(user_id=u.id, scope=scope, granted=granted))
    return u


def _trajectory(db: Session, child: Child, recorder: User, haz_start: float, haz_end: float, whz_start: float, whz_end: float,
                visits: int, rng: random.Random) -> None:
    today = date.today()
    age_now = age_in_months(child.birth_date, today)
    for i in range(visits):
        months_ago = (visits - 1 - i) * (1.5 if visits > 4 else 2)
        d = today - timedelta(days=int(months_ago * 30.4))
        if d <= child.birth_date:
            continue
        age = age_in_months(child.birth_date, d)
        if age > age_now:
            continue
        t = i / max(visits - 1, 1)
        haz = haz_start + (haz_end - haz_start) * t + rng.gauss(0, 0.08)
        whz = whz_start + (whz_end - whz_start) * t + rng.gauss(0, 0.1)
        key = "lfa" if age < 24 else "hfa"
        height = round(_value_at(*_lms(key, child.sex, age), haz), 1)
        wkey = "wfl" if age < 24 else "wfh"
        lms = _lms(wkey, child.sex, height)
        if lms is None:
            continue
        weight = round(_value_at(*lms, whz), 2)
        position = "lying" if age < 24 else "standing"
        z = compute_z_scores(child.sex, age, weight, height, position)
        m = GrowthMeasurement(child_id=child.id, measured_at=d, age_months=age, weight_kg=weight, height_cm=height,
                              position=position, haz=z.haz, waz=z.waz, whz=z.whz, source="kader", recorded_by_id=recorder.id,
                              measured_by="kader")
        db.add(m)
    db.flush()
    db.refresh(child)


def _meals(db: Session, child: Child, user: User, diverse: bool, rng: random.Random) -> None:
    rich = [["bubur_beras", "telur", "daun_kelor"], ["nasi", "ikan", "labu"], ["pisang"], ["nasi", "tempe", "bayam"], ["asi"]]
    poor = [["bubur_beras"], ["nasi", "sayur_sop"], ["biskuit"], ["jagung"], ["mie"]]
    for day in range(5):
        for items in (rich if diverse else poor)[: rng.randint(3, 5)]:
            its, totals, groups = nutrition.compute_meal([{"food_key": k} for k in items])
            db.add(MealLog(child_id=child.id, logged_by_id=user.id, items=its, nutrients=totals, food_groups=groups,
                           eaten_at=datetime.now(timezone.utc) - timedelta(days=day, hours=rng.randint(0, 10))))


def _symptoms(db: Session, child: Child, user: User, text: str, days_ago: int = 2) -> None:
    parsed = symptoms.interpret_rules(text)
    found = parsed["symptoms"]
    db.add(SymptomReport(child_id=child.id, reported_by_id=user.id, description=text, symptoms=found,
                         danger_signs=sorted(set(found) & symptoms.DANGER_SIGNS), appetite=parsed["appetite"],
                         duration_days=parsed["duration_days"], interpreted_by="rules",
                         created_at=datetime.now(timezone.utc) - timedelta(days=days_ago)))


def _flatten_last_weights(db: Session, child: Child, gains_kg: list[float]) -> None:
    """Make the last weighings gain less than the KBM (T), e.g. [0.05, 0.03] gives 2T. z-scores are recomputed."""
    ms = child.measurements
    for m_prev, m, g in zip(ms[-len(gains_kg) - 1:-1], ms[-len(gains_kg):], gains_kg):
        m.weight_kg = round(m_prev.weight_kg + g, 2)
        z = compute_z_scores(child.sex, m.age_months, m.weight_kg, m.height_cm, m.position)
        m.haz, m.waz, m.whz = z.haz, z.waz, z.whz
    db.flush()


def _ensure_gain(db: Session, child: Child) -> None:
    """Synthetic weights wobble with the z-score noise; lift them so every judged weighing reaches the KBM (N, not T)."""
    ms = child.measurements
    for prev, m in zip(ms, ms[1:]):
        months = (m.measured_at - prev.measured_at).days / 30.44
        if 0.5 <= months <= 2.5 and (m.weight_kg - prev.weight_kg) * 1000 / months < kia.kbm_g(m.age_months):
            m.weight_kg = round(prev.weight_kg + kia.kbm_g(m.age_months) * months * 1.15 / 1000, 2)
            z = compute_z_scores(child.sex, m.age_months, m.weight_kg, m.height_cm, m.position)
            m.haz, m.waz, m.whz = z.haz, z.waz, z.whz
    db.flush()


def _kia(db: Session, child: Child, rng: random.Random, complete: float = 1.0, skip: tuple[str, ...] = ()) -> None:
    """Mark the KIA items whose time has come as given (each with probability `complete`), on their target date."""
    s = kia.schedule(child.birth_date, {})
    for row in s["immunization"] + s["vitamin_a"] + s["deworming"]:
        if row["status"] in ("due", "overdue") and row["key"] not in skip and rng.random() < complete:
            when = min(date.fromisoformat(row["target_date"]) + timedelta(days=rng.randint(0, 10)), date.today())
            db.add(KiaRecord(child_id=child.id, item_key=row["key"], given_at=when))


def _stock(locker: Locker, **items: int) -> None:
    for key, qty in items.items():
        locker.inventory.append(InventoryItem(item_key=key, quantity=qty, reserved=0, restock_threshold=3 if locker.kind == "locker" else 20))


def seed_if_empty(db: Session) -> bool:
    if db.scalar(select(User).limit(1)) is not None:
        return False
    log.info("Seeding NutriSense demo data ...")
    rng = random.Random(7)

    regions = []
    for name, district, lat, lng, rural, diff, (pkm, phone, km, day) in REGIONS:
        r = Region(name=name, district=district, province="Nusa Tenggara Timur", lat=lat, lng=lng, rural=rural,
                   prevalence_benchmark=NTT_SSGI_2024, transport_difficulty=diff, puskesmas_name=pkm, puskesmas_phone=phone,
                   facility_km=km, posyandu_day=day)
        db.add(r)
        regions.append(r)
    db.flush()
    oesapa, baumata, semau, soe, oinlasi, baa = regions

    admin = _user(db, "admin@nutrisense.id", "Admin NutriSense", "admin", None)
    officer = _user(db, "officer@nutrisense.id", "dr. Agnes Tallo (Dinkes NTT)", "officer", oesapa)
    doctor = _user(db, "doctor@nutrisense.id", "dr. Yohanes Benu, Sp.A", "doctor", oesapa)
    kaders = {
        oesapa.id: _user(db, "kader.oesapa@nutrisense.id", "Kader Martha Lay", "kader", oesapa, "081200000001"),
        soe.id: _user(db, "kader.soe@nutrisense.id", "Kader Ferdinand Nope", "kader", soe, "081200000002"),
        baa.id: _user(db, "kader.baa@nutrisense.id", "Kader Rosalina Ndun", "kader", baa, "081200000003"),
    }
    kaders[oesapa.id].covered_region_ids = [baumata.id, semau.id]
    kaders[soe.id].covered_region_ids = [oinlasi.id]
    region_kader = {oesapa.id: kaders[oesapa.id], baumata.id: kaders[oesapa.id], semau.id: kaders[oesapa.id],
                    soe.id: kaders[soe.id], oinlasi.id: kaders[soe.id], baa.id: kaders[baa.id]}
    maria = _user(db, "ibu.maria@nutrisense.id", "Ibu Maria Fanggidae", "caregiver", baumata, "081300000001")
    yuliana = _user(db, "ibu.yuliana@nutrisense.id", "Ibu Yuliana Tefa", "caregiver", soe, "081300000002")
    sarah = _user(db, "ibu.sarah@nutrisense.id", "Ibu Sarah Pello", "caregiver", baa, "081300000003")

    # N.E.X.U.S. infrastructure
    hub_kpg = Locker(code="HUB-KPG", name="Hub Gudang Farmasi Kota Kupang", kind="hub", region_id=oesapa.id, lat=-10.1580, lng=123.6000, slots_total=500)
    hub_soe = Locker(code="HUB-SOE", name="Hub Dinkes TTS (Soe)", kind="hub", region_id=soe.id, lat=-9.8650, lng=124.2750, slots_total=300)
    for hub in (hub_kpg, hub_soe):
        _stock(hub, pmt_biscuit=200, rutf=80, ors_zinc=150, mnp_taburia=150, kelor_powder=120, vitamin_a=300, deworming=200)
    lockers = {}
    for r, code, stock in (
        (oesapa, "LKR-OSP", dict(pmt_biscuit=12, ors_zinc=10, mnp_taburia=10, kelor_powder=8, vitamin_a=20)),
        (baumata, "LKR-BMT", dict(pmt_biscuit=6, ors_zinc=5, mnp_taburia=4, kelor_powder=4, vitamin_a=10)),
        (semau, "LKR-SMU", dict(pmt_biscuit=1, ors_zinc=2)),
        (soe, "LKR-SOE", dict(pmt_biscuit=10, ors_zinc=8, mnp_taburia=6, kelor_powder=6, rutf=4, vitamin_a=15)),
        (oinlasi, "LKR-OIN", dict(pmt_biscuit=2, ors_zinc=3, kelor_powder=1)),
        (baa, "LKR-BAA", dict(pmt_biscuit=5, ors_zinc=6, mnp_taburia=3, kelor_powder=3, vitamin_a=8)),
    ):
        lk = Locker(code=code, name=f"Loker Posyandu {r.name}", kind="locker", region_id=r.id, lat=r.lat + 0.002, lng=r.lng + 0.002)
        _stock(lk, **stock)
        db.add(lk)
        lockers[r.id] = lk
    db.add_all([hub_kpg, hub_soe])
    db.flush()
    db.add_all([
        Drone(code="NX-01", hub_id=hub_kpg.id, battery_pct=100, max_range_km=90, payload_kg=3.0),
        Drone(code="NX-02", hub_id=hub_kpg.id, battery_pct=85, max_range_km=90, payload_kg=3.0),
        Drone(code="NX-03", hub_id=hub_kpg.id, battery_pct=40, max_range_km=60, payload_kg=2.0, status="charging"),
        Drone(code="NX-04", hub_id=hub_soe.id, battery_pct=100, max_range_km=80, payload_kg=3.0),
        Drone(code="NX-05", hub_id=hub_soe.id, battery_pct=95, max_range_km=80, payload_kg=2.5),
    ])
    db.flush()

    today = date.today()

    def child(name, sex, months, caregiver, region, **kw):
        c = Child(name=name, sex=sex, birth_date=today - timedelta(days=int(months * 30.44)), caregiver_id=caregiver.id,
                  kader_id=region_kader[region.id].id, region_id=region.id, **kw)
        db.add(c)
        db.flush()
        return c

    # Storyline children (one per workflow case in Chapter IV: low, moderate, high risk, emergency)
    stories = []
    c1 = child("Adel Fanggidae", "female", 20, maria, baumata, birth_weight_kg=3.1, clean_water_access=True, sanitation_access=True)
    _trajectory(db, c1, kaders[oesapa.id], 0.1, 0.2, 0.3, 0.2, 6, rng)
    _meals(db, c1, maria, diverse=True, rng=rng)
    stories.append((c1, maria))

    c2 = child("Budi Fanggidae", "male", 30, maria, baumata, birth_weight_kg=2.8, clean_water_access=True, sanitation_access=False)
    _trajectory(db, c2, kaders[oesapa.id], -1.0, -1.85, -0.2, -0.9, 6, rng)
    _meals(db, c2, maria, diverse=False, rng=rng)
    _symptoms(db, c2, maria, "Budi mencret sudah 3 hari dan tidak mau makan")
    stories.append((c2, maria))

    c3 = child("Yosef Tefa", "male", 26, yuliana, soe, birth_weight_kg=2.3, clean_water_access=False, sanitation_access=False)
    _trajectory(db, c3, kaders[soe.id], -2.1, -2.8, -1.2, -2.2, 7, rng)
    _meals(db, c3, yuliana, diverse=False, rng=rng)
    _symptoms(db, c3, yuliana, "Anak sering sakit, batuk pilek dan demam minggu ini, makan sedikit")
    stories.append((c3, yuliana))

    c4 = child("Maria Tefa", "female", 11, yuliana, soe, birth_weight_kg=2.9, clean_water_access=False, sanitation_access=True)
    _trajectory(db, c4, kaders[soe.id], -0.8, -1.3, -0.4, -1.0, 5, rng)
    stories.append((c4, yuliana))

    c5 = child("Kevin Pello", "male", 40, sarah, baa, birth_weight_kg=2.6, clean_water_access=True, sanitation_access=False)
    _trajectory(db, c5, kaders[baa.id], -2.6, -3.2, -1.5, -1.9, 6, rng)
    stories.append((c5, sarah))

    c6 = child("Grace Pello", "female", 8, sarah, baa, birth_weight_kg=3.0)
    _trajectory(db, c6, kaders[baa.id], 0.4, 0.3, 0.1, 0.0, 4, rng)
    _meals(db, c6, sarah, diverse=True, rng=rng)
    stories.append((c6, sarah))

    # A 3-month-old on the ASI eksklusif tracker (no meal log before 6 months).
    c7 = child("Kristo Pello", "male", 3.2, sarah, baa, birth_weight_kg=3.2, birth_length_cm=49, birth_gestational_weeks=39,
               exclusive_breastfeeding=True)
    _trajectory(db, c7, kaders[baa.id], 0.1, 0.0, 0.2, 0.1, 3, rng)
    for i in range(1, 8):
        db.add(BreastfeedingLog(child_id=c7.id, day=today - timedelta(days=i), asi_only=True, feeds=rng.randint(8, 11)))
    stories.append((c7, sarah))

    # Budi: weight did not go up at the last two weighings (2T). Kevin: oedema of both feet at the last visit.
    for c in (c1, c4, c6, c7):
        _ensure_gain(db, c)
    _flatten_last_weights(db, c2, [0.05, 0.03])
    c5.measurements[-1].oedema = True
    c1.measurements[-1].measured_by = "mother"
    c1.measurements[-1].source = "app"
    # Buku KIA: Adel complete, Budi missed the 12- and 18-month vaccines, the others partly done.
    _kia(db, c1, rng)
    _kia(db, c2, rng, skip=("imm_12", "imm_18"))
    _kia(db, c3, rng, skip=("imm_9", "imm_12", "imm_18", "vita_18", "vita_24"))
    _kia(db, c4, rng, skip=("imm_9",))
    _kia(db, c5, rng, skip=("imm_18", "worm_36"))
    _kia(db, c6, rng, skip=("vita_6",))
    _kia(db, c7, rng, skip=("imm_3",))

    # Background cohort for the regional heat map
    first = ["Ana", "Beni", "Citra", "Dewi", "Elias", "Fransiska", "Gabriel", "Hana", "Imanuel", "Junita", "Klemens", "Lusia",
             "Markus", "Natalia", "Oktavianus", "Petrus", "Regina", "Stefanus", "Theresia", "Vinsensius"]
    last = ["Ndun", "Lay", "Nope", "Benu", "Tallo", "Manu", "Kase", "Bani", "Seran", "Sabu"]
    region_bias = {oesapa.id: -0.6, baumata.id: -1.3, semau.id: -1.8, soe.id: -1.7, oinlasi.id: -2.0, baa.id: -1.6}
    cohort = []
    for i in range(42):
        r = regions[i % len(regions)]
        cg = _user(db, f"caregiver{i + 1}@demo.nutrisense.id", f"Orang tua {i + 1}", "caregiver", r)
        months = rng.uniform(4, 58)
        c = child(f"{rng.choice(first)} {rng.choice(last)}", rng.choice(["male", "female"]), months, cg, r,
                  birth_weight_kg=round(rng.gauss(2.95, 0.4), 2), clean_water_access=rng.random() < 0.65,
                  sanitation_access=rng.random() < 0.6)
        start = rng.gauss(region_bias[r.id], 0.9)
        _trajectory(db, c, region_kader[r.id], start, start + rng.gauss(-0.15, 0.3), rng.gauss(-0.4, 0.8), rng.gauss(-0.5, 0.8),
                    rng.randint(2, 5), rng)
        if rng.random() < 0.3:
            _symptoms(db, c, cg, rng.choice(["demam dan batuk 2 hari", "diare sejak kemarin", "susah makan", "pilek"]), rng.randint(1, 10))
        if i % 8:  # most children gain weight as they should; a few show T / 2T
            _ensure_gain(db, c)
        _kia(db, c, rng, complete=rng.choice([1.0, 1.0, 0.85, 0.6]))
        c.exclusive_breastfeeding = rng.random() < 0.65
        cohort.append((c, cg))

    # Ibu hamil: Maria at 24 weeks (K1-K2 done, KEK and anaemia at her last check), Yuliana at 33 weeks, a new one in Oesapa.
    def pregnancy(mother, region, weeks, height, education, gravida, anc_weeks, checks, ttd_days, pmt_days, plan=None):
        hpht = today - timedelta(days=weeks * 7)
        p = Pregnancy(mother_id=mother.id, region_id=region.id, kader_id=region_kader[region.id].id, hpht=hpht, mother_height_cm=height,
                      education=education, gravida=gravida, birth_plan=plan or {})
        db.add(p)
        db.flush()
        for n, w in enumerate(anc_weeks, start=1):
            db.add(AncVisit(pregnancy_id=p.id, number=n, visit_date=hpht + timedelta(weeks=w), place="Puskesmas"))
        for w, muac, hb in checks:
            db.add(MaternalMeasurement(pregnancy_id=p.id, measured_at=hpht + timedelta(weeks=w), gestational_weeks=w, muac_cm=muac, hb_g_dl=hb,
                                       recorded_by_id=region_kader[region.id].id))
        for i in range(1, 8):
            db.add(PregnancyDailyLog(pregnancy_id=p.id, day=today - timedelta(days=i), ttd=i <= ttd_days, pmt=i <= pmt_days))
        return p

    pregnancy(maria, baumata, 24, 149.0, "sma", 3, [9, 18], [(9, 23.2, 11.2), (18, 22.8, 10.4)], 5, 3, {"place": "puskesmas"})
    pregnancy(yuliana, soe, 33, 152.0, "smp", 2, [11, 16, 23, 29], [(16, 24.5, 11.8), (29, 25.0, 11.5)], 7, 0,
              {"place": "puskesmas", "transport": "ojek", "companion": "Suami"})
    oesapa_mother = _user(db, "ibu.agustina@nutrisense.id", "Ibu Agustina Lay", "caregiver", oesapa, "081300000004")
    pregnancy(oesapa_mother, oesapa, 9, 155.0, "sma", 1, [], [], 2, 0)

    # More mothers in the area, so the officer dashboard (KEK, anaemia, K6 coverage) has something to count.
    anc_weeks = [10, 18, 23, 28, 33, 37]
    for i, weeks, height, muac, hb, n_visits in (
        (0, 30, 150.0, 23.0, 10.2, 3), (1, 16, 146.0, 24.8, 11.4, 1), (2, 36, 143.0, 22.5, 11.6, 3),
        (3, 20, 155.0, 25.2, 9.8, 2), (4, 12, 151.0, None, None, 0), (5, 27, 149.0, 23.9, 10.8, 3),
    ):
        cg = cohort[i][1]
        pregnancy(cg, cg.region, weeks, height, "smp", 2, [w for w in anc_weeks[:n_visits] if w <= weeks],
                  [(weeks - 2, muac, hb)] if muac else [], rng.randint(2, 7), 0)
    for i, days_ago, n_visits in ((6, 60, 6), (7, 120, 4), (8, 200, 6), (9, 250, 5), (10, 30, 6), (11, 150, 3)):
        cg = cohort[i][1]
        born = today - timedelta(days=days_ago)
        p = pregnancy(cg, cg.region, 39 + days_ago // 7, 152.0, "sd", 3, anc_weeks[:n_visits], [], 0, 0)
        p.status, p.delivered_at, p.birth_info = "delivered", born, {"place": "puskesmas", "attendant": "bidan", "gestational_weeks": 39}
    db.commit()

    model_registry.get_active(db)
    for c, _ in stories + cohort:
        db.refresh(c)
        if c.measurements:
            run_assessment(db, c, region_kader[c.region_id], "id", use_ai=False)

    # Show every logistics state: ready at locker, drone in flight, pending approval.
    pending = db.scalars(select(SupplyRequest).where(SupplyRequest.status == "pending_approval").order_by(SupplyRequest.id)).all()
    for req in pending:
        if req.child_id == c2.id:
            logistics.approve(db, req, kaders[oesapa.id])
        elif req.child.region_id == semau.id and not any(i["item_key"] == "rutf" for i in req.items):
            logistics.approve(db, req, officer)
            break
    db.commit()
    log.info("Demo data ready: %d children, %d lockers", len(stories) + len(cohort), len(lockers))
    return True
