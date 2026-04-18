FROM python:3.11-slim

WORKDIR /app

# Install Node.js for building frontend
RUN apt-get update && apt-get install -y nodejs npm && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir yfinance

COPY backend/ .

# Build frontend - copy entire frontend directory and build
COPY frontend/ ./frontend/
WORKDIR /app/frontend
RUN npm install && npm run build
WORKDIR /app

COPY frontend/dist/ ./static/

RUN mkdir -p outputs/scan_cache outputs/ohlcv outputs/models outputs/data

EXPOSE 8080

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
