@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Friends Cards - local table

rem Each candidate is probed by actually running it and reading the major
rem version back. The Microsoft Store placeholder for python.exe answers with
rem an advert instead of "3", so it can never be selected even when it sits
rem first on PATH.

set "PY="
call :probe py -3
call :probe py
call :probe python
call :probe python3
for /d %%D in ("%LOCALAPPDATA%\Programs\Python\Python3*") do call :probe "%%~fD\python.exe"
for /d %%D in ("%ProgramFiles%\Python3*") do call :probe "%%~fD\python.exe"
for /d %%D in ("%ProgramFiles(x86)%\Python3*") do call :probe "%%~fD\python.exe"
for /d %%D in ("C:\Python3*") do call :probe "%%~fD\python.exe"

if not defined PY goto missing

echo.
echo   Using Python: !PY!
!PY! server.py
echo.
echo   The table server has stopped.
pause
exit /b 0

:probe
if defined PY exit /b 0
set "CANDIDATE=%*"
set "FOUND="
for /f "delims=" %%v in ('!CANDIDATE! -c "import sys;print(sys.version_info[0])" 2^>nul') do set "FOUND=%%v"
if "!FOUND!"=="3" set "PY=!CANDIDATE!"
exit /b 0

:missing
echo.
echo   [ERROR] No working Python 3 was found.
echo.
echo   If Windows just told you to install Python from the Microsoft Store,
echo   that is a placeholder shortcut standing in front of the real thing.
echo   Either:
echo.
echo     1. Install Python from https://www.python.org/downloads/
echo        and tick "Add python.exe to PATH" during setup, or
echo.
echo     2. Switch the placeholder off:
echo        Settings ^> Apps ^> Advanced app settings ^> App execution aliases
echo        then turn OFF python.exe and python3.exe
echo.
echo   You can also play with no Python at all: just open index.html.
echo   The game is identical, but it saves inside the browser rather than
echo   into friends-cards.db.
echo.
pause
exit /b 1
