#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿Los candados de «MARCACIÓN NO PINTA UN BLANCO» (19-sep-2026) CAZAN de verdad?
#
# Lo que cubren:
#   1  🔴 el primer pintado ya trae el contenido (la semilla del SERVIDOR)
#   2  🔴 y la hora de ese primer cuadro es la del servidor, no la del teléfono
#   3  🔴 sin semilla se dibuja el ESQUELETO, nunca un blanco
#   4  🔴 el esqueleto MIDE lo mismo que lo que reemplaza (si no, salta)
#   5  🔴 el esqueleto es UNO SOLO (`loading.tsx` y la pantalla, el mismo)
#   6  🔴 la página arma el estado en el servidor y FALLA ABIERTA
#   7  🔴 el CXC dibuja su encabezado antes de la lista, también cargando
#   8  🔴 las dos pantallas de pedido ya no devuelven `null`
#
# Se rompe el código a propósito, una cosa por vez, y se exige que los tests se
# pongan ROJOS. Los dos CONTROLES (cambios inocuos) tienen que SOBREVIVIR.
#
#   bash scripts/_mutar-candados-sin-blanco.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/marcacion-sin-blanco.test.tsx \
src/__tests__/lib/marcacion-pantalla.test.tsx \
src/__tests__/lib/marcacion-deshacer-pantalla.test.tsx"

ARCHIVOS=(
  "src/app/marcacion/page.tsx"
  "src/app/marcacion/MarcacionClient.tsx"
  "src/app/marcacion/EsqueletoMarcacion.tsx"
  "src/app/marcacion/loading.tsx"
  "src/app/cxc/page.tsx"
  "src/components/catalogo/CheckoutClient.tsx"
  "src/components/catalogo/RevisarPedidoPublico.tsx"
)

RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

cazadas=0; sobrevivientes=0; controles_ok=0; controles_mal=0

probar() { # $1 = nombre de la mutación
  local salida fallos
  salida="$(npx vitest run $TESTS 2>&1)"
  if ! grep -qE "^ *Tests " <<<"$salida"; then
    echo "  ⚠️  LA CORRIDA MURIÓ — no hay resumen que leer: $1"
    sobrevivientes=$((sobrevivientes + 1)); return
  fi
  fallos="$(grep -oE "[0-9]+ failed" <<<"$salida" | head -1 | grep -oE "[0-9]+" || echo 0)"
  if [ "${fallos:-0}" -gt 0 ]; then
    echo "  ✅ CAZADA ($fallos fallos) — $1"
    cazadas=$((cazadas + 1))
  else
    echo "  🔴 SOBREVIVIÓ — $1"
    sobrevivientes=$((sobrevivientes + 1))
  fi
}

probar_control() { # $1 = nombre del control (NO debe ser cazado)
  local salida fallos
  salida="$(npx vitest run $TESTS 2>&1)"
  fallos="$(grep -oE "[0-9]+ failed" <<<"$salida" | head -1 | grep -oE "[0-9]+" || echo 0)"
  if [ "${fallos:-0}" -eq 0 ]; then
    echo "  ✅ CONTROL SANO (no cazado) — $1"
    controles_ok=$((controles_ok + 1))
  else
    echo "  🔴 CONTROL CAZADO (el candado es demasiado estricto) — $1"
    controles_mal=$((controles_mal + 1))
  fi
}

aplicar() { # $1 archivo, $2 viejo, $3 nuevo
  restaurar
  python3 - "$1" "$2" "$3" <<'PY'
import sys
ruta, viejo, nuevo = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(ruta).read()
if viejo not in s:
    print(f"  ⚠️  el patrón no está en {ruta}: {viejo[:70]}")
    sys.exit(3)
open(ruta, "w").write(s.replace(viejo, nuevo, 1))
PY
}

