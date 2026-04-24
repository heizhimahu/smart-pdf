@echo off
REM SmartPDF 后端启动脚本
REM 请确保已设置 DASHSCOPE_API_KEY 环境变量

echo ========================================
echo SmartPDF 后端服务器启动
echo ========================================

REM 检查是否在虚拟环境中
if not exist "venv\Scripts\python.exe" (
    echo 错误: 未找到虚拟环境
    echo 请确保已创建虚拟环境: python -m venv venv
    pause
    exit /b 1
)

REM 检查 API 密钥
if "%DASHSCOPE_API_KEY%"=="" (
    echo 警告: DASHSCOPE_API_KEY 环境变量未设置
    echo 将使用模拟模式（无真实 AI 处理）
    echo.
    echo 要使用真实 AI，请设置环境变量:
    echo PowerShell: $env:DASHSCOPE_API_KEY="your_api_key"
    echo CMD: set DASHSCOPE_API_KEY=your_api_key
    echo.
) else (
    echo 检测到 API 密钥，将使用真实 AI 处理
)

echo.
echo 启动服务器...
echo 访问地址: http://localhost:8002
echo 健康检查: http://localhost:8002/health
echo.
echo 按 Ctrl+C 停止服务器
echo ========================================

REM 使用虚拟环境中的 Python 启动服务器
venv\Scripts\python -m uvicorn main:app --host 0.0.0.0 --port 8002 --reload