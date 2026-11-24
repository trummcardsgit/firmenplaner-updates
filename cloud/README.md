# TrummPlaner Cloud PWA (1.4.0)

Live: https://trummcardsgit.github.io/firmenplaner-updates/

Das GitHub-Pages-Deployment laeuft automatisch aus `.github/workflows/deploy-cloud.yml` und stellt `cloud/public` bereit. Benutzerkonten und Daten liegen ausschliesslich in Supabase `ilmwoapvcluoravpsrjv`. Die alte lokale FirmenPlaner-Version bleibt unabhaengig bestehen.

## Aktuelle Funktionen

- Einladungspflicht mit Administratorfunktion; keine oeffentliche Registrierung.
- Firmen, Aufgaben, Notizen, Problemloesungen und erweiterte Suche.
- Aufgabenliste mit **Firmen-Dropdown**, standardmaessig Filter **Offen**; Statusfilter ist umschaltbar.
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

## Outlook-Unterordner-Import (1.4.0)

- In **Einstellungen → Outlook-Unterordner** als Administrator Microsoft 365 / Exchange Online einrichten.
- **Microsoft Entra**: App registrieren, Single Tenant, Plattform `Web`, Redirect `https://trummcardsgit.github.io/firmenplaner-updates/`.
- Delegated Microsoft Graph permissions `Mail.Read`, `User.Read` und `offline_access` (optional Admin-Consent).
- Ein Client Secret als **Wert** in der Admin-PWA einmalig eingeben; Client-Secret und Microsoft Refresh-Token liegen ausschliesslich in serverseitigen, fuer Nutzer nicht lesbaren Supabase-Tabellen. **Niemals Zugangsdaten im GitHub-Code speichern.**
- Auf **Mit Microsoft anmelden** klicken und die Zustimmung erteilen; dann Unterordner und Zielfirma waehlen.
- Der automatische Cronjob `trummplaner-outlook-every-5-minutes` laeuft auch bei geschlossener PWA. Der erste Delta-Lauf erstellt einen Ausgangsstand und ueberspringt vorhandene E-Mails (neue Nachrichten waehrend dieses Laufs werden nach Aenderungsdatum beruecksichtigt). Danach werden neue E-Mails des Ordners als offene Aufgaben importiert.
- Aufgaben enthalten Betreff, Absender, Eingangsdatum, Nachrichtentext und Outlook-Link. Anhaenge werden **nicht** automatisch heruntergeladen; sie bleiben in Outlook abrufbar. Keine Nachrichten werden geloescht oder verschoben.
- Doppelte Aufgaben werden mit einem eindeutigen Microsoft-Message-ID-Schluessel in `tp_outlook_imports` verhindert. Der E-Mail-Zugriff erfolgt als angemeldeter Nutzer mit `Mail.Read` (die Microsoft-Berechtigung selbst kann das ganze eigene Postfach umfassen, TrummPlaner fragt nur den ausgewählten Ordner ab).
- Funktionen: Ordner laden, Zielfirma auswaehlen, Sofortabgleich, Pausieren/Fortsetzen, Postfach trennen, Statusanzeige.
- **Nicht unterstuetzt:** lokaler Exchange-Server ohne Graph, Shared-Mailbox-Sonderberechtigungen, vollstaendige Mails mit Anhängen, Mehrfach-Mailboxen. Ein reales Outlook-Konto konnte noch nicht verbunden oder end-to-end getestet werden; dazu fehlen Microsoft-Anwendungs-ID, Mandanten-ID, Client Secret und Nutzerfreigabe.
