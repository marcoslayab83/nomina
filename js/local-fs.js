/**
 * NOMINA — Gestor de Archivo Local en PC y Estructura de Directorios
 * 
 * Permite seleccionar una carpeta raíz en la PC del usuario (mediante File System Access API)
 * y crear automáticamente la estructura de directorios:
 *   [Carpeta Raíz en PC] \ [Empresa] \ [Departamento] \ [Trabajador]
 * Ejemplo:
 *   C:\desktop\mis empresas \ cuadrados food \ departamento de producccion \ carlos perez
 * 
 * Guarda en cada subcarpeta:
 *   - expediente.json
 *   - expediente_digital.html
 *   - recibo_pago_LOTTT.html
 *   - finiquito_liquidacion_LOTTT.html
 *   - ficha_trabajador.txt
 * 
 * Incluye además empaquetador ZIP nativo sin dependencias externas como respaldo universal.
 */
(function (global) {
  'use strict';

  const DB_NAME = 'nomina_local_fs_v1';
  const DB_VERSION = 1;
  const STORE_NAME = 'directory_handles';
  const HANDLE_KEY = 'root_dir_handle';

  let currentRootHandle = null;
  let currentRootName = null;

  /* ========================================================================
     1. PERSISTENCIA DEL HANDLE EN INDEXEDDB
     ======================================================================== */
  function openDB() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        return reject(new Error('IndexedDB no soportado en este navegador'));
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveStoredHandle(handle) {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('No se pudo guardar handle en IDB:', e);
      return false;
    }
  }

  async function getStoredHandle() {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      return null;
    }
  }

  async function clearStoredHandle() {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(HANDLE_KEY);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (e) {
      return false;
    }
  }

  /* ========================================================================
     2. COMPROBACIÓN DE SOPORTE Y PERMISOS
     ======================================================================== */
  function isSupported() {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  }

  async function verifyPermission(handle, readWrite) {
    if (!handle) return false;
    const opts = {};
    if (readWrite) opts.mode = 'readwrite';
    try {
      if ((await handle.queryPermission(opts)) === 'granted') {
        return true;
      }
      if ((await handle.requestPermission(opts)) === 'granted') {
        return true;
      }
    } catch (err) {
      console.warn('Error verificando permisos de carpeta:', err);
    }
    return false;
  }

  async function init() {
    if (!isSupported()) return null;
    try {
      const saved = await getStoredHandle();
      if (saved && saved.name) {
        currentRootHandle = saved;
        currentRootName = saved.name;
        return { name: saved.name, handle: saved };
      }
    } catch (e) {
      console.warn('Error restaurando carpeta raíz:', e);
    }
    return null;
  }

  async function selectRootDirectory() {
    if (!isSupported()) {
      throw new Error('Tu navegador no soporta la selección directa de carpetas en disco. Puedes utilizar la opción de Descarga en ZIP.');
    }
    try {
      const handle = await window.showDirectoryPicker({
        id: 'nomina_root_folder',
        mode: 'readwrite'
      });
      if (!handle) return null;

      const hasPerm = await verifyPermission(handle, true);
      if (!hasPerm) {
        throw new Error('No se concedieron permisos de escritura en la carpeta seleccionada.');
      }

      currentRootHandle = handle;
      currentRootName = handle.name;
      await saveStoredHandle(handle);

      return { name: handle.name, handle };
    } catch (err) {
      if (err.name === 'AbortError') {
        return null; // El usuario canceló el diálogo
      }
      throw err;
    }
  }

  async function disconnectRootDirectory() {
    currentRootHandle = null;
    currentRootName = null;
    await clearStoredHandle();
  }

  function getRootName() {
    return currentRootName;
  }

  function isConnected() {
    return Boolean(currentRootHandle);
  }

  /* ========================================================================
     3. FORMATEO DE NOMBRES Y RUTAS DE DIRECTORIO
     ======================================================================== */
  function sanitizeName(str, fallback) {
    const clean = String(str || '')
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/[\r\n\t]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return clean || fallback || 'General';
  }

  function getWorkerPathStructure(worker) {
    const empresa = sanitizeName(worker.empresaNombre || 'EMPRESA', 'Empresa');
    const depto = sanitizeName(worker.departamento || 'Departamento de Produccion', 'Departamento General');
    const trabajador = sanitizeName(`${worker.nombre} ${worker.apellido}`.trim() || worker.cedula, 'Trabajador');
    return {
      empresa,
      depto,
      trabajador,
      fullPathString: `${empresa} \\ ${depto} \\ ${trabajador}`
    };
  }

  /* ========================================================================
     4. GENERACIÓN DE CONTENIDOS DE ARCHIVOS
     ======================================================================== */
  function generateWorkerTxtSummary(worker, calc) {
    const c = calc || (global.NominaCalc ? global.NominaCalc.computeWorkerBenefits(worker) : null);
    const salNormal = c ? c.salarioNormal.monto.toFixed(2) : (worker.salarioActual?.sueldoBase || 0).toFixed(2);
    const prestaciones = c ? c.severanceData.montoGarantiaAcumulado.toFixed(2) : '0.00';
    const utilidades = c ? c.utilidadesData.montoTotal.toFixed(2) : '0.00';
    const vacaciones = c ? c.vacationsData.montoTotal.toFixed(2) : '0.00';

    return `======================================================================
NOMINA — FICHA LABORAL Y EXPEDIENTE DIGITAL DEL TRABAJADOR
Legislación: LOTTT · IVSS · FAOV · INCES · República Bolivariana de Venezuela
======================================================================

EMPRESA / ENTIDAD DE TRABAJO:
  - Razón Social: ${worker.empresaNombre || 'EMPRESA, C.A.'}
  - RIF: ${worker.empresaRif || 'J-00000000-0'}
  - Sede / Dirección: ${worker.empresaDireccion || 'Venezuela'}

DATOS DEL TRABAJADOR:
  - Nombre Completo: ${worker.nombre} ${worker.apellido}
  - Cédula de Identidad: ${worker.cedula}
  - Cargo: ${worker.cargo || 'No especificado'}
  - Departamento / Área: ${worker.departamento || 'General'}
  - Fecha de Ingreso: ${worker.fechaIngreso || 'No especificada'}
  - Antigüedad: ${c ? `${c.serviceTime.years} años, ${c.serviceTime.months} meses, ${c.serviceTime.days} días` : 'No calculada'}
  - Moneda de Pago: ${worker.moneda || 'Bs.'}
  - Sueldo Base Mensual: ${worker.moneda || 'Bs.'} ${(worker.salarioActual?.sueldoBase || 0).toFixed(2)}
  - Salario Normal Mensual: ${worker.moneda || 'Bs.'} ${salNormal}

RESUMEN DE BENEFICIOS Y PASIVOS LABORALES:
  - Prestaciones Sociales Acumuladas (Garantía Art. 142): ${worker.moneda || 'Bs.'} ${prestaciones}
  - Provisión de Utilidades (Art. 131): ${worker.moneda || 'Bs.'} ${utilidades}
  - Provisión de Vacaciones y Bono (Art. 190-192): ${worker.moneda || 'Bs.'} ${vacaciones}

UBICACIÓN EN DISCO LOCAL:
  - Estructura: ${getWorkerPathStructure(worker).fullPathString}
  - Generado el: ${new Date().toLocaleString('es-VE')}
======================================================================`;
  }

  function generateDigitalDossierHTML(worker, calc) {
    const c = calc || (global.NominaCalc ? global.NominaCalc.computeWorkerBenefits(worker) : null);
    const printRenderer = global.NominaPrint;
    let bodyContent = '';

    if (printRenderer && c) {
      bodyContent = printRenderer.renderDocument('resumen_integral', worker, c, {
        incluirJerarquia: true,
        incluirHistorialSueldos: true,
        incluirVacaciones: true,
        incluirUtilidades: true,
        incluirParafiscales: true,
        incluirCostoPatronal: true
      });
    } else {
      bodyContent = `<div style="padding:20px;"><h2>Expediente de ${worker.nombre} ${worker.apellido}</h2><p>Cédula: ${worker.cedula}</p></div>`;
    }

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Expediente Digital — ${worker.empresaNombre || 'EMPRESA'} — ${worker.nombre} ${worker.apellido}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #fff; color: #0f172a; margin: 15mm; font-size: 11px; }
    .doc-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 14px; }
    .doc-company h1 { margin: 0; font-size: 18px; color: #0f172a; }
    .doc-company p { margin: 3px 0 0; color: #475569; font-size: 11px; }
    .doc-meta { text-align: right; font-size: 11px; }
    .doc-code { font-weight: 800; font-size: 12px; color: #047857; }
    .doc-title-bar { background: #0f172a; color: #fff; padding: 6px 10px; font-weight: 700; font-size: 12px; text-transform: uppercase; margin: 12px 0 10px; border-radius: 4px; }
    .doc-info-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px 12px; background: #f8fafc; border: 1px solid #cbd5e1; padding: 10px; border-radius: 6px; margin-bottom: 14px; }
    .doc-info-cell small { display: block; color: #64748b; font-size: 9.5px; text-transform: uppercase; font-weight: 600; }
    .doc-info-cell strong { font-size: 11.5px; color: #0f172a; }
    table.doc-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
    table.doc-table th, table.doc-table td { border: 1px solid #cbd5e1; padding: 6px 8px; font-size: 10.5px; }
    table.doc-table th { background: #f1f5f9; text-align: left; font-weight: 700; color: #1e293b; }
    table.doc-table td.num { text-align: right; font-family: Consolas, monospace; }
    table.doc-table tr.total-row td { background: #f8fafc; font-weight: 700; }
    table.doc-table tr.grand-total td { background: #0f172a; color: #fff; font-weight: 800; font-size: 11.5px; }
    .doc-summary-box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; background: #f8fafc; margin-bottom: 14px; }
    .doc-signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 36px; }
    .sig-box { text-align: center; }
    .sig-line { border-top: 1px solid #000; margin-bottom: 6px; }
    .no-print-bar { background: #0f172a; color: #fff; padding: 10px 18px; margin: -15mm -15mm 16mm -15mm; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
    .no-print-bar button { background: #10b981; color: #fff; border: none; padding: 7px 16px; border-radius: 6px; font-weight: 700; cursor: pointer; font-size: 12px; }
    @media print { .no-print-bar { display: none !important; } body { margin: 10mm 12mm; } }
  </style>
</head>
<body>
  <div class="no-print-bar">
    <span>📁 Archivo de Disco Local — Carpeta: <strong>${worker.empresaNombre || 'EMPRESA'} &gt; ${worker.departamento || 'General'}</strong></span>
    <button type="button" onclick="window.print()">🖨️ Imprimir / Guardar en PDF</button>
  </div>
  ${bodyContent}
</body>
</html>`;
  }

  function generateReceiptHTML(worker, calc) {
    const c = calc || (global.NominaCalc ? global.NominaCalc.computeWorkerBenefits(worker) : null);
    const printRenderer = global.NominaPrint;
    let content = '';
    if (printRenderer && c) {
      content = printRenderer.renderDocument('recibo_mensual', worker, c, {
        recFechaDesde: '',
        recFechaHasta: '',
        recLunesMes: 4,
        recFormaPago: 'Transferencia Bancaria',
        recIncluirNoSalariales: true,
        recProrratearRecargos: true,
        recMostrarCostoPatronal: false
      });
    }
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Recibo Oficial de Pago LOTTT — ${worker.nombre} ${worker.apellido}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #fff; color: #0f172a; margin: 15mm; font-size: 11px; }
    table.doc-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
    table.doc-table th, table.doc-table td { border: 1px solid #cbd5e1; padding: 6px 8px; font-size: 10.5px; }
    table.doc-table th { background: #f1f5f9; text-align: left; font-weight: 700; color: #1e293b; }
    .doc-header { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; }
    .doc-title-bar { background: #0f172a; color: #fff; padding: 6px 10px; font-weight: 700; font-size: 12px; text-transform: uppercase; margin: 10px 0; border-radius: 4px; }
    .doc-signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 36px; }
    .sig-box { text-align: center; }
    .sig-line { border-top: 1px solid #000; margin-bottom: 6px; }
    .no-print-bar { background: #0f172a; color: #fff; padding: 10px 18px; margin: -15mm -15mm 16mm -15mm; display: flex; justify-content: space-between; align-items: center; }
    .no-print-bar button { background: #10b981; color: #fff; border: none; padding: 7px 16px; border-radius: 6px; font-weight: 700; cursor: pointer; }
    @media print { .no-print-bar { display: none !important; } }
  </style>
</head>
<body>
  <div class="no-print-bar">
    <span>Comprobante de Pago (Art. 106 LOTTT) — <strong>${worker.nombre} ${worker.apellido} (${worker.cedula})</strong></span>
    <button type="button" onclick="window.print()">🖨️ Imprimir Recibo</button>
  </div>
  ${content}
</body>
</html>`;
  }

  function generateFiniquitoHTML(worker, calc) {
    const c = calc || (global.NominaCalc ? global.NominaCalc.computeWorkerBenefits(worker) : null);
    const printRenderer = global.NominaPrint;
    let content = '';
    if (printRenderer && c) {
      content = printRenderer.renderDocument('liquidacion_definitiva', worker, c, {
        ldefFechaEgreso: new Date().toISOString().slice(0, 10),
        ldefMotivo: 'Renuncia Voluntaria',
        ldefAnticipos: 0,
        ldefIntereses: c.severanceData.montoGarantiaAcumulado * 0.12,
        ldefDiasSalarioPendiente: 0,
        ldefOtrasDeducciones: 0,
        ldefIncluirVac: true,
        ldefIncluirUtil: true
      });
    }
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Finiquito y Liquidación LOTTT — ${worker.nombre} ${worker.apellido}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #fff; color: #0f172a; margin: 15mm; font-size: 11px; }
    table.doc-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
    table.doc-table th, table.doc-table td { border: 1px solid #cbd5e1; padding: 6px 8px; font-size: 10.5px; }
    table.doc-table th { background: #f1f5f9; text-align: left; font-weight: 700; color: #1e293b; }
    .doc-header { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; }
    .doc-title-bar { background: #0f172a; color: #fff; padding: 6px 10px; font-weight: 700; font-size: 12px; text-transform: uppercase; margin: 10px 0; border-radius: 4px; }
    .doc-signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 36px; }
    .sig-box { text-align: center; }
    .sig-line { border-top: 1px solid #000; margin-bottom: 6px; }
    .no-print-bar { background: #0f172a; color: #fff; padding: 10px 18px; margin: -15mm -15mm 16mm -15mm; display: flex; justify-content: space-between; align-items: center; }
    .no-print-bar button { background: #10b981; color: #fff; border: none; padding: 7px 16px; border-radius: 6px; font-weight: 700; cursor: pointer; }
    @media print { .no-print-bar { display: none !important; } }
  </style>
</head>
<body>
  <div class="no-print-bar">
    <span>Finiquito de Prestaciones y Beneficios (Art. 142 LOTTT)</span>
    <button type="button" onclick="window.print()">🖨️ Imprimir Finiquito</button>
  </div>
  ${content}
</body>
</html>`;
  }

  /* ========================================================================
     5. ESCRITURA EN DISCO CON FILE SYSTEM ACCESS API
     ======================================================================== */
  async function writeTextFileToDirectory(dirHandle, fileName, content) {
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  /**
   * Guarda un trabajador en su carpeta correspondiente dentro de la raíz:
   * [rootHandle] -> [Empresa] -> [Departamento] -> [Trabajador]
   */
  async function saveWorkerToLocalPC(worker, calc) {
    if (!currentRootHandle) {
      throw new Error('Primero debes seleccionar una carpeta en tu PC.');
    }
    const hasPerm = await verifyPermission(currentRootHandle, true);
    if (!hasPerm) {
      throw new Error('Se requiere permiso de escritura en la carpeta de tu PC para crear los directorios.');
    }

    const path = getWorkerPathStructure(worker);

    // 1. Carpeta de la Empresa
    const empresaDir = await currentRootHandle.getDirectoryHandle(path.empresa, { create: true });

    // 2. Carpeta del Departamento
    const deptoDir = await empresaDir.getDirectoryHandle(path.depto, { create: true });

    // 3. Carpeta del Trabajador
    const workerDir = await deptoDir.getDirectoryHandle(path.trabajador, { create: true });

    // 4. Preparar archivos
    const c = calc || (global.NominaCalc ? global.NominaCalc.computeWorkerBenefits(worker) : null);
    const jsonStr = JSON.stringify(worker, null, 2);
    const txtStr = generateWorkerTxtSummary(worker, c);
    const dossierHtml = generateDigitalDossierHTML(worker, c);
    const receiptHtml = generateReceiptHTML(worker, c);
    const finiquitoHtml = generateFiniquitoHTML(worker, c);

    // 5. Escribir archivos dentro de la subcarpeta del trabajador
    await writeTextFileToDirectory(workerDir, `expediente_${sanitizeName(worker.cedula)}.json`, jsonStr);
    await writeTextFileToDirectory(workerDir, `Expediente_Digital_${sanitizeName(worker.cedula)}.html`, dossierHtml);
    await writeTextFileToDirectory(workerDir, `Recibo_Pago_Art106_${sanitizeName(worker.cedula)}.html`, receiptHtml);
    await writeTextFileToDirectory(workerDir, `Finiquito_Liquidacion_${sanitizeName(worker.cedula)}.html`, finiquitoHtml);
    await writeTextFileToDirectory(workerDir, `ficha_resumen_${sanitizeName(worker.cedula)}.txt`, txtStr);

    return {
      success: true,
      rootName: currentRootName,
      pathString: `${currentRootName} \\ ${path.fullPathString}`,
      filesCreated: 5
    };
  }

  /**
   * Sincroniza todas las empresas y trabajadores registrados en el disco local
   */
  async function syncAllToLocalPC(workersList) {
    if (!currentRootHandle) {
      throw new Error('Primero debes seleccionar una carpeta en tu PC.');
    }
    const hasPerm = await verifyPermission(currentRootHandle, true);
    if (!hasPerm) {
      throw new Error('Se requiere permiso de escritura en la carpeta de tu PC.');
    }

    const list = Array.isArray(workersList) ? workersList : [];
    let savedCount = 0;

    for (const w of list) {
      await saveWorkerToLocalPC(w);
      savedCount++;
    }

    return {
      success: true,
      rootName: currentRootName,
      totalWorkers: savedCount
    };
  }

  /* ========================================================================
     6. GENERADOR DE ARCHIVO ZIP INTEGRADO (RESPALDO UNIVERSAL)
     ======================================================================== */
  /**
   * Implementación pura en JavaScript del estándar PKZip sin dependencias externas
   */
  const crcTable = (function () {
    let c;
    const table = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c;
    }
    return table;
  })();

  function crc32(uint8arr) {
    let crc = 0 ^ (-1);
    for (let i = 0; i < uint8arr.length; i++) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ uint8arr[i]) & 0xff];
    }
    return (crc ^ (-1)) >>> 0;
  }

  class SimpleZip {
    constructor() {
      this.files = [];
    }

    addFile(relativePath, contentStringOrUint8) {
      const path = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
      let data;
      if (typeof contentStringOrUint8 === 'string') {
        data = new TextEncoder().encode(contentStringOrUint8);
      } else {
        data = contentStringOrUint8;
      }
      this.files.push({ path, data });
    }

    generateBlob() {
      const localHeaders = [];
      const centralDirs = [];
      let offset = 0;

      for (const f of this.files) {
        const nameBytes = new TextEncoder().encode(f.path);
        const crc = crc32(f.data);
        const size = f.data.length;

        // Local header: 30 bytes + name
        const lh = new Uint8Array(30 + nameBytes.length);
        const lhView = new DataView(lh.buffer);
        lhView.setUint32(0, 0x04034b50, true); // signature
        lhView.setUint16(4, 20, true);         // version needed
        lhView.setUint16(6, 0, true);          // flags
        lhView.setUint16(8, 0, true);          // compression: 0 = store
        lhView.setUint16(10, 0, true);         // time
        lhView.setUint16(12, 0, true);         // date
        lhView.setUint32(14, crc, true);       // crc32
        lhView.setUint32(18, size, true);      // compressed size
        lhView.setUint32(22, size, true);      // uncompressed size
        lhView.setUint16(26, nameBytes.length, true);
        lhView.setUint16(28, 0, true);         // extra len
        lh.set(nameBytes, 30);

        localHeaders.push(lh, f.data);

        // Central dir: 46 bytes + name
        const cd = new Uint8Array(46 + nameBytes.length);
        const cdView = new DataView(cd.buffer);
        cdView.setUint32(0, 0x02014b50, true); // signature
        cdView.setUint16(4, 20, true);         // version made by
        cdView.setUint16(6, 20, true);         // version needed
        cdView.setUint16(8, 0, true);          // flags
        cdView.setUint16(10, 0, true);         // compression
        cdView.setUint16(12, 0, true);         // time
        cdView.setUint16(14, 0, true);         // date
        cdView.setUint32(16, crc, true);       // crc32
        cdView.setUint32(20, size, true);      // comp size
        cdView.setUint32(24, size, true);      // uncomp size
        cdView.setUint16(28, nameBytes.length, true);
        cdView.setUint16(30, 0, true);         // extra len
        cdView.setUint16(32, 0, true);         // comment len
        cdView.setUint16(34, 0, true);         // disk start
        cdView.setUint16(36, 0, true);         // int attr
        cdView.setUint32(38, 0, true);         // ext attr
        cdView.setUint32(42, offset, true);    // local header offset
        cd.set(nameBytes, 46);

        centralDirs.push(cd);
        offset += lh.length + size;
      }

      const cdOffset = offset;
      let cdSize = 0;
      centralDirs.forEach((cd) => { cdSize += cd.length; });

      // End of Central Directory: 22 bytes
      const eocd = new Uint8Array(22);
      const eocdView = new DataView(eocd.buffer);
      eocdView.setUint32(0, 0x06054b50, true); // signature
      eocdView.setUint16(4, 0, true);          // disk number
      eocdView.setUint16(6, 0, true);          // disk with CD
      eocdView.setUint16(8, this.files.length, true);  // entries on disk
      eocdView.setUint16(10, this.files.length, true); // total entries
      eocdView.setUint32(12, cdSize, true);    // CD size
      eocdView.setUint32(16, cdOffset, true);  // CD offset
      eocdView.setUint16(20, 0, true);         // comment len

      const parts = [...localHeaders, ...centralDirs, eocd];
      return new Blob(parts, { type: 'application/zip' });
    }
  }

  function exportStructuredZip(workersList) {
    const list = Array.isArray(workersList) ? workersList : [];
    const zip = new SimpleZip();

    list.forEach((w) => {
      const path = getWorkerPathStructure(w);
      const basePath = `${path.empresa}/${path.depto}/${path.trabajador}`;
      const c = global.NominaCalc ? global.NominaCalc.computeWorkerBenefits(w) : null;

      zip.addFile(`${basePath}/expediente_${sanitizeName(w.cedula)}.json`, JSON.stringify(w, null, 2));
      zip.addFile(`${basePath}/Expediente_Digital_${sanitizeName(w.cedula)}.html`, generateDigitalDossierHTML(w, c));
      zip.addFile(`${basePath}/Recibo_Pago_Art106_${sanitizeName(w.cedula)}.html`, generateReceiptHTML(w, c));
      zip.addFile(`${basePath}/Finiquito_Liquidacion_${sanitizeName(w.cedula)}.html`, generateFiniquitoHTML(w, c));
      zip.addFile(`${basePath}/ficha_resumen_${sanitizeName(w.cedula)}.txt`, generateWorkerTxtSummary(w, c));
    });

    const blob = zip.generateBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NOMINA_Carpetas_Empresas_${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);

    return true;
  }

  /* ========================================================================
     7. EXPORTACIÓN PÚBLICA DEL MÓDULO
     ======================================================================== */
  global.NominaLocalFS = {
    isSupported,
    init,
    selectRootDirectory,
    disconnectRootDirectory,
    getRootName,
    isConnected,
    getWorkerPathStructure,
    saveWorkerToLocalPC,
    syncAllToLocalPC,
    exportStructuredZip
  };

})(window);
