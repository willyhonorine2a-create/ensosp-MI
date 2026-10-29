"""Extract reviewed vehicle inventory workbooks; never execute workbook content."""
import argparse
import json
import re
from pathlib import Path
from zipfile import ZipFile
import xml.etree.ElementTree as ET

NS={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main'}

def cells(archive):
    shared=[]
    if 'xl/sharedStrings.xml' in archive.namelist():
        shared=[''.join(node.itertext()) for node in ET.fromstring(archive.read('xl/sharedStrings.xml'))]
    result={}
    for cell in ET.fromstring(archive.read('xl/worksheets/sheet1.xml')).findall('.//s:sheetData/s:row/s:c',NS):
        value=cell.find('s:v',NS)
        text=value.text if value is not None else ''.join(cell.find('s:is',NS).itertext()) if cell.find('s:is',NS) is not None else ''
        if cell.get('t')=='s':text=shared[int(text)]
        if text:result[cell.get('r')]=text.strip()
    return result

def vehicle_id(name):
    parts=re.fullmatch(r'([A-Z ]+?)\s*(\d+)',name.strip().upper())
    if not parts:raise ValueError(f'Nom de moyen non reconnu : {name}')
    return re.sub(r'\s+','-',parts[1].strip().lower())+'-'+parts[2].zfill(2)

def extract_fpt(archive,source_name):
    values=cells(archive)
    sections=[]
    for name_col,qty_col in [('A','D'),('F','I'),('K','N')]:
        parent=None
        current=None
        for row in range(10,max(int(re.search(r'\d+',key)[0]) for key in values)+1):
            name=values.get(f'{name_col}{row}','')
            quantity=values.get(f'{qty_col}{row}')
            if not name or name=='DESIGNATION' or any(name.startswith(prefix) for prefix in ['Création :','Mise à jour :','Validation :','Version :']):continue
            if quantity is None:
                if not any(name.startswith(prefix) for prefix in ['CABINE','COFFRE','ARRIERE','TOIT']):raise ValueError(f'Quantité absente : {name_col}{row}')
                if name in ['COFFRE DU BAS','COFFRE POMPE','COFFRE DE TOIT']:
                    if not parent:raise ValueError('Compartiment sans parent')
                    label=parent+' · '+name
                else:parent=name;label=name
                current={'id':f'{name_col.lower()}-{row}','label':label,'items':[]}
                sections.append(current)
            else:
                if not current or not re.fullmatch(r'\d+(?:\s*\+\s*\d+)*',quantity):raise ValueError(f'Ligne invalide : {name_col}{row}')
                current['items'].append({'designation':name,'quantity':sum(int(part.strip()) for part in quantity.split('+')),'quantityText':quantity,'sourceCell':f'{name_col}{row}'})
    # Empty section titles serve only as parent headings in the workbook.
    sections=[section for section in sections if section['items']]
    order={name:i for i,name in enumerate(['CABINE AVANT','CABINE ARRIERE','COFFRE 1','COFFRE 2','COFFRE 3','COFFRE 4','COFFRE 5','COFFRE 6','ARRIERE FPT','TOIT'])}
    sections.sort(key=lambda section:order[section['label'].split(' · ')[0]])
    drawing=ET.fromstring(archive.read('xl/drawings/drawing1.xml'))
    registrations=[text.text for text in drawing.findall('.//a:t',NS) if re.fullmatch(r'[A-Z]{2}\s*-\s*\d{3}\s*-\s*[A-Z]{2}',text.text or '')]
    if len(registrations)!=1:raise ValueError('Immatriculation de la fiche ambiguë')
    metadata={value.split(':',1)[0].strip():value.split(':',1)[1].strip() for value in values.values() if any(value.startswith(prefix) for prefix in ['Mise à jour :','Version :'])}
    sheet={'id':vehicle_id(values['A1']),'name':values['A1'],'registration':re.sub(r'\s+','',registrations[0]),'updatedAt':metadata['Mise à jour'],'version':metadata['Version'],'source':source_name,'sections':sections,'photos':[
        {'src':f"/inventaire/photos/{vehicle_id(values['A1'])}-profil-1.jpeg",'caption':'Photo de profil intégrée à la fiche fournie'},
        {'src':f"/inventaire/photos/{vehicle_id(values['A1'])}-profil-2.jpeg",'caption':'Photo de l’autre profil intégrée à la fiche fournie'}]}
    return sheet

def build(fleet_path,fpt_path,output,center=None):
    with ZipFile(fleet_path) as archive:
        values=cells(archive)
        if [values.get(f'{col}1') for col in 'ABC']!=['nom_moyen','immatriculation','id_uf_ope']:raise ValueError('En-têtes du parc inattendus')
        vehicles=[]
        for row in range(2,max(int(re.search(r'\d+',key)[0]) for key in values)+1):
            if not values.get(f'A{row}'):continue
            name=values[f'A{row}'];registration=values.get(f'B{row}');affectation=values.get(f'C{row}')
            if not registration or not affectation:raise ValueError(f'Parc incomplet ligne {row}')
            vehicles.append({'id':vehicle_id(name),'name':name,'registration':registration,'center':affectation,'sheetId':None})
    if fpt_path.name!='FPT 18.xlsx':raise ValueError('Seul le modèle FPT 18 relu est pris en charge pour les photos')
    with ZipFile(fpt_path) as archive:
        sheet=extract_fpt(archive,fpt_path.name)
        target=next((v for v in vehicles if v['id']==sheet['id']),None)
        if target:
            if center and target['center']!=center:raise ValueError('Affectation contradictoire avec le parc')
            if target['registration']!=sheet['registration']:raise ValueError('Immatriculations contradictoires')
            target['sheetId']=sheet['id']
        else:vehicles.append({'id':sheet['id'],'name':sheet['name'],'registration':sheet['registration'],'center':center,'sheetId':sheet['id']})
        if len({v['id'] for v in vehicles})!=len(vehicles):raise ValueError('Engins dupliqués')
        photos=output/'photos';photos.mkdir(parents=True,exist_ok=True)
        # These two reviewed images are the vehicle photographs, not the decorative plate or logo.
        for source,photo in zip(['xl/media/image2.jpeg','xl/media/image4.jpeg'],sheet['photos']):
            (photos/Path(photo['src']).name).write_bytes(archive.read(source))
    payload={'fleetSource':'parc engins 2026_valide.xlsx','fleetYear':2026,'vehicles':vehicles,'sheets':[sheet]}
    output.mkdir(parents=True,exist_ok=True)
    (output/'data.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n')
    return payload

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--fleet',type=Path,required=True);parser.add_argument('--sheet',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--center')
    args=parser.parse_args();data=build(args.fleet,args.sheet,args.output,args.center)
    print(f"{len(data['vehicles'])} engins, {len(data['sheets'])} fiche, {sum(len(s['items']) for s in data['sheets'][0]['sections'])} lignes de matériel")
