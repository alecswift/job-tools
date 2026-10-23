require_relative "test_helper"

class TimerTest < Minitest::Test
  def setup
    @clock = FakeClock.new(Time.local(2026, 10, 22, 9))
    @db = TimeLog::Database.memory
    @log = TimeLog::Tracker.new(@db, clock: @clock)
    @lc = @log.add_activity(name: "LeetCode")[:id]
  end

  def timer = @log.timer
  def seen = timer.values_at(:phase, :block, :worked_sec)

  def test_a_session_with_a_pause_a_break_and_a_second_block
    @log.start_timer(activity_id: @lc)
    @clock.advance(minutes: 30)
    assert_equal ["work", 1, 30 * 60], seen
    assert_equal 20 * 60, timer[:block_left_sec]

    @log.pause_timer
    @clock.advance(minutes: 10)
    assert_equal ["paused", 1, 30 * 60], seen # paused time isn't work
    @log.resume_timer

    @clock.advance(minutes: 24)
    assert_equal ["break", 1, 50 * 60], seen # the block ended 4 minutes ago
    assert_equal 6 * 60, timer[:break_left_sec]
    @clock.advance(minutes: 15)
    assert_equal ["ready", 1, 50 * 60], seen # break over, waiting for Continue

    @log.continue_timer
    @clock.advance(minutes: 25)
    assert_equal ["work", 2, 75 * 60], seen

    @log.stop_timer
    @clock.advance(minutes: 5) # time after Stop doesn't count
    assert_equal ["stopped", 2, 75 * 60], seen
    assert_equal({ date: Date.new(2026, 10, 22), activity_id: @lc, worked_min: 75, credited_min: 90 }, timer[:entry])

    @log.log_timer(credited_min: 60, what: "2 problems", notes: "slow")
    assert_nil timer
    entry = @log.entries.first
    assert_equal [Date.new(2026, 10, 22), @lc, 60, 75, "2 problems"], entry.values_at(:date, :activity_id, :credited_min, :worked_min, :what)
  end

  def test_a_stopped_timer_survives_a_restart_and_keeps_the_start_date
    @clock.now = Time.local(2026, 10, 22, 23, 40)
    @log.start_timer(activity_id: @lc)
    @clock.advance(minutes: 55) # past midnight, on a break
    @log.stop_timer
    restarted = TimeLog::Tracker.new(@db, clock: @clock)
    assert_equal "stopped", restarted.timer[:phase]
    restarted.log_timer(credited_min: 60, what: "late night")
    assert_equal Date.new(2026, 10, 22), restarted.entries.first[:date]
  end

  def test_the_dialog_can_change_the_date_and_activity
    other = @log.add_activity(name: "System design")[:id]
    @log.start_timer(activity_id: @lc)
    @clock.advance(minutes: 50)
    @log.stop_timer
    @log.log_timer(date: "2026-10-21", activity_id: other, credited_min: 60, what: "x")
    assert_equal [Date.new(2026, 10, 21), other, 50], @log.entries.first.values_at(:date, :activity_id, :worked_min)
  end

  def test_discard
    @log.start_timer(activity_id: @lc)
    @clock.advance(minutes: 20)
    @log.stop_timer
    @log.discard_timer
    assert_nil timer
    assert_empty @log.entries
  end

  def test_a_bad_entry_keeps_the_stopped_timer
    @log.start_timer(activity_id: @lc)
    @log.stop_timer
    assert_raises(TimeLog::Invalid) { @log.log_timer(credited_min: 60, what: " ") }
    assert_equal "stopped", timer[:phase]
  end

  def test_the_activity_being_timed_cant_be_archived_or_deleted
    @log.start_timer(activity_id: @lc)
    assert_raises(TimeLog::Invalid) { @log.update_activity(@lc, archived: true) }
    assert_raises(TimeLog::Invalid) { @log.delete_activity(@lc) }
    @log.stop_timer
    assert_raises(TimeLog::Invalid) { @log.delete_activity(@lc) } # still waiting to be logged
    @log.discard_timer
    @log.delete_activity(@lc)
  end

  # Times are stored in UTC, so a block that spans the end of daylight saving still counts real minutes
  def test_across_the_end_of_daylight_saving
    saved, ENV["TZ"] = ENV["TZ"], "America/Los_Angeles"
    @clock.now = Time.new(2026, 11, 1, 1, 40, 0, "-07:00") # 1:40 PDT; the clocks go back to 1:00 at 2:00
    @log.start_timer(activity_id: @lc)
    @clock.advance(minutes: 30)
    assert_equal ["work", 1, 30 * 60], seen
  ensure
    ENV["TZ"] = saved
  end

  def test_actions_that_dont_fit
    assert_raises(TimeLog::NotFound) { @log.stop_timer }
    assert_raises(TimeLog::NotFound) { @log.discard_timer }
    @log.start_timer(activity_id: @lc)
    assert_raises(TimeLog::Invalid) { @log.start_timer(activity_id: @lc) }
    assert_raises(TimeLog::Invalid) { @log.resume_timer }
    assert_raises(TimeLog::Invalid) { @log.continue_timer } # the block isn't over
    assert_raises(TimeLog::Invalid) { @log.log_timer(credited_min: 60, what: "x") } # not stopped yet
    assert_raises(TimeLog::Invalid) { @log.discard_timer }
    @clock.advance(minutes: 55)
    assert_raises(TimeLog::Invalid) { @log.pause_timer }    # on a break
    @log.stop_timer
    assert_raises(TimeLog::Invalid) { @log.stop_timer }
    assert_raises(TimeLog::Invalid) { @log.continue_timer }
    assert_raises(TimeLog::Invalid) { @log.start_timer(activity_id: @lc) } # log or discard it first
  end
end
