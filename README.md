# SmartPDF - 智能文档局部擦除工具

基于图像修复技术的 PDF 内容无痕擦除工具。用户框选任意区域，即可像素级擦除批注/水印/污渍，算法自动修复背景。

<!-- ====== 效果展示（后续替换为真实截图） ====== -->
<!--
![擦除前](./screenshots/before.png)
![擦除后](./screenshots/after.png)
-->

---

## 核心功能

- **多格式上传**：支持 docx/pdf，LibreOffice 无损转换，完美保留图片、表格、排版
- **精确框选**：Canvas 渲染 PDF，鼠标拖拽选取擦除区域，支持多页操作
- **智能修复**：OpenCV Inpainting 算法，擦除后背景平滑无痕，保留原始文字
- **会话管理**：多页编辑状态自动保存，编辑页与未编辑页统一合成
- **一键下载**：处理后 PDF 直接下载，支持保留未编辑页面

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js + TypeScript + Tailwind CSS + pdf.js |
| 后端 | FastAPI (Python) |
| 文档转换 | LibreOffice (headless 命令行模式) |
| 图像处理 | OpenCV Inpainting (Telea 算法) |
| AI 增强 | 通义万相 / DashScope（可选，可配置 API Key） |
| PDF 合成 | pypdf + reportlab |

## 快速开始

### 前置依赖

1. **Python 3.10+** — [python.org](https://www.python.org/)
2. **Node.js 18+** — [nodejs.org](https://nodejs.org/)
3. **LibreOffice** — [libreoffice.org](https://www.libreoffice.org/download/)
   - 安装后确保 `soffice.exe` 在系统路径或默认安装位置
   - 默认路径：`C:\Program Files\LibreOffice\program\soffice.exe`

### 1. 启动后端

```bash
cd backend

# 创建虚拟环境
python -m venv venv

# Windows:
venv\Scripts\activate
# macOS/Linux:
# source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 启动服务（默认端口 8002）
uvicorn main:app --host 0.0.0.0 --port 8002 --reload
```

### 2. 启动前端

```bash
cd frontend
npm install
npm run dev
```

### 3. 访问

浏览器打开 [http://localhost:3000](http://localhost:3000)

## 使用指南

1. **上传文件**：点击上传区域，选择 `.docx` 或 `.pdf` 文件
2. **加载/转换**：
   - PDF 文件直接加载到 Canvas 预览
   - Word 文档自动调用 LibreOffice 转换为 PDF（保留所有格式和图片）
3. **框选擦除区域**：在 PDF 页面按住鼠标拖拽，绘制红色选区
4. **清除内容**：点击「清除手写」按钮，算法自动修复选区背景
5. **下载结果**：点击「下载编辑后 PDF」获取完整文档

## 项目结构

```
smart-pdf/
├── frontend/               # Next.js 前端
│   ├── app/
│   │   ├── page.tsx        # 主页面（上传 + 编辑控制）
│   │   ├── layout.tsx      # 布局
│   │   └── components/
│   │       └── PDFCanvas.tsx  # PDF 渲染 + 框选交互
│   ├── package.json
│   └── tsconfig.json
├── backend/                # FastAPI 后端
│   ├── main.py             # API 主入口（转换 / 擦除 / 会话 / 下载）
│   ├── requirements.txt    # Python 依赖
│   └── start_server.ps1    # 启动脚本
├── README.md
└── .gitignore
```

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/convert` | 上传 docx/pdf，返回 PDF |
| POST | `/init-session` | 初始化编辑会话 |
| POST | `/save-page-image` | 保存编辑后的页面图像 |
| POST | `/remove-handwriting` | 框选擦除手写批注 |
| POST | `/download-edited-pdf` | 下载编辑后的完整 PDF |
| GET  | `/health` | 健康检查 |

## 配置说明

- **后端端口**：默认 `8002`，可在启动命令中修改 `--port`
- **AI API Key**：可选配置，设置环境变量 `DASHSCOPE_API_KEY` 启用通义万相
- **LibreOffice 路径**：在 `backend/main.py` 中修改 `LIBREOFFICE_PATH` 变量
