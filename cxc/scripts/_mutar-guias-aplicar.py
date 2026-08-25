#!/usr/bin/env python3
"""
Aplica UNA mutación literal a un archivo, y DENUNCIA la que no muta nada.

🩸 POR QUÉ NO ES UN `perl -0pi -e s|…|…|`. Un patrón que no matchea deja el
archivo intacto: los tests pasan y el script lo reporta como "SOBREVIVIÓ" — un
rojo inventado sobre un candado que nunca se puso a prueba. Y con `perl` y el
delimitador `|`, un `\\|\\|` del código real ni siquiera se puede escribir sin
que el patrón cambie de significado (pasó acá: la mutación se PEGÓ al principio
del archivo en vez de reemplazar nada).

Acá el reemplazo es LITERAL (nada de expresiones) y se exige que el texto viejo
aparezca EXACTAMENTE una vez, o `veces=N` las que se digan.

  python3 scripts/_mutar-guias-aplicar.py <archivo> <viejo> <nuevo> [veces]

Sale 0 si mutó, 3 si el patrón está muerto.
"""
import sys, io

archivo, viejo, nuevo = sys.argv[1], sys.argv[2], sys.argv[3]
veces = int(sys.argv[4]) if len(sys.argv) > 4 else 1

s = io.open(archivo, encoding="utf8").read()
hay = s.count(viejo)
if hay != veces:
    print(f"PATRÓN MUERTO: aparece {hay} veces, se esperaban {veces}", file=sys.stderr)
    sys.exit(3)
if viejo == nuevo:
    print("PATRÓN MUERTO: el reemplazo es idéntico al original", file=sys.stderr)
    sys.exit(3)
io.open(archivo, "w", encoding="utf8").write(s.replace(viejo, nuevo))
sys.exit(0)
