# TrummPlaner Cloud PWA (1.3)

Live: https://trummcardsgit.github.io/firmenplaner-updates/

Das GitHub-Pages-Deployment laeuft automatisch aus `.github/workflows/deploy-cloud.yml` und stellt `cloud/public` bereit. Benutzerkonten und Daten liegen ausschliesslich in Supabase `ilmwoapvcluoravpsrjv`. Die alte lokale FirmenPlaner-Version bleibt unabhaengig bestehen.

## Aktuelle Funktionen

- Einladungspflicht mit Administratorfunktion; keine oeffentliche Registrierung.
- Firmen, Aufgaben, Notizen, Problemloesungen und erweiterte Suche.
- Aufgabenliste mit **Firmen-Dropdown**, standardmaessig Filter **Offen**; Statusfilter ist umschaltbar.
- **Projekte**: je Firma Projekte mit Namen, Kurzbeschreibung, Status, formatierten Projektnotizen und Dateianhaengen.
- **Word-Dokumente**: Dokument in der PWA erstellen, bearbeiten und als echte DOCX-Datei speichern/exportieren. Import vorhandener DOCX und Verknuepfung mit Aufgaben/Notizen/Projekten. Der Import und Export unterstuetzt grundlegende Textformatierung, Ueberschriften und Listen; komplexe Word-Layouts, Tabellen, Bilder, Seitenlayouts, Kommentare, Makros und Aenderungsverfolgung bleiben nicht vollstaendig erhalten.
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
