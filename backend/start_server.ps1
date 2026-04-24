# SmartPDF 后端启动脚本 (PowerShell)
# 请确保已设置 DASHSCOPE_API_KEY 环境变量

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "SmartPDF 后端服务器启动" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 检查是否在虚拟环境中
if (-not (Test-Path "venv\Scripts\python.exe")) {
    Write-Host "错误: 未找到虚拟环境" -ForegroundColor Red
    Write-Host "请确保已创建虚拟环境: python -m venv venv" -ForegroundColor Yellow
    pause
    exit 1
}

# 检查 API 密钥
if (-not $env:DASHSCOPE_API_KEY) {
    Write-Host "警告: DASHSCOPE_API_KEY 环境变量未设置" -ForegroundColor Yellow
    Write-Host "将使用模拟模式（无真实 AI 处理）" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "要使用真实 AI，请设置环境变量:" -ForegroundColor Yellow
    Write-Host "PowerShell: `$env:DASHSCOPE_API_KEY='your_api_key'" -ForegroundColor Green
    Write-Host "注意: 请使用英文单引号或双引号，不要使用中文引号" -ForegroundColor Red
    Write-Host ""
} else {
    Write-Host "检测到 API 密钥，将使用真实 AI 处理" -ForegroundColor Green
    Write-Host "API 密钥前几位: $($env:DASHSCOPE_API_KEY.Substring(0, [Math]::Min(10, $env:DASHSCOPE_API_KEY.Length)))..." -ForegroundColor Gray
}

Write-Host ""
Write-Host "启动服务器..." -ForegroundColor Cyan
Write-Host "访问地址: http://localhost:8002" -ForegroundColor White
Write-Host "健康检查: http://localhost:8002/health" -ForegroundColor White
Write-Host ""
Write-Host "按 Ctrl+C 停止服务器" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan

# 使用虚拟环境中的 Python 启动服务器
venv\Scripts\python -m uvicorn main:app --host 0.0.0.0 --port 8002 --reload