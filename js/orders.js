// "My account" page: profile (UPDATE customers) and order history (SELECT orders, cancel = UPDATE). Needs app.js.
async function loadAccount() {
  const user = await getUser();
  if (!user) { location.href = "login.html?next=my-orders.html"; return; }
  const profile = await getProfile(user);
  document.getElementById("p-name").value = profile?.full_name || "";
  document.getElementById("p-email").value = user.email;
  document.getElementById("p-phone").value = profile?.phone || "";
  document.getElementById("p-address").value = profile?.address || "";

  document.getElementById("profile-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("profile-msg");
    const full_name = document.getElementById("p-name").value.trim();
    const phone = document.getElementById("p-phone").value.trim().replace(/[\s-]/g, "");
    if (full_name.length < 2) return showMsg(msg, "Please enter your name.");
    if (phone && !/^(\+971|00971|0)?5\d{8}$/.test(phone)) return showMsg(msg, "Phone must be a UAE mobile number.");
    const { error } = await supabaseClient.from("customers")
      .update({ full_name, phone: phone || null, address: document.getElementById("p-address").value.trim() || null })
      .eq("id", user.id);                                                                        // UPDATE customers (own row only)
    if (error) return showMsg(msg, error.message);
    showMsg(msg, "Profile saved.", "ok");
  });
  loadOrders();
}

async function loadOrders() {
  const box = document.getElementById("orders-list");
  box.innerHTML = '<div class="spinner">Loading orders…</div>';
  const { data, error } = await supabaseClient.from("orders")
    .select("*, order_items(quantity, unit_price, product(name))")
    .order("order_date", { ascending: false });                                                   // SELECT orders (RLS: own only)
  if (error) { box.innerHTML = `<div class="msg error">${esc(error.message)}</div>`; return; }
  if (!data.length) { box.innerHTML = '<div class="empty"><h3>No orders yet</h3><a class="btn" href="products.html">Start shopping</a></div>'; return; }
  box.innerHTML = data.map((o) => `<div class="order-card">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:.5rem">
        <strong>Order #${o.id}</strong><span class="status ${o.status}">${o.status}</span></div>
      <div class="muted small">${new Date(o.order_date).toLocaleString("en-GB")} · ${esc(o.emirate)} · ${esc(o.payment_method)}</div>
      <ul>${o.order_items.map((i) => `<li>${esc(i.product?.name)} × ${i.quantity} — ${fmt(i.unit_price * i.quantity)}</li>`).join("")}</ul>
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:.5rem;align-items:center">
        <strong>Total (incl. VAT): ${fmt(o.total_amount)}</strong>
        ${o.status === "Placed" ? `<button class="btn btn-danger btn-sm" data-cancel="${o.id}">Cancel order</button>` : ""}</div>
    </div>`).join("");
}

document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-cancel]");
  if (!b) return;
  if (!confirm("Cancel this order? The items go back into stock.")) return;
  const { error } = await supabaseClient.from("orders").update({ status: "Cancelled" }).eq("id", Number(b.dataset.cancel)); // UPDATE (own, Placed only)
  if (error) return toast(error.message, "error");
  toast("Order cancelled");
  loadOrders();
});
document.addEventListener("DOMContentLoaded", loadAccount);
