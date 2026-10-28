#!/usr/bin/env python3
"""Convertit une trame ASTECH XLSX en import SQL privé, sans dépendance externe."""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import zipfile

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
MAPPING = {
 'DESIGNATION':'designation','CODE_BIEN':'asset_code','NOMCOURT':'short_name',
 'GENRE':'genre','CATEG':'category','CATEG_DES':'category_name','SOUSCAT':'subcategory',
 'SOUSCAT_DES':'subcategory_name','INVENTAIRE':'reference','NOSERIE':'serial_number',
 'CODBAR':'barcode','COD_SERV':'service_code','COD_SERV_DES':'service_name',
 'LIEU':'location','ETAT':'condition_code','CODFOURN':'supplier_code',
 'SERVGEST':'manager_code','CODE_PARENT':'parent_code','OBS':'notes',
 'DAT_CREAT':'registered_at','DAT_ACHAT':'purchased_at','DAT_DEB_AFFECT':'assigned_at',
 'DATGARANTIE':'warranty_until'
}
DATES = {'DAT_CREAT','DAT_ACHAT','DAT_DEB_AFFECT','DATGARANTIE'}

def date_value(value, epoch):
    if re.fullmatch(r'\d+(\.0+)?', value):
        number = int(float(value))
        # Excel 1900 includes a fictitious leap day; modern dates use 1899-12-30.
        if epoch == dt.date(1899, 12, 30) and number < 61:
            raise ValueError('Date Excel antérieure au 01/03/1900 non prise en charge')
        return (epoch + dt.timedelta(days=number)).isoformat()
    for fmt in ('%d/%m/%Y', '%Y-%m-%d'):
        try:
            return dt.datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            pass
    raise ValueError(f'Date invalide : {value}')

def read_assets(path):
    fingerprint = hashlib.sha256(Path(path).read_bytes()).hexdigest()
    with zipfile.ZipFile(path) as archive:
        workbook = ET.fromstring(archive.read('xl/workbook.xml'))
        sheet = next((s for s in workbook.findall('m:sheets/m:sheet', NS) if s.get('name') == 'ASTECH_Import'), None)
        if sheet is None:
            raise ValueError('Feuille ASTECH_Import absente')
        rel_id = sheet.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
        relationships = ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))
        target = next(r.get('Target') for r in relationships if r.get('Id') == rel_id)
        filename = target.lstrip('/') if target.startswith('/') else 'xl/' + target
        shared = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            shared = [''.join(n.itertext()) for n in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('m:si', NS)]
        cells = []
        sheet_root = ET.fromstring(archive.read(filename))
        cell_index = {c.get('r'): c for c in sheet_root.findall('.//m:c', NS)}
        for row in sheet_root.findall('m:sheetData/m:row', NS):
            values = {}
            for cell in row.findall('m:c', NS):
                address = cell.get('r')
                formula = cell.find('m:f', NS)
                if formula is not None:
                    target_cell = (formula.text or '').replace('$', '')
                    if not re.fullmatch(r'[A-Z]+[1-9][0-9]*', target_cell) or target_cell not in cell_index:
                        raise ValueError(f'Formule non prise en charge : {address}')
                    cell = cell_index[target_cell]
                    if cell.find('m:f', NS) is not None:
                        raise ValueError(f'Référence de formule imbriquée : {address}')
                value = cell.find('m:v', NS)
                text = value.text if value is not None else ''.join(cell.find('m:is', NS).itertext()) if cell.find('m:is', NS) is not None else ''
                if cell.get('t') == 's' and text:
                    text = shared[int(text)]
                values[re.sub(r'\d', '', address)] = (text or '').strip()
            cells.append((int(row.get('r')),values))
        header = next((v for _,v in cells if v.get('A') == 'CODE_BIEN' and v.get('B') == 'DESIGNATION'), None)
        if header is None or 'QTE' not in header.values():
            raise ValueError('En-têtes de la trame non reconnus')
        header_row = next(n for n,v in cells if v is header)
        properties = workbook.find('m:workbookPr', NS)
        epoch = dt.date(1904,1,1) if properties is not None and properties.get('date1904') in ('1','true') else dt.date(1899,12,30)
        assets = []
        for number, values in cells:
            if number <= header_row + 1:
                continue # lignes de titre, codes et consignes ; jamais traitées comme des données
            raw = {code: values.get(col,'') for col,code in header.items() if code and values.get(col,'')}
            if not raw:
                continue
            if not raw.get('DESIGNATION'):
                raise ValueError(f'Ligne {number} : désignation absente')
            item = {'import_key':f'{fingerprint}:{number}','source_row':number,'source_data':raw}
            for code, field in MAPPING.items():
                value = raw.get(code)
                item[field] = date_value(value,epoch) if value and code in DATES else value
            quantity = raw.get('QTE','')
            if quantity and not re.fullmatch(r'\d+(\.0+)?', quantity):
                raise ValueError(f'Ligne {number} : quantité invalide')
            item['quantity'] = int(float(quantity)) if quantity else 1
            if not 0 <= item['quantity'] <= 1000000:
                raise ValueError(f'Ligne {number} : quantité hors limites')
            item['quantity_defaulted'] = not bool(quantity)
            item['minimum_quantity'] = 0 # aucun seuil de réapprovisionnement dans la trame
            assets.append(item)
        if not assets:
            raise ValueError('Aucun bien trouvé')
        return assets

