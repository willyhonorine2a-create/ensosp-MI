import {validatePhoto} from './photos.js';
export const mapping = {
 name:'designation',assetCode:'asset_code',shortName:'short_name',category:'category',photoPath:'photo_path',
 categoryName:'category_name',
 reference:'reference',serial:'serial_number',barcode:'barcode',service:'service_code',serviceName:'service_name',
 location:'location',condition:'condition_code',supplier:'supplier_code',manager:'manager_code',parentCode:'parent_code',
 registeredAt:'registered_at',purchasedAt:'purchased_at',assignedAt:'assigned_at',warrantyUntil:'warranty_until',notes:'notes'
};
export function fromRow(row) {
 const item={id:row.id,stock:row.quantity,minimum:row.minimum_quantity,quantityDefaulted:row.quantity_defaulted,quantityMi:Number(row.quantity_mi || 0),quantityCs:Number(row.quantity_cs || 0),trackingMode:row.tracking_mode || 'quantity',availableStock:Number(row.available_devices ?? row.quantity)};
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
    const page=await client.from('stock_assets').select('*').is('archived_at',null).order('id').range(start,start+499);
    if(page.error) {
     if(['42P01','PGRST205'].includes(page.error.code))throw Error('Le suivi des appareils n’est pas encore installé. Exécutez les cinq scripts Supabase puis actualisez.');
     throw page.error;
    }
    items.push(...page.data.map(fromRow));
    if(page.data.length<500) break;
   }
   const deviceFacts=[];
   for(let start=0;;start+=500){
    const facts=await client.from('stock_devices').select('id,asset_id,status,warranty_until,physical_location').is('retired_at',null).order('id').range(start,start+499);
    if(facts.error)throw Error('Emplacements indisponibles. Exécutez les scripts Supabase de localisation MI / CS puis actualisez.');
    deviceFacts.push(...facts.data);if(facts.data.length<500)break;
   }
   for(const item of items)if(item.trackingMode==='individual')item.availableStock=deviceFacts.filter(d=>d.asset_id===item.id && d.status==='available').length;
   const locationEvents=await client.from('stock_location_events').select('id,action,reason,payload,before_data,after_data,created_at,stock_assets(designation)').order('created_at',{ascending:false}).limit(20);
   if(locationEvents.error)throw Error('Exécutez les scripts Supabase de localisation MI / CS puis actualisez.');
   const paths=[...new Set(items.map(i=>i.photoPath).filter(Boolean))];
   if(paths.length) {
    const {data,error}=await client.storage.from('stock-photos').createSignedUrls(paths,3600);
    const urls=new Map((data || []).map(p=>[p.path,p.signedUrl]));
    items.forEach(i=>{i.photoUrl=urls.get(i.photoPath) || '';i.photoUnavailable=Boolean(i.photoPath && (error || !i.photoUrl));});
   }
   const result=await client.from('stock_movements').select('id,asset_id,movement_type,quantity,created_at,reason,stock_assets(designation)').order('created_at',{ascending:false}).limit(20);
   if(result.error) throw result.error;
   const names=new Map(items.map(i=>[i.id,i.name]));
   const events=await client.from('stock_asset_events').select('id,action,before_quantity,after_quantity,reason,created_at,stock_assets(designation)').order('created_at',{ascending:false}).limit(20);
   if(events.error) throw Error('Actions de stock indisponibles. Appliquez les deux scripts de gestion du stock puis actualisez.');
   return {locationEvents:locationEvents.data,deviceFacts,events:events.data,categories,items,history:result.data.map(m=>({name:m.stock_assets?.designation || names.get(m.asset_id)||'Matériel',type:m.movement_type,quantity:m.quantity,date:m.created_at,reason:m.reason}))};
  },
  async locate(item,action,from,to,quantity,reason,requestId) {
   const {error}=await client.rpc('manage_located_stock',{p_asset_id:item.id,p_action:action,p_from:from,p_to:to,p_quantity:quantity,p_expected:[item.stock,item.quantityMi || 0,item.quantityCs || 0],p_reason:reason,p_request_id:requestId});
   if(error)throw error;
  },
  async devices(assetId) {
   const devices=[];
   for(let start=0;;start+=500) {
    const result=await client.from('stock_devices').select('*').eq('asset_id',assetId).is('retired_at',null).order('device_number').range(start,start+499);
    if(result.error)throw result.error;devices.push(...result.data);if(result.data.length<500)break;
   }
   return devices;
  },
  async saveDevice(assetId,device,action,data,requestId) {
   const {error}=await client.rpc('manage_stock_device',{p_asset_id:assetId,p_id:device?.id || null,p_action:action,p_data:data,p_expected_at:device?.updated_at || null,p_request_id:requestId});
   if(error)throw error;
  },
  async convert(items,count,reason,requestId) {
   const {data,error}=await client.rpc('convert_stock_reference',{p_items:items.map(i=>({id:i.id,quantity:i.stock})),p_count:count,p_reason:reason,p_request_id:requestId});
   if(error)throw error;return data;
  },
  async move(id,type,quantity,reason,requestId) {
   const {error}=await client.rpc('record_stock_movement_once',{p_asset_id:id,p_type:type,p_quantity:quantity,p_reason:reason,p_request_id:requestId});
   if(error) throw error;
  },
  async manageStock(id,action,quantity,expected,reason,requestId) {
   const {error}=await client.rpc('manage_stock_asset',{p_asset_id:id,p_action:action,p_quantity:quantity,p_expected_quantity:expected,p_reason:reason,p_request_id:requestId});
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
   const {data,error}=await client.rpc('save_stock_reference',{p_id:editing ? item.id : null,p_data:{...toRow(item),...(item.creationRequestId?{request_id:item.creationRequestId}:{})},p_initial_quantity:editing ? null : item.stock,p_mode:item.trackingMode || 'quantity'});
   if(error) throw error;
   return data;
  }
 };
}
