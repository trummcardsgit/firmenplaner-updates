# TrummPlaner Cloud PWA (1.5.2)

Live: https://trummcardsgit.github.io/firmenplaner-updates/

Das GitHub-Pages-Deployment laeuft automatisch aus `.github/workflows/deploy-cloud.yml` und stellt `cloud/public` bereit. Benutzerkonten und Daten liegen ausschliesslich in Supabase `ilmwoapvcluoravpsrjv`. Die alte lokale FirmenPlaner-Version bleibt unabhaengig bestehen.

## Aktuelle Funktionen

- Einladungspflicht mit Administratorfunktion; keine oeffentliche Registrierung.
- Firmen, Aufgaben, Notizen, Problemloesungen und erweiterte Suche.
- Aufgabenliste mit **Firmen-Dropdown**, standardmaessig Filter **Offen**; Statusfilter ist umschaltbar.
- **Projektverknuepfung fuer Aufgaben** (1.5.0): Bei Aufgaben kann optional ein Projekt der ausgewaehlten Firma zugeordnet werden. Notizen bleiben projektunabhaengig. Die Aufgabenliste kann gleichzeitig nach Firma, Projekt (einschliesslich Ohne Projekt), Status und Suchbegriff filtern. Im Projekt sind alle zugehoerigen offenen und erledigten Aufgaben mit Schnellaktionen zum Anlegen, Bearbeiten und Anzeigen sichtbar.
- Datenbankschutz: `tp_entries.project_id` ist optional und referenziert per zusammengesetztem Fremdschluessel ein Projekt desselben Benutzers und derselben Firma. Beim Loeschen eines Projekts bleiben Aufgaben bestehen und ihre Projektzuordnung wird entfernt.

- **Spracheingabe/Diktieren** in Aufgaben- und Notizbeschreibungen sowie optionalen Problemloesungen: Browser-Web-Speech-API mit `de-AT` oder `de-DE`, vorlaeufiger Erkennung, finaler Textergaenzung, Sprechpausen-Fortsetzung, Mikrofonfehlern und Schutz vor Absenden waehrend einer Aufnahme. Keine Audio-Dateien in Supabase. Die Audio-Verarbeitung kann je nach Browser durch einen externen Spracherkennungsdienst erfolgen; die Genauigkeit insbesondere bei Dialekt ist nicht garantiert. Fallback ist die eingebaute Diktierfunktion der Smartphone-Tastatur.

- **Projekte**: je Firma Projekte mit Namen, Kurzbeschreibung, Status, formatierten Projektnotizen und Dateianhaengen.
  Im Projekt lassen sich eigene Word-Dokumente und hochgeladene `.docx`-Anhaenge mit **Vorschau** als schreibgeschuetzte Blattansicht oeffnen. Der Vorschau-Dialog ermoeglicht Lesen, Scrollen, Download und Schliessen ohne Bearbeitung. Hochgeladene DOCX-Dateien werden clientseitig mit Mammoth in sichere HTML-Ansicht konvertiert; Bilder, komplexe Layouts und spezielle Word-Elemente koennen dabei abweichen.
- **Word-Dokumente**: Dokument in der PWA erstellen, bearbeiten und als echte DOCX-Datei speichern/exportieren.
  Tabellen lassen sich im Vollbildeditor per **Rechtsklick auf eine Zelle** bearbeiten; auf Touch-Geraeten oeffnet laengeres Druecken das Kontextmenue. Verfuegbar: Zeilen oberhalb/unterhalb einfuegen oder loeschen, Spalten links/rechts einfuegen oder loeschen, einzelne Zellen einfuegen/leeren/loeschen und ganze Tabellen entfernen. Bis 20 Spalten und 200 Zeilen je Tabelle werden auch nach DOCX exportiert. Einzelzellenaktionen koennen unterschiedlich lange Zeilen erzeugen; der Export fuellt fehlende Zellen auf.

  Der Editor oeffnet eine **vollstaendige Vollbild-Arbeitsflaeche** mit blauem Dokumentkopf, Registerkarten Datei/Start/Einfuegen/Layout/Ansicht, formatierbarer A4-Blattansicht, Wortzaehlung, Zoom, Cloudspeicherung und DOCX-Export. Strg+S speichert; Zurueck/ESC fragt bei ungespeicherten Aenderungen nach. Import vorhandener DOCX und Verknuepfung mit Aufgaben/Notizen/Projekten. Der Import und Export unterstuetzt grundlegende Textformatierung, Ueberschriften und Listen; komplexe Word-Layouts, Tabellen, Bilder, Seitenlayouts, Kommentare, Makros und Aenderungsverfolgung bleiben nicht vollstaendig erhalten.
