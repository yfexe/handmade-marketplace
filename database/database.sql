-- =====================================================================
-- Turath - Handmade Gulf Crafts Marketplace  |  INT424 Final Project
-- database.sql : tables, constraints, triggers, Row Level Security,
--                admin analytics functions and sample catalogue data.
--
-- HOW TO RUN: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
-- It is safe to re-run: it DROPS and recreates the shop tables first
-- (this deletes shop data, never the Supabase auth users).
-- After it, optionally run demo_data.sql (demo customers/orders/reviews).
-- =====================================================================

-- ---------- 0. clean slate -------------------------------------------
drop trigger  if exists on_auth_user_created on auth.users;
drop table    if exists reviews     cascade;
drop table    if exists order_items cascade;
drop table    if exists orders      cascade;
drop table    if exists product     cascade;
drop table    if exists category    cascade;
drop table    if exists customers   cascade;
drop function if exists handle_new_user()          cascade;
drop function if exists is_admin()                 cascade;
drop function if exists admin_stats()              cascade;
drop function if exists admin_top_products(int)    cascade;
drop function if exists admin_sales_by_category()  cascade;
drop function if exists admin_sales_by_day(int)    cascade;
drop function if exists orders_defaults()           cascade;
drop function if exists order_items_before_insert() cascade;
drop function if exists order_items_after_insert()  cascade;
drop function if exists orders_status_change()      cascade;
drop function if exists reviews_before_insert()     cascade;
-- remove the fake demo users (see demo_data.sql) so a full reset starts clean
delete from auth.users where email like '%.demo@example.com';

-- ---------- 1. tables --------------------------------------------------
create table category (
  id           int generated always as identity primary key,
  name         text not null unique check (char_length(name) between 2 and 60),
  description  text
);

create table product (
  id           int generated always as identity primary key,
  category_id  int not null references category(id),
  name         text not null check (char_length(name) between 2 and 120),
  description  text not null default '',
  price        numeric(10,2) not null check (price >= 0),          -- AED, before VAT
  stock        int  not null default 0 check (stock >= 0),         -- DB refuses overselling
  image_url    text not null default 'images/placeholder.svg'
               check (image_url ~ '^(images/[A-Za-z0-9_.-]+|https://[^\s"''<>]+)$'),   -- local file or https link only
  artisan      text not null,                                       -- the maker
  occasions    text[] not null default '{}',                        -- used by the Gift Finder
  created_at   timestamptz not null default now()
);

-- one row per registered user; id is the same uuid as Supabase Auth (auth.users)
create table customers (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null check (char_length(full_name) between 2 and 80),
  email       text not null,
  phone       text,
  address     text,
  role        text not null default 'customer' check (role in ('customer','admin')),
  created_at  timestamptz not null default now()
);

create table orders (
  id               int generated always as identity primary key,
  customer_id      uuid not null references customers(id),
  order_date       timestamptz not null default now(),
  status           text not null default 'Placed'
                   check (status in ('Placed','Shipped','Delivered','Cancelled')),
  subtotal         numeric(10,2) not null default 0 check (subtotal >= 0),     -- set by trigger
  vat_amount       numeric(10,2) not null default 0 check (vat_amount >= 0),   -- 5% UAE VAT, set by trigger
  total_amount     numeric(10,2) not null default 0 check (total_amount >= 0), -- set by trigger
  shipping_name    text not null check (char_length(shipping_name) between 2 and 80),
  shipping_phone   text not null check (char_length(shipping_phone) between 7 and 20),
  shipping_address text not null check (char_length(shipping_address) between 5 and 250),
  emirate          text not null check (emirate in
                   ('Abu Dhabi','Dubai','Sharjah','Ajman','Umm Al Quwain','Ras Al Khaimah','Fujairah')),
  payment_method   text not null default 'Cash on delivery' check (payment_method = 'Cash on delivery')
);

create table order_items (
  id          int generated always as identity primary key,
  order_id    int not null references orders(id) on delete cascade,
  product_id  int not null references product(id),
  quantity    int not null check (quantity between 1 and 20),
  unit_price  numeric(10,2) not null default 0 check (unit_price >= 0),         -- copied from product by trigger
  unique (order_id, product_id)
);

