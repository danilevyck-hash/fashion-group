#!/usr/bin/env bash
# Verificación por MUTACIÓN de los tres candados del 17-sep-2026:
#   · `src/__tests__/lib/navegacion-lleva-a-donde-dice.test.ts`     (commit 1)
#   · `src/__tests__/components/pantalla-no-existe.test.tsx`        (commit 1)
#   · `src/__tests__/lib/comisiones-titulo-solo-en-la-primera.test.ts` (commit 2)
#   · `src/__tests__/lib/reclamos-csv-retirado.test.ts`             (commit 3)
#   · `src/__tests__/lib/cxc-descargas.test.ts`                     (cambió de dirección)
#   · los cuatro que cambiaron de ANCLA con nota fechada: `marcacion-permisos`,
#     `boston-acceso`, `multifashion-acceso` y `data-health-dentro-de-usuarios`.
#
# Se rompe cada regla a propósito y se comprueba que los candados se ponen ROJOS;
# dos CONTROLES (cambios que NO alteran ninguna regla) tienen que quedar verdes.
#
# 🩸 La restauración va por COPIA, no por `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar NADA. Y el reemplazo lo
# hace `_mutar-aplicar.py` con textos LITERALES, no `perl -0pi`.
set -uo pipefail
cd "$(dirname "$0")/.."

CASA=src/lib/navegacion/casa-del-rol.ts
NF=src/app/not-found.tsx
HEADER=src/components/AppHeader.tsx
HOME=src/app/home/page.tsx
USUARIOS=src/app/admin/usuarios/page.tsx
VG=src/app/vista-general/page.tsx
ENLACE=src/lib/reclamos/enlace.ts
CHROME=src/lib/comisiones/pdf-chrome.ts
PDF=src/lib/comisiones/pdf-comision.ts
EXCEL=src/app/api/reclamos/export-excel/route.ts

# La ruta retirada: la mutación la RESUCITA, así que la restauración la borra.
CSV_DIR=src/app/api/reclamos/export
CSV_RUTA="$CSV_DIR/route.ts"

TESTS=(
  src/__tests__/lib/navegacion-lleva-a-donde-dice.test.ts
  src/__tests__/components/pantalla-no-existe.test.tsx
  src/__tests__/lib/comisiones-titulo-solo-en-la-primera.test.ts
  src/__tests__/lib/reclamos-csv-retirado.test.ts
  src/__tests__/lib/cxc-descargas.test.ts
  src/__tests__/lib/marcacion-permisos.test.ts
  src/__tests__/lib/boston-acceso.test.ts
  src/__tests__/lib/multifashion-acceso.test.ts
  src/__tests__/lib/data-health-dentro-de-usuarios.test.ts
)

ARCHIVOS=("$CASA" "$NF" "$HEADER" "$HOME" "$USUARIOS" "$VG" "$ENLACE" "$CHROME" "$PDF" "$EXCEL")

TMP=$(mktemp -d)
for f in "${ARCHIVOS[@]}"; do cp "$f" "$TMP/$(echo "$f" | tr / _)"; done
restaurar() {
  for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f" | tr / _)" "$f"; done
  rm -rf "$CSV_DIR"
}
trap restaurar EXIT INT TERM PIPE

cazadas=0; total=0; muertas=0; controles_ok=0; controles=0

mutar() { python3 scripts/_mutar-aplicar.py "$@"; }

correr() { npx vitest run "${TESTS[@]}" 2>&1; }

probar() {  # $1 = nombre de la mutación — TIENE que cazarse
  total=$((total + 1))
  local salida; salida=$(correr)
  if ! echo "$salida" | grep -qE "Test Files"; then
    echo "  ⛔ CORRIDA MUERTA — $1"; muertas=$((muertas + 1)); restaurar; return
  fi
  if echo "$salida" | grep -qE "Tests +.*failed"; then
    echo "  ✅ CAZADA ($(echo "$salida" | grep -oE "[0-9]+ failed" | head -1)) — $1"; cazadas=$((cazadas + 1))
  else
    echo "  ❌ SOBREVIVIÓ — $1"
  fi
  restaurar
}

