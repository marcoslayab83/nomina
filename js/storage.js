/**
 * NOMINA — Capa de Persistencia (LocalStorage + Respaldo JSON + Casos de Estudio PDF)
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'nomina_expedientes_v1';
  const COMPANY_KEY = 'nomina_empresa_v1';
  const COMPANIES_KEY = 'nomina_empresas_v2';

  function generateId(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function todayISO() {
    const now = new Date();
    return [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ].join('-');
  }

  function currentMonthISO() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  function getDefaultCompany() {
    return {
      id: 'emp_default',
      nombre: 'EMPRESA, C.A.',
      rif: 'J-00000000-0',
      direccion: 'Venezuela',
      creadaEn: todayISO()
    };
  }

  function loadCompany() {
    try {
      const raw = localStorage.getItem(COMPANY_KEY);
      if (!raw) return getDefaultCompany();
      return { ...getDefaultCompany(), ...JSON.parse(raw) };
    } catch (e) {
      return getDefaultCompany();
    }
  }

  function saveCompany(company) {
    localStorage.setItem(COMPANY_KEY, JSON.stringify({ ...getDefaultCompany(), ...company }));
  }

  /* ---------- Gestión Multi-Empresa / Carpetas por Empresa ---------- */
  function loadCompanies() {
    let list = [];
    try {
      const raw = localStorage.getItem(COMPANIES_KEY);
      if (raw) list = JSON.parse(raw);
    } catch (e) {
      list = [];
    }

    if (!Array.isArray(list) || list.length === 0) {
      const def = loadCompany();
      list = [{
        id: def.id || 'emp_default',
        nombre: def.nombre || 'EMPRESA, C.A.',
        rif: def.rif || 'J-00000000-0',
        direccion: def.direccion || 'Venezuela',
        creadaEn: def.creadaEn || todayISO()
      }];
    }

    // Asegurar que cada empresa tenga ID válido
    list.forEach((c) => {
      if (!c.id) c.id = generateId('emp');
      if (!c.creadaEn) c.creadaEn = todayISO();
    });

    // Auto-descubrir nombres de empresas en expedientes ya creados
    let changed = false;
    try {
      const rawExp = localStorage.getItem(STORAGE_KEY);
      const exps = rawExp ? JSON.parse(rawExp) : [];
      if (Array.isArray(exps)) {
        const known = new Set(list.map((c) => String(c.nombre || '').trim().toLowerCase()));
        exps.forEach((e) => {
          const empName = String(e.empresaNombre || '').trim();
          if (empName && !known.has(empName.toLowerCase())) {
            list.push({
              id: generateId('emp'),
              nombre: empName,
              rif: e.empresaRif || 'J-00000000-0',
              direccion: e.empresaDireccion || 'Venezuela',
              creadaEn: todayISO()
            });
            known.add(empName.toLowerCase());
            changed = true;
          }
        });
      }
    } catch (err) {}

    if (changed) {
      saveCompanies(list);
    }

    return list;
  }

  function saveCompanies(companies) {
    localStorage.setItem(COMPANIES_KEY, JSON.stringify(companies));
  }

  function saveCompanyRecord(comp) {
    const list = loadCompanies();
    const idx = list.findIndex((c) => c.id === comp.id);
    let saved;
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...comp, actualizadoEn: todayISO() };
      saved = list[idx];
    } else {
      saved = {
        id: comp.id || generateId('emp'),
        nombre: String(comp.nombre || 'NUEVA EMPRESA, C.A.').trim(),
        rif: String(comp.rif || 'J-00000000-0').trim().toUpperCase(),
        direccion: String(comp.direccion || 'Venezuela').trim(),
        creadaEn: comp.creadaEn || todayISO()
      };
      list.push(saved);
    }
    saveCompanies(list);
    saveCompany({ nombre: saved.nombre, rif: saved.rif, direccion: saved.direccion });
    return saved;
  }

  function deleteCompanyRecord(id) {
    let list = loadCompanies();
    if (list.length <= 1) {
      throw new Error('Debe existir al menos una carpeta de empresa en el sistema.');
    }
    const target = list.find((c) => c.id === id);
    if (!target) return false;

    // Verificar si tiene expedientes asociados
    const exps = loadAll();
    const count = exps.filter((e) => e.empresaId === id || (e.empresaNombre && e.empresaNombre.toLowerCase() === target.nombre.toLowerCase())).length;
    if (count > 0) {
      throw new Error(`No se puede eliminar la carpeta "${target.nombre}" porque contiene ${count} expediente(s). Reasigna los trabajadores a otra empresa primero.`);
    }

    list = list.filter((c) => c.id !== id);
    saveCompanies(list);
    return true;
  }

  function getCompanyById(id) {
    if (!id) return null;
    return loadCompanies().find((c) => c.id === id) || null;
  }

  function createEmptySalaryRecord(periodo, sueldoBase) {
    return {
      id: generateId('sal'),
      periodo: periodo || currentMonthISO(),
      sueldoBase: Number(sueldoBase) || 0,
      comisionesHabituales: 0,
      primasFijas: 0,
      bonosRegulares: 0,
      viaticosSinRendicion: 0,
      jornadasNocturnas: 0,
      horasExtrasDiurnas: 0,
      horasExtrasNocturnas: 0,
      diasFeriados: 0,
      cestaticket: 0,
      ayudaTransporte: 0,
      becasEducativas: 0,
      herramientasUniformes: 0,
      indemnizaciones: 0,
      prestamos: 0,
      polizas: 0,
      ahorros: 0,
      otrasDeducciones: 0,
      observaciones: ''
    };
  }

  function createExpediente(initial) {
    const data = initial || {};
    const hoy = todayISO();
    const mesActual = currentMonthISO();
    const sueldoIni = Number(data.sueldoBase) || 0;
    const salarioActual = createEmptySalaryRecord(mesActual, sueldoIni);
    
    let company = null;
    if (data.empresaId) {
      company = getCompanyById(data.empresaId);
    }
    if (!company && data.empresaNombre) {
      company = loadCompanies().find((c) => c.nombre.toLowerCase() === String(data.empresaNombre).trim().toLowerCase());
    }
    if (!company) {
      company = loadCompanies()[0] || getDefaultCompany();
    }

    const exp = {
      id: generateId('exp'),
      codigoExpediente: 'EXP-' + String(Math.floor(100000 + Math.random() * 900000)),
      creadoEn: new Date().toISOString(),
      actualizadoEn: new Date().toISOString(),

      // Identificación obligatoria inicial
      nombre: String(data.nombre || '').trim(),
      apellido: String(data.apellido || '').trim(),
      cedula: String(data.cedula || '').trim().toUpperCase(),

      // Datos laborales
      cargo: String(data.cargo || '').trim(),
      departamento: String(data.departamento || '').trim(),
      fechaIngreso: data.fechaIngreso || hoy,
      fechaCorte: data.fechaCorte || hoy,
      tipoContrato: data.tipoContrato || 'indeterminado', // indeterminado | determinado | obra | honorarios_subordinacion
      modalidadSalario: data.modalidadSalario || 'tiempo', // tiempo | obra | comision | mixto
      tipoSalarioVacaciones: data.tipoSalarioVacaciones || 'fijo', // fijo | variable
      moneda: data.moneda || 'Bs.',
      riesgoIvss: data.riesgoIvss || 'minimo', // minimo | medio | maximo
      aplicaInces: data.aplicaInces !== undefined ? Boolean(data.aplicaInces) : true,
      entidadSinFinesLucro: Boolean(data.entidadSinFinesLucro),
      beneficiosRegularizados: Number(data.beneficiosRegularizados) || 0,

      // Datos de la entidad de trabajo (hereda de la empresa/carpeta seleccionada)
      empresaId: company.id || 'emp_default',
      empresaNombre: data.empresaNombre || company.nombre,
      empresaRif: data.empresaRif || company.rif,
      empresaDireccion: data.empresaDireccion || company.direccion,

      // Estructura jerárquica
      reportaA: {
        nombre: '',
        cedula: '',
        cargo: '',
        departamento: ''
      },
      personalACargo: [],

      // Salario del período activo + historial de sueldos devengados
      salarioActual,
      sueldosHistorial: sueldoIni > 0 ? [{ ...salarioActual, id: generateId('hist') }] : [],

      // Vacaciones pagadas, disfrutadas y causadas
      vacacionesHistorial: [],

      // Configuración Utilidades (Art. 131-140 LOTTT)
      utilidadesConfig: {
        modo: 'dias', // dias | beneficios_liquidos
        diasConvenidos: 30,
        mesesLaborados: 12,
        utilidadLiquidaEmpresa: 0,
        totalSalariosEmpresa: 0,
        salarioAnualTrabajador: 0,
        anticipoDiciembre: 0
      },

      // Configuración Parafiscales (IVSS, FAOV, INCES)
      parafiscalesConfig: {
        periodoMes: mesActual,
        usarLunesManual: false,
        lunesManual: 4,
        aplicarTopeIvss: false,
        topeIvssMonto: 0,
        faovBaseModo: 'integral', // integral | normal
        incesUsarPersonalizado: false,
        incesSueldosTrimestre: 0,
        incesBonificacionesTrimestre: 0,
        incesVacacionesTrimestre: 0,
        incesOtrasTrimestre: 0
      },

      notasExpediente: ''
    };

    return exp;
  }

  function loadAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('Error leyendo expedientes de localStorage:', e);
      return [];
    }
  }

  function saveAll(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  function upsertExpediente(exp) {
    const list = loadAll();
    exp.actualizadoEn = new Date().toISOString();
    const idx = list.findIndex((item) => item.id === exp.id);
    if (idx >= 0) {
      list[idx] = exp;
    } else {
      list.unshift(exp);
    }
    saveAll(list);
    return exp;
  }

  function deleteExpediente(id) {
    const list = loadAll().filter((item) => item.id !== id);
    saveAll(list);
    return list;
  }

  function getById(id) {
    return loadAll().find((item) => item.id === id) || null;
  }

  function findByCedula(cedula, excludeId) {
    const clean = String(cedula || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (!clean) return null;
    return loadAll().find((item) => {
      if (excludeId && item.id === excludeId) return false;
      const itemClean = String(item.cedula || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      return itemClean === clean;
    }) || null;
  }

  /**
   * Genera casos de estudio exactos de las presentaciones del Dr. Alexander Hernández
   * para demostración y verificación inmediata.
   */
  function buildSampleCaseStudies() {
    // Caso 1: Edith Raiza Sabariego Lara (PDF 1 p.19 + 5 años vacaciones + estructura)
    const caso1 = createExpediente({
      nombre: 'Edith Raiza',
      apellido: 'Sabariego Lara',
      cedula: 'V-14.820.415',
      cargo: 'Coordinadora de Administración y Finanzas',
      departamento: 'Administración y Contabilidad',
      fechaIngreso: '2021-10-01',
      fechaCorte: '2026-10-31',
      sueldoBase: 11500,
      moneda: 'Bs.',
      riesgoIvss: 'minimo',
      empresaNombre: 'HERNÁNDEZ DUARTE & ASOCIADOS, C.A.',
      empresaRif: 'J-31245678-9',
      empresaDireccion: 'Caracas, Distrito Capital, Venezuela'
    });
    caso1.codigoExpediente = 'EXP-CASO-001';
    caso1.salarioActual.periodo = '2026-10';
    caso1.salarioActual.jornadasNocturnas = 1;
    caso1.salarioActual.horasExtrasDiurnas = 1;
    caso1.salarioActual.cestaticket = 1600;
    caso1.salarioActual.ayudaTransporte = 450;
    caso1.sueldosHistorial = [
      { ...caso1.salarioActual, id: generateId('hist'), periodo: '2026-10' },
      { ...createEmptySalaryRecord('2026-09', 11500), cestaticket: 1600, ayudaTransporte: 450 },
      { ...createEmptySalaryRecord('2026-08', 11500), cestaticket: 1600, ayudaTransporte: 450 }
    ];
    caso1.reportaA = {
      nombre: 'Dr. Alexander Hernández',
      cedula: 'V-10.250.300',
      cargo: 'Director General',
      departamento: 'Dirección Ejecutiva'
    };
    caso1.personalACargo = [
      { id: generateId('sub'), nombre: 'Carlos Mendoza', cedula: 'V-22.415.908', cargo: 'Analista de Nómina', departamento: 'Administración', fechaIngreso: '2023-03-15' },
      { id: generateId('sub'), nombre: 'María Fernanda Rivas', cedula: 'V-24.102.771', cargo: 'Asistente Contable', departamento: 'Administración', fechaIngreso: '2024-06-01' }
    ];
    caso1.vacacionesHistorial = [
      { id: generateId('vac'), periodoLabel: 'Año 1 (2021-2022)', anioServicio: 1, diasCorrespondientes: 15, diasBono: 15, diasDisfrutados: 15, fechaInicio: '2022-11-01', fechaFin: '2022-11-21', fechaPago: '2022-10-28', salarioDiarioAplicado: 250, montoVacaciones: 3750, montoBono: 3750, estatus: 'disfrutada', observaciones: 'Disfrutadas y pagadas oportunamente' },
      { id: generateId('vac'), periodoLabel: 'Año 2 (2022-2023)', anioServicio: 2, diasCorrespondientes: 16, diasBono: 16, diasDisfrutados: 16, fechaInicio: '2023-11-06', fechaFin: '2023-11-27', fechaPago: '2023-11-03', salarioDiarioAplicado: 300, montoVacaciones: 4800, montoBono: 4800, estatus: 'disfrutada', observaciones: 'Pagado previo al disfrute' },
      { id: generateId('vac'), periodoLabel: 'Año 3 (2023-2024)', anioServicio: 3, diasCorrespondientes: 17, diasBono: 17, diasDisfrutados: 17, fechaInicio: '2024-11-04', fechaFin: '2024-11-26', fechaPago: '2024-11-01', salarioDiarioAplicado: 333.33, montoVacaciones: 5666.67, montoBono: 5666.67, estatus: 'disfrutada', observaciones: 'Disfrutadas completas' },
      { id: generateId('vac'), periodoLabel: 'Año 4 (2024-2025)', anioServicio: 4, diasCorrespondientes: 18, diasBono: 18, diasDisfrutados: 18, fechaInicio: '2025-11-03', fechaFin: '2025-11-26', fechaPago: '2025-10-31', salarioDiarioAplicado: 383.33, montoVacaciones: 6900, montoBono: 6900, estatus: 'disfrutada', observaciones: 'Disfrutadas completas' },
      { id: generateId('vac'), periodoLabel: 'Año 5 (2025-2026)', anioServicio: 5, diasCorrespondientes: 19, diasBono: 19, diasDisfrutados: 0, fechaInicio: '', fechaFin: '', fechaPago: '', salarioDiarioAplicado: 383.3333, montoVacaciones: 7283.33, montoBono: 7283.33, estatus: 'causada', observaciones: 'Pendiente programar disfrute (Art. 190 LOTTT)' }
    ];
    caso1.utilidadesConfig = {
      modo: 'dias',
      diasConvenidos: 60,
      mesesLaborados: 12,
      utilidadLiquidaEmpresa: 0,
      totalSalariosEmpresa: 0,
      salarioAnualTrabajador: 138000,
      anticipoDiciembre: 0
    };
    caso1.parafiscalesConfig.periodoMes = '2026-10';
    caso1.notasExpediente = 'Caso de Estudio Nro. 1 (Cálculo y Procesos de Nómina — Sueldo mensual Bs. 11.500).';

    // Caso 2: Caso Vacaciones 5 años (Bs. 8.000) + Utilidades 15% (Bs. 3.000 / 50.000) -> Caso Estudio Completo 2 (Bs. 500 Oct 2026)
    const caso2 = createExpediente({
      nombre: 'José Antonio',
      apellido: 'Pérez Castillo',
      cedula: 'V-18.640.912',
      cargo: 'Especialista de Operaciones',
      departamento: 'Operaciones',
      fechaIngreso: '2021-01-15',
      fechaCorte: '2026-10-31',
      sueldoBase: 8000,
      moneda: 'Bs.',
      riesgoIvss: 'minimo',
      empresaNombre: 'EMPRESA, C.A.',
      empresaRif: 'J-40123456-7',
      empresaDireccion: 'Valencia, Estado Carabobo, Venezuela'
    });
    caso2.codigoExpediente = 'EXP-CASO-002';
    caso2.salarioActual.periodo = '2026-10';
    caso2.sueldosHistorial = [
      { ...caso2.salarioActual, id: generateId('hist'), periodo: '2026-10' }
    ];
    caso2.reportaA = {
      nombre: 'Edith Raiza Sabariego Lara',
      cedula: 'V-14.820.415',
      cargo: 'Coordinadora de Administración y Finanzas',
      departamento: 'Administración y Contabilidad'
    };
    caso2.vacacionesHistorial = [
      { id: generateId('vac'), periodoLabel: 'Año 5 (2025-2026)', anioServicio: 5, diasCorrespondientes: 19, diasBono: 19, diasDisfrutados: 0, fechaInicio: '', fechaFin: '', fechaPago: '', salarioDiarioAplicado: 266.6667, montoVacaciones: 5066.67, montoBono: 5066.67, estatus: 'no_disfrutada', observaciones: 'Caso Vacaciones PDF (5 años, Bs. 8.000 -> Total Bs. 10.133,33)' }
    ];
    caso2.parafiscalesConfig.periodoMes = '2026-10';
    caso2.notasExpediente = 'Caso de Estudio Vacaciones (5 años de servicio, salario fijo Bs. 8.000 -> 19 días vacaciones + 19 días bono = Bs. 10.133,33).';

    // Caso 3: Caso Utilidades 15% Beneficios Líquidos (PDF 2 p. 33) + Parafiscales
    const caso3 = createExpediente({
      nombre: 'Laura Valentina',
      apellido: 'Gómez Morales',
      cedula: 'V-20.311.584',
      cargo: 'Analista Contable',
      departamento: 'Finanzas',
      fechaIngreso: '2024-01-02',
      fechaCorte: '2025-12-31',
      sueldoBase: 3000,
      moneda: 'Bs.',
      riesgoIvss: 'minimo',
      empresaNombre: 'EMPRESA, C.A.',
      empresaRif: 'J-40123456-7',
      empresaDireccion: 'Caracas, Venezuela'
    });
    caso3.codigoExpediente = 'EXP-CASO-003';
    caso3.salarioActual.periodo = '2025-12';
    caso3.sueldosHistorial = [
      { ...caso3.salarioActual, id: generateId('hist'), periodo: '2025-12' }
    ];
    caso3.utilidadesConfig = {
      modo: 'beneficios_liquidos',
      diasConvenidos: 60,
      mesesLaborados: 12,
      utilidadLiquidaEmpresa: 50000,
      totalSalariosEmpresa: 36000,
      salarioAnualTrabajador: 36000,
      anticipoDiciembre: 6000
    };
    caso3.parafiscalesConfig.periodoMes = '2026-10';
    caso3.parafiscalesConfig.faovBaseModo = 'normal';
    caso3.notasExpediente = 'Caso de Estudio Utilidades (Sueldo Bs. 3.000, Utilidad empresa Bs. 50.000 -> 15% = Bs. 7.500; pagado en mes 12 Bs. 6.000; diferencia Art. 137 = Bs. 1.500).';

    return [caso1, caso2, caso3];
  }

  function exportAllJSON() {
    const payload = {
      app: 'NOMINA',
      version: '2.0',
      exportedAt: new Date().toISOString(),
      company: loadCompany(),
      companies: loadCompanies(),
      expedientes: loadAll()
    };
    return JSON.stringify(payload, null, 2);
  }

  function importJSON(jsonText) {
    const parsed = JSON.parse(jsonText);
    const items = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.expedientes) ? parsed.expedientes : null);
    if (!items) {
      throw new Error('El archivo JSON no contiene expedientes válidos de NOMINA.');
    }
    const existing = loadAll();
    const map = new Map(existing.map((e) => [e.id, e]));
    let added = 0;
    let updated = 0;
    items.forEach((item) => {
      if (!item || !item.nombre || !item.cedula) return;
      if (!item.id) item.id = generateId('exp');
      if (map.has(item.id)) {
        updated++;
      } else {
        added++;
      }
      map.set(item.id, item);
    });
    saveAll(Array.from(map.values()));

    if (Array.isArray(parsed.companies)) {
      parsed.companies.forEach((c) => {
        if (c && c.nombre) saveCompanyRecord(c);
      });
    } else if (parsed.company) {
      saveCompany(parsed.company);
      saveCompanyRecord(parsed.company);
    }
    return { added, updated };
  }

  global.NominaStore = {
    generateId,
    todayISO,
    currentMonthISO,
    loadCompany,
    saveCompany,
    loadCompanies,
    saveCompanies,
    saveCompanyRecord,
    deleteCompanyRecord,
    getCompanyById,
    createEmptySalaryRecord,
    createExpediente,
    loadAll,
    saveAll,
    upsertExpediente,
    deleteExpediente,
    getById,
    findByCedula,
    buildSampleCaseStudies,
    exportAllJSON,
    importJSON
  };
})(window);
