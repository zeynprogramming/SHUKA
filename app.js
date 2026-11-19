const state = {
  user: null,
  categories: [],
  cartCount: 0
};

const MARZER = [
  'Yerevan', 'Aragatsotn', 'Ararat', 'Armavir', 'Gegharkunik',
  'Kotayk', 'Lori', 'Shirak', 'Syunik', 'Tavush', 'Vayots Dzor'
];

async function api(url, opts = {}) {
  const res = await fetch(url, {
    headers: opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    ...opts
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data.error && data.error.message) || 'Request failed';
    const err = new Error(msg);
    err.status = res.status;
    err.code = data.error && data.error.code;
    throw err;
  }
  return data;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatAmd(val) {
  return `${Number(val).toLocaleString('en-US')} AMD`;
}

function navigate(path) {
  history.pushState({}, '', path);
  render();
}

document.addEventListener('click', (e) => {
  const link = e.target.closest('a[data-link]');
  if (link) {
    e.preventDefault();
    navigate(link.getAttribute('href'));
  }
});

window.addEventListener('popstate', render);

document.getElementById('globalSearchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = document.getElementById('globalSearchInput').value.trim();
  navigate(`/products?q=${encodeURIComponent(q)}`);
});

async function refreshSession() {
  const [meRes, catRes] = await Promise.all([api('/api/me'), api('/api/categories')]);
  state.user = meRes.user;
  state.categories = catRes.categories;
  if (state.user) {
    const cart = await api('/api/cart').catch(() => ({ total_items_count: 0 }));
    state.cartCount = cart.total_items_count || 0;
  } else {
    state.cartCount = 0;
  }
  renderHeader();
}

function renderHeader() {
  const catBar = document.getElementById('catBar');
  catBar.innerHTML = `<a href="/products" class="cat-pill" data-link>All Products</a>` +
    state.categories.map(c => `<a href="/products?category=${encodeURIComponent(c.slug)}" class="cat-pill" data-link>${escapeHtml(c.name)}</a>`).join('');

  const nav = document.getElementById('navActions');
  if (!state.user) {
    nav.innerHTML = `
      <a href="/login" class="nav-link" data-link>Log in</a>
      <a href="/register" class="nav-link nav-pill-accent" data-link>Create account</a>
    `;
  } else {
    const sellerLink = state.user.store_name
      ? `<a href="/seller" class="nav-link nav-pill-accent" data-link>Seller hub (${escapeHtml(state.user.store_name)})</a>`
      : `<a href="/seller/activate" class="nav-link nav-pill-accent" data-link>Sell on Shuka</a>`;
    nav.innerHTML = `
      <a href="/orders" class="nav-link" data-link>My orders</a>
      ${sellerLink}
      <a href="/cart" class="nav-link" data-link>Cart <span class="cart-badge">${state.cartCount}</span></a>
      <button id="logoutBtn" class="nav-btn">Sign out (${escapeHtml(state.user.name.split(' ')[0])})</button>
    `;
    document.getElementById('logoutBtn').onclick = async () => {
      await api('/api/auth/logout', { method: 'POST' });
      await refreshSession();
      navigate('/');
    };
  }
}

function productCardHtml(p) {
  const img = p.main_image ? p.main_image.replace('_large.webp', '_thumb.webp') : '';
  return `
    <article class="product-card">
      <a href="/products/${p.id}" class="product-img-wrap" data-link>
        <img src="${escapeHtml(img)}" alt="${escapeHtml(p.title)}" loading="lazy" onerror="this.src='${escapeHtml(p.main_image || '')}'" />
      </a>
      <div class="product-card-body">
        <div>
          <div class="store-label">${escapeHtml(p.category_name || '')} • ${escapeHtml(p.seller_store_name || '')}</div>
          <h3 class="product-title"><a href="/products/${p.id}" data-link>${escapeHtml(p.title)}</a></h3>
        </div>
        <div class="price-row">
          <span class="price-amd">${formatAmd(p.price_amd)}</span>
          <span class="rating-pill">★ ${Number(p.rating_avg || 0).toFixed(1)} (${p.rating_count || 0})</span>
        </div>
      </div>
    </article>
  `;
}

async function renderHome(app) {
  const data = await api('/api/products?sort=newest&page=1');
  app.innerHTML = `
    <section class="hero-banner">
      <div>
        <h1>Local marketplace across Armenia</h1>
        <p>Discover everyday essentials, crafts, and electronics from local Armenian sellers with simple cash-on-delivery across Yerevan and all marzer.</p>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <a href="/products" class="btn btn-light" data-link>Browse catalog</a>
        <a href="${state.user && state.user.store_name ? '/seller' : '/seller/activate'}" class="btn btn-primary" data-link>Start selling</a>
      </div>
    </section>

    <div class="section-head">
      <h2 class="section-title">Shop by category</h2>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px">
      ${state.categories.map(c => `<a class="btn btn-sm" href="/products?category=${encodeURIComponent(c.slug)}" data-link>${escapeHtml(c.name)}</a>`).join('')}
    </div>

    <div class="section-head">
      <h2 class="section-title">Newest arrivals</h2>
      <a href="/products?sort=newest" class="muted" style="text-decoration:none;font-weight:600" data-link>View all →</a>
    </div>
    <div class="products-grid">${data.items.map(productCardHtml).join('')}</div>
  `;
}

