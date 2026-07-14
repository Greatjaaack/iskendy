FROM python:3.12-slim

WORKDIR /app

# Зависимости отдельным слоем — кэшируются, пока requirements не менялись.
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Код бэкенда и статичный фронт.
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# БД живёт в volume, чтобы состояние переживало пересборку.
ENV DB_PATH=/data/iskendy.db
EXPOSE 8080

WORKDIR /app/backend
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
