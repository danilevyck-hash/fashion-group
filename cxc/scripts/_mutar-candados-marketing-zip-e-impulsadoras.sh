#!/usr/bin/env bash
# ============================================================================
# Mutaciones del candado de la pieza (D) del rediseño de Marketing.
#
# Rompe UNA regla a la vez, corre `marketing-zip-e-impulsadoras.test.ts` y
# exige que se ponga ROJO. Después restaura el archivo. Un candado que no se
# pone rojo cuando la regla se rompe no es un candado.
#
#   bash scripts/_mutar-candados-marketing-zip-e-impulsadoras.sh
# ============================================================================
set -u
cd "$(dirname "$0")/.." || exit 1
TEST=src/__tests__/lib/marketing-zip-e-impulsadoras.test.ts
OK=0; MAL=0

correr() { npx vitest run "$TEST" >/tmp/_mut-zip.log 2>&1; }

mutar() { # nombre archivo viejo nuevo esperado(rojo|verde)
  local nombre="$1" arch="$2" viejo="$3" nuevo="$4" esperado="${5:-rojo}"
  cp "$arch" "$arch.bak"
  python3 - "$arch" "$viejo" "$nuevo" <<'PY'
import sys
p, viejo, nuevo = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(p).read()
if viejo not in s:
    sys.exit(9)
open(p, "w").write(s.replace(viejo, nuevo, 1))
PY
  if [ $? -eq 9 ]; then
    echo "  ⚠️  $nombre — no se encontró el texto a mutar"
    mv "$arch.bak" "$arch"; MAL=$((MAL+1)); return
  fi
  correr; local r=$?
  mv "$arch.bak" "$arch"
  if { [ "$esperado" = "rojo" ] && [ $r -ne 0 ]; } || { [ "$esperado" = "verde" ] && [ $r -eq 0 ]; }; then
    echo "  ✅ $nombre"; OK=$((OK+1))
  else
    echo "  ❌ $nombre — el candado NO lo agarró"; MAL=$((MAL+1))
  fi
}

Z=src/lib/marketing/zip-marca.ts
P=src/lib/marketing/papel-de-la-marca.ts
M=src/lib/marketing/meses-sin-pagar.ts
I=src/lib/marketing/zip-e-impulsadoras.ts

echo "Control: sin tocar nada tiene que estar VERDE"
correr && echo "  ✅ verde" && OK=$((OK+1)) || { echo "  ❌ arranca rojo"; MAL=$((MAL+1)); }

echo
echo "1. Impulsadoras"
mutar "vuelve a mirar solo 2 meses" "$M" \
  "  while (!esPosterior(mes, hasta)) {" \
  "  let _n = 0; while (!esPosterior(mes, hasta) && _n++ < 2) {"
mutar "el más viejo deja de ir arriba" "$M" \
  "  return out;
}

/**
 * La línea que resume" \
  "  return out.reverse();
}

/**
 * La línea que resume"
mutar "un mes a medias deja de contar" "$M" \
  'if (cob.estado !== "pagado") out.push(cob as MesSinPagar);' \
  'if (cob.estado === "pendiente") out.push(cob as MesSinPagar);'

echo
echo "2. El papel de la marca"
mutar "vuelve la nota interna" "$P" \
  'return f ? `${nombre} · cerrado el ${f}` : `${nombre} · cerrado`;' \
  'return `${nombre} · calculado (este período se cerró sin reporte guardado)`;'
mutar "deja de limpiar el nombre de la empresa" "$P" \
  "  let out = original;" \
  "  let out = original; if (original) return original;"
mutar "el sufijo vuelve a escribirse de dos formas" "$P" \
  '  return canon.coma ? `${cuerpo}, ${canon.texto}` : `${cuerpo} ${canon.texto}`;' \
  "  return texto;"
# El error de verdad que se puede cometer acá: leer el «50 %» como la mitad de
# la factura, cuando es el modelo viejo «marca 50 / Fashion Group 50».
mutar "el 50 % vuelve a partir el monto" "$P" \
  "  if (filas.length === 1) return redondear(t);" \
  "  if (filas.length === 1) return redondear(t * ((Number(mia.pct) || 0) / 100));"

echo
echo "3. El ZIP"
mutar "lo no reportado vuelve a entrar" "$Z" \
  "  if (!ZIP_E_IMPULSADORAS_NUEVO) return true;
  return seReportaDe(fila.se_reporta);" \
  "  return true;"
mutar "deja de limpiar los gastos" "$Z" \
  "  if (!ZIP_E_IMPULSADORAS_NUEVO) return [...gastos];" \
  "  return [...gastos];"
mutar "los links vuelven a durar un año" "$I" \
  "export const TTL_LINK_ZIP_SEGUNDOS = 60 * 60 * 24 * 30;" \
  "export const TTL_LINK_ZIP_SEGUNDOS = 60 * 60 * 24 * 365;"
mutar "el ZIP se guarda en otro lado" "$I" \
  'return `periodos/${String(periodoId).trim()}/${String(fechaISO).slice(0, 10)}.zip`;' \
  'return `zips/${String(periodoId).trim()}.zip`;'

echo
echo "Resultado: $OK bien · $MAL mal"
[ "$MAL" -eq 0 ]