def make_sql(assets):
    payload = json.dumps(assets,ensure_ascii=False).replace("'", "''")
    columns = list(MAPPING.values()) + ['import_key','source_row','source_data','quantity','quantity_defaulted','minimum_quantity']
    definitions = ', '.join(f'{c} '+('date' if c.endswith('_at') or c == 'warranty_until' else 'integer' if c in ('source_row','quantity','minimum_quantity') else 'boolean' if c == 'quantity_defaulted' else 'jsonb' if c == 'source_data' else 'text') for c in columns)
    names = ', '.join(columns)
    return f"""-- Données privées : ne pas committer ce fichier dans GitHub.
-- Exécuter APRÈS 001_stock.sql, dans le SQL Editor du projet TEST.
-- Une réexécution du même fichier ne remplace pas les quantités existantes.
begin;
insert into public.stock_assets ({names})
select {names} from jsonb_to_recordset('{payload}'::jsonb) as data({definitions})
on conflict (import_key) do nothing;
commit;
-- Contrôle de cet import uniquement (et des quantités initiales supposées).
select count(*) as biens_importes, sum(quantity) as quantite_actuelle,
       count(*) filter (where quantity_defaulted) as quantites_initiales_par_defaut
from public.stock_assets where import_key in (select import_key from jsonb_to_recordset('{json.dumps([{'import_key':i['import_key']} for i in assets])}'::jsonb) as keys(import_key text));
"""

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('xlsx')
    parser.add_argument('--output',required=True)
    parser.add_argument('--quantity-override', action='append', default=[], metavar='LIGNE=QUANTITE', help='Correction explicite validée par le propriétaire ; conserve QTE source dans source_data')
    args=parser.parse_args()
    assets=read_assets(args.xlsx)
    for override in args.quantity_override:
        row, quantity = map(int, override.split('='))
        matches = [i for i in assets if i['source_row'] == row]
        if len(matches) != 1 or not 0 <= quantity <= 1000000:
            raise ValueError('Correction de quantité invalide')
        matches[0]['quantity'] = quantity
        matches[0]['quantity_defaulted'] = False
        matches[0]['source_data']['_quantity_override'] = str(quantity)
    path=Path(args.output)
    # Écriture exclusive pour ne pas écraser un fichier existant.
    with path.open('x',encoding='utf-8') as output:
        output.write(make_sql(assets))
    path.chmod(0o600)
    print(json.dumps({'biens':len(assets),'quantite_initiale':sum(i['quantity'] for i in assets),'quantites_non_renseignees':sum(i['quantity_defaulted'] for i in assets)},ensure_ascii=False))
