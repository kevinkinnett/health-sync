"""Check-logic tests for health_data_invariants (fake rows, no database).

Written as unittest.TestCase with plain asserts so both CI's
``python -m unittest discover -s tests`` and ``pytest`` collect them.
"""

import sys
import types
import unittest
from datetime import date, timedelta

# The script imports its Windmill runtime deps at top level (Windmill only
# infers top-level imports); CI's test requirements carry neither.
for _name in ("psycopg", "wmill"):
    try:
        __import__(_name)
    except ModuleNotFoundError:
        sys.modules[_name] = types.ModuleType(_name)

import health_data_invariants as inv  # noqa: E402

TODAY = date(2026, 10, 16)
D = lambda s: date.fromisoformat(s)  # noqa: E731


def checks(violations):
    return [v["check"] for v in violations]


class ColumnFreshnessTests(unittest.TestCase):
    def test_live_column_stale_is_alert(self):
        out = inv.check_column_freshness([
            {"table": "fitbit_activity_daily", "column": "steps",
             "last_non_null": TODAY - timedelta(days=3), "null_rate": 0.0},
        ], TODAY)
        assert checks(out) == ["stale_column"]
        assert out[0]["severity"] == "alert"

    def test_never_populated_live_column_is_stale(self):
        out = inv.check_column_freshness([
            {"table": "fitbit_hrv_daily", "column": "deep_rmssd", "last_non_null": None, "null_rate": 1.0},
        ], TODAY)
        assert checks(out) == ["stale_column", "null_rate"]

    def test_frozen_column_is_silent_until_it_revives(self):
        frozen = {"table": "fitbit_activity_daily", "column": "calories_bmr",
                  "last_non_null": D("2026-06-11"), "null_rate": 1.0}
        assert inv.check_column_freshness([frozen], TODAY) == []
        revived = dict(frozen, last_non_null=TODAY)
        assert checks(inv.check_column_freshness([revived], TODAY)) == ["frozen_column_revived"]

    def test_sparse_columns_and_tables_are_exempt(self):
        rows = [
            {"table": "fitbit_food_log_daily", "column": "calories_in",
             "last_non_null": D("2026-08-23"), "null_rate": 0.0},
            {"table": "fitbit_exercise_log", "column": "steps",
             "last_non_null": D("2026-09-23"), "null_rate": 0.81},
        ]
        assert inv.check_column_freshness(rows, TODAY) == []

    def test_high_null_rate_on_fresh_column_warns(self):
        out = inv.check_column_freshness([
            {"table": "fitbit_heart_rate_daily", "column": "zone_cardio_min",
             "last_non_null": TODAY, "null_rate": 0.20},
        ], TODAY)
        assert checks(out) == ["null_rate"]
        assert out[0]["severity"] == "warn"


class RollupDriftTests(unittest.TestCase):
    def test_exact_match_is_clean(self):
        days = {D("2026-10-14"): 5284, D("2026-10-15"): 5652}
        assert inv.check_rollup_drift("steps", days, dict(days), TODAY) == []

    def test_rounding_within_tolerance(self):
        out = inv.check_rollup_drift(
            "breathing_rate", {D("2026-10-15"): 12.4}, {D("2026-10-15"): 12.41}, TODAY)
        assert out == []

    def test_edge_day_truncation_is_alert(self):
        # The 2026-07 steps bug: a settled day rewritten with a 4-hour sliver.
        out = inv.check_rollup_drift(
            "steps", {D("2026-06-01"): 6100}, {D("2026-06-01"): 310}, TODAY, stored_may_exceed=True)
        assert checks(out) == ["rollup_drift"]
        assert out[0]["severity"] == "alert"

    def test_monotone_stored_above_raw_only_warns(self):
        out = inv.check_rollup_drift(
            "steps", {D("2026-04-03"): 2418}, {D("2026-04-03"): 2549}, TODAY, stored_may_exceed=True)
        assert out[0]["severity"] == "warn"

    def test_missing_and_orphan_rows(self):
        out = inv.check_rollup_drift(
            "spo2_avg",
            {D("2026-07-05"): 94.1},
            {D("2026-07-04"): 92.52},
            TODAY,
        )
        assert sorted(checks(out)) == ["rollup_missing", "rollup_orphan"]

    def test_today_is_skipped(self):
        assert inv.check_rollup_drift("steps", {TODAY: 2469}, {TODAY: 900}, TODAY) == []


