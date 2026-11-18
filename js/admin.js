// Admin area: analytics dashboard + product management (INSERT/UPDATE/DELETE) + order status (UPDATE).
// The page hides itself from non-admins, but the REAL protection is Row Level Security in the database.
const $ = (id) => document.getElementById(id);
let categories = [], editingId = null;
const charts = {};

async function initAdmin() {
  const user = await getUser();
  if (!user) { location.href = "login.html?next=admin.html"; return; }
  const profile = await getProfile(user);
  if (!profile || profile.role !== "admin") {
    $("admin-root").innerHTML = '<div class="form-card"><h2>Admins only</h2><p>This page is for shop managers. Your account does not have admin rights.</p><a class="btn" href="index.html">Back to home</a></div>';
    return;
  }
  $("admin-content").hidden = false;
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => showTab(t.dataset.tab)));
  const { data } = await supabaseClient.from("category").select("*").order("name");
  categories = data || [];
  $("pf-category").innerHTML = categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
  $("pf-occasions").innerHTML = OCCASIONS.map((o) => `<label style="display:inline-flex;gap:.3rem;margin:.2rem .8rem .2rem 0;font-weight:400"><input type="checkbox" value="${o}"> ${o}</label>`).join("");
  $("product-form").addEventListener("submit", saveProduct);
  $("pf-cancel").addEventListener("click", resetForm);
  showTab("dashboard");
}

function showTab(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  ["dashboard", "products", "orders"].forEach((n) => ($("tab-" + n).hidden = n !== name));
  if (name === "dashboard") loadDashboard();
  if (name === "products") loadProducts();
  if (name === "orders") loadOrders();
}

// ---------------- analytics dashboard ----------------
function drawChart(id, type, labels, data, label, color) {
  if (charts[id]) charts[id].destroy();
  const palette = ["#1f5f5b", "#b5542f", "#c9953c", "#6a4c93", "#2f7d4f", "#8a8f98"];
  charts[id] = new Chart($(id), {
    type,
    data: { labels, datasets: [{ label, data, backgroundColor: type === "line" ? "rgba(31,95,91,.15)" : (type === "doughnut" ? palette : color), borderColor: color, fill: type === "line", tension: .3 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: type === "doughnut" } }, scales: type === "doughnut" ? {} : { y: { beginAtZero: true, title: { display: true, text: label } } } },
  });
}

async function loadDashboard() {
  const [stats, top, byCat, byDay, low] = await Promise.all([
    supabaseClient.rpc("admin_stats"),
    supabaseClient.rpc("admin_top_products", { lim: 5 }),
    supabaseClient.rpc("admin_sales_by_category"),
    supabaseClient.rpc("admin_sales_by_day", { days: 30 }),
    supabaseClient.from("product").select("id,name,stock").lte("stock", 5).order("stock"),
  ]);
  if (stats.error) { $("stat-grid").innerHTML = `<div class="msg error">${esc(stats.error.message)}</div>`; return; }
  const s = stats.data;
  const card = (n, label) => `<div class="stat"><div class="n">${n}</div><div class="muted small">${label}</div></div>`;
  $("stat-grid").innerHTML = card(s.total_products, "Products") + card(s.total_orders, "Orders (not cancelled)") +
    card(fmt(s.total_sales), "Total sales (incl. VAT)") + card(s.total_customers, "Customers") +
    card(s.avg_rating + " ★", `Average rating (${s.total_reviews} reviews)`) + card(s.low_stock_count, "Low-stock products");
  drawChart("chart-day", "bar", byDay.data.map((d) => new Date(d.day).toLocaleDateString("en-GB", { day: "numeric", month: "short" })), byDay.data.map((d) => Number(d.sales)), "Sales (AED)", "#1f5f5b");
  drawChart("chart-cat", "doughnut", byCat.data.map((c) => c.category), byCat.data.map((c) => Number(c.revenue)), "Revenue (AED)", "#1f5f5b");
  drawChart("chart-top", "bar", top.data.map((p) => p.name), top.data.map((p) => Number(p.units_sold)), "Units sold", "#b5542f");
  $("low-stock").innerHTML = low.data && low.data.length
    ? low.data.map((p) => `<tr><td>${esc(p.name)}</td><td><strong style="color:${p.stock === 0 ? "var(--bad)" : "var(--warn)"}">${p.stock}</strong></td></tr>`).join("")
    : '<tr><td colspan="2">All products are well stocked.</td></tr>';
}

// ---------------- products CRUD ----------------
async function loadProducts() {
  const { data, error } = await supabaseClient.from("product").select("*, category(name)").order("id");       // SELECT
  if (error) return toast(error.message, "error");
  $("product-rows").innerHTML = data.map((p) => `<tr>
    <td><img class="cart-img" src="${esc(p.image_url)}" alt=""></td><td>${esc(p.name)}<br><span class="muted small">${esc(p.artisan)}</span></td>
    <td>${esc(p.category?.name)}</td><td>${fmt(p.price)}</td><td>${p.stock}</td>
    <td><button class="btn btn-light btn-sm" data-edit='${esc(JSON.stringify(p))}'>Edit</button>
        <button class="btn btn-danger btn-sm" data-del="${p.id}" data-name="${esc(p.name)}">Delete</button></td></tr>`).join("");
}

