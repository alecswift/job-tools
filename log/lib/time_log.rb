require "date"
require "sequel"
require_relative "time_log/credit"
require_relative "time_log/database"
require_relative "time_log/tracker"

module TimeLog
  # The SQLite file: LOG_DATA, or log.sqlite3 in the log-data/ repo next to this one
  def self.data_file = ENV.fetch("LOG_DATA", File.expand_path("../../log-data/log.sqlite3", __dir__))
end