class DistanceTests(unittest.TestCase):
    def test_merged_phone_distance_is_flagged(self):
        # 2026-10-10: watch 1750 steps / 1.184 km, stored rollup 1.908 km.
        out = inv.check_distance_consistency([
            {"date": D("2026-10-10"), "steps": 1750, "distance_km": 1.908, "raw_fitbit_km": 1.184},
        ], TODAY)
        assert checks(out) == ["distance_source_mismatch", "steps_per_km"]
        assert out[1]["steps_per_km"] == 917

    def test_normal_walking_day_is_clean(self):
        out = inv.check_distance_consistency([
            {"date": D("2026-10-13"), "steps": 5284, "distance_km": 3.567, "raw_fitbit_km": 3.567},
        ], TODAY)
        assert out == []

    def test_small_revision_within_tolerance(self):
        out = inv.check_distance_consistency([
            {"date": D("2026-06-25"), "steps": 6670, "distance_km": 4.522, "raw_fitbit_km": 4.537},
        ], TODAY)
        assert out == []

    def test_low_step_days_skip_steps_per_km(self):
        out = inv.check_distance_consistency([
            {"date": D("2026-10-01"), "steps": 400, "distance_km": 0.5, "raw_fitbit_km": 0.5},
        ], TODAY)
        assert out == []


class SleepTests(unittest.TestCase):
    def test_plausible_night_is_clean(self):
        assert inv.check_sleep_plausibility([
            {"date": D("2026-10-15"), "asleep": 420, "in_bed": 470, "efficiency": 89,
             "deep": 70, "light": 260, "rem": 90},
        ]) == []

    def test_asleep_exceeding_in_bed(self):
        out = inv.check_sleep_plausibility([
            {"date": D("2026-10-15"), "asleep": 480, "in_bed": 470, "efficiency": 100,
             "deep": None, "light": None, "rem": None},
        ])
        assert checks(out) == ["sleep_exceeds_in_bed"]

    def test_short_night_and_stage_overflow(self):
        out = inv.check_sleep_plausibility([
            {"date": D("2026-03-07"), "asleep": 100, "in_bed": 110, "efficiency": 91,
             "deep": 50, "light": 50, "rem": 20},
        ])
        assert checks(out) == ["sleep_duration", "sleep_stage_sum"]


class RestingHrTests(unittest.TestCase):
    def test_range_and_jump(self):
        out = inv.check_resting_hr([
            {"date": D("2026-10-02"), "resting_heart_rate": 82},
            {"date": D("2026-10-01"), "resting_heart_rate": 64},
            {"date": D("2026-10-03"), "resting_heart_rate": 120},
        ])
        assert checks(out) == ["rhr_jump", "rhr_range", "rhr_jump"]

    def test_gap_day_does_not_count_as_jump(self):
        out = inv.check_resting_hr([
            {"date": D("2026-10-01"), "resting_heart_rate": 60},
            {"date": D("2026-10-05"), "resting_heart_rate": 80},
        ])
        assert out == []


class ZoneNullTests(unittest.TestCase):
    def test_worn_day_with_null_zones(self):
        out = inv.check_zone_nulls([
            {"date": D("2026-10-12"), "steps": 4168, "zone_cardio_min": None},
            {"date": D("2026-10-13"), "steps": 5284, "zone_cardio_min": 0},
            {"date": TODAY, "steps": 100, "zone_cardio_min": None},
        ], TODAY)
        assert [v["date"] for v in out] == ["2026-10-12"]


