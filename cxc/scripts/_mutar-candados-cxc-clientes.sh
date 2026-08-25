#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN de los candados del PR "CXC y Clientes".
#
# Rompe el código A PROPÓSITO, una cosa por vez, y exige que los tests se pongan
# ROJOS. Un candado que sobrevive a su mutación no es un candado: es decoración.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`. En esta rama hay
# archivos NUEVOS: git aborta el comando entero y no restaura NADA, así que las
# mutaciones se apilan y ninguna se prueba por separado. Este repo ya lo pagó.
#
# 🩸 Y `probar()` EXIGE encontrar el resumen de vitest: si la corrida se muere,
# "0 fallos" se leería como "la mutación sobrevivió" — un verificador que miente
# en verde es peor que no tenerlo.
#
#   bash scripts/_mutar-candados-cxc-clientes.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

RESPALDO="$(mktemp -d)"
ARCHIVOS=(
  "src/app/api/cxc/aging/route.ts"
  "src/app/clientes/ClientesListClient.tsx"
  "src/app/admin/components/EstadoCuentaDrawer.tsx"
  "src/app/admin/components/ClientTable.tsx"
  "src/app/admin/components/ClientRow.tsx"
  "src/app/admin/hooks/useAdminData.ts"
  "src/components/cxc/BostonTab.tsx"
)
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap 'restaurar; rm -rf "$RESPALDO"' EXIT

TESTS=(
  "src/__tests__/api/cxc-telefono-en-vivo.test.ts"
  "src/__tests__/components/clientes-busqueda-en-la-url.test.tsx"
  "src/__tests__/components/cxc-estado-cuenta-un-boton.test.tsx"
  "src/__tests__/components/cxc-codigo-muerto-podado.test.tsx"
  "src/__tests__/components/cxc-pestanas-y-menu.test.tsx"
  "src/__tests__/lib/tablas-anchas-ipad.test.ts"
  "src/__tests__/lib/cxc-anotaciones-cartera.test.ts"
  "src/__tests__/lib/cxc-montos-escritos-a-mano.test.ts"
  "src/__tests__/lib/swr-datos-del-servidor.test.ts"
  "src/__tests__/lib/cxc-boston-fuera-de-toda-superficie.test.ts"
)

CAZADAS=0; SOBREVIVIERON=0

probar() {
  local nombre="$1"
  local salida
  salida="$(npx vitest run "${TESTS[@]}" 2>&1)"
  # El resumen TIENE que estar: sin él no se sabe nada.
  if ! grep -qE "Tests +[0-9]" <<<"$salida"; then
    echo "  ⛔ $nombre — la corrida de vitest murió, no se puede juzgar"
    SOBREVIVIERON=$((SOBREVIVIERON + 1)); restaurar; return
  fi
  local fallos
  fallos="$(grep -oE "Tests +[0-9]+ failed" <<<"$salida" | grep -oE "[0-9]+" | head -1)"
  if [[ -n "${fallos:-}" && "$fallos" -gt 0 ]]; then
    echo "  ✅ $nombre — cazada ($fallos test(s) en rojo)"
    CAZADAS=$((CAZADAS + 1))
  else
    echo "  ❌ $nombre — SOBREVIVIÓ"
    SOBREVIVIERON=$((SOBREVIVIERON + 1))
  fi
  restaurar
}

mutar() { perl -0pi -e "$1" "$2"; }

echo "── 1. El teléfono en vivo ──────────────────────────────────────────────"

mutar 's/await refrescarContacto\(rows\);/void refrescarContacto;/' src/app/api/cxc/aging/route.ts
probar "el CXC vuelve a leer el teléfono viejo de la MV"

mutar 's/fila\.telefono = m\.telefono \?\? "";/ /' src/app/api/cxc/aging/route.ts
probar "el teléfono no se refresca (sólo el correo)"

mutar 's/if \(!m\) continue;/if (!m) continue;\n    fila.total = 0;/' src/app/api/cxc/aging/route.ts
probar "el refresco toca la PLATA"

mutar 's/fila\.telefono = m\.telefono \?\? "";/fila.telefono = m.telefono || fila.telefono;/' src/app/api/cxc/aging/route.ts
probar "borrar el teléfono en la ficha no se refleja"

mutar 's/console\.error\("\[api\/cxc\/aging\] contacto en vivo falló, se usa el de la MV:", e\);/throw e;/' src/app/api/cxc/aging/route.ts
probar "el contacto deja de fallar abierto y tumba la cartera"

mutar 's/const LOTE_CODIGOS = 300;/const LOTE_CODIGOS = 5000;/' src/app/api/cxc/aging/route.ts
probar "el lote del .in() pasa el tope de PostgREST"

