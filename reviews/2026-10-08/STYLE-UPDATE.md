# Bestätigter Erklärungsstil für Texte und Hörfassungen

Am 8. Oktober 2026 hat der Leser den ausführlicheren [Daily-Entwurf](DAILY-TEXTENTWURF.md) bestätigt und die Umsetzung für alle bereinigten Ausgaben sowie die Hörfassungen freigegeben. Diese Fassung ersetzt die Längengrenzen und Pflichtversuche der ersten [Korrekturfassung](CLEANUP.md).

## Texte und künftige Ausgaben

Daily-Nachrichten haben normalerweise 150–220 Wörter, höchstens 300. Die drei Blöcke erklären die Nachricht, die nötigen Hintergründe und Bedingungen, ihre Bedeutung und einen praktischen Gesichtspunkt. Ein Versuch ist nur dann sinnvoll, wenn er wirklich hilft; Verständnis setzt weder das Öffnen der Originalquelle noch ein Entwickler-Setup voraus. Dünne Quellen werden nicht künstlich aufgefüllt. Fakten, Anbieterangaben, Prognosen und Einordnung bleiben unterscheidbar.

Weeklys erklären weiterhin drei Themen, üblicherweise mit je 150–200 Wörtern. Für künftige Ausgaben gilt ein Gesamtziel von 650–800 Wörtern, höchstens 900 einschliesslich Feedback und Belegen. Einfache Themen können kürzer bleiben. Die Hörfassungen sollen Erklärungen, Bedingungen und Unsicherheiten erhalten.

Die Produktionseinstellungen, Review-Kriterien, Strukturprüfung, Audio-Prompts, Archivbeschreibung und Dokumentation wurden angeglichen. Der frühere dritte Block «Build-Anker» bleibt beim Einlesen älterer Ausgaben kompatibel; neue Ausgaben verwenden «Praktischer Hinweis».

## Überarbeitete Ausgaben

Die Artikelauswahl der ersten Korrekturfassung bleibt bestehen. Sechs nichtleere Dailys vom 1.–7. Oktober enthalten insgesamt elf Nachrichten; ihre Erklärungstexte haben 187–212 Wörter ohne Blocküberschriften. Das Daily vom 7. Oktober übernimmt den bestätigten Entwurf. Die leere Ausgabe vom 5. Oktober bleibt transparent leer und ohne Hörfassung.

Auch die 14 Weeklys von KW 27–40 wurden anhand ihrer verlinkten Quellen ausführlicher aufbereitet. Themen, Reihenfolge, Quellen und Feedback-Häkchen bleiben erhalten. Bei jeder Überarbeitung wurden wichtige Einschränkungen geprüft; unter anderem wurden Tarifzugang, Sicherheitsversuche und sprachabhängige Kostenunterschiede präzisiert. Die praktische Hinweissammlung und das veröffentlichte Daily-Beispiel wurden passend aktualisiert.

Die geänderten Ausgaben und Prüfergebnisse stehen in [style-update-issues.json](style-update-issues.json). Bei Weekly #105 lieferte die zusätzliche KI-Prüfung mehrfach widersprüchliche Einwände oder blosse Zitate. Die Freigabe beruht deshalb auf einem direkten redaktionellen Quellenabgleich; sie ist in der Ergebnisdatei ausdrücklich als solcher bezeichnet. Die automatische Prüfung ist kein unabhängiger menschlicher Faktencheck.

## Prüfung und Veröffentlichung

- `npm test`: 52 Tests bestanden. [Tests in CI](https://github.com/kronprinzmagma/ki-news-aggregator/actions/runs/37770012644) und [Scoring Eval](https://github.com/kronprinzmagma/ki-news-aggregator/actions/runs/37770012692) für den Produktionscommit `1eec309` erfolgreich.
- Ein echter Aufbereitungs- und Review-Aufruf mit der aktualisierten Produktionseinstellung lieferte einen strukturell gültigen Erklärungstext von 208 Wörtern. Das prüft das Format und den API-Ablauf, keine garantierte Fehlerfreiheit künftiger Texte.
- Issue-Bodies nach Veröffentlichung zurückgelesen: Anzahl, Struktur, Quellenzuordnung, Text und unveränderte Feedback-Häkchen geprüft. Keine beschädigten UTF-8-Zeichen.
- Alle 20 Hörfassungen aus den endgültigen Texten neu erzeugt: [Daily-Lauf](https://github.com/kronprinzmagma/ki-news-aggregator/actions/runs/37770251956) und [Weekly-Lauf](https://github.com/kronprinzmagma/ki-news-aggregator/actions/runs/37772220875) erfolgreich. Audio-Links in allen Issues und aktuelle Release-Assets geprüft; [Dateigrössen und Aktualisierungsstände](style-update-audio.json) dokumentiert. Jüngstes Daily und jüngstes Weekly jeweils ungefähr fünf Minuten laut Skriptschätzung.

[Archiv-Veröffentlichung](https://github.com/kronprinzmagma/ki-news-aggregator/actions/runs/37773432632) erfolgreich. Beide Live-Feeds als XML geprüft; die neuesten MP3s sind mit HTTP 200 und passenden Dateigrössen erreichbar. Jüngstes Daily und Weekly enthalten die neuen Texte und funktionierende Player. Die leere Ausgabe vom 5. Oktober bleibt ohne Player und Podcast-Folge. [Live-Prüfergebnisse](style-update-live.json) sind dokumentiert. Kein vollständiger Hörtest in einer Podcast-App.

Dokumentationsabgleich nach `.context/doc-check.md` abgeschlossen: Produktionsbeschreibung, Längenziele, dritte Textblöcke, Beispiele, Hinweissammlung, aktueller Stand und bekannte Grenzen stimmen mit der Umsetzung überein.

Die bisherigen Betriebsgrenzen bestehen weiter: unzuverlässige GitHub-Schedules und einzelne ausgefallene Quellen; die automatische Weekly-Synthese hat noch keinen gleichwertigen harten Quellentreue-Gate. Historische Ausgaben ausserhalb der ersten Issue-Seite wurden nicht vollständig umgeschrieben.

## Vorführen und abonnieren

- [Daily vom 7. Oktober](https://kronprinzmagma.github.io/ki-news-aggregator/daily/2026-10-07.html)
- [Weekly KW 40](https://kronprinzmagma.github.io/ki-news-aggregator/weekly/kw-40.html)
- [Daily-Podcast-Feed](https://kronprinzmagma.github.io/ki-news-aggregator/feed-daily.xml)
- [Weekly-Podcast-Feed](https://kronprinzmagma.github.io/ki-news-aggregator/feed-weekly.xml)

Die Feed-URL lässt sich in der Podcast-App über «Podcast per URL hinzufügen» abonnieren. Bereits heruntergeladene ältere Hörfassungen können im Cache der App verbleiben.