- Dateien lassen sich als geschuetzte Anhaenge zu bestehenden Aufgaben/Notizen oder Projekten hochladen (15 MB je Datei).
- Web-Push mit im Hintergrund laufendem Supabase-Cron; pro Geraet einmalige Anmeldung und Rechtefreigabe notwendig. iPhone-Push benoetigt eine zum Home-Bildschirm hinzugefuegte PWA.

## Datenbanken und Speicher

- `tp_projects`, `tp_documents`, `tp_attachments` mit nutzerbezogenem RLS.
- Supabase Storage Bucket `tp-private-files`, **nicht oeffentlich**, private user-ID-Unterverzeichnisse mit SELECT/INSERT/UPDATE/DELETE-Policies. Keine Download-Links ohne Authentifizierung.
- Speicherschutz je Benutzer. Die Daten sind **nicht** automatisch mit anderen eingeladenen Personen geteilt; ein gemeinsames Team-Modell waere ein eigenes spaeteres Update.
- Beim neuen Aufgabeneintrag muessen Aufgaben/Notizen zuerst gespeichert werden. Danach im Dialog **Bearbeiten / Dateien** oeffnen und Word-Dokumente oder Anhaenge anlegen.
- DOCX-Bearbeitung nutzt lazy-loaded, fest versionierte Bibliotheken `docx@9.15.3` und `mammoth@1.13.0`. Importiertes HTML wird vor Darstellung und Speicherung auf eine sichere Teilmenge begrenzt.
- Dateioperationen nutzen nur den Supabase Publishable Key und den Benutzer-JWT; niemals Service-Role-Key im Browser.

## Einmaliger Browser-Test nach dem Release

1. Als bestehender Benutzer anmelden. Eine Firma oeffnen.
2. In **Aufgaben** die Firma im Dropdown waehlen: nur offene Aufgaben der Firma anzeigen. Statusfilter pruefen.
3. In **Projekte** ein Projekt `Umstellung` einer Firma zuordnen, Text und Status speichern.
4. Projekt erneut oeffnen, Datei anhaengen und auf **Herunterladen** pruefen.
5. Im Projekt neues Word-Dokument erzeugen, formatieren und speichern. Unter **Word-Dokumente** wieder oeffnen und die DOCX-Datei herunterladen.
6. Aus einer vorhandenen DOCX-Datei ein neues Dokument importieren, pruefen, speichern und exportieren.
7. Eine Aufgabe/Notiz bearbeiten und ein Word-Dokument bzw. eine Datei anhaengen.

Die Datenbank- und Server-Sicherheitspruefungen sowie GitHub-Actions-Syntaxchecks sind gelaufen. Eine vollstaendige interaktive Browser-DOCX-Roundtrip-Pruefung steht noch aus und muss am Endgeraet erfolgen.

## Offene Themen

- Import der bisherigen lokalen Aufgaben.
- Gemeinsame Projekte und Dokumente fuer mehrere eingeladene Mitarbeiter (bisher Benutzerisolation).
- Offline-Bearbeitung mit synchronisierten Konflikten.
- Umfassender Test des Dokumenteditors auf unterschiedlichen Mobilbrowsern.

**Sicherheit**: Keine lokalen Datenbankdateien, Passwoerter, Firmendaten oder Supabase-Service-Role-Schluessel in GitHub laden.

## Fix 1.5.1: Projektauswahl im Aufgabenformular

Das Dropdown `Projekt (optional)` laedt die aktuellen Projekte bei jedem Oeffnen einer Aufgabe und jedem Firmenwechsel direkt und nutzerbezogen aus Supabase. Es zeigt den Ladezustand, einen klaren Hinweis bei fehlenden Projekten und ignoriert veraltete Antworten nach schnellem Firmenwechsel. Die vorhandenen Projekte und Aufgaben werden nicht veraendert.

## 1.5.2: Projekte sicher löschen

- Projekte lassen sich in der Projektübersicht oder im Projektfenster über **Projekt löschen** entfernen; eine Sicherheitsabfrage nennt Firma und Zahl der Aufgaben und Word-Dokumente.
- Vor dem Entfernen werden die aktuell gespeicherten Projektanhänge direkt in Supabase geprüft. Sind Dateianhänge vorhanden, wird die Löschung verweigert, bis die Dateien einzeln heruntergeladen oder entfernt wurden. So gehen die hochgeladenen Dateien nicht durch das CASCADE-Löschen der Datenbankeinträge unbemerkt verloren.
- Verknüpfte Aufgaben bleiben erhalten und werden **Ohne Projekt**. Word-Dokumente bleiben im Reiter **Word-Dokumente** und verlieren nur die Projektzuordnung. Die Projektnotizen selbst werden gelöscht.
- Es werden nur selbst angelegte Projekte gelöscht (`owner_id` und bestehende RLS-DELETE-Policy). Die Bedienung ist sowohl am Desktop als auch mobil möglich.
