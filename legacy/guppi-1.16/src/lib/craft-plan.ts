/** Mirrors the game's recursive ingredient preparation, consuming existing parts first. */
export type CraftPlan={used:Record<string,number>;raw:Record<string,number>;prepare:Record<string,number>;missing:Record<string,number>;durationSeconds:number;needsPrinter:boolean};
export function planCraft(recipe:any,recipes:any[],probe:any):CraftPlan{
 const plan:CraftPlan={used:{},raw:{},prepare:{},missing:{},durationSeconds:0,needsPrinter:false};
 if(!recipe||!Array.isArray(recipes)||!probe?.inventory)throw Error('Current recipe and inventory are required.');
 const stock:Record<string,number>={};
 for(const i of probe.inventory.items||[])stock[i.type]=(stock[i.type]||0)+1;
 for(const r of probe.inventory.resourceStocks||[])if(Number.isFinite(r.amount))stock[r.type]=(stock[r.type]||0)+r.amount;
 if(Number.isFinite(probe.fuel?.deuterium))stock.deuterium=probe.fuel.deuterium/100;
 const add=(map:Record<string,number>,key:string,n:number)=>{map[key]=(map[key]||0)+n};
 let steps=0;
 const build=(r:any,count:number,path:Set<string>)=>{
  if(++steps>10000||path.has(r.id)||path.size>30)throw Error('Recipe dependencies are cyclic or too large.');
  if(!Number.isFinite(r.durationSeconds)||r.durationSeconds<0||!Array.isArray(r.ingredients))throw Error('Recipe details are incomplete.');
  plan.durationSeconds+=r.durationSeconds*count;
  if(r.craftableBy?.includes('atomic_3d_printer')&&!r.craftableBy?.includes('manny'))plan.needsPrinter=true;
  const next=new Set(path).add(r.id),unfilled:any[]=[];
  // Reserve every direct ingredient before expanding missing components.
  for(const i of r.ingredients){
   const amount=i.quantity*count;if(!Number.isFinite(amount)||amount<=0)throw Error('Invalid ingredient amount.');
   const used=Math.min(stock[i.type]||0,amount);stock[i.type]=(stock[i.type]||0)-used;
   if(i.unit==='item'){if(used)add(plan.used,i.type,used);if(amount-used>1e-9)unfilled.push({...i,quantity:amount-used})}
   else {add(plan.raw,i.type,amount);if(amount-used>1e-9)add(plan.missing,i.type,amount-used)}
  }
  for(const i of unfilled){const child=recipes.find(c=>c.output?.type===i.type);if(!child){add(plan.missing,i.type,i.quantity);continue}add(plan.prepare,i.type,i.quantity);build(child,i.quantity,next)}
 };
 build(recipe,1,new Set());return plan;
}
export function assertCraftPlan(plan:CraftPlan,probe:any){
 if(Object.keys(plan.missing).length)throw Error('Missing materials: '+Object.entries(plan.missing).map(([k,v])=>`${k.replaceAll('_',' ')} (${Number(v.toFixed(6))})`).join(', ')+'.');
 if(plan.needsPrinter&&!probe.inventory.items?.some((i:any)=>i.type==='atomic_3d_printer'))throw Error('Preparing these components requires an atomic printer aboard.');
}
