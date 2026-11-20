-- The cities Upa covers. Reference data, so it ships as a migration (it has to
-- exist on the live database), unlike the demo hosts and stays in seed.sql.
-- dotproperty_path is the city's path on dotproperty.com.ph (checked 2026-11-20);
-- null means stays only, no market data.

insert into public.cities (slug, name, province, region, is_metro_manila, center, dotproperty_path, sort)
select slug, name, province, region, mm, extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography, path, sort
from (values
  ('makati',         'Makati',         'Metro Manila',       'NCR',         true,  14.5547, 121.0244, 'metro-manila/makati',             10),
  ('taguig',         'Taguig (BGC)',   'Metro Manila',       'NCR',         true,  14.5409, 121.0503, 'metro-manila/taguig',             11),
  ('pasig',          'Pasig (Ortigas)','Metro Manila',       'NCR',         true,  14.5869, 121.0614, 'metro-manila/pasig',              12),
  ('quezon-city',    'Quezon City',    'Metro Manila',       'NCR',         true,  14.6760, 121.0437, 'metro-manila/quezon-city',        13),
  ('mandaluyong',    'Mandaluyong',    'Metro Manila',       'NCR',         true,  14.5794, 121.0359, 'metro-manila/mandaluyong',        14),
  ('manila',         'Manila',         'Metro Manila',       'NCR',         true,  14.5995, 120.9842, 'metro-manila/manila',             15),
  ('pasay',          'Pasay',          'Metro Manila',       'NCR',         true,  14.5378, 121.0014, 'metro-manila/pasay',              16),
  ('paranaque',      'Parañaque',      'Metro Manila',       'NCR',         true,  14.4793, 121.0198, null,                              17),
  ('cebu-city',      'Cebu City',      'Cebu',               'Central Visayas', false, 10.3157, 123.8854, 'cebu/cebu-city',          20),
  ('lapu-lapu',      'Lapu-Lapu (Mactan)', 'Cebu',           'Central Visayas', false, 10.3103, 123.9494, 'cebu/lapu-lapu',          21),
  ('davao-city',     'Davao City',     'Davao del Sur',      'Davao Region', false,  7.1907, 125.4553, 'davao-del-sur/davao-city',      30),
  ('cagayan-de-oro', 'Cagayan de Oro', 'Misamis Oriental',   'Northern Mindanao', false, 8.4542, 124.6319, 'misamis-oriental/cagayan-de-oro', 31),
  ('iloilo-city',    'Iloilo City',    'Iloilo',             'Western Visayas', false, 10.7202, 122.5621, 'iloilo/iloilo-city',      32),
  ('baguio',         'Baguio',         'Benguet',            'CAR',          false, 16.4023, 120.5960, 'benguet/baguio',                40),
  ('tagaytay',       'Tagaytay',       'Cavite',             'CALABARZON',   false, 14.1153, 120.9621, 'cavite/tagaytay',               41),
  ('boracay',        'Boracay (Malay)','Aklan',              'Western Visayas', false, 11.9674, 121.9248, null,                     50),
  ('siargao',        'Siargao (General Luna)', 'Surigao del Norte', 'Caraga', false, 9.7868, 126.1597, null,                     51),
  ('el-nido',        'El Nido',        'Palawan',            'MIMAROPA',     false, 11.1956, 119.4075, null,                         52)
) as v(slug, name, province, region, mm, lat, lng, path, sort);
