<?php
// ============================================
// API: USUARIOS y AUTENTICACIÓN
// Inversiones Duri C.A
// ============================================

if (!class_exists('Database')) {
    $dbPath = 'C:\\laragon\\www\\inversiones-duri\\backend\\config\\database.php';
    if (!@file_exists($dbPath)) {
        $dbPath = __DIR__ . '/../config/database.php';
    }
    include $dbPath;
}

$database = new Database();
$db = $database->getConnection();

$action = $_GET['action'] ?? null;
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// ============================================
// LOGIN
// ============================================
if ($action === 'login' && $method === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    
    if (empty($data['email']) || empty($data['password'])) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "Email y contraseña son requeridos"]);
        exit();
    }
    
    $stmt = $db->prepare("SELECT * FROM usuarios WHERE email = ? AND activo = 1");
    $stmt->execute([$data['email']]);
    $usuario = $stmt->fetch();
    
    if (!$usuario) {
        http_response_code(401);
        echo json_encode(["status" => "error", "message" => "Credenciales incorrectas"]);
        exit();
    }
    
    // Verificar si está bloqueado
    if ($usuario['bloqueado']) {
        http_response_code(403);
        echo json_encode(["status" => "error", "message" => "Cuenta bloqueada. Contacte al administrador"]);
        exit();
    }
    
    // Verificar contraseña
    if (!password_verify($data['password'], $usuario['password'])) {
        // Incrementar intentos fallidos
        $intentos = $usuario['intentos_fallidos'] + 1;
        $bloqueado = $intentos >= 5 ? 1 : 0;
        
        $stmt = $db->prepare("UPDATE usuarios SET intentos_fallidos = ?, bloqueado = ? WHERE id = ?");
        $stmt->execute([$intentos, $bloqueado, $usuario['id']]);
        
        $msg = $bloqueado ? "Cuenta bloqueada por múltiples intentos fallidos" : "Contraseña incorrecta. Intentos: $intentos/5";
        http_response_code(401);
        echo json_encode(["status" => "error", "message" => $msg]);
        exit();
    }
    
    // Login exitoso - resetear intentos y actualizar último acceso
    $stmt = $db->prepare("UPDATE usuarios SET intentos_fallidos = 0, ultimo_acceso = NOW() WHERE id = ?");
    $stmt->execute([$usuario['id']]);
    
    // Obtener permisos del usuario
    $stmt = $db->prepare("SELECT p.nombre FROM permisos p INNER JOIN rol_permisos rp ON p.id = rp.permiso_id WHERE rp.rol = ?");
    $stmt->execute([$usuario['rol']]);
    $permisos = $stmt->fetchAll(PDO::FETCH_COLUMN);
    
    // Registrar actividad
    $stmt = $db->prepare("INSERT INTO log_actividad (usuario_id, accion, ip_address, user_agent) VALUES (?, 'LOGIN', ?, ?)");
    $stmt->execute([$usuario['id'], $_SERVER['REMOTE_ADDR'], $_SERVER['HTTP_USER_AGENT']]);
    
    // Respuesta (sin password)
    unset($usuario['password']);
    $usuario['permisos'] = $permisos;
    
    echo json_encode(["status" => "success", "message" => "Login exitoso", "data" => $usuario]);
    exit();
}

