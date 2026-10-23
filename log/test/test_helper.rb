require "minitest/autorun"
require_relative "../lib/time_log"

# A clock the tests move by hand. Times are local (TZ), like the app's.
class FakeClock
  attr_accessor :now

  def initialize(now) = @now = now
  def call = @now
  def advance(minutes: 0, seconds: 0) = @now += minutes * 60 + seconds
end
