-- Prices and performance are fictional arcade balancing values, not manufacturer specifications.
INSERT INTO catalog_items(id,kind,asset_key,name,price,metadata) VALUES
 ('bmw-hybrid-v8','car','bmw-hybrid-v8','BMW M Hybrid V8',1650000,'{"color":"#f2f2ee","drive":"RWD","arcadeTuning":true}'),
 ('bmw-m4-gt4','car','bmw-m4-gt4','BMW M4 GT4',620000,'{"color":"#f1f2ef","drive":"RWD","arcadeTuning":true}'),
 ('amg-gt4','car','amg-gt4','Mercedes-AMG GT4',780000,'{"color":"#9fa9ac","drive":"RWD","arcadeTuning":true}'),
 ('sls-amg-gt3','car','sls-amg-gt3','Mercedes-Benz SLS AMG GT3',1050000,'{"color":"#c3c9cc","drive":"RWD","arcadeTuning":true}'),
 ('batmobile-1989','car','batmobile-1989','Batmobile 1989',1300000,'{"color":"#171b21","drive":"RWD","arcadeTuning":true}'),
 ('jesko-absolut','car','jesko-absolut','Koenigsegg Jesko Absolut',2400000,'{"color":"#c8d4cd","drive":"RWD","arcadeTuning":true}'),
 ('venom-f5','car','venom-f5','Hennessey Venom F5',2200000,'{"color":"#e3ba36","drive":"RWD","arcadeTuning":true}');
DO $$
DECLARE prior rulesets%ROWTYPE; next_id bigint; next_version integer;
BEGIN
 SELECT r.* INTO prior FROM app_state a JOIN rulesets r ON r.id=a.active_ruleset_id WHERE a.singleton=true FOR UPDATE OF a;
 SELECT COALESCE(max(version),0)+1 INTO next_version FROM rulesets;
 INSERT INTO rulesets(version,physics_version,physics,reward_policy,reason)
 VALUES(next_version,prior.physics_version,prior.physics,prior.reward_policy,'Add seven vehicles; preserve published arcade tuning, physics and reward policy') RETURNING id INTO next_id;
 INSERT INTO ruleset_cars(ruleset_id,car_id,top_speed,zero_to_100,handling)
 SELECT next_id,car_id,top_speed,zero_to_100,handling FROM ruleset_cars WHERE ruleset_id=prior.id;
 INSERT INTO ruleset_cars(ruleset_id,car_id,top_speed,zero_to_100,handling) VALUES
 (next_id,'bmw-hybrid-v8',345,2.6,1.23),(next_id,'bmw-m4-gt4',285,3.7,1.20),
 (next_id,'amg-gt4',295,3.5,1.16),(next_id,'sls-amg-gt3',310,3.2,1.18),
 (next_id,'batmobile-1989',300,3.9,.90),(next_id,'jesko-absolut',420,2.3,.96),(next_id,'venom-f5',410,2.4,.95);
 UPDATE app_state SET active_ruleset_id=next_id WHERE singleton=true;
END;
$$;