// ============================================
// RECUPERAR CONTRASEÑA: SOLICITAR CÓDIGO
// ============================================
if ($action === 'recuperar_solicitar' && $method === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    $email = trim(strtolower($data['email'] ?? ''));
    
    if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "Por favor ingresa un correo electrónico válido"]);
        exit();
    }
    
    // Asegurar existencia de la tabla password_resets
    try {
        $db->exec("CREATE TABLE IF NOT EXISTS password_resets (
            id INT AUTO_INCREMENT PRIMARY KEY,
            usuario_id INT NOT NULL,
            email VARCHAR(150) NOT NULL,
            codigo VARCHAR(6) NOT NULL,
            token VARCHAR(64) NOT NULL,
            expira_en DATETIME NOT NULL,
            usado TINYINT(1) DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )");
    } catch(Exception $e) {}
    
    $stmt = $db->prepare("SELECT id, nombre, email, activo FROM usuarios WHERE LOWER(email) = ?");
    $stmt->execute([$email]);
    $usuario = $stmt->fetch();
    
    if (!$usuario) {
        http_response_code(404);
        echo json_encode(["status" => "error", "message" => "No se encontró ningún usuario con ese correo electrónico"]);
        exit();
    }
    
    if (!$usuario['activo']) {
        http_response_code(403);
        echo json_encode(["status" => "error", "message" => "Esta cuenta está desactivada. Contacte al administrador"]);
        exit();
    }
    
    // Generar código numérico de 6 dígitos
    $codigo = sprintf("%06d", mt_rand(100000, 999999));
    $token = bin2hex(random_bytes(24));
    $expira = date('Y-m-d H:i:s', strtotime('+15 minutes'));
    
    // Invalidar códigos anteriores pendientes para este correo
    $stmt = $db->prepare("UPDATE password_resets SET usado = 1 WHERE LOWER(email) = ? AND usado = 0");
    $stmt->execute([$email]);
    
    // Guardar nuevo código
    $stmt = $db->prepare("INSERT INTO password_resets (usuario_id, email, codigo, token, expira_en, usado) VALUES (?, ?, ?, ?, ?, 0)");
    $stmt->execute([$usuario['id'], $email, $codigo, $token, $expira]);
    
    // Intentar enviar correo con mail()
    $asunto = "Código de Recuperación de Contraseña - Inversiones Duri C.A";
    $cuerpoHtml = "
    <div style='font-family:sans-serif;max-width:520px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;background:#ffffff;'>
        <div style='text-align:center;margin-bottom:20px;'>
            <h2 style='color:#E85D26;margin:0;'>Inversiones Duri C.A</h2>
            <p style='color:#6B6B6B;margin:4px 0 0;font-size:0.9rem;'>Recuperación de Contraseña</p>
        </div>
        <p style='color:#1A1A1A;font-size:1rem;'>Hola <strong>" . htmlspecialchars($usuario['nombre']) . "</strong>,</p>
        <p style='color:#4B5563;line-height:1.5;'>Recibimos una solicitud para restablecer tu contraseña. Ingresa el siguiente código de 6 dígitos en la pantalla de verificación:</p>
        <div style='background:#FFF4EF;border:2px dashed #E85D26;padding:16px;text-align:center;border-radius:8px;margin:20px 0;'>
            <span style='font-size:32px;font-weight:800;letter-spacing:6px;color:#E85D26;'>" . $codigo . "</span>
        </div>
        <p style='color:#6B6B6B;font-size:0.85rem;'>Este código es válido por <strong>15 minutos</strong>. Si no solicitaste este cambio, puedes ignorar este mensaje.</p>
        <hr style='border:none;border-top:1px solid #e5e7eb;margin:20px 0;'>
        <p style='color:#9E9E9E;font-size:0.75rem;text-align:center;'>Inversiones Duri C.A - Maracay, Estado Aragua</p>
    </div>";
    
    $headers = "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
    $headers .= "From: Inversiones Duri <no-reply@inversionesduri.com>\r\n";
    
    $mailEnviado = @mail($email, $asunto, $cuerpoHtml, $headers);
    
    try {
        $stmt = $db->prepare("INSERT INTO log_actividad (usuario_id, accion, ip_address, user_agent) VALUES (?, 'SOLICITUD_RECUPERAR_PASSWORD', ?, ?)");
        $stmt->execute([$usuario['id'], $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1', $_SERVER['HTTP_USER_AGENT'] ?? '']);
    } catch(Exception $e) {}
    
    echo json_encode([
        "status" => "success",
        "message" => "Código de recuperación generado exitosamente",
        "data" => [
            "email" => $email,
            "mail_enviado" => $mailEnviado,
            "codigo_dev" => $codigo // Disponible para pruebas en localhost sin SMTP
        ]
    ]);
    exit();
}

// ============================================
// RECUPERAR CONTRASEÑA: VERIFICAR Y CAMBIAR
// ============================================
if ($action === 'recuperar_cambiar' && $method === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    $email = trim(strtolower($data['email'] ?? ''));
    $codigo = trim($data['codigo'] ?? '');
    $password = $data['password'] ?? '';
    
    if (empty($email) || empty($codigo) || empty($password)) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "Correo, código y nueva contraseña son obligatorios"]);
        exit();
    }
    
    if (strlen($password) < 6) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "La contraseña debe tener mínimo 6 caracteres"]);
        exit();
    }
    
    // Buscar código válido, no usado y no expirado
    $stmt = $db->prepare("SELECT * FROM password_resets WHERE LOWER(email) = ? AND codigo = ? AND usado = 0 AND expira_en > NOW() ORDER BY id DESC LIMIT 1");
    $stmt->execute([$email, $codigo]);
    $reset = $stmt->fetch();
    
    if (!$reset) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "El código es incorrecto o ya ha expirado"]);
        exit();
    }
    
    // Actualizar contraseña de usuario y desbloquear cuenta si estaba bloqueada
    $hashedPassword = password_hash($password, PASSWORD_DEFAULT);
    $stmt = $db->prepare("UPDATE usuarios SET password = ?, bloqueado = 0, intentos_fallidos = 0 WHERE id = ?");
    $stmt->execute([$hashedPassword, $reset['usuario_id']]);
    
    // Marcar código como usado
    $stmt = $db->prepare("UPDATE password_resets SET usado = 1 WHERE id = ?");
    $stmt->execute([$reset['id']]);
    
    try {
        $stmt = $db->prepare("INSERT INTO log_actividad (usuario_id, accion, ip_address, user_agent) VALUES (?, 'PASSWORD_RECUPERADA_EXITOSAMENTE', ?, ?)");
        $stmt->execute([$reset['usuario_id'], $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1', $_SERVER['HTTP_USER_AGENT'] ?? '']);
    } catch(Exception $e) {}
    
    echo json_encode([
        "status" => "success",
        "message" => "¡Contraseña actualizada con éxito! Ya puedes iniciar sesión con tu nueva contraseña."
    ]);
    exit();
}

// ============================================
// VERIFICAR SESIÓN
// ============================================
if ($action === 'verify') {
    if (session_status() === PHP_SESSION_NONE) session_start();
    
    if (isset($_SESSION['user_id'])) {
        echo json_encode(["status" => "success", "logged_in" => true]);
    } else {
        echo json_encode(["status" => "success", "logged_in" => false]);
    }
    exit();
}

// ============================================
// LOGOUT
// ============================================
if ($action === 'logout' && $method === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    
    if (!empty($data['usuario_id'])) {
        $stmt = $db->prepare("INSERT INTO log_actividad (usuario_id, accion, ip_address) VALUES (?, 'LOGOUT', ?)");
        $stmt->execute([$data['usuario_id'], $_SERVER['REMOTE_ADDR']]);
    }
    
    echo json_encode(["status" => "success", "message" => "Sesión cerrada"]);
    exit;
}

// ============================================
// CRUD USUARIOS (Solo SuperUsuario)
// ============================================
if ($method === 'GET' && !$action) {
    // Listar usuarios
    $stmt = $db->query("SELECT id, nombre, email, rol, telefono, activo, ultimo_acceso, created_at FROM usuarios ORDER BY nombre");
    $usuarios = $stmt->fetchAll();
    echo json_encode(["status" => "success", "data" => $usuarios]);
    exit;
}

if ($method === 'POST' && !$action) {
    // Crear usuario
    $data = json_decode(file_get_contents("php://input"), true);
    
    if (empty($data['nombre']) || empty($data['email']) || empty($data['password'])) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "Nombre, email y contraseña son requeridos"]);
        exit;
    }
    
    // Verificar email único
    $stmt = $db->prepare("SELECT id FROM usuarios WHERE email = ?");
    $stmt->execute([$data['email']]);
    if ($stmt->fetch()) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "El email ya está registrado"]);
        exit;
    }
    
    $hashedPassword = password_hash($data['password'], PASSWORD_DEFAULT);
    
    $stmt = $db->prepare("INSERT INTO usuarios (nombre, email, password, rol, telefono) VALUES (?, ?, ?, ?, ?)");
    $stmt->execute([
        $data['nombre'],
        $data['email'],
        $hashedPassword,
        $data['rol'] ?? 'usuario',
        $data['telefono'] ?? ''
    ]);
    
    $id = $db->lastInsertId();
    http_response_code(201);
    echo json_encode(["status" => "success", "message" => "Usuario creado", "id" => $id]);
    exit;
}

