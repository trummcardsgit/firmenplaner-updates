# TrummPlaner Cloud PWA (1.6.1)

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

## 1.5.3: Projekt-Löschdialog zuverlässiger

- Ein eigenes Bestätigungsfenster statt `window.confirm` (Browser/PWA können native Dialoge blockieren).
- Das Fenster zeigt die aktuell aus Supabase ermittelten Zahlen der verknüpften Aufgaben, Word-Dokumente und Dateianhänge sowie Fehlermeldungen direkt im Fenster an.
- Löschen muss explizit im neuen Fenster bestätigt werden; vor der endgültigen Löschung wird nochmals auf vorhandene Dateianhänge geprüft.
- Bereits verknüpfte Aufgaben und Word-Dokumente bleiben erhalten, der Bezug zum Projekt wird durch die bestehenden FK-Regeln entfernt.
- Test umfasst Klick auf „Projekt löschen“ in der Übersicht und im Projektfenster, Abbruch, Fehlermeldung und erfolgreichen Datenbank-Aufruf.

## 1.5.4: Schnellauswahl der Fälligkeit

Im Formular für neue und bestehende Aufgaben gibt es direkt unter dem genauen Fälligkeitsdatum die Schnellbuttons **Heute**, **Morgen**, **3 Tage**, **1 Woche**, **2 Wochen**, **1 Monat** und **Ohne Datum**. Bei einer Schnellwahl wird das jeweilige lokale Kalenderdatum auf **17:00 Uhr** gesetzt. Der Monatsbutton berücksichtigt unterschiedliche Monatslängen (31. Januar → 28./29. Februar). Individuelle Datums- und Zeitangaben sind unverändert möglich und überschreiben die Schnellwahl. Bestehende Aufgaben übernehmen weiterhin ihren gespeicherten Termin; Erinnerungen werden nicht automatisch geändert. Notizen zeigen keine Aufgaben-Fälligkeit an.


## 1.5.5: Erinnerungsdatum per Schnellwahl

Unter **Erinnern am** stehen die gleichen Schnellbuttons wie bei der Fälligkeit: Heute, Morgen, 3 Tage, 1 Woche, 2 Wochen, 1 Monat und Ohne Erinnerung. Die Schnellwahl setzt das lokale Datum jeweils auf 17:00 Uhr; genaue Datums- und Zeiteingaben bleiben möglich. Fälligkeit und Erinnerung werden unabhängig voneinander verändert. Aufgrund der vorhandenen Speichervalidierung benötigt eine gesetzte Erinnerung auch einen Fälligkeitstermin; das wird direkt als Hinweis angezeigt. Notizen blenden die Terminfelder aus. Die bestehenden Daten bleiben unverändert.

## 1.6.0: Vice City Sunset Design

- Neue originale **GTA-VI-inspirierte Miami-Sonnenuntergangspalette**: Pink (#FF6BB6), Lavendel (#B38CF4), Koralle (#FF927C), Abendgold (#FFD08F) und Türkis (#73E3DC) auf dunkelviolettem Hintergrund.
- Farbverläufe und subtile Leuchteffekte für Desktop-Sidebar, Dashboard-Header, Kennzahlen-Karten, Buttons, Aufgaben, Projekte, Listen, Formulare, Anmeldeseite und mobile Navigation.
- Alle bisherigen App-Funktionen und Daten bleiben unverändert; es werden keinerlei GTA-Logos, Bilder oder sonstige fremde Medien eingebettet. Das Wort-Dokument selbst bleibt weiß und gut bearbeitbar, nur die App-Leisten und die Vorschau erhalten das neue Farbschema.
- Eigenständiges Stylesheet `cloud/public/vice-city-theme.css` nach `styles.css` geladen; so können Stile bei Bedarf später ohne Eingriff in die Anwendungslogik angepasst oder rückgängig gemacht werden.
- PWA-Hintergrund- und Browser-Farben auf das neue Design abgestimmt; zusätzliche Datei wird offline im Service Worker zwischengespeichert.
- CI-Smoketest kontrolliert Stilregeln, Navigation, Login, PWA-Metadaten, bestehenden Eingabefelder und den unberührten Word-Arbeitsbereich.

## 1.6.1: Eigene Neon-Menüicons

Die Navigation verwendet jetzt die acht eigens für TrummPlaner gestalteten Vice-City-Sunset-Icons. Jeder Menüpunkt besitzt sein passendes Motiv: Skyline (Übersicht), Checkliste (Aufgaben), Notizblatt (Notizen), Lösungsbuch (Lösungen), Projektmappe (Projekte), Stift und Dokument (Word-Dokumente), Bürogebäude (Firmen), Zahnrad (Einstellungen). Sie erscheinen sowohl in der Desktop-Seitenleiste als auch in der Smartphone-Navigation. Die Originalbilder wurden mit transparentem Hintergrund zu einem kleinen WebP-Sprite mit acht Kacheln à 48 × 48 Pixel verkleinert (ca. 10 KB) und unter `icons/nav-vicecity.webp` abgelegt. Tastaturbedienung, Navigation und Beschriftungen bleiben unverändert; Icons sind dekorativ mit `aria-hidden`. Service Worker v1.6.1 speichert die Grafik für den Offlinebetrieb. Neuer CI-Test `neon-menu-icons-smoke.mjs` prüft alle acht Desktop- und Mobil-Zuordnungen.
