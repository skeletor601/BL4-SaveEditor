# BL4 AIO: single service (API + web app). Build from repo root.
# Serves React at / and API at /api. Python scripts run with cwd=/app.
FROM node:20-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-yaml && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# API
COPY api/package*.json api/tsconfig*.json api/
COPY api/src api/src
COPY api/data api/data

# Data dirs for API and Python scripts
COPY scripts scripts
COPY master_search master_search
COPY weapon_edit weapon_edit
COPY grenade grenade
COPY repkit repkit
COPY shield shield
COPY heavy heavy
COPY class_mods class_mods
COPY enhancement enhancement
COPY save_ops.py serial_codec.py serial_encoder.py item_registry.py progression.py progression_data.py asset_loader.py ./
COPY ui_localization*.json item_localization_zh-CN.json ./
COPY codec codec

# Build API (need devDependencies for tsc)
WORKDIR /app/api
RUN npm install && npm run build

# Web app (build with empty VITE_API_URL so frontend uses same-origin /api)
WORKDIR /app
COPY web/package*.json web/
WORKDIR /app/web
RUN npm install
COPY web .
WORKDIR /app/web
ENV VITE_API_URL=
RUN npm run build

# Run from repo root: serve web from / and API from /api
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
CMD ["node", "api/dist/index.js"]
