// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURACIÓN DE ASISTENCIA — GET (todo) y PUT (una persona).
//
// GET devuelve TRES cosas juntas porque la pantalla las necesita juntas:
//   1. la lista de códigos que YA marcaron en el reloj (aunque nadie los haya
//      configurado — son los que hay que terminar de llenar),
//   2. la ficha guardada de cada uno (nombre, salario, jornada, empresa),
//   3. las reglas del cálculo.
//
// 🩸 EL UNIVERSO SON LOS CÓDIGOS DEL RELOJ, NO LAS FICHAS GUARDADAS. Si la lista
// saliera de `asistencia_personas`, arrancaría VACÍA y nadie sabría que hay 37
// personas marcando. El reloj manda códigos numéricos con el nombre en blanco:
// esta pantalla es el único lugar donde el código 6 se vuelve una persona con
// sueldo y empresa.
//
// Historia (ago-2026): todo lo que se leía acá AGUANTABA que la migración no
// estuviera corrida — devolvía la lista del reloj sin fichas y avisaba qué
// archivo faltaba; y el PUT reintentaba el guardado sin cada columna que el
// error nombrara. 🔴 Tolerancia retirada el 3-sep-2026: las siete migraciones
// de `asistencia_personas` existen en producción (lista en el encabezado de
// `config-server.ts`). Hoy un error de la base es un 500 con el mensaje; los
// campos `avisoMigracion*`/`puede*` de la respuesta quedan CONSTANTES (nunca
// hay aviso, siempre se puede) y se conservan porque `ConfiguracionTab` los
// lee.
// ─────────────────────────────────────────────────────────────────────────────

import { COLUMNA_COBRA_HORAS_EXTRA, validarCobraHorasExtra } from "@/lib/asistencia/cobra-horas-extra";
import {
  avisoMigracionTrabajaAfuera, COLUMNA_TRABAJA_AFUERA, esColumnaTrabajaAfueraFaltante, validarTrabajaAfuera,
} from "@/lib/asistencia/trabaja-afuera";
import { leerTrabajaAfuera } from "@/lib/asistencia/config-server";
import { NextRequest, NextResponse } from "next/server";
import { asistenciaRoles } from "@/lib/asistencia/roles";
import { requireAsistencia } from "@/lib/asistencia/guard";
import { supabaseServer } from "@/lib/supabase-server";
import { leerDeudaPorCodigo } from "@/lib/prestamos-lista-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { diaPanama } from "@/lib/asistencia/reporte";
import {
  validarPersona,
  REGLAS_DEFAULT,
} from "@/lib/asistencia/config";
import { agruparPorCodigo } from "@/lib/asistencia/reparto";
import {
  leerReglas,
  leerPersonas,
  TABLA_PERSONAS,
  DIAS_VENTANA_PERSONAS,
  leerRepartos,
} from "@/lib/asistencia/config-server";
// 🔴 EL MAPEO DE UNA FILA A UNA PERSONA VIVE EN UN SOLO LUGAR, y esta ruta y la
// de una sola persona lo LLAMAN las dos. Ver el encabezado de ese archivo y su
// candado (`asistencia-ficha-una-persona.test.ts`).
import {
  agruparMarcas,
  armarPersonaDeConfiguracion,
  BANDERAS_DE_CONFIGURACION,
  type FilaMarca,
} from "@/lib/asistencia/ficha-de-configuracion";
// Las MISMAS seis lecturas, del mismo archivo que usa la ficha de una persona.
import {
  arranqueDeLaVentana,
  leerCodigosConHorario,
  leerMarcasDeLaVentana,
} from "@/lib/asistencia/ficha-de-configuracion-server";
import {
  COLUMNA_SERVICIO_PROFESIONAL,
  validarServicioProfesional,
} from "@/lib/asistencia/participacion";
import { COLUMNA_PAGA_SEGUROS, validarPagaSeguros } from "@/lib/asistencia/seguros";
import { COLUMNA_NO_MARCA_RELOJ, validarNoMarcaReloj } from "@/lib/asistencia/sueldo-fijo";
import { COLUMNA_BASE_SEGUROS, validarBaseSeguros } from "@/lib/asistencia/seguros-base";
// El cargo y la cédula del comprobante de pago. Ver `datos-del-papel.ts`.
import { cedulaDeFicha, posicionDeFicha, COLUMNA_CEDULA, COLUMNA_POSICION } from "@/lib/asistencia/datos-del-papel";
import { puedeCerrar } from "@/lib/asistencia/roles";
import { sinIgnorados } from "@/lib/asistencia/codigos-ignorados";
import { leerIgnorados } from "@/lib/asistencia/codigos-ignorados-server";
import {
  COLS_SALDO_VACACIONES,
  numeroDeDias,
  validarSaldoInicial,
} from "@/lib/asistencia/saldo-vacaciones";
import { hoyPanama } from "@/lib/fecha-panama";
import { crearDirectorio, compararPersonas } from "@/lib/asistencia/directorio";
import {
  avisoMarcasPosteriores,
  validarVigencia,
  type MarcaPosterior,
} from "@/lib/asistencia/vigencia";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** La ventana de marcaciones es la MISMA que la del resto del módulo: una
 *  pantalla que ve 180 días y otra que ve 90 mostrarían universos distintos. */
