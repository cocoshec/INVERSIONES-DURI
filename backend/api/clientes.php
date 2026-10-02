<?php
// ============================================
// API: CLIENTES
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

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        if (isset($_GET['id'])) {
            $stmt = $db->prepare("SELECT * FROM clientes WHERE id = ?");
            $stmt->execute([$_GET['id']]);
            $cliente = $stmt->fetch();
            if ($cliente) {
                echo json_encode(["status" => "success", "data" => $cliente]);
            } else {
                http_response_code(404);
                echo json_encode(["status" => "error", "message" => "Cliente no encontrado"]);
            }
        } else {
            $stmt = $db->query("SELECT * FROM clientes WHERE activo = 1 ORDER BY nombre");
            $clientes = $stmt->fetchAll();
            echo json_encode(["status" => "success", "data" => $clientes]);
        }
        break;

    case 'POST':
        $data = json_decode(file_get_contents("php://input"), true);

        if (empty($data['nombre'])) {
            http_response_code(400);
            echo json_encode(["status" => "error", "message" => "Nombre es requerido"]);
            exit();
        }

        $ci_rif = trim($data['ci_rif'] ?? '');

        // Si ya existe un cliente con esa cédula/RIF, reutilizamos su registro
        if (!empty($ci_rif)) {
            $stmtExist = $db->prepare("SELECT id FROM clientes WHERE ci_rif = ?");
            $stmtExist->execute([$ci_rif]);
            $exist = $stmtExist->fetch();
            if ($exist) {
                // Actualizar datos de contacto si cambiaron
                $stmtUp = $db->prepare("UPDATE clientes SET nombre = ?, telefono = ?, direccion = COALESCE(NULLIF(?, ''), direccion) WHERE id = ?");
                $stmtUp->execute([$data['nombre'], $data['telefono'] ?? '', $data['direccion'] ?? '', $exist['id']]);
                echo json_encode(["status" => "success", "message" => "Cliente existente recuperado", "id" => $exist['id']]);
                exit();
            }
        }

        $stmt = $db->prepare("INSERT INTO clientes (nombre, email, telefono, direccion, ci_rif, tipo_cliente) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $data['nombre'],
            $data['email'] ?? '',
            $data['telefono'] ?? '',
            $data['direccion'] ?? '',
            $ci_rif,
            $data['tipo_cliente'] ?? 'regular'
        ]);

        $id = $db->lastInsertId();
        http_response_code(201);
        echo json_encode(["status" => "success", "message" => "Cliente creado", "id" => $id]);
        break;

    case 'PUT':
        $data = json_decode(file_get_contents("php://input"), true);
        $id = $_GET['id'] ?? null;

        if (!$id) {
            http_response_code(400);
            echo json_encode(["status" => "error", "message" => "ID requerido"]);
            exit();
        }

        $stmt = $db->prepare("UPDATE clientes SET nombre = ?, email = ?, telefono = ?, direccion = ?, ci_rif = ?, tipo_cliente = ? WHERE id = ?");
        $stmt->execute([
            $data['nombre'],
            $data['email'] ?? '',
            $data['telefono'] ?? '',
            $data['direccion'] ?? '',
            $data['ci_rif'] ?? '',
            $data['tipo_cliente'] ?? 'regular',
            $id
        ]);

        echo json_encode(["status" => "success", "message" => "Cliente actualizado"]);
        break;

    case 'DELETE':
        $id = $_GET['id'] ?? null;
        if (!$id) {
            http_response_code(400);
            echo json_encode(["status" => "error", "message" => "ID requerido"]);
            exit();
        }

        $stmt = $db->prepare("UPDATE clientes SET activo = 0 WHERE id = ?");
        $stmt->execute([$id]);

        echo json_encode(["status" => "success", "message" => "Cliente eliminado"]);
        break;
}
?>
