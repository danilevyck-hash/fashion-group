#!/usr/bin/env python3
"""
Reemplazo LITERAL para los scripts de mutación.

🩸 POR QUÉ NO SE USA `perl -0pi -e 's|A|B|'` ACÁ, y este repo ya lo pagó dos veces:
el delimitador se des-escapa contra el código real. Un `||` del producto adentro
del patrón se convierte en una ALTERNACIÓN CON RAMA VACÍA, matchea la cadena
vacía en el byte 0 y el reemplazo SE COME EL ARCHIVO ENTERO. Con el módulo roto
vitest no colecta nada, escribe «Tests  no tests» y el informe lee ese cero como
«SOBREVIVIÓ» — acusa al candado de un agujero que no existe.

Acá los textos viajan como ARGUMENTOS (argv): no hay delimitador que escapar y
no hay regex que interpretar.

Uso:  _mutar-aplicar.py <archivo> <texto viejo> <texto nuevo> [veces esperadas]

Sale con código ≠ 0 —y NO toca el archivo— si el texto viejo no aparece las
veces que se le dijeron. Un patrón que no muta nada tiene que DENUNCIARSE, no
contarse como mutación cazada.
"""
import sys

if len(sys.argv) < 4:
    sys.exit("uso: _mutar-aplicar.py <archivo> <viejo> <nuevo> [veces]")

ruta, viejo, nuevo = sys.argv[1], sys.argv[2], sys.argv[3]
esperadas = int(sys.argv[4]) if len(sys.argv) > 4 else 1

with open(ruta, encoding="utf-8") as f:
    texto = f.read()

encontradas = texto.count(viejo)
if encontradas != esperadas:
    sys.exit(
        f"⛔ PATRÓN MUERTO en {ruta}: el texto aparece {encontradas} veces "
        f"y se esperaban {esperadas}. El archivo NO se tocó."
    )

with open(ruta, "w", encoding="utf-8") as f:
    f.write(texto.replace(viejo, nuevo))
