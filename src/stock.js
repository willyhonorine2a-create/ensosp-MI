export function moveStock(items, id, type, quantity) {
  if (!['entry', 'exit'].includes(type)) throw new Error('Type de mouvement invalide.');
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error('Saisissez une quantité entière positive.');
  const item = items.find(item => item.id === id);
  if (!item) throw new Error('Matériel introuvable.');
  const stock = item.stock + (type === 'entry' ? quantity : -quantity);
  if (!Number.isSafeInteger(stock)) throw new Error('Quantité trop élevée.');
  if (stock < 0) throw new Error('Stock insuffisant pour cette sortie.');
  return items.map(item => item.id === id ? {...item, stock} : item);
}
