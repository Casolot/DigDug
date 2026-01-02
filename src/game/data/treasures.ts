import type { TargetId } from "./targets";
export type Treasure = { id:string; name:string; base:number };
export const treasures: Record<TargetId, Treasure[]> = {
  rock:[
    { id:"andesite", name:"安山岩", base:1 },
    { id:"basalt", name:"玄武岩", base:2 },
    { id:"granite", name:"花崗岩", base:3 },
    { id:"fossil_common", name:"どこにでもある化石", base:5 },
  ],
  house:[
    { id:"book", name:"アッチな本", base:30 },
    { id:"dishes", name:"食器類", base:50 },
    { id:"materials", name:"建材", base:80 },
    { id:"cash", name:"へそくり", base:130 },
  ],
  mine:[
    { id:"coal", name:"石炭", base:800 },
    { id:"iron", name:"鉄鉱石", base:1300 },
    { id:"fossil_weird", name:"変な化石", base:2100 },
    { id:"gem", name:"宝石", base:3400 },
  ],
};
export const treasureIndex: Record<string, Treasure & { target: TargetId }> = (() => {
  const out: Record<string, Treasure & { target: TargetId }> = {};
  (Object.keys(treasures) as TargetId[]).forEach((target) => {
    treasures[target].forEach((tr) => {
      out[tr.id] = { ...tr, target };
    });
  });
  return out;
})();
