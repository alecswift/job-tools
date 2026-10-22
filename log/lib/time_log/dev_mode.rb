module TimeLog
  # Dev mode (bin/server --dev): restart when lib/ changes, reload open pages when lib/, public/ or ../design/ changes.
  # The page asks GET /api/dev/version (served by App in dev mode only) and reloads when the answer changes.
  module DevMode
    ROOT = File.expand_path("../..", __dir__)

    def self.files(dir, pattern = "**/*") = Dir[File.join(dir, pattern)].select { File.file?(it) }

    # Newest mtime across lib/, public/ and ../design/
    def self.code_version
      (files(File.join(ROOT, "lib"), "**/*.rb") + files(File.join(ROOT, "public")) + files(App::DESIGN_DIR)).map { File.mtime(it).to_f }.max
    end

    # Restart the server when a .rb file in lib/ changes. Skips edits that don't compile yet.
    def self.restart_on_change
      mtimes = -> { files(File.join(ROOT, "lib"), "**/*.rb").to_h { [it, File.mtime(it)] } }
      seen = mtimes.call
      loop do
        sleep 0.5
        now = mtimes.call
        next if now == seen
        seen = now
        begin
          now.each_key { RubyVM::InstructionSequence.compile_file(it) }
        rescue SyntaxError => e
          puts "Syntax error, not restarting: #{e.message}"
          next
        end
        puts "Code changed, restarting..."
        # Start again the way we were started, with the same options
        exec(RbConfig.ruby, $PROGRAM_NAME, *ARGV)
      end
    end
  end
end
