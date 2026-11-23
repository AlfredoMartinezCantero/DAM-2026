<?php
http_response_code(410);
header('Content-Type: application/json; charset=utf-8');
echo json_encode(['ok'=>false,'error'=>'Las altas se realizan en api/superapi.php con sesión y token CSRF.']);

