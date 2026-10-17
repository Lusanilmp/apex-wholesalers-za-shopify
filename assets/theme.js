/* Apex Wholesalers ZA — Shopify theme behaviour.
   Uses Shopify's own Cart (Ajax) and predictive search endpoints. No external dependencies. */
(function () {
  'use strict';
  var AW = window.AW || {};
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var fmt;
  try { fmt = new Intl.NumberFormat((AW.locale || 'en-ZA').replace('_', '-'), { style: 'currency', currency: AW.currency || 'ZAR' }); } catch (e) { fmt = null; }
  function money(cents) { var v = (Number(cents) || 0) / 100; return fmt ? fmt.format(v) : 'R ' + v.toFixed(2); }
  var toastTimer;
  function toast(msg) { var t = $('#toast'); if (!t) { return; } t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3000); }
  function store(key, val) { try { if (val === undefined) { return JSON.parse(localStorage.getItem(key) || 'null'); } localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* storage unavailable */ } return null; }
  function json(url, opts) { return fetch(url, Object.assign({ headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }, credentials: 'same-origin' }, opts || {})).then(function (r) { return r.json().then(function (d) { if (!r.ok) { throw new Error(d.description || d.message || 'Request failed'); } return d; }); }); }

  /* ---------- Drawers / menu / search overlay ---------- */
  var scrim = $('#scrim'), drawer = $('#cartDrawer'), menu = $('#mobileMenu'), overlay = $('#searchOverlay'), lastFocus = null;
  function lock(on) { document.body.style.overflow = on ? 'hidden' : ''; }
  function anyOpen() { return (drawer && drawer.classList.contains('is-open')) || (menu && menu.classList.contains('is-open')) || (overlay && overlay.classList.contains('is-open')); }
  function after() { if (scrim && !(drawer && drawer.classList.contains('is-open')) && !(menu && menu.classList.contains('is-open'))) { scrim.classList.remove('is-open'); } if (!anyOpen()) { lock(false); } if (lastFocus) { lastFocus.focus(); lastFocus = null; } }
  function openDrawer() { if (!drawer) { return; } lastFocus = document.activeElement; drawer.classList.add('is-open'); drawer.setAttribute('aria-hidden', 'false'); scrim.classList.add('is-open'); lock(true); var c = $('#cartClose'); if (c) { c.focus(); } }
  function closeDrawer() { drawer.classList.remove('is-open'); drawer.setAttribute('aria-hidden', 'true'); after(); }
  function openMenu() { lastFocus = document.activeElement; menu.classList.add('is-open'); scrim.classList.add('is-open'); $('#menuOpen').setAttribute('aria-expanded', 'true'); lock(true); $('#menuClose').focus(); }
  function closeMenu() { menu.classList.remove('is-open'); $('#menuOpen').setAttribute('aria-expanded', 'false'); after(); }
  function openSearch() { lastFocus = document.activeElement; overlay.classList.add('is-open'); lock(true); $('#searchInput').focus(); }
  function closeSearch() { overlay.classList.remove('is-open'); after(); }
  function on(sel, ev, fn) { var el = $(sel); if (el) { el.addEventListener(ev, fn); } }
  on('#cartOpen', 'click', function (e) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || document.body.classList.contains('template-cart')) { return; }
    e.preventDefault(); refreshCart().then(openDrawer);
  });
  on('#cartClose', 'click', closeDrawer);
  on('#menuOpen', 'click', openMenu);
  on('#menuClose', 'click', closeMenu);
  on('#searchOpen', 'click', openSearch);
  on('#searchClose', 'click', closeSearch);
  if (scrim) { scrim.addEventListener('click', function () { if (drawer) { closeDrawer(); } if (menu) { closeMenu(); } }); }
  if (overlay) { overlay.addEventListener('click', function (e) { if (e.target === overlay) { closeSearch(); } }); }
  if (menu) { menu.addEventListener('click', function (e) { if (e.target.closest('a')) { closeMenu(); } }); }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') { return; }
    if (drawer && drawer.classList.contains('is-open')) { closeDrawer(); }
    if (menu && menu.classList.contains('is-open')) { closeMenu(); }
    if (overlay && overlay.classList.contains('is-open')) { closeSearch(); }
  });

  /* ---------- Predictive search ---------- */
  var sTimer, sInput = $('#searchInput'), sOut = $('#searchResults');
  if (sInput && sOut) {
    sInput.addEventListener('input', function () {
      clearTimeout(sTimer);
      var q = sInput.value.trim();
      if (q.length < 2) { sOut.innerHTML = ''; return; }
      sTimer = setTimeout(function () {
        var url = (AW.routes.suggest || '/search/suggest') + '.json?q=' + encodeURIComponent(q) + '&resources[type]=product&resources[limit]=6';
        fetch(url, { headers: { 'Accept': 'application/json' } }).then(function (r) { return r.json(); }).then(function (d) {
          var items = (d.resources && d.resources.results && d.resources.results.products) || [];
          sOut.innerHTML = items.length ? items.map(function (p) {
            return '<a href="' + esc(p.url) + '">' + (p.image ? '<img src="' + esc(p.image) + '" alt="" width="48" height="48" loading="lazy">' : '') + '<span>' + esc(p.title) + '<br><strong>' + (p.price ? money(parseFloat(p.price) * 100) : '') + '</strong></span></a>';
          }).join('') : '<p class="none">' + esc(AW.strings.noResults) + '</p>';
        }).catch(function () { sOut.innerHTML = ''; });
      }, 250);
    });
  }

  /* ---------- Cart (Shopify Ajax API) ---------- */
  var cartCache = null;
  function renderCart(cart) {
    cartCache = cart;
    var badge = $('#cartCount'); if (badge) { badge.textContent = cart.item_count; badge.setAttribute('data-empty', cart.item_count === 0 ? 'true' : 'false'); }
    var body = $('#cartBody'); if (!body) { return; }
    if (!cart.items.length) { body.innerHTML = '<p class="drawer-empty">' + esc(AW.strings.empty) + '</p>'; }
    else {
      body.innerHTML = cart.items.map(function (it) {
        return '<div class="cart-line" data-key="' + esc(it.key) + '">' +
          (it.image ? '<img src="' + esc(it.image) + '" width="64" height="64" alt="' + esc(it.featured_image && it.featured_image.alt || it.product_title) + '" loading="lazy">' : '<span></span>') +
          '<div><h3><a href="' + esc(it.url) + '">' + esc(it.product_title) + '</a></h3>' +
          (it.variant_title ? '<small>' + esc(it.variant_title) + '</small>' : '') +
          '<div class="qty"><button type="button" data-q="-1" aria-label="Decrease quantity">&minus;</button><span aria-live="polite">' + it.quantity + '</span><button type="button" data-q="1" aria-label="Increase quantity">+</button></div><br>' +
          '<button type="button" class="line-remove" data-remove>' + esc(AW.strings.remove) + '</button></div>' +
          '<strong>' + money(it.final_line_price) + '</strong></div>';
      }).join('');
    }
    var st = $('#cartSubtotal'); if (st) { st.textContent = money(cart.total_price); }
    var co = $('#checkoutBtn'); if (co) { co.href = cart.items.length ? AW.routes.checkout : AW.routes.cart; co.setAttribute('aria-disabled', cart.items.length ? 'false' : 'true'); }
  }
  function refreshCart() { return json(AW.routes.cartJson).then(renderCart).catch(function () { /* leave server-rendered state */ }); }
  function addToCart(items) {
    return json(AW.routes.cartAdd, { method: 'POST', body: JSON.stringify({ items: items }) })
      .then(function () { return refreshCart(); }).then(openDrawer);
  }
  function changeLine(key, qty) {
    return json(AW.routes.cartChange, { method: 'POST', body: JSON.stringify({ id: key, quantity: qty }) }).then(renderCart).catch(function (e) { toast(e.message); });
  }
  document.addEventListener('click', function (e) {
    var add = e.target.closest('[data-add]');
    if (add && !add.disabled) {
      e.preventDefault(); add.disabled = true;
      addToCart([{ id: Number(add.getAttribute('data-variant-id')), quantity: 1 }]).catch(function (err) { toast(err.message); }).then(function () { add.disabled = false; });
      return;
    }
    var line = e.target.closest('.cart-line');
    if (line && cartCache) {
      var key = line.getAttribute('data-key'), item = cartCache.items.filter(function (i) { return i.key === key; })[0];
      var q = e.target.closest('[data-q]');
      if (q && item) { changeLine(key, item.quantity + Number(q.getAttribute('data-q'))); }
      if (e.target.closest('[data-remove]')) { changeLine(key, 0); }
    }
  });
  refreshCart();

  /* ---------- Carousels ---------- */
  $$('[data-carousel]').forEach(function (c) {
    var track = $('.track', c), prev = $('.prev', c), next = $('.next', c);
    function step() { var f = track.firstElementChild; return f ? f.getBoundingClientRect().width + 14 : 240; }
    function update() { prev.disabled = track.scrollLeft < 8; next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 8; }
    prev.addEventListener('click', function () { track.scrollBy({ left: -step() * 2, behavior: 'smooth' }); });
    next.addEventListener('click', function () { track.scrollBy({ left: step() * 2, behavior: 'smooth' }); });
    track.addEventListener('scroll', function () { window.requestAnimationFrame(update); }, { passive: true });
    track.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') { track.scrollBy({ left: step(), behavior: 'smooth' }); } if (e.key === 'ArrowLeft') { track.scrollBy({ left: -step(), behavior: 'smooth' }); } });
    window.addEventListener('resize', update); update();
  });

  /* ---------- Wishlist (this browser only — NOT synced across devices) ---------- */
  if (AW.wishlist) {
    var list = store('aw_wishlist') || [];
    var paint = function () { $$('[data-wish]').forEach(function (b) { b.setAttribute('aria-pressed', list.indexOf(b.getAttribute('data-wish')) > -1 ? 'true' : 'false'); }); };
    paint();
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-wish]'); if (!b) { return; }
      var h = b.getAttribute('data-wish'), i = list.indexOf(h);
      if (i > -1) { list.splice(i, 1); } else { list.push(h); }
      store('aw_wishlist', list); paint();
      toast(i === -1 ? 'Saved to this browser’s wishlist (not synced across devices)' : 'Removed from wishlist');
    });
  }

  /* ---------- Product page ---------- */
  var pdp = $('[data-product]');
  if (pdp) {
    var variants = JSON.parse($('#productJson').textContent), form = $('#productForm'), idInput = $('#variantId');
    var addBtn = $('#pdpAdd'), qty = $('#pdpQty'), err = $('#pdpError');
    function selected() { return $$('input[type=radio]:checked', form).sort(function (a, b) { return a.dataset.optionIndex - b.dataset.optionIndex; }).map(function (r) { return r.value; }); }
    function findVariant() {
      var sel = selected(); if (!sel.length) { return variants[0]; }
      return variants.filter(function (v) { return sel.every(function (s, i) { return v['option' + (i + 1)] === s; }); })[0];
    }
    function applyVariant() {
      var v = findVariant();
      if (!v) { addBtn.disabled = true; addBtn.textContent = AW.strings.soldOut; return; }
      idInput.value = v.id;
      var price = money(v.price), was = v.compare_at_price > v.price ? '<s aria-label="Original price">' + money(v.compare_at_price) + '</s>' : '';
      $('#pdpPrice').innerHTML = '<p class="price">' + price + was + '</p>';
      var s = $('#pdpStock'); s.textContent = v.available ? 'In stock' : AW.strings.soldOut; s.classList.toggle('out', !v.available);
      addBtn.disabled = !v.available; addBtn.textContent = v.available ? AW.strings.addToCart : AW.strings.soldOut;
      var sku = $('#pdpSku'); if (sku) { sku.textContent = v.sku || ''; }
      if (window.history && history.replaceState) { history.replaceState({}, '', '?variant=' + v.id); }
      if (v.featured_image && v.featured_image.src) { var m = $('#pdpMainImg'); if (m) { m.removeAttribute('srcset'); m.src = v.featured_image.src; } }
    }
    $$('input[type=radio]', form).forEach(function (r) { r.addEventListener('change', applyVariant); });
    $$('[data-qty]', form).forEach(function (b) { b.addEventListener('click', function () { qty.value = Math.max(1, (parseInt(qty.value, 10) || 1) + Number(b.dataset.qty)); }); });
    $$('[data-thumb]', pdp).forEach(function (t) {
      t.addEventListener('click', function () {
        var m = $('#pdpMainImg'); if (m) { m.removeAttribute('srcset'); m.src = t.dataset.thumb; m.alt = t.dataset.alt; }
        $$('[data-thumb]', pdp).forEach(function (x) { x.removeAttribute('aria-current'); }); t.setAttribute('aria-current', 'true');
      });
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault(); err.textContent = ''; addBtn.disabled = true;
      addToCart([{ id: Number(idInput.value), quantity: Math.max(1, parseInt(qty.value, 10) || 1) }])
        .catch(function (x) { err.textContent = x.message; })
        .then(function () { var v = findVariant(); addBtn.disabled = !(v && v.available); });
    });
  }

  /* ---------- Related products (Shopify recommendations API) ---------- */
  $$('[data-recommendations]').forEach(function (el) {
    fetch(el.dataset.url).then(function (r) { return r.text(); }).then(function (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var rec = doc.querySelector('section'); if (rec) { el.replaceWith(rec); }
    }).catch(function () { /* optional section */ });
  });

  /* ---------- Collection filters / sorting ---------- */
  $$('[data-autosubmit]').forEach(function (el) { el.addEventListener('change', function () { el.form.submit(); }); });

  /* ---------- Newsletter ---------- */
  $$('form.nl-form').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      var email = $('input[type=email]', f), consent = $('[data-consent]', f), msg = $('.form-msg', f);
      var ok = email && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim());
      if (!ok || (consent && !consent.checked)) {
        e.preventDefault();
        if (msg) { msg.className = 'form-msg err'; msg.textContent = !ok ? 'Please enter a valid email address.' : 'Please tick the consent box to subscribe.'; }
        return;
      }
      try { if (window.Shopify && Shopify.analytics && Shopify.analytics.publish) { Shopify.analytics.publish('newsletter_signup', { source: 'homepage' }); } } catch (x) { /* analytics optional */ }
    });
  });

  /* ---------- Scroll to top ---------- */
  var top = $('#toTop');
  if (top) {
    window.addEventListener('scroll', function () { top.classList.toggle('show', window.scrollY > 700); }, { passive: true });
    top.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
  }
})();
