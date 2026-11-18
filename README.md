# Turath – Handmade Gulf Crafts Marketplace

INT424 E-Commerce Final Project (Project 3: Handmade Products Marketplace)

| | |
|---|---|
| **Group** | GroupXX *(replace with your group number)* |
| **Student** | Yaseen Ghiyath Alfakir – ID 202211398 |
| **Section** | *(replace)* |
| **Instructor** | Dr. Mohammad Al Nawayseh |
| **GitHub repository** | https://github.com/yfexe/handmade-marketplace |
| **GitHub Pages (live site)** | https://yfexe.github.io/handmade-marketplace/ |

## Project description

Turath ("heritage" in Arabic) is an online marketplace for **handmade Gulf crafts**: jewelry, decorations,
candles, accessories and gifts, each made by a named UAE artisan. Customers can browse, search, find gifts
for an occasion with the **Gift Finder**, order with cash on delivery, and review what they bought.
Shop managers manage products and orders and watch an analytics dashboard.

It is a database-driven site: every product, order, review and user is stored in **Supabase**.
Nothing is hard-coded in the pages.

**Our twist:** the **Gift Finder** (occasion + budget search: Eid, Ramadan, Wedding…) and **verified-buyer
reviews** (only customers who really ordered a product can review it, and cancelling the order removes
the review).

## Main features

- Products, categories and prices loaded from Supabase; product detail page
- **Smart search:** several keywords at once, category, price range, in-stock only, occasion, sort by price/name
- **Gift Finder:** pick an occasion and a budget, get matching in-stock products, cheapest first
- Registration, login and logout (Supabase Auth); profile page
- Shopping cart saved in `localStorage`; prices and stock re-checked against the database
- Checkout saves the order in `orders` and `order_items`; order confirmation page; order history; cancel an order
- Reviews and star ratings (add, edit, delete), average rating on every product
- Admin area: analytics dashboard (totals, sales, top products, low stock, charts), product add/edit/delete, order status
- 5% UAE VAT calculated by the database; free delivery; cash on delivery (no card data is ever collected)
- Responsive layout (desktop and mobile)

## Technologies

HTML5 · CSS3 · JavaScript (no framework) · Supabase (PostgreSQL, Auth, REST API/PostgREST, Row Level Security) ·
supabase-js v2.119.1 and Chart.js 4.6.1 from jsDelivr (pinned, with integrity hashes) · Git and GitHub · GitHub Pages

## Database structure

Tables: `category`, `product`, `customers`, `orders`, `order_items`, `reviews` (see `database/database.sql` and the ERD).

```
category 1──* product 1──* order_items *──1 orders *──1 customers 1──1 auth.users
                  1──* reviews *──1 customers
```

Business rules are enforced **inside the database** (triggers): the real price is copied from `product`,
stock is checked and reduced, totals and VAT are calculated, cancelling restores stock, and reviews are
limited to verified buyers. Row Level Security limits who can see or change each row.

## Running the project

1. **Supabase:** create a project, open *SQL Editor*, run `database/database.sql`, then (optional) `database/demo_data.sql`.
   In *Authentication → Sign In / Providers → Email* turn **off** "Confirm email" for easy testing.
2. Put your **Project URL** and **anon (publishable) key** in `js/config.js`. Never use the `service_role` key.
3. Open the folder with any static server, for example `python -m http.server 8080`, then visit http://localhost:8080.
4. To become admin: register on the site, then run in the SQL Editor:
   `update customers set role = 'admin' where email = 'YOUR_EMAIL';`
5. **Deploy:** GitHub → Settings → Pages → Deploy from branch `main`, folder `/ (root)`.
   Then set Supabase → Authentication → URL Configuration → *Site URL* to the Pages URL.

## Folder structure

```
index.html  products.html  product-detail.html  cart.html  checkout.html  confirmation.html
login.html  register.html  my-orders.html  admin.html  about.html
css/style.css
js/  config.js  app.js  auth.js  cart.js  products.js  product-detail.js  checkout.js  orders.js  admin.js  home.js
images/        (original SVG illustrations created for this project)
database/      database.sql  demo_data.sql
```

## Security summary

Public key only in the code; RLS on every table; column-level privileges; price, stock and totals decided by
database triggers; all output escaped (XSS); Content-Security-Policy and subresource integrity; local-only `?next=`
redirects. Full review with the five risks and policy code: `security_review.md`.

## AI-use declaration

An AI assistant (Claude, by Anthropic) was used to help write and test the code, review its security, and draft the documentation. I checked the results and can explain the code.
