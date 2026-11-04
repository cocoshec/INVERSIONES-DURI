<?php
// ============================================
// API: PEDIDOS
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

// Funciones de correo integradas directamente (Apache no puede leer backend/config/ desde OneDrive)
if (!function_exists('enviarFacturaClienteEmail')) {
// ============================================
// CONFIGURACIÓN DE ENVÍO DE CORREOS (GMAIL SMTP)
// Inversiones Duri C.A
// ============================================

if (!defined('MAIL_HOST')) define('MAIL_HOST', 'smtp.gmail.com');
if (!defined('MAIL_PORT')) define('MAIL_PORT', 465); // SSL Port 465
if (!defined('MAIL_USER')) define('MAIL_USER', 'gomezjrafael11@gmail.com');
if (!defined('MAIL_PASS')) define('MAIL_PASS', 'cclc ogds fcsk jpxv'); // Contraseña de aplicación de Google
if (!defined('MAIL_FROM_NAME')) define('MAIL_FROM_NAME', 'Inversiones Duri C.A');

/**
 * Envío de correos por socket seguro SSL a Gmail
 */
function enviarCorreoGmailSmtp($to, $subject, $htmlBody, $altBody = '', $attachmentData = null, $attachmentName = '') {
    $host = MAIL_HOST;
    $port = MAIL_PORT;
    $user = MAIL_USER;
    $pass = str_replace(' ', '', MAIL_PASS);
    $from = MAIL_USER;
    $fromName = MAIL_FROM_NAME;

    // Protección: no enviar correos a dominios ficticios o de demostración
    $partes = explode('@', $to);
    $dominio = strtolower(end($partes));
    if (in_array($dominio, ['inversionesduri.com', 'example.com', 'test.com', 'localhost']) || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
        return ["success" => false, "message" => "El correo {$to} pertenece a un dominio no enrutable o de prueba. Envío omitido para evitar rebotes de correo."];
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
        return ["success" => false, "message" => "No se pudo conectar al servidor SMTP: $errstr ($errno)"];
    }

    $response = fgets($socket, 515);

    $cmds = [
        "EHLO " . ($_SERVER['SERVER_NAME'] ?? 'localhost'),
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

    $hasAttachment = !empty($attachmentData);
    $mainBoundary = "duri_main_" . md5(uniqid(time(), true));
    $altBoundary = "duri_alt_" . md5(uniqid(time(), true));

    $headers = [
        "Date: " . date('r'),
        "From: =?UTF-8?B?" . base64_encode($fromName) . "?= <{$from}>",
        "To: <{$to}>",
        "Subject: =?UTF-8?B?" . base64_encode($subject) . "?=",
        "MIME-Version: 1.0"
    ];

    if ($hasAttachment) {
        $headers[] = "Content-Type: multipart/mixed; boundary=\"{$mainBoundary}\"";
        
        $bodyContent = "--{$mainBoundary}\r\n" .
            "Content-Type: multipart/alternative; boundary=\"{$altBoundary}\"\r\n\r\n" .
            "--{$altBoundary}\r\n" .
            "Content-Type: text/plain; charset=UTF-8\r\n" .
            "Content-Transfer-Encoding: base64\r\n\r\n" .
            chunk_split(base64_encode($altBody ?: strip_tags($htmlBody))) . "\r\n" .
            "--{$altBoundary}\r\n" .
            "Content-Type: text/html; charset=UTF-8\r\n" .
            "Content-Transfer-Encoding: base64\r\n\r\n" .
            chunk_split(base64_encode($htmlBody)) . "\r\n" .
            "--{$altBoundary}--\r\n\r\n";

        // Preparar contenido base64 del PDF adjunto
        $cleanAttach = $attachmentData;
        if (strpos($attachmentData, 'base64,') !== false) {
            $parts = explode('base64,', $attachmentData);
            $cleanAttach = $parts[1];
        }
        $rawBase64 = str_replace(["\r", "\n", " "], '', $cleanAttach);
        if (base64_encode(base64_decode($rawBase64, true)) !== $rawBase64) {
            $base64Attachment = chunk_split(base64_encode($cleanAttach));
        } else {
            $base64Attachment = chunk_split($rawBase64);
        }

        $attName = !empty($attachmentName) ? preg_replace('/[^a-zA-Z0-9_\.-]/', '_', $attachmentName) : 'Factura_Oficial.pdf';
        if (!preg_match('/\.pdf$/i', $attName)) $attName .= '.pdf';

        $bodyContent .= "--{$mainBoundary}\r\n" .
            "Content-Type: application/pdf; name=\"{$attName}\"\r\n" .
            "Content-Disposition: attachment; filename=\"{$attName}\"\r\n" .
            "Content-Transfer-Encoding: base64\r\n\r\n" .
            $base64Attachment . "\r\n" .
            "--{$mainBoundary}--\r\n";

    } else {
        $headers[] = "Content-Type: multipart/alternative; boundary=\"{$altBoundary}\"";
        $bodyContent = "--{$altBoundary}\r\n" .
            "Content-Type: text/plain; charset=UTF-8\r\n" .
            "Content-Transfer-Encoding: base64\r\n\r\n" .
            chunk_split(base64_encode($altBody ?: strip_tags($htmlBody))) . "\r\n" .
            "--{$altBoundary}\r\n" .
            "Content-Type: text/html; charset=UTF-8\r\n" .
            "Content-Transfer-Encoding: base64\r\n\r\n" .
            chunk_split(base64_encode($htmlBody)) . "\r\n" .
            "--{$altBoundary}--\r\n";
    }

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
        return ["success" => false, "message" => "Error al despachar el correo (código $finalCode)"];
    }

    return ["success" => true, "message" => "Correo y factura enviados exitosamente a la bandeja de entrada"];
}

/**
 * Función para enviar la Factura y Nota de Entrega oficial al correo del cliente
 */
function enviarFacturaClienteEmail($destinatario, $pedido, $detalles = [], $tasaBcv = 0, $pdfBase64 = null, $filename = '') {
    if (empty(MAIL_USER) || empty(MAIL_PASS)) {
        return [
            'success' => false,
            'message' => 'Faltan credenciales de correo en backend/config/mail.php'
        ];
    }

    $codigo = $pedido['codigo'] ?? ('PED-' . ($pedido['id'] ?? '001'));
    $cleanNum = preg_replace('/[^0-9]/', '', $codigo) ?: ($pedido['id'] ?? '101');
    $facturaNum = 'FACT-' . str_pad($cleanNum, 4, '0', STR_PAD_LEFT);
    $clienteNombre = $pedido['cliente_nombre'] ?? 'Cliente General';
    $clienteCi = $pedido['cliente_ci'] ?? 'No registrada';
    $clienteTelefono = $pedido['cliente_telefono'] ?? ($pedido['telefono'] ?? 'No registrado');

    $formaPagoMap = [
        'pago_movil' => 'Pago Móvil Interbancario',
        'transferencia' => 'Transferencia Bancaria',
        'efectivo' => 'Efectivo',
        'tarjeta' => 'Tarjeta'
    ];
    $rawFp = $pedido['forma_pago'] ?? 'pago_movil';
    $formaPagoTxt = $formaPagoMap[$rawFp] ?? ($rawFp ?: 'Pago Móvil');

    $direccionEntrega = $pedido['direccion_entrega'] ?? 'Retiro en Sede Comercial Inversiones Duri';
    $notas = $pedido['notas'] ?? '';

    // Extraer costo y modalidad de delivery si existen
    $deliveryVal = 0.0;
    if (isset($pedido['delivery_cost'])) {
        $deliveryVal = (float)$pedido['delivery_cost'];
    } elseif (isset($pedido['deliveryCost'])) {
        $deliveryVal = (float)$pedido['deliveryCost'];
    } elseif (!empty($direccionEntrega) && preg_match('/Tarifa:\s*\$([0-9]+(?:\.[0-9]+)?)/i', $direccionEntrega, $mDeliv)) {
        $deliveryVal = (float)$mDeliv[1];
    }

    $totalVal = (float)($pedido['total'] ?? 0);
    $subtotalVal = (isset($pedido['subtotal']) && (float)$pedido['subtotal'] > 0)
        ? (float)$pedido['subtotal'] 
        : (max(0, $totalVal - $deliveryVal) / 1.16);
    $ivaVal = (isset($pedido['impuesto']) && (float)$pedido['impuesto'] > 0) 
        ? (float)$pedido['impuesto'] 
        : ($subtotalVal * 0.16);

    if ($totalVal <= 0) {
        $totalVal = $subtotalVal + $ivaVal + $deliveryVal;
    }

    $rate = $tasaBcv > 0 ? (float)$tasaBcv : 45.00;
    $rateStr = number_format($rate, 2, ',', '.');
    $totalBs = number_format($totalVal * $rate, 2, ',', '.');
    $subtotalBs = number_format($subtotalVal * $rate, 2, ',', '.');
    $ivaBs = number_format($ivaVal * $rate, 2, ',', '.');
    $deliveryBs = number_format($deliveryVal * $rate, 2, ',', '.');
    $fecha = date('d/m/Y h:i A');

    $isRetiro = (!empty($pedido['modalidad_entrega']) && $pedido['modalidad_entrega'] === 'retiro') 
        || stripos($direccionEntrega, 'Retiro') !== false;

    if ($isRetiro) {
        $deliveryRowHtml = "<tr>
            <td style='padding:4px 0;color:#059669;'>🏪 Retiro en Local:</td>
            <td style='padding:4px 0;text-align:right;color:#059669;font-weight:700;'>¡GRATIS ($0.00)!</td>
        </tr>";
    } elseif ($deliveryVal == 0) {
        $deliveryRowHtml = "<tr>
            <td style='padding:4px 0;color:#059669;'>🛵 Delivery (Centro Maracay):</td>
            <td style='padding:4px 0;text-align:right;color:#059669;font-weight:700;'>¡GRATIS ($0.00)!</td>
        </tr>";
    } else {
        $deliveryRowHtml = "<tr>
            <td style='padding:4px 0;color:#2563eb;'>🛵 Costo de Delivery:</td>
            <td style='padding:4px 0;text-align:right;color:#2563eb;'><strong>+$" . number_format($deliveryVal, 2) . "</strong> <small style='color:#64748b;'>(Bs. {$deliveryBs})</small></td>
        </tr>";
    }

    // Filas de productos con el mismo formato de 6 columnas de la factura descargable
    $rowsHtml = '';
    if (!empty($detalles)) {
        $idx = 1;
        foreach ($detalles as $it) {
            $name = htmlspecialchars($it['nombre'] ?? $it['producto_nombre'] ?? 'Producto');
            $qty = (int)($it['cantidad'] ?? 1);
            $price = (float)($it['precio_unitario'] ?? 0);
            $sub = $price * $qty;
            $subBs = number_format($sub * $rate, 2, ',', '.');
            $rowsHtml .= "
                <tr style='border-bottom:1px solid #f1f5f9;'>
                    <td style='padding:9px 8px;text-align:center;font-size:12px;color:#64748b;'>{$idx}</td>
                    <td style='padding:9px 10px;font-size:13px;color:#1e293b;'><strong>{$name}</strong></td>
                    <td style='padding:9px 8px;text-align:center;font-size:13px;color:#475569;'>{$qty}</td>
                    <td style='padding:9px 10px;text-align:right;font-size:13px;color:#475569;'>$" . number_format($price, 2) . "</td>
                    <td style='padding:9px 10px;text-align:right;font-size:13px;font-weight:700;color:#0f172a;'>$" . number_format($sub, 2) . "</td>
                    <td style='padding:9px 10px;text-align:right;font-size:12px;color:#64748b;'>Bs. {$subBs}</td>
                </tr>";
            $idx++;
        }
    } else {
        $rowsHtml = "
            <tr style='border-bottom:1px solid #f1f5f9;'>
                <td style='padding:9px 8px;text-align:center;font-size:12px;color:#64748b;'>1</td>
                <td style='padding:9px 10px;font-size:13px;color:#1e293b;'><strong>Productos solicitados en pedido {$codigo}</strong></td>
                <td style='padding:9px 8px;text-align:center;font-size:13px;color:#475569;'>1</td>
                <td style='padding:9px 10px;text-align:right;font-size:13px;color:#475569;'>$" . number_format($subtotalVal, 2) . "</td>
                <td style='padding:9px 10px;text-align:right;font-size:13px;font-weight:700;color:#0f172a;'>$" . number_format($subtotalVal, 2) . "</td>
                <td style='padding:9px 10px;text-align:right;font-size:12px;color:#64748b;'>Bs. {$subtotalBs}</td>
            </tr>";
    }

    $asunto = "Factura Oficial {$facturaNum} ({$codigo}) - Inversiones Duri C.A";

    // DISEÑO EXACTO 1:1 IDÉNTICO A LA HOJA DE FACTURA DESCARGADA
    $cuerpoHtml = "
    <!DOCTYPE html>
    <html>
    <head><meta charset='UTF-8'></head>
    <body style='margin:0;padding:24px 10px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,Helvetica,Arial,sans-serif;'>
        <div style='max-width:720px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;padding:34px 38px;box-shadow:0 4px 16px rgba(0,0,0,0.04);color:#1e293b;'>
            
            <!-- Encabezado Membrete Oficial -->
            <table style='width:100%;border-collapse:collapse;border-bottom:2px solid #e2e8f0;padding-bottom:20px;margin-bottom:22px;'>
                <tr>
                    <td style='vertical-align:top;width:60%;'>
                        <table style='border-collapse:collapse;'>
                            <tr>
                                <td style='vertical-align:top;padding-right:14px;'>
                                    <img src='https://raw.githubusercontent.com/cocoshec/INVERSIONES-DURI/main/img/logo-duri.png' alt='Inversiones Duri' width='64' height='64' style='object-fit:contain;border-radius:10px;border:1px solid #e2e8f0;padding:4px;background:#ffffff;display:block;'>
                                </td>
                                <td style='vertical-align:top;'>
                                    <h2 style='margin:0 0 4px 0;font-size:19px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px;'>Inversiones Duri C.A.</h2>
                                    <div style='font-size:12px;color:#64748b;line-height:1.4;'>
                                        <div style='margin-bottom:2px;'><strong>RIF:</strong> J-50123456-7</div>
                                        <div style='margin-bottom:2px;'>📍 Sede Comercial: Av. Bolívar Oeste, Maracay, Edo. Aragua</div>
                                        <div style='margin-bottom:2px;'>📞 +58 424-3657447 | ✉️ inversionesduri@gmail.com</div>
                                        <div>📷 @inversionesdurica | Inversiones Duri</div>
                                    </div>
                                </td>
                            </tr>
                        </table>
                    </td>
                    <td style='vertical-align:top;text-align:right;width:40%;'>
                        <div style='font-size:11px;font-weight:800;color:#ff6600;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px;'>NOTA DE ENTREGA / FACTURA</div>
                        <div style='font-size:22px;font-weight:900;color:#0f172a;font-family:monospace;'>{$facturaNum}</div>
                        <div style='font-size:12px;color:#475569;margin-top:2px;'><strong>Pedido:</strong> {$codigo}</div>
                        <div style='font-size:12px;color:#64748b;'>{$fecha}</div>
                        <div style='margin-top:8px;'>
                            <span style='display:inline-block;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;background:rgba(5, 150, 105, 0.12);color:#059669;border:1px solid rgba(5, 150, 105, 0.25);'>
                                ✅ PAGO APROBADO / EN PROCESO
                            </span>
                        </div>
                    </td>
                </tr>
            </table>

            <!-- Datos del Cliente y Despacho -->
            <table style='width:100%;border-collapse:collapse;margin-bottom:22px;'>
                <tr>
                    <td style='width:50%;vertical-align:top;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;'>
                        <div style='font-size:12px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;'>
                            👤 Facturado a (Cliente)
                        </div>
                        <div style='font-size:12.5px;color:#334155;line-height:1.55;'>
                            <div><strong>Nombre / Razón Social:</strong> " . htmlspecialchars($clienteNombre) . "</div>
                            <div><strong>Cédula / RIF:</strong> " . htmlspecialchars($clienteCi) . "</div>
                            <div><strong>Teléfono de Contacto:</strong> " . htmlspecialchars($clienteTelefono) . "</div>
                        </div>
                    </td>
                    <td style='width:16px;'></td>
                    <td style='width:50%;vertical-align:top;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;'>
                        <div style='font-size:12px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;'>
                            🚚 Despacho y Pago
                        </div>
                        <div style='font-size:12.5px;color:#334155;line-height:1.55;'>
                            <div><strong>Forma de Pago:</strong> " . htmlspecialchars($formaPagoTxt) . "</div>
                            <div><strong>Tasa Oficial BCV:</strong> {$rateStr} Bs / USD</div>
                            <div><strong>Modalidad / Entrega:</strong> " . htmlspecialchars($direccionEntrega) . "</div>
                            " . (!empty($notas) ? "<div><strong>Notas:</strong> " . htmlspecialchars($notas) . "</div>" : "") . "
                        </div>
                    </td>
                </tr>
            </table>

            <!-- Tabla de Productos -->
            <div style='border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:22px;'>
                <table style='width:100%;border-collapse:collapse;'>
                    <thead>
                        <tr style='background:#1e293b;color:#ffffff;font-size:11.5px;text-transform:uppercase;letter-spacing:0.5px;'>
                            <th style='padding:10px 8px;text-align:center;width:35px;'>#</th>
                            <th style='padding:10px 10px;text-align:left;'>Descripción del Producto</th>
                            <th style='padding:10px 8px;text-align:center;width:55px;'>Cant.</th>
                            <th style='padding:10px 10px;text-align:right;width:85px;'>P. Unit ($)</th>
                            <th style='padding:10px 10px;text-align:right;width:95px;'>Subtotal ($)</th>
                            <th style='padding:10px 10px;text-align:right;width:110px;'>Equiv. (Bs.)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {$rowsHtml}
                    </tbody>
                </table>
            </div>

            <!-- Caja de Totales y Moneda Dual -->
            <table style='width:100%;border-collapse:collapse;margin-bottom:26px;'>
                <tr>
                    <td style='vertical-align:top;width:45%;padding-top:6px;'>
                        <div style='background:#f0fdf4;border:1px dashed #86efac;border-radius:10px;padding:12px 14px;'>
                            <div style='font-size:12px;font-weight:700;color:#166534;margin-bottom:3px;'>📎 Documento PDF Oficial Adjunto</div>
                            <div style='font-size:11.5px;color:#15803d;line-height:1.4;'>
                                Te adjuntamos la factura original en formato <strong>PDF</strong> con membrete y sellos para control y archivo personal.
                            </div>
                        </div>
                    </td>
                    <td style='width:8%;'></td>
                    <td style='vertical-align:top;width:47%;'>
                        <div style='background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;padding:14px 18px;'>
                            <table style='width:100%;font-size:13px;color:#475569;border-collapse:collapse;'>
                                <tr>
                                    <td style='padding:4px 0;'>Subtotal Base:</td>
                                    <td style='padding:4px 0;text-align:right;'><strong>$" . number_format($subtotalVal, 2) . "</strong> <small style='color:#64748b;'>(Bs. {$subtotalBs})</small></td>
                                </tr>
                                <tr>
                                    <td style='padding:4px 0;'>IVA (16%):</td>
                                    <td style='padding:4px 0;text-align:right;'><strong>$" . number_format($ivaVal, 2) . "</strong> <small style='color:#64748b;'>(Bs. {$ivaBs})</small></td>
                                </tr>
                                {$deliveryRowHtml}
                                <tr style='border-top:1.5px solid #0f172a;'>
                                    <td style='padding:8px 0 4px 0;font-size:14px;font-weight:800;color:#0f172a;'>TOTAL A PAGAR:</td>
                                    <td style='padding:8px 0 4px 0;text-align:right;font-size:16px;font-weight:900;color:#0f172a;'>$" . number_format($totalVal, 2) . " USD</td>
                                </tr>
                            </table>
                            <div style='margin-top:10px;background:#ffedd5;border:1px solid #fed7aa;border-radius:8px;padding:8px 12px;display:flex;justify-content:space-between;font-size:13px;font-weight:700;color:#9a3412;'>
                                <span>Total en Bolívares (BCV):</span>
                            </div>
                        </div>
                    </td>
                </tr>
            </table>

            <!-- Pie de Página y Sello de Verificación -->
            <table style='width:100%;border-collapse:collapse;border-top:1px solid #e2e8f0;padding-top:18px;margin-top:10px;'>
                <tr>
                    <td style='vertical-align:middle;width:65%;'>
                        <div style='font-size:12px;font-weight:700;color:#334155;margin-bottom:3px;'>
                            🛡️ Comprobante Electrónico y Registro de Compra Oficial
                        </div>
                        <div style='font-size:11px;color:#64748b;line-height:1.4;'>
                            Emitido por Inversiones Duri C.A. para control de inventario, garantías y despacho. Válido como soporte fiscal y nota de entrega.
                        </div>
                    </td>
                    <td style='vertical-align:middle;text-align:right;width:35%;'>
                        <div style='display:inline-block;border:2px dashed #059669;border-radius:8px;padding:8px 14px;text-align:center;background:#ecfdf5;'>
                            <div style='font-size:11px;font-weight:800;color:#047857;text-transform:uppercase;'>Inversiones Duri C.A.</div>
                            <div style='font-size:9.5px;font-weight:700;color:#059669;letter-spacing:0.5px;'>VALIDADO POR ADMINISTRACIÓN</div>
                        </div>
                    </td>
                </tr>
            </table>

        </div>
        <div style='text-align:center;margin-top:16px;font-size:11.5px;color:#94a3b8;'>
            © " . date('Y') . " Inversiones Duri C.A — Maracay, Edo. Aragua, Venezuela. Todos los derechos reservados.
        </div>
    </body>
    </html>";

    $altBody = "Factura Oficial {$facturaNum} ({$codigo}) - Inversiones Duri C.A.\nTotal: $" . number_format($totalVal, 2) . " USD (Bs. {$totalBs}).\nPago aprobado y verificado.";

    $attName = !empty($filename) ? $filename : "Factura_{$codigo}.pdf";
    return enviarCorreoGmailSmtp($destinatario, $asunto, $cuerpoHtml, $altBody, $pdfBase64, $attName);
}
}