if ($method === 'PUT') {
    $data = json_decode(file_get_contents("php://input"), true);
    $id = $_GET['id'] ?? null;
    
    if (!$id) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "ID requerido"]);
        exit;
    }
    
    $fields = [];
    $values = [];
    
    if (!empty($data['nombre'])) { $fields[] = "nombre = ?"; $values[] = $data['nombre']; }
    if (!empty($data['email'])) { $fields[] = "email = ?"; $values[] = $data['email']; }
    if (!empty($data['rol'])) { $fields[] = "rol = ?"; $values[] = $data['rol']; }
    if (isset($data['telefono'])) { $fields[] = "telefono = ?"; $values[] = $data['telefono']; }
    if (isset($data['activo'])) { $fields[] = "activo = ?"; $values[] = $data['activo']; }
    if (!empty($data['password'])) { 
        $fields[] = "password = ?"; 
        $values[] = password_hash($data['password'], PASSWORD_DEFAULT); 
    }
    
    if (!empty($fields)) {
        $values[] = $id;
        $stmt = $db->prepare("UPDATE usuarios SET " . implode(', ', $fields) . " WHERE id = ?");
        $stmt->execute($values);
    }
    
    echo json_encode(["status" => "success", "message" => "Usuario actualizado"]);
    exit;
}

if ($method === 'DELETE') {
    $id = $_GET['id'] ?? null;
    if (!$id) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "ID requerido"]);
        exit;
    }
    
    $stmt = $db->prepare("UPDATE usuarios SET activo = 0 WHERE id = ?");
    $stmt->execute([$id]);
    
    echo json_encode(["status" => "success", "message" => "Usuario desactivado"]);
    exit;
}

// ============================================
// LOG DE ACTIVIDAD
// ============================================
if ($action === 'log') {
    $stmt = $db->query("SELECT la.*, u.nombre as usuario_nombre FROM log_actividad la LEFT JOIN usuarios u ON la.usuario_id = u.id ORDER BY la.created_at DESC LIMIT 100");
    $logs = $stmt->fetchAll();
    echo json_encode(["status" => "success", "data" => $logs]);
    exit;
}

http_response_code(400);
echo json_encode(["status" => "error", "message" => "Acción no válida"]);
?>
