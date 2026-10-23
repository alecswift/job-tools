require_relative "test_helper"

class ActivitiesTest < Minitest::Test
  LAST_MON, MON = Date.new(2026, 10, 12), Date.new(2026, 10, 19)

  def setup
    @clock = FakeClock.new(Time.local(2026, 10, 15, 9)) # start in the week of 12 Oct
    @log = TimeLog::Tracker.new(TimeLog::Database.memory, clock: @clock)
    @os = @log.add_activity(name: "Open source", hint: "good first issues", weekly_min: 165)[:id]
    @log.add_entry(date: "2026-10-13", activity_id: @os, credited_min: 60, what: "Read the contributing guide")
    @clock.now = Time.local(2026, 10, 22, 9) # now the week of 19 Oct
  end

  def names(monday) = @log.week(monday)[:rows].map { it[:name] }

  def test_archiving_drops_the_plan_from_this_week_but_keeps_history
    @log.update_activity(@os, archived: true)
    assert_equal [[60, 165]], @log.week(LAST_MON)[:rows].map { it.values_at(:actual_min, :planned_min) }
    assert_empty names(MON) # no entries or plan this week, so hidden
    assert_equal ["Open source"], @log.activities.map { it[:name] } # still listed, for the Log filter
    assert @log.activities.first[:archived]
    assert_raises(TimeLog::Invalid) { @log.add_entry(date: "2026-10-22", activity_id: @os, credited_min: 60, what: "x") }
  end

  def test_rename_and_hint
    @log.update_activity(@os, name: "OSS", hint: "")
    assert_equal [["OSS", nil]], @log.activities.map { it.values_at(:name, :hint) }
    assert_raises(TimeLog::Invalid) { @log.update_activity(@os, name: " ") }
  end

  def test_delete_only_without_entries
    assert_raises(TimeLog::Invalid) { @log.delete_activity(@os) }
    refute @log.activities.first[:deletable]
    mock = @log.add_activity(name: "Mock interviews", weekly_min: 60)[:id]
    assert @log.activities.last[:deletable]
    @log.delete_activity(mock)
    assert_equal ["Open source"], names(MON)
    assert_raises(TimeLog::NotFound) { @log.delete_activity(mock) }
  end
end
