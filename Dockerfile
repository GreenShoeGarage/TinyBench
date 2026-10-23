FROM node:22.15.0-bookworm-slim AS base
WORKDIR /app
COPY . .
ENV TINYBENCH_BIND=0.0.0.0 PORT=8765
USER node
EXPOSE 8765
CMD ["node", "service/server.cjs"]

# Optional TensorFlow layer. The basic target requires no Python.
FROM base AS ml
USER root
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv && rm -rf /var/lib/apt/lists/* \
 && python3 -m venv /opt/tinybench-python \
 && /opt/tinybench-python/bin/pip install --no-cache-dir tensorflow-cpu==2.20.0
ENV TINYBENCH_PYTHON=/opt/tinybench-python/bin/python
USER node
