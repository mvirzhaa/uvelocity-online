INSERT INTO catalog_items(id,kind,asset_key,name,price,metadata) VALUES
 ('brz','car','brz','Subaru BRZ',0,'{"color":"#2866b8","drive":"RWD","starter":true}'),
 ('veyron77','car','veyron77','Bugatti Veyron Polisi 77',1800000,'{"color":"#eceff2","drive":"AWD"}'),
 ('aventador','car','aventador','Lamborghini Aventador',1400000,'{"color":"#c9d2d9","drive":"AWD"}'),
 ('skyline','car','skyline','Nissan Skyline GT-R R34',650000,'{"color":"#326bcc","drive":"AWD"}'),
 ('veloce','car','veloce','Veloce R',900000,'{"color":"#ed6b2f","drive":"RWD"}'),
 ('apex','car','apex','Apex GT',220000,'{"color":"#3f7568","drive":"RWD"}'),
 ('cinder','car','cinder','Cinder V8',350000,'{"color":"#ad2940","drive":"RWD"}'),
 ('kaze','car','kaze','Kaze Rally',180000,'{"color":"#d9e1e5","drive":"AWD"}'),
 ('stock','wheel','stock','Roda bawaan',0,'{"starter":true,"cosmeticOnly":true,"color":"#adb5bd"}'),
 ('six-spoke','wheel','six-spoke','Six Spoke',20000,'{"cosmeticOnly":true,"color":"#d6dde3","spokes":6}'),
 ('multi-spoke','wheel','multi-spoke','Multi Spoke',35000,'{"cosmeticOnly":true,"color":"#333b47","spokes":12}'),
 ('mesh','wheel','mesh','Mesh Gold',50000,'{"cosmeticOnly":true,"color":"#d7b56d","spokes":20}');

INSERT INTO rulesets(version,physics_version,physics,reward_policy,reason) VALUES
 (1,'arcade-v1',
  '{"tickRate":30,"nitroMultiplier":1.23,"nitroAccelerationMultiplier":2,"nitroDrain":24,"nitroRecharge":5,"driftRecharge":12,"brakeRate":37,"coastDrag":5.5,"reverseSpeed":18,"resetCooldownMs":4000}',
  '{"version":1,"finish":"10000","perLap":"1000","podium":["15000","8000","4000"],"minimumDurationMs":15000,"maximum":"50000"}',
  'Initial arcade tuning, not manufacturer performance specifications');

INSERT INTO ruleset_cars(ruleset_id,car_id,top_speed,zero_to_100,handling)
 SELECT r.id,v.car_id,v.top_speed,v.zero_to_100,v.handling FROM rulesets r CROSS JOIN
 (VALUES ('brz',255,5.6,1.18),('veyron77',370,2.7,.94),('aventador',340,2.9,.98),
 ('skyline',295,3.6,1.11),('veloce',320,3.0,.99),('apex',275,4.3,1.06),
 ('cinder',290,3.8,.90),('kaze',255,3.6,1.16)) AS v(car_id,top_speed,zero_to_100,handling)
 WHERE r.version=1;

INSERT INTO app_state(singleton,active_ruleset_id) SELECT true,id FROM rulesets WHERE version=1;
