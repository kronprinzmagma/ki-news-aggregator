# Abschluss des Reviews für die NZZ-Demo

Stand: erste Korrekturfassung am 8. Oktober 2026. Die anschliessend vom Leser bestätigte ausführlichere Aufbereitung ist in [STYLE-UPDATE.md](STYLE-UPDATE.md) dokumentiert und ersetzt die unten genannten Längengrenzen und Pflichtversuche. Der [ursprüngliche Review](REVIEW.md) dokumentiert den Zustand vor den Korrekturen. Die dort gefundenen redaktionellen Fehler und die unzuverlässige Qualitätsprüfung wurden gezielt behoben.

## Was jetzt vorführbar ist

Die erste Seite der offenen Issues enthielt 21 Nachrichtenausgaben und vier Betriebshinweise. Alle 21 Ausgaben sind überarbeitet: sieben Dailys vom 1.–7. Oktober und 14 Weeklys von KW 27–40. Die vier Betriebshinweise bleiben offen, weil die zugrunde liegenden Probleme nicht pauschal behoben sind.

| Bereich | Ergebnis |
|---|---|
| Sieben Dailys | 87 ursprüngliche Beiträge auf elf reduziert; verständliche Überschriften, kurze Erklärung und ein durchführbarer Versuch |
| Jüngstes Daily | [7. Oktober, Issue #217](https://github.com/kronprinzmagma/ki-news-aggregator/issues/217): drei Beiträge statt 27; kein `llm-openai-decisions` |
| Daily vom 5. Oktober | Alle vier Beiträge entfernt; transparente leere Ausgabe ohne Hörfassung |
| 14 Weeklys | Je drei Themen und 315–352 Wörter einschliesslich Feedback; überzogene Schlussfolgerungen und technische Detailfülle gekürzt |
| Audio | 20 Hörfassungen aus den überarbeiteten Texten neu erzeugt; jüngstes Daily etwa drei Minuten, jüngstes Weekly etwa drei Minuten |

Die beibehaltenen Daily-Texte wurden gegen die Originalquellen geprüft und zusätzlich automatisch bewertet. Die Weeklys wurden anhand der verlinkten Quellen überarbeitet. Beispiele für die Korrekturen: Anbieterangaben und Prognosen sind gekennzeichnet; der Datenschutzartikel nennt den Preprint-Status; beim C2PA-Beispiel ist die tatsächlich demonstrierte Manipulation beschrieben; die falsche Datierung einer EU-Wasserzeichenpflicht und unbelegte Marktfolgerungen sind entfernt. Das ist eine gezielte redaktionelle Prüfung dieser Ausgaben, keine behauptete Fehlerfreiheit des gesamten Archivs.

Die Liste der geänderten Issues steht in [cleanup-issues.json](cleanup-issues.json). Originale und Quellenstände wurden vor den Änderungen lokal unter `/tmp/ki-news-review-2026-10-08/` gesichert. Feedback-Häkchen waren in den bearbeiteten Ausgaben nicht gesetzt.

## Was die Pipeline künftig anders macht

- Höchstens fünf Daily-Kandidaten; weniger Beiträge oder keine Veröffentlichung sind zulässig. Technische Plugins, Infrastruktur und isolierte Benchmarks erhalten ohne verständlichen Produktnutzen keine hohe Relevanz. Der bisherige Score-Bonus für gemeinsame Wörter entfällt.
- Je Nachricht höchstens 110 Wörter. Praktische Versuche sollen in 10–30 Minuten im Browser oder mit Claude durchführbar sein. Das Weekly-Prompt verlangt höchstens 450 Wörter.
- Daily-Reviews erhalten den Quellentext und müssen die vollständige Auswahl abdecken. Persönliche Relevanz, Verständlichkeit und Quellentreue müssen jeweils mindestens 4/5 erreichen. Ein Rewrite wird erneut geprüft; ungültige oder abgeschnittene Antworten verhindern die Veröffentlichung.
- Strukturierte API-Antworten werden serverseitig strikt angefordert und clientseitig validiert. UTF-8-Antworten von Quellen, Claude und GitHub werden erst nach Zusammenfügen der Bytes dekodiert.
- Hörfassungen lassen sich für ausdrücklich angegebene Issues erneuern. Archiv-Player und Podcast-Feeds verwenden ein Audio-Asset nur, wenn die Ausgabe es noch verlinkt; die entfernte Ausgabe vom 5. Oktober wird dadurch nicht weiter als Podcast angeboten.

Implementierung: [PR #218](https://github.com/kronprinzmagma/ki-news-aggregator/pull/218), ergänzt um die GitHub-Decodierung, die transparente Relevanz-Kalibrierung und den Archiv-Abgleich. README und veröffentlichtes Beispiel wurden dem aktuellen Verhalten angepasst.

## Prüfung und Grenzen

`npm test`: 50 Tests bestanden, einschliesslich fehlender/ungültiger Reviews, Veröffentlichungsgates, Auswahlbegrenzung und UTF-8-Antworten. `npm audit --omit=dev`: keine gemeldeten bekannten Schwachstellen zum Prüfzeitpunkt. Ein isolierter Deliver-Lauf mit echten Claude-Aufrufen hat Auswahl, Rewrite, erneute Prüfung und Ausschluss ungenügender Texte durchlaufen. Die korrigierten Issue-Bodies wurden nach dem Schreiben zurückgelesen und geprüft.

Der neue Relevanztest verwendet 16 explizit **redaktionell kalibrierte** Referenzen mit kurzen eigenen Quellenzusammenfassungen: MAE 0.563, Pearson 0.845, 87.5 % innerhalb eines Score-Punkts. [Messung und Herkunft](pm-scoring-eval.json) sind dokumentiert. Das beanstandete Plugin erhält 2/5. Die 38 historischen Nutzerlabels bleiben unverändert. Diese neue Kalibrierung prüft die gewünschte Leserperspektive; sie ersetzt weder unabhängige menschliche Bewertungen noch einen Quellentreue-Test. Auch Google-Publishervergütung und die Barclays-Fallstudie werden darin weiterhin zu niedrig bewertet.

Die Audio-Aktualisierung und die Archiv-Veröffentlichung liefen erfolgreich. Beide Live-Feeds wurden als XML geparst; die neuesten MP3s waren mit HTTP 200 und passenden Dateigrössen erreichbar. Kein vollständiger Hörtest in einer Podcast-App.

Offen bleiben wiederholte Quellenausfälle, insbesondere a16z und VentureBeat, sowie die verspäteten GitHub-Schedules. Die automatische Weekly-Synthese basiert weiterhin auf den Dailys und hat noch keinen gleichwertigen harten Quellentreue-Gate. Neue echte Leserbewertungen sind erforderlich, um die neue Relevanzperspektive unabhängig zu bestätigen. Ältere Ausgaben ausserhalb der ersten Issue-Seite wurden nicht durchgehend bereinigt.

Für die NZZ lässt sich damit ein deutlich verständlicherer, kuratierter Prototyp zeigen. Eine Zusage redaktioneller Produktionsreife wäre weiterhin zu weitgehend.

## Links zum Vorführen und Abonnieren

- [Jüngstes Daily im Archiv](https://kronprinzmagma.github.io/ki-news-aggregator/daily/2026-10-07.html)
- [Jüngstes Weekly im Archiv](https://kronprinzmagma.github.io/ki-news-aggregator/weekly/kw-40.html)
- [Daily-Podcast abonnieren](https://kronprinzmagma.github.io/ki-news-aggregator/feed-daily.xml)
- [Weekly-Podcast abonnieren](https://kronprinzmagma.github.io/ki-news-aggregator/feed-weekly.xml)

Die Feed-URL in der Podcast-App über «Podcast per URL hinzufügen» eintragen. Bereits heruntergeladene ältere Hörfassungen können im Cache der App verbleiben.
