import seed from "./seed.json"; import type { MockupAction, MockupState } from "./types";
export const STORAGE_KEY="specialty-management-mockup:v1";
export const freshSeed=()=>structuredClone(seed) as MockupState;
export const isMockupState=(value:unknown):value is MockupState=>!!value&&typeof value==="object"&&(value as MockupState).formatVersion===1&&Array.isArray((value as MockupState).specialties)&&Array.isArray((value as MockupState).agents);
export function loadState(storage:Pick<Storage,"getItem">){try{const raw=storage.getItem(STORAGE_KEY);if(raw===null)return{state:freshSeed(),error:null};const value:unknown=JSON.parse(raw);return isMockupState(value)?{state:value,error:null}:{state:null,error:"Saved demo data uses an unsupported format."};}catch{return{state:null,error:"Saved demo data could not be read."};}}
export function saveState(storage:Pick<Storage,"setItem">,state:MockupState){try{storage.setItem(STORAGE_KEY,JSON.stringify(state));return null;}catch{return"Changes cannot be retained after refresh.";}}
export function reducer(state:MockupState,action:MockupAction){return action.type==="replace"?action.state:action.mutate(state);}
