export const mapping = {
 name:'designation',assetCode:'asset_code',shortName:'short_name',genre:'genre',category:'category',
 categoryName:'category_name',subcategory:'subcategory',subcategoryName:'subcategory_name',
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
   const items=[];
   for(let start=0;;start+=500) {
    const page=await client.from('stock_assets').select('*').order('id').range(start,start+499);
    if(page.error) throw page.error;
    items.push(...page.data.map(fromRow));
    if(page.data.length<500) break;
   }
   const result=await client.from('stock_movements').select('id,asset_id,movement_type,quantity,created_at,reason').order('created_at',{ascending:false}).limit(20);
   if(result.error) throw result.error;
   const names=new Map(items.map(i=>[i.id,i.name]));
   return {items,history:result.data.map(m=>({name:names.get(m.asset_id)||'Matériel',type:m.movement_type,quantity:m.quantity,date:m.created_at,reason:m.reason}))};
  },
  async move(id,type,quantity,reason,requestId) {
   const {error}=await client.rpc('record_stock_movement_once',{p_asset_id:id,p_type:type,p_quantity:quantity,p_reason:reason,p_request_id:requestId});
   if(error) throw error;
  },
  async saveAsset(item,editing) {
   const {error}=await client.rpc('save_stock_asset',{p_id:editing ? item.id : null,p_data:toRow(item),p_initial_quantity:editing ? null : item.stock});
   if(error) throw error;
  }
 };
}
