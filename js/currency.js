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
    tasaUsd: 918.7662,          // Tasa oficial BCV USD / Bs.
    tasaEur: 1009.0717,         // Tasa oficial BCV EUR / Bs.
    tasaOtra: 1107.0486,        // Tasa alternativa / mercado
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
      const parsedUsd = parseFloat(parsed.tasaUsd) || DEFAULT_RATES.tasaUsd;
      const parsedEur = parseFloat(parsed.tasaEur) || DEFAULT_RATES.tasaEur;
      // Si la tasa guardada en el navegador es el valor de prueba obsoleto (< 100 Bs.), auto-migrar a tasa real
      const finalUsd = parsedUsd < 100 ? DEFAULT_RATES.tasaUsd : parsedUsd;
      const finalEur = parsedEur < 100 ? DEFAULT_RATES.tasaEur : parsedEur;
      return {
        ...DEFAULT_RATES,
        ...parsed,
        tasaUsd: finalUsd,
        tasaEur: finalEur,
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
    let usd = 0;
    let eur = 0;
    let paralelo = 0;
    let fecha = new Date().toISOString().slice(0, 10);

    // 1. Consultar ve.dolarapi.com/v1/dolares (oficial y paralelo)
    try {
      const resp = await fetch('https://ve.dolarapi.com/v1/dolares', {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      if (resp.ok) {
        const list = await resp.json();
        if (Array.isArray(list)) {
          const ofi = list.find((x) => x.fuente === 'oficial');
          const par = list.find((x) => x.fuente === 'paralelo');
          if (ofi && ofi.promedio) {
            usd = parseFloat(ofi.promedio) || 0;
            if (ofi.fechaActualizacion) {
              fecha = ofi.fechaActualizacion.slice(0, 10);
            }
          }
          if (par && par.promedio) {
            paralelo = parseFloat(par.promedio) || 0;
          }
        }
      }
    } catch (err) {
      console.warn('ve.dolarapi.com/v1/dolares:', err);
    }

    // Fallback USD oficial
    if (usd === 0) {
      try {
        const respOfi = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });
        if (respOfi.ok) {
          const dOfi = await respOfi.json();
          if (dOfi && dOfi.promedio) {
            usd = parseFloat(dOfi.promedio) || 0;
            if (dOfi.fechaActualizacion) {
              fecha = dOfi.fechaActualizacion.slice(0, 10);
            }
          }
        }
      } catch (e) {
        console.warn('Fallback ve.dolarapi.com/v1/dolares/oficial:', e);
      }
    }

    // 2. Consultar Euro Oficial ve.dolarapi.com/v1/euros/oficial
    try {
      const respEur = await fetch('https://ve.dolarapi.com/v1/euros/oficial', {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      if (respEur.ok) {
        const dEur = await respEur.json();
        if (dEur && dEur.promedio) {
          eur = parseFloat(dEur.promedio) || 0;
        }
      }
    } catch (err) {
      console.warn('ve.dolarapi.com/v1/euros/oficial:', err);
    }

    // Si falló EUR, estimar con paridad de mercado
    if (usd > 0 && eur === 0) {
      eur = Math.round(usd * 1.0983 * 10000) / 10000;
    }

    if (usd > 0) {
      const saved = loadRates();
      const payload = {
        tasaUsd: usd,
        tasaEur: eur > 0 ? eur : saved.tasaEur,
        fechaTasa: fecha,
        fuenteTexto: 'Banco Central de Venezuela (BCV Oficial)'
      };
      if (paralelo > 0 && (!saved.tasaOtra || saved.tasaOtra < 100)) {
        payload.tasaOtra = paralelo;
        payload.otraNombre = 'Tasa Paralelo';
      }
      const updated = saveRates(payload);
      return {
        success: true,
        usd: usd,
        eur: eur,
        paralelo: paralelo,
        fecha: fecha,
        rates: updated
      };
    }

    throw new Error('No se pudo conectar con el servicio en línea de tasas. Puedes ingresar la tasa manualmente.');
  }

  /* ========================================================================
     EXPORTACIÓN PÚBLICA DEL MÓDULO
     ======================================================================== */
  global.NominaCurrency = {
    DEFAULT_RATES,
    loadRates,
    getRates: loadRates,
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
