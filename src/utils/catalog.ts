export type PublicPlan = {
  id:string;name:string;tagline:string;billingPeriod:string;priceCents:number;perks:string[];badge?:string|null;
  isRecommended?:boolean;allowPause:boolean;maxPauseDays:number;description:string;period:string;discount:string;price:string;originalPrice:string;
};
export type PublicProduct={id:string;name:string;description:string;category:string;basePrice:number;variants?:any[]};
const money=(cents:number)=>`$${(Number(cents||0)/100).toFixed(2)}`;
const periodLabel=(cycle:string)=>({DAILY:'day',WEEKLY:'week',MONTHLY:'month',QUARTERLY:'quarter',YEARLY:'year'} as Record<string,string>)[cycle]||cycle.toLowerCase();
export function mapPublicPlan(row:any):PublicPlan{
  const perks=Array.isArray(row.perks)?row.perks:JSON.parse(row.perksJson||'[]');
  const value=Number(row.price)||0;
  const savings=Number(row.badge?.match(/(\d+)%/)?.[1]||0);
  return {...row,priceCents:value,perks,description:row.tagline||'',period:periodLabel(row.billingPeriod),discount:row.badge|| (savings?`${savings}% off`:'Member pricing'),price:money(value),originalPrice:savings?money(Math.round(value/(1-savings/100))):money(Math.round(value*1.2))};
}
export async function getPublicCatalog(){
  const response=await fetch('/api/public/catalog');
  if(!response.ok)throw new Error('The Brightloop catalog is unavailable.');
  const data=await response.json();
  return {plans:(data.plans||[]).map(mapPublicPlan) as PublicPlan[],products:(data.products||[]) as PublicProduct[],discounts:data.discounts||[],paymentMethods:data.paymentMethods||{card:true,upi:true,wallet:true},currency:data.currency||'USD',taxRatePercent:Number(data.taxRatePercent??18)};
}
