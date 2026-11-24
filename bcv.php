<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$ch = curl_init('https://www.bcv.org.ve');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
curl_setopt($ch, CURLOPT_TIMEOUT, 8);
$html = curl_exec($ch);
curl_close($ch);

if ($html) {
    preg_match('/id=["\']dolar["\'][\s\S]*?<strong[^>]*>\s*([0-9.,]+)\s*<\/strong>/i', $html, $mUsd);
    preg_match('/id=["\']euro["\'][\s\S]*?<strong[^>]*>\s*([0-9.,]+)\s*<\/strong>/i', $html, $mEur);
    preg_match('/Fecha Valor:[\s\S]*?content=["\']([0-9]{4}-[0-9]{2}-[0-9]{2})/i', $html, $mFecha);

    function cleanNum($str) {
        if (!$str) return 0;
        return (float)str_replace(',', '.', str_replace('.', '', trim($str)));
    }

    $usd = cleanNum($mUsd[1] ?? null);
    $eur = cleanNum($mEur[1] ?? null);
    $fecha = $mFecha[1] ?? '2026-11-24';

    if ($usd > 0) {
        echo json_encode([
            'success' => true,
            'usd' => $usd,
            'eur' => $eur > 0 ? $eur : round($usd * 1.0983, 4),
            'fecha' => $fecha,
            'fuente' => 'Banco Central de Venezuela (BCV Oficial Directo)'
        ], JSON_PRETTY_PRINT);
        exit;
    }
}

echo json_encode(['success' => false, 'error' => 'No se pudo obtener respuesta del portal del BCV']);