function resetForm() {
  editingId = null;
  $("product-form").reset();
  $("pf-title").textContent = "Add a product";
  $("pf-submit").textContent = "Add product";
  $("pf-cancel").hidden = true;
  $("pf-msg").hidden = true;
}

async function saveProduct(e) {
  e.preventDefault();
  const msg = $("pf-msg");
  const row = {
    name: $("pf-name").value.trim(), category_id: Number($("pf-category").value), description: $("pf-desc").value.trim(),
    price: Number($("pf-price").value), stock: parseInt($("pf-stock").value, 10), artisan: $("pf-artisan").value.trim(),
    image_url: $("pf-image").value.trim() || "images/placeholder.svg",
    occasions: [...document.querySelectorAll("#pf-occasions input:checked")].map((c) => c.value),
  };
  if (row.name.length < 2) return showMsg(msg, "Name is too short.");
  if (!(row.price >= 0)) return showMsg(msg, "Price must be 0 or more.");
  if (!Number.isInteger(row.stock) || row.stock < 0) return showMsg(msg, "Stock must be a whole number, 0 or more.");
  if (!row.artisan) return showMsg(msg, "Please enter the artisan's name.");
  if (!/^(images\/[\w\-.]+|https:\/\/[^\s"'<>]+)$/.test(row.image_url)) return showMsg(msg, "Image must be a file in images/ or an https:// link.");
  const { error } = editingId
    ? await supabaseClient.from("product").update(row).eq("id", editingId)    // UPDATE product
    : await supabaseClient.from("product").insert(row);                       // INSERT product
  if (error) return showMsg(msg, error.message);
  toast(editingId ? "Product updated" : "Product added");
  resetForm();
  loadProducts();
}

document.addEventListener("click", async (e) => {
  const ed = e.target.closest("[data-edit]");
  if (ed) {
    const p = JSON.parse(ed.dataset.edit);
    editingId = p.id;
    $("pf-name").value = p.name; $("pf-category").value = p.category_id; $("pf-desc").value = p.description;
    $("pf-price").value = p.price; $("pf-stock").value = p.stock; $("pf-artisan").value = p.artisan; $("pf-image").value = p.image_url;
    document.querySelectorAll("#pf-occasions input").forEach((c) => (c.checked = (p.occasions || []).includes(c.value)));
    $("pf-title").textContent = "Edit product #" + p.id; $("pf-submit").textContent = "Save changes"; $("pf-cancel").hidden = false;
    $("product-form").scrollIntoView({ behavior: "smooth" });
  }
  const del = e.target.closest("[data-del]");
  if (del) {
    if (!confirm(`Delete "${del.dataset.name}"? This cannot be undone.`)) return;
    const { error } = await supabaseClient.from("product").delete().eq("id", Number(del.dataset.del));          // DELETE product
    if (error) return toast(error.code === "23503" ? "This product is in past orders, so it can't be deleted. Set its stock to 0 instead." : error.message, "error");
    toast("Product deleted");
    loadProducts();
  }
  const sv = e.target.closest("[data-save-status]");
  if (sv) {
    const id = Number(sv.dataset.saveStatus);
    const status = document.querySelector(`select[data-status-for="${id}"]`).value;
    const { error } = await supabaseClient.from("orders").update({ status }).eq("id", id);                      // UPDATE orders
    if (error) return toast(error.message, "error");
    toast(`Order #${id} is now ${status}`);
    loadOrders();
  }
});

// ---------------- orders ----------------
async function loadOrders() {
  const { data, error } = await supabaseClient.from("orders")
    .select("*, customers(full_name,email), order_items(quantity, product(name))").order("order_date", { ascending: false });
  if (error) return toast(error.message, "error");
  $("order-rows").innerHTML = data.map((o) => `<tr>
    <td>#${o.id}</td><td>${new Date(o.order_date).toLocaleDateString("en-GB")}</td>
    <td>${esc(o.customers?.full_name)}<br><span class="muted small">${esc(o.customers?.email)}</span></td>
    <td class="small">${o.order_items.map((i) => esc(i.product?.name) + " ×" + i.quantity).join("<br>")}</td>
    <td>${fmt(o.total_amount)}</td>
    <td>${o.status === "Cancelled" ? '<span class="status Cancelled">Cancelled</span>' :
      `<select data-status-for="${o.id}" style="width:auto">${["Placed", "Shipped", "Delivered", "Cancelled"].map((s) => `<option ${s === o.status ? "selected" : ""}>${s}</option>`).join("")}</select>
       <button class="btn btn-sm btn-teal" data-save-status="${o.id}">Save</button>`}</td></tr>`).join("");
}

document.addEventListener("DOMContentLoaded", initAdmin);
