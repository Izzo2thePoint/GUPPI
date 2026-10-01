export type Briefing={kind:'Bridge tip'|'Universe fact'|'Probe report';text:string;source?:string};
const tip=(text:string):Briefing=>({kind:'Bridge tip',text});
export const sectionBriefings:Record<string,Briefing>={
 overview:tip('A fleet needs perspective. Overview brings your probes together; each probe still has its own coordinate frame.'),
 sensors:tip('Chart carefully, Captain. Select a system on the map, then Plot course to use its coordinates.'),
 mining:tip('Leaving a miner behind? Use Remote mining outposts, deploy its container first, and designate the crew in your route review.'),
 inventory:tip('Space is a resource too. Container rules guide storage; transfers let you choose where existing cargo goes.'),
 crafting:tip('Assign different available Mannys to independent jobs. One pair of hands cannot work on two orders at once.'),
 construction:tip('Building another probe starts with parts and a builder. Review the requirements before committing your crew.'),
 automation:tip('Rehearse before launch. Test routine checks the plan without sending game commands.'),
 logbook:tip('A good logbook outlives a good memory. Save your notes to the game so you can find them again.'),
 mannies:tip('Recall / stop automation interrupts the selected Manny’s automation. Review which jobs will stop before confirming.'),
 repairs:tip('Engineering keeps us exploring. Repair hull integrity here, or inspect available upgrade blueprints.'),
 asteroids:tip('Moving an asteroid is a project: motorize it, refuel it, then review the trajectory.'),
 settings:tip('Make the bridge your own. My nearby controls can quiet the chatter or stop my animations.'),
};
export function actionBriefing(label:string):Briefing|null{
 if(/jettison/i.test(label))return tip('Check the item, amount, and source container in the jettison review. Those are the cargo you are authorizing to discard.');
 if(/recall/i.test(label))return sectionBriefings.mannies;
 if(/plot|launch|departure/i.test(label))return tip('Check the destination and designated outpost crews in the route review. My advice is not a flight clearance.');
 if(/scan/i.test(label))return tip('A saved scan is a memory, not a live sensor reading. Check its freshness before relying on it.');
 if(/outpost/i.test(label))return tip('New remote outpost orders need shared SCUT coverage. GUPPI waits during travel and when contact is lost.');
 if(/scut/i.test(label))return tip('The green map outlines show reported SCUT coverage. Remote operations also need a shared active network.');
 if(/repair|upgrade|blueprint/i.test(label))return sectionBriefings.repairs;
 if(/craft|construction|queue/i.test(label))return sectionBriefings.crafting;
 if(/bookmark|save.*system/i.test(label))return tip('Name a useful system and leave a note. Future you will appreciate knowing why you bookmarked it.');
 if(/message/i.test(label))return tip('Messages are worth reading before you act. The adviser never sends a reply for you.');
 if(/alert/i.test(label))return tip('Read the actual alert for current conditions. My chatter is separate from the game’s warnings.');
 return null;
}
export const facts:Briefing[]=[
 {kind:'Universe fact',text:'Venus takes about 243 Earth days to rotate once, but only 225 to orbit the Sun. Its rotation is longer than its year.',source:'https://science.nasa.gov/venus/venus-facts/'},
 {kind:'Universe fact',text:'At neutron-star density, a sugar-cube volume of matter would have roughly a trillion kilograms of mass. Quite a cargo manifest.',source:'https://science.nasa.gov/universe/stories/quick-reads/neutron-stars-are-weird/'},
 {kind:'Universe fact',text:'Saturn’s average density is lower than water’s. The familiar floating-planet comparison is about density, not a practical bathtub experiment.',source:'https://science.nasa.gov/saturn/facts/'},
 {kind:'Universe fact',text:'Enceladus feeds Saturn’s E ring: icy jets from that small moon supply much of the ring’s material.',source:'https://science.nasa.gov/mission/cassini/science/rings/'},
 {kind:'Universe fact',text:'Titan has methane lakes, while Enceladus hides liquid water beneath its ice. Two moons, very different liquid landscapes.',source:'https://science.nasa.gov/saturn/facts/'},
 {kind:'Bridge tip',text:'The game’s sector grid has twelve neighbors. Valid sector coordinates always have an even X + Y + Z sum.',source:'https://neumann-probe.net/'},
 {kind:'Bridge tip',text:'Your starting 0,0,0 is a local reference point, not the center of the universe. Every probe’s map needs its own frame of reference.',source:'https://neumann-probe.net/'},
 {kind:'Bridge tip',text:'ECE means Earth container equivalents: a unit of volume, not mass. Dense cargo and light cargo can occupy the same space.',source:'https://neumann-probe.net/'},
 tip('A stopped GUPPI routine stops future orders. Work already accepted by the game can continue.'),
 tip('Remote mining plans stay paused after reopening GUPPI. Reconnect and resume the plan when you are ready.'),
];
export function probeBriefing(probe:any,mannies:any[]):Briefing{
 const integrity=probe?.systems?.integrityPercent,free=probe?.inventory?.freeCapacity;
 const details=[Number.isFinite(integrity)?`${integrity}% hull integrity`:null,Number.isFinite(free)?`${Number(free.toFixed(3))} ECE free storage`:null,`${mannies.length} Mannys in the latest roster`].filter(Boolean);
 return {kind:'Probe report',text:`Last reported for ${String(probe?.name||'this probe')}: ${details.join('; ')}. These are the latest loaded readings, not a fresh scan.`};
}