echo "── 2. La búsqueda en la URL ────────────────────────────────────────────"

mutar 's/const \[qDebounced, setQDebounced\] = useUrlState\("search", ""\);/const [qDebounced, setQDebounced] = useState("");/' src/app/clientes/ClientesListClient.tsx
probar "la búsqueda vuelve a useState (se pierde al volver de la ficha)"

mutar 's/const \[page, setPage\] = useUrlState\("page", 1\);/const [page, setPage] = useState(1);/' src/app/clientes/ClientesListClient.tsx
probar "la página vuelve a useState"

mutar 's/const \[provincia, setProvincia\] = useUrlState\("provincia", ""\);/const [provincia, setProvincia] = useState("");/' src/app/clientes/ClientesListClient.tsx
probar "la provincia vuelve a useState"

mutar 's/useUrlState\("search", ""\)/useUrlState("search", "", { history: "push" })/' src/app/clientes/ClientesListClient.tsx
probar "el filtro empieza a crear entradas de historial (push)"

mutar 's/router\.push\(`\/clientes\/\$\{encodeURIComponent\(c\.codigo\)\}`\)/router.replace(`\/clientes\/\${encodeURIComponent(c.codigo)}`)/' src/app/clientes/ClientesListClient.tsx
probar "el drill-down a la ficha deja de crear entrada (replace)"

echo "── 3. Un solo botón, y el error visible ────────────────────────────────"

mutar 's/setErrorPdf\("No se pudo preparar el PDF\. Intenta de nuevo en unos segundos\."\);/ /' src/app/admin/components/EstadoCuentaDrawer.tsx
probar "el error del PDF vuelve a ser invisible"

mutar 's/\{busy \? "Preparando…" : puedeCompartir \? "Compartir" : "Descargar PDF"\}/{busy ? "Preparando…" : "Compartir"}/' src/app/admin/components/EstadoCuentaDrawer.tsx
probar "el botón vuelve a decir «Compartir» aunque descargue"

mutar 's/setPuedeCompartir\(nav\.canShare\(\{ files: \[sonda\] \}\)\);/setPuedeCompartir(true);/' src/app/admin/components/EstadoCuentaDrawer.tsx
probar "se promete compartir sin haber preguntado por el archivo"

mutar 's/if \(\(e as Error\)\?\.name === "AbortError"\) return;/ /' src/app/admin/components/EstadoCuentaDrawer.tsx
probar "cerrar la hoja de compartir se muestra como error"

echo "── 4. El código muerto no vuelve ───────────────────────────────────────"

mutar 's/      \{\/\* Filtro de empresa\. La búsqueda y los tramos los pone la página padre\. \*\/\}/      <input type="text" placeholder="Buscar cliente…" \/>/' src/app/admin/components/ClientTable.tsx
probar "vuelve un segundo buscador a la tabla"

mutar 's/<span className="truncate" title=\{client\.nombre_normalized\}>\{client\.nombre_normalized\}<\/span>/<span className="truncate" title={client.nombre_normalized}>{client.nombre_normalized}<\/span><span className="truncate" title={client.nombre_normalized}>{client.nombre_normalized}<\/span>/' src/app/admin/components/ClientRow.tsx
probar "vuelve la segunda copia del nombre en la fila"

mutar 's/    await Promise\.all\(\[\n      fetch\("\/api\/cxc\/aging"/    await Promise.all([\n      fetch("\/api\/vendors").then((r) => (r.ok ? r.json() : null)).catch(() => null),\n      fetch("\/api\/cxc\/aging"/' src/app/admin/hooks/useAdminData.ts
probar "vuelve la petición a /api/vendors"

echo "── 5. Boston en el iPad ────────────────────────────────────────────────"

mutar 's/data-vista="tarjetas" className="lg:hidden space-y-2"/data-vista="tarjetas" className="sm:hidden space-y-2"/' src/components/cxc/BostonTab.tsx
probar "las tarjetas de Boston vuelven al corte sm"

mutar 's/data-vista="tabla" className="hidden lg:block/data-vista="tabla" className="hidden sm:block/' src/components/cxc/BostonTab.tsx
probar "la tabla de Boston vuelve al corte sm"

mutar 's/data-vista="tarjetas" //' src/components/cxc/BostonTab.tsx
probar "Boston pierde la marca fija de su layout"

echo
echo "════════════════════════════════════════════════════════════════════════"
echo "  CAZADAS: $CAZADAS   ·   SOBREVIVIERON: $SOBREVIVIERON"
echo "════════════════════════════════════════════════════════════════════════"
[[ "$SOBREVIVIERON" -eq 0 ]]
