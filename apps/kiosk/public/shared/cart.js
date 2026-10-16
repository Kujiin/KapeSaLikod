export function cartTotal(items){return items.reduce((sum,item)=>sum+Number(item.price_centavos)*item.quantity,0);}
export function orderPayload(type,items){
  if(!['Dine In','Take Out'].includes(type)||!items.length)throw new Error('Choose an order type and add a drink.');
  return {order_type:type,items:items.map(i=>({variant_id:String(i.variant_id),quantity:i.quantity}))};
}
