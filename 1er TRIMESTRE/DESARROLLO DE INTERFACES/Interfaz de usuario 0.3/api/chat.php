<?php
/** Puente para Apache/XAMPP o php -S. El navegador nunca llama a Ollama. */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function responder($estado, $texto, $accion = null) {
    http_response_code($estado);
    echo json_encode(['respuesta' => $texto, 'accion' => $accion], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

// Mismo límite que JavaScript (unidades UTF-16), sin requerir mbstring.
function longitudTexto($texto) {
    $longitud = preg_match_all('/./us', $texto);
    if ($longitud === false) return PHP_INT_MAX;
    return $longitud + preg_match_all('/[\x{10000}-\x{10FFFF}]/u', $texto);
}

function orientarChat($mensaje, $historial, $politica) {
    $normalizar = function ($texto) {
        return strtolower(strtr($texto, ['á'=>'a', 'é'=>'e', 'í'=>'i', 'ó'=>'o', 'ú'=>'u', 'ü'=>'u', 'ñ'=>'n',
            'Á'=>'A', 'É'=>'E', 'Í'=>'I', 'Ó'=>'O', 'Ú'=>'U', 'Ü'=>'U', 'Ñ'=>'N']));
    };
    $coincide = function ($clave, $texto) use ($politica) {
        return preg_match('~' . $politica['patrones'][$clave] . '~', $texto) === 1;
    };
    $esAlta = function ($texto) use ($coincide) {
        return $coincide('alta', $texto) && $coincide('cliente', $texto) &&
            !$coincide('explicacion', $texto) && !$coincide('negacionAlta', $texto);
    };
    $texto = $normalizar($mensaje);
    if ($coincide('capacidades', $texto)) return ['respuestaDirecta' => $politica['respuestas']['capacidades']];
    $usuarios = [];
    foreach ($historial as $item) if ($item['role'] === 'user') $usuarios[] = $normalizar($item['content']);
    $continuacion = count($usuarios) && $esAlta($usuarios[count($usuarios) - 1]) && $coincide('datosCliente', $texto);
    if ($esAlta($texto) || $continuacion) return ['modo' => 'borrador'];
    if (!$coincide('datosCopiados', $texto) && !$coincide('explicacion', $texto)) {
        $id = $coincide('soloId', $texto);
        $stockAnterior = false;
        $registrosAnteriores = false;
        foreach ($usuarios as $item) {
            $stockAnterior = $stockAnterior || $coincide('stock', $item);
            $registrosAnteriores = $registrosAnteriores || $coincide('registros', $item);
        }
        if ($coincide('stock', $texto) || ($id && $stockAnterior)) return ['respuestaDirecta' => $politica['respuestas']['stock']];
        if ($coincide('registros', $texto) || ($id && $registrosAnteriores)) return ['respuestaDirecta' => $politica['respuestas']['registros']];
    }
    return ['modo' => 'ayuda'];
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    responder(405, 'Utiliza POST para enviar un mensaje.');
}
$tipo = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]));
if ($tipo !== 'application/json') responder(415, 'Envía el mensaje como application/json.');

