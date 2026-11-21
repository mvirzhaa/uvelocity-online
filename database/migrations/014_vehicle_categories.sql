-- Presentation-only categories: preserve every existing offer, purchase,
-- appearance, loadout, published ruleset and administrator price/version.
CREATE TABLE vehicle_categories (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 40 AND name=btrim(name)),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 9999),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE UNIQUE INDEX vehicle_categories_name_idx ON vehicle_categories(lower(name));

CREATE TABLE vehicle_category_assignments (
  car_id text PRIMARY KEY REFERENCES catalog_items(id) ON DELETE CASCADE,
  category_id text NOT NULL REFERENCES vehicle_categories(id) ON DELETE RESTRICT
);
CREATE INDEX vehicle_category_assignments_category_idx ON vehicle_category_assignments(category_id);

INSERT INTO vehicle_categories(id,name,sort_order) VALUES
 ('sport','Sport',10),('supercar','Supercar',20),('hypercar','Hypercar',30),
 ('race','Mobil balap',40),('rally','Reli',50),('muscle','Muscle',60),
 ('mpv','MPV',70),('special','Spesial',80);

INSERT INTO vehicle_category_assignments(car_id,category_id)
 SELECT c.id,groups.category_id FROM catalog_items c JOIN (VALUES
  ('brz','sport'),('skyline','sport'),('apex','sport'),
  ('aventador','supercar'),('veloce','supercar'),
  ('jesko-absolut','hypercar'),('venom-f5','hypercar'),
  ('bmw-hybrid-v8','race'),('bmw-m4-gt4','race'),('amg-gt4','race'),('sls-amg-gt3','race'),
  ('kaze','rally'),('cinder','muscle'),('panther-grand-touring','mpv'),
  ('veyron77','special'),('batmobile-1989','special')
 ) AS groups(car_id,category_id) ON c.id=groups.car_id WHERE c.kind='car';
