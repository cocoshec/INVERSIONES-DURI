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

    li.innerHTML = `
        <div class="user-nav-container">
            <div class="user-badge-mobile-info">
                <span style="font-size:1.05rem;">${rolEmoji[user.rol] || '👑'}</span>
                <span style="font-weight:700;font-size:0.86rem;color:#ffffff;">${userName}</span>
                <span class="role-tag" style="background:${roleColor};color:#fff;padding:2px 7px;border-radius:6px;font-size:0.68rem;font-weight:700;">${userRole}</span>
            </div>
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
            const staticUrl = isInPages ? '../data/productos.json' : 'data/productos.json';
            try {
                const resStatic = await fetch(staticUrl);
                if (resStatic.ok) {
                    const staticList = await resStatic.json();
                    productos = staticList;
                    if (categoria && categoria !== 'all') {
                        productos = productos.filter(p => 
                            p.categoria_nombre === categoria || 
                            String(p.categoria_id) === String(categoria)
                        );
                    }
                }
            } catch(eStatic) {
                console.error('Error cargando JSON estático:', eStatic);
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
async function loadInventario() {
    try {
        const [invRes, statsRes] = await Promise.all([
            fetch(`${API_BASE}/inventario.php`),
            fetch(`${API_BASE}/inventario.php?estadisticas=true`)
        ]);
        const invData = await invRes.json();
        const statsData = await statsRes.json();
        if (invData.status === 'success') renderInventarioTable(invData.data);
        if (statsData.status === 'success') renderInventarioStats(statsData.data);
    } catch (err) { console.error('Error:', err); }
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
        const res = await fetch(`${API_BASE}/productos.php?id=${id}`);
        const data = await res.json();
        if (data.status !== 'success') { showToast('Producto no encontrado', 'error'); return; }
        const p = data.data;

        // Obtener categorías
        let cats = [];
        try {
            const catRes = await fetch(`${API_BASE}/productos.php`);
            // No hay API de categorías, usamos las fijas
        } catch(e) {}
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
                    <p style="margin:4px 0 0;font-size:0.82rem;opacity:0.6">${p.codigo}</p>
                </div>
                <div style="padding:24px">
                    <div class="form-group">
                        <label>Nombre</label>
                        <input type="text" id="editNombre" value="${p.nombre.replace(/"/g, '&quot;')}">
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
                            <input type="number" id="editPrecio" step="0.01" min="0" value="${p.precio_venta}">
                        </div>
                        <div class="form-group" style="flex:1">
                            <label>Stock Actual</label>
                            <input type="number" id="editStock" min="0" value="${p.stock_actual}">
                        </div>
                        <div class="form-group" style="flex:1">
                            <label>Stock Mínimo</label>
                            <input type="number" id="editStockMin" min="0" value="${p.stock_minimo}">
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
        const data = await res.json();
        if (data.status === 'success') {
            showToast('Producto actualizado correctamente');
            closeEditModal();
            loadInventario();
        } else {
            showToast('Error: ' + data.message, 'error');
        }
    } catch (err) {
        showToast('Error de conexión', 'error');
    }
}

async function deleteProduct(id) {
    if (!confirm('¿Seguro que quieres eliminar este producto?')) return;
    try {
        const res = await fetch(`${API_BASE}/productos.php?id=${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.status === 'success') {
            showToast('Producto eliminado');
            loadInventario();
            // También recargar productos si estamos en esa página
            if (document.body.dataset.page === 'productos') loadProductos();
        } else {
            showToast('Error: ' + data.message, 'error');
        }
    } catch (err) {
        showToast('Error de conexión', 'error');
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

async function loadPedidosRecientes() {
    const adminCard = document.getElementById('adminOrdersCard');
    
    // Solo el superusuario tiene permiso para ver y verificar los pedidos
    if (!isSuperUsuario()) {
        if (adminCard) adminCard.style.display = 'none';
        return;
    }

    if (adminCard) adminCard.style.display = 'block';

    try {
        const res = await fetch(`${API_BASE}/pedidos.php`);
        const data = await res.json();
        if (data.status === 'success') renderPedidosRecientes(data.data);
    } catch (err) { console.error(err); }
}

function renderPedidosRecientes(pedidos) {
    const container = document.getElementById('recentOrders');
    if (!container) return;
    if (!pedidos || pedidos.length === 0) {
        container.innerHTML = '<p style="color:var(--gray);text-align:center;padding:15px;">No hay pedidos registrados aún.</p>';
        return;
    }
    const estadoClass = {'pendiente':'pending','procesando':'processing','completado':'completed','cancelado':'out'};
    const estadoText = {'pendiente':'Pendiente de Pago','procesando':'Pago Confirmado / En Proceso','completado':'Completado','cancelado':'Cancelado'};
    const canManage = isSuperUsuario();
    
    container.innerHTML = pedidos.map(p => {
        let actionButtons = '';
        if (canManage) {
            let statusBtn = '';
            if (p.estado === 'pendiente') {
                statusBtn = `
                    <button class="btn btn-sm" style="background:#28a745;color:#fff;padding:6px 10px;font-size:0.78rem;border-radius:4px;border:none;cursor:pointer;" onclick="actualizarEstadoPedido(${p.id}, 'procesando')">
                        <i class="fas fa-check"></i> Aprobar Pago
                    </button>
                    <button class="btn btn-sm" style="background:#ffc107;color:#212529;padding:6px 10px;font-size:0.78rem;border-radius:4px;border:none;cursor:pointer;" onclick="actualizarEstadoPedido(${p.id}, 'cancelado')">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                `;
            } else if (p.estado === 'procesando') {
                statusBtn = `
                    <button class="btn btn-sm" style="background:#007bff;color:#fff;padding:6px 10px;font-size:0.78rem;border-radius:4px;border:none;cursor:pointer;" onclick="actualizarEstadoPedido(${p.id}, 'completado')">
                        <i class="fas fa-box-check"></i> Entregar / Completar
                    </button>
                    <button class="btn btn-sm" style="background:#ffc107;color:#212529;padding:6px 10px;font-size:0.78rem;border-radius:4px;border:none;cursor:pointer;" onclick="actualizarEstadoPedido(${p.id}, 'cancelado')">
                        <i class="fas fa-undo"></i> Cancelar
                    </button>
                `;
            }

            // Botón de eliminar (papelera) para limpiar el historial
            actionButtons = `
                ${statusBtn}
                <button class="btn btn-sm" style="background:#dc3545;color:#fff;padding:6px 10px;font-size:0.78rem;border-radius:4px;border:none;cursor:pointer;" title="Eliminar del historial permanentemente" onclick="eliminarPedidoHistorial(${p.id}, '${p.codigo}')">
                    <i class="fas fa-trash-alt"></i>
                </button>
            `;
        }

        return `
            <div class="order-row" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; padding:12px; margin-bottom:8px; border:1px solid #eee; border-radius:6px; background:#fff;">
                <div class="order-row-info" style="display:flex; flex-direction:column; gap:2px;">
                    <strong style="color:var(--dark-brown,#333); font-size:0.95rem;">${p.codigo} &mdash; ${p.cliente_nombre || 'Cliente'}</strong>
                    <span style="font-size:0.8rem; color:var(--dark,#444);">
                        ${p.cliente_ci ? '<i class="fas fa-id-card"></i> <strong>' + p.cliente_ci + '</strong> · ' : ''}
                        ${p.cliente_telefono ? '<i class="fas fa-phone"></i> ' + p.cliente_telefono + ' · ' : ''}
                        <strong>Pago:</strong> ${p.forma_pago || 'efectivo'}
                    </span>
                    ${p.direccion_entrega ? `<span style="font-size:0.75rem; color:#666;"><i class="fas fa-map-marker-alt"></i> ${p.direccion_entrega}</span>` : ''}
                </div>
                <div class="order-row-details" style="display:flex; align-items:center; gap:12px;">
                    <span style="font-weight:700; font-size:1rem; color:#28a745;">$${parseFloat(p.total).toFixed(2)}</span>
                    <span class="status ${estadoClass[p.estado] || 'pending'}" style="padding:4px 8px; border-radius:12px; font-size:0.75rem; font-weight:600;">${estadoText[p.estado] || p.estado}</span>
                </div>
                <div style="display:flex; gap:6px; align-items:center;">
                    ${actionButtons}
                </div>
            </div>
        `;
    }).join('');
}

async function eliminarPedidoHistorial(id, codigo) {
    if (!isSuperUsuario()) {
        showToast('Acceso restringido: solo el superusuario puede eliminar pedidos', 'error');
        return;
    }

    if (!confirm(`¿Deseas eliminar permanentemente el pedido ${codigo} del historial?`)) {
        return;
    }

    try {
        const currentUser = getUser();
        const usuarioParam = currentUser ? `&usuario_id=${currentUser.id}` : '';
        const res = await fetch(`${API_BASE}/pedidos.php?id=${id}${usuarioParam}`, {
            method: 'DELETE'
        });
        const result = await res.json();
        if (result.status === 'success') {
            showToast(`Pedido ${codigo} eliminado del historial`);
            loadPedidosRecientes();
        } else {
            showToast('Error: ' + result.message, 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Error de conexión al eliminar pedido', 'error');
    }
}

async function actualizarEstadoPedido(id, nuevoEstado) {
    if (!isSuperUsuario()) {
        showToast('Acceso restringido: solo el superusuario puede verificar y administrar pagos', 'error');
        return;
    }

    const confirmMsg = nuevoEstado === 'procesando' 
        ? '¿Confirmas que ya verificaste el pago de este pedido? Esto descontará los productos del inventario.' 
        : (nuevoEstado === 'cancelado' ? '¿Deseas cancelar este pedido?' : '¿Marcar pedido como completado?');
    
    if (!confirm(confirmMsg)) return;

    try {
        const currentUser = getUser();
        const res = await fetch(`${API_BASE}/pedidos.php?id=${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                estado: nuevoEstado,
                usuario_id: currentUser ? currentUser.id : null
            })
        });
        const result = await res.json();
        if (result.status === 'success') {
            showToast(result.message);
            loadPedidosRecientes();
            if (typeof loadProducts === 'function') loadProducts();
        } else {
            showToast('Error: ' + result.message, 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Error al actualizar el estado del pedido', 'error');
    }
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
        productos: cart.map(it => ({ producto_id: it.id, cantidad: it.qty, precio_unitario: it.price })),
        clientName,
        clientCi,
        clientPhone,
        mapsLink,
        msg
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
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...'; }
    
    let clienteId = data.cliente_id;
    
    // Crear cliente nuevo si aplica guardando su cédula y teléfono
    if (clienteId === 'nuevo') {
        try {
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
            const cliData = await resCli.json();
            if (cliData.status !== 'success') { 
                showToast('Error al registrar cliente: ' + cliData.message, 'error'); 
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fab fa-whatsapp"></i> Confirmar y Enviar'; } 
                return; 
            }
            clienteId = cliData.id;
        } catch (err) { 
            showToast('Error de conexión', 'error'); 
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fab fa-whatsapp"></i> Confirmar y Enviar'; } 
            return; 
        }
    }
    
    // Enviar pedido a la BD
    try {
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
        const result = await res.json();
        if (result.status === 'success') {
            // Abrir WhatsApp con el mensaje
            const waUrl = 'https://wa.me/584121234567?text=' + encodeURIComponent(data.msg);
            window.open(waUrl, '_blank');
            
            showToast('¡Pedido ' + result.codigo + ' creado! Total: $' + parseFloat(result.total).toFixed(2));
            
            // Limpiar
            cart = []; saveCart(); updateCart();
            document.getElementById('orderForm').reset();
            loadPedidosRecientes();
            closeConfirmModal();
            window._pendingOrder = null;
        } else {
            showToast('Error: ' + result.message, 'error');
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fab fa-whatsapp"></i> Confirmar y Enviar'; }
        }
    } catch (err) {
        // En GitHub Pages o sin backend PHP, enviar directamente por WhatsApp
        const waUrl = 'https://wa.me/584121234567?text=' + encodeURIComponent(data.msg);
        window.open(waUrl, '_blank');
        showToast('¡Abriendo WhatsApp para enviar tu pedido!');
        cart = []; saveCart(); updateCart();
        try { document.getElementById('orderForm').reset(); } catch(e){}
        closeConfirmModal();
        window._pendingOrder = null;
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
