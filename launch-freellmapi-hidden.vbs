# 立刻隐藏自己的控制台窗口，消除任务计划程序下的闪窗
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 { [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n); [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow(); }
"@
[Win32]::ShowWindow([Win32]::GetConsoleWindow(), 0)' launch-freellmapi-hidden.vbs
' Runs launch-freellmapi.ps1 with NO console window.
' Task Scheduler's `-WindowStyle Hidden` cannot suppress powershell.exe's
' console flash: PowerShell is a console-subsystem binary, so Windows
' allocates and briefly shows the console before the hidden style applies.
' Wrapping in wscript.exe (a Windows Script Host binary) means no console
' is created at all — zero flash, while the 5-minute self-heal is preserved.
Option Explicit
Dim sh, cmd
Set sh = CreateObject("WScript.Shell")
cmd = """C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""C:\Users\Administrator\freellmapi\launch-freellmapi.ps1"""
sh.Run cmd, 0, False