create table reviews (
  id             int generated always as identity primary key,
  product_id     int  not null references product(id) on delete cascade,
  customer_id    uuid not null references customers(id) on delete cascade,
  reviewer_name  text not null default '',                                     -- set by trigger
  rating         int  not null check (rating between 1 and 5),
  comment        text not null default '' check (char_length(comment) <= 500),
  created_at     timestamptz not null default now(),
  unique (product_id, customer_id)                                             -- one review per buyer per product
);

create index on product(category_id);
create index on orders(customer_id);
create index on order_items(order_id);
create index on reviews(product_id);

-- ---------- 2. helper: is the current user an admin? -------------------
-- SECURITY DEFINER avoids the "infinite recursion in policy" error that happens
-- when a policy on `customers` reads `customers` directly.
create function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from customers where id = auth.uid() and role = 'admin');
$$;
grant execute on function is_admin() to anon, authenticated;

-- ---------- 3. triggers (business rules enforced inside the database) ---
-- 3a. every new Supabase Auth user automatically gets a customers row
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare nm text; ph text;
begin
  nm := left(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), 80);
  if char_length(nm) < 2 then nm := left(split_part(new.email, '@', 1), 80); end if;
  if char_length(nm) < 2 then nm := 'Customer'; end if;
  ph := left(nullif(trim(coalesce(new.raw_user_meta_data->>'phone', '')), ''), 20);
  insert into customers (id, full_name, email, phone) values (new.id, nm, new.email, ph);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- 3b. a signed-in customer can never choose totals, status or date of a new order,
--     and can have at most 3 open ('Placed') orders at once (stops stock hoarding)
create function orders_defaults() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null then
    if (select count(*) from orders where customer_id = new.customer_id and status = 'Placed') >= 3 then
      raise exception 'You already have 3 open orders. Please wait for them to ship, or cancel one.';
    end if;
    new.status := 'Placed'; new.order_date := now();
    new.subtotal := 0; new.vat_amount := 0; new.total_amount := 0;
  end if;
  return new;
end $$;
create trigger trg_orders_defaults before insert on orders
  for each row execute function orders_defaults();

-- 3c. on every order line: take the REAL price from `product`, check and reduce stock
create function order_items_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare p product%rowtype;
begin
  perform 1 from orders where id = new.order_id and status = 'Placed' for share;   -- waits for a concurrent cancel
  if not found then raise exception 'This order is no longer open'; end if;
  select * into p from product where id = new.product_id for update;
  if not found then raise exception 'Product % does not exist', new.product_id; end if;
  if p.stock < new.quantity then
    raise exception 'Not enough stock for "%" (only % left)', p.name, p.stock using errcode = 'P0001';
  end if;
  new.unit_price := p.price;                       -- client-sent price is ignored
  update product set stock = stock - new.quantity where id = new.product_id;
  return new;
end $$;
create trigger trg_order_items_before_insert before insert on order_items
  for each row execute function order_items_before_insert();

-- 3d. recalculate the order totals (subtotal + 5% VAT) after each line
create function order_items_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare s numeric(10,2);
begin
  select coalesce(sum(quantity * unit_price), 0) into s from order_items where order_id = new.order_id;
  update orders set subtotal = s, vat_amount = round(s * 0.05, 2), total_amount = round(s * 1.05, 2)
   where id = new.order_id;
  return new;
end $$;
create trigger trg_order_items_after_insert after insert on order_items
  for each row execute function order_items_after_insert();

-- 3e. cancelling an order puts the stock back (and removes reviews that depended on it); it stays cancelled
create function orders_status_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'Cancelled' then
    raise exception 'A cancelled order cannot be changed';
  end if;
  if new.status = 'Cancelled' then
    update product p set stock = p.stock + oi.quantity
      from order_items oi where oi.order_id = new.id and oi.product_id = p.id;
    -- anti fake-review: a review is only kept while the customer still has a non-cancelled order for that product
    delete from reviews r
     where r.customer_id = new.customer_id
       and r.product_id in (select product_id from order_items where order_id = new.id)
       and not exists (select 1 from order_items oi join orders o on o.id = oi.order_id
                       where o.customer_id = new.customer_id and o.status <> 'Cancelled'
                         and o.id <> new.id and oi.product_id = r.product_id);
  end if;
  return new;
end $$;
create trigger trg_orders_status_change after update of status on orders
  for each row when (old.status is distinct from new.status)
  execute function orders_status_change();

