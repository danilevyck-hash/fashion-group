// GET  /api/asistencia/planilla?quincena=2026-07-2&empresa=confecciones_boston
// POST /api/asistencia/planilla   { quincena, codigo, isr, prestamo, ... }
//
// El cuadro quincenal. Toda la regla vive en `lib/asistencia/planilla.ts`
// (puro) y los minutos salen del MISMO motor que el Reporte
// (`lib/asistencia/reporte.ts`), así que la pantalla de Asistencia y la de
// Planilla no pueden contradecirse en cuántos minutos llegó tarde alguien.

import { NextRequest, NextResponse } from "next/server";
import { asistenciaRoles, aprobacionesRoles, soloAprueba } from "@/lib/asistencia/roles";
import { EMPRESA_BOSTON, ROL_BOSTON, esGerenteBoston, planillaSinDinero } from "@/lib/boston/rol";
import { lineasSinDinero } from "@/lib/boston/planilla-sin-dinero";
import { requireAsistencia, MODULOS_PLANILLA } from "@/lib/asistencia/guard";
import { alcanza } from "@/lib/asistencia/aprobador-empresa";
import { leerAlcanceAprobador, avisoMigracionAprobador } from "@/lib/asistencia/aprobador-empresa-server";
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import {
  armarReporte,
  SALIDA_DEFAULT,
  type HorarioPersona,
  type Justificacion,
} from "@/lib/asistencia/reporte";
import {
  aplicarCorrecciones,
  contarCorrecciones,
  type MarcacionConId,
} from "@/lib/asistencia/correcciones";
import { leerCorrecciones } from "@/lib/asistencia/correcciones-server";
import {
  leerReglas,
  leerPersonas,
  vigenciasDeFilas,
  servicioProfesionalDeFila,
  pagaSegurosDeFila,
  baseSegurosDeFila,
  noMarcaRelojDeFila,
  leerJustificaciones,
  leerVacaciones,
  leerRepartos,
  avisoMigracionVacaciones,
} from "@/lib/asistencia/config-server";
import {
  agruparPorCodigo,
  avisoMigracionReparto,
  partesDe,
  textoRepartoRechazado,
  validarReparto,
  type RepartoRechazado,
} from "@/lib/asistencia/reparto";
import { avisoMigracionServicioProfesional } from "@/lib/asistencia/participacion";
import { etiquetaPersona } from "@/lib/asistencia/directorio";
import { avisoMigracionBaseSeguros } from "@/lib/asistencia/seguros-base";
import {
  avisoMigracionBajas,
  codigosFueraDeRango,
  marcoDespuesDeLaBaja,
  motivoPeriodoParcial,
  ultimoDiaConMarcas,
} from "@/lib/asistencia/vigencia";
import {
  avisoPeriodoAbierto,
  textoCodigosSinFicha,
  motivosDeQuienNoMarco,
  type CodigoSinFicha,
} from "@/lib/asistencia/periodo";
import {
  textoVacacionesNoPagadas,
  type VacacionNoPagada,
} from "@/lib/asistencia/vacaciones";
import { hoyPanama } from "@/lib/fecha-panama";
import {
  avisoMigracion,
  EMPRESAS_ASISTENCIA,
  etiquetaEmpresa,
} from "@/lib/asistencia/config";
import {
  armarPlanilla,
  jornadaDiariaMin,
  JORNADA_DIARIA_DEFAULT_MIN,
  normalizarManuales,
  periodoDeQuincena,
  periodoDesdeRango,
  quincenaDesdeClave,
  separarSinFicha,
  totalizar,
  type FichaPlanilla,
  type ManualesLinea,
  type Periodo,
} from "@/lib/asistencia/planilla";
import {
  avisoMigracionPlanilla,
  guardarManuales,
  leerManuales,
} from "@/lib/asistencia/planilla-server";
import {
  armarDiasAprobacion,
  avisoMigracionAprobaciones,
  estaAprobado,
  extrasNoAprobadas,
  indexarAprobaciones,
  textoExtraNoAprobada,
} from "@/lib/asistencia/aprobaciones";
import { leerAprobaciones } from "@/lib/asistencia/aprobaciones-server";
import {
  avisoMigracionAmarrePrestamos,
  avisoMigracionPrestamoAprobado,
  prestamosSinAprobar,
  prestamosSinAtar,
  sugerirPrestamos,
  textoPrestamoSinAprobar,
  textoPrestamoSinAtar,
  type FichaPrestamo,
  type PersonaEnCuadro,
} from "@/lib/asistencia/prestamos-planilla";
import {
  leerAprobacionesPrestamo,
  leerPrestamosDeQuincena,
} from "@/lib/asistencia/prestamos-planilla-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PANAMA = "-05:00";
/** Tope del rango libre. Un año cubre cualquier pregunta real del negocio. */
const DIAS_MAX = 366;

function instante(dia: string, fin: boolean): string {
  return new Date(
    Date.parse(`${dia}T${fin ? "23:59:59.999" : "00:00:00.000"}${PANAMA}`),
  ).toISOString();
}

