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

    fields = @log.stop_timer
    assert_equal({ date: Date.new(2026, 10, 22), activity_id: @lc, worked_min: 75, credited_min: 90 }, fields)
    assert_nil timer
  end

  def test_it_survives_a_restart_and_keeps_the_start_date
    @clock.now = Time.local(2026, 10, 22, 23, 40)
    @log.start_timer(activity_id: @lc)
    @clock.advance(minutes: 55) # past midnight, on a break
    restarted = TimeLog::Tracker.new(@db, clock: @clock)
    assert_equal "break", restarted.timer[:phase]
    assert_equal Date.new(2026, 10, 22), restarted.stop_timer[:date]
  end

  def test_the_activity_being_timed_cant_be_archived_or_deleted
    @log.start_timer(activity_id: @lc)
    assert_raises(TimeLog::Invalid) { @log.update_activity(@lc, archived: true) }
    assert_raises(TimeLog::Invalid) { @log.delete_activity(@lc) }
    @log.stop_timer
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
    @log.start_timer(activity_id: @lc)
    assert_raises(TimeLog::Invalid) { @log.start_timer(activity_id: @lc) }
    assert_raises(TimeLog::Invalid) { @log.resume_timer }
    assert_raises(TimeLog::Invalid) { @log.continue_timer } # the block isn't over
    @clock.advance(minutes: 55)
    assert_raises(TimeLog::Invalid) { @log.pause_timer }    # on a break
  end
end
