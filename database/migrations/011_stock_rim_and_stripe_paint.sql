-- Explicit opt-in keeps every legacy stock wheel's original model materials.
ALTER TABLE car_appearances ADD COLUMN stock_rim_painted boolean NOT NULL DEFAULT false;
ALTER TABLE loadouts ADD COLUMN stock_rim_painted boolean NOT NULL DEFAULT false;

-- Recoloring an installed design is independently priced by administrators.
-- Existing design/body/rim prices, enablement and catalog versions are preserved.
INSERT INTO catalog_items(id,kind,asset_key,name,price,metadata) VALUES
 ('stripe-paint','service','stripe-paint','Ganti warna striping',5000,'{"service":"stripe-paint","perApplication":true}');
UPDATE catalog_items SET name='Cat pelek bawaan & kustom'
 WHERE id='paint-rims' AND name='Cat pelek kustom';

-- An old unpaid quote cannot authorize different paint behavior after upgrade.
-- Committed responses and their idempotency/financial history remain intact.
UPDATE appearance_quotes SET expires_at=now()
 WHERE applied_response IS NULL AND expires_at>now();
