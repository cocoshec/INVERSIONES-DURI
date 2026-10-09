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
// LOGIN (BLINDADO CON ESTÁNDARES OWASP)
// ============================================
if ($action === 'login' && $method === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
    $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? 'Desconocido';

    // 1. CAPA ANTI-BOTS (HONEYPOT)
    if (!empty($data['website_trap'])) {
        // Un robot completó el campo trampa
        http_response_code(403);
        echo json_encode(["status" => "error", "message" => "Acceso denegado"]);
        exit();
    }

    $email = trim(strtolower($data['email'] ?? ''));
    $password = (string)($data['password'] ?? '');

    // Validación básica de entrada
    if (empty($email) || empty($password)) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "Correo electrónico y contraseña son obligatorios"]);
        exit();
    }

    // Prevención de ataques DoS por longitud de hash (Bcrypt se limita a 72 bytes)
    if (strlen($email) > 150 || strlen($password) > 72) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "Credenciales inválidas"]);
        exit();
    }

    // 2. CAPA ANTI-FUERZA BRUTA POR IP (RATE LIMITING)
    // Máximo 5 intentos fallidos en los últimos 15 minutos desde esta misma IP
    try {
        $stmtIp = $db->prepare("SELECT COUNT(*) FROM login_attempts WHERE ip_address = ? AND exitoso = 0 AND created_at > (NOW() - INTERVAL 15 MINUTE)");
        $stmtIp->execute([$ip]);
        $intentosIp = (int)$stmtIp->fetchColumn();

        if ($intentosIp >= 5) {
            http_response_code(429); // Too Many Requests
            echo json_encode([
                "status" => "error",
                "message" => "Acceso bloqueado temporalmente por seguridad. Se detectaron múltiples intentos fallidos desde tu conexión. Por favor espera 15 minutos."
            ]);
            exit();
        }
    } catch(Exception $e) {}

    // Buscar usuario en la base de datos
    $stmt = $db->prepare("SELECT * FROM usuarios WHERE LOWER(email) = ? AND activo = 1");
    $stmt->execute([$email]);
    $usuario = $stmt->fetch();

    // 3. CAPA ANTI-TIMING ATTACKS (ANTI-ENUMERACIÓN DE USUARIOS)
    // Si el usuario no existe, se calcula un hash simulado idéntico para que el tiempo de respuesta sea constante
    $dummyHash = '$2y$10$e8wVqB0a58z2p2vYnK31yeO1V3iE0r2Z4h7k1u8m6w4t5y9o1p3s2';
    $hashAComprobar = $usuario ? $usuario['password'] : $dummyHash;
    $passwordValida = password_verify($password, $hashAComprobar);

    // Si el usuario no existe o la contraseña no coincide
    if (!$usuario || !$passwordValida) {
        // Registrar intento fallido por IP
        try {
            $stmtLog = $db->prepare("INSERT INTO login_attempts (ip_address, email, exitoso) VALUES (?, ?, 0)");
            $stmtLog->execute([$ip, $email]);
        } catch(Exception $e) {}

        if ($usuario) {
            $intentos = (int)$usuario['intentos_fallidos'] + 1;
            $bloqueado = $intentos >= 5 ? 1 : 0;
            $stmtUp = $db->prepare("UPDATE usuarios SET intentos_fallidos = ?, bloqueado = ? WHERE id = ?");
            $stmtUp->execute([$intentos, $bloqueado, $usuario['id']]);

            try {
                $stmtAct = $db->prepare("INSERT INTO log_actividad (usuario_id, accion, ip_address, user_agent) VALUES (?, 'INTENTO_FALLIDO_LOGIN', ?, ?)");
                $stmtAct->execute([$usuario['id'], $ip, $userAgent]);
            } catch(Exception $e) {}

            if ($bloqueado) {
                http_response_code(403);
                echo json_encode([
                    "status" => "error",
                    "message" => "Tu cuenta ha sido bloqueada tras 5 intentos fallidos. Utiliza la opción '¿Olvidaste tu contraseña?' para desbloquearla."
                ]);
                exit();
            }

            $restantes = 5 - $intentos;
            http_response_code(401);
            echo json_encode([
                "status" => "error",
                "message" => "Credenciales incorrectas. Te quedan {$restantes} intento(s) antes del bloqueo de seguridad."
            ]);
            exit();
        }

        http_response_code(401);
        echo json_encode([
            "status" => "error",
            "message" => "Credenciales incorrectas. Verifica tu correo y contraseña."
        ]);
        exit();
    }

    // Verificar si la cuenta ya estaba bloqueada previamente
    if ($usuario['bloqueado']) {
        http_response_code(403);
        echo json_encode([
            "status" => "error",
            "message" => "Esta cuenta está bloqueada por seguridad. Puedes recuperarla y desbloquearla con tu correo en '¿Olvidaste tu contraseña?'."
        ]);
        exit();
    }

    // 4. CAPA DE SEGURIDAD DE SESIÓN (ANTI-SESSION FIXATION & HIJACKING)
    if (session_status() === PHP_SESSION_NONE) {
        @ini_set('session.cookie_httponly', 1);
        @ini_set('session.use_only_cookies', 1);
        @ini_set('session.cookie_samesite', 'Lax');
        session_start();
    }
    session_regenerate_id(true);

    $_SESSION['user_id'] = $usuario['id'];
    $_SESSION['user_rol'] = $usuario['rol'];
    $_SESSION['user_ip'] = $ip;
    $_SESSION['user_agent'] = $userAgent;
    $_SESSION['last_activity'] = time();

    // Login exitoso: Registrar en intentos y limpiar contador de fallos
    try {
        $stmtLog = $db->prepare("INSERT INTO login_attempts (ip_address, email, exitoso) VALUES (?, ?, 1)");
        $stmtLog->execute([$ip, $email]);
    } catch(Exception $e) {}

    $stmt = $db->prepare("UPDATE usuarios SET intentos_fallidos = 0, ultimo_acceso = NOW() WHERE id = ?");
    $stmt->execute([$usuario['id']]);

    // Obtener permisos del rol
    $stmt = $db->prepare("SELECT p.nombre FROM permisos p INNER JOIN rol_permisos rp ON p.id = rp.permiso_id WHERE rp.rol = ?");
    $stmt->execute([$usuario['rol']]);
    $permisos = $stmt->fetchAll(PDO::FETCH_COLUMN);

    // Auditoría
    try {
        $stmt = $db->prepare("INSERT INTO log_actividad (usuario_id, accion, ip_address, user_agent) VALUES (?, 'LOGIN_EXITOSO', ?, ?)");
        $stmt->execute([$usuario['id'], $ip, $userAgent]);
    } catch(Exception $e) {}

    // Respuesta protegida (sin exponer el hash del password)
    unset($usuario['password']);
    $usuario['permisos'] = $permisos;

    echo json_encode([
        "status" => "success",
        "message" => "¡Bienvenido, " . htmlspecialchars($usuario['nombre']) . "!",
        "data" => $usuario
    ]);
    exit();
}