-- 3f. store a short public name with each review (customers table is private)
create function reviews_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare n text;
begin
  perform 1 from orders o join order_items oi on oi.order_id = o.id
   where o.customer_id = new.customer_id and oi.product_id = new.product_id and o.status <> 'Cancelled'
   for share of o;                                                                  -- waits for a concurrent cancel
  if not found then raise exception 'Only customers with a valid order can review this product'; end if;
  select full_name into n from customers where id = new.customer_id;
  new.reviewer_name := split_part(n, ' ', 1) ||
                       case when split_part(n, ' ', 2) <> '' then ' ' || left(split_part(n, ' ', 2), 1) || '.' else '' end;
  return new;
end $$;
create trigger trg_reviews_before_insert before insert on reviews
  for each row execute function reviews_before_insert();

-- ---------- 4. Row Level Security ---------------------------------------
alter table category    enable row level security;
alter table product     enable row level security;
alter table customers   enable row level security;
alter table orders      enable row level security;
alter table order_items enable row level security;
alter table reviews     enable row level security;

-- Table privileges (layer 1). Row Level Security (layer 2, below) then decides WHICH rows.
-- Start from nothing and grant only what the site needs: the public (anon) key can only
-- READ the catalogue and reviews, and signed-in users may only change the columns listed.
revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on category, product, reviews to anon;
grant select on category, product, reviews, customers, orders, order_items to authenticated;
grant insert, update, delete on category to authenticated;                   -- RLS: admin only
grant insert, update, delete on product  to authenticated;                   -- RLS: admin only
grant insert (customer_id, shipping_name, shipping_phone, shipping_address, emirate, payment_method)
  on orders to authenticated;                                                 -- RLS: own order only
grant insert (order_id, product_id, quantity) on order_items to authenticated; -- price comes from the trigger
grant insert (product_id, customer_id, rating, comment) on reviews to authenticated; -- RLS: verified buyer
grant delete on reviews to authenticated;                                     -- RLS: owner or admin
grant update (full_name, phone, address) on customers to authenticated;       -- 'role' can NOT be changed
grant update (status)  on orders  to authenticated;                           -- cancel (own) / status (admin)
grant update (rating, comment) on reviews to authenticated;

-- category + product: everybody reads, only admins write
create policy "category_read"  on category for select to anon, authenticated using (true);
create policy "category_admin" on category for all    to authenticated using (is_admin()) with check (is_admin());
create policy "product_read"   on product  for select to anon, authenticated using (true);
create policy "product_insert" on product  for insert to authenticated with check (is_admin());
create policy "product_update" on product  for update to authenticated using (is_admin()) with check (is_admin());
create policy "product_delete" on product  for delete to authenticated using (is_admin());

-- customers: you see and edit only your own row; admins can read all (for orders screen)
create policy "customers_select_own"   on customers for select to authenticated using (id = auth.uid());
create policy "customers_select_admin" on customers for select to authenticated using (is_admin());
create policy "customers_update_own"   on customers for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- orders: owner reads/creates; owner may only CANCEL a 'Placed' order; admin reads/updates status
create policy "orders_select_own"    on orders for select to authenticated using (customer_id = auth.uid());
create policy "orders_select_admin"  on orders for select to authenticated using (is_admin());
create policy "orders_insert_own"    on orders for insert to authenticated with check (customer_id = auth.uid());
create policy "orders_cancel_own"    on orders for update to authenticated
  using (customer_id = auth.uid() and status = 'Placed')
  with check (customer_id = auth.uid() and status = 'Cancelled');
create policy "orders_update_admin"  on orders for update to authenticated
  using (is_admin()) with check (is_admin());

-- order_items: visible through the order's owner; insert only into your own brand-new order
create policy "items_select" on order_items for select to authenticated
  using (is_admin() or exists (select 1 from orders o where o.id = order_id and o.customer_id = auth.uid()));
create policy "items_insert_own" on order_items for insert to authenticated
  with check (exists (select 1 from orders o
                      where o.id = order_id and o.customer_id = auth.uid()
                        and o.status = 'Placed' and o.order_date > now() - interval '15 minutes'));

-- reviews: public reading; only VERIFIED BUYERS (non-cancelled order containing the product) can write
create policy "reviews_read" on reviews for select to anon, authenticated using (true);
create policy "reviews_insert_buyer" on reviews for insert to authenticated
  with check (customer_id = auth.uid() and exists (
    select 1 from order_items oi join orders o on o.id = oi.order_id
    where o.customer_id = auth.uid() and o.status <> 'Cancelled' and oi.product_id = reviews.product_id));
