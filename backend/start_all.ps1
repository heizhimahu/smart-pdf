# SmartPDF 一键启动脚本
# 启动后端和前端服务

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "SmartPDF 全栈启动" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 检查目录
$backendDir = "D:\smart-pdf\backend"
$frontendDir = "D:\smart-pdf\frontend"

if (-not (Test-Path $backendDir)) {
    Write-Host "错误: 后端目录不存在: $backendDir" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $frontendDir)) {
    Write-Host "错误: 前端目录不存在: $frontendDir" -ForegroundColor Red
    exit 1
}

# 设置 API 密钥
Write-Host "设置 API 密钥..." -ForegroundColor Yellow
$env:DASHSCOPE_API_KEY = "sk-13bbe1f75b7b41cba97e3e1232dc995b"
Write-Host "✅ API 密钥已设置" -ForegroundColor Green

# 启动后端
Write-Host ""
Write-Host "启动后端服务器..." -ForegroundColor Cyan
Write-Host "端口: 8002" -ForegroundColor White
Write-Host "URL: http://localhost:8002" -ForegroundColor White

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backendDir'; `$env:DASHSCOPE_API_KEY='sk-13bbe1f75b7b41cba97e3e1232dc995b'; .\venv\Scripts\python -m uvicorn main:app --host 0.0.0.0 --port 8002 --reload" -WindowStyle Normal

# 等待后端启动
Write-Host "等待后端启动..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# 测试后端
try {
    $health = Invoke-RestMethod -Uri "http://localhost:8002/health" -TimeoutSec 10
    Write-Host "✅ 后端健康检查通过: $($health.status)" -ForegroundColor Green
} catch {
    Write-Host "❌ 后端启动失败: $_" -ForegroundColor Red
    Write-Host "请检查后端日志" -ForegroundColor Yellow
}

# 启动前端
Write-Host ""
Write-Host "启动前端开发服务器..." -ForegroundColor Cyan
Write-Host "端口: 3000" -ForegroundColor White
Write-Host "URL: http://localhost:3000" -ForegroundColor White

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$frontendDir'; npm run dev" -WindowStyle Normal

# 等待前端启动
Write-Host "等待前端启动..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "启动完成！" -ForegroundColor Green
Write-Host ""
Write-Host "访问地址:" -ForegroundColor Yellow
Write-Host "前端: http://localhost:3000" -ForegroundColor White
Write-Host "后端: http://localhost:8002" -ForegroundColor White
Write-Host ""
Write-Host "API 端点:" -ForegroundColor Yellow
Write-Host "健康检查: http://localhost:8002/health" -ForegroundColor White
Write-Host "Word转PDF: http://localhost:8002/convert" -ForegroundColor White
Write-Host "AI去手写: http://localhost:8002/remove-handwriting" -ForegroundColor White
Write-Host ""
Write-Host "使用说明:" -ForegroundColor Yellow
Write-Host "1. 上传 Word 文档 (.docx)" -ForegroundColor White
Write-Host "2. 点击'转换为 PDF'" -ForegroundColor White
Write-Host "3. 在 PDF 上框选手写区域" -ForegroundColor White
Write-Host "4. 点击'清除手写'" -ForegroundColor White
Write-Host "5. 观察 AI 处理结果" -ForegroundColor White
Write-Host ""
Write-Host "按任意键查看日志，或关闭窗口停止服务..." -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan

$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")