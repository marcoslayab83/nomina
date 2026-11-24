/**
 * NOMINA — Módulo de Carga Masiva (Excel / CSV) y Respaldo Maestro de Base de Datos
 * Compatible con Microsoft Excel, Google Sheets y LibreOffice Calc.
 */
(function (global) {
  'use strict';

  const Store = global.NominaStore;
  const Calc = global.NominaCalc;
  const LocalFS = global.NominaLocalFS;
  const Cur = global.NominaCurrency;

  function getXLSX() {
    return global.XLSX || (typeof window !== 'undefined' ? window.XLSX : undefined);
  }

  /**
   * Limpia y normaliza texto de cabeceras para ser tolerante a errores tipográficos
   */
  function normalizeKey(str) {
    return String(str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  /**
   * Convierte fechas de Excel (números seriales) o textos (DD/MM/AAAA, AAAA-MM-DD) a formato ISO (YYYY-MM-DD)
   */
  function parseDateToISO(val) {
    if (!val) return new Date().toISOString().slice(0, 10);

    // Número serial de fecha de Excel (ej: 45220)
    if (typeof val === 'number') {
      const date = new Date(Math.round((val - 25569) * 86400 * 1000));
      if (!isNaN(date.getTime())) {
        return date.toISOString().slice(0, 10);
      }
    }

    const str = String(val).trim();

    // Formato YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      return str;
    }

    // Formato DD/MM/YYYY o DD-MM-YYYY
    const parts = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (parts) {
      const d = parts[1].padStart(2, '0');
      const m = parts[2].padStart(2, '0');
      const y = parts[3];
      return `${y}-${m}-${d}`;
    }

    // Intento con Date estándar
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }

    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Normaliza la cédula asegurando el prefijo V- o E-
   */
  function normalizeCedula(str) {
    let clean = String(str || '').trim().toUpperCase().replace(/\./g, '').replace(/\s+/g, '');
    if (!clean) return '';
    if (/^[VEJ]-\d+$/.test(clean)) return clean;
    if (/^[VEJ]\d+$/.test(clean)) return `${clean[0]}-${clean.slice(1)}`;
    if (/^\d+$/.test(clean)) return `V-${clean}`;
    return clean;
  }

  /**
   * 1. GENERA Y DESCARGA LA PLANTILLA OFICIAL EN EXCEL (.XLSX)
   */
  function downloadExcelTemplate() {
    const XLSX = getXLSX();
    if (!XLSX) {
      throw new Error('La librería SheetJS (XLSX) no está cargada.');
    }

    const wb = XLSX.utils.book_new();

    // Hoja 1: Trabajadores (Datos para completar)
    const headers = [
      'Nombre',
      'Apellido',
      'Cedula',
      'Empresa',
      'Departamento',
      'Cargo',
      'Fecha_Ingreso',
      'Sueldo_Base',
      'Moneda',
      'Tipo_Salario',
      'Jornada',
      'Reporta_A'
    ];

    const sampleRows = [
      [
        'Carlos',
        'Pérez Laya',
        'V-13270421',
        'Cuadrados Food, C.A.',
        'Departamento de Producción',
        'Estratega de Ventas',
        '2024-10-23',
        320.00,
        'USD',
        'Fijo',
        'Diurna',
        'Gerencia General'
      ],
      [
        'María Elena',
        'Rodríguez Blanco',
        'V-18456123',
        'Cuadrados Food, C.A.',
        'Departamento de Administración',
        'Analista Contable',
        '2023-05-15',
        450.00,
        'USD',
        'Fijo',
        'Diurna',
        'Carlos Pérez'
      ],
      [
        'José Antonio',
        'Hernández Silva',
        'V-22789456',
        'Inversiones del Centro, S.A.',
        'Departamento de Operaciones',
        'Operario de Planta',
        '2022-02-01',
        18500.00,
        'Bs.',
        'Fijo',
        'Mixta',
        'Supervisor de Turno'
      ]
    ];

    const wsTrabajadores = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);

    // Ancho de columnas para visualización clara en Excel
    wsTrabajadores['!cols'] = [
      { wch: 18 }, // Nombre
      { wch: 22 }, // Apellido
      { wch: 15 }, // Cedula
      { wch: 28 }, // Empresa
      { wch: 28 }, // Departamento
      { wch: 24 }, // Cargo
      { wch: 16 }, // Fecha_Ingreso
      { wch: 16 }, // Sueldo_Base
      { wch: 12 }, // Moneda
      { wch: 14 }, // Tipo_Salario
      { wch: 12 }, // Jornada
      { wch: 22 }  // Reporta_A
    ];

    XLSX.utils.book_append_sheet(wb, wsTrabajadores, 'Trabajadores');

    // Hoja 2: Instrucciones de Llenado
    const instruccionesData = [
      ['CAMPO', 'OBLIGATORIO', 'VALORES VÁLIDOS / FORMATO', 'DESCRIPCIÓN Y NOTAS LEGALES LOTTT'],
      ['Nombre', 'SÍ', 'Texto (ej: Carlos)', 'Primer nombre o nombres del trabajador.'],
      ['Apellido', 'SÍ', 'Texto (ej: Pérez Laya)', 'Apellidos completos del trabajador.'],
      ['Cedula', 'SÍ', 'V-12345678 o 12345678', 'Cédula de identidad. Si no colocas prefijo se asume V-.'],
      ['Empresa', 'OPCIONAL', 'Texto (ej: Mi Empresa, C.A.)', 'Nombre de la empresa / carpeta. Si no existe, se creará automáticamente.'],
      ['Departamento', 'OPCIONAL', 'Texto (ej: Producción)', 'Departamento o área operativa.'],
      ['Cargo', 'OPCIONAL', 'Texto (ej: Analista)', 'Cargo o puesto desempeñado.'],
      ['Fecha_Ingreso', 'SÍ', 'AAAA-MM-DD o DD/MM/AAAA', 'Fecha oficial de inicio laboral para el cómputo de antigüedad (Art. 190 y 142 LOTTT).'],
      ['Sueldo_Base', 'SÍ', 'Número (ej: 320 o 18500)', 'Sueldo mensual base pactado en el contrato de trabajo.'],
      ['Moneda', 'SÍ', 'USD, Bs. o EUR', 'Moneda pactada. El sistema calcula en esta moneda y permite conversión universal.'],
      ['Tipo_Salario', 'OPCIONAL', 'Fijo, Mixto o Variable', 'Modalidad de remuneración (por defecto Fijo).'],
      ['Jornada', 'OPCIONAL', 'Diurna, Nocturna o Mixta', 'Tipo de jornada laboral según Art. 173 LOTTT.'],
      ['Reporta_A', 'OPCIONAL', 'Texto (ej: Nombre Supervisor)', 'Nombre del supervisor jerárquico inmediato.']
    ];

    const wsInstrucciones = XLSX.utils.aoa_to_sheet(instruccionesData);
    wsInstrucciones['!cols'] = [
      { wch: 16 },
      { wch: 14 },
      { wch: 30 },
      { wch: 70 }
    ];

    XLSX.utils.book_append_sheet(wb, wsInstrucciones, 'Instrucciones');

    // Generar archivo y forzar descarga
    XLSX.writeFile(wb, 'Plantilla_Carga_Masiva_Trabajadores.xlsx');
    return true;
  }

  /**
   * 2. PROCESA E IMPORTA MASIVAMENTE TRABAJADORES DESDE UN ARCHIVO EXCEL (.XLSX) O CSV
   */
  async function importWorkersFromFile(file) {
    const XLSX = getXLSX();
    if (!XLSX) {
      throw new Error('La librería SheetJS (XLSX) no está cargada.');
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });

          // Buscar pestaña 'Trabajadores' o usar la primera
          const sheetName = workbook.SheetNames.includes('Trabajadores')
            ? 'Trabajadores'
            : workbook.SheetNames[0];

          const worksheet = workbook.Sheets[sheetName];
          if (!worksheet) {
            throw new Error('El archivo Excel no contiene hojas con datos.');
          }

          const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
          if (!Array.isArray(rawRows) || rawRows.length === 0) {
            throw new Error('La hoja de cálculo no contiene filas de datos para importar.');
          }

          // Cargar empresas registradas
          const companies = Store.loadCompanies ? Store.loadCompanies() : [];
          const companyMap = new Map();
          companies.forEach((c) => {
            companyMap.set(c.nombre.toLowerCase().trim(), c);
          });

          let importedCount = 0;
          let updatedCount = 0;
          const errors = [];

          for (let i = 0; i < rawRows.length; i++) {
            const row = rawRows[i];
            const rowNum = i + 2; // Fila física en Excel (1 es cabecera)

            // Mapeo flexible de columnas tolerante a tildes y mayúsculas
            const rowNorm = {};
            Object.keys(row).forEach((k) => {
              rowNorm[normalizeKey(k)] = row[k];
            });

            const nombre = String(rowNorm.nombre || rowNorm.nombres || rowNorm.primer_nombre || '').trim();
            const apellido = String(rowNorm.apellido || rowNorm.apellidos || rowNorm.primer_apellido || '').trim();
            const rawCedula = String(rowNorm.cedula || rowNorm.c_i || rowNorm.ci || rowNorm.documento || '').trim();

            if (!nombre || !apellido || !rawCedula) {
              errors.push(`Fila ${rowNum}: Faltan datos esenciales (Nombre, Apellido o Cédula). Fila omitida.`);
              continue;
            }

            const cedula = normalizeCedula(rawCedula);

            // Sueldo base
            const sueldoBaseRaw = String(rowNorm.sueldo_base || rowNorm.sueldo || rowNorm.salario || rowNorm.salario_base || '0').replace(/[^0-9.,]/g, '').replace(',', '.');
            const sueldoBase = parseFloat(sueldoBaseRaw) || 0;

            // Moneda
            let moneda = 'Bs.';
            const monedaRaw = String(rowNorm.moneda || rowNorm.tipo_moneda || '').trim().toUpperCase();
            if (monedaRaw === 'USD' || monedaRaw === '$' || monedaRaw.includes('DOLAR')) moneda = 'USD';
            else if (monedaRaw === 'EUR' || monedaRaw === '€' || monedaRaw.includes('EURO')) moneda = 'EUR';

            // Empresa / Carpeta
            const empresaNombre = String(rowNorm.empresa || rowNorm.compania || rowNorm.entidad_de_trabajo || 'EMPRENDIMIENTO MARCOS LAYA, C.A.').trim();
            let company = companyMap.get(empresaNombre.toLowerCase());
            if (!company) {
              // Auto-crear carpeta de empresa si es nueva
              company = Store.saveCompanyRecord({
                nombre: empresaNombre,
                rif: 'J-50000000-0',
                direccion: 'Sede Principal'
              });
              companyMap.set(empresaNombre.toLowerCase(), company);
            }

            // Fechas y detalles
            const fechaIngreso = parseDateToISO(rowNorm.fecha_ingreso || rowNorm.ingreso || rowNorm.fecha);
            const departamento = String(rowNorm.departamento || rowNorm.depto || rowNorm.area || 'Departamento de Producción').trim();
            const cargo = String(rowNorm.cargo || rowNorm.puesto || 'Trabajador').trim();
            const tipoSalario = String(rowNorm.tipo_salario || 'fijo').trim().toLowerCase();
            const jornada = String(rowNorm.jornada || 'diurna').trim().toLowerCase();
            const supervisor = String(rowNorm.reporta_a || rowNorm.supervisor || '').trim();

            // Buscar si ya existe el trabajador para actualizarlo o crearlo
            const existing = Store.findByCedula ? Store.findByCedula(cedula) : null;
            let workerData = {};

            if (existing) {
              workerData = {
                ...existing,
                nombre,
                apellido,
                cargo,
                departamento,
                empresaId: company.id,
                empresaNombre: company.nombre,
                fechaIngreso,
                moneda,
                tipoSalario: ['fijo', 'variable', 'mixto'].includes(tipoSalario) ? tipoSalario : 'fijo',
                jornada: ['diurna', 'nocturna', 'mixta'].includes(jornada) ? jornada : 'diurna',
                salarioActual: {
                  ...existing.salarioActual,
                  sueldoBase
                }
              };
              if (supervisor) {
                workerData.reportaA = { nombre: supervisor, cargo: 'Supervisor Inmediato' };
              }
              Store.upsertExpediente(workerData);
              updatedCount++;
            } else {
              workerData = Store.createDefaultExpediente({
                nombre,
                apellido,
                cedula,
                cargo,
                departamento,
                empresaId: company.id,
                empresaNombre: company.nombre,
                fechaIngreso,
                sueldoBase,
                moneda
              });
              if (supervisor) {
                workerData.reportaA = { nombre: supervisor, cargo: 'Supervisor Inmediato' };
              }
              Store.upsertExpediente(workerData);
              importedCount++;
            }
          }

          resolve({
            success: true,
            totalRows: rawRows.length,
            imported: importedCount,
            updated: updatedCount,
            errors
          });
        } catch (err) {
          reject(new Error(`Error al procesar el archivo Excel: ${err.message}`));
        }
      };

      reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * 3. EXPORTA UN RESPALDO MAESTRO COMPLETO (A LA CARPETA EN PC Y/O DESCARGA)
   */
  async function exportMasterBackup(options) {
    const opts = options || {};
    const expedientes = Store.loadAll ? Store.loadAll() : [];
    const companies = Store.loadCompanies ? Store.loadCompanies() : [];
    const rates = Cur && Cur.loadRates ? Cur.loadRates() : null;

    const backupPayload = {
      sistema: 'NOMINA — LOTTT Venezuela',
      version: '2.6',
      fechaRespaldo: new Date().toISOString(),
      fechaRespaldoLegible: new Date().toLocaleString('es-VE'),
      totalExpedientes: expedientes.length,
      totalEmpresas: companies.length,
      tasasCambio: rates,
      empresas: companies,
      expedientes: expedientes
    };

    const jsonString = JSON.stringify(backupPayload, null, 2);
    const dateStr = new Date().toISOString().slice(0, 10);
    const fileNameJson = `RESPALDO_MAESTRO_NOMINA_${dateStr}.json`;

    let pcSaved = false;
    let pcPath = '';

    // A. Guardar en la carpeta vinculada de la PC con File System Access API
    if (LocalFS && LocalFS.isConnected && LocalFS.isConnected()) {
      try {
        const rootHandle = LocalFS._testInjectRoot || (LocalFS.getRootHandle ? LocalFS.getRootHandle() : null);
        // Escribir archivo de respaldo directamente en la raíz de la PC
        if (rootHandle && typeof rootHandle.getFileHandle === 'function') {
          const fileHandle = await rootHandle.getFileHandle('RESPALDO_MAESTRO_NOMINA.json', { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(jsonString);
          await writable.close();
          pcSaved = true;
          pcPath = `${LocalFS.getRootName()}\\RESPALDO_MAESTRO_NOMINA.json`;

          if (opts.includeExcel && typeof XLSX !== 'undefined') {
            try {
              const wb = buildMasterWorkbook(expedientes, companies, rates);
              const excelData = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
              const xHandle = await rootHandle.getFileHandle('RESPALDO_NOMINA_CONSOLIDADO.xlsx', { create: true });
              const xWritable = await xHandle.createWritable();
              await xWritable.write(new Uint8Array(excelData));
              await xWritable.close();
            } catch (xe) {
              console.warn('Error guardando Excel en raíz PC:', xe);
            }
          }
        }
      } catch (err) {
        console.warn('No se pudo guardar automáticamente en la raíz de la PC:', err);
      }
    }

    // B. Descarga del archivo JSON en el navegador
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileNameJson;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);

    // C. Opcional: Generar también descarga tabular en Excel con todos los trabajadores
    if (opts.includeExcel && typeof XLSX !== 'undefined') {
      try {
        exportMasterExcelBackup(expedientes, companies, rates);
      } catch (e) {
        console.warn('Excel backup:', e);
      }
    }

    return {
      success: true,
      totalExpedientes: expedientes.length,
      totalEmpresas: companies.length,
      pcSaved,
      pcPath,
      fileName: fileNameJson
    };
  }

  /**
   * Genera el libro Excel consolidado con todos los datos de la base de datos
   */
  function buildMasterWorkbook(expedientes, companies, rates) {
    const XLSX = getXLSX();
    if (!XLSX) {
      throw new Error('La librería SheetJS (XLSX) no está cargada.');
    }
    const wb = XLSX.utils.book_new();

    // 1. Hoja Trabajadores
    const expRows = (expedientes || []).map((w) => {
      const calc = Calc ? Calc.computeWorkerBenefits(w) : null;
      return {
        'Cédula': w.cedula,
        'Nombre': w.nombre,
        'Apellido': w.apellido,
        'Empresa': w.empresaNombre || 'EMPRESA',
        'Departamento': w.departamento || '',
        'Cargo': w.cargo || '',
        'Fecha Ingreso': w.fechaIngreso,
        'Antigüedad': calc && calc.serviceTime ? calc.serviceTime.text : '',
        'Sueldo Base': w.salarioActual?.sueldoBase || 0,
        'Moneda': w.moneda || 'Bs.',
        'Salario Normal Mensual': calc && calc.salaryData ? calc.salaryData.salarioNormalMensual : 0,
        'Salario Integral Diario': calc && calc.integralData ? calc.integralData.salarioIntegralDiario : 0,
        'Pasivo Vacaciones': calc && calc.vacationsData ? calc.vacationsData.totalPasivoPendiente : 0,
        'Neto Mensual Estimado': calc && calc.parafiscalesData ? calc.parafiscalesData.netoMensualConNoSalarial : 0
      };
    });

    const wsExp = XLSX.utils.json_to_sheet(expRows);
    XLSX.utils.book_append_sheet(wb, wsExp, 'Expedientes_Laborales');

    // 2. Hoja Empresas
    const compRows = (companies || []).map((c) => ({
      'ID': c.id,
      'Nombre Empresa': c.nombre,
      'RIF': c.rif || '',
      'Dirección / Sede': c.direccion || ''
    }));
    const wsComp = XLSX.utils.json_to_sheet(compRows);
    XLSX.utils.book_append_sheet(wb, wsComp, 'Carpetas_Empresas');

    // 3. Hoja Tasas
    if (rates) {
      const ratesRows = [
        { 'Parámetro': 'Tasa Oficial BCV Dólar (USD)', 'Valor (Bs.)': rates.tasaUsd },
        { 'Parámetro': 'Tasa Oficial BCV Euro (EUR)', 'Valor (Bs.)': rates.tasaEur },
        { 'Parámetro': rates.otraNombre || 'Tasa Personalizada', 'Valor (Bs.)': rates.tasaOtra || 0 },
        { 'Parámetro': 'Fecha Valor Oficial', 'Valor (Bs.)': rates.fechaTasa || '' }
      ];
      const wsRates = XLSX.utils.json_to_sheet(ratesRows);
      XLSX.utils.book_append_sheet(wb, wsRates, 'Tasas_Cambio');
    }

    return wb;
  }

  function exportMasterExcelBackup(expedientes, companies, rates) {
    const XLSX = getXLSX();
    if (!XLSX) {
      throw new Error('La librería SheetJS (XLSX) no está cargada.');
    }
    const exps = expedientes || (Store.loadAll ? Store.loadAll() : []);
    const comps = companies || (Store.loadCompanies ? Store.loadCompanies() : []);
    const rts = rates || (Cur && Cur.loadRates ? Cur.loadRates() : null);

    const wb = buildMasterWorkbook(exps, comps, rts);
    XLSX.writeFile(wb, `RESPALDO_NOMINA_CONSOLIDADO_${new Date().toISOString().slice(0, 10)}.xlsx`);
    return true;
  }

  /**
   * 4. RESTAURA LA BASE DE DATOS COMPLETA DESDE UN ARCHIVO JSON DE RESPALDO
   */
  async function restoreMasterBackupFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const raw = e.target.result;
          const data = JSON.parse(raw);

          let restoredExp = 0;
          let restoredComp = 0;

          // Restaurar Empresas
          if (Array.isArray(data.empresas) && data.empresas.length > 0) {
            Store.saveCompanies(data.empresas);
            restoredComp = data.empresas.length;
          } else if (Array.isArray(data.companies) && data.companies.length > 0) {
            Store.saveCompanies(data.companies);
            restoredComp = data.companies.length;
          }

          // Restaurar Expedientes
          if (Array.isArray(data.expedientes) && data.expedientes.length > 0) {
            Store.saveAll(data.expedientes);
            restoredExp = data.expedientes.length;
          }

          // Restaurar Tasas de Cambio
          if (data.tasasCambio && Cur && Cur.saveRates) {
            Cur.saveRates(data.tasasCambio);
          }

          resolve({
            success: true,
            expedientesCount: restoredExp,
            empresasCount: restoredComp,
            fechaOriginal: data.fechaRespaldoLegible || data.fechaRespaldo || 'Desconocida'
          });
        } catch (err) {
          reject(new Error(`El archivo de respaldo no tiene un formato válido: ${err.message}`));
        }
      };

      reader.onerror = () => reject(new Error('No se pudo leer el archivo de respaldo.'));
      reader.readAsText(file, 'utf-8');
    });
  }

  /* ========================================================================
     EXPORTACIÓN PÚBLICA
     ======================================================================== */
  global.NominaBulk = {
    downloadExcelTemplate,
    importWorkersFromFile,
    exportMasterBackup,
    exportMasterExcelBackup,
    restoreMasterBackupFromFile
  };

})(window);
