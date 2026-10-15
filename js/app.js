// ============================================
// INVERSIONES DURI C.A - JavaScript Principal
// ============================================

const isInPages = window.location.pathname.includes('/pages/');
const API_BASE = isInPages ? '../backend/api' : 'backend/api';

// Limpieza garantizada de métodos de pago obsoletos (Efectivo / Tarjeta)
function sanitizarMetodosPago() {
    const sel = document.getElementById('paymentMethod');
    if (sel) {
        const obsoletos = sel.querySelectorAll('option[value="efectivo"], option[value="tarjeta_credito"]');
        obsoletos.forEach(opt => opt.remove());
        if (sel.value === 'efectivo' || sel.value === 'tarjeta_credito' || !sel.value) {
            sel.value = 'pago_movil';
        }
    }
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sanitizarMetodosPago);
} else {
    sanitizarMetodosPago();
}
setInterval(sanitizarMetodosPago, 300);

// ============================================
// VALIDACIONES
// ============================================
const Validator = {
    email: (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
    phone: (val) => !val || /^\+?[\d\s-]{7,15}$/.test(val),
    minLength: (val, min) => val.length >= min,
    required: (val) => val.trim().length > 0,
    number: (val) => !isNaN(val) && parseFloat(val) > 0,
    
    showError: (input, msg) => {
        input.style.borderColor = '#dc3545';
        let error = input.parentElement.querySelector('.field-error');
        if (!error) {
            error = document.createElement('span');
            error.className = 'field-error';
            error.style.cssText = 'color:#dc3545;font-size:0.8rem;margin-top:4px;display:block';
            input.parentElement.appendChild(error);
        }
        error.textContent = msg;
    },
    
    clearError: (input) => {
        input.style.borderColor = '';
        const error = input.parentElement.querySelector('.field-error');
        if (error) error.remove();
    },
    
    validateForm: (fields) => {
        let valid = true;
        fields.forEach(({input, rules}) => {
            Validator.clearError(input);
            for (const [rule, params] of Object.entries(rules)) {
                let isValid = true;
                if (rule === 'required') isValid = Validator.required(input.value);
                else if (rule === 'email') isValid = Validator.email(input.value);
                else if (rule === 'phone') isValid = Validator.phone(input.value);
                else if (rule === 'minLength') isValid = Validator.minLength(input.value, params);
                else if (rule === 'number') isValid = Validator.number(input.value);
                
                if (!isValid) {
                    valid = false;
                    const msgs = {
                        required: 'Este campo es obligatorio',
                        email: 'Ingresa un email válido',
                        phone: 'Teléfono no válido',
                        minLength: `Mínimo ${params} caracteres`,
                        number: 'Debe ser un número mayor a 0'
                    };
                    Validator.showError(input, msgs[rule]);
                    break;
                }
            }
        });
        return valid;
    }
};

// ============================================
// USUARIO / SESIÓN
// ============================================
function getUser() {
    try {
        const data = localStorage.getItem('userDuri');
        if (!data) return null;
        const user = JSON.parse(data);
        if (!user || !user.rol) return null;
        // Expirar sesión automáticamente tras 8 horas de inactividad por seguridad
        if (user.timestamp && (Date.now() - user.timestamp > 8 * 60 * 60 * 1000)) {
            localStorage.removeItem('userDuri');
            return null;
        }
        return user;
    } catch(e) {
        return null;
    }
}

function isLoggedIn() {
    return getUser() !== null;
}

function isSuperUsuario() {
    const user = getUser();
    return !!(user && (user.rol === 'super_usuario' || user.rol === 'admin'));
}



function logout() {
    try {
        localStorage.removeItem('userDuri');
        sessionStorage.removeItem('welcomeShown');
    } catch(e) {
        console.error('Error al limpiar sesión:', e);
    }
    
    const banner = document.getElementById('welcomeBanner');
    if (banner) banner.remove();

    const isInPages = window.location.pathname.includes('/pages/');
    const homeUrl = (isInPages ? '../index.html' : 'index.html') + '?logout=' + Date.now();
    window.location.replace(homeUrl);
}
window.logout = logout;

// ============================================
// GESTOR DE TASA OFICIAL BCV Y MONEDA DUAL
// ============================================
const BcvManager = {
    rate: 875.65, // Tasa de respaldo oficial inicial
    source: 'oficial',
    lastUpdated: null,
    isLoaded: false,

    init() {
        this.loadCachedRate();
        this.renderTopBarWidget();
        this.updateStaticPrices();
        // Carga asíncrona reactiva sin bloquear el render inicial
        this.fetchLiveRate().then(updated => {
            if (updated) {
                this.renderTopBarWidget();
                this.updateStaticPrices();
                if (typeof sincronizarMontosUbicacion === 'function') {
                    try { sincronizarMontosUbicacion(); } catch(e) {}
                }
                if (typeof updateCart === 'function') {
                    try { updateCart(); } catch(e) {}
                }
            }
        });
    },

    loadCachedRate() {
        try {
            const cached = localStorage.getItem('duri_bcv_rate');
            if (cached) {
                const data = JSON.parse(cached);
                if (data && data.rate > 0) {
                    this.rate = parseFloat(data.rate);
                    this.lastUpdated = data.lastUpdated || null;
                    this.isLoaded = true;
                }
            }
        } catch(e) {}
    },

    async fetchLiveRate() {
        try {
            // Reutilizar tasa en caché si tiene menos de 10 minutos (ahorra cientos de peticiones HTTP innecesarias)
            const cached = localStorage.getItem('duri_bcv_rate');
            if (cached) {
                const data = JSON.parse(cached);
                if (data && data.savedAt && (Date.now() - data.savedAt < 10 * 60 * 1000) && data.rate > 0) {
                    return false;
                }
            }

            const res = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
            if (res.ok) {
                const data = await res.json();
                if (data && data.promedio > 0) {
                    this.rate = parseFloat(data.promedio);
                    this.lastUpdated = data.fechaActualizacion || new Date().toISOString();
                    this.isLoaded = true;
                    localStorage.setItem('duri_bcv_rate', JSON.stringify({
                        rate: this.rate,
                        lastUpdated: this.lastUpdated,
                        savedAt: Date.now()
                    }));
                    return true;
                }
            }
        } catch(err) {
            console.warn('No se pudo conectar a la API del BCV en vivo, utilizando tasa de respaldo:', err);
        }
        return false;
    },

    toBs(usd) {
        const r = (this && typeof this.rate === 'number' && this.rate > 0) 
            ? this.rate 
            : ((typeof BcvManager !== 'undefined' && BcvManager.rate > 0) ? BcvManager.rate : 879.12);
        return (parseFloat(usd) || 0) * r;
    },

    formatBs(amount) {
        const val = parseFloat(amount) || 0;
        return 'Bs. ' + val.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },

    formatUsd(amount) {
        const val = parseFloat(amount) || 0;
        return '$' + val.toFixed(2);
    },

    renderDualHtml(usd) {
        const u = parseFloat(usd) || 0;
        const bs = this.toBs(u);
        return `
            <div class="product-price-dual">
                <span class="product-price-usd">${this.formatUsd(u)}</span>
                <span class="product-price-bs">≈ ${this.formatBs(bs)}</span>
            </div>
        `;
    },

    renderTopBarWidget() {
        // Remueve la tasa BCV de la barra superior para mantener el diseño limpio
        document.querySelectorAll('#topBarBcvWidget, .top-bar-bcv').forEach(el => el.remove());
    },

    updateStaticPrices() {
        document.querySelectorAll('.product-card').forEach(card => {
            const priceEl = card.querySelector('.product-price');
            if (priceEl && !priceEl.dataset.bcvRendered) {
                const text = priceEl.textContent.trim();
                const match = text.match(/\$?([0-9]+(?:\.[0-9]+)?)/);
                if (match) {
                    const usd = parseFloat(match[1]);
                    priceEl.dataset.bcvRendered = "true";
                    priceEl.innerHTML = `
                        <div class="product-price-dual">
                            <span class="product-price-usd">${this.formatUsd(usd)}</span>
                            <span class="product-price-bs">≈ ${this.formatBs(this.toBs(usd))}</span>
                        </div>
                    `;
                }
            }
        });
    }
};
window.BcvManager = BcvManager;

// Función para copiar datos de Pago Móvil o texto con 1 clic
function copyTextToClipboard(text, btnElement = null) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            if (btnElement) {
                const originalHtml = btnElement.innerHTML;
                btnElement.innerHTML = '<i class="fas fa-check"></i> ¡Copiado!';
                btnElement.style.background = '#10B981';
                btnElement.style.color = '#ffffff';
                setTimeout(() => {
                    btnElement.innerHTML = originalHtml;
                    btnElement.style.background = '';
                    btnElement.style.color = '';
                }, 1600);
            }
            showToast('¡Copiado al portapapeles!');
        }).catch(() => fallbackCopyText(text, btnElement));
    } else {
        fallbackCopyText(text, btnElement);
    }
}
function fallbackCopyText(text, btnElement) {
    const input = document.createElement('textarea');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    try {
        document.execCommand('copy');
        showToast('¡Copiado al portapapeles!');
        if (btnElement) {
            const originalHtml = btnElement.innerHTML;
            btnElement.innerHTML = '<i class="fas fa-check"></i> ¡Copiado!';
            setTimeout(() => { btnElement.innerHTML = originalHtml; }, 1600);
        }
    } catch(e) {}
    document.body.removeChild(input);
}
window.copyTextToClipboard = copyTextToClipboard;

// ============================================
// NAVBAR
function bootApp() {
    try { initNav(); } catch(e) { console.error('initNav error:', e); }
    try { BcvManager.init(); } catch(e) { console.error('BcvManager error:', e); }
    try { initPage(); } catch(e) { console.error('initPage error:', e); }
    try { showUserBadge(); } catch(e) {}
    try { showInventoryLink(); } catch(e) {}
    try { initSuperAdminNotifications(); } catch(e) {}
    try { initCinematicEffects(); } catch(e) {}
    try { initFloatingCart(); } catch(e) {}
    try { initWhatsApp(); } catch(e) {}
    try { initDuriChatbot(); } catch(e) { console.error('initDuriChatbot error:', e); }
    try { initNumericInputs(); } catch(e) {}
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootApp);
} else {
    bootApp();
}

function initWhatsApp() {
    const div = document.createElement('div');
    div.className = 'whatsapp-float';
    div.innerHTML = '<a href="https://wa.me/584121234567?text=Hola%2C%20me%20interesa%20hacer%20un%20pedido%20en%20Inversiones%20Duri" target="_blank"><i class="fab fa-whatsapp"></i> Escríbenos</a><div class="wa-tooltip">¿Necesitas ayuda? Chatea con nosotros</div>';
    document.body.appendChild(div);
}

function getOrCreateFloatingStack() {
    let stack = document.getElementById('floatingActionsStack');
    if (!stack) {
        stack = document.createElement('div');
        stack.id = 'floatingActionsStack';
        stack.className = 'floating-actions-stack';
        document.body.appendChild(stack);
    }
    return stack;
}

function initFloatingCart() {
    if (document.querySelector('.floating-cart-btn')) return;

    // Cart Panel (Drawer modal independiente)
    const panelHtml = `
    <div class="cart-panel" id="cartPanel">
        <div class="cart-panel-header">
            <h4><i class="fas fa-shopping-cart"></i> Mi Pedido</h4>
            <button onclick="toggleCartPanel()">&times;</button>
        </div>
        <div class="cart-panel-body" id="cartPanelBody">
            <div class="cart-empty"><i class="fas fa-shopping-basket"></i><p>Tu carrito está vacío</p></div>
        </div>
        <div class="cart-panel-footer">
            <div class="cart-panel-total"><span>Total:</span><strong id="cartPanelTotal">$0.00</strong></div>
            <a href="pedidos.html" class="btn btn-primary btn-block"><i class="fas fa-paper-plane"></i> Ver Pedido</a>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', panelHtml);

    // Botón del Carrito dentro del contenedor unificado
    const stack = getOrCreateFloatingStack();
    const cartWrapper = document.createElement('div');
    cartWrapper.className = 'floating-cart-item';
    cartWrapper.innerHTML = `
        <button class="floating-cart-btn" onclick="toggleCartPanel()" title="Ver carrito" aria-label="Abrir carrito">
            <i class="fas fa-shopping-cart"></i>
            <span class="cart-count" id="floatingCartCount" style="display:none">0</span>
        </button>
    `;
    stack.appendChild(cartWrapper);
    updateFloatingCart();
}

function toggleCartPanel() {
    const panel = document.getElementById('cartPanel');
    if (panel) panel.classList.toggle('show');
}

// ============================================
// CHATBOT INTELIGENTE: DURIBOT
// ============================================
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function initDuriChatbot() {
    if (document.getElementById('duribotWindow') || document.getElementById('duribotBtn')) return;

    // Ventana de Chat independiente
    const windowHtml = `
    <div class="duribot-window" id="duribotWindow">
        <!-- Header -->
        <div class="duribot-header">
            <div class="duribot-header-info">
                <div class="duribot-avatar">
                    <i class="fas fa-robot"></i>
                </div>
                <div>
                    <h4 class="duribot-header-title">DuriBot</h4>
                    <span class="duribot-header-status">En línea • Respuestas al instante</span>
                </div>
            </div>
            <div class="duribot-header-actions">
                <button class="duribot-close-btn" onclick="toggleDuriChatbot()" title="Cerrar chat">&times;</button>
            </div>
        </div>

        <!-- Body (Historial de Mensajes) -->
        <div class="duribot-body" id="duribotBody">
            <div class="duribot-msg-row bot">
                <div class="duribot-msg-bubble">
                    ¡Hola! 👋 Soy <strong>DuriBot</strong>, el asistente virtual de <strong>Inversiones Duri C.A</strong>.<br><br>
                    ¿En qué te puedo asesorar hoy? Puedes escribir lo que buscas o elegir una opción rápida:
                    <div class="duribot-chips">
                        <button type="button" class="duribot-chip" onclick="sendDuriQuickReply('Tasa BCV del día')">🇻🇪 Tasa BCV</button>
                        <button type="button" class="duribot-chip" onclick="sendDuriQuickReply('Datos para Pago Móvil')">📱 Pago Móvil</button>
                        <button type="button" class="duribot-chip" onclick="sendDuriQuickReply('¿Qué productos tienen en catálogo?')">📦 Ver productos</button>
                        <button type="button" class="duribot-chip" onclick="sendDuriQuickReply('¿Cómo son los envíos y entregas?')">🚚 Envíos y Delivery</button>
                        <button type="button" class="duribot-chip" onclick="sendDuriQuickReply('¿Dónde están ubicados y cuál es el horario?')">📍 Ubicación y Horario</button>
                        <button type="button" class="duribot-chip" onclick="sendDuriQuickReply('Quiero hablar con un asesor')">🟢 Hablar con un asesor</button>
                    </div>
                    <span class="duribot-time">${getFormattedTime()}</span>
                </div>
            </div>
        </div>

        <!-- Footer (Input) -->
        <div class="duribot-footer">
            <form class="duribot-input-form" id="duribotForm" onsubmit="handleDuriSubmit(event)">
                <input type="text" class="duribot-input" id="duribotInput" placeholder="Escribe tu pregunta o producto..." autocomplete="off">
                <button type="submit" class="duribot-send-btn" title="Enviar mensaje">
                    <i class="fas fa-paper-plane"></i>
                </button>
            </form>
            <p class="duribot-branding"><i class="fas fa-bolt" style="color:#e85d26;"></i> Inversiones Duri C.A • Asistente Virtual 24/7</p>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', windowHtml);

    // Botón de DuriBot dentro del contenedor unificado (arriba del carrito)
    const stack = getOrCreateFloatingStack();
    const duriWrapper = document.createElement('div');
    duriWrapper.className = 'duribot-float-item';
    duriWrapper.innerHTML = `
        <div class="duribot-tooltip" id="duribotTooltip">💬 ¡Hola! ¿En qué te ayudo?</div>
        <button class="duribot-btn" id="duribotBtn" onclick="toggleDuriChatbot()" title="Asistente Virtual Duri" aria-label="Abrir asistente virtual">
            <i class="fas fa-robot"></i>
            <span class="duribot-online-dot"></span>
        </button>
    `;
    stack.prepend(duriWrapper);

    // Mostrar tooltip automáticamente por 5 segundos
    setTimeout(() => {
        const tooltip = document.getElementById('duribotTooltip');
        if (tooltip && !document.getElementById('duribotWindow').classList.contains('open')) {
            tooltip.classList.add('show-auto');
            setTimeout(() => tooltip.classList.remove('show-auto'), 5000);
        }
    }, 2500);
}

function getFormattedTime() {
    const d = new Date();
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function toggleDuriChatbot() {
    const win = document.getElementById('duribotWindow');
    if (!win) return;
    const isOpen = win.classList.toggle('open');
    if (isOpen) {
        const tooltip = document.getElementById('duribotTooltip');
        if (tooltip) tooltip.classList.remove('show-auto');
        setTimeout(() => {
            const input = document.getElementById('duribotInput');
            if (input) input.focus();
            scrollDuriChat();
        }, 150);
    }
}

function scrollDuriChat() {
    const body = document.getElementById('duribotBody');
    if (body) {
        body.scrollTop = body.scrollHeight;
    }
}

function appendDuriMessage(text, sender = 'bot', customHtml = null) {
    const body = document.getElementById('duribotBody');
    if (!body) return;

    const row = document.createElement('div');
    row.className = `duribot-msg-row ${sender}`;
    
    const bubble = document.createElement('div');
    bubble.className = 'duribot-msg-bubble';

    if (customHtml) {
        bubble.innerHTML = customHtml;
    } else {
        bubble.innerHTML = `${text}<span class="duribot-time">${getFormattedTime()}</span>`;
    }

    row.appendChild(bubble);
    body.appendChild(row);
    scrollDuriChat();
}

function showDuriTyping() {
    const body = document.getElementById('duribotBody');
    if (!body || document.getElementById('duribotTyping')) return;

    const row = document.createElement('div');
    row.className = 'duribot-msg-row bot';
    row.id = 'duribotTyping';
    row.innerHTML = `<div class="duribot-typing"><span></span><span></span><span></span></div>`;
    body.appendChild(row);
    scrollDuriChat();
}

function hideDuriTyping() {
    const typing = document.getElementById('duribotTyping');
    if (typing) typing.remove();
}

async function handleDuriSubmit(e) {
    if (e) e.preventDefault();
    const input = document.getElementById('duribotInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    appendDuriMessage(escapeHtml(text), 'user');
    showDuriTyping();

    // Procesar respuesta con una pequeña pausa natural
    setTimeout(async () => {
        hideDuriTyping();
        await processDuriQuery(text);
    }, 500);
}

window.sendDuriQuickReply = function(text) {
    const input = document.getElementById('duribotInput');
    if (input) input.value = text;
    handleDuriSubmit(null);
};

window.addDuriBotProductToCart = async function(id) {
    let allProducts = [];
    try {
        allProducts = await getFallbackProducts();
    } catch(e) {}
    const p = (allProducts || []).find(it => String(it.id) === String(id));
    const name = p ? p.nombre : 'Producto';
    const price = p ? parseFloat(p.precio_venta || 0) : 0;

    const existing = cart.find(it => String(it.id) === String(id));
    if (existing) {
        existing.qty += 1;
    } else {
        cart.push({ id: Number(id), name, price, qty: 1 });
    }
    try { saveCart(); } catch(e) {}
    try { updateFloatingCart(); } catch(e) {}
    showToast(`¡${name} agregado al pedido!`);

    const pedidosUrl = (window.location.pathname.includes('/pages/') ? 'pedidos.html' : 'pages/pedidos.html');
    appendDuriMessage('', 'bot', `
        ✅ ¡Listo! Agregué <strong>${escapeHtml(name)}</strong> ($${price.toFixed(2)}) a tu carrito de compras.<br><br>
        <a href="${pedidosUrl}" class="btn btn-sm btn-primary" style="display:inline-flex; align-items:center; gap:6px; padding:6px 12px; border-radius:8px; text-decoration:none; font-weight:700;">
            <i class="fas fa-shopping-cart"></i> Ver Carrito y Procesar Pedido
        </a>
        <span class="duribot-time">${getFormattedTime()}</span>
    `);
};

async function processDuriQuery(rawQuery) {
    const q = rawQuery.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    // 0. Saludos y bienvenida
    const greetings = ['hola', 'buenas', 'buen dia', 'buenos dias', 'buenas tardes', 'buenas noches', 'que tal', 'saludos', 'hey', 'alo'];
    if (greetings.some(g => q === g || q.startsWith(g + ' ') || q.endsWith(' ' + g))) {
        const html = `
            ¡Hola! 👋 ¡Un placer saludarte! Estoy aquí para ayudarte en lo que necesites:<br><br>
            • Buscar artículos escolares y de papelería en nuestro catálogo.<br>
            • Informarte sobre métodos de pago (Pago Móvil y Transferencia).<br>
            • Consultar delivery en Maracay o envíos nacionales.<br>
            • Conectarte directamente con un asesor.<br><br>
            ¿Qué te gustaría ver?
            <div class="duribot-chips">
                <button type="button" class="duribot-chip" onclick="sendDuriQuickReply('Ver productos')">📦 Ver Productos</button>
                <button type="button" class="duribot-chip" onclick="sendDuriQuickReply('Formas de pago')">💳 Formas de Pago</button>
                <button type="button" class="duribot-chip" onclick="sendDuriQuickReply('Zonas de entrega')">🚚 Delivery / Envíos</button>
                <button type="button" class="duribot-chip" onclick="sendDuriQuickReply('Hablar con asesor')">🟢 Hablar con Asesor</button>
            </div>
            <span class="duribot-time">${getFormattedTime()}</span>
        `;
        appendDuriMessage('', 'bot', html);
        return;
    }

    // 0.1 Agradecimientos
    if (q.includes('gracias') || q.includes('muchas gracias') || q.includes('agradecido') || q.includes('excelente gracias')) {
        const html = `
            ¡Siempre a tu orden! 😊 En <strong>Inversiones Duri C.A</strong> nos encanta atenderte. Si necesitas algo más, aquí estaré. ¡Que tengas un excelente día!
            <span class="duribot-time">${getFormattedTime()}</span>
        `;
        appendDuriMessage('', 'bot', html);
        return;
    }

    // 1. Asesor Humano / WhatsApp
    if (q.includes('asesor') || q.includes('humano') || q.includes('persona') || q.includes('whatsapp') || q.includes('telefono') || q.includes('llamar')) {
        const waText = encodeURIComponent(`Hola Inversiones Duri, necesito atención personalizada con un asesor. Estaba preguntando: "${rawQuery}"`);
        const waUrl = `https://wa.me/584121234567?text=${waText}`;
        const html = `
            ¡Con gusto! Puedes comunicarte de inmediato con uno de nuestros ejecutivos de atención:<br><br>
            📞 <strong>Teléfono:</strong> +58 412-1234567<br>
            🟢 <strong>WhatsApp Directo:</strong><br>
            <a href="${waUrl}" target="_blank" class="btn btn-sm" style="display:inline-flex; align-items:center; gap:6px; background:#25D366; color:#ffffff; padding:8px 14px; border-radius:100px; text-decoration:none; font-weight:700; margin-top:8px; box-shadow:0 3px 10px rgba(37,211,102,0.3);">
                <i class="fab fa-whatsapp" style="font-size:1.1rem;"></i> Chatear con Asesor
            </a>
            <span class="duribot-time">${getFormattedTime()}</span>
        `;
        appendDuriMessage('', 'bot', html);
        return;
    }

    // 1.1 Redes Sociales / Instagram & Facebook
    if (q.includes('instagram') || q.includes('ig') || q.includes('redes') || q.includes('red social') || q.includes('facebook') || q.includes('fb') || q.includes('cuenta de instagram') || q.includes('cuenta de facebook')) {
        const html = `
            🌐 <strong>¡Síguenos en nuestras Redes Oficiales!</strong><br><br>
            Entérate de nuevas ofertas, promociones y novedades:<br><br>
            <div style="display:flex; flex-direction:column; gap:8px; margin-top:4px;">
                <a href="https://www.instagram.com/inversionesdurica/" target="_blank" rel="noopener noreferrer" class="btn btn-sm" style="display:inline-flex; align-items:center; gap:8px; background:linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888); color:#ffffff; padding:9px 16px; border-radius:100px; text-decoration:none; font-weight:700; box-shadow:0 3px 12px rgba(220,39,67,0.35);">
                    <i class="fab fa-instagram" style="font-size:1.2rem;"></i> Instagram (@inversionesdurica)
                </a>
                <a href="https://www.facebook.com/InversionesDuri?locale=es_LA" target="_blank" rel="noopener noreferrer" class="btn btn-sm" style="display:inline-flex; align-items:center; gap:8px; background:#1877F2; color:#ffffff; padding:9px 16px; border-radius:100px; text-decoration:none; font-weight:700; box-shadow:0 3px 12px rgba(24,119,242,0.35);">
                    <i class="fab fa-facebook-f" style="font-size:1.1rem;"></i> Facebook (Inversiones Duri)
                </a>
            </div>
            <span class="duribot-time">${getFormattedTime()}</span>
        `;
        appendDuriMessage('', 'bot', html);
        return;
    }

    // 1.2 Tasa Oficial BCV / Dólar / Bolívares
    if (q.includes('tasa') || q.includes('bcv') || q.includes('a como') || q.includes('precio del dolar') || q.includes('dolar hoy') || q.includes('bolivares') || q.includes('cambio')) {
        const rateStr = BcvManager.formatBs(BcvManager.rate).replace('Bs. ', '');
        const html = `
            🇻🇪 <strong>Tasa Oficial BCV del Día:</strong><br><br>
            Nuestra tasa de hoy es de <strong style="color:#d97706;font-size:1.15rem;">${rateStr} Bs/$</strong> (Banco Central de Venezuela).<br><br>
            • Todos los precios del catálogo se recalculan en tiempo real a esta tasa.<br>
            • Aceptamos Pagos Móviles y Transferencias en Bolívares al monto exacto.<br>
            <div class="duribot-chips" style="margin-top:8px;">
                <button type="button" class="duribot-chip" onclick="sendDuriQuickReply('Ver productos')">📦 Ver Productos en Catálogo</button>
                <button type="button" class="duribot-chip" onclick="sendDuriQuickReply('Datos para Pago Móvil')">📱 Datos de Pago Móvil</button>
            </div>
            <span class="duribot-time">${getFormattedTime()}</span>
        `;
        appendDuriMessage('', 'bot', html);
        return;
    }

    // 1.3 Datos de Pago Móvil directos
    if (q.includes('datos pago') || q.includes('pago movil') || q.includes('datos bancarios') || q.includes('como pago')) {
        const rateStr = BcvManager.formatBs(BcvManager.rate).replace('Bs. ', '');
        const pedidosUrl = (window.location.pathname.includes('/pages/') ? 'pedidos.html' : 'pages/pedidos.html');
        const html = `
            📱 <strong>Datos Oficiales para Pago Móvil:</strong><br><br>
            <div class="pago-movil-card" style="margin:6px 0;padding:12px;background:#fff8f5;border:1px solid #fed7aa;border-radius:10px;">
                <div style="font-size:0.82rem;line-height:1.7;">
                    • 🏦 <strong>Banco:</strong> Banco de Venezuela (0102)<br>
                    • 📱 <strong>Teléfono:</strong> 0412-1234567<br>
                    • 🪪 <strong>RIF:</strong> J-50123456-7<br>
                    • 🇻🇪 <strong>Tasa BCV del día:</strong> ${rateStr} Bs/$<br>
                </div>
                <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
                    <button type="button" class="btn-copy-mini" onclick="copyTextToClipboard('04121234567', this)">📋 Copiar Teléfono</button>
                    <button type="button" class="btn-copy-mini" onclick="copyTextToClipboard('J501234567', this)">📋 Copiar RIF</button>
                </div>
            </div>
            Puedes armar tu orden en la página de <a href="${pedidosUrl}" style="color:#e85d26;font-weight:700;">Pedidos</a> y validar tu comprobante.
            <span class="duribot-time">${getFormattedTime()}</span>
        `;
        appendDuriMessage('', 'bot', html);
        return;
    }

    // 2. Formas de Pago Generales
    if (q.includes('pago') || q.includes('pagar') || q.includes('transferencia') || q.includes('cuenta') || q.includes('banco') || q.includes('divisa') || q.includes('efectivo') || q.includes('tarjeta')) {
        const rateStr = BcvManager.formatBs(BcvManager.rate).replace('Bs. ', '');
        const html = `
            💳 <strong>Formas de Pago Aceptadas:</strong><br><br>
            Trabajamos con métodos rápidos y 100% verificados:<br>
            • 📱 <strong>Pago Móvil:</strong> Banco de Venezuela y Banesco (al cambio oficial BCV de <strong>${rateStr} Bs/$</strong>).<br>
            • 🏦 <strong>Transferencia Bancaria:</strong> Cuentas nacionales autorizadas.<br><br>
            💡 <em>Al enviar tu pedido por la web, puedes adjuntar tu referencia y confirmar por WhatsApp.</em>
            <div class="duribot-chips">
                <button type="button" class="duribot-chip" onclick="sendDuriQuickReply('Datos para Pago Móvil')">📱 Ver Datos Pago Móvil</button>
                <button type="button" class="duribot-chip" onclick="sendDuriQuickReply('¿Cómo hago un pedido?')">🛒 ¿Cómo hacer un pedido?</button>
            </div>
            <span class="duribot-time">${getFormattedTime()}</span>
        `;
        appendDuriMessage('', 'bot', html);
        return;
    }

    // 3. Envíos y Delivery (Solo Estado Aragua)
    if (q.includes('envio') || q.includes('delivery') || q.includes('entrega') || q.includes('maracay') || q.includes('cagua') || q.includes('turmero') || q.includes('valencia') || q.includes('caracas') || q.includes('aragua') || q.includes('mrw') || q.includes('zoom') || q.includes('tealca')) {
        const pedidosUrl = (window.location.pathname.includes('/pages/') ? 'pedidos.html' : 'pages/pedidos.html');
        const html = `
            🛵 <strong>Cobertura Exclusiva en el Estado Aragua:</strong><br><br>
            • 📍 <strong>Entregas en Aragua:</strong> Realizamos cotizaciones y despachos únicamente dentro del <strong>Estado Aragua</strong> (Maracay Centro GRATIS, Zonas Urbanas, El Limón, Turmero, Cagua, Palo Negro, La Victoria, etc.).<br>
            • 🚫 <strong>Fuera del Estado Aragua:</strong> No es posible cotizar ni realizar entregas fuera del estado (Carabobo, Valencia, Caracas u otras entidades). Para clientes foráneos disponemos de la opción <strong>"Retiro en Tienda"</strong> en nuestra sede comercial de Maracay.<br><br>
            ¿Deseas verificar tu sector dentro del Estado Aragua?
            <div class="duribot-chips">
                <button type="button" class="duribot-chip" onclick="window.location.href='${pedidosUrl}'">📍 Calcular Delivery en Aragua</button>
                <button type="button" class="duribot-chip" onclick="sendDuriQuickReply('Quiero hablar con un asesor')">🟢 Hablar con un asesor</button>
            </div>
            <span class="duribot-time">${getFormattedTime()}</span>
        `;
        appendDuriMessage('', 'bot', html);
        return;
    }

    // 4. Ubicación, Contacto y Horarios
    if (q.includes('ubicacion') || q.includes('donde estan') || q.includes('direccion') || q.includes('horario') || q.includes('hora') || q.includes('abren') || q.includes('cierran') || q.includes('tienda') || q.includes('local') || q.includes('correo') || q.includes('email') || q.includes('contacto')) {
        const contactoUrl = (window.location.pathname.includes('/pages/') ? 'contacto.html' : 'pages/contacto.html');
        const html = `
            📍 <strong>Ubicación y Canales Oficiales:</strong><br><br>
            🏢 <strong>Sede:</strong> Feria Escolar Inversiones Duri, Maracay, Edo. Aragua.<br>
            ⏰ <strong>Horario:</strong> Lunes a Sábado de <strong>8:00 AM a 6:00 PM</strong>.<br>
            📩 <strong>Correo Oficial:</strong> <a href="mailto:inversionesduri@gmail.com" style="color:#e85d26; font-weight:700;">inversionesduri@gmail.com</a><br>
            📞 <strong>Teléfono:</strong> +58 412-1234567<br>
            <div class="duribot-chips" style="margin-top:8px;">
                <a href="https://maps.app.goo.gl/b7vwPaeU1rCJfcZX7" target="_blank" rel="noopener noreferrer" class="duribot-chip" style="text-decoration:none; display:inline-flex; align-items:center; gap:4px; font-weight:600;">📍 Abrir en Google Maps</a>
                <button type="button" class="duribot-chip" onclick="window.location.href='${contactoUrl}'">📞 Ir a Contacto</button>
            </div>
            <span class="duribot-time">${getFormattedTime()}</span>
        `;
        appendDuriMessage('', 'bot', html);
        return;
    }

    // 5. Cómo comprar / hacer pedidos
    if (q.includes('pedido') || q.includes('comprar') || q.includes('orden') || q.includes('carrito') || q.includes('pasos')) {
        const pedidosUrl = (window.location.pathname.includes('/pages/') ? 'pedidos.html' : 'pages/pedidos.html');
        const html = `
            🛒 <strong>¿Cómo realizar tu pedido en 3 simples pasos?</strong><br><br>
            <strong>1.</strong> Explora nuestro catálogo y agrega los productos deseados al carrito.<br>
            <strong>2.</strong> Dirígete a la sección de <a href="${pedidosUrl}" style="color:#e85d26; font-weight:700;">Pedidos</a> para indicar tus datos y fijar tu dirección con el mapa/GPS.<br>
            <strong>3.</strong> Pulsa <em>"Procesar Pedido"</em>: se generará tu orden oficial y se abrirá nuestro WhatsApp directo con tu comprobante listo para despachar.<br>
            <div class="duribot-chips">
                <button type="button" class="duribot-chip" onclick="sendDuriQuickReply('Ver productos')">📦 Ver productos</button>
                <button type="button" class="duribot-chip" onclick="window.location.href='${pedidosUrl}'">📝 Realizar Pedido Ahora</button>
            </div>
            <span class="duribot-time">${getFormattedTime()}</span>
        `;
        appendDuriMessage('', 'bot', html);
        return;
    }

    // 6. Búsqueda de Productos en el Catálogo con Moneda Dual
    let allProducts = [];
    try {
        allProducts = await getFallbackProducts();
    } catch(e) {}

    const isCatalogIntent = q.includes('producto') || q.includes('catalogo') || q.includes('precio') || q.includes('tienen') || q.includes('venden') || q.includes('cuanto') || q.includes('costo') || q.length > 2;

    if (isCatalogIntent && allProducts && allProducts.length > 0) {
        // Filtrar productos que coincidan con la búsqueda
        const stopWords = ['de', 'la', 'el', 'los', 'las', 'un', 'una', 'para', 'en', 'por', 'que', 'tienen', 'venden', 'precio', 'costo', 'cuanto', 'cuesta', 'productos', 'catalogo'];
        const keywords = q.split(/\s+/).filter(w => w.length > 2 && !stopWords.includes(w));

        let matches = [];
        if (keywords.length > 0) {
            matches = allProducts.filter(p => {
                const normName = (p.nombre || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                const normDesc = (p.descripcion || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                const normCat = (p.categoria_nombre || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                return keywords.some(k => normName.includes(k) || normDesc.includes(k) || normCat.includes(k));
            });
        }

        // Si fue una petición explícita de catálogo sin palabras específicas
        if (matches.length === 0 && (q.includes('catalogo') || q.includes('productos') || q.includes('ver todo'))) {
            matches = allProducts.slice(0, 4);
        }

        if (matches.length > 0) {
            const top = matches.slice(0, 4);
            const logoPath = isInPages ? '../img/logo-duri.png' : 'img/logo-duri.png';
            let cardsHtml = top.map(p => {
                const img = (typeof getProductImageUrl === 'function') ? getProductImageUrl(p) : logoPath;
                const priceUsd = parseFloat(p.precio_venta || 0).toFixed(2);
                const priceBs = BcvManager.formatBs(BcvManager.toBs(p.precio_venta));
                return `
                    <div class="duribot-product-card">
                        <img src="${img}" class="duribot-product-img" alt="${escapeHtml(p.nombre)}" onerror="this.src='${logoPath}'">
                        <div class="duribot-product-info">
                            <h5 class="duribot-product-title">${escapeHtml(p.nombre)}</h5>
                            <p class="duribot-product-price">
                                <strong>$${priceUsd}</strong>
                                <span style="font-size:0.7rem; color:#64748b; margin-left:4px;">(≈ ${priceBs})</span>
                                <span style="font-size:0.7rem; color:#10b981; margin-left:4px; font-weight:600;">• ${p.stock_actual || 10} disp.</span>
                            </p>
                        </div>
                        <button type="button" class="duribot-product-add" onclick="addDuriBotProductToCart(${p.id})" title="Agregar al pedido">
                            <i class="fas fa-cart-plus"></i> Pedir
                        </button>
                    </div>
                `;
            }).join('');

            const productosUrl = isInPages ? 'productos.html' : 'pages/productos.html';
            const html = `
                📦 Encontré estos productos para ti:<br>
                ${cardsHtml}
                <div style="margin-top:10px; display:flex; gap:6px; flex-wrap:wrap;">
                    <a href="${productosUrl}" class="btn btn-sm btn-outline" style="font-size:0.75rem; padding:5px 10px; border-radius:8px; text-decoration:none;">
                        <i class="fas fa-th-list"></i> Ver todo el Catálogo
                    </a>
                    <button type="button" class="duribot-chip" onclick="sendDuriQuickReply('Tasa BCV del día')">🇻🇪 Ver Tasa BCV</button>
                    <button type="button" class="duribot-chip" onclick="sendDuriQuickReply('Datos para Pago Móvil')">📱 Pago Móvil</button>
                </div>
                <span class="duribot-time">${getFormattedTime()}</span>
            `;
            appendDuriMessage('', 'bot', html);
            return;
        }
    }

    // 7. Respuesta por defecto
    const productosUrlDefault = isInPages ? 'productos.html' : 'pages/productos.html';
    const waUrlDefault = `https://wa.me/584121234567?text=${encodeURIComponent(`Hola Inversiones Duri, tengo una consulta: "${rawQuery}"`)}`;
    const html = `
        Entiendo tu consulta sobre <em>"${escapeHtml(rawQuery)}"</em>. 😊<br><br>
        ¿Te gustaría revisar nuestro catálogo de artículos escolares y de oficina, o prefieres que un asesor te responda directamente por WhatsApp?<br><br>
        <div class="duribot-chips">
            <button type="button" class="duribot-chip" onclick="sendDuriQuickReply('Ver productos')">📦 Ver Productos Disponibles</button>
            <button type="button" class="duribot-chip" onclick="sendDuriQuickReply('Formas de pago')">💳 Formas de Pago</button>
            <a href="${waUrlDefault}" target="_blank" class="duribot-chip" style="background:#25D366; color:#ffffff; border-color:#25D366; text-decoration:none;">
                <i class="fab fa-whatsapp"></i> Hablar por WhatsApp
            </a>
        </div>
        <span class="duribot-time">${getFormattedTime()}</span>
    `;
    appendDuriMessage('', 'bot', html);
}

function updateFloatingCart() {
    const count = cart.reduce((sum, it) => sum + it.qty, 0);
    const total = cart.reduce((sum, it) => sum + (it.price * it.qty), 0);
    const countEl = document.getElementById('floatingCartCount');
    const body = document.getElementById('cartPanelBody');
    const totalEl = document.getElementById('cartPanelTotal');
    
    if (countEl) {
        countEl.style.display = count > 0 ? 'flex' : 'none';
        countEl.textContent = count;
    }
    
    if (!body) return;
    
    if (cart.length === 0) {
        body.innerHTML = '<div class="cart-empty"><i class="fas fa-shopping-basket"></i><p>Tu carrito está vacío</p></div>';
    } else {
        body.innerHTML = cart.map((it, i) => `
            <div class="cart-panel-item">
                <div class="cart-panel-item-info">
                    <div class="cart-panel-item-name">${it.name}</div>
                    <div class="cart-panel-item-price">$${it.price.toFixed(2)} c/u</div>
                </div>
                <div class="cart-panel-item-qty">
                    <button onclick="updateQty(${i},-1)">-</button>
                    <span>${it.qty}</span>
                    <button onclick="updateQty(${i},1)">+</button>
                </div>
            </div>
        `).join('');
    }
    
    if (totalEl) totalEl.textContent = '$' + total.toFixed(2);
}

function initCinematicEffects() {
    // Scroll Reveal - observer para elementos existentes Y futuros
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
    
    function observeReveals() {
        document.querySelectorAll('.feature-card, .service-card, .stat-card, .contact-item, .order-row, .category-card').forEach(el => {
            if (!el.classList.contains('reveal')) {
                el.classList.add('reveal');
                observer.observe(el);
            }
        });
    }
    
    observeReveals();
    // Re-observar cada 500ms por si se cargan contenido dinámico
    setInterval(observeReveals, 500);
    
    // Particles in hero
    const hero = document.querySelector('.hero');
    if (hero && !hero.querySelector('.particles')) {
        const particlesDiv = document.createElement('div');
        particlesDiv.className = 'particles';
        for (let i = 0; i < 20; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            p.style.left = Math.random() * 100 + '%';
            p.style.animationDuration = (Math.random() * 10 + 8) + 's';
            p.style.animationDelay = Math.random() * 5 + 's';
            p.style.width = p.style.height = (Math.random() * 4 + 3) + 'px';
            particlesDiv.appendChild(p);
        }
        hero.appendChild(particlesDiv);
    }
    
    // Smooth hardware-accelerated parallax for hero shapes (60fps)
    let isParallaxTicking = false;
    let shapesCache = null;
    window.addEventListener('scroll', () => {
        if (!isParallaxTicking) {
            window.requestAnimationFrame(() => {
                const scrollY = window.scrollY;
                if (scrollY < 1200) {
                    if (!shapesCache) shapesCache = document.querySelectorAll('.shape');
                    if (shapesCache.length > 0) {
                        shapesCache.forEach((shape, i) => {
                            const speed = (i + 1) * 0.15;
                            shape.style.transform = `translate3d(0, ${(scrollY * speed).toFixed(1)}px, 0)`;
                        });
                    }
                }
                isParallaxTicking = false;
            });
            isParallaxTicking = true;
        }
    }, { passive: true });
}

function showInventoryLink() {
    const user = JSON.parse(localStorage.getItem('userDuri') || 'null');
    const nav = document.querySelector('.nav-menu');
    if (!nav || !user) return;
    
    // Agregar link de inventario solo para super_usuario
    if (user.rol === 'super_usuario') {
        const existing = document.getElementById('invNavLink');
        if (existing) return;
        const isInPages = window.location.pathname.includes('/pages/');
        const li = document.createElement('li');
        li.id = 'invNavLink';
        const a = document.createElement('a');
        a.href = isInPages ? 'inventario.html' : 'pages/inventario.html';
        a.className = 'nav-link';
        a.innerHTML = '<i class="fas fa-warehouse"></i> Inventario';
        if (window.location.pathname.includes('inventario')) a.classList.add('active');
        li.appendChild(a);
        // Insertar después de Pedidos
        const pedidosLink = nav.querySelector('a[href*="pedidos"]');
        if (pedidosLink) pedidosLink.parentElement.after(li);
        else nav.appendChild(li);
    }
}

function showUserBadge() {
    const raw = localStorage.getItem('userDuri');
    const user = raw ? JSON.parse(raw) : null;
    const nav = document.querySelector('.nav-menu');

    const existing = document.getElementById('userBadge');
    if (existing) existing.remove();

    if (!user || !user.rol) return;

    const rolLabels = { super_usuario: 'Super Admin', operador: 'Operador', usuario: 'Usuario' };
    const rolColors = { super_usuario: '#EF7E26', operador: '#28a745', usuario: '#6c757d' };
    const rolEmoji = { super_usuario: '👑', operador: '⚙️', usuario: '👤' };

    // Actualizar icono en footer si está presente
    const footerLock = document.querySelector('.admin-login-link');
    if (footerLock) {
        footerLock.innerHTML = '<i class="fas fa-sign-out-alt"></i>';
        footerLock.title = 'Cerrar sesión de Administrador (' + (user.nombre || '') + ')';
        footerLock.href = 'javascript:void(0)';
        footerLock.onclick = function(e) {
            e.preventDefault();
            logout();
        };
    }

    if (!nav) return;

    // Crear contenedor de usuario y botón de salir
    const li = document.createElement('li');
    li.id = 'userBadge';
    li.className = 'user-nav-item';
    
    const userName = (user.nombre || 'Admin').split(' ')[0];
    const userRole = rolLabels[user.rol] || 'Admin';
    const roleColor = rolColors[user.rol] || '#EF7E26';

    const isSuper = user.rol === 'super_usuario' || user.rol === 'admin';
    const bellBtnHtml = isSuper ? `
        <button type="button" class="admin-notif-bell-btn" id="superAdminBellBtn" onclick="irAPedidosValidacion()" title="Validar pagos de pedidos pendientes">
            <i class="fas fa-bell"></i>
            <span class="bell-count" id="adminBellCount" style="display:none;">0</span>
        </button>
    ` : '';

    li.innerHTML = `
        <div class="user-nav-container">
            <div class="user-badge-mobile-info">
                <span style="font-size:1.05rem;">${rolEmoji[user.rol] || '👑'}</span>
                <span style="font-weight:700;font-size:0.86rem;color:#ffffff;">${userName}</span>
                <span class="role-tag" style="background:${roleColor};color:#fff;padding:2px 7px;border-radius:6px;font-size:0.68rem;font-weight:700;">${userRole}</span>
            </div>
            ${bellBtnHtml}
            <button type="button" class="admin-logout-btn-mobile" onclick="logout()" title="Cerrar sesión de Administrador (${userName})">
                <i class="fas fa-sign-out-alt"></i> <span class="logout-btn-text">Salir</span>
            </button>
        </div>
    `;

    nav.appendChild(li);

    // Notificación flotante elegante
    if (!sessionStorage.getItem('welcomeShown')) {
        sessionStorage.setItem('welcomeShown', '1');
        const welcome = document.createElement('div');
        welcome.id = 'welcomeBanner';

        welcome.innerHTML = `
            <div style="
                display: inline-flex;
                align-items: center;
                gap: 12px;
                padding: 8px 14px 8px 10px;
                background: #190f2e;
                color: #fff;
                border: 1px solid rgba(255, 255, 255, 0.15);
                border-radius: 50px;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
                font-family: inherit;
                pointer-events: auto;
                max-width: 95vw;
            ">
                <span style="
                    width: 34px;
                    height: 34px;
                    background: ${roleColor};
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.15rem;
                    flex-shrink: 0;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
                ">${rolEmoji[user.rol] || '👑'}</span>
                <div style="display: flex; flex-direction: column; text-align: left; line-height: 1.25; overflow: hidden;">
                    <span style="font-size: 0.85rem; font-weight: 700; color: #fff; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">
                        ¡Bienvenido, ${userName}!
                    </span>
                    <span style="font-size: 0.72rem; color: #ffa270; font-weight: 500; white-space: nowrap;">
                        Sesión como ${userRole}
                    </span>
                </div>
                <button type="button" onclick="closeWelcomeBanner()" style="
                    background: rgba(255,255,255,0.12);
                    border: none;
                    color: #ddd;
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1rem;
                    cursor: pointer;
                    margin-left: 2px;
                    flex-shrink: 0;
                    transition: background 0.2s;
                " onmouseover="this.style.background='rgba(255,255,255,0.25)'" onmouseout="this.style.background='rgba(255,255,255,0.12)'">&times;</button>
            </div>
        `;
        
        welcome.style.cssText = `
            position: fixed;
            top: 14px;
            left: 0;
            right: 0;
            z-index: 999999;
            display: flex;
            justify-content: center;
            pointer-events: none;
            transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
            transform: translateY(-50px);
            opacity: 0;
            padding: 0 12px;
        `;

        document.body.appendChild(welcome);

        requestAnimationFrame(() => {
            welcome.style.transform = 'translateY(0)';
            welcome.style.opacity = '1';
        });

        window.closeWelcomeBanner = function() {
            const el = document.getElementById('welcomeBanner');
            if (!el) return;
            el.style.transform = 'translateY(-50px)';
            el.style.opacity = '0';
            setTimeout(() => el.remove(), 400);
        };

        setTimeout(() => {
            window.closeWelcomeBanner();
        }, 4500);
    }
}

function initNav() {
    const nav = document.querySelector('.navbar');
    if (nav && !nav._scrollBound) {
        nav._scrollBound = true;
        window.addEventListener('scroll', () => {
            nav.classList.toggle('scrolled', window.scrollY > 50);
        });
    }

    const toggle = document.getElementById('navToggle') || document.querySelector('.nav-toggle');
    const menu = document.getElementById('navMenu') || document.querySelector('.nav-menu');
    if (!toggle || !menu) return;

    // Quitar atributo onclick inline heredado para evitar doble alternado
    if (toggle.hasAttribute('onclick')) {
        toggle.removeAttribute('onclick');
    }

    if (toggle._navBound) return;
    toggle._navBound = true;

    function setNavState(isOpen) {
        menu.classList.toggle('active', isOpen);
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        toggle.setAttribute('aria-label', isOpen ? 'Cerrar menú' : 'Abrir menú');
        const icon = toggle.querySelector('i');
        if (icon) {
            if (isOpen) {
                icon.classList.remove('fa-bars');
                icon.classList.add('fa-times');
            } else {
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
            }
        }
    }

    toggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isOpen = menu.classList.contains('active');
        setNavState(!isOpen);
    });

    // Cerrar al hacer clic fuera del menú
    document.addEventListener('click', (e) => {
        if (menu.classList.contains('active')) {
            if (!menu.contains(e.target) && !toggle.contains(e.target)) {
                setNavState(false);
            }
        }
    });

    // Cerrar al presionar la tecla Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && menu.classList.contains('active')) {
            setNavState(false);
        }
    });

    // Cerrar al hacer clic en cualquier enlace del menú (soporta enlaces dinámicos)
    menu.addEventListener('click', (e) => {
        if (e.target.closest('a')) {
            setNavState(false);
        }
    });
}

