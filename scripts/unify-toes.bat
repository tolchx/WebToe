@echo off
setlocal enabledelayedexpansion

set SRC=C:\Users\Tolch\Documents\AI_Code\Touchdesigner_MCP\Main\old\mcp_td_v3\Toe_Expand
set DST=C:\Users\Tolch\Documents\AI_Code\WebToe\toes\Touchdesigner

echo =========================================
echo Unificando Toe_Expand → toes/Touchdesigner
echo =========================================
echo.
echo Origen:  %SRC%
echo Destino: %DST%
echo.

set /a TOTAL=0
set /a COPIED=0
set /a SKIPPED=0

for /f "tokens=*" %%f in ('dir "%SRC%" /b 2^>nul') do (
    set /a TOTAL+=1
    set "ITEM=%%f"
    set "ITEM_LOWER=!ITEM!"
    rem Convert to lowercase for comparison
    for %%a in (A B C D E F G H I J K L M N O P Q R S T U V W X Y Z) do (
        set "ITEM_LOWER=!ITEM_LOWER:%%a=%%a!"
    )
    
    if exist "%DST%\!ITEM!" (
        set /a SKIPPED+=1
    ) else (
        robocopy "%SR%\!ITEM!" "%DST%\!ITEM!" /E /NP /NFL /NDL >nul 2>&1
        if !errorlevel! LSS 8 (
            set /a COPIED+=1
            if !COPIED! LSS 20 echo Copiando: %%f
        )
    )
)

echo.
echo =========================================
echo RESUMEN:
echo   Total en origen:  %TOTAL%
echo   Copiados nuevos:  %COPIED%
echo   Omitidos (dup):   %SKIPPED%
echo.
echo Total en destino:
for /f %%c in ('dir "%DST%" /b 2^>nul ^| find /c /v ""') do echo   %%c proyectos
echo =========================================
pause
