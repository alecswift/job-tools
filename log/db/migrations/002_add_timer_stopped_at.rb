# A stopped timer stays until its entry is logged or discarded, so the time survives a reload
Sequel.migration do
  change do
    alter_table(:timer) do
      add_column :stopped_at, DateTime # set once Stop is pressed: work ends here
    end
  end
end
