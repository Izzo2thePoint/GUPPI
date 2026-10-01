import {api,aboardReady,ingredientStock} from './workshop';
export const upgradeProbe='POST /api/probe/{probeId}/mannies/{mannyId}/improve-probe';
export const blueprintList='GET /api/probe/{probeId}/probe-improvements-available';
export function upgradeCommand(mannyId:string,improvement:string){if(!mannyId||!improvement)throw Error('Choose a blueprint and an upgrade Manny.');return api(upgradeProbe,{improvement},{mannyId});}
export function upgradeProblem(blueprint:any,probe:any,crew:any[],worker:string){
 if(!probe?.inventory)throw Error('Full probe inventory is required.');
 if(!['idle','orbiting'].includes(probe.status))throw Error('Wait until the probe is stationary.');
 if(!blueprint||blueprint.available!==true)throw Error('This blueprint is not unlocked.');
 if(blueprint.installableOnProbe!==true)throw Error('This blueprint is not installed on probes.');
 if(blueprint.done!==false)throw Error('Already installed, or installation status is unavailable.');
 if(!crew.some(m=>String(m.id)===worker&&aboardReady(m)))throw Error('Choose an idle Manny aboard the probe.');
 if(!Array.isArray(blueprint.ingredients))throw Error('Blueprint costs are unavailable.');
 for(const ingredient of blueprint.ingredients){const stock=ingredientStock(probe.inventory,ingredient);if(!Number.isFinite(ingredient.quantity)||ingredient.quantity<0||stock===null)throw Error('Cannot verify blueprint ingredients.');if(stock+1e-9<ingredient.quantity)throw Error('Not enough '+String(ingredient.type).replaceAll('_',' ')+'.');}
}
