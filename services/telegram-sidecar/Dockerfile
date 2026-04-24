FROM python:3.12-slim

# System deps kept minimal; Telethon is pure-python but cryptg (optional
# speed-up) needs a compiler. We skip cryptg in Phase 1 to keep the image
# lean; the sidecar is not on the hot path.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Non-root user so the session volume can be owned and locked down.
RUN useradd --uid 10001 --create-home sidecar \
    && mkdir -p /var/lib/telegram-sidecar/sessions \
    && chown -R sidecar:sidecar /var/lib/telegram-sidecar
USER sidecar

ENV SIDECAR_BIND_HOST=0.0.0.0
ENV SIDECAR_BIND_PORT=8088
EXPOSE 8088

CMD ["sh", "-c", "uvicorn app.main:app --host ${SIDECAR_BIND_HOST} --port ${SIDECAR_BIND_PORT}"]
