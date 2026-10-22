module TimeLog
  class NotFound < StandardError; end
  class Invalid < StandardError; end

  # Every read and change to activities, entries, the plan and the timer. The web layer only calls this.
  # clock returns the current local Time; "today" and "this week" come from it.
  class Tracker
    BLOCK_SEC = 50 * 60 # a timer work block
    BREAK_SEC = 10 * 60 # the break after each block, not credited

    def initialize(db, clock: -> { Time.now })
      @db, @clock = db, clock
    end

    def today = @clock.call.to_date
    def self.monday(date) = date - (date.cwday - 1)
    def this_monday = Tracker.monday(today)

    # ---------- the week page ----------

    def week(date)
      monday = Tracker.monday(date)
      planned = plan_minutes(monday)
      in_week = @db[:entries].where(date: monday..monday + 6)
      actual = in_week.group_and_count(:activity_id).select_append { sum(:credited_min).as(:minutes) }.to_hash(:activity_id, :minutes)
      by_day = in_week.group_and_count(:date).select_append { sum(:credited_min).as(:minutes) }.to_hash(:date, :minutes)
      rows = @db[:activities].order(:id).map do |a|
        { id: a[:id], name: a[:name], hint: a[:hint], archived: !a[:archived_at].nil?,
          **numbers(actual.fetch(a[:id], 0), planned.fetch(a[:id], 0)) }
      end
      # An archived activity only shows in weeks it still has something in
      rows.reject! { it[:archived] && it[:actual_min].zero? && it[:planned_min].zero? }
      { monday:, editable: monday >= this_monday, rows:,
        total: numbers(rows.sum { it[:actual_min] }, rows.sum { it[:planned_min] }),
        daily_min: (0..6).map { by_day.fetch(monday + it, 0) } }
    end

    # ---------- entries ----------

    # The Log: newest first. q searches What I did and Notes; activity_id narrows to one activity.
    def entries(q: nil, activity_id: nil)
      rows = @db[:entries].join(:activities, id: :activity_id)
        .select_all(:entries).select_append(Sequel[:activities][:name].as(:activity))
        .reverse(Sequel[:entries][:date], Sequel[:entries][:id])
      rows = rows.where(activity_id: activity_id.to_i) if activity_id && activity_id.to_s != ""
      unless q.to_s.strip.empty?
        like = "%#{rows.escape_like(q.strip)}%"
        rows = rows.where(Sequel.ilike(Sequel[:entries][:what], like) | Sequel.ilike(Sequel[:entries][:notes], like))
      end
      rows.map do |e|
        { id: e[:id], date: e[:date], day: e[:date].strftime("%a"), activity_id: e[:activity_id], activity: e[:activity],
          credited_min: e[:credited_min], worked_min: e[:worked_min], what: e[:what], notes: e[:notes] }
      end
    end

    def add_entry(date:, activity_id:, credited_min:, what:, notes: nil, worked_min: nil)
      raise Invalid, "That activity is archived." if activity!(activity_id)[:archived_at]
      now = @clock.call
      id = @db[:entries].insert(date: date!(date), activity_id:, credited_min: credit!(credited_min), what: what!(what),
                                notes: blank_to_nil(notes), worked_min:, created_at: now, updated_at: now)
      { id: }
    end

    # Any of the add_entry fields except worked_min, which stays as the timer recorded it
    def edit_entry(id, date: nil, activity_id: nil, credited_min: nil, what: nil, notes: nil, **)
      entry = @db[:entries].where(id:).first || raise(NotFound, "There's no entry #{id}.")
      changes = { updated_at: @clock.call }
      changes[:date] = date!(date) unless date.nil?
      changes[:credited_min] = credit!(credited_min) unless credited_min.nil?
      changes[:what] = what!(what) unless what.nil?
      changes[:notes] = blank_to_nil(notes) unless notes.nil?
      if activity_id && activity_id != entry[:activity_id]
        raise Invalid, "That activity is archived." if activity!(activity_id)[:archived_at]
        changes[:activity_id] = activity_id
      end
      @db[:entries].where(id:).update(changes)
    end

    def delete_entry(id)
      raise NotFound, "There's no entry #{id}." if @db[:entries].where(id:).delete.zero?
    end

    # ---------- activities and the plan ----------

    # Every activity, archived ones too (the Log can still filter by them), in the order they were added
    def activities
      with_entries = @db[:entries].distinct.select_map(:activity_id)
      @db[:activities].order(:id).map do |a|
        { id: a[:id], name: a[:name], hint: a[:hint], archived: !a[:archived_at].nil?, deletable: !with_entries.include?(a[:id]) }
      end
    end

    def add_activity(name:, weekly_min: 0, hint: nil)
      weekly!(weekly_min)
      @db.transaction do
        id = @db[:activities].insert(name: name!(name), hint: blank_to_nil(hint), created_at: @clock.call)
        set_plan(activity_id: id, weekly_min:) unless weekly_min.zero?
        { id: }
      end
    end

    # Rename, change the hint, or archive. Archiving sets the plan to 0 from this week on.
    def update_activity(id, name: nil, hint: nil, archived: nil)
      activity!(id)
      changes = {}
      changes[:name] = name!(name) unless name.nil?
      changes[:hint] = blank_to_nil(hint) unless hint.nil?
      if archived
        raise Invalid, "Stop the timer on it first." if timing?(id)
        changes[:archived_at] = @clock.call
        set_plan(activity_id: id, weekly_min: 0)
      end
      @db[:activities].where(id:).update(changes) unless changes.empty?
    end

    # Only an activity with no entries can be deleted: archive the others
    def delete_activity(id)
      activity!(id)
      raise Invalid, "It has entries, so archive it instead." if @db[:entries].where(activity_id: id).any?
      raise Invalid, "Stop the timer on it first." if timing?(id)
      @db.transaction do
        @db[:plan_hours].where(activity_id: id).delete
        @db[:activities].where(id:).delete
      end
    end

    # A change always applies from this week's Monday. A version already starting then is updated;
    # otherwise a new one starts, copying the plan in effect.
    def set_plan(activity_id:, weekly_min:)
      raise Invalid, "That activity is archived." if activity!(activity_id)[:archived_at]
      weekly!(weekly_min)
      plan_id = @db[:plans].where(effective_from: this_monday).get(:id) || begin
        current = plan_minutes(this_monday)
        id = @db[:plans].insert(effective_from: this_monday)
        current.each { |activity, minutes| @db[:plan_hours].insert(plan_id: id, activity_id: activity, minutes:) }
        id
      end
      @db[:plan_hours].insert_conflict(:replace).insert(plan_id:, activity_id:, minutes: weekly_min)
    end

    # ---------- the timer ----------
    # Elapsed time is always worked out from the stored times, so the timer survives reloads and restarts.

    # nil when no timer runs. phase: work, paused, break (after a block) or ready (break over, waiting for Continue).
    def timer
      t = @db[:timer].first or return nil
      now = @clock.call
      block_worked = [(t[:paused_at] || now) - t[:block_started_at] - t[:paused_sec], BLOCK_SEC].min.floor
      since_block = now - (t[:block_started_at] + t[:paused_sec] + BLOCK_SEC)
      phase = if t[:paused_at] then "paused"
              elsif block_worked < BLOCK_SEC then "work"
              elsif since_block < BREAK_SEC then "break"
              else "ready"
              end
      { activity_id: t[:activity_id], activity: activity!(t[:activity_id])[:name], phase:,
        block: t[:banked_sec] / BLOCK_SEC + 1, worked_sec: t[:banked_sec] + block_worked,
        block_left_sec: BLOCK_SEC - block_worked, break_left_sec: phase == "break" ? (BREAK_SEC - since_block).ceil : 0 }
    end

    def start_timer(activity_id:)
      raise Invalid, "A timer is already running." if @db[:timer].any?
      raise Invalid, "That activity is archived." if activity!(activity_id)[:archived_at]
      now = @clock.call
      @db[:timer].insert(activity_id:, started_at: now, block_started_at: now)
    end

    def pause_timer
      timer_in!("work")
      @db[:timer].update(paused_at: @clock.call)
    end

    def resume_timer
      t = @db[:timer].first
      timer_in!("paused")
      @db[:timer].update(paused_at: nil, paused_sec: t[:paused_sec] + (@clock.call - t[:paused_at]).round)
    end

    # Start the next work block, during or after the break
    def continue_timer
      timer_in!("break", "ready")
      @db[:timer].update(banked_sec: Sequel[:banked_sec] + BLOCK_SEC, block_started_at: @clock.call, paused_sec: 0, paused_at: nil)
    end

    # Clears the timer and returns the Log time dialog's fields. Saving the entry is a separate add_entry.
    def stop_timer
      current = timer or raise(NotFound, "No timer is running.")
      started = @db[:timer].get(:started_at)
      @db[:timer].delete
      worked_min = (current[:worked_sec] / 60.0).round
      { date: started.to_date, activity_id: current[:activity_id], worked_min:, credited_min: Credit.for_worked(worked_min) }
    end

    private

    def timing?(activity_id) = @db[:timer].where(activity_id:).any?

    def timer_in!(*phases)
      current = timer or raise(NotFound, "No timer is running.")
      raise Invalid, "The timer can't do that while it's #{current[:phase]}." unless phases.include?(current[:phase])
    end

    def numbers(actual, planned)
      { actual_min: actual, planned_min: planned, diff_min: actual - planned,
        pct: planned.zero? ? nil : (actual * 100.0 / planned).round }
    end

    def activity!(id) = @db[:activities].where(id:).first || raise(NotFound, "There's no activity #{id}.")

    def date!(value)
      Date.iso8601(value.to_s)
    rescue Date::Error
      raise Invalid, "Give the date as YYYY-MM-DD."
    end

    def credit!(minutes)
      unless minutes.is_a?(Integer) && minutes.positive? && minutes <= 24 * 60 && (minutes % Credit::STEP).zero?
        raise Invalid, "Hours must be more than 0 and at most 24, in steps of 0.25."
      end
      minutes
    end

    def weekly!(minutes)
      unless minutes.is_a?(Integer) && minutes >= 0 && minutes <= 7 * 24 * 60 && (minutes % Credit::STEP).zero?
        raise Invalid, "Weekly hours must be 0 or more, in steps of 0.25."
      end
    end

    def name!(text) = blank_to_nil(text) || raise(Invalid, "Give the activity a name.")
    def what!(text) = blank_to_nil(text) || raise(Invalid, "Say what you did.")

    # Text fields: nil or a string, trimmed, with blank meaning nil
    def blank_to_nil(text)
      raise Invalid, "Text fields must be strings." unless text.nil? || text.is_a?(String)
      text.to_s.strip.empty? ? nil : text.strip
    end

    # { activity_id => weekly minutes } from the newest version starting on or before monday
    def plan_minutes(monday)
      plan = @db[:plans].where { effective_from <= monday }.reverse(:effective_from).get(:id)
      plan ? @db[:plan_hours].where(plan_id: plan).to_hash(:activity_id, :minutes) : {}
    end
  end
end