const DIAS_VENTANA = DIAS_VENTANA_PERSONAS;

export async function GET(req: NextRequest) {
  const auth = requireAsistencia(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;

  try {
    const desde = arranqueDeLaVentana();

    // 🔑 LA LECTURA DEL RELOJ VA EN EL MISMO VIAJE QUE LAS OTRAS CINCO
    // (14-sep-2026). Estaba ARRIBA del `Promise.all`, con su propio `await`, así
    // que las otras cinco no arrancaban hasta que terminaran sus SIETE páginas
    // (6.998 filas en 180 días: PostgREST corta en 1.000 y el helper pagina de a
    // una). Medido contra producción: 1.588 ms el paginado + 449 ms las cinco
    // lecturas, en serie. Ninguna de las cinco usa `marcas`, así que esperarla
    // era tiempo regalado. NADA de lo que devuelve la ruta cambia: mismas
    // consultas, mismos datos, mismo `catch` con el mismo 500.
    //
    // Paginado con verificación contra el COUNT: PostgREST corta en 1.000 filas
    // EN SILENCIO, y con 3.287 marcaciones cargadas eso dejaría códigos afuera.
    const [marcas, { reglas }, { filas }, repRes, deudaDe, conHorario, afuera] = await Promise.all([
      // 🔑 La MISMA lectura que usa la ficha de una persona, sin acotar por
      // código. Ver `ficha-de-configuracion-server.ts`.
      leerMarcasDeLaVentana(desde),
      leerReglas(),
      leerPersonas(),
      leerRepartos(),
      // 🔴 Cuánto debe cada persona en Préstamos. Es lo que hace falta para
      // avisar «Debe $100 — descuéntalo de la liquidación» EN EL MOMENTO en que
      // se marca la fecha de salida, que es cuando se decide la liquidación.
      // Nunca tumba esta pantalla: si Préstamos no contesta, el mapa viene vacío.
      leerDeudaPorCodigo(),
      // 🔴 QUIÉN TIENE HORARIO (10-sep-2026). Sin horario la planilla no sabe a
      // qué hora sale, así que entra al chip «Falta para pagar». Es la MISMA
      // pregunta que hace el Reporte: ¿hay fila en `asistencia_horarios`?
      // Falla ABIERTA: si la lectura falla viene `null` y no se acusa a nadie.
      leerCodigosConHorario(),
      // 🔴 QUIÉN TRABAJA AFUERA (14-sep-2026). Lectura APARTE y tolerante: con
      // la migración sin aplicar viene vacía y nadie lleva el chip.
      leerTrabajaAfuera(),
    ]);

    // El día de hoy en Panamá. Solo decide cómo se REDACTA la baja («Renunció»
    // vs «Renuncia» cuando la fecha es futura); no filtra ni calcula nada.
    const hoy = diaPanama(new Date().toISOString());

    // Qué se sabe de cada código POR EL RELOJ.
    const vistos = agruparMarcas(marcas);

    // 🔴 QUIÉN REPARTE SU SUELDO ENTRE DOS EMPRESAS. Se valida con la MISMA
    // función que usa la planilla: si la ficha enseñara un reparto que el motor
    // rechaza, la pantalla estaría prometiendo un pago que no ocurre.
    const repartoPorCodigo = agruparPorCodigo(repRes.filas);

    const fichas = new Map(filas.map((f) => [String(f.empleado_codigo), f]));
    // El MISMO traductor que usan Justificaciones, Horarios, el Reporte y los
    // exports. Se arma con las fichas ya leídas: no hay una segunda consulta.
    const directorio = crearDirectorio(filas);

    // Universo = códigos del reloj ∪ fichas guardadas. La unión importa: alguien
    // que dejó de marcar hace meses no debe desaparecer de su propia planilla.
    const codigos = new Set<string>([...vistos.keys(), ...fichas.keys()]);

    // Quién ya no trabaja acá. Los que marcaron y NO tienen ficha (48 a 53) no
    // pasan por acá a propósito: sin ficha no hay baja posible, y quedan como
    // pendientes de configurar, que es lo que son.
    const marcasPosteriores: MarcaPosterior[] = [];

    // 🔴 UNA POR UNA, CON LA MISMA FUNCIÓN QUE USA LA FICHA DE UNA PERSONA.
    // Ver `lib/asistencia/ficha-de-configuracion.ts`: acá no se decide nada.
    const personas = [...codigos].map((codigo) => {
      const { persona, marcaPosterior } = armarPersonaDeConfiguracion({
        codigo,
        visto: vistos.get(codigo),
        ficha: fichas.get(codigo),
        directorio,
        reglas,
        filasReparto: repartoPorCodigo.get(codigo),
        deudaPrestamo: deudaDe.get(codigo) ?? 0,
        tieneHorario: conHorario ? conHorario.has(codigo) : null,
        hoy,
      });
      if (marcaPosterior) marcasPosteriores.push(marcaPosterior);
      // 🔴 «Trabaja afuera» se PEGA acá y no adentro de `armarPersonaDeConfiguracion`:
      // su columna se lee aparte (migración sin aplicar, ver `leerTrabajaAfuera`)
      // y la ruta de una persona hace exactamente lo mismo con la misma lectura.
      return { ...persona, trabajaAfuera: afuera.has(codigo) };
    });

    // ⚠️ ACÁ el orden es al revés que en el resto del módulo, y a propósito:
    // primero los que FALTAN, porque esta pantalla es la lista de pendientes.
    // Dentro de cada grupo manda el comparador compartido, que ordena por nombre
    // y —entre los que no tienen— por número de verdad (5 antes que 49).
    personas.sort((a, b) => {
      if (a.configurado !== b.configurado) return a.configurado ? 1 : -1;
      const pa = { codigo: a.codigo, nombre: a.nombre, etiqueta: a.nombre ?? a.codigo, configurado: a.nombre !== null };
      const pb = { codigo: b.codigo, nombre: b.nombre, etiqueta: b.nombre ?? b.codigo, configurado: b.nombre !== null };
      return compararPersonas(pa, pb);
    });

    // ── 🔴 LOS CÓDIGOS IGNORADOS NO SALEN, NI SE CUENTAN ──────────────────
    //
    // Se filtra ACÁ, una sola vez, y con eso desaparecen de la lista, de «N sin
    // terminar», del aviso amarillo y de cualquier conteo — que es exactamente
    // lo que Daniel pidió. Filtrarlo en la pantalla habría dejado los números de
    // arriba contando lo que ya no se ve.
    //
    // ⚠️ La FILA no se borra: se esconde. Ver `codigos-ignorados.ts`.
    const escondidos = await leerIgnorados();
    const personasVisibles = sinIgnorados(personas, escondidos.codigos);

    // 🩸 EL RESUMEN CUENTA SOLO A LOS ACTIVOS. El aviso de pendientes dice
    // «X de N todavía no salen en la planilla», y quien ya no trabaja acá no es
    // trabajo pendiente de nadie: meterlo en la N infla para siempre un número
    // que la contable usa para saber cuánto le falta.
    const activos = personasVisibles.filter((p) => p.activo);

    return NextResponse.json({
      personas: personasVisibles,
      // Los escondidos viajan aparte, para el bloque plegado que los devuelve.
      ignorados: escondidos.lista,
      reglas,
      reglasDefault: REGLAS_DEFAULT,
      resumen: {
        total: activos.length,
        sinConfigurar: activos.filter((p) => !p.configurado).length,
        sinSalario: activos.filter((p) => p.faltaSalario).length,
        conMarcaciones: activos.filter((p) => p.marcaciones > 0).length,
        /** Los que ya no trabajan acá. Se ven aparte, no mezclados. */
        bajas: personasVisibles.length - activos.length,
        /** Marcan y no van en planilla. No son pendientes de nadie. */
        servicioProfesional: activos.filter((p) => p.servicioProfesional).length,
        /** Cobran fijo y no pasan por el reloj. Tampoco son pendientes. */
        noMarcaReloj: activos.filter((p) => p.noMarcaReloj).length,
      },
      // ── CONSTANTES desde el 3-sep-2026 (tolerancia a la DDL retirada) ─────
      // Historia: cada par `avisoMigracion*`/`puede*` decía de entrada qué
      // migración faltaba y apagaba el control correspondiente, en vez de
      // dejar fallar el guardado. Las siete migraciones existen; si una lectura
      // falla hoy, esta respuesta no se arma (500 más abajo). Se conservan
      // con su valor «todo bien» porque `ConfiguracionTab` los lee.
      //
      // 🔴 Desde el 14-sep-2026 salen de UN solo lugar, porque las manda también
      // la ruta de una persona: escritas dos veces, una se quedaría atrás.
      ...BANDERAS_DE_CONFIGURACION,
      // 🩸 El que no se puede esconder: dada de baja y sigue marcando.
      avisoBajas: avisoMarcasPosteriores(marcasPosteriores),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/configuracion GET]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Guarda la ficha de UNA persona. La validación entera vive en el servidor. */
export async function PUT(req: NextRequest) {
  const auth = requireAsistencia(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "No se entendió lo que se envió." }, { status: 400 });
  }

  // 🔑 El cuerpo del PUT es la ÚNICA fuente: lo que el formulario haya dejado
  // pasar no importa. El validador recibe los valores crudos y convierte él —
  // con `Number()` afuera, un `null` llegaría como 0 y un salario 0 entraría.
  const r = validarPersona(body);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  const p = r.valor;

  // La vigencia se valida APARTE de la ficha, y no dentro de `validarPersona`,
  // porque son dos cosas distintas: una dice QUIÉN es la persona y la otra
  // DESDE CUÁNDO y HASTA CUÁNDO trabaja. Guardar un nombre no debería poder
  // fallar por una fecha, y al revés tampoco.
  const rv = validarVigencia(body);
  if (!rv.ok) return NextResponse.json({ error: rv.error }, { status: 400 });
  const v = rv.valor;

  // Lo mismo con "va en planilla / servicio profesional": es OTRA pregunta —cómo
  // se le paga— y no debería poder tumbar el guardado de un nombre.
  const rs = validarServicioProfesional(body);
  if (!rs.ok) return NextResponse.json({ error: rs.error }, { status: 400 });
  const servicioProfesional = rs.valor;

  // Y lo mismo con los seguros: es OTRA pregunta —si se le retiene o no— y no
  // debería poder tumbar el guardado de un nombre.
  const rseg = validarPagaSeguros(body);
  if (!rseg.ok) return NextResponse.json({ error: rseg.error }, { status: 400 });
  const pagaSeguros = rseg.valor;

  // Y lo mismo con la base propia de los seguros: es OTRA pregunta —sobre qué
  // monto se calculan— y no debería poder tumbar el guardado de un nombre.
  const rbase = validarBaseSeguros(body);
  if (!rbase.ok) return NextResponse.json({ error: rbase.error }, { status: 400 });
  const baseSeguros = rbase.valor;

  // Y lo mismo con el reloj: es OTRA pregunta —si se le miden las marcaciones o
  // cobra fijo— y no debería poder tumbar el guardado de un nombre.
  const rrel = validarNoMarcaReloj(body);
  if (!rrel.ok) return NextResponse.json({ error: rrel.error }, { status: 400 });
  const noMarcaRelojValor = rrel.valor;

  // Y lo mismo con «cobra horas extra» (10-sep-2026): OTRA pregunta, ausente = sí.
  const rhe = validarCobraHorasExtra(body);
  if (!rhe.ok) return NextResponse.json({ error: rhe.error }, { status: 400 });
  const cobraHorasExtraValor = rhe.valor;

  // Y lo mismo con «trabaja afuera» (14-sep-2026): OTRA pregunta, ausente = no.
  const rta = validarTrabajaAfuera(body);
  if (!rta.ok) return NextResponse.json({ error: rta.error }, { status: 400 });
  const trabajaAfueraValor = rta.valor;

  // Y lo mismo con el saldo de vacaciones: es OTRA pregunta —cuántos días le
  // quedan— y no debería poder tumbar el guardado de un nombre.
  const rsal = validarSaldoInicial(body);
  if (!rsal.ok) return NextResponse.json({ error: rsal.error }, { status: 400 });
  const saldoVacacionesDias = rsal.valor;

  // ── 🔴 LA FECHA DE CORTE LA PONE EL SERVIDOR, NUNCA EL NAVEGADOR ──────────
  //
  // El campo que llena contabilidad dice «los días que le quedan HOY», así que
  // el corte es hoy — pero SOLO cuando el número CAMBIA. Si vuelve a guardar la
  // ficha sin tocar el saldo, el corte se queda donde estaba: moverlo
  // absorbería en silencio las vacaciones cargadas entre medio y esos días
  // dejarían de restar sin que nadie se entere.
  //
  // Por eso se relee la fila antes de escribir: el corte guardado es el único
  // que protege de contar dos veces los mismos días, y creerle al cuerpo del
  // pedido sería dejar esa protección en manos de quien la puede pisar.
  let saldoVacacionesCorte: string | null = null;
  if (saldoVacacionesDias !== null) {
    const prev = await supabaseServer
      .from(TABLA_PERSONAS)
      .select(COLS_SALDO_VACACIONES.join(", "))
      .eq("empleado_codigo", p.codigo)
      .maybeSingle();
    if (prev.error) {
      // Un error acá es un error (tolerancia a la DDL retirada el 3-sep-2026):
      // NO se guarda a medias — un "guardado" que se traga el saldo dejaría a
      // la persona sin número y nadie sabría por qué.
      return NextResponse.json({ error: prev.error.message }, { status: 500 });
    }
    const anterior = prev.data as unknown as {
      saldo_vacaciones_dias: number | string | null;
      saldo_vacaciones_corte: string | null;
    } | null;
    // 🩸 SE COMPARAN NÚMEROS, NO LO QUE VENGA. La columna es `numeric` y
    // PostgREST la manda como texto: un `"12.0" === 12` da `false`, y con eso
    // CADA guardado de la ficha movería la fecha de corte a hoy sin que nadie
    // tocara el saldo — o sea, absorbería en silencio las vacaciones cargadas
    // entre medio. Es el modo de fallo exacto que el corte existe para evitar.
    const mismoNumero =
      numeroDeDias(anterior?.saldo_vacaciones_dias) === saldoVacacionesDias
      && !!anterior?.saldo_vacaciones_corte;
    saldoVacacionesCorte = mismoNumero ? anterior!.saldo_vacaciones_corte : hoyPanama();
  }

  const base = {
    empleado_codigo: p.codigo,
    nombre: p.nombre,
    salario_mensual: p.salarioMensual,
    jornada_semanal: p.jornadaSemanal,
    empresa: p.empresa,
    updated_at: new Date().toISOString(),
  };
  const conVigencia = {
    ...base,
    fecha_ingreso: v.fechaIngreso,
    fecha_salida: v.fechaSalida,
    motivo_salida: v.motivoSalida,
  };
  const conServicio = {
    ...conVigencia,
    [COLUMNA_SERVICIO_PROFESIONAL]: servicioProfesional,
  };
  const conTodo = {
    ...conServicio,
    [COLUMNA_PAGA_SEGUROS]: pagaSeguros,
  };
  const conSaldo = {
    ...conTodo,
    saldo_vacaciones_dias: saldoVacacionesDias,
    saldo_vacaciones_corte: saldoVacacionesCorte,
  };
  const conReloj = {
    ...conSaldo,
    [COLUMNA_NO_MARCA_RELOJ]: noMarcaRelojValor,
  };
  const conBaseSeguros = {
    ...conReloj,
    [COLUMNA_BASE_SEGUROS]: baseSeguros,
    [COLUMNA_COBRA_HORAS_EXTRA]: cobraHorasExtraValor,
  };
  // 🔴 EL CARGO Y LA CÉDULA — los dos textos que SOLO existen para el papel.
  //
  // No tocan la rata, ni el bruto, ni el neto: se imprimen. Van al final del
  // upsert por eso mismo, y por eso vacío se guarda como `null` y nunca como
  // `""` (la base tiene un CHECK que lo rechaza, y con razón: una cadena vacía
  // es un dato cargado que no dice nada).
  // 🔴 EL CARGO Y LA CÉDULA LOS EDITAN DANIEL Y LA CONTADORA, NADIE MÁS
  // (10-sep-2026). Daniel: las fichas las tocan él y la contadora; la secretaria
  // solo mira. Se pregunta por lo que HACE el rol —quien cierra la planilla— y
  // no por su nombre, que es la misma lista derivada de siempre.
  //
  // ⚠️ Si quien guarda no puede, sus dos campos NO VIAJAN al upsert: se
  // conserva lo que había. No se rechaza el guardado entero —la secretaria sí
  // puede seguir corrigiendo el nombre o el salario— pero tampoco se le escribe
  // en silencio un cargo que no le corresponde tocar.
  const puedeTocarLaFicha = puedeCerrar(String(auth.role ?? ""));
  const b = body as Record<string, unknown> | null;
  const conPapel = puedeTocarLaFicha
    ? {
      ...conBaseSeguros,
      [COLUMNA_POSICION]: posicionDeFicha(b?.posicion),
      [COLUMNA_CEDULA]: cedulaDeFicha(b?.cedula),
    }
    : conBaseSeguros;

  // ── UN solo upsert, con TODAS las columnas ──────────────────────────────────
  //
  // Historia (ago-2026): acá había una CASCADA de seis reintentos, uno por
  // migración pendiente (base de seguros → sueldo fijo → saldo de vacaciones →
  // seguros → servicio profesional → bajas → tabla). Cada uno, si el error
  // NOMBRABA su columna, bifurcaba: si el dato nuevo era el default se
  // reintentaba SIN la columna para que guardar un nombre siguiera funcionando;
  // si el dato nuevo venía cargado, 503 con el nombre del archivo, porque un
  // "guardado" que se traga la bandera es peor que un error (Edwin sin cobrar,
  // Rodrigo con $25,18 de más por quincena, una baja que no saca a nadie de la
  // planilla). Había también un 22P02 «la columna todavía es integer y le
  // mandaron medio día» para la ventana entre 20260826040000 y 20260826060000.
  //
  // 🔴 Tolerancia retirada el 3-sep-2026: las siete columnas existen y el saldo
  // ya es `numeric` (verificado por PostgREST: acepta `12.5`). Hoy un error de
  // la base es un 500 con el mensaje — reintentar sin una columna guardaría la
  // ficha SIN el dato que la contadora tecleó, en silencio.
  const { error } = await supabaseServer
    .from(TABLA_PERSONAS)
    .upsert(conPapel, { onConflict: "empleado_codigo" });

  if (error) {
    console.error("[asistencia/configuracion PUT]", error.message);
    return NextResponse.json({ error: "No se pudo guardar. Intenta de nuevo." }, { status: 500 });
  }

  // ── 🔴 «TRABAJA AFUERA» SE ESCRIBE APARTE, DESPUÉS, Y SOLO SI CAMBIÓ (14-sep-2026)
  //
  // Su columna nace con la migración SIN APLICAR (`MIGRACION_TRABAJA_AFUERA`):
  // si viajara en el upsert de arriba, guardar un NOMBRE fallaría en producción
  // por un archivo SQL que Daniel todavía no corrió. Por eso va en un segundo
  // `update`, sobre la fila que el upsert acaba de asegurar, solo su columna, y
  // SOLO cuando lo que vino es distinto de lo que hay (`leerTrabajaAfuera`, la
  // misma lectura tolerante del GET): con la casilla en su valor de siempre no
  // se escribe nada, y la ficha se guarda exactamente como hasta hoy.
  //
  //   · Cambió y la columna existe → se escribe (true o false).
  //   · Cambió a `true` y la columna NO existe → error con el nombre del
  //     archivo. Un «guardado» que se traga la casilla es peor que un error: la
  //     persona seguiría con ausencias y nadie lo vería hasta el día de pago.
  //     Lo demás de la ficha YA quedó guardado, y el aviso lo dice. (Sin `503`:
  //     esta ruta no contesta «falta un paso» desde el 3-sep-2026, hay candado.)
  //   · Cualquier otro error → 500, como el upsert.
  const afueraHoy = (await leerTrabajaAfuera()).has(p.codigo);
  if (afueraHoy !== trabajaAfueraValor) {
    const escr = await supabaseServer
      .from(TABLA_PERSONAS)
      .update({ [COLUMNA_TRABAJA_AFUERA]: trabajaAfueraValor })
      .eq("empleado_codigo", p.codigo);
    if (escr.error) {
      if (esColumnaTrabajaAfueraFaltante(escr.error)) {
        return NextResponse.json({ error: avisoMigracionTrabajaAfuera() }, { status: 500 });
      }
      console.error("[asistencia/configuracion PUT trabaja_afuera]", escr.error.message);
      return NextResponse.json({ error: "No se pudo guardar. Intenta de nuevo." }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, persona: { ...p, ...v, servicioProfesional, pagaSeguros, baseSeguros, noMarcaReloj: noMarcaRelojValor, cobraHorasExtra: cobraHorasExtraValor, trabajaAfuera: trabajaAfueraValor, saldoVacacionesDias, saldoVacacionesCorte } });
}
