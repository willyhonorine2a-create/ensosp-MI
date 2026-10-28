#!/usr/bin/env python3
"""Rapproche deux trames par désignation/référence et prépare uniquement les catégories."""
import argparse
from collections import defaultdict
import json
from pathlib import Path
import re
from prepare_import import read_assets

def identity(item):
    return tuple(re.sub(r'\s+', ' ', item.get(k) or '').strip().upper() for k in ('designation','reference'))

def reconcile(old, new, allowed):
    before=defaultdict(list)
    after={}
    for item in old: before[identity(item)].append(item)
    for item in new:
        key=identity(item)
        if item['category'] not in allowed: raise ValueError('Catégorie hors liste : '+str(item['category']))
        if key in after: raise ValueError('Identité ambiguë dans le nouveau fichier')
        if key not in before: raise ValueError('Nouveau matériel sans correspondance : '+item['designation'])
        after[key]=item
    updates=[(previous['import_key'],item['category']) for key,item in after.items() for previous in before[key]]
    absent=[item for item in old if identity(item) not in after]
    groups=[{'designation':item['designation'],'reference':item.get('reference'),
             'anciennes_lignes':len(before[key]),'quantites_initiales':[i['quantity'] for i in before[key]],
             'quantite_nouveau_fichier':item['quantity']} for key,item in after.items() if len(before[key])>1]
    return updates,absent,groups

def sql_for_updates(updates):
    prefixes={key.split(':')[0] for key,_ in updates}
    if len(prefixes)!=1: raise ValueError('Un seul import source est pris en charge')
    prefix=next(iter(prefixes))
    grouped=defaultdict(list)
    for key,category in updates: grouped[category].append(int(key.split(':')[1]))
    values=',\n'.join("('%s',array[%s])"%(code,','.join(str(i) for i in sorted(rows))) for code,rows in sorted(grouped.items()))
    return f"""-- Mise à jour des catégories uniquement : aucune suppression, aucun changement de stock.
with correspondances(code,lignes) as (values
{values}
), modifications as (
 update public.stock_assets a set category=c.code
 from correspondances c
 where a.import_key = '{prefix}:' || any_row.n::text
 returning a.id
)
select count(*) as biens_reclasses from modifications;
""".replace("from correspondances c\n", "from correspondances c cross join lateral unnest(c.lignes) as any_row(n)\n").replace("returning a.id", "and a.category is distinct from c.code\n returning a.id")

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('old');parser.add_argument('new');parser.add_argument('--output',required=True);parser.add_argument('--report',required=True)
    args=parser.parse_args()
    allowed={r['code'] for r in json.loads((Path(__file__).resolve().parents[1]/'reference/categories.json').read_text())}
    updates,absent,groups=reconcile(read_assets(args.old),read_assets(args.new),allowed)
    with Path(args.output).open('x',encoding='utf-8') as output:output.write(sql_for_updates(updates))
    report={'lignes_rapprochees':len(updates),'absents':[{'ligne_origine':i['source_row'],'designation':i['designation'],'quantite_initiale':i['quantity']} for i in absent],'groupes_a_valider':groups}
    with Path(args.report).open('x',encoding='utf-8') as output:output.write(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps({'rapprochements':len(updates),'absents':len(absent),'groupes':len(groups)}))
