export function classificationLabel(ref,level,item) {
 const list=ref?.[level] || [];
 const found=list.find(row=>row.code===item[level==='genres'?'genre':level==='categories'?'category':'subcategory'] && (level==='genres' || row.genre_code===item.genre) && (level!=='subcategories' || row.category_code===item.category));
 return found ? `${found.code} · ${found.label}` : '';
}
export function classificationIssue(ref,item) {
 return Boolean((item.genre && !classificationLabel(ref,'genres',item)) || (item.category && !classificationLabel(ref,'categories',item)) || (item.subcategory && !classificationLabel(ref,'subcategories',item)));
}
export function classificationChoices(ref,level,genre='',category='') {
 return (ref?.[level] || []).filter(r=>(level==='genres' || !genre || r.genre_code===genre) && (level!=='subcategories' || !category || r.category_code===category));
}
