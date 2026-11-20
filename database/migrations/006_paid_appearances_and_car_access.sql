-- Additive upgrade: existing ownership, balances, history and selected paint stay intact.
ALTER TABLE catalog_items DROP CONSTRAINT catalog_items_kind_check;
ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_kind_check CHECK (kind IN ('car','wheel','service'));
ALTER TABLE catalog_items ADD COLUMN locked boolean NOT NULL DEFAULT true;

INSERT INTO catalog_items(id,kind,asset_key,name,price,metadata) VALUES
 ('paint-body','service','paint-body','Cat bodi & lapisan',10000,'{"service":"paint-body","perApplication":true}'),
 ('paint-rims','service','paint-rims','Cat pelek kustom',5000,'{"service":"paint-rims","perApplication":true}'),
 ('stripe-twin-racing','service','stripe-twin-racing','Twin Racing',15000,'{"service":"stripe-install","stripeId":"twin-racing","perApplication":true}'),
 ('stripe-offset','service','stripe-offset','Offset',18000,'{"service":"stripe-install","stripeId":"offset","perApplication":true}'),
 ('stripe-side-sweep','service','stripe-side-sweep','Side Sweep',12000,'{"service":"stripe-install","stripeId":"side-sweep","perApplication":true}'),
 ('stripe-circuit','service','stripe-circuit','Circuit',20000,'{"service":"stripe-install","stripeId":"circuit","perApplication":true}'),
 ('stripe-heritage','service','stripe-heritage','Heritage',22000,'{"service":"stripe-install","stripeId":"heritage","perApplication":true}'),
 ('stripe-remove','service','stripe-remove','Lepas striping',5000,'{"service":"stripe-remove","perApplication":true}');

ALTER TABLE wallet_entries DROP CONSTRAINT wallet_entries_kind_check;
ALTER TABLE wallet_entries ADD CONSTRAINT wallet_entries_kind_check CHECK (kind IN ('starter','purchase','admin_topup','race_reward','correction','customization'));
ALTER TABLE loadouts ADD COLUMN stripe_id text NOT NULL DEFAULT 'none' CHECK (stripe_id IN ('none','twin-racing','offset','side-sweep','circuit','heritage'));
ALTER TABLE loadouts ADD COLUMN stripe_color char(7) NOT NULL DEFAULT '#ffffff' CHECK (stripe_color ~ '^#[0-9a-fA-F]{6}$');
-- A temporary globally unlocked car is selectable without granting permanent inventory.
ALTER TABLE loadouts DROP CONSTRAINT loadouts_user_id_car_item_id_fkey;
ALTER TABLE loadouts ADD CONSTRAINT loadouts_car_catalog_fkey FOREIGN KEY(car_item_id) REFERENCES catalog_items(id);

CREATE TABLE car_appearances (
 user_id uuid NOT NULL,
 car_id text NOT NULL,
 rim_id text NOT NULL DEFAULT 'stock' REFERENCES catalog_items(id),
 color char(7) NOT NULL CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
 finish text NOT NULL DEFAULT 'metallic' CHECK (finish IN ('metallic','gloss','matte')),
 rim_color char(7) NOT NULL DEFAULT '#c7cdd4' CHECK (rim_color ~ '^#[0-9a-fA-F]{6}$'),
 stripe_id text NOT NULL DEFAULT 'none' CHECK (stripe_id IN ('none','twin-racing','offset','side-sweep','circuit','heritage')),
 stripe_color char(7) NOT NULL DEFAULT '#ffffff' CHECK (stripe_color ~ '^#[0-9a-fA-F]{6}$'),
 version bigint NOT NULL DEFAULT 1 CHECK (version>0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,car_id),
 FOREIGN KEY(user_id,car_id) REFERENCES user_items(user_id,item_id)
);
INSERT INTO car_appearances(user_id,car_id,rim_id,color,finish,rim_color)
 SELECT i.user_id,i.item_id,CASE WHEN l.car_item_id=i.item_id THEN l.wheel_item_id ELSE 'stock' END,
 lower(CASE WHEN l.car_item_id=i.item_id THEN l.color ELSE COALESCE(c.metadata->>'color','#2866b8') END),
 CASE WHEN l.car_item_id=i.item_id THEN l.finish ELSE 'metallic' END,
 lower(CASE WHEN l.car_item_id=i.item_id THEN l.rim_color ELSE '#c7cdd4' END)
 FROM user_items i JOIN catalog_items c ON c.id=i.item_id LEFT JOIN loadouts l ON l.user_id=i.user_id WHERE c.kind='car';
CREATE FUNCTION create_owned_car_appearance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO car_appearances(user_id,car_id,color)
 SELECT NEW.user_id,c.id,lower(COALESCE(c.metadata->>'color','#2866b8')) FROM catalog_items c WHERE c.id=NEW.item_id AND c.kind='car'
 ON CONFLICT(user_id,car_id) DO NOTHING;
 RETURN NEW;
END;
$$;
CREATE TRIGGER owned_car_appearance AFTER INSERT ON user_items FOR EACH ROW EXECUTE FUNCTION create_owned_car_appearance();

CREATE TABLE appearance_quotes (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id),
 car_id text NOT NULL REFERENCES catalog_items(id),
 appearance_version bigint NOT NULL,
 selection jsonb NOT NULL,
 line_items jsonb NOT NULL,
 total bigint NOT NULL CHECK (total BETWEEN 0 AND 10000000000000),
 no_op boolean NOT NULL,
 expires_at timestamptz NOT NULL,
 applied_response jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX appearance_quotes_user_idx ON appearance_quotes(user_id,created_at DESC);
CREATE INDEX appearance_quotes_expiry_idx ON appearance_quotes(expires_at);
CREATE TABLE appearance_applications (
 id uuid PRIMARY KEY,
 quote_id uuid NOT NULL UNIQUE REFERENCES appearance_quotes(id),
 user_id uuid NOT NULL REFERENCES users(id),
 car_id text NOT NULL REFERENCES catalog_items(id),
 price_paid bigint NOT NULL CHECK(price_paid>=0),
 line_items jsonb NOT NULL,
 before_appearance jsonb NOT NULL,
 after_appearance jsonb NOT NULL,
 ledger_entry_id uuid REFERENCES wallet_entries(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER appearance_history_immutable BEFORE UPDATE OR DELETE ON appearance_applications FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