// ============================================
// FUNCIÓN AUXILIAR: ENVÍO SMTP DIRECTO (GMAIL SSL)
// ============================================
function enviarCodigoRecuperacionDirecto($to, $nombre, $codigo) {
    $mailConfigFile = __DIR__ . '/../config/mail.php';
    if (file_exists($mailConfigFile)) {
        require_once $mailConfigFile;
    }

    $host = defined('MAIL_HOST') ? MAIL_HOST : 'smtp.gmail.com';
    $port = defined('MAIL_PORT') ? MAIL_PORT : 465;
    $user = defined('MAIL_USER') ? MAIL_USER : (getenv('MAIL_USER') ?: '');
    $pass = defined('MAIL_PASS') ? str_replace(' ', '', MAIL_PASS) : (getenv('MAIL_PASS') ?: '');
    $from = $user ?: 'inversionesdurica@gmail.com';
    $fromName = defined('MAIL_FROM_NAME') ? MAIL_FROM_NAME : 'Inversiones Duri C.A';

    if (empty($user) || empty($pass)) {
        return ["success" => false, "message" => "Credenciales de correo no configuradas."];
    }

    $context = stream_context_create([
        'ssl' => [
            'verify_peer' => false,
            'verify_peer_name' => false,
            'allow_self_signed' => true
        ]
    ]);

    $socket = @stream_socket_client("ssl://{$host}:{$port}", $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $context);
    if (!$socket) {
        return ["success" => false, "message" => "Conexión fallida al servidor SMTP: $errstr ($errno)"];
    }

    $response = fgets($socket, 515);

    $cmds = [
        "EHLO localhost",
        "AUTH LOGIN",
        base64_encode($user),
        base64_encode($pass),
        "MAIL FROM:<{$from}>",
        "RCPT TO:<{$to}>",
        "DATA"
    ];

    foreach ($cmds as $cmd) {
        fputs($socket, $cmd . "\r\n");
        $code = 0;
        while ($line = fgets($socket, 515)) {
            if (preg_match('/^([0-9]{3})[ -]/', $line, $m)) {
                $code = (int)$m[1];
            }
            if (substr($line, 3, 1) === ' ') break;
        }
        if ($code >= 400) {
            fclose($socket);
            return ["success" => false, "message" => "Error SMTP en autenticación ($code)"];
        }
    }

    $asunto = "Código de Recuperación: {$codigo} - Inversiones Duri C.A";
    $boundary = "duri_bnd_" . md5(time());
    $htmlBody = "
    <div style='font-family:-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif;max-width:520px;margin:20px auto;padding:32px 24px;border:1px solid #e5e7eb;border-radius:16px;background:#ffffff;'>
        <div style='text-align:center;margin-bottom:24px;'>
            <h1 style='color:#E85D26;font-size:24px;margin:0;font-weight:800;'>Inversiones Duri C.A</h1>
            <p style='color:#6B6B6B;margin:6px 0 0;font-size:14px;font-weight:500;'>Seguridad y Recuperación de Cuenta</p>
        </div>
        <p style='color:#1F2937;font-size:16px;margin-bottom:12px;'>Hola <strong>" . htmlspecialchars($nombre ?: 'Usuario') . "</strong>,</p>
        <p style='color:#4B5563;font-size:14px;line-height:1.6;margin-bottom:24px;'>
            Hemos recibido una solicitud para restablecer la contraseña de tu cuenta. Ingresa el siguiente código de verificación en la pantalla de inicio de sesión:
        </p>
        <div style='background:#FFF5F0;border:2px dashed #E85D26;padding:20px;text-align:center;border-radius:12px;margin:24px 0;'>
            <div style='color:#6B6B6B;font-size:12px;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;margin-bottom:6px;'>Tu Código de Seguridad</div>
            <span style='font-size:36px;font-weight:800;letter-spacing:8px;color:#E85D26;font-family:monospace;'>" . htmlspecialchars($codigo) . "</span>
        </div>
        <p style='color:#6B6B6B;font-size:13px;line-height:1.5;'>
            ⏱️ Este código es válido por <strong>5 minutos</strong>. Si tú no realizaste esta solicitud, puedes ignorar este mensaje.
        </p>
        <hr style='border:none;border-top:1px solid #F3F4F6;margin:28px 0 20px 0;'>
        <p style='color:#9CA3AF;font-size:12px;text-align:center;margin:0;'>
            © " . date('Y') . " Inversiones Duri C.A — Todos los derechos reservados.
        </p>
    </div>";

    $altBody = "Hola {$nombre}. Tu código de recuperación de Inversiones Duri es: {$codigo}. Válido por 5 minutos.";

    $headers = [
        "Date: " . date('r'),
        "From: =?UTF-8?B?" . base64_encode($fromName) . "?= <{$from}>",
        "To: <{$to}>",
        "Subject: =?UTF-8?B?" . base64_encode($asunto) . "?=",
        "MIME-Version: 1.0",
        "Content-Type: multipart/alternative; boundary=\"{$boundary}\""
    ];

    $bodyContent = "--{$boundary}\r\n" .
        "Content-Type: text/plain; charset=UTF-8\r\n" .
        "Content-Transfer-Encoding: base64\r\n\r\n" .
        chunk_split(base64_encode($altBody)) . "\r\n" .
        "--{$boundary}\r\n" .
        "Content-Type: text/html; charset=UTF-8\r\n" .
        "Content-Transfer-Encoding: base64\r\n\r\n" .
        chunk_split(base64_encode($htmlBody)) . "\r\n" .
        "--{$boundary}--\r\n";

    $data = implode("\r\n", $headers) . "\r\n\r\n" . $bodyContent . "\r\n.\r\n";
    fputs($socket, $data);

    $finalCode = 0;
    while ($line = fgets($socket, 515)) {
        if (preg_match('/^([0-9]{3})[ -]/', $line, $m)) {
            $finalCode = (int)$m[1];
        }
        if (substr($line, 3, 1) === ' ') break;
    }

    fputs($socket, "QUIT\r\n");
    fclose($socket);

    if ($finalCode >= 400) {
        return ["success" => false, "message" => "Error SMTP al enviar: $finalCode"];
    }

    return ["success" => true, "message" => "Correo enviado exitosamente a la bandeja de entrada"];
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
    $expira = date('Y-m-d H:i:s', strtotime('+5 minutes'));
    
    // Invalidar códigos anteriores pendientes para este correo
    $stmt = $db->prepare("UPDATE password_resets SET usado = 1 WHERE LOWER(email) = ? AND usado = 0");
    $stmt->execute([$email]);
    
    // Guardar nuevo código
    $stmt = $db->prepare("INSERT INTO password_resets (usuario_id, email, codigo, token, expira_en, usado) VALUES (?, ?, ?, ?, ?, 0)");
    $stmt->execute([$usuario['id'], $email, $codigo, $token, $expira]);
    
    // Enviar correo de recuperación con SMTP SSL nativo (Gmail)
    $mailRes = enviarCodigoRecuperacionDirecto($email, $usuario['nombre'], $codigo);
    $mailEnviado = $mailRes['success'];
    $mailDetalle = $mailRes['message'] ?? '';
    
    try {
        $stmt = $db->prepare("INSERT INTO log_actividad (usuario_id, accion, ip_address, user_agent) VALUES (?, 'SOLICITUD_RECUPERAR_PASSWORD', ?, ?)");
        $stmt->execute([$usuario['id'], $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1', $_SERVER['HTTP_USER_AGENT'] ?? '']);
    } catch(Exception $e) {}
    
    echo json_encode([
        "status" => "success",
        "message" => $mailEnviado 
            ? "Código de verificación enviado exitosamente a tu correo." 
            : "Código de recuperación generado.",
        "data" => [
            "email" => $email,
            "mail_enviado" => $mailEnviado,
            "mail_detalle" => $mailDetalle,
            "codigo_dev" => $mailEnviado ? null : $codigo // Si el correo se envió de verdad, no revelamos el código en pantalla
        ]
    ]);
    exit();
}

// ============================================
// RECUPERAR CONTRASEÑA: PASO 2 - VALIDAR CÓDIGO
// ============================================
if ($action === 'recuperar_validar_codigo' && $method === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    $email = trim(strtolower($data['email'] ?? ''));
    $codigo = trim($data['codigo'] ?? '');
    
    if (empty($email) || empty($codigo)) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "El correo y el código son requeridos"]);
        exit();
    }
    
    if (strlen($codigo) !== 6 || !ctype_digit($codigo)) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "El código debe tener exactamente 6 dígitos"]);
        exit();
    }
    
    // Verificar código vigente, no usado y no expirado
    $stmt = $db->prepare("SELECT * FROM password_resets WHERE LOWER(email) = ? AND codigo = ? AND usado = 0 AND expira_en > NOW() ORDER BY id DESC LIMIT 1");
    $stmt->execute([$email, $codigo]);
    $reset = $stmt->fetch();
    
    if (!$reset) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "El código es incorrecto o ya ha expirado"]);
        exit();
    }
    
    echo json_encode([
        "status" => "success",
        "message" => "¡Código de verificación válido!",
        "data" => [
            "token" => $reset['token']
        ]
    ]);
    exit();
}

