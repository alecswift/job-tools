require_relative "test_helper"

class WeekTest < Minitest::Test
  MON = Date.new(2026, 10, 19)

  def setup
    @clock = FakeClock.new(Time.local(2026, 10, 22, 9))
    @log = TimeLog::Tracker.new(TimeLog::Database.memory, clock: @clock)
    @lc = @log.add_activity(name: "LeetCode", weekly_min: 375)[:id]
    @apps = @log.add_activity(name: "Applications / outreach", weekly_min: 300)[:id]
    @os = @log.add_activity(name: "Open source", weekly_min: 0)[:id]
  end

  def log(date, activity, minutes) = @log.add_entry(date: date.to_s, activity_id: activity, credited_min: minutes, what: "work")

  def test_actual_against_the_plan
    log(MON, @lc, 120)
    log(MON + 1, @lc, 120)
    log(MON + 6, @lc, 180)       # Sunday counts
    log(MON + 7, @lc, 60)        # next Monday doesn't
    log(MON + 2, @apps, 150)

    week = @log.week(MON)
    lc, apps, os = week[:rows]
    assert_equal [420, 375, 45, 112], lc.values_at(:actual_min, :planned_min, :diff_min, :pct)
    assert_equal [150, 300, -150, 50], apps.values_at(:actual_min, :planned_min, :diff_min, :pct)
    assert_nil os[:pct] # nothing planned
    assert_equal({ actual_min: 570, planned_min: 675, diff_min: -105, pct: 84 }, week[:total])
    assert_equal [120, 120, 150, 0, 0, 0, 180], week[:daily_min]
  end

  def test_entries_are_checked
    assert_raises(TimeLog::Invalid) { log(MON, @lc, 20) }    # not a multiple of 15
    assert_raises(TimeLog::Invalid) { log(MON, @lc, 0) }
    assert_raises(TimeLog::Invalid) { log(MON, @lc, 1455) }  # over 24 hours
    assert_raises(TimeLog::Invalid) { @log.add_entry(date: "2026-10-19", activity_id: @lc, credited_min: 60, what: " ") }
    assert_raises(TimeLog::Invalid) { @log.add_entry(date: "19 Oct", activity_id: @lc, credited_min: 60, what: "x") }
    assert_raises(TimeLog::NotFound) { log(MON, 999, 60) }
  end
end
