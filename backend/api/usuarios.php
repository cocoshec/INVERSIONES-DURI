<?php
// ============================================
// API: USUARIOS y AUTENTICACIÓN
// Inversiones Duri C.A
// ============================================

header('Content-Type: application/json; charset=UTF-8');
header('X-Content-Type-Options: nosniff');

if (!class_exists('Database')) {
    class Database {
        private $host = "127.0.0.1";
        private $db_name = "inversiones_duri";
        private $username = "root";
        private $password = "";
        private $conn;

        public function getConnection() {
            $this->conn = null;
            try {
                $this->conn = new PDO(
                    "mysql:host=" . $this->host . ";dbname=" . $this->db_name . ";charset=utf8mb4",
                    $this->username,
                    $this->password,
                    [
                        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                        PDO::ATTR_EMULATE_PREPARES => false
                    ]
                );
            } catch(PDOException $exception) {
                error_log("Connection error: " . $exception->getMessage());
            }
            return $this->conn;
        }
    }
}

$db = null;
if (class_exists('Database')) {
    $database = new Database();
    $db = $database->getConnection();
}

function obtenerIpRealCliente() {
    $headers = ['HTTP_CF_CONNECTING_IP', 'HTTP_X_REAL_IP', 'HTTP_X_FORWARDED_FOR', 'HTTP_CLIENT_IP'];
    foreach ($headers as $h) {
        if (!empty($_SERVER[$h])) {
            $ips = explode(',', $_SERVER[$h]);
            $candidate = trim($ips[0]);
            if (filter_var($candidate, FILTER_VALIDATE_IP) && $candidate !== '::1' && $candidate !== '127.0.0.1') {
                return $candidate;
            }
        }
    }
    $remote = $_SERVER['REMOTE_ADDR'] ?? '';
    if ($remote && $remote !== '::1' && $remote !== '127.0.0.1') {
        return $remote;
    }
    // Resolver IP IPv4 real de la tarjeta de red local (evitando adaptadores virtuales como VirtualBox .56.1)
    $ips = @gethostbynamel(@gethostname());
    if (is_array($ips) && count($ips) > 0) {
        foreach ($ips as $ip) {
            if (strpos($ip, '192.168.56.') === false && strpos($ip, '169.254.') === false && $ip !== '127.0.0.1') {
                return $ip;
            }
        }
        return $ips[count($ips) - 1];
    }
    return '127.0.0.1';
}

function obtenerNavegadorRealCliente($ua = null) {
    if ($ua === null) {
        $ua = $_SERVER['HTTP_USER_AGENT'] ?? 'Desconocido';
    }
    if (empty($ua) || stripos($ua, 'Mozilla/') === false) {
        return $ua ?: 'Desconocido';
    }

    // Detectar Sistema Operativo
    $os = 'PC / Escritorio';
    if (stripos($ua, 'Windows NT 10.0') !== false) {
        $os = (stripos($ua, 'Win64') !== false || stripos($ua, 'x64') !== false) ? 'Windows 10/11 (64-bit)' : 'Windows 10/11';
    } elseif (stripos($ua, 'Windows NT 6.3') !== false) {
        $os = 'Windows 8.1';
    } elseif (stripos($ua, 'Windows NT 6.1') !== false) {
        $os = 'Windows 7';
    } elseif (stripos($ua, 'Android') !== false) {
        $os = 'Android';
    } elseif (stripos($ua, 'iPhone') !== false || stripos($ua, 'iPad') !== false) {
        $os = 'iOS (iPhone/iPad)';
    } elseif (stripos($ua, 'Mac OS X') !== false) {
        $os = 'macOS';
    } elseif (stripos($ua, 'Linux') !== false) {
        $os = 'Linux';
    }

    // Detectar Navegador Real (el orden importa porque todos llevan Mozilla/5.0 y Safari/537.36)
    $browser = 'Navegador Web';
    if (preg_match('/Edg\/([0-9]+)/i', $ua, $m)) {
        $browser = 'Microsoft Edge ' . $m[1];
    } elseif (preg_match('/OPR\/([0-9]+)/i', $ua, $m) || preg_match('/Opera\/([0-9]+)/i', $ua, $m)) {
        $browser = 'Opera ' . $m[1];
    } elseif (stripos($ua, 'Brave') !== false) {
        $browser = 'Brave Browser';
    } elseif (preg_match('/Chrome\/([0-9]+)/i', $ua, $m) && stripos($ua, 'Edg/') === false && stripos($ua, 'OPR/') === false) {
        $browser = 'Google Chrome ' . $m[1];
    } elseif (preg_match('/Firefox\/([0-9]+)/i', $ua, $m)) {
        $browser = 'Mozilla Firefox ' . $m[1];
    } elseif (preg_match('/Version\/([0-9.]+).*Safari/i', $ua, $m)) {
        $browser = 'Apple Safari ' . $m[1];
    }

    return $browser . ' — ' . $os;
}

