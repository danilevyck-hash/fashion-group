#!/usr/bin/env bash
# Mutaciones a mano del candado `marketing-remates`. Rompe una regla, corre el
# candado, restaura. Se espera ROJO en todas y VERDE en el control.
set -u
cd "$(dirname "$0")/.." || exit 1
T=src/__tests__/components/marketing-remates.test.tsx
tmp=$(mktemp -d)
guardar() { cp "$1" "$tmp/$(echo "$1" | tr / _)"; }
restaurar() { cp "$tmp/$(echo "$1" | tr / _)" "$1"; }
correr() { npx vitest run "$T" >/dev/null 2>&1 && echo "🟢 VERDE" || echo "🔴 ROJO"; }

E=src/lib/marketing/editar-gasto.ts
R=src/app/api/marketing/inventario/entregas/\[id\]/route.ts
P=src/app/marketing/components/PuertaGasto.tsx
Z=src/lib/marketing/zips-del-periodo.ts
M=src/lib/marketing/mutations.ts
for f in "$E" "$R" "$P" "$Z" "$M"; do guardar "$f"; done

echo -n "control sin mutar .......................... "; correr

echo -n "1 columnasQueVinieron manda las tres siempre  "
python3 - "$E" <<'PY'
import sys
p=sys.argv[1]; s=open(p).read()
s=s.replace('  if ("seReporta" in b) out.seReporta', '  if (true) out.seReporta',1)
s=s.replace('  if ("tiendaCodigo" in b) {', '  if (true) {',1)
open(p,"w").write(s)
PY
correr; restaurar "$E"

echo -n "2 la ruta de la entrega vuelve a tirarlas ... "
python3 - "$R" <<'PY'
import sys
p=sys.argv[1]; s=open(p).read()
s=s.replace('      ...(traeAlgoDelGasto(delGasto) ? delGasto : {}),\n','',1)
open(p,"w").write(s)
PY
correr; restaurar "$R"

echo -n "3 datosDeLaFila abre siempre apagada ....... "
python3 - "$E" <<'PY'
import sys
p=sys.argv[1]; s=open(p).read()
s=s.replace('seReporta: seReportaDe(fila?.se_reporta),','seReporta: false,',1)
open(p,"w").write(s)
PY
correr; restaurar "$E"

echo -n "4 el mueble vuelve a quedarse sin foto ..... "
python3 - "$P" <<'PY'
import sys
p=sys.argv[1]; s=open(p).read()
s=s.replace('''                    {tipo === "mueble" ? "Foto del mueble" : rotuloDeLaPuerta()}{" "}''','''                    {rotuloDeLaPuerta()}{" "}''',1)
open(p,"w").write(s)
PY
correr; restaurar "$P"

echo -n "5 la foto del mueble deja de colgar de la tienda "
python3 - "$P" <<'PY'
import sys
p=sys.argv[1]; s=open(p).read()
s=s.replace('const destino = comun.tiendaCodigo ?? TIENDA_GENERAL;','const destino = comun.tiendaCodigo ?? "";',1)
open(p,"w").write(s)
PY
correr; restaurar "$P"

echo -n "6 la lista de ZIPs se dibuja vacía ......... "
python3 - "$Z" <<'PY'
import sys
p=sys.argv[1]; s=open(p).read()
s=s.replace('  return lista.length > 0;','  return true;',1)
open(p,"w").write(s)
PY
correr; restaurar "$Z"

echo -n "7 los ZIPs salen del más viejo al más nuevo  "
python3 - "$Z" <<'PY'
import sys
p=sys.argv[1]; s=open(p).read()
s=s.replace('    return a.bajado_en < b.bajado_en ? 1 : -1;','    return a.bajado_en < b.bajado_en ? -1 : 1;',1)
open(p,"w").write(s)
PY
correr; restaurar "$Z"

echo -n "8 al editar, la factura se acusa a sí misma  "
python3 - "$M" <<'PY'
import sys
p=sys.argv[1]; s=open(p).read()
s=s.replace('''  await frenarFacturaDuplicada({
    id,''','''  await frenarFacturaDuplicada({''',1)
open(p,"w").write(s)
PY
correr; restaurar "$M"

echo -n "control final .............................. "; correr
rm -rf "$tmp"
