-- Local development seed (never applied to production).
insert into public.churches (name, address, city, state, zip, latitude, longitude, denomination, website, source, status)
values
  ('Grace Church Tampa', '100 Main St', 'Tampa', 'FL', '33601', 27.9506, -82.4572, 'Non-Denominational', 'https://gracetampa.org', 'seed', 'approved'),
  ('Hope Church Orlando', '200 Orange Ave', 'Orlando', 'FL', '32801', 28.5383, -81.3792, 'Baptist', null, 'seed', 'approved'),
  ('First Methodist Austin', '300 Congress Ave', 'Austin', 'TX', '78701', 30.2672, -97.7431, 'United Methodist', 'https://fumcaustin.org', 'seed', 'approved')
on conflict do nothing;

refresh materialized view public.zip_centroids;
