# Rep²plus 68

Statisches Lern-Dashboard für Strafrecht und Öffentliches Recht. Die Website braucht
keinen Build und lädt `data/lerneinheiten.json` beim Öffnen neu. Aufgaben und
Literatur-Häkchen bleiben im Browser. Änderungen an der Datendatei verändern
die gespeicherten Häkchen nicht.

## Website öffnen und Fortschritt übernehmen

1. Im bisherigen Dashboard **Fortschritt sichern** wählen.
2. Im neuen Dashboard **Fortschritt laden** wählen und die JSON-Sicherung öffnen.
3. Beim Wechsel des Browsers oder Geräts erneut exportieren und importieren.
   Sicherungen enthalten persönliche Daten und gehören nicht ins Repository.

Die bisherigen Aufgaben-, Literatur- und Lerneinheits-IDs wurden übernommen.
Das gilt auch für ihre drei bisherigen Browser-Speicherschlüssel. Bei einem
Wechsel von der lokalen HTML-Datei zu HTTPS erfolgt die Übernahme über den Export,
da jeder Web-Ursprung getrennten Speicher hat.

## Quelldateien

| Pfad | Inhalt |
| --- | --- |
| `index.html`, `css/style.css` | Oberfläche und Gestaltung des bestehenden Dashboards |
| `js/app.js` | Darstellung, Filter und CSV-Export |
| `js/data.js` | Abruf und Prüfung von IDs, Fundstellen und Terminen |
| `js/progress.js` | Lokaler Fortschritt und kompatibler JSON-Import/-Export |
| `data/lerneinheiten.json` | Einzige Datenquelle für Lernwochen, Lerneinheiten, Aufgaben und Literatur |
| `data/lerneinheiten.schema.json` | Erlaubte Felder und Formate für den Datenbestand |

Für eine lokale Vorschau im Repository `python3 -m http.server 8000`
ausführen und [localhost:8000](http://localhost:8000/) öffnen. Das Dashboard lädt
seine Daten über HTTP und benötigt deshalb einen Webserver.

## Daten pflegen

- `weeks[].tasks[]` enthält Termine, Aufgaben und die optionale Zuordnung
  `unitId`. Zukünftige Aufgaben dürfen auf noch unveröffentlichte Einheiten
  verweisen. Sobald die Einheit mit derselben ID ergänzt wird, erscheint ihre
  Leseliste automatisch in der Aufgabenkarte.
- `units[]` enthält eine Einheit pro Teilgebiet und Nummer. Die ID bildet diese
  beiden Werte ab, etwa `Verwaltungsrecht:1` oder `Staatsrecht:1`.
  Der Wert `publishedOn` ist das belegte ILIAS-Datum, bei fehlender Angabe
  `null`. `calendarWeek` ist die ISO-Kalenderwoche laut offiziellem Leitfaden.
- `units[].literature[]` enthält die Typen `Fall der Woche`,
  `Selbststudiumsfall`, `Didaktischer Beitrag` und `Lerngruppenfall`.
  Bewahre die vollständige Fundstelle in `reference`, die in der Quelle
  ausgewiesenen Autoren in `authors`, eine vorhandene Themenbeschreibung in
  `description` und einen eindeutig belegten Werktitel optional in `title`.
  Verwende `scheduledOn` nur bei einem bestätigten Sonntagstermin.
- Behalte bestehende IDs, auch bei einer Berichtigung von Titel oder Fundstelle.
  Neue Literatur-IDs beginnen mit der Einheits-ID, beispielsweise
  `Staatsrecht:1:beitrag-1`. Wähle einen freien, dauerhaft eindeutigen Suffix
  und verwende ihn künftig für dieselbe Position. Bestehende Einträge nie
  umnummerieren oder umwidmen.
- Die Originalübersichten bleiben in ILIAS. Hinterlege in `sourceUrl` einen
  stabilen HTTPS-Permalink zum ILIAS-Ordner oder zur Übersicht. Veröffentliche
  bibliografische Angaben und selbst formulierte Lernziele. PDF-Dateien,
  Falltexte, Lösungen, Sitzungsschlüssel und persönliche Fortschrittsdaten
  gehören nicht in den öffentlichen Quellcode oder in die Git-Historie.

## Ablauf für Agent 68

1. Den aktuellen Stand von `main` holen und eine Arbeitskopie anlegen. Neue
   Einheiten im ILIAS-Kurs anhand Teilgebiet, Nummer, Freischaltung und
   Permalink mit der JSON-Datei abgleichen. Bei fehlender Anmeldung oder
   Übersicht den konkreten Fehler melden.
2. Eine unveränderte Kopie der bisherigen JSON-Datei außerhalb des Repositories
   sichern. Neue Einheiten, Lernziele und Fundstellen ausschließlich in
   `data/lerneinheiten.json` ergänzen. Nachweisbare Berichtigungen unter
   den bisherigen IDs durchführen. Unklare Zuordnungen zur Prüfung melden.
3. Schema, Duplikate und bisherige IDs vor dem Commit prüfen.

   ```sh
   npm ci --ignore-scripts
   npm run validate -- /pfad/zur/bisherigen-lerneinheiten.json
   git diff --check
   git diff -- data/lerneinheiten.json
   ```

4. Ausschließlich den geprüften Daten-Diff committen und im bestehenden
   Repository veröffentlichen. Bei einem parallelen Update die aktuelle
   Fassung einlesen, die eigenen Änderungen erneut abgleichen und validieren.
   Anschließend den erfolgreichen Pages-Deploy und die neuen Einheiten über
   die Website prüfen. Änderungen oder Zugriffshindernisse knapp melden.

## GitHub Pages

Verwende für `constikow22/Lernplan` den Branch `main` mit `/(root)` als
Veröffentlichungsquelle. Die leere Datei `.nojekyll` hält die Seite
statisch. Alle Ressourcenpfade sind relativ und funktionieren deshalb auch
unter dem Pfad `/Lernplan/`. Nach einem Commit kann es bis zum Ende der
Pages-Bereitstellung dauern, bis GitHub den neuen Stand ausliefert. Beim
Seitenaufruf fordert die Anwendung die JSON-Datei ohne Wiederverwendung
des lokalen HTTP-Caches an.

Wenn Lernmaterial vertraulich bleiben muss, gehört es in ILIAS oder in eine
Webanwendung mit serverseitiger Anmeldung und privatem Datenspeicher. Eine
öffentliche Pages-Datei ist über ihre URL direkt abrufbar.
