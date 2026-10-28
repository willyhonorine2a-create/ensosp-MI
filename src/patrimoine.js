// Champs inspirés des colonnes de la trame ASTECH_Import.
export const fields = [
 ['assetCode','Code du bien','CODE_BIEN',25],['shortName','Nom court','NOMCOURT',30],
 ['genre','Genre (code)','GENRE',5],['category','Catégorie (code)','CATEG',10],
 ['categoryName','Désignation catégorie','CATEG_DES',50],['subcategory','Sous-catégorie (code)','SOUSCAT',10],
 ['subcategoryName','Désignation sous-catégorie','SOUSCAT_DES',50],['serial','N° de série','NOSERIE',30],
 ['barcode','Code-barres','CODBAR',25],['service','Service d’affectation (code)','COD_SERV',7],
 ['serviceName','Désignation du service','COD_SERV_DES',30],['condition','État du bien (code)','ETAT',2],
 ['supplier','Fournisseur (code)','CODFOURN',10],['manager','Service gestionnaire (code)','SERVGEST',7],
 ['parentCode','Code du bien supérieur','CODE_PARENT',25],
 ['registeredAt','Date d’inscription','DAT_CREAT',10,'date'],['purchasedAt','Date d’achat','DAT_ACHAT',10,'date'],
 ['assignedAt','Début d’affectation','DAT_DEB_AFFECT',10,'date'],['warrantyUntil','Fin de garantie','DATGARANTIE',10,'date'],
 ['notes','Observations','OBS',512,'textarea']
];
export function validateAsset(item, items, editingId, {allowMissingIdentifiers = false, allowDuplicateReference = false} = {}) {
 if (!item.name || (!allowMissingIdentifiers && (!item.reference || !item.location))) throw Error('Renseignez la désignation, la référence et l’emplacement.');
 if (item.name.length > 100 || item.reference.length > 40 || item.location.length > 80) throw Error('Un champ dépasse la longueur autorisée.');
 if (![item.stock,item.minimum].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 1000000)) throw Error('Les quantités doivent être des entiers entre 0 et 1 000 000.');
 for (const [key,label,,max,type] of fields) {
  const value = item[key] || '';
  if (typeof value !== 'string' || value.length > max) throw Error(`${label} : ${max} caractères maximum.`);
  if (type === 'date' && value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value)) throw Error(`${label} : date invalide.`);
 }
 const other = items.filter(i => i.id !== editingId);
 if (!allowDuplicateReference && item.reference && other.some(i => i.reference.toLocaleLowerCase('fr') === item.reference.toLocaleLowerCase('fr'))) throw Error('Cette référence existe déjà.');
 if (item.assetCode && other.some(i => i.assetCode?.toLocaleLowerCase('fr') === item.assetCode.toLocaleLowerCase('fr'))) throw Error('Ce code du bien existe déjà.');
}
