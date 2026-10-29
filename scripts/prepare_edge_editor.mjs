import {build} from 'esbuild';
import {mkdir,readFile} from 'node:fs/promises';
await mkdir('docs/deploiement',{recursive:true});
for(const name of ['inventory-report','report-notifications']) {
 const outfile=`docs/deploiement/${name}.ts`;
 await build({entryPoints:[`supabase/functions/${name}/index.ts`],bundle:true,format:'esm',platform:'neutral',target:'es2022',external:['npm:*'],outfile,
 banner:{js:'// @ts-nocheck\n// Fichier généré pour Supabase Editor. Ne pas modifier directement.\n// Régénération : node scripts/prepare_edge_editor.mjs\n// Ne contient aucune clé secrète ; configurer les secrets dans Supabase.'}});
 const text=await readFile(outfile,'utf8');
 if(/from ["']\.{1,2}\//.test(text))throw Error('Import local non regroupé : '+name);
 console.log(`${outfile} : autonome, ${Buffer.byteLength(text)} octets`);
}
