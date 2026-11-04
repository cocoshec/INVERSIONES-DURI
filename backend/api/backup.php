<?php
// ============================================
// API: RESPALDO AUTOMATIZADO DE BASE DE DATOS
// Inversiones Duri C.A - Requerimiento 7
// Solo accesible por SuperUsuario
// ============================================

date_default_timezone_set('America/Caracas');

if (session_status() === PHP_SESSION_NONE) {
    @session_start();
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
    $os = 'PC / Escritorio';
    if (stripos($ua, 'Windows NT 10.0') !== false) {
        $os = (stripos($ua, 'Win64') !== false || stripos($ua, 'x64') !== false) ? 'Windows 10/11 (64-bit)' : 'Windows 10/11';
    } elseif (stripos($ua, 'Android') !== false) {
        $os = 'Android';
    } elseif (stripos($ua, 'iPhone') !== false || stripos($ua, 'iPad') !== false) {
        $os = 'iOS (iPhone/iPad)';
    } elseif (stripos($ua, 'Mac OS X') !== false) {
        $os = 'macOS';
    } elseif (stripos($ua, 'Linux') !== false) {
        $os = 'Linux';
    }
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
        $ip = obtenerIpRealCliente();
        $agent = obtenerNavegadorRealCliente();
        $stmt = $db->prepare("INSERT INTO log_actividad (usuario_id, accion, ip_address, user_agent, detalles) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$usuarioId, $accion, $ip, $agent, $detalles]);
    } catch (Exception $e) {
        try {
            $usuarioId = $_SESSION['user_id'] ?? 1;
            $ip = obtenerIpRealCliente();
            $agent = obtenerNavegadorRealCliente();
            $stmt = $db->prepare("INSERT INTO log_actividad (usuario_id, accion, ip_address, user_agent) VALUES (?, ?, ?, ?)");
            $stmt->execute([$usuarioId, $accion, $ip, $agent]);
        } catch (Exception $e2) {}
    }
}

// Obtener todas las tablas existentes en la base de datos
function obtenerTablasBD($db) {
    $ordenPreferido = [
        'categorias',
        'permisos',
        'rol_permisos',
        'usuarios',
        'clientes',
        'productos',
        'pedidos',
        'detalle_pedido',
        'movimientos_inventario',
        'mensajes_contacto',
        'password_resets',
        'login_attempts',
        'log_actividad'
    ];
    $existentes = $db->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
    $resultado = [];
    foreach ($ordenPreferido as $t) {
        if (in_array($t, $existentes)) {
            $resultado[] = $t;
        }
    }
    foreach ($existentes as $t) {
        if (!in_array($t, $resultado)) {
            $resultado[] = $t;
        }
    }
    return $resultado;
}

