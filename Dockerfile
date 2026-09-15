# =========================================
# Stage 1: 构建前端
# =========================================
# 前端产物是纯静态文件，与 CPU 架构无关：固定在构建机的原生平台上跑，
# 多架构发布时不用在 QEMU 模拟下执行 npm，快很多
FROM --platform=$BUILDPLATFORM node:24-alpine AS frontend-build

WORKDIR /build

# 先 copy package*.json 利用缓存
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# 拷贝前端源码并构建
COPY frontend/ ./
RUN npm run build

# =========================================
# Stage 2: 后端运行环境
# =========================================
FROM python:3.12-slim

# 系统依赖（Pillow 需要 libjpeg / zlib）
RUN apt-get update && apt-get install -y --no-install-recommends \
        libjpeg-dev \
        zlib1g-dev \
        libwebp-dev \
        tzdata \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python 依赖
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# 后端代码
COPY backend/app ./app

# 前端构建产物 -> 后端 static 目录
COPY --from=frontend-build /build/dist ./app/static

# 数据目录（挂载点）
RUN mkdir -p /app/data
VOLUME ["/app/data"]

# 版本号由发布流程从 git tag 传入；放在依赖安装之后，改版本号不会让上面的层缓存失效
ARG APP_VERSION=dev

ENV PYTHONUNBUFFERED=1
ENV TZ=Australia/Sydney
ENV WT_APP_VERSION=$APP_VERSION

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
