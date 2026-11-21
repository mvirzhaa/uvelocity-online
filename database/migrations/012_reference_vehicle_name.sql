-- The latest supplied reference depicts the Regera. Retain the original item
-- identity so purchases, appearances, photos, loadouts and race history survive.
-- This is a display-name correction, not a price/access change: keep versions,
-- quotes, wallet records, operator tuning and operator-customized names intact.
UPDATE catalog_items SET name='Koenigsegg Regera'
 WHERE id='jesko-absolut' AND kind='car' AND asset_key='jesko-absolut'
   AND name='Koenigsegg Jesko Absolut';
