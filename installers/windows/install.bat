@echo off
chcp 65001 >nul
setlocal

REM PowerShell 스크립트로 위임 (UTF-8, 실행 정책 우회)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
exit /b %ERRORLEVEL%
