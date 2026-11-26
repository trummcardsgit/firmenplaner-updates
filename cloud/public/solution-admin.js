export function solutionDeleteButton(solution,isAdmin,escape){
 return isAdmin?'<div class="actions" style="margin-top:12px"><button type="button" class="danger" data-solution-delete="'+escape(solution.id)+'">Lösung löschen</button></div>':"";
}
export async function deleteSolution({db,solution,isAdmin,confirmDelete}){
 if(!isAdmin||!solution?.id)return false;
 if(!confirmDelete('Lösung "'+solution.problem_title+'" endgültig löschen? Die ursprüngliche Aufgabe bzw. das Ticket bleibt erhalten.'))return false;
 const {data,error}=await db.from("tp_solutions").delete().eq("id",solution.id).select("id");
 if(error)throw error;
 if(!data?.some(row=>row.id===solution.id))throw new Error("Lösung konnte nicht gelöscht werden. Bitte Berechtigungen prüfen oder aktualisieren.");
 return true;
}
