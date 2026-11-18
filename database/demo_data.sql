-- =====================================================================
-- demo_data.sql : OPTIONAL demo customers, orders and reviews so the
-- analytics dashboard and product ratings are not empty.
-- Run it AFTER database.sql, in Supabase -> SQL Editor.
-- The demo customers are fake (…@example.com) and have no password,
-- so nobody can log in as them. Do not run twice (it would double the orders).
-- =====================================================================

-- ---------- demo customers (the trigger in database.sql creates their customers rows)
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
select '00000000-0000-0000-0000-000000000000', t.id, 'authenticated', 'authenticated', t.email,
       '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('full_name', t.full_name), now(), now(), now()
from (values
  ('11111111-1111-1111-1111-111111111101'::uuid, 'Fatima Al Mansoori', 'fatima.demo@example.com'),
  ('11111111-1111-1111-1111-111111111102'::uuid, 'Ahmed Khan',         'ahmed.demo@example.com'),
  ('11111111-1111-1111-1111-111111111103'::uuid, 'Sara Thomas',        'sara.demo@example.com'),
  ('11111111-1111-1111-1111-111111111104'::uuid, 'Mohammed Al Shehhi', 'mohammed.demo@example.com'),
  ('11111111-1111-1111-1111-111111111105'::uuid, 'Priya Nair',         'priya.demo@example.com'),
  ('11111111-1111-1111-1111-111111111106'::uuid, 'Layla Hassan',       'layla.demo@example.com')
) as t(id, full_name, email)
on conflict (id) do nothing;

-- ---------- demo orders (n = order number, cust = customer, days_ago = age)
create temp table seed_orders (n int, cust uuid, days_ago int, status text, pname text, qty int);
insert into seed_orders values
 (1,'11111111-1111-1111-1111-111111111101',28,'Delivered','Oud & Amber Soy Candle',2),
 (1,'11111111-1111-1111-1111-111111111101',28,'Delivered','Silver Filigree Bracelet',1),
 (2,'11111111-1111-1111-1111-111111111102',26,'Delivered','Dallah Coffee Gift Box',1),
 (3,'11111111-1111-1111-1111-111111111103',24,'Delivered','Hand-Embroidered Tote Bag',1),
 (3,'11111111-1111-1111-1111-111111111103',24,'Delivered','Woven Sadu Keychain',3),
 (4,'11111111-1111-1111-1111-111111111104',22,'Delivered','Sadu-Weave Wall Hanging',1),
 (5,'11111111-1111-1111-1111-111111111105',20,'Delivered','Rose & Saffron Candle',2),
 (5,'11111111-1111-1111-1111-111111111105',20,'Delivered','Arabian Nights Candle Set (3)',1),
 (6,'11111111-1111-1111-1111-111111111106',18,'Delivered','Pearl Drop Earrings',1),
 (7,'11111111-1111-1111-1111-111111111101',15,'Delivered','Date & Oud Gift Hamper',1),
 (8,'11111111-1111-1111-1111-111111111102',13,'Delivered','Oud & Amber Soy Candle',1),
 (8,'11111111-1111-1111-1111-111111111102',13,'Delivered','Leather Passport Holder',1),
 (9,'11111111-1111-1111-1111-111111111103',11,'Shipped','Personalised Henna Kit',2),
 (10,'11111111-1111-1111-1111-111111111104',9,'Delivered','Hand-Painted Ceramic Vase',1),
 (11,'11111111-1111-1111-1111-111111111105',7,'Delivered','Silk Hair Scrunchie Set',2),
 (11,'11111111-1111-1111-1111-111111111105',7,'Delivered','Woven Sadu Keychain',2),
 (12,'11111111-1111-1111-1111-111111111106',5,'Shipped','Mini Incense Burner (Mabkhara)',1),
 (12,'11111111-1111-1111-1111-111111111106',5,'Shipped','Oud & Amber Soy Candle',1),
 (13,'11111111-1111-1111-1111-111111111101',3,'Placed','Sadu-Thread Beaded Necklace',1),
 (14,'11111111-1111-1111-1111-111111111102',2,'Cancelled','Arabic Calligraphy Canvas',1),
 (15,'11111111-1111-1111-1111-111111111103',1,'Placed','Dallah Coffee Gift Box',1),
 (15,'11111111-1111-1111-1111-111111111103',1,'Placed','Rose & Saffron Candle',1);

do $$
declare o record; oid int;
begin
  for o in select distinct n, cust, days_ago, status from seed_orders order by n loop
    insert into orders (customer_id, order_date, shipping_name, shipping_phone, shipping_address, emirate)
    select o.cust, now() - make_interval(days => o.days_ago) + interval '10 hours',
           c.full_name, '0501234567', 'Demo address, Building 1', 'Dubai'
      from customers c where c.id = o.cust
    returning id into oid;

    insert into order_items (order_id, product_id, quantity)
    select oid, p.id, s.qty from seed_orders s join product p on p.name = s.pname where s.n = o.n;

    if o.status <> 'Placed' then
      update orders set status = o.status where id = oid;
    end if;
  end loop;
end $$;
drop table seed_orders;

-- ---------- demo reviews (all from customers who bought the product)
insert into reviews (product_id, customer_id, rating, comment)
select p.id, r.cust::uuid, r.rating, r.comment
from (values
  ('Oud & Amber Soy Candle',        '11111111-1111-1111-1111-111111111101', 5, 'Smells amazing and the whole room feels warm. It burned for days.'),
  ('Oud & Amber Soy Candle',        '11111111-1111-1111-1111-111111111102', 4, 'Strong oud scent. I would like a bigger size.'),
  ('Silver Filigree Bracelet',      '11111111-1111-1111-1111-111111111101', 5, 'Beautiful detail work. I wore it at Eid and got many compliments.'),
  ('Dallah Coffee Gift Box',        '11111111-1111-1111-1111-111111111102', 5, 'Perfect gift for my parents. The packing was lovely.'),
  ('Hand-Embroidered Tote Bag',     '11111111-1111-1111-1111-111111111103', 4, 'Nice stitching and strong handles. The colours are a little darker than the photo.'),
  ('Sadu-Weave Wall Hanging',       '11111111-1111-1111-1111-111111111104', 5, 'A real statement piece for my living room.'),
  ('Rose & Saffron Candle',         '11111111-1111-1111-1111-111111111105', 4, 'Soft floral scent, not too strong.'),
  ('Arabian Nights Candle Set (3)', '11111111-1111-1111-1111-111111111105', 5, 'Gave it as a gift and my friend loved the box.'),
  ('Pearl Drop Earrings',           '11111111-1111-1111-1111-111111111106', 5, 'Light, elegant and well made.'),
  ('Date & Oud Gift Hamper',        '11111111-1111-1111-1111-111111111101', 4, 'Generous hamper. Delivery took three days.'),
  ('Hand-Painted Ceramic Vase',     '11111111-1111-1111-1111-111111111104', 5, 'Each piece is unique. Mine has lovely blue flowers.'),
  ('Woven Sadu Keychain',           '11111111-1111-1111-1111-111111111105', 3, 'Cute, but smaller than I expected.')
) as r(pname, cust, rating, comment)
join product p on p.name = r.pname;
