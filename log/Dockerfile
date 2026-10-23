# Built from the repo root (see docker-compose.yml), so the shared design/ can go in too.
# The full image (not -slim) has the compiler Puma's native extension needs.
FROM ruby:4.0.7

WORKDIR /app/log
COPY log/Gemfile log/Gemfile.lock log/.ruby-version ./
RUN bundle config set --global without test && bundle install

COPY design /app/design
COPY log/config.ru log/Rakefile ./
COPY log/bin ./bin
COPY log/db ./db
COPY log/lib ./lib
COPY log/public ./public

ENV HOST=0.0.0.0 PORT=8002 LOG_DATA=/log-data/log.sqlite3
EXPOSE 8002
CMD ["bin/server"]
