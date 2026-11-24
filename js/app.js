/**
 * NOMINA — Controlador Principal de Interfaz y Flujo de Expedientes
 */
(function () {
  'use strict';

  const Calc = window.NominaCalc;
  const Store = window.NominaStore;
  const Print = window.NominaPrint;
  const LocalFS = window.NominaLocalFS;
  const Cur = window.NominaCurrency;

  let activeWorker = null;
  let activeTab = 'tab-expediente';
  let activeDocType = 'resumen_integral';
  let selectedCompanyFilter = null; // null = Todas las carpetas, o id de empresa

  function $(id) {
    return document.getElementById(id);
  }

  function esc(val) {
    return String(val === undefined || val === null ? '' : val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function cleanFileName(str) {
    return String(str || '')
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, '_')
      .trim();
  }

  function getCurrencyHelpers(worker) {
    const origCur = worker ? (worker.moneda || 'Bs.') : 'Bs.';
    const dispCur = Cur ? Cur.getDisplayCurrency(worker) : origCur;
    const conv = (v) => (Cur ? Cur.convert(v, origCur, dispCur) : v);
    const fmt = (v) => (Cur ? Cur.formatMoneyConverted(v, origCur, dispCur) : Calc.formatMoney(v, origCur));
    return { origCur, dispCur, conv, fmt };
  }

  function getDocTypeLabel(docType) {
    const map = {
      resumen_integral: 'Resumen_Integral',
      recibo_mensual: 'Recibo_Mensual',
      recibo_quincenal: 'Recibo_Quincenal',
      recibo_semanal: 'Recibo_Semanal',
      recibo_vacaciones: 'Recibo_Vacaciones',
      liquidacion_parcial: 'Liquidacion_Parcial',
      liquidacion_definitiva: 'Liquidacion_Definitiva'
    };
    return map[docType] || 'Expediente';
  }

  function getCleanPrintTitle() {
    if (!activeWorker) return 'NOMINA_Documento';
    const comp = cleanFileName(activeWorker.empresaNombre || 'EMPRESA');
    const doc = getDocTypeLabel(activeDocType);
    const ced = cleanFileName(activeWorker.cedula);
    const ape = cleanFileName(activeWorker.apellido);
    const nom = cleanFileName(activeWorker.nombre);
    return `${comp} - ${doc} - ${ced}_${nom}_${ape}`;
  }

  function showToast(msg, isError) {
    const container = $('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'toast' + (isError ? ' error' : '');
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.25s ease';
      setTimeout(() => el.remove(), 260);
    }, 3200);
  }

  function getInitials(nombre, apellido) {
    const a = String(nombre || '').trim()[0] || '';
    const b = String(apellido || '').trim()[0] || '';
    return (a + b).toUpperCase() || 'TR';
  }

  function updateTopCount() {
    const list = Store.loadAll();
    const el = $('top-exp-count');
    if (el) el.textContent = list.length;
    const compEl = $('top-companies-count');
    if (compEl) compEl.textContent = Store.loadCompanies().length;
  }

  /* ========================================================================
     GESTIÓN DE CARPETAS POR EMPRESA
     ======================================================================== */
  function populateCompanyDropdowns() {
    const comps = Store.loadCompanies();
    const opts = comps.map((c) => `<option value="${esc(c.id)}">${esc(c.nombre)} (${esc(c.rif)})</option>`).join('');

    // Dropdown en formulario de creación inicial
    const newSel = $('new-empresa-select');
    if (newSel) {
      const prev = newSel.value;
      newSel.innerHTML = opts;
      if (prev && comps.some((c) => c.id === prev)) {
        newSel.value = prev;
      } else if (selectedCompanyFilter && comps.some((c) => c.id === selectedCompanyFilter)) {
        newSel.value = selectedCompanyFilter;
      } else if (comps.length > 0) {
        newSel.value = comps[0].id;
      }
    }

    // Dropdown en workspace Tab 1
    const wsSel = $('exp-empresa-select');
    if (wsSel) {
      wsSel.innerHTML = `<option value="">-- Seleccionar Carpeta de Empresa --</option>` + opts;
      if (activeWorker) {
        let match = comps.find((c) => c.id === activeWorker.empresaId);
        if (!match && activeWorker.empresaNombre) {
          match = comps.find((c) => c.nombre.toLowerCase() === activeWorker.empresaNombre.toLowerCase());
        }
        if (match) {
          wsSel.value = match.id;
          activeWorker.empresaId = match.id;
        }
      }
    }
  }

  function renderCompanyFoldersUI() {
    const all = Store.loadAll();
    const comps = Store.loadCompanies();
    updateTopCount();
    populateCompanyDropdowns();

    // 1. Píldoras de carpetas en el directorio
    const tabsContainer = $('company-folder-tabs');
    if (tabsContainer) {
      let html = `
        <button type="button" class="folder-pill ${!selectedCompanyFilter ? 'active' : ''}" data-filter-company="">
          📂 Todas las Carpetas <span class="folder-count">${all.length}</span>
        </button>
      `;

      comps.forEach((c) => {
        const cCount = all.filter((w) => w.empresaId === c.id || (w.empresaNombre && w.empresaNombre.toLowerCase() === c.nombre.toLowerCase())).length;
        const isActive = selectedCompanyFilter === c.id;
        html += `
          <button type="button" class="folder-pill ${isActive ? 'active' : ''}" data-filter-company="${esc(c.id)}" title="${esc(c.nombre)} · RIF: ${esc(c.rif)}">
            📁 ${esc(c.nombre)} <span class="folder-count">${cCount}</span>
          </button>
        `;
      });

      tabsContainer.innerHTML = html;
    }

    // 2. Banner de carpeta activa
    const banner = $('company-active-banner');
    if (banner) {
      if (selectedCompanyFilter) {
        const comp = Store.getCompanyById(selectedCompanyFilter);
        if (comp) {
          const cWorkers = all.filter((w) => w.empresaId === comp.id || (w.empresaNombre && w.empresaNombre.toLowerCase() === comp.nombre.toLowerCase()));
          banner.classList.remove('hidden');
          banner.innerHTML = `
            <div class="banner-info">
              <div class="banner-icon">📁</div>
              <div class="banner-text">
                <strong>Carpeta Activa: ${esc(comp.nombre)}</strong>
                <div>RIF: ${esc(comp.rif)} &nbsp;|&nbsp; Sede: ${esc(comp.direccion || 'Venezuela')} &nbsp;|&nbsp; <strong>${cWorkers.length}</strong> expediente(s) archivado(s)</div>
              </div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button type="button" class="btn btn-outline btn-xs" id="btn-banner-edit-comp" data-edit-comp="${esc(comp.id)}" style="background:#fff;">
                ✏️ Editar Carpeta
              </button>
              <button type="button" class="btn btn-ghost-light btn-xs" id="btn-banner-clear-filter" style="color:var(--emerald-700);font-weight:700;">
                ✕ Ver Todas las Carpetas
              </button>
            </div>
          `;
        } else {
          banner.classList.add('hidden');
        }
      } else {
        banner.classList.add('hidden');
      }
    }

    // 3. Tabla en modal de administración de empresas
    renderEmpresasModalTable();
  }

  function renderEmpresasModalTable() {
    const tbody = $('tbody-empresas-list');
    if (!tbody) return;
    const comps = Store.loadCompanies();
    const all = Store.loadAll();

    tbody.innerHTML = comps.map((c) => {
      const cCount = all.filter((w) => w.empresaId === c.id || (w.empresaNombre && w.empresaNombre.toLowerCase() === c.nombre.toLowerCase())).length;
      return `
        <tr>
          <td><strong>📁 ${esc(c.nombre)}</strong></td>
          <td><code>${esc(c.rif)}</code></td>
          <td>${esc(c.direccion || '—')}</td>
          <td style="text-align:center;">
            <span class="status-badge status-info">${cCount}</span>
          </td>
          <td style="text-align:right;white-space:nowrap;">
            <button type="button" class="btn btn-ghost-light btn-xs" data-filter-view-comp="${esc(c.id)}" style="color:var(--navy-800);" title="Ver expedientes de esta empresa">
              👁️ Ver (${cCount})
            </button>
            <button type="button" class="btn btn-outline btn-xs" data-edit-modal-comp="${esc(c.id)}" title="Editar datos fiscales">
              ✏️ Editar
            </button>
            <button type="button" class="btn btn-danger-soft btn-xs" data-del-modal-comp="${esc(c.id)}" ${cCount > 0 ? 'disabled title="No se puede eliminar porque contiene expedientes archivados"' : 'title="Eliminar carpeta vacía"'}>
              🗑️
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  /* ========================================================================
     NAVEGACIÓN ENTRE VISTAS
     ======================================================================== */
  function showLanding() {
    activeWorker = null;
    $('workspace-view').classList.add('hidden');
    $('landing-view').classList.remove('hidden');
    renderExpedientesList();
    updateTopCount();
  }

  function openExpediente(id, initialTab) {
    const worker = Store.getById(id);
    if (!worker) {
      showToast('No se encontró el expediente solicitado.', true);
      showLanding();
      return;
    }
    activeWorker = worker;
    // Reiniciar fechas contextuales de impresión para el nuevo expediente
    if ($('lpar-fecha-corte')) $('lpar-fecha-corte').value = worker.fechaCorte || Store.todayISO();
    if ($('ldef-fecha-egreso')) $('ldef-fecha-egreso').value = worker.fechaCorte || Store.todayISO();
    if ($('rvac-fecha-salida')) $('rvac-fecha-salida').value = '';
    if ($('rvac-fecha-reinc')) $('rvac-fecha-reinc').value = '';
    if ($('rvac-fecha-pago')) $('rvac-fecha-pago').value = Store.todayISO();
    if ($('rvac-periodo-select')) $('rvac-periodo-select').value = 'actual';

    $('landing-view').classList.add('hidden');
    $('workspace-view').classList.remove('hidden');
    populateAllForms();
    refreshAllCalculations();
    updateActiveWorkerPathUI();
    switchTab(initialTab || 'tab-expediente');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function switchTab(tabId) {
    activeTab = tabId;
    document.querySelectorAll('#workspace-tabs .tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    document.querySelectorAll('.tab-panel').forEach((panel) => {
      panel.classList.toggle('hidden', panel.id !== tabId);
    });
    if (tabId === 'tab-print' && activeWorker) {
      renderPrintSheet();
    }
  }

  /* ========================================================================
     PERSISTENCIA AUTOMÁTICA DEL EXPEDIENTE ACTIVO
     ======================================================================== */
  function persistActiveWorker() {
    if (!activeWorker) return;
    Store.upsertExpediente(activeWorker);
    Store.saveCompany({
      nombre: activeWorker.empresaNombre,
      rif: activeWorker.empresaRif,
      direccion: activeWorker.empresaDireccion
    });
    updateTopCount();
    const ind = $('badge-saved-indicator');
    if (ind) {
      ind.textContent = 'Guardado ' + new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
  }

  /* ========================================================================
     VISTA 1: LISTA DE EXPEDIENTES Y CREACIÓN
     ======================================================================== */
  function renderExpedientesList() {
    renderCompanyFoldersUI();
    const listEl = $('expedientes-list');
    const query = String($('search-expedientes')?.value || '').trim().toLowerCase();
    let list = Store.loadAll();

    // Filtro por carpeta de empresa seleccionada
    if (selectedCompanyFilter) {
      const comp = Store.getCompanyById(selectedCompanyFilter);
      const compName = comp ? comp.nombre.toLowerCase() : '';
      list = list.filter((w) => w.empresaId === selectedCompanyFilter || (w.empresaNombre && w.empresaNombre.toLowerCase() === compName));
    }

    if (query) {
      list = list.filter((w) => {
        const hay = `${w.nombre} ${w.apellido} ${w.cedula} ${w.cargo} ${w.departamento} ${w.empresaNombre} ${w.codigoExpediente}`.toLowerCase();
        return hay.includes(query);
      });
    }

    if (list.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <h4>No hay expedientes en esta carpeta</h4>
          <p style="margin:0 0 12px;">${selectedCompanyFilter ? 'No hay trabajadores registrados en esta empresa. Puedes agregar uno usando el formulario de la izquierda.' : 'Completa el formulario con Nombre, Apellido y Cédula para abrir el primer expediente, o carga los Casos de Estudio LOTTT.'}</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = list.map((w) => {
      const calc = Calc.computeWorkerBenefits(w);
      const { origCur, dispCur, fmt } = getCurrencyHelpers(w);
      const sueldoBase = w.salarioActual?.sueldoBase || 0;
      const sueldoBaseFmt = fmt(sueldoBase);
      const salNormalFmt = fmt(calc.salaryData.salarioNormalMensual);
      const diffCurPill = (dispCur !== 'original' && dispCur !== origCur)
        ? `<span class="pill" style="font-size:9.5px;background:#fef3c7;color:#92400e;border:1px solid #fde68a;padding:1px 5px;" title="Moneda original del contrato: ${esc(origCur)}">Orig: ${esc(origCur)}</span>`
        : '';
      return `
        <div class="expediente-item">
          <div class="exp-avatar">${esc(getInitials(w.nombre, w.apellido))}</div>
          <div class="exp-meta">
            <div class="exp-name" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span>${esc(w.nombre)} ${esc(w.apellido)}</span>
              <span class="pill" style="font-size:10.5px;background:#e8eff8;color:var(--navy-900);border:1px solid #cbd5e1;padding:2px 8px;">📁 ${esc(w.empresaNombre || 'EMPRESA, C.A.')}</span>
              ${diffCurPill}
            </div>
            <div class="exp-details">
              <span><strong>C.I.:</strong> ${esc(w.cedula)}</span>
              <span><strong>Cargo:</strong> ${esc(w.cargo || 'Sin asignar')}</span>
              <span><strong>Antigüedad:</strong> ${esc(calc.serviceTime.text)}</span>
              <span><strong>Sueldo Base:</strong> <strong style="color:var(--emerald-700);">${esc(sueldoBaseFmt)}</strong></span>
              <span><strong>Salario Normal:</strong> ${esc(salNormalFmt)}</span>
            </div>
          </div>
          <div class="exp-actions">
            <button type="button" class="btn btn-primary btn-sm" data-open-id="${esc(w.id)}">Abrir</button>
            <button type="button" class="btn btn-outline btn-sm" data-print-id="${esc(w.id)}" title="Archivar o imprimir PDF en carpeta de ${esc(w.empresaNombre || 'la empresa')}">🖨️ PDF</button>
            <button type="button" class="btn btn-danger-soft btn-sm" data-delete-id="${esc(w.id)}" title="Eliminar expediente">✕</button>
          </div>
        </div>
      `;
    }).join('');
  }

  function handleCreateExpediente(e) {
    e.preventDefault();
    const nombre = $('new-nombre').value.trim();
    const apellido = $('new-apellido').value.trim();
    const prefijo = $('new-cedula-prefijo').value;
    let cedulaRaw = $('new-cedula').value.trim().toUpperCase();

    if (!nombre || !apellido || !cedulaRaw) {
      showToast('Debes ingresar Nombre, Apellido y Cédula del trabajador.', true);
      return;
    }

    // Evitar doble prefijo si el usuario escribió V-12345
    const cedula = /^[VE]-/.test(cedulaRaw) ? cedulaRaw : `${prefijo}${cedulaRaw}`;

    const duplicado = Store.findByCedula(cedula);
    if (duplicado) {
      if (confirm(`Ya existe un expediente con la cédula ${duplicado.cedula} (${duplicado.nombre} ${duplicado.apellido}). ¿Deseas abrir ese expediente?`)) {
        openExpediente(duplicado.id);
      }
      return;
    }

    const empresaId = $('new-empresa-select')?.value || selectedCompanyFilter || '';
    const sueldoBase = parseFloat($('new-sueldo').value) || 0;
    const departamento = $('new-departamento')?.value.trim() || 'Departamento de Producción';

    const exp = Store.createExpediente({
      nombre,
      apellido,
      cedula,
      cargo: $('new-cargo').value.trim(),
      departamento,
      fechaIngreso: $('new-fecha-ingreso').value || Store.todayISO(),
      sueldoBase,
      moneda: $('new-moneda').value || 'Bs.',
      empresaId
    });

    Store.upsertExpediente(exp);

    // Guardado automático en PC si el usuario tiene carpeta vinculada y check activo
    const autoSavePC = $('chk-auto-save-pc')?.checked;
    if (autoSavePC && LocalFS && LocalFS.isConnected()) {
      const dispCur = Cur ? Cur.getDisplayCurrency(exp) : exp.moneda;
      LocalFS.saveWorkerToLocalPC(exp, null, { displayCurrency: dispCur }).then((res) => {
        showToast(`📁 Carpeta física creada en tu PC: ${res.pathString}`);
      }).catch((err) => {
        console.warn('Error guardando en PC:', err);
      });
    }

    e.target.reset();
    $('new-fecha-ingreso').value = Store.todayISO();
    if ($('new-departamento')) $('new-departamento').value = 'Departamento de Producción';
    if ($('new-empresa-select') && empresaId) $('new-empresa-select').value = empresaId;
    updateLandingPathPreview();
    showToast(`Expediente ${exp.codigoExpediente} archivado en carpeta "${exp.empresaNombre}".`);
    openExpediente(exp.id);
  }

  /* ========================================================================
     POBLAR FORMULARIOS DEL EXPEDIENTE ACTIVO
     ======================================================================== */
  function populateAllForms() {
    if (!activeWorker) return;

    // Campos simples [data-field]
    document.querySelectorAll('[data-field]').forEach((el) => {
      const key = el.dataset.field;
      if (el.type === 'checkbox') {
        el.checked = Boolean(activeWorker[key]);
      } else {
        el.value = activeWorker[key] !== undefined && activeWorker[key] !== null ? activeWorker[key] : '';
      }
    });

    // Campo Sueldo Base en Tab 1
    const sueldoBase = (activeWorker.salarioActual?.sueldoBase !== undefined && activeWorker.salarioActual?.sueldoBase !== null)
      ? activeWorker.salarioActual.sueldoBase
      : 0;
    if ($('exp-sueldo-base')) $('exp-sueldo-base').value = sueldoBase;
    if ($('exp-sueldo-cur')) $('exp-sueldo-cur').textContent = activeWorker.moneda || 'Bs.';

    // Actualizar selector de carpeta de empresa en Tab 1
    populateCompanyDropdowns();

    // Supervisor (Reporta a)
    const rep = activeWorker.reportaA || {};
    $('sup-nombre').value = rep.nombre || '';
    $('sup-cedula').value = rep.cedula || '';
    $('sup-cargo').value = rep.cargo || '';
    $('sup-depto').value = rep.departamento || '';

    // Selectores de vinculación rápida con otros expedientes
    populatePeerSelectors();

    // Salario actual [data-sal]
    const sal = activeWorker.salarioActual || Store.createEmptySalaryRecord();
    activeWorker.salarioActual = sal;
    document.querySelectorAll('[data-sal]').forEach((el) => {
      const key = el.dataset.sal;
      el.value = sal[key] !== undefined && sal[key] !== null ? sal[key] : '';
    });

    // Utilidades [data-util]
    const util = activeWorker.utilidadesConfig || {};
    activeWorker.utilidadesConfig = util;
    document.querySelectorAll('[data-util]').forEach((el) => {
      const key = el.dataset.util;
      el.value = util[key] !== undefined && util[key] !== null ? util[key] : '';
    });

    // Parafiscales [data-para]
    const para = activeWorker.parafiscalesConfig || {};
    activeWorker.parafiscalesConfig = para;
    document.querySelectorAll('[data-para]').forEach((el) => {
      const key = el.dataset.para;
      if (el.type === 'checkbox') {
        el.checked = Boolean(para[key]);
      } else {
        el.value = para[key] !== undefined && para[key] !== null ? para[key] : '';
      }
    });

    toggleUtilidadesModeUI();
  }

  function populatePeerSelectors() {
    const others = Store.loadAll().filter((w) => !activeWorker || w.id !== activeWorker.id);
    const supSel = $('select-supervisor-existing');
    const subSel = $('select-sub-existing');
    const optionsHtml = others.map((w) => `<option value="${esc(w.id)}">${esc(w.nombre)} ${esc(w.apellido)} (${esc(w.cedula)})</option>`).join('');
    supSel.innerHTML = `<option value="">-- Elegir de expedientes --</option>${optionsHtml}`;
    subSel.innerHTML = `<option value="">+ Agregar desde expedientes</option>${optionsHtml}`;
  }

  function toggleUtilidadesModeUI() {
    const modo = activeWorker?.utilidadesConfig?.modo || 'dias';
    $('util-islr-fields').style.display = modo === 'beneficios_liquidos' ? 'grid' : 'none';
  }

  /* ========================================================================
     REFRESCO DE CÁLCULOS EN TODOS LOS PANELES
     ======================================================================== */
  function refreshAllCalculations() {
    if (!activeWorker) return;
    const calc = Calc.computeWorkerBenefits(activeWorker);
    const { origCur, dispCur, fmt } = getCurrencyHelpers(activeWorker);

    // 1. Banner Superior
    $('ws-avatar').textContent = getInitials(activeWorker.nombre, activeWorker.apellido);
    $('ws-fullname').textContent = `${activeWorker.nombre} ${activeWorker.apellido}`.trim();
    $('ws-pill-cedula').textContent = `C.I.: ${activeWorker.cedula}`;
    $('ws-pill-codigo').textContent = activeWorker.codigoExpediente;
    $('ws-pill-cargo').textContent = activeWorker.cargo ? `Cargo: ${activeWorker.cargo}` : 'Cargo sin asignar';
    $('ws-pill-antiguedad').textContent = `Tiempo de servicio: ${calc.serviceTime.text}`;
    const origNotice = (dispCur !== 'original' && dispCur !== origCur) ? ` (${dispCur})` : '';
    $('ws-pill-salario').textContent = `Salario Normal: ${fmt(calc.salaryData.salarioNormalMensual)}${origNotice}`;

    // 2. Tab 1: KPIs Tiempo de Servicio
    const st = calc.serviceTime;
    const nextVacDays = Calc.getVacationDaysForYear(Math.max(1, st.years)).total;
    $('kpi-tiempo-servicio').innerHTML = `
      <div class="kpi-card emerald">
        <div class="kpi-label">Tiempo de Servicio Exacto</div>
        <div class="kpi-value" style="font-size:17px;">${esc(st.text)}</div>
        <div class="kpi-sub">${st.valid ? `${st.totalDays} días acumulados (${st.totalMonths} meses)` : 'Verifica las fechas'}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Vacaciones y Bono por Antigüedad</div>
        <div class="kpi-value">${st.hasFirstYear ? `${calc.vacationsData.totalDiasVacaciones} días` : 'En formación'}</div>
        <div class="kpi-sub">${st.hasFirstYear ? `15 base + ${calc.vacationsData.diasAdicionales} adic. (Art. 190/192 LOTTT)` : `Al cumplir 1 año: ${nextVacDays} días hábiles`}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Próximo Aniversario Laboral</div>
        <div class="kpi-value" style="font-size:17px;">${st.nextAnniversary ? Calc.formatDateVE(st.nextAnniversary) : '—'}</div>
        <div class="kpi-sub">Ingreso: ${Calc.formatDateVE(activeWorker.fechaIngreso)}</div>
      </div>
      <div class="kpi-card amber">
        <div class="kpi-label">Neto Mensual Estimado</div>
        <div class="kpi-value">${fmt(calc.parafiscalesData.netoMensualConNoSalarial)}</div>
        <div class="kpi-sub">Deducciones mes: ${fmt(calc.parafiscalesData.totalDeduccionesMes)}</div>
      </div>
    `;

    // 3. Tab 2: Jerarquía
    renderHierarchyUI();

    // 4. Tab 3: Sueldos y Recargos
    renderSalaryUI(calc);

    // 5. Tab 4: Vacaciones
    renderVacationsUI(calc);

    // 6. Tab 5: Utilidades y Parafiscales
    renderUtilitiesAndParafiscalesUI(calc);

    // 7. Tab 6: Si está activo el resumen imprimible, actualizarlo en vivo
    if (activeTab === 'tab-print') {
      renderPrintSheet(calc);
    }
  }

  /* ---------- Tab 2: Jerarquía ---------- */
  function renderHierarchyUI() {
    const subs = Array.isArray(activeWorker.personalACargo) ? activeWorker.personalACargo : [];
    const tbody = $('tbody-subordinados');

    if (subs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:18px;">No hay personal a cargo registrado en este expediente.</td></tr>`;
    } else {
      tbody.innerHTML = subs.map((s) => `
        <tr>
          <td><strong>${esc(s.nombre)}</strong></td>
          <td>${esc(s.cedula || '—')}</td>
          <td>${esc(s.cargo || '—')}</td>
          <td>${esc(s.departamento || '—')}</td>
          <td><button type="button" class="btn btn-danger-soft btn-xs" data-del-sub="${esc(s.id)}">Quitar</button></td>
        </tr>
      `).join('');
    }

    const rep = activeWorker.reportaA || {};
    const hasSup = Boolean(rep.nombre && rep.nombre.trim());
    const tree = $('org-tree-preview');
    tree.innerHTML = `
      <div class="org-node">
        <div class="org-node-role">Reporta a (Supervisor)</div>
        <div class="org-node-name">${esc(hasSup ? rep.nombre : 'Sin supervisor asignado')}</div>
        <div style="font-size:11.5px;color:var(--text-muted);">${esc(rep.cargo || (hasSup ? 'Supervisor Directo' : '—'))}</div>
      </div>
      <div class="org-connector"></div>
      <div class="org-node current">
        <div class="org-node-role">Expediente Actual</div>
        <div class="org-node-name">${esc(activeWorker.nombre)} ${esc(activeWorker.apellido)}</div>
        <div style="font-size:11.5px;opacity:0.85;">${esc(activeWorker.cargo || 'Cargo no especificado')} · ${esc(activeWorker.cedula)}</div>
      </div>
      <div class="org-connector"></div>
      ${subs.length > 0 ? `
        <div class="org-children">
          ${subs.map((s) => `
            <div class="org-node" style="min-width:170px;">
              <div class="org-node-role">Personal a Cargo</div>
              <div class="org-node-name" style="font-size:12.5px;">${esc(s.nombre)}</div>
              <div style="font-size:11px;color:var(--text-muted);">${esc(s.cargo || '—')}</div>
            </div>
          `).join('')}
        </div>
      ` : `<div style="font-size:12px;color:var(--text-muted);">Sin personal subordinado a su cargo</div>`}
    `;
  }

  /* ---------- Tab 3: Sueldos Devengados y Recargos ---------- */
  function renderSalaryUI(calc) {
    const { fmt } = getCurrencyHelpers(activeWorker);
    const s = calc.salaryData;
    const integ = calc.integralData;

    $('kpi-salarios').innerHTML = `
      <div class="kpi-card">
        <div class="kpi-label">Salario Normal Mensual</div>
        <div class="kpi-value">${fmt(s.salarioNormalMensual)}</div>
        <div class="kpi-sub">Diario: ${fmt(s.salarioDiario)} (/30) · Semanal: ${fmt(s.salarioSemanal)}</div>
      </div>
      <div class="kpi-card emerald">
        <div class="kpi-label">Salario Integral Mensual</div>
        <div class="kpi-value">${fmt(integ.salarioIntegralMensual)}</div>
        <div class="kpi-sub">Diario: ${fmt(integ.salarioIntegralDiario)} (incl. alíc. vac. y util.)</div>
      </div>
      <div class="kpi-card amber">
        <div class="kpi-label">Recargos y Horas Extras</div>
        <div class="kpi-value">${fmt(s.totalRecargos)}</div>
        <div class="kpi-sub">Total Salarial: ${fmt(s.totalDevengadoSalarial)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Beneficios No Salariales</div>
        <div class="kpi-value">${fmt(s.totalNoSalarial)}</div>
        <div class="kpi-sub">Excluidos de base salarial (Art. 105)</div>
      </div>
    `;

    $('tbody-salary-formulas').innerHTML = `
      <tr><td><strong>Salario Normal</strong></td><td>Devengado regularmente</td><td>Art. 104 y 113</td><td class="num"><strong>${fmt(s.salarioNormalMensual)}</strong></td></tr>
      <tr><td>Salario Diario</td><td>Salario Normal / 30</td><td>Art. 113</td><td class="num">${fmt(s.salarioDiario)}</td></tr>
      <tr><td>Salario Semanal</td><td>Salario Diario × 7</td><td>—</td><td class="num">${fmt(s.salarioSemanal)}</td></tr>
      <tr><td>Bono Nocturno (1 jornada)</td><td>Salario Diario × 30%</td><td>Art. 117</td><td class="num">${fmt(s.valorBonoNocturnoJornada)}</td></tr>
      <tr><td>Hora Extra Diurna (1 hr)</td><td>(Salario Diario / 8) × 150%</td><td>Art. 118</td><td class="num">${fmt(s.valorHoraExtraDiurna)}</td></tr>
      <tr><td>Hora Extra Nocturna (1 hr)</td><td>((Salario Diario / 8) × 150%) × 130%</td><td>Art. 117</td><td class="num">${fmt(s.valorHoraExtraNocturna)}</td></tr>
      <tr><td>Día Feriado o Descanso (1 día)</td><td>Salario Diario × 150%</td><td>Art. 120</td><td class="num">${fmt(s.valorDiaFeriado)}</td></tr>
      <tr><td>Alícuota Bono Vacacional (diaria)</td><td>(Diario × ${integ.diasBonoParaAlicuota} d) / 360</td><td>LOTTT</td><td class="num">${fmt(integ.alicuotaBonoVacacionalDiaria)}</td></tr>
      <tr><td>Alícuota Utilidades (diaria)</td><td>(Diario × ${integ.diasUtilidadesParaAlicuota} d) / 360</td><td>LOTTT</td><td class="num">${fmt(integ.alicuotaUtilidadesDiaria)}</td></tr>
      <tr style="background:var(--navy-50);font-weight:700;"><td>Salario Integral Diario</td><td>Normal + Alícuotas + Regularizados</td><td>Doctrina / FAOV</td><td class="num">${fmt(integ.salarioIntegralDiario)}</td></tr>
    `;

    const hist = calc.historialSueldos;
    const tbodyHist = $('tbody-sueldos-historial');
    if (hist.length === 0) {
      tbodyHist.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:18px;">Aún no has guardado períodos en el historial. Pulsa "+ Guardar Período en Historial" arriba.</td></tr>`;
    } else {
      tbodyHist.innerHTML = hist.map((h) => `
        <tr>
          <td><strong>${esc(h.periodo)}</strong></td>
          <td class="num">${fmt(h.calc.sueldoBase)}</td>
          <td class="num">${fmt(h.calc.salarioNormalMensual)}</td>
          <td class="num">${fmt(h.calc.totalRecargos)}</td>
          <td class="num">${fmt(h.calc.totalNoSalarial)}</td>
          <td class="num"><strong>${fmt(h.calc.totalDevengadoSalarial)}</strong></td>
          <td>
            <button type="button" class="btn btn-outline btn-xs" data-load-sal="${esc(h.id)}">Cargar</button>
            <button type="button" class="btn btn-danger-soft btn-xs" data-del-sal="${esc(h.id)}">✕</button>
          </td>
        </tr>
      `).join('');
    }
  }

  /* ---------- Tab 4: Vacaciones ---------- */
  function renderVacationsUI(calc) {
    const { fmt } = getCurrencyHelpers(activeWorker);
    const v = calc.vacationsData;

    $('kpi-vacaciones').innerHTML = `
      <div class="kpi-card">
        <div class="kpi-label">Días Vacaciones / Bono (Año Actual)</div>
        <div class="kpi-value">${v.totalDiasVacaciones} / ${v.totalDiasBono} días</div>
        <div class="kpi-sub">Antigüedad: ${v.yearsCompleted} año(s) cumplidos</div>
      </div>
      <div class="kpi-card emerald">
        <div class="kpi-label">Total Vacaciones + Bono (Anual)</div>
        <div class="kpi-value">${fmt(v.totalPeriodoActual)}</div>
        <div class="kpi-sub">Base diaria: ${fmt(v.baseSal.diario)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Histórico Disfrutado y Pagado</div>
        <div class="kpi-value">${fmt(v.totalPagadoHistorico)}</div>
        <div class="kpi-sub">${v.periodosDisfrutados} período(s) · ${v.totalDiasDisfrutados} días disfrutados</div>
      </div>
      <div class="kpi-card rose">
        <div class="kpi-label">Pasivo Vacacional Pendiente</div>
        <div class="kpi-value">${fmt(v.totalPasivoPendiente)}</div>
        <div class="kpi-sub">${v.periodosCausados} causadas · ${v.periodosNoDisfrutados} no disfrutadas</div>
      </div>
    `;

    $('vac-base-callout').innerHTML = `
      <div><strong>Base legal aplicada (Art. 121 LOTTT):</strong> ${esc(v.baseSal.criterio)} — Salario Normal Mensual: <strong>${fmt(v.baseSal.mensual)}</strong> / Diario: <strong>${fmt(v.baseSal.diario)}</strong>.</div>
    `;

    $('tbody-vac-current').innerHTML = `
      <tr><td>Vacaciones Base (Art. 190 LOTTT)</td><td class="num">${v.diasBase} días</td><td class="num">${fmt(v.montoVacacionesBase)}</td></tr>
      <tr><td>Días Adicionales de Vacaciones (+1/año desde el 2do, máx. 15)</td><td class="num">${v.diasAdicionales} días</td><td class="num">${fmt(v.montoVacacionesAdicionales)}</td></tr>
      <tr><td>Bono Vacacional Base (Art. 192 LOTTT)</td><td class="num">${v.diasBase} días</td><td class="num">${fmt(v.montoBonoBase)}</td></tr>
      <tr><td>Días Adicionales de Bono Vacacional (+1/año, máx. 15)</td><td class="num">${v.diasAdicionales} días</td><td class="num">${fmt(v.montoBonoAdicional)}</td></tr>
      <tr style="background:var(--navy-50);font-weight:800;">
        <td>Total Vacaciones y Bono Vacacional (Período Anual)</td>
        <td class="num">${v.totalDiasVacaciones + v.totalDiasBono} días</td>
        <td class="num">${fmt(v.totalPeriodoActual)}</td>
      </tr>
      ${v.monthsInCurrentYear > 0 ? `
        <tr>
          <td>Fraccionadas del año en curso (${v.monthsInCurrentYear} meses completos)</td>
          <td class="num">${Calc.formatNumber(v.diasFraccionadosVac + v.diasFraccionadosBono, 2)} días</td>
          <td class="num">${fmt(v.totalFraccionado)}</td>
        </tr>
      ` : ''}
    `;

    // Actualizar valores sugeridos en el formulario de nueva vacación
    if (!$('vac-sal-diario').matches(':focus')) {
      $('vac-sal-diario').placeholder = `Auto: ${Calc.formatNumber(v.baseSal.diario, 2)}`;
    }

    const tbody = $('tbody-vac-historial');
    if (v.historialEnriquecido.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:18px;">Sin períodos registrados. Puedes usar "Autogenerar por Antigüedad" o agregar períodos manualmente.</td></tr>`;
    } else {
      tbody.innerHTML = v.historialEnriquecido.map((item) => {
        const badgeCls = item.estatus === 'disfrutada'
          ? 'status-disfrutada'
          : (item.estatus === 'no_disfrutada' ? 'status-no-disfrutada' : 'status-causada');
        const badgeTxt = item.estatus === 'disfrutada'
          ? 'Disfrutada y Pagada'
          : (item.estatus === 'no_disfrutada' ? 'No Disfrutada (Pasivo)' : 'Causada (Pendiente)');
        return `
          <tr>
            <td><strong>${esc(item.periodoLabel || `Año ${item.anioServicio}`)}</strong>${item.observaciones ? `<div style="font-size:11px;color:var(--text-muted);">${esc(item.observaciones)}</div>` : ''}</td>
            <td><span class="status-badge ${badgeCls}">${badgeTxt}</span></td>
            <td>${item.fechaInicio ? `${Calc.formatDateVE(item.fechaInicio)} al ${Calc.formatDateVE(item.fechaFin)}` : 'Pendiente'}</td>
            <td>${Calc.formatDateVE(item.fechaPago)}</td>
            <td class="num">${item.diasVac} / ${item.diasDisfrutados || 0}</td>
            <td class="num">${fmt(item.montoVac)}</td>
            <td class="num">${fmt(item.montoBono)}</td>
            <td class="num"><strong>${fmt(item.totalItem)}</strong></td>
            <td>
              <button type="button" class="btn btn-outline btn-xs" data-cycle-vac="${esc(item.id)}" title="Cambiar estatus">Estado</button>
              <button type="button" class="btn btn-danger-soft btn-xs" data-del-vac="${esc(item.id)}">✕</button>
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  /* ---------- Tab 5: Utilidades y Parafiscales ---------- */
  function renderUtilitiesAndParafiscalesUI(calc) {
    const { fmt } = getCurrencyHelpers(activeWorker);
    const u = calc.utilitiesData;
    const p = calc.parafiscalesData;

    $('util-criterio-callout').innerHTML = `<div><strong>Criterio Legal Aplicado:</strong> ${esc(u.criterioAplicado)}.</div>`;

    $('tbody-utilidades').innerHTML = `
      <tr><td>Referencia 30 días (Mínimo legal Art. 131)</td><td class="num">${fmt(u.comparativa.dias30)}</td></tr>
      <tr><td>Referencia 60 días / 90 días / 120 días (Máx. 4 meses)</td><td class="num">${fmt(u.comparativa.dias60)} / ${fmt(u.comparativa.dias90)} / ${fmt(u.comparativa.dias120)}</td></tr>
      ${u.modo === 'beneficios_liquidos' ? `
        <tr><td>15% Beneficios Líquidos Empresa (Art. 131 y 133)</td><td class="num">${fmt(u.quincePorCientoBeneficios)}</td></tr>
        <tr><td>Participación Bruta del Trabajador (Art. 136)</td><td class="num">${fmt(u.participacionBruta15)}</td></tr>
      ` : ''}
      <tr style="background:var(--navy-50);font-weight:700;">
        <td>Utilidades Brutas Correspondientes (${Calc.formatNumber(u.diasEquivalentes, 2)} días)</td>
        <td class="num">${fmt(u.montoBruto)}</td>
      </tr>
      <tr>
        <td>Retención INCES Empleado (0,5% Art. 50 — enterar en 10 días)</td>
        <td class="num" style="color:var(--rose-700);">- ${fmt(u.retencionInces)}</td>
      </tr>
      <tr style="background:var(--emerald-50);font-weight:800;color:var(--emerald-700);">
        <td>TOTAL UTILIDADES NETAS A RECIBIR</td>
        <td class="num">${fmt(u.montoNeto)}</td>
      </tr>
      ${u.anticipoDiciembre > 0 ? `
        <tr><td>Menos Anticipo / Bonificación Pagada en Diciembre (Art. 132)</td><td class="num">- ${fmt(u.anticipoDiciembre)}</td></tr>
        <tr style="background:var(--amber-50);font-weight:800;color:var(--amber-700);">
          <td>Diferencia por Pagar al Cierre del Ejercicio (Dentro de 2 meses, Art. 137)</td>
          <td class="num">${fmt(u.diferenciaPorPagar)}</td>
        </tr>
      ` : ''}
    `;

    // Hint lunes del mes
    $('para-lunes-auto-hint').textContent = `(Auto ${p.periodo}: ${p.lunesAuto} lunes)`;
    const usarLunesManual = Boolean(activeWorker.parafiscalesConfig.usarLunesManual);
    $('para-lunes-manual').disabled = !usarLunesManual;
    if (!usarLunesManual) {
      $('para-lunes-manual').value = p.lunesAuto;
    }
    $('para-tope-monto').disabled = !activeWorker.parafiscalesConfig.aplicarTopeIvss;
    $('para-inces-sueldos').disabled = !activeWorker.parafiscalesConfig.incesUsarPersonalizado;
    $('para-inces-vac').disabled = !activeWorker.parafiscalesConfig.incesUsarPersonalizado;

    $('kpi-parafiscales').innerHTML = `
      <div class="kpi-card rose">
        <div class="kpi-label">Retenciones Legales Mes</div>
        <div class="kpi-value">${fmt(p.totalDeduccionesLegalesMes)}</div>
        <div class="kpi-sub">Voluntarias: ${fmt(p.totalDeduccionesVoluntariasMes)}</div>
      </div>
      <div class="kpi-card emerald">
        <div class="kpi-label">Neto a Cobrar (Salarial + No Sal.)</div>
        <div class="kpi-value">${fmt(p.netoMensualConNoSalarial)}</div>
        <div class="kpi-sub">Solo salarial neto: ${fmt(p.netoMensualSalarial)}</div>
      </div>
      <div class="kpi-card amber">
        <div class="kpi-label">Aportes Patronales Mes</div>
        <div class="kpi-value">${fmt(p.totalAportesPatronalesMes)}</div>
        <div class="kpi-sub">${esc(p.rate.label)} · ${p.numLunes} lunes</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Costo Total Mensual Patrono</div>
        <div class="kpi-value">${fmt(p.costoTotalMensualPatrono)}</div>
        <div class="kpi-sub">Salarial + No Salarial + Aportes</div>
      </div>
    `;

    $('tbody-parafiscales').innerHTML = `
      <tr>
        <td><strong>IVSS — Seguro Social Obligatorio (S.S.O.)</strong></td>
        <td>(${fmt(p.baseIvss)} × 12 / 52) × 4% emp. / ${Calc.formatNumber(p.rate.patronoSso * 100, 0)}% pat. × ${p.numLunes} lunes · Primeros 5 días hábiles</td>
        <td class="num">${fmt(p.ssoEmpleado)}</td>
        <td class="num">${fmt(p.ssoPatrono)}</td>
        <td class="num">${fmt(p.ssoEmpleado + p.ssoPatrono)}</td>
      </tr>
      <tr>
        <td><strong>IVSS — Pérdida Involuntaria de Empleo (P.I.E.)</strong></td>
        <td>(${fmt(p.baseIvss)} × 12 / 52) × 0,5% emp. / 2% pat. × ${p.numLunes} lunes · Art. 46 LRPE</td>
        <td class="num">${fmt(p.pieEmpleado)}</td>
        <td class="num">${fmt(p.piePatrono)}</td>
        <td class="num">${fmt(p.pieEmpleado + p.piePatrono)}</td>
      </tr>
      <tr>
        <td><strong>FAOV — BANAVIH (3%)</strong></td>
        <td>Base ${p.faovBaseModo === 'normal' ? 'Salario Normal' : 'Salario Integral'} (${fmt(p.baseFaov)}) × 1% emp. / 2% empresa · Art. 33 LRPVH</td>
        <td class="num">${fmt(p.faovEmpleado)}</td>
        <td class="num">${fmt(p.faovPatrono)}</td>
        <td class="num">${fmt(p.faovEmpleado + p.faovPatrono)}</td>
      </tr>
      <tr>
        <td><strong>INCES Patronal (2% Trimestral)</strong></td>
        <td>${p.aplicaInces ? `Base trimestral ${fmt(p.totalBaseIncesTrimestre)} × 2% = ${fmt(p.incesPatronoTrimestral)} trim. (provisión mensual)` : 'Exento (<5 trabajadores)'} · Art. 49 Ley INCES</td>
        <td class="num">—</td>
        <td class="num">${fmt(p.incesPatronoMensualRef)}</td>
        <td class="num">${fmt(p.incesPatronoMensualRef)}</td>
      </tr>
      <tr>
        <td><strong>INCES Trabajador sobre Utilidades (0,5% Anual)</strong></td>
        <td>Retención única al pagar utilidades (Art. 50; sin aporte patronal) · No descontado del sueldo mensual</td>
        <td class="num"><em>${fmt(p.incesEmpleadoUtilidades)} (anual)</em></td>
        <td class="num">0,00</td>
        <td class="num"><em>${fmt(p.incesEmpleadoUtilidades)}</em></td>
      </tr>
      <tr style="background:var(--navy-50);font-weight:800;">
        <td colspan="2">TOTAL MENSUAL PARAFISCAL (S.S.O. + P.I.E. + FAOV + Prov. INCES)</td>
        <td class="num">${fmt(p.totalDeduccionesLegalesMes)}</td>
        <td class="num">${fmt(p.totalAportesPatronalesMes)}</td>
        <td class="num">${fmt(p.totalDeduccionesLegalesMes + p.totalAportesPatronalesMes)}</td>
      </tr>
    `;
  }

  /* ---------- Tab 6: Selector y Renderizado de Documentos Imprimibles ---------- */
  function getMonthBounds(ymStr) {
    const fallback = Store.currentMonthISO();
    const [yStr, mStr] = String(ymStr || fallback).split('-');
    const y = parseInt(yStr, 10) || new Date().getFullYear();
    const m = parseInt(mStr, 10) || (new Date().getMonth() + 1);
    const lastDay = new Date(y, m, 0).getDate();
    const mm = String(m).padStart(2, '0');
    return {
      year: y,
      month: m,
      first: `${y}-${mm}-01`,
      day15: `${y}-${mm}-15`,
      day16: `${y}-${mm}-16`,
      last: `${y}-${mm}-${String(lastDay).padStart(2, '0')}`
    };
  }

  function applyPeriodicDefaults(docType) {
    if (!activeWorker) return;
    const calc = Calc.computeWorkerBenefits(activeWorker);
    const bounds = getMonthBounds(activeWorker.parafiscalesConfig?.periodoMes || activeWorker.salarioActual?.periodo);

    if (docType === 'recibo_mensual') {
      $('rec-fecha-desde').value = bounds.first;
      $('rec-fecha-hasta').value = bounds.last;
      $('rec-lunes').value = calc.parafiscalesData.numLunes;
    } else if (docType === 'recibo_quincenal') {
      const q = $('rec-quincena-num').value || '1';
      if (q === '2') {
        $('rec-fecha-desde').value = bounds.day16;
        $('rec-fecha-hasta').value = bounds.last;
        $('rec-lunes').value = Math.max(2, calc.parafiscalesData.numLunes - 2);
      } else {
        $('rec-fecha-desde').value = bounds.first;
        $('rec-fecha-hasta').value = bounds.day15;
        $('rec-lunes').value = 2;
      }
    } else if (docType === 'recibo_semanal') {
      const ref = new Date((activeWorker.fechaCorte || Store.todayISO()) + 'T00:00:00');
      const day = ref.getDay();
      const diffToMonday = day === 0 ? -6 : (1 - day);
      const mon = new Date(ref);
      mon.setDate(ref.getDate() + diffToMonday);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      $('rec-fecha-desde').value = toISO(mon);
      $('rec-fecha-hasta').value = toISO(sun);
      $('rec-lunes').value = 1;
    }
  }

  function syncVacationReceiptSelector() {
    if (!activeWorker) return;
    const sel = $('rvac-periodo-select');
    const prev = sel.value || 'actual';
    const hist = Array.isArray(activeWorker.vacacionesHistorial) ? activeWorker.vacacionesHistorial : [];
    sel.innerHTML = `<option value="actual">Período Actual por Antigüedad</option>` +
      hist.map((v) => `<option value="${esc(v.id)}">${esc(v.periodoLabel || ('Año ' + v.anioServicio))} (${v.diasCorrespondientes} días)</option>`).join('');
    if (Array.from(sel.options).some((o) => o.value === prev)) {
      sel.value = prev;
    }
    if (!$('rvac-fecha-pago').value) {
      $('rvac-fecha-pago').value = Store.todayISO();
    }
  }

  function syncLiquidationDateDefaults() {
    if (!activeWorker) return;
    const corte = activeWorker.fechaCorte || Store.todayISO();
    if (!$('lpar-fecha-corte').value) $('lpar-fecha-corte').value = corte;
    if (!$('ldef-fecha-egreso').value) $('ldef-fecha-egreso').value = corte;
  }

  function selectPrintDocType(docType) {
    activeDocType = docType || 'resumen_integral';
    document.querySelectorAll('#doc-type-selector .doc-type-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.docType === activeDocType);
    });

    const isPeriodic = activeDocType === 'recibo_mensual' || activeDocType === 'recibo_quincenal' || activeDocType === 'recibo_semanal';
    $('cfg-resumen-integral').classList.toggle('hidden', activeDocType !== 'resumen_integral');
    $('cfg-recibo-periodico').classList.toggle('hidden', !isPeriodic);
    $('grp-quincena-num').classList.toggle('hidden', activeDocType !== 'recibo_quincenal');
    $('cfg-recibo-vacaciones').classList.toggle('hidden', activeDocType !== 'recibo_vacaciones');
    $('cfg-liq-parcial').classList.toggle('hidden', activeDocType !== 'liquidacion_parcial');
    $('cfg-liq-definitiva').classList.toggle('hidden', activeDocType !== 'liquidacion_definitiva');

    if (isPeriodic) {
      applyPeriodicDefaults(activeDocType);
    } else if (activeDocType === 'recibo_vacaciones') {
      syncVacationReceiptSelector();
    } else if (activeDocType === 'liquidacion_parcial' || activeDocType === 'liquidacion_definitiva') {
      syncLiquidationDateDefaults();
    }

    renderPrintSheet();
  }

  function collectPrintOptions() {
    let printCur = $('select-print-currency') ? $('select-print-currency').value : 'global';
    let targetCur = 'original';
    if (printCur === 'global') {
      targetCur = Cur ? Cur.getDisplayCurrency(activeWorker) : (activeWorker ? (activeWorker.moneda || 'Bs.') : 'Bs.');
    } else {
      targetCur = printCur; // 'original', 'Bs.', 'USD', 'EUR'
    }

    const baseOpts = { displayCurrency: targetCur };

    if (activeDocType === 'resumen_integral') {
      return Object.assign(baseOpts, {
        incluirJerarquia: $('opt-print-jerarquia').checked,
        incluirHistorialSueldos: $('opt-print-historial').checked,
        incluirVacaciones: $('opt-print-vacaciones').checked,
        incluirUtilidades: $('opt-print-utilidades').checked,
        incluirParafiscales: $('opt-print-parafiscales').checked,
        incluirAportesPatronales: $('opt-print-patronal').checked
      });
    }
    if (activeDocType === 'recibo_mensual' || activeDocType === 'recibo_quincenal' || activeDocType === 'recibo_semanal') {
      return Object.assign(baseOpts, {
        quincenaNum: $('rec-quincena-num').value,
        fechaDesde: $('rec-fecha-desde').value,
        fechaHasta: $('rec-fecha-hasta').value,
        lunesRecibo: $('rec-lunes').value,
        formaPago: $('rec-forma-pago').value.trim(),
        incluirNoSalarial: $('rec-incluir-nosal').checked,
        prorratearRecargos: $('rec-prorratear-recargos').checked,
        mostrarAportesPatronales: $('rec-mostrar-patronal').checked
      });
    }
    if (activeDocType === 'recibo_vacaciones') {
      return Object.assign(baseOpts, {
        vacPeriodoId: $('rvac-periodo-select').value,
        fechaSalida: $('rvac-fecha-salida').value,
        fechaReincorporacion: $('rvac-fecha-reinc').value,
        fechaPagoVac: $('rvac-fecha-pago').value,
        otrasDedVac: parseFloat($('rvac-otras-ded').value) || 0,
        obsVac: $('rvac-obs').value.trim(),
        aplicarFaovVac: $('rvac-aplicar-faov').checked
      });
    }
    if (activeDocType === 'liquidacion_parcial') {
      return Object.assign(baseOpts, {
        fechaEgreso: $('lpar-fecha-corte').value || activeWorker.fechaCorte,
        motivoAnticipo: $('lpar-motivo').value,
        porcentajeAnticipo: parseFloat($('lpar-porcentaje').value) || 0,
        montoAnticipoManual: parseFloat($('lpar-monto-manual').value) || 0,
        anticiposPrevios: parseFloat($('lpar-anticipos-prev').value) || 0,
        interesesPrestaciones: parseFloat($('lpar-intereses').value) || 0,
        incluirVacEnParcial: $('lpar-incluir-vac').checked
      });
    }
    if (activeDocType === 'liquidacion_definitiva') {
      return Object.assign(baseOpts, {
        fechaEgreso: $('ldef-fecha-egreso').value || activeWorker.fechaCorte,
        motivoEgreso: $('ldef-motivo').value,
        anticiposPrevios: parseFloat($('ldef-anticipos').value) || 0,
        interesesPrestaciones: parseFloat($('ldef-intereses').value) || 0,
        diasSalarioPendientes: parseFloat($('ldef-dias-sal').value) || 0,
        deduccionesFinales: parseFloat($('ldef-deducciones').value) || 0,
        incluirVacaciones: $('ldef-incluir-vac').checked,
        incluirUtilidades: $('ldef-incluir-util').checked
      });
    }
    return baseOpts;
  }

  function renderPrintSheet(calcOpt) {
    if (!activeWorker) return;
    if (activeDocType === 'recibo_vacaciones') {
      syncVacationReceiptSelector();
    }
    if (activeDocType === 'liquidacion_parcial' || activeDocType === 'liquidacion_definitiva') {
      syncLiquidationDateDefaults();
    }
    const calc = calcOpt || Calc.computeWorkerBenefits(activeWorker);
    const opts = collectPrintOptions();
    $('print-sheet-container').innerHTML = Print.renderDocument(activeDocType, activeWorker, calc, opts);

    // Actualizar datos de carpeta de empresa en la barra de archivo
    if ($('print-company-name')) {
      $('print-company-name').textContent = activeWorker.empresaNombre || 'EMPRESA, C.A.';
    }
    if ($('print-filename-hint')) {
      $('print-filename-hint').textContent = `${getCleanPrintTitle()}.pdf`;
    }
  }

  function triggerPrintPDF() {
    if (!activeWorker) return;
    renderPrintSheet();
    const title = getCleanPrintTitle();
    const origTitle = document.title;
    document.title = title;
    const compName = activeWorker.empresaNombre || 'la empresa';
    showToast(`Preparando PDF para ${compName}. Selecciona "Guardar como PDF" para archivar en su carpeta.`);
    window.print();
    setTimeout(() => { document.title = origTitle; }, 1200);
  }

  function downloadHTMLArchive() {
    if (!activeWorker) return;
    renderPrintSheet();
    const calc = Calc.computeWorkerBenefits(activeWorker);
    const opts = collectPrintOptions();
    const renderedHtml = Print.renderDocument(activeDocType, activeWorker, calc, opts);
    const title = getCleanPrintTitle();

    const fullDoc = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${esc(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #fff; color: #000; margin: 15mm; font-size: 11px; }
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
    .doc-legal-footer { margin-top: 24px; font-size: 9.5px; color: #64748b; border-top: 1px dashed #cbd5e1; padding-top: 8px; }
    .no-print-bar { background: #0f172a; color: #fff; padding: 8px 16px; margin: -15mm -15mm 16mm -15mm; display: flex; justify-content: space-between; align-items: center; }
    .no-print-bar button { background: #10b981; color: #fff; border: none; padding: 6px 14px; border-radius: 4px; font-weight: 700; cursor: pointer; }
    @media print { .no-print-bar { display: none !important; } body { margin: 10mm 12mm; } }
  </style>
</head>
<body>
  <div class="no-print-bar">
    <span>📁 Archivo Digital Oficial — Carpeta: <strong>${esc(activeWorker.empresaNombre || 'EMPRESA')}</strong></span>
    <button type="button" onclick="window.print()">🖨️ Imprimir / Guardar en PDF</button>
  </div>
  ${renderedHtml}
</body>
</html>`;

    const blob = new Blob([fullDoc], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title}.html`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Copia digital de ${activeWorker.nombre} ${activeWorker.apellido} descargada para archivar.`);
  }

  /* ========================================================================
     GESTIÓN DE CARPETA LOCAL EN PC (FILE SYSTEM ACCESS API)
     ======================================================================== */
  function updatePCDirStatusUI() {
    if (!LocalFS) return;
    const isConn = LocalFS.isConnected();
    const name = LocalFS.getRootName();

    const topStatus = $('top-pc-status');
    if (topStatus) {
      if (isConn && name) {
        topStatus.textContent = name;
        topStatus.style.color = '#10b981';
      } else {
        topStatus.textContent = 'No seleccionada';
        topStatus.style.color = '#6ee7b7';
      }
    }

    const modalStatus = $('label-modal-pc-dir-status');
    if (modalStatus) {
      if (isConn && name) {
        modalStatus.innerHTML = `🟢 Carpeta vinculada en tu PC: <strong>${esc(name)}</strong> (Lista para escribir subcarpetas y expedientes)`;
        modalStatus.style.color = '#047857';
      } else {
        modalStatus.innerHTML = `⚠️ Ninguna carpeta vinculada. Haz clic en "Seleccionar / Cambiar Carpeta en mi PC".`;
        modalStatus.style.color = '#b45309';
      }
    }

    updateLandingPathPreview();
    if (activeWorker) {
      updateActiveWorkerPathUI();
    }
  }

  function updateLandingPathPreview() {
    const root = (LocalFS && LocalFS.getRootName()) || '[Carpeta en PC]';
    const empSelect = $('new-empresa-select');
    let empName = 'Cuadrados Food';
    if (empSelect && empSelect.value) {
      const c = Store.getCompanyById(empSelect.value);
      if (c && c.nombre) empName = c.nombre;
    }
    const depto = $('new-departamento')?.value.trim() || 'Departamento de Producción';
    const nom = $('new-nombre')?.value.trim() || 'Carlos';
    const ape = $('new-apellido')?.value.trim() || 'Perez';
    const workerName = `${nom} ${ape}`.trim();

    const el = $('landing-path-preview');
    if (el) {
      el.textContent = `${root} \\ ${empName} \\ ${depto} \\ ${workerName}`;
    }
  }

  function updateActiveWorkerPathUI() {
    if (!activeWorker || !LocalFS) return;
    const pathInfo = LocalFS.getWorkerPathStructure(activeWorker);
    const root = LocalFS.getRootName();
    const fullText = root ? `${root} \\ ${pathInfo.fullPathString}` : pathInfo.fullPathString;

    if ($('ws-pc-path-text')) $('ws-pc-path-text').textContent = fullText;
    if ($('print-pc-dest-hint')) $('print-pc-dest-hint').textContent = fullText;
  }

  async function handleSelectPCDir() {
    if (!LocalFS) return;
    if (!LocalFS.isSupported()) {
      alert('Tu navegador no soporta la selección de directorios locales con la API estándar (File System Access). Te recomendamos usar Google Chrome o Microsoft Edge en tu PC, o usar el botón de Descargar Estructura en ZIP.');
      return;
    }
    try {
      const res = await LocalFS.selectRootDirectory();
      if (res) {
        updatePCDirStatusUI();
        showToast(`🟢 Carpeta seleccionada: "${res.name}". Ya puedes guardar directorios en tu PC.`);
      }
    } catch (err) {
      showToast(err.message, true);
    }
  }

  async function handleSaveActiveWorkerToPC() {
    if (!activeWorker) return;
    if (!LocalFS) return;

    if (!LocalFS.isConnected()) {
      const ok = confirm(`Para guardar la carpeta física de este trabajador en tu PC necesitas seleccionar la carpeta raíz (por ejemplo, 'mis empresas' en tu Escritorio o Disco C:).\n\n¿Deseas seleccionarla ahora?`);
      if (ok) {
        try {
          const res = await LocalFS.selectRootDirectory();
          if (!res) return;
          updatePCDirStatusUI();
        } catch (err) {
          showToast(err.message, true);
          return;
        }
      } else {
        return;
      }
    }

    try {
      const calc = Calc.computeWorkerBenefits(activeWorker);
      const printOpts = collectPrintOptions();
      const res = await LocalFS.saveWorkerToLocalPC(activeWorker, calc, {
        displayCurrency: printOpts.displayCurrency || (Cur ? Cur.getDisplayCurrency(activeWorker) : activeWorker.moneda)
      });
      updateActiveWorkerPathUI();
      showToast(`✅ ¡Directorio y 5 archivos guardados en tu PC!\n${res.pathString}`);
    } catch (err) {
      showToast(`Error al guardar en PC: ${err.message}`, true);
    }
  }

  async function handleSyncAllToPC() {
    if (!LocalFS) return;
    const all = Store.loadAll();
    if (all.length === 0) {
      showToast('No hay expedientes registrados para sincronizar en tu PC.', true);
      return;
    }

    if (!LocalFS.isConnected()) {
      const ok = confirm(`Selecciona la carpeta raíz en tu PC para crear los directorios de todos los trabajadores registrados.`);
      if (ok) {
        try {
          const res = await LocalFS.selectRootDirectory();
          if (!res) return;
          updatePCDirStatusUI();
        } catch (err) {
          showToast(err.message, true);
          return;
        }
      } else {
        return;
      }
    }

    try {
      showToast('Creando directorios y archivos en tu PC...');
      const dispCur = Cur ? Cur.getRates().monedaVisualizacion : 'original';
      const res = await LocalFS.syncAllToLocalPC(all, { displayCurrency: dispCur });
      showToast(`✅ ¡Sincronización completa! Se crearon los directorios de ${res.totalWorkers} trabajador(es) en "${res.rootName}".`);
    } catch (err) {
      showToast(`Error en sincronización: ${err.message}`, true);
    }
  }

  function handleDownloadStructuredZip() {
    if (!LocalFS) return;
    const all = Store.loadAll();
    if (all.length === 0) {
      showToast('No hay expedientes registrados para descargar.', true);
      return;
    }
    LocalFS.exportStructuredZip(all);
    showToast(`📦 Generando y descargando archivo ZIP con la estructura de carpetas...`);
  }

  /* ========================================================================
     GESTIÓN DE TASAS DE CAMBIO Y MONEDA UNIVERSAL
     ======================================================================== */
  function updateCurrencyUI() {
    if (!Cur) return;
    const rates = Cur.getRates();
    const effUsd = Cur.getEffectiveUsdRate();
    const isCustom = rates.tasaUsadaDolar === 'otra';
    const rateText = isCustom
      ? `USD: ${effUsd.toFixed(2)} (${rates.otraNombre || 'Pers.'}) · EUR: ${rates.tasaEur.toFixed(2)} Bs.`
      : `BCV USD: ${effUsd.toFixed(2)} · EUR: ${rates.tasaEur.toFixed(2)} Bs.`;

    if ($('top-rate-indicator')) {
      $('top-rate-indicator').textContent = rateText;
    }
    if ($('select-global-currency')) {
      $('select-global-currency').value = rates.monedaVisualizacion || 'original';
    }
    if ($('modal-select-display-cur')) {
      $('modal-select-display-cur').value = rates.monedaVisualizacion || 'original';
    }
    if ($('tasa-bcv-usd')) {
      $('tasa-bcv-usd').value = rates.tasaUsd;
    }
    if ($('tasa-bcv-eur')) {
      $('tasa-bcv-eur').value = rates.tasaEur;
    }
    if ($('tasa-fecha-ref')) {
      $('tasa-fecha-ref').value = rates.fechaTasa || '';
    }
    if ($('tasa-otra-nombre')) {
      $('tasa-otra-nombre').value = rates.otraNombre || '';
    }
    if ($('tasa-otra-valor')) {
      $('tasa-otra-valor').value = rates.tasaOtra || '';
    }

    const radios = document.querySelectorAll('input[name="radio-tasa-dolar"]');
    radios.forEach((r) => {
      r.checked = (r.value === rates.tasaUsadaDolar);
    });
  }

  function openTasasModal() {
    updateCurrencyUI();
    const modal = $('modal-tasas');
    if (modal) modal.classList.remove('hidden');
  }

  function closeTasasModal() {
    const modal = $('modal-tasas');
    if (modal) modal.classList.add('hidden');
  }

  async function handleFetchBcvLive() {
    if (!Cur) return;
    const btn = $('btn-fetch-bcv-live');
    const originalText = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Consultando BCV...';
    }

    try {
      const res = await Cur.fetchLiveBcvRates();
      if (res && res.success) {
        const usd = res.usd || (res.rates && res.rates.tasaUsd);
        const eur = res.eur || (res.rates && res.rates.tasaEur);
        const fecha = res.fecha || (res.rates && res.rates.fechaTasa);

        if ($('tasa-bcv-usd')) $('tasa-bcv-usd').value = usd.toFixed(4);
        if ($('tasa-bcv-eur')) $('tasa-bcv-eur').value = eur.toFixed(4);
        if (fecha && $('tasa-fecha-ref')) $('tasa-fecha-ref').value = fecha;

        if (res.paralelo && $('tasa-otra-valor')) {
          if (!$('tasa-otra-valor').value || parseFloat($('tasa-otra-valor').value) < 100) {
            $('tasa-otra-valor').value = res.paralelo.toFixed(4);
            if ($('tasa-otra-nombre') && !$('tasa-otra-nombre').value) {
              $('tasa-otra-nombre').value = 'Tasa Paralelo';
            }
          }
        }

        updateCurrencyUI();
        if ($('landing-view') && !$('landing-view').classList.contains('hidden')) {
          renderExpedientesList();
        }
        if (activeWorker) {
          refreshAllCalculations();
        }

        showToast(`✅ Tasas BCV actualizadas en vivo: USD ${usd.toFixed(2)} Bs. | EUR ${eur.toFixed(2)} Bs.`);
      } else {
        showToast('No se pudo obtener la tasa en línea. Puedes ingresar las tasas manualmente.', true);
      }
    } catch (err) {
      showToast(`Error al consultar BCV: ${err.message}`, true);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }
  }

  function handleSaveTasasForm(e) {
    if (e) e.preventDefault();
    if (!Cur) return;

    const usdVal = parseFloat($('tasa-bcv-usd')?.value);
    const eurVal = parseFloat($('tasa-bcv-eur')?.value);
    const otraVal = parseFloat($('tasa-otra-valor')?.value);
    const otraNom = $('tasa-otra-nombre')?.value.trim();
    const fecha = $('tasa-fecha-ref')?.value;
    const radioSel = document.querySelector('input[name="radio-tasa-dolar"]:checked')?.value || 'bcv';
    const dispCur = $('modal-select-display-cur')?.value || 'original';

    Cur.saveRates({
      tasaUsd: !isNaN(usdVal) && usdVal > 0 ? usdVal : 60.50,
      tasaEur: !isNaN(eurVal) && eurVal > 0 ? eurVal : 64.20,
      fechaTasa: fecha || new Date().toISOString().slice(0, 10),
      otraNombre: otraNom || 'Tasa Personalizada',
      tasaOtra: !isNaN(otraVal) && otraVal > 0 ? otraVal : 0,
      tasaUsadaDolar: radioSel,
      monedaVisualizacion: dispCur
    });

    updateCurrencyUI();
    closeTasasModal();

    if ($('landing-view') && !$('landing-view').classList.contains('hidden')) {
      renderExpedientesList();
    }
    if (activeWorker) {
      refreshAllCalculations();
    }

    showToast('✅ Configuración de tasas de cambio y moneda universal guardada con éxito.');
  }

  function handleGlobalCurrencyChange(e) {
    if (!Cur) return;
    const newCur = e.target.value;
    Cur.saveRates({ monedaVisualizacion: newCur });
    updateCurrencyUI();

    if ($('landing-view') && !$('landing-view').classList.contains('hidden')) {
      renderExpedientesList();
    }
    if (activeWorker) {
      refreshAllCalculations();
    }

    const curLabels = {
      original: 'Moneda Original de cada Ficha',
      'Bs.': 'Bolívares (Bs.)',
      USD: 'Dólares Americanos (USD)',
      EUR: 'Euros (EUR)'
    };
    showToast(`💱 Moneda de visualización universal cambiada a: ${curLabels[newCur] || newCur}`);
  }

  /* ========================================================================
     EVENT LISTENERS
     ======================================================================== */
  function bindEvents() {
    // Fecha por defecto en formulario inicial
    $('new-fecha-ingreso').value = Store.todayISO();

    // Topbar navegación
    $('btn-brand-home').addEventListener('click', showLanding);
    $('btn-nav-expedientes').addEventListener('click', showLanding);
    $('btn-back-list').addEventListener('click', showLanding);
    $('btn-quick-print-tab').addEventListener('click', () => switchTab('tab-print'));

    // Modal Legal
    $('btn-open-legal').addEventListener('click', () => $('modal-legal').classList.remove('hidden'));
    $('btn-close-legal').addEventListener('click', () => $('modal-legal').classList.add('hidden'));
    $('modal-legal').addEventListener('click', (e) => {
      if (e.target === $('modal-legal')) $('modal-legal').classList.add('hidden');
    });

    // Modal Carpetas de Empresa
    if ($('btn-open-empresas')) {
      $('btn-open-empresas').addEventListener('click', () => {
        $('form-manage-empresa').reset();
        $('emp-edit-id').value = '';
        $('empresa-form-title').textContent = '+ Registrar Nueva Carpeta de Empresa';
        renderEmpresasModalTable();
        $('modal-empresas').classList.remove('hidden');
      });
    }
    if ($('btn-close-empresas')) {
      $('btn-close-empresas').addEventListener('click', () => $('modal-empresas').classList.add('hidden'));
    }
    if ($('modal-empresas')) {
      $('modal-empresas').addEventListener('click', (e) => {
        if (e.target === $('modal-empresas')) $('modal-empresas').classList.add('hidden');
      });
    }

    // Botones rápidos para crear nueva empresa
    ['btn-quick-new-empresa', 'btn-quick-new-empresa-ws', 'btn-add-folder-quick'].forEach((id) => {
      const el = $(id);
      if (el) {
        el.addEventListener('click', () => {
          $('form-manage-empresa').reset();
          $('emp-edit-id').value = '';
          $('empresa-form-title').textContent = '+ Registrar Nueva Carpeta de Empresa';
          renderEmpresasModalTable();
          $('modal-empresas').classList.remove('hidden');
          setTimeout(() => { if ($('emp-nombre')) $('emp-nombre').focus(); }, 100);
        });
      }
    });

    // Guardar / Editar Carpeta de Empresa
    if ($('form-manage-empresa')) {
      $('form-manage-empresa').addEventListener('submit', (e) => {
        e.preventDefault();
        const id = $('emp-edit-id').value.trim();
        const nombre = $('emp-nombre').value.trim();
        const rif = $('emp-rif').value.trim().toUpperCase();
        const direccion = $('emp-dir').value.trim();

        if (!nombre || !rif) {
          showToast('Nombre y RIF de la empresa son requeridos.', true);
          return;
        }

        const saved = Store.saveCompanyRecord({ id: id || undefined, nombre, rif, direccion });
        $('form-manage-empresa').reset();
        $('emp-edit-id').value = '';
        $('empresa-form-title').textContent = '+ Registrar Nueva Carpeta de Empresa';

        // Si tenemos un trabajador activo y estábamos editando su empresa, actualizarlo
        if (activeWorker && (activeWorker.empresaId === saved.id || (!activeWorker.empresaId && activeWorker.empresaNombre === saved.nombre))) {
          activeWorker.empresaId = saved.id;
          activeWorker.empresaNombre = saved.nombre;
          activeWorker.empresaRif = saved.rif;
          activeWorker.empresaDireccion = saved.direccion;
          if ($('exp-empresa-nombre')) $('exp-empresa-nombre').value = saved.nombre;
          if ($('exp-empresa-rif')) $('exp-empresa-rif').value = saved.rif;
          if ($('exp-empresa-dir')) $('exp-empresa-dir').value = saved.direccion;
          persistActiveWorker();
          refreshAllCalculations();
        }

        renderCompanyFoldersUI();
        renderExpedientesList();
        showToast(`Carpeta "${saved.nombre}" guardada con éxito.`);
      });
    }

    // Acciones en la tabla de empresas del modal
    if ($('tbody-empresas-list')) {
      $('tbody-empresas-list').addEventListener('click', (e) => {
        const viewBtn = e.target.closest('[data-filter-view-comp]');
        if (viewBtn) {
          selectedCompanyFilter = viewBtn.dataset.filterViewComp;
          $('modal-empresas').classList.add('hidden');
          if (activeWorker) showLanding();
          else renderExpedientesList();
          return;
        }

        const editBtn = e.target.closest('[data-edit-modal-comp]');
        if (editBtn) {
          const comp = Store.getCompanyById(editBtn.dataset.editModalComp);
          if (comp) {
            $('emp-edit-id').value = comp.id;
            $('emp-nombre').value = comp.nombre;
            $('emp-rif').value = comp.rif;
            $('emp-dir').value = comp.direccion || '';
            $('empresa-form-title').textContent = `✏️ Modificar Carpeta: ${comp.nombre}`;
            $('emp-nombre').focus();
          }
          return;
        }

        const delBtn = e.target.closest('[data-del-modal-comp]');
        if (delBtn) {
          const cId = delBtn.dataset.delModalComp;
          const comp = Store.getCompanyById(cId);
          if (comp && confirm(`¿Eliminar la carpeta "${comp.nombre}"?`)) {
            try {
              Store.deleteCompanyRecord(cId);
              if (selectedCompanyFilter === cId) selectedCompanyFilter = null;
              renderCompanyFoldersUI();
              renderExpedientesList();
              showToast('Carpeta eliminada.');
            } catch (err) {
              showToast(err.message, true);
            }
          }
        }
      });
    }

    // Clics en pestañas/píldoras de carpetas en el directorio
    if ($('company-folder-tabs')) {
      $('company-folder-tabs').addEventListener('click', (e) => {
        const pill = e.target.closest('[data-filter-company]');
        if (pill) {
          const cId = pill.dataset.filterCompany || null;
          selectedCompanyFilter = cId;
          renderExpedientesList();
        }
      });
    }

    // Acciones en el banner de carpeta activa
    if ($('company-active-banner')) {
      $('company-active-banner').addEventListener('click', (e) => {
        if (e.target.closest('#btn-banner-clear-filter')) {
          selectedCompanyFilter = null;
          renderExpedientesList();
          return;
        }
        const editBtn = e.target.closest('#btn-banner-edit-comp');
        if (editBtn) {
          const comp = Store.getCompanyById(editBtn.dataset.editComp);
          if (comp) {
            $('emp-edit-id').value = comp.id;
            $('emp-nombre').value = comp.nombre;
            $('emp-rif').value = comp.rif;
            $('emp-dir').value = comp.direccion || '';
            $('empresa-form-title').textContent = `✏️ Modificar Carpeta: ${comp.nombre}`;
            renderEmpresasModalTable();
            $('modal-empresas').classList.remove('hidden');
          }
        }
      });
    }

    // Selector de carpeta de empresa en Tab 1 (Workspace)
    if ($('exp-empresa-select')) {
      $('exp-empresa-select').addEventListener('change', (e) => {
        if (!activeWorker || !e.target.value) return;
        const comp = Store.getCompanyById(e.target.value);
        if (!comp) return;
        activeWorker.empresaId = comp.id;
        activeWorker.empresaNombre = comp.nombre;
        activeWorker.empresaRif = comp.rif;
        activeWorker.empresaDireccion = comp.direccion;

        if ($('exp-empresa-nombre')) $('exp-empresa-nombre').value = comp.nombre;
        if ($('exp-empresa-rif')) $('exp-empresa-rif').value = comp.rif;
        if ($('exp-empresa-dir')) $('exp-empresa-dir').value = comp.direccion;

        persistActiveWorker();
        refreshAllCalculations();
        showToast(`Expediente reasignado a la carpeta "${comp.nombre}".`);
      });
    }

    // CORRECCIÓN DIRECTA DEL SUELDO BASE EN TAB 1
    if ($('exp-sueldo-base')) {
      $('exp-sueldo-base').addEventListener('input', (e) => {
        if (!activeWorker) return;
        const newSueldo = parseFloat(e.target.value) || 0;
        if (!activeWorker.salarioActual) {
          activeWorker.salarioActual = Store.createEmptySalaryRecord(null, newSueldo);
        }
        activeWorker.salarioActual.sueldoBase = newSueldo;

        // Mantener sincronizado el input de Tab 3
        if ($('sal-base')) $('sal-base').value = newSueldo;

        // Mantener sincronizado el historial de sueldos si ya tiene el período actual registrado
        if (Array.isArray(activeWorker.sueldosHistorial)) {
          const curP = activeWorker.salarioActual.periodo;
          const hMatch = activeWorker.sueldosHistorial.find((h) => h.periodo === curP);
          if (hMatch) hMatch.sueldoBase = newSueldo;
        }

        persistActiveWorker();
        refreshAllCalculations();
      });
    }

    // Exportar / Importar JSON
    $('btn-export-json').addEventListener('click', () => {
      const json = Store.exportAllJSON();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `NOMINA_respaldo_${Store.todayISO()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Respaldo JSON de expedientes descargado.');
    });

    $('input-import-json').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const res = Store.importJSON(reader.result);
          showToast(`Importación completada: ${res.added} agregado(s), ${res.updated} actualizado(s).`);
          renderExpedientesList();
          updateTopCount();
        } catch (err) {
          showToast(err.message || 'Error al importar el archivo JSON.', true);
        }
        e.target.value = '';
      };
      reader.readAsText(file);
    });

    // Crear expediente nuevo
    $('form-new-expediente').addEventListener('submit', handleCreateExpediente);

    // Buscar expedientes
    $('search-expedientes').addEventListener('input', renderExpedientesList);

    // Cargar casos de estudio de los PDFs
    $('btn-load-samples').addEventListener('click', () => {
      const samples = Store.buildSampleCaseStudies();
      let count = 0;
      samples.forEach((s) => {
        if (!Store.findByCedula(s.cedula)) {
          Store.upsertExpediente(s);
          count++;
        }
      });
      renderExpedientesList();
      updateTopCount();
      if (count > 0) {
        showToast(`Se cargaron ${count} expediente(s) de los Casos de Estudio LOTTT.`);
      } else {
        showToast('Los casos de estudio de ejemplo ya están cargados en tu directorio.');
      }
    });

    // Acciones en tarjetas de expedientes (Abrir, Imprimir, Eliminar)
    $('expedientes-list').addEventListener('click', (e) => {
      const openBtn = e.target.closest('[data-open-id]');
      if (openBtn) {
        openExpediente(openBtn.dataset.openId);
        return;
      }
      const printBtn = e.target.closest('[data-print-id]');
      if (printBtn) {
        openExpediente(printBtn.dataset.printId, 'tab-print');
        return;
      }
      const delBtn = e.target.closest('[data-delete-id]');
      if (delBtn) {
        const w = Store.getById(delBtn.dataset.deleteId);
        if (w && confirm(`¿Eliminar el expediente de ${w.nombre} ${w.apellido} (${w.cedula})?`)) {
          Store.deleteExpediente(w.id);
          renderExpedientesList();
          updateTopCount();
          showToast('Expediente eliminado.');
        }
      }
    });

    // Cambio de pestañas
    $('workspace-tabs').addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (btn) switchTab(btn.dataset.tab);
    });

    // Inputs generales [data-field]
    document.querySelectorAll('[data-field]').forEach((el) => {
      const evt = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(evt, () => {
        if (!activeWorker) return;
        const key = el.dataset.field;
        if (el.type === 'checkbox') {
          activeWorker[key] = el.checked;
        } else if (el.type === 'number') {
          activeWorker[key] = parseFloat(el.value) || 0;
        } else {
          activeWorker[key] = el.value;
        }
        if (key === 'moneda' && $('exp-sueldo-cur')) {
          $('exp-sueldo-cur').textContent = el.value || 'Bs.';
        }
        persistActiveWorker();
        refreshAllCalculations();
      });
    });

    // Supervisor inputs
    ['sup-nombre', 'sup-cedula', 'sup-cargo', 'sup-depto'].forEach((id) => {
      $(id).addEventListener('input', () => {
        if (!activeWorker) return;
        activeWorker.reportaA = {
          nombre: $('sup-nombre').value.trim(),
          cedula: $('sup-cedula').value.trim(),
          cargo: $('sup-cargo').value.trim(),
          departamento: $('sup-depto').value.trim()
        };
        persistActiveWorker();
        renderHierarchyUI();
      });
    });

    $('select-supervisor-existing').addEventListener('change', (e) => {
      if (!activeWorker || !e.target.value) return;
      const peer = Store.getById(e.target.value);
      if (!peer) return;
      activeWorker.reportaA = {
        nombre: `${peer.nombre} ${peer.apellido}`.trim(),
        cedula: peer.cedula,
        cargo: peer.cargo || '',
        departamento: peer.departamento || ''
      };
      $('sup-nombre').value = activeWorker.reportaA.nombre;
      $('sup-cedula').value = activeWorker.reportaA.cedula;
      $('sup-cargo').value = activeWorker.reportaA.cargo;
      $('sup-depto').value = activeWorker.reportaA.departamento;
      e.target.value = '';
      persistActiveWorker();
      renderHierarchyUI();
      showToast('Supervisor asignado desde el expediente seleccionado.');
    });

    // Agregar subordinado desde otro expediente
    $('select-sub-existing').addEventListener('change', (e) => {
      if (!activeWorker || !e.target.value) return;
      const peer = Store.getById(e.target.value);
      if (!peer) return;
      activeWorker.personalACargo = activeWorker.personalACargo || [];
      activeWorker.personalACargo.push({
        id: Store.generateId('sub'),
        nombre: `${peer.nombre} ${peer.apellido}`.trim(),
        cedula: peer.cedula,
        cargo: peer.cargo || '',
        departamento: peer.departamento || ''
      });
      e.target.value = '';
      persistActiveWorker();
      renderHierarchyUI();
      showToast('Personal a cargo agregado desde expedientes.');
    });

    // Agregar subordinado manual
    $('form-add-subordinado').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!activeWorker) return;
      const nombre = $('sub-nombre').value.trim();
      if (!nombre) return;
      activeWorker.personalACargo = activeWorker.personalACargo || [];
      activeWorker.personalACargo.push({
        id: Store.generateId('sub'),
        nombre,
        cedula: $('sub-cedula').value.trim().toUpperCase(),
        cargo: $('sub-cargo').value.trim(),
        departamento: $('sub-depto').value.trim()
      });
      e.target.reset();
      persistActiveWorker();
      renderHierarchyUI();
      showToast('Personal a cargo registrado.');
    });

    $('tbody-subordinados').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-del-sub]');
      if (!btn || !activeWorker) return;
      activeWorker.personalACargo = (activeWorker.personalACargo || []).filter((s) => s.id !== btn.dataset.delSub);
      persistActiveWorker();
      renderHierarchyUI();
    });

    // Inputs Salario actual [data-sal]
    document.querySelectorAll('[data-sal]').forEach((el) => {
      const evt = el.type === 'month' ? 'change' : 'input';
      el.addEventListener(evt, () => {
        if (!activeWorker) return;
        const key = el.dataset.sal;
        const val = el.type === 'number' ? (parseFloat(el.value) || 0) : el.value;
        activeWorker.salarioActual[key] = val;
        if (key === 'sueldoBase' && $('exp-sueldo-base')) {
          $('exp-sueldo-base').value = val;
        }
        persistActiveWorker();
        refreshAllCalculations();
      });
    });

    // Guardar período salarial actual en el historial
    $('btn-save-salary-history').addEventListener('click', () => {
      if (!activeWorker) return;
      const curRec = { ...activeWorker.salarioActual };
      if (!curRec.periodo) {
        showToast('Selecciona un período (Mes/Año) antes de guardar en el historial.', true);
        return;
      }
      activeWorker.sueldosHistorial = activeWorker.sueldosHistorial || [];
      const existingIdx = activeWorker.sueldosHistorial.findIndex((h) => h.periodo === curRec.periodo);
      if (existingIdx >= 0) {
        curRec.id = activeWorker.sueldosHistorial[existingIdx].id;
        activeWorker.sueldosHistorial[existingIdx] = curRec;
        showToast(`Período ${curRec.periodo} actualizado en el historial de sueldos.`);
      } else {
        curRec.id = Store.generateId('hist');
        activeWorker.sueldosHistorial.push(curRec);
        showToast(`Período ${curRec.periodo} agregado al historial de sueldos devengados.`);
      }
      persistActiveWorker();
      refreshAllCalculations();
    });

    // Acciones en historial de sueldos
    $('tbody-sueldos-historial').addEventListener('click', (e) => {
      if (!activeWorker) return;
      const loadBtn = e.target.closest('[data-load-sal]');
      if (loadBtn) {
        const rec = (activeWorker.sueldosHistorial || []).find((h) => h.id === loadBtn.dataset.loadSal);
        if (rec) {
          activeWorker.salarioActual = { ...rec };
          populateAllForms();
          persistActiveWorker();
          refreshAllCalculations();
          showToast(`Período ${rec.periodo} cargado como período activo.`);
        }
        return;
      }
      const delBtn = e.target.closest('[data-del-sal]');
      if (delBtn) {
        activeWorker.sueldosHistorial = (activeWorker.sueldosHistorial || []).filter((h) => h.id !== delBtn.dataset.delSal);
        persistActiveWorker();
        refreshAllCalculations();
        showToast('Registro eliminado del historial de sueldos.');
      }
    });

    // Auto-calcular días correspondientes al cambiar año de servicio en formulario de vacación
    $('vac-anio-num').addEventListener('input', () => {
      const y = parseInt($('vac-anio-num').value, 10) || 1;
      const d = Calc.getVacationDaysForYear(y).total;
      $('vac-dias-corr').value = d;
      if ($('vac-estatus').value === 'disfrutada') {
        $('vac-dias-disf').value = d;
      }
    });

    $('vac-estatus').addEventListener('change', () => {
      if ($('vac-estatus').value === 'disfrutada') {
        $('vac-dias-disf').value = $('vac-dias-corr').value;
      } else {
        $('vac-dias-disf').value = 0;
      }
    });

    // Registrar período vacacional
    $('form-add-vacacion').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!activeWorker) return;
      const calc = Calc.computeWorkerBenefits(activeWorker);
      const diasCorr = Math.min(30, Math.max(1, parseInt($('vac-dias-corr').value, 10) || 15));
      const estatus = $('vac-estatus').value;
      const diasDisf = estatus === 'disfrutada' ? (parseInt($('vac-dias-disf').value, 10) || diasCorr) : 0;
      const salDiarioInput = parseFloat($('vac-sal-diario').value);
      const salDiario = salDiarioInput > 0 ? salDiarioInput : calc.vacationsData.baseSal.diario;

      activeWorker.vacacionesHistorial = activeWorker.vacacionesHistorial || [];
      activeWorker.vacacionesHistorial.push({
        id: Store.generateId('vac'),
        periodoLabel: $('vac-periodo-label').value.trim(),
        anioServicio: parseInt($('vac-anio-num').value, 10) || 1,
        estatus,
        diasCorrespondientes: diasCorr,
        diasBono: diasCorr,
        diasDisfrutados: diasDisf,
        fechaInicio: $('vac-fecha-inicio').value,
        fechaFin: $('vac-fecha-fin').value,
        fechaPago: $('vac-fecha-pago').value,
        salarioDiarioAplicado: salDiario,
        montoVacaciones: salDiario * diasCorr,
        montoBono: salDiario * diasCorr,
        observaciones: $('vac-obs').value.trim()
      });

      e.target.reset();
      $('vac-anio-num').value = (activeWorker.vacacionesHistorial.length || 0) + 1;
      const nextD = Calc.getVacationDaysForYear(parseInt($('vac-anio-num').value, 10)).total;
      $('vac-dias-corr').value = nextD;
      $('vac-dias-disf').value = nextD;

      persistActiveWorker();
      refreshAllCalculations();
      showToast('Período vacacional registrado en el expediente.');
    });

    // Autogenerar períodos vacacionales por antigüedad
    $('btn-autogenerar-vac').addEventListener('click', () => {
      if (!activeWorker) return;
      const calc = Calc.computeWorkerBenefits(activeWorker);
      const years = calc.serviceTime.years;
      if (years < 1) {
        showToast('El trabajador aún no cumple 1 año completo de servicio para generar vacaciones vencidas.', true);
        return;
      }
      const startYear = new Date(activeWorker.fechaIngreso + 'T00:00:00').getFullYear();
      activeWorker.vacacionesHistorial = activeWorker.vacacionesHistorial || [];
      let added = 0;

      for (let y = 1; y <= years; y++) {
        const exists = activeWorker.vacacionesHistorial.some((v) => Number(v.anioServicio) === y);
        if (exists) continue;
        const days = Calc.getVacationDaysForYear(y).total;
        const salD = calc.vacationsData.baseSal.diario;
        activeWorker.vacacionesHistorial.push({
          id: Store.generateId('vac'),
          periodoLabel: `Año ${y} (${startYear + y - 1}-${startYear + y})`,
          anioServicio: y,
          estatus: y < years ? 'disfrutada' : 'causada',
          diasCorrespondientes: days,
          diasBono: days,
          diasDisfrutados: y < years ? days : 0,
          fechaInicio: '',
          fechaFin: '',
          fechaPago: '',
          salarioDiarioAplicado: salD,
          montoVacaciones: salD * days,
          montoBono: salD * days,
          observaciones: y < years ? 'Autogenerado (verificar fechas de disfrute)' : 'Último período causado pendiente'
        });
        added++;
      }

      persistActiveWorker();
      refreshAllCalculations();
      if (added > 0) {
        showToast(`Se autogeneraron ${added} período(s) vacacional(es) según la antigüedad.`);
      } else {
        showToast('Todos los años de antigüedad ya están registrados en el historial.');
      }
    });

    // Acciones en tabla de vacaciones (cambiar estatus o eliminar)
    $('tbody-vac-historial').addEventListener('click', (e) => {
      if (!activeWorker) return;
      const cycleBtn = e.target.closest('[data-cycle-vac]');
      if (cycleBtn) {
        const item = (activeWorker.vacacionesHistorial || []).find((v) => v.id === cycleBtn.dataset.cycleVac);
        if (item) {
          const order = ['disfrutada', 'causada', 'no_disfrutada'];
          const next = order[(order.indexOf(item.estatus) + 1) % order.length];
          item.estatus = next;
          item.diasDisfrutados = next === 'disfrutada' ? item.diasCorrespondientes : 0;
          persistActiveWorker();
          refreshAllCalculations();
        }
        return;
      }
      const delBtn = e.target.closest('[data-del-vac]');
      if (delBtn) {
        activeWorker.vacacionesHistorial = (activeWorker.vacacionesHistorial || []).filter((v) => v.id !== delBtn.dataset.delVac);
        persistActiveWorker();
        refreshAllCalculations();
        showToast('Período vacacional eliminado.');
      }
    });

    // Inputs Utilidades [data-util]
    document.querySelectorAll('[data-util]').forEach((el) => {
      const evt = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(evt, () => {
        if (!activeWorker) return;
        const key = el.dataset.util;
        activeWorker.utilidadesConfig[key] = el.type === 'number' ? (parseFloat(el.value) || 0) : el.value;
        toggleUtilidadesModeUI();
        persistActiveWorker();
        refreshAllCalculations();
      });
    });

    // Inputs Parafiscales [data-para]
    document.querySelectorAll('[data-para]').forEach((el) => {
      const evt = el.type === 'checkbox' || el.tagName === 'SELECT' || el.type === 'month' ? 'change' : 'input';
      el.addEventListener(evt, () => {
        if (!activeWorker) return;
        const key = el.dataset.para;
        if (el.type === 'checkbox') {
          activeWorker.parafiscalesConfig[key] = el.checked;
        } else if (el.type === 'number') {
          activeWorker.parafiscalesConfig[key] = parseFloat(el.value) || 0;
        } else {
          activeWorker.parafiscalesConfig[key] = el.value;
        }
        persistActiveWorker();
        refreshAllCalculations();
      });
    });

    // Selector de Tipo de Documento Imprimible
    $('doc-type-selector').addEventListener('click', (e) => {
      const btn = e.target.closest('.doc-type-btn');
      if (btn && btn.dataset.docType) {
        selectPrintDocType(btn.dataset.docType);
      }
    });

    // Cambio de 1ra / 2da quincena recalcula fechas y lunes sugeridos
    $('rec-quincena-num').addEventListener('change', () => {
      applyPeriodicDefaults('recibo_quincenal');
      renderPrintSheet();
    });

    // Cambio de período en Recibo de Vacaciones carga fechas guardadas del historial
    $('rvac-periodo-select').addEventListener('change', () => {
      if (!activeWorker) return;
      const val = $('rvac-periodo-select').value;
      if (val !== 'actual') {
        const found = (activeWorker.vacacionesHistorial || []).find((v) => v.id === val);
        if (found) {
          $('rvac-fecha-salida').value = found.fechaInicio || '';
          $('rvac-fecha-reinc').value = found.fechaFin || '';
          $('rvac-fecha-pago').value = found.fechaPago || Store.todayISO();
          $('rvac-obs').value = found.observaciones || '';
        }
      } else {
        $('rvac-fecha-salida').value = '';
        $('rvac-fecha-reinc').value = '';
        $('rvac-obs').value = '';
      }
      renderPrintSheet();
    });

    // Todos los controles contextuales de los 7 documentos imprimibles
    [
      'opt-print-jerarquia',
      'opt-print-historial',
      'opt-print-vacaciones',
      'opt-print-utilidades',
      'opt-print-parafiscales',
      'opt-print-patronal',
      'rec-fecha-desde',
      'rec-fecha-hasta',
      'rec-lunes',
      'rec-forma-pago',
      'rec-incluir-nosal',
      'rec-prorratear-recargos',
      'rec-mostrar-patronal',
      'rvac-fecha-salida',
      'rvac-fecha-reinc',
      'rvac-fecha-pago',
      'rvac-otras-ded',
      'rvac-obs',
      'rvac-aplicar-faov',
      'lpar-fecha-corte',
      'lpar-motivo',
      'lpar-porcentaje',
      'lpar-monto-manual',
      'lpar-anticipos-prev',
      'lpar-intereses',
      'lpar-incluir-vac',
      'ldef-fecha-egreso',
      'ldef-motivo',
      'ldef-anticipos',
      'ldef-intereses',
      'ldef-dias-sal',
      'ldef-deducciones',
      'ldef-incluir-vac',
      'ldef-incluir-util'
    ].forEach((id) => {
      const el = $(id);
      if (!el) return;
      const evt = (el.type === 'checkbox' || el.tagName === 'SELECT' || el.type === 'date') ? 'change' : 'input';
      el.addEventListener(evt, () => renderPrintSheet());
    });

    // Acciones de impresión y archivado en PDF / HTML
    if ($('btn-print-now')) {
      $('btn-print-now').addEventListener('click', triggerPrintPDF);
    }
    if ($('btn-archive-pdf')) {
      $('btn-archive-pdf').addEventListener('click', triggerPrintPDF);
    }
    if ($('btn-download-html-archive')) {
      $('btn-download-html-archive').addEventListener('click', downloadHTMLArchive);
    }

    // Acciones de Guardado en Disco Local / PC
    if ($('btn-top-pc-dir')) {
      $('btn-top-pc-dir').addEventListener('click', () => {
        openEmpresasModal();
      });
    }
    if ($('btn-landing-select-dir')) {
      $('btn-landing-select-dir').addEventListener('click', handleSelectPCDir);
    }
    if ($('btn-modal-select-pc-dir')) {
      $('btn-modal-select-pc-dir').addEventListener('click', handleSelectPCDir);
    }
    if ($('btn-modal-sync-all-pc')) {
      $('btn-modal-sync-all-pc').addEventListener('click', handleSyncAllToPC);
    }
    if ($('btn-modal-download-zip')) {
      $('btn-modal-download-zip').addEventListener('click', handleDownloadStructuredZip);
    }
    if ($('btn-save-worker-pc')) {
      $('btn-save-worker-pc').addEventListener('click', handleSaveActiveWorkerToPC);
    }
    if ($('btn-save-pc-direct')) {
      $('btn-save-pc-direct').addEventListener('click', handleSaveActiveWorkerToPC);
    }

    // Previsualización dinámica de la ruta física en PC mientras el usuario escribe
    ['new-nombre', 'new-apellido', 'new-departamento', 'new-empresa-select'].forEach((id) => {
      const el = $(id);
      if (el) {
        el.addEventListener('input', updateLandingPathPreview);
        el.addEventListener('change', updateLandingPathPreview);
      }
    });

    // Configuración de Tasas de Cambio BCV / Personalizadas y Moneda Universal
    if ($('btn-open-tasas-modal')) {
      $('btn-open-tasas-modal').addEventListener('click', openTasasModal);
    }
    if ($('btn-close-tasas')) {
      $('btn-close-tasas').addEventListener('click', closeTasasModal);
    }
    if ($('btn-cancel-tasas')) {
      $('btn-cancel-tasas').addEventListener('click', closeTasasModal);
    }
    if ($('modal-tasas')) {
      $('modal-tasas').addEventListener('click', (e) => {
        if (e.target === $('modal-tasas')) closeTasasModal();
      });
    }
    if ($('form-tasas-cambio')) {
      $('form-tasas-cambio').addEventListener('submit', handleSaveTasasForm);
    }
    if ($('btn-fetch-bcv-live')) {
      $('btn-fetch-bcv-live').addEventListener('click', handleFetchBcvLive);
    }
    if ($('select-global-currency')) {
      $('select-global-currency').addEventListener('change', handleGlobalCurrencyChange);
    }
    if ($('select-print-currency')) {
      $('select-print-currency').addEventListener('change', () => renderPrintSheet());
    }
  }

  /* ========================================================================
     INICIALIZACIÓN
     ======================================================================== */
  document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    if (Cur) {
      updateCurrencyUI();
      // Auto-actualizar tasas oficiales BCV en vivo en segundo plano al iniciar
      Cur.fetchLiveBcvRates().then((res) => {
        if (res && res.success) {
          updateCurrencyUI();
          if ($('landing-view') && !$('landing-view').classList.contains('hidden')) {
            renderExpedientesList();
          }
          if (activeWorker) {
            refreshAllCalculations();
          }
          console.log('✅ Tasas BCV en vivo actualizadas automáticamente:', res);
        }
      }).catch((err) => {
        console.warn('Auto-fetch BCV:', err.message);
      });
    }
    showLanding();
    if (LocalFS) {
      LocalFS.init().then(() => {
        updatePCDirStatusUI();
      }).catch((e) => {
        console.warn('LocalFS init:', e);
      });
    }
  });
})();