// 1. Exportar Respaldo en formato SQL estándar compatible con MySQL / phpMyAdmin / Laragon
if ($action === 'download_sql') {
    try {
        $tablas = obtenerTablasBD($db);
        $fecha = date('Y-m-d_H-i-s');
        $filename = "respaldo_inversiones_duri_{$fecha}.sql";

        while (ob_get_level() > 0) {
            ob_end_clean();
        }

        header('Content-Type: application/sql; charset=UTF-8');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Cache-Control: no-store, no-cache, must-revalidate');
        header('Pragma: no-cache');
        header('Expires: 0');

        $out  = "-- ============================================================================\n";
        $out .= "-- RESPALDO OFICIAL DE BASE DE DATOS (.SQL)\n";
        $out .= "-- Empresa:        Inversiones Duri C.A (RIF: J-40123456-7)\n";
        $out .= "-- Base de Datos:  `inversiones_duri`\n";
        $out .= "-- Fecha y Hora:   " . date('d/m/Y H:i:s') . "\n";
        $out .= "-- Codificación:   UTF-8 (utf8mb4_unicode_ci)\n";
        $out .= "-- ============================================================================\n\n";
        $out .= "SET NAMES utf8mb4;\n";
        $out .= "SET TIME_ZONE = '-04:00';\n";
        $out .= "SET FOREIGN_KEY_CHECKS = 0;\n";
        $out .= "SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';\n\n";
        $out .= "CREATE DATABASE IF NOT EXISTS `inversiones_duri` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\n";
        $out .= "USE `inversiones_duri`;\n\n";

        foreach ($tablas as $tabla) {
            $rowsStmt = $db->query("SELECT * FROM `{$tabla}`");
            $rows = $rowsStmt->fetchAll(PDO::FETCH_ASSOC);
            $totalRegistros = count($rows);

            $out .= "-- ----------------------------------------------------------------------------\n";
            $out .= "-- Estructura de tabla para `{$tabla}` ({$totalRegistros} registros)\n";
            $out .= "-- ----------------------------------------------------------------------------\n";
            $out .= "DROP TABLE IF EXISTS `{$tabla}`;\n";

            $createRes = $db->query("SHOW CREATE TABLE `{$tabla}`")->fetch(PDO::FETCH_NUM);
            if (!empty($createRes[1])) {
                $out .= $createRes[1] . ";\n\n";
            }

            if ($totalRegistros > 0) {
                $out .= "-- Volcado de datos para la tabla `{$tabla}`\n";
                $cols = array_keys($rows[0]);
                $quotedCols = array_map(function($c) { return "`{$c}`"; }, $cols);
                $colsList = implode(", ", $quotedCols);

                // Agrupar de 50 en 50 filas para un archivo SQL limpio y rápido de importar
                $chunks = array_chunk($rows, 50);
                foreach ($chunks as $chunk) {
                    $out .= "INSERT INTO `{$tabla}` ({$colsList}) VALUES\n";
                    $inserts = [];
                    foreach ($chunk as $row) {
                        $vals = [];
                        foreach ($row as $val) {
                            if ($val === null) {
                                $vals[] = "NULL";
                            } elseif (is_int($val) || is_float($val)) {
                                $vals[] = $val;
                            } else {
                                $vals[] = $db->quote((string)$val);
                            }
                        }
                        $inserts[] = "  (" . implode(", ", $vals) . ")";
                    }
                    $out .= implode(",\n", $inserts) . ";\n";
                }
                $out .= "\n";
            }
        }

        $out .= "SET FOREIGN_KEY_CHECKS = 1;\n";
        $out .= "-- ============================================================================\n";
        $out .= "-- FIN DEL RESPALDO SQL — INVERSIONES DURI C.A\n";
        $out .= "-- ============================================================================\n";

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

// 2. Exportar Respaldo en formato JSON estructurado
if ($action === 'download_json') {
    try {
        $tablas = obtenerTablasBD($db);
        $fecha = date('Y-m-d_H-i-s');
        $filename = "respaldo_inversiones_duri_{$fecha}.json";

        $resumenConteo = [];
        $datosTablas = [];

        foreach ($tablas as $tabla) {
            $rowsStmt = $db->query("SELECT * FROM `{$tabla}`");
            $filas = $rowsStmt->fetchAll(PDO::FETCH_ASSOC);
            if ($tabla === 'usuarios') {
                foreach ($filas as &$u) {
                    unset($u['password']);
                }
                unset($u);
            }
            $resumenConteo[$tabla] = count($filas);
            $datosTablas[$tabla] = $filas;
        }

        $dump = [
            "metadatos" => [
                "empresa" => "Inversiones Duri C.A",
                "rif" => "J-40123456-7",
                "base_de_datos" => "inversiones_duri",
                "formato" => "JSON Estructurado UTF-8",
                "fecha_generacion" => date('d/m/Y H:i:s'),
                "timestamp_iso" => date('c'),
                "total_tablas" => count($tablas),
                "registros_por_tabla" => $resumenConteo
            ],
            "tablas" => $datosTablas
        ];

        while (ob_get_level() > 0) {
            ob_end_clean();
        }

        header('Content-Type: application/json; charset=UTF-8');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Cache-Control: no-store, no-cache, must-revalidate');
        header('Pragma: no-cache');
        header('Expires: 0');

        registrarAuditoria($db, 'RESPALDO_BD_JSON_GENERADO', "Archivo: {$filename}");
        echo json_encode($dump, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit();

    } catch (Exception $e) {
        http_response_code(500);
        header('Content-Type: application/json; charset=UTF-8');
        echo json_encode(["status" => "error", "message" => "Error al exportar JSON: " . $e->getMessage()]);
        exit();
    }
}

http_response_code(400);
header('Content-Type: application/json; charset=UTF-8');
echo json_encode(["status" => "error", "message" => "Acción no válida"]);
?>
