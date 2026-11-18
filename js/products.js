// Shop page: search, filters, sorting and the Gift Finder (all done by Supabase queries). Needs app.js + cart.js.
let currentProducts = [];

const $ = (id) => document.getElementById(id);

async function loadCategories() {
  const { data, error } = await supabaseClient.from("category").select("id,name").order("name"); // SELECT category
  if (error) return console.error(error);
  $("f-category").innerHTML = '<option value="">All categories</option>' + data.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
}

function readFilters() {
  return {
    q: $("f-search").value.trim(),
    category: $("f-category").value,
    min: $("f-min").value,
    max: $("f-max").value,
    inStock: $("f-stock").checked,
    occasion: $("f-occasion").value,
    sort: $("f-sort").value,
  };
}

// Smart search: builds ONE database query from every condition the shopper chose.
async function searchProducts(f) {
  let q = supabaseClient.from("product").select("*, category(name), reviews(rating)");
  if (f.category) q = q.eq("category_id", Number(f.category));
  // multi-keyword search: every word must appear in the name, description or artisan
  f.q.split(/\s+/).filter(Boolean).slice(0, 6).forEach((w) => {
    const t = w.replace(/[%,()*_\\]/g, "");
    if (t) q = q.or(`name.ilike.%${t}%,description.ilike.%${t}%,artisan.ilike.%${t}%`);
  });
  if (f.min !== "" && !isNaN(f.min)) q = q.gte("price", Number(f.min));   // price range
  if (f.max !== "" && !isNaN(f.max)) q = q.lte("price", Number(f.max));
  if (f.inStock) q = q.gt("stock", 0);                                       // availability
  if (f.occasion) q = q.contains("occasions", [f.occasion]);                 // Gift Finder
  if (f.sort === "price-asc") q = q.order("price", { ascending: true });
  else if (f.sort === "price-desc") q = q.order("price", { ascending: false });
  else if (f.sort === "name") q = q.order("name", { ascending: true });
  else q = q.order("id", { ascending: false });
  return q;
}

async function runSearch() {
  const f = readFilters();
  const grid = $("product-grid"), count = $("result-count");
  grid.innerHTML = '<div class="spinner">Loading…</div>';
  const { data, error } = await searchProducts(f);
  if (error) {
    console.error(error);
    grid.innerHTML = `<div class="empty"><p>Could not load products. ${esc(error.message)}</p></div>`;
    return;
  }
  currentProducts = data;
  count.textContent = `${data.length} product${data.length === 1 ? "" : "s"} found`;
  // show the active conditions in plain words
  const parts = [];
  if (f.q) parts.push(`"${f.q}"`);
  if (f.occasion) parts.push(`gifts for ${f.occasion}`);
  if (f.min || f.max) parts.push(`${f.min ? "from AED " + f.min : ""} ${f.max ? "up to AED " + f.max : ""}`.trim());
  if (f.inStock) parts.push("in stock only");
  $("active-filters").textContent = parts.length ? "Filters: " + parts.join(" · ") : "";
  grid.innerHTML = data.length
    ? data.map(productCard).join("")
    : `<div class="empty" style="grid-column:1/-1"><h3>No matches</h3><p class="muted">Try fewer keywords or a wider price range.</p><button class="btn btn-light" id="reset-inline">Clear filters</button></div>`;
  const r = $("reset-inline");
  if (r) r.addEventListener("click", resetFilters);
}

function resetFilters() {
  ["f-search", "f-min", "f-max"].forEach((id) => ($(id).value = ""));
  $("f-category").value = ""; $("f-occasion").value = ""; $("f-sort").value = "new"; $("f-stock").checked = false;
  $("g-occasion").value = ""; $("g-budget").value = "";
  runSearch();
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!$("product-grid")) return;
  const occ = '<option value="">Any occasion</option>' + OCCASIONS.map((o) => `<option>${o}</option>`).join("");
  $("f-occasion").innerHTML = occ;
  $("g-occasion").innerHTML = '<option value="">Choose an occasion…</option>' + OCCASIONS.map((o) => `<option>${o}</option>`).join("");
  await loadCategories();

  // start from the URL, e.g. products.html?category=2 or ?occasion=Eid&max=200
  const p = new URLSearchParams(location.search);
  if (p.get("category")) $("f-category").value = p.get("category");
  if (p.get("occasion") && OCCASIONS.includes(p.get("occasion"))) { $("f-occasion").value = p.get("occasion"); $("g-occasion").value = p.get("occasion"); }
  if (p.get("q")) $("f-search").value = p.get("q").slice(0, 80);
  if (p.get("max") && !isNaN(p.get("max"))) $("f-max").value = p.get("max");

  let timer;
  $("f-search").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(runSearch, 350); });
  ["f-category", "f-sort", "f-occasion", "f-stock"].forEach((id) => $(id).addEventListener("change", runSearch));
  ["f-min", "f-max"].forEach((id) => $(id).addEventListener("change", runSearch));
  $("filters-form").addEventListener("submit", (e) => { e.preventDefault(); runSearch(); });
  $("reset-btn").addEventListener("click", resetFilters);

  // Gift Finder: occasion + budget -> fills the same filters, in-stock only, cheapest first
  $("gift-form").addEventListener("submit", (e) => {
    e.preventDefault();
    $("f-occasion").value = $("g-occasion").value;
    $("f-max").value = $("g-budget").value;
    $("f-min").value = ""; $("f-search").value = ""; $("f-category").value = "";
    $("f-stock").checked = true; $("f-sort").value = "price-asc";
    runSearch();
    $("product-grid").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  bindAddButtons($("product-grid"), () => currentProducts);
  runSearch();
});
