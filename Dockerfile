FROM python:3.11-slim

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir yfinance

COPY backend/ .

COPY frontend/dist/ ./static/

RUN mkdir -p outputs/scan_cache outputs/ohlcv outputs/models outputs/data

EXPOSE 8080

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
