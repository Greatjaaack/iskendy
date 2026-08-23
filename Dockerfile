FROM python:3.12-slim

WORKDIR /app

# Зависимости отдельным слоем — кэшируются, пока pyproject/lock не менялись.
# Ставим строго по poetry.lock: в образ попадают те же версии, что проверены
# локально, а не «самые свежие на момент сборки».
COPY pyproject.toml poetry.lock ./
RUN pip install --no-cache-dir poetry==2.3.4 \
    && poetry config virtualenvs.create false \
    && poetry install --only main --no-root \
    && pip uninstall -y poetry

# Код бэкенда и статичный фронт.
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# БД живёт в volume, чтобы состояние переживало пересборку.
ENV DB_PATH=/data/iskendy.db
EXPOSE 8080

# Приложение работает под непривилегированным пользователем. `USER app` тут
# намеренно НЕ ставится: контейнер должен стартовать root'ом, чтобы выправить
# владельца смонтированного тома, и уже entrypoint роняет права до app —
# uvicorn до своего первого запроса root'ом не бывает.
RUN useradd --system --uid 10001 --create-home app \
    && mkdir -p /data \
    && chown -R app:app /data /app

WORKDIR /app/backend
ENTRYPOINT ["python", "/app/backend/entrypoint.py"]
# --no-proxy-headers: разбор X-Forwarded-For делает приложение (см. _client_ip),
# и ему нужен настоящий адрес соединения. Uvicorn со своим разбором подменил бы
# client.host тем же заголовком — проверять, кто его проставил, стало бы нечем.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080", "--no-proxy-headers"]
