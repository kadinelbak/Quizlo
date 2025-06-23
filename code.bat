@echo off
cd /d C:\Users\elbak\Downloads\flashcard-maker

REM — Start serve on a known port
start "Static Server" cmd /k "npx serve . -l 5500"

timeout /t 1 >nul

REM — Open the browser on that port
start "" http://localhost:5500