import importlib.util
import sys
from pathlib import Path
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from reconcile_categories import reconcile, sql_for_updates

class ReconciliationTest(unittest.TestCase):
    def test_matches_duplicate_old_lines_without_deleting_or_resetting_quantities(self):
        old=[{'designation':'Caméra','reference':'X','category':'ECA','import_key':'abc:4'},
             {'designation':'Caméra','reference':'X','category':'ECA','import_key':'abc:5'},
             {'designation':'Absent','reference':None,'import_key':'abc:6'}]
        for item in old:item['quantity']=1
        new=[{'designation':'CAMÉRA ','reference':'X','category':'CAM','quantity':1}]
        updates,absent,groups=reconcile(old,new,{'CAM'})
        self.assertEqual(updates,[('abc:4','CAM'),('abc:5','CAM')]);self.assertEqual(len(absent),1);self.assertEqual(len(groups),1)
        sql=sql_for_updates(updates)
        self.assertNotIn('delete',sql.lower());self.assertNotIn('set quantity',sql.lower());self.assertIn('array[4,5]',sql)
    def test_ambiguous_or_unknown_source_is_rejected(self):
        old=[{'designation':'A','reference':None,'import_key':'abc:1','quantity':1}]
        new=[{'designation':'A','reference':None,'category':'CAM','quantity':1}]
        with self.assertRaises(ValueError):reconcile(old,new*2,{'CAM'})
        with self.assertRaises(ValueError):reconcile(old,[{**new[0],'designation':'B'}],{'CAM'})
        with self.assertRaises(ValueError):reconcile(old,new,{'MAC'})
