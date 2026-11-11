# TrummPlaner Cloud

Die PWA liegt in `cloud/public`. Das Hosting erfolgt mit GitHub Pages; die Anmeldung und Daten liegen im separaten Supabase-Projekt `ilmwoapvcluoravpsrjv`.

Website nach Bereitstellung: https://trummcardsgit.github.io/firmenplaner-updates/

In Supabase unter Authentication > URL Configuration die Site URL auf diese Adresse setzen und unter Redirect URLs `https://trummcardsgit.github.io/firmenplaner-updates/**` ergänzen. Der veröffentlichte Key in config.js ist ein Publishable Key; keine Service-Role-Secrets veröffentlichen.

Die bestehende lokale App bleibt im Root-Verzeichnis des Repositorys unberührt. Push-Nachrichten bei geschlossener App und eine Migration lokaler Aufgaben sind noch nicht implementiert.
