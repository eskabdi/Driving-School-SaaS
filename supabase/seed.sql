-- Bootstrap seed (spec §8.4). Idempotent: safe to run repeatedly.
-- Creates platform plans and the global Ethiopian license categories.
-- The first super_admin is created out-of-band by scripts/bootstrap-super-admin.ts.

-- Platform billing plans -----------------------------------------------------
insert into public.plans (code, name, monthly_price_etb, limits) values
  ('starter',  'Starter',  1500.00, '{"max_learners":100,"max_branches":1,"max_instructors":5,"sms_credits":500,"storage_gb":5}'),
  ('standard', 'Standard', 3500.00, '{"max_learners":500,"max_branches":3,"max_instructors":20,"sms_credits":2500,"storage_gb":25}'),
  ('pro',      'Pro',      7500.00, '{"max_learners":2000,"max_branches":10,"max_instructors":100,"sms_credits":10000,"storage_gb":100}')
on conflict (code) do update
  set name = excluded.name,
      monthly_price_etb = excluded.monthly_price_etb,
      limits = excluded.limits;

-- Ethiopian license categories (codes 1–6) ----------------------------------
insert into public.license_categories (code, name_en, name_am, name_om, sort_order) values
  ('1', 'Category 1 — Motorcycle',        'ደረጃ 1 — ሞተር ሳይክል',      'Sadarkaa 1 — Motora',            1),
  ('2', 'Category 2 — Automobile',        'ደረጃ 2 — አውቶሞቢል',        'Sadarkaa 2 — Otomobiilii',       2),
  ('3', 'Category 3 — Public I (Taxi)',   'ደረጃ 3 — የህዝብ 1 (ታክሲ)',  'Sadarkaa 3 — Uummataa 1 (Taaksii)', 3),
  ('4', 'Category 4 — Public II (Bus)',   'ደረጃ 4 — የህዝብ 2 (አውቶቡስ)', 'Sadarkaa 4 — Uummataa 2 (Awtoobisii)', 4),
  ('5', 'Category 5 — Truck / Dry Cargo', 'ደረጃ 5 — ጭነት (ደረቅ)',     'Sadarkaa 5 — Feʼumsa (Gogaa)',   5),
  ('6', 'Category 6 — Fuel Tanker',       'ደረጃ 6 — የነዳጅ ታንከር',     'Sadarkaa 6 — Taankara Boba''aa', 6)
on conflict (code) do update
  set name_en = excluded.name_en,
      name_am = excluded.name_am,
      name_om = excluded.name_om,
      sort_order = excluded.sort_order;
