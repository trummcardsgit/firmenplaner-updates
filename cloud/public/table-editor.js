// Grid operations for the TrummPlaner Word-style editor.
// Only modifies the currently selected table cell, never other document sections.
export const TABLE_MAX_ROWS=200;
export const TABLE_MAX_COLS=20;

function cellsOf(row){return [...row.cells];}
function createCell(row,isHeader){
 const cell=row.ownerDocument.createElement(isHeader?"th":"td");
 cell.appendChild(row.ownerDocument.createElement("br"));
 return cell;
}
function numberOfColumns(table){
 return Math.max(0,...[...table.rows].map(r=>r.cells.length));
}
function headerRow(row){return [...row.cells].some(c=>c.tagName==="TH");}

/**
 * @param {HTMLTableCellElement} selectedCell existing TH/TD
 * @param {string} command
 * @returns {{changed:boolean,selection:HTMLElement|null,tableRemoved:boolean}}
 */
export function runTableCommand(selectedCell,command){
 if(!selectedCell||!["TH","TD"].includes(selectedCell.tagName))
  throw new Error("Bitte zuerst eine Tabellenzelle auswählen.");
 const table=selectedCell.closest("table");
 const row=selectedCell.closest("tr");
 if(!table||!row||!table.contains(selectedCell))
  throw new Error("Die ausgewählte Zelle gehört zu keiner Tabelle.");
 const rowIndex=[...table.rows].indexOf(row);
 const colIndex=cellsOf(row).indexOf(selectedCell);
 const count=numberOfColumns(table);
 const allRows=[...table.rows];
 if(rowIndex<0||colIndex<0)throw new Error("Tabellenzelle nicht mehr verfügbar.");
 let selection=selectedCell;
 let removed=false;
 const result=()=>({changed:true,selection:removed?null:selection,tableRemoved:removed});
 const removeTable=()=>{table.remove();removed=true;selection=null;};

 switch(command){
  case "row-above":
  case "row-below":{
   if(allRows.length>=TABLE_MAX_ROWS)throw new Error("Maximal "+TABLE_MAX_ROWS+" Zeilen möglich.");
   const next=row.ownerDocument.createElement("tr");
   const makeHead=command==="row-above"&&headerRow(row);
   for(let i=0;i<count;i++)next.appendChild(createCell(row,makeHead));
   row.parentNode.insertBefore(next,command==="row-above"?row:row.nextSibling);
   selection=next.cells[Math.min(colIndex,next.cells.length-1)]||null;
   return result();
  }
  case "row-delete":{
   if(allRows.length===1){removeTable();return result();}
   const next=row.nextElementSibling?.tagName==="TR"?row.nextElementSibling:
    row.previousElementSibling?.tagName==="TR"?row.previousElementSibling:null;
   row.remove();
   selection=next?.cells[Math.min(colIndex,Math.max(0,next.cells.length-1))]||null;
   return result();
  }
  case "col-left":
  case "col-right":{
   if(count>=TABLE_MAX_COLS)throw new Error("Maximal "+TABLE_MAX_COLS+" Spalten möglich.");
   const target=colIndex+(command==="col-right"?1:0);
   for(const item of allRows){
    const newCell=createCell(item,headerRow(item));
    item.insertBefore(newCell,item.cells[target]||null);
    if(item===row)selection=newCell;
   }
   return result();
  }
  case "col-delete":{
   if(count<=1){removeTable();return result();}
   for(const item of allRows){
    const victim=item.cells[colIndex];
    if(victim)victim.remove();
   }
   selection=row.cells[Math.min(colIndex,row.cells.length-1)]||null;
   return result();
  }
  case "cell-left":
  case "cell-right":{
   if(row.cells.length>=TABLE_MAX_COLS)throw new Error("Maximal "+TABLE_MAX_COLS+" Zellen pro Zeile möglich.");
   const newCell=createCell(row,selectedCell.tagName==="TH");
   row.insertBefore(newCell,row.cells[colIndex+(command==="cell-right"?1:0)]||null);
   selection=newCell;
   return result();
  }
  case "cell-delete":{
   if(row.cells.length<=1){
    if(allRows.length===1){removeTable();return result();}
    const next=allRows[rowIndex+1]||allRows[rowIndex-1];
    row.remove();
    selection=next?.cells[Math.min(colIndex,next.cells.length-1)]||null;
    return result();
   }
   selectedCell.remove();
   selection=row.cells[Math.min(colIndex,row.cells.length-1)]||null;
   return result();
  }
  case "cell-clear":{
   selectedCell.replaceChildren(selectedCell.ownerDocument.createElement("br"));
   return result();
  }
  case "table-delete":{
   removeTable();return result();
  }
  default:throw new Error("Unbekannte Tabellenaktion.");
 }
}
