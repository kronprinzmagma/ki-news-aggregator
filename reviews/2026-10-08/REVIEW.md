# Review vor der NZZ-Demo

Historischer Review vor den Korrekturen am 8. Oktober 2026: öffentliches GitHub-Repository, Produktionsartefakte und veröffentlichte Artikel. Die folgenden Befunde beschreiben den damaligen Zustand. Umgesetzte Korrekturen und verbleibende Grenzen stehen im [Abschlussbericht](CLEANUP.md).

**Urteil:** Als funktionierender Prototyp ist das Projekt vorführbar. Als redaktionell verlässlich geprüfter KI-News-Dienst ist es derzeit noch nicht überzeugend abgesichert. Der wichtigste Mangel ist eine Qualitätskontrolle, die leere Ergebnisse als unauffälligen Review darstellt. Hinzu kommen nachweisbare Fehler in einzelnen Artikeln und eine Auswahlheuristik, die schwächere Meldungen aufgrund beliebiger Wortüberschneidungen veröffentlicht.

## Umfang und Nachweise

- GitHub-main: `c02499a097e3e4d9de7ff958d9bc42c6f40ac78d`. Der lokale Stand liegt zwölf Commits zurück; die Differenz betrifft ausschliesslich generierte Build-Anker und `assets/stats.json`. Der geprüfte Anwendungscode entspricht damit GitHub-main.
- Letzte 14 Daily-Läufe: 24. September bis 7. Oktober; vier Weekly-Läufe.
- Sieben Dailys: 1.–7. Oktober, insgesamt 87 veröffentlichte Artikel. Zwei Weeklys: KW 39 und 40.
- Alle sieben Produktionsartefakte mit `articles`, `scored`, `summary` und `run-summary` heruntergeladen. 20 gezielt ausgewählte Aufbereitungen gegen den tatsächlich gelieferten Quellentext gelesen. Diese Stichprobe enthält bewusst technisch anspruchsvolle und redaktionell riskante Artikel; sie ist keine Zufallsstichprobe und keine geschätzte allgemeine Fehlerquote.
- Zusätzlich Online-Abgleich unter anderem mit Willisons Decisions-, Wikimedia-, Datasette- und Qwen-Beiträgen, Anthropics CVP-Ankündigung, Cloudflares Web-Search-Dokumentation, der Dust-Publikation, Nieman Labs Cartoon-Recherche, Buchanans C2PA-Demonstration und der Europäischen Kommission. Einzelne Heise-Seiten waren über das Web-Werkzeug nicht erreichbar; hierfür wurden die gespeicherten Produktionsinputs verwendet.
- `npm test`: 37/37 bestanden, lokal unter Node 22.20.0. Die jüngsten Dependency-PRs haben grüne GitHub-Tests unter Node 24.
- `npm audit --omit=dev`: zum Prüfzeitpunkt keine gemeldeten bekannten Schwachstellen.
- Scoring-Eval neu ausgeführt: 38/38 Beispiele, keine API-Fehler. Ergebnis in [scoring-eval.json](scoring-eval.json).
- Archiv, Statistikseite, beide Podcast-Feeds und neueste Audio-Enclosures erreichbar. RSS als XML geparst; Audiodateien per HEAD geprüft. Kein Hörtest in einer Podcast-App und keine vollständige akustische Prüfung.

