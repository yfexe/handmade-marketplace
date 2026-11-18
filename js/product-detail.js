// Product detail page: product info, reviews, and review create / update / delete. Needs app.js + cart.js.
let product = null, user = null, myReview = null;
const params = new URLSearchParams(location.search);

async function loadProduct() {
  const box = document.getElementById("detail");
  const id = Number(params.get("id"));
  if (!Number.isInteger(id) || id <= 0) { box.innerHTML = '<div class="empty"><h3>Product not found</h3><a class="btn" href="products.html">Back to shop</a></div>'; return; }
  const { data, error } = await supabaseClient.from("product")
    .select("*, category(name), reviews(id, customer_id, reviewer_name, rating, comment, created_at)")
    .eq("id", id).maybeSingle();                                   // SELECT one product
  if (error || !data) { box.innerHTML = '<div class="empty"><h3>Product not found</h3><a class="btn" href="products.html">Back to shop</a></div>'; return; }
  product = data;
  document.title = product.name + " | Turath";
  const out = product.stock <= 0;
  const rev = product.reviews || [];
  box.innerHTML = `
    <div><img src="${esc(product.image_url)}" alt="${esc(product.name)}"></div>
    <div>
      <p class="cat-label"><a href="products.html?category=${product.category_id}" style="color:inherit">${esc(product.category?.name)}</a></p>
      <h1>${esc(product.name)}</h1>
      <p class="muted">Handmade by <strong>${esc(product.artisan)}</strong></p>
      <p>${stars(avgRating(rev), rev.length)}</p>
      <p class="price">${fmt(product.price)} <span class="muted small" style="font-weight:400">+ 5% VAT</span></p>
      <p>${esc(product.description)}</p>
      <div class="tags">${(product.occasions || []).map((o) => `<a class="tag" href="products.html?occasion=${encodeURIComponent(o)}">${esc(o)}</a>`).join("")}</div>
      <p>${out ? '<strong style="color:var(--bad)">Out of stock</strong>' : product.stock <= 5 ? `<strong style="color:var(--warn)">Only ${product.stock} left</strong>` : `<span style="color:var(--ok)">In stock (${product.stock} available)</span>`}</p>
      ${out ? "" : `<div style="display:flex;gap:.8rem;align-items:center;flex-wrap:wrap">
        <div class="qty"><button id="q-dec" aria-label="Decrease">−</button><input id="q-val" value="1" readonly aria-label="Quantity"><button id="q-inc" aria-label="Increase">+</button></div>
        <button class="btn" id="add-btn">Add to cart</button></div>`}
    </div>`;
  if (!out) {
    const val = document.getElementById("q-val"), max = Math.min(product.stock, MAX_QTY);
    document.getElementById("q-dec").onclick = () => (val.value = Math.max(1, +val.value - 1));
    document.getElementById("q-inc").onclick = () => (val.value = Math.min(max, +val.value + 1));
    document.getElementById("add-btn").onclick = () => addToCart(product, +val.value);
  }
  renderReviews();
  setupReviewForm();
}

function renderReviews() {
  const list = document.getElementById("review-list");
  const rev = [...(product.reviews || [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
  document.getElementById("review-summary").innerHTML = rev.length
    ? `${stars(avgRating(rev), rev.length)} &nbsp; <strong>${avgRating(rev).toFixed(1)}</strong> average from ${rev.length} review${rev.length === 1 ? "" : "s"}`
    : "No reviews yet.";
  // review text is user-written: it is escaped with esc() so it can never run as HTML/JS
  list.innerHTML = rev.map((r) => `<div class="review">
      <div><strong>${esc(r.reviewer_name)}</strong> <span class="small muted">· verified buyer</span> ${starsOnly(r.rating)}</div>
      <div class="muted small">${new Date(r.created_at).toLocaleDateString("en-GB")}</div>
      <p style="margin:.3rem 0 0">${esc(r.comment) || "<em class='muted'>No comment</em>"}</p></div>`).join("");
}

async function setupReviewForm() {
  const area = document.getElementById("review-form-area");
  user = await getUser();
  if (!user) {
    area.innerHTML = `<p class="muted"><a href="login.html?next=${encodeURIComponent("product-detail.html?id=" + product.id)}">Log in</a> to review products you bought.</p>`;
    return;
  }
  myReview = (product.reviews || []).find((r) => r.customer_id === user.id) || null;
  if (!myReview) {
    // can this user review? only if they have a non-cancelled order containing this product (RLS enforces it too)
    const { data } = await supabaseClient.from("order_items")
      .select("id, orders!inner(status)").eq("product_id", product.id).neq("orders.status", "Cancelled").limit(1);
    if (!data || !data.length) { area.innerHTML = '<p class="muted">Only customers who bought this product can review it. This keeps reviews honest.</p>'; return; }
  }
  area.innerHTML = `<form id="review-form"><h3>${myReview ? "Your review" : "Write a review"}</h3>
    <div class="star-input" role="radiogroup" aria-label="Rating">
      ${[5, 4, 3, 2, 1].map((n) => `<input type="radio" name="rating" id="star${n}" value="${n}" ${myReview && myReview.rating === n ? "checked" : ""}><label for="star${n}" title="${n} stars">★</label>`).join("")}
    </div>
    <label for="comment">Comment (optional, max 500 characters)</label>
    <textarea id="comment" maxlength="500">${esc(myReview ? myReview.comment : "")}</textarea>
    <div id="review-msg" class="msg" hidden></div>
    <button class="btn" type="submit">${myReview ? "Update review" : "Submit review"}</button>
    ${myReview ? '<button class="btn btn-danger" type="button" id="del-review">Delete review</button>' : ""}</form>`;
  document.getElementById("review-form").addEventListener("submit", saveReview);
  const del = document.getElementById("del-review");
  if (del) del.addEventListener("click", deleteReview);
}

async function saveReview(e) {
  e.preventDefault();
  const msg = document.getElementById("review-msg");
  const rating = Number((document.querySelector('input[name="rating"]:checked') || {}).value);
  const comment = document.getElementById("comment").value.trim();
  if (!rating) return showMsg(msg, "Please choose a star rating.");
  let error;
  if (myReview) {
    ({ error } = await supabaseClient.from("reviews").update({ rating, comment }).eq("id", myReview.id));          // UPDATE
  } else {
    ({ error } = await supabaseClient.from("reviews").insert({ product_id: product.id, customer_id: user.id, rating, comment })); // INSERT
  }
  if (error) return showMsg(msg, "Could not save review: " + error.message);
  toast("Thank you for your review!");
  loadProduct();
}

async function deleteReview() {
  if (!confirm("Delete your review?")) return;
  const { error } = await supabaseClient.from("reviews").delete().eq("id", myReview.id);                          // DELETE
  if (error) return toast(error.message, "error");
  toast("Review deleted");
  loadProduct();
}

document.addEventListener("DOMContentLoaded", loadProduct);
