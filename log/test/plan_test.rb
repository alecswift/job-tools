require_relative "test_helper"

class PlanTest < Minitest::Test
  def setup
    @clock = FakeClock.new(Time.local(2026, 10, 22, 9)) # Thursday, week of Mon 19 Oct
    @log = TimeLog::Tracker.new(TimeLog::Database.memory, clock: @clock)
  end

  def planned(monday, name) = @log.week(monday)[:rows].find { it[:name] == name }[:planned_min]

  def test_a_change_applies_from_this_week_and_past_weeks_keep_their_plan
    id = @log.add_activity(name: "LeetCode", weekly_min: 375)[:id]
    @log.set_plan(activity_id: id, weekly_min: 300) # same week: replaces the change above
    @clock.advance(minutes: 7 * 24 * 60)             # into the week of 26 Oct
    @log.set_plan(activity_id: id, weekly_min: 240)

    assert_equal 0, planned(Date.new(2026, 10, 12), "LeetCode")
    assert_equal 300, planned(Date.new(2026, 10, 19), "LeetCode")
    assert_equal 240, planned(Date.new(2026, 10, 26), "LeetCode")
    assert_equal 240, planned(Date.new(2026, 11, 2), "LeetCode")
  end

  def test_any_day_finds_its_week
    @log.add_activity(name: "LeetCode", weekly_min: 375)
    week = @log.week(Date.new(2026, 10, 25)) # a Sunday
    assert_equal Date.new(2026, 10, 19), week[:monday]
  end

  def test_weekly_hours_are_checked
    id = @log.add_activity(name: "LeetCode")[:id]
    assert_raises(TimeLog::Invalid) { @log.set_plan(activity_id: id, weekly_min: 20) }   # not a multiple of 15
    assert_raises(TimeLog::Invalid) { @log.set_plan(activity_id: id, weekly_min: -15) }
    assert_raises(TimeLog::Invalid) { @log.add_activity(name: "x", weekly_min: 7 * 24 * 60 + 15) }
    assert_raises(TimeLog::NotFound) { @log.set_plan(activity_id: 999, weekly_min: 60) }
    @log.update_activity(id, archived: true)
    assert_raises(TimeLog::Invalid) { @log.set_plan(activity_id: id, weekly_min: 60) }
  end

  def test_only_this_week_and_later_are_editable
    refute @log.week(Date.new(2026, 10, 12))[:editable]
    assert @log.week(Date.new(2026, 10, 19))[:editable]
    assert @log.week(Date.new(2026, 10, 26))[:editable]
  end
end
