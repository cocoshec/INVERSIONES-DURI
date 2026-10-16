<?php
// ============================================
// API: PRODUCTOS
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

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

switch ($method) {
    case 'GET':
        if (isset($_GET['eliminados']) || isset($_GET['papelera'])) {
            // Obtener productos eliminados (papelera de reciclaje)
            $stmt = $db->query("SELECT p.*, c.nombre as categoria_nombre FROM productos p LEFT JOIN categorias c ON p.categoria_id = c.id WHERE p.activo = 0 ORDER BY p.id DESC");
            $productos = $stmt->fetchAll();
            echo json_encode(["status" => "success", "data" => $productos]);
            break;
        }

        if (isset($_GET['id'])) {
            // Obtener un producto
            $stmt = $db->prepare("SELECT p.*, c.nombre as categoria_nombre FROM productos p JOIN categorias c ON p.categoria_id = c.id WHERE p.id = ?");
            $stmt->execute([$_GET['id']]);
            $producto = $stmt->fetch();
            if ($producto) {
                echo json_encode(["status" => "success", "data" => $producto]);
            } else {
                http_response_code(404);
                echo json_encode(["status" => "error", "message" => "Producto no encontrado"]);
            }
        } elseif (isset($_GET['categoria']) && $_GET['categoria'] !== 'all') {
            // Filtrar por ID o Nombre de categoría
            $cat = trim($_GET['categoria']);
            if (is_numeric($cat)) {
                $stmt = $db->prepare("SELECT p.*, c.nombre as categoria_nombre FROM productos p JOIN categorias c ON p.categoria_id = c.id WHERE p.categoria_id = ? AND p.activo = 1 ORDER BY p.nombre");
                $stmt->execute([$cat]);
            } else {
                $stmt = $db->prepare("SELECT p.*, c.nombre as categoria_nombre FROM productos p JOIN categorias c ON p.categoria_id = c.id WHERE c.nombre = ? AND p.activo = 1 ORDER BY p.nombre");
                $stmt->execute([$cat]);
            }
            $productos = $stmt->fetchAll();
            echo json_encode(["status" => "success", "data" => $productos]);
        } else {
            // Obtener todos los productos
            $stmt = $db->query("SELECT p.*, c.nombre as categoria_nombre FROM productos p JOIN categorias c ON p.categoria_id = c.id WHERE p.activo = 1 ORDER BY p.nombre");
            $productos = $stmt->fetchAll();
            echo json_encode(["status" => "success", "data" => $productos]);
        }
        break;

    case 'POST':
        $data = json_decode(file_get_contents("php://input"), true);

        // Restaurar productos de la papelera
        if (isset($_GET['restore']) || (isset($data['action']) && $data['action'] === 'restore')) {
            $restoreId = $_GET['restore'] ?? ($data['id'] ?? null);
            if ($restoreId === 'all' || !empty($data['all'])) {
                $db->query("UPDATE productos SET activo = 1 WHERE activo = 0");
                echo json_encode(["status" => "success", "message" => "Todos los productos han sido restaurados"]);
            } elseif ($restoreId) {
                $stmt = $db->prepare("UPDATE productos SET activo = 1 WHERE id = ?");
                $stmt->execute([$restoreId]);
                echo json_encode(["status" => "success", "message" => "Producto restaurado con éxito"]);
            } else {
                http_response_code(400);
                echo json_encode(["status" => "error", "message" => "ID no especificado"]);
            }
            break;
        }

        // Importación masiva (Bulk Import desde Excel o CSV)
        if (!empty($data['bulk']) && !empty($data['productos']) && is_array($data['productos'])) {
            $insertados = 0;
            $actualizados = 0;
            $db->beginTransaction();
            try {
                $stmtInsert = $db->prepare("INSERT INTO productos (codigo, nombre, descripcion, categoria_id, precio_venta, stock_actual, stock_minimo, imagen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                $stmtUpdate = $db->prepare("UPDATE productos SET nombre = ?, descripcion = ?, categoria_id = ?, precio_venta = ?, stock_actual = ?, stock_minimo = ?, imagen = IF(? != '', ?, imagen), activo = 1 WHERE codigo = ?");
                $stmtCheck = $db->prepare("SELECT id FROM productos WHERE codigo = ? LIMIT 1");

                foreach ($data['productos'] as $prod) {
                    if (empty($prod['nombre'])) continue;
                    $codigo = !empty($prod['codigo']) ? trim($prod['codigo']) : ('PRD-' . str_pad(rand(100, 99999), 5, '0', STR_PAD_LEFT));
                    $nombre = trim($prod['nombre']);
                    $desc = trim($prod['descripcion'] ?? '');
                    $catId = intval($prod['categoria_id'] ?? 1);
                    $precio = floatval($prod['precio_venta'] ?? 0);
                    $stock = intval($prod['stock_actual'] ?? 0);
                    $stockMin = intval($prod['stock_minimo'] ?? 10);
                    $imagen = trim($prod['imagen'] ?? '');

                    $stmtCheck->execute([$codigo]);
                    $exists = $stmtCheck->fetch();
                    if ($exists) {
                        $stmtUpdate->execute([$nombre, $desc, $catId, $precio, $stock, $stockMin, $imagen, $imagen, $codigo]);
                        $actualizados++;
                    } else {
                        $stmtInsert->execute([$codigo, $nombre, $desc, $catId, $precio, $stock, $stockMin, $imagen]);
                        $insertados++;
                    }
                }
                $db->commit();
                echo json_encode([
                    "status" => "success",
                    "message" => "Importación completada con éxito",
                    "insertados" => $insertados,
                    "actualizados" => $actualizados,
                    "total" => ($insertados + $actualizados)
                ]);
            } catch (\Exception $e) {
                if ($db->inTransaction()) {
                    $db->rollBack();
                }
                http_response_code(500);
                echo json_encode(["status" => "error", "message" => "Error al importar productos: " . $e->getMessage()]);
            }
            break;
        }

        if (empty($data['nombre']) || empty($data['precio_venta'])) {
            http_response_code(400);
            echo json_encode(["status" => "error", "message" => "Nombre y precio son requeridos"]);
            exit();
        }

        $codigo = !empty($data['codigo']) ? trim($data['codigo']) : ('PRD-' . str_pad(rand(100, 9999), 4, '0', STR_PAD_LEFT));

        $stmt = $db->prepare("INSERT INTO productos (codigo, nombre, descripcion, categoria_id, precio_venta, stock_actual, stock_minimo, imagen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $codigo,
            $data['nombre'],
            $data['descripcion'] ?? '',
            $data['categoria_id'] ?? 1,
            $data['precio_venta'],
            $data['stock_actual'] ?? 0,
            $data['stock_minimo'] ?? 10,
            $data['imagen'] ?? ''
        ]);

        $id = $db->lastInsertId();
        http_response_code(201);
        echo json_encode(["status" => "success", "message" => "Producto creado", "id" => $id, "codigo" => $codigo]);
        break;

    case 'PUT':
        $data = json_decode(file_get_contents("php://input"), true);
        $id = $_GET['id'] ?? null;

        if (!$id) {
            http_response_code(400);
            echo json_encode(["status" => "error", "message" => "ID requerido"]);
            exit();
        }

        if (isset($data['imagen'])) {
            $stmt = $db->prepare("UPDATE productos SET nombre = ?, descripcion = ?, categoria_id = ?, precio_venta = ?, stock_actual = ?, stock_minimo = ?, imagen = ? WHERE id = ?");
            $stmt->execute([
                $data['nombre'],
                $data['descripcion'] ?? '',
                $data['categoria_id'] ?? 1,
                $data['precio_venta'],
                $data['stock_actual'] ?? 0,
                $data['stock_minimo'] ?? 10,
                $data['imagen'],
                $id
            ]);
        } else {
            $stmt = $db->prepare("UPDATE productos SET nombre = ?, descripcion = ?, categoria_id = ?, precio_venta = ?, stock_actual = ?, stock_minimo = ? WHERE id = ?");
            $stmt->execute([
                $data['nombre'],
                $data['descripcion'] ?? '',
                $data['categoria_id'] ?? 1,
                $data['precio_venta'],
                $data['stock_actual'] ?? 0,
                $data['stock_minimo'] ?? 10,
                $id
            ]);
        }

        echo json_encode(["status" => "success", "message" => "Producto actualizado"]);
        break;

    case 'DELETE':
        $permanent = isset($_GET['permanent']) || isset($_GET['definitivo']);
        $vaciar = isset($_GET['vaciar']) || (isset($_GET['id']) && $_GET['id'] === 'all');

        if ($vaciar) {
            $stmt = $db->query("DELETE FROM productos WHERE activo = 0");
            echo json_encode(["status" => "success", "message" => "Papelera vaciada por completo de por vida"]);
            break;
        }

        $id = $_GET['id'] ?? null;
        if (!$id) {
            http_response_code(400);
            echo json_encode(["status" => "error", "message" => "ID requerido"]);
            exit();
        }

        if ($permanent) {
            // Eliminación física definitiva de la base de datos (de por vida)
            $stmt = $db->prepare("DELETE FROM productos WHERE id = ?");
            $stmt->execute([$id]);
            echo json_encode(["status" => "success", "message" => "Producto eliminado de por vida"]);
        } else {
            // Soft delete (papelera)
            $stmt = $db->prepare("UPDATE productos SET activo = 0 WHERE id = ?");
            $stmt->execute([$id]);
            echo json_encode(["status" => "success", "message" => "Producto movido a la papelera"]);
        }
        break;
}
?>
