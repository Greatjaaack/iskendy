# syntax=docker/dockerfile:1.7
# Docker-обвязка нового фронта (Node 24.19 на хосте не нужен). Цели:
#   mock  — dev-сервер Vite + MSW, синтетические данные, без бэкенда
#   dist  — production-сборка: /web/dist (+ архив релиза в /web/artifacts)
#   stack — настоящий бэкенд iskendy_site (additional context «backend»)
#           с этой сборкой во frontend/
#   test  — всё для проверок: браузеры Playwright + исходники.
#           Сами проверки запускает docker/verify.sh (сервис verify в
#           compose.yml), а не сборка образа: так видно код возврата, логи
#           лежат в docker/out/, а число потоков и память задаются при запуске.
# Как пользоваться — docker/README.md.

FROM node:24.19.0-bookworm AS deps
WORKDIR /web
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --cache /root/.npm --no-audit --no-fund

FROM deps AS mock
COPY . .
EXPOSE 5173
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:5173/').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "scripts/dev-mock.mjs", "--host", "0.0.0.0", "--port", "5173"]

# VERSION в сборке берёт коммит из .git: контекст включает .git, а всё, что
# исключено в .dockerignore, в git не отслеживается — сборка чистого дерева
# не помечается «-dirty».
FROM deps AS dist
COPY . .
RUN npm run build

# Бэкенд — как есть из соседнего клона: подменяется только frontend/.
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
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/api/health', timeout=3)"
ENTRYPOINT ["python", "/app/backend/entrypoint.py"]
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080", \
     "--no-proxy-headers", "--no-access-log"]

FROM deps AS test
ENV CI=true PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx playwright install --with-deps chromium webkit
COPY . .
CMD ["sh", "docker/verify.sh"]
