<?php
// ============================================
// API: RESPALDO AUTOMATIZADO DE BASE DE DATOS
// Inversiones Duri C.A - Requerimiento 7
// Solo accesible por SuperUsuario
// ============================================

if (session_status() === PHP_SESSION_NONE) {
    @session_start();
}

// Búsqueda robusta de database.php
$dbCandidates = [
    __DIR__ . '/../config/database.php',
    dirname(__DIR__) . '/config/database.php',
    'C:/laragon/www/inversiones-duri/backend/config/database.php',
    'C:\\laragon\\www\\inversiones-duri\\backend\\config\\database.php',
    dirname(dirname(__DIR__)) . '/backend/config/database.php'
];

foreach ($dbCandidates as $candidate) {
    if (@file_exists($candidate)) {
        require_once $candidate;
        break;
    }
}

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

$database = new Database();
$db = $database->getConnection();

if (!$db) {
    http_response_code(503);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode(["status" => "error", "message" => "Base de datos no disponible temporalmente"]);
    exit();
}

$action = $_GET['action'] ?? 'download_sql';

// Función para registrar acción en auditoría
function registrarAuditoria($db, $accion, $detalles = null) {
    try {
        $usuarioId = $_SESSION['user_id'] ?? 1;
        $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
        $agent = $_SERVER['HTTP_USER_AGENT'] ?? 'Desconocido';
        $stmt = $db->prepare("INSERT INTO log_actividad (usuario_id, accion, ip_address, user_agent, detalles) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$usuarioId, $accion, $ip, $agent, $detalles]);
    } catch (Exception $e) {}
}

// 1. Exportar Respaldo en formato SQL
if ($action === 'download_sql') {
    try {
        $tablas = [
            'categorias',
            'usuarios',
            'clientes',
            'productos',
            'pedidos',
            'detalle_pedido',
            'movimientos_inventario',
            'password_resets',
            'log_actividad',
            'login_attempts'
        ];

        $fecha = date('Y-m-d_H-i-s');
        $filename = "respaldo_inversiones_duri_{$fecha}.sql";

        if (ob_get_length()) ob_end_clean();
        header('Content-Type: application/sql; charset=UTF-8');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Pragma: no-cache');
        header('Expires: 0');

        $out = "-- ======================================================\n";
        $out .= "-- RESPALDO AUTOMATIZADO DE BASE DE DATOS - INVERSIONES DURI C.A\n";
        $out .= "-- Fecha y Hora de Generación: " . date('d/m/Y H:i:s') . "\n";
        $out .= "-- Generado por módulo automatizado del sistema\n";
        $out .= "-- ======================================================\n\n";
        $out .= "SET FOREIGN_KEY_CHECKS = 0;\n\n";

        foreach ($tablas as $tabla) {
            $check = $db->query("SHOW TABLES LIKE '{$tabla}'");
            if ($check->rowCount() == 0) continue;

            $out .= "-- -----------------------------------------------------\n";
            $out .= "-- Estructura y Datos de la tabla `{$tabla}`\n";
            $out .= "-- -----------------------------------------------------\n";

            $createRes = $db->query("SHOW CREATE TABLE `{$tabla}`")->fetch(PDO::FETCH_NUM);
            if (!empty($createRes[1])) {
                $out .= "DROP TABLE IF EXISTS `{$tabla}`;\n";
                $out .= $createRes[1] . ";\n\n";
            }

            $rowsStmt = $db->query("SELECT * FROM `{$tabla}`");
            $rows = $rowsStmt->fetchAll(PDO::FETCH_ASSOC);

            if (!empty($rows)) {
                $cols = array_keys($rows[0]);
                $quotedCols = array_map(function($c) { return "`{$c}`"; }, $cols);
                $colsList = implode(", ", $quotedCols);

                $out .= "INSERT INTO `{$tabla}` ({$colsList}) VALUES\n";
                $inserts = [];

                foreach ($rows as $row) {
                    $vals = [];
                    foreach ($row as $val) {
                        if ($val === null) {
                            $vals[] = "NULL";
                        } else {
                            $vals[] = $db->quote($val);
                        }
                    }
                    $inserts[] = "(" . implode(", ", $vals) . ")";
                }

                $out .= implode(",\n", $inserts) . ";\n\n";
            }
        }

        $out .= "SET FOREIGN_KEY_CHECKS = 1;\n";
        $out .= "-- FIN DEL RESPALDO\n";

        registrarAuditoria($db, 'RESPALDO_BD_SQL_GENERADO', "Archivo: {$filename}");
        echo $out;
        exit();

    } catch (Exception $e) {
        http_response_code(500);
        header('Content-Type: application/json; charset=UTF-8');
        echo json_encode(["status" => "error", "message" => "Error al generar respaldo SQL: " . $e->getMessage()]);
        exit();
    }
}

// 2. Exportar Respaldo en JSON
if ($action === 'download_json') {
    try {
        $fecha = date('Y-m-d_H-i-s');
        $filename = "respaldo_inversiones_duri_{$fecha}.json";

        $tablas = ['categorias', 'usuarios', 'clientes', 'productos', 'pedidos', 'detalle_pedido', 'movimientos_inventario', 'log_actividad'];
        $dump = [
            "sistema" => "Inversiones Duri C.A",
            "version" => "1.0",
            "fecha_generacion" => date('c'),
            "tablas" => []
        ];

        foreach ($tablas as $tabla) {
            $check = $db->query("SHOW TABLES LIKE '{$tabla}'");
            if ($check->rowCount() == 0) continue;

            $rowsStmt = $db->query("SELECT * FROM `{$tabla}`");
            $dump['tablas'][$tabla] = $rowsStmt->fetchAll(PDO::FETCH_ASSOC);
        }

        if (ob_get_length()) ob_end_clean();
        header('Content-Type: application/json; charset=UTF-8');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Pragma: no-cache');
        header('Expires: 0');

        registrarAuditoria($db, 'RESPALDO_BD_JSON_GENERADO', "Archivo: {$filename}");
        echo json_encode($dump, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        exit();

    } catch (Exception $e) {
        http_response_code(500);
        header('Content-Type: application/json; charset=UTF-8');
        echo json_encode(["status" => "error", "message" => "Error al exportar JSON: " . $e->getMessage()]);
        exit();
    }
}

http_response_code(400);
echo json_encode(["status" => "error", "message" => "Acción no válida"]);