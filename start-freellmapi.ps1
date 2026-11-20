# FreeLLMAPI 手动启动入口 (V2 - 修正版)
# 说明：本文件是给人手动调用的入口，真正的启动逻辑统一在 launch-freellmapi.ps1，
# 避免两份实现各写一套参数后走偏（旧版曾把端口写成 3080、工作目录写成仓库根，双错）。
# 任务计划程序调用的是 launch-freellmapi.ps1，不调用本文件。
$ErrorActionPreference = 'Continue'
& (Join-Path $PSScriptRoot 'launch-freellmapi.ps1')
