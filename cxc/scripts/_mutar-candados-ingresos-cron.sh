#!/usr/bin/env bash
# Verificación por MUTACIÓN de los candados del cron de compras.
#
# Rompe UNA cosa a la vez y exige que algún test se ponga rojo. Un candado que
# no caza su mutación no es un candado: es un archivo que da permiso.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: hay archivos NUEVOS en
# la rama y git aborta el comando entero sin restaurar nada, así que las
# mutaciones se apilarían y ninguna se probaría por separado. Ya pasó en este
# repo.
#
# 🩸 Y `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: si la corrida muere,
# "0 fallos" se leería como "sobrevivió". Un verificador que miente en verde es
# peor que no tenerlo.
set -uo pipefail
cd "$(dirname "$0")/.."

LIB="src/lib/switch-api/ingresos-mercancia-web.ts"
ROUTE="src/app/api/cron/sync-ingresos-mercancia/route.ts"
TIPOS="src/lib/switch-api/sync-log-tipos.ts"
TELE="src/lib/cron-telemetry.ts"
VERCEL="vercel.json"
LOGINWEB="src/__tests__/lib/cron-login-web-oficina.test.ts"

RECON="src/app/api/cron/switch-reconciliacion/route.ts"
ARCHIVOS=("$LIB" "$ROUTE" "$TIPOS" "$TELE" "$VERCEL" "$LOGINWEB" "$RECON")
RESPALDO=$(mktemp -d)
for f in "${ARCHIVOS[@]}"; do mkdir -p "$RESPALDO/$(dirname "$f")"; cp "$f" "$RESPALDO/$f"; done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap 'restaurar; rm -rf "$RESPALDO"' EXIT

TESTS="src/__tests__/lib/ingresos-mercancia-cron.test.ts \
src/__tests__/lib/cron-registro.test.ts \
src/__tests__/lib/cron-calendario.test.ts \
src/__tests__/lib/sync-log-tipos-check.test.ts \
src/__tests__/lib/cron-login-web-oficina.test.ts"

CAZADAS=0; TOTAL=0; SOBREVIVIERON=()

probar() {
  local nombre="$1"
  TOTAL=$((TOTAL + 1))
  local salida; salida=$(npx vitest run $TESTS 2>&1)
  # El resumen SIEMPRE tiene que estar. Sin él, la corrida murió.
  if ! grep -qE "Tests +[0-9]+ (failed|passed)" <<<"$salida"; then
    echo "  🔴 LA CORRIDA MURIÓ — no hay resumen de vitest. NO cuenta como cazada."
    SOBREVIVIERON+=("$nombre (corrida muerta)")
    restaurar; return
  fi
  local fallos; fallos=$(grep -oE "Tests +[0-9]+ failed" <<<"$salida" | grep -oE "[0-9]+" | head -1)
  fallos=${fallos:-0}
  if [ "$fallos" -gt 0 ]; then
    echo "  ✅ cazada — $fallos test(s) en rojo"
    CAZADAS=$((CAZADAS + 1))
  else
    echo "  ❌ SOBREVIVIÓ"
    SOBREVIVIERON+=("$nombre")
  fi
  restaurar
}

mutar() { perl -0pi -e "$1" "$2"; }

echo "═══ MUTACIONES ═══"

echo "1. el guard del CUADRE no frena nada"
mutar 's/if \(!c\.ok\) \{/if (false) {/' "$LIB"; probar "cuadre no frena"

echo "2. el cuadre mira solo el GRAN TOTAL (dos errores que se compensan pasan)"
mutar 's/if \(!c\.ok\) \{/if (c.diferencia !== 0) {/' "$LIB"; probar "cuadre solo por total"

echo "3. se cae el guard del CERO SILENCIOSO"
mutar 's/detalle\.filas\.length === 0 && guardadas\.length > 0/false/' "$LIB"; probar "cero silencioso"

echo "4. se cae el guard del BARRIDO CORTO"
mutar 's/guardadas\.length > 0 &&\s*\n\s*detalle\.filas\.length < guardadas\.length \* UMBRAL_BARRIDO_CORTO/false/' "$LIB"; probar "barrido corto"

echo "5. el upsert pierde su llave (se vuelve insert ciego)"
mutar 's/onConflict: "empresa_key,n_interno,linea"/onConflict: "empresa_key,n_interno"/' "$LIB"; probar "onConflict equivocado"

echo "6. la PODA borra los documentos AUSENTES del reporte"
mutar 's/if \(maxVieja == null \|\| maxVieja <= maxNueva\) continue;/if (maxVieja == null) continue;/' "$LIB"; probar "poda por ausencia"

echo "7. el DELETE deja de acotar por documento"
mutar 's/\.eq\("n_interno", doc\)\n(\s*)\.gt\("linea", maxNueva\)/.gt("linea", maxNueva)/' "$LIB"; probar "delete sin documento"

echo "8. el DELETE deja de acotar por línea (borra el documento entero)"
mutar 's/\.gt\("linea", maxNueva\)/.eq("linea", maxNueva + 1)/' "$LIB"; probar "delete sin corte de linea"