controlar() {  # $1 = nombre del control — NO tiene que cazarse
  controles=$((controles + 1))
  local salida; salida=$(correr)
  if echo "$salida" | grep -qE "Test Files" && ! echo "$salida" | grep -qE "Tests +.*failed"; then
    echo "  ✅ CONTROL en verde (esperado) — $1"; controles_ok=$((controles_ok + 1))
  else
    echo "  ❌ CONTROL se puso rojo (NO esperado) — $1"
  fi
  restaurar
}

# ═══════════════════════════════════════════════════════════════════════════
# COMMIT 1 · La navegación
# ═══════════════════════════════════════════════════════════════════════════

echo "== 1. el rol de un solo módulo vuelve a caer en /home =="
mutar "$CASA" '  if (visibles.length === 1) return visibles[0].href;' '  if (visibles.length === 0) return INICIO;' \
&& probar 'Jennifer (gerente_acs) aterriza en una pantalla que su rol rebota'

echo "== 2. la CASA fijada deja de mandar =="
mutar "$CASA" '  const casa = visibles.find((m) => m.key === moduloCasaDeRol(role));
  return casa ? casa.href : INICIO;' '  return INICIO;' \
&& probar 'David (gerente_boston) cae en el Inicio del grupo'

echo "== 3. el admin deja de estar exento =="
mutar "$CASA" '  if (role === "admin") return INICIO;' '  if (role === "administrador") return INICIO;' \
&& probar 'el admin aterriza en el primer módulo que le toque'

echo "== 4. «ya está en su casa» sin la barra: prefijo suelto =="
mutar "$CASA" '  return pathname === casa || pathname.startsWith(`${casa}/`);' '  return pathname === casa || pathname.startsWith(casa);' \
&& probar '`/guias-viejo` se toma por la casa `/guias` y esconde el botón'

echo "== 5. /home vuelve a empujar con push =="
mutar "$HOME" '    if (casa !== INICIO) router.replace(casa);' '    if (casa !== INICIO) router.push(casa);' \
&& probar '`/home` vuelve al historial y el Atrás rebota'

echo "== 6. el 404 manda a /home a secas =="
mutar "$NF" '    setCasa(casaDelRol(rol, modulos));' '    setCasa(INICIO);' \
&& probar '«Ir al inicio» manda a bodega y a Jennifer a la pantalla que las rebota'

echo "== 7. el 404 vuelve al inglés =="
mutar "$NF" '>Esta pantalla no existe</h1>' '>This page could not be found</h1>' \
&& probar 'la pantalla de 404 deja de hablar en español'

echo "== 8. el encabezado dibuja «Inicio» aunque ya esté en su casa =="
mutar "$HEADER" '            ...(enSuCasa ? [] : [{ label: "Inicio", onClick: () => router.push(casa) }]),' '            { label: "Inicio", onClick: () => router.push(casa) },' \
&& probar 'un botón que no lleva a ningún lado vuelve al breadcrumb'

echo "== 9. el breadcrumb deja de dibujar el grupo =="
mutar "$HEADER" '            ...(grupo ? [{ label: grupo.label, onClick: () => router.push(grupo.href) }] : []),' '' \
&& probar 'Usuarios pierde su «Administración»'

echo "== 10. Usuarios vuelve a decir «Sistema» =="
mutar "$USUARIOS" '      <AppHeader module="Usuarios" grupo={grupoDeModulo("usuarios")} />' '      <AppHeader module="Sistema" breadcrumbs={[{ label: "Usuarios" }]} />' \
&& probar 'el breadcrumb vuelve a nombrar un grupo que no existe y a caer en /admin'

echo '== 11. el reclamo de Vista General pierde el `view=detail` =='
mutar "$ENLACE" '  params.set("view", "detail");' '  /* sin view */' \
&& probar 'la tarjeta vuelve a dejarte en el selector de empresas'

