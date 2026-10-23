# Built from the repo root (see docker-compose.yml), so the shared design/ can go in too.
FROM python:3.12-slim

# tzdata so "today" follows TZ instead of UTC
RUN apt-get update && apt-get install -y --no-install-recommends tzdata && rm -rf /var/lib/apt/lists/*

WORKDIR /app/leetcode-helper
COPY design /app/design
COPY leetcode-helper/backend ./backend
COPY leetcode-helper/static ./static

ENV HOST=0.0.0.0 PORT=8001 TRACKER_DATA=/data/data.json PYTHONUNBUFFERED=1
EXPOSE 8001
CMD ["python3", "-m", "backend"]
