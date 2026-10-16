# syntax=docker/dockerfile:1.7
# Локальный запуск нового фронта в Docker (Node 24 не нужен на хосте).
#   mock  — dev-сервер Vite + MSW, синтетические данные, без бэкенда
#   dist  — production-сборка (dist/ + архив релиза)
#   stack — настоящий бэкенд iskendy_site с новым фронтом во frontend/
# Запуск — docker/compose.yml, описание — docker/README.md.

FROM node:24.19.0-bookworm AS deps
WORKDIR /web
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --cache /root/.npm --no-audit --no-fund

FROM deps AS mock
COPY . .
EXPOSE 5173
CMD ["node", "scripts/dev-mock.mjs", "--host", "0.0.0.0", "--port", "5173"]

FROM deps AS dist
COPY . .
RUN npm run build

# Бэкенд берётся из соседнего клона (additional context «backend»), его код
# не меняется: подменяется только содержимое frontend/.
FROM python:3.12-slim AS stack
WORKDIR /app
COPY --from=backend pyproject.toml poetry.lock ./
RUN pip install --no-cache-dir poetry==2.3.4 \
    && poetry config virtualenvs.create false \
    && poetry install --only main --no-root \
    && pip uninstall -y poetry
COPY --from=backend backend/ ./backend/
COPY --from=dist /web/dist/ ./frontend/
ENV DB_PATH=/data/iskendy.db
EXPOSE 8080
RUN useradd --system --uid 10001 --create-home app \
    && mkdir -p /data && chown -R app:app /data /app
WORKDIR /app/backend
ENTRYPOINT ["python", "/app/backend/entrypoint.py"]
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080", \
     "--no-proxy-headers", "--no-access-log"]