$database = new Database();
$db = $database->getConnection();



$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// Endpoint específico para enviar la factura oficial por correo
if ($method === 'POST' && isset($_GET['action']) && $_GET['action'] === 'enviar_factura') {
    $data = json_decode(file_get_contents("php://input"), true);
    $pedidoId = $data['pedido_id'] ?? null;
    $codigoParam = $data['codigo'] ?? '';
    $email = trim($data['email'] ?? '');

    if ((!$pedidoId && !$codigoParam) || !$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "Pedido y correo electrónico válido son requeridos"]);
        exit();
    }

    $stmt = $db->prepare("SELECT p.*, COALESCE(NULLIF(p.cliente_nombre, ''), c.nombre) as cliente_nombre, COALESCE(NULLIF(p.cliente_ci, ''), c.ci_rif) as cliente_ci FROM pedidos p LEFT JOIN clientes c ON p.cliente_id = c.id WHERE p.id = ? OR p.codigo = ?");
    $stmt->execute([$pedidoId, $codigoParam ?: $pedidoId]);
    $pedido = $stmt->fetch();

    if (!$pedido && !empty($data['pedido'])) {
        $pedido = $data['pedido'];
    }

    if (!$pedido) {
        http_response_code(404);
        echo json_encode(["status" => "error", "message" => "Pedido no encontrado"]);
        exit();
    }

    $detalles = [];
    if (!empty($pedido['id'])) {
        $stmtDet = $db->prepare("SELECT dp.*, pr.nombre as producto_nombre FROM detalle_pedido dp LEFT JOIN productos pr ON dp.producto_id = pr.id WHERE dp.pedido_id = ?");
        $stmtDet->execute([$pedido['id']]);
        $detalles = $stmtDet->fetchAll();
    }
    if (empty($detalles) && !empty($data['productos'])) {
        $detalles = $data['productos'];
    }

    $tasaBcv = isset($data['tasa_bcv']) ? (float)$data['tasa_bcv'] : 0;
    $pdfBase64 = $data['pdf_base64'] ?? null;
    $filename = $data['filename'] ?? '';
    if (function_exists('enviarFacturaClienteEmail')) {
        $res = enviarFacturaClienteEmail($email, $pedido, $detalles, $tasaBcv, $pdfBase64, $filename);
        if (!empty($res['success']) && !empty($pedido['id'])) {
            try {
                $stmtUpEmail = $db->prepare("UPDATE pedidos SET cliente_email = ? WHERE id = ?");
                $stmtUpEmail->execute([$email, $pedido['id']]);
            } catch(Exception $e) {}
        }
        echo json_encode(["status" => $res['success'] ? "success" : "error", "message" => $res['message']]);
    } else {
        echo json_encode(["status" => "error", "message" => "Servicio de correo no configurado"]);
    }
    exit();
}

