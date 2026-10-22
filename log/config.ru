# The Rack entry point, used by bin/server (and by `bundle exec rackup` if you prefer).
# LOG_DEV=1 (set by bin/server --dev) turns on GET /api/dev/version.
require_relative "lib/time_log"
require_relative "lib/time_log/app"
require_relative "lib/time_log/dev_mode"

tracker = TimeLog::Tracker.new(TimeLog::Database.file(TimeLog.data_file))
run TimeLog::App.new(tracker, dev_version: ENV["LOG_DEV"] ? TimeLog::DevMode.method(:code_version) : nil)
