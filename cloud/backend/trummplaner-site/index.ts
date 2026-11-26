// Die HTML-Oberflaeche wird statisch auf GitHub Pages gehostet.
// Supabase Edge Functions wandeln text/html bei GET in text/plain um.
import {target,legacyDestination} from "./redirect-target.mjs";
Deno.serve(async (request) => {
  const destination = legacyDestination(request.url);
  try {
    const available = await fetch(target, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(3500),
      headers: { accept: "text/html" }
    });
    const ok = available.ok && (available.headers.get("content-type") || "").includes("text/html");
    await available.body?.cancel();
    if (ok) return Response.redirect(destination, 302);
  } catch { /* GitHub Pages ist noch nicht aktiviert. */ }
  return new Response(
    "TrummPlaner Cloud: GitHub Pages muss einmalig aktiviert werden.\n\n" +
    "Repository firmenplaner-updates -> Settings -> Pages -> " +
    "Build and deployment -> Source -> GitHub Actions.\n\n" +
    "Danach oeffnen: " + target + "\n",
    { status: 503, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } }
  );
});