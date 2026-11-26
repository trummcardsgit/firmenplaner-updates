# FirmenPlaner – Aufgabenverwaltung mit automatischen Updates

Windows-App und Smartphone-PWA: Firmen, Notizen, Aufgaben, Fälligkeitstermine und Push-Erinnerungen.

## Verbindung mit dem Update-System

Unter **Einstellungen → Software-Updates** auf **Nach Updates suchen** klicken. Neue Versionen lassen sich im Programm installieren; der Update-Manager sichert Programmdateien und `data/firmenplaner.json` vor der Installation. Unter Windows immer über `start-windows.bat` starten.

Die Updatequelle ist standardmäßig fest auf `trummcardsgit/firmenplaner-updates` eingestellt und kann nicht im Browser geändert werden. Betreiber eigener Builds können vor dem Start die Prozess-Umgebungsvariable `FIRMENPLANER_UPDATE_REPO` auf ein anderes öffentliches GitHub-Repository im Format `benutzer/repository` setzen. Damit bleibt die Auswahl der vertrauenswürdigen Herausgeber außerhalb der Browser-Sitzung.

Nach der Veröffentlichung von v1.1.1 kann die bestehende Version 1.1.0 dieses Update installieren. Zunächst das vorhandene Datenverzeichnis sichern.

## Neue Version veröffentlichen (ohne manuelle ZIP-Datei)

1. Bei Bedarf Programmdateien im GitHub-Repository bearbeiten.
2. GitHub → **Actions** → **FirmenPlaner Update veroeffentlichen** → **Run workflow**. Beim ersten Start `1.1.1` eintragen.
3. Als `version` eine höhere Versionsnummer eintragen (beispielsweise `1.1.2`).
4. Der Workflow aktualisiert die Versionsangaben, führt Tests aus und erstellt ein GitHub Release mit `firmenplaner-update.zip` und `update.json`.
5. Beim nächsten Start prüft der FirmenPlaner automatisch auf Updates, sofern diese Einstellung aktiviert ist.

Alternativ kann ein git-Tag `vX.Y.Z` nach entsprechendem Anheben der Paketversion gepusht werden.

## Datenschutz und Sicherheit

**Niemals den Ordner `data/`, Passwörter oder echte Firmendaten nach GitHub hochladen!** `.gitignore` schließt `data/`, `dist/`, `node_modules/` und `.env` aus. Der Browser-Zugang zum FirmenPlaner bleibt lokal. Die Update-Dateien sind öffentlich. Es werden keine echten Firmendaten in Github Releases übertragen. Öffentlicher Zugriff auf die PWA benötigt einen eigenen HTTPS-Server; GitHub-Releases hosten nicht die Anwendung oder den Push-Server.

### Sichere Ersteinrichtung und Reverse-Proxy

Richte ein neues System zuerst über `http://localhost:4173` ein, bevor du den Reverse-Proxy oder eine Firewall-Freigabe aktivierst. Beim ersten Start erzeugt der Server `data/firmenplaner-setup-token.txt` mit lokalen Leserechten. Gib dieses Token zusammen mit dem neuen Passwort ein; nach erfolgreicher Einrichtung wird die Datei gelöscht.

Für den späteren HTTPS-Betrieb muss `APP_ORIGIN` exakt auf die öffentliche Origin gesetzt werden. Vertraue Proxy-Header nur dann mit `TRUST_PROXY=loopback`, wenn der Proxy wie im Beispiel ausschließlich über die Loopback-Schnittstelle zugreift:

```sh
APP_ORIGIN=https://aufgaben.beispiel.at TRUST_PROXY=loopback ./start-linux.sh
```

Unter Windows können dieselben Variablen vor `node manager.js` mit `set APP_ORIGIN=https://aufgaben.beispiel.at` und `set TRUST_PROXY=loopback` gesetzt werden. Ohne `APP_ORIGIN` akzeptiert der Server Browser-Schreibzugriffe nur von den lokalen Loopback-Adressen auf seinem tatsächlichen Port. `TRUST_PROXY` bleibt standardmäßig `none`.

Die Update-Prüfsumme SHA-256 schützt vor fehlerhaften Downloads, ist aber kein unabhängiger kryptographischer Herkunftsnachweis. Repository-Zugriff entsprechend absichern.

## Entwicklung

Node.js 20+; keine Fremdpakete nötig.

```sh
npm test
npm run release:pack
```

Der Release-Prozess nutzt `.github/workflows/release.yml` und `scripts/create-release.js`.