class VeryActivePlausibilityTests(unittest.TestCase):
    # Real stored rows (fitbit_activity_daily + fitbit_heart_rate_daily); zone
    # = fat-burn + cardio + peak minutes.
    @staticmethod
    def row(day, steps, very, zone):
        return {"date": D(day), "steps": steps, "minutes_very_active": very, "zone_minutes": zone}

    def test_march_2026_watch_artifact_days_are_flagged(self):
        out = inv.check_very_active_plausibility([
            self.row("2026-03-18", 6022, 138, 5),     # window's smallest very-active
            self.row("2026-03-24", 7208, 519, 20),    # window's largest
            self.row("2026-03-30", 3052, 428, 57),    # window's most HR-zone minutes
            self.row("2026-04-02", 7438, 205, 14),    # window's most steps
        ])
        assert checks(out) == ["very_active_implausible"] * 4
        assert {v["severity"] for v in out} == {"alert"}
        assert out[1]["minutes_very_active"] == 519 and out[1]["steps"] == 7208

    def test_low_step_vigorous_day_backed_by_heart_rate_is_fine(self):
        # 2025-09-28: 124 very-active on 6,048 steps, but 156 HR-zone minutes
        # (a logged non-walking workout). Steps alone would flag it.
        assert inv.check_very_active_plausibility([self.row("2025-09-28", 6048, 124, 156)]) == []

    def test_long_walking_day_is_fine(self):
        # 2026-04-17: 295 very-active on 18,984 steps (64 steps/min).
        assert inv.check_very_active_plausibility([self.row("2026-04-17", 18984, 295, 327)]) == []

    def test_below_minimum_very_active_is_ignored(self):
        assert inv.check_very_active_plausibility([self.row("2026-03-16", 2000, 119, 0)]) == []

    def test_missing_zone_data_falls_back_to_steps(self):
        out = inv.check_very_active_plausibility([
            self.row("2026-03-19", 1548, 304, None),
            self.row("2026-04-17", 18984, 295, None),
        ])
        assert [v["date"] for v in out] == ["2026-03-19"]

    def test_null_activity_columns_are_skipped(self):
        assert inv.check_very_active_plausibility([
            self.row("2025-01-05", 3719, None, None),
            self.row("2025-01-06", None, 200, None),
        ]) == []


class WeightDuplicateTests(unittest.TestCase):
    def test_legacy_and_google_same_weigh_in(self):
        out = inv.check_weight_duplicates([
            {"date": D("2026-03-28"), "log_id": 1774729597000, "weight_kg": 88.5, "source": "API"},
            {"date": D("2026-03-28"), "log_id": -105809471495785, "weight_kg": 88.59, "source": "google_health"},
        ])
        assert checks(out) == ["duplicate_weight"]
        assert len(out[0]["log_ids"]) == 2

    def test_two_real_weigh_ins_same_source_are_fine(self):
        assert inv.check_weight_duplicates([
            {"date": D("2026-09-29"), "log_id": -1, "weight_kg": 84.0, "source": "google_health"},
            {"date": D("2026-09-29"), "log_id": -2, "weight_kg": 83.6, "source": "google_health"},
        ]) == []


class MiscTests(unittest.TestCase):
    def test_unrouted_points(self):
        out = inv.check_unrouted_points([{"data_type": "exercise", "n": 1, "first_date": D("2026-09-24")}])
        assert checks(out) == ["unrouted_raw_points"]

    def test_missing_days_excludes_today(self):
        start = TODAY - timedelta(days=3)
        out = inv.check_missing_days("fitbit_sleep_daily", [start, start + timedelta(days=2)], start, TODAY)
        assert [v["date"] for v in out] == [str(start + timedelta(days=1))]

    def test_summary_and_push_body(self):
        vs = [
            inv.violation("missing_day", "warn", "x", D("2026-09-24")),
            inv.violation("rollup_drift", "alert", "steps: stored 310 vs raw 6100", D("2026-06-01")),
        ]
        s = inv.summarize(vs)
        assert s == {"violations": 2, "alerts": 1, "warnings": 1,
                     "by_check": {"missing_day": 1, "rollup_drift": 1}}
        assert inv.format_push(vs).splitlines()[0].startswith("[alert] 2026-06-01 rollup_drift")


if __name__ == "__main__":
    unittest.main()
