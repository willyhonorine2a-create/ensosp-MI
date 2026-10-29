import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {readdirSync} from 'node:fs';
const routes = {'/inventaire':'inventaire/index.html','/inventaire/':'inventaire/index.html','/inventaire/index.html':'inventaire/index.html','/':'index.html','/index.html':'index.html','/src/app.js':'src/app.js','/src/stock.js':'src/stock.js','/src/patrimoine.js':'src/patrimoine.js','/src/style.css':'src/style.css'};
for (const file of ['manifest.webmanifest','icons/magasin.svg','icons/apple-touch-icon.png','icons/icon-192.png','icons/icon-512.png']) routes['/'+file]=file;
for(const file of ['data.json','style.css','app.js','photos/fpt-18-profil-1.jpeg','photos/fpt-18-profil-2.jpeg'])routes['/inventaire/'+file]='inventaire/'+file;
for(const file of readdirSync(new URL('dist/inventaire/photos/',import.meta.url))) {
 if(/^[a-z0-9-]+\.jpeg$/.test(file))routes['/inventaire/photos/'+file]='inventaire/photos/'+file;
}
const types = {json:'application/json; charset=utf-8',jpeg:'image/jpeg',png:'image/png',svg:'image/svg+xml',webmanifest:'application/manifest+json',html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8'};
const port=Number(process.env.PORT || 3000);
http.createServer(async(req,res)=>{
  const file=routes[new URL(req.url,'http://localhost').pathname];
  if(!file){res.writeHead(404);res.end('Introuvable');return;}
  try {const body=await readFile(new URL('dist/'+file,import.meta.url));res.writeHead(200,{'Content-Type':types[file.split('.').pop()],'X-Content-Type-Options':'nosniff'});res.end(body);}
  catch{res.writeHead(500);res.end('Erreur de lecture');}
}).listen(port,'0.0.0.0',()=>console.log(`Serveur démarré sur le port ${port}`));
