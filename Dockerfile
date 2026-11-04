# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS frontend
WORKDIR /build/web
RUN npm install --global pnpm@12.16.1
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN VITE_PUBLIC_DEMO=true pnpm build

FROM python:3.13-slim-bookworm AS dependencies
COPY --from=ghcr.io/astral-sh/uv:0.9.26 /uv /usr/local/bin/uv
ENV UV_PYTHON_DOWNLOADS=0 UV_LINK_MODE=copy UV_NO_CACHE=1
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

FROM python:3.13-slim-bookworm AS runtime
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONPATH=/app/src \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=10000
WORKDIR /app
RUN groupadd --gid 10001 boquitas \
    && useradd --uid 10001 --gid boquitas --no-create-home boquitas
COPY --from=dependencies /app/.venv /app/.venv
COPY src/ /app/src/
COPY --from=frontend /build/web/dist/ /app/web/dist/
USER boquitas
EXPOSE 10000
# Cancellation and concurrency state are process-local: retain exactly one worker.
CMD ["sh", "-c", "exec uvicorn boquitas.api:app --host 0.0.0.0 --port \"${PORT:-10000}\" --workers 1 --limit-concurrency 16 --no-access-log"]