export async function GET(req: NextRequest) {
  // 🔴 DOS PUERTAS, Y LA SEGUNDA ENTRA RECORTADA.
  //
  // A esta ruta entra Asistencia entera (la contadora arma la planilla acá) y
  // también quien SOLO aprueba horas extra — el usuario `bodega`, que es con el
  // que trabaja Julio Garay. La pestaña Aprobaciones necesita las HORAS de cada
  // persona, y las horas se calculan acá; pero el mismo cuadro trae el SUELDO
  // de las 38, y eso no le corresponde.
  //
  // 🔑 El recorte va en el SERVIDOR, no en la pantalla: esconder la columna
  // dejaría el sueldo viajando en el JSON, a un «ver código fuente» de
  // distancia. Ver `soloApruebaRoles()` en `lib/asistencia/roles.ts`.
  //
  // 🔴 TRES PUERTAS DESDE EL 27-ago-2026. La tercera es `gerente_boston`
  // (David): la pestaña Planilla de su módulo muestra la planilla de las 21
  // personas de Confecciones Boston, y sale de ACÁ y no de un cálculo nuevo.
  // Reimplementar la planilla habría estrenado una SEGUNDA aritmética de
  // sueldos al lado de la que la contadora ya cotejó al centavo contra su
  // Excel — y su modo de fallo es que dos pantallas paguen distinto.
  const auth = requireAsistencia(req, [...asistenciaRoles(), ...aprobacionesRoles(), ROL_BOSTON], MODULOS_PLANILLA);
  if (auth instanceof NextResponse) return auth;
  const recortado = soloAprueba(auth.role);
  // 🔴 David ve el cuadro ENTERO de Boston, pero por defecto SIN la plata. La
  // línea que lo decide es `VE_SUELDOS_DE_BOSTON` en `lib/boston/rol.ts`, y es
  // una sola: Daniel todavía no contestó si su hermano ve los sueldos.
  const sinPlata = planillaSinDinero(auth.role);

  const sp = req.nextUrl.searchParams;

  // ── QUÉ PERÍODO SE PIDIÓ ────────────────────────────────────────────────────
  //
  // Dos caminos, y el viejo NO se toca: `?quincena=2026-07-2` sigue funcionando
  // igual que siempre (lo usan los enlaces guardados y cualquier cosa que ya
  // apunte acá). El nuevo es `?desde=…&hasta=…`.
  //
  // 🔑 Y si el rango COINCIDE con una quincena, `periodoDesdeRango` devuelve el
  // período de esa quincena: misma clave de montos manuales y factor 1. Los dos
  // caminos dan el MISMO cuadro hasta el centavo, y hay un test que lo exige.
  const desdeRaw = (sp.get("desde") ?? "").trim();
  const hastaRaw = (sp.get("hasta") ?? "").trim();
  let periodo: Periodo | null = null;

  if (desdeRaw || hastaRaw) {
    periodo = periodoDesdeRango(desdeRaw, hastaRaw);
    if (!periodo) {
      return NextResponse.json(
        { error: "Fechas inválidas. Se esperan dos fechas como 2026-07-25, y la de inicio no puede ser posterior a la del final." },
        { status: 400 },
      );
    }
    // ⚠️ Tope de un año. No es capricho: cada consulta pagina TODAS las
    // marcaciones del rango, y un rango de diez años sería una forma de tumbar
    // la base desde la barra de direcciones.
    if (periodo.diasCalendario > DIAS_MAX) {
      return NextResponse.json(
        { error: `El rango es muy largo: ${periodo.diasCalendario} días. El máximo es ${DIAS_MAX}.` },
        { status: 400 },
      );
    }
  } else {
    const quincena = quincenaDesdeClave(sp.get("quincena") ?? "");
    if (!quincena) {
      return NextResponse.json(
        { error: "Quincena inválida. Se espera algo como 2026-07-2." },
        { status: 400 },
      );
    }
    periodo = periodoDeQuincena(quincena);
  }
  const q = periodo;
  const empresaRaw = (sp.get("empresa") ?? "").trim();
  // 🔴 A `gerente_boston` la empresa NO se la decide la URL: ES Boston. Mismo
  // criterio que Multifashion, que ES `american_classic` y no acepta `?empresa=`
  // en ninguna de sus 11 rutas — aceptarla por parámetro le abriría desde su
  // único módulo las planillas de Vistana y Fashion Wear. Y se fuerza acá, no
  // se valida: un `?empresa=vistana` de un marcador viejo tiene que devolver
  // Boston, no un 400 que deje la pantalla en blanco.
  // 🔴 Y DESDE EL 31-ago-2026, LO MISMO PARA CUALQUIER APROBADOR ACOTADO. Su
  // reparto vive en `asistencia_aprobador_empresa`; si el query pide una empresa
  // que no le corresponde, se IGNORA (queda `null` = todas LAS SUYAS), igual que
  // con David: se fuerza, no se valida. Un 400 dejaría la pantalla en blanco por
  // un marcador viejo.
  const alcance = await leerAlcanceAprobador(auth.role, auth.userName);
  const pedida =
    empresaRaw && (EMPRESAS_ASISTENCIA as readonly string[]).includes(empresaRaw)
      ? empresaRaw
      : null;
  const empresa = esGerenteBoston(auth.role)
    ? EMPRESA_BOSTON
    : pedida && alcanza(alcance, pedida)
      ? pedida
      : null;

  try {
    // Paginado y verificado contra el COUNT: PostgREST corta en 1.000 filas EN
    // SILENCIO y una quincena de 37 personas con 4 marcas diarias pasa de ahí.
    // Una planilla con las marcaciones recortadas sin avisar se paga igual.
    const marcaciones = await leerTodoPaginado<MarcacionConId>(
      "asistencia_marcaciones (planilla)",
      (pedirCount, from, to) =>
        supabaseServer
          .from("asistencia_marcaciones")
          .select(
            // 🔑 El `id` ata cada corrección a SU marcación.
            "id, empleado_codigo, empleado_nombre, ocurrio_en",
            pedirCount ? { count: "exact" } : {},
          )
          .gte("ocurrio_en", instante(q.desde, false))
          .lte("ocurrio_en", instante(q.hasta, true))
          .order("ocurrio_en", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
    );

    const [{ reglas }, personasDb, correcciones, manualesLeidos, aprRes, repRes, hRes, jRes, vRes, fRes] = await Promise.all([
      leerReglas(),
      leerPersonas(),
      // 🔴 ACÁ ES DONDE LA CORRECCIÓN LLEGA AL PAGO. Si no llegara, corregir una
      // hora no serviría para nada: la pantalla diría una cosa y la planilla
      // pagaría otra. Sin la tabla corrida devuelve CERO correcciones, o sea la
      // misma planilla de siempre, hasta el centavo.
      leerCorrecciones(q.desde, q.hasta),
      // ⚠️ En un rango libre NO hay montos manuales: se guardan por quincena y
      // repartir un ISR por días sería inventar plata. Se avisa en la respuesta.
      q.claveManuales ? leerManuales(q.claveManuales) : Promise.resolve({ porCodigo: new Map(), faltaMigracion: false }),
      // 🔴 QUIÉN TIENE LAS HORAS EXTRA AUTORIZADAS. Contadora, textual: *«Sólo
      // se pagan las horas extras autorizadas y las reportadas por Julio
      // Garay»*. Sin la tabla corrida devuelve cero filas Y `faltaTabla: true`,
      // y entonces NO se exige aprobación: se paga todo lo que midió el reloj,
      // hasta el centavo igual que hasta hoy. Se avisa en `avisos`.
      leerAprobaciones(q.desde, q.hasta),
      // 🔴 QUIÉN REPARTE SU SUELDO ENTRE DOS EMPRESAS. Sin la tabla corrida
      // devuelve cero filas Y `faltaTabla: true`: nadie reparte nada y el cuadro
      // es el de siempre, hasta el centavo. Se avisa en `avisos`.
      leerRepartos(),
      supabaseServer
        .from("asistencia_horarios")
        .select("empleado_codigo, entrada, salida, almuerzo_minutos"),
      // 🔑 Por la fuente ÚNICA, no con un `select` copiado. Ver la nota de
      // `leerJustificaciones`: leer distinto acá que en el reporte es la
      // diferencia entre «el día entero» y «un permiso de dos horas».
      leerJustificaciones(q.desde, q.hasta),
      // 🔴 LAS VACACIONES, por la MISMA puerta que el reporte. Sin la tabla
      // corrida devuelve CERO filas y la planilla paga exactamente lo de ayer.
      leerVacaciones(q.desde, q.hasta),
      supabaseServer
        .from("asistencia_feriados")
        .select("fecha, nombre")
        .gte("fecha", q.desde)
        .lte("fecha", q.hasta),
    ]);
    if (hRes.error) throw new Error(hRes.error.message);
    if (fRes.error) throw new Error(fRes.error.message);

    const horarios = (hRes.data ?? []).map((h) => ({
      ...h,
      // Postgres devuelve `time` como "08:00:00"; el motor compara "HH:MM".
      entrada: String(h.entrada).slice(0, 5),
      salida: String(h.salida).slice(0, 5),
    })) as HorarioPersona[];

    // ── QUIÉN ENTRA A ESTA QUINCENA ──────────────────────────────────────────
    //
    // 🩸 EL FILTRO DE LAS BAJAS VA ACÁ, EN LA CAPA QUE ARMA LA LISTA, Y NO EN EL
    // MOTOR. `planilla.ts` convierte minutos en dólares; quién es parte de la
    // planilla es una pregunta de calendario que el motor no necesita para
    // multiplicar nada. Además así queda UN solo punto donde se decide, en vez
    // de una regla de fechas metida entre los recargos.
    //
    // 🔑 Y ES LO QUE HACE QUE UNA QUINCENA VIEJA NO CAMBIE NUNCA: la baja se
    // compara contra las fechas DE ESA QUINCENA, no contra hoy. Dar de baja a
    // alguien esta tarde no puede mover un centavo de la planilla de julio.
    const vigencias = vigenciasDeFilas(personasDb.filas);
    const fuera = codigosFueraDeRango(vigencias, q.desde, q.hasta);

    // ── 🔴 EL REPARTO DEL SUELDO ENTRE DOS EMPRESAS ──────────────────────────
    //
    // Se valida ACÁ, una sola vez, para poder DECIR en pantalla el motivo del
    // rechazo: la regla de Daniel es que lo que un guard descarta se dice, con
    // el nombre y en ámbar. `partesDe` devuelve la lista vacía ante cualquier
    // duda, y una lista vacía es exactamente la planilla de ayer.
    const repartoPorCodigo = agruparPorCodigo(repRes.filas);
    const repartosRechazados: RepartoRechazado[] = [];

    const fichas = new Map<string, FichaPlanilla>();
    for (const f of personasDb.filas) {
      const codigo = String(f.empleado_codigo);
      if (fuera.has(codigo)) continue;
      const salario = f.salario_mensual === null ? null : Number(f.salario_mensual);
      const filasReparto = repartoPorCodigo.get(codigo);
      if (filasReparto && filasReparto.length > 0) {
        const r = validarReparto(salario, filasReparto);
        if (!r.ok) {
          repartosRechazados.push({
            codigo,
            etiqueta: etiquetaPersona(codigo, f.nombre),
            motivo: r.error,
          });
        }
      }
      fichas.set(codigo, {
        codigo,
        nombre: f.nombre ?? null,
        salarioMensual: salario,
        jornadaSemanal: f.jornada_semanal ?? null,
        empresa: f.empresa ?? null,
        // 🔴 Sin esto la bandera no llegaría al motor y a un servicio profesional
        // con salario cargado se le calcularía la quincena entera.
        servicioProfesional: servicioProfesionalDeFila(f),
        // 🔴 Lo mismo un escalón más abajo: sin esto el interruptor de los
        // seguros no llegaría al motor y la planilla se los seguiría cobrando a
        // todo el mundo, que es justo lo que este campo existe para cambiar.
        pagaSeguros: pagaSegurosDeFila(f),
        // 🔴 Y un escalón más: sin esto la base propia no llegaría al motor y a
        // RODRIGO se le seguiría reteniendo el 9,75 % sobre su bruto ($39,38)
        // en vez del que sale de sus $175 de base ($17,06). Ver `seguros-base.ts`.
        baseSeguros: baseSegurosDeFila(f),
        noMarcaReloj: noMarcaRelojDeFila(f),
        // 🔴 Sin esto el reparto no llegaría al motor y JULIO seguiría cobrando
        // sus $1.000 en una sola planilla, con el 11 % de seguros encima de sus
        // horas extra. Ver `reparto.ts`.
        reparto: partesDe(salario, filasReparto),
      });
    }
    const nombres = new Map<string, string>();
    for (const [cod, f] of fichas) if (f.nombre) nombres.set(cod, f.nombre);

    // 🩸 `incluirNoHabiles` es lo que hace visible el domingo trabajado. Sin
    // esto, las horas del domingo 26-jul (5 personas, medido) no existirían
    // para el cálculo y nadie las echaría de menos.
    // 🔴 LAS HORAS CORREGIDAS ENTRAN AL CÁLCULO ACÁ, y `asistencia_marcaciones`
    // no se toca: `aplicarCorrecciones` devuelve una COPIA.
    const efectivas = aplicarCorrecciones(marcaciones, correcciones.correcciones);

    // 🔴 EL DÍA QUE NO PASÓ NO PUEDE SER UNA AUSENCIA, Y ESTA LÍNEA ES TODO EL
    // ARREGLO. La planilla NO pasaba `diaEnCurso` —el Reporte sí— así que hoy y
    // todos los días que faltan de la quincena salían como falta de las 33
    // personas. Medido el 14-ago-2026 sobre la quincena del 1 al 15: de los
    // $1.127,78 que se descontaban por ausencia, **$866,99 eran del 14**.
    //
    // 🔑 EL DÍA ES EL DE PANAMÁ (UTC−5 fijo). En UTC pelado, entre las 7 p.m. y
    // la medianoche el día salta al siguiente y "hoy" pasaría a ser mañana:
    // agrupar por UTC ya dio números falsos dos veces en este módulo.
    // ⚠️ Se pasa SIEMPRE, sin mirar si cae dentro del período: una quincena
    // vieja no tiene ningún día que lo alcance y su cálculo no se mueve un
    // centavo. Eso es lo que hace que reimprimir julio siga dando lo de julio.
    const hoy = hoyPanama();

    const personas = armarReporte({
      marcaciones: efectivas.marcaciones,
      horarios,
      justificaciones: jRes.filas,
      vacaciones: vRes.filas,
      feriados: new Map((fRes.data ?? []).map((f) => [String(f.fecha), String(f.nombre)])),
      desde: q.desde,
      hasta: q.hasta,
      reglas,
      nombres,
      incluirNoHabiles: true,
      diaEnCurso: hoy,
      // Solo para mostrar: las horas corregidas ya están adentro de arriba.
      correccionesPorDia: efectivas.porDia,
    });

    // Cuánto dura el día de cada quien. Es lo que vale una ausencia.
    // 🔑 Con horario confirmado manda el SUYO —el mismo con el que se le mide la
    // tardanza y la hora extra—; sin horario son 8 horas, que es lo que usa la
    // contable en su Excel (ver `JORNADA_DIARIA_DEFAULT_MIN`). Antes se derivaba
    // del horario POR DEFECTO y daba 8,5 h para casi todo el mundo.
    const horarioDe = new Map(horarios.map((h) => [h.empleado_codigo, h]));
    const jornadaDeCodigo = (codigo: string) => jornadaDiariaMin(horarioDe.get(codigo));

    // 🩸 La baja tiene que sacar a la persona de las DOS listas. Si solo se
    // sacara la ficha, quien marcó después de irse volvería a entrar como "sin
    // ficha en Configuración" —con nombre en blanco y sin un dólar— que es peor
    // que dejarla: parece una persona nueva sin configurar.
    const personasVigentes = personas.filter((p) => !fuera.has(p.codigo));

    // Marcó DESPUÉS del día en que se fue. No se esconde: o volvió —y hay que
    // reactivarla o la planilla le paga cero— o alguien más está usando su
    // huella. Se cuenta con el ÚLTIMO DÍA CON MARCAS, no con estar afuera de la
    // quincena: así también se ve el caso de quien se fue el 20 y marcó el 25
    // de su MISMA quincena, que sí entra al cuadro. El detalle con nombres vive
    // en Configuración, que es donde se arregla.
    const marcoDespuesDeIrse = personas.filter((p) =>
      marcoDespuesDeLaBaja(vigencias.get(p.codigo), ultimoDiaConMarcas(p.dias)),
    ).length;

    // ── QUIÉN NECESITA QUE LO DECIDA UNA PERSONA ─────────────────────────────
    //
    // 🔴 (a) QUIEN ENTRÓ O SALIÓ A MITAD DEL PERÍODO. No se le calcula pago, ni
    // completo ni prorrateado: las dos cuentas automáticas están mal por lados
    // opuestos (ver `motivoPeriodoParcial`). Sale con el motivo escrito y fuera
    // del total, y la contadora saca lo suyo con el rango de fechas libre.
    const decidirAMano = new Map<string, string>();
    for (const [codigo, v] of vigencias) {
      if (fuera.has(codigo)) continue;
      const motivo = motivoPeriodoParcial(v, q.desde, q.hasta);
      if (motivo) decidirAMano.set(codigo, motivo);
    }

    // 🔴 (b) QUIEN TIENE UNA JUSTIFICACIÓN VIVA Y NO MARCÓ NI UN DÍA. RODRIGO
    // MIRANDA (trabajo fuera de la oficina) y ELOYN MENDOZA (vacaciones) salían
    // en ámbar diciendo «falta configurarles algo… se arreglan en Configuración»
    // y en Configuración no hay NADA que arreglarles: sus justificaciones ya
    // están cargadas y son correctas.
    // ⚠️ `armarPlanilla` solo mira este mapa cuando la persona no tiene UNA sola
    // marca en el período: quien se tomó dos días y trabajó trece cobra normal.
    // 🔴 POR LA FUENTE ÚNICA, no con un mapa armado acá. Ver
    // `motivosDeQuienNoMarco`: este mapa se escribía a mano en esta ruta Y en
    // el script de auditoría, y el día que las vacaciones se mudaron de tabla
    // la ruta aprendió a leerlas y la copia no — con ELOYN MENDOZA saliendo
    // como «no marcó ni un día» en el instrumento con el que se audita el pago.
    const justificados = motivosDeQuienNoMarco({
      justificaciones: jRes.filas,
      vacaciones: vRes.filas,
    });

    // ── 🔴 LA APROBACIÓN DE LAS HORAS EXTRA ──────────────────────────────────
    //
    // `exigir` es lo único que decide si el candado está puesto, y depende de
    // que la TABLA exista — no de que haya filas. Con la tabla corrida y sin
    // nadie aprobado, nadie cobra extras (que es la regla de la contadora y se
    // dice en ámbar); sin la tabla, se paga todo como hasta hoy.
    const aprobaciones = indexarAprobaciones(aprRes.filas);
    const exigirAprobacionExtra = !aprRes.faltaTabla;
    // 🔑 `codigo|fecha` de cada DÍA autorizado. La aprobación es por día desde
    // el 27-ago-2026: el corte de la quincena lo mueve la contadora, así que
    // una llave por período volvía a preguntar todo con cada corrimiento.
    const diasExtraAprobados = new Set<string>();
    for (const [clave, a] of aprobaciones) if (estaAprobado(a)) diasExtraAprobados.add(clave);

    const todasLasLineas = armarPlanilla({
      personas: personasVigentes,
      fichas,
      manuales: manualesLeidos.porCodigo,
      jornadaDiariaMin: jornadaDeCodigo,
      reglas,
      empresa,
      exigirAprobacionExtra,
      diasExtraAprobados,
      // 🔴 Lo que prorratea el sueldo. 1 cuando el período es una quincena.
      factorBase: q.factorBase,
      decidirAMano,
      justificados,
    });

    // 🔴 EL CÓDIGO SIN FICHA SALE DEL CUADRO DE CADA EMPRESA Y SE MUESTRA UNA
    // SOLA VEZ. Entra a las tres empresas a propósito —no se le puede adivinar
    // la suya— y por eso aparecía tres veces, como si fueran tres personas.
    // La intención de que NO DESAPAREZCA se conserva: viaja aparte, arriba.
    // 🔴 EL RECORTE POR EMPRESA. `empresa` filtra UNA; esto acota al CONJUNTO de
    // las suyas, que es lo que hace falta cuando alguien tiene dos (Julio:
    // fashion_wear + vistana). Va acá, ANTES de los totales y de armar el cuadro
    // de aprobación, para que no exista un camino que muestre una empresa ajena.
    //
    // ⚠️ Con `empresas === null` —admin, o la tabla sin correr— no filtra nada y
    // la respuesta es EXACTAMENTE la de siempre.
    const conAlcance =
      alcance.empresas === null
        ? todasLasLineas
        : todasLasLineas.filter((l) => l.empresa == null || alcanza(alcance, l.empresa));
    const { lineas, sinFicha } = separarSinFicha(conAlcance);
    const marcasPorCodigo = new Map<string, number>();
    for (const m of marcaciones) {
      const c = String(m.empleado_codigo ?? m.empleado_nombre ?? "").trim();
      if (c) marcasPorCodigo.set(c, (marcasPorCodigo.get(c) ?? 0) + 1);
    }
    const codigosSinFicha: CodigoSinFicha[] = sinFicha.map((l) => ({
      codigo: l.codigo,
      marcaciones: marcasPorCodigo.get(l.codigo) ?? 0,
    }));

    // ── 🔴 NADA SE DESCARTA EN SILENCIO ──────────────────────────────────────
    //
    // Regla firme de Daniel: si la planilla deja de pagar días por una vacación
    // marcada «ya se le pagó», TIENE QUE DECIRLO en pantalla — con el nombre,
    // el rango y el monto. Rechazar sí, esconder no.
    //
    // 🔑 Se arma sobre las líneas que SÍ produjeron dinero, que son las únicas
    // donde la planilla de verdad descontó algo. A quien el sistema no le
    // calculó pago (una vacación que cubre el período entero, sin una sola
    // marca) no se le "dejó de pagar" nada: sale en «Tú decides» con su
    // motivo escrito, que es otra cosa y ya se dice ahí.
    const rangosMarcadosDe = new Map<string, Array<{ desde: string; hasta: string }>>();
    for (const v of vRes.filas) {
      if (v.ya_pagadas !== true) continue;
      const cod = String(v.empleado_codigo);
      const lista = rangosMarcadosDe.get(cod);
      if (lista) lista.push({ desde: v.desde, hasta: v.hasta });
      else rangosMarcadosDe.set(cod, [{ desde: v.desde, hasta: v.hasta }]);
    }
    const vacacionesNoPagadas: VacacionNoPagada[] = lineas
      .filter((l) => (l.dinero?.vacacionesYaPagadas ?? 0) > 0)
      .map((l) => ({
        codigo: l.codigo,
        etiqueta: l.etiqueta,
        rangos: rangosMarcadosDe.get(l.codigo) ?? [],
        dias: l.horas.vacacionesYaPagadasDias,
        monto: l.dinero!.vacacionesYaPagadas,
      }));

    // ── 🔴 LO QUE NO SE PAGÓ POR FALTA DE APROBACIÓN ─────────────────────────
    //
    // Misma forma que `vacacionesNoPagadas`, y por la misma regla de Daniel:
    // *«lo que un guard rechaza se DICE en pantalla»*. Con nombre y cantidad —
    // un «hay horas sin aprobar» sin decir de quién obliga a abrir otra
    // pantalla para saber qué pasó, y eso es lo que hace que un aviso no se lea.
    const extraSinAprobar = extrasNoAprobadas(lineas);

    // ── LA LISTA DE LA PESTAÑA «APROBACIONES» ────────────────────────────────
    //
    // 🔑 SALE DE ACÁ Y NO DE UNA SEGUNDA RUTA. Los minutos ya están calculados
    // en este mismo request —mismas marcaciones, mismas correcciones, mismo
    // `clasificarDia`—, así que la pantalla que aprueba y la que paga no pueden
    // decir números distintos. Rearmarlos aparte es el bug que ya pasó con el
    // mapa de «por qué no marcó».
    //
    // ⚠️ Solo para quien puede aprobar, y solo si se pide: es trabajo de más
    // para los otros usos de esta ruta.
    // Quien solo aprueba no tiene otro motivo para estar acá: se le arma
    // siempre, pida lo que pida, para que nunca reciba un cuadro vacío.
    const pidenAprobaciones = recortado || sp.get("aprobaciones") === "1";
    const puedeAprobar = aprobacionesRoles().includes(auth.role) || auth.role === "admin";
    const filasAprobacion =
      pidenAprobaciones && puedeAprobar
        ? armarDiasAprobacion({ lineas, personas: personasVigentes, reglas, aprobaciones })
        : null;

    // 🔴 LA RESPUESTA ACOTADA. Ni `lineas`, ni `totales`, ni un solo campo de
    // dinero: solo las horas de cada persona y si están aprobadas. Se devuelve
    // ANTES de armar la de siempre, así que no hay forma de que un campo nuevo
    // se cuele acá por olvido — lo que no se nombra, no viaja.
    if (recortado) {
      return NextResponse.json({
        periodo: q,
        // 🔴 Y TAMPOCO EL MONTO DE LAS EXTRAS. Parece inofensivo —son sus horas,
        // no su sueldo— pero es una división: 5,5 h a 1,25 por $43,45 dice que
        // la rata es $6,32, y de la rata sale el mensual. `null` es un valor que
        // la fila ya admite («no se le pudo calcular pago»), así que la pantalla
        // no necesita saber nada de esto: muestra las horas y aprueba.
        aprobaciones: filasAprobacion,
        puedeAprobar,
        avisos: {
          faltaMigracionAprobaciones: aprRes.faltaTabla ? avisoMigracionAprobaciones() : null,
          faltaMigracionAprobador: alcance.faltaTabla ? avisoMigracionAprobador() : null,
        },
      });
    }

    // 🔴 LA PLANILLA DE BOSTON SIN UN SOLO NÚMERO DE PLATA.
    //
    // Se devuelve ANTES de armar la de siempre —igual que el recorte de
    // `bodega` de arriba— así que un campo de dinero que alguien agregue
    // mañana a `LineaPlanilla` NO se cuela acá por olvido: `lineaSinDinero`
    // ENUMERA lo que viaja. Y no hay `totales`: sumar 21 sueldos y publicar el
    // total es el sueldo promedio a una división de distancia.
    //
    // ⚠️ Las HORAS, las tardanzas, las ausencias y los avisos viajan enteros —
    // es la operación de Boston, que es justo lo que Daniel quiere que vea.
    //
    // 🔑 Y VA ANTES DEL BLOQUE DEL PRÉSTAMO DE ABAJO, por el MISMO motivo que
    // ese bloque va después del `return` de `bodega`: lo que a David le
    // descuentan —o no— a cada persona es plata, y lo que no se ejecuta acá
    // abajo no puede colarse en esta respuesta ni consultarse por las dudas.
    if (sinPlata) {
      return NextResponse.json({
        quincena: q.quincena ?? q,
        periodo: q,
        empresa,
        empresaEtiqueta: empresa ? etiquetaEmpresa(empresa) : null,
        lineas: lineasSinDinero(lineas as unknown as Record<string, unknown>[]),
        sinSueldos: true,
        reglas,
        aprobaciones: null,
        puedeAprobar: false,
        avisos: {
          faltaMigracionConfiguracion: personasDb.faltaMigracion ? avisoMigracion() : null,
          periodoAbierto: avisoPeriodoAbierto(q.desde, q.hasta, hoy, q.esQuincena),
          sinFicha: codigosSinFicha,
          avisoSinFicha: textoCodigosSinFicha(codigosSinFicha),
        },
      });
    }

    // ── 🔴 EL PRÉSTAMO, TRAÍDO DEL MÓDULO ────────────────────────────────────
    //
    // 🔑 VA DESPUÉS DEL `return` DE ARRIBA, a propósito: quien solo aprueba
    // horas extra (el usuario `bodega`, con el que trabaja Julio) no tiene por
    // qué recibir —ni que se le consulte— cuánto le están descontando a nadie.
    // Lo que no se ejecuta acá abajo, no puede colarse en aquella respuesta.
    //
    // ⚠️ Y solo en una QUINCENA. Los montos manuales se guardan por quincena
    // (`claveManuales`); en un rango libre no hay casilla que llenar y repartir
    // una cuota por días sería inventar plata. Es la MISMA condición con la que
    // ya se leen los montos manuales, unas líneas más arriba.
    const claveQ = q.claveManuales;
    const [presRes, aprPresRes] = claveQ
      ? await Promise.all([
        // 🔴 Sin la columna del amarre nadie queda atado —la casilla se sigue
        // escribiendo a mano, como hoy— pero se dice en `avisos`.
        leerPrestamosDeQuincena(q.desde, q.hasta),
        // 🔴 Sin la tabla no se puede aprobar nada y la planilla da EXACTAMENTE
        // lo de hoy hasta el centavo. También se dice.
        leerAprobacionesPrestamo(claveQ),
      ])
      : [
        { fichas: [] as FichaPrestamo[], faltaColumnaAmarre: false },
        { porCodigo: new Map(), faltaTabla: false },
      ];

    // 🔑 La casilla de HOY sale de las MISMAS líneas del cuadro, no de una
    // segunda lectura de `asistencia_planilla_manual`: lo que la pantalla dice
    // que hay en la casilla y lo que la planilla suma no pueden separarse.
    const enCuadro: PersonaEnCuadro[] = lineas.map((l) => ({
      codigo: l.codigo,
      etiqueta: l.etiqueta,
      empresa: l.empresa,
      empresaEtiqueta: l.empresaEtiqueta,
      enCasilla: l.manuales.prestamo,
    }));
    const prestamos = sugerirPrestamos({
      fichas: presRes.fichas,
      personas: enCuadro,
      aprobaciones: aprPresRes.porCodigo,
    });
    // 🔴 Lo que este cuadro NO descontó porque nadie lo aprobó, y los préstamos
    // con saldo que no son de nadie. Los dos van con nombre y monto: es la
    // misma regla de Daniel que ya cumplen las horas extra y las vacaciones ya
    // pagadas — rechazar sí, esconder no.
    const prestamoSinAprobar = prestamosSinAprobar(prestamos);
    const prestamoSinAtar = prestamosSinAtar(presRes.fichas);

    return NextResponse.json({
      // `quincena` se mantiene con el mismo nombre y forma para no romper a
      // nadie que ya lo lea; `periodo` es lo que la pantalla usa ahora.
      quincena: q.quincena ?? q,
      periodo: q,
      empresa,
      empresaEtiqueta: empresa ? etiquetaEmpresa(empresa) : null,
      lineas,
      totales: totalizar(lineas),
      reglas,
      // La lista de la pestaña Aprobaciones. `null` para quien no puede aprobar
      // o cuando no se pidió: no se manda una lista de nombres y horas a quien
      // no va a hacer nada con ella.
      aprobaciones: filasAprobacion,
      puedeAprobar,
      // 🔴 LO QUE EL MÓDULO DE PRÉSTAMOS DICE QUE HAY QUE DESCONTAR ESTA
      // QUINCENA, persona por persona, con su cuota, su saldo y si ya está
      // aprobado. La contadora, textual: *«El préstamo si debe ser por
      // aprobarlo»*. Vacío en un rango libre.
      prestamos,
      // Los avisos que la pantalla tiene que poder pintar ANTES de que alguien
      // le descuente plata a nadie.
      avisos: {
        faltaMigracionConfiguracion: personasDb.faltaMigracion ? avisoMigracion() : null,
        faltaMigracionManual: manualesLeidos.faltaMigracion ? avisoMigracionPlanilla() : null,
        // Sin las columnas de la baja NADIE queda afuera —todos activos, como
        // hoy— pero se dice, porque si alguien ya dio de baja a una persona en
        // su cabeza va a esperar no verla en el cuadro.
        faltaMigracionBajas:
          !personasDb.faltaMigracion && personasDb.faltaColumnasBajas
            ? avisoMigracionBajas()
            : null,
        // Sin la columna nadie puede estar fuera de planilla —todos entran al
        // cuadro, como hoy— pero se dice: quien ya marcó a alguien como servicio
        // profesional en su cabeza va a esperar no verlo acá.
        faltaMigracionServicioProfesional:
          !personasDb.faltaMigracion && personasDb.faltaColumnaServicioProfesional
            ? avisoMigracionServicioProfesional()
            : null,
        // Sin la columna NADIE tiene base propia —los seguros salen del bruto,
        // como hoy— pero se dice: quien ya le cargó los $175 a Rodrigo en su
        // cabeza va a esperar ver $17,06 y no $39,38.
        faltaMigracionBaseSeguros:
          !personasDb.faltaMigracion && personasDb.faltaColumnaBaseSeguros
            ? avisoMigracionBaseSeguros()
            : null,
        // Cuántas personas se quedaron afuera de ESTA quincena por su fecha de
        // salida (o porque todavía no habían entrado). Sirve para que un cuadro
        // con menos gente que el mes pasado tenga una explicación a la vista.
        fueraPorBaja: fuera.size,
        marcoDespuesDeIrse,
        // Sin horario fijado se asume la salida por defecto, y con eso las
        // horas extra Y el valor de la ausencia pueden estar mal.
        sinHorario: lineas.filter((l) => !horarioDe.has(l.codigo)).length,
        salidaAsumida: SALIDA_DEFAULT,
        // Cuántas horas vale un día ausente sin horario confirmado. Va en la
        // respuesta para que la pantalla NO lo escriba a mano y no pueda
        // quedar diciendo 8,5 el día que el default cambie.
        horasAusenciaDefault: JORNADA_DIARIA_DEFAULT_MIN / 60,
        // Sábados trabajados: el cuadro no tiene columna y acá no se inventa
        // un recargo. Se avisa para que lo resuelva una persona.
        conSabado: lineas.filter((l) => l.horas.sabadoMin > 0).length,
        // 🔴 EL PERÍODO TODAVÍA NO TERMINÓ. Va arriba del cuadro: los días que
        // no pasaron dejaron de descontarse, y un número que baja sin
        // explicación se lee como un número que no cuadra.
        periodoAbierto: avisoPeriodoAbierto(q.desde, q.hasta, hoy, q.esQuincena),
        // 🔴 Los códigos que marcaron y no tienen ficha, UNA sola vez y fuera
        // del cuadro de cada empresa.
        sinFicha: codigosSinFicha,
        avisoSinFicha: textoCodigosSinFicha(codigosSinFicha),
        // 🔴 Lo que la planilla DEJÓ DE PAGAR por vacaciones marcadas. Va con
        // nombre, rango y monto: nada se descarta en silencio.
        vacacionesNoPagadas,
        avisoVacacionesNoPagadas: textoVacacionesNoPagadas(vacacionesNoPagadas),
        // 🔴 Las horas extra que este cuadro NO pagó porque nadie las aprobó.
        // Con nombre y cantidad: rechazar sí, esconder no.
        extraSinAprobar,
        avisoExtraSinAprobar: textoExtraNoAprobada(extraSinAprobar),
        // 🔴 Los descuentos de préstamo que este cuadro NO hizo porque nadie
        // los aprobó. Misma regla, mismo formato.
        prestamoSinAprobar,
        avisoPrestamoSinAprobar: textoPrestamoSinAprobar(prestamoSinAprobar),
        // 🔴 Y los préstamos CON SALDO que no están atados a nadie de la
        // planilla. Es plata que no se le está descontando a ninguna persona:
        // callarla es exactamente cómo se perdieron los $700 de LUIS ADRIAN
        // ARROYO durante 22 días (#651).
        prestamoSinAtar,
        avisoPrestamoSinAtar: textoPrestamoSinAtar(prestamoSinAtar),
        // Sin la columna del amarre NADIE queda atado —la casilla se sigue
        // escribiendo a mano, como hoy— pero se dice: quien espera que se
        // llene sola tiene que saber por qué no lo hace.
        faltaMigracionAmarrePrestamos:
          presRes.faltaColumnaAmarre ? avisoMigracionAmarrePrestamos() : null,
        // Sin la tabla no se puede aprobar y la planilla da lo de hoy hasta el
        // centavo. También se dice.
        faltaMigracionPrestamoAprobado:
          aprPresRes.faltaTabla ? avisoMigracionPrestamoAprobado() : null,
        // Sin la tabla corrida NO se exige aprobación —o sea, se paga todo,
        // como hasta hoy— pero se dice: quien ya aprobó en su cabeza va a
        // esperar que lo no aprobado no se pague.
        faltaMigracionAprobaciones: aprRes.faltaTabla ? avisoMigracionAprobaciones() : null,
          faltaMigracionAprobador: alcance.faltaTabla ? avisoMigracionAprobador() : null,
        // Sin la tabla corrida NADIE está de vacaciones —o sea, la planilla de
        // siempre— pero se dice: quien ya cargó una en su cabeza va a esperar
        // verla acá.
        faltaMigracionVacaciones: vRes.faltaTabla ? avisoMigracionVacaciones() : null,
        // Sin la tabla NADIE reparte su sueldo —cada persona sale en una sola
        // planilla, como hoy— pero se dice: quien ya dio a Julio por repartido
        // en su cabeza va a esperar verlo en las dos empresas.
        faltaMigracionReparto: repRes.faltaTabla ? avisoMigracionReparto() : null,
        // 🔴 Los repartos que el guard NO aplicó, con nombre y motivo. Rechazar
        // sí, esconder no: si esto se callara, la persona cobraría en una sola
        // planilla y nadie sabría que el reparto está mal cargado.
        repartosRechazados,
        avisoRepartoRechazado: textoRepartoRechazado(repartosRechazados),
        // 🔴 Lo que hay que saber ANTES de pagar por un rango libre.
        rangoLibre: !q.esQuincena,
        factorBase: q.factorBase,
        diasCalendario: q.diasCalendario,
        // 🔴 Cuántas horas de esta planilla se tocaron a mano. No hay forma de
        // mirar este cuadro sin que el número esté a la vista: se corrige EN EL
        // REPORTE, así que quien paga podría no haber sido quien corrigió.
        correcciones: contarCorrecciones(efectivas.porDia),
      },
      marcaciones: marcaciones.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/planilla]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Guardar los montos que se escriben a mano de UNA persona. */
export async function POST(req: NextRequest) {
  const auth = requireAsistencia(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const q = quincenaDesdeClave(String(body?.quincena ?? ""));
    if (!q) {
      return NextResponse.json({ error: "Quincena inválida." }, { status: 400 });
    }
    const codigo = String(body?.codigo ?? "").trim();
    if (!codigo) {
      return NextResponse.json({ error: "Falta la persona." }, { status: 400 });
    }

    // 🔑 La normalización la hace el módulo puro, no esta ruta: negativos a 0,
    // texto a número, basura a 0. Es la MISMA función que usa el cálculo, así
    // que lo que se guarda y lo que se suma no pueden separarse.
    const m: ManualesLinea = normalizarManuales(body as Partial<ManualesLinea>);
    const guardado = await guardarManuales(q.clave, codigo, m);

    return NextResponse.json(
      guardado
        ? { ok: true, manuales: m }
        : { ok: false, manuales: m, aviso: avisoMigracionPlanilla() },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/planilla POST]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
