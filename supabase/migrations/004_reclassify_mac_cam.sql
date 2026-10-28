-- Reclassement explicitement demandé : EQT/ECA/MAC et EQT/ECA/CAM vers EEE.
-- Une seule instruction atomique. Aucun changement de quantité ni de données source.
with biens_reclasses as (
  update public.stock_assets
  set genre = 'EEE', category = 'ECA'
  where genre = 'EQT'
    and category = 'ECA'
    and subcategory in ('MAC', 'CAM')
  returning subcategory, quantity
)
select subcategory as sous_categorie,
       count(*) as biens_reclasses,
       sum(quantity) as unites_conservees
from biens_reclasses
 group by subcategory
 order by subcategory;
