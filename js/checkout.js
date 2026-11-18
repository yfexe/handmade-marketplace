// Checkout (saves the order) and order confirmation page. Needs app.js + cart.js + auth helpers.
const PHONE_RE = /^(\+971|00971|0)?5\d{8}$/;

async function initCheckout() {
  const form = document.getElementById("checkout-form");
  if (!form) return;
  const user = await getUser();
  if (!user) { location.href = "login.html?next=checkout.html"; return; }
  const cart = await syncCartWithDb();
  if (!cart.length) { location.href = "cart.html"; return; }

  document.getElementById("emirate").innerHTML = EMIRATES.map((e) => `<option>${e}</option>`).join("");
  const profile = await getProfile(user);
  if (profile) {
    document.getElementById("shipping_name").value = profile.full_name || "";
    document.getElementById("shipping_phone").value = profile.phone || "";
    document.getElementById("shipping_address").value = profile.address || "";
  }
  document.getElementById("co-items").innerHTML = cart.map((i) => `<div class="line"><span>${esc(i.name)} × ${i.qty}</span><span>${fmt(i.price * i.qty)}</span></div>`).join("");
  renderSummary(document.getElementById("co-summary"), cart);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("form-msg");
    msg.hidden = true;
    const shipping_name = document.getElementById("shipping_name").value.trim();
    const shipping_phone = document.getElementById("shipping_phone").value.trim().replace(/[\s-]/g, "");
    const shipping_address = document.getElementById("shipping_address").value.trim();
    const emirate = document.getElementById("emirate").value;
    if (shipping_name.length < 2) return showMsg(msg, "Please enter the receiver's name.");
    if (!PHONE_RE.test(shipping_phone)) return showMsg(msg, "Enter a UAE mobile number, e.g. 0501234567.");
    if (shipping_address.length < 5) return showMsg(msg, "Please enter a full delivery address.");

    const btn = document.getElementById("place-order");
    btn.disabled = true; btn.textContent = "Placing order…";
    const fresh = await syncCartWithDb();              // re-check price and stock one last time
    if (!fresh.length) { location.href = "cart.html"; return; }

    // 1) INSERT the order (totals are calculated by the database, not by this script)
    const { data: order, error: oErr } = await supabaseClient.from("orders")
      .insert({ customer_id: user.id, shipping_name, shipping_phone, shipping_address, emirate })
      .select().single();
    if (oErr) { btn.disabled = false; btn.textContent = "Place order"; return showMsg(msg, "Could not create the order: " + oErr.message); }

    // 2) INSERT the order lines (a database trigger checks stock, copies the real price, reduces stock)
    const lines = fresh.map((i) => ({ order_id: order.id, product_id: i.id, quantity: i.qty }));
    const { error: iErr } = await supabaseClient.from("order_items").insert(lines);
    if (iErr) {
      // lines failed (e.g. someone bought the last item): cancel the empty order and tell the customer
      await supabaseClient.from("orders").update({ status: "Cancelled" }).eq("id", order.id);
      btn.disabled = false; btn.textContent = "Place order";
      await syncCartWithDb();
      return showMsg(msg, iErr.message.includes("Not enough stock") ? iErr.message + ". Please update your cart." : "Could not save the order lines: " + iErr.message);
    }

    // remember the delivery details for next time (UPDATE customers)
    await supabaseClient.from("customers").update({ full_name: profile?.full_name || shipping_name, phone: shipping_phone, address: shipping_address }).eq("id", user.id);
    clearCart();
    location.href = "confirmation.html?order=" + order.id;
  });
}

async function initConfirmation() {
  const box = document.getElementById("confirmation");
  if (!box) return;
  const id = Number(new URLSearchParams(location.search).get("order"));
  const user = await getUser();
  if (!user) { location.href = "login.html?next=my-orders.html"; return; }
  const { data: o, error } = await supabaseClient.from("orders")
    .select("*, order_items(quantity, unit_price, product(name))").eq("id", id).maybeSingle();   // SELECT (RLS: own orders only)
  if (error || !o) { box.innerHTML = '<div class="empty"><h3>Order not found</h3><a class="btn" href="my-orders.html">My orders</a></div>'; return; }
  box.innerHTML = `<div class="form-card wide">
    <h1>Thank you, your order is placed! ✔</h1>
    <p>Order number: <strong>#${o.id}</strong> &nbsp; <span class="status ${o.status}">${o.status}</span></p>
    <p class="muted">Payment: ${esc(o.payment_method)} · Deliver to: ${esc(o.shipping_name)}, ${esc(o.shipping_address)}, ${esc(o.emirate)} · ${esc(o.shipping_phone)}</p>
    <div class="table-wrap"><table><thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>
      ${o.order_items.map((i) => `<tr><td>${esc(i.product?.name)}</td><td>${i.quantity}</td><td>${fmt(i.unit_price)}</td><td>${fmt(i.unit_price * i.quantity)}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="summary" style="margin-top:1rem">
      <div class="line"><span>Subtotal</span><span>${fmt(o.subtotal)}</span></div>
      <div class="line"><span>VAT (5%)</span><span>${fmt(o.vat_amount)}</span></div>
      <div class="line total"><span>Total to pay on delivery</span><span>${fmt(o.total_amount)}</span></div></div>
    <p style="margin-top:1rem"><a class="btn" href="my-orders.html">View my orders</a> <a class="btn btn-light" href="products.html">Continue shopping</a></p></div>`;
}

document.addEventListener("DOMContentLoaded", () => { initCheckout(); initConfirmation(); });
