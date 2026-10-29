import io
import sys
import unittest
from pathlib import Path
from zipfile import ZipFile
from xml.sax.saxutils import escape
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from prepare_public_inventory import extract_fpt,vehicle_id

class PublicInventoryImport(unittest.TestCase):
    def archive(self,quantity):
        values={'A1':'FPT 18','A10':'CABINE AVANT','A11':'DESIGNATION','A12':'GHV conducteur + CA','D12':quantity,'A13':'COFFRE 1','A14':'COFFRE DU BAS','A15':'Cale véhicule','D15':'2','A60':'Mise à jour : 29/04/2026','A62':'Version : 01'}
        rows={}
        for address,value in values.items():
            number=''.join(c for c in address if c.isdigit())
            rows.setdefault(number,[]).append(f'<c r="{address}" t="inlineStr"><is><t>{escape(value)}</t></is></c>')
        content='<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+''.join('<row>'+''.join(v)+'</row>' for v in rows.values())+'</sheetData></worksheet>'
        memory=io.BytesIO()
        with ZipFile(memory,'w') as z:
            z.writestr('xl/worksheets/sheet1.xml',content)
            z.writestr('xl/drawings/drawing1.xml','<root xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:t>ES - 676 - MV</a:t></root>')
        return ZipFile(memory)

    def test_quantity_expression_is_preserved_without_executing_it(self):
        with self.archive('1+1') as archive:sheet=extract_fpt(archive,'FPT 18.xlsx')
        self.assertEqual(sheet['registration'],'ES-676-MV')
        self.assertEqual(sheet['sections'][0]['items'][0]['quantity'],2)
        self.assertEqual(sheet['sections'][0]['items'][0]['quantityText'],'1+1')
        self.assertEqual(sheet['sections'][1]['label'],'COFFRE 1 · COFFRE DU BAS')

    def test_unknown_quantity_is_rejected(self):
        for quantity in ['inconnu','-1','1/2','1+foo']:
            with self.archive(quantity) as archive:
                with self.assertRaises(ValueError):extract_fpt(archive,'FPT 18.xlsx')

    def test_vehicle_ids_match_spacing_and_leading_zero_variants(self):
        self.assertEqual(vehicle_id('FPTL19'),vehicle_id('FPTL 19'))
        self.assertEqual(vehicle_id('FPT 6'),vehicle_id('FPT 06'))