async function renderCatalog(app, searchParams) {
  const q = searchParams.get('q') || '';
  const category = searchParams.get('category') || '';
  const minPrice = searchParams.get('minPrice') || '';
  const maxPrice = searchParams.get('maxPrice') || '';
  const sort = searchParams.get('sort') || 'newest';
  const page = searchParams.get('page') || '1';

  document.getElementById('globalSearchInput').value = q;
  const qs = new URLSearchParams({ q, category, minPrice, maxPrice, sort, page }).toString();
  const data = await api(`/api/products?${qs}`);

  app.innerHTML = `
    <form class="surface" id="filterForm">
      <div class="form-grid-2" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));align-items:end">
        <div class="field" style="margin-bottom:0">
          <label>Category</label>
          <select name="category">
            <option value="">All Categories</option>
            ${state.categories.map(c => `<option value="${escapeHtml(c.slug)}" ${category === c.slug ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field" style="margin-bottom:0">
          <label>Min Price (AMD)</label>
          <input type="number" name="minPrice" value="${escapeHtml(minPrice)}" placeholder="0" />
        </div>
        <div class="field" style="margin-bottom:0">
          <label>Max Price (AMD)</label>
          <input type="number" name="maxPrice" value="${escapeHtml(maxPrice)}" placeholder="Any" />
        </div>
        <div class="field" style="margin-bottom:0">
          <label>Sort by</label>
          <select name="sort">
            <option value="newest" ${sort === 'newest' ? 'selected' : ''}>Newest</option>
            <option value="price_asc" ${sort === 'price_asc' ? 'selected' : ''}>Price: Low to High</option>
            <option value="price_desc" ${sort === 'price_desc' ? 'selected' : ''}>Price: High to Low</option>
            <option value="rating" ${sort === 'rating' ? 'selected' : ''}>Highest Rating</option>
          </select>
        </div>
        <div style="display:flex;gap:8px">
          <button type="submit" class="btn btn-primary" style="flex:1">Filter</button>
          <a href="/products" class="btn" data-link>Reset</a>
        </div>
      </div>
    </form>

    <div class="section-head">
      <h2 class="section-title">${q ? `Results for “${escapeHtml(q)}”` : 'Marketplace Catalog'}</h2>
      <span class="muted"><strong>${data.total}</strong> item(s)</span>
    </div>

    ${data.items.length === 0
      ? `<div class="surface" style="text-align:center;padding:40px 20px"><p class="muted" style="margin-top:0">No products matched your search or filters.</p><a href="/products" class="btn btn-primary" data-link>Show all products</a></div>`
      : `<div class="products-grid">${data.items.map(productCardHtml).join('')}</div>`
    }

    <div class="row-between" style="margin-top:24px">
      <span class="muted">Page ${data.page} of ${data.totalPages}</span>
      <div style="display:flex;gap:8px">
        ${data.page > 1 ? `<button class="btn btn-sm" id="prevPage">← Previous</button>` : ''}
        ${data.page < data.totalPages ? `<button class="btn btn-sm" id="nextPage">Next →</button>` : ''}
      </div>
    </div>
  `;

  document.getElementById('filterForm').onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const next = new URLSearchParams();
    if (q) next.set('q', q);
    if (fd.get('category')) next.set('category', fd.get('category'));
    if (fd.get('minPrice')) next.set('minPrice', fd.get('minPrice'));
    if (fd.get('maxPrice')) next.set('maxPrice', fd.get('maxPrice'));
    if (fd.get('sort')) next.set('sort', fd.get('sort'));
    navigate(`/products?${next.toString()}`);
  };
  if (document.getElementById('prevPage')) {
    document.getElementById('prevPage').onclick = () => {
      const next = new URLSearchParams(searchParams);
      next.set('page', String(data.page - 1));
      navigate(`/products?${next.toString()}`);
    };
  }
  if (document.getElementById('nextPage')) {
    document.getElementById('nextPage').onclick = () => {
      const next = new URLSearchParams(searchParams);
      next.set('page', String(data.page + 1));
      navigate(`/products?${next.toString()}`);
    };
  }
}

async function renderProductDetail(app, id) {
  const { product, images, reviews } = await api(`/api/products/${id}`);
  const stockBadge = product.stock === 0
    ? '<span class="status-chip chip-cancelled">Out of stock</span>'
    : product.stock <= 3
      ? `<span class="status-chip chip-confirmed">Only ${product.stock} left</span>`
      : '<span class="status-chip chip-delivered">In stock</span>';

  app.innerHTML = `
    <div class="surface two-col">
      <div>
        <img id="mainProdImg" src="${escapeHtml(images[0]?.file_path || '')}" alt="${escapeHtml(product.title)}" class="gallery-main" />
        ${images.length > 1 ? `
          <div class="gallery-thumbs">
            ${images.map(im => `<img src="${escapeHtml(im.file_path)}" alt="Thumbnail" onclick="document.getElementById('mainProdImg').src=this.src" />`).join('')}
          </div>
        ` : ''}
      </div>
      <div>
        <div class="muted">${escapeHtml(product.category_name)} • Sold by <strong>${escapeHtml(product.seller_store_name)}</strong></div>
        <h1 style="margin:8px 0 10px;font-size:1.7rem;letter-spacing:-0.02em">${escapeHtml(product.title)}</h1>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
          <span class="rating-pill">★ ${Number(product.rating_avg).toFixed(1)} (${product.rating_count} reviews)</span>
          ${stockBadge}
        </div>
        <div style="font-size:1.65rem;font-weight:800;margin-bottom:16px">${formatAmd(product.price_amd)}</div>
        <p style="color:var(--text-secondary);margin-top:0">${escapeHtml(product.description)}</p>
        <div id="prodMsg"></div>
        ${product.stock > 0 ? `
          <div style="display:flex;gap:10px;align-items:center;margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
            <input type="number" id="qtyInput" value="1" min="1" max="${product.stock}" style="width:86px;padding:10px;border:1px solid var(--border-strong);border-radius:var(--radius-sm);font-size:0.95rem" />
            <button class="btn btn-primary" id="addToCartBtn" style="flex:1;max-width:240px">Add to cart</button>
          </div>
        ` : ''}
      </div>
    </div>

    <div class="surface">
      <h3 style="margin-top:0">Customer reviews (${reviews.length})</h3>
      ${reviews.length === 0 ? '<p class="muted" style="margin-bottom:0">No reviews yet for this product.</p>' : reviews.map(r => `
        <div style="border-top:1px solid var(--border);padding:14px 0">
          <div class="row-between">
            <strong>${escapeHtml(r.buyer_name)}</strong>
            <span class="rating-pill">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
          </div>
          <div class="muted" style="font-size:0.8rem;margin-top:2px">${new Date(r.created_at).toLocaleDateString()}</div>
          <p style="margin:8px 0 0;color:var(--text-secondary)">${escapeHtml(r.body)}</p>
        </div>
      `).join('')}
    </div>
  `;

  if (document.getElementById('addToCartBtn')) {
    document.getElementById('addToCartBtn').onclick = async () => {
      if (!state.user) return navigate('/login');
      const qty = Number(document.getElementById('qtyInput').value);
      try {
        const cart = await api(`/api/cart/items/${product.id}`, {
          method: 'PUT',
          body: JSON.stringify({ quantity: qty })
        });
        state.cartCount = cart.total_items_count;
        renderHeader();
        document.getElementById('prodMsg').innerHTML = `<div class="notice notice-ok" style="margin-top:14px">Added to cart. <a href="/cart" style="font-weight:700" data-link>Go to cart →</a></div>`;
      } catch (err) {
        document.getElementById('prodMsg').innerHTML = `<div class="notice notice-error" style="margin-top:14px">${escapeHtml(err.message)}</div>`;
      }
    };
  }
}

async function renderCart(app) {
  if (!state.user) return navigate('/login');
  const cart = await api('/api/cart');
  state.cartCount = cart.total_items_count;
  renderHeader();

  if (cart.groups.length === 0) {
    app.innerHTML = `<div class="surface" style="text-align:center;padding:44px 20px"><h2 style="margin-top:0">Your cart is empty</h2><p class="muted">Browse products across Armenian sellers to get started.</p><a href="/products" class="btn btn-primary" data-link>Explore products</a></div>`;
    return;
  }

  app.innerHTML = `
    <div class="section-head"><h2 class="section-title">Shopping cart</h2></div>
    <div id="cartErr"></div>
    ${cart.groups.map(g => `
      <div class="surface">
        <div class="row-between" style="padding-bottom:12px;margin-bottom:12px;border-bottom:1px solid var(--border)">
          <strong>Seller: ${escapeHtml(g.seller_store_name)}</strong>
          <span>Subtotal: <strong>${formatAmd(g.subtotal_amd)}</strong></span>
        </div>
        ${g.items.map(it => `
          <div class="row-between" style="padding:10px 0;border-bottom:1px solid var(--surface-subtle)">
            <div>
              <a href="/products/${it.product_id}" style="font-weight:600;text-decoration:none" data-link>${escapeHtml(it.title)}</a>
              <div class="muted">${formatAmd(it.current_price_amd)} each</div>
              ${it.price_changed ? `<div class="notice notice-warn" style="margin:6px 0 0;padding:6px 10px">Price updated from ${formatAmd(it.price_when_added)} to ${formatAmd(it.current_price_amd)}. Update quantity to accept.</div>` : ''}
              ${it.out_of_stock ? `<div class="notice notice-error" style="margin:6px 0 0;padding:6px 10px">Out of stock. Please remove this item.</div>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <input type="number" min="1" max="${it.stock}" value="${it.quantity}" data-pid="${it.product_id}" class="cartQtyInput" style="width:74px;padding:8px;border:1px solid var(--border-strong);border-radius:var(--radius-sm)" />
              <button class="btn btn-sm removeCartBtn" data-pid="${it.product_id}">Remove</button>
            </div>
          </div>
        `).join('')}
      </div>
    `).join('')}
    <div class="surface row-between">
      <div>
        <div class="muted">Cash on delivery available</div>
        <div style="font-size:1.35rem;font-weight:800">Grand total: ${formatAmd(cart.grand_total_amd)}</div>
      </div>
      <a href="/checkout" class="btn btn-primary" data-link>Proceed to checkout →</a>
    </div>
  `;

  document.querySelectorAll('.cartQtyInput').forEach(inp => {
    inp.onchange = async () => {
      try {
        await api(`/api/cart/items/${inp.dataset.pid}`, {
          method: 'PUT',
          body: JSON.stringify({ quantity: Number(inp.value) })
        });
        renderCart(app);
      } catch (err) {
        document.getElementById('cartErr').innerHTML = `<div class="notice notice-error">${escapeHtml(err.message)}</div>`;
      }
    };
  });

  document.querySelectorAll('.removeCartBtn').forEach(btn => {
    btn.onclick = async () => {
      await api(`/api/cart/items/${btn.dataset.pid}`, { method: 'DELETE' });
      renderCart(app);
    };
  });
}

async function renderCheckout(app) {
  if (!state.user) return navigate('/login');
  const [cart, addrRes] = await Promise.all([api('/api/cart'), api('/api/orders/last-address')]);
  if (cart.groups.length === 0) return navigate('/cart');

  const prev = addrRes.address || {
    recipient: state.user.name,
    phone: state.user.phone,
    region: 'Yerevan',
    city: '',
    street: '',
    apartment: '',
    note: ''
  };
  const requestKey = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random()}`;

  app.innerHTML = `
    <div class="section-head"><h2 class="section-title">Checkout</h2></div>
    <div id="checkoutErr"></div>
    <div class="two-col">
      <form class="surface" id="checkoutForm">
        <h3 style="margin-top:0">Delivery details (Armenia)</h3>
        <div class="form-grid-2">
          <div class="field"><label>Recipient name</label><input name="recipient" value="${escapeHtml(prev.recipient)}" required /></div>
          <div class="field"><label>Phone number</label><input name="phone" value="${escapeHtml(prev.phone)}" required /></div>
        </div>
        <div class="form-grid-2">
          <div class="field">
            <label>Region (Marz)</label>
            <select name="region" required>
              ${MARZER.map(m => `<option value="${m}" ${prev.region === m ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>City or village</label><input name="city" value="${escapeHtml(prev.city)}" required /></div>
        </div>
        <div class="form-grid-2">
          <div class="field"><label>Street & building</label><input name="street" value="${escapeHtml(prev.street)}" required /></div>
          <div class="field"><label>Apartment</label><input name="apartment" value="${escapeHtml(prev.apartment)}" /></div>
        </div>
        <div class="field"><label>Delivery note (optional)</label><textarea name="note" rows="2">${escapeHtml(prev.note)}</textarea></div>
        <div class="notice notice-ok" style="margin-bottom:16px">Payment method: <strong>Cash on delivery (AMD)</strong></div>
        <button type="submit" id="placeOrderBtn" class="btn btn-primary" style="width:100%">Place order • ${formatAmd(cart.grand_total_amd)}</button>
      </form>

      <div class="surface">
        <h3 style="margin-top:0">Items by seller</h3>
        ${cart.groups.map(g => `
          <div style="margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--border)">
            <div style="font-weight:700;margin-bottom:6px">${escapeHtml(g.seller_store_name)}</div>
            ${g.items.map(it => `<div class="row-between muted" style="padding:3px 0"><span>${escapeHtml(it.title)} × ${it.quantity}</span><span>${formatAmd(it.line_total_amd)}</span></div>`).join('')}
          </div>
        `).join('')}
        <div class="row-between" style="font-size:1.15rem;font-weight:800">
          <span>Cash to pay on delivery</span>
          <span>${formatAmd(cart.grand_total_amd)}</span>
        </div>
      </div>
    </div>
  `;

  document.getElementById('checkoutForm').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('placeOrderBtn');
    btn.disabled = true;
    const payload = Object.fromEntries(new FormData(e.target).entries());
    payload.request_key = requestKey;

    try {
      const { order } = await api('/api/orders', { method: 'POST', body: JSON.stringify(payload) });
      state.cartCount = 0;
      renderHeader();
      navigate(`/orders/${order.id}?confirmed=1`);
    } catch (err) {
      btn.disabled = false;
      document.getElementById('checkoutErr').innerHTML = `<div class="notice notice-error">${escapeHtml(err.message)}</div>`;
    }
  };
}

async function renderBuyerOrders(app) {
  if (!state.user) return navigate('/login');
  const { orders } = await api('/api/orders');
  app.innerHTML = `
    <div class="section-head"><h2 class="section-title">My orders</h2></div>
    ${orders.length === 0 ? '<div class="surface"><p class="muted" style="margin:0">You have not placed any orders yet.</p></div>' : orders.map(o => `
      <div class="surface row-between">
        <div>
          <a href="/orders/${o.id}" style="font-size:1.05rem;font-weight:700;text-decoration:none" data-link>Order #${o.id}</a>
          <div class="muted">${new Date(o.created_at).toLocaleString()} • ${escapeHtml(o.region)}, ${escapeHtml(o.city)}</div>
          <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
            ${o.seller_orders.map(so => `<span class="status-chip chip-${so.status}">${escapeHtml(so.seller_store_name)}: ${so.status}</span>`).join('')}
          </div>
        </div>
        <div style="text-align:right">
          <div style="font-size:1.1rem;font-weight:800">${formatAmd(o.total_amd)}</div>
          <a href="/orders/${o.id}" class="btn btn-sm" style="margin-top:8px" data-link>View details</a>
        </div>
      </div>
    `).join('')}
  `;
}

async function renderBuyerOrderDetail(app, id, isConfirmed) {
  if (!state.user) return navigate('/login');
  const { order } = await api(`/api/orders/${id}`);
  app.innerHTML = `
    ${isConfirmed ? `<div class="notice notice-ok">Order #${order.id} placed successfully. Please prepare cash in AMD upon delivery.</div>` : ''}
    <div class="surface">
      <div class="row-between">
        <h2 style="margin:0">Order #${order.id}</h2>
        <div style="font-size:1.25rem;font-weight:800">${formatAmd(order.total_amd)}</div>
      </div>
      <p class="muted" style="margin:8px 0 0">Recipient: <strong>${escapeHtml(order.recipient)}</strong> (${escapeHtml(order.phone)}) • ${escapeHtml(order.region)}, ${escapeHtml(order.city)}, ${escapeHtml(order.street)} ${escapeHtml(order.apartment)}</p>
      ${order.note ? `<p class="muted" style="margin:4px 0 0">Note: ${escapeHtml(order.note)}</p>` : ''}
    </div>
    <div id="orderDetailMsg"></div>
    ${order.seller_orders.map(so => `
      <div class="surface">
        <div class="row-between" style="padding-bottom:10px;border-bottom:1px solid var(--border)">
          <div>
            <strong>${escapeHtml(so.seller_store_name)}</strong>
            <span class="status-chip chip-${so.status}" style="margin-left:8px">${so.status}</span>
          </div>
          <div>
            ${(so.status === 'placed' || so.status === 'confirmed') ? `<button class="btn btn-danger btn-sm cancelPartBtn" data-soid="${so.id}">Cancel order</button>` : ''}
          </div>
        </div>
        <div style="margin:12px 0">
          ${so.items.map(it => `
            <div class="row-between" style="padding:8px 0;border-bottom:1px solid var(--surface-subtle)">
              <span><strong>${escapeHtml(it.title)}</strong> × ${it.quantity} <span class="muted">(${formatAmd(it.unit_price_amd)} each)</span></span>
              <div>
                ${so.status === 'delivered' && !it.has_reviewed ? `<button class="btn btn-primary btn-sm openReviewBtn" data-pid="${it.product_id}" data-title="${escapeHtml(it.title)}">Write review</button>` : ''}
                ${it.has_reviewed ? `<span class="muted">Reviewed ✓</span>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
        <div class="muted" style="font-size:0.82rem">
          <strong>Status history:</strong> ${so.history.map(h => `${h.to_status} (${new Date(h.created_at).toLocaleString()})`).join(' → ')}
        </div>
      </div>
    `).join('')}
    <div id="reviewModalArea"></div>
  `;

  document.querySelectorAll('.cancelPartBtn').forEach(btn => {
    btn.onclick = async () => {
      try {
        await api(`/api/orders/${order.id}/sellers/${btn.dataset.soid}/cancel`, { method: 'POST' });
        renderBuyerOrderDetail(app, id, false);
      } catch (err) {
        document.getElementById('orderDetailMsg').innerHTML = `<div class="notice notice-error">${escapeHtml(err.message)}</div>`;
      }
    };
  });

  document.querySelectorAll('.openReviewBtn').forEach(btn => {
    btn.onclick = () => {
      document.getElementById('reviewModalArea').innerHTML = `
        <form class="surface" id="reviewForm" style="max-width:540px">
          <h3 style="margin-top:0">Review “${escapeHtml(btn.dataset.title)}”</h3>
          <div class="field">
            <label>Rating</label>
            <select name="rating"><option value="5">5 ★</option><option value="4">4 ★</option><option value="3">3 ★</option><option value="2">2 ★</option><option value="1">1 ★</option></select>
          </div>
          <div class="field"><label>Your feedback</label><textarea name="body" rows="3" required></textarea></div>
          <button type="submit" class="btn btn-primary">Submit review</button>
        </form>
      `;
      document.getElementById('reviewForm').onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
          await api(`/api/products/${btn.dataset.pid}/reviews`, {
            method: 'POST',
            body: JSON.stringify({ rating: Number(fd.get('rating')), body: fd.get('body') })
          });
          renderBuyerOrderDetail(app, id, false);
        } catch (err) {
          document.getElementById('orderDetailMsg').innerHTML = `<div class="notice notice-error">${escapeHtml(err.message)}</div>`;
        }
      };
    };
  });
}

async function renderAuth(app, mode) {
  app.innerHTML = `
    <form class="surface" id="authForm" style="max-width:430px;margin:24px auto">
      <h2 style="margin-top:0">${mode === 'login' ? 'Welcome back' : 'Create your Shuka account'}</h2>
      <div id="authErr"></div>
      ${mode === 'register' ? `
        <div class="field"><label>Full name</label><input name="name" required /></div>
        <div class="field"><label>Phone number</label><input name="phone" placeholder="+374..." required /></div>
      ` : ''}
      <div class="field"><label>Email</label><input type="email" name="email" required /></div>
      <div class="field"><label>Password</label><input type="password" name="password" required /></div>
      <button type="submit" class="btn btn-primary" style="width:100%">${mode === 'login' ? 'Sign in' : 'Create account'}</button>
    </form>
  `;
  document.getElementById('authForm').onsubmit = async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    try {
      await api(`/api/auth/${mode}`, { method: 'POST', body: JSON.stringify(payload) });
      await refreshSession();
      navigate('/');
    } catch (err) {
      document.getElementById('authErr').innerHTML = `<div class="notice notice-error">${escapeHtml(err.message)}</div>`;
    }
  };
}

async function renderSellerActivate(app) {
  if (!state.user) return navigate('/login');
  app.innerHTML = `
    <form class="surface" id="activateForm" style="max-width:460px;margin:24px auto">
      <h2 style="margin-top:0">Open your store on Shuka</h2>
      <p class="muted">Enter your store name and contact phone to start listing products right away.</p>
      <div id="actErr"></div>
      <div class="field"><label>Store name</label><input name="store_name" required /></div>
      <div class="field"><label>Business phone</label><input name="phone" value="${escapeHtml(state.user.phone)}" required /></div>
      <button type="submit" class="btn btn-primary" style="width:100%">Activate seller store</button>
    </form>
  `;
  document.getElementById('activateForm').onsubmit = async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    try {
      await api('/api/seller/activate', { method: 'POST', body: JSON.stringify(payload) });
      await refreshSession();
      navigate('/seller');
    } catch (err) {
      document.getElementById('actErr').innerHTML = `<div class="notice notice-error">${escapeHtml(err.message)}</div>`;
    }
  };
}

async function renderSellerDashboard(app, subPath) {
  if (!state.user || !state.user.store_name) return navigate('/seller/activate');

  if (subPath === '/seller/products/new' || subPath.startsWith('/seller/products/edit/')) {
    const editId = subPath.startsWith('/seller/products/edit/') ? subPath.split('/').pop() : null;
    let existing = { title: '', category_id: state.categories[0]?.id || 1, description: '', price_amd: '', stock: 1, is_published: 1 };
    let images = [];
    if (editId) {
      const data = await api(`/api/seller/products/${editId}`);
      existing = data.product;
      images = data.images;
    }

    app.innerHTML = `
      <div class="surface" style="max-width:660px;margin:0 auto">
        <h2 style="margin-top:0">${editId ? 'Edit product' : 'Add new product'}</h2>
        <div id="prodFormErr"></div>
        <form id="sellerProdForm">
          <div class="field"><label>Title</label><input name="title" value="${escapeHtml(existing.title)}" required /></div>
          <div class="field">
            <label>Category</label>
            <select name="category_id">
              ${state.categories.map(c => `<option value="${c.id}" ${Number(existing.category_id) === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Description</label><textarea name="description" rows="3" required>${escapeHtml(existing.description)}</textarea></div>
          <div class="form-grid-2">
            <div class="field"><label>Price (AMD)</label><input type="number" name="price_amd" min="1" value="${escapeHtml(existing.price_amd)}" required /></div>
            <div class="field"><label>Stock</label><input type="number" name="stock" min="0" value="${escapeHtml(existing.stock)}" required /></div>
          </div>
          <div class="field">
            <label>Product photos (up to 5 total)</label>
            <input type="file" id="prodImagesInput" accept="image/jpeg,image/png,image/webp" multiple />
          </div>
          ${images.length > 0 ? `
            <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap">
              ${images.map(im => `
                <div style="text-align:center">
                  <img src="${escapeHtml(im.file_path)}" style="width:76px;height:76px;object-fit:cover;display:block;border-radius:8px;border:1px solid var(--border)" />
                  <button type="button" class="btn btn-sm delImgBtn" data-imgid="${im.id}" style="margin-top:6px">Remove</button>
                </div>
              `).join('')}
            </div>
          ` : ''}
          <div style="display:flex;gap:10px">
            <button type="submit" class="btn btn-primary">Save product</button>
            <a href="/seller" class="btn" data-link>Cancel</a>
          </div>
        </form>
      </div>
    `;

    document.querySelectorAll('.delImgBtn').forEach(btn => {
      btn.onclick = async () => {
        await api(`/api/seller/products/${editId}/images/${btn.dataset.imgid}`, { method: 'DELETE' });
        renderSellerDashboard(app, subPath);
      };
    });

    document.getElementById('sellerProdForm').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        title: fd.get('title'),
        category_id: Number(fd.get('category_id')),
        description: fd.get('description'),
        price_amd: Number(fd.get('price_amd')),
        stock: Number(fd.get('stock'))
      };
      try {
        let prodId = editId;
        if (editId) {
          await api(`/api/seller/products/${editId}`, { method: 'PATCH', body: JSON.stringify(payload) });
        } else {
          const created = await api('/api/seller/products', { method: 'POST', body: JSON.stringify(payload) });
          prodId = created.product.id;
        }
        const files = document.getElementById('prodImagesInput').files;
        if (files && files.length > 0) {
          const imgFd = new FormData();
          for (const f of files) imgFd.append('images', f);
          await api(`/api/seller/products/${prodId}/images`, { method: 'POST', body: imgFd });
        }
        navigate('/seller');
      } catch (err) {
        document.getElementById('prodFormErr').innerHTML = `<div class="notice notice-error">${escapeHtml(err.message)}</div>`;
      }
    };
    return;
  }

  if (subPath.startsWith('/seller/orders/')) {
    const soId = subPath.split('/').pop();
    const { order } = await api(`/api/seller/orders/${soId}`);
    const nextMoves = {
      placed: ['confirmed', 'cancelled'],
      confirmed: ['shipped', 'cancelled'],
      shipped: ['delivered'],
      delivered: [],
      cancelled: []
    }[order.status] || [];

    app.innerHTML = `
      <div class="surface">
        <div class="row-between">
          <h2 style="margin:0">Seller Order #${order.id} <span class="muted" style="font-weight:500">(Buyer Order #${order.order_id})</span></h2>
          <span class="status-chip chip-${order.status}">${order.status}</span>
        </div>
        <p style="margin:14px 0 6px"><strong>Recipient:</strong> ${escapeHtml(order.recipient)} • <strong>Phone:</strong> ${escapeHtml(order.phone)}</p>
        <p style="margin:0 0 6px"><strong>Delivery address:</strong> ${escapeHtml(order.region)}, ${escapeHtml(order.city)}, ${escapeHtml(order.street)} ${escapeHtml(order.apartment)}</p>
        ${order.note ? `<p class="muted" style="margin:0 0 10px"><strong>Note:</strong> ${escapeHtml(order.note)}</p>` : ''}
        <div style="font-size:1.25rem;font-weight:800;margin:12px 0">Cash to collect: ${formatAmd(order.subtotal_amd)}</div>
        <div id="sellerOrderErr"></div>
        <div style="display:flex;gap:10px;margin:14px 0 20px;flex-wrap:wrap">
          ${nextMoves.map(m => `<button class="btn ${m === 'cancelled' ? 'btn-danger' : 'btn-primary'} moveStatusBtn" data-to="${m}">Move to ${m}</button>`).join('')}
          <a href="/seller" class="btn" data-link>← Back to dashboard</a>
        </div>
        <h4 style="margin-bottom:8px">Order items</h4>
        ${order.items.map(it => `<div class="row-between" style="padding:8px 0;border-bottom:1px solid var(--surface-subtle)"><span>${escapeHtml(it.title)} × ${it.quantity}</span><strong>${formatAmd(it.unit_price_amd * it.quantity)}</strong></div>`).join('')}
        <div class="muted" style="margin-top:16px;font-size:0.82rem">
          <strong>Status history:</strong> ${order.history.map(h => `${h.to_status} (${new Date(h.created_at).toLocaleString()})`).join(' → ')}
        </div>
      </div>
    `;

    document.querySelectorAll('.moveStatusBtn').forEach(btn => {
      btn.onclick = async () => {
        try {
          await api(`/api/seller/orders/${order.id}/status`, {
            method: 'POST',
            body: JSON.stringify({ to: btn.dataset.to })
          });
          renderSellerDashboard(app, subPath);
        } catch (err) {
          document.getElementById('sellerOrderErr').innerHTML = `<div class="notice notice-error">${escapeHtml(err.message)}</div>`;
        }
      };
    });
    return;
  }

  const [overview, prodRes, ordRes] = await Promise.all([
    api('/api/seller/overview'),
    api('/api/seller/products'),
    api('/api/seller/orders')
  ]);

  app.innerHTML = `
    <div class="section-head">
      <h2 class="section-title">${escapeHtml(state.user.store_name)} — Seller Dashboard</h2>
      <a href="/seller/products/new" class="btn btn-primary" data-link>+ Add product</a>
    </div>

    <div class="kpi-grid">
      <div class="surface" style="margin-bottom:0"><div class="muted">To confirm</div><div class="kpi-value">${overview.to_confirm}</div></div>
      <div class="surface" style="margin-bottom:0"><div class="muted">To ship</div><div class="kpi-value">${overview.to_ship}</div></div>
      <div class="surface" style="margin-bottom:0"><div class="muted">Delivered revenue (30d)</div><div class="kpi-value">${formatAmd(overview.revenue_30d_amd)}</div></div>
    </div>

    <div class="surface">
      <h3 style="margin-top:0">Incoming orders</h3>
      ${ordRes.orders.length === 0 ? '<p class="muted" style="margin-bottom:0">No incoming orders yet.</p>' : `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Order</th><th>Buyer</th><th>Destination</th><th>Cash</th><th>Status</th><th></th></tr></thead>
            <tbody>
              ${ordRes.orders.map(o => `
                <tr>
                  <td><strong>#${o.id}</strong></td>
                  <td>${escapeHtml(o.recipient)}<br/><span class="muted">${escapeHtml(o.phone)}</span></td>
                  <td>${escapeHtml(o.region)}, ${escapeHtml(o.city)}</td>
                  <td><strong>${formatAmd(o.subtotal_amd)}</strong></td>
                  <td><span class="status-chip chip-${o.status}">${o.status}</span></td>
                  <td style="text-align:right"><a href="/seller/orders/${o.id}" class="btn btn-sm" data-link>Manage</a></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>

    <div class="surface">
      <h3 style="margin-top:0">Your products (${prodRes.products.length})</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Product</th><th>Price</th><th>Stock</th><th>Sold</th><th>Visibility</th><th>Actions</th></tr></thead>
          <tbody>
            ${prodRes.products.map(p => `
              <tr>
                <td><strong>${escapeHtml(p.title)}</strong></td>
                <td>${formatAmd(p.price_amd)}</td>
                <td>${p.stock}</td>
                <td>${p.units_sold}</td>
                <td>${p.is_published ? '<span class="status-chip chip-delivered">Published</span>' : '<span class="status-chip">Hidden</span>'}</td>
                <td>
                  <div style="display:flex;gap:6px">
                    <a href="/seller/products/edit/${p.id}" class="btn btn-sm" data-link>Edit</a>
                    <button class="btn btn-sm togglePubBtn" data-pid="${p.id}" data-pub="${p.is_published ? 0 : 1}">${p.is_published ? 'Unpublish' : 'Publish'}</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.querySelectorAll('.togglePubBtn').forEach(btn => {
    btn.onclick = async () => {
      await api(`/api/seller/products/${btn.dataset.pid}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_published: Number(btn.dataset.pub) })
      });
      renderSellerDashboard(app, '/seller');
    };
  });
}

async function render() {
  const app = document.getElementById('app');
  const path = window.location.pathname;
  const searchParams = new URLSearchParams(window.location.search);

  try {
    if (path === '/') return await renderHome(app);
    if (path === '/products') return await renderCatalog(app, searchParams);
    if (path.startsWith('/products/')) return await renderProductDetail(app, path.split('/').pop());
    if (path === '/cart') return await renderCart(app);
    if (path === '/checkout') return await renderCheckout(app);
    if (path === '/orders') return await renderBuyerOrders(app);
    if (path.startsWith('/orders/')) return await renderBuyerOrderDetail(app, path.split('/').pop(), searchParams.get('confirmed') === '1');
    if (path === '/login') return await renderAuth(app, 'login');
    if (path === '/register') return await renderAuth(app, 'register');
    if (path === '/seller/activate') return await renderSellerActivate(app);
    if (path === '/seller' || path.startsWith('/seller/')) return await renderSellerDashboard(app, path);
    app.innerHTML = '<div class="surface"><h2 style="margin-top:0">Page not found</h2></div>';
  } catch (err) {
    app.innerHTML = `<div class="notice notice-error">${escapeHtml(err.message)}</div>`;
  }
}

refreshSession().then(render);