function initPage() {
    const page = document.body.dataset.page;
    if (page === 'productos') loadProductos();
    if (page === 'inventario') loadInventario();
    if (page === 'pedidos') { loadPedidosRecientes(); updateCart(); }
}

// ============================================
// CATÁLOGO DE RESPALDO (GitHub Pages / Offline)
// ============================================
const DEFAULT_PRODUCTS_FALLBACK = [
  {"id":1,"codigo":"PRD-001","nombre":"Lápices de Color (12-pack)","descripcion":"Set de 12 lápices de colores vibrantes y punta resistente","categoria_id":1,"precio_compra":"0.00","precio_venta":"12.50","stock_actual":44,"stock_minimo":20,"unidad_medida":"unidad","imagen":"img/productos/lapices-color.jpg","categoria_nombre":"Útiles Escolares"},
  {"id":2,"codigo":"PRD-002","nombre":"Marcadores Permanentes","descripcion":"Pack de 8 marcadores permanentes de colores intensos","categoria_id":1,"precio_compra":"0.00","precio_venta":"8.75","stock_actual":8,"stock_minimo":15,"unidad_medida":"unidad","imagen":"img/productos/marcadores-permanentes.jpg","categoria_nombre":"Útiles Escolares"},
  {"id":3,"codigo":"PRD-003","nombre":"Cuadernos Universitarios","descripcion":"Cuaderno espiral de 100 hojas rayadas de alta blancura","categoria_id":2,"precio_compra":"0.00","precio_venta":"3.25","stock_actual":120,"stock_minimo":25,"unidad_medida":"unidad","imagen":"img/productos/cuadernos-universitarios.jpg","categoria_nombre":"Papelería"},
  {"id":4,"codigo":"PRD-004","nombre":"Cartuchos de Tinta","descripcion":"Cartuchos negro y tricolor para impresoras de alto rendimiento","categoria_id":3,"precio_compra":"0.00","precio_venta":"24.99","stock_actual":22,"stock_minimo":10,"unidad_medida":"unidad","imagen":"img/productos/cartuchos-tinta.jpg","categoria_nombre":"Tecnología"},
  {"id":5,"codigo":"PRD-005","nombre":"Tijeras de Oficina","descripcion":"Tijeras ergonómicas de acero inoxidable para corte preciso","categoria_id":2,"precio_compra":"0.00","precio_venta":"5.50","stock_actual":28,"stock_minimo":15,"unidad_medida":"unidad","imagen":"img/productos/tijeras-oficina.jpg","categoria_nombre":"Papelería"},
  {"id":6,"codigo":"PRD-006","nombre":"Clips Metálicos (100u)","descripcion":"Caja con 100 clips metálicos resistentes y anticorrosivos","categoria_id":4,"precio_compra":"0.00","precio_venta":"2.00","stock_actual":0,"stock_minimo":50,"unidad_medida":"unidad","imagen":"img/productos/clips-metalicos.jpg","categoria_nombre":"Accesorios"},
  {"id":7,"codigo":"PRD-007","nombre":"Borradores Premium","descripcion":"Pack de borradores blancos de vinilo de máxima calidad","categoria_id":1,"precio_compra":"0.00","precio_venta":"1.25","stock_actual":87,"stock_minimo":30,"unidad_medida":"unidad","imagen":"img/productos/borradores-premium.jpg","categoria_nombre":"Útiles Escolares"},
  {"id":8,"codigo":"PRD-008","nombre":"Carpetas Archivador","descripcion":"Carpeta archivador de palanca tamaño carta para oficina","categoria_id":2,"precio_compra":"0.00","precio_venta":"4.75","stock_actual":25,"stock_minimo":20,"unidad_medida":"unidad","imagen":"img/productos/carpetas-archivador.jpg","categoria_nombre":"Papelería"},
  {"id":9,"codigo":"PRD-009","nombre":"Resaltadores Fluorescentes","descripcion":"Set de 5 resaltadores neón colores pastel y fluorescentes","categoria_id":2,"precio_compra":"0.00","precio_venta":"7.50","stock_actual":38,"stock_minimo":15,"unidad_medida":"unidad","imagen":"img/productos/resaltadores-fluorescentes.jpg","categoria_nombre":"Papelería"},
  {"id":10,"codigo":"PRD-010","nombre":"Organizador de Escritorio","descripcion":"Organizador de escritorio metálico multifunción con compartimentos","categoria_id":4,"precio_compra":"0.00","precio_venta":"15.99","stock_actual":12,"stock_minimo":15,"unidad_medida":"unidad","imagen":"img/productos/organizador-escritorio.jpg","categoria_nombre":"Accesorios"},
  {"id":11,"codigo":"PRD-011","nombre":"Mouse Óptico USB","descripcion":"Mouse óptico ergonómico USB para computadoras y laptops","categoria_id":3,"precio_compra":"0.00","precio_venta":"8.50","stock_actual":18,"stock_minimo":8,"unidad_medida":"unidad","imagen":"img/productos/mouse-optico.jpg","categoria_nombre":"Tecnología"},
  {"id":12,"codigo":"PRD-012","nombre":"Resma de Papel Carta","descripcion":"Resma de 500 hojas tamaño carta de alta blancura y gramaje","categoria_id":2,"precio_compra":"0.00","precio_venta":"5.20","stock_actual":45,"stock_minimo":15,"unidad_medida":"unidad","imagen":"img/productos/resma-papel.jpg","categoria_nombre":"Papelería"}
];

const PRODUCT_IMAGE_FALLBACK = {
    1: 'img/productos/lapices-color.jpg',
    2: 'img/productos/marcadores-permanentes.jpg',
    3: 'img/productos/cuadernos-universitarios.jpg',
    4: 'img/productos/cartuchos-tinta.jpg',
    5: 'img/productos/tijeras-oficina.jpg',
    6: 'img/productos/clips-metalicos.jpg',
    7: 'img/productos/borradores-premium.jpg',
    8: 'img/productos/carpetas-archivador.jpg',
    9: 'img/productos/resaltadores-fluorescentes.jpg',
    10: 'img/productos/organizador-escritorio.jpg',
    11: 'img/productos/mouse-optico.jpg',
    12: 'img/productos/resma-papel.jpg',
    'PRD-001': 'img/productos/lapices-color.jpg',
    'PRD-002': 'img/productos/marcadores-permanentes.jpg',
    'PRD-003': 'img/productos/cuadernos-universitarios.jpg',
    'PRD-004': 'img/productos/cartuchos-tinta.jpg',
    'PRD-005': 'img/productos/tijeras-oficina.jpg',
    'PRD-006': 'img/productos/clips-metalicos.jpg',
    'PRD-007': 'img/productos/borradores-premium.jpg',
    'PRD-008': 'img/productos/carpetas-archivador.jpg',
    'PRD-009': 'img/productos/resaltadores-fluorescentes.jpg',
    'PRD-010': 'img/productos/organizador-escritorio.jpg',
    'PRD-011': 'img/productos/mouse-optico.jpg',
    'PRD-012': 'img/productos/resma-papel.jpg'
};

function getProductImageUrl(p) {
    if (!p) return '';
    let raw = p.imagen;
    if (!raw || typeof raw !== 'string' || !raw.trim()) {
        raw = PRODUCT_IMAGE_FALLBACK[p.id] || PRODUCT_IMAGE_FALLBACK[p.codigo];
    }
    if (!raw && p.nombre) {
        const n = p.nombre.toLowerCase();
        if (n.includes('color') || n.includes('lápiz') || n.includes('lapiz')) raw = 'img/productos/lapices-color.jpg';
        else if (n.includes('marcador') || n.includes('permanente')) raw = 'img/productos/marcadores-permanentes.jpg';
        else if (n.includes('cuaderno') || n.includes('libreta')) raw = 'img/productos/cuadernos-universitarios.jpg';
        else if (n.includes('tinta') || n.includes('cartucho')) raw = 'img/productos/cartuchos-tinta.jpg';
        else if (n.includes('tijera')) raw = 'img/productos/tijeras-oficina.jpg';
        else if (n.includes('clip')) raw = 'img/productos/clips-metalicos.jpg';
        else if (n.includes('borrador')) raw = 'img/productos/borradores-premium.jpg';
        else if (n.includes('carpeta') || n.includes('archivador')) raw = 'img/productos/carpetas-archivador.jpg';
        else if (n.includes('resaltador') || n.includes('fluorescente')) raw = 'img/productos/resaltadores-fluorescentes.jpg';
        else if (n.includes('organizador') || n.includes('escritorio')) raw = 'img/productos/organizador-escritorio.jpg';
        else if (n.includes('mouse') || n.includes('raton')) raw = 'img/productos/mouse-optico.jpg';
        else if (n.includes('resma') || n.includes('papel')) raw = 'img/productos/resma-papel.jpg';
    }
    if (!raw) return '';

    if (raw.startsWith('data:') || raw.startsWith('http://') || raw.startsWith('https://')) {
        return raw;
    }

    const clean = raw.replace(/^(\.\.\/)+/, '').replace(/^\//, '');
    const inPages = window.location.pathname.includes('/pages/') || window.location.href.includes('/pages/');
    return inPages ? '../' + clean : clean;
}

async function getFallbackProducts() {
    try {
        const custom = JSON.parse(localStorage.getItem('duri_products_custom') || 'null');
        if (Array.isArray(custom) && custom.length) {
            // Verificar si el custom antiguo no tenía fotos
            const tieneFotos = custom.some(item => item.imagen);
            if (tieneFotos) return custom;
            localStorage.removeItem('duri_products_custom');
        }
    } catch(e) {}

    try {
        const inPages = window.location.pathname.includes('/pages/') || window.location.href.includes('/pages/');
        const staticUrl = inPages ? '../data/productos.json' : 'data/productos.json';
        const resStatic = await fetch(staticUrl);
        if (resStatic.ok) {
            const list = await resStatic.json();
            if (Array.isArray(list) && list.length) {
                return list.map(item => ({
                    ...item,
                    imagen: item.imagen || PRODUCT_IMAGE_FALLBACK[item.id] || PRODUCT_IMAGE_FALLBACK[item.codigo] || ''
                }));
            }
        }
    } catch(e) {}

    return JSON.parse(JSON.stringify(DEFAULT_PRODUCTS_FALLBACK));
}

// ============================================
// PRODUCTOS CON MONEDA DUAL Y SKELETON LOADERS
// ============================================
window._allCatalogProducts = [];
window._catalogProducts = [];

async function loadProductos(categoria = null) {
    const grid = document.getElementById('productsGrid');
    
    // 1. Mostrar Skeleton Shimmer mientras cargan los datos
    if (grid) {
        grid.innerHTML = Array(6).fill(0).map(() => `
            <div class="skeleton-card">
                <div class="skeleton-shimmer skeleton-image"></div>
                <div class="skeleton-shimmer skeleton-badge"></div>
                <div class="skeleton-shimmer skeleton-title"></div>
                <div class="skeleton-shimmer skeleton-desc"></div>
                <div class="skeleton-shimmer skeleton-desc short"></div>
                <div class="skeleton-shimmer skeleton-price"></div>
                <div class="skeleton-shimmer skeleton-button"></div>
            </div>
        `).join('');
    }

    try {
        let productos = [];
        const isGH = window.location.hostname.includes('github.io');

        // Intentar primero API PHP si no estamos exclusivamente en GitHub Pages
        if (!isGH) {
            try {
                let url = `${API_BASE}/productos.php`;
                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.status === 'success' && Array.isArray(data.data)) {
                        productos = data.data;
                    }
                }
            } catch(e) {
                console.warn('API PHP no disponible, cambiando a catálogo estático JSON...', e);
            }
        }

        // Si la API PHP no devolvió productos (ej: GitHub Pages o servidor estático)
        if (!productos || !productos.length) {
            let staticList = await getFallbackProducts();
            productos = staticList;
        }

        // Integrar productos creados por el admin si aún no vienen del backend
        try {
            const customProds = JSON.parse(localStorage.getItem('duri_products_custom') || '[]');
            if (Array.isArray(customProds) && customProds.length > 0) {
                const existingIds = new Set((productos || []).map(p => String(p.id)));
                const existingCodes = new Set((productos || []).map(p => (p.codigo || '').toLowerCase()));
                const missing = customProds.filter(cp => !existingIds.has(String(cp.id)) && !existingCodes.has((cp.codigo || '').toLowerCase()));
                if (missing.length > 0) {
                    productos = [...missing, ...(productos || [])];
                }
            }
        } catch(e) {}

        if (!productos || !productos.length) {
            if (grid) grid.innerHTML = '<div style="text-align:center;padding:50px;color:var(--gray)"><i class="fas fa-box-open" style="font-size:2.5rem;margin-bottom:12px;opacity:0.5;display:block"></i><p style="font-size:1.05rem">No hay productos en esta categoría.</p></div>';
            return;
        }

        window._allCatalogProducts = productos;
        window._catalogProducts = productos;

        // Actualizar contadores de categorías si existen
        updateCategoryCounts(productos);

        // Si se especificó una categoría concreta
        if (categoria && categoria !== 'all') {
            applyCatalogFilters();
        } else {
            renderProductos(productos);
        }
    } catch (err) {
        console.error('Error general al cargar productos:', err);
        if (grid) grid.innerHTML = '<div style="text-align:center;padding:50px;color:#dc3545"><i class="fas fa-exclamation-triangle" style="font-size:2rem;margin-bottom:10px;display:block"></i><p>No se pudieron cargar los productos.</p></div>';
    }
}

function updateCategoryCounts(productos) {
    const countAll = document.getElementById('countAll');
    const countUtiles = document.getElementById('countUtiles');
    const countPapeleria = document.getElementById('countPapeleria');
    const countTecnologia = document.getElementById('countTecnologia');
    const countAccesorios = document.getElementById('countAccesorios');

    if (countAll) countAll.textContent = `(${productos.length})`;
    if (countUtiles) countUtiles.textContent = `(${productos.filter(p => p.categoria_nombre === 'Útiles Escolares').length})`;
    if (countPapeleria) countPapeleria.textContent = `(${productos.filter(p => p.categoria_nombre === 'Papelería').length})`;
    if (countTecnologia) countTecnologia.textContent = `(${productos.filter(p => p.categoria_nombre === 'Tecnología').length})`;
    if (countAccesorios) countAccesorios.textContent = `(${productos.filter(p => p.categoria_nombre === 'Accesorios').length})`;
}

function handleImgError(img, cat) {
    if (!img || !img.parentElement) return;
    img.style.display = 'none';
    const icons = {'Útiles Escolares':'fa-pencil','Papelería':'fa-book','Tecnología':'fa-print','Accesorios':'fa-paperclip'};
    const iconClass = icons[cat] || 'fa-box';
    const fallbackBox = document.createElement('div');
    fallbackBox.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2.5rem;color:#94a3b8;background:#f8fafc;';
    fallbackBox.innerHTML = `<i class="fas ${iconClass}"></i>`;
    img.parentElement.appendChild(fallbackBox);
}

