#!/usr/bin/env bash
# Verificador de mutaciones de la PANTALLA de cerrar la quincena.
#
# 🩸 Restaura por COPIA y no con `git checkout`: hay archivos NUEVOS en la rama.
# 🩸 El reemplazo es LITERAL con python (ver `_mutar-aplicar.py`).
# 🩸 `mutar()` EXIGE que el archivo cambie y `probar()` exige que vitest haya
# COLECTADO tests: un cero de una corrida muerta se leería como «sobrevivió».
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS=(
  src/__tests__/components/asistencia-planilla-cerrar-quincena.test.tsx
  src/__tests__/components/rango-fechas-calendario.test.tsx
  src/__tests__/components/asistencia-planilla-solo-rango.test.tsx
  src/__tests__/components/asistencia-planilla-decidir-pantalla.test.tsx
)
ARCHIVOS=(
  src/app/asistencia/PlanillaTab.tsx
  src/components/ui/RangoFechas.tsx
  src/components/ui/CalendarioRango.tsx
)
TMP=$(mktemp -d); trap 'for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f"|tr / _)" "$f"; done; rm -rf "$TMP"' EXIT INT TERM PIPE
for f in "${ARCHIVOS[@]}"; do cp "$f" "$TMP/$(echo "$f"|tr / _)"; done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f"|tr / _)" "$f"; done; }

CAZ=0; SOB=0; NOOP=0
probar() {
  local out; out=$(npx vitest run "${TESTS[@]}" 2>&1)
  if ! grep -qE 'Tests +[0-9]+ (failed|passed)' <<<"$out"; then echo "MUERTA"; return; fi
  grep -oE 'Tests +[0-9]+ failed' <<<"$out" | grep -oE '[0-9]+' | head -1 || echo 0
}
mutar() { # archivo  viejo  nuevo  nombre
  local f="$1" antes; antes=$(md5 -q "$f")
  python3 scripts/_mutar-aplicar.py "$f" "$2" "$3" >/dev/null 2>&1
  if [ "$antes" = "$(md5 -q "$f")" ]; then
    echo "  ⛔ NO MUTÓ (patrón muerto) — $4"; NOOP=$((NOOP+1)); restaurar; return
  fi
  local n; n=$(probar)
  if [ "$n" = "MUERTA" ]; then echo "  ⛔ corrida MUERTA (no colectó) — $4"; NOOP=$((NOOP+1))
  elif [ "${n:-0}" -gt 0 ] 2>/dev/null; then echo "  ✅ cazada ($n) — $4"; CAZ=$((CAZ+1))
  else echo "  🔴 SOBREVIVIÓ — $4"; SOB=$((SOB+1)); fi
  restaurar
}

P=src/app/asistencia/PlanillaTab.tsx
R=src/components/ui/RangoFechas.tsx
C=src/components/ui/CalendarioRango.tsx

echo "== control: sin mutar debe dar 0 fallos =="
echo "  fallos: $(probar)"

echo "== 1 · el flujo: elegir → Generar =="
mutar "$P" \
  'useEffect(() => { if (pedido) void cargar(pedido); }, [cargar, pedido]);' \
  'useEffect(() => { if (elegido) void cargar({ desde, hasta, empresa }); }, [cargar, elegido, desde, hasta, empresa]);' \
  'elegir el período vuelve a pedir el cuadro solo (sin Generar)'

mutar "$P" \
  '      setCalendarioAbierto(false);' \
  '      setCalendarioAbierto(true);' \
  'el calendario NO se pliega al generar'

mutar "$P" \
  '      const q = new URLSearchParams({ empresa: p.empresa, desde: p.desde, hasta: p.hasta });' \
  '      const q = new URLSearchParams({ empresa: p.empresa });' \
  'el estado del cierre se pregunta sin las fechas'

echo "== 2 · quién cierra =="
mutar "$P" \
  '  const puedeCerrarla = puedeCerrar(rol);' \
  '  const puedeCerrarla = true;' \
  'la secretaria también ve el botón de cerrar'

echo "== 3 · el POST no manda montos =="
mutar "$P" \
  'body: JSON.stringify({ empresa: pedido.empresa, desde: pedido.desde, hasta: pedido.hasta }),' \
  'body: JSON.stringify({ empresa: pedido.empresa, desde: pedido.desde, hasta: pedido.hasta, netoPagar: 999 }),' \
  'el navegador manda un neto en el cuerpo del cierre'

echo "== 4 · los tres «no» del servidor =="
mutar "$P" \
  '        if (Array.isArray(j.frenos) && j.frenos.length > 0) setFrenos(j.frenos as FrenoCierre[]);' \
  '        if (false) setFrenos(j.frenos as FrenoCierre[]);' \
  'el freno de horas extra se traga en silencio'