echo "== 12. el guion del dato que falta se manda como empresa =="
mutar "$ENLACE" '  if (emp && emp !== SIN_DATO) params.set("empresa", emp);' '  if (emp) params.set("empresa", emp);' \
&& probar 'se inventa una empresa llamada «—»'

echo "== 13. la tarjeta arma la URL a mano otra vez =="
mutar "$VG" '<Link key={r.id} href={enlaceDetalleReclamo(r.id, r.empresa)} className={FILA_ALERTA}>' '<Link key={r.id} href={`/reclamos?id=${r.id}`} className={FILA_ALERTA}>' \
&& probar 'vuelve el `/reclamos?id=` que no abre nada'

# ═══════════════════════════════════════════════════════════════════════════
# COMMIT 2 · El PDF de Comisiones
# ═══════════════════════════════════════════════════════════════════════════

echo "== 14. el título vuelve a repetirse en cada hoja =="
mutar "$PDF" '      ...estilosDeTabla(),
    });' '      ...estilosDeTabla(),
      didDrawPage: () => cabecera(doc, titulo),
    });' 2 \
&& probar 'las siete hojas vuelven a traer el logo y el mismo renglón'

echo '== 15. `asegurarEspacio` vuelve a repetir la cabeza al abrir hoja =='
mutar "$CHROME" '  doc.addPage();
  return ALTO_CONTINUACION;' '  doc.addPage();
  cabecera(doc, "");
  return ALTO_CONTINUACION;' \
&& probar 'la carrocería vuelve a dibujar la cabeza fuera de la primera hoja'

echo "== 16. los nombres de columna dejan de repetirse =="
mutar "$PDF" '      head: [[...COLUMNAS_VENTAS]],' '      head: [[...COLUMNAS_VENTAS]],
      showHead: "firstPage" as const,' \
&& probar 'la tabla de la hoja 3 queda en números sueltos'

echo "== 17. el pie con la numeración deja de recorrer las hojas =="
mutar "$CHROME" '  for (let i = 1; i <= hojas; i++) {' '  for (let i = 1; i <= 1; i++) {' \
&& probar 'solo la primera hoja queda numerada'

# ═══════════════════════════════════════════════════════════════════════════
# COMMIT 3 · El CSV de Reclamos
# ═══════════════════════════════════════════════════════════════════════════

echo "== 18. la ruta del CSV vuelve a existir =="
mkdir -p "$CSV_DIR" && cat > "$CSV_RUTA" <<'RUTA'
import { NextRequest, NextResponse } from "next/server";
import { csvWithBom, buildCsv, CSV_MIME } from "@/lib/csv-export";
export async function GET(_req: NextRequest) {
  const csv = buildCsv([["N° Reclamo"]], ",");
  return new NextResponse(csvWithBom(csv), { headers: { "Content-Type": CSV_MIME } });
}
RUTA
probar 'el export de CSV de Reclamos resucita'

echo '== 19. alguien vuelve a importar `csv-export` desde una ruta viva =='
mutar "$EXCEL" 'import { NextRequest, NextResponse } from "next/server";' 'import { NextRequest, NextResponse } from "next/server";
import { CSV_MIME } from "@/lib/csv-export";' \
&& probar 'el Excel de la lista se vuelve a colgar del CSV'

# ═══════════════════════════════════════════════════════════════════════════
# CONTROLES — cambios que NO tocan ninguna regla
# ═══════════════════════════════════════════════════════════════════════════

echo "== CONTROL A. un comentario cambia en la regla de la casa =="
mutar "$CASA" '/** El Inicio de verdad' '/** EL INICIO de verdad' \
&& controlar 'comentario en `casa-del-rol.ts`'

echo "== CONTROL B. la explicación del 404 se redacta distinto =="
mutar "$NF" 'se haya movido a otro lugar.' 'se haya movido a otra dirección.' \
&& controlar 'redacción de la línea que explica el 404'

echo
echo "== RESULTADO: $cazadas de $total mutaciones cazadas · $muertas corridas muertas · $controles_ok de $controles controles en verde =="
