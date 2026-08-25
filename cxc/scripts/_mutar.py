#!/usr/bin/env python3
"""Reemplazo LITERAL para los scripts de mutación.

🩸 Con `perl -0pi -e 's|...|...|'` una mutación puede NO APLICARSE por un
problema de escapes (un `${...}`, un `|` adentro del patrón) y el script lo
reporta como "SOBREVIVIÓ" — o sea, acusa al candado de un bug del script. Acá
se compara literal y se REVIENTA si el texto no estaba: una mutación que no se
aplica no prueba nada.

    python3 scripts/_mutar.py <archivo> <viejo> <nuevo>
"""
import io, sys

archivo, viejo, nuevo = sys.argv[1], sys.argv[2], sys.argv[3]
s = io.open(archivo, encoding="utf-8").read()
if viejo not in s:
    sys.stderr.write(f"MUTACION-NO-APLICADA: no encontré el texto en {archivo}\n")
    sys.exit(3)
io.open(archivo, "w", encoding="utf-8").write(s.replace(viejo, nuevo, 1))
