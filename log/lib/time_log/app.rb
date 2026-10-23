require "json"
require "sinatra/base"

module TimeLog
  # The HTTP layer: turns requests into Tracker calls, serves public/ and the shared ../design/ at /design/.
  # Every change returns the full state for the week being viewed (?week=, any day in it; this week by default).
  class App < Sinatra::Base
    DESIGN_DIR = File.expand_path("../../../design", __dir__)

    set :public_folder, File.expand_path("../../public", __dir__)
    set :show_exceptions, false
    set :raise_errors, false
    # Only answer to this machine's names, so other web pages can't reach the API through DNS tricks
    set :host_authorization, { permitted_hosts: ["localhost", "127.0.0.1", "[::1]"] }

    # dev_version: dev mode only, a lambda whose answer changes when the code does (see DevMode)
    def initialize(tracker, dev_version: nil)
      super(nil)
      @tracker, @dev_version = tracker, dev_version
    end

    before("/api/*") { content_type :json }

    get("/") { send_file File.join(settings.public_folder, "index.html") }

    get "/design/*" do
      path = File.expand_path(params["splat"].first, DESIGN_DIR)
      pass unless path.start_with?(DESIGN_DIR + "/") && File.file?(path)
      send_file path
    end

    # Where each job-tools app runs, for the app switcher. Only the ones set: design/ui.js has the defaults.
    get("/api/apps") { json({ leetcode: ENV["LEETCODE_URL"], log: ENV["LOG_URL"] }.reject { |_, url| url.to_s.empty? }) }
    get("/api/dev/version") { @dev_version ? json(version: @dev_version.call) : not_found }

    get("/api/state") { state }
    get("/api/entries") { json(@tracker.entries(q: params["q"], activity_id: params["activity"])) }

    post("/api/entries") { change { @tracker.add_entry(**input) } }
    put("/api/entries/:id") { change { @tracker.edit_entry(id, **input) } }
    delete("/api/entries/:id") { change { @tracker.delete_entry(id) } }

    post("/api/activities") { change { @tracker.add_activity(**input) } }
    put("/api/activities/:id") { change { @tracker.update_activity(id, **input) } }
    delete("/api/activities/:id") { change { @tracker.delete_activity(id) } }
    put("/api/plan") { change { @tracker.set_plan(**input) } }

    post("/api/timer/start") { change { @tracker.start_timer(**input) } }
    post("/api/timer/pause") { change { @tracker.pause_timer } }
    post("/api/timer/resume") { change { @tracker.resume_timer } }
    post("/api/timer/continue") { change { @tracker.continue_timer } }
    post("/api/timer/stop") { change { @tracker.stop_timer } }
    post("/api/timer/log") { change { @tracker.log_timer(**input) } }
    post("/api/timer/discard") { change { @tracker.discard_timer } }

    error(NotFound) { halt 404, json(error: env["sinatra.error"].message) }
    error(Invalid, ArgumentError, JSON::ParserError) { halt 400, json(error: env["sinatra.error"].message) }
    not_found { json(error: "Not found") if request.path.start_with?("/api/") }

    private

    def json(obj) = JSON.generate(obj)
    def id = Integer(params["id"])

    def input
      parsed = JSON.parse(request.body.read.then { it.empty? ? "{}" : it })
      raise Invalid, "Send a JSON object." unless parsed.is_a?(Hash)
      parsed.transform_keys(&:to_sym)
    end

    def change
      yield
      state
    end

    def state
      week = params["week"] ? Date.iso8601(params["week"]) : @tracker.today
      json(today: @tracker.today, week: @tracker.week(week), activities: @tracker.activities, timer: @tracker.timer)
    rescue Date::Error
      raise Invalid, "Give the week as YYYY-MM-DD."
    end
  end
end
