require_relative "test_helper"
require "rack/test"
require_relative "../lib/time_log/app"

class ApiTest < Minitest::Test
  include Rack::Test::Methods

  def setup
    @clock = FakeClock.new(Time.local(2026, 10, 22, 9))
    @app = TimeLog::App.new(TimeLog::Tracker.new(TimeLog::Database.memory, clock: @clock))
    header "Host", "localhost"
  end

  attr_reader :app

  def with_env(vars)
    saved = vars.keys.to_h { [it, ENV[it]] }
    vars.each { |k, v| ENV[k] = v }
    yield
  ensure
    saved.each { |k, v| ENV[k] = v }
  end

  def call(method, path, body = nil)
    send(method, path, body && JSON.generate(body), "CONTENT_TYPE" => "application/json")
    [last_response.status, JSON.parse(last_response.body)]
  end

  def test_a_day_of_logging
    status, state = call(:post, "/api/activities?week=2026-10-19", { name: "LeetCode", hint: "new first", weekly_min: 375 })
    assert_equal 200, status
    lc = state["activities"].first["id"]
    assert_equal ["2026-10-19", "LeetCode", 375], [state["week"]["monday"], state["week"]["rows"][0]["name"], state["week"]["rows"][0]["planned_min"]]

    _, state = call(:post, "/api/entries", { date: "2026-10-22", activity_id: lc, credited_min: 90, what: "3 problems" })
    assert_equal 90, state["week"]["rows"][0]["actual_min"]
    _, state = call(:put, "/api/plan", { activity_id: lc, weekly_min: 300 })
    assert_equal 300, state["week"]["total"]["planned_min"]

    _, entries = call(:get, "/api/entries?q=problems&activity=#{lc}")
    assert_equal ["3 problems"], entries.map { it["what"] }
    _, state = call(:put, "/api/entries/#{entries[0]['id']}", { credited_min: 60 })
    assert_equal 60, state["week"]["total"]["actual_min"]
    _, state = call(:delete, "/api/entries/#{entries[0]['id']}")
    assert_equal 0, state["week"]["total"]["actual_min"]

    _, state = call(:put, "/api/activities/#{lc}", { name: "LC" })
    assert_equal "LC", state["activities"][0]["name"]
    _, state = call(:delete, "/api/activities/#{lc}")
    assert_empty state["activities"]
  end

  def test_the_timer
    _, state = call(:post, "/api/activities", { name: "LeetCode" })
    lc = state["activities"][0]["id"]
    _, state = call(:post, "/api/timer/start", { activity_id: lc })
    assert_equal "work", state["timer"]["phase"]
    @clock.advance(minutes: 25)
    _, fields = call(:post, "/api/timer/stop")
    assert_equal({ "date" => "2026-10-22", "activity_id" => lc, "worked_min" => 25, "credited_min" => 30 }, fields)
    assert_nil call(:get, "/api/state")[1]["timer"]
  end

  def test_errors
    assert_equal 400, call(:post, "/api/activities", { name: "" })[0]
    assert_equal 400, call(:post, "/api/activities", { name: "x", surprise: 1 })[0]
    assert_equal 400, call(:post, "/api/activities", { name: 5 })[0]
    assert_equal 400, call(:post, "/api/activities", { name: "x", hint: [] })[0]
    assert_equal 404, call(:put, "/api/entries/99", { what: "x" })[0]
    assert_equal 404, call(:post, "/api/timer/pause")[0]
    assert_equal 404, call(:get, "/api/nope")[0]
    post "/api/plan", "{not json", "CONTENT_TYPE" => "application/json"
    assert_equal 404, last_response.status # wrong method
    put "/api/plan", "{not json", "CONTENT_TYPE" => "application/json"
    assert_equal 400, last_response.status
    assert_equal 400, call(:get, "/api/state?week=soon")[0]
    header "Host", "evil.example"
    get "/api/state"
    assert_equal 403, last_response.status # only this machine's names
  end

  def test_pages_and_shared_files
    get "/"
    assert_includes last_response.body, "/design/tokens.css"
    get "/design/tokens.css"
    assert_equal [200, "text/css"], [last_response.status, last_response.media_type]
    get "/design/../log/Gemfile"
    assert_equal 404, last_response.status
    with_env("LEETCODE_URL" => nil, "LOG_URL" => "http://example.test:9002") do
      assert_equal({ "log" => "http://example.test:9002" }, call(:get, "/api/apps")[1]) # design/ui.js fills in the rest
    end
    assert_equal 404, call(:get, "/api/dev/version")[0] # dev mode only
  end
end
