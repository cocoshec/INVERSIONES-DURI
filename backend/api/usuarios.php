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

$action = $_GET['action'] ?? $_SERVER['REQUEST_METHOD'];
$method = $_SERVER['REQUEST_METHOD'];

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
