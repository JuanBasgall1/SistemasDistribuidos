#!/bin/zsh
# Compila la solución y abre una ventana de Terminal por proceso:
# NodoA, NodoB, NodoC, Coordinador y Cliente Externo.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
dotnet build "$DIR" -v q

abrir() {
  osascript -e "tell application \"Terminal\" to do script \"cd '$DIR' && clear && $1\"" >/dev/null
}

abrir "dotnet Grupo.Nodo/bin/Debug/net9.0/Grupo.Nodo.dll NodoA"
abrir "dotnet Grupo.Nodo/bin/Debug/net9.0/Grupo.Nodo.dll NodoB"
abrir "dotnet Grupo.Nodo/bin/Debug/net9.0/Grupo.Nodo.dll NodoC"
abrir "dotnet Grupo.Coordinador/bin/Debug/net9.0/Grupo.Coordinador.dll"
sleep 3
abrir "dotnet Grupo.ClienteExterno/bin/Debug/net9.0/Grupo.ClienteExterno.dll ${1:-127.0.0.1} 6000"
osascript -e 'tell application "Terminal" to activate'
