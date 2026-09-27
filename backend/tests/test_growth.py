import pytest

from app.ai.growth import _lms, _value_at, classify_haz, compute_z_scores, plausibility_errors
from app.ai.trend import fit_prevalence, growth_trend


@pytest.mark.parametrize("sex", ["male", "female"])
@pytest.mark.parametrize("age", [0, 6, 12, 23.5, 24, 36, 59])
def test_who_median_and_minus_two_sd(sex, age):
    key = "lfa" if age < 24 else "hfa"
    l, m, s = _lms(key, sex, age)
    pos = "lying" if age < 24 else "standing"
    wl, wm, ws = _lms("wfa", sex, age)
    z = compute_z_scores(sex, age, wm, m, pos)
    assert z.haz == pytest.approx(0, abs=0.01)
    assert z.waz == pytest.approx(0, abs=0.01)
    z2 = compute_z_scores(sex, age, wm, _value_at(l, m, s, -2), pos)
    assert z2.haz == pytest.approx(-2, abs=0.01)


def test_published_who_values():
    # WHO LHFA boys at 24 months (standing height): median 87.1 cm, -2 SD 81.0 cm (published z-score table).
    assert compute_z_scores("male", 24, 12.2, 81.0, "standing").haz == pytest.approx(-2, abs=0.05)
    # WHO WFA girls at 12 months: median 8.9 kg.
    assert compute_z_scores("female", 12, 8.9, 74.0, "lying").waz == pytest.approx(0, abs=0.05)


def test_position_correction():
    lying = compute_z_scores("male", 30, 12.5, 90.0, "lying")
    standing = compute_z_scores("male", 30, 12.5, 90.0, "standing")
    assert lying.haz < standing.haz  # 0.7 cm subtracted for lying measurement after 24 months


def test_restricted_weight_zscore_is_finite_and_flags_implausible():
    z = compute_z_scores("female", 18, 30.0, 80.0, "lying")
    assert z.whz > 3
    assert "implausible_whz" in plausibility_errors(18, 30.0, 80.0, z)


def test_age_out_of_range():
    with pytest.raises(ValueError):
        compute_z_scores("male", 72, 20, 110)


def test_classification():
    assert classify_haz(-3.2) == "severely_stunted"
    assert classify_haz(-2.1) == "stunted"
    assert classify_haz(-1.5) == "at_risk"
    assert classify_haz(0.3) == "normal"


def test_growth_trend_projects_stunting():
    pts = [(12, -1.0), (14, -1.2), (16, -1.4), (18, -1.6)]
    t = growth_trend(pts, "female")
    assert t["status"] == "projected_stunting"
    assert t["haz_velocity_per_month"] == pytest.approx(-0.1, abs=0.01)
    assert t["projections"][0]["expected_height_cm"] < t["projections"][0]["median_height_cm"]


def test_growth_trend_insufficient_history():
    assert growth_trend([(12, -1.0)], "male")["status"] == "insufficient_history"


def test_prevalence_fit_selects_by_cross_validation():
    res = fit_prevalence([2013, 2018, 2019, 2021, 2022, 2023, 2024], [37.2, 30.8, 27.7, 24.4, 21.6, 21.5, 19.8], until=2027)
    best = res["cv_rmse"][f"degree_{res['selected_degree']}"]
    assert best == min(res["cv_rmse"].values())
    # In-sample RMSE alone would pick the cubic; held-out error does not.
    assert min(res["rmse"], key=res["rmse"].get) == "degree_3"
    assert [p["year"] for p in res["projection"]] == [2025, 2026, 2027]


def test_prevalence_fit_refuses_cubic_on_four_points():
    res = fit_prevalence([2021, 2022, 2023, 2024], [37.8, 35.3, 37.9, 37.0])
    assert res["selected_degree"] == 1
    assert all(10 < p["value"] < 60 for p in res["projection"])
