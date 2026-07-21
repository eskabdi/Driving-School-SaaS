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

-- Ethiopian license categories — Proclamation No. 1074/2018 Schedule ---------
-- Seven categories; Public Transport (4), Truck (5) and Fuel Tanker (6) have
-- sub-levels. min_age / min_grade come from Article 12 (Age & Education).
insert into public.license_categories
  (code, category_no, level, name_en, name_am, name_om, vehicle_description, min_age, min_grade, sort_order) values
  ('1',   1, null, 'Motorcycle',                    'ሞተር ሳይክል',               'Motora',
    'Motorcycle with two wheels', 18, 4, 10),
  ('2',   2, null, 'Three-Wheel Motorcycle',        'ባለሶስት ጎማ ሞተር ሳይክል',      'Motora kofata sadii',
    'Any motor vehicle with three wheels', 20, 10, 20),
  ('3',   3, null, 'Automobile',                    'አውቶሞቢል',                 'Otomobiilii',
    'Any motor vehicle with capacity of up to 8 seats and loading capacity of up to 10,000 kg', 18, 4, 30),

  ('4-1', 4, 'I',   'Public Transport — Level I',   'የሕዝብ ማመላለሻ — ደረጃ 1',      'Geejjiba Uummataa — Sadarkaa I',
    'Any public transport with a capacity of up to 20 seats, plus Automobile category', 22, 10, 41),
  ('4-2', 4, 'II',  'Public Transport — Level II',  'የሕዝብ ማመላለሻ — ደረጃ 2',      'Geejjiba Uummataa — Sadarkaa II',
    'Any public transport with a capacity of up to 45 seats, plus Automobile category', 24, 10, 42),
  ('4-3', 4, 'III', 'Public Transport — Level III', 'የሕዝብ ማመላለሻ — ደረጃ 3',      'Geejjiba Uummataa — Sadarkaa III',
    'Any public transport, plus Automobile category', 26, 10, 43),

  ('5-1', 5, 'I',   'Truck — Level I',              'የጭነት መኪና — ደረጃ 1',        'Konkolaataa Feʼumsaa — Sadarkaa I',
    'A truck with a loading capacity of up to 3,500 kg, plus Automobile category', 22, 10, 51),
  ('5-2', 5, 'II',  'Truck — Level II',             'የጭነት መኪና — ደረጃ 2',        'Konkolaataa Feʼumsaa — Sadarkaa II',
    'Any truck without a trailer, or with a crane of lifting capacity up to 18 ton, plus Automobile category', 24, 10, 52),
  ('5-3', 5, 'III', 'Truck — Level III',            'የጭነት መኪና — ደረጃ 3',        'Konkolaataa Feʼumsaa — Sadarkaa III',
    'Any truck with or without a trailer and with or without a crane, plus Automobile category', 26, 10, 53),

  ('6-1', 6, 'I',   'Fuel Tanker — Level I',        'የነዳጅ ታንከር — ደረጃ 1',        'Taankara Boba''aa — Sadarkaa I',
    'Fuel or liquid tanker without a trailer with a loading capacity of up to 18,000 liters, plus Automobile category', 24, 10, 61),
  ('6-2', 6, 'II',  'Fuel Tanker — Level II',       'የነዳጅ ታንከር — ደረጃ 2',        'Taankara Boba''aa — Sadarkaa II',
    'Any fuel or liquid tanker with or without a trailer, plus Automobile category', 26, 10, 62),

  ('7',   7, null, 'Machinery Operator',            'የማሽነሪ ኦፕሬተር',            'Oppireetara Maashinarii',
    'Only the type and capacity of machinery permitted in the license category', 20, 10, 70)
on conflict (code) do update
  set category_no = excluded.category_no,
      level = excluded.level,
      name_en = excluded.name_en,
      name_am = excluded.name_am,
      name_om = excluded.name_om,
      vehicle_description = excluded.vehicle_description,
      min_age = excluded.min_age,
      min_grade = excluded.min_grade,
      sort_order = excluded.sort_order;
