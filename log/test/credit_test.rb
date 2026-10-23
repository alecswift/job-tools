require_relative "test_helper"

class CreditTest < Minitest::Test
  # Worked examples from SPEC.md: 50 minutes of work counts as an hour, rounded to the nearest 15 minutes
  def test_timer_credit
    assert_equal 60, TimeLog::Credit.for_worked(50)
    assert_equal 30, TimeLog::Credit.for_worked(25)
    assert_equal 45, TimeLog::Credit.for_worked(37)
    assert_equal 0, TimeLog::Credit.for_worked(5)
    assert_equal 120, TimeLog::Credit.for_worked(100)
  end
end
