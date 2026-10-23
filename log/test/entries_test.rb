require_relative "test_helper"

class EntriesTest < Minitest::Test
  def setup
    @log = TimeLog::Tracker.new(TimeLog::Database.memory, clock: FakeClock.new(Time.local(2026, 10, 22, 9)))
    @lc = @log.add_activity(name: "LeetCode")[:id]
    @apps = @log.add_activity(name: "Applications / outreach")[:id]
    @first = add("2026-10-19", @lc, "2 new problems", notes: "1 retry")[:id]
    add("2026-10-21", @apps, "Interview call with Avante")
    add("2026-10-21", @lc, "3 leetcode problems")
  end

  def add(date, activity, what, **more) = @log.add_entry(date:, activity_id: activity, credited_min: 60, what:, **more)
  def whats(**filter) = @log.entries(**filter).map { it[:what] }

  def test_newest_first_with_search_and_activity_filter
    assert_equal ["3 leetcode problems", "Interview call with Avante", "2 new problems"], whats
    assert_equal ["2 new problems"], whats(q: "RETRY") # searches notes too, any case
    assert_equal ["Interview call with Avante"], whats(activity_id: @apps)
    entry = @log.entries.last
    assert_equal ["Mon", "LeetCode", 60], entry.values_at(:day, :activity, :credited_min)
  end

  # Only the timer records worked minutes, and nothing changes them afterwards
  def test_worked_minutes_come_from_the_timer_only
    assert_raises(ArgumentError) { add("2026-10-22", @lc, "Timed", worked_min: 50) }
    @log.start_timer(activity_id: @lc)
    @log.stop_timer
    @log.log_timer(credited_min: 60, what: "Timed")
    timed = @log.entries.first[:id]
    assert_raises(ArgumentError) { @log.edit_entry(timed, worked_min: 10) }
    @log.edit_entry(timed, credited_min: 45, notes: "felt slow")
    assert_equal [45, 0, "felt slow"], @log.entries.first.values_at(:credited_min, :worked_min, :notes)
    assert_raises(TimeLog::Invalid) { @log.edit_entry(timed, credited_min: 10) }
  end

  def test_delete
    @log.delete_entry(@first)
    refute_includes whats, "2 new problems"
    assert_raises(TimeLog::NotFound) { @log.delete_entry(@first) }
    assert_raises(TimeLog::NotFound) { @log.edit_entry(@first, what: "x") }
  end
end
