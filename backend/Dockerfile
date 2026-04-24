FROM python:3.11-slim

# 安装 LibreOffice（docx 转 pdf）+ OpenCV 运行时依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice \
    libreoffice-writer \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# 设置 LibreOffice 路径（同名环境变量覆盖 main.py 中的 Windows 默认值）
ENV LIBREOFFICE_PATH=/usr/bin/libreoffice

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

EXPOSE 8002

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8002"]
