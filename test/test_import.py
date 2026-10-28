import importlib.util
import tempfile
import unittest
import zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location('prepare',Path(__file__).resolve().parents[1]/'scripts/prepare_import.py')
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)

class ImportTest(unittest.TestCase):
    def workbook(self, quantity='3', formula=False):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        path = Path(temp.name)/'test.xlsx'
        def cell(address,value):
            from xml.sax.saxutils import escape
            return f'<c r="{address}" t="inlineStr"><is><t>{escape(value)}</t></is></c>'
        row2 = ''.join(cell(f'{c}2',v) for c,v in [('A','CODE_BIEN'),('B','DESIGNATION'),('C','QTE'),('D','DAT_CREAT'),('E','NOMCOURT')])
        row4 = cell('B4',"Lance d'essai")+cell('C4',quantity)+cell('D4','45944')
        row4 += '<c r="E4" t="str"><f>$B$4</f><v>Valeur périmée</v></c>' if formula else cell('E4','Lance')
        with zipfile.ZipFile(path,'w') as z:
            z.writestr('xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="ASTECH_Import" r:id="rId1"/></sheets></workbook>')
            z.writestr('xl/_rels/workbook.xml.rels','<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')
            z.writestr('xl/worksheets/sheet1.xml',f'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="2">{row2}</row><row r="3">{cell("B3","Instructions non importées")}</row><row r="4">{row4}</row></sheetData></worksheet>')
        return path

    def test_date_quantity_and_private_source(self):
        items=prepare.read_assets(self.workbook())
        self.assertEqual(len(items),1)
        self.assertEqual(items[0]['quantity'],3)
        self.assertEqual(items[0]['registered_at'],'2025-10-14')
        self.assertFalse(items[0]['quantity_defaulted'])
        self.assertEqual(items[0]['source_data']['QTE'],'3')
        self.assertIn("Lance d''essai",prepare.make_sql(items))

    def test_missing_quantity_is_explicitly_defaulted(self):
        item=prepare.read_assets(self.workbook(''))[0]
        self.assertEqual(item['quantity'],1)
        self.assertTrue(item['quantity_defaulted'])

    def test_invalid_quantity_rejected(self):
        with self.assertRaises(ValueError): prepare.read_assets(self.workbook('-2'))

    def test_direct_formula_uses_referenced_value(self):
        item=prepare.read_assets(self.workbook(formula=True))[0]
        self.assertEqual(item['short_name'],item['designation'])

if __name__ == '__main__': unittest.main()
