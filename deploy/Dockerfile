# Optional: containerised FastAPI backend (SHARP inline). The native conda-env
# approach in deploy/README.md is simpler on ki-pc; CUDA-in-Docker on Windows needs
# WSL2 GPU support. Build context is the REPO ROOT (it needs backend/ + pipeline/).
#
#   docker build -f deploy/Dockerfile -t memory-city-backend .
#
# SHARP (github.com/apple/ml-sharp) is a separate checkout. Make it available to the
# build by copying it under ./vendor/ml-sharp first, or adjust SHARP_SRC.
FROM nvidia/cuda:12.8.0-runtime-ubuntu22.04

ARG SHARP_SRC=vendor/ml-sharp
ENV DEBIAN_FRONTEND=noninteractive PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip git nodejs npm && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# CUDA build of torch (matches the dev laptop), then SHARP, then our deps.
RUN pip3 install --no-cache-dir --index-url https://download.pytorch.org/whl/cu128 \
    torch==2.8.0 torchvision==0.23.0
COPY ${SHARP_SRC} /app/ml-sharp
RUN pip3 install --no-cache-dir -r /app/ml-sharp/requirements.txt

COPY requirements-pipeline.txt requirements-backend.txt /app/
RUN pip3 install --no-cache-dir -r requirements-pipeline.txt -r requirements-backend.txt

# splat-transform (used by web/scripts/convert-splats.mjs) lives in web/node_modules.
COPY web/package.json web/package-lock.json /app/web/
RUN cd /app/web && npm ci --omit=dev

COPY backend /app/backend
COPY pipeline /app/pipeline
COPY web/scripts /app/web/scripts

EXPOSE 8000
CMD ["uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000"]
