module TimeLog
  # How much an entry counts toward the plan. Credit is in whole minutes, always a multiple of 15.
  module Credit
    STEP = 15

    # Timer work: 50 minutes counts as an hour, rounded to the nearest 15 minutes (37 worked -> 45).
    # worked * 6/5 / 15 never lands on a half for whole minutes, so rounding has no ties.
    def self.for_worked(worked_min) = (Rational(worked_min * 6, 5) / STEP).round * STEP
  end
end
