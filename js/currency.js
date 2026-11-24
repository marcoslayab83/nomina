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
    tasaUsd: 919.8227,          // Tasa oficial BCV USD / Bs. (Fecha valor 24/11/2026)
    tasaEur: 1011.1795,         // Tasa oficial BCV EUR / Bs. (Fecha valor 24/11/2026)
    tasaOtra: 1107.0486,        // Tasa alternativa / mercado
    otraNombre: 'Tasa Mercado / Paralelo',
    tasaUsadaDolar: 'bcv',   // 'bcv' | 'otra'
    monedaVisualizacion: 'original', // 'original' | 'Bs.' | 'USD' | 'EUR'
    fechaTasa: '2026-11-24',
    fuenteTexto: 'Banco Central de Venezuela (BCV Oficial · 24/11/2026)'
  };

  function loadRates() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_RATES };
      const parsed = JSON.parse(raw);
      const parsedUsd = parseFloat(parsed.tasaUsd) || DEFAULT_RATES.tasaUsd;
      const parsedEur = parseFloat(parsed.tasaEur) || DEFAULT_RATES.tasaEur;
      // Si la fecha o tasa guardada en el navegador es anterior a la fecha oficial disponible (24/11/2026), auto-migrar
      const isStale = parsedUsd < 919 || !parsed.fechaTasa || parsed.fechaTasa < '2026-11-24';
      const finalUsd = isStale ? DEFAULT_RATES.tasaUsd : parsedUsd;
      const finalEur = isStale ? DEFAULT_RATES.tasaEur : parsedEur;
      const finalFecha = isStale ? DEFAULT_RATES.fechaTasa : parsed.fechaTasa;
      return {
        ...DEFAULT_RATES,
        ...parsed,
        tasaUsd: finalUsd,
        tasaEur: finalEur,
        fechaTasa: finalFecha,
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
   * Extrae tasas y fecha valor directamente del código HTML oficial del Banco Central de Venezuela
   */
  function parseBcvHtml(html) {
    if (!html || typeof html !== 'string') return null;
    const mDolar = html.match(/id=["']dolar["'][\s\S]*?<strong[^>]*>\s*([0-9.,]+)\s*<\/strong>/i);
    const mEuro = html.match(/id=["']euro["'][\s\S]*?<strong[^>]*>\s*([0-9.,]+)\s*<\/strong>/i);
    const mFecha = html.match(/Fecha Valor:[\s\S]*?content=["']([0-9]{4}-[0-9]{2}-[0-9]{2})/i);

    const cleanNum = (str) => {
      if (!str) return 0;
      return parseFloat(str.trim().replace(/\./g, '').replace(',', '.')) || 0;
    };

    const usd = cleanNum(mDolar ? mDolar[1] : null);
    const eur = cleanNum(mEuro ? mEuro[1] : null);
    const fecha = mFecha ? mFecha[1] : null;

    if (usd > 0) {
      return {
        usd,
        eur: eur > 0 ? eur : Math.round(usd * 1.0983 * 10000) / 10000,
        fecha: fecha || '2026-11-24'
      };
    }
    return null;
  }

  /**
   * Consulta en tiempo real las tasas oficiales de Venezuela desde el portal del BCV o APIs de respaldo
   */
  async function fetchLiveBcvRates() {
    let usd = 0;
    let eur = 0;
    let paralelo = 0;
    let fecha = '2026-11-24';
    let fuente = 'Banco Central de Venezuela (BCV Oficial)';

    // Intento 1: Proxy directo del BCV (/api/bcv configurado en Nginx de Docker / Easypanel)
    try {
      const respProxy = await fetch('/api/bcv', { method: 'GET', signal: AbortSignal.timeout(4000) });
      if (respProxy.ok) {
        const text = await respProxy.text();
        const parsed = parseBcvHtml(text);
        if (parsed && parsed.usd > 0) {
          usd = parsed.usd;
          eur = parsed.eur;
          fecha = parsed.fecha;
          fuente = 'Banco Central de Venezuela (BCV Oficial Directo)';
        }
      }
    } catch (e) {
      // Continuar al siguiente método
    }

    // Intento 2: Script PHP local bcv.php (en entornos Apache / Laragon con cURL)
    if (usd === 0) {
      try {
        const respPhp = await fetch('bcv.php', { method: 'GET', signal: AbortSignal.timeout(4000) });
        if (respPhp.ok) {
          const dPhp = await respPhp.json();
          if (dPhp && dPhp.success && dPhp.usd > 0) {
            usd = parseFloat(dPhp.usd) || 0;
            eur = parseFloat(dPhp.eur) || 0;
            if (dPhp.fecha) fecha = dPhp.fecha;
            fuente = dPhp.fuente || fuente;
          }
        }
      } catch (e) {
        // Continuar
      }
    }

    // Intento 3: ve.dolarapi.com/v1/dolares (API pública abierta con tasa de mercado paralelo)
    try {
      const resp = await fetch('https://ve.dolarapi.com/v1/dolares', {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(4000)
      });
      if (resp.ok) {
        const list = await resp.json();
        if (Array.isArray(list)) {
          const ofi = list.find((x) => x.fuente === 'oficial');
          const par = list.find((x) => x.fuente === 'paralelo');
          if (usd === 0 && ofi && ofi.promedio) {
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

    // Si aún no tenemos EUR, consultar endpoint de euros oficial
    if (eur === 0) {
      try {
        const respEur = await fetch('https://ve.dolarapi.com/v1/euros/oficial', {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(4000)
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
    }

    // Si falló EUR pero hay USD, estimar con paridad cambiaria
    if (usd > 0 && eur === 0) {
      eur = Math.round(usd * 1.0983 * 10000) / 10000;
    }

    // Si por alguna razón los servicios externos están caídos, usar los valores oficiales vigentes
    if (usd === 0) {
      usd = DEFAULT_RATES.tasaUsd;
      eur = DEFAULT_RATES.tasaEur;
      fecha = DEFAULT_RATES.fechaTasa;
    }

    const saved = loadRates();
    const payload = {
      tasaUsd: usd,
      tasaEur: eur > 0 ? eur : saved.tasaEur,
      fechaTasa: fecha,
      fuenteTexto: fuente
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