create policy "reviews_update_own" on reviews for update to authenticated
  using (customer_id = auth.uid()) with check (customer_id = auth.uid());
create policy "reviews_delete_own_or_admin" on reviews for delete to authenticated
  using (customer_id = auth.uid() or is_admin());

-- ---------- 5. analytics functions (admin only, aggregates only) ---------
create function admin_stats() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admin only' using errcode = '42501'; end if;
  return json_build_object(
    'total_products',  (select count(*) from product),
    'total_orders',    (select count(*) from orders where status <> 'Cancelled'),
    'total_sales',     (select coalesce(sum(total_amount), 0) from orders where status <> 'Cancelled'),
    'total_customers', (select count(*) from customers where role = 'customer'),
    'total_reviews',   (select count(*) from reviews),
    'avg_rating',      (select coalesce(round(avg(rating), 2), 0) from reviews),
    'low_stock_count', (select count(*) from product where stock <= 5)
  );
end $$;

create function admin_top_products(lim int default 5)
returns table (product_id int, name text, units_sold bigint, revenue numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admin only' using errcode = '42501'; end if;
  return query
    select p.id, p.name, sum(oi.quantity)::bigint, sum(oi.quantity * oi.unit_price)
      from order_items oi join orders o on o.id = oi.order_id join product p on p.id = oi.product_id
     where o.status <> 'Cancelled'
     group by p.id, p.name order by 3 desc, 4 desc limit lim;
end $$;

create function admin_sales_by_category()
returns table (category text, units bigint, revenue numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admin only' using errcode = '42501'; end if;
  return query
    select c.name, coalesce(sum(oi.quantity), 0)::bigint, coalesce(sum(oi.quantity * oi.unit_price), 0)
      from category c
      left join product p on p.category_id = c.id
      left join order_items oi on oi.product_id = p.id
      left join orders o on o.id = oi.order_id and o.status <> 'Cancelled'
     where o.id is not null or oi.id is null
     group by c.name order by 3 desc;
end $$;

create function admin_sales_by_day(days int default 30)
returns table (day date, orders bigint, sales numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admin only' using errcode = '42501'; end if;
  return query
    select d::date,
           count(o.id)::bigint,
           coalesce(sum(o.total_amount), 0)
      from generate_series(current_date - (days - 1), current_date, interval '1 day') d
      left join orders o on o.order_date::date = d::date and o.status <> 'Cancelled'
     group by d order by d;
end $$;

revoke execute on function admin_stats(), admin_top_products(int), admin_sales_by_category(),
                           admin_sales_by_day(int) from public, anon;
grant  execute on function admin_stats(), admin_top_products(int), admin_sales_by_category(),
                           admin_sales_by_day(int) to authenticated;

-- ---------- 6. sample catalogue --------------------------------------
insert into category (name, description) values
  ('Jewelry',     'Silver, pearl and bead pieces inspired by Gulf heritage'),
  ('Decorations', 'Wall art, vases and woven pieces for the home'),
  ('Candles',     'Hand-poured candles with oud, rose and saffron scents'),
  ('Accessories', 'Bags, holders and everyday pieces made by hand'),
  ('Gifts',       'Ready-to-give boxes and hampers for every occasion');

insert into product (category_id, name, description, price, stock, image_url, artisan, occasions) values
 ((select id from category where name='Jewelry'),'Silver Filigree Bracelet','Fine silver wire bracelet shaped by hand in the traditional filigree style. Adjustable clasp.',185,12,'images/p01.svg','Maryam Al Ketbi','{Eid,Wedding,Birthday}'),
 ((select id from category where name='Jewelry'),'Pearl Drop Earrings','Freshwater pearls set in hand-bent silver hooks, inspired by the Gulf pearl-diving heritage.',240,8,'images/p02.svg','Maryam Al Ketbi','{Wedding,Eid,Anniversary}'),
 ((select id from category where name='Jewelry'),'Sadu-Thread Beaded Necklace','Colourful glass beads strung on hand-twisted Sadu-pattern thread. Lightweight and bright.',120,15,'images/p03.svg','Hessa Al Mazrouei','{Birthday,Graduation}'),
 ((select id from category where name='Jewelry'),'Hand-Stamped Name Pendant','Small brass pendant stamped letter by letter with the name or word of your choice.',95,3,'images/p04.svg','Omar Al Falasi','{Birthday,Graduation,Anniversary}'),

 ((select id from category where name='Decorations'),'Sadu-Weave Wall Hanging','Wool wall hanging woven on a traditional loom in classic red, black and cream Sadu geometry.',320,6,'images/p05.svg','Aisha Al Dhaheri','{Housewarming,Wedding}'),
 ((select id from category where name='Decorations'),'Hand-Painted Ceramic Vase','Glazed ceramic vase painted by hand with desert-flower patterns. Each piece is slightly different.',210,9,'images/p06.svg','Khalid Al Suwaidi','{Housewarming,Anniversary}'),
 ((select id from category where name='Decorations'),'Arabic Calligraphy Canvas','Hand-lettered Arabic calligraphy on canvas, in a gold and teal colour mix. Ready to hang.',275,4,'images/p07.svg','Yousef Al Hashimi','{Housewarming,Ramadan,Eid}'),
 ((select id from category where name='Decorations'),'Date-Palm Leaf Basket','Storage basket woven from date-palm leaves using the Khoos craft. Strong and natural.',85,20,'images/p08.svg','Salma Al Nuaimi','{Housewarming}'),

 ((select id from category where name='Candles'),'Oud & Amber Soy Candle','Slow-burning soy wax candle with warm oud and amber. About 40 hours of burn time.',75,25,'images/p09.svg','Reem Al Qasimi','{Eid,Housewarming,Birthday}'),
 ((select id from category where name='Candles'),'Rose & Saffron Candle','Floral rose and saffron scent in a reusable glass jar, hand-poured in small batches.',70,18,'images/p10.svg','Reem Al Qasimi','{Birthday,Anniversary,Eid}'),
 ((select id from category where name='Candles'),'Arabian Nights Candle Set (3)','Gift set of three mini candles: oud, rose and sandalwood. Comes in a keepsake box.',160,10,'images/p11.svg','Reem Al Qasimi','{Eid,Ramadan,Housewarming,Birthday}'),
 ((select id from category where name='Candles'),'Ramadan Lantern Candle','Candle in a hand-cut metal lantern that throws a star pattern of light on the walls.',90,2,'images/p12.svg','Hessa Al Mazrouei','{Ramadan,Eid}'),

 ((select id from category where name='Accessories'),'Hand-Embroidered Tote Bag','Cotton tote with hand embroidery in a Gulf floral design. Roomy, with an inside pocket.',130,14,'images/p13.svg','Fatima Al Marri','{Birthday,Graduation}'),
 ((select id from category where name='Accessories'),'Leather Passport Holder','Vegetable-tanned leather holder, stitched by hand, with a name stamp on request.',110,11,'images/p14.svg','Omar Al Falasi','{Graduation,Birthday}'),
 ((select id from category where name='Accessories'),'Silk Hair Scrunchie Set','Set of three hand-sewn silk scrunchies in sand, teal and terracotta.',45,30,'images/p15.svg','Fatima Al Marri','{Birthday}'),
 ((select id from category where name='Accessories'),'Woven Sadu Keychain','Small keychain woven in Sadu pattern with a brass ring. A budget-friendly gift.',35,40,'images/p16.svg','Aisha Al Dhaheri','{Birthday,Graduation,Eid}'),

 ((select id from category where name='Gifts'),'Dallah Coffee Gift Box','Mini brass dallah, two cups and cardamom coffee blend, packed in a wooden box.',260,7,'images/p17.svg','Khalid Al Suwaidi','{Eid,Ramadan,Housewarming,Wedding}'),
 ((select id from category where name='Gifts'),'Date & Oud Gift Hamper','Premium dates, a small oud chip burner and a hand-woven tray. Wrapped to order.',340,5,'images/p18.svg','Salma Al Nuaimi','{Eid,Ramadan,Wedding}'),
 ((select id from category where name='Gifts'),'Personalised Henna Kit','Natural henna cones, design cards and a hand-made carry pouch. A fun gift for friends.',150,12,'images/p19.svg','Latifa Al Shamsi','{Eid,Birthday,Wedding}'),
 ((select id from category where name='Gifts'),'Mini Incense Burner (Mabkhara)','Hand-finished clay mabkhara with bakhoor samples. A small piece of Gulf hospitality.',145,6,'images/p20.svg','Latifa Al Shamsi','{Eid,Ramadan,Housewarming}');

-- ---------- 7. after you register your own account, make it admin --------
-- (run this line yourself in the SQL Editor, replacing the e-mail)
--   update customers set role = 'admin' where email = 'YOUR_EMAIL_HERE';