function renderProductos(productos) {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;

    if (!productos || !productos.length) {
        grid.innerHTML = '<div style="text-align:center;grid-column:1/-1;padding:50px;color:var(--text-tertiary)"><i class="fas fa-search" style="font-size:2.5rem;margin-bottom:12px;opacity:0.4;display:block"></i><p style="font-size:1.05rem;font-weight:600;">No se encontraron productos con los filtros seleccionados.</p><button class="btn btn-sm btn-outline mt-4" onclick="clearCatalogSearch()" style="margin-top:12px;"><i class="fas fa-undo"></i> Restablecer búsqueda</button></div>';
        return;
    }
    
    const user = getUser();
    const canEdit = user && (user.rol === 'super_usuario' || user.rol === 'operador');
    const colores = ['gradient-orange', 'gradient-yellow', 'gradient-brown', 'gradient-green'];
    const icons = {'Útiles Escolares':'fa-pencil','Papelería':'fa-book','Tecnología':'fa-print','Accesorios':'fa-paperclip'};
    
    grid.innerHTML = productos.map((p, i) => {
        const stockClass = p.stock_actual <= 0 ? 'out' : (p.stock_actual <= p.stock_minimo ? 'low' : '');
        const badge = p.stock_actual <= 0 ? '<div class="product-badge out">Agotado</div>' : 
                     (p.stock_actual <= p.stock_minimo ? '<div class="product-badge low">Stock Bajo</div>' : 
                     (i < 3 ? '<div class="product-badge popular">Popular</div>' : ''));
        
        let actions = '';
        if (canEdit) {
            actions = '<div style="display:flex;gap:6px;margin-top:8px"><button onclick="editProduct(\'' + p.id + '\')" class="btn btn-sm btn-outline-primary" style="flex:1"><i class="fas fa-edit"></i> Editar</button><button onclick="deleteProduct(\'' + p.id + '\')" class="btn btn-sm" style="flex:0;background:rgba(220,53,69,0.1);color:#dc3545;border:1px solid rgba(220,53,69,0.3)"><i class="fas fa-trash"></i></button></div>';
        } else if (!user) {
            actions = p.stock_actual <= 0
                ? '<button class="btn btn-primary btn-block" style="margin-top:8px" disabled><i class="fas fa-times-circle"></i> No Disponible</button>'
                : '<button class="btn btn-primary btn-block" style="margin-top:8px" onclick="buyNow(\'' + p.id + '\',\'' + p.nombre.replace(/'/g, "\\'") + '\',' + p.precio_venta + ',' + p.stock_actual + ')"><i class="fas fa-cart-plus"></i> Pedir Ahora</button>';
        } else {
            actions = p.stock_actual <= 0
                ? '<button class="btn btn-primary btn-block" style="margin-top:8px" disabled><i class="fas fa-times-circle"></i> Agotado</button>'
                : '<button class="btn btn-primary btn-block" style="margin-top:8px" onclick="buyNow(\'' + p.id + '\',\'' + p.nombre.replace(/'/g, "\\'") + '\',' + p.precio_venta + ',' + p.stock_actual + ')"><i class="fas fa-cart-plus"></i> Pedir</button>';
        }
        
        const imgSrc = getProductImageUrl(p);
        let imageHtml = '';
        const editPhotoBtn = canEdit ? `<button type="button" onclick="editProduct('${p.id}')" title="Cambiar foto o editar producto" style="position:absolute; top:10px; right:10px; background:rgba(15,23,42,0.75); color:#fff; border:1px solid rgba(255,255,255,0.25); border-radius:50%; width:34px; height:34px; cursor:pointer; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); z-index:5; box-shadow:0 3px 8px rgba(0,0,0,0.3); transition:transform 0.2s;"><i class="fas fa-camera" style="font-size:0.85rem;"></i></button>` : '';

        if (imgSrc) {
            imageHtml = `
            <div class="product-image">
                ${editPhotoBtn}
                <img src="${imgSrc}" alt="${p.nombre}" loading="lazy" onerror="handleImgError(this, '${p.categoria_nombre}')">
            </div>`;
        } else {
            imageHtml = `<div class="product-image ${colores[i % colores.length]}">${editPhotoBtn}<i class="fas ${icons[p.categoria_nombre] || 'fa-box'}"></i></div>`;
        }
        
        return `
        <div class="product-card" data-category="${p.categoria_nombre}">
            ${badge}
            ${imageHtml}
            <div class="product-content">
                <span class="product-category">${p.categoria_nombre}</span>
                <h3>${p.nombre}</h3>
                <p>${p.descripcion || ''}</p>
                <div class="product-footer">
                    ${BcvManager.renderDualHtml(p.precio_venta)}
                    <span class="product-stock ${stockClass}"><i class="fas ${p.stock_actual <= 0 ? 'fa-times-circle' : (p.stock_actual <= p.stock_minimo ? 'fa-exclamation-triangle' : 'fa-check')}"></i> ${p.stock_actual} u</span>
                </div>
                ${actions}
            </div>
        </div>`;
    }).join('');
    
    if (canEdit) {
        const adminBar = document.getElementById('adminProductBar');
        if (adminBar) adminBar.style.display = 'flex';

        const header = document.querySelector('.page-hero .container');
        if (header && !document.getElementById('addProductBtn')) {
            const btn = document.createElement('a');
            btn.id = 'addProductBtn';
            btn.href = '#';
            btn.className = 'btn btn-accent';
            btn.style.cssText = 'margin-top:15px; display:inline-flex; align-items:center; gap:8px;';
            btn.innerHTML = '<i class="fas fa-plus-circle"></i> Agregar Nuevo Producto';
            btn.onclick = function(e) { e.preventDefault(); abrirModalCrearProducto(); };
            header.appendChild(btn);
        }
    }
}

function filterProducts(cat, btn) {
    document.querySelectorAll('#categoryFilterBar .filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    applyCatalogFilters();
}

// Búsqueda Predictiva en Tiempo Real en el Catálogo
function handleCatalogSearchInput(query) {
    const q = (query || '').toLowerCase().trim();
    const dropdown = document.getElementById('catalogPredictiveDropdown');
    const clearBtn = document.getElementById('catalogSearchClear');
    if (clearBtn) clearBtn.style.display = q ? 'block' : 'none';

    if (!q || !window._allCatalogProducts || window._allCatalogProducts.length === 0) {
        if (dropdown) { dropdown.innerHTML = ''; dropdown.classList.remove('show'); }
        applyCatalogFilters();
        return;
    }

    const matches = window._allCatalogProducts.filter(p => {
        return (p.nombre && p.nombre.toLowerCase().includes(q)) ||
               (p.descripcion && p.descripcion.toLowerCase().includes(q)) ||
               (p.categoria_nombre && p.categoria_nombre.toLowerCase().includes(q)) ||
               (p.codigo && p.codigo.toLowerCase().includes(q));
    });

    if (dropdown) {
        if (matches.length === 0) {
            dropdown.innerHTML = `<div style="padding:16px;text-align:center;color:#64748b;font-size:0.85rem;"><i class="fas fa-search" style="margin-right:6px;"></i> No se encontraron coincidencias para "<strong>${escapeHtml(q)}</strong>"</div>`;
        } else {
            dropdown.innerHTML = matches.slice(0, 6).map(p => {
                const img = getProductImageUrl(p);
                const priceUsd = parseFloat(p.precio_venta || 0).toFixed(2);
                const priceBs = BcvManager.formatBs(BcvManager.toBs(p.precio_venta));
                const stockBadge = p.stock_actual <= 0 ? '<span style="color:#ef4444;font-weight:700;">Agotado</span>' : `<span style="color:#10b981;font-weight:600;">${p.stock_actual} disp.</span>`;
                return `
                    <div class="predictive-item" onclick="selectCatalogPredictiveItem('${p.id}')">
                        <img src="${img}" class="predictive-item-img" alt="${p.nombre}" onerror="this.src='../img/logo-duri.png'">
                        <div class="predictive-item-info">
                            <div class="predictive-item-title">${p.nombre}</div>
                            <div class="predictive-item-meta">
                                <span>${p.categoria_nombre}</span> • ${stockBadge}
                            </div>
                        </div>
                        <div class="predictive-item-price">
                            <div class="predictive-item-price-usd">$${priceUsd}</div>
                            <div class="predictive-item-price-bs">≈ ${priceBs}</div>
                        </div>
                    </div>
                `;
            }).join('');
        }
        dropdown.classList.add('show');
    }

    applyCatalogFilters();
}

function clearCatalogSearch() {
    const input = document.getElementById('catalogSearchInput');
    if (input) input.value = '';
    const clearBtn = document.getElementById('catalogSearchClear');
    if (clearBtn) clearBtn.style.display = 'none';
    const dropdown = document.getElementById('catalogPredictiveDropdown');
    if (dropdown) { dropdown.innerHTML = ''; dropdown.classList.remove('show'); }
    applyCatalogFilters();
}

function selectCatalogPredictiveItem(id) {
    const dropdown = document.getElementById('catalogPredictiveDropdown');
    if (dropdown) dropdown.classList.remove('show');
    
    // Buscar la tarjeta y hacer scroll con animación
    const cards = document.querySelectorAll('.product-card');
    let found = false;
    cards.forEach(card => {
        if (card.innerHTML.includes(`buyNow('${id}'`) || card.innerHTML.includes(`editProduct('${id}'`)) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.style.transition = 'all 0.3s ease';
            card.style.boxShadow = '0 0 0 4px var(--accent), 0 12px 32px rgba(232,93,38,0.25)';
            card.style.transform = 'translateY(-4px)';
            found = true;
            setTimeout(() => {
                card.style.boxShadow = '';
                card.style.transform = '';
            }, 2500);
        }
    });

    if (!found) {
        // En caso de estar en otra categoría filtrada, restablecer filtro para mostrarlo
        const activeBtn = document.querySelector('#categoryFilterBar .filter-btn:first-child');
        if (activeBtn) filterProducts('all', activeBtn);
        setTimeout(() => selectCatalogPredictiveItem(id), 100);
    }
}

function applyCatalogFilters() {
    if (!window._allCatalogProducts || !window._allCatalogProducts.length) return;
    
    const searchVal = (document.getElementById('catalogSearchInput') ? document.getElementById('catalogSearchInput').value : '').toLowerCase().trim();
    const activeBtn = document.querySelector('#categoryFilterBar .filter-btn.active');
    let selectedCat = 'all';
    if (activeBtn) {
        const fullTxt = activeBtn.textContent.replace(/\(\d+\)/g, '').trim();
        if (fullTxt !== 'Todos') selectedCat = fullTxt;
    }

    const onlyInStock = document.getElementById('filterInStockOnly') ? document.getElementById('filterInStockOnly').checked : false;
    const sortVal = document.getElementById('catalogSortSelect') ? document.getElementById('catalogSortSelect').value : 'featured';

    let result = [...window._allCatalogProducts];

    // 1. Filtro de búsqueda
    if (searchVal) {
        result = result.filter(p => 
            (p.nombre && p.nombre.toLowerCase().includes(searchVal)) ||
            (p.descripcion && p.descripcion.toLowerCase().includes(searchVal)) ||
            (p.categoria_nombre && p.categoria_nombre.toLowerCase().includes(searchVal)) ||
            (p.codigo && p.codigo.toLowerCase().includes(searchVal))
        );
    }

    // 2. Filtro de categoría
    if (selectedCat !== 'all') {
        result = result.filter(p => p.categoria_nombre === selectedCat);
    }

    // 3. Filtro de disponibilidad
    if (onlyInStock) {
        result = result.filter(p => Number(p.stock_actual) > 0);
    }

    // 4. Ordenamiento
    if (sortVal === 'price_asc') {
        result.sort((a, b) => parseFloat(a.precio_venta || 0) - parseFloat(b.precio_venta || 0));
    } else if (sortVal === 'price_desc') {
        result.sort((a, b) => parseFloat(b.precio_venta || 0) - parseFloat(a.precio_venta || 0));
    } else if (sortVal === 'name_asc') {
        result.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    }

    renderProductos(result);
}

// Cerrar dropdown predictivo al hacer clic fuera
document.addEventListener('click', function(e) {
    const wrap = document.getElementById('catalogSearchWrap');
    const dropdown = document.getElementById('catalogPredictiveDropdown');
    if (wrap && dropdown && !wrap.contains(e.target)) {
        dropdown.classList.remove('show');
    }
});

function buyNow(id, name, price, stock) {
    addToCartById(id, name, price, stock);
    setTimeout(() => {
        window.location.href = isInPages ? 'pedidos.html' : 'pages/pedidos.html';
    }, 600);
}

// ============================================
// INVENTARIO
// ============================================
let _cachedInventory = [];

async function loadInventario() {
    let productos = null;
    let stats = null;
    const isGH = window.location.hostname.includes('github.io');

    if (!isGH) {
        try {
            const [invRes, statsRes] = await Promise.all([
                fetch(`${API_BASE}/inventario.php`),
                fetch(`${API_BASE}/inventario.php?estadisticas=true`)
            ]);
            if (invRes.ok && statsRes.ok) {
                const invData = await invRes.json();
                const statsData = await statsRes.json();
                if (invData && invData.status === 'success' && Array.isArray(invData.data)) productos = invData.data;
                if (statsData && statsData.status === 'success' && statsData.data) stats = statsData.data;
            }
        } catch (err) {
            console.warn('API PHP de inventario no disponible, usando catálogo JSON estático...', err);
        }
    }

    // Fallback estático para GitHub Pages o si la API PHP no responde
    if (!productos || !productos.length) {
        productos = await getFallbackProducts();
        if (productos && productos.length) {
            stats = {
                total_productos: productos.length,
                en_stock: productos.filter(p => Number(p.stock_actual) > Number(p.stock_minimo)).length,
                stock_bajo: productos.filter(p => Number(p.stock_actual) <= Number(p.stock_minimo) && Number(p.stock_actual) > 0).length,
                agotados: productos.filter(p => Number(p.stock_actual) <= 0).length,
                valor_inventario: productos.reduce((sum, p) => sum + (Number(p.stock_actual) * Number(p.precio_venta || 0)), 0)
            };
        }
    }

    // Integrar productos creados por el admin si aún no vienen del backend
    try {
        const customProds = JSON.parse(localStorage.getItem('duri_products_custom') || '[]');
        if (Array.isArray(customProds) && customProds.length > 0) {
            const existingIds = new Set((productos || []).map(p => String(p.id)));
            const existingCodes = new Set((productos || []).map(p => (p.codigo || '').toLowerCase()));
            const missing = customProds.filter(cp => !existingIds.has(String(cp.id)) && !existingCodes.has((cp.codigo || '').toLowerCase())).map(p => ({
                ...p,
                estado_stock: p.stock_actual <= 0 ? 'agotado' : (p.stock_actual <= p.stock_minimo ? 'bajo' : 'disponible')
            }));
            if (missing.length > 0) {
                productos = [...missing, ...(productos || [])];
            }
        }
    } catch(e) {}

    if (productos && productos.length) {
        _cachedInventory = productos;
        renderInventarioTable(productos);
        if (stats) renderInventarioStats(stats);
    } else {
        const tbody = document.getElementById('invBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:#dc3545"><i class="fas fa-exclamation-triangle" style="font-size:1.8rem;margin-bottom:8px;display:block"></i>No se pudo cargar el inventario.</td></tr>';
        }
        const statsEl = document.getElementById('invStats');
        if (statsEl) {
            statsEl.innerHTML = '<div class="stat-card red"><div class="stat-card-icon red"><i class="fas fa-exclamation-triangle"></i></div><div><div class="stat-card-label">Error al cargar estadísticas</div></div></div>';
        }
    }
}

function renderInventarioStats(stats) {
    const el = document.getElementById('invStats');
    if (!el) return;

    const valorUsd = parseFloat(stats.valor_inventario || 0);
    const valorBs = BcvManager.toBs(valorUsd);

    el.innerHTML = `
        <div class="stat-card"><div class="stat-card-icon orange"><i class="fas fa-box"></i></div><div><div class="stat-card-value">${stats.total_productos}</div><div class="stat-card-label">Total Productos</div></div></div>
        <div class="stat-card green"><div class="stat-card-icon green"><i class="fas fa-check-circle"></i></div><div><div class="stat-card-value">${stats.en_stock}</div><div class="stat-card-label">En Stock</div></div></div>
        <div class="stat-card yellow"><div class="stat-card-icon yellow"><i class="fas fa-exclamation-triangle"></i></div><div><div class="stat-card-value">${stats.stock_bajo}</div><div class="stat-card-label">Stock Bajo</div></div></div>
        <div class="stat-card red"><div class="stat-card-icon red"><i class="fas fa-times-circle"></i></div><div><div class="stat-card-value">${stats.agotados}</div><div class="stat-card-label">Agotados</div></div></div>
        <div class="stat-card" style="border-left:4px solid var(--accent);"><div class="stat-card-icon orange"><i class="fas fa-coins"></i></div><div><div class="stat-card-value" style="font-size:1.15rem;">$${valorUsd.toFixed(2)}</div><div class="stat-card-label" style="font-size:0.75rem;">Valor Total (≈ ${BcvManager.formatBs(valorBs)})</div></div></div>
    `;

    // Actualizar números de los filtros rápidos (chips)
    const chipLow = document.getElementById('chipLowCount');
    const chipOut = document.getElementById('chipOutCount');
    const chipInStock = document.getElementById('chipInStockCount');
    if (chipLow) chipLow.textContent = stats.stock_bajo;
    if (chipOut) chipOut.textContent = stats.agotados;
    if (chipInStock) chipInStock.textContent = stats.en_stock;

    // Alerta de stock crítico superior (temporal y auto-dismissible en 6 segundos)
    const alertEl = document.getElementById('invCriticalAlert');
    if (alertEl) {
        const totalCrit = Number(stats.stock_bajo || 0) + Number(stats.agotados || 0);
        if (totalCrit > 0 && !window._invAlertDismissed) {
            alertEl.style.display = 'block';
            alertEl.innerHTML = `
                <div class="inv-critical-alert" id="invCriticalAlertBox">
                    <div class="inv-critical-alert-content">
                        <div class="inv-critical-alert-icon"><i class="fas fa-exclamation-triangle"></i></div>
                        <div class="inv-critical-alert-text">
                            <strong>Alerta de Inventario: ${totalCrit} producto(s) en stock crítico o agotados</strong>
                            <span>Te sugerimos revisar estos artículos prioritarios para coordinar su reposición.</span>
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
                        <button type="button" class="btn btn-sm" onclick="setInventoryStatusFilter('low', document.querySelectorAll('.inv-quick-chip')[1]); dismissCriticalAlert();" style="background:#ef4444;color:#fff;border:none;padding:7px 12px;border-radius:8px;font-weight:700;cursor:pointer;white-space:nowrap;font-size:0.8rem;">
                            <i class="fas fa-filter"></i> Ver Críticos
                        </button>
                        <button type="button" onclick="dismissCriticalAlert()" title="Cerrar advertencia" style="background:rgba(0,0,0,0.06);border:none;color:#991b1b;width:28px;height:28px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:1.15rem;line-height:1;transition:background 0.2s;">
                            &times;
                        </button>
                    </div>
                </div>
            `;
            // Se quita automáticamente a los 6 segundos para que no sea permanente
            if (window._invAlertTimer) clearTimeout(window._invAlertTimer);
            window._invAlertTimer = setTimeout(() => {
                dismissCriticalAlert();
            }, 6000);
        } else if (totalCrit === 0) {
            alertEl.style.display = 'none';
        }
    }
}

function dismissCriticalAlert() {
    window._invAlertDismissed = true;
    if (window._invAlertTimer) {
        clearTimeout(window._invAlertTimer);
        window._invAlertTimer = null;
    }
    const alertEl = document.getElementById('invCriticalAlert');
    if (!alertEl) return;
    const alertBox = alertEl.querySelector('.inv-critical-alert');
    if (alertBox) {
        alertBox.classList.add('fade-out');
        setTimeout(() => {
            alertEl.style.display = 'none';
            alertEl.innerHTML = '';
        }, 450);
    } else {
        alertEl.style.display = 'none';
        alertEl.innerHTML = '';
    }
}
window.dismissCriticalAlert = dismissCriticalAlert;

function renderInventarioTable(productos) {
    const tbody = document.getElementById('invBody');
    if (!tbody) return;
    const user = getUser();
    const canEdit = user && (user.rol === 'super_usuario' || user.rol === 'operador');
    const canOrder = user && user.rol !== 'super_usuario';
    
    tbody.innerHTML = productos.map(p => {
        const stockClass = p.stock_actual <= 0 ? 'out-stock' : (p.stock_actual <= p.stock_minimo ? 'low-stock' : '');
        let statusClass = 'available', statusText = 'Disponible';
        if (p.stock_actual <= 0) { statusClass = 'out'; statusText = 'Agotado'; }
        else if (p.stock_actual <= p.stock_minimo) { statusClass = 'low'; statusText = 'Stock Bajo'; }
        
        let actionBtn = '';
        if (canEdit) {
            actionBtn = '<div style="display:flex;gap:4px"><button onclick="editProduct(\'' + p.id + '\')" class="btn btn-sm btn-outline-primary" title="Editar"><i class="fas fa-edit"></i></button><button onclick="deleteProduct(\'' + p.id + '\')" class="btn btn-sm" style="background:rgba(220,53,69,0.1);color:#dc3545;border:1px solid rgba(220,53,69,0.3)" title="Eliminar"><i class="fas fa-trash"></i></button></div>';
        } else if (canOrder && p.stock_actual > 0) {
            actionBtn = '<a href="pedidos.html" class="btn btn-sm btn-primary"><i class="fas fa-cart-plus"></i></a>';
        } else if (p.stock_actual <= 0) {
            actionBtn = '<button class="btn btn-sm" disabled><i class="fas fa-ban"></i></button>';
        } else {
            actionBtn = '<a href="pedidos.html" class="btn btn-sm btn-primary"><i class="fas fa-cart-plus"></i></a>';
        }
        
        const thumbSrc = getProductImageUrl(p);
        const thumbHtml = thumbSrc 
            ? `<img src="${thumbSrc}" style="width:34px;height:34px;border-radius:6px;object-fit:cover;border:1px solid #cbd5e1;flex-shrink:0;" onerror="this.style.display='none'">` 
            : `<div style="width:34px;height:34px;border-radius:6px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;color:#94a3b8;flex-shrink:0;"><i class="fas fa-box" style="font-size:0.9rem;"></i></div>`;

        const priceUsd = parseFloat(p.precio_venta || 0).toFixed(2);
        const priceBs = BcvManager.formatBs(BcvManager.toBs(p.precio_venta));

        return `<tr>
            <td><strong>${p.codigo}</strong></td>
            <td>
                <div style="display:flex;align-items:center;gap:10px;">
                    ${thumbHtml}
                    <span>${p.nombre}</span>
                </div>
            </td>
            <td>${p.categoria_nombre}</td>
            <td>
                <strong>$${priceUsd}</strong>
                <span style="display:block;font-size:0.72rem;color:#64748b;">${priceBs}</span>
            </td>
            <td class="${stockClass}">${p.stock_actual}</td><td>${p.stock_minimo}</td>
            <td><span class="status ${statusClass}">${statusText}</span></td>
            <td>${actionBtn}</td>
        </tr>`;
    }).join('');
}

function filterInventory(val) {
    val = (val || '').toLowerCase().trim();
    document.querySelectorAll('#invBody tr').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(val) ? '' : 'none';
    });
}

function setInventoryStatusFilter(status, btn) {
    document.querySelectorAll('.inv-quick-chip').forEach(c => c.classList.remove('active'));
    if (btn) btn.classList.add('active');
    
    if (!_cachedInventory || !_cachedInventory.length) return;
    let filtered = _cachedInventory;
    if (status === 'low') {
        filtered = _cachedInventory.filter(p => Number(p.stock_actual) <= Number(p.stock_minimo) && Number(p.stock_actual) > 0);
    } else if (status === 'out') {
        filtered = _cachedInventory.filter(p => Number(p.stock_actual) <= 0);
    } else if (status === 'available') {
        filtered = _cachedInventory.filter(p => Number(p.stock_actual) > Number(p.stock_minimo));
    }
    renderInventarioTable(filtered);
}

function exportInventoryToExcel() {
    const data = _cachedInventory || [];
    if (!data.length) {
        showToast('No hay datos en el inventario para exportar', 'error');
        return;
    }

    const headers = [
        'Código',
        'Producto',
        'Categoría',
        'Precio (USD)',
        'Precio (Bs - BCV)',
        'Stock Actual',
        'Stock Mínimo',
        'Estado',
        'Valor Total USD'
    ];

    const rows = data.map(p => {
        const precioUsd = parseFloat(p.precio_venta || 0);
        const precioBs = BcvManager.toBs(precioUsd);
        const stock = parseInt(p.stock_actual || 0);
        const min = parseInt(p.stock_minimo || 0);
        const valorUsd = (precioUsd * stock).toFixed(2);
        let estado = 'En Stock';
        if (stock <= 0) estado = 'Agotado';
        else if (stock <= min) estado = 'Stock Bajo';

        return [
            `"${p.codigo || ''}"`,
            `"${(p.nombre || '').replace(/"/g, '""')}"`,
            `"${(p.categoria_nombre || '').replace(/"/g, '""')}"`,
            precioUsd.toFixed(2),
            precioBs.toFixed(2),
            stock,
            min,
            `"${estado}"`,
            valorUsd
        ].join(';');
    });

    const csvContent = '\uFEFF' + headers.join(';') + '\n' + rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `Inventario_Inversiones_Duri_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('¡Inventario exportado con éxito en Excel (CSV)!');
}

// ============================================
// EDITAR / ELIMINAR PRODUCTO (SUPER USUARIO Y OPERADOR)
// ============================================
let _editingProductId = null;
let _currentProductImageData = null;

const GALERIA_PRESET_FOTOS = [
    { label: 'Lápices de Color', url: 'img/productos/lapices-color.jpg' },
    { label: 'Marcadores', url: 'img/productos/marcadores-permanentes.jpg' },
    { label: 'Cuadernos', url: 'img/productos/cuadernos-universitarios.jpg' },
    { label: 'Cartuchos Tinta', url: 'img/productos/cartuchos-tinta.jpg' },
    { label: 'Tijeras Oficina', url: 'img/productos/tijeras-oficina.jpg' },
    { label: 'Clips Metálicos', url: 'img/productos/clips-metalicos.jpg' },
    { label: 'Borradores', url: 'img/productos/borradores-premium.jpg' },
    { label: 'Carpetas Archivador', url: 'img/productos/carpetas-archivador.jpg' },
    { label: 'Resaltadores', url: 'img/productos/resaltadores-fluorescentes.jpg' },
    { label: 'Organizador', url: 'img/productos/organizador-escritorio.jpg' },
    { label: 'Mouse Óptico', url: 'img/productos/mouse-optico.jpg' },
    { label: 'Resma Papel', url: 'img/productos/resma-papel.jpg' }
];

async function editProduct(id) {
    try {
        let p = null;
        const isGH = window.location.hostname.includes('github.io');
        if (!isGH) {
            try {
                const res = await fetch(`${API_BASE}/productos.php?id=${id}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.status === 'success') p = data.data;
                }
            } catch(e) {}
        }

        if (!p && Array.isArray(_cachedInventory)) {
            p = _cachedInventory.find(item => String(item.id) === String(id));
        }

        if (!p) {
            // Buscar en fallback
            const staticList = await getFallbackProducts();
            p = staticList.find(item => String(item.id) === String(id));
        }

        if (!p) { showToast('Producto no encontrado', 'error'); return; }

        const catList = [
            {id:1, nombre:'Útiles Escolares'},
            {id:2, nombre:'Papelería'},
            {id:3, nombre:'Tecnología'},
            {id:4, nombre:'Accesorios'}
        ];

        _editingProductId = id;
        _currentProductImageData = p.imagen || '';

        const old = document.getElementById('editModal');
        if (old) old.remove();

        const basePath = window.location.pathname.includes('/pages/') ? '../' : '';
        const currentImgSrc = p.imagen ? ((p.imagen.startsWith('http') || p.imagen.startsWith('data:')) ? p.imagen : basePath + p.imagen.replace(/^\.\.\//, '')) : '';

        const modal = document.createElement('div');
        modal.id = 'editModal';
        modal.className = 'modal show';
        modal.innerHTML = `
            <div style="width:480px;max-width:95%;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,0.35);max-height:90vh;display:flex;flex-direction:column;">
                <div style="background:linear-gradient(135deg,var(--dark,#1a0f2e),#2a1a4a);color:#fff;padding:18px 22px;display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <h3 style="margin:0;font-size:1.1rem;color:#fff;"><i class="fas fa-edit" style="color:var(--accent,#e85d26);margin-right:6px;"></i> Editar Producto</h3>
                        <p style="margin:3px 0 0;font-size:0.8rem;opacity:0.7;">${p.codigo || ''} - ${p.nombre || ''}</p>
                    </div>
                    <button type="button" onclick="closeEditModal()" style="background:none;border:none;color:#fff;font-size:1.2rem;cursor:pointer;opacity:0.7;">&times;</button>
                </div>

                <div style="padding:20px 22px;overflow-y:auto;flex:1;">
                    <!-- SECCIÓN: CAMBIAR FOTO -->
                    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin-bottom:18px;">
                        <label style="display:block;font-size:0.86rem;font-weight:700;color:#1e293b;margin-bottom:10px;">
                            <i class="fas fa-camera" style="color:var(--accent,#e85d26);margin-right:6px;"></i> Foto del Producto
                        </label>
                        <div style="display:flex;gap:14px;align-items:center;">
                            <div id="editImagePreviewWrapper" style="width:96px;height:96px;border-radius:12px;overflow:hidden;border:2px solid #cbd5e1;background:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
                                ${currentImgSrc 
                                    ? `<img id="editImagePreview" src="${currentImgSrc}" style="width:100%;height:100%;object-fit:cover;" onerror="this.outerHTML='<i class=\\\'fas fa-image\\\' style=\\\'color:#94a3b8;font-size:2rem;\\\'></i>'">` 
                                    : `<i id="editImagePlaceholder" class="fas fa-image" style="font-size:2rem;color:#94a3b8;"></i>`}
                            </div>
                            <div style="flex:1;min-width:0;">
                                <input type="file" id="editImageFileInput" accept="image/*" style="display:none;" onchange="handleProductImageFileChange(event)">
                                <button type="button" onclick="document.getElementById('editImageFileInput').click()" style="width:100%;background:#e85d26;color:#fff;border:none;border-radius:8px;padding:9px 12px;font-weight:600;font-size:0.82rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:6px;box-shadow:0 2px 6px rgba(232,93,38,0.25);">
                                    <i class="fas fa-upload"></i> Subir Foto (Celular o PC)
                                </button>
                                <input type="text" id="editImageInput" placeholder="O escribe enlace / ruta de imagen..." value="${p.imagen || ''}" oninput="actualizarPreviewImagen(this.value)" style="width:100%;font-size:0.78rem;padding:7px 10px;border:1px solid #cbd5e1;border-radius:6px;box-sizing:border-box;">
                                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
                                    <button type="button" onclick="toggleGaleriaPredefinida()" style="background:none;border:none;color:#0284c7;font-size:0.75rem;cursor:pointer;font-weight:600;padding:0;">
                                        <i class="fas fa-th"></i> Ver fotos predefinidas
                                    </button>
                                    <button type="button" onclick="quitarFotoProducto()" style="background:none;border:none;color:#ef4444;font-size:0.75rem;cursor:pointer;font-weight:600;padding:0;">
                                        <i class="fas fa-trash"></i> Quitar foto
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- Galería de presets rápida -->
                        <div id="galeriaPredefinidaBox" style="display:none;margin-top:12px;padding-top:10px;border-top:1px dashed #cbd5e1;">
                            <span style="font-size:0.75rem;color:#64748b;display:block;margin-bottom:8px;">Selecciona una foto del sistema:</span>
                            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;max-height:130px;overflow-y:auto;">
                                ${GALERIA_PRESET_FOTOS.map(item => `
                                    <div onclick="seleccionarPresetFoto('${item.url}')" title="${item.label}" style="cursor:pointer;border:1.5px solid #e2e8f0;border-radius:6px;overflow:hidden;height:45px;display:flex;align-items:center;justify-content:center;background:#fff;transition:border-color 0.2s;">
                                        <img src="${basePath + item.url}" style="width:100%;height:100%;object-fit:cover;">
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>

                    <div class="form-group" style="margin-bottom:14px;">
                        <label style="display:block;font-size:0.84rem;font-weight:600;margin-bottom:5px;color:#334155;">Nombre</label>
                        <input type="text" id="editNombre" value="${(p.nombre || '').replace(/"/g, '&quot;')}" style="width:100%;padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px;box-sizing:border-box;">
                    </div>
                    <div class="form-group" style="margin-bottom:14px;">
                        <label style="display:block;font-size:0.84rem;font-weight:600;margin-bottom:5px;color:#334155;">Descripción</label>
                        <textarea id="editDesc" rows="2" style="width:100%;padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px;box-sizing:border-box;">${p.descripcion || ''}</textarea>
                    </div>
                    <div class="form-group" style="margin-bottom:14px;">
                        <label style="display:block;font-size:0.84rem;font-weight:600;margin-bottom:5px;color:#334155;">Categoría</label>
                        <select id="editCat" style="width:100%;padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px;box-sizing:border-box;">
                            ${catList.map(c => `<option value="${c.id}" ${c.id == p.categoria_id ? 'selected' : ''}>${c.nombre}</option>`).join('')}
                        </select>
                    </div>
                    <div style="display:flex;gap:10px;">
                        <div class="form-group" style="flex:1;">
                            <label style="display:block;font-size:0.84rem;font-weight:600;margin-bottom:5px;color:#334155;">Precio ($)</label>
                            <input type="number" id="editPrecio" step="0.01" min="0" value="${p.precio_venta || 0}" style="width:100%;padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px;box-sizing:border-box;">
                        </div>
                        <div class="form-group" style="flex:1;">
                            <label style="display:block;font-size:0.84rem;font-weight:600;margin-bottom:5px;color:#334155;">Stock Actual</label>
                            <input type="number" id="editStock" min="0" value="${p.stock_actual || 0}" style="width:100%;padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px;box-sizing:border-box;">
                        </div>
                        <div class="form-group" style="flex:1;">
                            <label style="display:block;font-size:0.84rem;font-weight:600;margin-bottom:5px;color:#334155;">Stock Mín.</label>
                            <input type="number" id="editStockMin" min="0" value="${p.stock_minimo || 0}" style="width:100%;padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px;box-sizing:border-box;">
                        </div>
                    </div>
                </div>

                <div style="padding:14px 22px 18px;display:flex;gap:10px;border-top:1px solid #e2e8f0;background:#fff;">
                    <button type="button" onclick="closeEditModal()" style="flex:1;padding:11px;border:1.5px solid #cbd5e1;background:#fff;border-radius:10px;font-size:0.9rem;font-weight:600;cursor:pointer;color:#475569;">Cancelar</button>
                    <button type="button" onclick="saveEditProduct()" style="flex:2;padding:11px;background:#28a745;color:#fff;border:none;border-radius:10px;font-size:0.9rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 3px 10px rgba(40,167,69,0.3);"><i class="fas fa-save"></i> Guardar Cambios</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', function(e) { if (e.target === modal) closeEditModal(); });
    } catch (err) {
        console.error('Error al editar producto:', err);
        showToast('Error al cargar producto', 'error');
    }
}

function handleProductImageFileChange(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast('Por favor selecciona un archivo de imagen válido (JPG, PNG, WebP)', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const dataUrl = e.target.result;
        _currentProductImageData = dataUrl;
        const imgInput = document.getElementById('editImageInput');
        if (imgInput) imgInput.value = '';
        actualizarPreviewImagen(dataUrl);
        showToast('📷 Foto cargada desde tu dispositivo', 'success');
    };
    reader.readAsDataURL(file);
}