$cuerpo = file_get_contents('php://input', false, null, 0, 1048577);
if ($cuerpo === false) responder(400, 'No se pudo leer el mensaje.');
if (strlen($cuerpo) > 1048576) responder(413, 'La petición es demasiado grande.');
$entrada = json_decode($cuerpo);
if (json_last_error() !== JSON_ERROR_NONE) responder(400, 'El JSON enviado no es válido.');
if (!is_object($entrada) || !isset($entrada->mensaje) || !is_string($entrada->mensaje) || trim($entrada->mensaje) === '') {
    responder(400, 'Introduce un mensaje de texto.');
}
$mensaje = trim($entrada->mensaje);
if (longitudTexto($mensaje) > 4000) responder(400, 'El mensaje admite un máximo de 4000 caracteres.');
$historial = $entrada->historial ?? [];
if (!is_array($historial) || count($historial) > 12 || count($historial) % 2 !== 0) {
    responder(400, 'El historial debe contener como máximo 6 intercambios completos.');
}
$mensajes = [];
foreach ($historial as $indice => $item) {
    $rol = $indice % 2 ? 'assistant' : 'user';
    if (!is_object($item) || ($item->role ?? '') !== $rol || !isset($item->content) ||
        !is_string($item->content) || trim($item->content) === '' ||
        longitudTexto($item->content) > ($rol === 'user' ? 4000 : 16000)) {
        responder(400, 'El historial contiene un mensaje incorrecto.');
    }
    $mensajes[] = ['role' => $rol, 'content' => $item->content];
}
$config = json_decode(file_get_contents(__DIR__ . '/ollama.json'), true);
if (!is_array($config)) responder(500, 'No se pudo leer la configuración del chat.');
$formato = json_decode(file_get_contents(__DIR__ . '/chat-formato.json'));
if (!is_object($formato)) responder(500, 'No se pudo leer el formato del chat.');
$politica = json_decode(file_get_contents(__DIR__ . '/chat-politica.json'), true);
if (!is_array($politica)) responder(500, 'No se pudo leer el contexto del chat.');
$ruta = orientarChat($mensaje, $mensajes, $politica);
if (isset($ruta['respuestaDirecta'])) responder(200, $ruta['respuestaDirecta']);
$esBorrador = $ruta['modo'] === 'borrador';
if (!function_exists('curl_init')) responder(503, 'Activa la extensión cURL de PHP y reinicia el servidor.');
$instrucciones = $config['sistema'] . "\n" . $politica['reglas'] . "\n" . ($esBorrador ? $politica['borrador'] : $politica['ayuda']);
if ($esBorrador) $instrucciones .= "\nEsquema JSON de salida: " . json_encode($formato, JSON_UNESCAPED_UNICODE);
array_unshift($mensajes, ['role' => 'system', 'content' => $instrucciones]);
$mensajes[] = ['role' => 'user', 'content' => $mensaje];
$datos = [
    'model' => $config['modelo'],
    'messages' => $mensajes,
    'stream' => false,
    'options' => ['num_predict' => $esBorrador ? 2048 : 1024, 'temperature' => 0],
];
if ($esBorrador) $datos['format'] = $formato;
set_time_limit($config['timeoutSegundos'] + 10);
$ch = curl_init($config['url']);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_POSTFIELDS => json_encode($datos, JSON_UNESCAPED_UNICODE),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 5,
    CURLOPT_TIMEOUT => $config['timeoutSegundos'],
]);
$respuesta = curl_exec($ch);
$error = curl_errno($ch);
$estado = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
if ($respuesta === false) {
    responder($error === CURLE_OPERATION_TIMEDOUT ? 504 : 502,
        $error === CURLE_OPERATION_TIMEDOUT
            ? 'Ollama ha superado el tiempo de espera. Vuelve a intentarlo.'
            : 'No se ha podido conectar con Ollama. Comprueba que esté ejecutándose en el equipo del servidor.');
}
if ($estado < 200 || $estado >= 300) {
    responder(502, $estado === 404
        ? 'El modelo ' . $config['modelo'] . ' no está disponible en Ollama. Comprueba que esté instalado en el equipo del servidor.'
        : 'Ollama no pudo generar la respuesta. Inténtalo de nuevo.');
}
$resultado = json_decode($respuesta, true);
if (json_last_error() !== JSON_ERROR_NONE) responder(502, 'Ollama devolvió un JSON incorrecto.');
$texto = is_array($resultado) ? ($resultado['message']['content'] ?? null) : null;
if (isset($resultado['error']) || !is_string($texto) || trim($texto) === '' || longitudTexto($texto) > 16000) {
    responder(502, 'Ollama devolvió una respuesta vacía o incorrecta.');
}
if (!$esBorrador) responder(200, trim($texto));
$salida = json_decode($texto);
if (json_last_error() !== JSON_ERROR_NONE) responder(502, 'La IA no devolvió un borrador o una respuesta válidos. Vuelve a intentarlo.');
if (!is_object($salida) || array_diff(array_keys(get_object_vars($salida)), ['respuesta', 'accion', 'cliente']) ||
    !isset($salida->respuesta) || !is_string($salida->respuesta) || trim($salida->respuesta) === '' || longitudTexto($salida->respuesta) > 4000 ||
    !in_array($salida->accion ?? '', ['ninguna', 'preparar_cliente'], true) || !isset($salida->cliente) || !is_object($salida->cliente)) {
    responder(502, 'La IA devolvió una acción o una respuesta incorrecta. Vuelve a intentarlo.');
}
$campos = get_object_vars($formato->properties->cliente->properties);
if (count(get_object_vars($salida->cliente)) !== count($campos)) responder(502, 'La IA devolvió campos de cliente incorrectos. Vuelve a intentarlo.');
$borrador = [];
foreach ($campos as $campo => $regla) {
    if (!isset($salida->cliente->$campo) || !is_string($salida->cliente->$campo) || longitudTexto($salida->cliente->$campo) > ($campo === 'observaciones' ? 4000 : 1000)) {
        responder(502, 'La IA devolvió campos de cliente incorrectos. Vuelve a intentarlo.');
    }
    $borrador[$campo] = trim($salida->cliente->$campo);
}
if ($salida->accion === 'ninguna') responder(200, trim($salida->respuesta));
if (!count(array_filter($borrador, function ($valor) { return $valor !== ''; }))) {
    responder(200, $politica['respuestas']['altaSinDatos']);
}
responder(200, 'He preparado un borrador de cliente. Pulsa «Revisar nuevo cliente», comprueba los campos y completa los que falten. Todavía no se ha guardado ningún registro.',
    ['tipo' => 'preparar_cliente', 'datos' => $borrador]);
