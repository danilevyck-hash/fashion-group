"""Aplica UNA mutacion literal y avisa si el patron no matchea nada.

🔴 EL REEMPLAZO ES LITERAL Y VIENE POR ARGV, no dentro de un `s|de|a|` de sed ni
de perl: el codigo real tiene `||`, `/` y `#`, y cualquier delimitador se
des-escapa. En este repo eso ya produjo un "SOBREVIVIO" falso tres veces — una
de ellas el `||` que convirtio el patron en una alternacion con rama vacia y se
comio el archivo entero.

    python3 scripts/_mutar-candados-excel-fila-1.py <archivo> <viejo> <nuevo> [veces]
"""
import pathlib
import sys

if len(sys.argv) < 4:
    sys.exit("uso: mutar.py <archivo> <viejo> <nuevo> [veces]")

ruta = pathlib.Path(sys.argv[1])
viejo, nuevo = sys.argv[2], sys.argv[3]
veces = int(sys.argv[4]) if len(sys.argv) > 4 else 1

s = ruta.read_text()
hay = s.count(viejo)
if hay != veces:
    # ⛔ Un patron que no muta nada deja el archivo SANO, los tests pasan, y el
    # informe cantaria "SOBREVIVIO": un rojo inventado sobre un candado que
    # nunca se puso a prueba. Se denuncia en vez de darlo por cazado.
    sys.exit(f"PATRON_MUERTO: aparece {hay} veces, se esperaban {veces}")

ruta.write_text(s.replace(viejo, nuevo))
print("mutado")
