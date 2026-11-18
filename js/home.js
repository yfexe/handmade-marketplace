// Home page: categories + new arrivals loaded from Supabase. Needs app.js + cart.js.
let homeProducts = [];
document.addEventListener("DOMContentLoaded", async () => {
  const catBox = document.getElementById("home-categories");
  const newBox = document.getElementById("home-new");
  if (!catBox) return;

  document.getElementById("home-occasions").innerHTML = OCCASIONS
    .map((o) => `<a class="chip" href="products.html?occasion=${encodeURIComponent(o)}">${o}</a>`).join("");

  const [cats, prods] = await Promise.all([
    supabaseClient.from("category").select("id,name,description").order("name"),
    supabaseClient.from("product").select("*, category(name), reviews(rating)").order("id", { ascending: false }).limit(4),
  ]);
  catBox.innerHTML = cats.error
    ? `<p class="msg error">Could not load categories.</p>`
    : cats.data.map((c) => `<a class="cat-tile" href="products.html?category=${c.id}"><h3>${esc(c.name)}</h3><p class="muted small" style="margin:0">${esc(c.description)}</p></a>`).join("");
  if (prods.error) { newBox.innerHTML = `<p class="msg error">Could not load products.</p>`; return; }
  homeProducts = prods.data;
  newBox.innerHTML = homeProducts.map(productCard).join("");
  bindAddButtons(newBox, () => homeProducts);
});
