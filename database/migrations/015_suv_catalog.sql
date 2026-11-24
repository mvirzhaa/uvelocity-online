-- Four photo-reference family vehicles. Prices are virtual game credits and performance
-- values are arcade balancing, not manufacturer specifications.
-- Existing offers, ownership, cosmetics, categories and operator tuning remain
-- untouched. Migration execution is already transactional and checksum-guarded.
-- Permit the new open 2-km course without touching stored race results.
ALTER TABLE races DROP CONSTRAINT races_circuit_check,
 ADD CONSTRAINT races_circuit_check CHECK (circuit IN ('city','beach','glacier','drag-2km'));

INSERT INTO catalog_items(id,kind,asset_key,name,price,active,locked,metadata) VALUES
 ('honda-crv-rs','car','honda-crv-rs','Honda CR-V RS e:HEV',280000,true,true,
  '{"color":"#4b637a","drive":"FWD","arcadeTuning":true}'),
 ('mitsubishi-pajero-sport','car','mitsubishi-pajero-sport','Mitsubishi Pajero Sport',320000,true,true,
  '{"color":"#151a1d","drive":"AWD","arcadeTuning":true}'),
 ('toyota-fortuner','car','toyota-fortuner','Toyota Fortuner GR Sport',340000,true,true,
  '{"color":"#20262b","drive":"AWD","arcadeTuning":true}'),
 ('toyota-innova-zenix','car','toyota-innova-zenix','Toyota Kijang Innova Zenix Hybrid',345000,true,true,
  '{"color":"#d5d9dd","drive":"FWD","arcadeTuning":true}')
 ON CONFLICT(id) DO NOTHING;

INSERT INTO vehicle_thumbnail_slots(car_id) VALUES
 ('honda-crv-rs'),('mitsubishi-pajero-sport'),('toyota-fortuner'),('toyota-innova-zenix')
 ON CONFLICT(car_id) DO NOTHING;

-- Reuse an administrator-created SUV group, preserving its identity, name,
-- ordering and version. A previously customized slug is never renamed.
DO $$
DECLARE suv_id text; proposed_id text := 'suv'; suffix integer := 0;
BEGIN
 SELECT id INTO suv_id FROM vehicle_categories WHERE lower(name)='suv';
 IF suv_id IS NULL THEN
  WHILE EXISTS(SELECT 1 FROM vehicle_categories WHERE id=proposed_id) LOOP
   suffix := suffix + 1;
   proposed_id := 'suv-' || suffix;
  END LOOP;
  INSERT INTO vehicle_categories(id,name,sort_order) VALUES(proposed_id,'SUV',75)
   RETURNING id INTO suv_id;
 END IF;
 INSERT INTO vehicle_category_assignments(car_id,category_id)
 SELECT id,suv_id FROM catalog_items
  WHERE kind='car' AND id IN ('honda-crv-rs','mitsubishi-pajero-sport','toyota-fortuner')
 ON CONFLICT(car_id) DO NOTHING;
END;
$$;

-- Zenix belongs to the existing MPV category. If an operator removed it, reuse
-- a same-name category or create a fresh identity without renaming other groups.
DO $$
DECLARE mpv_id text; proposed_id text := 'mpv'; suffix integer := 0;
BEGIN
 SELECT id INTO mpv_id FROM vehicle_categories WHERE id='mpv';
 IF mpv_id IS NULL THEN SELECT id INTO mpv_id FROM vehicle_categories WHERE lower(name)='mpv'; END IF;
 IF mpv_id IS NULL THEN
  WHILE EXISTS(SELECT 1 FROM vehicle_categories WHERE id=proposed_id) LOOP
   suffix := suffix + 1; proposed_id := 'mpv-' || suffix;
  END LOOP;
  INSERT INTO vehicle_categories(id,name,sort_order) VALUES(proposed_id,'MPV',70) RETURNING id INTO mpv_id;
 END IF;
 INSERT INTO vehicle_category_assignments(car_id,category_id) VALUES('toyota-innova-zenix',mpv_id)
 ON CONFLICT(car_id) DO NOTHING;
END;
$$;

-- Copy the active publication before adding only the new vehicles. Past races
-- continue to refer to their immutable ruleset and original sixteen cars.
DO $$
DECLARE prior rulesets%ROWTYPE; next_id bigint; next_version integer;
BEGIN
 SELECT r.* INTO prior FROM app_state a JOIN rulesets r ON r.id=a.active_ruleset_id
  WHERE a.singleton=true FOR UPDATE OF a;
 SELECT COALESCE(max(version),0)+1 INTO next_version FROM rulesets;
 INSERT INTO rulesets(version,physics_version,physics,reward_policy,reason)
 VALUES(next_version,prior.physics_version,prior.physics,prior.reward_policy,
  'Add CR-V, Pajero Sport, Fortuner and Innova Zenix; preserve published tuning, physics and rewards') RETURNING id INTO next_id;
 INSERT INTO ruleset_cars(ruleset_id,car_id,top_speed,zero_to_100,handling)
 SELECT next_id,car_id,top_speed,zero_to_100,handling FROM ruleset_cars WHERE ruleset_id=prior.id;
 INSERT INTO ruleset_cars(ruleset_id,car_id,top_speed,zero_to_100,handling) VALUES
  (next_id,'honda-crv-rs',210,8.2,1.02),
  (next_id,'mitsubishi-pajero-sport',195,10.5,.94),
  (next_id,'toyota-fortuner',205,9.8,.96),
  (next_id,'toyota-innova-zenix',195,9.5,1.01)
 ON CONFLICT(ruleset_id,car_id) DO NOTHING;
 UPDATE app_state SET active_ruleset_id=next_id WHERE singleton=true;
END;
$$;
