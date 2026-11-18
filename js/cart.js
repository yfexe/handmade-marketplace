// Shopping cart stored in the browser (localStorage). Needs app.js.
const CART_KEY = "turath_cart";
const MAX_QTY = 10;

function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; }
}
function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartBadge();
}
function clearCart() { saveCart([]); }

function addToCart(product, qty = 1) {
  const cart = getCart();
  const item = cart.find((i) => i.id === product.id);
  const limit = Math.min(product.stock, MAX_QTY);
  if (item) {
    if (item.qty + qty > limit) { toast(`Only ${limit} available for "${product.name}"`, "error"); return false; }
    item.qty += qty;
    item.stock = product.stock;
  } else {
    if (qty > limit) { toast(`Only ${limit} available`, "error"); return false; }
    cart.push({ id: product.id, name: product.name, price: Number(product.price), image_url: product.image_url, stock: product.stock, qty });
  }
  saveCart(cart);
  toast(`Added "${product.name}" to your cart`);
  return true;
}

// Replace what is in localStorage with the current price/stock from the database,
// so the cart can never show stale prices. Items that no longer exist are dropped.
async function syncCartWithDb() {
  let cart = getCart();
  if (!cart.length) return cart;
  const { data, error } = await supabaseClient.from("product").select("id,name,price,stock,image_url").in("id", cart.map((i) => i.id));
  if (error) { console.error(error); return cart; }
  cart = cart
    .map((i) => {
      const p = data.find((d) => d.id === i.id);
      if (!p || p.stock <= 0) return null;
      return { ...i, name: p.name, price: Number(p.price), stock: p.stock, image_url: p.image_url, qty: Math.min(i.qty, p.stock, MAX_QTY) };
    })
    .filter(Boolean);
  saveCart(cart);
  return cart;
}

function cartTotals(cart) {
  const subtotal = cart.reduce((a, i) => a + i.price * i.qty, 0);
  const vat = Math.round(subtotal * VAT_RATE * 100) / 100;
  return { subtotal, vat, total: Math.round((subtotal + vat) * 100) / 100 };
}
function renderSummary(el, cart) {
  const t = cartTotals(cart);
  el.innerHTML = `<h3>Order summary</h3>
    <div class="line"><span>Subtotal</span><span>${fmt(t.subtotal)}</span></div>
    <div class="line"><span>VAT (5%)</span><span>${fmt(t.vat)}</span></div>
    <div class="line"><span>Delivery</span><span>Free</span></div>
    <div class="line total"><span>Total</span><span>${fmt(t.total)}</span></div>`;
}

// ---------- cart page ----------
async function initCartPage() {
  const list = document.getElementById("cart-list");
  if (!list) return;
  const summary = document.getElementById("cart-summary");
  list.innerHTML = '<div class="spinner">Loading your cart…</div>';
  await syncCartWithDb();

  function draw() {
    const cart = getCart();
    if (!cart.length) {
      list.innerHTML = `<div class="empty"><h3>Your cart is empty</h3><p class="muted">Find something handmade you like.</p><a class="btn" href="products.html">Browse products</a></div>`;
      summary.hidden = true; return;
    }
    summary.hidden = false;
    list.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th></th><th>Product</th><th>Price</th><th>Quantity</th><th>Total</th><th></th></tr></thead><tbody>
      ${cart.map((i) => `<tr>
        <td><img class="cart-img" src="${esc(i.image_url)}" alt=""></td>
        <td><a href="product-detail.html?id=${i.id}">${esc(i.name)}</a></td>
        <td>${fmt(i.price)}</td>
        <td><div class="qty"><button data-act="dec" data-id="${i.id}" aria-label="Decrease">−</button>
          <input value="${i.qty}" readonly aria-label="Quantity"><button data-act="inc" data-id="${i.id}" aria-label="Increase">+</button></div></td>
        <td>${fmt(i.price * i.qty)}</td>
        <td><button class="btn btn-light btn-sm" data-act="rm" data-id="${i.id}">Remove</button></td></tr>`).join("")}
      </tbody></table></div>`;
    renderSummary(document.getElementById("cart-sum-body"), cart);
  }
  list.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const c = getCart();
    const it = c.find((i) => i.id === Number(b.dataset.id));
    if (!it) return;
    if (b.dataset.act === "inc") { if (it.qty < Math.min(it.stock, MAX_QTY)) it.qty++; else toast("No more stock available", "error"); }
    if (b.dataset.act === "dec") it.qty = Math.max(1, it.qty - 1);
    if (b.dataset.act === "rm") c.splice(c.indexOf(it), 1);
    saveCart(c);
    draw();
  });
  draw();
}
document.addEventListener("DOMContentLoaded", initCartPage);