mutar() { # $1 archivo, $2 viejo, $3 nuevo, $4 nombre
  aplicar "$1" "$2" "$3"
  [ $? -eq 3 ] && { sobrevivientes=$((sobrevivientes + 1)); return; }
  probar "$4"
}

control() { # $1 archivo, $2 viejo, $3 nuevo, $4 nombre
  aplicar "$1" "$2" "$3"
  [ $? -eq 3 ] && { controles_mal=$((controles_mal + 1)); return; }
  probar_control "$4"
}

echo "── mutando ──────────────────────────────────────────────────────────────"

# 1 · el servidor deja de mandar la semilla (el defecto original, tal cual)
mutar "src/app/marcacion/page.tsx" \
  'return <MarcacionClient inicial={await semillaDeLaPantalla()} />;' \
  'return <MarcacionClient />;' \
  "1 · la página vuelve a montar el cascarón sin datos"

# 2 · la página deja de armar el estado en el servidor
mutar "src/app/marcacion/page.tsx" \
  '    return await armarEstadoDeLaPantalla(codigo, await nombreDeLaFicha(codigo));' \
  '    return { codigo, nombre: null, ahora: new Date().toISOString() };' \
  "2 · la página se inventa un estado en vez de armar el de verdad"

# 3 · la página deja de fallar ABIERTA
mutar "src/app/marcacion/page.tsx" \
  '    console.error("[marcacion page]", e instanceof Error ? e.message : e);
    return null;' \
  '    console.error("[marcacion page]", e instanceof Error ? e.message : e);
    throw e;' \
  "3 · un problema de base deja a la persona sin poder marcar"

# 4 · la pantalla ignora la semilla y arranca vacía
mutar "src/app/marcacion/MarcacionClient.tsx" \
  'const [estado, setEstado] = useState<EstadoServidor | null>(inicial);' \
  'const [estado, setEstado] = useState<EstadoServidor | null>(null);' \
  "4 · la pantalla tira la semilla y arranca en blanco"

# 5 · el desfase arranca en null: el primer cuadro usa el reloj del teléfono
mutar "src/app/marcacion/MarcacionClient.tsx" \
  'useState<number | null>(semilla === null ? null : 0);' \
  'useState<number | null>(null);' \
  "5 · el primer cuadro dibuja la hora del teléfono"

# 6 · `ahora` arranca en el reloj del teléfono en vez de la semilla
mutar "src/app/marcacion/MarcacionClient.tsx" \
  'useState<number>(() => semilla ?? Date.now());' \
  'useState<number>(() => Date.now());' \
  "6 · el reloj arranca en el teléfono, no en la hora del servidor"

# 7 · el desfase se mide contra un instante distinto del que se guarda
mutar "src/app/marcacion/MarcacionClient.tsx" \
  '      const enEsteTelefono = Date.now();
      setAhora(enEsteTelefono);
      setDesfase(semilla - enEsteTelefono);' \
  '      setDesfase(semilla - Date.now());' \
  "7 · el reloj se va para atrás en el primer tic"

# 8 · se va el esqueleto: vuelve el blanco
mutar "src/app/marcacion/MarcacionClient.tsx" \
  '{!estado && !errorCarga && <BloquesDelEsqueleto />}' \
  '{false && <BloquesDelEsqueleto />}' \
  "8 · sin dato, el cuerpo vuelve a quedar en blanco"

# 9 · el bloque del reloj deja de medir lo que mide el reloj
mutar "src/app/marcacion/EsqueletoMarcacion.tsx" \
  'className="mt-3 h-[46px] w-56 rounded bg-gray-100 animate-pulse"' \
  'className="mt-3 h-6 w-56 rounded bg-gray-100 animate-pulse"' \
  "9 · el esqueleto del reloj mide 24 px y el reloj 46: salta"

