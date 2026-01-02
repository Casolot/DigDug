export const workerList = ["scavenger","caver","excavator"] as const;
export type WorkerId = typeof workerList[number];
export const workerDef: Record<WorkerId, { name:string; base:number; ms:number; dmg:number }> = {
  scavenger:{ name:"ゴミ漁り", base:10,  ms:5000, dmg:1 },
  caver:{     name:"探窟家",   base:50,  ms:4000, dmg:8 },
  excavator:{ name:"ショベルカー", base:250, ms:8000, dmg:120 },
};
