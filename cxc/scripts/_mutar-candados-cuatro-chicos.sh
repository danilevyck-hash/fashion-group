#!/usr/bin/env bash
# Verificación por MUTACIÓN de los cuatro candados del 17-sep-2026:
#   · src/__tests__/lib/reglas-marcas-plegadas.test.tsx          (Reglas plegadas)
#   · src/__tests__/lib/formulas-empresa-plegada.test.tsx        (Fórmulas: la empresa se pliega)
#   · src/__tests__/api/descripciones-que-pasan-se-registran.test.ts
#   · src/__tests__/lib/catalogo-una-sola-ruta-arriba.test.ts
#
# Se rompe cada regla a propósito y se comprueba que el candado se pone ROJO;
# dos CONTROLES (cambios que NO alteran ninguna regla) tienen que quedar verdes.
#
# 🩸 La restauración va por COPIA, no por `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar NADA. Y el reemplazo lo
# hace `_mutar-aplicar.py` con textos LITERALES, no `perl -0pi`.
set -uo pipefail
cd "$(dirname "$0")/.."

REGLAS=src/app/productos/cargar/ReglasView.tsx
FORMULAS=src/app/productos/cargar/FormulasConfig.tsx
PURO=src/app/productos/cargar/descripciones-que-pasan.ts
GANCHO=src/app/productos/cargar/useRegistrarQuePasan.ts
RUTA=src/app/api/productos/cargar/descripciones/registrar/route.ts
MIGRACION=supabase/migrations/20261206120000_descripciones_origen_automatica.sql
CONFIG=next.config.js
MIGAS="src/app/catalogo/[marca]/pedidos/RutaArriba.tsx"
PAGINA="src/app/catalogo/[marca]/pedidos/page.tsx"

TESTS=(
  src/__tests__/lib/reglas-marcas-plegadas.test.tsx
  src/__tests__/lib/formulas-empresa-plegada.test.tsx
  src/__tests__/api/descripciones-que-pasan-se-registran.test.ts
  src/__tests__/lib/catalogo-una-sola-ruta-arriba.test.ts
  src/__tests__/plantilla-switch-pantalla.test.tsx
)

ARCHIVOS=("$REGLAS" "$FORMULAS" "$PURO" "$GANCHO" "$RUTA" "$MIGRACION" "$CONFIG" "$MIGAS" "$PAGINA")

TMP=$(mktemp -d)
for f in "${ARCHIVOS[@]}"; do cp "$f" "$TMP/$(echo "$f" | tr / _)"; done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f" | tr / _)" "$f"; done; }
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

# ── 1 · Reglas: las marcas arrancan plegadas ─────────────────────────────────

echo "== 1. las marcas vuelven a arrancar abiertas =="
mutar "$REGLAS" '  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());' \
                '  const [abiertas, setAbiertas] = useState<Set<string>>(new Set(MARCA_CATALOGO.map((c) => c.marca)));' \
&& probar 'Reglas abre todas las marcas de una'

echo "== 2. la marca plegada deja de decir cuántas tiene =="
mutar "$REGLAS" '  return n === 1 ? "1 descripción" : `${n} descripciones`;' \
                '  return `(${n})`;' \
&& probar 'vuelve el «(N)» pelado'

echo "== 3. la marca SIN descripciones se esconde (Daniel: «no se esconden») =="
mutar "$REGLAS" '                    {m.todas.length === 0 ? (' \
                '                    {m.todas.length === 0 && false ? (' \
&& probar 'la marca vacía pasa a dibujarse como plegable, sin su texto'

echo "== 4. buscar una descripción ya no abre la marca que la tiene =="
mutar "$REGLAS" '                  const porBusqueda = !!s && !norm(m.marca).includes(s) && m.ds.length > 0;' \
                '                  const porBusqueda = false;' \
&& probar 'el resultado del buscador queda escondido adentro'

# ── 2 · Fórmulas: la empresa se pliega ───────────────────────────────────────

echo "== 5. la compañía vuelve a arrancar abierta =="
mutar "$FORMULAS" '        const grupoAbierto = gruposAbiertos.has(idGrupo) || !!q;' \
                  '        const grupoAbierto = true;' \
&& probar 'las cinco compañías salen con todas sus marcas'

echo "== 6. la compañía no dice cuántas marcas tiene =="
mutar "$FORMULAS" '  return n === 1 ? "1 marca" : `${n} marcas`;' \
                  '  return "";' \
&& probar 'el conteo de marcas desaparece del encabezado'

echo "== 7. abrir la compañía abre también sus marcas (se pierde un nivel) =="
mutar "$FORMULAS" '                isOpen={open.has(row.id) || descMatch(row.marca)}' \
                  '                isOpen={true}' \
&& probar 'dejan de ser dos niveles'

# ── 3 · Las descripciones que pasan se registran ─────────────────────────────

echo "== 8. la que ALERTA también se registra («pasar» cambia de significado) =="
mutar "$PURO" '    if (v.veredicto !== "pasa") continue;' \
              '    if (v.veredicto === "ya-existe") continue;' \
&& probar 'la casi-gemela entra sola al catálogo'

