#!/usr/bin/env python3
"""Exporte les migrations catégories/photos en trois requêtes courtes autonomes."""
import argparse
from pathlib import Path

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('directory',type=Path)
args=parser.parse_args()
root=Path(__file__).resolve().parents[1]
s=(root/'supabase/migrations/005_simple_categories.sql').read_text().removeprefix('begin;\n').removesuffix('commit;\n')
first,rest=s.split('create or replace function public.create_stock_category',1)
category,save=rest.split('create or replace function public.save_stock_asset',1)
storage=(root/'supabase/migrations/006_photos_storage.sql').read_text()
storage='\n'.join(line for line in storage.splitlines() if not line.startswith('--') and line not in ('begin;','commit;'))
parts=[first,'create or replace function public.save_stock_asset'+save,storage+'\ncreate or replace function public.create_stock_category'+category]
args.directory.mkdir(parents=True,exist_ok=True)
for number,part in enumerate(parts,1):
    part='begin;\n'+'\n'.join(line for line in part.splitlines() if not line.lstrip().startswith('--'))+'\ncommit;\n'
    if len(part)>=4000: raise ValueError('Requête trop longue : revoir le découpage')
    with (args.directory/f'categories-photos-etape-{number}.sql').open('x',encoding='utf-8') as output:output.write(part)