# 10 · el bloque del botón deja de medir lo que mide el botón
mutar "src/app/marcacion/EsqueletoMarcacion.tsx" \
  'className="mt-6 min-h-[56px] w-full rounded-md bg-gray-100 animate-pulse"' \
  'className="mt-6 h-8 w-full rounded-md bg-gray-100 animate-pulse"' \
  "10 · el esqueleto del botón mide menos que el botón"

# 11 · la barra del `loading.tsx` copia el encabezado de escritorio
mutar "src/app/marcacion/EsqueletoMarcacion.tsx" \
  '<div className="h-11 w-full border-b-2 border-gray-200 bg-white" />' \
  '<div className="h-14 w-full border-b border-gray-200 bg-white" />' \
  "11 · la barra mide 56 px y el encabezado del celular 46: empuja"

# 12 · se pierden los márgenes: el esqueleto deja de espejar el ritmo
mutar "src/app/marcacion/EsqueletoMarcacion.tsx" \
  '<div className="mt-8 h-5 w-52 rounded bg-gray-100 animate-pulse" />' \
  '<div className="h-5 w-52 rounded bg-gray-100 animate-pulse" />' \
  "12 · «Mis marcas» pierde su separación en el esqueleto"

# 13 · `loading.tsx` deja de seguir el molde de la casa
mutar "src/app/marcacion/loading.tsx" \
  '    <DelayedSkeleton>
      <EsqueletoMarcacion />
    </DelayedSkeleton>' \
  '    <EsqueletoMarcacion />' \
  "13 · el loading pierde el DelayedSkeleton de la casa"

# 14 · el CXC vuelve a dibujar la lista sin encabezado (el empujón)
mutar "src/app/cxc/page.tsx" \
  '        <AppHeader module="Cuentas por Cobrar" />
        {/* El mismo alto y el mismo borde que `TabsCartera`' \
  '        {/* El mismo alto y el mismo borde que `TabsCartera`' \
  "14 · el CXC carga sin encabezado y después todo salta"

# 15 · el CXC pierde el lugar de las pestañas
mutar "src/app/cxc/page.tsx" \
  '          <div className="min-h-[44px] border-b border-gray-200" />' \
  '          <div className="border-b border-gray-200" />' \
  "15 · la tira de pestañas del CXC no reserva su alto"

# 16 · el checkout del vendedor vuelve al blanco
mutar "src/components/catalogo/CheckoutClient.tsx" \
  '  if (!loaded) {
    return (' \
  '  if (!loaded) return null;
  if (false) {
    return (' \
  "16 · el checkout vuelve a devolver null mientras lee el carrito"

# 17 · la pantalla del cliente vuelve al blanco
mutar "src/components/catalogo/RevisarPedidoPublico.tsx" \
  '  if (!cargado) {
    return (' \
  '  if (!cargado) return null;
  if (false) {
    return (' \
  "17 · «Revisa tu pedido» vuelve a devolver null"

echo
echo "── controles (NO deben ser cazados) ─────────────────────────────────────"

control "src/app/marcacion/EsqueletoMarcacion.tsx" \
  '<div className="h-5 w-40 rounded bg-gray-100 animate-pulse" />' \
  '<div className="h-5 w-44 rounded bg-gray-100 animate-pulse" />' \
  "CONTROL: el bloque del saludo cambia de ANCHO (no de alto)"

control "src/app/marcacion/page.tsx" \
  'export const metadata = { title: "Marcación · Fashion Group" };' \
  'export const metadata = { title: "Marcación · FG" };' \
  "CONTROL: cambia el título de la pestaña del navegador"

restaurar
echo
echo "── CONTROL FINAL (sin mutar) ────────────────────────────────────────────"
salida="$(npx vitest run $TESTS 2>&1)"
grep -E "^ *(Tests|Test Files) " <<<"$salida"
echo
echo "══ resultado: $cazadas cazadas · $sobrevivientes sobrevivientes · controles: $controles_ok sanos / $controles_mal cazados ══"
[ "$sobrevivientes" -eq 0 ] && [ "$controles_mal" -eq 0 ]
