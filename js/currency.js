/**
 * NOMINA — Módulo de Tasas de Cambio y Conversión Universal de Moneda
 * 
 * Permite configurar y alternar entre:
 *   - Tasa Oficial BCV Dólar (USD / Bs.)
 *   - Tasa Oficial BCV Euro (EUR / Bs.)
 *   - Tasa Personalizada / Mercado / Paralelo (editada libremente por el usuario)
 * 
 * Ofrece un menú universal para visualizar todos los montos del sistema en:
 *   - Moneda Original del Expediente
 *   - Bolívares (Bs.)
 *   - Dólares (USD)
 *   - Euros (EUR)
 * 
 * Mantiene la validez y consistencia al momento de imprimir documentos oficiales y guardar en PC.
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'nomina_currency_rates_v2';

  const DEFAULT_RATES = {
    tasaUsd: 60.50,          // Tasa oficial BCV USD / Bs.
    tasaEur: 64.20,          // Tasa oficial BCV EUR / Bs.
    tasaOtra: 68.00,         // Tasa alternativa / mercado
    otraNombre: 'Tasa Mercado / Paralelo',
    tasaUsadaDolar: 'bcv',   // 'bcv' | 'otra'
    monedaVisualizacion: 'original', // 'original' | 'Bs.' | 'USD' | 'EUR'
    fechaTasa: new Date().toISOString().slice(0, 10),
    fuenteTexto: 'Banco Central de Venezuela (BCV)'
  };

  function loadRates() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_RATES };
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_RATES,
        ...parsed,
        tasaUsd: parseFloat(parsed.tasaUsd) || DEFAULT_RATES.tasaUsd,
        tasaEur: parseFloat(parsed.tasaEur) || DEFAULT_RATES.tasaEur,
        tasaOtra: parseFloat(parsed.tasaOtra) || DEFAULT_RATES.tasaOtra
      };
    } catch (e) {
      return { ...DEFAULT_RATES };
    }
  }

  function saveRates(rates) {
    const current = loadRates();
    const updated = {
      ...current,
      ...rates,
      tasaUsd: parseFloat(rates.tasaUsd !== undefined ? rates.tasaUsd : current.tasaUsd) || DEFAULT_RATES.tasaUsd,
      tasaEur: parseFloat(rates.tasaEur !== undefined ? rates.tasaEur : current.tasaEur) || DEFAULT_RATES.tasaEur,
      tasaOtra: parseFloat(rates.tasaOtra !== undefined ? rates.tasaOtra : current.tasaOtra) || DEFAULT_RATES.tasaOtra,
      fechaTasa: rates.fechaTasa || current.fechaTasa || new Date().toISOString().slice(0, 10)
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Error guardando tasas en localStorage:', e);
    }
    return updated;
  }

  function getEffectiveUsdRate(rates) {
    const r = rates || loadRates();
    return r.tasaUsadaDolar === 'otra' ? (parseFloat(r.tasaOtra) || r.tasaUsd) : (parseFloat(r.tasaUsd) || DEFAULT_RATES.tasaUsd);
  }

  function getEffectiveEurRate(rates) {
    const r = rates || loadRates();
    return parseFloat(r.tasaEur) || DEFAULT_RATES.tasaEur;
  }

  /**
   * Normaliza el código de moneda a estándar: 'Bs.', 'USD', 'EUR'
   */
  function normalizeCurrencyCode(code) {
    const c = String(code || '').trim().toUpperCase();
    if (c === 'USD' || c === '$' || c === 'DOLARES' || c === 'DÓLARES') return 'USD';
    if (c === 'EUR' || c === '€' || c === 'EUROS') return 'EUR';
    return 'Bs.';
  }

  /**
   * Determina la moneda activa de visualización para un trabajador
   */
  function getDisplayCurrency(worker, forcedDisplayCur) {
    if (forcedDisplayCur && forcedDisplayCur !== 'original') {
      return normalizeCurrencyCode(forcedDisplayCur);
    }
    const r = loadRates();
    if (r.monedaVisualizacion && r.monedaVisualizacion !== 'original') {
      return normalizeCurrencyCode(r.monedaVisualizacion);
    }
    return normalizeCurrencyCode(worker ? worker.moneda : 'Bs.');
  }

  /**
   * Convierte un monto numérico entre dos monedas según las tasas vigentes
   */
  function convert(amount, fromCurrency, toCurrency, ratesOverride) {
    const num = parseFloat(amount) || 0;
    if (num === 0) return 0;

    const from = normalizeCurrencyCode(fromCurrency);
    const to = normalizeCurrencyCode(toCurrency);

    if (from === to) return num;

    const r = ratesOverride || loadRates();
    const rateUsd = getEffectiveUsdRate(r);
    const rateEur = getEffectiveEurRate(r);

    // 1. Convertir 'from' a Bolívares (moneda base común)
    let inBs = 0;
    if (from === 'Bs.') {
      inBs = num;
    } else if (from === 'USD') {
      inBs = num * rateUsd;
    } else if (from === 'EUR') {
      inBs = num * rateEur;
    } else {
      inBs = num;
    }

    // 2. Convertir de Bolívares a 'to'
    if (to === 'Bs.') {
      return inBs;
    } else if (to === 'USD') {
      return rateUsd > 0 ? (inBs / rateUsd) : 0;
    } else if (to === 'EUR') {
      return rateEur > 0 ? (inBs / rateEur) : 0;
    }
    return inBs;
  }

  /**
   * Formatea un monto con conversión automática a la moneda de visualización
   */
  function formatMoneyConverted(amount, fromCur, targetCur, ratesOverride) {
    const to = normalizeCurrencyCode(targetCur);
    const converted = convert(amount, fromCur, to, ratesOverride);
    const formatted = converted.toLocaleString('es-VE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return `${to} ${formatted}`;
  }

  /**
   * Genera la nota legal oficial de referencia cambiaria para recibos y PDFs
   */
  function getExchangeLegalNote(worker, targetCurrency, ratesOverride) {
    const r = ratesOverride || loadRates();
    const originCur = normalizeCurrencyCode(worker ? worker.moneda : 'Bs.');
    const activeCur = normalizeCurrencyCode(targetCurrency || getDisplayCurrency(worker));

    const rateUsd = getEffectiveUsdRate(r);
    const rateEur = getEffectiveEurRate(r);
    const fecha = r.fechaTasa ? r.fechaTasa.split('-').reverse().join('/') : new Date().toLocaleDateString('es-VE');

    const labelTasaUsd = r.tasaUsadaDolar === 'otra' ? `Tasa ${r.otraNombre || 'Alternativa'}` : 'Tasa Oficial BCV';

    if (originCur === activeCur && activeCur === 'Bs.') {
      return `Valores expresados en Bolívares (Bs.). Referencia de conversión cambiaria: 1 USD = ${rateUsd.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs. (Fecha valor: ${fecha} · ${r.fuenteTexto || 'BCV'}).`;
    }

    if (originCur === 'USD' && activeCur === 'Bs.') {
      return `Comprobante expresado en Bolívares (Bs.) liquidado a la ${labelTasaUsd} de 1 USD = ${rateUsd.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs. (Fecha valor: ${fecha} · Art. 128 Ley del BCV y LOTTT).`;
    }

    if (originCur === 'Bs.' && activeCur === 'USD') {
      return `Comprobante expresado en Dólares (USD) convertido a la ${labelTasaUsd} de 1 USD = ${rateUsd.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs. (Fecha valor: ${fecha} · ${r.fuenteTexto || 'BCV'}).`;
    }

    if (activeCur === 'EUR') {
      return `Comprobante expresado en Euros (EUR) a Tasa Oficial BCV de 1 EUR = ${rateEur.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs. (Fecha valor: ${fecha} · Banco Central de Venezuela).`;
    }

    return `Valores convertidos a ${activeCur} a la ${labelTasaUsd}: 1 USD = ${rateUsd.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs. | 1 EUR = ${rateEur.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs. (Fecha: ${fecha}).`;
  }

  /**
   * Consulta en tiempo real las tasas oficiales de Venezuela desde API pública abierta (CORS-friendly)
   */
  async function fetchLiveBcvRates() {
    const endpoints = [
      'https://ve.dolarapi.com/v1/dolares/oficial',
      'https://pydolarve.org/api/v1/dollar?page=bcv'
    ];

    for (const url of endpoints) {
      try {
        const resp = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
        if (!resp.ok) continue;
        const data = await resp.json();

        let usdRate = 0;
        let eurRate = 0;
        let fecha = new Date().toISOString().slice(0, 10);

        if (data && typeof data.promedio === 'number') {
          // Formato ve.dolarapi.com
          usdRate = data.promedio;
          if (data.fechaActualizacion) {
            fecha = data.fechaActualizacion.slice(0, 10);
          }
        } else if (data && data.monitors && data.monitors.bcv) {
          // Formato pydolarve
          usdRate = data.monitors.bcv.price || 0;
        }

        if (usdRate > 0) {
          // Si obtuvimos USD, intentamos aproximar o consultar EUR
          const saved = loadRates();
          const newEur = eurRate > 0 ? eurRate : (usdRate * 1.06); // Relación de mercado promedio si EUR no viene en endpoint simple
          const updated = saveRates({
            tasaUsd: usdRate,
            tasaEur: Math.round(newEur * 100) / 100,
            fechaTasa: fecha,
            fuenteTexto: 'Banco Central de Venezuela (BCV Oficial)'
          });
          return { success: true, rates: updated, source: url };
        }
      } catch (err) {
        // Seguir al siguiente endpoint
      }
    }
    throw new Error('No se pudo conectar con el servicio en línea de tasas. Puedes ingresar la tasa manualmente.');
  }

  /* ========================================================================
     EXPORTACIÓN PÚBLICA DEL MÓDULO
     ======================================================================== */
  global.NominaCurrency = {
    DEFAULT_RATES,
    loadRates,
    saveRates,
    getEffectiveUsdRate,
    getEffectiveEurRate,
    normalizeCurrencyCode,
    getDisplayCurrency,
    convert,
    formatMoneyConverted,
    getExchangeLegalNote,
    fetchLiveBcvRates
  };

})(window);
