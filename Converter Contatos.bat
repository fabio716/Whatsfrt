@echo off
chcp 65001 >nul
title Conversor de Contatos - WhatsFRT

python "%~dp0converter-contatos.py" %*

if errorlevel 1 (
    echo.
    echo ❌ Erro ao executar Python!
    echo Certifique-se de que o Python está instalado.
    pause
)