// ============================================
// RECUPERAR CONTRASEÑA: PASO 3 - CAMBIAR CONTRASEÑA
// ============================================
if ($action === 'recuperar_cambiar' && $method === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    $email = trim(strtolower($data['email'] ?? ''));
    $codigo = trim($data['codigo'] ?? '');
    $token = trim($data['token'] ?? '');
    $password = $data['password'] ?? '';
    
    if (empty($email) || (empty($codigo) && empty($token)) || empty($password)) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "Datos incompletos para actualizar la contraseña"]);
        exit();
    }
    
    if (strlen($password) < 6) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "La contraseña debe tener mínimo 6 caracteres"]);
        exit();
    }
    
    // Buscar código/token válido, no usado y no expirado
    if (!empty($token)) {
        $stmt = $db->prepare("SELECT * FROM password_resets WHERE LOWER(email) = ? AND token = ? AND usado = 0 AND expira_en > NOW() ORDER BY id DESC LIMIT 1");
        $stmt->execute([$email, $token]);
    } else {
        $stmt = $db->prepare("SELECT * FROM password_resets WHERE LOWER(email) = ? AND codigo = ? AND usado = 0 AND expira_en > NOW() ORDER BY id DESC LIMIT 1");
        $stmt->execute([$email, $codigo]);
    }
    $reset = $stmt->fetch();
    
    if (!$reset) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "La sesión de recuperación ha vencido o el código es inválido. Solicita uno nuevo"]);
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
// VERIFICAR SESIÓN (ANTI-HIJACKING & TIMEOUT)
// ============================================
if ($action === 'verify') {
    if (session_status() === PHP_SESSION_NONE) session_start();
    
    if (isset($_SESSION['user_id'])) {
        $currentIp = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
        $currentAgent = $_SERVER['HTTP_USER_AGENT'] ?? 'Desconocido';
        
        // Detección de robo de sesión (Session Hijacking): cambio de IP o navegador
        if (($_SESSION['user_ip'] ?? '') !== $currentIp || ($_SESSION['user_agent'] ?? '') !== $currentAgent) {
            $_SESSION = [];
            if (ini_get("session.use_cookies")) {
                $params = session_get_cookie_params();
                setcookie(session_name(), '', time() - 42000, $params["path"], $params["domain"], $params["secure"], $params["httponly"]);
            }
            session_destroy();
            http_response_code(401);
            echo json_encode(["status" => "error", "message" => "Sesión invalidada por cambio de entorno", "logged_in" => false]);
            exit();
        }

        // Control de tiempo de inactividad (2 horas = 7200 segundos)
        if (time() - ($_SESSION['last_activity'] ?? time()) > 7200) {
            $_SESSION = [];
            session_destroy();
            http_response_code(401);
            echo json_encode(["status" => "error", "message" => "Sesión expirada por inactividad", "logged_in" => false]);
            exit();
        }

        $_SESSION['last_activity'] = time();
        echo json_encode(["status" => "success", "logged_in" => true, "rol" => $_SESSION['user_rol'] ?? '']);
        exit();
    } else {
        echo json_encode(["status" => "success", "logged_in" => false]);
        exit();
    }
}

// ============================================
// LOGOUT SEGURO
// ============================================
if ($action === 'logout' && $method === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    if (session_status() === PHP_SESSION_NONE) session_start();
    
    $uid = $data['usuario_id'] ?? ($_SESSION['user_id'] ?? null);
    if (!empty($uid)) {
        try {
            $stmt = $db->prepare("INSERT INTO log_actividad (usuario_id, accion, ip_address, user_agent) VALUES (?, 'LOGOUT', ?, ?)");
            $stmt->execute([$uid, $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1', $_SERVER['HTTP_USER_AGENT'] ?? '']);
        } catch(Exception $e) {}
    }
    
    $_SESSION = [];
    if (ini_get("session.use_cookies")) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $params["path"], $params["domain"], $params["secure"], $params["httponly"]);
    }
    session_destroy();
    
    echo json_encode(["status" => "success", "message" => "Sesión cerrada de forma segura"]);
    exit();
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