function actualizarPreviewImagen(src) {
    const wrapper = document.getElementById('editImagePreviewWrapper');
    if (!wrapper) return;
    if (src && src.trim()) {
        const clean = src.trim();
        const basePath = window.location.pathname.includes('/pages/') ? '../' : '';
        const realSrc = (clean.startsWith('http') || clean.startsWith('data:')) ? clean : basePath + clean.replace(/^\.\.\//, '');
        wrapper.innerHTML = `<img id="editImagePreview" src="${realSrc}" style="width:100%;height:100%;object-fit:cover;" onerror="this.outerHTML='<i class=\\\'fas fa-exclamation-circle\\\' style=\\\'color:#ef4444;font-size:2rem;\\\'></i>'">`;
        _currentProductImageData = clean;
    } else {
        wrapper.innerHTML = `<i id="editImagePlaceholder" class="fas fa-image" style="font-size:2rem;color:#94a3b8;"></i>`;
        _currentProductImageData = '';
    }
}

function toggleGaleriaPredefinida() {
    const box = document.getElementById('galeriaPredefinidaBox');
    if (box) {
        box.style.display = box.style.display === 'none' ? 'block' : 'none';
    }
}

function seleccionarPresetFoto(url) {
    const imgInput = document.getElementById('editImageInput');
    if (imgInput) imgInput.value = url;
    actualizarPreviewImagen(url);
    showToast('Foto seleccionada de la galería', 'info');
}

function quitarFotoProducto() {
    const imgInput = document.getElementById('editImageInput');
    if (imgInput) imgInput.value = '';
    const fileInput = document.getElementById('editImageFileInput');
    if (fileInput) fileInput.value = '';
    actualizarPreviewImagen('');
    showToast('Foto removida', 'info');
}

function closeEditModal() {
    const m = document.getElementById('editModal');
    if (m) m.remove();
    _editingProductId = null;
    _currentProductImageData = null;
}

async function saveEditProduct() {
    if (!_editingProductId) return;
    const nombre = document.getElementById('editNombre').value.trim();
    const desc = document.getElementById('editDesc').value.trim();
    const cat = document.getElementById('editCat').value;
    const precio = document.getElementById('editPrecio').value;
    const stock = document.getElementById('editStock').value;
    const stockMin = document.getElementById('editStockMin').value;

    const inputVal = document.getElementById('editImageInput') ? document.getElementById('editImageInput').value.trim() : '';
    const imagenFinal = _currentProductImageData !== null ? _currentProductImageData : inputVal;

    if (!nombre) { showToast('El nombre es requerido', 'error'); return; }
    if (!precio || parseFloat(precio) <= 0) { showToast('Precio inválido', 'error'); return; }

    const isGH = window.location.hostname.includes('github.io');
    let saved = false;

    if (!isGH) {
        try {
            const res = await fetch(`${API_BASE}/productos.php?id=${_editingProductId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nombre,
                    descripcion: desc,
                    categoria_id: parseInt(cat),
                    precio_venta: parseFloat(precio),
                    stock_actual: parseInt(stock),
                    stock_minimo: parseInt(stockMin),
                    imagen: imagenFinal
                })
            });
            if (res.ok) {
                const data = await res.json();
                if (data.status === 'success') saved = true;
            }
        } catch (err) {
            console.warn('Error al guardar en API PHP, guardando localmente...', err);
        }
    }

    // Persistencia local / GitHub Pages
    if (!saved || isGH) {
        let currentList = await getFallbackProducts();
        const idx = currentList.findIndex(item => String(item.id) === String(_editingProductId));
        const catNames = {1:'Útiles Escolares', 2:'Papelería', 3:'Tecnología', 4:'Accesorios'};
        if (idx !== -1) {
            currentList[idx] = {
                ...currentList[idx],
                nombre,
                descripcion: desc,
                categoria_id: parseInt(cat),
                categoria_nombre: catNames[cat] || currentList[idx].categoria_nombre || 'General',
                precio_venta: parseFloat(precio).toFixed(2),
                stock_actual: parseInt(stock),
                stock_minimo: parseInt(stockMin),
                imagen: imagenFinal
            };
            localStorage.setItem('duri_products_custom', JSON.stringify(currentList));
            _cachedInventory = currentList;
            saved = true;
        }
    }

    if (saved) {
        window._invAlertDismissed = false;
        const numStock = parseInt(stock);
        const numMin = parseInt(stockMin);
        if (numStock <= 0) {
            showToast('⚠️ Producto guardado. Advertencia: Este artículo quedó Agotado', 'warning');
        } else if (numStock <= numMin) {
            showToast('⚠️ Producto guardado. Advertencia: Stock bajo (' + numStock + ' unidades)', 'warning');
        } else {
            showToast('✅ Producto y fotografía actualizados con éxito', 'success');
        }
        closeEditModal();
        if (typeof loadProductos === 'function') loadProductos();
        if (typeof loadInventario === 'function') loadInventario();
    } else {
        showToast('Error al guardar cambios', 'error');
    }
}

async function deleteProduct(id) {
    if (!confirm('¿Seguro que quieres eliminar este producto?')) return;
    const isGH = window.location.hostname.includes('github.io');
    let deleted = false;

    if (!isGH) {
        try {
            const res = await fetch(`${API_BASE}/productos.php?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                const data = await res.json();
                if (data.status === 'success') deleted = true;
            }
        } catch (err) {}
    }

    if (!deleted) {
        if (Array.isArray(_cachedInventory)) {
            _cachedInventory = _cachedInventory.filter(item => String(item.id) !== String(id));
            localStorage.setItem('duri_products_custom', JSON.stringify(_cachedInventory));
            deleted = true;
        }
    }

    if (deleted) {
        showToast('Producto eliminado');
        loadInventario();
        if (document.body.dataset.page === 'productos') loadProductos();
    } else {
        showToast('Error al eliminar producto', 'error');
    }
}

// ============================================
// AGREGAR NUEVO PRODUCTO (SUPER USUARIO Y OPERADOR)
// ============================================
let _newProductImageData = '';

function abrirModalCrearProducto() {
    const user = getUser();
    if (!user || (user.rol !== 'super_usuario' && user.rol !== 'operador')) {
        showToast('Acceso restringido: debes ser administrador para agregar productos', 'error');
        return;
    }

    cerrarModalCrearProducto();
    _newProductImageData = '';

    const catList = [
        { id: 1, nombre: 'Útiles Escolares' },
        { id: 2, nombre: 'Papelería' },
        { id: 3, nombre: 'Tecnología' },
        { id: 4, nombre: 'Accesorios' }
    ];

    const basePath = window.location.pathname.includes('/pages/') ? '../' : '';

    const modal = document.createElement('div');
    modal.id = 'modalCrearProducto';
    modal.className = 'modal show';
    modal.innerHTML = `
        <div style="width:530px;max-width:95%;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,0.35);max-height:92vh;display:flex;flex-direction:column;">
            <div style="background:linear-gradient(135deg,#0f172a 0%,#1e1b4b 100%);color:#fff;padding:18px 24px;display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <h3 style="margin:0;font-size:1.15rem;color:#fff;display:flex;align-items:center;gap:8px;">
                        <i class="fas fa-plus-circle" style="color:var(--accent,#FF6600);"></i> Agregar Nuevo Producto
                    </h3>
                    <p style="margin:3px 0 0;font-size:0.8rem;color:#cbd5e1;">Ingresa los datos para registrarlo en el catálogo e inventario</p>
                </div>
                <button type="button" onclick="cerrarModalCrearProducto()" style="background:rgba(255,255,255,0.1);border:none;color:#fff;width:32px;height:32px;border-radius:50%;font-size:1.2rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">&times;</button>
            </div>

            <div style="padding:22px;overflow-y:auto;flex:1;">
                <!-- FOTO DEL PRODUCTO -->
                <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:14px;padding:14px;margin-bottom:18px;">
                    <label style="display:block;font-size:0.86rem;font-weight:700;color:#1e293b;margin-bottom:10px;">
                        <i class="fas fa-camera" style="color:var(--accent,#FF6600);margin-right:6px;"></i> Foto del Producto
                    </label>
                    <div style="display:flex;gap:14px;align-items:center;">
                        <div id="newProdImagePreviewWrapper" style="width:96px;height:96px;border-radius:12px;overflow:hidden;border:2px dashed #cbd5e1;background:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
                            <i id="newProdImagePlaceholder" class="fas fa-image" style="font-size:2rem;color:#94a3b8;"></i>
                        </div>
                        <div style="flex:1;min-width:0;">
                            <input type="file" id="newProdFileInput" accept="image/*" style="display:none;" onchange="handleNewProductImageFile(event)">
                            <button type="button" onclick="document.getElementById('newProdFileInput').click()" style="width:100%;background:linear-gradient(135deg,#FF6600,#e85d26);color:#fff;border:none;border-radius:8px;padding:9px 12px;font-weight:600;font-size:0.82rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:6px;box-shadow:0 2px 6px rgba(232,93,38,0.25);">
                                <i class="fas fa-upload"></i> Subir Foto (Celular o PC)
                            </button>
                            <input type="text" id="newProdUrlInput" placeholder="O escribe enlace / ruta de imagen..." oninput="actualizarPreviewNuevoProducto(this.value)" style="width:100%;font-size:0.78rem;padding:7px 10px;border:1px solid #cbd5e1;border-radius:6px;box-sizing:border-box;">
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
                                <button type="button" onclick="toggleGaleriaPredefinidaNuevo()" style="background:none;border:none;color:#0284c7;font-size:0.75rem;cursor:pointer;font-weight:600;padding:0;">
                                    <i class="fas fa-th"></i> Galería de fotos del sistema
                                </button>
                                <button type="button" onclick="quitarFotoNuevoProducto()" style="background:none;border:none;color:#ef4444;font-size:0.75rem;cursor:pointer;font-weight:600;padding:0;">
                                    <i class="fas fa-trash"></i> Quitar foto
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Galería de presets rápida -->
                    <div id="newProdGaleriaBox" style="display:none;margin-top:12px;padding-top:10px;border-top:1px dashed #cbd5e1;">
                        <span style="font-size:0.75rem;color:#64748b;display:block;margin-bottom:8px;">Haz clic en una foto para seleccionarla:</span>
                        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;max-height:120px;overflow-y:auto;">
                            ${GALERIA_PRESET_FOTOS.map(item => `
                                <div onclick="seleccionarPresetFotoNuevo('${item.url}')" title="${item.label}" style="cursor:pointer;border:1.5px solid #e2e8f0;border-radius:6px;overflow:hidden;height:45px;display:flex;align-items:center;justify-content:center;background:#fff;transition:border-color 0.2s;">
                                    <img src="${basePath + item.url}" style="width:100%;height:100%;object-fit:cover;">
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>

                <!-- DATOS PRINCIPALES -->
                <div style="display:flex;gap:12px;margin-bottom:14px;">
                    <div style="flex:1.5;">
                        <label style="display:block;font-size:0.84rem;font-weight:600;margin-bottom:5px;color:#334155;">
                            Nombre del Producto <span style="color:#dc3545">*</span>
                        </label>
                        <input type="text" id="newProdNombre" placeholder="Ej: Resma Papel Carta 500 Hojas" style="width:100%;padding:9px 12px;border:1.5px solid #cbd5e1;border-radius:8px;box-sizing:border-box;font-size:0.9rem;" required>
                    </div>
                    <div style="flex:1;">
                        <label style="display:block;font-size:0.84rem;font-weight:600;margin-bottom:5px;color:#334155;">
                            Código <small style="color:#64748b;font-weight:normal;">(Opcional)</small>
                        </label>
                        <input type="text" id="newProdCodigo" placeholder="Ej: PRD-030" style="width:100%;padding:9px 12px;border:1.5px solid #cbd5e1;border-radius:8px;box-sizing:border-box;font-size:0.9rem;text-transform:uppercase;">
                    </div>
                </div>

                <div style="margin-bottom:14px;">
                    <label style="display:block;font-size:0.84rem;font-weight:600;margin-bottom:5px;color:#334155;">Descripción corta</label>
                    <textarea id="newProdDesc" rows="2" placeholder="Marca, modelo, características o especificaciones del producto..." style="width:100%;padding:9px 12px;border:1.5px solid #cbd5e1;border-radius:8px;box-sizing:border-box;font-size:0.85rem;resize:vertical;"></textarea>
                </div>

                <div style="margin-bottom:14px;">
                    <label style="display:block;font-size:0.84rem;font-weight:600;margin-bottom:5px;color:#334155;">Categoría <span style="color:#dc3545">*</span></label>
                    <select id="newProdCat" style="width:100%;padding:9px 12px;border:1.5px solid #cbd5e1;border-radius:8px;box-sizing:border-box;font-size:0.88rem;background:#fff;cursor:pointer;">
                        ${catList.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('')}
                    </select>
                </div>

                <div style="display:flex;gap:10px;margin-bottom:10px;">
                    <div style="flex:1;">
                        <label style="display:block;font-size:0.84rem;font-weight:600;margin-bottom:5px;color:#334155;">
                            Precio Venta ($ USD) <span style="color:#dc3545">*</span>
                        </label>
                        <input type="number" id="newProdPrecio" step="0.01" min="0.01" placeholder="Ej: 3.50" oninput="actualizarBsPreviewNuevoProducto(this.value)" style="width:100%;padding:9px 12px;border:1.5px solid #cbd5e1;border-radius:8px;box-sizing:border-box;font-weight:700;color:#0f172a;font-size:0.92rem;">
                        <small id="newProdBsPreview" style="display:block;margin-top:4px;color:#16a34a;font-weight:700;font-size:0.75rem;">≈ Bs. 0,00</small>
                    </div>
                    <div style="flex:1;">
                        <label style="display:block;font-size:0.84rem;font-weight:600;margin-bottom:5px;color:#334155;">Stock Inicial</label>
                        <input type="number" id="newProdStock" min="0" value="10" style="width:100%;padding:9px 12px;border:1.5px solid #cbd5e1;border-radius:8px;box-sizing:border-box;font-size:0.92rem;">
                    </div>
                    <div style="flex:1;">
                        <label style="display:block;font-size:0.84rem;font-weight:600;margin-bottom:5px;color:#334155;">Stock Mínimo</label>
                        <input type="number" id="newProdStockMin" min="0" value="5" style="width:100%;padding:9px 12px;border:1.5px solid #cbd5e1;border-radius:8px;box-sizing:border-box;font-size:0.92rem;">
                    </div>
                </div>
            </div>

            <div style="padding:14px 24px 18px;display:flex;gap:10px;border-top:1px solid #e2e8f0;background:#f8fafc;">
                <button type="button" onclick="cerrarModalCrearProducto()" style="flex:1;padding:11px;border:1.5px solid #cbd5e1;background:#fff;border-radius:10px;font-size:0.9rem;font-weight:600;cursor:pointer;color:#475569;">
                    Cancelar
                </button>
                <button type="button" id="btnGuardarNuevoProducto" onclick="guardarNuevoProducto()" style="flex:2;padding:11px;background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;border:none;border-radius:10px;font-size:0.92rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 3px 10px rgba(22,163,74,0.35);">
                    <i class="fas fa-check-circle"></i> Guardar y Publicar
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.addEventListener('click', function(e) { if (e.target === modal) cerrarModalCrearProducto(); });
}
window.abrirModalCrearProducto = abrirModalCrearProducto;

function cerrarModalCrearProducto() {
    const m = document.getElementById('modalCrearProducto');
    if (m) m.remove();
    _newProductImageData = '';
}
window.cerrarModalCrearProducto = cerrarModalCrearProducto;

function handleNewProductImageFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        showToast('Selecciona un archivo de imagen válido (JPG, PNG, WebP)', 'error');
        return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
        const dataUrl = e.target.result;
        _newProductImageData = dataUrl;
        const urlInput = document.getElementById('newProdUrlInput');
        if (urlInput) urlInput.value = '';
        actualizarPreviewNuevoProducto(dataUrl);
        showToast('📷 Foto cargada con éxito', 'success');
    };
    reader.readAsDataURL(file);
}
window.handleNewProductImageFile = handleNewProductImageFile;

function actualizarPreviewNuevoProducto(src) {
    const wrapper = document.getElementById('newProdImagePreviewWrapper');
    if (!wrapper) return;
    if (src && src.trim()) {
        const clean = src.trim();
        const basePath = window.location.pathname.includes('/pages/') ? '../' : '';
        const realSrc = (clean.startsWith('http') || clean.startsWith('data:')) ? clean : basePath + clean.replace(/^\.\.\//, '');
        wrapper.innerHTML = `<img src="${realSrc}" style="width:100%;height:100%;object-fit:cover;" onerror="this.outerHTML='<i class=\\\'fas fa-image\\\' style=\\\'color:#94a3b8;font-size:2rem;\\\'></i>'">`;
        _newProductImageData = clean;
    } else {
        wrapper.innerHTML = `<i id="newProdImagePlaceholder" class="fas fa-image" style="font-size:2rem;color:#94a3b8;"></i>`;
        _newProductImageData = '';
    }
}
window.actualizarPreviewNuevoProducto = actualizarPreviewNuevoProducto;

function toggleGaleriaPredefinidaNuevo() {
    const box = document.getElementById('newProdGaleriaBox');
    if (box) box.style.display = box.style.display === 'none' ? 'block' : 'none';
}
window.toggleGaleriaPredefinidaNuevo = toggleGaleriaPredefinidaNuevo;

function seleccionarPresetFotoNuevo(url) {
    const urlInput = document.getElementById('newProdUrlInput');
    if (urlInput) urlInput.value = url;
    actualizarPreviewNuevoProducto(url);
    showToast('Foto seleccionada de la galería', 'info');
}
window.seleccionarPresetFotoNuevo = seleccionarPresetFotoNuevo;

function quitarFotoNuevoProducto() {
    const urlInput = document.getElementById('newProdUrlInput');
    if (urlInput) urlInput.value = '';
    const fileInput = document.getElementById('newProdFileInput');
    if (fileInput) fileInput.value = '';
    actualizarPreviewNuevoProducto('');
    showToast('Foto removida', 'info');
}
window.quitarFotoNuevoProducto = quitarFotoNuevoProducto;

function actualizarBsPreviewNuevoProducto(usd) {
    const el = document.getElementById('newProdBsPreview');
    if (!el) return;
    const val = parseFloat(usd) || 0;
    if (typeof BcvManager !== 'undefined') {
        el.textContent = `≈ ${BcvManager.formatBs(BcvManager.toBs(val))}`;
    } else {
        el.textContent = `≈ Bs. ${(val * 45).toFixed(2)}`;
    }
}
window.actualizarBsPreviewNuevoProducto = actualizarBsPreviewNuevoProducto;

async function guardarNuevoProducto() {
    const nombre = document.getElementById('newProdNombre').value.trim();
    const codigoInput = document.getElementById('newProdCodigo').value.trim();
    const desc = document.getElementById('newProdDesc').value.trim();
    const cat = document.getElementById('newProdCat').value;
    const precio = document.getElementById('newProdPrecio').value;
    const stock = document.getElementById('newProdStock').value;
    const stockMin = document.getElementById('newProdStockMin').value;

    const urlInput = document.getElementById('newProdUrlInput') ? document.getElementById('newProdUrlInput').value.trim() : '';
    const imagenFinal = _newProductImageData || urlInput || '';

    if (!nombre) {
        showToast('El nombre del producto es obligatorio', 'error');
        document.getElementById('newProdNombre').focus();
        return;
    }
    if (!precio || parseFloat(precio) <= 0) {
        showToast('Por favor ingresa un precio de venta válido', 'error');
        document.getElementById('newProdPrecio').focus();
        return;
    }

    const btn = document.getElementById('btnGuardarNuevoProducto');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    }

    const catMap = {
        '1': 'Útiles Escolares',
        '2': 'Papelería',
        '3': 'Tecnología',
        '4': 'Accesorios'
    };

    const payload = {
        codigo: codigoInput || undefined,
        nombre: nombre,
        descripcion: desc,
        categoria_id: parseInt(cat) || 1,
        precio_venta: parseFloat(precio),
        stock_actual: parseInt(stock) || 0,
        stock_minimo: parseInt(stockMin) || 10,
        imagen: imagenFinal
    };

    let newId = Date.now();
    let finalCodigo = codigoInput || `PRD-${Math.floor(100 + Math.random() * 900)}`;
    let savedOnline = false;

    const isGH = window.location.hostname.includes('github.io');
    if (!isGH) {
        try {
            const res = await fetch(`${API_BASE}/productos.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                const resData = await res.json();
                if (resData.status === 'success') {
                    savedOnline = true;
                    if (resData.id) newId = resData.id;
                    if (resData.codigo) finalCodigo = resData.codigo;
                }
            }
        } catch(err) {
            console.warn('Backend no disponible al crear producto, guardando localmente:', err);
        }
    }

    // Sincronizar en almacenamiento local persistente
    const localItem = {
        id: newId,
        codigo: finalCodigo,
        nombre: nombre,
        descripcion: desc,
        categoria_id: parseInt(cat) || 1,
        categoria_nombre: catMap[cat] || 'General',
        precio_venta: parseFloat(precio),
        stock_actual: parseInt(stock) || 0,
        stock_minimo: parseInt(stockMin) || 10,
        imagen: imagenFinal,
        activo: 1
    };

    try {
        let customProds = JSON.parse(localStorage.getItem('duri_products_custom') || '[]');
        if (!Array.isArray(customProds)) customProds = [];
        customProds.unshift(localItem);
        localStorage.setItem('duri_products_custom', JSON.stringify(customProds));
    } catch(e) {}

    showToast(`¡Producto "${nombre}" publicado exitosamente!`, 'success');
    cerrarModalCrearProducto();

    // Recargar vistas activas
    if (typeof loadProductos === 'function') loadProductos();
    if (typeof loadInventario === 'function') loadInventario();
}
window.guardarNuevoProducto = guardarNuevoProducto;


// ============================================
// IMPORTACIÓN MASIVA DESDE EXCEL / CSV
// ============================================
let _importProductosCargados = [];

function loadSheetJsLibrary() {
    return new Promise((resolve) => {
        if (window.XLSX) return resolve(window.XLSX);
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
        script.onload = () => resolve(window.XLSX);
        script.onerror = () => {
            console.warn('No se pudo cargar XLSX vía CDN, se usará parseador CSV nativo');
            resolve(null);
        };
        document.head.appendChild(script);
    });
}

function abrirModalImportarExcel() {
    const user = getUser();
    if (!user || (user.rol !== 'super_usuario' && user.rol !== 'operador')) {
        showToast('Acceso restringido: debes ser administrador para importar productos', 'error');
        return;
    }

    cerrarModalImportarExcel();
    _importProductosCargados = [];

    const modal = document.createElement('div');
    modal.id = 'modalImportarExcel';
    modal.className = 'modal show';
    modal.innerHTML = `
        <div style="width:680px;max-width:95%;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,0.35);max-height:92vh;display:flex;flex-direction:column;">
            <div style="background:linear-gradient(135deg,#0284c7 0%,#0f172a 100%);color:#fff;padding:18px 24px;display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <h3 style="margin:0;font-size:1.18rem;color:#fff;display:flex;align-items:center;gap:10px;">
                        <i class="fas fa-file-excel" style="color:#38bdf8;"></i> Importar Productos desde Excel o CSV
                    </h3>
                    <p style="margin:3px 0 0;font-size:0.82rem;color:#cbd5e1;">Carga automática de catálogo e inventario masivo (ej. 300 productos)</p>
                </div>
                <button type="button" onclick="cerrarModalImportarExcel()" style="background:rgba(255,255,255,0.1);border:none;color:#fff;width:32px;height:32px;border-radius:50%;font-size:1.2rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">&times;</button>
            </div>

            <div style="padding:22px;overflow-y:auto;flex:1;">
                <!-- Zona de Arrastrar o Seleccionar Archivo -->
                <div id="dropZoneImportExcel" onclick="document.getElementById('importFileInput').click()" style="border:2.5px dashed #0284c7;background:#f0f9ff;border-radius:14px;padding:28px 20px;text-align:center;cursor:pointer;transition:all 0.25s;margin-bottom:16px;">
                    <input type="file" id="importFileInput" accept=".xlsx, .xls, .csv, text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style="display:none;" onchange="handleArchivoImportacion(event)">
                    <div style="width:60px;height:60px;background:#e0f2fe;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;color:#0284c7;font-size:1.8rem;">
                        <i class="fas fa-cloud-upload-alt"></i>
                    </div>
                    <h4 style="margin:0 0 6px;color:#0f172a;font-size:1.05rem;font-weight:700;">Haz clic aquí para seleccionar tu Excel o CSV</h4>
                    <p style="margin:0 0 10px;font-size:0.83rem;color:#64748b;">Compatible con archivos <strong>.xlsx</strong>, <strong>.xls</strong> o <strong>.csv</strong></p>
                    <span style="display:inline-block;background:#0284c7;color:#fff;font-size:0.78rem;font-weight:700;padding:6px 14px;border-radius:20px;">
                        <i class="fas fa-folder-open"></i> Explorar Archivos
                    </span>
                </div>

                <!-- Botón de plantilla de ejemplo -->
                <div style="display:flex;justify-content:space-between;align-items:center;background:#f8fafc;padding:12px 16px;border-radius:10px;border:1px solid #e2e8f0;margin-bottom:18px;">
                    <div style="font-size:0.83rem;color:#334155;">
                        <i class="fas fa-info-circle" style="color:#0284c7;margin-right:6px;"></i> ¿Necesitas el formato de ejemplo con las columnas correctas?
                    </div>
                    <button type="button" onclick="descargarPlantillaExcel()" style="background:#fff;border:1.5px solid #0284c7;color:#0284c7;padding:6px 12px;border-radius:8px;font-weight:700;font-size:0.78rem;cursor:pointer;display:inline-flex;align-items:center;gap:6px;">
                        <i class="fas fa-download"></i> Descargar Plantilla
                    </button>
                </div>

                <!-- Vista previa de los datos procesados -->
                <div id="importPreviewContainer" style="display:none;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                        <h4 style="margin:0;font-size:0.95rem;color:#0f172a;font-weight:700;display:flex;align-items:center;gap:8px;">
                            <i class="fas fa-check-circle" style="color:#16a34a;"></i> Productos Detectados: <span id="importCountBadge" style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:12px;font-size:0.8rem;">0</span>
                        </h4>
                        <span id="importFileStatus" style="font-size:0.8rem;color:#64748b;"></span>
                    </div>

                    <div style="max-height:220px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:14px;background:#fff;">
                        <table style="width:100%;border-collapse:collapse;font-size:0.82rem;text-align:left;">
                            <thead style="background:#f1f5f9;position:sticky;top:0;z-index:2;">
                                <tr>
                                    <th style="padding:8px 10px;border-bottom:1px solid #cbd5e1;color:#475569;">Código</th>
                                    <th style="padding:8px 10px;border-bottom:1px solid #cbd5e1;color:#475569;">Nombre</th>
                                    <th style="padding:8px 10px;border-bottom:1px solid #cbd5e1;color:#475569;">Categoría</th>
                                    <th style="padding:8px 10px;border-bottom:1px solid #cbd5e1;color:#475569;text-align:right;">Precio USD</th>
                                    <th style="padding:8px 10px;border-bottom:1px solid #cbd5e1;color:#475569;text-align:center;">Stock</th>
                                </tr>
                            </thead>
                            <tbody id="importPreviewTbody">
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Barra de Progreso durante la importación -->
                <div id="importProgressBox" style="display:none;margin-top:14px;background:#f8fafc;padding:14px;border-radius:10px;border:1px solid #e2e8f0;">
                    <div style="display:flex;justify-content:space-between;font-size:0.84rem;font-weight:600;margin-bottom:8px;color:#1e293b;">
                        <span id="importProgressText"><i class="fas fa-spinner fa-spin"></i> Guardando productos en la base de datos...</span>
                        <span id="importProgressPercent">0%</span>
                    </div>
                    <div style="width:100%;height:10px;background:#e2e8f0;border-radius:6px;overflow:hidden;">
                        <div id="importProgressBar" style="width:0%;height:100%;background:linear-gradient(90deg,#0284c7,#16a34a);transition:width 0.3s;"></div>
                    </div>
                </div>
            </div>

            <div style="padding:14px 24px 18px;display:flex;gap:10px;border-top:1px solid #e2e8f0;background:#f8fafc;">
                <button type="button" onclick="cerrarModalImportarExcel()" style="flex:1;padding:11px;border:1.5px solid #cbd5e1;background:#fff;border-radius:10px;font-size:0.9rem;font-weight:600;cursor:pointer;color:#475569;">
                    Cancelar
                </button>
                <button type="button" id="btnEjecutarImportacion" onclick="ejecutarImportacionMasiva()" disabled style="flex:2;padding:11px;background:#cbd5e1;color:#fff;border:none;border-radius:10px;font-size:0.92rem;font-weight:700;cursor:not-allowed;display:flex;align-items:center;justify-content:center;gap:7px;box-shadow:none;">
                    <i class="fas fa-upload"></i> Subir e Importar Productos
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.addEventListener('click', function(e) { if (e.target === modal) cerrarModalImportarExcel(); });

    // Drag and drop handlers
    const dropZone = document.getElementById('dropZoneImportExcel');
    if (dropZone) {
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                dropZone.style.background = '#e0f2fe';
                dropZone.style.borderColor = '#0369a1';
            }, false);
        });
        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                dropZone.style.background = '#f0f9ff';
                dropZone.style.borderColor = '#0284c7';
            }, false);
        });
        dropZone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files && files.length) {
                handleArchivoImportacion({ target: { files: files } });
            }
        }, false);
    }
}
window.abrirModalImportarExcel = abrirModalImportarExcel;

function cerrarModalImportarExcel() {
    const m = document.getElementById('modalImportarExcel');
    if (m) m.remove();
    _importProductosCargados = [];
}
window.cerrarModalImportarExcel = cerrarModalImportarExcel;

// Generar y descargar plantilla de ejemplo en CSV
function descargarPlantillaExcel() {
    const csvContent = 
`Codigo,Nombre,Categoria,Precio_USD,Stock,Stock_Minimo,Descripcion
PRD-101,Cuaderno Espiral Cuadriculado 100 Hojas,Papelería,2.50,50,10,Cuaderno tamaño carta tapa dura marca Caribe
PRD-102,Caja de Lápices de Grafito 12 Unidades,Útiles Escolares,3.00,40,8,Lápices HB resistentes alta calidad
PRD-103,Calculadora Científica 240 Funciones,Tecnología,12.50,15,5,Pantalla de 2 líneas ideal para estudiantes
PRD-104,Grapadora Metálica de Oficina + Grapas,Accesorios,4.80,25,5,Incluye caja de 1000 grapas estándar 26/6
PRD-105,Resma de Papel Carta 500 Hojas,Papelería,4.50,80,15,Papel blanco 75g de alto rendimiento`;

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "Plantilla_Productos_Inversiones_Duri.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Plantilla descargada: ábrela en Excel o edítala como prefieras', 'info');
}
window.descargarPlantillaExcel = descargarPlantillaExcel;

// Procesar archivo seleccionado (Excel o CSV)
async function handleArchivoImportacion(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const fileStatus = document.getElementById('importFileStatus');
    if (fileStatus) fileStatus.innerHTML = `<i class="fas fa-file"></i> Leyendo: <strong>${file.name}</strong>...`;

    try {
        const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
        let parsedRows = [];

        if (isExcel) {
            await loadSheetJsLibrary();
            if (window.XLSX) {
                const data = await file.arrayBuffer();
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                parsedRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
            } else {
                showToast('No se pudo procesar el archivo Excel. Por favor guárdalo como CSV y vuelve a intentarlo', 'error');
                return;
            }
        } else {
            // Parseador CSV nativo
            const text = await file.text();
            parsedRows = parsearCSVNativo(text);
        }

        if (!parsedRows || !parsedRows.length) {
            showToast('El archivo está vacío o no contiene filas con datos', 'error');
            return;
        }

        // Mapear y normalizar columnas con detección flexible de nombres
        const productosNormalizados = normalizarFilasImportadas(parsedRows);

        if (!productosNormalizados.length) {
            showToast('No se encontraron productos válidos. Revisa que haya una columna "Nombre" y "Precio"', 'error');
            return;
        }

        _importProductosCargados = productosNormalizados;
        mostrarPreviewImportacion(productosNormalizados, file.name);

    } catch (err) {
        console.error('Error al procesar archivo:', err);
        showToast('Error al leer el archivo: ' + err.message, 'error');
    }
}
window.handleArchivoImportacion = handleArchivoImportacion;

// Parseador CSV nativo robusto (soporta comas, puntos y comas, y valores entrecomillados)
function parsearCSVNativo(text) {
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (!lines.length) return [];

    // Detectar delimitador (coma o punto y coma)
    const headerLine = lines[0];
    const commaCount = (headerLine.match(/,/g) || []).length;
    const semicolonCount = (headerLine.match(/;/g) || []).length;
    const tabCount = (headerLine.match(/\t/g) || []).length;
    let delimiter = ',';
    if (semicolonCount > commaCount && semicolonCount > tabCount) delimiter = ';';
    else if (tabCount > commaCount && tabCount > semicolonCount) delimiter = '\t';

    const parseCSVLine = (line) => {
        const result = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (c === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    cur += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (c === delimiter && !inQuotes) {
                result.push(cur.trim());
                cur = '';
            } else {
                cur += c;
            }
        }
        result.push(cur.trim());
        return result;
    };

    const headers = parseCSVLine(lines[0]).map(h => h.replace(/^\uFEFF/, '').trim());
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
        const vals = parseCSVLine(lines[i]);
        if (vals.length < 2 && !vals[0]) continue;
        const row = {};
        headers.forEach((h, idx) => {
            row[h] = vals[idx] !== undefined ? vals[idx] : '';
        });
        rows.push(row);
    }
    return rows;
}

// Normalizar encabezados con detección inteligente
function normalizarFilasImportadas(rows) {
    const catMap = {
        'utiles escolares': 1, 'útiles escolares': 1, 'utiles': 1, 'escolares': 1,
        'papeleria': 2, 'papelería': 2,
        'tecnologia': 3, 'tecnología': 3, 'tech': 3,
        'accesorios': 4, 'accesorio': 4
    };

    const cleanKey = (k) => k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_]/g, '');

    const result = [];
    rows.forEach((row, idx) => {
        const keys = Object.keys(row);
        let nombre = '';
        let precio = 0;
        let codigo = '';
        let categoria = 'Papelería';
        let stock = 10;
        let stockMin = 5;
        let descripcion = '';
        let imagen = '';

        keys.forEach(k => {
            const val = String(row[k] || '').trim();
            const ck = cleanKey(k);

            // Nombre
            if (['nombre', 'name', 'producto', 'articulo', 'item', 'descripcion_corta', 'titulo'].includes(ck)) {
                if (!nombre) nombre = val;
            }
            // Precio
            else if (['precio', 'precio_usd', 'preciousd', 'precio_venta', 'precioventa', 'pvp', 'costo', 'price', 'valor'].includes(ck)) {
                const num = parseFloat(val.replace(',', '.').replace(/[^0-9.]/g, ''));
                if (!isNaN(num)) precio = num;
            }
            // Categoría
            else if (['categoria', 'category', 'departamento', 'rubro', 'tipo'].includes(ck)) {
                if (val) categoria = val;
            }
            // Stock
            else if (['stock', 'stock_actual', 'stockactual', 'cantidad', 'cant', 'unidades', 'existencia', 'qty'].includes(ck)) {
                const s = parseInt(val.replace(/[^0-9]/g, ''));
                if (!isNaN(s)) stock = s;
            }
            // Stock Mínimo
            else if (['stock_minimo', 'stockminimo', 'minimo', 'alerta_stock', 'min_qty', 'min'].includes(ck)) {
                const sm = parseInt(val.replace(/[^0-9]/g, ''));
                if (!isNaN(sm)) stockMin = sm;
            }
            // Código
            else if (['codigo', 'code', 'sku', 'referencia', 'ref', 'cod'].includes(ck)) {
                if (!codigo) codigo = val.toUpperCase();
            }
            // Descripción
            else if (['descripcion', 'detalle', 'detalles', 'description', 'info'].includes(ck)) {
                if (!descripcion) descripcion = val;
            }
            // Imagen
            else if (['imagen', 'foto', 'image', 'url_foto', 'img'].includes(ck)) {
                if (!imagen) imagen = val;
            }
        });

        if (nombre && precio > 0) {
            // Categoría ID
            const catClean = cleanKey(categoria);
            const catId = catMap[catClean] || 2;
            const catNombres = { 1: 'Útiles Escolares', 2: 'Papelería', 3: 'Tecnología', 4: 'Accesorios' };
            const catNombreFinal = catNombres[catId] || 'Papelería';

            if (!codigo) {
                codigo = `PRD-${String(idx + 100).padStart(4, '0')}`;
            }

            result.push({
                codigo: codigo,
                nombre: nombre,
                descripcion: descripcion,
                categoria_id: catId,
                categoria_nombre: catNombreFinal,
                precio_venta: precio,
                stock_actual: stock,
                stock_minimo: stockMin,
                imagen: imagen || '',
                activo: 1
            });
        }
    });

    return result;
}

// Mostrar tabla de vista previa con los productos encontrados
function mostrarPreviewImportacion(productos, fileName) {
    const container = document.getElementById('importPreviewContainer');
    const tbody = document.getElementById('importPreviewTbody');
    const badge = document.getElementById('importCountBadge');
    const fileStatus = document.getElementById('importFileStatus');
    const btnEjecutar = document.getElementById('btnEjecutarImportacion');

    if (!container || !tbody) return;

    badge.textContent = `${productos.length} productos`;
    if (fileStatus) fileStatus.innerHTML = `<i class="fas fa-file-check" style="color:#16a34a;"></i> <strong>${fileName}</strong> listo para importar`;

    // Renderizar las primeras 8 filas como muestra
    const sample = productos.slice(0, 8);
    tbody.innerHTML = sample.map(p => `
        <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:7px 10px;font-weight:700;color:#0284c7;">${p.codigo}</td>
            <td style="padding:7px 10px;color:#1e293b;font-weight:600;">${p.nombre}</td>
            <td style="padding:7px 10px;"><span style="background:#e0f2fe;color:#0369a1;padding:2px 7px;border-radius:10px;font-size:0.75rem;">${p.categoria_nombre}</span></td>
            <td style="padding:7px 10px;text-align:right;font-weight:700;color:#16a34a;">$ ${p.precio_venta.toFixed(2)}</td>
            <td style="padding:7px 10px;text-align:center;font-weight:700;color:#334155;">${p.stock_actual}</td>
        </tr>
    `).join('');

    if (productos.length > 8) {
        tbody.innerHTML += `
            <tr style="background:#f8fafc;font-style:italic;color:#64748b;">
                <td colspan="5" style="padding:8px 10px;text-align:center;">
                    ... y <strong>${productos.length - 8} productos más</strong> listos para guardar.
                </td>
            </tr>
        `;
    }

    container.style.display = 'block';

    if (btnEjecutar) {
        btnEjecutar.disabled = false;
        btnEjecutar.style.background = 'linear-gradient(135deg,#16a34a,#15803d)';
        btnEjecutar.style.cursor = 'pointer';
        btnEjecutar.style.boxShadow = '0 3px 10px rgba(22,163,74,0.35)';
        btnEjecutar.innerHTML = `<i class="fas fa-check-circle"></i> Importar ${productos.length} Productos Ahora`;
    }
}

// Ejecutar guardado masivo en la base de datos MySQL y caché local
async function ejecutarImportacionMasiva() {
    if (!_importProductosCargados || !_importProductosCargados.length) {
        showToast('No hay productos cargados para importar', 'error');
        return;
    }

    const btn = document.getElementById('btnEjecutarImportacion');
    const progressBox = document.getElementById('importProgressBox');
    const progressBar = document.getElementById('importProgressBar');
    const progressPercent = document.getElementById('importProgressPercent');
    const progressText = document.getElementById('importProgressText');

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';
    }

    if (progressBox) progressBox.style.display = 'block';
    if (progressBar) progressBar.style.width = '35%';
    if (progressPercent) progressPercent.textContent = '35%';

    const isGH = window.location.hostname.includes('github.io');
    let guardadosOnline = 0;
    let actualizadosOnline = 0;

    if (!isGH) {
        try {
            if (progressText) progressText.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando en base de datos MySQL...';
            const res = await fetch(`${API_BASE}/productos.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bulk: true,
                    productos: _importProductosCargados
                })
            });

            if (res.ok) {
                const resData = await res.json();
                if (resData.status === 'success') {
                    guardadosOnline = resData.insertados || 0;
                    actualizadosOnline = resData.actualizados || 0;
                }
            }
        } catch (err) {
            console.warn('Error al guardar en backend MySQL masivo:', err);
        }
    }

    if (progressBar) progressBar.style.width = '85%';
    if (progressPercent) progressPercent.textContent = '85%';

    // Sincronizar en caché local
    try {
        let customProds = JSON.parse(localStorage.getItem('duri_products_custom') || '[]');
        if (!Array.isArray(customProds)) customProds = [];

        // Integrar o actualizar por código
        const mapExistentes = new Map(customProds.map(p => [String(p.codigo || p.id).toLowerCase(), p]));
        _importProductosCargados.forEach(np => {
            const key = String(np.codigo).toLowerCase();
            mapExistentes.set(key, { ...np, id: np.id || Date.now() + Math.random() });
        });

        const listaFinal = Array.from(mapExistentes.values());
        localStorage.setItem('duri_products_custom', JSON.stringify(listaFinal));
    } catch (e) {}

    if (progressBar) progressBar.style.width = '100%';
    if (progressPercent) progressPercent.textContent = '100%';
    if (progressText) progressText.innerHTML = '<i class="fas fa-check-circle" style="color:#16a34a;"></i> ¡Guardado completado!';

    const total = _importProductosCargados.length;
    showToast(`¡Excelente! Se han importado ${total} productos exitosamente`, 'success');

    setTimeout(() => {
        cerrarModalImportarExcel();
        if (typeof loadProductos === 'function') loadProductos();
        if (typeof loadInventario === 'function') loadInventario();
    }, 900);
}
window.ejecutarImportacionMasiva = ejecutarImportacionMasiva;


// ============================================
// PEDIDOS
// ============================================
let cart = [];

// Cargar carrito guardado (sobrevive recargas)
try {
    const savedCart = sessionStorage.getItem('cartDuri');
    if (savedCart) cart = JSON.parse(savedCart);
} catch(e) {}

function saveCart() {
    try { sessionStorage.setItem('cartDuri', JSON.stringify(cart)); } catch(e) {}
}

async function loadClientesSelect() {
    try {
        const res = await fetch(`${API_BASE}/clientes.php`);
        const data = await res.json();
        if (data.status === 'success') {
            const select = document.getElementById('clientSelect');
            if (select) {
                select.innerHTML = '<option value="">Seleccionar cliente...</option>' +
                    data.data.map(c => `<option value="${c.id}">${c.nombre} - ${c.telefono || ''}</option>`).join('');
            }
        }
    } catch (err) { console.error(err); }
}

// ============================================
// GESTIÓN DE PEDIDOS Y NOTIFICACIONES SUPER ADMIN
// ============================================

function getLocalOrders() {
    try {
        return JSON.parse(localStorage.getItem('duri_orders') || '[]');
    } catch(e) { return []; }
}

function saveLocalOrders(orders) {
    try {
        localStorage.setItem('duri_orders', JSON.stringify(orders));
    } catch(e) {}
}

function saveLocalOrder(order) {
    try {
        const orders = getLocalOrders();
        const idx = orders.findIndex(o => (o.codigo && o.codigo === order.codigo) || (o.id && String(o.id) === String(order.id)));
        if (idx >= 0) {
            orders[idx] = { ...orders[idx], ...order };
        } else {
            orders.unshift(order);
        }
        saveLocalOrders(orders);
    } catch(e) { console.error('Error guardando pedido local:', e); }
}

function playNotificationSound() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now); // Re (D5)
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.14); // La (A5)
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.38);
    } catch(e) {}
}

function showSuperAdminOrderAlert(count, orderInfo = null) {
    if (!isSuperUsuario()) return;
    const prev = document.getElementById('superAdminFloatingAlert');
    if (prev) prev.remove();

    const isInPages = window.location.pathname.includes('/pages/');
    const pedidosUrl = (isInPages ? 'pedidos.html' : 'pages/pedidos.html') + '#adminOrdersCard';

    const alert = document.createElement('div');
    alert.id = 'superAdminFloatingAlert';
    alert.className = 'superadmin-floating-alert';

    const desc = orderInfo
        ? `Pedido <b>${orderInfo.codigo}</b> ($${parseFloat(orderInfo.total).toFixed(2)}) de <b>${orderInfo.cliente_nombre || 'Cliente'}</b> espera validación de pago.`
        : `Tienes <b>${count}</b> pedido(s) con <b>pago pendiente de verificar</b>.`;

    alert.innerHTML = `
        <div class="alert-icon"><i class="fas fa-bell"></i></div>
        <div class="alert-info">
            <strong>¡Atención Super Admin!</strong>
            <span>${desc}</span>
        </div>
        <button type="button" class="alert-btn" onclick="irAPedidosValidacion()"><i class="fas fa-check-circle"></i> Validar</button>
        <button type="button" class="alert-close" onclick="this.parentElement.remove()" title="Cerrar">&times;</button>
    `;

    document.body.appendChild(alert);
    playNotificationSound();

    setTimeout(() => {
        if (alert.parentElement) {
            alert.style.opacity = '0';
            alert.style.transform = 'translateY(-20px)';
            alert.style.transition = 'all 0.4s ease';
            setTimeout(() => alert.remove(), 400);
        }
    }, 9000);
}

function irAPedidosValidacion() {
    const prev = document.getElementById('superAdminFloatingAlert');
    if (prev) prev.remove();

    const isInPages = window.location.pathname.includes('/pages/');
    const isPedidosPage = window.location.pathname.includes('pedidos.html');
    
    if (isPedidosPage) {
        const card = document.getElementById('adminOrdersCard');
        if (card) {
            card.scrollIntoView({ behavior: 'smooth' });
            card.style.transition = 'box-shadow 0.4s ease';
            card.style.boxShadow = '0 0 25px rgba(255, 102, 0, 0.5)';
            setTimeout(() => card.style.boxShadow = '', 2500);
        }
    } else {
        const target = (isInPages ? 'pedidos.html' : 'pages/pedidos.html') + '#adminOrdersCard';
        window.location.href = target;
    }
}
window.irAPedidosValidacion = irAPedidosValidacion;

async function getPendingOrdersCount() {
    let orders = [];
    try {
        const isGH = window.location.hostname.includes('github.io');
        if (!isGH) {
            const res = await fetch(`${API_BASE}/pedidos.php`);
            if (res.ok) {
                const data = await res.json();
                if (data.status === 'success' && Array.isArray(data.data)) {
                    orders = data.data;
                }
            }
        }
    } catch(e) {}

    const localOrders = getLocalOrders();
    if (!orders.length) {
        orders = localOrders;
    } else {
        const ids = new Set(orders.map(o => String(o.id)));
        const cods = new Set(orders.map(o => String(o.codigo)));
        localOrders.forEach(lo => {
            if (!ids.has(String(lo.id)) && !cods.has(String(lo.codigo))) {
                orders.push(lo);
            }
        });
    }

    const pendingCount = orders.filter(o => o.estado === 'pendiente').length;
    return { pendingCount, orders };
}

async function updateSuperAdminNotifBadge(triggerAlert = false, orderInfo = null) {
    if (!isSuperUsuario()) {
        const b = document.getElementById('navPendingOrdersBadge');
        if (b) b.remove();
        const bell = document.getElementById('adminBellCount');
        if (bell) bell.style.display = 'none';
        return;
    }

    const { pendingCount } = await getPendingOrdersCount();

    // 1. Badge en el enlace de "Pedidos" en el navbar
    const pedidosLinks = document.querySelectorAll('.nav-menu a[href*="pedidos.html"]');
    pedidosLinks.forEach(link => {
        let badge = link.querySelector('.nav-order-badge');
        if (pendingCount > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'nav-order-badge';
                badge.id = 'navPendingOrdersBadge';
                link.appendChild(badge);
            }
            badge.textContent = pendingCount;
            badge.title = `${pendingCount} pedido(s) pendiente(s) de validación de pago`;
            badge.style.display = 'inline-flex';
        } else if (badge) {
            badge.style.display = 'none';
        }
    });

    // 2. Bell icon en el user-nav-container
    const bellBadge = document.getElementById('adminBellCount');
    if (bellBadge) {
        if (pendingCount > 0) {
            bellBadge.textContent = pendingCount;
            bellBadge.style.display = 'block';
        } else {
            bellBadge.style.display = 'none';
        }
    }

    // 3. Notificación flotante
    if (pendingCount > 0 && triggerAlert) {
        showSuperAdminOrderAlert(pendingCount, orderInfo);
    }
}

function notifySuperAdminNewOrder(order) {
    try {
        localStorage.setItem('duri_new_order_alert', JSON.stringify({
            order: order,
            time: Date.now()
        }));
    } catch(e) {}

    window.dispatchEvent(new CustomEvent('duri_new_order', { detail: order }));

    if (isSuperUsuario()) {
        updateSuperAdminNotifBadge(true, order);
    }
}

function initSuperAdminNotifications() {
    if (!isSuperUsuario()) return;

    updateSuperAdminNotifBadge(false);

    // Escuchar cambios desde otras pestañas
    window.addEventListener('storage', (e) => {
        if (e.key === 'duri_last_order_event' || e.key === 'duri_new_order_alert' || e.key === 'duri_orders') {
            if (isSuperUsuario()) {
                let orderInfo = null;
                if (e.key === 'duri_new_order_alert' && e.newValue) {
                    try { orderInfo = JSON.parse(e.newValue).order; } catch(err) {}
                }
                updateSuperAdminNotifBadge(e.key === 'duri_new_order_alert', orderInfo);
                if (document.getElementById('recentOrders')) {
                    loadPedidosRecientes();
                }
            }
        }
    });

    // Escuchar evento personalizado en la misma pestaña
    window.addEventListener('duri_new_order', (e) => {
        if (isSuperUsuario()) {
            updateSuperAdminNotifBadge(true, e.detail);
            if (document.getElementById('recentOrders')) {
                loadPedidosRecientes();
            }
        }
    });

    // Sondeo periódico cada 12 segundos
    setInterval(() => {
        if (isSuperUsuario()) {
            updateSuperAdminNotifBadge(false);
        }
    }, 12000);
}

let currentAdminOrderFilter = 'todos';
window._adminOrderSearchQuery = '';

function filterAdminPedidos(filter) {
    currentAdminOrderFilter = filter;
    if (window._allAdminPedidos) {
        renderPedidosRecientes(window._allAdminPedidos, filter);
    }
}
window.filterAdminPedidos = filterAdminPedidos;

function filterAdminOrdersSearch(val) {
    window._adminOrderSearchQuery = (val || '').toLowerCase().trim();
    if (window._allAdminPedidos) {
        renderPedidosRecientes(window._allAdminPedidos, currentAdminOrderFilter);
    }
}
window.filterAdminOrdersSearch = filterAdminOrdersSearch;

async function loadPedidosRecientes() {
    const adminCard = document.getElementById('adminOrdersCard');
    
    // Solo el superusuario tiene permiso para ver y verificar los pedidos
    if (!isSuperUsuario()) {
        if (adminCard) adminCard.style.display = 'none';
        return;
    }

    if (adminCard) adminCard.style.display = 'block';

    let pedidos = [];
    try {
        const isGH = window.location.hostname.includes('github.io');
        if (!isGH) {
            const res = await fetch(`${API_BASE}/pedidos.php`);
            if (res.ok) {
                const data = await res.json();
                if (data.status === 'success' && Array.isArray(data.data)) {
                    pedidos = data.data;
                }
            }
        }
    } catch (err) {
        console.warn('API pedidos no disponible, cargando local:', err);
    }

    // Combinar con pedidos locales
    const localOrders = getLocalOrders();
    if (!pedidos.length) {
        pedidos = localOrders;
    } else {
        const ids = new Set(pedidos.map(p => String(p.id)));
        const cods = new Set(pedidos.map(p => String(p.codigo)));
        localOrders.forEach(lo => {
            // Reemplazar número de demostración de la empresa si quedó guardado en pedidos locales
            if (lo.cliente_telefono === '+58 412-1234567' || lo.cliente_telefono === '584121234567') {
                lo.cliente_telefono = '0414-5559876';
            }
            if (!ids.has(String(lo.id)) && !cods.has(String(lo.codigo))) {
                pedidos.push(lo);
            }
        });
        // Sincronizar estados de la BD hacia local y preservar datos específicos del cliente
        pedidos.forEach(p => {
            const m = localOrders.find(l => String(l.id) === String(p.id) || l.codigo === p.codigo);
            if (m) {
                if (m.estado !== p.estado) m.estado = p.estado;
                if (m.cliente_telefono && (!p.cliente_telefono || p.cliente_telefono.includes('412-1234567'))) {
                    p.cliente_telefono = m.cliente_telefono;
                }
                if (m.cliente_ci && !p.cliente_ci) {
                    p.cliente_ci = m.cliente_ci;
                }
                if ((!p.productos || !p.productos.length) && m.productos && m.productos.length) {
                    p.productos = m.productos;
                }
            }
        });
        saveLocalOrders(localOrders);
    }

    window._allAdminPedidos = pedidos;
    renderPedidosRecientes(pedidos, currentAdminOrderFilter);
    updateSuperAdminNotifBadge(false);
}

function renderPedidosRecientes(pedidos, filter = 'todos') {
    const container = document.getElementById('recentOrders');
    if (!container) return;

    if (!pedidos || pedidos.length === 0) {
        container.innerHTML = `
            <div class="admin-payment-alert ok">
                <i class="fas fa-check-circle" style="font-size:1.3rem; color:#28a745;"></i>
                <div><strong>No hay pedidos registrados en el sistema.</strong></div>
            </div>
            <p style="color:var(--gray);text-align:center;padding:15px;">Cuando un cliente realice un pedido, aparecerá aquí inmediatamente para que valides el pago.</p>
        `;
        return;
    }

    const pendingCount = pedidos.filter(p => p.estado === 'pendiente').length;
    const aprobadosCount = pedidos.filter(p => p.estado === 'procesando').length;
    const completadosCount = pedidos.filter(p => p.estado === 'completado').length;
    const canceladosCount = pedidos.filter(p => p.estado === 'cancelado').length;

    let filtered = pedidos;
    if (filter !== 'todos') {
        filtered = filtered.filter(p => p.estado === filter);
    }

    // Filtrar por término de búsqueda en el registro histórico
    if (window._adminOrderSearchQuery) {
        const q = window._adminOrderSearchQuery;
        filtered = filtered.filter(p => {
            const cod = (p.codigo || '').toLowerCase();
            const cli = (p.cliente_nombre || '').toLowerCase();
            const ci = (p.cliente_ci || '').toLowerCase();
            const tel = (p.cliente_telefono || '').toLowerCase();
            const email = (p.cliente_email || '').toLowerCase();
            return cod.includes(q) || cli.includes(q) || ci.includes(q) || tel.includes(q) || email.includes(q);
        });
    }

    const estadoClass = {'pendiente':'pending','procesando':'processing','completado':'completed','cancelado':'out'};
    const estadoText = {'pendiente':'⏳ Pendiente de Pago','procesando':'✅ Pago Confirmado','completado':'📦 Completado / Entregado','cancelado':'❌ Cancelado'};
    const canManage = isSuperUsuario();

    // 1. Alerta de resumen superior
    const adminNotice = `
        <div style="background:#f8f9fa; border:1px solid #e2e8f0; border-radius:8px; padding:8px 14px; margin-bottom:12px; font-size:0.78rem; color:#475569; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <span><i class="fas fa-shield-alt" style="color:var(--accent,#FF6600);"></i> <b>Sesión de Super Administrador activa</b>. Facturación y verificación de compras en tiempo real.</span>
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                <button type="button" onclick="abrirArchivoGeneralFacturas()" style="background:#1e1b4b; color:#fff; border:none; border-radius:6px; padding:5px 12px; font-size:0.75rem; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:5px; box-shadow:0 2px 6px rgba(30,27,75,0.25);" title="Ver libro de todas las facturas y ventas pasadas">
                    <i class="fas fa-archive" style="color:#f59e0b;"></i> Libro de Facturas
                </button>
                <button type="button" onclick="logout()" style="background:#f1f5f9; color:#334155; border:1px solid #cbd5e1; border-radius:4px; padding:4px 8px; font-size:0.72rem; cursor:pointer;" title="Cerrar sesión de administrador"><i class="fas fa-sign-out-alt"></i> Salir de Admin</button>
            </div>
        </div>
    `;

    const summaryBanner = adminNotice + (pendingCount > 0 ? `
        <div class="admin-payment-alert pending">
            <i class="fas fa-exclamation-triangle" style="font-size:1.4rem; color:#b07800;"></i>
            <div style="flex:1;">
                <div style="font-weight:700; font-size:0.95rem; color:#856404;">
                    ⚠️ ¡Atención! Tienes <strong>${pendingCount}</strong> pedido(s) con <strong>pago pendiente de verificar</strong>
                </div>
                <div style="font-size:0.82rem; color:#665103; margin-top:2px;">
                    Revisa si el dinero ingresó a tu cuenta / pago móvil y haz clic en <b>"Aprobar Pago"</b> para confirmar la compra y actualizar su factura oficial.
                </div>
            </div>
            <button type="button" class="btn btn-sm" onclick="filterAdminPedidos('pendiente')" style="background:#ff9f1c;color:#1a0f2e;font-weight:700;border:none;border-radius:6px;padding:6px 12px;cursor:pointer;white-space:nowrap;">
                Ver Pendientes (${pendingCount})
            </button>
        </div>
    ` : `
        <div class="admin-payment-alert ok">
            <i class="fas fa-check-circle" style="font-size:1.3rem; color:#28a745;"></i>
            <div style="font-weight:600; color:#155724;">
                ✅ Todos los pagos están al día. No hay pedidos pendientes de verificación.
            </div>
        </div>
    `);

    // 2. Barra de búsqueda y registro histórico de facturas
    const searchBarHtml = `
        <div style="background:#ffffff; border:1.5px solid #cbd5e1; border-radius:10px; padding:8px 14px; margin-bottom:12px; display:flex; align-items:center; gap:10px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
            <i class="fas fa-search" style="color:#64748b; font-size:0.95rem;"></i>
            <input type="text" id="adminOrderSearchInput" placeholder="Buscar en el registro histórico por código (ej: PED-001), factura (ej: FACT-0001), cliente, Cédula, teléfono o Gmail..." value="${window._adminOrderSearchQuery || ''}" oninput="filterAdminOrdersSearch(this.value)" style="border:none; outline:none; background:transparent; width:100%; font-size:0.86rem; color:#0f172a;">
            ${window._adminOrderSearchQuery ? `
                <button type="button" onclick="filterAdminOrdersSearch('')" style="background:transparent; border:none; color:#94a3b8; cursor:pointer; font-size:0.9rem;" title="Limpiar búsqueda">
                    <i class="fas fa-times-circle"></i>
                </button>
            ` : ''}
        </div>
    `;

    // 3. Pestañas de filtrado
    const tabsHtml = `
        <div class="admin-orders-tabs">
            <button type="button" class="admin-order-tab ${filter === 'todos' ? 'active' : ''}" onclick="filterAdminPedidos('todos')">Todos (${pedidos.length})</button>
            <button type="button" class="admin-order-tab ${filter === 'pendiente' ? 'active' : ''}" style="${pendingCount > 0 ? 'border-color:#ff9f1c; color:#d97706; font-weight:700;' : ''}" onclick="filterAdminPedidos('pendiente')">⏳ Pendientes de Pago (${pendingCount})</button>
            <button type="button" class="admin-order-tab ${filter === 'procesando' ? 'active' : ''}" onclick="filterAdminPedidos('procesando')">✅ Pagos Aprobados (${aprobadosCount})</button>
            <button type="button" class="admin-order-tab ${filter === 'completado' ? 'active' : ''}" onclick="filterAdminPedidos('completado')">📦 Completados (${completadosCount})</button>
            <button type="button" class="admin-order-tab ${filter === 'cancelado' ? 'active' : ''}" onclick="filterAdminPedidos('cancelado')">❌ Cancelados (${canceladosCount})</button>
        </div>
    `;

    // 4. Renderizar cada pedido con su botón de Factura Oficial
    const listHtml = filtered.length === 0 ? `
        <p style="color:var(--gray);text-align:center;padding:25px;background:#f9f9f9;border-radius:8px;">No hay pedidos que coincidan con el filtro o la búsqueda.</p>
    ` : filtered.map(p => {
        const safeName = (p.cliente_nombre || 'Cliente').replace(/'/g, "\\'");
        const safeCode = (p.codigo || '').replace(/'/g, "\\'");
        const safePay = (p.forma_pago || 'pago_movil').replace(/'/g, "\\'");
        const safeTotal = parseFloat(p.total || 0).toFixed(2);
        const safePhone = (p.cliente_telefono || '').replace(/'/g, "\\'");
        const safeCi = (p.cliente_ci || '').replace(/'/g, "\\'");
        const safeEmail = (p.cliente_email || '').replace(/'/g, "\\'");
        const cleanNum = (p.codigo || String(p.id)).replace(/[^0-9]/g, '') || String(p.id);
        const factNum = `FACT-${cleanNum.padStart(4, '0')}`;

        let actionButtons = '';
        if (canManage) {
            let statusBtn = '';
            if (p.estado === 'pendiente') {
                statusBtn = `
                    <button type="button" class="btn btn-sm" style="background:#28a745;color:#fff;font-weight:700;padding:8px 14px;font-size:0.82rem;border-radius:6px;border:none;cursor:pointer;display:inline-flex;align-items:center;gap:6px;box-shadow:0 2px 8px rgba(40,167,69,0.35);" onclick="abrirModalValidarPago(${p.id}, '${safeCode}', ${safeTotal}, '${safeName}', '${safePay}', '${safePhone}', '${safeCi}', '${safeEmail}')">
                        <i class="fas fa-check-circle"></i> Aprobar Pago
                    </button>
                    <button type="button" class="btn btn-sm" style="background:#e0a800;color:#212529;font-weight:600;padding:8px 12px;font-size:0.82rem;border-radius:6px;border:none;cursor:pointer;display:inline-flex;align-items:center;gap:5px;" onclick="confirmarCancelarPedido(${p.id}, '${safeCode}')">
                        <i class="fas fa-times-circle"></i> Cancelar
                    </button>
                `;
            } else if (p.estado === 'procesando') {
                statusBtn = `
                    <button type="button" class="btn btn-sm" style="background:#007bff;color:#fff;padding:7px 12px;font-size:0.8rem;border-radius:6px;border:none;cursor:pointer;display:inline-flex;align-items:center;gap:5px;" onclick="actualizarEstadoPedidoDirecto(${p.id}, 'completado', '${safeCode}')">
                        <i class="fas fa-box-check"></i> Entregar / Completar
                    </button>
                    <button type="button" class="btn btn-sm" style="background:#ffc107;color:#212529;padding:7px 10px;font-size:0.8rem;border-radius:6px;border:none;cursor:pointer;" onclick="confirmarCancelarPedido(${p.id}, '${safeCode}')">
                        <i class="fas fa-undo"></i> Cancelar
                    </button>
                `;
            }

            actionButtons = `
                ${statusBtn}
                <button type="button" class="btn btn-sm" style="background:#4f46e5;color:#fff;font-weight:700;padding:7px 14px;font-size:0.82rem;border-radius:6px;border:none;cursor:pointer;display:inline-flex;align-items:center;gap:5px;box-shadow:0 2px 6px rgba(79,70,229,0.35);" onclick="abrirModalFacturaAdmin('${safeCode}')" title="Ver, imprimir y descargar factura oficial">
                    <i class="fas fa-file-invoice-dollar"></i> Factura
                </button>
                <button class="btn btn-sm" style="background:#dc3545;color:#fff;padding:6px 10px;font-size:0.78rem;border-radius:4px;border:none;cursor:pointer;" title="Eliminar del historial permanentemente" onclick="eliminarPedidoHistorial(${p.id}, '${p.codigo}')">
                    <i class="fas fa-trash-alt"></i>
                </button>
            `;
        } else {
            actionButtons = `
                <button type="button" class="btn btn-sm" style="background:#4f46e5;color:#fff;font-weight:600;padding:6px 12px;font-size:0.8rem;border-radius:6px;border:none;cursor:pointer;display:inline-flex;align-items:center;gap:5px;" onclick="abrirModalFacturaAdmin('${safeCode}')">
                    <i class="fas fa-file-invoice-dollar"></i> Ver Factura
                </button>
            `;
        }

        const formaPagoLabels = {
            'pago_movil': '📱 Pago Móvil',
            'transferencia': '🏦 Transferencia Bancaria',
            'tarjeta': '💳 Tarjeta',
            'efectivo': '💵 Efectivo'
        };
        const formaPagoDisplay = formaPagoLabels[p.forma_pago] || p.forma_pago || 'Pago Móvil';
        
        // Formatear WhatsApp al NÚMERO DEL CLIENTE
        let phoneWaUrl = '';
        if (p.cliente_telefono) {
            let clean = p.cliente_telefono.replace(/[^0-9]/g, '');
            if (clean.startsWith('0')) clean = '58' + clean.slice(1);
            if (!clean.startsWith('58') && clean.length === 10) clean = '58' + clean;
            if (clean.length >= 10) {
                const waText = encodeURIComponent(`Hola ${p.cliente_nombre || 'estimado cliente'}, le escribimos de Inversiones Duri sobre su pedido ${p.codigo}.`);
                phoneWaUrl = `https://wa.me/${clean}?text=${waText}`;
            }
        }

        const isPendiente = p.estado === 'pendiente';

        const prods = (p.productos && p.productos.length) ? p.productos : (p.detalles || []);
        let productsSnippet = '';
        if (prods && prods.length) {
            const itemsList = prods.map(it => {
                const name = (it.nombre || it.producto_nombre || 'Producto').replace(/'/g, "\\'");
                const qty = it.cantidad || 1;
                const price = parseFloat(it.precio_unitario || 0).toFixed(2);
                return `<span style="display:inline-flex; align-items:center; gap:4px; background:#f8fafc; color:#1e293b; padding:2px 8px; border-radius:6px; font-size:0.75rem; font-weight:600; border:1px solid #e2e8f0;"><i class="fas fa-box" style="color:var(--accent,#FF6600); font-size:0.7rem;"></i> ${name} <strong style="color:#0f172a;">&times;${qty}</strong> <span style="color:#64748b; font-size:0.7rem;">($${price})</span></span>`;
            }).join(' ');

            productsSnippet = `
                <div style="margin-top:6px; padding:6px 10px; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
                    <span style="font-size:0.76rem; font-weight:700; color:#475569; display:inline-flex; align-items:center; gap:4px;"><i class="fas fa-boxes" style="color:var(--accent,#FF6600);"></i> Pide (${prods.length}):</span>
                    ${itemsList}
                </div>
            `;
        }

        return `
            <div class="order-row ${isPendiente ? 'order-pending-highlight' : ''}" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; padding:14px; margin-bottom:10px; border:1px solid ${isPendiente ? '#ffc107' : '#eee'}; border-radius:8px; background:#fff; box-shadow:0 2px 5px rgba(0,0,0,0.03);">
                <div class="order-row-info" style="display:flex; flex-direction:column; gap:4px; flex:1; min-width:240px;">
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        <strong style="color:var(--dark-brown,#333); font-size:1.02rem;">${p.codigo} &mdash; ${p.cliente_nombre || 'Cliente'}</strong>
                        <span style="background:#e0e7ff; color:#3730a3; border:1px solid #c7d2fe; font-size:0.73rem; font-weight:800; padding:2px 8px; border-radius:6px; font-family:monospace;" title="N° de Factura Oficial">${factNum}</span>
                        ${isPendiente ? '<span style="background:#fffae6; color:#b07800; border:1px solid #ffe58f; font-size:0.72rem; font-weight:700; padding:2px 8px; border-radius:10px;"><i class="fas fa-hourglass-half"></i> Requiere Verificación</span>' : ''}
                    </div>
                    <span style="font-size:0.83rem; color:var(--dark,#444);">
                        ${p.cliente_ci ? '<i class="fas fa-id-card" style="color:var(--accent,#FF6600);"></i> <strong>' + p.cliente_ci + '</strong> · ' : ''}
                        ${p.cliente_telefono ? '<i class="fas fa-phone" style="color:#666;"></i> <strong>' + p.cliente_telefono + '</strong>' : ''}
                        ${phoneWaUrl ? ` <a href="${phoneWaUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-flex; align-items:center; gap:4px; background:#e8f7ee; color:#128c7e; border:1px solid #c3e6cb; padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:700; text-decoration:none; margin-left:4px;" title="Chatear con el cliente (${p.cliente_telefono})"><i class="fab fa-whatsapp" style="color:#25d366; font-size:0.85rem;"></i> Chat</a>` : ''}
                        ${p.cliente_email ? ` · <a href="mailto:${p.cliente_email}" style="display:inline-flex; align-items:center; gap:4px; background:#f0f7ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:700; text-decoration:none;" title="Enviar correo a ${p.cliente_email}"><i class="fas fa-envelope" style="color:#ea4335;"></i> ${p.cliente_email}</a>` : ''}
                        · <strong>Pago:</strong> ${formaPagoDisplay}
                    </span>
                    ${p.direccion_entrega ? `<span style="font-size:0.76rem; color:#666;"><i class="fas fa-map-marker-alt"></i> ${p.direccion_entrega}</span>` : ''}
                    ${productsSnippet}
                </div>
                <div class="order-row-details" style="display:flex; align-items:center; gap:12px;">
                    <span style="font-weight:700; font-size:1.1rem; color:#28a745;">$${parseFloat(p.total).toFixed(2)}</span>
                    <span class="status ${estadoClass[p.estado] || 'pending'}" style="padding:4px 10px; border-radius:12px; font-size:0.75rem; font-weight:700;">${estadoText[p.estado] || p.estado}</span>
                </div>
                <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                    ${actionButtons}
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = summaryBanner + searchBarHtml + tabsHtml + listHtml;

    // Restaurar foco si el usuario estaba escribiendo en el buscador
    const searchInput = document.getElementById('adminOrderSearchInput');
    if (searchInput && window._adminOrderSearchQuery) {
        searchInput.focus();
        const len = searchInput.value.length;
        searchInput.setSelectionRange(len, len);
    }
}

// ============================================
// MÓDULO DE FACTURACIÓN Y CONTROL CONTABLE
// Inversiones Duri C.A.
// ============================================

function loadPdfLibraries() {
    return new Promise((resolve) => {
        const hasCanvas = typeof window.html2canvas === 'function';
        const hasJsPdf = !!((window.jspdf && window.jspdf.jsPDF) || window.jsPDF);
        if (hasCanvas && hasJsPdf) return resolve(true);

        let needed = 0;
        let loaded = 0;
        const check = () => {
            loaded++;
            if (loaded >= needed) {
                setTimeout(() => resolve(true), 60);
            }
        };

        if (!hasCanvas) {
            needed++;
            const s1 = document.createElement('script');
            s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
            s1.onload = check;
            s1.onerror = () => { console.error('Error cargando html2canvas CDN'); check(); };
            document.head.appendChild(s1);
        }

        if (!hasJsPdf) {
            needed++;
            const s2 = document.createElement('script');
            s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            s2.onload = check;
            s2.onerror = () => { console.error('Error cargando jsPDF CDN'); check(); };
            document.head.appendChild(s2);
        }

        if (needed === 0) resolve(true);
    });
}
function ensureHtml2Pdf(callback) {
    loadPdfLibraries().then(() => { if (callback) callback(); });
}

function findOrderData(codigoOrId) {
    if (!codigoOrId) return null;
    const all = window._allAdminPedidos || [];
    const local = (typeof getLocalOrders === 'function') ? getLocalOrders() : [];
    const combined = [...all, ...local];
    const target = String(codigoOrId).toLowerCase().trim();
    return combined.find(o => 
        String(o.codigo || '').toLowerCase() === target || 
        String(o.id || '') === target
    ) || null;
}

function abrirModalFacturaAdmin(codigo) {
    abrirModalFactura(codigo);
}
window.abrirModalFacturaAdmin = abrirModalFacturaAdmin;

function cerrarModalFactura() {
    const modal = document.getElementById('modalFacturaDuri');
    if (modal) modal.remove();
}
window.cerrarModalFactura = cerrarModalFactura;

function abrirModalFactura(pedidoOrCode) {
    cerrarModalFactura();

    let p = null;
    if (typeof pedidoOrCode === 'object' && pedidoOrCode !== null) {
        p = pedidoOrCode;
    } else {
        p = findOrderData(pedidoOrCode);
    }

    if (!p) {
        showToast('No se encontró el registro del pedido para generar la factura', 'error');
        return;
    }

    // Seguridad: la factura oficial no se muestra al cliente si el pago no ha sido validado
    if (!isSuperUsuario() && (p.estado === 'pendiente' || !p.estado)) {
        showToast('El pedido aún está en espera de validación de pago. La Factura Oficial se emitirá al ser aprobado.', 'warning');
        return;
    }

    // Datos corporativos y correlativo
    const codigo = p.codigo || `PED-${p.id || '001'}`;
    const cleanNum = codigo.replace(/[^0-9]/g, '') || String(p.id || '101');
    const facturaNum = `FACT-${cleanNum.padStart(4, '0')}`;
    const logoSrc = window.location.pathname.includes('/pages/') ? '../img/logo-duri.png' : 'img/logo-duri.png';

    // Fecha formateada
    let fechaStr = '';
    try {
        const d = p.created_at ? new Date(p.created_at.replace(/-/g, '/')) : new Date();
        fechaStr = d.toLocaleDateString('es-VE', { 
            year: 'numeric', month: 'long', day: 'numeric', 
            hour: '2-digit', minute: '2-digit', hour12: true 
        });
    } catch(e) {
        fechaStr = new Date().toLocaleString('es-VE');
    }

    // Estado del pago
    const estado = p.estado || 'pendiente';
    let estadoLabel = '⏳ PENDIENTE DE VALIDACIÓN';
    let estadoTagClass = 'pendiente';
    if (estado === 'procesando') {
        estadoLabel = '✅ PAGO APROBADO / EN PROCESO';
        estadoTagClass = 'procesando';
    } else if (estado === 'completado') {
        estadoLabel = '📦 PEDIDO ENTREGADO / COMPLETADO';
        estadoTagClass = 'completado';
    } else if (estado === 'cancelado') {
        estadoLabel = '❌ ANULADO / CANCELADO';
        estadoTagClass = 'cancelado';
    }

    // Forma de pago legible
    const formaPagoMap = {
        'pago_movil': 'Pago Móvil Interbancario',
        'transferencia': 'Transferencia Bancaria',
        'efectivo': 'Efectivo',
        'tarjeta': 'Tarjeta'
    };
    const formaPagoTxt = formaPagoMap[p.forma_pago] || p.forma_pago || 'Pago Móvil';

    // Cálculo y desglose monetario dual
    const totalVal = parseFloat(p.total || 0);
    let deliveryVal = p.delivery_cost ? parseFloat(p.delivery_cost) : (p.costo_delivery ? parseFloat(p.costo_delivery) : 0);
    if (deliveryVal === 0 && p.direccion_entrega && p.direccion_entrega.includes('Tarifa: $')) {
        const m = p.direccion_entrega.match(/Tarifa:\s*\$([0-9\.]+)/);
        if (m) deliveryVal = parseFloat(m[1]);
    }
    const hasDelivery = deliveryVal > 0 || (p.direccion_entrega && p.direccion_entrega.includes('[DELIVERY'));

    let subtotalVal = p.subtotal ? parseFloat(p.subtotal) : ((totalVal - deliveryVal) / 1.16);
    let ivaVal = p.impuesto ? parseFloat(p.impuesto) : ((totalVal - deliveryVal) - subtotalVal);

    if (isNaN(subtotalVal) || subtotalVal <= 0) subtotalVal = (totalVal - deliveryVal) / 1.16;
    if (isNaN(ivaVal) || ivaVal < 0) ivaVal = (totalVal - deliveryVal) - subtotalVal;

    const rateBs = BcvManager.rate || 45.00;
    const rateBsStr = BcvManager.formatBs(rateBs).replace('Bs. ', '');
    const totalBsStr = BcvManager.formatBs(BcvManager.toBs(totalVal));
    const subtotalBsStr = BcvManager.formatBs(BcvManager.toBs(subtotalVal));
    const ivaBsStr = BcvManager.formatBs(BcvManager.toBs(ivaVal));
    const deliveryBsStr = BcvManager.formatBs(BcvManager.toBs(deliveryVal));

    // Tabla de productos
    const prods = (p.productos && p.productos.length) ? p.productos : (p.detalles || []);
    let rowsHtml = '';
    if (prods && prods.length) {
        rowsHtml = prods.map((it, idx) => {
            const name = it.nombre || it.producto_nombre || 'Producto';
            const qty = parseInt(it.cantidad || 1);
            const price = parseFloat(it.precio_unitario || 0);
            const itemSub = price * qty;
            const itemBs = BcvManager.formatBs(BcvManager.toBs(itemSub));
            return `
                <tr>
                    <td class="td-center">${idx + 1}</td>
                    <td><strong>${name}</strong></td>
                    <td class="td-center">${qty}</td>
                    <td class="td-right">$${price.toFixed(2)}</td>
                    <td class="td-right">$${itemSub.toFixed(2)}</td>
                    <td class="td-right" style="color:#64748b; font-size:0.78rem;">${itemBs}</td>
                </tr>
            `;
        }).join('');
    } else {
        rowsHtml = `
            <tr>
                <td class="td-center">1</td>
                <td><strong>Productos solicitados en pedido ${codigo}</strong></td>
                <td class="td-center">1</td>
                <td class="td-right">$${subtotalVal.toFixed(2)}</td>
                <td class="td-right">$${subtotalVal.toFixed(2)}</td>
                <td class="td-right" style="color:#64748b; font-size:0.78rem;">${subtotalBsStr}</td>
            </tr>
        `;
    }

    const modal = document.createElement('div');
    modal.id = 'modalFacturaDuri';
    modal.className = 'modal-factura-overlay';
    modal.innerHTML = `
        <div class="factura-modal-container">
            <!-- Barra Superior de Acciones (No se imprime) -->
            <div class="factura-actions-bar no-print">
                <div class="factura-actions-left">
                    <i class="fas fa-file-invoice-dollar"></i>
                    <strong>Factura / Comprobante Oficial &mdash; ${codigo}</strong>
                </div>
                <div class="factura-actions-right">
                    <button type="button" class="btn-factura-act btn-pdf" onclick="descargarFacturaPDF('${codigo}')" title="Descargar documento en formato PDF">
                        <i class="fas fa-download"></i> Descargar PDF
                    </button>
                    <button type="button" class="btn-factura-act btn-print" onclick="imprimirFacturaDuri()" title="Imprimir en impresora o guardar con el navegador">
                        <i class="fas fa-print"></i> Imprimir
                    </button>
                    <button type="button" class="btn-factura-act btn-wa" onclick="compartirFacturaWhatsApp('${codigo}')" title="Enviar copia o notificación al WhatsApp del cliente">
                        <i class="fab fa-whatsapp"></i> Enviar WhatsApp
                    </button>
                    <button type="button" class="btn-factura-act btn-email" onclick="enviarFacturaPorCorreoPrompt('${codigo}')" title="Enviar factura directamente al correo del cliente">
                        <i class="fas fa-envelope"></i> Enviar Correo
                    </button>
                    <button type="button" class="btn-factura-close" onclick="cerrarModalFactura()" title="Cerrar modal">&times;</button>
                </div>
            </div>

            <!-- Hoja Imprimible Oficial -->
            <div class="factura-scroll-wrap">
                <div id="facturaPrintArea" class="factura-paper">
                    <!-- Encabezado Membrete Oficial -->
                    <div class="factura-header-grid">
                        <div class="factura-brand">
                            <img src="${logoSrc}" alt="Logo Inversiones Duri" class="factura-logo-img" onerror="this.style.display='none'">
                            <div class="factura-company-info">
                                <h2>Inversiones Duri C.A.</h2>
                                <p><strong>RIF:</strong> J-50123456-7</p>
                                <p><i class="fas fa-map-marker-alt" style="color:#ea4335;"></i> Sede Comercial: Av. Bolívar Oeste, Maracay, Edo. Aragua</p>
                                <p><i class="fas fa-phone" style="color:#28a745;"></i> +58 412-1234567 | <i class="fas fa-envelope" style="color:#1a73e8;"></i> inversionesduri@gmail.com</p>
                                <p><i class="fab fa-instagram" style="color:#e1306c;"></i> @inversionesdurica | <i class="fab fa-facebook-f" style="color:#1877f2;"></i> Inversiones Duri</p>
                            </div>
                        </div>
                        <div class="factura-doc-box">
                            <div class="factura-doc-title">NOTA DE ENTREGA / FACTURA</div>
                            <div class="factura-doc-num">${facturaNum}</div>
                            <div class="factura-doc-date"><strong>Pedido:</strong> ${codigo}</div>
                            <div class="factura-doc-date">${fechaStr}</div>
                            <div>
                                <span class="factura-status-tag ${estadoTagClass}">
                                    ${estadoLabel}
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- Datos del Cliente y Despacho -->
                    <div class="factura-info-grid">
                        <div class="factura-info-col">
                            <h4><i class="fas fa-user-check"></i> Facturado a (Cliente)</h4>
                            <p><strong>Nombre / Razón Social:</strong> ${p.cliente_nombre || 'Cliente General'}</p>
                            <p><strong>Cédula / RIF:</strong> ${p.cliente_ci || 'No registrada'}</p>
                            <p><strong>Teléfono de Contacto:</strong> ${p.cliente_telefono || 'No registrado'}</p>
                            <p><strong>Correo / Gmail:</strong> ${p.cliente_email ? `<a href="mailto:${p.cliente_email}" style="color:#1d4ed8; text-decoration:none;">${p.cliente_email}</a>` : 'No registrado'}</p>
                        </div>
                        <div class="factura-info-col">
                            <h4><i class="fas fa-shipping-fast"></i> Despacho y Pago</h4>
                            <p><strong>Forma de Pago:</strong> ${formaPagoTxt}</p>
                            <p><strong>Tasa Oficial BCV:</strong> ${rateBsStr} Bs / USD</p>
                            <p><strong>Dirección de Entrega:</strong> ${p.direccion_entrega || 'Retiro en Sede Oficial'}</p>
                            ${p.notas ? `<p><strong>Notas:</strong> ${p.notas}</p>` : ''}
                        </div>
                    </div>

                    <!-- Tabla de Productos -->
                    <table class="factura-table">
                        <thead>
                            <tr>
                                <th class="th-center" style="width: 40px;">#</th>
                                <th>Descripción del Producto</th>
                                <th class="th-center" style="width: 65px;">Cant.</th>
                                <th class="th-right" style="width: 100px;">P. Unit ($)</th>
                                <th class="th-right" style="width: 105px;">Subtotal ($)</th>
                                <th class="th-right" style="width: 115px;">Equiv. (Bs.)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>

                    <!-- Caja de Totales y Moneda Dual -->
                    <div class="factura-totals-wrap">
                            <div class="factura-total-row">
                                <span>Subtotal Base:</span>
                                <strong>$${subtotalVal.toFixed(2)} <small style="color:#64748b;">(${subtotalBsStr})</small></strong>
                            </div>
                            <div class="factura-total-row">
                                <span>IVA (16%):</span>
                                <strong>$${ivaVal.toFixed(2)} <small style="color:#64748b;">(${ivaBsStr})</small></strong>
                            </div>
                            <div class="factura-total-row" style="color:${hasDelivery && deliveryVal > 0 ? '#0284c7' : '#059669'};">
                                <span>${hasDelivery ? 'Servicio de Delivery:' : 'Modalidad de Entrega:'}</span>
                                <strong>${hasDelivery ? (deliveryVal > 0 ? `+$${deliveryVal.toFixed(2)}` : '¡GRATIS ($0.00)!') : 'Retiro en Local'} <small style="color:#64748b;">(${hasDelivery ? (deliveryVal > 0 ? deliveryBsStr : 'Bs. 0,00') : 'Gratis'})</small></strong>
                            </div>
                            <div class="factura-total-row grand-total">
                                <span>TOTAL A PAGAR:</span>
                                <span>$${totalVal.toFixed(2)} USD</span>
                            </div>
                            <div class="factura-total-bs-row">
                                <span>Total en Bolívares (BCV):</span>
                                <span>${totalBsStr}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Pie de Página y Sello de Verificación -->
                    <div class="factura-footer-notice">
                        <div style="flex:1; min-width:240px;">
                            <p style="margin:0 0 4px 0; font-weight:600; color:#334155;">
                                <i class="fas fa-shield-alt" style="color:#059669;"></i> Comprobante Electrónico y Registro de Compra Oficial
                            </p>
                            <p style="margin:0; font-size:0.71rem; line-height:1.4;">
                                Emitido por Inversiones Duri C.A. para control de inventario, garantías y despacho. Válido como soporte fiscal y nota de entrega.
                            </p>
                        </div>
                        <div class="factura-seal-box">
                            <i class="fas fa-stamp"></i>
                            <div class="factura-seal-text">
                                <strong>Inversiones Duri C.A.</strong>
                                <span>${estado === 'procesando' || estado === 'completado' ? 'VALIDADO POR ADMINISTRACIÓN' : 'REGISTRO DE VENTA OFICIAL'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    modal.addEventListener('click', function(e) {
        if (e.target === modal) cerrarModalFactura();
    });
}
window.abrirModalFactura = abrirModalFactura;

async function descargarFacturaPDF(codigo) {
    const originalArea = document.getElementById('facturaPrintArea');
    if (!originalArea) {
        showToast('No se encontró el documento de la factura', 'error');
        return;
    }
    const cleanCod = (codigo || 'Duri').replace(/[^a-zA-Z0-9_-]/g, '');
    const filename = `Factura_${cleanCod}.pdf`;
    showToast('Generando archivo PDF oficial...', 'info');

    await loadPdfLibraries();

    const JsPdfConstructor = (window.jspdf && window.jspdf.jsPDF) 
        ? window.jspdf.jsPDF 
        : (window.jsPDF || window.jspdf);

    if (!window.html2canvas || !JsPdfConstructor) {
        console.warn('Librerías PDF no disponibles, recurriendo a diálogo de impresión');
        window.print();
        return;
    }

    try {
        // Aseguramos que el contenedor de la factura esté en la parte superior antes de capturar
        const scrollWrap = originalArea.closest('.factura-scroll-wrap');
        const prevScroll = scrollWrap ? scrollWrap.scrollTop : 0;
        if (scrollWrap) scrollWrap.scrollTop = 0;

        // Esperar un instante para que cualquier repintado o renderizado concluya
        await new Promise(r => setTimeout(r, 80));

        const canvas = await window.html2canvas(originalArea, {
            scale: 2,
            useCORS: true,
            allowTaint: false,
            backgroundColor: '#ffffff',
            logging: false,
            scrollX: 0,
            scrollY: 0
        });

        if (scrollWrap) scrollWrap.scrollTop = prevScroll;

        if (!canvas || canvas.width === 0 || canvas.height === 0) {
            throw new Error('Canvas vacío');
        }

        const imgData = canvas.toDataURL('image/jpeg', 0.96);
        const pdf = new JsPdfConstructor({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const pageWidth = 210;
        const pageHeight = 297;
        const margin = 8;
        const printWidth = pageWidth - (margin * 2);
        const printHeight = (canvas.height * printWidth) / canvas.width;
        const maxContentHeight = pageHeight - (margin * 2);

        if (printHeight <= maxContentHeight) {
            pdf.addImage(imgData, 'JPEG', margin, margin, printWidth, printHeight);
        } else {
            // Manejo automático de páginas si el contenido excede 1 página A4
            let heightLeft = printHeight;
            let position = margin;

            pdf.addImage(imgData, 'JPEG', margin, position, printWidth, printHeight);
            heightLeft -= maxContentHeight;

            while (heightLeft > 0) {
                position = margin - (printHeight - heightLeft);
                pdf.addPage();
                pdf.addImage(imgData, 'JPEG', margin, position, printWidth, printHeight);
                heightLeft -= maxContentHeight;
            }
        }

        pdf.save(filename);
        showToast('¡Factura PDF descargada con éxito!', 'success');

    } catch (err) {
        console.error('Error generando PDF con html2canvas:', err);
        showToast('Abriendo ventana de impresión para guardar PDF...', 'info');
        window.print();
    }
}
window.descargarFacturaPDF = descargarFacturaPDF;

function imprimirFacturaDuri() {
    window.print();
}
window.imprimirFacturaDuri = imprimirFacturaDuri;

function compartirFacturaWhatsApp(codigo) {
    const p = findOrderData(codigo);
    if (!p) {
        showToast('No se encontró el pedido para enviar por WhatsApp', 'error');
        return;
    }
    const tel = p.cliente_telefono ? p.cliente_telefono.replace(/[^0-9]/g, '') : '';
    let waPhone = tel;
    if (waPhone.startsWith('0')) waPhone = '58' + waPhone.slice(1);
    if (!waPhone.startsWith('58') && waPhone.length === 10) waPhone = '58' + waPhone;

    const rateBsStr = BcvManager.formatBs(BcvManager.rate).replace('Bs. ', '');
    const totalBs = BcvManager.formatBs(BcvManager.toBs(parseFloat(p.total)));
    const cleanNum = (p.codigo || String(p.id)).replace(/[^0-9]/g, '') || String(p.id || '101');
    const facturaNum = `FACT-${cleanNum.padStart(4, '0')}`;

    const msg = `📄 *INVERSIONES DURI C.A. — COMPROBANTE OFICIAL*\n\nEstimado(a) *${p.cliente_nombre || 'Cliente'}*:\nLe compartimos la información oficial de su factura *${facturaNum}* (Pedido *${p.codigo}*).\n\n• Cédula/RIF: ${p.cliente_ci || 'N/A'}\n• Estado del Pago: ${p.estado === 'procesando' || p.estado === 'completado' ? '✅ Pago Aprobado' : '⏳ Pendiente de Verificación'}\n• Total: $${parseFloat(p.total).toFixed(2)} USD (≈ ${totalBs} a tasa BCV ${rateBsStr})\n• Forma de Pago: ${p.forma_pago || 'Pago Móvil'}\n\nGracias por su compra en Inversiones Duri C.A.`;

    const url = waPhone.length >= 10
        ? `https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`
        : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
}
window.compartirFacturaWhatsApp = compartirFacturaWhatsApp;

// Modal de éxito post-compra (sin factura hasta que el pago sea aprobado por el Super Admin)
function mostrarModalExitoConFactura(order, waUrl) {
    cerrarModalExito();
    const modal = document.createElement('div');
    modal.id = 'modalOrderSuccess';
    modal.className = 'order-success-modal';

    const codigo = order.codigo || `PED-${order.id || '001'}`;
    const totalBs = BcvManager.formatBs(BcvManager.toBs(parseFloat(order.total)));

    modal.innerHTML = `
        <div class="order-success-card" style="max-width:480px;">
            <div class="order-success-header" style="background:linear-gradient(135deg, #1e293b 0%, #0f172a 100%);">
                <div class="order-success-icon" style="background:#eab308; border:2px solid rgba(255,255,255,0.4);">
                    <i class="fas fa-clock" style="color:#ffffff;"></i>
                </div>
                <h3 style="margin:0 0 6px 0; font-size:1.35rem; font-weight:800;">¡Pedido Recibido con Éxito!</h3>
                <p style="margin:0; font-size:0.86rem; opacity:0.9;">Tu solicitud ha sido registrada en Inversiones Duri C.A.</p>
            </div>
            <div class="order-success-body">
                <div class="order-success-code-box" style="background:#f8fafc; border-color:#e2e8f0; margin-bottom:14px;">
                    <div style="text-align:left;">
                        <span style="font-size:0.72rem; color:#64748b; text-transform:uppercase; font-weight:700;">N° de Pedido</span>
                        <div style="font-size:1.25rem; font-weight:800; color:#0f172a; font-family:monospace;">${codigo}</div>
                    </div>
                    <div style="text-align:right;">
                        <span style="font-size:0.72rem; color:#64748b; text-transform:uppercase; font-weight:700;">Monto a Validar</span>
                        <div style="font-size:1.2rem; font-weight:800; color:#e11d48;">$${parseFloat(order.total).toFixed(2)}</div>
                        <div style="font-size:0.75rem; color:#64748b;">≈ ${totalBs}</div>
                    </div>
                </div>

                <div style="background:#eff6ff; border:1.5px solid #bfdbfe; border-radius:12px; padding:14px; margin-bottom:18px; text-align:left; font-size:0.83rem; color:#1e40af; line-height:1.55;">
                    <div style="display:flex; align-items:center; gap:8px; font-weight:700; font-size:0.9rem; margin-bottom:6px; color:#1d4ed8;">
                        <i class="fas fa-info-circle" style="font-size:1.05rem;"></i> Pedido Pendiente de Validación
                    </div>
                    <p style="margin:0;">
                        Tu pedido ha sido recibido y está <b>en proceso de verificación de pago</b>. En cuanto el administrador valide tu compra, se generará la <b>Factura Oficial sellada</b> y te llegará automáticamente a tu correo electrónico${order.cliente_email ? ` (<b>${order.cliente_email}</b>)` : ''}.
                    </p>
                </div>

                <div class="order-success-buttons">
                    ${waUrl ? `
                        <button type="button" class="btn btn-block" onclick="window.open('${waUrl}', '_blank');" style="background:#25d366; color:#fff; font-weight:700; display:flex; align-items:center; justify-content:center; gap:8px; padding:13px; border:none; border-radius:10px; cursor:pointer; font-size:0.95rem; box-shadow:0 4px 12px rgba(37,211,102,0.35);">
                            <i class="fab fa-whatsapp" style="font-size:1.2rem;"></i> Enviar Comprobante por WhatsApp
                        </button>
                    ` : ''}
                    <button type="button" class="btn btn-block" onclick="cerrarModalExito();" style="background:#f1f5f9; color:#475569; font-weight:600; padding:11px; border:1px solid #cbd5e1; border-radius:10px; cursor:pointer; margin-top:4px;">
                        Entendido, Volver a la Tienda
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.addEventListener('click', function(e) {
        if (e.target === modal) cerrarModalExito();
    });
}
window.mostrarModalExitoConFactura = mostrarModalExitoConFactura;

function cerrarModalExito() {
    const modal = document.getElementById('modalOrderSuccess');
    if (modal) modal.remove();
}
window.cerrarModalExito = cerrarModalExito;



// ============================================
// MODAL DE VALIDACIÓN Y CONFIRMACIÓN DE PAGO
// ============================================

function cerrarModalValidacionPago() {
    const modal = document.getElementById('modalValidarPagoAdmin');
    if (modal) modal.remove();
}
window.cerrarModalValidacionPago = cerrarModalValidacionPago;

function abrirModalValidarPago(id, codigo, total, clienteNombre = '', formaPago = 'pago_movil', clienteTelefono = '', clienteCi = '', clienteEmail = '') {
    cerrarModalValidacionPago();

    const formaPagoLabels = {
        'pago_movil': '📱 Pago Móvil',
        'transferencia': '🏦 Transferencia Bancaria',
        'tarjeta': '💳 Tarjeta',
        'efectivo': '💵 Efectivo'
    };
    const paymentDisplay = formaPagoLabels[formaPago] || formaPago || 'Pago Móvil';
    const totalDisplay = parseFloat(total || 0).toFixed(2);

    // Link de WhatsApp directo al cliente para consultar el comprobante
    let clientWaLink = '';
    if (clienteTelefono) {
        let clean = clienteTelefono.replace(/[^0-9]/g, '');
        if (clean.startsWith('0')) clean = '58' + clean.slice(1);
        if (!clean.startsWith('58') && clean.length === 10) clean = '58' + clean;
        if (clean.length >= 10) {
            const waMsg = encodeURIComponent(`Hola ${clienteNombre || 'estimado cliente'}, le contactamos de Inversiones Duri para verificar el comprobante de su pedido ${codigo}.`);
            clientWaLink = `https://wa.me/${clean}?text=${waMsg}`;
        }
    }

    const orderObj = (window._allAdminPedidos || []).find(p => String(p.id) === String(id) || p.codigo === codigo) || {};
    const finalEmail = clienteEmail || orderObj.cliente_email || '';
    const orderProds = (orderObj.productos && orderObj.productos.length) ? orderObj.productos : (orderObj.detalles || []);
    let prodsModalHtml = '';
    if (orderProds.length > 0) {
        const rows = orderProds.map(it => {
            const name = (it.nombre || it.producto_nombre || 'Producto').replace(/</g, '&lt;');
            const qty = it.cantidad || 1;
            const price = parseFloat(it.precio_unitario || 0).toFixed(2);
            const sub = ((it.precio_unitario || 0) * qty).toFixed(2);
            return `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:5px 0; border-bottom:1px dashed #e2e8f0; font-size:0.83rem;">
                    <div style="display:flex; align-items:center; gap:6px;">
                        <i class="fas fa-box" style="color:var(--accent,#FF6600); font-size:0.75rem;"></i>
                        <span style="color:#1e293b; font-weight:600;">${name}</span>
                        <span style="background:#e2e8f0; color:#475569; padding:1px 6px; border-radius:4px; font-size:0.72rem; font-weight:700;">x${qty}</span>
                    </div>
                    <span style="font-weight:700; color:#0f172a;">$${sub}</span>
                </div>
            `;
        }).join('');

        prodsModalHtml = `
            <div style="padding:10px 0; border-bottom:1px solid #f0f0f0;">
                <div style="color:#475569; font-size:0.8rem; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
                    <span><i class="fas fa-shopping-basket" style="color:var(--accent,#FF6600);"></i> Productos que solicita:</span>
                    <span style="background:#eff6ff; color:#2563eb; padding:2px 8px; border-radius:10px; font-size:0.72rem;">${orderProds.length} artículo(s)</span>
                </div>
                <div style="background:#f8fafc; border-radius:8px; padding:6px 12px; max-height:140px; overflow-y:auto; border:1px solid #e2e8f0;">
                    ${rows}
                </div>
            </div>
        `;
    }

    const modal = document.createElement('div');
    modal.id = 'modalValidarPagoAdmin';
    modal.className = 'modal show';
    modal.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;height:100dvh;background:rgba(15,23,42,0.72);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);z-index:9999999;display:flex;align-items:center;justify-content:center;padding:max(12px,env(safe-area-inset-top,12px)) max(12px,env(safe-area-inset-right,12px)) max(12px,env(safe-area-inset-bottom,12px)) max(12px,env(safe-area-inset-left,12px));box-sizing:border-box;overflow-y:auto;-webkit-overflow-scrolling:touch;';

    modal.innerHTML = `
        <div style="background:#ffffff;border-radius:18px;width:100%;max-width:480px;max-height:min(90dvh,calc(100vh - 24px));display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,0.35);margin:auto;border:1px solid rgba(255,255,255,0.2);">
            <div style="background:linear-gradient(135deg,#190c2e 0%,#2e1554 100%);color:#fff;padding:14px 18px;position:relative;flex-shrink:0;border-bottom:1px solid rgba(255,255,255,0.08);">
                <div style="display:flex;align-items:center;gap:12px;padding-right:34px;">
                    <div style="width:42px;height:42px;border-radius:50%;background:rgba(40,167,69,0.22);border:2px solid #28a745;color:#28a745;display:flex;align-items:center;justify-content:center;font-size:1.25rem;flex-shrink:0;">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <div style="text-align:left;">
                        <h3 style="margin:0;font-size:1.12rem;color:#ffffff;font-weight:700;line-height:1.2;">Validación de Pago</h3>
                        <p style="margin:2px 0 0;font-size:0.75rem;color:#d8d2e6;font-weight:500;">Panel de Superusuario</p>
                    </div>
                </div>
                <button type="button" onclick="cerrarModalValidacionPago()" style="position:absolute;top:10px;right:10px;background:rgba(255,255,255,0.12);border:none;color:#ffffff;width:32px;height:32px;border-radius:50%;font-size:1.3rem;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;transition:background 0.2s;" aria-label="Cerrar">&times;</button>
            </div>
            
            <div style="padding:14px 16px;background:#f8fafc;flex:1 1 auto;overflow-y:auto;-webkit-overflow-scrolling:touch;">
                <div style="background:#ffffff;border:1.5px solid #edf0f2;border-radius:12px;padding:12px 14px;box-shadow:0 1px 4px rgba(0,0,0,0.02);margin-bottom:10px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:8px;border-bottom:1px solid #f1f5f9;">
                        <span style="color:#64748b;font-size:0.83rem;"><i class="fas fa-hashtag"></i> Pedido:</span>
                        <strong style="color:#251442;font-size:0.98rem;font-weight:800;">${codigo}</strong>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #f1f5f9;">
                        <span style="color:#64748b;font-size:0.83rem;"><i class="fas fa-user"></i> Cliente:</span>
                        <strong style="color:#1e293b;font-size:0.86rem;text-align:right;">${clienteNombre || 'Cliente'}${clienteCi ? ` (${clienteCi})` : ''}</strong>
                    </div>
                    ${clienteTelefono ? `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #f1f5f9;flex-wrap:wrap;gap:6px;">
                        <span style="color:#64748b;font-size:0.83rem;"><i class="fas fa-phone"></i> Teléfono:</span>
                        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
                            <strong style="color:#1e293b;font-size:0.86rem;">${clienteTelefono}</strong>
                            ${clientWaLink ? `
                                <a href="${clientWaLink}" target="_blank" rel="noopener noreferrer" style="background:#25d366;color:#fff;padding:2px 8px;border-radius:10px;font-size:0.72rem;font-weight:700;text-decoration:none;display:inline-flex;align-items:center;gap:4px;" title="Pedir captura de pago al cliente por WhatsApp">
                                    <i class="fab fa-whatsapp"></i> Chat Cliente
                                </a>
                            ` : ''}
                        </div>
                    </div>
                    ` : ''}
                    ${finalEmail ? `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #f1f5f9;flex-wrap:wrap;gap:6px;">
                        <span style="color:#64748b;font-size:0.83rem;"><i class="fas fa-envelope"></i> Correo / Gmail:</span>
                        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
                            <strong style="color:#1e293b;font-size:0.86rem;">${finalEmail}</strong>
                            <a href="mailto:${finalEmail}" style="background:#f0f7ff;color:#1d4ed8;border:1px solid #bfdbfe;padding:2px 8px;border-radius:10px;font-size:0.72rem;font-weight:700;text-decoration:none;display:inline-flex;align-items:center;gap:4px;" title="Enviar correo a ${finalEmail}">
                                <i class="fas fa-paper-plane" style="color:#ea4335;"></i> Escribir
                            </a>
                        </div>
                    </div>
                    ` : ''}
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #f1f5f9;">
                        <span style="color:#64748b;font-size:0.83rem;"><i class="fas fa-credit-card"></i> Método de Pago:</span>
                        <strong style="color:#1e293b;font-size:0.86rem;">${paymentDisplay}</strong>
                    </div>
                    ${prodsModalHtml}
                    <div style="display:flex;justify-content:space-between;align-items:center;padding-top:9px;">
                        <span style="color:#1e293b;font-weight:700;font-size:0.9rem;">Monto a Confirmar:</span>
                        <span style="color:#16a34a;font-weight:800;font-size:1.3rem;">$${totalDisplay}</span>
                    </div>
                </div>

                <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:9px 12px;font-size:0.78rem;color:#1e40af;display:flex;align-items:center;gap:8px;line-height:1.35;">
                    <i class="fas fa-info-circle" style="font-size:1rem;color:#2563eb;flex-shrink:0;"></i>
                    <span>Al presionar <b>"Aceptar y Validar"</b>, la orden quedará como <b>Pago Confirmado</b> y se descontará del inventario.</span>
                </div>
            </div>

            <div style="padding:10px 16px;padding-bottom:max(12px,env(safe-area-inset-bottom,12px));display:flex;gap:10px;background:#ffffff;border-top:1px solid #e2e8f0;flex-shrink:0;position:sticky;bottom:0;z-index:2;">
                <button type="button" onclick="cerrarModalValidacionPago()" style="flex:1;min-height:44px;padding:10px 12px;background:#f8fafc;border:1.5px solid #cbd5e1;border-radius:10px;font-size:0.88rem;font-weight:600;color:#475569;cursor:pointer;display:flex;align-items:center;justify-content:center;">
                    Cancelar
                </button>
                <button type="button" id="btnAceptarYValidar" onclick="ejecutarAprobacionPago(${id}, '${codigo}')" style="flex:2;min-height:44px;padding:10px 14px;background:linear-gradient(135deg,#16a34a 0%,#15803d 100%);border:none;border-radius:10px;font-size:0.92rem;font-weight:700;color:#ffffff;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 12px rgba(22,163,74,0.35);">
                    <i class="fas fa-check-circle"></i> Aceptar y Validar
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) cerrarModalValidacionPago();
    });
}
window.abrirModalValidarPago = abrirModalValidarPago;

async function ejecutarAprobacionPago(id, codigo) {
    const btn = document.getElementById('btnAceptarYValidar');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Validando...';
    }

    try {
        await actualizarEstadoPedidoDirecto(id, 'procesando', codigo);
        cerrarModalValidacionPago();
        showToast(`¡Pago del pedido ${codigo || ''} aprobado y validado con éxito!`, 'success');
        
        // Abrir inmediatamente la ventana con la factura oficial sellada y lista para descargar/imprimir
        mostrarModalPagoAprobadoConFactura(codigo || id);
    } catch(err) {
        console.error('Error al aprobar pago:', err);
        cerrarModalValidacionPago();
        showToast('Error al validar el pago', 'error');
    }
}
window.ejecutarAprobacionPago = ejecutarAprobacionPago;

// Modal de confirmación al Super Administrador tras aprobar un pago (COMPACTO Y MODERNO)
function mostrarModalPagoAprobadoConFactura(codigoOrId) {
    cerrarModalPagoAprobado();
    const p = findOrderData(codigoOrId);
    if (!p) return;

    const codigo = p.codigo || String(codigoOrId);
    const cleanNum = (codigo).replace(/[^0-9]/g, '') || String(p.id || '101');
    const facturaNum = `FACT-${cleanNum.padStart(4, '0')}`;
    const totalVal = parseFloat(p.total || 0).toFixed(2);
    const totalBs = BcvManager.formatBs(BcvManager.toBs(parseFloat(totalVal)));

    const modal = document.createElement('div');
    modal.id = 'modalPagoAprobadoSuccess';
    modal.className = 'order-success-modal';
    modal.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;height:100dvh;background:rgba(15,23,42,0.72);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);z-index:9999999;display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;';

    modal.innerHTML = `
        <div style="background:#ffffff;border-radius:18px;width:100%;max-width:390px;max-height:min(90dvh,530px);display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,0.35);margin:auto;position:relative;animation:fadeInModal 0.2s ease-out;border:1px solid rgba(255,255,255,0.15);">
            <!-- Header Compacto -->
            <div style="background:linear-gradient(135deg, #059669 0%, #047857 100%);color:#fff;padding:14px 16px 12px;text-align:center;position:relative;">
                <button type="button" onclick="cerrarModalPagoAprobado()" style="position:absolute;top:8px;right:8px;background:rgba(255,255,255,0.18);border:none;color:#fff;width:28px;height:28px;border-radius:50%;font-size:1.2rem;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;transition:background 0.2s;" title="Cerrar">&times;</button>
                <div style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.22);border:1.5px solid rgba(255,255,255,0.4);display:inline-flex;align-items:center;justify-content:center;font-size:1.05rem;margin-bottom:4px;">
                    <i class="fas fa-check-double"></i>
                </div>
                <h3 style="margin:0;font-size:1.1rem;font-weight:800;color:#fff;letter-spacing:-0.2px;">¡Pago Validado y Aprobado!</h3>
                <p style="margin:2px 0 0;font-size:0.75rem;color:#dcfce7;opacity:0.95;">Compra confirmada y factura oficial sellada.</p>
            </div>

            <!-- Cuerpo Compacto con scroll suave -->
            <div style="padding:12px 16px 14px;overflow-y:auto;flex:1 1 auto;-webkit-overflow-scrolling:touch;">
                <!-- Tarjeta Resumen Factura / Monto -->
                <div style="background:#f0fdf4;border:1px dashed #86efac;border-radius:10px;padding:8px 12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
                    <div style="text-align:left;">
                        <span style="font-size:0.65rem;color:#15803d;text-transform:uppercase;font-weight:700;display:block;">Factura Sellada</span>
                        <strong style="font-size:0.95rem;color:#14532d;font-family:monospace;display:block;line-height:1.2;">${facturaNum}</strong>
                        <span style="font-size:0.7rem;color:#166534;">Pedido: <b>${codigo}</b></span>
                    </div>
                    <div style="text-align:right;">
                        <span style="font-size:0.65rem;color:#15803d;text-transform:uppercase;font-weight:700;display:block;">Monto Validado</span>
                        <strong style="font-size:1.05rem;color:#15803d;display:block;line-height:1.2;">$${totalVal}</strong>
                        <span style="font-size:0.7rem;color:#166534;">≈ ${totalBs}</span>
                    </div>
                </div>

                <!-- Tarjeta Info Cliente -->
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:8px 12px;margin-bottom:10px;font-size:0.76rem;color:#334155;line-height:1.4;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
                        <span><i class="fas fa-user-check" style="color:#059669;margin-right:4px;"></i> <b>Cliente:</b> ${p.cliente_nombre || 'Cliente'}</span>
                        ${p.cliente_ci ? `<span style="color:#64748b;font-weight:600;">${p.cliente_ci}</span>` : ''}
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                        <span><i class="fas fa-stamp" style="color:#059669;margin-right:4px;"></i> <b>Estado:</b></span>
                        <span style="background:#dcfce7;color:#166534;font-weight:700;padding:1px 6px;border-radius:6px;font-size:0.68rem;">✅ Pago Confirmado</span>
                    </div>
                    ${p.cliente_email ? `
                        <div style="display:flex;align-items:center;gap:6px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:4px 8px;font-size:0.72rem;color:#1e40af;">
                            <i class="fas fa-envelope-circle-check" style="color:#2563eb;font-size:0.85rem;flex-shrink:0;"></i>
                            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Enviada a: <b>${p.cliente_email}</b></span>
                        </div>
                    ` : `
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;background:#fffbeb;border:1px solid #fef3c7;border-radius:6px;padding:4px 8px;font-size:0.72rem;color:#92400e;">
                            <span><i class="fas fa-info-circle"></i> Sin correo registrado</span>
                            <button type="button" onclick="enviarFacturaPorCorreoPrompt('${codigo}')" style="background:#f59e0b;color:#fff;border:none;border-radius:4px;padding:2px 6px;font-size:0.68rem;font-weight:700;cursor:pointer;">
                                + Enviar
                            </button>
                        </div>
                    `}
                </div>

                <!-- Botones Organizados: Acción principal y Fila 2 Columnas -->
                <div style="display:flex;flex-direction:column;gap:6px;">
                    <!-- Botón Principal: Ver/Descargar PDF -->
                    <button type="button" onclick="cerrarModalPagoAprobado(); abrirModalFactura('${codigo}');" style="width:100%;min-height:36px;padding:8px 12px;background:linear-gradient(135deg, #4f46e5, #3730a3);color:#fff;border:none;border-radius:8px;font-weight:700;font-size:0.82rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 3px 8px rgba(79,70,229,0.28);">
                        <i class="fas fa-file-invoice-dollar" style="font-size:0.95rem;"></i> Ver y Descargar Factura (PDF)
                    </button>

                    <!-- Fila 2 Columnas: WhatsApp y Correo -->
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                        <button type="button" onclick="compartirFacturaWhatsApp('${codigo}');" style="min-height:34px;padding:6px 8px;background:#25d366;color:#fff;border:none;border-radius:8px;font-weight:700;font-size:0.75rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;box-shadow:0 2px 6px rgba(37,211,102,0.2);">
                            <i class="fab fa-whatsapp" style="font-size:0.95rem;"></i> WhatsApp
                        </button>
                        <button type="button" onclick="enviarFacturaPorCorreoPrompt('${codigo}');" style="min-height:34px;padding:6px 8px;background:#0284c7;color:#fff;border:none;border-radius:8px;font-weight:700;font-size:0.75rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;box-shadow:0 2px 6px rgba(2,132,199,0.2);">
                            <i class="fas fa-envelope" style="font-size:0.85rem;"></i> ${p.cliente_email ? 'Reenviar' : 'Correo'}
                        </button>
                    </div>

                    <!-- Botón Volver sutil -->
                    <button type="button" onclick="cerrarModalPagoAprobado();" style="width:100%;min-height:30px;padding:5px;background:#f8fafc;color:#64748b;border:1px solid #cbd5e1;border-radius:8px;font-weight:600;font-size:0.75rem;cursor:pointer;display:flex;align-items:center;justify-content:center;margin-top:2px;">
                        Continuar en el Panel de Pedidos
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.addEventListener('click', function(e) {
        if (e.target === modal) cerrarModalPagoAprobado();
    });
}
window.mostrarModalPagoAprobadoConFactura = mostrarModalPagoAprobadoConFactura;

function cerrarModalPagoAprobado() {
    const modal = document.getElementById('modalPagoAprobadoSuccess');
    if (modal) modal.remove();
}
window.cerrarModalPagoAprobado = cerrarModalPagoAprobado;

// Archivo general y libro contable de facturas
function abrirArchivoGeneralFacturas() {
    cerrarArchivoGeneralFacturas();

    const pedidos = window._allAdminPedidos || (typeof getLocalOrders === 'function' ? getLocalOrders() : []) || [];
    const totalFacturas = pedidos.length;
    let totalUsd = 0;
    let totalAprobadas = 0;
    let totalPendientes = 0;

    pedidos.forEach(p => {
        totalUsd += parseFloat(p.total || 0);
        if (p.estado === 'procesando' || p.estado === 'completado') totalAprobadas++;
        else if (p.estado === 'pendiente') totalPendientes++;
    });

    const totalBs = BcvManager.formatBs(BcvManager.toBs(totalUsd));
    const rateBsStr = BcvManager.formatBs(BcvManager.rate).replace('Bs. ', '');

    const rowsHtml = pedidos.length === 0 ? `
        <tr><td colspan="7" style="text-align:center; padding:25px; color:#64748b;">No hay facturas registradas aún.</td></tr>
    ` : pedidos.map(p => {
        const codigo = p.codigo || `PED-${p.id}`;
        const cleanNum = codigo.replace(/[^0-9]/g, '') || String(p.id);
        const factNum = `FACT-${cleanNum.padStart(4, '0')}`;
        const total = parseFloat(p.total || 0).toFixed(2);
        const montoBs = BcvManager.formatBs(BcvManager.toBs(parseFloat(p.total || 0)));
        const estado = p.estado || 'pendiente';
        let badgeColor = '#92400e; background:#fef3c7; border:1px solid #fde68a;';
        let badgeText = 'Pendiente';
        if (estado === 'procesando') {
            badgeColor = '#166534; background:#dcfce7; border:1px solid #bbf7d0;';
            badgeText = 'Aprobada';
        } else if (estado === 'completado') {
            badgeColor = '#075985; background:#e0f2fe; border:1px solid #bae6fd;';
            badgeText = 'Entregada';
        } else if (estado === 'cancelado') {
            badgeColor = '#991b1b; background:#fee2e2; border:1px solid #fecaca;';
            badgeText = 'Cancelada';
        }

        let fechaCorta = '';
        try {
            const d = p.created_at ? new Date(p.created_at.replace(/-/g, '/')) : new Date();
            fechaCorta = d.toLocaleDateString('es-VE');
        } catch(e) {
            fechaCorta = 'Reciente';
        }

        return `
            <tr style="border-bottom:1px solid #e2e8f0;">
                <td style="padding:10px; font-weight:800; font-family:monospace; color:#1e1b4b;">${factNum}</td>
                <td style="padding:10px; color:#475569; font-weight:600;">${codigo}</td>
                <td style="padding:10px; color:#64748b; font-size:0.78rem;">${fechaCorta}</td>
                <td style="padding:10px;">
                    <strong style="color:#0f172a; display:block;">${p.cliente_nombre || 'Cliente'}</strong>
                    <span style="font-size:0.75rem; color:#64748b;">${p.cliente_ci || 'C.I no reg.'}</span>
                </td>
                <td style="padding:10px; text-align:right;">
                    <strong style="color:#16a34a; font-size:0.95rem;">$${total}</strong>
                    <span style="display:block; font-size:0.72rem; color:#64748b;">${montoBs}</span>
                </td>
                <td style="padding:10px; text-align:center;">
                    <span style="font-size:0.72rem; font-weight:700; padding:2px 8px; border-radius:12px; ${badgeColor}">
                        ${badgeText}
                    </span>
                </td>
                <td style="padding:10px; text-align:center;">
                    <button type="button" onclick="cerrarArchivoGeneralFacturas(); abrirModalFactura('${codigo}')" style="background:#4f46e5; color:#fff; border:none; padding:6px 12px; border-radius:6px; font-size:0.78rem; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px; box-shadow:0 2px 6px rgba(79,70,229,0.3);">
                        <i class="fas fa-file-invoice"></i> Ver
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    const modal = document.createElement('div');
    modal.id = 'modalArchivoGeneralFacturas';
    modal.className = 'modal-factura-overlay';
    modal.innerHTML = `
        <div class="factura-modal-container" style="max-width:920px;">
            <div class="factura-actions-bar no-print">
                <div class="factura-actions-left">
                    <i class="fas fa-archive" style="color:#f59e0b;"></i>
                    <strong>Libro de Facturas y Registro Contable &mdash; Inversiones Duri C.A.</strong>
                </div>
                <button type="button" class="btn-factura-close" onclick="cerrarArchivoGeneralFacturas()" title="Cerrar">&times;</button>
            </div>
            <div style="padding:20px; background:#f8fafc; overflow-y:auto; flex:1;">
                <!-- Tarjetas de Resumen Contable -->
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-bottom:18px;">
                    <div style="background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:12px 16px;">
                        <span style="font-size:0.72rem; color:#64748b; font-weight:700; text-transform:uppercase;">Facturas Emitidas</span>
                        <div style="font-size:1.4rem; font-weight:800; color:#0f172a; margin-top:2px;">${totalFacturas}</div>
                        <span style="font-size:0.72rem; color:#10b981;">${totalAprobadas} aprobadas · ${totalPendientes} pendientes</span>
                    </div>
                    <div style="background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:12px 16px;">
                        <span style="font-size:0.72rem; color:#64748b; font-weight:700; text-transform:uppercase;">Total Facturado (USD)</span>
                        <div style="font-size:1.4rem; font-weight:800; color:#2563eb; margin-top:2px;">$${totalUsd.toFixed(2)}</div>
                        <span style="font-size:0.72rem; color:#64748b;">Monto bruto registrado</span>
                    </div>
                    <div style="background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:12px 16px;">
                        <span style="font-size:0.72rem; color:#64748b; font-weight:700; text-transform:uppercase;">Total Facturado (Bs.)</span>
                        <div style="font-size:1.15rem; font-weight:800; color:#ea580c; margin-top:4px;">${totalBs}</div>
                        <span style="font-size:0.72rem; color:#64748b;">Tasa BCV: ${rateBsStr} Bs/$</span>
                    </div>
                </div>

                <!-- Tabla del Libro de Facturas -->
                <div style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,0.03);">
                    <div style="padding:12px 16px; border-bottom:1px solid #e2e8f0; background:#ffffff; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                        <span style="font-weight:700; font-size:0.9rem; color:#0f172a;"><i class="fas fa-list-alt" style="color:#4f46e5;"></i> Historial Completo de Facturas</span>
                        <span style="font-size:0.78rem; color:#64748b;">Todas las compras y ventas quedan archivadas aquí</span>
                    </div>
                    <div style="overflow-x:auto;">
                        <table style="width:100%; border-collapse:collapse; font-size:0.83rem;">
                            <thead>
                                <tr style="background:#0f172a; color:#fff; text-align:left;">
                                    <th style="padding:10px;">N° Factura</th>
                                    <th style="padding:10px;">Pedido</th>
                                    <th style="padding:10px;">Fecha</th>
                                    <th style="padding:10px;">Cliente</th>
                                    <th style="padding:10px; text-align:right;">Monto</th>
                                    <th style="padding:10px; text-align:center;">Estado</th>
                                    <th style="padding:10px; text-align:center;">Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rowsHtml}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.addEventListener('click', function(e) {
        if (e.target === modal) cerrarArchivoGeneralFacturas();
    });
}
window.abrirArchivoGeneralFacturas = abrirArchivoGeneralFacturas;

function cerrarArchivoGeneralFacturas() {
    const modal = document.getElementById('modalArchivoGeneralFacturas');
    if (modal) modal.remove();
}
window.cerrarArchivoGeneralFacturas = cerrarArchivoGeneralFacturas;


function confirmarCancelarPedido(id, codigo) {
    cerrarModalValidacionPago();
    const modal = document.createElement('div');
    modal.id = 'modalValidarPagoAdmin';
    modal.className = 'modal show';
    modal.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;height:100dvh;background:rgba(15,23,42,0.72);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);z-index:9999999;display:flex;align-items:center;justify-content:center;padding:max(12px,env(safe-area-inset-top,12px)) max(12px,env(safe-area-inset-right,12px)) max(12px,env(safe-area-inset-bottom,12px)) max(12px,env(safe-area-inset-left,12px));box-sizing:border-box;overflow-y:auto;-webkit-overflow-scrolling:touch;';

    modal.innerHTML = `
        <div style="background:#fff;border-radius:18px;width:100%;max-width:400px;max-height:min(90dvh,calc(100vh - 24px));display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,0.35);margin:auto;text-align:center;">
            <div style="padding:22px 20px 16px;flex:1 1 auto;overflow-y:auto;">
                <div style="width:48px;height:48px;border-radius:50%;background:rgba(220,53,69,0.15);border:2px solid #dc3545;color:#dc3545;display:flex;align-items:center;justify-content:center;font-size:1.4rem;margin:0 auto 10px;">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <h3 style="margin:0 0 6px;font-size:1.15rem;color:#0f172a;font-weight:700;">¿Cancelar Pedido ${codigo}?</h3>
                <p style="margin:0;font-size:0.84rem;color:#64748b;">El estado del pedido pasará a Cancelado.</p>
            </div>
            <div style="padding:12px 18px;padding-bottom:max(12px,env(safe-area-inset-bottom,12px));display:flex;gap:10px;background:#ffffff;border-top:1px solid #f1f5f9;flex-shrink:0;">
                <button type="button" onclick="cerrarModalValidacionPago()" style="flex:1;min-height:44px;padding:10px;background:#f8fafc;border:1.5px solid #cbd5e1;border-radius:10px;font-size:0.88rem;font-weight:600;color:#475569;cursor:pointer;display:flex;align-items:center;justify-content:center;">
                    Volver
                </button>
                <button type="button" onclick="actualizarEstadoPedidoDirecto(${id}, 'cancelado', '${codigo}'); cerrarModalValidacionPago(); showToast('Pedido ${codigo} cancelado', 'info');" style="flex:1;min-height:44px;padding:10px;background:#dc3545;border:none;border-radius:10px;font-size:0.88rem;font-weight:700;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(220,53,69,0.3);">
                    Sí, Cancelar
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) cerrarModalValidacionPago();
    });
}
window.confirmarCancelarPedido = confirmarCancelarPedido;

async function actualizarEstadoPedidoDirecto(id, nuevoEstado, codigo = '') {
    if (!isSuperUsuario()) {
        showToast('Acceso restringido: solo el superusuario puede verificar y administrar pagos', 'error');
        return;
    }

    // 1. Obtener datos locales previos para enviar el correo si existe
    const orderData = findOrderData(codigo || id);
    const clienteEmail = orderData ? (orderData.cliente_email || '') : '';
    const tasaBcv = (typeof BcvManager !== 'undefined' && BcvManager.rate) ? BcvManager.rate : null;

    let backendResult = null;
    // 2. Enviar al Backend si está activo
    try {
        const isGH = window.location.hostname.includes('github.io');
        if (!isGH) {
            const currentUser = getUser();
            const res = await fetch(`${API_BASE}/pedidos.php?id=${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    estado: nuevoEstado,
                    codigo: codigo || (orderData ? orderData.codigo : ''),
                    usuario_id: currentUser ? currentUser.id : null,
                    cliente_email: clienteEmail,
                    tasa_bcv: tasaBcv,
                    pedido: orderData
                })
            });
            if (res.ok) {
                backendResult = await res.json();
            }
        }
    } catch (err) {
        console.warn('API backend no disponible al actualizar pedido:', err);
    }

    // 3. Actualizar en localStorage
    const localOrders = getLocalOrders();
    const match = localOrders.find(o => String(o.id) === String(id) || (codigo && o.codigo === codigo));
    if (match) {
        match.estado = nuevoEstado;
        match.updated_at = new Date().toISOString();
        saveLocalOrders(localOrders);
    }
    
    try {
        localStorage.setItem('duri_last_order_event', JSON.stringify({
            action: 'update',
            id,
            codigo,
            estado: nuevoEstado,
            timestamp: Date.now()
        }));
    } catch(e) {}

    loadPedidosRecientes();
    updateSuperAdminNotifBadge(false);
    if (typeof loadProductos === 'function') loadProductos();
    if (typeof loadInventario === 'function') loadInventario();

    const isGH = window.location.hostname.includes('github.io');
    if (isGH) {
        if (nuevoEstado === 'procesando') {
            if (clienteEmail) {
                showToast(`¡Pago validado con éxito! (En GitHub Pages se simula el correo a ${clienteEmail}; en tu servidor local se envía por Gmail)`, 'success');
            } else {
                showToast('Pago validado con éxito (sin correo de cliente registrado).', 'info');
            }
        }
    } else {
        if (backendResult && backendResult.email_enviado && backendResult.email_destino) {
            showToast(`¡Factura enviada automáticamente al correo ${backendResult.email_destino}!`, 'success');
        } else if (backendResult && backendResult.email_mensaje) {
            showToast(`Aviso de correo: ${backendResult.email_mensaje}`, 'warning');
        } else if (nuevoEstado === 'procesando' && !clienteEmail) {
            showToast('Pago validado (sin correo de cliente registrado).', 'info');
        }
    }
    return backendResult;
}
window.actualizarEstadoPedidoDirecto = actualizarEstadoPedidoDirecto;

function actualizarEstadoPedido(id, nuevoEstado, codigo = '', total = 0) {
    if (nuevoEstado === 'procesando') {
        abrirModalValidarPago(id, codigo, total);
    } else if (nuevoEstado === 'cancelado') {
        confirmarCancelarPedido(id, codigo);
    } else {
        actualizarEstadoPedidoDirecto(id, nuevoEstado, codigo);
    }
}
window.actualizarEstadoPedido = actualizarEstadoPedido;

async function eliminarPedidoHistorial(id, codigo) {
    if (!isSuperUsuario()) {
        showToast('Acceso restringido: solo el superusuario puede eliminar pedidos', 'error');
        return;
    }

    if (!confirm(`¿Deseas eliminar permanentemente el pedido ${codigo || ''} del historial?`)) {
        return;
    }

    try {
        const isGH = window.location.hostname.includes('github.io');
        if (!isGH) {
            const currentUser = getUser();
            const usuarioParam = currentUser ? `&usuario_id=${currentUser.id}` : '';
            await fetch(`${API_BASE}/pedidos.php?id=${id}${usuarioParam}`, {
                method: 'DELETE'
            });
        }
    } catch (err) {
        console.warn('API pedidos no disponible al eliminar:', err);
    }

    const localOrders = getLocalOrders();
    const filtered = localOrders.filter(o => String(o.id) !== String(id) && (!codigo || o.codigo !== codigo));
    saveLocalOrders(filtered);

    try {
        localStorage.setItem('duri_last_order_event', JSON.stringify({
            action: 'delete',
            id,
            codigo,
            timestamp: Date.now()
        }));
    } catch(e) {}

    showToast(`Pedido ${codigo || ''} eliminado del historial`);
    loadPedidosRecientes();
    updateSuperAdminNotifBadge(false);
}

function addProductToCart() {
    const sel = document.getElementById('productSelect');
    if (!sel || !sel.value) { showToast('Selecciona un producto', 'error'); return; }
    const [id, name, price, stock] = sel.value.split('|');
    if (parseInt(stock) <= 0) { showToast('Producto agotado', 'error'); return; }
    addToCartById(id, name, price, stock);
    sel.value = '';
}

function addToCartById(id, name, price, stock) {
    const existing = cart.find(i => i.id === String(id));
    if (existing) {
        if (existing.qty >= parseInt(stock)) { showToast('No hay más stock (máx: ' + stock + ')', 'error'); return; }
        existing.qty++;
    } else {
        cart.push({ id: String(id), name, price: parseFloat(price), qty: 1, maxStock: parseInt(stock) });
    }
    saveCart();
    updateCart();
    showToast(name + ' agregado');
}

function removeFromCart(i) { cart.splice(i, 1); saveCart(); updateCart(); }

function updateQty(i, d) {
    cart[i].qty += d;
    if (cart[i].qty <= 0) removeFromCart(i);
    else if (cart[i].qty > cart[i].maxStock) { showToast('Stock máximo: ' + cart[i].maxStock, 'error'); cart[i].qty = cart[i].maxStock; saveCart(); updateCart(); }
    else { saveCart(); updateCart(); }
}

// ============================================
// GESTIÓN DE MODALIDAD DE ENTREGA Y DELIVERY
// ============================================

function seleccionarModalidadEntrega(tipo) {
    const inputMod = document.getElementById('modalidadEntrega');
    const btnRetiro = document.getElementById('btnModalidadRetiro');
    const btnDelivery = document.getElementById('btnModalidadDelivery');
    const infoRetiro = document.getElementById('infoRetiroLocal');
    const seccionDelivery = document.getElementById('seccionDeliveryOpciones');
    const contDireccion = document.getElementById('contenedorDireccionDespacho');
    const inputAddr = document.getElementById('deliveryAddress');

    if (inputMod) inputMod.value = tipo;

    if (tipo === 'retiro') {
        if (btnRetiro) {
            btnRetiro.style.borderColor = '#ff6600';
            btnRetiro.style.background = '#fff7ed';
            const icon = btnRetiro.querySelector('i');
            if (icon) icon.style.color = '#ff6600';
        }
        if (btnDelivery) {
            btnDelivery.style.borderColor = '#cbd5e1';
            btnDelivery.style.background = '#ffffff';
            const icon = btnDelivery.querySelector('i');
            if (icon) icon.style.color = '#64748b';
        }
        if (infoRetiro) infoRetiro.style.display = 'flex';
        if (seccionDelivery) seccionDelivery.style.display = 'none';
        if (contDireccion) contDireccion.style.display = 'none';
        if (inputAddr) inputAddr.required = false;

        const costoInput = document.getElementById('costoDeliveryActual');
        if (costoInput) costoInput.value = '0';
    } else {
        if (btnDelivery) {
            btnDelivery.style.borderColor = '#ff6600';
            btnDelivery.style.background = '#fff7ed';
            const icon = btnDelivery.querySelector('i');
            if (icon) icon.style.color = '#ff6600';
        }
        if (btnRetiro) {
            btnRetiro.style.borderColor = '#cbd5e1';
            btnRetiro.style.background = '#ffffff';
            const icon = btnRetiro.querySelector('i');
            if (icon) icon.style.color = '#64748b';
        }
        if (infoRetiro) infoRetiro.style.display = 'none';
        if (seccionDelivery) seccionDelivery.style.display = 'block';
        if (contDireccion) contDireccion.style.display = 'block';
        if (inputAddr) inputAddr.required = true;

        cambiarZonaDelivery();
    }
    updateCart();
}
window.seleccionarModalidadEntrega = seleccionarModalidadEntrega;

function cambiarZonaDelivery() {
    const sel = document.getElementById('selectZonaDelivery');
    const costoInput = document.getElementById('costoDeliveryActual');
    const badge = document.getElementById('badgeTarifaDelivery');
    if (!sel) return;

    const opt = sel.options[sel.selectedIndex];
    const optVal = sel.value;
    const esBloqueado = optVal === 'fuera_aragua' || (opt && opt.getAttribute('data-bloqueado') === 'true');
    const costo = esBloqueado ? -1 : (opt ? parseFloat(opt.getAttribute('data-costo') || 0) : 0);
    if (costoInput) costoInput.value = String(costo);

    if (badge) {
        if (esBloqueado) {
            badge.style.color = '#dc2626';
            badge.innerHTML = `
                <div style="background:#fef2f2; border:1.5px solid #fecaca; border-radius:8px; padding:10px 12px; color:#991b1b; line-height:1.45; width:100%; box-sizing:border-box; margin-top:4px;">
                    <div style="font-weight:800; font-size:0.86rem; display:flex; align-items:center; gap:6px; margin-bottom:3px; color:#dc2626;">
                        <i class="fas fa-ban"></i> Cobertura Exclusiva Estado Aragua
                    </div>
                    <span>Lo sentimos, <strong>no es posible cotizar ni despachar fuera del Estado Aragua</strong>. Nuestro servicio de delivery opera únicamente dentro del estado. Para compras foráneas, por favor selecciona la opción <strong>"Retiro en Tienda"</strong> en nuestra sede comercial de Maracay.</span>
                </div>
            `;
        } else if (costo === 0) {
            badge.style.color = '#059669';
            badge.innerHTML = '<i class="fas fa-gift"></i> <span>¡Delivery en todo el Centro de Maracay es COMPLETAMENTE GRATIS!</span>';
        } else {
            const bsCosto = (typeof BcvManager !== 'undefined' && BcvManager.rate) 
                ? BcvManager.formatBs(BcvManager.toBs(costo)) 
                : `Bs. ${(costo * 45).toFixed(2)}`;
            badge.style.color = '#2563eb';
            const extraDesc = optVal === 'otra' ? ' (Sector dentro de Aragua / Calculada por GPS)' : '';
            badge.innerHTML = `<i class="fas fa-motorcycle"></i> <span>Tarifa de Delivery a esta zona: <strong>$${costo.toFixed(2)} USD</strong> (${bsCosto})${extraDesc}</span>`;
        }
    }
    sincronizarMontosUbicacion();
    updateCart();
}
window.cambiarZonaDelivery = cambiarZonaDelivery;

function obtenerCostoDelivery() {
    const inputMod = document.getElementById('modalidadEntrega');
    if (!inputMod || inputMod.value === 'retiro') return 0;
    const costoInput = document.getElementById('costoDeliveryActual');
    const val = costoInput ? parseFloat(costoInput.value || 0) : 0;
    return val;
}
window.obtenerCostoDelivery = obtenerCostoDelivery;

function sincronizarMontosUbicacion() {
    const inputMod = document.getElementById('modalidadEntrega');
    const isRetiro = !inputMod || inputMod.value === 'retiro';
    const deliveryCostRaw = obtenerCostoDelivery();
    const esFueraDeAragua = !isRetiro && deliveryCostRaw < 0;
    const deliveryCost = esFueraDeAragua ? 0 : deliveryCostRaw;

    const selectZona = document.getElementById('selectZonaDelivery');
    const optZona = selectZona ? selectZona.options[selectZona.selectedIndex] : null;
    let zonaNombre = 'Centro de Maracay';
    if (optZona) {
        zonaNombre = optZona.text.split('—')[0].split('(')[0].replace('📍', '').trim();
    }

    // Refinar nombre de sector si se detectó una zona específica en el texto o mapa
    let nombrePersonalizado = zonaNombre;
    const currentAddr = (typeof selectedAddressText === 'string' ? selectedAddressText : (document.getElementById('deliveryAddress')?.value || '')).toLowerCase();
    if (currentAddr.includes('mariara') || currentAddr.includes('valencia') || currentAddr.includes('caracas') || currentAddr.includes('carabobo')) {
        nombrePersonalizado = 'Fuera del Estado Aragua (No disponible)';
    } else if (currentAddr.includes('magdaleno')) {
        nombrePersonalizado = 'Magdaleno (Zona Lejana / Municipio Zamora, Aragua)';
    } else if (currentAddr.includes('tocoron') || currentAddr.includes('tocorón')) {
        nombrePersonalizado = 'Tocorón (Zona Lejana / Municipio Zamora, Aragua)';
    } else if (currentAddr.includes('villa de cura')) {
        nombrePersonalizado = 'Villa de Cura (Municipio Zamora, Aragua)';
    } else if (currentAddr.includes('cagua')) {
        nombrePersonalizado = 'Cagua (Municipio Sucre, Aragua)';
    } else if (currentAddr.includes('turmero')) {
        nombrePersonalizado = 'Turmero (Municipio Santiago Mariño, Aragua)';
    } else if (currentAddr.includes('palo negro')) {
        nombrePersonalizado = 'Palo Negro (Municipio Libertador, Aragua)';
    } else if (currentAddr.includes('el limon') || currentAddr.includes('el limón')) {
        nombrePersonalizado = 'El Limón (Municipio MBI, Aragua)';
    }
    
    let sum = 0;
    const cartItemsCount = (typeof cart !== 'undefined' && Array.isArray(cart)) ? cart.length : 0;
    if (cartItemsCount > 0) {
        cart.forEach(it => { sum += (it.price || 0) * (it.qty || 1); });
    }
    const subtotal = sum;
    const iva = subtotal * 0.16;
    const grandTotal = subtotal + iva + (isRetiro ? 0 : deliveryCost);
    
    const rate = (typeof BcvManager !== 'undefined' && BcvManager.rate > 0) ? BcvManager.rate : 879.12;
    const formatBs = (typeof BcvManager !== 'undefined' && typeof BcvManager.formatBs === 'function') 
        ? (v => BcvManager.formatBs(v)) 
        : (v => `Bs. ${Number(v).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    const toBs = (typeof BcvManager !== 'undefined' && typeof BcvManager.toBs === 'function') 
        ? (v => BcvManager.toBs(v)) 
        : (v => (parseFloat(v) || 0) * rate);

    const bsTotal = formatBs(toBs(grandTotal));
    const bsDelivery = formatBs(toBs(deliveryCost));
    const bsProds = formatBs(toBs(subtotal + iva));

    // 1. Tarjeta en la sección de Ubicación del formulario
    const badgeZona = document.getElementById('badgeZonaUbicacion');
    const elMontoDelivery = document.getElementById('montoDeliveryUbicacion');
    const elMontoProds = document.getElementById('montoProductosUbicacion');
    const elTotalUsd = document.getElementById('totalUsdUbicacion');
    const elTotalBs = document.getElementById('totalBsUbicacion');

    if (badgeZona) {
        if (isRetiro) {
            badgeZona.textContent = 'Retiro en Local (Gratis)';
            badgeZona.style.background = '#ecfdf5';
            badgeZona.style.color = '#059669';
        } else if (esFueraDeAragua) {
            badgeZona.textContent = '🚫 Fuera de Aragua (No disponible)';
            badgeZona.style.background = '#fef2f2';
            badgeZona.style.color = '#dc2626';
        } else {
            badgeZona.textContent = `${nombrePersonalizado} (${deliveryCost === 0 ? 'Gratis' : `$${deliveryCost.toFixed(2)}`})`;
            badgeZona.style.background = deliveryCost === 0 ? '#ecfdf5' : '#eff6ff';
            badgeZona.style.color = deliveryCost === 0 ? '#059669' : '#1d4ed8';
        }
    }

    if (elMontoDelivery) {
        if (isRetiro) {
            elMontoDelivery.style.color = '#059669';
            elMontoDelivery.textContent = '¡GRATIS ($0.00)!';
        } else if (esFueraDeAragua) {
            elMontoDelivery.style.color = '#dc2626';
            elMontoDelivery.innerHTML = '<strong>🚫 NO DISPONIBLE</strong>';
        } else if (deliveryCost === 0) {
            elMontoDelivery.style.color = '#059669';
            elMontoDelivery.textContent = '¡GRATIS ($0.00)!';
        } else {
            elMontoDelivery.style.color = '#2563eb';
            elMontoDelivery.innerHTML = `<strong>+$${deliveryCost.toFixed(2)} USD</strong> <small style="color:#64748b;">(${bsDelivery})</small>`;
        }
    }

    if (elMontoProds) {
        elMontoProds.innerHTML = `$${(subtotal + iva).toFixed(2)} USD <small style="color:#64748b;">(${bsProds})</small>`;
    }

    if (elTotalUsd) {
        if (esFueraDeAragua) {
            elTotalUsd.innerHTML = '<span style="color:#dc2626; font-size:0.95rem; font-weight:800;">🚫 No cotizable fuera de Aragua</span>';
        } else {
            elTotalUsd.textContent = `$${grandTotal.toFixed(2)} USD`;
        }
    }
    if (elTotalBs) {
        if (esFueraDeAragua) {
            elTotalBs.innerHTML = '<small style="color:#dc2626; font-weight:600;">Selecciona una zona en Aragua o Retiro en Tienda</small>';
        } else {
            elTotalBs.textContent = `(≈ ${bsTotal} a tasa BCV)`;
        }
    }

    // 2. Tarjeta de ubicación confirmada por GPS
    const cardPrecio = document.getElementById('ubicacionConfirmadaPrecio');
    if (cardPrecio) {
        if (isRetiro) {
            cardPrecio.innerHTML = `<i class="fas fa-store" style="color:#059669;"></i> Retiro en Tienda: <strong>GRATIS</strong> | Total a Pagar: <strong>$${grandTotal.toFixed(2)} USD</strong> (${bsTotal})`;
        } else if (esFueraDeAragua) {
            cardPrecio.innerHTML = `<span style="color:#dc2626; font-weight:700;"><i class="fas fa-ban"></i> Ubicación Fuera del Estado Aragua: Solo cotizamos dentro de Aragua</span>`;
        } else if (deliveryCost === 0) {
            cardPrecio.innerHTML = `<i class="fas fa-gift" style="color:#059669;"></i> Delivery ${nombrePersonalizado}: <strong>GRATIS ($0.00)</strong> | Total a Pagar: <strong>$${grandTotal.toFixed(2)} USD</strong> (${bsTotal})`;
        } else {
            cardPrecio.innerHTML = `<i class="fas fa-motorcycle" style="color:#2563eb;"></i> Delivery ${nombrePersonalizado}: <strong>+$${deliveryCost.toFixed(2)} USD</strong> (${bsDelivery}) | Total a Pagar: <strong>$${grandTotal.toFixed(2)} USD</strong> (${bsTotal})`;
        }
    }

    // 3. Vista previa dentro del Modal de Google Maps
    const gmapsZoneLabel = document.getElementById('gmapsDetectedZoneLabel');
    const gmapsTotalUsd = document.getElementById('gmapsTotalPagarPreview');
    const gmapsTotalBs = document.getElementById('gmapsTotalBsPreview');
    const gmapsTitle = document.getElementById('gmapsTotalPagarTitle');

    if (gmapsZoneLabel) {
        if (esFueraDeAragua) {
            gmapsZoneLabel.innerHTML = `<span style="color:#dc2626; font-weight:700;"><i class="fas fa-ban"></i> Ubicación Fuera del Estado Aragua — No es posible cotizar</span>`;
        } else if (deliveryCost === 0) {
            gmapsZoneLabel.innerHTML = `<span style="color:#059669; font-weight:700;"><i class="fas fa-gift"></i> ${nombrePersonalizado} — ¡DELIVERY GRATIS ($0.00)!</span>`;
        } else {
            gmapsZoneLabel.innerHTML = `<span style="color:#1d4ed8; font-weight:700;"><i class="fas fa-motorcycle"></i> ${nombrePersonalizado} — Tarifa: +$${deliveryCost.toFixed(2)} USD (${bsDelivery})</span>`;
        }
    }

    if (gmapsTotalUsd) {
        if (esFueraDeAragua) {
            gmapsTotalUsd.textContent = 'No cotizable fuera de Aragua';
        } else if (cartItemsCount === 0) {
            gmapsTotalUsd.textContent = `$${deliveryCost.toFixed(2)} USD`;
        } else {
            gmapsTotalUsd.textContent = `$${grandTotal.toFixed(2)} USD`;
        }
    }
    if (gmapsTotalBs) {
        if (esFueraDeAragua) {
            gmapsTotalBs.textContent = 'Solo despachos en Edo. Aragua';
        } else if (cartItemsCount === 0) {
            gmapsTotalBs.textContent = `≈ ${bsDelivery} (Costo Delivery)`;
        } else {
            gmapsTotalBs.textContent = `≈ ${bsTotal} (Productos + Delivery)`;
        }
    }
    if (gmapsTitle) {
        gmapsTitle.textContent = esFueraDeAragua ? 'Atención:' : (cartItemsCount === 0 ? 'Tarifa de Delivery:' : 'Total de tu Pedido:');
    }
}
window.sincronizarMontosUbicacion = sincronizarMontosUbicacion;

function updateCart() {
    const items = document.getElementById('orderItems');
    const total = document.getElementById('orderTotal');
    const btn = document.getElementById('submitBtn');
    const btnForm = document.getElementById('submitBtnForm');
    
    const elSubtotal = document.getElementById('cartSubtotal');
    const elIva = document.getElementById('cartIva');
    const elDeliveryLabel = document.getElementById('labelDeliveryResumen');
    const elDeliveryCost = document.getElementById('costoDeliveryResumen');
    
    // Actualizar carrito flotante siempre
    try { updateFloatingCart(); } catch(e) {}
    
    if (!items) return;
    if (!cart.length) {
        items.innerHTML = '<div class="empty-cart"><i class="fas fa-shopping-basket"></i><p>Tu pedido está vacío</p></div>';
        if (total) total.textContent = '$0.00';
        if (elSubtotal) elSubtotal.textContent = '$0.00';
        if (elIva) elIva.textContent = '$0.00';
        if (elDeliveryCost) elDeliveryCost.textContent = '$0.00';
        if (btn) btn.disabled = true;
        if (btnForm) btnForm.disabled = true;
        try { sincronizarMontosUbicacion(); } catch(e) {}
        return;
    }
    let html = '', sum = 0;
    cart.forEach((it, i) => {
        const t = it.price * it.qty; sum += t;
        const bsUnit = BcvManager.formatBs(BcvManager.toBs(it.price));
        const bsTotal = BcvManager.formatBs(BcvManager.toBs(t));
        html += `<div class="cart-item">
            <div class="cart-item-info">
                <div class="cart-item-name">${it.name}</div>
                <div class="item-price">$${it.price.toFixed(2)} (${bsUnit}) c/u</div>
            </div>
            <div class="cart-item-qty"><button onclick="updateQty(${i},-1)">-</button><span>${it.qty}</span><button onclick="updateQty(${i},1)">+</button></div>
            <div class="cart-item-total">
                <div>$${t.toFixed(2)}</div>
                <div style="font-size:0.72rem;color:#64748b;font-weight:normal;">${bsTotal}</div>
            </div>
            <button class="cart-item-remove" onclick="removeFromCart(${i})"><i class="fas fa-trash"></i></button>
        </div>`;
    });
    items.innerHTML = html;

    const subtotal = sum;
    const iva = subtotal * 0.16;
    const inputMod = document.getElementById('modalidadEntrega');
    const isRetiro = !inputMod || inputMod.value === 'retiro';
    const rawDeliveryCost = obtenerCostoDelivery();
    const esFueraDeAragua = !isRetiro && rawDeliveryCost < 0;
    const deliveryCost = esFueraDeAragua ? 0 : rawDeliveryCost;
    const grandTotal = subtotal + iva + deliveryCost;

    if (elSubtotal) elSubtotal.textContent = `$${subtotal.toFixed(2)}`;
    if (elIva) elIva.textContent = `$${iva.toFixed(2)}`;
    
    if (elDeliveryLabel) {
        elDeliveryLabel.innerHTML = isRetiro 
            ? '<i class="fas fa-store"></i> Retiro en Local:' 
            : '<i class="fas fa-motorcycle"></i> Costo de Delivery:';
    }
    if (elDeliveryCost) {
        if (isRetiro) {
            elDeliveryCost.style.color = '#059669';
            elDeliveryCost.textContent = '¡GRATIS ($0.00)!';
        } else if (esFueraDeAragua) {
            elDeliveryCost.style.color = '#dc2626';
            elDeliveryCost.innerHTML = '<strong>🚫 NO DISPONIBLE</strong>';
        } else if (deliveryCost === 0) {
            elDeliveryCost.style.color = '#059669';
            elDeliveryCost.textContent = '¡GRATIS ($0.00)!';
        } else {
            const bsDel = BcvManager.formatBs(BcvManager.toBs(deliveryCost));
            elDeliveryCost.style.color = '#2563eb';
            elDeliveryCost.innerHTML = `+$${deliveryCost.toFixed(2)} <small style="font-size:0.72rem;font-weight:normal;color:#64748b;">(${bsDel})</small>`;
        }
    }

    if (total) {
        if (esFueraDeAragua) {
            total.innerHTML = `<span style="color:#dc2626; font-size:1.05rem; font-weight:800;">🚫 No disponible</span> <small style="font-size:0.78rem;color:#dc2626;display:block;">(Fuera del Edo. Aragua)</small>`;
        } else {
            const bsSum = BcvManager.formatBs(BcvManager.toBs(grandTotal));
            total.innerHTML = `<span>$${grandTotal.toFixed(2)}</span> <small style="font-size:0.85rem;color:#64748b;font-weight:600;display:block;">(≈ ${bsSum})</small>`;
        }
    }
    if (btn) btn.disabled = false;
    if (btnForm) btnForm.disabled = false;

    try { sincronizarMontosUbicacion(); } catch(e) {}
}

// ============================================
// VALIDACIÓN ESTRICTA DE ENTRADAS NUMÉRICAS (Cédula y Teléfono)
// ============================================
window.mostrarErrorNumero = function(input, errorNoticeId, msg) {
    if (typeof showToast === 'function') {
        showToast(msg, 'error');
    }
    const errorNotice = errorNoticeId ? document.getElementById(errorNoticeId) : null;
    if (errorNotice) {
        errorNotice.style.display = 'block';
    }
    if (input) {
        input.classList.remove('shake-input-error');
        void input.offsetWidth; // Forzar reflujo para reiniciar la animación
        input.classList.add('shake-input-error');
        input.style.borderColor = '#dc2626';
    }
    if (window._errNumTimer) clearTimeout(window._errNumTimer);
    window._errNumTimer = setTimeout(() => {
        if (errorNotice) errorNotice.style.display = 'none';
        if (input) {
            input.classList.remove('shake-input-error');
            input.style.borderColor = '';
        }
    }, 3500);
};

window.validarNumeroKey = function(e, input, errorNoticeId, fieldName) {
    const allowed = ['Backspace', 'Tab', 'Enter', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Delete', 'Home', 'End'];
    if (allowed.includes(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key && e.key.length === 1 && !/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        window.mostrarErrorNumero(input, errorNoticeId, `⚠️ En ${fieldName} solo se permiten números, nada de letras.`);
    }
};

window.validarNumeroInput = function(input, errorNoticeId, fieldName) {
    if (/[^0-9]/.test(input.value)) {
        input.value = input.value.replace(/[^0-9]/g, '');
        window.mostrarErrorNumero(input, errorNoticeId, `⚠️ En ${fieldName} solo se permiten números, nada de letras.`);
    } else if (input.value.length > 0) {
        const errorNotice = errorNoticeId ? document.getElementById(errorNoticeId) : null;
        if (errorNotice) errorNotice.style.display = 'none';
        input.classList.remove('shake-input-error');
        input.style.borderColor = '';
    }
};

window.validarNumeroPaste = function(e, input, errorNoticeId, fieldName) {
    const pasteData = (e.clipboardData || window.clipboardData)?.getData('text') || '';
    if (/[^0-9]/.test(pasteData)) {
        window.mostrarErrorNumero(input, errorNoticeId, `⚠️ En ${fieldName} solo se permiten números (se limpiaron las letras).`);
    }
};

function setupNumericInputValidation(input, errorNoticeId, fieldName) {
    if (!input) return;

    input.addEventListener('keydown', function(e) {
        window.validarNumeroKey(e, input, errorNoticeId, fieldName);
    });

    input.addEventListener('input', function() {
        window.validarNumeroInput(input, errorNoticeId, fieldName);
    });

    input.addEventListener('paste', function(e) {
        window.validarNumeroPaste(e, input, errorNoticeId, fieldName);
    });
}

function initNumericInputs() {
    const ciInput = document.getElementById('newClientCi');
    if (ciInput && !ciInput._numericBound) {
        ciInput._numericBound = true;
        setupNumericInputValidation(ciInput, 'ciErrorNotice', 'la Cédula');
    }
    const phoneInput = document.getElementById('newClientPhone');
    if (phoneInput && !phoneInput._numericBound) {
        phoneInput._numericBound = true;
        setupNumericInputValidation(phoneInput, 'phoneErrorNotice', 'el Teléfono');
    }
}
window.initNumericInputs = initNumericInputs;

async function submitOrder() {
    const clientSelect = document.getElementById('clientSelect');
    const address = document.getElementById('deliveryAddress');
    const notes = document.getElementById('orderNotes');
    const payment = document.getElementById('paymentMethod');
    const newName = document.getElementById('newClientName');
    const newCi = document.getElementById('newClientCi');
    const newEmail = document.getElementById('newClientEmail');
    const newPhone = document.getElementById('newClientPhone');

    const inputMod = document.getElementById('modalidadEntrega');
    const isDelivery = inputMod && inputMod.value === 'delivery';
    const selectZona = document.getElementById('selectZonaDelivery');
    const deliveryCost = obtenerCostoDelivery();
    
    if (!clientSelect || !clientSelect.value) { showToast('Selecciona o escribe tu nombre', 'error'); return; }
    if (!cart.length) { showToast('Agrega productos al pedido', 'error'); return; }
    
    if (isDelivery && (!address || !address.value || address.value.trim().length < 8)) {
        showToast('Por favor escribe tu dirección exacta para realizar el delivery', 'error');
        if (address) address.focus();
        return;
    }
    
    if (!newName || !newName.value.trim()) { showToast('Por favor escribe tu nombre completo', 'error'); return; }
    
    if (!newCi || !newCi.value.trim()) { showToast('Por favor ingresa tu número de Cédula', 'error'); return; }
    if (/[^0-9]/.test(newCi.value)) {
        showToast('⚠️ La Cédula solo debe tener números, nada de letras ni símbolos', 'error');
        newCi.focus();
        return;
    }
    const clientCi = newCi.value.replace(/[^0-9]/g, '');
    if (clientCi.length < 6) { showToast('La Cédula debe contener solo números (mínimo 6 dígitos)', 'error'); return; }
    
    if (!newPhone || !newPhone.value.trim()) { showToast('Por favor ingresa tu número de teléfono', 'error'); return; }
    if (/[^0-9]/.test(newPhone.value)) {
        showToast('⚠️ El Teléfono solo debe tener números, nada de letras ni símbolos', 'error');
        newPhone.focus();
        return;
    }
    const clientPhone = newPhone.value.replace(/[^0-9]/g, '');
    if (clientPhone.length < 10) { showToast('El Teléfono debe contener al menos 10 dígitos numéricos (ej: 04121234567)', 'error'); return; }
    
    const clientName = newName.value.trim();
    const clientEmail = (newEmail && newEmail.value) ? newEmail.value.trim().toLowerCase() : '';
    
    const paymentLabels = { pago_movil: 'Pago Móvil', transferencia: 'Transferencia Bancaria' };
    const paymentLabel = payment ? (paymentLabels[payment.value] || payment.value) : 'Pago Móvil';
    const addr = address ? address.value.trim() : '';

    // Obtener coordenadas GPS si el usuario las fijó en el mapa
    const geoInput = document.getElementById('geoCoords');
    const geoCoords = geoInput ? geoInput.value.trim() : '';
    let mapsLink = '';

    let deliveryZoneLabel = 'Retiro en Local';
    let fullDeliveryAddress = 'Retiro en Sede Comercial Inversiones Duri (Av. Bolívar Oeste, Maracay)';

    if (isDelivery) {
        const zonaOpt = selectZona ? selectZona.options[selectZona.selectedIndex] : null;
        const optVal = selectZona ? selectZona.value : '';
        const rawCost = obtenerCostoDelivery();

        // Validar si la zona o dirección está FUERA DEL ESTADO ARAGUA
        const addrLower = (addr || '').toLowerCase();
        const palabrasFuera = [
            'valencia', 'carabobo', 'mariara', 'diego ibarra', 'san joaquin', 'san joaquín', 
            'guacara', 'naguanagua', 'san diego', 'puerto cabello', 'moron', 'morón', 'los guayos', 'tocuyito',
            'caracas', 'distrito capital', 'dto capital', 'miranda', 'los teques', 'san antonio', 'guarenas', 'guatire', 
            'chacao', 'baruta', 'petare', 'guarico', 'guárico', 'san juan de los morros', 'cojedes', 'san carlos', 
            'yaracuy', 'san felipe', 'maracaibo', 'zulia', 'barquisimeto', 'lara', 'falcon', 'falcón'
        ];
        const esFueraPorDireccion = palabrasFuera.some(p => addrLower.includes(p));

        if (optVal === 'fuera_aragua' || rawCost < 0 || esFueraPorDireccion) {
            showToast('🚫 Solo cotizamos y realizamos entregas dentro del Estado Aragua.', 'error');
            alert('🚫 COBERTURA EXCLUSIVA — ESTADO ARAGUA:\n\nInversiones Duri C.A. solo cotiza y realiza entregas dentro del Estado Aragua.\n\nNo es posible cotizar ni despachar fuera del estado. Para proceder con su compra, por favor elija una dirección dentro del Estado Aragua o seleccione la modalidad "Retiro en Tienda" en nuestra sede de Maracay.');
            if (address) address.focus();
            return;
        }

        deliveryZoneLabel = zonaOpt ? zonaOpt.text.split('—')[0].replace('📍', '').trim() : 'Delivery a Domicilio';
        if (geoCoords) {
            mapsLink = `https://www.google.com/maps/search/?api=1&query=${geoCoords}`;
            fullDeliveryAddress = `[DELIVERY - ${deliveryZoneLabel} (Tarifa: $${deliveryCost.toFixed(2)})] ${addr} | GPS: ${mapsLink}`;
        } else {
            fullDeliveryAddress = `[DELIVERY - ${deliveryZoneLabel} (Tarifa: $${deliveryCost.toFixed(2)})] ${addr}`;
        }
    } else {
        fullDeliveryAddress = 'Retiro en Sede Comercial Inversiones Duri (Av. Bolívar Oeste, Maracay)';
    }
    
    // Calcular total incluyendo delivery
    let subtotal = 0;
    cart.forEach(it => { subtotal += it.price * it.qty; });
    const iva = subtotal * 0.16;
    const total = subtotal + iva + deliveryCost;
    const totalBs = BcvManager.formatBs(BcvManager.toBs(total));
    const rateBsStr = BcvManager.formatBs(BcvManager.rate).replace('Bs. ', '');
    
    // Construir lista de productos con precio dual
    let prodLines = '';
    cart.forEach(it => {
        const itemBs = BcvManager.formatBs(BcvManager.toBs(it.price * it.qty));
        prodLines += `📦 ${it.name} x${it.qty} — $${(it.price * it.qty).toFixed(2)} (${itemBs})\n`;
    });
    
    const deliveryMsgLine = isDelivery 
        ? `🛵 Entrega: Delivery (${deliveryZoneLabel}) — ${deliveryCost === 0 ? '¡GRATIS ($0.00)!' : `+$${deliveryCost.toFixed(2)} USD`}`
        : `🏪 Entrega: Retiro en Sede Comercial — ¡GRATIS ($0.00)!`;

    // Mensaje predeterminado con Cédula, tasa BCV y Link de Google Maps
    const msg = `✅ ¡Hola! Quiero confirmar mi pedido en Inversiones Duri\n\n👤 Cliente: ${clientName}\n🪪 Cédula: ${clientCi}\n📞 Teléfono: ${clientPhone}${clientEmail ? `\n📧 Correo: ${clientEmail}` : ''}\n${prodLines}\n💰 Subtotal: $${subtotal.toFixed(2)}\n🧾 IVA (16%): $${iva.toFixed(2)}\n${deliveryMsgLine}\n\n🔥 TOTAL A PAGAR: $${total.toFixed(2)} USD (≈ ${totalBs} a tasa BCV ${rateBsStr})\n💳 Pago: ${paymentLabel}\n📍 Dirección / Entrega: ${isDelivery ? (addr || 'Por confirmar') : 'Retiro en Tienda Inversiones Duri'}${mapsLink ? `\n🗺️ Ubicación GPS (Google Maps): ${mapsLink}` : ''}\n\n¿Sigue disponible el producto? Confirma para proceder ✔`;
    
    // Guardar datos temporalmente para el modal
    window._pendingOrder = {
        cliente_id: clientSelect.value,
        direccion_entrega: fullDeliveryAddress,
        modalidad_entrega: isDelivery ? 'delivery' : 'retiro',
        delivery_cost: deliveryCost,
        zona_delivery: deliveryZoneLabel,
        notas: notes ? notes.value : '',
        forma_pago: payment ? payment.value : 'pago_movil',
        productos: cart.map(it => ({ producto_id: it.id, cantidad: it.qty, precio_unitario: it.price, nombre: it.name })),
        clientName,
        clientCi,
        clientPhone,
        clientEmail,
        mapsLink,
        msg,
        subtotal,
        iva,
        deliveryCost,
        total
    };
    
    // Mostrar modal de confirmación
    showConfirmModal(subtotal, iva, total, prodLines, clientName, clientCi, clientPhone, clientEmail, paymentLabel, fullDeliveryAddress, mapsLink, msg, isDelivery, deliveryCost, deliveryZoneLabel);
}

function showConfirmModal(subtotal, iva, total, prodLines, clientName, clientCi, clientPhone, clientEmail, paymentLabel, addr, mapsLink, msg, isDelivery = false, deliveryCost = 0, deliveryZoneLabel = 'Retiro en Local') {
    // Remover modal anterior si existe
    const old = document.getElementById('confirmModal');
    if (old) old.remove();

    const subtotalBs = BcvManager.formatBs(BcvManager.toBs(subtotal));
    const ivaBs = BcvManager.formatBs(BcvManager.toBs(iva));
    const totalBs = BcvManager.formatBs(BcvManager.toBs(total));
    const totalBsRaw = (BcvManager.toBs(total)).toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2});
    const rateStr = BcvManager.formatBs(BcvManager.rate).replace('Bs. ', '');

    // Tarjeta de Pago Móvil con botones para copiar
    const isPagoMovil = paymentLabel.toLowerCase().includes('pago m') || paymentLabel.toLowerCase().includes('pago_movil');
    let pagoMovilCardHtml = '';
    if (isPagoMovil) {
        pagoMovilCardHtml = `
            <div class="pago-movil-card">
                <div class="pago-movil-header">
                    <span class="pago-movil-title"><i class="fas fa-mobile-alt"></i> Datos para Pago Móvil</span>
                    <span class="pago-movil-badge">Tasa BCV: ${rateStr} Bs/$</span>
                </div>
                <div class="pago-movil-row">
                    <span class="pago-movil-label">Banco:</span>
                    <span class="pago-movil-val">Banco de Venezuela (0102)</span>
                </div>
                <div class="pago-movil-row">
                    <span class="pago-movil-label">Teléfono:</span>
                    <div class="pago-movil-val-wrap">
                        <span class="pago-movil-val">0412-1234567</span>
                        <button type="button" class="btn-copy-mini" onclick="copyTextToClipboard('04121234567', this)">
                            <i class="fas fa-copy"></i> Copiar
                        </button>
                    </div>
                </div>
                <div class="pago-movil-row">
                    <span class="pago-movil-label">RIF:</span>
                    <div class="pago-movil-val-wrap">
                        <span class="pago-movil-val">J-50123456-7</span>
                        <button type="button" class="btn-copy-mini" onclick="copyTextToClipboard('J501234567', this)">
                            <i class="fas fa-copy"></i> Copiar
                        </button>
                    </div>
                </div>
                <div class="pago-movil-row" style="background:#ffedd5;padding:8px 10px;border-radius:8px;margin-top:6px;">
                    <span class="pago-movil-label" style="font-weight:700;">Monto en Bs:</span>
                    <div class="pago-movil-val-wrap">
                        <span class="pago-movil-val" style="color:#c2410c;font-size:1.05rem;">Bs. ${totalBsRaw}</span>
                        <button type="button" class="btn-copy-mini" style="background:#c2410c;color:#fff;" onclick="copyTextToClipboard('${totalBsRaw}', this)">
                            <i class="fas fa-copy"></i> Copiar Monto
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
    
    const modal = document.createElement('div');
    modal.id = 'confirmModal';
    modal.className = 'modal show';
    modal.innerHTML = `
        <div style="width:500px;max-width:95%;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,0.3)">
            <div style="background:linear-gradient(135deg,var(--dark,#111),#2a1a4a);color:#fff;padding:22px 26px">
                <h3 style="margin:0 0 4px;font-size:1.2rem"><i class="fas fa-clipboard-check" style="color:var(--accent,#FF6600)"></i> Confirmar Pedido</h3>
                <p style="margin:0;font-size:0.82rem;opacity:0.8">Revisa el resumen y la tasa oficial antes de enviar</p>
            </div>
            <div style="padding:22px 26px;max-height:56vh;overflow-y:auto">
                <div style="margin-bottom:14px">
                    <div style="font-size:0.75rem;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Datos del Cliente</div>
                    <div style="font-weight:700;font-size:1.05rem;color:#1e293b;">${clientName}</div>
                    <div style="font-size:0.84rem;color:#555;margin-top:2px;">
                        <span><i class="fas fa-id-card"></i> <strong>Cédula:</strong> ${clientCi}</span>
                        <span style="margin-left:10px;"><i class="fas fa-phone"></i> ${clientPhone}</span>
                    </div>
                    ${clientEmail ? `
                        <div style="font-size:0.82rem;color:#2563eb;margin-top:4px;">
                            <i class="fas fa-envelope"></i> <strong>Factura al correo:</strong> ${clientEmail}
                        </div>
                    ` : ''}
                </div>
                
                <div style="margin-bottom:14px">
                    <div style="font-size:0.75rem;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Artículos Solicitados</div>
                    <div style="background:#f8fafc;border-radius:10px;padding:12px;font-size:0.85rem;line-height:1.7;white-space:pre-line;border:1px solid #e2e8f0;">${prodLines}</div>
                </div>

                <div style="display:flex;justify-content:space-between;padding:7px 0;font-size:0.88rem;border-bottom:1px solid #eee">
                    <span>Subtotal Productos</span><span>$${subtotal.toFixed(2)} <small style="color:#64748b;">(${subtotalBs})</small></span>
                </div>
                <div style="display:flex;justify-content:space-between;padding:7px 0;font-size:0.88rem;border-bottom:1px solid #eee">
                    <span>IVA (16%)</span><span>$${iva.toFixed(2)} <small style="color:#64748b;">(${ivaBs})</small></span>
                </div>
                <div style="display:flex;justify-content:space-between;padding:7px 0;font-size:0.88rem;border-bottom:1px solid #eee;color:#0284c7;font-weight:600;">
                    <span><i class="${isDelivery ? 'fas fa-motorcycle' : 'fas fa-store'}"></i> ${isDelivery ? `Delivery (${deliveryZoneLabel})` : 'Retiro en Local'}:</span>
                    <span style="color:${(isDelivery && deliveryCost > 0) ? '#2563eb' : '#059669'};">${deliveryCost === 0 ? '¡GRATIS ($0.00)!' : `+$${deliveryCost.toFixed(2)} USD`}</span>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;font-size:1.2rem;font-weight:700;color:var(--accent,#FF6600)">
                    <span>TOTAL A PAGAR</span>
                    <div style="text-align:right;">
                        <div>$${total.toFixed(2)} USD</div>
                        <div style="font-size:0.85rem;color:#64748b;font-weight:600;">≈ ${totalBs}</div>
                    </div>
                </div>

                ${pagoMovilCardHtml}

                <div style="display:flex;flex-direction:column;gap:6px;margin-top:10px;font-size:0.84rem;color:#555;background:#f8fafc;padding:12px;border-radius:10px;border:1px solid #e2e8f0;">
                    <div><i class="fas fa-credit-card"></i> <strong>Forma de Pago:</strong> ${paymentLabel}</div>
                    <div><i class="fas fa-truck"></i> <strong>Entrega:</strong> ${addr || 'Retiro en Sede Comercial'}</div>
                    ${mapsLink ? `<div><i class="fas fa-map-marked-alt" style="color:#28a745;"></i> <a href="${mapsLink}" target="_blank" style="color:#28a745;font-weight:600;text-decoration:underline;">Ver punto GPS en Google Maps</a></div>` : ''}
                </div>
                <div style="margin-top:14px;background:#e8f5e9;border:1px solid #c8e6c9;border-radius:10px;padding:12px;font-size:0.82rem;line-height:1.6;color:#2e7d32">
                    <strong><i class="fab fa-whatsapp"></i> Mensaje que se enviará:</strong>
                    <div style="margin-top:6px;white-space:pre-line;font-family:monospace;font-size:0.75rem">${msg.replace(/</g, '&lt;')}</div>
                </div>
            </div>
            <div style="padding:16px 26px 22px;display:flex;gap:10px;border-top:1px solid #eee">
                <button onclick="closeConfirmModal()" style="flex:1;padding:12px;border:1.5px solid #ddd;background:#fff;border-radius:10px;font-size:0.92rem;font-weight:600;cursor:pointer;color:#555">
                    <i class="fas fa-arrow-left"></i> Volver
                </button>
                <button onclick="confirmAndSend()" id="confirmSendBtn" style="flex:2;padding:12px;background:linear-gradient(135deg,#25D366,#128C7E);color:#fff;border:none;border-radius:10px;font-size:0.92rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">
                    <i class="fab fa-whatsapp"></i> Confirmar y Enviar
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', function(e) { if (e.target === modal) closeConfirmModal(); });
}

function closeConfirmModal() {
    const modal = document.getElementById('confirmModal');
    if (modal) modal.remove();
}

async function confirmAndSend() {
    const data = window._pendingOrder;
    if (!data) { closeConfirmModal(); return; }
    
    const btn = document.getElementById('confirmSendBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...'; }
    
    let clienteId = data.cliente_id;
    
    // Crear cliente nuevo si aplica guardando su cédula y teléfono
    if (clienteId === 'nuevo') {
        try {
            const isGH = window.location.hostname.includes('github.io');
            if (!isGH) {
                const resCli = await fetch(`${API_BASE}/clientes.php`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        nombre: data.clientName, 
                        ci_rif: data.clientCi,
                        email: data.clientEmail || '',
                        telefono: data.clientPhone,
                        direccion: data.direccion_entrega
                    })
                });
                if (resCli.ok) {
                    const cliData = await resCli.json();
                    if (cliData.status === 'success' && cliData.id) {
                        clienteId = cliData.id;
                    }
                }
            }
        } catch (err) { 
            console.warn('API clientes no disponible o sin conexión. Continuando con cliente local:', err);
        }
    }
    if (!clienteId || clienteId === 'nuevo') clienteId = 1;

    // Generar código único y calcular totales
    const now = new Date();
    const timeCode = String(now.getMinutes()).padStart(2, '0') + String(now.getSeconds()).padStart(2, '0');
    let orderCode = `PED-${timeCode}`;
    let orderId = Date.now();
    let orderTotal = data.total || (data.subtotal ? data.subtotal * 1.16 : 0);

    // Enviar pedido a la BD si el backend está disponible
    try {
        const isGH = window.location.hostname.includes('github.io');
        if (!isGH) {
            const res = await fetch(`${API_BASE}/pedidos.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cliente_id: clienteId,
                    cliente_nombre: data.clientName,
                    cliente_telefono: data.clientPhone,
                    cliente_ci: data.clientCi,
                    cliente_email: data.clientEmail || '',
                    direccion_entrega: data.direccion_entrega,
                    notas: data.notas,
                    forma_pago: data.forma_pago,
                    productos: data.productos
                })
            });
            if (res.ok) {
                const result = await res.json();
                if (result.status === 'success') {
                    if (result.codigo) orderCode = result.codigo;
                    if (result.total) orderTotal = result.total;
                    if (result.id) orderId = result.id;
                }
            }
        }
    } catch (err) {
        console.warn('API pedidos no disponible. Guardando localmente:', err);
    }

    // Estructurar el pedido completo para almacenamiento local y notificación inmediata
    const localOrder = {
        id: orderId,
        codigo: orderCode,
        cliente_id: clienteId,
        cliente_nombre: data.clientName,
        cliente_ci: data.clientCi,
        cliente_telefono: data.clientPhone,
        cliente_email: data.clientEmail || '',
        direccion_entrega: data.direccion_entrega,
        notas: data.notas || '',
        forma_pago: data.forma_pago || 'pago_movil',
        total: parseFloat(orderTotal).toFixed(2),
        subtotal: parseFloat(data.subtotal || 0).toFixed(2),
        impuesto: parseFloat(data.iva || 0).toFixed(2),
        estado: 'pendiente', // Siempre requiere validación de pago por el Super Admin
        productos: data.productos || [],
        created_at: now.toISOString().replace('T', ' ').substring(0, 19)
    };

    // Guardar en almacenamiento persistente local
    saveLocalOrder(localOrder);

    // Notificar en tiempo real al Super Admin
    notifySuperAdminNewOrder(localOrder);

    // Abrir WhatsApp con el pedido
    const waUrl = 'https://wa.me/584121234567?text=' + encodeURIComponent(data.msg);
    window.open(waUrl, '_blank');

    showToast(`¡Pedido ${orderCode} creado con éxito! Total: $${localOrder.total}`);

    // Limpiar carrito y formulario
    cart = []; saveCart(); updateCart();
    try { document.getElementById('orderForm').reset(); } catch(e){}
    closeConfirmModal();
    window._pendingOrder = null;

    // Mostrar modal con opción de descarga de factura directa al cliente
    mostrarModalExitoConFactura(localOrder, waUrl);

    if (typeof loadPedidosRecientes === 'function' && isSuperUsuario()) {
        loadPedidosRecientes();
    }
}

// ============================================
// TOAST
// ============================================
function showToast(msg, type = 'success') {
    let toast = document.querySelector('.toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = '<i class="fas fa-check-circle"></i><span></span>';
        document.body.appendChild(toast);
    }
    toast.querySelector('span').textContent = msg;
    const icon = toast.querySelector('i');
    if (type === 'error') {
        icon.className = 'fas fa-exclamation-circle';
        icon.style.color = '#ef4444';
    } else if (type === 'warning') {
        icon.className = 'fas fa-exclamation-triangle';
        icon.style.color = '#f59e0b';
    } else {
        icon.className = 'fas fa-check-circle';
        icon.style.color = '#10b981';
    }
    toast.classList.add('show');
    if (window._toastTimer) clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => toast.classList.remove('show'), 4000);
}

document.addEventListener('submit', function(e) {
    if (e.target.id === 'contactForm' || e.target.id === 'clientForm') {
        e.preventDefault();
        showToast('¡Enviado correctamente!');
        e.target.reset();
    }
});

// ============================================
// ENVÍO DE FACTURA POR CORREO ELECTRÓNICO
// ============================================
async function enviarFacturaPorCorreoPrompt(codigoOrId) {
    const p = findOrderData(codigoOrId);
    if (!p) {
        showToast('No se encontró el registro del pedido para enviar la factura', 'error');
        return;
    }

    const defaultEmail = p.cliente_email || '';
    const emailPrompt = prompt('Ingresa el correo electrónico del cliente para enviarle su Factura Oficial:', defaultEmail);
    if (!emailPrompt) return; // Usuario canceló

    const email = emailPrompt.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showToast('Por favor ingresa un correo electrónico válido (ej: cliente@gmail.com)', 'error');
        return;
    }

    showToast('Generando documento PDF y preparando envío por correo...', 'info');

    // Actualizar correo localmente de inmediato
    p.cliente_email = email;
    const localOrders = getLocalOrders();
    const idx = localOrders.findIndex(o => (p.id && String(o.id) === String(p.id)) || (p.codigo && o.codigo === p.codigo));
    if (idx !== -1) {
        localOrders[idx].cliente_email = email;
        saveLocalOrders(localOrders);
    }

    const cleanCod = (p.codigo || `PED-${p.id || '001'}`).replace(/[^a-zA-Z0-9_-]/g, '');
    const filename = `Factura_${cleanCod}.pdf`;
    let pdfBase64 = null;

    try {
        await loadPdfLibraries();
        const originalArea = document.getElementById('facturaPrintArea');
        const JsPdfConstructor = (window.jspdf && window.jspdf.jsPDF) 
            ? window.jspdf.jsPDF 
            : (window.jsPDF || window.jspdf);

        if (originalArea && window.html2canvas && JsPdfConstructor) {
            const scrollWrap = originalArea.closest('.factura-scroll-wrap');
            const prevScroll = scrollWrap ? scrollWrap.scrollTop : 0;
            if (scrollWrap) scrollWrap.scrollTop = 0;

            const canvas = await window.html2canvas(originalArea, {
                scale: 2,
                useCORS: true,
                allowTaint: false,
                backgroundColor: '#ffffff',
                logging: false,
                scrollX: 0,
                scrollY: 0
            });

            if (scrollWrap) scrollWrap.scrollTop = prevScroll;

            if (canvas && canvas.width > 0) {
                const imgData = canvas.toDataURL('image/jpeg', 0.96);
                const pdf = new JsPdfConstructor({
                    orientation: 'portrait',
                    unit: 'mm',
                    format: 'a4'
                });

                const pageWidth = 210;
                const pageHeight = 297;
                const margin = 8;
                const printWidth = pageWidth - (margin * 2);
                const printHeight = (canvas.height * printWidth) / canvas.width;
                const maxContentHeight = pageHeight - (margin * 2);

                if (printHeight <= maxContentHeight) {
                    pdf.addImage(imgData, 'JPEG', margin, margin, printWidth, printHeight);
                } else {
                    let heightLeft = printHeight;
                    let position = margin;
                    pdf.addImage(imgData, 'JPEG', margin, position, printWidth, printHeight);
                    heightLeft -= maxContentHeight;
                    while (heightLeft > 0) {
                        position = margin - (printHeight - heightLeft);
                        pdf.addPage();
                        pdf.addImage(imgData, 'JPEG', margin, position, printWidth, printHeight);
                        heightLeft -= maxContentHeight;
                    }
                }
                const dataUri = pdf.output('datauristring');
                pdfBase64 = dataUri.split(',')[1];
            }
        }
    } catch(errPdf) {
        console.warn('No se pudo capturar PDF en cliente; se enviará por correo con la plantilla HTML oficial idéntica:', errPdf);
    }

    try {
        const isGH = window.location.hostname.includes('github.io');
        if (isGH) {
            showToast(`Simulación demo: Factura idéntica oficial enviada a ${email}`, 'success');
            return;
        }

        const res = await fetch(`${API_BASE}/pedidos.php?action=enviar_factura`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pedido_id: p.id,
                codigo: p.codigo || '',
                email: email,
                tasa_bcv: (typeof BcvManager !== 'undefined' && BcvManager.rate) ? BcvManager.rate : null,
                pedido: p,
                productos: p.productos || [],
                pdf_base64: pdfBase64,
                filename: filename
            })
        });

        const data = await res.json();
        if (res.ok && data.status === 'success') {
            showToast(`¡Factura oficial idéntica enviada con éxito a ${email}!`, 'success');
        } else {
            showToast(data.message || 'No se pudo enviar el correo', 'error');
        }
    } catch(err) {
        console.error('Error enviando factura por correo:', err);
        showToast('Error de conexión al enviar el correo', 'error');
    }
}
window.enviarFacturaPorCorreoPrompt = enviarFacturaPorCorreoPrompt;

