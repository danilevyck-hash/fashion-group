#!/usr/bin/env bash
# ============================================================================
# Mutaciones a mano del candado `marketing-foto-elige-marca` (24-sep-2026).
# Cada una rompe UNA regla; el candado tiene que ponerse rojo con las cuatro.
#
# 🔴 RESTAURA DESDE UNA COPIA, NUNCA CON `git checkout`: los archivos pueden
# tener trabajo sin commitear y un checkout se lo lleva entero.
# ============================================================================
set -u
cd "$(dirname "$0")/.."
CAND="src/__tests__/marketing/marketing-foto-elige-marca.test.tsx"
PURO="src/lib/marketing/fotos-periodo.ts"
RUTA="src/app/api/marketing/tienda/[codigo]/fotos/route.ts"
SERV="src/lib/marketing/fotos-periodo-server.ts"
PANT="src/app/marketing/components/FotosSection.tsx"
ARCHIVOS=("$PURO" "$RUTA" "$SERV" "$PANT")

COPIA="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$COPIA/$(dirname "$f")"
  cp "$f" "$COPIA/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$COPIA/$f" "$f"; done; }
trap 'restaurar; rm -rf "$COPIA"' EXIT

probar() {
  if npx vitest run "$CAND" >/dev/null 2>&1; then echo "  🔴 NO la cazó"; else echo "  ✅ cazada"; fi
  restaurar
}

echo "1. con dos marcas, sellar la primera sin preguntar (lo de antes)"
perl -0pi -e 's/  return \{ ok: false, periodoId: null, error: AVISO_ELIGE_LA_MARCA, faltaElegir: true \};/  return { ok: true, periodoId: opciones[0].periodoId, error: null, faltaElegir: false };/' "$PURO"
probar

echo "2. el período cerrado se rechaza con el aviso genérico"
perl -0pi -e 's/\? \(await estadoDelPeriodo\(elegido\)\) === "cerrado"/? false/' "$RUTA"
probar

echo "3. el servidor ofrece también los períodos CERRADOS"
perl -0pi -e 's/      \.in\("id", idsPeriodo\)\n      \.eq\("estado", "abierto"\);/      .in("id", idsPeriodo);/' "$SERV"
probar

echo "4. la pantalla preselecciona la primera marca"
perl -0pi -e 's/const \[marcaElegida, setMarcaElegida\] = useState<string>\(""\);/const [marcaElegida, setMarcaElegida] = useState<string>("");\n  useEffect(() => { if (marcas.length >= 2 \&\& !marcaElegida) setMarcaElegida(marcas[0].periodoId); }, [marcas, marcaElegida]);/' "$PANT"
probar
