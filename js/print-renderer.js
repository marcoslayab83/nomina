/**
 * NOMINA — Renderizador de Documentos Imprimibles (LOTTT Art. 106, 142, 144, 190-196)
 * Soporta:
 *  - resumen_integral
 *  - recibo_mensual
 *  - recibo_quincenal
 *  - recibo_semanal
 *  - recibo_vacaciones
 *  - liquidacion_parcial
 *  - liquidacion_definitiva
 */
(function (global) {
  'use strict';

  function esc(val) {
    return String(val === undefined || val === null ? '' : val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const CONTRATO_LABELS = {
    indeterminado: 'Tiempo Indeterminado',
    determinado: 'Tiempo Determinado',
    obra: 'Para una Obra Determinada',
    honorarios_subordinacion: 'Honorarios con Subordinación (Art. 22 LOTTT — Primacía de la Realidad)'
  };

  const MODALIDAD_LABELS = {
    tiempo: 'Por Unidad de Tiempo',
    obra: 'Por Unidad de Obra',
    comision: 'Por Comisión',
    mixto: 'Mixto'
  };

  const ESTATUS_VAC_LABELS = {
    disfrutada: 'Disfrutada y Pagada',
    causada: 'Causada (Pendiente de Disfrute)',
    no_disfrutada: 'No Disfrutada (Pasivo Exigible)'
  };

  const MOTIVO_ANTICIPO_LABELS = {
    vivienda: 'Construcción, adquisición, mejora o reparación de vivienda (Art. 144 lit. a LOTTT)',
    hipoteca: 'Liberación de hipoteca o gravamen sobre vivienda de su propiedad (Art. 144 lit. b LOTTT)',
    educacion: 'Inversión en educación para el trabajador o su familia (Art. 144 lit. c LOTTT)',
    salud: 'Gastos por atención médica y hospitalaria para el trabajador o su familia (Art. 144 lit. d LOTTT)'
  };

  const MOTIVO_EGRESO_LABELS = {
    renuncia: 'Renuncia Voluntaria del Trabajador',
    mutuo_acuerdo: 'Terminación por Mutuo Acuerdo',
    fin_contrato: 'Culminación de Contrato por Tiempo u Obra Determinada',
    despido_justificado: 'Despido Justificado (Art. 79 LOTTT)',
    despido_injustificado: 'Despido Injustificado / Retiro Justificado (Aplica Indemnización Art. 92 LOTTT)'
  };

  function getDocHeader(worker, docCodeLabel, fechaCorteLabel) {
    const hoyEmision = new Date().toLocaleDateString('es-VE', {
      year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const fmtD = (v) => global.NominaCalc.formatDateVE(v);
    return `
      <div class="doc-header">
        <div class="doc-company">
          <h1>${esc(worker.empresaNombre || 'EMPRESA, C.A.')}</h1>
          <p><strong>RIF:</strong> ${esc(worker.empresaRif || '—')} &nbsp;|&nbsp; ${esc(worker.empresaDireccion || 'Venezuela')}</p>
        </div>
        <div class="doc-meta">
          <div class="doc-code">${esc(docCodeLabel || ('EXPEDIENTE: ' + (worker.codigoExpediente || 'EXP-000')))}</div>
          <div>Fecha de emisión: <strong>${esc(hoyEmision)}</strong></div>
          <div>${esc(fechaCorteLabel || ('Fecha de corte: ' + fmtD(worker.fechaCorte)))}</div>
        </div>
      </div>
    `;
  }

  function getSignatures(worker, workerCaption, employerCaption) {
    const fullName = `${worker.nombre || ''} ${worker.apellido || ''}`.trim();
    return `
      <div class="doc-signatures">
        <div class="sig-box">
          <div class="sig-line"></div>
          <strong>${esc(fullName || 'EL TRABAJADOR')}</strong><br>
          C.I.: ${esc(worker.cedula || '—')}<br>
          <span>${esc(workerCaption || 'Recibí conforme (Firma y Huella Dactilar)')}</span>
        </div>
        <div class="sig-box">
          <div class="sig-line"></div>
          <strong>${esc(worker.empresaNombre || 'EL PATRONO / RRHH')}</strong><br>
          RIF: ${esc(worker.empresaRif || '—')}<br>
          <span>${esc(employerCaption || 'Elaborado y Aprobado por Nómina / Administración')}</span>
        </div>
      </div>
    `;
  }

  /* ========================================================================
     1. RESUMEN INTEGRAL DEL EXPEDIENTE (COMPLETO)
     ======================================================================== */
  function renderPrintSummary(worker, calc, options) {
    const opts = Object.assign({
      incluirJerarquia: true,
      incluirHistorialSueldos: true,
      incluirVacaciones: true,
      incluirUtilidades: true,
      incluirParafiscales: true,
      incluirAportesPatronales: true
    }, options || {});

    const cur = worker.moneda || 'Bs.';
    const fmt = (v) => global.NominaCalc.formatMoney(v, cur);
    const fmtN = (v, d) => global.NominaCalc.formatNumber(v, d);
    const fmtD = (v) => global.NominaCalc.formatDateVE(v);

    const { serviceTime, salaryData, vacationsData, utilitiesData, integralData, parafiscalesData, historialSueldos } = calc;

    const fullName = `${worker.nombre || ''} ${worker.apellido || ''}`.trim();
    const reporta = worker.reportaA || {};
    const subordinados = Array.isArray(worker.personalACargo) ? worker.personalACargo : [];

    let html = `
      ${getDocHeader(worker, 'EXPEDIENTE: ' + (worker.codigoExpediente || 'EXP-000'), 'Fecha de corte cálculos: ' + fmtD(worker.fechaCorte))}

      <div class="doc-title-bar">
        Expediente Laboral, Recibo de Pago y Resumen Integral de Beneficios (LOTTT)
      </div>

      <div class="doc-section">
        <h3 class="doc-section-title">
          1. Identificación del Trabajador y Tiempo de Servicio
          <span class="law-ref">Art. 22, 104 y 106 LOTTT</span>
        </h3>
        <div class="doc-info-grid">
          <div class="doc-info-item"><label>Apellidos y Nombres</label><strong>${esc(fullName || '—')}</strong></div>
          <div class="doc-info-item"><label>Cédula de Identidad</label><strong>${esc(worker.cedula || '—')}</strong></div>
          <div class="doc-info-item"><label>Cargo / Puesto</label><strong>${esc(worker.cargo || 'No especificado')}</strong></div>
          <div class="doc-info-item"><label>Departamento / Unidad</label><strong>${esc(worker.departamento || 'No especificado')}</strong></div>
          <div class="doc-info-item"><label>Fecha de Ingreso</label><strong>${esc(fmtD(worker.fechaIngreso))}</strong></div>
          <div class="doc-info-item"><label>Tiempo de Servicio</label><strong>${esc(serviceTime.text)} (${serviceTime.totalDays} días)</strong></div>
          <div class="doc-info-item"><label>Tipo de Contrato</label><strong>${esc(CONTRATO_LABELS[worker.tipoContrato] || worker.tipoContrato)}</strong></div>
          <div class="doc-info-item"><label>Modalidad Salarial</label><strong>${esc(MODALIDAD_LABELS[worker.modalidadSalario] || worker.modalidadSalario)}</strong></div>
          <div class="doc-info-item"><label>Clasificación Riesgo IVSS</label><strong>${esc(parafiscalesData.rate.label)}</strong></div>
        </div>
      </div>
    `;

    if (opts.incluirJerarquia) {
      const subRows = subordinados.length > 0
        ? subordinados.map((s, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${esc(s.nombre)}</td>
              <td>${esc(s.cedula || '—')}</td>
              <td>${esc(s.cargo || '—')}</td>
              <td>${esc(s.departamento || '—')}</td>
            </tr>
          `).join('')
        : `<tr><td colspan="5" style="text-align:center;color:#64748b;">No registra personal subordinado a su cargo.</td></tr>`;

      html += `
        <div class="doc-section">
          <h3 class="doc-section-title">
            2. Estructura Jerárquica del Expediente
            <span class="law-ref">Supervisión y Personal a Cargo</span>
          </h3>
          <div class="doc-info-grid" style="margin-bottom:10px;grid-template-columns:repeat(4,1fr);">
            <div class="doc-info-item"><label>Reporta a (Supervisor)</label><strong>${esc(reporta.nombre || 'No asignado')}</strong></div>
            <div class="doc-info-item"><label>Cédula Supervisor</label><strong>${esc(reporta.cedula || '—')}</strong></div>
            <div class="doc-info-item"><label>Cargo Supervisor</label><strong>${esc(reporta.cargo || '—')}</strong></div>
            <div class="doc-info-item"><label>Personal a su Cargo</label><strong>${subordinados.length} trabajador(es)</strong></div>
          </div>
          <table class="doc-table">
            <thead>
              <tr>
                <th style="width:36px;">#</th>
                <th>Nombre y Apellido (Personal a Cargo)</th>
                <th>Cédula</th>
                <th>Cargo</th>
                <th>Departamento</th>
              </tr>
            </thead>
            <tbody>${subRows}</tbody>
          </table>
        </div>
      `;
    }

    html += `
      <div class="doc-section">
        <h3 class="doc-section-title">
          3. Determinación del Salario, Recargos y Beneficios No Salariales (${esc(worker.salarioActual.periodo || '')})
          <span class="law-ref">Art. 104, 105, 106, 113, 117, 118, 120 LOTTT &amp; TSJ 2025</span>
        </h3>
        <table class="doc-table">
          <thead>
            <tr>
              <th>Concepto</th>
              <th>Detalle / Fórmula Legal</th>
              <th style="width:120px;">Base Legal</th>
              <th class="num" style="width:140px;">Monto (${esc(cur)})</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Sueldo Base Mensual</td><td>Remuneración fija regular</td><td>Art. 104 LOTTT</td><td class="num">${fmt(salaryData.sueldoBase)}</td></tr>
            ${salaryData.comisionesHabituales > 0 ? `<tr><td>Comisiones Habituales</td><td>Remuneración regular por ventas/gestión</td><td>Art. 104 LOTTT</td><td class="num">${fmt(salaryData.comisionesHabituales)}</td></tr>` : ''}
            ${salaryData.primasFijas > 0 ? `<tr><td>Primas Fijas</td><td>Antigüedad, profesionalización, etc.</td><td>Art. 104 LOTTT</td><td class="num">${fmt(salaryData.primasFijas)}</td></tr>` : ''}
            ${salaryData.bonosRegulares > 0 ? `<tr><td>Bonos Regulares</td><td>Percibidos de forma permanente</td><td>Art. 104 LOTTT</td><td class="num">${fmt(salaryData.bonosRegulares)}</td></tr>` : ''}
            ${salaryData.viaticosSinRendicion > 0 ? `<tr><td>Viáticos Sin Rendición de Cuentas</td><td>Libre disposición regular y permanente</td><td>Sent. N° 355 TSJ 2025</td><td class="num">${fmt(salaryData.viaticosSinRendicion)}</td></tr>` : ''}
            <tr class="total-row">
              <td>SALARIO NORMAL MENSUAL</td>
              <td>Diario: ${fmt(salaryData.salarioDiario)} (/30) &nbsp;|&nbsp; Semanal: ${fmt(salaryData.salarioSemanal)} (×7)</td>
              <td>Art. 104 y 113</td>
              <td class="num">${fmt(salaryData.salarioNormalMensual)}</td>
            </tr>
            <tr>
              <td>Salario Integral Mensual (Doctrinario / FAOV)</td>
              <td>Normal (${fmt(salaryData.salarioDiario)}/d) + Alíc. Bono Vac. (${fmt(integralData.alicuotaBonoVacacionalDiaria)}/d) + Alíc. Utilidades (${fmt(integralData.alicuotaUtilidadesDiaria)}/d)${integralData.beneficiosRegularizados > 0 ? ` + Regularizados (${fmt(integralData.beneficiosRegDiario)}/d)` : ''} = ${fmt(integralData.salarioIntegralDiario)}/día</td>
              <td>LOTTT / Art. 33 FAOV</td>
              <td class="num">${fmt(integralData.salarioIntegralMensual)}</td>
            </tr>
            <tr>
              <td>Bono Nocturno (${fmtN(salaryData.jornadasNocturnas, 1)} jornadas)</td>
              <td>Valor unitario: Salario Diario × 30% = ${fmt(salaryData.valorBonoNocturnoJornada)}</td>
              <td>Art. 117 LOTTT</td>
              <td class="num">${fmt(salaryData.montoBonoNocturno)}</td>
            </tr>
            <tr>
              <td>Horas Extras Diurnas (${fmtN(salaryData.horasExtrasDiurnas, 1)} hrs)</td>
              <td>Valor unitario: (Salario Diario / 8) × 150% = ${fmt(salaryData.valorHoraExtraDiurna)}</td>
              <td>Art. 118 LOTTT</td>
              <td class="num">${fmt(salaryData.montoHorasExtrasDiurnas)}</td>
            </tr>
            <tr>
              <td>Horas Extras Nocturnas (${fmtN(salaryData.horasExtrasNocturnas, 1)} hrs)</td>
              <td>Valor unitario: ((Salario Diario / 8) × 150%) × 130% = ${fmt(salaryData.valorHoraExtraNocturna)}</td>
              <td>Art. 117 LOTTT</td>
              <td class="num">${fmt(salaryData.montoHorasExtrasNocturnas)}</td>
            </tr>
            <tr>
              <td>Trabajo en Día Feriado o Descanso (${fmtN(salaryData.diasFeriados, 1)} días)</td>
              <td>Valor unitario: Salario Diario × 150% = ${fmt(salaryData.valorDiaFeriado)}</td>
              <td>Art. 120 LOTTT</td>
              <td class="num">${fmt(salaryData.montoDiasFeriados)}</td>
            </tr>
            <tr class="total-row">
              <td colspan="3">TOTAL DEVENGADO SALARIAL DEL PERÍODO</td>
              <td class="num">${fmt(salaryData.totalDevengadoSalarial)}</td>
            </tr>
            ${salaryData.totalNoSalarial > 0 ? `
              <tr>
                <td>Beneficios No Salariales (Exclusiones Clave)</td>
                <td>
                  ${salaryData.cestaticket > 0 ? `Cestaticket: ${fmt(salaryData.cestaticket)} ` : ''}
                  ${salaryData.ayudaTransporte > 0 ? `| Transporte (Sent. 99 TSJ 2025): ${fmt(salaryData.ayudaTransporte)} ` : ''}
                  ${salaryData.becasEducativas > 0 ? `| Becas: ${fmt(salaryData.becasEducativas)} ` : ''}
                  ${salaryData.herramientasUniformes > 0 ? `| Herram./Unif.: ${fmt(salaryData.herramientasUniformes)} ` : ''}
                  ${salaryData.indemnizaciones > 0 ? `| Indemniz.: ${fmt(salaryData.indemnizaciones)}` : ''}
                </td>
                <td>Art. 105 / Sent. 99</td>
                <td class="num">${fmt(salaryData.totalNoSalarial)}</td>
              </tr>
            ` : ''}
          </tbody>
        </table>
      </div>
    `;

    if (opts.incluirHistorialSueldos) {
      const histRows = historialSueldos.length > 0
        ? historialSueldos.map((h) => `
            <tr>
              <td>${esc(h.periodo)}</td>
              <td class="num">${fmt(h.calc.sueldoBase)}</td>
              <td class="num">${fmt(h.calc.salarioNormalMensual)}</td>
              <td class="num">${fmt(h.calc.totalRecargos)}</td>
              <td class="num">${fmt(h.calc.totalNoSalarial)}</td>
              <td class="num"><strong>${fmt(h.calc.totalDevengadoSalarial)}</strong></td>
            </tr>
          `).join('')
        : `<tr><td colspan="6" style="text-align:center;color:#64748b;">No existen períodos históricos adicionales registrados.</td></tr>`;

      html += `
        <div class="doc-section">
          <h3 class="doc-section-title">
            4. Historial de Sueldos Devengados en el Expediente
            <span class="law-ref">${historialSueldos.length} período(s) registrado(s)</span>
          </h3>
          <table class="doc-table">
            <thead>
              <tr>
                <th>Período</th>
                <th class="num">Sueldo Base</th>
                <th class="num">Salario Normal</th>
                <th class="num">Recargos / H.E.</th>
                <th class="num">No Salarial</th>
                <th class="num">Total Salarial</th>
              </tr>
            </thead>
            <tbody>${histRows}</tbody>
            ${historialSueldos.length > 0 ? `
              <tfoot>
                <tr class="total-row">
                  <td colspan="4">ACUMULADO HISTÓRICO REGISTRADO EN EXPEDIENTE</td>
                  <td class="num">${fmt(calc.totalHistoricoNoSalarial)}</td>
                  <td class="num">${fmt(calc.totalHistoricoDevengado)}</td>
                </tr>
              </tfoot>
            ` : ''}
          </table>
        </div>
      `;
    }

    if (opts.incluirVacaciones) {
      const vacHistRows = vacationsData.historialEnriquecido.length > 0
        ? vacationsData.historialEnriquecido.map((v) => `
            <tr>
              <td>${esc(v.periodoLabel || `Año ${v.anioServicio}`)}</td>
              <td>${esc(ESTATUS_VAC_LABELS[v.estatus] || v.estatus)}</td>
              <td>${v.fechaInicio ? `${fmtD(v.fechaInicio)} al ${fmtD(v.fechaFin)}` : 'Pendiente'}</td>
              <td class="num">${v.diasVac} / ${v.diasDisfrutados || 0}</td>
              <td class="num">${fmt(v.montoVac)}</td>
              <td class="num">${fmt(v.montoBono)}</td>
              <td class="num"><strong>${fmt(v.totalItem)}</strong></td>
            </tr>
          `).join('')
        : `<tr><td colspan="7" style="text-align:center;color:#64748b;">Sin períodos vacacionales registrados aún en el historial.</td></tr>`;

      html += `
        <div class="doc-section">
          <h3 class="doc-section-title">
            5. Cálculo de Vacaciones y Bono Vacacional
            <span class="law-ref">Art. 121 y Art. 190 al 196 LOTTT</span>
          </h3>
          <p style="font-size:11.5px;margin:0 0 8px;color:#334155;">
            <strong>Base salarial aplicada:</strong> ${esc(vacationsData.baseSal.criterio)} — Salario Normal Diario: <strong>${fmt(vacationsData.baseSal.diario)}</strong>.
            &nbsp;|&nbsp; <strong>Antigüedad cumplida:</strong> ${vacationsData.yearsCompleted} año(s) y ${vacationsData.monthsInCurrentYear} mes(es).
          </p>
          <table class="doc-table" style="margin-bottom:10px;">
            <thead>
              <tr>
                <th>Concepto Vacacional (Año Actual de Antigüedad)</th>
                <th class="num" style="width:110px;">Días</th>
                <th class="num" style="width:140px;">Importe (${esc(cur)})</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Vacaciones Base (Art. 190 LOTTT)</td><td class="num">${vacationsData.diasBase} días</td><td class="num">${fmt(vacationsData.montoVacacionesBase)}</td></tr>
              <tr><td>Días Adicionales de Vacaciones (+1 día/año a partir del 2do año, máx. 15)</td><td class="num">${vacationsData.diasAdicionales} días</td><td class="num">${fmt(vacationsData.montoVacacionesAdicionales)}</td></tr>
              <tr><td>Bono Vacacional Base (Art. 192 LOTTT)</td><td class="num">${vacationsData.diasBase} días</td><td class="num">${fmt(vacationsData.montoBonoBase)}</td></tr>
              <tr><td>Días Adicionales de Bono Vacacional (+1 día/año, máx. 15)</td><td class="num">${vacationsData.diasAdicionales} días</td><td class="num">${fmt(vacationsData.montoBonoAdicional)}</td></tr>
              <tr class="total-row">
                <td>TOTAL VACACIONES Y BONO VACACIONAL (PERÍODO ANUAL)</td>
                <td class="num">${vacationsData.totalDiasVacaciones + vacationsData.totalDiasBono} días</td>
                <td class="num">${fmt(vacationsData.totalPeriodoActual)}</td>
              </tr>
              ${vacationsData.monthsInCurrentYear > 0 ? `
                <tr>
                  <td>Vacaciones y Bono Vacacional Fraccionados (${vacationsData.monthsInCurrentYear} meses del año en curso)</td>
                  <td class="num">${fmtN(vacationsData.diasFraccionadosVac + vacationsData.diasFraccionadosBono, 2)} días</td>
                  <td class="num">${fmt(vacationsData.totalFraccionado)}</td>
                </tr>
              ` : ''}
            </tbody>
          </table>

          <table class="doc-table">
            <thead>
              <tr>
                <th>Período Vacacional Registrado</th>
                <th>Estatus</th>
                <th>Fechas Disfrute</th>
                <th class="num">Corr. / Disfr.</th>
                <th class="num">Vacaciones</th>
                <th class="num">Bono Vac.</th>
                <th class="num">Total</th>
              </tr>
            </thead>
            <tbody>${vacHistRows}</tbody>
            <tfoot>
              <tr class="total-row">
                <td colspan="4">Histórico Pagado/Disfrutado (${vacationsData.periodosDisfrutados} per.) &nbsp;|&nbsp; Pasivo Pendiente (${vacationsData.periodosCausados + vacationsData.periodosNoDisfrutados} per.)</td>
                <td colspan="2" class="num">Pagado: ${fmt(vacationsData.totalPagadoHistorico)}</td>
                <td class="num">Pasivo: ${fmt(vacationsData.totalPasivoPendiente)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      `;
    }

    if (opts.incluirUtilidades) {
      html += `
        <div class="doc-section">
          <h3 class="doc-section-title">
            6. Participación en los Beneficios o Utilidades
            <span class="law-ref">Art. 131 al 140 LOTTT &amp; Art. 50 Ley INCES</span>
          </h3>
          <p style="font-size:11.5px;margin:0 0 8px;color:#334155;">
            <strong>Criterio aplicado:</strong> ${esc(utilitiesData.criterioAplicado)}. &nbsp;|&nbsp;
            <strong>Meses completos laborados:</strong> ${utilitiesData.mesesLaborados} de 12.
          </p>
          <table class="doc-table">
            <thead>
              <tr>
                <th>Concepto de Utilidades</th>
                <th>Detalle</th>
                <th class="num" style="width:140px;">Monto (${esc(cur)})</th>
              </tr>
            </thead>
            <tbody>
              ${utilitiesData.modo === 'beneficios_liquidos' ? `
                <tr><td>Beneficios Líquidos Declarados (ISLR, Art. 133)</td><td>15% distribuible = ${fmt(utilitiesData.quincePorCientoBeneficios)}</td><td class="num">${fmt(utilitiesData.utilidadLiquidaEmpresa)}</td></tr>
              ` : ''}
              <tr>
                <td>Utilidades Brutas Correspondientes</td>
                <td>Equivalente a ${fmtN(utilitiesData.diasEquivalentes, 2)} días de salario normal (Rango legal: 30 días = ${fmt(utilitiesData.comparativa.dias30)} / 120 días = ${fmt(utilitiesData.comparativa.dias120)})</td>
                <td class="num">${fmt(utilitiesData.montoBruto)}</td>
              </tr>
              <tr>
                <td>Retención INCES Trabajador (0,5% sobre utilidades)</td>
                <td>${worker.aplicaInces !== false ? 'Art. 50 Ley INCES (enterar dentro de los 10 días siguientes al pago)' : 'No aplica (entidad con menos de 5 trabajadores)'}</td>
                <td class="num">- ${fmt(utilitiesData.retencionInces)}</td>
              </tr>
              <tr class="total-row">
                <td colspan="2">TOTAL UTILIDADES NETAS A RECIBIR POR EL TRABAJADOR</td>
                <td class="num">${fmt(utilitiesData.montoNeto)}</td>
              </tr>
              ${utilitiesData.anticipoDiciembre > 0 ? `
                <tr><td>Anticipo / Bonificación de Fin de Año Pagada (Art. 132)</td><td>Pagado dentro de los primeros 15 días de diciembre</td><td class="num">- ${fmt(utilitiesData.anticipoDiciembre)}</td></tr>
                <tr class="total-row">
                  <td colspan="2">DIFERENCIA DE UTILIDADES POR PAGAR (Dentro de los 2 meses al cierre, Art. 137)</td>
                  <td class="num">${fmt(utilitiesData.diferenciaPorPagar)}</td>
                </tr>
              ` : ''}
            </tbody>
          </table>
        </div>
      `;
    }

    if (opts.incluirParafiscales) {
      html += `
        <div class="doc-section">
          <h3 class="doc-section-title">
            7. Deducciones Legales, Voluntarias y Aportes Patronales (${esc(parafiscalesData.periodo)})
            <span class="law-ref">LSS Art. 67 | LRPE Art. 46 | LRPVH Art. 33 | INCES Art. 49</span>
          </h3>
          <table class="doc-table">
            <thead>
              <tr>
                <th>Concepto Parafiscal / Deducción</th>
                <th>Base y Fórmula (${parafiscalesData.numLunes} lunes en el mes)</th>
                <th class="num" style="width:125px;">Ret. Trabajador</th>
                ${opts.incluirAportesPatronales ? `<th class="num" style="width:125px;">Aporte Patrono</th>` : ''}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Seguro Social Obligatorio (S.S.O.)</td>
                <td>(${fmt(parafiscalesData.baseIvss)} × 12 / 52) × ${fmtN(parafiscalesData.rate.empleadoSso * 100, 1)}% emp. / ${fmtN(parafiscalesData.rate.patronoSso * 100, 0)}% pat. × ${parafiscalesData.numLunes} lunes</td>
                <td class="num">${fmt(parafiscalesData.ssoEmpleado)}</td>
                ${opts.incluirAportesPatronales ? `<td class="num">${fmt(parafiscalesData.ssoPatrono)}</td>` : ''}
              </tr>
              <tr>
                <td>Régimen Prestacional de Empleo (P.I.E.)</td>
                <td>(${fmt(parafiscalesData.baseIvss)} × 12 / 52) × 0,5% emp. / 2% pat. × ${parafiscalesData.numLunes} lunes</td>
                <td class="num">${fmt(parafiscalesData.pieEmpleado)}</td>
                ${opts.incluirAportesPatronales ? `<td class="num">${fmt(parafiscalesData.piePatrono)}</td>` : ''}
              </tr>
              <tr>
                <td>FAOV — BANAVIH (3% Salario ${parafiscalesData.faovBaseModo === 'normal' ? 'Normal' : 'Integral'})</td>
                <td>Base ${fmt(parafiscalesData.baseFaov)} × 1% trabajador / 2% empresa (primeros 5 días hábiles)</td>
                <td class="num">${fmt(parafiscalesData.faovEmpleado)}</td>
                ${opts.incluirAportesPatronales ? `<td class="num">${fmt(parafiscalesData.faovPatrono)}</td>` : ''}
              </tr>
              ${opts.incluirAportesPatronales ? `
                <tr>
                  <td>INCES Patronal (2% Remuneraciones Trimestrales)</td>
                  <td>${parafiscalesData.aplicaInces ? `Base trimestral ${fmt(parafiscalesData.totalBaseIncesTrimestre)} × 2% = ${fmt(parafiscalesData.incesPatronoTrimestral)} trim. (equiv. mensual)` : 'No aplica (<5 trabajadores)'}</td>
                  <td class="num">—</td>
                  <td class="num">${fmt(parafiscalesData.incesPatronoMensualRef)}</td>
                </tr>
              ` : ''}
              ${salaryData.totalDeduccionesVoluntarias > 0 ? `
                <tr>
                  <td>Deducciones Voluntarias</td>
                  <td>
                    ${salaryData.prestamos > 0 ? `Préstamos: ${fmt(salaryData.prestamos)} ` : ''}
                    ${salaryData.polizas > 0 ? `| Pólizas: ${fmt(salaryData.polizas)} ` : ''}
                    ${salaryData.ahorros > 0 ? `| Ahorros: ${fmt(salaryData.ahorros)} ` : ''}
                    ${salaryData.otrasDeducciones > 0 ? `| Otras: ${fmt(salaryData.otrasDeducciones)}` : ''}
                  </td>
                  <td class="num">${fmt(salaryData.totalDeduccionesVoluntarias)}</td>
                  ${opts.incluirAportesPatronales ? `<td class="num">—</td>` : ''}
                </tr>
              ` : ''}
              <tr class="total-row">
                <td colspan="2">TOTAL DEDUCCIONES MENSUALES Y APORTES PATRONALES</td>
                <td class="num">${fmt(parafiscalesData.totalDeduccionesMes)}</td>
                ${opts.incluirAportesPatronales ? `<td class="num">${fmt(parafiscalesData.totalAportesPatronalesMes)}</td>` : ''}
              </tr>
              <tr class="grand-total">
                <td colspan="${opts.incluirAportesPatronales ? 3 : 2}">NETO MENSUAL A PERCIBIR POR EL TRABAJADOR (Salarial + No Salarial - Deducciones)</td>
                <td class="num">${fmt(parafiscalesData.netoMensualConNoSalarial)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
    }

    html += `
      <div class="doc-section">
        <h3 class="doc-section-title">
          Resumen Ejecutivo Consolidado de Beneficios
          <span class="law-ref">Soporte Legal, Contable y de Auditoría</span>
        </h3>
        <div class="doc-summary-boxes">
          <div class="doc-summary-box highlight">
            <small>Neto Mensual Trabajador</small>
            <strong>${fmt(parafiscalesData.netoMensualConNoSalarial)}</strong>
          </div>
          <div class="doc-summary-box">
            <small>Vacaciones + Bono (Anual)</small>
            <strong>${fmt(vacationsData.totalPeriodoActual)}</strong>
          </div>
          <div class="doc-summary-box">
            <small>Utilidades Netas Anuales</small>
            <strong>${fmt(utilitiesData.montoNeto)}</strong>
          </div>
          <div class="doc-summary-box">
            <small>${opts.incluirAportesPatronales ? 'Costo Mensual Patrono' : 'Pasivo Vac. Pendiente'}</small>
            <strong>${fmt(opts.incluirAportesPatronales ? parafiscalesData.costoTotalMensualPatrono : vacationsData.totalPasivoPendiente)}</strong>
          </div>
        </div>
        ${worker.notasExpediente ? `<p style="font-size:11.5px;margin:12px 0 0;color:#334155;"><strong>Observaciones del Expediente:</strong> ${esc(worker.notasExpediente)}</p>` : ''}
      </div>

      ${getSignatures(worker)}

      <div class="doc-legal-footer">
        <strong>Fundamento Legal Aplicado:</strong> Decreto con Rango, Valor y Fuerza de Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT: Art. 19 Irrenunciabilidad, Art. 22 Primacía de la Realidad, Art. 104-105 Salario, Art. 106 Recibo de Pago, Art. 113-121 Cálculos Salariales, Art. 131-140 Utilidades, Art. 151 Privilegio, Art. 190-196 Vacaciones y Bono Vacacional); Ley del Seguro Social (Art. 67); Ley del Régimen Prestacional de Empleo (Art. 46); Ley del Régimen Prestacional de Vivienda y Hábitat — BANAVIH (Art. 33); Ley del INCES (Art. 49 y 50); Sentencia N° 99 (31/03/2025) y Sentencia N° 355 (13/08/2025) de la Sala de Casación Social del TSJ.
      </div>
    `;

    return html;
  }

  /* ========================================================================
     2. RECIBO DE PAGO PERIÓDICO (MENSUAL / QUINCENAL / SEMANAL — ART. 106)
     ======================================================================== */
  function renderPeriodicReceipt(worker, calc, tipoPeriodo, options) {
    const o = options || {};
    const cur = worker.moneda || 'Bs.';
    const fmt = (v) => global.NominaCalc.formatMoney(v, cur);
    const fmtD = (v) => global.NominaCalc.formatDateVE(v);

    const rec = global.NominaCalc.calculatePeriodicReceipt(worker, calc, tipoPeriodo, o);
    const fullName = `${worker.nombre || ''} ${worker.apellido || ''}`.trim();
    const rangoFechas = (o.fechaDesde && o.fechaHasta)
      ? `Del ${fmtD(o.fechaDesde)} al ${fmtD(o.fechaHasta)}`
      : `Período ${worker.salarioActual.periodo || ''}`;

    const tituloDoc = tipoPeriodo === 'quincenal'
      ? `RECIBO DE PAGO QUINCENAL (${rec.tituloPeriodo}) — ART. 106 LOTTT`
      : (tipoPeriodo === 'semanal'
        ? 'RECIBO DE PAGO SEMANAL — ART. 106 LOTTT'
        : 'RECIBO DE PAGO MENSUAL — ART. 106 LOTTT');

    const rowsAsig = [];
    rowsAsig.push(`<tr><td>Sueldo Base (${rec.diasPeriodo} días)</td><td>Salario normal diario ${fmt(calc.salaryData.salarioDiario)} × ${rec.diasPeriodo} d</td><td class="num">${fmt(rec.sueldoBase)}</td><td class="num">—</td></tr>`);
    if (rec.comisionesHabituales > 0) rowsAsig.push(`<tr><td>Comisiones Habituales</td><td>Proporcional al período</td><td class="num">${fmt(rec.comisionesHabituales)}</td><td class="num">—</td></tr>`);
    if (rec.primasFijas > 0) rowsAsig.push(`<tr><td>Primas Fijas</td><td>Antigüedad / profesionalización / otras</td><td class="num">${fmt(rec.primasFijas)}</td><td class="num">—</td></tr>`);
    if (rec.bonosRegulares > 0) rowsAsig.push(`<tr><td>Bonos Regulares Permanentes</td><td>Carácter salarial (Art. 104 LOTTT)</td><td class="num">${fmt(rec.bonosRegulares)}</td><td class="num">—</td></tr>`);
    if (rec.viaticosSinRendicion > 0) rowsAsig.push(`<tr><td>Viáticos Sin Rendición de Cuentas</td><td>Integran salario normal (Sent. N° 355 TSJ 2025)</td><td class="num">${fmt(rec.viaticosSinRendicion)}</td><td class="num">—</td></tr>`);
    if (rec.montoBonoNocturno > 0) rowsAsig.push(`<tr><td>Bono Nocturno (30%)</td><td>Art. 117 LOTTT</td><td class="num">${fmt(rec.montoBonoNocturno)}</td><td class="num">—</td></tr>`);
    if (rec.montoHorasExtrasDiurnas > 0) rowsAsig.push(`<tr><td>Horas Extras Diurnas (150%)</td><td>Art. 118 LOTTT</td><td class="num">${fmt(rec.montoHorasExtrasDiurnas)}</td><td class="num">—</td></tr>`);
    if (rec.montoHorasExtrasNocturnas > 0) rowsAsig.push(`<tr><td>Horas Extras Nocturnas (150% × 130%)</td><td>Art. 117 LOTTT</td><td class="num">${fmt(rec.montoHorasExtrasNocturnas)}</td><td class="num">—</td></tr>`);
    if (rec.montoDiasFeriados > 0) rowsAsig.push(`<tr><td>Trabajo en Día Feriado / Descanso (150%)</td><td>Art. 120 LOTTT</td><td class="num">${fmt(rec.montoDiasFeriados)}</td><td class="num">—</td></tr>`);

    // No salariales
    if (rec.cestaticket > 0) rowsAsig.push(`<tr><td>Alimentación / Cestaticket (No Salarial)</td><td>Art. 105 LOTTT (${rec.diasPeriodo} días)</td><td class="num">${fmt(rec.cestaticket)}</td><td class="num">—</td></tr>`);
    if (rec.ayudaTransporte > 0) rowsAsig.push(`<tr><td>Ayuda de Transporte (No Salarial)</td><td>Sentencia N° 99 TSJ 2025 (${rec.diasPeriodo} días)</td><td class="num">${fmt(rec.ayudaTransporte)}</td><td class="num">—</td></tr>`);
    if (rec.becasEducativas > 0) rowsAsig.push(`<tr><td>Becas Educativas (No Salarial)</td><td>Art. 105 LOTTT</td><td class="num">${fmt(rec.becasEducativas)}</td><td class="num">—</td></tr>`);
    if (rec.herramientasUniformes > 0) rowsAsig.push(`<tr><td>Herramientas / Uniformes (No Salarial)</td><td>Art. 105 LOTTT</td><td class="num">${fmt(rec.herramientasUniformes)}</td><td class="num">—</td></tr>`);
    if (rec.indemnizaciones > 0) rowsAsig.push(`<tr><td>Indemnizaciones (No Salarial)</td><td>Art. 105 LOTTT</td><td class="num">${fmt(rec.indemnizaciones)}</td><td class="num">—</td></tr>`);

    // Deducciones
    rowsAsig.push(`<tr><td>Retención Seguro Social Obligatorio (S.S.O. 4%)</td><td>LSS Art. 67 · ${rec.numLunes} lunes en el período</td><td class="num">—</td><td class="num">${fmt(rec.ssoEmpleado)}</td></tr>`);
    rowsAsig.push(`<tr><td>Retención Régimen Prestacional de Empleo (P.I.E. 0,5%)</td><td>LRPE Art. 46 · ${rec.numLunes} lunes en el período</td><td class="num">—</td><td class="num">${fmt(rec.pieEmpleado)}</td></tr>`);
    rowsAsig.push(`<tr><td>Retención FAOV — BANAVIH (1%)</td><td>LRPVH Art. 33 · Base ${fmt(rec.baseFaovPeriodo)}</td><td class="num">—</td><td class="num">${fmt(rec.faovEmpleado)}</td></tr>`);
    if (rec.prestamos > 0) rowsAsig.push(`<tr><td>Deducción Préstamos</td><td>Deducción voluntaria autorizada</td><td class="num">—</td><td class="num">${fmt(rec.prestamos)}</td></tr>`);
    if (rec.polizas > 0) rowsAsig.push(`<tr><td>Deducción Pólizas / Seguros</td><td>Deducción voluntaria</td><td class="num">—</td><td class="num">${fmt(rec.polizas)}</td></tr>`);
    if (rec.ahorros > 0) rowsAsig.push(`<tr><td>Aporte Caja de Ahorros</td><td>Deducción voluntaria</td><td class="num">—</td><td class="num">${fmt(rec.ahorros)}</td></tr>`);
    if (rec.otrasDeducciones > 0) rowsAsig.push(`<tr><td>Otras Deducciones Voluntarias</td><td>Descuento autorizado</td><td class="num">—</td><td class="num">${fmt(rec.otrasDeducciones)}</td></tr>`);

    const patronalBlock = o.mostrarAportesPatronales ? `
      <div class="doc-section">
        <h3 class="doc-section-title">
          Control Interno: Aportes Patronales del Período (${rec.diasPeriodo} días)
          <span class="law-ref">${esc(calc.parafiscalesData.rate.label)}</span>
        </h3>
        <table class="doc-table">
          <thead>
            <tr>
              <th>Concepto Patronal</th>
              <th>Detalle</th>
              <th class="num" style="width:140px;">Aporte Patrono</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Aporte Patronal S.S.O.</td><td>${rec.numLunes} lunes · Tasa patrono ${global.NominaCalc.formatNumber(calc.parafiscalesData.rate.patronoSso * 100, 0)}%</td><td class="num">${fmt(rec.ssoPatrono)}</td></tr>
            <tr><td>Aporte Patronal P.I.E.</td><td>${rec.numLunes} lunes · Tasa patrono 2%</td><td class="num">${fmt(rec.piePatrono)}</td></tr>
            <tr><td>Aporte Patronal FAOV (2%)</td><td>Base ${fmt(rec.baseFaovPeriodo)}</td><td class="num">${fmt(rec.faovPatrono)}</td></tr>
            <tr class="total-row"><td colspan="2">TOTAL APORTES PATRONALES DEL PERÍODO</td><td class="num">${fmt(rec.totalAportesPatronales)}</td></tr>
          </tbody>
        </table>
      </div>
    ` : '';

    return `
      ${getDocHeader(worker, 'RECIBO N° ' + (worker.codigoExpediente || '000') + '-' + tipoPeriodo.slice(0, 3).toUpperCase(), 'Período de Pago: ' + rangoFechas)}

      <div class="doc-title-bar">${esc(tituloDoc)}</div>

      <div class="doc-section">
        <div class="doc-info-grid">
          <div class="doc-info-item"><label>Trabajador</label><strong>${esc(fullName)}</strong></div>
          <div class="doc-info-item"><label>Cédula de Identidad</label><strong>${esc(worker.cedula)}</strong></div>
          <div class="doc-info-item"><label>Cargo</label><strong>${esc(worker.cargo || 'No especificado')}</strong></div>
          <div class="doc-info-item"><label>Departamento</label><strong>${esc(worker.departamento || 'No especificado')}</strong></div>
          <div class="doc-info-item"><label>Fecha de Ingreso</label><strong>${esc(fmtD(worker.fechaIngreso))}</strong></div>
          <div class="doc-info-item"><label>Período Liquidado</label><strong>${esc(rangoFechas)} (${rec.diasPeriodo} días)</strong></div>
          <div class="doc-info-item"><label>Salario Normal Mensual</label><strong>${fmt(calc.salaryData.salarioNormalMensual)}</strong></div>
          <div class="doc-info-item"><label>Salario Normal Diario</label><strong>${fmt(calc.salaryData.salarioDiario)}</strong></div>
          <div class="doc-info-item"><label>Forma de Pago</label><strong>${esc(o.formaPago || 'Transferencia / Depósito Bancario')}</strong></div>
        </div>
      </div>

      <div class="doc-section">
        <h3 class="doc-section-title">
          Desglose de Asignaciones y Deducciones
          <span class="law-ref">Art. 106 LOTTT</span>
        </h3>
        <table class="doc-table">
          <thead>
            <tr>
              <th>Concepto</th>
              <th>Detalle / Base Legal</th>
              <th class="num" style="width:130px;">Asignaciones</th>
              <th class="num" style="width:130px;">Deducciones</th>
            </tr>
          </thead>
          <tbody>
            ${rowsAsig.join('')}
            <tr class="total-row">
              <td colspan="2">SUBTOTALES DEL PERÍODO (${rec.diasPeriodo} DÍAS)</td>
              <td class="num">${fmt(rec.totalAsignaciones)}</td>
              <td class="num">${fmt(rec.totalDeducciones)}</td>
            </tr>
            <tr class="grand-total">
              <td colspan="3">NETO A COBRAR POR EL TRABAJADOR (${esc(rec.tituloPeriodo)})</td>
              <td class="num">${fmt(rec.netoAPagar)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="doc-summary-boxes" style="grid-template-columns:repeat(3,1fr);">
        <div class="doc-summary-box">
          <small>Total Asignaciones</small>
          <strong>${fmt(rec.totalAsignaciones)}</strong>
        </div>
        <div class="doc-summary-box">
          <small>Total Deducciones</small>
          <strong>- ${fmt(rec.totalDeducciones)}</strong>
        </div>
        <div class="doc-summary-box highlight">
          <small>Neto a Pagar</small>
          <strong>${fmt(rec.netoAPagar)}</strong>
        </div>
      </div>

      ${patronalBlock}

      <p style="font-size:11.5px;margin:16px 0 0;color:#334155;">
        Declaro haber recibido de <strong>${esc(worker.empresaNombre || 'la entidad de trabajo')}</strong> la cantidad neta de <strong>${fmt(rec.netoAPagar)}</strong> por concepto de remuneraciones y beneficios correspondientes al período <strong>${esc(rangoFechas)}</strong>, conforme al artículo 106 de la LOTTT.
      </p>

      ${getSignatures(worker, 'Firma del Trabajador (Recibí Conforme)', 'Firma y Sello del Patrono / Nómina')}

      <div class="doc-legal-footer">
        Emitido en cumplimiento del Artículo 106 de la Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT), detallando salario, recargos, beneficios no salariales y deducciones legales (LSS Art. 67, LRPE Art. 46, LRPVH Art. 33).
      </div>
    `;
  }

  /* ========================================================================
     3. RECIBO DE VACACIONES Y BONO VACACIONAL (ART. 121, 190-196 LOTTT)
     ======================================================================== */
  function renderVacationReceipt(worker, calc, options) {
    const o = options || {};
    const cur = worker.moneda || 'Bs.';
    const fmt = (v) => global.NominaCalc.formatMoney(v, cur);
    const fmtD = (v) => global.NominaCalc.formatDateVE(v);
    const fullName = `${worker.nombre || ''} ${worker.apellido || ''}`.trim();

    const vData = calc.vacationsData;
    const selectedId = o.vacPeriodoId || 'actual';

    let periodoTitulo = `Año ${Math.max(1, vData.yearsCompleted)} de Servicio (Período Actual)`;
    let salDiario = vData.baseSal.diario;
    let diasBase = vData.diasBase || 15;
    let diasAdic = vData.diasAdicionales || 0;
    let diasTotales = vData.totalDiasVacaciones || 15;
    let montoVacBase = vData.montoVacacionesBase;
    let montoVacAdic = vData.montoVacacionesAdicionales;
    let montoBonoBase = vData.montoBonoBase;
    let montoBonoAdic = vData.montoBonoAdicional;
    let fechaInicio = o.fechaSalida || '';
    let fechaFin = o.fechaReincorporacion || '';
    let fechaPago = o.fechaPagoVac || global.NominaStore.todayISO();
    let obs = o.obsVac || '';

    if (selectedId !== 'actual') {
      const found = vData.historialEnriquecido.find((item) => item.id === selectedId);
      if (found) {
        periodoTitulo = found.periodoLabel || `Año ${found.anioServicio}`;
        salDiario = found.salDiarioAplicado;
        diasTotales = found.diasVac;
        diasBase = Math.min(15, diasTotales);
        diasAdic = Math.max(0, diasTotales - 15);
        montoVacBase = salDiario * diasBase;
        montoVacAdic = salDiario * diasAdic;
        montoBonoBase = salDiario * Math.min(15, found.diasBono);
        montoBonoAdic = salDiario * Math.max(0, found.diasBono - 15);
        fechaInicio = o.fechaSalida || found.fechaInicio || '';
        fechaFin = o.fechaReincorporacion || found.fechaFin || '';
        fechaPago = o.fechaPagoVac || found.fechaPago || global.NominaStore.todayISO();
        obs = o.obsVac || found.observaciones || '';
      }
    }

    const totalVacaciones = montoVacBase + montoVacAdic;
    const totalBono = montoBonoBase + montoBonoAdic;
    const totalBruto = totalVacaciones + totalBono;

    // Deducción FAOV opcional sobre bono/vacaciones si el usuario la marca
    const dedFaovVac = o.aplicarFaovVac ? totalBruto * 0.01 : 0;
    const otrasDedVac = global.NominaCalc.toNum(o.otrasDedVac);
    const totalDed = dedFaovVac + otrasDedVac;
    const totalNeto = Math.max(0, totalBruto - totalDed);

    return `
      ${getDocHeader(worker, 'RECIBO DE VACACIONES · ' + (worker.codigoExpediente || 'EXP'), 'Fecha de Pago Previo: ' + fmtD(fechaPago))}

      <div class="doc-title-bar">
        Recibo y Constancia de Disfrute de Vacaciones y Bono Vacacional (Art. 190–196 LOTTT)
      </div>

      <div class="doc-section">
        <div class="doc-info-grid">
          <div class="doc-info-item"><label>Apellidos y Nombres</label><strong>${esc(fullName)}</strong></div>
          <div class="doc-info-item"><label>Cédula de Identidad</label><strong>${esc(worker.cedula)}</strong></div>
          <div class="doc-info-item"><label>Cargo</label><strong>${esc(worker.cargo || 'No especificado')}</strong></div>
          <div class="doc-info-item"><label>Fecha de Ingreso</label><strong>${esc(fmtD(worker.fechaIngreso))}</strong></div>
          <div class="doc-info-item"><label>Antigüedad Cumplida</label><strong>${esc(calc.serviceTime.text)}</strong></div>
          <div class="doc-info-item"><label>Período Vacacional</label><strong>${esc(periodoTitulo)}</strong></div>
          <div class="doc-info-item"><label>Fecha de Salida</label><strong>${fechaInicio ? esc(fmtD(fechaInicio)) : 'Por definir'}</strong></div>
          <div class="doc-info-item"><label>Fecha de Reincorporación</label><strong>${fechaFin ? esc(fmtD(fechaFin)) : 'Por definir'}</strong></div>
          <div class="doc-info-item"><label>Salario Normal Diario (Art. 121)</label><strong>${fmt(salDiario)}</strong></div>
        </div>
      </div>

      <div class="doc-section">
        <h3 class="doc-section-title">
          Liquidación de Vacaciones y Bono Vacacional
          <span class="law-ref">LOTTT Capítulo IX · Art. 121, 190 y 192</span>
        </h3>
        <p style="font-size:11.5px;margin:0 0 8px;color:#334155;">
          <strong>Criterio Salarial (Art. 121 LOTTT):</strong> ${esc(vData.baseSal.criterio)}.
        </p>
        <table class="doc-table">
          <thead>
            <tr>
              <th>Concepto</th>
              <th class="num" style="width:95px;">Días</th>
              <th class="num" style="width:125px;">Salario Diario</th>
              <th class="num" style="width:135px;">Importe (${esc(cur)})</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Vacaciones Base (Art. 190 LOTTT)</td><td class="num">${diasBase} días</td><td class="num">${fmt(salDiario)}</td><td class="num">${fmt(montoVacBase)}</td></tr>
            <tr><td>Días Adicionales de Vacaciones (+1 día/año desde el 2.º año, máx. 15)</td><td class="num">${diasAdic} días</td><td class="num">${fmt(salDiario)}</td><td class="num">${fmt(montoVacAdic)}</td></tr>
            <tr><td>Bono Vacacional Base (Art. 192 LOTTT)</td><td class="num">${diasBase} días</td><td class="num">${fmt(salDiario)}</td><td class="num">${fmt(montoBonoBase)}</td></tr>
            <tr><td>Días Adicionales de Bono Vacacional (+1 día/año, máx. 15)</td><td class="num">${diasAdic} días</td><td class="num">${fmt(salDiario)}</td><td class="num">${fmt(montoBonoAdic)}</td></tr>
            <tr class="total-row">
              <td>TOTAL BRUTO VACACIONES Y BONO VACACIONAL</td>
              <td class="num">${diasTotales * 2} días</td>
              <td class="num">—</td>
              <td class="num">${fmt(totalBruto)}</td>
            </tr>
            ${dedFaovVac > 0 ? `<tr><td colspan="3">Retención FAOV (1%)</td><td class="num">- ${fmt(dedFaovVac)}</td></tr>` : ''}
            ${otrasDedVac > 0 ? `<tr><td colspan="3">Otras Deducciones Autorizadas</td><td class="num">- ${fmt(otrasDedVac)}</td></tr>` : ''}
            <tr class="grand-total">
              <td colspan="3">TOTAL NETO A RECIBIR ANTES DEL INICIO DEL DISFRUTE</td>
              <td class="num">${fmt(totalNeto)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="doc-summary-boxes" style="grid-template-columns:repeat(3,1fr);">
        <div class="doc-summary-box">
          <small>Vacaciones (${diasTotales} días hábiles)</small>
          <strong>${fmt(totalVacaciones)}</strong>
        </div>
        <div class="doc-summary-box">
          <small>Bono Vacacional (${diasTotales} días)</small>
          <strong>${fmt(totalBono)}</strong>
        </div>
        <div class="doc-summary-box highlight">
          <small>Total Neto a Pagar</small>
          <strong>${fmt(totalNeto)}</strong>
        </div>
      </div>

      ${obs ? `<p style="font-size:11.5px;margin:12px 0 0;color:#334155;"><strong>Observaciones:</strong> ${esc(obs)}</p>` : ''}

      <p style="font-size:11.5px;margin:14px 0 0;color:#334155;">
        El trabajador declara recibir oportunamente antes del inicio de su descanso remunerado el pago correspondiente a <strong>${diasTotales} días hábiles de vacaciones</strong> y <strong>${diasTotales} días de bono vacacional</strong> por el período <strong>${esc(periodoTitulo)}</strong>, comprometiéndose a disfrutar efectivamente su período de descanso irrenunciable conforme a los artículos 190 al 196 de la LOTTT.
      </p>

      ${getSignatures(worker, 'Firma del Trabajador (Recibí Conforme y Notificado)', 'Autorizado por el Patrono / RRHH')}

      <div class="doc-legal-footer">
        <strong>Naturaleza Jurídica (LOTTT Art. 190–196):</strong> Las vacaciones constituyen un derecho social irrenunciable de descanso remunerado que no puede ser sustituido por pago salvo al finalizar la relación laboral. El pago debe realizarse al inicio del disfrute.
      </div>
    `;
  }

  /* ========================================================================
     4. LIQUIDACIÓN PARCIAL (ANTICIPO DE PRESTACIONES ART. 144 LOTTT)
     ======================================================================== */
  function renderPartialLiquidation(worker, calc, options) {
    const o = options || {};
    const cur = worker.moneda || 'Bs.';
    const fmt = (v) => global.NominaCalc.formatMoney(v, cur);
    const fmtD = (v) => global.NominaCalc.formatDateVE(v);
    const fullName = `${worker.nombre || ''} ${worker.apellido || ''}`.trim();

    const liq = global.NominaCalc.calculatePrestacionesAndLiquidacion(worker, calc, o);
    const motivoTexto = MOTIVO_ANTICIPO_LABELS[o.motivoAnticipo] || MOTIVO_ANTICIPO_LABELS.vivienda;

    return `
      ${getDocHeader(worker, 'LIQUIDACIÓN PARCIAL · ' + (worker.codigoExpediente || 'EXP'), 'Fecha de Corte: ' + fmtD(liq.fechaCorteLiq))}

      <div class="doc-title-bar">
        Comprobante de Liquidación Parcial y Anticipo de Prestaciones Sociales (Art. 144 LOTTT)
      </div>

      <div class="doc-section">
        <div class="doc-info-grid">
          <div class="doc-info-item"><label>Trabajador</label><strong>${esc(fullName)}</strong></div>
          <div class="doc-info-item"><label>Cédula de Identidad</label><strong>${esc(worker.cedula)}</strong></div>
          <div class="doc-info-item"><label>Cargo</label><strong>${esc(worker.cargo || 'No especificado')}</strong></div>
          <div class="doc-info-item"><label>Fecha de Ingreso</label><strong>${esc(fmtD(worker.fechaIngreso))}</strong></div>
          <div class="doc-info-item"><label>Fecha de Corte</label><strong>${esc(fmtD(liq.fechaCorteLiq))}</strong></div>
          <div class="doc-info-item"><label>Tiempo de Servicio</label><strong>${esc(liq.serviceTime.text)}</strong></div>
          <div class="doc-info-item"><label>Salario Normal Diario</label><strong>${fmt(liq.salNormalDiario)}</strong></div>
          <div class="doc-info-item"><label>Salario Integral Diario</label><strong>${fmt(liq.salIntegralDiario)}</strong></div>
          <div class="doc-info-item"><label>Límite Legal Art. 144</label><strong>Hasta 75% de Garantía</strong></div>
        </div>
      </div>

      <div class="doc-section">
        <h3 class="doc-section-title">
          1. Estado de la Garantía de Prestaciones Sociales Acumulada
          <span class="law-ref">Art. 142 lit. a y b LOTTT</span>
        </h3>
        <table class="doc-table">
          <thead>
            <tr>
              <th>Concepto de Garantía</th>
              <th>Detalle / Cálculo</th>
              <th class="num" style="width:140px;">Monto (${esc(cur)})</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Garantía Trimestral Acumulada</td><td>${esc(liq.detalleGarantiaA)} × ${fmt(liq.salIntegralDiario)}/día</td><td class="num">${fmt(liq.montoGarantiaTrimestral)}</td></tr>
            <tr><td>Días Adicionales Acumulativos (Art. 142 lit. b)</td><td>${liq.diasAdicionalesGarantia} día(s) adicional(es) después del 1er año × ${fmt(liq.salIntegralDiario)}/día</td><td class="num">${fmt(liq.montoDiasAdicionalesGarantia)}</td></tr>
            <tr class="total-row"><td colspan="2">TOTAL GARANTÍA DE PRESTACIONES SOCIALES ACREDITADA</td><td class="num">${fmt(liq.totalGarantiaAcumulada)}</td></tr>
            ${liq.anticiposPrevios > 0 ? `<tr><td colspan="2">Menos: Anticipos de Prestaciones Otorgados Previamente</td><td class="num">- ${fmt(liq.anticiposPrevios)}</td></tr>` : ''}
            <tr><td colspan="2"><strong>Saldo Disponible de Garantía de Prestaciones Sociales</strong></td><td class="num"><strong>${fmt(liq.saldoGarantiaDisponible)}</strong></td></tr>
            <tr><td colspan="2">Tope Máximo Permitido de Anticipo (75% Art. 144 LOTTT)</td><td class="num">${fmt(liq.maximoAnticipo75)}</td></tr>
          </tbody>
        </table>
      </div>

      <div class="doc-section">
        <h3 class="doc-section-title">
          2. Desglose de la Liquidación Parcial a Entregar
          <span class="law-ref">Art. 144 LOTTT</span>
        </h3>
        <p style="font-size:11.5px;margin:0 0 8px;color:#334155;">
          <strong>Motivo legal declarado:</strong> ${esc(motivoTexto)}.
        </p>
        <table class="doc-table">
          <thead>
            <tr>
              <th>Concepto a Liquidar Parcialmente</th>
              <th>Detalle</th>
              <th class="num" style="width:140px;">Importe (${esc(cur)})</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Anticipo de Prestaciones Sociales</td>
              <td>${o.montoAnticipoManual > 0 ? 'Monto específico solicitado (dentro del tope 75%)' : `${liq.porcentajeSolicitado}% del saldo disponible de garantía`}</td>
              <td class="num">${fmt(liq.montoAnticipoParcial)}</td>
            </tr>
            ${liq.interesesPrestaciones > 0 ? `<tr><td>Intereses sobre Prestaciones Sociales (Art. 143)</td><td>Intereses acumulados liquidados</td><td class="num">${fmt(liq.interesesPrestaciones)}</td></tr>` : ''}
            ${o.incluirVacEnParcial && liq.montoVacVencidas > 0 ? `<tr><td>Vacaciones Vencidas Pendientes</td><td>Pasivo vacacional registrado en expediente</td><td class="num">${fmt(liq.montoVacVencidas)}</td></tr>` : ''}
            ${o.incluirVacEnParcial && liq.montoVacFraccionadas > 0 ? `<tr><td>Vacaciones y Bono Fraccionados</td><td>${liq.vacCalc.monthsInCurrentYear} mes(es) del año en curso</td><td class="num">${fmt(liq.montoVacFraccionadas)}</td></tr>` : ''}
            <tr class="grand-total">
              <td colspan="2">TOTAL NETO A ENTREGAR POR LIQUIDACIÓN PARCIAL</td>
              <td class="num">${fmt(liq.totalLiquidacionParcial)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="doc-summary-boxes" style="grid-template-columns:repeat(3,1fr);">
        <div class="doc-summary-box">
          <small>Garantía Disponible Previa</small>
          <strong>${fmt(liq.saldoGarantiaDisponible)}</strong>
        </div>
        <div class="doc-summary-box highlight">
          <small>Anticipo / Liquidación Parcial</small>
          <strong>${fmt(liq.totalLiquidacionParcial)}</strong>
        </div>
        <div class="doc-summary-box">
          <small>Saldo Remanente Garantía</small>
          <strong>${fmt(Math.max(0, liq.saldoGarantiaDisponible - liq.montoAnticipoParcial))}</strong>
        </div>
      </div>

      <p style="font-size:11.5px;margin:14px 0 0;color:#334155;">
        Yo, <strong>${esc(fullName)}</strong>, titular de la C.I. <strong>${esc(worker.cedula)}</strong>, hago constar que recibo a entera satisfacción de <strong>${esc(worker.empresaNombre || 'la empresa')}</strong> la cantidad de <strong>${fmt(liq.totalLiquidacionParcial)}</strong> por concepto de anticipo / liquidación parcial conforme al artículo 144 de la LOTTT, continuando vigente mi relación laboral sin interrupción de antigüedad.
      </p>

      ${getSignatures(worker, 'Firma del Trabajador (Recibí Conforme)', 'Aprobado por el Patrono / RRHH')}

      <div class="doc-legal-footer">
        <strong>Base Legal:</strong> Artículos 142, 143 y 144 de la LOTTT. El anticipo de prestaciones sociales hasta el 75% de lo depositado o acreditado es imputable al cálculo definitivo al término de la relación de trabajo y no interrumpe la antigüedad laboral.
      </div>
    `;
  }

  /* ========================================================================
     5. LIQUIDACIÓN DEFINITIVA Y FINIQUITO (ART. 142, 92, 196, 131 LOTTT)
     ======================================================================== */
  function renderFinalLiquidation(worker, calc, options) {
    const o = options || {};
    const cur = worker.moneda || 'Bs.';
    const fmt = (v) => global.NominaCalc.formatMoney(v, cur);
    const fmtN = (v, d) => global.NominaCalc.formatNumber(v, d);
    const fmtD = (v) => global.NominaCalc.formatDateVE(v);
    const fullName = `${worker.nombre || ''} ${worker.apellido || ''}`.trim();

    const liq = global.NominaCalc.calculatePrestacionesAndLiquidacion(worker, calc, o);
    const motivoTxt = MOTIVO_EGRESO_LABELS[o.motivoEgreso] || MOTIVO_EGRESO_LABELS.renuncia;

    return `
      ${getDocHeader(worker, 'LIQUIDACIÓN DEFINITIVA · ' + (worker.codigoExpediente || 'EXP'), 'Fecha de Egreso: ' + fmtD(liq.fechaCorteLiq))}

      <div class="doc-title-bar">
        Planilla de Liquidación Definitiva y Finiquito de Prestaciones Sociales (Art. 142 LOTTT)
      </div>

      <div class="doc-section">
        <div class="doc-info-grid">
          <div class="doc-info-item"><label>Apellidos y Nombres</label><strong>${esc(fullName)}</strong></div>
          <div class="doc-info-item"><label>Cédula de Identidad</label><strong>${esc(worker.cedula)}</strong></div>
          <div class="doc-info-item"><label>Cargo Desempeñado</label><strong>${esc(worker.cargo || 'No especificado')}</strong></div>
          <div class="doc-info-item"><label>Fecha de Ingreso</label><strong>${esc(fmtD(worker.fechaIngreso))}</strong></div>
          <div class="doc-info-item"><label>Fecha de Egreso</label><strong>${esc(fmtD(liq.fechaCorteLiq))}</strong></div>
          <div class="doc-info-item"><label>Tiempo Total de Servicio</label><strong>${esc(liq.serviceTime.text)} (${liq.serviceTime.totalDays} días)</strong></div>
          <div class="doc-info-item"><label>Último Salario Normal Diario</label><strong>${fmt(liq.salNormalDiario)}</strong></div>
          <div class="doc-info-item"><label>Último Salario Integral Diario</label><strong>${fmt(liq.salIntegralDiario)}</strong></div>
          <div class="doc-info-item"><label>Causa de Terminación</label><strong>${esc(motivoTxt)}</strong></div>
        </div>
      </div>

      <div class="doc-section">
        <h3 class="doc-section-title">
          1. Comparación Legal de Prestaciones Sociales (Aplica el Monto Mayor)
          <span class="law-ref">Art. 142 literales a, b, c y d LOTTT</span>
        </h3>
        <table class="doc-table">
          <thead>
            <tr>
              <th>Método de Cálculo Legal</th>
              <th>Detalle de Días y Base Integral (${fmt(liq.salIntegralDiario)}/día)</th>
              <th class="num" style="width:140px;">Monto (${esc(cur)})</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Opción A — Garantía Acumulada (lit. a y b)</strong></td>
              <td>${esc(liq.detalleGarantiaA)} (${fmt(liq.montoGarantiaTrimestral)}) + ${liq.diasAdicionalesGarantia} días adic. (${fmt(liq.montoDiasAdicionalesGarantia)})</td>
              <td class="num">${fmt(liq.totalGarantiaAcumulada)}</td>
            </tr>
            <tr>
              <td><strong>Opción B — Cálculo Retroactivo (lit. c)</strong></td>
              <td>${liq.aniosRetroactivos} año(s) computables ${liq.fraccionMayor6Meses ? '(incl. fracción > 6 meses)' : ''} × 30 días = ${liq.diasRetroactivo} días</td>
              <td class="num">${fmt(liq.montoRetroactivo)}</td>
            </tr>
            <tr class="total-row">
              <td colspan="2">PRESTACIONES SOCIALES APLICABLES (ART. 142 LIT. D — MONTO MÁS FAVORABLE): ${esc(liq.metodoAplicado)}</td>
              <td class="num">${fmt(liq.prestacionesBrutas)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="doc-section">
        <h3 class="doc-section-title">
          2. Desglose Completo de Conceptos de Liquidación Definitiva
          <span class="law-ref">Art. 92, 131, 142, 143, 190–196 LOTTT</span>
        </h3>
        <table class="doc-table">
          <thead>
            <tr>
              <th>Concepto</th>
              <th>Detalle / Fundamento</th>
              <th class="num" style="width:130px;">Asignaciones</th>
              <th class="num" style="width:130px;">Deducciones</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Prestaciones Sociales (Art. 142 lit. d)</td>
              <td>${esc(liq.metodoAplicado)}</td>
              <td class="num">${fmt(liq.prestacionesBrutas)}</td>
              <td class="num">—</td>
            </tr>
            ${liq.anticiposPrevios > 0 ? `
              <tr>
                <td>Menos: Anticipos de Prestaciones Sociales (Art. 144)</td>
                <td>Anticipos recibidos durante la relación laboral</td>
                <td class="num">—</td>
                <td class="num">${fmt(liq.anticiposPrevios)}</td>
              </tr>
            ` : ''}
            ${liq.interesesPrestaciones > 0 ? `
              <tr>
                <td>Intereses sobre Prestaciones Sociales (Art. 143)</td>
                <td>Intereses acumulados pendientes de pago</td>
                <td class="num">${fmt(liq.interesesPrestaciones)}</td>
                <td class="num">—</td>
              </tr>
            ` : ''}
            ${liq.esDespidoInjustificado ? `
              <tr>
                <td><strong>Indemnización por Terminación Injustificada (Art. 92 LOTTT)</strong></td>
                <td>Monto adicional equivalente a las prestaciones sociales</td>
                <td class="num">${fmt(liq.indemnizacionArt92)}</td>
                <td class="num">—</td>
              </tr>
            ` : ''}
            ${liq.montoVacVencidas > 0 ? `
              <tr>
                <td>Vacaciones y Bono Vacacional Vencidos No Disfrutados</td>
                <td>Art. 190, 192 y 195 LOTTT (${liq.vacCalc.periodosCausados + liq.vacCalc.periodosNoDisfrutados} período(s) pendiente(s))</td>
                <td class="num">${fmt(liq.montoVacVencidas)}</td>
                <td class="num">—</td>
              </tr>
            ` : ''}
            ${liq.montoVacFraccionadas > 0 ? `
              <tr>
                <td>Vacaciones y Bono Vacacional Fraccionados (Art. 196)</td>
                <td>${liq.vacCalc.monthsInCurrentYear} mes(es) completo(s) del año en curso (${fmtN(liq.vacCalc.diasFraccionadosVac + liq.vacCalc.diasFraccionadosBono, 2)} días)</td>
                <td class="num">${fmt(liq.montoVacFraccionadas)}</td>
                <td class="num">—</td>
              </tr>
            ` : ''}
            ${liq.montoUtilidadesPendientes > 0 ? `
              <tr>
                <td>Utilidades Fraccionadas / Pendientes (Art. 131 LOTTT)</td>
                <td>${calc.utilitiesData.mesesLaborados} mes(es) laborados en el ejercicio (descontando anticipos)</td>
                <td class="num">${fmt(liq.montoUtilidadesPendientes)}</td>
                <td class="num">—</td>
              </tr>
            ` : ''}
            ${liq.montoSalarioPendiente > 0 ? `
              <tr>
                <td>Días de Salario Pendientes del Último Mes</td>
                <td>${fmtN(liq.diasSalarioPendientes, 1)} día(s) × ${fmt(liq.salNormalDiario)}</td>
                <td class="num">${fmt(liq.montoSalarioPendiente)}</td>
                <td class="num">—</td>
              </tr>
            ` : ''}
            ${liq.retencionIncesUtilidades > 0 ? `
              <tr>
                <td>Retención INCES sobre Utilidades (0,5%)</td>
                <td>Art. 50 Ley INCES (entidad con ≥5 trabajadores)</td>
                <td class="num">—</td>
                <td class="num">${fmt(liq.retencionIncesUtilidades)}</td>
              </tr>
            ` : ''}
            ${liq.deduccionesFinales > 0 ? `
              <tr>
                <td>Otras Deducciones Finales Autorizadas</td>
                <td>Préstamos / saldos pendientes</td>
                <td class="num">—</td>
                <td class="num">${fmt(liq.deduccionesFinales)}</td>
              </tr>
            ` : ''}
            <tr class="total-row">
              <td colspan="2">SUBTOTALES DE LIQUIDACIÓN DEFINITIVA</td>
              <td class="num">${fmt(liq.totalAsignacionesDefinitiva + liq.anticiposPrevios)}</td>
              <td class="num">${fmt(liq.totalDeduccionesDefinitiva + liq.anticiposPrevios)}</td>
            </tr>
            <tr class="grand-total">
              <td colspan="3">TOTAL NETO A PAGAR POR LIQUIDACIÓN DEFINITIVA Y FINIQUITO</td>
              <td class="num">${fmt(liq.totalNetoDefinitiva)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p style="font-size:11.5px;margin:14px 0 0;color:#334155;">
        <strong>ACTA DE FINIQUITO:</strong> Yo, <strong>${esc(fullName)}</strong>, titular de la Cédula de Identidad N.º <strong>${esc(worker.cedula)}</strong>, declaro haber recibido de <strong>${esc(worker.empresaNombre || 'la entidad de trabajo')}</strong> la cantidad neta de <strong>${fmt(liq.totalNetoDefinitiva)}</strong> por concepto de liquidación definitiva de prestaciones sociales, vacaciones, bono vacacional, utilidades y demás derechos derivados de la relación de trabajo concluida en fecha <strong>${esc(fmtD(liq.fechaCorteLiq))}</strong>, otorgando el más amplio recibo de pago conforme al artículo 142 de la LOTTT (dentro del plazo legal de 5 días siguientes a la terminación).
      </p>

      ${getSignatures(worker, 'Firma del Trabajador (Recibí Conforme y Huella)', 'Representante Legal / RRHH (Sello de la Empresa)')}

      <div class="doc-legal-footer">
        <strong>Fundamento Legal:</strong> Artículos 19, 92, 104, 106, 131–140, 142, 143, 144, 151 y 190–196 de la LOTTT; Art. 50 Ley INCES. Las prestaciones sociales y demás créditos laborales gozan de privilegio absoluto sobre otras deudas del patrono (Art. 151 LOTTT).
      </div>
    `;
  }

  /* ========================================================================
     DESPACHADOR MAESTRO DE DOCUMENTOS
     ======================================================================== */
  function renderDocument(docType, worker, calc, options) {
    switch (docType) {
      case 'recibo_mensual':
        return renderPeriodicReceipt(worker, calc, 'mensual', options);
      case 'recibo_quincenal':
        return renderPeriodicReceipt(worker, calc, 'quincenal', options);
      case 'recibo_semanal':
        return renderPeriodicReceipt(worker, calc, 'semanal', options);
      case 'recibo_vacaciones':
        return renderVacationReceipt(worker, calc, options);
      case 'liquidacion_parcial':
        return renderPartialLiquidation(worker, calc, options);
      case 'liquidacion_definitiva':
        return renderFinalLiquidation(worker, calc, options);
      case 'resumen_integral':
      default:
        return renderPrintSummary(worker, calc, options);
    }
  }

  global.NominaPrint = {
    renderPrintSummary,
    renderPeriodicReceipt,
    renderVacationReceipt,
    renderPartialLiquidation,
    renderFinalLiquidation,
    renderDocument
  };
})(window);