switch ($method) {
    case 'GET':
        if (isset($_GET['id'])) {
            // Obtener un pedido con sus detalles (priorizando datos directos del pedido sobre el cliente de respaldo)
            $stmt = $db->prepare("SELECT p.*, 
                                         COALESCE(NULLIF(p.cliente_nombre, ''), c.nombre) as cliente_nombre, 
                                         COALESCE(NULLIF(p.cliente_telefono, ''), c.telefono) as cliente_telefono, 
                                         COALESCE(NULLIF(p.cliente_ci, ''), c.ci_rif) as cliente_ci,
                                         COALESCE(NULLIF(p.cliente_email, ''), c.email) as cliente_email
                                  FROM pedidos p 
                                  LEFT JOIN clientes c ON p.cliente_id = c.id 
                                  WHERE p.id = ?");
            $stmt->execute([$_GET['id']]);
            $pedido = $stmt->fetch();

            if ($pedido) {
                // Obtener detalles
                $stmt2 = $db->prepare("SELECT dp.*, pr.nombre as producto_nombre FROM detalle_pedido dp JOIN productos pr ON dp.producto_id = pr.id WHERE dp.pedido_id = ?");
                $stmt2->execute([$_GET['id']]);
                $pedido['detalles'] = $stmt2->fetchAll();
                echo json_encode(["status" => "success", "data" => $pedido]);
            } else {
                http_response_code(404);
                echo json_encode(["status" => "error", "message" => "Pedido no encontrado"]);
            }
        } else {
            // Obtener todos los pedidos con datos directos del cliente que realizó la compra
            $stmt = $db->query("SELECT p.*, 
                                       COALESCE(NULLIF(p.cliente_nombre, ''), c.nombre) as cliente_nombre, 
                                       COALESCE(NULLIF(p.cliente_telefono, ''), c.telefono) as cliente_telefono, 
                                       COALESCE(NULLIF(p.cliente_ci, ''), c.ci_rif) as cliente_ci,
                                       COALESCE(NULLIF(p.cliente_email, ''), c.email) as cliente_email
                                FROM pedidos p 
                                LEFT JOIN clientes c ON p.cliente_id = c.id 
                                ORDER BY p.created_at DESC");
            $pedidos = $stmt->fetchAll();

            if (!empty($pedidos)) {
                $ids = array_column($pedidos, 'id');
                $inQuery = implode(',', array_fill(0, count($ids), '?'));
                $stmtDet = $db->prepare("SELECT dp.*, pr.nombre as producto_nombre 
                                         FROM detalle_pedido dp 
                                         LEFT JOIN productos pr ON dp.producto_id = pr.id 
                                         WHERE dp.pedido_id IN ($inQuery)");
                $stmtDet->execute($ids);
                $detalles = $stmtDet->fetchAll();

                $detallesPorPedido = [];
                foreach ($detalles as $det) {
                    $detallesPorPedido[$det['pedido_id']][] = [
                        'producto_id' => $det['producto_id'],
                        'nombre' => $det['producto_nombre'] ?? ('Producto #' . $det['producto_id']),
                        'cantidad' => (int)$det['cantidad'],
                        'precio_unitario' => (float)$det['precio_unitario'],
                        'subtotal' => (float)$det['subtotal']
                    ];
                }

                foreach ($pedidos as &$p) {
                    $p['productos'] = $detallesPorPedido[$p['id']] ?? [];
                }
                unset($p);
            }

            echo json_encode(["status" => "success", "data" => $pedidos]);
        }
        break;

    case 'POST':
        $data = json_decode(file_get_contents("php://input"), true);

        if (empty($data['cliente_id']) || empty($data['productos'])) {
            http_response_code(400);
            echo json_encode(["status" => "error", "message" => "Cliente y productos son requeridos"]);
            exit();
        }

        try {
            $db->beginTransaction();

            // Calcular total
            $subtotal = 0;
            foreach ($data['productos'] as $prod) {
                $subtotal += $prod['cantidad'] * $prod['precio_unitario'];
            }
            $impuesto = $subtotal * 0.16; // IVA 16%
            $total = $subtotal + $impuesto;

            // Generar código del pedido
            $stmt = $db->query("SELECT MAX(id) as max_id FROM pedidos");
            $row = $stmt->fetch();
            $codigo = 'PED-' . str_pad(($row['max_id'] ?? 0) + 1, 3, '0', STR_PAD_LEFT);

            // Insertar pedido con los datos exactos que el cliente escribió en el formulario
            $formaPago = $data['forma_pago'] ?? 'pago_movil';
            $formasValidas = ['pago_movil', 'transferencia'];
            if (!in_array($formaPago, $formasValidas)) $formaPago = 'pago_movil';

            $clienteNombre = $data['cliente_nombre'] ?? '';
            $clienteTelefono = $data['cliente_telefono'] ?? '';
            $clienteCi = $data['cliente_ci'] ?? '';
            $clienteEmail = filter_var($data['cliente_email'] ?? '', FILTER_VALIDATE_EMAIL) ? trim($data['cliente_email']) : '';

            $stmt = $db->prepare("INSERT INTO pedidos (codigo, cliente_id, cliente_nombre, cliente_telefono, cliente_ci, cliente_email, subtotal, impuesto, total, estado, forma_pago, direccion_entrega, notas) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, ?, ?)");
            $stmt->execute([
                $codigo,
                $data['cliente_id'],
                $clienteNombre,
                $clienteTelefono,
                $clienteCi,
                $clienteEmail,
                $subtotal,
                $impuesto,
                $total,
                $formaPago,
                $data['direccion_entrega'] ?? '',
                $data['notas'] ?? ''
            ]);

            $pedido_id = $db->lastInsertId();

            // Actualizar correo del cliente en la tabla clientes si aplica
            if ($clienteEmail && !empty($data['cliente_id'])) {
                try {
                    $stmtUpCli = $db->prepare("UPDATE clientes SET email = COALESCE(NULLIF(email, ''), ?) WHERE id = ?");
                    $stmtUpCli->execute([$clienteEmail, $data['cliente_id']]);
                } catch(Exception $e) {}
            }

            // Insertar detalles del pedido (el stock NO se descuenta aquí porque el pedido queda 'pendiente' de pago)
            foreach ($data['productos'] as $prod) {
                $sub = $prod['cantidad'] * $prod['precio_unitario'];
                
                $stmt = $db->prepare("INSERT INTO detalle_pedido (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?)");
                $stmt->execute([$pedido_id, $prod['producto_id'], $prod['cantidad'], $prod['precio_unitario'], $sub]);
            }

            $db->commit();

            http_response_code(201);
            echo json_encode(["status" => "success", "message" => "Pedido creado", "id" => $pedido_id, "codigo" => $codigo, "total" => $total, "cliente_email" => $clienteEmail]);

        } catch (Exception $e) {
            $db->rollBack();
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Error: " . $e->getMessage()]);
        }
        break;

    case 'PUT':
        $data = json_decode(file_get_contents("php://input"), true);
        $id = $_GET['id'] ?? null;

        if (!$id || empty($data['estado'])) {
            http_response_code(400);
            echo json_encode(["status" => "error", "message" => "ID y estado son requeridos"]);
            exit();
        }

        $nuevoEstado = $data['estado'];
        $estadosValidos = ['pendiente', 'procesando', 'completado', 'cancelado'];
        if (!in_array($nuevoEstado, $estadosValidos)) {
            http_response_code(400);
            echo json_encode(["status" => "error", "message" => "Estado no válido"]);
            exit();
        }

        // Validar que la acción provenga de un superusuario
        if (!empty($data['usuario_id'])) {
            $stmtUser = $db->prepare("SELECT rol FROM usuarios WHERE id = ? AND activo = 1");
            $stmtUser->execute([$data['usuario_id']]);
            $u = $stmtUser->fetch();
            if (!$u || !in_array($u['rol'], ['super_usuario', 'admin'])) {
                http_response_code(403);
                echo json_encode(["status" => "error", "message" => "Acceso restringido: solo el superusuario puede verificar pagos y modificar estados"]);
                exit();
            }
        }

        try {
            $db->beginTransaction();

            $codigoParam = $data['codigo'] ?? '';

            // Obtener estado actual y datos del pedido por ID o por Código
            $stmt = $db->prepare("SELECT p.*, COALESCE(NULLIF(p.cliente_email, ''), c.email) as final_email, COALESCE(NULLIF(p.cliente_nombre, ''), c.nombre) as final_nombre, COALESCE(NULLIF(p.cliente_ci, ''), c.ci_rif) as final_ci FROM pedidos p LEFT JOIN clientes c ON p.cliente_id = c.id WHERE p.id = ? OR (p.codigo = ? AND ? != '')");
            $stmt->execute([$id, $codigoParam, $codigoParam]);
            $pedidoActual = $stmt->fetch();

            if (!$pedidoActual && !empty($data['pedido'])) {
                $pData = $data['pedido'];
                $cod = !empty($pData['codigo']) ? $pData['codigo'] : ($codigoParam ?: 'PED-' . time());
                $cNom = $pData['cliente_nombre'] ?? 'Cliente';
                $cTel = $pData['cliente_telefono'] ?? '';
                $cCi = $pData['cliente_ci'] ?? '';
                $cMail = !empty($data['cliente_email']) ? $data['cliente_email'] : ($pData['cliente_email'] ?? '');
                $cSub = (float)($pData['subtotal'] ?? 0);
                $cImp = (float)($pData['impuesto'] ?? 0);
                $cTot = (float)($pData['total'] ?? ($cSub + $cImp));
                $cForma = $pData['forma_pago'] ?? 'pago_movil';
                
                $stmtIns = $db->prepare("INSERT INTO pedidos (codigo, cliente_id, cliente_nombre, cliente_telefono, cliente_ci, cliente_email, subtotal, impuesto, total, estado, forma_pago, direccion_entrega, notas) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $stmtIns->execute([$cod, $cNom, $cTel, $cCi, $cMail, $cSub, $cImp, $cTot, $nuevoEstado, $cForma, $pData['direccion_entrega'] ?? '', $pData['notas'] ?? '']);
                $id = $db->lastInsertId();
                
                $stmt = $db->prepare("SELECT p.*, p.cliente_email as final_email, p.cliente_nombre as final_nombre, p.cliente_ci as final_ci FROM pedidos p WHERE p.id = ?");
                $stmt->execute([$id]);
                $pedidoActual = $stmt->fetch();
            }

            if (!$pedidoActual) {
                $db->rollBack();
                http_response_code(404);
                echo json_encode(["status" => "error", "message" => "Pedido no encontrado"]);
                exit();
            }

            $realId = $pedidoActual['id'];
            $estadoAnterior = $pedidoActual['estado'];

            // Obtener productos del pedido
            $stmt = $db->prepare("SELECT producto_id, cantidad FROM detalle_pedido WHERE pedido_id = ?");
            $stmt->execute([$realId]);
            $detalles = $stmt->fetchAll();

            // Si pasa de 'pendiente' a confirmado ('procesando' o 'completado'), descontamos stock
            if ($estadoAnterior === 'pendiente' && in_array($nuevoEstado, ['procesando', 'completado'])) {
                foreach ($detalles as $det) {
                    $stmtUp = $db->prepare("UPDATE productos SET stock_actual = stock_actual - ? WHERE id = ?");
                    $stmtUp->execute([$det['cantidad'], $det['producto_id']]);

                    $stmtMov = $db->prepare("INSERT INTO movimientos_inventario (producto_id, tipo_movimiento, cantidad, motivo, referencia) VALUES (?, 'salida', ?, 'Venta confirmada', ?)");
                    $stmtMov->execute([$det['producto_id'], $det['cantidad'], $pedidoActual['codigo']]);
                }
            }
            // Si ya estaba confirmado y ahora se 'cancela', devolvemos el stock
            else if (in_array($estadoAnterior, ['procesando', 'completado']) && $nuevoEstado === 'cancelado') {
                foreach ($detalles as $det) {
                    $stmtUp = $db->prepare("UPDATE productos SET stock_actual = stock_actual + ? WHERE id = ?");
                    $stmtUp->execute([$det['cantidad'], $det['producto_id']]);

                    $stmtMov = $db->prepare("INSERT INTO movimientos_inventario (producto_id, tipo_movimiento, cantidad, motivo, referencia) VALUES (?, 'entrada', ?, 'Cancelación de pedido', ?)");
                    $stmtMov->execute([$det['producto_id'], $det['cantidad'], $pedidoActual['codigo']]);
                }
            }
            // Si estaba 'cancelado' y se reactiva a 'procesando' o 'completado', volvemos a descontar
            else if ($estadoAnterior === 'cancelado' && in_array($nuevoEstado, ['procesando', 'completado'])) {
                foreach ($detalles as $det) {
                    $stmtUp = $db->prepare("UPDATE productos SET stock_actual = stock_actual - ? WHERE id = ?");
                    $stmtUp->execute([$det['cantidad'], $det['producto_id']]);

                    $stmtMov = $db->prepare("INSERT INTO movimientos_inventario (producto_id, tipo_movimiento, cantidad, motivo, referencia) VALUES (?, 'salida', ?, 'Reactivación de pedido', ?)");
                    $stmtMov->execute([$det['producto_id'], $det['cantidad'], $pedidoActual['codigo']]);
                }
            }

            // Actualizar estado del pedido
            $stmt = $db->prepare("UPDATE pedidos SET estado = ? WHERE id = ?");
            $stmt->execute([$nuevoEstado, $realId]);

            // Actualizar correo si fue provisto
            if (!empty($data['cliente_email'])) {
                try {
                    $stmtUpMail = $db->prepare("UPDATE pedidos SET cliente_email = ? WHERE id = ?");
                    $stmtUpMail->execute([$data['cliente_email'], $realId]);
                    $pedidoActual['cliente_email'] = $data['cliente_email'];
                } catch(Exception $e) {}
            }

            $db->commit();

            // Envío automático de factura al correo del cliente si está validando el pago
            $emailEnviado = false;
            $emailDestino = !empty($data['cliente_email']) ? trim($data['cliente_email']) : ($pedidoActual['final_email'] ?? $pedidoActual['cliente_email'] ?? '');
            $emailMensaje = '';

            // Envío automático de factura al correo del cliente: ÚNICAMENTE cuando se valide como 'completado' (Entregado)
            if ($nuevoEstado === 'completado') {
                if ($emailDestino && filter_var($emailDestino, FILTER_VALIDATE_EMAIL) && function_exists('enviarFacturaClienteEmail')) {
                    $stmtDet = $db->prepare("SELECT dp.*, pr.nombre as producto_nombre FROM detalle_pedido dp LEFT JOIN productos pr ON dp.producto_id = pr.id WHERE dp.pedido_id = ?");
                    $stmtDet->execute([$realId]);
                    $itemsFact = $stmtDet->fetchAll();
                    if (empty($itemsFact) && !empty($data['productos'])) {
                        $itemsFact = $data['productos'];
                    }
                    $tasa = isset($data['tasa_bcv']) ? (float)$data['tasa_bcv'] : 0;
                    $pdfBase64 = $data['pdf_base64'] ?? null;
                    $filename = $data['filename'] ?? '';
                    $resMail = enviarFacturaClienteEmail($emailDestino, $pedidoActual, $itemsFact, $tasa, $pdfBase64, $filename);
                    $emailEnviado = !empty($resMail['success']);
                    $emailMensaje = $resMail['message'] ?? '';
                }
            }

            echo json_encode([
                "status" => "success", 
                "message" => "Estado de pedido actualizado a " . $nuevoEstado,
                "email_enviado" => $emailEnviado,
                "email_destino" => $emailDestino,
                "email_mensaje" => $emailMensaje
            ]);

        } catch (Exception $e) {
            $db->rollBack();
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Error al actualizar: " . $e->getMessage()]);
        }
        break;

    case 'DELETE':
        $id = $_GET['id'] ?? null;
        $usuario_id = $_GET['usuario_id'] ?? null;

        if (!$id) {
            http_response_code(400);
            echo json_encode(["status" => "error", "message" => "ID requerido"]);
            exit();
        }

        // Validar que el usuario sea superusuario
        if (!empty($usuario_id)) {
            $stmtUser = $db->prepare("SELECT rol FROM usuarios WHERE id = ? AND activo = 1");
            $stmtUser->execute([$usuario_id]);
            $u = $stmtUser->fetch();
            if (!$u || !in_array($u['rol'], ['super_usuario', 'admin'])) {
                http_response_code(403);
                echo json_encode(["status" => "error", "message" => "Acceso restringido: solo el superusuario puede eliminar pedidos del historial"]);
                exit();
            }
        }

        try {
            $db->beginTransaction();

            // Eliminar los detalles asociados al pedido
            $stmt = $db->prepare("DELETE FROM detalle_pedido WHERE pedido_id = ?");
            $stmt->execute([$id]);

            // Eliminar el pedido de la base de datos
            $stmt = $db->prepare("DELETE FROM pedidos WHERE id = ?");
            $stmt->execute([$id]);

            $db->commit();
            echo json_encode(["status" => "success", "message" => "Pedido eliminado del historial"]);

        } catch (Exception $e) {
            $db->rollBack();
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Error al eliminar: " . $e->getMessage()]);
        }
        break;
}
?>
