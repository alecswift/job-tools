require "fileutils"

module TimeLog
  # Opens the SQLite database and brings it up to date with db/migrations.
  module Database
    MIGRATIONS = File.expand_path("../../db/migrations", __dir__)
    Sequel.extension :migration
    # Store times in UTC (SQLite keeps them as text with no offset) and hand them back as local times,
    # so the timer's arithmetic stays right across daylight-saving changes and TZ settings.
    Sequel.database_timezone = :utc
    Sequel.application_timezone = :local

    def self.file(path)
      FileUtils.mkdir_p(File.dirname(path))
      migrate(Sequel.sqlite(path))
    end

    # For tests: a fresh, empty database that vanishes when closed
    def self.memory = migrate(Sequel.sqlite)

    # Sequel's SQLite adapter turns foreign keys on for every connection by default
    def self.migrate(db)
      Sequel::Migrator.run(db, MIGRATIONS)
      db
    end
  end
end
