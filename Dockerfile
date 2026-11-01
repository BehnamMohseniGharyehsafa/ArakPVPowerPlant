FROM node:22-bookworm-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim
WORKDIR /app
COPY pyproject.toml requirements.lock ./
RUN pip install --no-cache-dir -r requirements.lock
COPY backend/ backend/
COPY scripts/ scripts/
COPY docs/ docs/
COPY examples/ examples/
COPY --from=frontend /build/frontend/dist frontend/dist/
RUN pip install --no-deps . && useradd --create-home solar && mkdir -p /data && chown solar:solar /data
ENV SOLAR_DATA_DIR=/data PYTHONUNBUFFERED=1 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1
USER solar
RUN python scripts/build_reference.py
EXPOSE 8000
CMD ["python", "scripts/serve.py"]
