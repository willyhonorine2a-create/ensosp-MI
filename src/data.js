import {validatePhoto} from './photos.js';
export const mapping = {
 name:'designation',assetCode:'asset_code',shortName:'short_name',category:'category',photoPath:'photo_path',
 categoryName:'category_name',
 reference:'reference',serial:'serial_number',barcode:'barcode',service:'service_code',serviceName:'service_name',
 location:'location',condition:'condition_code',supplier:'supplier_code',manager:'manager_code',parentCode:'parent_code',
 registeredAt:'registered_at',purchasedAt:'purchased_at',assignedAt:'assigned_at',warrantyUntil:'warranty_until',notes:'notes'
};
export function fromRow(row) {
 const item={id:row.id,stock:row.quantity,minimum:row.minimum_quantity,quantityDefaulted:row.quantity_defaulted};
 for(const [key,column] of Object.entries(mapping)) item[key]=row[column] ?? '';
 return item;
}
export function toRow(item) {
 const row={};
 for(const [key,column] of Object.entries(mapping)) row[column]=item[key]?.trim() || null;
 row.minimum_quantity=item.minimum;
 return row;
}
export function createRepository(client) {
 return {
  async load(userId) {
   const member=await client.from('stock_members').select('user_id').eq('user_id',userId).maybeSingle();
   if(member.error) throw member.error;
   if(!member.data) throw Error('Votre compte n’est pas encore autorisé à accéder au magasin. Contactez le gestionnaire.');
   const catalog=await client.from('stock_category_catalog').select('*').order('code');
   if(catalog.error) throw Error('Catégories indisponibles. Appliquez la migration des catégories simples puis actualisez.');
   const categories=catalog.data;
   const items=[];
   for(let start=0;;start+=500) {
    const page=await client.from('stock_assets').select('*').order('id').range(start,start+499);
    if(page.error) throw page.error;
    items.push(...page.data.map(fromRow));
    if(page.data.length<500) break;
   }
   const paths=[...new Set(items.map(i=>i.photoPath).filter(Boolean))];
   if(paths.length) {
    const {data,error}=await client.storage.from('stock-photos').createSignedUrls(paths,3600);
    const urls=new Map((data || []).map(p=>[p.path,p.signedUrl]));
    items.forEach(i=>{i.photoUrl=urls.get(i.photoPath) || '';i.photoUnavailable=Boolean(i.photoPath && (error || !i.photoUrl));});
   }
   const result=await client.from('stock_movements').select('id,asset_id,movement_type,quantity,created_at,reason').order('created_at',{ascending:false}).limit(20);
   if(result.error) throw result.error;
   const names=new Map(items.map(i=>[i.id,i.name]));
   return {categories,items,history:result.data.map(m=>({name:names.get(m.asset_id)||'Matériel',type:m.movement_type,quantity:m.quantity,date:m.created_at,reason:m.reason}))};
  },
  async move(id,type,quantity,reason,requestId) {
   const {error}=await client.rpc('record_stock_movement_once',{p_asset_id:id,p_type:type,p_quantity:quantity,p_reason:reason,p_request_id:requestId});
   if(error) throw error;
  },
  async createCategory(code,label) {
   const {error}=await client.rpc('create_stock_category',{p_code:code,p_label:label});
   if(error) throw error;
  },
  async uploadPhoto(file) {
   const extension=await validatePhoto(file);
   const path=`photos/${crypto.randomUUID()}.${extension}`;
   const {error}=await client.storage.from('stock-photos').upload(path,file,{contentType:file.type,upsert:false});
   if(error) throw error;
   return path;
  },
  async saveAsset(item,editing) {
   const {data,error}=await client.rpc('save_stock_asset',{p_id:editing ? item.id : null,p_data:toRow(item),p_initial_quantity:editing ? null : item.stock});
   if(error) throw error;
   return data;
  }
 };
}
