#!/usr/bin/env python3
"""Reemplazo LITERAL de una cadena en un archivo, por argv.

🩸 NO se usa `perl -0pi -e 's|A|B|'`: el código real de este repo tiene `||`, y
con ese delimitador el patrón se des-escapa en una alternación con rama vacía
que se come el archivo entero — vitest no colecta nada, el "0 fallos" se lee
como "SOBREVIVIÓ" y el informe acusa al candado de un agujero que no existe.

Sale con código 2 si el texto viejo NO aparece (patrón MUERTO): una mutación que
no muta no es una mutación cazada, es una que nunca se probó.
"""
import sys

def main() -> int:
    if len(sys.argv) != 4:
        print("uso: _mutar-aplicar-boston-catalogo.py <archivo> <viejo> <nuevo>", file=sys.stderr)
        return 3
    ruta, viejo, nuevo = sys.argv[1], sys.argv[2], sys.argv[3]
    with open(ruta, encoding="utf-8") as fh:
        src = fh.read()
    if viejo not in src:
        print(f"PATRON MUERTO en {ruta}", file=sys.stderr)
        return 2
    with open(ruta, "w", encoding="utf-8") as fh:
        fh.write(src.replace(viejo, nuevo, 1))
    return 0

if __name__ == "__main__":
    sys.exit(main())