mutar "$P" \
  '    !!data && !vieja && !cerrada && solapadas.length === 0 && !faltaMigracionCierre && !!data.lineas.length;' \
  '    !!data && !vieja && !cerrada && !!data.lineas.length;' \
  'se deja cerrar aunque se pise con otra o falte la migración'

mutar "$P" \
  '      {!cerrada && solapadas.length > 0 && (' \
  '      {false && (' \
  'el solapamiento no se dibuja'

echo "== 5 · nada se recalcula por debajo =="
mutar "$P" \
  '  const vieja = !!data && (!coincide || desactualizada);' \
  '  const vieja = false;' \
  'el cuadro viejo nunca se marca como viejo'

mutar "$P" \
  '        setDesactualizada(true);
      } catch (e) {
        toast(e instanceof Error ? e.message : "No se pudo guardar", "error");
      }
    },
    [data, toast],
  );' \
  '        void cargar(pedido!);
      } catch (e) {
        toast(e instanceof Error ? e.message : "No se pudo guardar", "error");
      }
    },
    [data, toast],
  );' \
  'escribir un monto a mano vuelve a pedir el cuadro (recalcula por debajo)'

echo "== 6 · reabrir =="
mutar "$P" \
  '  const listo = reabriendo ? motivoReaperturaValido(motivo) !== null : true;' \
  '  const listo = true;' \
  'se puede reabrir sin escribir el motivo'

mutar "$P" \
  '        body: JSON.stringify({ id: cerrada.id, motivo }),' \
  '        body: JSON.stringify({ id: cerrada.id, motivo: "" }),' \
  'el motivo se pierde en el camino'

echo "== 7 · la quincena cerrada no se edita =="
mutar "$P" \
  '  const bloqueoManuales: Bloqueo = cerrada
    ? BLOQUEO_CERRADA
    : data?.avisos.rangoLibre
      ? BLOQUEO_RANGO
      : null;' \
  '  const bloqueoManuales: Bloqueo = data?.avisos.rangoLibre ? BLOQUEO_RANGO : null;' \
  'con la quincena cerrada los montos a mano siguen editables'

echo "== 8 · el calendario en línea =="
mutar "$R" \
  '            {accion}
          </div>
        </div>
      </div>
    );
  }' \
  '            {null}
          </div>
        </div>
      </div>
    );
  }' \
  'el calendario en línea se come el botón que le pasan'

mutar "$R" \
  '  useBodyScrollLock(abierto && !inline);' \
  '  useBodyScrollLock(true);' \
  'el calendario en línea traba el scroll de la página'

mutar "$R" \
  '              {titulo}
            </span>
            {accion}' \
  '              {""}
            </span>
            {accion}' \
  'el resumen del rango no se dice'

echo "== 9 · el primer toque es el día en que EMPIEZA =="
mutar "$C" \
  '    return !vacio && desde && hasta ? { from: deIso(desde), to: deIso(hasta) } : undefined;' \
  '    return desde && hasta ? { from: deIso(desde), to: deIso(hasta) } : undefined;' \
  'se pinta un rango que nadie eligió (el bug que Daniel vio)'

mutar "$C" \
  '  useEffect(() => { setAncla(null); setPreview(null); }, [desde, hasta]);' \
  '  useEffect(() => { /* nada */ }, [desde, hasta]);' \
  'un ancla vieja sobrevive y el toque siguiente cierra en vez de empezar'

echo "== 10 · un solo mes =="
mutar "$C" \
  '      numberOfMonths={1}' \
  '      numberOfMonths={2}' \
  'vuelven los dos meses'

echo "== 11 · el inicio sugerido =="
mutar "$C" \
  '  const esSugerido = (d: Date) => !ancla && !!sugerido && aIso(d) === sugerido;' \
  '  const esSugerido = () => false;' \
  'el día recomendado no se marca'

mutar "$P" \
  '        const cerradas = historial.filter((c) => c.estado === "cerrada");' \
  '        const cerradas = historial;' \
  'una quincena REABIERTA cuenta como pagada'

mutar "$P" \
  '        const ultima = cerradas.reduce((a, b) => (b.hasta > a.hasta ? b : a));' \
  '        const ultima = cerradas[0];' \
  'se recomienda desde una cerrada vieja, no la última'

mutar "$P" \
  '        const inicio = diaSiguiente(ultima.hasta);' \
  '        const inicio = ultima.hasta;' \
  'se recomienda empezar el MISMO día en que terminó la anterior'

mutar "$P" \
  '    if (pedido || elegido) return;' \
  '    if (pedido) return;' \
  'la recomendación le pisa el período a quien ya eligió otro'

mutar "$P" \
  '  const diaSugerido = elegido ? null : sugerido?.inicio ?? null;' \
  '  const diaSugerido = sugerido?.inicio ?? null;' \
  'el aro de la recomendación queda puesto después de elegir'

echo
echo "== RESUMEN =="
echo "  cazadas: $CAZ · sobrevivientes: $SOB · no-op: $NOOP"
