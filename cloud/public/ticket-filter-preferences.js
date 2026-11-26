export const defaultTicketFilters=()=>({company_filter:"",status_filter:"open",search_filter:""});
export function normalizeTicketFilters(value,companies){
 const p=value||defaultTicketFilters(),company=typeof p.company_filter==="string"?p.company_filter:"";
 return {company_filter:company&&companies.some(c=>String(c.id)===company)?company:"",
 status_filter:["","open","accepted","rejected","closed"].includes(p.status_filter)?p.status_filter:"open",
 search_filter:typeof p.search_filter==="string"?p.search_filter.slice(0,200):""};
}
export function readTicketFilters(rows,companies){
 const map=new Map();
 for(const r of rows||[])if(["all","open","my"].includes(r.category))map.set(r.category,normalizeTicketFilters(r,companies));
 return map;
}
