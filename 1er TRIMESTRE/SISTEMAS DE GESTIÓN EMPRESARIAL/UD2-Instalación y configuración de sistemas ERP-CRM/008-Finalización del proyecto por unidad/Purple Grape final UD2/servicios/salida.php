<?php
header('Content-Type: application/json; charset=utf-8');
http_response_code(405);
echo json_encode(['ok'=>false,'error'=>'Usa la API CRUD para modificar datos; no se admite importar SQL arbitrario.']);
