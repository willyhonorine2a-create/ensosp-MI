"""Prepare reviewed workbook sheets for existing vehicles; never execute Excel formulas.
Usage: python3 -m scripts.import_vehicle_sheets PRIVATE_DIRECTORY --output OUTPUT_SQL
"""
import argparse,json,re
from pathlib import Path
from zipfile import ZipFile,is_zipfile
from scripts.prepare_public_inventory import cells,NS,ET

# Photos vérifiées sur une planche de contact : exclure plaques décoratives et logos.
REVIEWED_PHOTOS={
 'CCRM SR 22.xlsx':(3,4),'CCRM SR 23.xlsx':(3,4),
 'EPS 04.xlsx':(3,4),'EPS 05.xlsx':(3,4),'EPS 06.xlsx':(1,4),
 'FPT 10.xlsx':(3,4),'FPT 11.xlsx':(3,4),
 'FPT 13.xlsx':(2,4),'FPT 14.xlsx':(2,4),'FPT 15.xlsx':(2,4),
 'FPT 16.xlsx':(2,4),'FPT 17.xlsx':(2,4),
 'FPT 9.xlsx':(3,4),'FPTL 19.xlsx':(3,4),'FPTL 20.xlsx':(3,4),'FPTL 21.xlsx':(3,4)
}

def identity(name):
    match=re.fullmatch(r'([A-Z -]+?)\s*(\d+)',name.upper().strip())
    if not match:raise ValueError('Nom non reconnu : '+name)
    return re.sub('[ -]','',match[1])+str(int(match[2]))

def extract(path):
    with ZipFile(path) as archive:
        values=cells(archive);sections=[]
        for col,qty in [('A','D'),('F','I'),('K','N')]:
            parent=None;current=None
            for row in range(10,max(int(re.search(r'\d+',key)[0]) for key in values)+1):
                name=values.get(f'{col}{row}','');quantity=values.get(f'{qty}{row}')
                if not name or name=='DESIGNATION' or re.match(r'^(Création|Mise à jour|Validation|Version)\s*:',name):continue
                if quantity is None:
                    if re.fullmatch('[1-6]',name):name='COFFRE '+name
                    if not name.startswith(('CABINE','COFFRE','ARRIERE','TOIT','SUR PLATEFORME','SUR PARC ECHELLE','BAS ARRIERE CABINE')):raise ValueError(f'Quantité absente {col}{row}: {name}')
                    child=name in ['COFFRE DU BAS','COFFRE POMPE','COFFRE DE TOIT','COFFRE AVANT BAS','COFFRE ARRIERE BAS','BAS ARRIERE CABINE']
                    label=parent+' · '+name if child and parent else name
                    if not child:parent=name
                    current={'id':f'{col.lower()}-{row}','label':label,'items':[]};sections.append(current)
                else:
                    if current is None or not re.fullmatch(r'\d+(?:\s*\+\s*\d+)*',quantity):raise ValueError(f'Quantité invalide {col}{row}: {quantity}')
                    current['items'].append({'designation':name,'quantity':sum(int(x.strip()) for x in quantity.split('+')),'quantityText':quantity,'sourceCell':f'{col}{row}'})
        registrations=[]
        for file in archive.namelist():
            if file.startswith('xl/drawings/') and file.endswith('.xml'):
                for paragraph in ET.fromstring(archive.read(file)).findall('.//a:p',NS):
                    text=''.join(t.text or '' for t in paragraph.findall('.//a:t',NS))
                    registrations.extend(re.findall(r'[A-Z]{2}\s*-\s*\d{3}\s*-?\s*[A-Z]{2}',text))
        registrations={re.sub(r'\s|-','',r) for r in registrations}
        if len(registrations)!=1:raise ValueError('Immatriculation ambiguë')
        metadata={v.split(':',1)[0].strip():v.split(':',1)[1].strip() for v in values.values() if v.startswith(('Mise à jour :','Version :'))}
        return {'name':values['A1'],'registration':next(iter(registrations)),'sections':[s for s in sections if s['items']],'photos':[],'source':path.name,'updatedAt':metadata['Mise à jour'],'version':metadata['Version']}

def prepare(directory,fleet,output):
    statements=[];report=[];seen=set()
    for path in sorted(directory.rglob('*.xlsx')):
        if path.name=='EPS 01.xlsx':report.append([path.name,'Exclu : ancien doublon EPS 04, utiliser EPS 04.xlsx']);continue
        try:
            if not is_zipfile(path):raise ValueError('Classeur chiffré : fournir une copie Excel non chiffrée')
            sheet=extract(path);vehicle=next((v for v in fleet['vehicles'] if identity(v['name'])==identity(sheet['name'])),None)
            if not vehicle:raise ValueError('Engin absent du parc : affectation à confirmer')
            if vehicle['registration'].replace('-','')!=sheet['registration']:raise ValueError('Immatriculation différente du parc')
            if vehicle['id'] in seen:raise ValueError('Doublon de fiche')
            seen.add(vehicle['id']);sheet.update(id=vehicle['id'],name=vehicle['name'],registration=vehicle['registration'])
            existing=next((s for s in fleet['sheets'] if s['id']==vehicle['id']),None)
            if existing:sheet['photos']=existing['photos']
            elif path.name in REVIEWED_PHOTOS:
                with ZipFile(path) as archive:
                    for index,number in enumerate(REVIEWED_PHOTOS[path.name],1):
                        filename=f"{vehicle['id']}-profil-{index}.jpeg"
                        target=Path('public/inventaire/photos')/filename
                        target.write_bytes(archive.read(f'xl/media/image{number}.jpeg'))
                        sheet['photos'].append({'src':'/inventaire/photos/'+filename,'caption':'Photo de profil intégrée à la fiche fournie'})
            payload=json.dumps(sheet,ensure_ascii=False).replace("'","''")
            vid=vehicle['id'].replace("'","''");registration=vehicle['registration'].replace("'","''")
            statements.append(f"UPDATE public.inventory_vehicles SET sheet='{payload}'::jsonb,revision=revision+1 WHERE id='{vid}' AND registration='{registration}' AND revision=1;")
            report.append([path.name,f"Prêt : {vehicle['name']}, {sum(len(s['items']) for s in sheet['sections'])} lignes"])
        except ValueError as error:report.append([path.name,str(error)])
    # Journaliser les seules lignes réellement modifiées ; préserver les fiches déjà éditées.
    sql="""begin;
create temporary table inventory_before_import on commit drop as select * from public.inventory_vehicles;
"""+'\n'.join(statements)+"""
insert into public.inventory_events(vehicle_id,actor_id,reason,before_data,after_data)
select v.id,null,'Import des fiches Excel fournies',to_jsonb(b),to_jsonb(v)
from public.inventory_vehicles v join inventory_before_import b using(id)
where v.revision<>b.revision;
commit;
"""
    output.write_text(sql);return report

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('directory',type=Path);parser.add_argument('--output',required=True,type=Path);args=parser.parse_args()
    fleet=json.loads(Path('public/inventaire/data.json').read_text());print(json.dumps(prepare(args.directory,fleet,args.output),ensure_ascii=False,indent=2))
