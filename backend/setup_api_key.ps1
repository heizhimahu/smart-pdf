# SmartPDF API 密钥设置脚本
# 此脚本帮助正确设置 DASHSCOPE_API_KEY 环境变量

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "SmartPDF API 密钥设置" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 用户提供的 API 密钥（注意：原命令使用了中文引号）
$userApiKey = "sk-13bbe1f75b7b41cba97e3e1232dc995b"

Write-Host "检测到您之前使用的命令:" -ForegroundColor Yellow
Write-Host "  `$env:DASHSCOPE_API_KEY=“sk-13bbe1f75b7b41cba97e3e1232dc995b”" -ForegroundColor Gray
Write-Host ""
Write-Host "问题: 使用了中文引号“”而不是英文引号" -ForegroundColor Red
Write-Host "这会导致环境变量值包含引号字符，API 调用失败" -ForegroundColor Red
Write-Host ""

# 清理 API 密钥（移除可能的引号）
$cleanApiKey = $userApiKey.Trim('"', "'", "“", "”")

Write-Host "清理后的 API 密钥:" -ForegroundColor Green
Write-Host "  $cleanApiKey" -ForegroundColor White
Write-Host ""

# 设置环境变量
Write-Host "正在设置环境变量..." -ForegroundColor Cyan
$env:DASHSCOPE_API_KEY = $cleanApiKey

Write-Host "✅ 环境变量已设置" -ForegroundColor Green
Write-Host ""

# 验证设置
Write-Host "验证设置..." -ForegroundColor Cyan
if ($env:DASHSCOPE_API_KEY -eq $cleanApiKey) {
    Write-Host "✅ 验证成功" -ForegroundColor Green
    Write-Host "   DASHSCOPE_API_KEY: $($env:DASHSCOPE_API_KEY.Substring(0, [Math]::Min(10, $env:DASHSCOPE_API_KEY.Length)))..." -ForegroundColor Gray
} else {
    Write-Host "❌ 验证失败" -ForegroundColor Red
}

Write-Host ""
Write-Host "使用方法:" -ForegroundColor Yellow
Write-Host "1. 在当前终端中，环境变量已生效" -ForegroundColor White
Write-Host "2. 运行启动脚本: .\start_server.ps1" -ForegroundColor White
Write-Host "3. 或手动启动: venv\Scripts\python -m uvicorn main:app --host 0.0.0.0 --port 8002 --reload" -ForegroundColor White
Write-Host ""
Write-Host "注意: 此设置仅在当前终端会话有效" -ForegroundColor Yellow
Write-Host "要永久设置，请在系统环境变量中添加 DASHSCOPE_API_KEY" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan