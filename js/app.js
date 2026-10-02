// ============================================
// INVERSIONES DURI C.A - JavaScript Principal
// ============================================

const isInPages = window.location.pathname.includes('/pages/');
const API_BASE = isInPages ? '../backend/api' : 'backend/api';

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
    const data = localStorage.getItem('userDuri');
    return data ? JSON.parse(data) : null;
}

function isLoggedIn() {
    return getUser() !== null;
}

function isSuperUsuario() {
    const user = getUser();
    return user && (user.rol === 'super_usuario' || user.rol === 'admin');
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
// NAVBAR
function bootApp() {
    try { initNav(); } catch(e) { console.error('initNav error:', e); }
    try { initPage(); } catch(e) { console.error('initPage error:', e); }
    try { showUserBadge(); } catch(e) {}
    try { showInventoryLink(); } catch(e) {}
    try { initSuperAdminNotifications(); } catch(e) {}
    try { initCinematicEffects(); } catch(e) {}
    try { initFloatingCart(); } catch(e) {}
    try { initWhatsApp(); } catch(e) {}
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

function initFloatingCart() {
    const html = `
    <div class="floating-cart">
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
        </div>
        <button class="floating-cart-btn" onclick="toggleCartPanel()">
            <i class="fas fa-shopping-cart"></i>
            <span class="cart-count" id="floatingCartCount" style="display:none">0</span>
        </button>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    updateFloatingCart();
}

function toggleCartPanel() {
    const panel = document.getElementById('cartPanel');
    if (panel) panel.classList.toggle('show');
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
    
    // Smooth parallax for hero shapes
    window.addEventListener('scroll', () => {
        const shapes = document.querySelectorAll('.shape');
        const scrollY = window.scrollY;
        shapes.forEach((shape, i) => {
            const speed = (i + 1) * 0.15;
            shape.style.transform = 'translateY(' + (scrollY * speed) + 'px)';
        });
    });
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
  {"id":7,"codigo":"PRD-007","nombre":"Borradores Premium","descripcion":"Borrador blanco de alta calidad","categoria_id":1,"precio_compra":"0.00","precio_venta":"1.25","stock_actual":87,"stock_minimo":30,"unidad_medida":"unidad","categoria_nombre":"Útiles Escolares"},
  {"id":8,"codigo":"PRD-008","nombre":"Carpetas Archivador","descripcion":"Carpeta de cartón tamaño carta","categoria_id":2,"precio_compra":"0.00","precio_venta":"4.75","stock_actual":25,"stock_minimo":20,"unidad_medida":"unidad","categoria_nombre":"Papelería"},
  {"id":4,"codigo":"PRD-004","nombre":"Cartuchos de Tinta","descripcion":"Cartuchos negra y color para impresoras","categoria_id":3,"precio_compra":"0.00","precio_venta":"24.99","stock_actual":22,"stock_minimo":10,"unidad_medida":"unidad","categoria_nombre":"Tecnología"},
  {"id":1,"codigo":"PRD-001","nombre":"Cuaderno Espiral 100 Hojas","descripcion":"Cuaderno espiral cuadriculado","categoria_id":1,"precio_compra":"0.00","precio_venta":"3.50","stock_actual":150,"stock_minimo":20,"unidad_medida":"unidad","categoria_nombre":"Útiles Escolares"},
  {"id":6,"codigo":"PRD-006","nombre":"Grapadora de Oficina","descripcion":"Grapadora metálica capacidad 25 hojas","categoria_id":4,"precio_compra":"0.00","precio_venta":"7.90","stock_actual":0,"stock_minimo":5,"unidad_medida":"unidad","categoria_nombre":"Accesorios"},
  {"id":2,"codigo":"PRD-002","nombre":"Lápices de Grafito 2B","descripcion":"Caja de 12 lápices de grafito","categoria_id":1,"precio_compra":"0.00","precio_venta":"2.80","stock_actual":78,"stock_minimo":15,"unidad_medida":"unidad","categoria_nombre":"Útiles Escolares"},
  {"id":9,"codigo":"PRD-009","nombre":"Marcadores Resaltadores","descripcion":"Set de 4 colores fluorescentes","categoria_id":1,"precio_compra":"0.00","precio_venta":"3.99","stock_actual":62,"stock_minimo":15,"unidad_medida":"unidad","categoria_nombre":"Útiles Escolares"},
  {"id":5,"codigo":"PRD-005","nombre":"Mouse Óptico USB","descripcion":"Mouse óptico ergonómico","categoria_id":3,"precio_compra":"0.00","precio_venta":"8.50","stock_actual":14,"stock_minimo":8,"unidad_medida":"unidad","categoria_nombre":"Tecnología"},
  {"id":3,"codigo":"PRD-003","nombre":"Resma de Papel Carta","descripcion":"Resma de 500 hojas tamaño carta","categoria_id":2,"precio_compra":"0.00","precio_venta":"5.20","stock_actual":12,"stock_minimo":15,"unidad_medida":"unidad","categoria_nombre":"Papelería"},
  {"id":10,"codigo":"PRD-010","nombre":"Tijeras Escolares","descripcion":"Tijeras con punta roma para niños","categoria_id":1,"precio_compra":"0.00","precio_venta":"1.95","stock_actual":43,"stock_minimo":10,"unidad_medida":"unidad","categoria_nombre":"Útiles Escolares"}
];

async function getFallbackProducts() {
    try {
        const custom = JSON.parse(localStorage.getItem('duri_products_custom') || 'null');
        if (Array.isArray(custom) && custom.length) return custom;
    } catch(e) {}

    try {
        const staticUrl = isInPages ? '../data/productos.json' : 'data/productos.json';
        const resStatic = await fetch(staticUrl);
        if (resStatic.ok) {
            const list = await resStatic.json();
            if (Array.isArray(list) && list.length) return list;
        }
    } catch(e) {}

    return JSON.parse(JSON.stringify(DEFAULT_PRODUCTS_FALLBACK));
}

// ============================================
// PRODUCTOS
// ============================================
async function loadProductos(categoria = null) {
    const grid = document.getElementById('productsGrid');
    try {
        let productos = [];
        const isGH = window.location.hostname.includes('github.io');

        // Intentar primero API PHP si no estamos exclusivamente en GitHub Pages
        if (!isGH) {
            try {
                let url = `${API_BASE}/productos.php`;
                if (categoria && categoria !== 'all') url += `?categoria=${encodeURIComponent(categoria)}`;
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
            if (categoria && categoria !== 'all') {
                productos = productos.filter(p => 
                    p.categoria_nombre === categoria || 
                    String(p.categoria_id) === String(categoria)
                );
            }
        }

        if (!productos || !productos.length) {
            if (grid) grid.innerHTML = '<div style="text-align:center;padding:50px;color:var(--gray)"><i class="fas fa-box-open" style="font-size:2.5rem;margin-bottom:12px;opacity:0.5;display:block"></i><p style="font-size:1.05rem">No hay productos en esta categoría.</p></div>';
            return;
        }

        renderProductos(productos);
    } catch (err) {
        console.error('Error general al cargar productos:', err);
        if (grid) grid.innerHTML = '<div style="text-align:center;padding:50px;color:#dc3545"><i class="fas fa-exclamation-triangle" style="font-size:2rem;margin-bottom:10px;display:block"></i><p>No se pudieron cargar los productos.</p></div>';
    }
}

function getUser() {
    try { return JSON.parse(localStorage.getItem('userDuri')); } catch(e) { return null; }
}

function renderProductos(productos) {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;
    
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
        
        return `
        <div class="product-card" data-category="${p.categoria_nombre}">
            ${badge}
            <div class="product-image ${colores[i % colores.length]}"><i class="fas ${icons[p.categoria_nombre] || 'fa-box'}"></i></div>
            <div class="product-content">
                <span class="product-category">${p.categoria_nombre}</span>
                <h3>${p.nombre}</h3>
                <p>${p.descripcion || ''}</p>
                <div class="product-footer">
                    <span class="product-price">$${parseFloat(p.precio_venta).toFixed(2)}</span>
                    <span class="product-stock ${stockClass}"><i class="fas ${p.stock_actual <= 0 ? 'fa-times-circle' : (p.stock_actual <= p.stock_minimo ? 'fa-exclamation-triangle' : 'fa-check')}"></i> ${p.stock_actual} u</span>
                </div>
                ${actions}
            </div>
        </div>`;
    }).join('');
    
    if (canEdit) {
        const header = document.querySelector('.page-hero .container');
        if (header && !document.getElementById('addProductBtn')) {
            const btn = document.createElement('a');
            btn.id = 'addProductBtn';
            btn.href = '#';
            btn.className = 'btn btn-accent';
            btn.style.cssText = 'margin-top:15px';
            btn.innerHTML = '<i class="fas fa-plus"></i> Agregar Producto';
            btn.onclick = function(e) { e.preventDefault(); showToast('Formulario de agregar producto - Próximamente'); };
            header.appendChild(btn);
        }
    }
}

function filterProducts(cat, btn) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    loadProductos(cat);
}

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
    el.innerHTML = `
        <div class="stat-card"><div class="stat-card-icon orange"><i class="fas fa-box"></i></div><div><div class="stat-card-value">${stats.total_productos}</div><div class="stat-card-label">Total Productos</div></div></div>
        <div class="stat-card green"><div class="stat-card-icon green"><i class="fas fa-check-circle"></i></div><div><div class="stat-card-value">${stats.en_stock}</div><div class="stat-card-label">En Stock</div></div></div>
        <div class="stat-card yellow"><div class="stat-card-icon yellow"><i class="fas fa-exclamation-triangle"></i></div><div><div class="stat-card-value">${stats.stock_bajo}</div><div class="stat-card-label">Stock Bajo</div></div></div>
        <div class="stat-card red"><div class="stat-card-icon red"><i class="fas fa-times-circle"></i></div><div><div class="stat-card-value">${stats.agotados}</div><div class="stat-card-label">Agotados</div></div></div>
    `;
}

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
        
        return `<tr>
            <td><strong>${p.codigo}</strong></td><td>${p.nombre}</td><td>${p.categoria_nombre}</td>
            <td>$${parseFloat(p.precio_venta).toFixed(2)}</td><td class="${stockClass}">${p.stock_actual}</td><td>${p.stock_minimo}</td>
            <td><span class="status ${statusClass}">${statusText}</span></td>
            <td>${actionBtn}</td>
        </tr>`;
    }).join('');
}

function filterInventory(val) {
    val = val.toLowerCase();
    document.querySelectorAll('#invBody tr').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(val) ? '' : 'none';
    });
}

// ============================================
// EDITAR / ELIMINAR PRODUCTO
// ============================================
let _editingProductId = null;

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

        if (!p) { showToast('Producto no encontrado', 'error'); return; }

        const catList = [
            {id:1, nombre:'Útiles Escolares'},
            {id:2, nombre:'Papelería'},
            {id:3, nombre:'Tecnología'},
            {id:4, nombre:'Accesorios'}
        ];

        _editingProductId = id;
        const old = document.getElementById('editModal');
        if (old) old.remove();

        const modal = document.createElement('div');
        modal.id = 'editModal';
        modal.className = 'modal show';
        modal.innerHTML = `
            <div style="width:440px;max-width:95%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,0.3)">
                <div style="background:linear-gradient(135deg,var(--dark),#2a1a4a);color:#fff;padding:20px 24px">
                    <h3 style="margin:0;font-size:1.1rem"><i class="fas fa-edit" style="color:var(--accent)"></i> Editar Producto</h3>
                    <p style="margin:4px 0 0;font-size:0.82rem;opacity:0.6">${p.codigo || ''}</p>
                </div>
                <div style="padding:24px">
                    <div class="form-group">
                        <label>Nombre</label>
                        <input type="text" id="editNombre" value="${(p.nombre || '').replace(/"/g, '&quot;')}">
                    </div>
                    <div class="form-group">
                        <label>Descripción</label>
                        <textarea id="editDesc" rows="2">${p.descripcion || ''}</textarea>
                    </div>
                    <div class="form-group">
                        <label>Categoría</label>
                        <select id="editCat">
                            ${catList.map(c => `<option value="${c.id}" ${c.id == p.categoria_id ? 'selected' : ''}>${c.nombre}</option>`).join('')}
                        </select>
                    </div>
                    <div style="display:flex;gap:12px">
                        <div class="form-group" style="flex:1">
                            <label>Precio ($)</label>
                            <input type="number" id="editPrecio" step="0.01" min="0" value="${p.precio_venta || 0}">
                        </div>
                        <div class="form-group" style="flex:1">
                            <label>Stock Actual</label>
                            <input type="number" id="editStock" min="0" value="${p.stock_actual || 0}">
                        </div>
                        <div class="form-group" style="flex:1">
                            <label>Stock Mínimo</label>
                            <input type="number" id="editStockMin" min="0" value="${p.stock_minimo || 0}">
                        </div>
                    </div>
                </div>
                <div style="padding:16px 24px 24px;display:flex;gap:10px;border-top:1px solid #eee">
                    <button onclick="closeEditModal()" style="flex:1;padding:12px;border:2px solid #ddd;background:#fff;border-radius:10px;font-size:0.9rem;font-weight:600;cursor:pointer;color:#666">Cancelar</button>
                    <button onclick="saveEditProduct()" style="flex:2;padding:12px;background:var(--accent);color:#fff;border:none;border-radius:10px;font-size:0.9rem;font-weight:600;cursor:pointer"><i class="fas fa-save"></i> Guardar Cambios</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', function(e) { if (e.target === modal) closeEditModal(); });
    } catch (err) {
        showToast('Error al cargar producto', 'error');
    }
}

function closeEditModal() {
    const m = document.getElementById('editModal');
    if (m) m.remove();
    _editingProductId = null;
}

async function saveEditProduct() {
    if (!_editingProductId) return;
    const nombre = document.getElementById('editNombre').value.trim();
    const desc = document.getElementById('editDesc').value.trim();
    const cat = document.getElementById('editCat').value;
    const precio = document.getElementById('editPrecio').value;
    const stock = document.getElementById('editStock').value;
    const stockMin = document.getElementById('editStockMin').value;

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
                    stock_minimo: parseInt(stockMin)
                })
            });
            if (res.ok) {
                const data = await res.json();
                if (data.status === 'success') saved = true;
            }
        } catch (err) {}
    }

    // Persistencia local / GitHub Pages
    if (!saved) {
        if (Array.isArray(_cachedInventory)) {
            const idx = _cachedInventory.findIndex(item => String(item.id) === String(_editingProductId));
            const catNames = {1:'Útiles Escolares', 2:'Papelería', 3:'Tecnología', 4:'Accesorios'};
            if (idx !== -1) {
                _cachedInventory[idx] = {
                    ..._cachedInventory[idx],
                    nombre,
                    descripcion: desc,
                    categoria_id: parseInt(cat),
                    categoria_nombre: catNames[cat] || _cachedInventory[idx].categoria_nombre || 'General',
                    precio_venta: parseFloat(precio).toFixed(2),
                    stock_actual: parseInt(stock),
                    stock_minimo: parseInt(stockMin)
                };
                localStorage.setItem('duri_products_custom', JSON.stringify(_cachedInventory));
                saved = true;
            }
        }
    }

    if (saved) {
        showToast('Producto actualizado correctamente');
        closeEditModal();
        loadInventario();
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

function filterAdminPedidos(filter) {
    currentAdminOrderFilter = filter;
    if (window._allAdminPedidos) {
        renderPedidosRecientes(window._allAdminPedidos, filter);
    }
}
window.filterAdminPedidos = filterAdminPedidos;

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
            if (!ids.has(String(lo.id)) && !cods.has(String(lo.codigo))) {
                pedidos.push(lo);
            }
        });
        // Sincronizar estados de la BD hacia local
        pedidos.forEach(p => {
            const m = localOrders.find(l => String(l.id) === String(p.id) || l.codigo === p.codigo);
            if (m && m.estado !== p.estado) {
                m.estado = p.estado;
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
        filtered = pedidos.filter(p => p.estado === filter);
    }

    const estadoClass = {'pendiente':'pending','procesando':'processing','completado':'completed','cancelado':'out'};
    const estadoText = {'pendiente':'⏳ Pendiente de Pago','procesando':'✅ Pago Confirmado','completado':'📦 Completado / Entregado','cancelado':'❌ Cancelado'};
    const canManage = isSuperUsuario();

    // 1. Alerta de resumen superior
    const summaryBanner = pendingCount > 0 ? `
        <div class="admin-payment-alert pending">
            <i class="fas fa-exclamation-triangle" style="font-size:1.4rem; color:#b07800;"></i>
            <div style="flex:1;">
                <div style="font-weight:700; font-size:0.95rem; color:#856404;">
                    ⚠️ ¡Atención! Tienes <strong>${pendingCount}</strong> pedido(s) con <strong>pago pendiente de verificar</strong>
                </div>
                <div style="font-size:0.82rem; color:#665103; margin-top:2px;">
                    Revisa si el dinero ingresó a tu cuenta / pago móvil y haz clic en <b>"Aprobar Pago"</b> para confirmar la compra.
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
    `;

    // 2. Pestañas de filtrado
    const tabsHtml = `
        <div class="admin-orders-tabs">
            <button type="button" class="admin-order-tab ${filter === 'todos' ? 'active' : ''}" onclick="filterAdminPedidos('todos')">Todos (${pedidos.length})</button>
            <button type="button" class="admin-order-tab ${filter === 'pendiente' ? 'active' : ''}" style="${pendingCount > 0 ? 'border-color:#ff9f1c; color:#d97706; font-weight:700;' : ''}" onclick="filterAdminPedidos('pendiente')">⏳ Pendientes de Pago (${pendingCount})</button>
            <button type="button" class="admin-order-tab ${filter === 'procesando' ? 'active' : ''}" onclick="filterAdminPedidos('procesando')">✅ Pagos Aprobados (${aprobadosCount})</button>
            <button type="button" class="admin-order-tab ${filter === 'completado' ? 'active' : ''}" onclick="filterAdminPedidos('completado')">📦 Completados (${completadosCount})</button>
            <button type="button" class="admin-order-tab ${filter === 'cancelado' ? 'active' : ''}" onclick="filterAdminPedidos('cancelado')">❌ Cancelados (${canceladosCount})</button>
        </div>
    `;

    // 3. Renderizar cada pedido
    const listHtml = filtered.length === 0 ? `
        <p style="color:var(--gray);text-align:center;padding:25px;background:#f9f9f9;border-radius:8px;">No hay pedidos en la categoría seleccionada.</p>
    ` : filtered.map(p => {
        let actionButtons = '';
        if (canManage) {
            let statusBtn = '';
            if (p.estado === 'pendiente') {
                const safeName = (p.cliente_nombre || 'Cliente').replace(/'/g, "\\'");
                const safeCode = (p.codigo || '').replace(/'/g, "\\'");
                const safePay = (p.forma_pago || 'efectivo').replace(/'/g, "\\'");
                const safeTotal = parseFloat(p.total || 0).toFixed(2);
                statusBtn = `
                    <button type="button" class="btn btn-sm" style="background:#28a745;color:#fff;font-weight:700;padding:8px 14px;font-size:0.82rem;border-radius:6px;border:none;cursor:pointer;display:inline-flex;align-items:center;gap:6px;box-shadow:0 2px 8px rgba(40,167,69,0.35);" onclick="abrirModalValidarPago(${p.id}, '${safeCode}', ${safeTotal}, '${safeName}', '${safePay}')">
                        <i class="fas fa-check-circle"></i> Aprobar Pago
                    </button>
                    <button type="button" class="btn btn-sm" style="background:#e0a800;color:#212529;font-weight:600;padding:8px 12px;font-size:0.82rem;border-radius:6px;border:none;cursor:pointer;display:inline-flex;align-items:center;gap:5px;" onclick="confirmarCancelarPedido(${p.id}, '${safeCode}')">
                        <i class="fas fa-times-circle"></i> Cancelar
                    </button>
                `;
            } else if (p.estado === 'procesando') {
                const safeCode = (p.codigo || '').replace(/'/g, "\\'");
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
                <button class="btn btn-sm" style="background:#dc3545;color:#fff;padding:6px 10px;font-size:0.78rem;border-radius:4px;border:none;cursor:pointer;" title="Eliminar del historial permanentemente" onclick="eliminarPedidoHistorial(${p.id}, '${p.codigo}')">
                    <i class="fas fa-trash-alt"></i>
                </button>
            `;
        }

        const formaPagoLabels = {
            'efectivo': '💵 Efectivo',
            'pago_movil': '📱 Pago Móvil',
            'transferencia': '🏦 Transferencia Bancaria',
            'tarjeta': '💳 Tarjeta'
        };
        const formaPagoDisplay = formaPagoLabels[p.forma_pago] || p.forma_pago || 'Efectivo';
        
        // Limpiar teléfono para link directo a WhatsApp
        let phoneWa = '';
        if (p.cliente_telefono) {
            let clean = p.cliente_telefono.replace(/[^0-9]/g, '');
            if (clean.startsWith('0')) clean = '58' + clean.slice(1);
            if (!clean.startsWith('58') && clean.length === 10) clean = '58' + clean;
            phoneWa = clean;
        }

        const isPendiente = p.estado === 'pendiente';

        return `
            <div class="order-row ${isPendiente ? 'order-pending-highlight' : ''}" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; padding:14px; margin-bottom:10px; border:1px solid ${isPendiente ? '#ffc107' : '#eee'}; border-radius:8px; background:#fff; box-shadow:0 2px 5px rgba(0,0,0,0.03);">
                <div class="order-row-info" style="display:flex; flex-direction:column; gap:4px; flex:1; min-width:240px;">
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        <strong style="color:var(--dark-brown,#333); font-size:1rem;">${p.codigo} &mdash; ${p.cliente_nombre || 'Cliente'}</strong>
                        ${isPendiente ? '<span style="background:#fffae6; color:#b07800; border:1px solid #ffe58f; font-size:0.72rem; font-weight:700; padding:2px 8px; border-radius:10px;"><i class="fas fa-hourglass-half"></i> Requiere Verificación</span>' : ''}
                    </div>
                    <span style="font-size:0.83rem; color:var(--dark,#444);">
                        ${p.cliente_ci ? '<i class="fas fa-id-card"></i> <strong>' + p.cliente_ci + '</strong> · ' : ''}
                        ${p.cliente_telefono ? '<i class="fas fa-phone"></i> ' + p.cliente_telefono : ''}
                        ${phoneWa ? ` <a href="https://wa.me/${phoneWa}?text=Hola%20${encodeURIComponent(p.cliente_nombre || '')}%2C%20le%20escribimos%20de%20Inversiones%20Duri%20sobre%20su%20pedido%20${p.codigo}" target="_blank" style="color:#25d366; font-size:0.78rem; font-weight:600; text-decoration:underline; margin-left:4px;"><i class="fab fa-whatsapp"></i> Chat</a>` : ''}
                        · <strong>Pago:</strong> ${formaPagoDisplay}
                    </span>
                    ${p.direccion_entrega ? `<span style="font-size:0.76rem; color:#666;"><i class="fas fa-map-marker-alt"></i> ${p.direccion_entrega}</span>` : ''}
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

    container.innerHTML = summaryBanner + tabsHtml + listHtml;
}

// ============================================
// MODAL DE VALIDACIÓN Y CONFIRMACIÓN DE PAGO
// ============================================

function cerrarModalValidacionPago() {
    const modal = document.getElementById('modalValidarPagoAdmin');
    if (modal) modal.remove();
}
window.cerrarModalValidacionPago = cerrarModalValidacionPago;

function abrirModalValidarPago(id, codigo, total, clienteNombre = '', formaPago = 'efectivo') {
    cerrarModalValidacionPago();

    const formaPagoLabels = {
        'efectivo': '💵 Efectivo',
        'pago_movil': '📱 Pago Móvil',
        'transferencia': '🏦 Transferencia Bancaria',
        'tarjeta': '💳 Tarjeta'
    };
    const paymentDisplay = formaPagoLabels[formaPago] || formaPago || 'Efectivo';
    const totalDisplay = parseFloat(total || 0).toFixed(2);

    const modal = document.createElement('div');
    modal.id = 'modalValidarPagoAdmin';
    modal.className = 'modal show';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.65);backdrop-filter:blur(4px);z-index:9999999;display:flex;align-items:center;justify-content:center;padding:16px;';

    modal.innerHTML = `
        <div style="background:#fff;border-radius:16px;width:100%;max-width:460px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,0.35);">
            <div style="background:linear-gradient(135deg,#190c2e 0%,#2e1554 100%);color:#fff;padding:22px 24px;text-align:center;position:relative;">
                <div style="width:58px;height:58px;border-radius:50%;background:rgba(40,167,69,0.18);border:2px solid #28a745;color:#28a745;display:flex;align-items:center;justify-content:center;font-size:1.8rem;margin:0 auto 10px;">
                    <i class="fas fa-check-circle"></i>
                </div>
                <h3 style="margin:0;font-size:1.25rem;color:#ffffff;font-weight:700;">Validación de Pago</h3>
                <p style="margin:4px 0 0;font-size:0.84rem;color:#d8d2e6;">Panel de Superusuario</p>
                <button type="button" onclick="cerrarModalValidacionPago()" style="position:absolute;top:14px;right:14px;background:none;border:none;color:rgba(255,255,255,0.7);font-size:1.4rem;cursor:pointer;line-height:1;">&times;</button>
            </div>
            
            <div style="padding:20px 24px;background:#fcfcfc;">
                <div style="background:#ffffff;border:1.5px solid #edf0f2;border-radius:12px;padding:16px;box-shadow:0 2px 8px rgba(0,0,0,0.02);margin-bottom:14px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:8px;border-bottom:1px solid #f0f0f0;">
                        <span style="color:#666;font-size:0.85rem;"><i class="fas fa-hashtag"></i> Pedido:</span>
                        <strong style="color:#251442;font-size:1rem;font-weight:700;">${codigo}</strong>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f0f0f0;">
                        <span style="color:#666;font-size:0.85rem;"><i class="fas fa-user"></i> Cliente:</span>
                        <strong style="color:#333;font-size:0.88rem;">${clienteNombre || 'Cliente'}</strong>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f0f0f0;">
                        <span style="color:#666;font-size:0.85rem;"><i class="fas fa-credit-card"></i> Método de Pago:</span>
                        <strong style="color:#333;font-size:0.88rem;">${paymentDisplay}</strong>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;">
                        <span style="color:#333;font-weight:700;font-size:0.95rem;">Monto a Confirmar:</span>
                        <span style="color:#28a745;font-weight:800;font-size:1.35rem;">$${totalDisplay}</span>
                    </div>
                </div>

                <div style="background:#e8f4fd;border:1px solid #cbe5fb;border-radius:8px;padding:10px 14px;font-size:0.82rem;color:#035388;display:flex;align-items:center;gap:10px;">
                    <i class="fas fa-info-circle" style="font-size:1.1rem;color:#007bff;flex-shrink:0;"></i>
                    <span>Al presionar <b>"Aceptar y Validar"</b>, la orden quedará como <b>Pago Confirmado</b> y se descontará del inventario.</span>
                </div>
            </div>

            <div style="padding:16px 24px 20px;display:flex;gap:10px;background:#ffffff;border-top:1px solid #eee;">
                <button type="button" onclick="cerrarModalValidacionPago()" style="flex:1;padding:12px 14px;background:#f8f9fa;border:1.5px solid #dee2e6;border-radius:8px;font-size:0.9rem;font-weight:600;color:#555;cursor:pointer;">
                    Cancelar
                </button>
                <button type="button" id="btnAceptarYValidar" onclick="ejecutarAprobacionPago(${id}, '${codigo}')" style="flex:2;padding:12px 16px;background:linear-gradient(135deg,#28a745 0%,#1e7e34 100%);border:none;border-radius:8px;font-size:0.95rem;font-weight:700;color:#ffffff;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 14px rgba(40,167,69,0.35);">
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
    } catch(err) {
        console.error('Error al aprobar pago:', err);
        cerrarModalValidacionPago();
        showToast('Error al validar el pago', 'error');
    }
}
window.ejecutarAprobacionPago = ejecutarAprobacionPago;

function confirmarCancelarPedido(id, codigo) {
    cerrarModalValidacionPago();
    const modal = document.createElement('div');
    modal.id = 'modalValidarPagoAdmin';
    modal.className = 'modal show';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.65);backdrop-filter:blur(4px);z-index:9999999;display:flex;align-items:center;justify-content:center;padding:16px;';

    modal.innerHTML = `
        <div style="background:#fff;border-radius:16px;width:100%;max-width:420px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,0.35);text-align:center;">
            <div style="padding:26px 24px 16px;">
                <div style="width:54px;height:54px;border-radius:50%;background:rgba(220,53,69,0.15);border:2px solid #dc3545;color:#dc3545;display:flex;align-items:center;justify-content:center;font-size:1.6rem;margin:0 auto 12px;">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <h3 style="margin:0 0 6px;font-size:1.2rem;color:#111;">¿Cancelar Pedido ${codigo}?</h3>
                <p style="margin:0;font-size:0.85rem;color:#666;">El estado del pedido pasará a Cancelado.</p>
            </div>
            <div style="padding:16px 24px 22px;display:flex;gap:10px;">
                <button type="button" onclick="cerrarModalValidacionPago()" style="flex:1;padding:11px;background:#fff;border:1.5px solid #ccc;border-radius:8px;font-size:0.88rem;font-weight:600;color:#555;cursor:pointer;">
                    Volver
                </button>
                <button type="button" onclick="actualizarEstadoPedidoDirecto(${id}, 'cancelado', '${codigo}'); cerrarModalValidacionPago(); showToast('Pedido ${codigo} cancelado', 'info');" style="flex:1;padding:11px;background:#dc3545;border:none;border-radius:8px;font-size:0.88rem;font-weight:700;color:#fff;cursor:pointer;">
                    Sí, Cancelar
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}
window.confirmarCancelarPedido = confirmarCancelarPedido;

async function actualizarEstadoPedidoDirecto(id, nuevoEstado, codigo = '') {
    if (!isSuperUsuario()) {
        showToast('Acceso restringido: solo el superusuario puede verificar y administrar pagos', 'error');
        return;
    }

    // 1. Enviar al Backend si está activo
    try {
        const isGH = window.location.hostname.includes('github.io');
        if (!isGH) {
            const currentUser = getUser();
            await fetch(`${API_BASE}/pedidos.php?id=${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    estado: nuevoEstado,
                    usuario_id: currentUser ? currentUser.id : null
                })
            });
        }
    } catch (err) {
        console.warn('API backend no disponible al actualizar pedido:', err);
    }

    // 2. Actualizar en localStorage
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

function updateCart() {
    const items = document.getElementById('orderItems');
    const total = document.getElementById('orderTotal');
    const btn = document.getElementById('submitBtn');
    const btnForm = document.getElementById('submitBtnForm');
    
    // Actualizar carrito flotante siempre
    try { updateFloatingCart(); } catch(e) {}
    
    if (!items) return;
    if (!cart.length) {
        items.innerHTML = '<div class="empty-cart"><i class="fas fa-shopping-basket"></i><p>Tu pedido está vacío</p></div>';
        if (total) total.textContent = '$0.00';
        if (btn) btn.disabled = true;
        if (btnForm) btnForm.disabled = true;
        return;
    }
    let html = '', sum = 0;
    cart.forEach((it, i) => {
        const t = it.price * it.qty; sum += t;
        html += `<div class="cart-item">
            <div class="cart-item-info"><div class="cart-item-name">${it.name}</div><div class="item-price">$${it.price.toFixed(2)} c/u</div></div>
            <div class="cart-item-qty"><button onclick="updateQty(${i},-1)">-</button><span>${it.qty}</span><button onclick="updateQty(${i},1)">+</button></div>
            <div class="cart-item-total">$${t.toFixed(2)}</div>
            <button class="cart-item-remove" onclick="removeFromCart(${i})"><i class="fas fa-trash"></i></button>
        </div>`;
    });
    items.innerHTML = html;
    if (total) total.textContent = '$' + sum.toFixed(2);
    if (btn) btn.disabled = false;
    if (btnForm) btnForm.disabled = false;
}

async function submitOrder() {
    const clientSelect = document.getElementById('clientSelect');
    const address = document.getElementById('deliveryAddress');
    const notes = document.getElementById('orderNotes');
    const payment = document.getElementById('paymentMethod');
    const newName = document.getElementById('newClientName');
    const newCi = document.getElementById('newClientCi');
    const newPhone = document.getElementById('newClientPhone');
    
    if (!clientSelect || !clientSelect.value) { showToast('Selecciona o escribe tu nombre', 'error'); return; }
    if (!cart.length) { showToast('Agrega productos al pedido', 'error'); return; }
    if (address && address.value && address.value.length < 10) { showToast('Dirección muy corta', 'error'); return; }
    
    if (!newName || !newName.value.trim()) { showToast('Por favor escribe tu nombre completo', 'error'); return; }
    if (!newCi || !newCi.value.trim()) { showToast('Por favor ingresa tu número de Cédula o RIF', 'error'); return; }
    if (!newPhone || !newPhone.value.trim()) { showToast('Por favor ingresa tu número de teléfono', 'error'); return; }
    
    const clientName = newName.value.trim();
    const clientCi = newCi.value.trim().toUpperCase();
    const clientPhone = newPhone.value.trim();
    
    const paymentLabels = { efectivo: 'Efectivo', pago_movil: 'Pago Móvil', transferencia: 'Transferencia Bancaria', tarjeta: 'Tarjeta' };
    const paymentLabel = payment ? (paymentLabels[payment.value] || payment.value) : 'Efectivo';
    const addr = address ? address.value.trim() : '';

    // Obtener coordenadas GPS si el usuario las fijó en el mapa
    const geoInput = document.getElementById('geoCoords');
    const geoCoords = geoInput ? geoInput.value.trim() : '';
    let mapsLink = '';
    let fullDeliveryAddress = addr;

    if (geoCoords) {
        mapsLink = `https://maps.google.com/?q=${geoCoords}`;
        fullDeliveryAddress = addr ? `${addr} | GPS: ${mapsLink}` : `GPS: ${mapsLink}`;
    }
    
    // Calcular total
    let subtotal = 0;
    cart.forEach(it => { subtotal += it.price * it.qty; });
    const iva = subtotal * 0.16;
    const total = subtotal + iva;
    
    // Construir lista de productos
    let prodLines = '';
    cart.forEach(it => {
        prodLines += `📦 ${it.name} x${it.qty} — $${(it.price * it.qty).toFixed(2)}\n`;
    });
    
    // Mensaje predeterminado con Cédula y Link de Google Maps
    const msg = `✅ ¡Hola! Quiero confirmar mi pedido en Inversiones Duri\n\n👤 Cliente: ${clientName}\n🪪 C.I / RIF: ${clientCi}\n📞 Teléfono: ${clientPhone}\n${prodLines}\n💰 Subtotal: $${subtotal.toFixed(2)}\n🧾 IVA (16%): $${iva.toFixed(2)}\n\n🔥 TOTAL: $${total.toFixed(2)}\n💳 Pago: ${paymentLabel}\n📍 Dirección: ${addr || 'Por confirmar'}${mapsLink ? `\n🗺️ Ubicación GPS (Google Maps): ${mapsLink}` : ''}\n\n¿Sigue disponible el producto? Confirma para proceder ✔`;
    
    // Guardar datos temporalmente para el modal
    window._pendingOrder = {
        cliente_id: clientSelect.value,
        direccion_entrega: fullDeliveryAddress,
        notas: notes ? notes.value : '',
        forma_pago: payment ? payment.value : 'efectivo',
        productos: cart.map(it => ({ producto_id: it.id, cantidad: it.qty, precio_unitario: it.price, nombre: it.name })),
        clientName,
        clientCi,
        clientPhone,
        mapsLink,
        msg,
        subtotal,
        iva,
        total
    };
    
    // Mostrar modal de confirmación
    showConfirmModal(subtotal, iva, total, prodLines, clientName, clientCi, clientPhone, paymentLabel, addr, mapsLink, msg);
}

function showConfirmModal(subtotal, iva, total, prodLines, clientName, clientCi, clientPhone, paymentLabel, addr, mapsLink, msg) {
    // Remover modal anterior si existe
    const old = document.getElementById('confirmModal');
    if (old) old.remove();
    
    const modal = document.createElement('div');
    modal.id = 'confirmModal';
    modal.className = 'modal show';
    modal.innerHTML = `
        <div style="width:480px;max-width:95%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,0.3)">
            <div style="background:linear-gradient(135deg,var(--dark,#111),#2a1a4a);color:#fff;padding:24px 28px">
                <h3 style="margin:0 0 4px;font-size:1.2rem"><i class="fas fa-clipboard-check" style="color:var(--accent,#FF6600)"></i> Confirmar Pedido</h3>
                <p style="margin:0;font-size:0.85rem;opacity:0.7">Revisa tus datos y tu pedido antes de enviarlo</p>
            </div>
            <div style="padding:24px 28px;max-height:50vh;overflow-y:auto">
                <div style="margin-bottom:16px">
                    <div style="font-size:0.8rem;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Datos del Cliente</div>
                    <div style="font-weight:600;font-size:1.05rem;">${clientName}</div>
                    <div style="font-size:0.85rem;color:#555;margin-top:2px;">
                        <span><i class="fas fa-id-card"></i> <strong>C.I / RIF:</strong> ${clientCi}</span>
                        <span style="margin-left:10px;"><i class="fas fa-phone"></i> ${clientPhone}</span>
                    </div>
                </div>
                <div style="margin-bottom:16px">
                    <div style="font-size:0.8rem;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Productos</div>
                    <div style="background:#f8f8f8;border-radius:8px;padding:14px;font-size:0.9rem;line-height:1.8;white-space:pre-line">${prodLines}</div>
                </div>
                <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:0.9rem;border-bottom:1px solid #eee">
                    <span>Subtotal</span><span>$${subtotal.toFixed(2)}</span>
                </div>
                <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:0.9rem;border-bottom:1px solid #eee">
                    <span>IVA (16%)</span><span>$${iva.toFixed(2)}</span>
                </div>
                <div style="display:flex;justify-content:space-between;padding:12px 0;font-size:1.2rem;font-weight:700;color:var(--accent,#FF6600)">
                    <span>TOTAL</span><span>$${total.toFixed(2)}</span>
                </div>
                <div style="display:flex;flex-direction:column;gap:6px;margin-top:10px;font-size:0.85rem;color:#555;background:#f9f9f9;padding:12px;border-radius:8px;">
                    <div><i class="fas fa-credit-card"></i> <strong>Pago:</strong> ${paymentLabel}</div>
                    <div><i class="fas fa-map-marker-alt"></i> <strong>Entrega:</strong> ${addr || 'Por confirmar'}</div>
                    ${mapsLink ? `<div><i class="fas fa-map-marked-alt" style="color:#28a745;"></i> <a href="${mapsLink}" target="_blank" style="color:#28a745;font-weight:600;text-decoration:underline;">Ver punto GPS fijado en Google Maps</a></div>` : ''}
                </div>
                <div style="margin-top:16px;background:#e8f5e9;border:1px solid #c8e6c9;border-radius:8px;padding:14px;font-size:0.82rem;line-height:1.6;color:#2e7d32">
                    <strong><i class="fab fa-whatsapp"></i> Mensaje que se enviará:</strong>
                    <div style="margin-top:8px;white-space:pre-line;font-family:monospace;font-size:0.78rem">${msg.replace(/</g, '&lt;')}</div>
                </div>
            </div>
            <div style="padding:16px 28px 24px;display:flex;gap:10px;border-top:1px solid #eee">
                <button onclick="closeConfirmModal()" style="flex:1;padding:14px;border:2px solid #ddd;background:#fff;border-radius:10px;font-size:0.95rem;font-weight:600;cursor:pointer;color:#666">
                    <i class="fas fa-arrow-left"></i> Volver
                </button>
                <button onclick="confirmAndSend()" id="confirmSendBtn" style="flex:2;padding:14px;background:linear-gradient(135deg,#25D366,#128C7E);color:#fff;border:none;border-radius:10px;font-size:0.95rem;font-weight:600;cursor:pointer">
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
        direccion_entrega: data.direccion_entrega,
        notas: data.notas || '',
        forma_pago: data.forma_pago || 'efectivo',
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

    if (typeof loadPedidosRecientes === 'function') {
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
    toast.querySelector('i').className = type === 'error' ? 'fas fa-exclamation-circle' : 'fas fa-check-circle';
    toast.querySelector('i').style.color = type === 'error' ? '#dc3545' : '#28a745';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

document.addEventListener('submit', function(e) {
    if (e.target.id === 'contactForm' || e.target.id === 'clientForm') {
        e.preventDefault();
        showToast('¡Enviado correctamente!');
        e.target.reset();
    }
});
