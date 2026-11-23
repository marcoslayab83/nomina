/**
 * NOMINA — Motor de Cálculos Laborales (LOTTT, LSS, LRPE, LRPVH, INCES)
 * Basado en la legislación laboral venezolana vigente y criterios jurisprudenciales TSJ 2025.
 */
(function (global) {
  'use strict';

  const IVSS_RATES = {
    minimo: { label: 'Riesgo Mínimo (15,5%)', patronoSso: 0.09, patronoPie: 0.02, empleadoSso: 0.04, empleadoPie: 0.005, totalPct: 15.5 },
    medio:  { label: 'Riesgo Medio (16,5%)',  patronoSso: 0.10, patronoPie: 0.02, empleadoSso: 0.04, empleadoPie: 0.005, totalPct: 16.5 },
    maximo: { label: 'Riesgo Máximo (17,5%)', patronoSso: 0.11, patronoPie: 0.02, empleadoSso: 0.04, empleadoPie: 0.005, totalPct: 17.5 }
  };

  function toNum(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }

  function round2(v) {
    return Math.round((toNum(v) + Number.EPSILON) * 100) / 100;
  }

  function formatMoney(value, currency) {
    const cur = currency || 'Bs.';
    const formatted = toNum(value).toLocaleString('es-VE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return `${cur} ${formatted}`;
  }

  function formatNumber(value, decimals) {
    const dec = decimals === undefined ? 2 : decimals;
    return toNum(value).toLocaleString('es-VE', {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec
    });
  }

  function formatDateVE(isoDate) {
    if (!isoDate) return '—';
    const parts = String(isoDate).split('-');
    if (parts.length !== 3) return isoDate;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  /**
   * Calcula tiempo exacto de servicio entre fecha de ingreso y fecha de corte.
   */
  function calculateServiceTime(hireDateStr, cutoffDateStr) {
    if (!hireDateStr) {
      return {
        valid: false,
        years: 0,
        months: 0,
        days: 0,
        totalDays: 0,
        totalMonths: 0,
        text: 'Sin fecha de ingreso',
        nextAnniversary: null,
        hasFirstYear: false
      };
    }

    const start = new Date(hireDateStr + 'T00:00:00');
    const end = cutoffDateStr ? new Date(cutoffDateStr + 'T00:00:00') : new Date();
    end.setHours(0, 0, 0, 0);

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
      return {
        valid: false,
        years: 0,
        months: 0,
        days: 0,
        totalDays: 0,
        totalMonths: 0,
        text: 'Fecha de corte anterior al ingreso',
        nextAnniversary: null,
        hasFirstYear: false
      };
    }

    let years = end.getFullYear() - start.getFullYear();
    let months = end.getMonth() - start.getMonth();
    let days = end.getDate() - start.getDate();

    if (days < 0) {
      months -= 1;
      const prevMonthLastDay = new Date(end.getFullYear(), end.getMonth(), 0).getDate();
      days += prevMonthLastDay;
    }
    if (months < 0) {
      years -= 1;
      months += 12;
    }

    const msPerDay = 1000 * 60 * 60 * 24;
    const totalDays = Math.floor((end - start) / msPerDay);
    const totalMonths = years * 12 + months;

    const nextAnnivYear = start.getFullYear() + years + 1;
    const nextAnniv = new Date(nextAnnivYear, start.getMonth(), start.getDate());
    const nextAnnivStr = [
      nextAnniv.getFullYear(),
      String(nextAnniv.getMonth() + 1).padStart(2, '0'),
      String(nextAnniv.getDate()).padStart(2, '0')
    ].join('-');

    const parts = [];
    if (years > 0) parts.push(`${years} ${years === 1 ? 'año' : 'años'}`);
    if (months > 0) parts.push(`${months} ${months === 1 ? 'mes' : 'meses'}`);
    parts.push(`${days} ${days === 1 ? 'día' : 'días'}`);

    return {
      valid: true,
      years,
      months,
      days,
      totalDays,
      totalMonths,
      text: parts.join(', '),
      nextAnniversary: nextAnnivStr,
      hasFirstYear: years >= 1
    };
  }

  /**
   * Cuenta los lunes exactos de un mes determinado (year, month 1..12).
   */
  function countMondaysInMonth(year, month1Based) {
    const y = parseInt(year, 10);
    const m = parseInt(month1Based, 10);
    if (!y || !m || m < 1 || m > 12) return 4;
    const daysInMonth = new Date(y, m, 0).getDate();
    let mondays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      if (new Date(y, m - 1, d).getDay() === 1) {
        mondays++;
      }
    }
    return mondays;
  }

  /**
   * Calcula todos los conceptos salariales y recargos de un registro mensual (Art. 104, 113, 117, 118, 120 LOTTT).
   */
  function calculateSalaryRecord(rec) {
    const r = rec || {};
    const sueldoBase = toNum(r.sueldoBase);
    const comisionesHabituales = toNum(r.comisionesHabituales);
    const primasFijas = toNum(r.primasFijas);
    const bonosRegulares = toNum(r.bonosRegulares);
    const viaticosSinRendicion = toNum(r.viaticosSinRendicion); // Sentencia N° 355 TSJ 13/08/2025

    const salarioNormalMensual =
      sueldoBase + comisionesHabituales + primasFijas + bonosRegulares + viaticosSinRendicion;

    const salarioDiario = salarioNormalMensual / 30; // Art. 113 LOTTT
    const salarioSemanal = salarioDiario * 7;

    // Recargos unitarios (LOTTT)
    const valorBonoNocturnoJornada = salarioDiario * 0.30; // Art. 117
    const valorHoraExtraDiurna = (salarioDiario / 8) * 1.50; // Art. 118
    const valorHoraExtraNocturna = ((salarioDiario / 8) * 1.50) * 1.30; // Art. 117
    const valorDiaFeriado = salarioDiario * 1.50; // Art. 120

    const jornadasNocturnas = toNum(r.jornadasNocturnas);
    const horasExtrasDiurnas = toNum(r.horasExtrasDiurnas);
    const horasExtrasNocturnas = toNum(r.horasExtrasNocturnas);
    const diasFeriados = toNum(r.diasFeriados);

    const montoBonoNocturno = jornadasNocturnas * valorBonoNocturnoJornada;
    const montoHorasExtrasDiurnas = horasExtrasDiurnas * valorHoraExtraDiurna;
    const montoHorasExtrasNocturnas = horasExtrasNocturnas * valorHoraExtraNocturna;
    const montoDiasFeriados = diasFeriados * valorDiaFeriado;

    const totalRecargos =
      montoBonoNocturno + montoHorasExtrasDiurnas + montoHorasExtrasNocturnas + montoDiasFeriados;

    const totalDevengadoSalarial = salarioNormalMensual + totalRecargos;

    // Beneficios No Salariales (Art. 105 LOTTT y Sentencia N° 99 TSJ 31/03/2025)
    const cestaticket = toNum(r.cestaticket);
    const ayudaTransporte = toNum(r.ayudaTransporte);
    const becasEducativas = toNum(r.becasEducativas);
    const herramientasUniformes = toNum(r.herramientasUniformes);
    const indemnizaciones = toNum(r.indemnizaciones);

    const totalNoSalarial =
      cestaticket + ayudaTransporte + becasEducativas + herramientasUniformes + indemnizaciones;

    // Deducciones voluntarias
    const prestamos = toNum(r.prestamos);
    const polizas = toNum(r.polizas);
    const ahorros = toNum(r.ahorros);
    const otrasDeducciones = toNum(r.otrasDeducciones);
    const totalDeduccionesVoluntarias = prestamos + polizas + ahorros + otrasDeducciones;

    return {
      sueldoBase,
      comisionesHabituales,
      primasFijas,
      bonosRegulares,
      viaticosSinRendicion,
      salarioNormalMensual,
      salarioDiario,
      salarioSemanal,
      valorBonoNocturnoJornada,
      valorHoraExtraDiurna,
      valorHoraExtraNocturna,
      valorDiaFeriado,
      jornadasNocturnas,
      horasExtrasDiurnas,
      horasExtrasNocturnas,
      diasFeriados,
      montoBonoNocturno,
      montoHorasExtrasDiurnas,
      montoHorasExtrasNocturnas,
      montoDiasFeriados,
      totalRecargos,
      totalDevengadoSalarial,
      cestaticket,
      ayudaTransporte,
      becasEducativas,
      herramientasUniformes,
      indemnizaciones,
      totalNoSalarial,
      prestamos,
      polizas,
      ahorros,
      otrasDeducciones,
      totalDeduccionesVoluntarias,
      totalBrutoConNoSalarial: totalDevengadoSalarial + totalNoSalarial
    };
  }

  /**
   * Determina el salario normal base para vacaciones según Art. 121 LOTTT:
   * - Salario fijo: salario normal devengado en el mes efectivo de labores anterior al disfrute.
   * - Salario variable: promedio de los últimos 3 meses anteriores al disfrute.
   */
  function getVacationBaseSalary(worker) {
    const rawHistory = Array.isArray(worker.sueldosHistorial) ? worker.sueldosHistorial : [];
    const byPeriod = new Map();
    rawHistory.forEach((rec) => {
      if (rec && rec.periodo) byPeriod.set(rec.periodo, rec);
    });
    if (worker.salarioActual && worker.salarioActual.periodo) {
      byPeriod.set(worker.salarioActual.periodo, worker.salarioActual);
    }

    const history = Array.from(byPeriod.values()).sort((a, b) =>
      String(b.periodo || '').localeCompare(String(a.periodo || ''))
    );

    const isVariable = worker.tipoSalarioVacaciones === 'variable';

    if (history.length === 0) {
      const current = calculateSalaryRecord(worker.salarioActual);
      return {
        mensual: current.salarioNormalMensual,
        diario: current.salarioDiario,
        criterio: isVariable
          ? 'Salario variable (sin historial previo, usando salario normal actual)'
          : 'Salario normal del mes efectivo actual (Art. 121 LOTTT)',
        mesesUsados: 1
      };
    }

    if (isVariable) {
      const last3 = history.slice(0, 3);
      const sum = last3.reduce((acc, rec) => acc + calculateSalaryRecord(rec).salarioNormalMensual, 0);
      const avg = sum / last3.length;
      return {
        mensual: avg,
        diario: avg / 30,
        criterio: `Promedio salario normal últimos ${last3.length} mes(es) (Salario Variable, Art. 121 LOTTT)`,
        mesesUsados: last3.length
      };
    }

    const latest = calculateSalaryRecord(history[0]);
    return {
      mensual: latest.salarioNormalMensual,
      diario: latest.salarioDiario,
      criterio: `Salario normal del último mes efectivo (${history[0].periodo}) (Art. 121 LOTTT)`,
      mesesUsados: 1
    };
  }

  /**
   * Días legales de vacaciones y bono vacacional para un año de servicio específico (1..N).
   * Art. 190 y 192 LOTTT: 15 días al 1er año + 1 día adicional por cada año consecutivo (máx. 30).
   */
  function getVacationDaysForYear(yearOfService) {
    const y = Math.max(0, Math.floor(toNum(yearOfService)));
    if (y < 1) {
      return { base: 0, adicionales: 0, total: 0 };
    }
    const base = 15;
    const adicionales = Math.min(15, y - 1);
    return { base, adicionales, total: base + adicionales };
  }

  /**
   * Calcula el panorama completo de vacaciones y bono vacacional (Art. 190-196 y Art. 121 LOTTT).
   */
  function calculateVacations(worker, serviceTime) {
    const baseSal = getVacationBaseSalary(worker);
    const years = serviceTime.valid ? serviceTime.years : 0;
    const months = serviceTime.valid ? serviceTime.months : 0;

    // Año de servicio actual (derecho adquirido al cumplir años completos)
    const daysCalc = getVacationDaysForYear(years);
    const montoVacacionesBase = baseSal.diario * daysCalc.base;
    const montoVacacionesAdicionales = baseSal.diario * daysCalc.adicionales;
    const montoVacacionesTotal = baseSal.diario * daysCalc.total;

    const montoBonoBase = baseSal.diario * daysCalc.base;
    const montoBonoAdicional = baseSal.diario * daysCalc.adicionales;
    const montoBonoTotal = baseSal.diario * daysCalc.total;

    const totalPeriodoActual = montoVacacionesTotal + montoBonoTotal;

    // Fraccionadas del año en curso (por meses completos transcurridos desde el último aniversario)
    const nextYearDays = getVacationDaysForYear(years + 1).total;
    const diasFraccionadosVac = months > 0 ? (nextYearDays / 12) * months : 0;
    const diasFraccionadosBono = months > 0 ? (nextYearDays / 12) * months : 0;
    const montoFraccionadoVac = baseSal.diario * diasFraccionadosVac;
    const montoFraccionadoBono = baseSal.diario * diasFraccionadosBono;
    const totalFraccionado = montoFraccionadoVac + montoFraccionadoBono;

    // Resumen del historial de vacaciones registradas
    const historial = Array.isArray(worker.vacacionesHistorial) ? worker.vacacionesHistorial : [];
    let periodosDisfrutados = 0;
    let periodosCausados = 0;
    let periodosNoDisfrutados = 0;
    let totalDiasDisfrutados = 0;
    let totalPagadoHistorico = 0;
    let totalPasivoPendiente = 0;

    const historialEnriquecido = historial.map((item) => {
      const salDiarioAplicado = toNum(item.salarioDiarioAplicado) > 0
        ? toNum(item.salarioDiarioAplicado)
        : baseSal.diario;
      const diasVac = toNum(item.diasCorrespondientes);
      const diasBono = toNum(item.diasBono !== undefined ? item.diasBono : item.diasCorrespondientes);
      const montoVac = item.montoVacaciones !== undefined && item.montoVacaciones !== '' && item.montoVacaciones !== null
        ? toNum(item.montoVacaciones)
        : salDiarioAplicado * diasVac;
      const montoBono = item.montoBono !== undefined && item.montoBono !== '' && item.montoBono !== null
        ? toNum(item.montoBono)
        : salDiarioAplicado * diasBono;
      const totalItem = montoVac + montoBono;

      if (item.estatus === 'disfrutada') {
        periodosDisfrutados++;
        totalDiasDisfrutados += toNum(item.diasDisfrutados || diasVac);
        totalPagadoHistorico += totalItem;
      } else if (item.estatus === 'no_disfrutada') {
        periodosNoDisfrutados++;
        totalPasivoPendiente += totalItem;
      } else {
        periodosCausados++;
        totalPasivoPendiente += totalItem;
      }

      return {
        ...item,
        salDiarioAplicado,
        diasVac,
        diasBono,
        montoVac,
        montoBono,
        totalItem
      };
    });

    return {
      baseSal,
      yearsCompleted: years,
      monthsInCurrentYear: months,
      diasBase: daysCalc.base,
      diasAdicionales: daysCalc.adicionales,
      totalDiasVacaciones: daysCalc.total,
      totalDiasBono: daysCalc.total,
      montoVacacionesBase,
      montoVacacionesAdicionales,
      montoVacacionesTotal,
      montoBonoBase,
      montoBonoAdicional,
      montoBonoTotal,
      totalPeriodoActual,
      diasFraccionadosVac,
      diasFraccionadosBono,
      montoFraccionadoVac,
      montoFraccionadoBono,
      totalFraccionado,
      historialEnriquecido,
      periodosDisfrutados,
      periodosCausados,
      periodosNoDisfrutados,
      totalDiasDisfrutados,
      totalPagadoHistorico,
      totalPasivoPendiente
    };
  }

  /**
   * Calcula Utilidades / Participación en los Beneficios (Art. 131-140 LOTTT) + Retención INCES 0,5% (Art. 50).
   */
  function calculateUtilities(worker, salaryData) {
    const u = worker.utilidadesConfig || {};
    const modo = u.modo || 'dias'; // 'dias' | 'beneficios_liquidos'
    const mesesLaborados = Math.min(12, Math.max(1, toNum(u.mesesLaborados || 12)));
    const salarioDiario = salaryData.salarioDiario;
    const salarioMensual = salaryData.salarioNormalMensual;
    const anticipoDiciembre = toNum(u.anticipoDiciembre);

    // Días por convenio o mínimo legal (30 a 120 días; sin fines de lucro = 30 días Art. 140)
    const diasConvenidosRaw = worker.entidadSinFinesLucro ? 30 : Math.min(120, Math.max(30, toNum(u.diasConvenidos || 30)));
    const factorProporcional = mesesLaborados / 12;

    const minLegalDias = 30 * factorProporcional;
    const maxLegalDias = 120 * factorProporcional;
    const minLegalMonto = salarioDiario * minLegalDias;
    const maxLegalMonto = salarioDiario * maxLegalDias;

    const diasConvenidosProp = diasConvenidosRaw * factorProporcional;
    const montoPorConvenio = salarioDiario * diasConvenidosProp;

    let utilidadLiquidaEmpresa = toNum(u.utilidadLiquidaEmpresa);
    let quincePorCientoBeneficios = utilidadLiquidaEmpresa * 0.15;
    let totalSalariosEmpresa = toNum(u.totalSalariosEmpresa);
    let salarioAnualTrabajador = toNum(u.salarioAnualTrabajador);

    // Si no especificaron salario anual del trabajador, estimar con salario mensual * meses laborados
    if (salarioAnualTrabajador <= 0) {
      salarioAnualTrabajador = salarioMensual * mesesLaborados;
    }
    if (totalSalariosEmpresa <= 0) {
      totalSalariosEmpresa = salarioAnualTrabajador;
    }

    let participacionBruta15 = 0;
    let factorDistribucion = 0;
    if (totalSalariosEmpresa > 0 && quincePorCientoBeneficios > 0) {
      factorDistribucion = quincePorCientoBeneficios / totalSalariosEmpresa;
      participacionBruta15 = factorDistribucion * salarioAnualTrabajador;
    }

    let montoBruto = 0;
    let diasEquivalentes = 0;
    let criterioAplicado = '';

    if (worker.entidadSinFinesLucro) {
      montoBruto = minLegalMonto;
      diasEquivalentes = minLegalDias;
      criterioAplicado = 'Entidad sin fines de lucro: bonificación obligatoria de 30 días (Art. 140 LOTTT)';
    } else if (modo === 'beneficios_liquidos') {
      // Aplicar pisos y techos legales (Art. 131) y prevalencia de utilidades convenidas (Art. 139)
      const acotadoLegal = Math.min(maxLegalMonto, Math.max(minLegalMonto, participacionBruta15));
      if (montoPorConvenio > acotadoLegal) {
        montoBruto = montoPorConvenio;
        criterioAplicado = `Utilidades convenidas (${diasConvenidosRaw} días) prevalecen por ser mayores al 15% legal (Art. 139 LOTTT)`;
      } else {
        montoBruto = acotadoLegal;
        if (participacionBruta15 < minLegalMonto) {
          criterioAplicado = '15% de beneficios líquidos inferior al mínimo legal: aplica piso obligatorio de 30 días (Art. 131-132 LOTTT)';
        } else if (participacionBruta15 > maxLegalMonto) {
          criterioAplicado = '15% de beneficios líquidos supera tope legal: aplica máximo de 4 meses / 120 días (Art. 131 LOTTT)';
        } else {
          criterioAplicado = 'Distribución directa del 15% de beneficios líquidos según declaración ISLR (Art. 131, 133 y 136 LOTTT)';
        }
      }
      diasEquivalentes = salarioDiario > 0 ? montoBruto / salarioDiario : 0;
    } else {
      montoBruto = montoPorConvenio;
      diasEquivalentes = diasConvenidosProp;
      criterioAplicado = diasConvenidosRaw === 30
        ? 'Mínimo legal obligatorio de 30 días de salario normal (Art. 131 y 132 LOTTT)'
        : `Utilidades pactadas por convenio (${diasConvenidosRaw} días de salario normal, Art. 131 y 139 LOTTT)`;
    }

    // Referencia tabla comparativa (como diapositiva p. 33)
    const comparativa = {
      dias30: salarioDiario * 30 * factorProporcional,
      dias60: salarioDiario * 60 * factorProporcional,
      dias90: salarioDiario * 90 * factorProporcional,
      dias120: salarioDiario * 120 * factorProporcional
    };

    // Diferencia por pagar dentro de los 2 meses al cierre del ejercicio (Art. 137 LOTTT)
    const diferenciaPorPagar = Math.max(0, montoBruto - anticipoDiciembre);

    // Retención INCES 0,5% al trabajador (Art. 50 Ley INCES, solo entidades >= 5 trabajadores)
    const retencionInces = worker.aplicaInces !== false ? montoBruto * 0.005 : 0;
    const montoNeto = montoBruto - retencionInces;

    return {
      modo,
      mesesLaborados,
      diasConvenidos: diasConvenidosRaw,
      diasEquivalentes,
      utilidadLiquidaEmpresa,
      quincePorCientoBeneficios,
      totalSalariosEmpresa,
      salarioAnualTrabajador,
      factorDistribucion,
      participacionBruta15,
      minLegalMonto,
      maxLegalMonto,
      montoBruto,
      anticipoDiciembre,
      diferenciaPorPagar,
      retencionInces,
      montoNeto,
      comparativa,
      criterioAplicado
    };
  }

  /**
   * Calcula Salario Integral (Salario Normal + Beneficios regularizados + Alícuotas de Bono Vacacional y Utilidades).
   */
  function calculateIntegralSalary(worker, salaryData, vacationsData, utilitiesData) {
    const beneficiosRegularizados = toNum(worker.beneficiosRegularizados);
    const diasBonoParaAlicuota = Math.max(15, vacationsData.totalDiasBono || 15);
    const diasUtilidadesParaAlicuota = Math.max(30, utilitiesData.diasConvenidos || 30);

    const salarioNormalDiario = salaryData.salarioDiario;
    const alicuotaBonoVacacionalDiaria = (salarioNormalDiario * diasBonoParaAlicuota) / 360;
    const alicuotaUtilidadesDiaria = (salarioNormalDiario * diasUtilidadesParaAlicuota) / 360;
    const beneficiosRegDiario = beneficiosRegularizados / 30;

    const salarioIntegralDiario =
      salarioNormalDiario + beneficiosRegDiario + alicuotaBonoVacacionalDiaria + alicuotaUtilidadesDiaria;
    const salarioIntegralMensual = salarioIntegralDiario * 30;

    return {
      beneficiosRegularizados,
      diasBonoParaAlicuota,
      diasUtilidadesParaAlicuota,
      salarioNormalDiario,
      alicuotaBonoVacacionalDiaria,
      alicuotaUtilidadesDiaria,
      beneficiosRegDiario,
      salarioIntegralDiario,
      salarioIntegralMensual
    };
  }

  /**
   * Calcula Deducciones Legales al Empleado y Aportes Patronales (IVSS, PIE, FAOV, INCES).
   */
  function calculateParafiscales(worker, salaryData, integralData, utilitiesData) {
    const p = worker.parafiscalesConfig || {};
    const riesgoKey = IVSS_RATES[worker.riesgoIvss] ? worker.riesgoIvss : 'minimo';
    const rate = IVSS_RATES[riesgoKey];

    // Mes / Año y N° de lunes
    const periodo = p.periodoMes || new Date().toISOString().slice(0, 7);
    const [anioStr, mesStr] = periodo.split('-');
    const lunesAuto = countMondaysInMonth(anioStr, mesStr);
    const numLunes = p.usarLunesManual && toNum(p.lunesManual) > 0 ? Math.min(5, Math.max(4, Math.floor(toNum(p.lunesManual)))) : lunesAuto;

    // Base IVSS (opción de tope de 5 salarios mínimos si el usuario la activa)
    let baseIvss = salaryData.salarioNormalMensual;
    const aplicarTopeIvss = Boolean(p.aplicarTopeIvss);
    const topeIvssMonto = toNum(p.topeIvssMonto);
    if (aplicarTopeIvss && topeIvssMonto > 0 && baseIvss > topeIvssMonto) {
      baseIvss = topeIvssMonto;
    }

    const salarioSemanalIvss = (baseIvss * 12) / 52;

    const ssoEmpleado = salarioSemanalIvss * rate.empleadoSso * numLunes;
    const pieEmpleado = salarioSemanalIvss * rate.empleadoPie * numLunes;
    const ssoPatrono = salarioSemanalIvss * rate.patronoSso * numLunes;
    const piePatrono = salarioSemanalIvss * rate.patronoPie * numLunes;

    // FAOV (Ley del Régimen Prestacional de Vivienda y Hábitat Art. 33: 3% salario integral -> 1% trabajador / 2% empresa)
    const faovBaseModo = p.faovBaseModo || 'integral'; // 'integral' | 'normal'
    const baseFaov = faovBaseModo === 'normal'
      ? salaryData.salarioNormalMensual
      : integralData.salarioIntegralMensual;
    const faovEmpleado = baseFaov * 0.01;
    const faovPatrono = baseFaov * 0.02;

    // INCES Patronal Trimestral (Art. 49 Ley INCES: 2% sobre remuneraciones trimestrales)
    const aplicaInces = worker.aplicaInces !== false;
    const incesBaseSueldos = p.incesUsarPersonalizado
      ? toNum(p.incesSueldosTrimestre)
      : salaryData.salarioNormalMensual * 3;
    const incesBonificaciones = toNum(p.incesBonificacionesTrimestre);
    const incesVacaciones = toNum(p.incesVacacionesTrimestre);
    const incesOtras = toNum(p.incesOtrasTrimestre);
    const totalBaseIncesTrimestre = incesBaseSueldos + incesBonificaciones + incesVacaciones + incesOtras;
    const incesPatronoTrimestral = aplicaInces ? totalBaseIncesTrimestre * 0.02 : 0;
    const incesPatronoMensualRef = incesPatronoTrimestral / 3;

    // Totales mensuales
    const totalDeduccionesLegalesMes = ssoEmpleado + pieEmpleado + faovEmpleado;
    const totalDeduccionesMes = totalDeduccionesLegalesMes + salaryData.totalDeduccionesVoluntarias;
    const netoMensualSalarial = salaryData.totalDevengadoSalarial - totalDeduccionesMes;
    const netoMensualConNoSalarial = netoMensualSalarial + salaryData.totalNoSalarial;

    const totalAportesPatronalesMes = ssoPatrono + piePatrono + faovPatrono + incesPatronoMensualRef;
    const costoTotalMensualPatrono =
      salaryData.totalDevengadoSalarial + salaryData.totalNoSalarial + totalAportesPatronalesMes;

    return {
      riesgoKey,
      rate,
      periodo,
      lunesAuto,
      numLunes,
      baseIvss,
      aplicarTopeIvss,
      salarioSemanalIvss,
      ssoEmpleado,
      pieEmpleado,
      totalIvssEmpleado: ssoEmpleado + pieEmpleado,
      ssoPatrono,
      piePatrono,
      totalIvssPatrono: ssoPatrono + piePatrono,
      faovBaseModo,
      baseFaov,
      faovEmpleado,
      faovPatrono,
      aplicaInces,
      incesBaseSueldos,
      incesBonificaciones,
      incesVacaciones,
      incesOtras,
      totalBaseIncesTrimestre,
      incesPatronoTrimestral,
      incesPatronoMensualRef,
      incesEmpleadoUtilidades: utilitiesData.retencionInces,
      totalDeduccionesLegalesMes,
      totalDeduccionesVoluntariasMes: salaryData.totalDeduccionesVoluntarias,
      totalDeduccionesMes,
      netoMensualSalarial,
      netoMensualConNoSalarial,
      totalAportesPatronalesMes,
      costoTotalMensualPatrono
    };
  }

  /**
   * Ejecuta el cálculo maestro completo del expediente del trabajador.
   */
  function computeWorkerBenefits(worker) {
    const serviceTime = calculateServiceTime(worker.fechaIngreso, worker.fechaCorte);
    const salaryData = calculateSalaryRecord(worker.salarioActual);
    const vacationsData = calculateVacations(worker, serviceTime);
    const utilitiesData = calculateUtilities(worker, salaryData);
    const integralData = calculateIntegralSalary(worker, salaryData, vacationsData, utilitiesData);
    const parafiscalesData = calculateParafiscales(worker, salaryData, integralData, utilitiesData);

    // Historial de sueldos devengados enriquecido
    const historialSueldos = (Array.isArray(worker.sueldosHistorial) ? worker.sueldosHistorial : [])
      .map((rec) => ({
        ...rec,
        calc: calculateSalaryRecord(rec)
      }))
      .sort((a, b) => String(b.periodo || '').localeCompare(String(a.periodo || '')));

    const totalHistoricoDevengado = historialSueldos.reduce(
      (acc, item) => acc + item.calc.totalDevengadoSalarial,
      0
    );

    const totalHistoricoNoSalarial = historialSueldos.reduce(
      (acc, item) => acc + item.calc.totalNoSalarial,
      0
    );

    // Resumen anual estimado de beneficios
    const totalBeneficiosAnualesEstimados =
      vacationsData.totalPeriodoActual + utilitiesData.montoNeto;

    return {
      serviceTime,
      salaryData,
      vacationsData,
      utilitiesData,
      integralData,
      parafiscalesData,
      historialSueldos,
      totalHistoricoDevengado,
      totalHistoricoNoSalarial,
      totalBeneficiosAnualesEstimados
    };
  }

  /**
   * Calcula un Recibo de Pago periódico: 'mensual' (30d), 'quincenal' (15d) o 'semanal' (7d).
   * Conforme al Art. 106, 113, 117, 118, 120 LOTTT + LSS Art. 67 + LRPE Art. 46 + LRPVH Art. 33.
   */
  function calculatePeriodicReceipt(worker, calc, tipoPeriodo, opts) {
    const o = opts || {};
    const s = calc.salaryData;
    const integ = calc.integralData;
    const p = calc.parafiscalesData;

    let diasPeriodo = 30;
    let factor = 1;
    let lunesDefault = p.numLunes;
    let tituloPeriodo = 'MENSUAL';

    if (tipoPeriodo === 'quincenal') {
      diasPeriodo = 15;
      factor = 15 / 30; // 0.5
      lunesDefault = o.quincenaNum === '2' ? Math.max(2, p.numLunes - 2) : 2;
      tituloPeriodo = o.quincenaNum === '2' ? '2.ª QUINCENA' : '1.ª QUINCENA';
    } else if (tipoPeriodo === 'semanal') {
      diasPeriodo = 7;
      factor = 7 / 30;
      lunesDefault = 1;
      tituloPeriodo = 'SEMANAL';
    }

    const numLunes = o.lunesRecibo !== undefined && o.lunesRecibo !== '' && toNum(o.lunesRecibo) >= 0
      ? Math.floor(toNum(o.lunesRecibo))
      : lunesDefault;

    // Asignaciones salariales del período
    const sueldoBase = s.sueldoBase * factor;
    const comisionesHabituales = s.comisionesHabituales * factor;
    const primasFijas = s.primasFijas * factor;
    const bonosRegulares = s.bonosRegulares * factor;
    const viaticosSinRendicion = s.viaticosSinRendicion * factor;
    const salarioNormalPeriodo =
      sueldoBase + comisionesHabituales + primasFijas + bonosRegulares + viaticosSinRendicion;

    // Recargos: si el usuario elige prorratear o aplicar tal cual los del período activo
    const recargosFactor = o.prorratearRecargos ? factor : 1;
    const montoBonoNocturno = s.montoBonoNocturno * recargosFactor;
    const montoHorasExtrasDiurnas = s.montoHorasExtrasDiurnas * recargosFactor;
    const montoHorasExtrasNocturnas = s.montoHorasExtrasNocturnas * recargosFactor;
    const montoDiasFeriados = s.montoDiasFeriados * recargosFactor;
    const totalRecargos =
      montoBonoNocturno + montoHorasExtrasDiurnas + montoHorasExtrasNocturnas + montoDiasFeriados;

    const totalSalarialPeriodo = salarioNormalPeriodo + totalRecargos;

    // Beneficios No Salariales del período
    const incluirNoSalarial = o.incluirNoSalarial !== false;
    const cestaticket = incluirNoSalarial ? s.cestaticket * factor : 0;
    const ayudaTransporte = incluirNoSalarial ? s.ayudaTransporte * factor : 0;
    const becasEducativas = incluirNoSalarial ? s.becasEducativas * factor : 0;
    const herramientasUniformes = incluirNoSalarial ? s.herramientasUniformes * factor : 0;
    const indemnizaciones = incluirNoSalarial ? s.indemnizaciones * factor : 0;
    const totalNoSalarialPeriodo =
      cestaticket + ayudaTransporte + becasEducativas + herramientasUniformes + indemnizaciones;

    // Deducciones legales del período
    const ssoEmpleado = p.salarioSemanalIvss * p.rate.empleadoSso * numLunes;
    const pieEmpleado = p.salarioSemanalIvss * p.rate.empleadoPie * numLunes;
    const ssoPatrono = p.salarioSemanalIvss * p.rate.patronoSso * numLunes;
    const piePatrono = p.salarioSemanalIvss * p.rate.patronoPie * numLunes;

    const baseFaovPeriodo = (p.faovBaseModo === 'normal' ? s.salarioNormalMensual : integ.salarioIntegralMensual) * factor;
    const faovEmpleado = baseFaovPeriodo * 0.01;
    const faovPatrono = baseFaovPeriodo * 0.02;

    const totalDeduccionesLegales = ssoEmpleado + pieEmpleado + faovEmpleado;

    // Deducciones voluntarias
    const prestamos = s.prestamos * factor;
    const polizas = s.polizas * factor;
    const ahorros = s.ahorros * factor;
    const otrasDeducciones = s.otrasDeducciones * factor;
    const totalDeduccionesVoluntarias = prestamos + polizas + ahorros + otrasDeducciones;

    const totalDeducciones = totalDeduccionesLegales + totalDeduccionesVoluntarias;
    const totalAsignaciones = totalSalarialPeriodo + totalNoSalarialPeriodo;
    const netoAPagar = totalAsignaciones - totalDeducciones;
    const totalAportesPatronales = ssoPatrono + piePatrono + faovPatrono;

    return {
      tipoPeriodo,
      tituloPeriodo,
      diasPeriodo,
      factor,
      numLunes,
      sueldoBase,
      comisionesHabituales,
      primasFijas,
      bonosRegulares,
      viaticosSinRendicion,
      salarioNormalPeriodo,
      montoBonoNocturno,
      montoHorasExtrasDiurnas,
      montoHorasExtrasNocturnas,
      montoDiasFeriados,
      totalRecargos,
      totalSalarialPeriodo,
      cestaticket,
      ayudaTransporte,
      becasEducativas,
      herramientasUniformes,
      indemnizaciones,
      totalNoSalarialPeriodo,
      totalAsignaciones,
      ssoEmpleado,
      pieEmpleado,
      faovEmpleado,
      baseFaovPeriodo,
      totalDeduccionesLegales,
      prestamos,
      polizas,
      ahorros,
      otrasDeducciones,
      totalDeduccionesVoluntarias,
      totalDeducciones,
      netoAPagar,
      ssoPatrono,
      piePatrono,
      faovPatrono,
      totalAportesPatronales
    };
  }

  /**
   * Calcula Prestaciones Sociales (Art. 142 LOTTT), Liquidación Parcial (Art. 144)
   * y Liquidación Definitiva / Finiquito (Art. 142, 92, 190-196, 131-140 LOTTT).
   */
  function calculatePrestacionesAndLiquidacion(worker, calc, cfg) {
    const o = cfg || {};
    const fechaCorteLiq = o.fechaEgreso || worker.fechaCorte;
    const st = calculateServiceTime(worker.fechaIngreso, fechaCorteLiq);

    const salIntegralDiario = calc.integralData.salarioIntegralDiario;
    const salNormalDiario = calc.salaryData.salarioDiario;

    // 1. Garantía de Prestaciones Sociales (Art. 142 literal a y f)
    const totalMeses = st.valid ? st.totalMonths : 0;
    const trimestresCompletos = Math.floor(totalMeses / 3);
    let diasGarantiaTrimestral = 0;
    let detalleGarantiaA = '';
    if (totalMeses < 3 && st.valid && st.totalDays > 0) {
      // Art. 142 lit. f: menos de 3 meses -> 5 días por cada mes trabajado o fracción
      const mesesOFraccion = st.months + (st.days > 0 ? 1 : 0);
      diasGarantiaTrimestral = mesesOFraccion * 5;
      detalleGarantiaA = `${mesesOFraccion} mes(es)/fracción × 5 días (Art. 142 lit. f)`;
    } else {
      diasGarantiaTrimestral = trimestresCompletos * 15;
      detalleGarantiaA = `${trimestresCompletos} trimestre(s) completo(s) × 15 días (Art. 142 lit. a)`;
    }
    const montoGarantiaTrimestral = diasGarantiaTrimestral * salIntegralDiario;

    // 2. Días adicionales acumulativos después del primer año (Art. 142 literal b: 2 días/año, tope 30 días/año)
    let diasAdicionalesGarantia = 0;
    if (st.valid && st.years >= 2) {
      for (let y = 2; y <= st.years; y++) {
        diasAdicionalesGarantia += Math.min(30, (y - 1) * 2);
      }
    }
    const montoDiasAdicionalesGarantia = diasAdicionalesGarantia * salIntegralDiario;
    const totalGarantiaAcumulada = montoGarantiaTrimestral + montoDiasAdicionalesGarantia;

    // 3. Cálculo Retroactivo (Art. 142 literal c: 30 días por año o fracción superior a 6 meses)
    const fraccionMayor6Meses = st.valid && (st.months > 6 || (st.months === 6 && st.days > 0));
    const aniosRetroactivos = st.valid ? st.years + (fraccionMayor6Meses ? 1 : 0) : 0;
    const diasRetroactivo = aniosRetroactivos * 30;
    const montoRetroactivo = diasRetroactivo * salIntegralDiario;

    // 4. Comparación favorable al trabajador (Art. 142 literal d)
    const aplicaRetroactivo = montoRetroactivo > totalGarantiaAcumulada;
    const prestacionesBrutas = Math.max(totalGarantiaAcumulada, montoRetroactivo);
    const metodoAplicado = aplicaRetroactivo
      ? `Cálculo Retroactivo Art. 142 lit. c (${aniosRetroactivos} año(s) × 30 días = ${diasRetroactivo} días)`
      : `Garantía Acumulada Art. 142 lit. a y b (${diasGarantiaTrimestral + diasAdicionalesGarantia} días)`;

    const anticiposPrevios = toNum(o.anticiposPrevios);
    const interesesPrestaciones = toNum(o.interesesPrestaciones);
    const saldoNetoPrestaciones = Math.max(0, prestacionesBrutas - anticiposPrevios) + interesesPrestaciones;

    // --- Liquidación Parcial (Art. 144 LOTTT: hasta 75% del saldo de garantía) ---
    const saldoGarantiaDisponible = Math.max(0, totalGarantiaAcumulada - anticiposPrevios);
    const maximoAnticipo75 = saldoGarantiaDisponible * 0.75;
    const porcentajeSolicitado = Math.min(75, Math.max(0, toNum(o.porcentajeAnticipo !== undefined ? o.porcentajeAnticipo : 75)));
    const montoAnticipoParcial = o.montoAnticipoManual > 0
      ? Math.min(maximoAnticipo75, toNum(o.montoAnticipoManual))
      : saldoGarantiaDisponible * (porcentajeSolicitado / 100);

    // --- Componentes adicionales de Liquidación ---
    // Vacaciones vencidas no disfrutadas + fraccionadas (Art. 196)
    const vacCalc = calculateVacations(worker, st);
    const incluirVacaciones = o.incluirVacaciones !== false;
    const montoVacVencidas = incluirVacaciones ? vacCalc.totalPasivoPendiente : 0;
    const montoVacFraccionadas = incluirVacaciones ? vacCalc.totalFraccionado : 0;

    // Utilidades pendientes / fraccionadas
    const incluirUtilidades = o.incluirUtilidades !== false;
    const montoUtilidadesPendientes = incluirUtilidades
      ? Math.max(0, calc.utilitiesData.montoBruto - calc.utilitiesData.anticipoDiciembre)
      : 0;
    const retencionIncesUtilidades = incluirUtilidades && worker.aplicaInces !== false
      ? montoUtilidadesPendientes * 0.005
      : 0;

    // Días de salario pendientes del último mes
    const diasSalarioPendientes = Math.max(0, toNum(o.diasSalarioPendientes));
    const montoSalarioPendiente = diasSalarioPendientes * salNormalDiario;

    // Indemnización Art. 92 LOTTT (despido injustificado o retiro justificado)
    const esDespidoInjustificado = o.motivoEgreso === 'despido_injustificado';
    const indemnizacionArt92 = esDespidoInjustificado ? prestacionesBrutas : 0;

    // Deducciones finales manuales (préstamos / pendientes)
    const deduccionesFinales = toNum(o.deduccionesFinales);

    // Totales finales
    const totalLiquidacionParcial =
      montoAnticipoParcial +
      (o.incluirVacEnParcial ? (montoVacVencidas + montoVacFraccionadas) : 0) +
      interesesPrestaciones;

    const totalAsignacionesDefinitiva =
      saldoNetoPrestaciones +
      indemnizacionArt92 +
      montoVacVencidas +
      montoVacFraccionadas +
      montoUtilidadesPendientes +
      montoSalarioPendiente;

    const totalDeduccionesDefinitiva = retencionIncesUtilidades + deduccionesFinales;
    const totalNetoDefinitiva = Math.max(0, totalAsignacionesDefinitiva - totalDeduccionesDefinitiva);

    return {
      serviceTime: st,
      fechaCorteLiq,
      salIntegralDiario,
      salNormalDiario,
      trimestresCompletos,
      diasGarantiaTrimestral,
      detalleGarantiaA,
      montoGarantiaTrimestral,
      diasAdicionalesGarantia,
      montoDiasAdicionalesGarantia,
      totalGarantiaAcumulada,
      aniosRetroactivos,
      fraccionMayor6Meses,
      diasRetroactivo,
      montoRetroactivo,
      aplicaRetroactivo,
      prestacionesBrutas,
      metodoAplicado,
      anticiposPrevios,
      interesesPrestaciones,
      saldoNetoPrestaciones,
      saldoGarantiaDisponible,
      maximoAnticipo75,
      porcentajeSolicitado,
      montoAnticipoParcial,
      vacCalc,
      montoVacVencidas,
      montoVacFraccionadas,
      montoUtilidadesPendientes,
      retencionIncesUtilidades,
      diasSalarioPendientes,
      montoSalarioPendiente,
      esDespidoInjustificado,
      indemnizacionArt92,
      deduccionesFinales,
      totalLiquidacionParcial,
      totalAsignacionesDefinitiva,
      totalDeduccionesDefinitiva,
      totalNetoDefinitiva
    };
  }

  global.NominaCalc = {
    IVSS_RATES,
    toNum,
    round2,
    formatMoney,
    formatNumber,
    formatDateVE,
    calculateServiceTime,
    countMondaysInMonth,
    calculateSalaryRecord,
    getVacationBaseSalary,
    getVacationDaysForYear,
    calculateVacations,
    calculateUtilities,
    calculateIntegralSalary,
    calculateParafiscales,
    computeWorkerBenefits,
    calculatePeriodicReceipt,
    calculatePrestacionesAndLiquidacion
  };
})(window);