echo "9. la ventana NO se estira: el hueco de joystep no se cierra nunca"
mutar 's/const querido = conSolape < normal \? conSolape : normal;/const querido = normal;/' "$LIB"; probar "ventana no se estira"

echo "10. la ventana pierde su piso (bajaría 4 años en una función de 800 s)"
mutar 's/const desde = querido < piso \? piso : querido;/const desde = querido;/' "$LIB"; probar "ventana sin piso"

echo "11. entra una empresa que NO es de Fashion Group"
mutar 's/export const INGRESOS_EMPRESA_KEYS: readonly string\[\] = B2B_EMPRESA_KEYS;/export const INGRESOS_EMPRESA_KEYS: readonly string[] = [...B2B_EMPRESA_KEYS, "confecciones_boston"];/' "$LIB"; probar "boston adentro"

echo "12. sin la DDL del sync_type, el cron deja de escribir las compras"
mutar 's/const logRegistrado = logId !== null;/const logRegistrado = logId !== null;\n  if (!logRegistrado) return { ...vacio, ok: false, error: "sin log", logRegistrado };/' "$LIB"; probar "sin DDL no escribe"

# 🩸 La primera versión de esta mutación renombraba el import: eso es un error
# de COMPILACIÓN, así que "cazada" solo probaba que el archivo compila. Ahora se
# reemplaza la lectura por UNA sola página con tope propio — el disfraz real del
# bug de `db-max-rows`, que corta en 1000 filas EN SILENCIO.
echo "13. la lectura de la ventana deja de paginar (una sola página con tope propio)"
mutar 's/return leerTodoPaginado<FilaGuardada>\([\s\S]*?\n  \);/const { data } = await supabaseServer.from("switch_ingresos_mercancia").select("n_interno, linea").eq("empresa_key", empresaKey).gte("fecha", v.desde).lte("fecha", v.hasta).range(0, 49999);\n  return (data ?? []) as FilaGuardada[];/' "$LIB"; probar "lectura sin paginar"

echo "14. el route deja de filtrar las empresas contra el universo"
mutar 's/\? pedidas\.filter\(\(e\) => INGRESOS_EMPRESA_KEYS\.includes\(e\)\)/? pedidas/' "$ROUTE"; probar "route no filtra empresas"

echo "15. el heartbeat se registra aunque algo haya fallado"
mutar 's/if \(fallidas\.length === 0\) \{\n(\s*)await recordCronHeartbeat\(CRON_NAME\);/await recordCronHeartbeat(CRON_NAME);\n  if (false) {/' "$ROUTE"; probar "heartbeat siempre"

echo "16. el sync_type sale de SYNC_LOG_TYPES (el código y el CHECK divergen)"
mutar 's/  "ingresos_mercancia",\n//' "$TIPOS"; probar "sync_type fuera del codigo"

echo "17. el cron desaparece del registro de vigilancia"
mutar 's/  "sync-ingresos-mercancia",\n//' "$TELE"; probar "fuera del registro"

echo "18. el cron desaparece de vercel.json (biyección rota)"
perl -0pi -e 's/    \{\n      "path": "\/api\/cron\/sync-ingresos-mercancia",\n      "schedule": "5 9 \* \* \*"\n    \},\n//' "$VERCEL"; probar "fuera de vercel.json"

echo "19. el horario choca con switch-articulos (5 min, sesión única)"
mutar 's/hhmmUtc: "0905", empresas: CRON_EMPRESAS_INGRESOS/hhmmUtc: "0845", empresas: CRON_EMPRESAS_INGRESOS/' "$TELE"; probar "choque de sesion unica"

# 🩸 La primera versión usaba 1600, que choca con el estadocuenta de las MISMAS
# empresas: se ponía rojo por SESIÓN ÚNICA, no por el horario. 1730 (12:30 p.m.
# de Panamá) respeta los 15 min contra todo lo que comparte empresa, así que lo
# único que puede cazarlo es el candado de horario de oficina — que es el que
# esta mutación destapó que NO existía.
echo "20. el horario se va al horario de OFICINA de Panamá (sin chocar con nadie)"
mutar 's/hhmmUtc: "0905", empresas: CRON_EMPRESAS_INGRESOS/hhmmUtc: "1730", empresas: CRON_EMPRESAS_INGRESOS/' "$TELE"; probar "horario de oficina"

echo "21. el módulo nuevo se saca de la lista de quien abre el login web"
mutar 's/      path\.join\("lib", "switch-api", "ingresos-mercancia-web\.ts"\),\n//' "$LOGINWEB"; probar "fuera de la lista de login web"

echo "22. la reconciliación deja de aplicar la regla del login web ella sola"
perl -0pi -e 's/pasadaPuedeUsarLoginWeb\(/pasadaPuedeUsarLoginWebXX(/g' src/app/api/cron/switch-reconciliacion/route.ts; probar "reconciliacion sin la regla"

echo
echo "═══ RESULTADO: $CAZADAS de $TOTAL cazadas ═══"
if [ ${#SOBREVIVIERON[@]} -gt 0 ]; then
  echo "SOBREVIVIERON:"; printf '  · %s\n' "${SOBREVIVIERON[@]}"; exit 1
fi