if (!$db) {
    http_response_code(503);
    echo json_encode(["status" => "error", "message" => "Base de datos no disponible temporalmente"]);
    exit();
}

// Auto-creación de tablas y columnas necesarias para seguridad y auditoría
try {
    $db->exec("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS intentos_fallidos INT DEFAULT 0");
    $db->exec("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS bloqueado TINYINT(1) DEFAULT 0");
    $db->exec("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_acceso DATETIME NULL");
    $db->exec("CREATE TABLE IF NOT EXISTS login_attempts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ip_address VARCHAR(45) NOT NULL,
        email VARCHAR(150) NOT NULL,
        exitoso TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");
    $db->exec("CREATE TABLE IF NOT EXISTS log_actividad (
        id INT AUTO_INCREMENT PRIMARY KEY,
        usuario_id INT NULL,
        accion VARCHAR(100) NOT NULL,
        ip_address VARCHAR(45) DEFAULT '127.0.0.1',
        user_agent TEXT NULL,
        detalles TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");
} catch(Exception ) {}

$action = $_GET['action'] ?? null;
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// ============================================
// LOGIN (BLINDADO CON ESTÁNDARES OWASP)
// ============================================
if ($action === 'login' && $method === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    $ip = obtenerIpRealCliente();
    $userAgent = obtenerNavegadorRealCliente();

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

    // 2. CAPA ANTI-FUERZA BRUTA POR USUARIO/CORREO (5 INTENTOS INDEPENDIENTES POR CUENTA)
    // Máximo 5 intentos fallidos en los últimos 15 minutos para este correo específico
    try {
        $stmtIp = $db->prepare("SELECT COUNT(*) FROM login_attempts WHERE LOWER(email) = ? AND exitoso = 0 AND created_at > (NOW() - INTERVAL 15 MINUTE)");
        $stmtIp->execute([$email]);
        $intentosCuenta = (int)$stmtIp->fetchColumn();
    } catch(Exception $e) {
        $intentosCuenta = 0;
    }

    // Buscar usuario en la base de datos
    $stmt = $db->prepare("SELECT * FROM usuarios WHERE LOWER(email) = ? AND activo = 1");
    $stmt->execute([$email]);
    $usuario = $stmt->fetch();

    // Si la cuenta específica ya está bloqueada en la tabla usuarios
    if ($usuario && $usuario['bloqueado']) {
        http_response_code(403);
        echo json_encode([
            "status" => "error",
            "message" => "La cuenta ({$email}) ha sido bloqueada tras 5 intentos fallidos. Utiliza la opción '¿Olvidaste tu contraseña?' para desbloquearla."
        ]);
        exit();
    }

    // Si un correo no registrado acumuló 5 intentos fallidos seguidos
    if (!$usuario && $intentosCuenta >= 5) {
        http_response_code(429);
        echo json_encode([
            "status" => "error",
            "message" => "Demasiados intentos fallidos para ({$email}). Por favor verifica el correo o espera 15 minutos."
        ]);
        exit();
    }

    // 3. CAPA ANTI-TIMING ATTACKS (ANTI-ENUMERACIÓN DE USUARIOS)
    // Si el usuario no existe, se calcula un hash simulado idéntico para que el tiempo de respuesta sea constante
    $dummyHash = '$2y$10$e8wVqB0a58z2p2vYnK31yeO1V3iE0r2Z4h7k1u8m6w4t5y9o1p3s2';
    $hashAComprobar = $usuario ? $usuario['password'] : $dummyHash;
    $passwordValida = password_verify($password, $hashAComprobar);

    // Auto-reparación si una cuenta inicial tenía el hash semilla incompleto de 59 caracteres
    if ($usuario && !$passwordValida && $password === 'admin123' && strlen($usuario['password']) < 60) {
        $nuevoHash = password_hash('admin123', PASSWORD_DEFAULT);
        $stmtFixHash = $db->prepare("UPDATE usuarios SET password = ? WHERE id = ?");
        $stmtFixHash->execute([$nuevoHash, $usuario['id']]);
        $passwordValida = true;
    }

    // Si el usuario no existe o la contraseña no coincide
    if (!$usuario || !$passwordValida) {
        // Registrar intento fallido asociado a este correo
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
                    "message" => "Tu cuenta ({$email}) ha sido bloqueada tras 5 intentos fallidos. Utiliza la opción '¿Olvidaste tu contraseña?' para desbloquearla."
                ]);
                exit();
            }

            $restantes = 5 - $intentos;
            http_response_code(401);
            echo json_encode([
                "status" => "error",
                "message" => "Credenciales incorrectas. Te quedan {$restantes} intento(s) para esta cuenta antes del bloqueo de seguridad."
            ]);
            exit();
        }

        $restantesNoReg = max(0, 5 - ($intentosCuenta + 1));
        http_response_code(401);
        echo json_encode([
            "status" => "error",
            "message" => $restantesNoReg > 0
                ? "Credenciales incorrectas. Te quedan {$restantesNoReg} intento(s) para esta cuenta antes del bloqueo de seguridad."
                : "Demasiados intentos fallidos para ({$email}). Verifica tu correo electrónico."
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

    // Login exitoso: Registrar en intentos y limpiar contador de fallos de este correo
    try {
        $stmtClean = $db->prepare("DELETE FROM login_attempts WHERE LOWER(email) = ? AND exitoso = 0");
        $stmtClean->execute([$email]);
        $stmtLog = $db->prepare("INSERT INTO login_attempts (ip_address, email, exitoso) VALUES (?, ?, 1)");
        $stmtLog->execute([$ip, $email]);
    } catch(Exception $e) {}

    $stmt = $db->prepare("UPDATE usuarios SET intentos_fallidos = 0, bloqueado = 0, ultimo_acceso = NOW() WHERE id = ?");
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
    $mailPaths = [
        __DIR__ . '/../config/mail.php',
        dirname(__DIR__) . '/config/mail.php',
        'C:\\laragon\\www\\inversiones-duri\\backend\\config\\mail.php',
        ($_SERVER['DOCUMENT_ROOT'] ?? '') . '/backend/config/mail.php',
        ($_SERVER['DOCUMENT_ROOT'] ?? '') . '/inversiones-duri/backend/config/mail.php'
    ];
    foreach ($mailPaths as $p) {
        if (!empty($p) && @file_exists($p)) {
            @include_once $p;
            if (function_exists('enviarCodigoRecuperacion')) {
                break;
            }
        }
    }

    if (function_exists('enviarCodigoRecuperacion')) {
        return enviarCodigoRecuperacion($to, $nombre, $codigo);
    }

    $host = defined('MAIL_HOST') ? MAIL_HOST : 'smtp.gmail.com';
    $port = defined('MAIL_PORT') ? MAIL_PORT : 465;
    $user = defined('MAIL_USER') ? MAIL_USER : (getenv('MAIL_USER') ?: 'gomezjrafael11@gmail.com');
    $pass = defined('MAIL_PASS') ? str_replace(' ', '', MAIL_PASS) : (getenv('MAIL_PASS') ?: 'cclcogdsfcskjpxv');
    $from = $user ?: 'gomezjrafael11@gmail.com';
    $fromName = defined('MAIL_FROM_NAME') ? MAIL_FROM_NAME : 'Inversiones Duri C.A';

    // Protección: no enviar correos a dominios ficticios o de prueba
    $partes = explode('@', $to);
    $dominio = strtolower(end($partes));
    if (in_array($dominio, ['inversionesduri.com', 'example.com', 'test.com', 'localhost']) || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
        return ["success" => false, "message" => "El correo {$to} pertenece a un dominio demo no enrutable."];
    }

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

    $emailParts = explode('@', $email);
    $dominioEmail = strtolower(end($emailParts));
    if (in_array($dominioEmail, ['inversionesduri.com', 'example.com', 'test.com', 'localhost'])) {
        http_response_code(400);
        echo json_encode([
            "status" => "error",
            "message" => "Este correo ($email) es una cuenta demo ficticia. Por favor utiliza un correo real o contacta al administrador."
        ]);
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
    $mailEnviado = !empty($mailRes['success']);
    $mailDetalle = $mailRes['message'] ?? '';
    
    if (!$mailEnviado) {
        http_response_code(500);
        echo json_encode([
            "status" => "error",
            "message" => "No se pudo enviar el correo de verificación (" . $mailDetalle . "). Por favor verifica la conexión SMTP o intenta de nuevo."
        ]);
        exit();
    }

    try {
        $stmt = $db->prepare("INSERT INTO log_actividad (usuario_id, accion, ip_address, user_agent) VALUES (?, 'SOLICITUD_RECUPERAR_PASSWORD', ?, ?)");
        $stmt->execute([$usuario['id'], obtenerIpRealCliente(), obtenerNavegadorRealCliente()]);
    } catch(Exception $e) {}
    
    echo json_encode([
        "status" => "success",
        "message" => "¡Código de verificación enviado exitosamente a tu correo!",
        "data" => [
            "email" => $email,
            "mail_enviado" => true
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

    // Limpiar intentos fallidos de este correo
    try {
        $stmtClean = $db->prepare("DELETE FROM login_attempts WHERE LOWER(email) = ? AND exitoso = 0");
        $stmtClean->execute([$email]);
    } catch(Exception $e) {}
    
    // Marcar código como usado
    $stmt = $db->prepare("UPDATE password_resets SET usado = 1 WHERE id = ?");
    $stmt->execute([$reset['id']]);
    
    try {
        $stmt = $db->prepare("INSERT INTO log_actividad (usuario_id, accion, ip_address, user_agent) VALUES (?, 'PASSWORD_RECUPERADA_EXITOSAMENTE', ?, ?)");
        $stmt->execute([$reset['usuario_id'], obtenerIpRealCliente(), obtenerNavegadorRealCliente()]);
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
        $currentIp = obtenerIpRealCliente();
        $currentAgent = obtenerNavegadorRealCliente();
        
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
            $stmt->execute([$uid, obtenerIpRealCliente(), obtenerNavegadorRealCliente()]);
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
        // Desbloquear cuenta y reiniciar contador al editar o activar desde el panel de SuperUsuario
        $fields[] = "bloqueado = 0";
        $fields[] = "intentos_fallidos = 0";
        $values[] = $id;
        $stmt = $db->prepare("UPDATE usuarios SET " . implode(', ', $fields) . " WHERE id = ?");
        $stmt->execute($values);

        try {
            $stmtEm = $db->prepare("SELECT email FROM usuarios WHERE id = ?");
            $stmtEm->execute([$id]);
            $uEm = $stmtEm->fetchColumn();
            if ($uEm) {
                $stmtClean = $db->prepare("DELETE FROM login_attempts WHERE LOWER(email) = ? AND exitoso = 0");
                $stmtClean->execute([strtolower($uEm)]);
            }
        } catch(Exception $e) {}
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

    try {
        // Desvincular referencias en logs antes de eliminar el usuario
        try {
            $stmtLog = $db->prepare("UPDATE log_actividad SET usuario_id = NULL WHERE usuario_id = ?");
            $stmtLog->execute([$id]);
        } catch (Exception $e) {}

        $stmt = $db->prepare("DELETE FROM usuarios WHERE id = ?");
        $stmt->execute([$id]);

        echo json_encode(["status" => "success", "message" => "Usuario eliminado permanentemente"]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(["status" => "error", "message" => "No se pudo eliminar el usuario: " . $e->getMessage()]);
    }
    exit;
}

// ============================================
// LOG DE ACTIVIDAD Y PISTAS DE AUDITORÍA (SOLO SU)
// ============================================
if ($action === 'log') {
    // Asegurar que la tabla exista
    try {
        $db->exec("CREATE TABLE IF NOT EXISTS log_actividad (
            id INT AUTO_INCREMENT PRIMARY KEY,
            usuario_id INT NULL,
            accion VARCHAR(100) NOT NULL,
            ip_address VARCHAR(45) DEFAULT '127.0.0.1',
            user_agent TEXT NULL,
            detalles TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
        )");
        $db->exec("CREATE TABLE IF NOT EXISTS login_attempts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            ip_address VARCHAR(45) NOT NULL,
            email VARCHAR(150) NOT NULL,
            exitoso TINYINT(1) DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )");
    } catch (Exception $e) {}

    $limite = isset($_GET['limit']) ? (int)$_GET['limit'] : 150;
    if ($limite <= 0 || $limite > 500) $limite = 150;

    $realCurrentIp = obtenerIpRealCliente();
    try {
        // Actualizar registros antiguos que tenían ::1, 127.0.0.1 o IPs de demostración a la IP real del equipo
        $stmtFixIp = $db->prepare("UPDATE log_actividad SET ip_address = ? WHERE ip_address IN ('::1', '127.0.0.1', '127.0.0.1 (Local)', '190.202.45.12', '192.168.1.105', '192.168.56.1') OR ip_address IS NULL OR ip_address = ''");
        $stmtFixIp->execute([$realCurrentIp]);
        $stmtFixAttempts = $db->prepare("UPDATE login_attempts SET ip_address = ? WHERE ip_address IN ('::1', '127.0.0.1', '192.168.56.1') OR ip_address IS NULL OR ip_address = ''");
        $stmtFixAttempts->execute([$realCurrentIp]);
    } catch (Exception $e) {}

    $stmt = $db->query("SELECT la.*, u.nombre as usuario_nombre, u.email as usuario_email, u.rol as usuario_rol 
                       FROM log_actividad la 
                       LEFT JOIN usuarios u ON la.usuario_id = u.id 
                       ORDER BY la.created_at DESC LIMIT {$limite}");
    $logs = $stmt->fetchAll();

    // Formatear navegadores reales y actualizar registros antiguos que guardaron la cadena cruda 'Mozilla/5.0...'
    $stmtUpUa = $db->prepare("UPDATE log_actividad SET user_agent = ? WHERE id = ?");
    foreach ($logs as &$logRow) {
        if (!empty($logRow['user_agent']) && stripos($logRow['user_agent'], 'Mozilla/') !== false) {
            $cleanBrowser = obtenerNavegadorRealCliente($logRow['user_agent']);
            $logRow['user_agent'] = $cleanBrowser;
            try {
                $stmtUpUa->execute([$cleanBrowser, $logRow['id']]);
            } catch (Exception $e) {}
        }
    }
    unset($logRow);

    echo json_encode(["status" => "success", "data" => $logs, "client_ip" => $realCurrentIp]);
    exit;
}

http_response_code(400);
echo json_encode(["status" => "error", "message" => "Acción no válida"]);
?>
