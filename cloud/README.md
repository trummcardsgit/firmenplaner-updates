# TrummPlaner Cloud

## Web-App / Smartphone

Eine erste Online-Version wird über eine öffentliche Supabase Edge Function ausgeliefert:

https://ilmwoapvcluoravpsrjv.supabase.co/functions/v1/trummplaner-site/

Der Endpunkt liefert ausschließlich die statischen Dateien aus `cloud/public` (GitHub) und keine Benutzerdaten. Die App nutzt Supabase Auth und zwei per Row-Level Security geschützte Tabellen: `tp_companies` und `tp_entries`. Die Anwendung benötigt kein lokales Command-Fenster.

## Login konfigurieren (einmalig)

Im Supabase-Dashboard des Projekts `ilmwoapvcluoravpsrjv` unter Authentication > URL Configuration:

- **Site URL:** `https://ilmwoapvcluoravpsrjv.supabase.co/functions/v1/trummplaner-site/`
- **Redirect URLs:** `https://ilmwoapvcluoravpsrjv.supabase.co/functions/v1/trummplaner-site/**`

Dann ein neues E-Mail-Konto anlegen und den Bestätigungslink öffnen. Bei einem Wechsel zu GitHub Pages beide URLs ergänzen.

## GitHub Pages (bevorzugtes, späteres statisches Hosting)

Die GitHub-Pages-Workflowdatei ist unter `.github/workflows/deploy-cloud.yml` eingerichtet. Die Bereitstellung schlägt derzeit fehl, weil GitHub Pages unter Settings > Pages > Build and deployment > Source noch nicht auf `GitHub Actions` gestellt wurde. Das kann nur jemand mit Repository-Administrationsrechten im GitHub-Webinterface einschalten.

Nach Aktivierung sollte die Website unter https://trummcardsgit.github.io/firmenplaner-updates/ erreichbar sein. Die Cloud-Dateien liegen im eigenen Verzeichnis und berühren die bisherige lokale App nicht.

## Noch nicht fertig

- Hintergrund-Push bei geschlossener App (separater Push-Sender mit VAPID und Terminplanung nötig).
- Import der alten lokalen Aufgaben in Supabase.
- Umfassender Browser-/Gerätetest und Offline-Schreibsynchronisierung.

**Sicherheit:** Niemals Service-Role-Keys, Passwörter, lokale `data/`-Dateien oder echte Firmendaten ins GitHub-Repository laden. `config.js` enthält ausschließlich einen öffentlichen Supabase-Publishable-Key.
