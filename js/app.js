// Shared helpers + header/footer used on every page.
const VAT_RATE = 0.05; // UAE VAT 5% (the database trigger uses the same rate)
const OCCASIONS = ["Eid", "Ramadan", "Wedding", "Birthday", "Graduation", "Housewarming", "Anniversary"];
const EMIRATES = ["Abu Dhabi", "Dubai", "Sharjah", "Ajman", "Umm Al Quwain", "Ras Al Khaimah", "Fujairah"];

const fmt = (n) =>
  "AED " + Number(n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Escape any text that came from the database / the user before putting it in innerHTML (stops XSS).
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function toast(message, type = "info") {
  let wrap = document.querySelector(".toast-wrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "toast-wrap";
    wrap.setAttribute("aria-live", "polite");
    document.body.appendChild(wrap);
  }
  const t = document.createElement("div");
  t.className = "toast " + type;
  t.textContent = message;
  wrap.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function showMsg(el, text, type = "error") {
  el.className = "msg " + type;
  el.textContent = text;
  el.hidden = false;
}

function starsOnly(avg) {
  const full = Math.round(avg || 0);
  let s = "";
  for (let i = 1; i <= 5; i++) s += i <= full ? "★" : '<span class="off">★</span>';
  return `<span class="stars" aria-label="${avg ? avg.toFixed(1) : "No"} out of 5 stars">${s}</span>`;
}
function stars(avg, count) {
  return `${starsOnly(avg)} <span class="muted small">${count ? `(${count})` : "(no reviews)"}</span>`;
}
function avgRating(reviews) {
  if (!reviews || !reviews.length) return 0;
  return reviews.reduce((a, r) => a + r.rating, 0) / reviews.length;
}

async function getUser() {
  const { data } = await supabaseClient.auth.getSession();
  return data.session ? data.session.user : null;
}
async function getProfile(user) {
  if (!user) return null;
  const { data } = await supabaseClient.from("customers").select("*").eq("id", user.id).maybeSingle();
  return data;
}
// only allow redirects to a page inside this site (blocks open-redirect tricks)
function safeNext(next) {
  return /^[a-z0-9\-]+\.html(\?[a-zA-Z0-9=&_\-]*)?$/.test(next || "") ? next : "products.html";
}

function cartCount() {
  try { return (JSON.parse(localStorage.getItem("turath_cart")) || []).reduce((a, i) => a + i.qty, 0); }
  catch { return 0; }
}
function updateCartBadge() {
  document.querySelectorAll(".cart-badge").forEach((b) => (b.textContent = cartCount()));
}

async function initLayout() {
  const page = location.pathname.split("/").pop() || "index.html";
  const link = (href, text) => `<li><a href="${href}" class="${page === href ? "active" : ""}">${text}</a></li>`;
  const header = document.getElementById("site-header");
  if (header) {
    header.className = "site-header";
    header.innerHTML = `<div class="container nav">
      <a class="brand" href="index.html"><img src="images/logo.svg" alt="">Turath</a>
      <button class="menu-btn" aria-label="Menu" aria-expanded="false">☰</button>
      <ul class="nav-links" id="nav-links">
        ${link("index.html", "Home")}${link("products.html", "Shop")}${link("about.html", "About")}
        <li><a href="cart.html" class="${page === "cart.html" ? "active" : ""}">Cart<span class="cart-badge">${cartCount()}</span></a></li>
        <li id="nav-auth"></li>
      </ul></div>`;
    const btn = header.querySelector(".menu-btn");
    btn.addEventListener("click", () => {
      const open = document.getElementById("nav-links").classList.toggle("open");
      btn.setAttribute("aria-expanded", open);
    });
  }
  const footer = document.getElementById("site-footer");
  if (footer) {
    footer.className = "site-footer";
    footer.innerHTML = `<div class="container footer-grid">
      <div><strong>Turath</strong><br>Handmade Gulf crafts, made by UAE artisans. A student project for INT424 (not a real shop).</div>
      <div><strong>Shop</strong><br><a href="products.html">All products</a><br><a href="products.html?occasion=Eid">Eid gifts</a><br><a href="about.html">About &amp; policies</a></div>
      <div><strong>Account</strong><br><a href="my-orders.html">My orders</a><br><a href="login.html">Log in</a><br><a href="register.html">Register</a></div></div>`;
  }
  const authSlot = document.getElementById("nav-auth");
  if (authSlot) {
    const user = await getUser();
    if (!user) {
      authSlot.innerHTML = `<a href="login.html" class="${page === "login.html" ? "active" : ""}">Log in</a>`;
    } else {
      const profile = await getProfile(user);
      const name = esc((profile?.full_name || user.email).split(" ")[0]);
      authSlot.innerHTML = `<div style="display:flex;flex-wrap:wrap;align-items:center">
        ${profile?.role === "admin" ? `<a href="admin.html">Admin</a>` : ""}
        <a href="my-orders.html">${name}'s account</a><button type="button" id="logout-btn">Log out</button></div>`;
      document.getElementById("logout-btn").addEventListener("click", async () => {
        await supabaseClient.auth.signOut();
        location.href = "index.html";
      });
    }
  }
}
document.addEventListener("DOMContentLoaded", initLayout);
window.addEventListener("storage", updateCartBadge);

// reusable product card (used on home + shop)
function productCard(p) {
  const out = p.stock <= 0, low = p.stock > 0 && p.stock <= 5;
  const rev = p.reviews || [];
  return `<article class="card">
    <a class="thumb" href="product-detail.html?id=${p.id}">
      <img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy">
      ${out ? '<span class="badge out">Out of stock</span>' : low ? `<span class="badge low">Only ${p.stock} left</span>` : ""}
    </a>
    <div class="card-body">
      <span class="cat-label">${esc(p.category?.name || "")}</span>
      <h3><a href="product-detail.html?id=${p.id}">${esc(p.name)}</a></h3>
      <span class="muted small">by ${esc(p.artisan)}</span>
      <div>${stars(avgRating(rev), rev.length)}</div>
      <div class="card-foot">
        <span class="price">${fmt(p.price)}</span>
        <button class="btn btn-sm add-btn" data-id="${p.id}" ${out ? "disabled" : ""}>${out ? "Sold out" : "Add to cart"}</button>
      </div>
    </div></article>`;
}
// one click handler for every "Add to cart" button rendered by productCard()
function bindAddButtons(container, getProducts) {
  container.addEventListener("click", (e) => {
    const b = e.target.closest(".add-btn");
    if (!b) return;
    const p = getProducts().find((x) => x.id === Number(b.dataset.id));
    if (p) addToCart(p, 1);
  });
}