echo "== 9. la que ya existe con otros espacios crea una gemela =="
mutar "$PURO" '    if (v.veredicto !== "pasa") continue;' \
              '    if (v.veredicto === "alerta") continue;' \
&& probar 'se registra la «ya-existe» (la regla 3 de Daniel se rompe)'

echo "== 10. se deja de deduplicar dentro del mismo archivo =="
mutar "$PURO" '    if (vistas.has(k)) continue;' \
              '    if (false) continue;' \
&& probar 'el mismo par viaja tantas veces como renglones tenga'

echo "== 11. la ruta deja de mirar lo que YA está: se reescribe todo =="
mutar "$RUTA" '  const nuevas = entrantes.filter(
    (e) => !yaEstan.has(`${marcaKey(e.marca)}|||${marcaKey(e.descripcion)}`)
  );' \
              '  const nuevas = entrantes;' \
&& probar 'llamarla dos veces duplica'

echo "== 12. la ruta firma la descripción como si alguien la hubiera aprobado =="
mutar "$RUTA" '    origen: ORIGEN_AUTOMATICA,' \
              '    origen: "aprobada",' \
&& probar 'una que entró sola se lee como aprobada a mano'

echo "== 13. sin la migración la ruta se cae en vez de fallar ABIERTA =="
mutar "$RUTA" '  console.error("[descripciones-registrar] no se pudo registrar el lote:", error.message);
  return NextResponse.json({ ok: true, registradas: 0, yaEstaban, sinMigracion: error.code === "23514" });' \
              '  return NextResponse.json({ error: "No se pudo registrar." }, { status: 500 });' \
&& probar 'el CHECK 23514 se vuelve un error de pantalla'

echo "== 14. cualquiera puede escribir en el catálogo =="
mutar "$RUTA" 'const ALLOWED = ["admin", "secretaria"];' \
              'const ALLOWED = ["admin", "secretaria", "bodega", "vendedor"];' \
&& probar 'bodega y vendedor registran descripciones'

echo "== 15. el envío se mete en el camino del Excel =="
mutar "$GANCHO" 'export const RUTA_REGISTRAR = "/api/productos/cargar/descripciones/registrar";' \
                'export const RUTA_REGISTRAR = "/api/productos/cargar/descripciones/registrar";
export const onDownloaded = null;' \
&& probar 'el gancho pasa a saber de la descarga'

echo "== 16. la migración deja de aceptar los valores viejos =="
mutar "$MIGRACION" "  check (origen in ('seed', 'aprobada', 'automatica'));" \
                   "  check (origen in ('automatica'));" \
&& probar 'las 304 filas de producción quedarían fuera del CHECK'

# ── 4 · Catálogos: una sola ruta arriba ──────────────────────────────────────

echo "== 17. el redirect de /catalogo se va =="
mutar "$CONFIG" '      { source: "/catalogo", destination: "/catalogos/marcas", permanent: false },' \
                '' \
&& probar '/catalogo vuelve al 404 en inglés'

echo "== 18. el redirect se hace PERMANENTE (se quema en el caché) =="
mutar "$CONFIG" '      { source: "/catalogos", destination: "/catalogos/marcas", permanent: false },' \
                '      { source: "/catalogos", destination: "/catalogos/marcas", permanent: true },' \
&& probar '308 en vez de 307'

echo "== 19. el redirect se come el catálogo de la marca =="
mutar "$CONFIG" '      { source: "/catalogo", destination: "/catalogos/marcas", permanent: false },' \
                '      { source: "/catalogo/:path*", destination: "/catalogos/marcas", permanent: false },' \
&& probar 'un comodín apaga /catalogo/reebok y todo lo suyo'

echo "== 20. el camino arriba se queda sin tramos =="
mutar "$MIGAS" '    { label: "Marcas", href: "/catalogos/marcas" },' \
               '' \
&& probar 'falta «Marcas» en el camino'

echo "== 21. el último tramo se teclea y vuelve el cuarto nombre =="
mutar "$MIGAS" '    { label: PANEL_COMPROBANTES },' \
               '    { label: "Pedidos" },' \
&& probar 'el lugar vuelve a tener otro nombre'

echo "== 22. la pantalla deja de montar el camino =="
mutar "$PAGINA" '      <RutaArriba marca={theme.marca} />' \
                '' \
&& probar 'comprobantes vuelve a no decir dónde estás'

# ── Controles ────────────────────────────────────────────────────────────────

echo "== CONTROL A. un comentario cambia (nada de conducta) =="
mutar "$PURO" '// Este módulo es PURO' '// Este modulito es PURO' \
&& controlar 'comentario en el módulo puro'

echo "== CONTROL B. el orden de los redirects de grupo (misma conducta) =="
mutar "$CONFIG" '      { source: "/g/plata-entra", destination: "/home", permanent: false },
      { source: "/g/plata-sale", destination: "/home", permanent: false },' \
                '      { source: "/g/plata-sale", destination: "/home", permanent: false },
      { source: "/g/plata-entra", destination: "/home", permanent: false },' \
&& controlar 'dos redirects ajenos cambian de orden'

echo
echo "== RESULTADO: $cazadas de $total mutaciones cazadas · $muertas corridas muertas · $controles_ok de $controles controles en verde =="
