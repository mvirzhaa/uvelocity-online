-- Two original photo-reference recreations. Prices are virtual game credits;
-- performance values are arcade balancing, not movie or manufacturer claims.
-- Existing offers, ownership, paint, categories and published rules stay intact.
INSERT INTO catalog_items(id,kind,asset_key,name,price,active,locked,metadata) VALUES
 ('batmobile-tumbler','car','batmobile-tumbler','Batmobile Tumbler · The Dark Knight',1500000,true,true,
  '{"color":"#202329","finish":"matte","drive":"AWD","arcadeTuning":true}'),
 ('knight-rider-kitt','car','knight-rider-kitt','Pontiac Knight Rider 1983 · KITT',850000,true,true,
  '{"color":"#10141a","finish":"gloss","drive":"RWD","arcadeTuning":true}')
 ON CONFLICT(id) DO NOTHING;

INSERT INTO vehicle_thumbnail_slots(car_id) VALUES
 ('batmobile-tumbler'),('knight-rider-kitt') ON CONFLICT(car_id) DO NOTHING;

-- Reuse a same-name operator category, regardless of its customized ID. A slug
-- collision never renames a different group or moves any existing vehicle.
DO $$
DECLARE group_id text; proposed_id text := 'koleksi-ikonik'; suffix integer := 0;
BEGIN
 SELECT id INTO group_id FROM vehicle_categories WHERE lower(name)='koleksi ikonik';
 IF group_id IS NULL THEN
  WHILE EXISTS(SELECT 1 FROM vehicle_categories WHERE id=proposed_id) LOOP
   suffix := suffix + 1; proposed_id := 'koleksi-ikonik-' || suffix;
  END LOOP;
  INSERT INTO vehicle_categories(id,name,sort_order) VALUES(proposed_id,'Koleksi Ikonik',85)
   RETURNING id INTO group_id;
 END IF;
 INSERT INTO vehicle_category_assignments(car_id,category_id) VALUES
  ('batmobile-tumbler',group_id),('knight-rider-kitt',group_id)
 ON CONFLICT(car_id) DO NOTHING;
END;
$$;

-- New purchases start with the car's authored finish. Existing cars without
-- this optional metadata retain metallic; saved appearances are never reset.
-- This is the same default used for temporary operator-unlocked access.
CREATE OR REPLACE FUNCTION create_owned_car_appearance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO car_appearances(user_id,car_id,color,finish)
 SELECT NEW.user_id,c.id,lower(COALESCE(c.metadata->>'color','#2866b8')),
  CASE WHEN c.metadata->>'finish' IN ('matte','gloss') THEN c.metadata->>'finish' ELSE 'metallic' END
 FROM catalog_items c WHERE c.id=NEW.item_id AND c.kind='car'
 ON CONFLICT(user_id,car_id) DO NOTHING;
 RETURN NEW;
END;
$$;

-- Publish an additive ruleset. The previous twenty cars, custom physics and
-- reward policy are copied from the active publication without retuning them.
DO $$
DECLARE prior rulesets%ROWTYPE; next_id bigint; next_version integer;
BEGIN
 SELECT r.* INTO prior FROM app_state a JOIN rulesets r ON r.id=a.active_ruleset_id
  WHERE a.singleton=true FOR UPDATE OF a;
 SELECT COALESCE(max(version),0)+1 INTO next_version FROM rulesets;
 INSERT INTO rulesets(version,physics_version,physics,reward_policy,reason)
 VALUES(next_version,prior.physics_version,prior.physics,prior.reward_policy,
  'Add Tumbler and KITT collectible recreations; preserve published tuning, physics and rewards') RETURNING id INTO next_id;
 INSERT INTO ruleset_cars(ruleset_id,car_id,top_speed,zero_to_100,handling)
 SELECT next_id,car_id,top_speed,zero_to_100,handling FROM ruleset_cars WHERE ruleset_id=prior.id;
 INSERT INTO ruleset_cars(ruleset_id,car_id,top_speed,zero_to_100,handling) VALUES
  (next_id,'batmobile-tumbler',240,5.2,.82),
  (next_id,'knight-rider-kitt',280,4.8,1.08)
 ON CONFLICT(ruleset_id,car_id) DO NOTHING;
 UPDATE app_state SET active_ruleset_id=next_id WHERE singleton=true;
END;
$$;
