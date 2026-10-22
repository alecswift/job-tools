# The whole data model (see SPEC.md, "log/ > Data model"). Times are whole minutes or seconds, never hours.
Sequel.migration do
  change do
    create_table(:activities) do
      primary_key :id
      String :name, null: false
      String :hint
      DateTime :archived_at
      DateTime :created_at, null: false
    end

    create_table(:entries) do
      primary_key :id
      Date :date, null: false, index: true
      foreign_key :activity_id, :activities, null: false, index: true
      Integer :credited_min, null: false
      Integer :worked_min # only for entries made by the timer
      String :what, null: false
      String :notes
      DateTime :created_at, null: false
      DateTime :updated_at, null: false
    end

    # A plan version applies from its Monday until the next version's Monday
    create_table(:plans) do
      primary_key :id
      Date :effective_from, null: false, unique: true
    end

    create_table(:plan_hours) do
      foreign_key :plan_id, :plans, null: false, on_delete: :cascade
      foreign_key :activity_id, :activities, null: false
      Integer :minutes, null: false
      primary_key [:plan_id, :activity_id]
    end

    # At most one row: the running timer. Work comes in 50-minute blocks, each followed by a 10-minute break.
    create_table(:timer) do
      foreign_key :activity_id, :activities, null: false
      DateTime :started_at, null: false        # when Start was pressed: the entry's date
      DateTime :block_started_at, null: false  # when the current work block began
      Integer :banked_sec, null: false, default: 0 # work from finished blocks
      DateTime :paused_at                      # set while paused
      Integer :paused_sec, null: false, default: 0 # pauses so far in the current block
    end
  end
end