Die prüfbaren Kennzahlen und Stichprobenvermerke sind in [evidence.json](evidence.json) gespeichert. Produktionsartefakte sind über die jeweiligen [GitHub-Läufe](https://github.com/kronprinzmagma/ki-news-aggregator/actions/workflows/daily-news.yml) zugänglich. Temporäre lokale Rohdaten liegen unter `/tmp/ki-news-review-2026-10-08/`.

## Befunde mit hoher Priorität

### R1 – Leere Qualitätskontrolle wird als erfolgreicher Review dargestellt

Am 1., 3. und 7. Oktober ist `review.result` in den Produktionsartefakten exakt `{}`. Verwertbare Einzelbewertungen fehlen. Betroffen sind 58 der 87 veröffentlichten Artikel der geprüften Woche. Trotzdem behaupten die jeweiligen Footer, keine Aufbereitung sei überarbeitungsbedürftig gewesen.

| Datum | Zur Review geschickt | Einzelbewertungen im Ergebnis | Veröffentlicht | Rewrites |
|---|---:|---:|---:|---:|
| 01.10. | 18 | 0 | 16 | 0 |
| 02.10. | 11 | 11 | 11 | 7 |
| 03.10. | 15 | 0 | 15 | 0 |
| 04.10. | 7 | 7 | 7 | 5 |
| 05.10. | 4 | 4 | 4 | 3 |
| 06.10. | 7 | 7 | 7 | 4 |
| 07.10. | 28 | 0 | 27 | 0 |

Die Review-Antwort wird in `lib/claude.js:185–196` ohne Schema-Validierung und ohne Prüfung des API-Abbruchgrundes übernommen. `deliver.js:650–661` behandelt fehlende Einzelbewertungen als leeres Array. `deliver.js:472–474` übersetzt null Rewrites anschliessend in eine positive Qualitätsaussage. Selbst die nichtleeren Ergebnisse enthalten teilweise nicht alle Pflichtfelder des definierten Schemas.

Ein isolierter Test mit einer simulierten API-Antwort (`stop_reason=max_tokens`, Tool-Input `{}`) bestätigt: `claudeStructured` akzeptiert dieses ungültige Ergebnis unverändert. Das ist eine Reproduktion des fehlenden Schutzes, kein Nachweis des konkreten API-Abbruchgrundes der drei Produktionsläufe. Das feste Budget von 4'000 Ausgabetokens für sämtliche Artikel ist eine plausible Ursache; die rohe API-Antwort ist nicht gespeichert.

**Bedeutung für die NZZ:** Die sichtbare Qualitätsaussage ist unzuverlässig. Vor einer Demo, die redaktionelle Verlässlichkeit verspricht, muss dieser Befund behoben sein. Notwendig sind validierte Antworten, vollständige Zuordnung zu allen Artikeln und eine ehrliche Anzeige bei fehlgeschlagener oder unvollständiger Prüfung.

### R2 – Nachweisbarer Sachfehler bei C2PA

Das [Daily vom 4. Oktober](https://github.com/kronprinzmagma/ki-news-aggregator/issues/213) erklärt, Buchanan habe den verifizierten Zeitstempel verschoben. Tatsächlich blieb der vertrauenswürdige Zeitstempel unverändert: Er schloss Bildbytes aus der Signaturprüfung aus und änderte danach den Bildinhalt. Gerade diese Unterscheidung ist die Angriffsmethode. [Buchanans Originaldemonstration](https://www.da.vidbuchanan.co.uk/blog/hacking-time.html)

Die erste Review erkannte den unvollständigen Input. Ihr Rewrite-Hinweis verlangte jedoch zusätzliche konkrete Produkte statt das Nachladen der fehlenden Angriffsbeschreibung. Der finale Text wurde anschliessend nicht erneut gegen die Quelle geprüft. Der Writer erhält nur die ersten 3'000 Zeichen; dort bricht die wesentliche Erklärung ab.

**Bedeutung für die NZZ:** Ein relevantes Thema zu Bildauthentizität wird technisch falsch erklärt. Der Fehler zeigt, dass stilistische Überarbeitung fehlende Fakten nicht ersetzen kann. Die Aufbereitung sollte den Ausschluss von Bilddaten erklären; nach jedem Rewrite muss eine Quellenprüfung erfolgen.

### R3 – Falsche zeitliche Einordnung des AI Acts im Weekly

Im [Weekly KW 39](https://github.com/kronprinzmagma/ki-news-aggregator/issues/205) steht, der AI Act verlange seit August 2024 die maschinenlesbare Kennzeichnung von KI-Texten. Das verwechselt das Inkrafttreten des Gesetzes mit dem Anwendungsbeginn dieser Pflichten. Die Kommission nennt für Artikel 50 den 2. August 2026. [Offizielle Erläuterung](https://digital-strategy.ec.europa.eu/en/policies/guidelines-ai-transparency-obligations)

**Bedeutung für die NZZ:** Eine rechtlich relevante Aussage ist falsch. Das Weekly synthetisiert bereits erzeugte Daily-Texte und hat keine separate Faktenprüfung. Zeitangaben und regulatorische Aussagen sollten im Syntheseschritt explizit belegt werden. Dies ist ein Befund zur publizierten Aussage, keine Beurteilung der rechtlichen Pflichten der NZZ.

### R4 – Beliebige gemeinsame Wörter heben Meldungen über die Veröffentlichungsschwelle

Sieben der 27 Artikel vom 7. Oktober waren ursprünglich Score 3 und wurden durch den Cluster-Bonus auf 4 angehoben. Der Vergleich nutzt Titel plus Scoring-Begründungen. Zwei gemeinsame Tokens reichen; generische Wörter und Autorennamen werden als Themenbeleg behandelt.

| Hochgestufter Artikel | Angeblich ergänzter Artikel | Tatsächliche gemeinsame Tokens |
|---|---|---|
| Apple Health / Podcast | Anthropics Cyberprogramme | `ki`, `oder` |
| Norwegens KI-Brillen-Regeln | GitHub ReviewBench | `ki`, `aber` |
| EmbeddingGemma 2 | Decisions-Plugin | `simon`, `willison` |

Diese Paarungen wurden mit den gespeicherten Scores und der produktiven Tokenfunktion reproduziert. Quelle: `lib/topic-overlap.js:97–113`; Anwendung in `score.js`. Auch mehrere sachlich vertretbare Meldungen erhalten dadurch einen Score, der mehr Relevanz suggeriert als die ursprüngliche Bewertung.

**Bedeutung für die NZZ:** Die Auswahl wird teilweise durch Füllwörter und gleiche Autoren bestimmt. Der neu ausgeführte Scoring-Eval prüft diese nachträgliche Produktionsanpassung nicht. Der Bonus sollte vor einer Qualitätsdemo deaktiviert oder durch belegte Themenzugehörigkeit ersetzt werden; ein End-to-End-Eval muss die finale Veröffentlichungsentscheidung messen.

### R5 – Tatsächliche Prüfung kann keine Quellentreue feststellen

Die produktive Review bekommt bei ausgewählten Artikeln nur Titel, URL, Quelle, Score, Begründung und erzeugten Text (`deliver.js:320–324`). Der zugrunde liegende Artikeltext fehlt. Nach einem Rewrite gibt es keine zweite Prüfung. Ein als schwach bewerteter Artikel bleibt in der Auswahl, sobald er neu formuliert wurde; die Review ist ausdrücklich beratend.

Das Volltext-Gate sucht lediglich nach der exakten Formulierung `Volltext nicht verfügbar`. Die CVP-Aufbereitung vom 7. Oktober enthält ausdrücklich eine abgeschnittene dritte Zugangsstufe und wird dennoch veröffentlicht. Die [vollständige Ankündigung](https://www.anthropic.com/news/cyber-verification-program) enthält diese Stufe und beschreibt zusätzlich technische Schutzmechanismen; die Aufbereitung zeichnet dagegen einen zu starken Gegensatz zwischen Technik und Identitätsprüfung.

**Bedeutung für die NZZ:** Der zweite Modellaufruf ist eine Textkritik, keine belastbare Faktenprüfung. Er sollte den Quellentext erhalten, wichtige Behauptungen zu Belegen zuordnen und unzureichend belegte Texte zurückhalten.

## Weitere konkrete Befunde

| ID | Befund | Beleg und Bedeutung |
|---|---|---|
| R6 | Morgenversprechen wird verfehlt | Alle 14 Daily-Läufe erfolgreich, aber Start in der geprüften Woche zwischen 12:30 und 14:28 Uhr Schweizer Zeit; geplant 07:30 Uhr. Ursache nicht bestimmt. Der Watchdog hängt am gleichen GitHub-Scheduler und prüft Run-Erfolg, nicht die tatsächliche Veröffentlichung. Kein belastbares Morgen-SLA. |
| R7 | Zwei konfigurierte Quellen vollständig ausgefallen | Aktuelle Statistik: VentureBeat und a16z jeweils 14/14 Fehlerläufe und null Artikel; Golem 5/14, Heise und Hacker News je 2/14 Fehlerläufe. 15 konfigurierte Quellen entsprechen nicht 15 funktionierenden Quellen. |
| R8 | Auswahl und Umfang schwanken stark | Vier bis 27 Artikel je Daily; 39/87 stammen von Heise, am 7. Oktober 19/27. Diese Konzentration ist kein Beweis schlechter Qualität, schwächt aber das Versprechen einer gleichmässig breiten Kuratierung. 47/87 Aufbereitungen überschreiten bei einfacher Wortzählung ohne Überschriften und Feedback das Ziel von 120 Wörtern. |
| R9 | Interpretationen werden zu sicher formuliert | Beim Qwen-Test wird ein kleines, eng begrenztes Experiment zu einer allgemeinen Aussage über fast eliminierte Rechenfehler und Druck auf OpenAI. Bei Siri wird eine berichtete Hoffnung Apples zu einer fest behaupteten Verhandlungsstrategie. Beim Memory-Blog wird die Autorenmeinung zur Aussage über die ganze Branche. Attribution und Reichweite des Belegs fehlen. |
| R10 | Praxisideen prüfen häufig etwas anderes als die Nachricht | Der Cartoon-Anker testet Claudes Stilbeschreibung statt die behauptete Signaturreproduktion. Beim Cloudflare-Anker wird direkt Exa genutzt statt die neue Gateway-Integration. Beim Google-Publisher-Artikel werden Search-Console-Zugänge auch für bloss beobachtete Domains vorausgesetzt. Nützlichkeit und Durchführbarkeit sind deshalb ungleichmässig. |
| R11 | Sichtbare Redaktionsfehler | Golem-Titel im Daily vom 5. Oktober enthalten `�`. Ursache nicht abschliessend bestimmt; der HTTP-Helper wandelt Buffer-Chunks einzeln in Text um. Der Budget-Caps-Beitrag bezeichnet den Autor als unbekannt, obwohl die Metadaten Simon Willison nennen; die Review erkennt den Fehler und lässt ihn bestehen. |
| R12 | GitHub-Qualitätsgates nicht erzwungen | Keine klassische Branch Protection und keine auf main angewendeten Branch Rules laut GitHub-API. Zwei offene Dependabot-PRs (#181, #209) mit grünen Tests. Für den persönlichen Prototyp tragbar; bei gemeinsamer Weiterentwicklung fehlt eine verbindliche Merge-Schranke. |
| R13 | Audio ist ein weiterer Generierungsschritt ohne Inhaltsprüfung | Das Hörskript wird neu geschrieben, mit festem Budget von 4'000 Tokens. API-Abbruchgründe werden auch hier nicht geprüft. Bei langen Ausgaben besteht ein Risiko unvollständiger Hörfassungen; für die aktuelle Folge wurde dies nicht akustisch nachgewiesen. RSS-Publikationszeit wird pauschal auf 06:00 UTC gesetzt, statt die tatsächliche Veröffentlichung abzubilden. |

## Neuer Scoring-Eval

| Messung | Ergebnis |
|---|---:|
| Bewertete Beispiele | 38/38 |
| Mittlere absolute Score-Abweichung | 0,842 |
| Pearson-Korrelation | 0,6385 |
| Abweichung höchstens ein Score-Punkt | 86,8 % |
| Falsche Seite der Veröffentlichungsschwelle | 4/38 |

Die vier Grenzfehler: **Big Words** (Mensch 4, Modell 2), **Hardening Firefox** (3 → 5), **CRDTs / concurrent creation** (1 → 4), **datasette-agent 0.3a0** (1 → 5).

Der Workflow-MAE-Grenzwert wird eingehalten. Das belegt eine grundsätzlich brauchbare Richtung, nicht die Qualität aller veröffentlichten Artikel. 23/38 Goldbeispiele tragen Score 5; nur sieben liegen bei 3 oder 4. Der Datensatz ist klein, teils aus positivem Feedback gespeist und kein unabhängiger aktueller NZZ-Qualitätsmassstab. Eine Ein-Punkt-Abweichung von 3 auf 4 gilt im bestehenden Toleranzmass als korrekt, veröffentlicht aber den Artikel zusätzlich. Cluster-Bonus, tatsächliche Auswahl, Fakten, Rewrites und Weekly-Synthese sind durch diesen Eval nicht abgedeckt.

## Redaktionelle Stichprobe: 20 Artikel

Die Urteile beziehen sich auf den gespeicherten Input und die finale Aufbereitung; zusätzliche Originalprüfungen sind in den Befunden genannt. „Kern gedeckt“ bestätigt die Zusammenfassung des Inputs, nicht sämtliche zugrunde liegenden Aussagen des Nachrichtenartikels. Es wurden keine 20 Praxisprojekte ausgeführt.

| Artikel | Ausgabe | Urteil |
|---|---|---|
| llm-openai-decisions | 07.10. | Kern und Preisangaben gedeckt; Nutzen konkret. Base64 und Wahrscheinlichkeitsschwellen setzen zusätzliche Erklärung voraus. |
| Datenweitergabe der Chatbots | 07.10. | Preprint-Status korrekt erhalten. Datenschutzvergleich mit ausdrücklich fiktiven Testfragen formulieren; er beweist keine tatsächliche Datenweitergabe. |
| Wikimedia / rogue agents | 07.10. | Kern gedeckt; Gleichsetzung der Agentenschwärme bleibt Willisons Vermutung. Öffentlicher Query-Log-Anker nicht verifiziert. |
| Parseable / Datasette | 07.10. | Kern gedeckt, aber AGPL, Rust, Versionsnummern und Telemetrie-Setup überfordern viele PMs ohne Anleitung. |
| Cyber Verification Program | 07.10. | Sichtbar unvollständiger Input; dritte Stufe fehlt. Gegensatz Technik versus Verifikation zu stark. |
| EmbeddingGemma 2 | 07.10. | Lizenz-/Lock-in-Argument gut transportiert. Anbieterbewegung teilweise ergänzt; lokale Berechnung von 500 Texten setzt Modellsetup voraus. |
| GitHub ReviewBench | 07.10. | Kern dem Input treu, relevante Herstellerkritik. Unterschiedliche Benchmark-Methoden sollten deutlicher eingeordnet werden. |
| BMW / Managementumbau | 07.10. | Gutes Beispiel: trennt Organisationsumbau von der überzogenen Behauptung, KI ersetze Manager. Greifbarer Freigabe-Anker. |
| Siri / EU | 07.10. | Nachrichtenkern gedeckt. Berichtete Hoffnung wird zu sicherer Motivbehauptung. |
| Apple Health | 07.10. | Kern gedeckt, aber Datenschutz-/Regulierungsinterpretation stärker als die Podcast-Ankündigung. Eigene Gesundheitsalter-Formel misst keinen validierten Gesundheitswert. |
| Qwen / Addition | 06.10. | Ergebniszahl gedeckt. Experimentumfang und längere Laufzeit fehlen in der strategischen Generalisierung. |
| New-Yorker-Signaturen | 06.10. | Für ein Medienhaus relevant und verständlich. Praxisidee misst nicht die beschriebene Signaturfälschung. |
| Dust | 06.10. | Forschungsmethode verständlich eingeführt. Praktische Effizienzgrenzen fehlen; selbst die interne Review bewertet Produktrelevanz als 2/5. Bleibt nach Rewrite publiziert. |
| Common Lisp | 06.10. | Autorenargument sinnvoll zusammengefasst. Marktbewegung von JetBrains/Microsoft unbelegt; interne Produktrelevanz 2/5, trotzdem publiziert. |
| Strata / lokale Qwen-Inferenz | 05.10. | Hardwarewerte dem Input weitgehend treu, Eigenangabe gekennzeichnet. „Kostenlos“ blendet Betriebskosten aus; Amortisation braucht Modellqualität und Lastprofil. |
| Cloudflare Web Search | 05.10. | Nachrichtenkern inklusive Beta und Preislogik gedeckt. Praxisidee umgeht den eigentlichen neuen Gateway-Pfad. |
| C2PA | 04.10. | Sachfehler bei der Angriffsmethode; siehe R2. Für die Demo erst nach Korrektur verwenden. |
| Harte Budgetgrenzen | 04.10. | Klarer, unmittelbar nützlicher PM-Befund. Falsche Autorenangabe und unnötige Kosten-Standardzeile. |
| Memory versus Dokumentation | 04.10. | These verständlich und Praxisidee nützlich. Branchenurteil sollte als Autorenmeinung gekennzeichnet werden. |
| Google / Publisher-Vergütung | 03.10. | Für die NZZ besonders relevant. Nachrichtenkern gedeckt; stärkere Interpretation zu Googles Absicht und KI-Training sowie nicht verfügbare Search-Console-Zugänge schwächen den Anker. |

## Was bereits überzeugt – und wie ich es der NZZ zeigen würde

Die komplette Kette funktioniert: Quellen → Relevanzbewertung → kurze Einordnung → Praxisidee → lesbares Archiv → abonnierbare Hörfassung. Versionierte Quellenlinks, Audit-Artefakte, persistierte Historie und Feedback bieten eine bessere Grundlage zur Nachvollziehbarkeit als ein reiner Chatbot. Der BMW-Beitrag zeigt, dass die Aufbereitung auch übertriebene KI-Narrative sinnvoll relativieren kann. Der Nutzen liegt im schnelleren Erkennen und Vertiefen relevanter Entwicklungen.

Für das Gespräch würde ich den Anspruch so formulieren: **Ein laufender Prototyp für ein persönliches KI-Briefing, der Auswahl, Einordnung und Audio automatisiert und dessen redaktionelle Kontrolle anhand echter Ausgaben überprüfbar weiterentwickelt werden kann.** Den aktuellen Stand würde ich nicht als autonom qualitätsgesicherten Nachrichtenkanal präsentieren.

Zeigen würde ich zuerst das [Live-Archiv](https://kronprinzmagma.github.io/ki-news-aggregator/), dann ein verständliches Beispiel mit sichtbarem Original-Link und schliesslich das Podcast-Abo. Thematisch bieten Publisher-Vergütung, falsche Bildsignaturen und Bildauthentizität direkten Gesprächsstoff für ein Medienhaus; die zugehörigen Aufbereitungen benötigen die oben benannten Korrekturen, bevor sie als Qualitätsbeispiele dienen. Der heutige Bestand enthält keine speziell validierte NZZ-Kuratierung.

**Vor einer Demo mit Qualitätsversprechen priorisieren:** R1 (ehrliche, vollständige Review), R2/R3 (belegte Sachfehler), R4 (falscher Auswahlbonus), R5 (Prüfung gegen Quelle und nach Rewrite). Kürzere Hauptausgabe, verlässliche Morgenzeit und konsequent überprüfbare Praxisideen verbessern danach den Produktnutzen. Diese Prioritäten folgen aus dem durchgeführten Review.

## Podcast-Abolinks

- **Daily:** [https://kronprinzmagma.github.io/ki-news-aggregator/feed-daily.xml](https://kronprinzmagma.github.io/ki-news-aggregator/feed-daily.xml) – 116 Folgen, neueste vom 7. Oktober 2026.
- **Weekly:** [https://kronprinzmagma.github.io/ki-news-aggregator/feed-weekly.xml](https://kronprinzmagma.github.io/ki-news-aggregator/feed-weekly.xml) – 17 Folgen, neueste KW 40 vom 4. Oktober 2026.

Die URL in der Podcast-App über die Funktion zum Hinzufügen eines Podcasts per URL/RSS einfügen. Es handelt sich um öffentliche RSS-Feeds. Feed-XML, Länge und Erreichbarkeit der neuesten Enclosures wurden geprüft; tatsächliches Abonnieren in einer App wurde nicht getestet.
