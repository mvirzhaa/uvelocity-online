-- Virtual game price and arcade balancing values, not manufacturer specifications.
INSERT INTO catalog_items(id,kind,asset_key,name,price,active,locked,metadata) VALUES
 ('panther-grand-touring','car','panther-grand-touring','Isuzu Panther Grand Touring',150000,true,true,
  '{"color":"#19252e","drive":"RWD","arcadeTuning":true}');
INSERT INTO vehicle_thumbnail_slots(car_id) VALUES('panther-grand-touring');

-- Publish a new ruleset for future races, preserving every existing vehicle's
-- currently published operator tuning, physics and rewards. Old races keep
-- their immutable ruleset version. The participant limit is not changed.
DO $$
DECLARE prior rulesets%ROWTYPE; next_id bigint; next_version integer;
BEGIN
 SELECT r.* INTO prior FROM app_state a JOIN rulesets r ON r.id=a.active_ruleset_id
  WHERE a.singleton=true FOR UPDATE OF a;
 SELECT COALESCE(max(version),0)+1 INTO next_version FROM rulesets;
 INSERT INTO rulesets(version,physics_version,physics,reward_policy,reason)
 VALUES(next_version,prior.physics_version,prior.physics,prior.reward_policy,
  'Add Isuzu Panther Grand Touring; preserve published vehicle tuning, physics and rewards') RETURNING id INTO next_id;
 INSERT INTO ruleset_cars(ruleset_id,car_id,top_speed,zero_to_100,handling)
 SELECT next_id,car_id,top_speed,zero_to_100,handling FROM ruleset_cars WHERE ruleset_id=prior.id;
 INSERT INTO ruleset_cars(ruleset_id,car_id,top_speed,zero_to_100,handling)
 VALUES(next_id,'panther-grand-touring',170,10.8,.88);
 UPDATE app_state SET active_ruleset_id=next_id WHERE singleton=true;
END;
$$;
