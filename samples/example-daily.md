<!--
Sample-Issue für README-Verlinkung.
Original: https://github.com/kronprinzmagma/ki-news-aggregator/issues/41 (erstellt 2026-05-21T11:04:54Z)
Hinweis: Der AI-Disclaimer-Block wurde nach Erstellung des Originals eingeführt und hier
manuell ergänzt, damit das Sample dem aktuellen Issue-Format entspricht.
-->

# KI Daily – 2026-05-21

> 🤖 **KI-generierter Inhalt.** Zusammenfassungen und Einleitung sind von Claude (Anthropic) verfasst, kuratiert aus den verlinkten Originalquellen. Hinweis nach EU AI Act Art. 50(4).

Die Reasoning-Frontier verschiebt sich konkret: Ein 80 Jahre altes Mathematikproblem, unter 1000 Dollar, mit einem Allzweckmodell gelöst – das ist kein Benchmark, das ist ein Capability-Signal. Gleichzeitig verdichtet sich die Infrastrukturschicht: Compute-Deals in Milliardenhöhe, TPU-Rechenzentren, Agent-native Clouds – die Plattformfrage wird zur Kostenfrage. Wer heute Produkte auf diesen Schichten baut, muss verstehen, dass Token-Throughput und UX-Wahrnehmung auseinanderfallen. Das Fundament wächst schneller als die meisten Produktentscheidungen es noch einpreisen.

> **3 Artikel zum gleichen Event zusammengeführt:** [Google Gemini soll künftig auf Adobe-Werkzeuge zugreifen](https://www.heise.de/news/Adobe-Werkzeuge-kuenftig-in-Google-Gemini-verfuegbar-11301015.html?wt_mc=rss.red.ho.ho.atom.beitrag.beitrag) · [Google just redesigned the search box for the first time in 25 years — here’s why it matters more than you think.](https://venturebeat.com/technology/google-just-redesigned-the-search-box-for-the-first-time-in-25-years-heres-why-it-matters-more-than-you-think) · [Google I/O 2026: KI-Warenkorb soll Einkaufen über alle Google-Dienste vereinen](https://www.heise.de/news/Google-I-O-2026-KI-Warenkorb-soll-Einkaufen-ueber-alle-Google-Dienste-vereinen-11298764.html?wt_mc=rss.red.ho.ho.atom.beitrag.beitrag)

---

<!-- ki-news-meta: {"v":1,"url":"https://simonwillison.net/2026/May/20/spacex-s1/#atom-everything","score":5,"quelle":"simonwillison","titel":"Quoting SpaceX S-1"} -->
### Quoting SpaceX S-1

Score 5/5 · [simonwillison](https://simonwillison.net/2026/May/20/spacex-s1/#atom-everything)

- [ ] Besonders wertvoll
- [ ] Später weiterverfolgen

**Was ist neu**
Im S-1-Prospekt (Börsenprospekt) von xAI taucht ein konkreter Vertrag auf: Anthropic zahlt xAI monatlich 1,25 Milliarden Dollar für Rechenkapazität auf den Rechenzentren COLOSSUS und COLOSSUS II – laufend bis Mai 2029, kündbar mit 90 Tagen Frist. xAI trainiert dort gleichzeitig Grok 5 auf eigene Rechnung. Quelle ist ein Zitat, das Simon Willison am 20. Mai 2026 dokumentiert hat.

**Was es für die KI-Richtung heisst**
Anthropic – trotz eigener Infrastrukturambitionen – kauft massiv Rechenzeit bei einem direkten Konkurrenten (xAI), was zeigt, dass GPU-Kapazität (Grafikprozessor-Rechenleistung) derart knapp ist, dass Wettbewerb beim Einkauf keine Rolle spielt.

**Build-Anker**
Schreib mit Claude Code einen Parser, der öffentliche S-1-Dokumente auf Vertragsvolumen, Laufzeiten und Kündigungsklauseln durchsucht – und miss, wie viele solcher Infrastrukturverträge sich in den letzten zwölf Monaten in Börsendokumenten nachweisen lassen.

> **Lies auch:** [\[AINews\] OpenAI GPT-next disproves 80 year old Erdős planar unit distance problem for under $1000](https://www.latent.space/p/ainews-openai-gpt-next-disproves) · [How fast is 10 tokens per second really?](https://simonwillison.net/2026/May/20/tokens-per-second/#atom-everything) · [Railway: The Agent-Native Cloud — Jake Cooper](https://www.latent.space/p/railway) · [Google öffnet Android CLI für alle KI-Agenten](https://www.heise.de/news/Google-oeffnet-Android-CLI-fuer-alle-KI-Agenten-11301420.html?wt_mc=rss.red.ho.ho.atom.beitrag.beitrag)

---

<!-- ki-news-meta: {"v":1,"url":"https://www.latent.space/p/ainews-openai-gpt-next-disproves","score":5,"quelle":"latentspace","titel":"[AINews] OpenAI GPT-next disproves 80 year old Erdős planar unit distance problem for under $1000"} -->
### \[AINews\] OpenAI GPT-next disproves 80 year old Erdős planar unit distance problem for under $1000

Score 5/5 · [latentspace](https://www.latent.space/p/ainews-openai-gpt-next-disproves)

- [ ] Besonders wertvoll
- [ ] Später weiterverfolgen

**Was ist neu**
OpenAI hat mit einem internen Allzweck-Reasoning-Modell (spekulativ GPT-5.6) das 1946 formulierte Erdős-Einheitsabstandsproblem widerlegt – kein domänenspezifisches System wie AlphaProof, sondern ein Sprachmodell mit erweitertem Denken. Der Lauf dauerte laut Text unter 32 Stunden und kostete unter 1000 Dollar. Timothy Gowers bezeichnet es als erstes klares Beispiel, dass KI ein bekanntes offenes Mathematikproblem löst.
_Kosten/Limits: unter 1000 USD, unter 32 Stunden Rechenzeit laut Spekulation im Quellentext._

**Was es für die KI-Richtung heisst**
OpenAI demonstriert, dass Inferenz-Zeit-Skalierung (mehr Rechenaufwand beim Schlussfolgern statt beim Training) Forschungsdurchbrüche ermöglicht – und positioniert das Modell explizit für spätere öffentliche Nutzung, was bedeutet: Wissenschaftliche Problemlösung wird ein Produktfeature, keine Laborkuriosität.

**Build-Anker**
Lade die 125-seitige OpenAI-Reasoning-Zusammenfassung herunter und baue mit Claude Code ein Skript, das Argumentationssprünge (wie den erwähnten „Seite-39-Moment") automatisch markiert – miss dabei, wie viele Schlussfolgerungsschritte zwischen zwei zitierten Behauptungen fehlen.

> **Lies auch:** [Quoting SpaceX S-1](https://simonwillison.net/2026/May/20/spacex-s1/#atom-everything) · [How fast is 10 tokens per second really?](https://simonwillison.net/2026/May/20/tokens-per-second/#atom-everything) · [Railway: The Agent-Native Cloud — Jake Cooper](https://www.latent.space/p/railway) · [The last six months in LLMs in five minutes](https://simonwillison.net/2026/May/19/5-minute-llms/#atom-everything) · [Google öffnet Android CLI für alle KI-Agenten](https://www.heise.de/news/Google-oeffnet-Android-CLI-fuer-alle-KI-Agenten-11301420.html?wt_mc=rss.red.ho.ho.atom.beitrag.beitrag) · [Google und US-Investor bauen gemeinsame Rechenzentren auf Basis von Google-TPUs](https://www.heise.de/news/Google-und-US-Investor-bauen-gemeinsame-Rechenzentren-auf-Basis-von-Google-TPUs-11299933.html?wt_mc=rss.red.ho.ho.atom.beitrag.beitrag)

---

<!-- ki-news-meta: {"v":1,"url":"https://simonwillison.net/2026/May/20/tokens-per-second/#atom-everything","score":4,"quelle":"simonwillison","titel":"How fast is 10 tokens per second really?"} -->
### How fast is 10 tokens per second really?

Score 4/5 · [simonwillison](https://simonwillison.net/2026/May/20/tokens-per-second/#atom-everything)

- [ ] Besonders wertvoll
- [ ] Später weiterverfolgen

**Was ist neu**
Mike Veerman hat eine kleine HTML-App gebaut, die LLM-Ausgabegeschwindigkeiten von 5 bis 800 Token pro Sekunde simuliert – vier Inhaltsmodi (Code, Prosa, Reasoning, Agent) machen den Unterschied zwischen Geschwindigkeitsangabe und tatsächlicher Wahrnehmung erfahrbar. Die App nutzt BPE-ähnliche Tokenisierung (Byte-Pair-Encoding: Textstücke werden in Teilwörter zerlegt), nicht vendor-spezifische Encoder. Simon Willison hat sie verlinkt und kontextualisiert.
_Kosten/Limits: keine Angabe im Text._

**Was es für die KI-Richtung heisst**
Benchmark-Zahlen wie „47 tok/s" sind ohne Inhaltskontext irreführend – Code ist token-dichter als Prosa, dieselbe Rate fühlt sich fundamental anders an. Wer Latenz als Produktmerkmal kommuniziert, muss den Inhaltstyp mitliefern, sonst vergleicht man Ungleiches.

**Build-Anker**
Öffne die App, stelle denselben tok/s-Wert ein und wechsle mit den Tasten zwischen Code- und Prosa-Modus: Miss, bei welcher Geschwindigkeit du im Code-Modus nicht mehr mitliest – dieser Schwellenwert ist dein reales UX-Limit für Streaming-Entscheidungen.

> **Lies auch:** [Quoting SpaceX S-1](https://simonwillison.net/2026/May/20/spacex-s1/#atom-everything) · [\[AINews\] OpenAI GPT-next disproves 80 year old Erdős planar unit distance problem for under $1000](https://www.latent.space/p/ainews-openai-gpt-next-disproves) · [Railway: The Agent-Native Cloud — Jake Cooper](https://www.latent.space/p/railway) · [Google officially announces that ads will be included in AI Mode search results](https://blog.google/products/ads-commerce/google-marketing-live-search-ads/) · [Google öffnet Android CLI für alle KI-Agenten](https://www.heise.de/news/Google-oeffnet-Android-CLI-fuer-alle-KI-Agenten-11301420.html?wt_mc=rss.red.ho.ho.atom.beitrag.beitrag)

---

<!-- ki-news-meta: {"v":1,"url":"https://simonwillison.net/2026/May/20/google-io/#atom-everything","score":4,"quelle":"simonwillison","titel":"Google I/O, Gemini Spark, Antigravity"} -->
### Google I/O, Gemini Spark, Antigravity

Score 4/5 · [simonwillison](https://simonwillison.net/2026/May/20/google-io/#atom-everything)

- [ ] Besonders wertvoll
- [ ] Später weiterverfolgen

**Was ist neu**
Simon Willison beschreibt Ankündigungen von Google I/O (Mai 2026), die er noch nicht selbst testen konnte. Gemini Spark ist ein geplanter persönlicher KI-Agent mit nativer Google-App-Integration (Gmail, Calendar, Drive, Docs etc.), der laut FAQ auf Gemini 3.5 Flash und einem Go-Binary namens Antigravity läuft. Parallel wird das quelloffene Gemini CLI (TypeScript, Apache 2.0) ab 18. Juni 2026 aus Abonnement-Plänen entfernt und durch das proprietäre Antigravity CLI ersetzt.
_Kosten/Limits: keine Angabe im Text._

**Was es für die KI-Richtung heisst**
Google ersetzt ein offenes CLI-Werkzeug durch ein proprietäres – wer auf Gemini-APIs mit eigenen Skripten baut, verliert eine lizenzfreie Einstiegsoption und wird in Googles kontrolliertes Ökosystem gedrängt.

**Build-Anker**
Baue mit dem Antigravity SDK (Python-Wrapper) einen minimalen Agenten, der eine Gmail-Anfrage simuliert, und miss, ob die ephemere VM-Isolation (laut FAQ) Session-Daten zwischen zwei Aufrufen tatsächlich trennt – du siehst entweder leere Kontexte oder unerwartete Datenpersistenz.

> **Lies auch:** [Railway: The Agent-Native Cloud — Jake Cooper](https://www.latent.space/p/railway) · [KPMG integrates Claude across its core business and workforce of more than 276,000 in strategic alliance](https://www.anthropic.com/news/anthropic-kpmg) · [The last six months in LLMs in five minutes](https://simonwillison.net/2026/May/19/5-minute-llms/#atom-everything) · [Google officially announces that ads will be included in AI Mode search results](https://blog.google/products/ads-commerce/google-marketing-live-search-ads/) · [Google öffnet Android CLI für alle KI-Agenten](https://www.heise.de/news/Google-oeffnet-Android-CLI-fuer-alle-KI-Agenten-11301420.html?wt_mc=rss.red.ho.ho.atom.beitrag.beitrag) · [Google und US-Investor bauen gemeinsame Rechenzentren auf Basis von Google-TPUs](https://www.heise.de/news/Google-und-US-Investor-bauen-gemeinsame-Rechenzentren-auf-Basis-von-Google-TPUs-11299933.html?wt_mc=rss.red.ho.ho.atom.beitrag.beitrag)

---

<!-- ki-news-meta: {"v":1,"url":"https://www.latent.space/p/railway","score":4,"quelle":"latentspace","titel":"Railway: The Agent-Native Cloud — Jake Cooper"} -->
### Railway: The Agent-Native Cloud — Jake Cooper

Score 4/5 · [latentspace](https://www.latent.space/p/railway)

- [ ] Besonders wertvoll
- [ ] Später weiterverfolgen

**Was ist neu**
Railway, 2020 von Jake Cooper (ex-Bloomberg, ex-Uber) gegründet, positioniert sich als Deployment-Plattform für eine Welt, in der Agents – autonome Software-Prozesse – die dominante Nutzungsform werden. Mit 35 Personen, 3 Millionen Nutzern und 124 Mio. USD Kapital betreibt Railway eigene Rechenzentren mit angeblich dreimonatiger Amortisationszeit und 70 % Margen. Ein GCP-Ausfall vom 19. Mai legte offen, dass Workload-Erkennung trotz Multi-Zone-Architektur noch an GCP gebunden war.
_Kosten/Limits: keine Angabe im Text._

**Was es für die KI-Richtung heisst**
Railway wettet, dass Agents andere Infrastruktur-Primitive brauchen als Menschen: versionierte Produktions-Forks, Beobachtbarkeit und Orchestrierung im Massstab von 1000x – nicht nur billigeres Heroku. Wer heute Deployment-Pipelines für Agents aufsetzt, sollte prüfen, ob Git-PR-Workflows überhaupt noch der richtige Auslöser sind.

**Build-Anker**
Erstelle mit Nixpacks ein minimales Deployment für einen einfachen Python-Agent und miss, wie viele manuelle Konfigurationsschritte bis zur laufenden URL noch nötig sind – das zeigt dir direkt, wo der Aktivierungsaufwand heute noch hängt.

> **Lies auch:** [Quoting SpaceX S-1](https://simonwillison.net/2026/May/20/spacex-s1/#atom-everything) · [\[AINews\] OpenAI GPT-next disproves 80 year old Erdős planar unit distance problem for under $1000](https://www.latent.space/p/ainews-openai-gpt-next-disproves) · [How fast is 10 tokens per second really?](https://simonwillison.net/2026/May/20/tokens-per-second/#atom-everything) · [Google I/O, Gemini Spark, Antigravity](https://simonwillison.net/2026/May/20/google-io/#atom-everything) · [The last six months in LLMs in five minutes](https://simonwillison.net/2026/May/19/5-minute-llms/#atom-everything) · [Google officially announces that ads will be included in AI Mode search results](https://blog.google/products/ads-commerce/google-marketing-live-search-ads/) · [Google öffnet Android CLI für alle KI-Agenten](https://www.heise.de/news/Google-oeffnet-Android-CLI-fuer-alle-KI-Agenten-11301420.html?wt_mc=rss.red.ho.ho.atom.beitrag.beitrag) · [Google und US-Investor bauen gemeinsame Rechenzentren auf Basis von Google-TPUs](https://www.heise.de/news/Google-und-US-Investor-bauen-gemeinsame-Rechenzentren-auf-Basis-von-Google-TPUs-11299933.html?wt_mc=rss.red.ho.ho.atom.beitrag.beitrag)

---

<!-- ki-news-meta: {"v":1,"url":"https://www.anthropic.com/news/anthropic-kpmg","score":4,"quelle":"anthropic","titel":"KPMG integrates Claude across its core business and workforce of more than 276,000 in strategic alliance"} -->
### KPMG integrates Claude across its core business and workforce of more than 276,000 in strategic alliance

Score 4/5 · [anthropic](https://www.anthropic.com/news/anthropic-kpmg)

- [ ] Besonders wertvoll
- [ ] Später weiterverfolgen

**Was ist neu**
KPMG und Anthropic haben eine globale Allianz geschlossen. Claude wird in «Digital Gateway» eingebettet – die interne Arbeitsplattform von KPMG – mit initialem Fokus auf Steuer- und Rechtsdienstleistungen. Alle 276'000 Mitarbeitenden erhalten Zugang; zusätzlich benennt Anthropic KPMG als bevorzugten Partner für Private-Equity-Mandate.

**Was es für die KI-Richtung heisst**
Anthropic sichert sich über Branchenpartner institutionellen Zugang zu regulierten Märkten, in denen Genauigkeit und Haftung zentral sind – ein direkter Kanal, den ein API-only-Ansatz nicht öffnet. Für Produktentscheidungen in Audit, Tax oder Legal heisst das: Compliance-Positioning wird zum Eintrittsticket, nicht zur Differenzierung.

**Build-Anker**
Baue mit der Claude API einen Prompt-Vergleich für einen Steuer- oder Prüfungs-Workflow (z.B. Mehrwertsteuer-Klassifikation) und miss, bei wie vielen von zehn Fällen die Antwort eine belegbare Quellenangabe enthält – so siehst du, wo das Modell Lücken mit Plausibilität füllt statt mit Fakten.

> **Lies auch:** [Google I/O, Gemini Spark, Antigravity](https://simonwillison.net/2026/May/20/google-io/#atom-everything) · [The last six months in LLMs in five minutes](https://simonwillison.net/2026/May/19/5-minute-llms/#atom-everything)

---

<!-- ki-news-meta: {"v":1,"url":"https://simonwillison.net/2026/May/19/5-minute-llms/#atom-everything","score":4,"quelle":"simonwillison","titel":"The last six months in LLMs in five minutes"} -->
### The last six months in LLMs in five minutes

Score 4/5 · [simonwillison](https://simonwillison.net/2026/May/19/5-minute-llms/#atom-everything)

- [ ] Besonders wertvoll
- [ ] Später weiterverfolgen

**Was ist neu**

Volltext nicht verfügbar – Angaben basieren auf Teaser. Ein Entwickler fasst sechs Monate LLM-Entwicklung zusammen und identifiziert November 2025 als Wendepunkt: Coding-Agenten (autonome Programmierwerkzeuge) überschritten eine Qualitätsschwelle, ab der sie laut Autor als tägliches Arbeitswerkzeug nutzbar wurden. Die Führung beim subjektiv «besten» Modell wechselte in diesem Monat fünfmal zwischen Claude, GPT und Gemini.

**Was es für die KI-Richtung heisst**

OpenAI und Anthropic haben 2025 gezielt Reinforcement Learning auf verifizierbaren Code-Aufgaben eingesetzt – mit sichtbarem Ergebnis: nicht bessere Benchmarks, sondern weniger Korrekturbedarf im Alltag.

**Build-Anker**

Baue mit Claude Code einen automatisierten Vergleichstest: Lass drei Modelle dieselbe klar definierte Coding-Aufgabe lösen und miss, wie viele manuelle Korrekturen du jeweils brauchst – so siehst du, ob der beschriebene Qualitätssprung in deinem Anwendungsfall real ist.

> **Lies auch:** [\[AINews\] OpenAI GPT-next disproves 80 year old Erdős planar unit distance problem for under $1000](https://www.latent.space/p/ainews-openai-gpt-next-disproves) · [Google I/O, Gemini Spark, Antigravity](https://simonwillison.net/2026/May/20/google-io/#atom-everything) · [Railway: The Agent-Native Cloud — Jake Cooper](https://www.latent.space/p/railway) · [KPMG integrates Claude across its core business and workforce of more than 276,000 in strategic alliance](https://www.anthropic.com/news/anthropic-kpmg) · [Google officially announces that ads will be included in AI Mode search results](https://blog.google/products/ads-commerce/google-marketing-live-search-ads/) · [Show HN: Rmux – A programmable terminal multiplexer with a Playwright-style SDK](https://github.com/helvesec/rmux) · [Google öffnet Android CLI für alle KI-Agenten](https://www.heise.de/news/Google-oeffnet-Android-CLI-fuer-alle-KI-Agenten-11301420.html?wt_mc=rss.red.ho.ho.atom.beitrag.beitrag) · [Google und US-Investor bauen gemeinsame Rechenzentren auf Basis von Google-TPUs](https://www.heise.de/news/Google-und-US-Investor-bauen-gemeinsame-Rechenzentren-auf-Basis-von-Google-TPUs-11299933.html?wt_mc=rss.red.ho.ho.atom.beitrag.beitrag)

---

<!-- ki-news-meta: {"v":1,"url":"https://blog.google/products/ads-commerce/google-marketing-live-search-ads/","score":4,"quelle":"hackernews","titel":"Google officially announces that ads will be included in AI Mode search results"} -->
### Google officially announces that ads will be included in AI Mode search results

Score 4/5 · [hackernews](https://blog.google/products/ads-commerce/google-marketing-live-search-ads/)

- [ ] Besonders wertvoll
- [ ] Später weiterverfolgen

**Was ist neu**
Google integriert Gemini in den bezahlten Suchanzeigen-Bereich und testet neue Formate: «Conversational Discovery Ads» beantworten konkrete Nutzerfragen innerhalb einer Anzeige, «Highlighted Answers» liefern produktbezogene Erklärungen, und Shopping-Anzeigen werden um einen KI-generierten Kontext erweitert. Parallel wird das «Direct Offers»-Pilot um nativen Checkout und Reiseangebote ausgebaut. Laut Text berichten 75 % der befragten Nutzer, mit AI Mode schneller zu Kaufentscheidungen zu gelangen.

**Was es für die KI-Richtung heisst**
Google monetarisiert den Conversational-Search-Kanal direkt, bevor Alternativen wie Perplexity oder ChatGPT Search dort eigene Werbemodelle etablieren können. Wer heute Kampagnen plant, muss entscheiden, ob Performance Max der richtige Einstiegspunkt ist – oder ob das Format zu viel Kontrolle abgibt.

**Build-Anker**
Baue mit der Gemini API einen einfachen Prompt-Vergleich: Gib dieselbe Produktfrage einmal klassisch und einmal als Conversational-Query ein und miss, wie stark sich Länge, Tonalität und Produktnennung im Output unterscheiden.

> **Lies auch:** [How fast is 10 tokens per second really?](https://simonwillison.net/2026/May/20/tokens-per-second/#atom-everything) · [Google I/O, Gemini Spark, Antigravity](https://simonwillison.net/2026/May/20/google-io/#atom-everything) · [Railway: The Agent-Native Cloud — Jake Cooper](https://www.latent.space/p/railway) · [The last six months in LLMs in five minutes](https://simonwillison.net/2026/May/19/5-minute-llms/#atom-everything) · [Show HN: Rmux – A programmable terminal multiplexer with a Playwright-style SDK](https://github.com/helvesec/rmux) · [Google öffnet Android CLI für alle KI-Agenten](https://www.heise.de/news/Google-oeffnet-Android-CLI-fuer-alle-KI-Agenten-11301420.html?wt_mc=rss.red.ho.ho.atom.beitrag.beitrag) · [Google und US-Investor bauen gemeinsame Rechenzentren auf Basis von Google-TPUs](https://www.heise.de/news/Google-und-US-Investor-bauen-gemeinsame-Rechenzentren-auf-Basis-von-Google-TPUs-11299933.html?wt_mc=rss.red.ho.ho.atom.beitrag.beitrag)

---

<!-- ki-news-meta: {"v":1,"url":"https://github.com/helvesec/rmux","score":4,"quelle":"hackernews-show","titel":"Show HN: Rmux – A programmable terminal multiplexer with a Playwright-style SDK"} -->
### Show HN: Rmux – A programmable terminal multiplexer with a Playwright-style SDK

Score 4/5 · [hackernews-show](https://github.com/helvesec/rmux)

- [ ] Besonders wertvoll
- [ ] Später weiterverfolgen

**Was ist neu**
Ein Entwickler hat den Terminal-Multiplexer tmux in Rust neu gebaut und dabei eine programmatische Steuerungsschicht ergänzt. Das Projekt heisst Rmux und bietet zwei Zugangsebenen: eine tmux-kompatible Kommandozeile und ein typisiertes Rust-SDK, das auf demselben Daemon läuft. Kernversprechen: stabile Fenster-IDs und gezielte Wartebedingungen statt fragiler grep-Sleep-Skripte.

**Was es für die KI-Richtung heisst**
Terminal-Automatisierung wird zunehmend als Grundlage für Agenten-Workflows (autonome Prozessketten) gebaut – Rmux zeigt, dass der Engpass dabei die fehlende Strukturierung von Terminal-Output ist, nicht die Modellqualität.

**Build-Anker**
Starte einen Rmux-Daemon und schreibe ein SDK-Skript, das einen laufenden Prozess per Locator-Wait beobachtet – miss, wie zuverlässig das Warten auf definierte Ausgaben gegenüber einem Sleep-basierten Bash-Skript abschneidet.

> **Lies auch:** [The last six months in LLMs in five minutes](https://simonwillison.net/2026/May/19/5-minute-llms/#atom-everything) · [Google officially announces that ads will be included in AI Mode search results](https://blog.google/products/ads-commerce/google-marketing-live-search-ads/) · [Google öffnet Android CLI für alle KI-Agenten](https://www.heise.de/news/Google-oeffnet-Android-CLI-fuer-alle-KI-Agenten-11301420.html?wt_mc=rss.red.ho.ho.atom.beitrag.beitrag) · [Google und US-Investor bauen gemeinsame Rechenzentren auf Basis von Google-TPUs](https://www.heise.de/news/Google-und-US-Investor-bauen-gemeinsame-Rechenzentren-auf-Basis-von-Google-TPUs-11299933.html?wt_mc=rss.red.ho.ho.atom.beitrag.beitrag)

---

<!-- ki-news-meta: {"v":1,"url":"https://andreapivetta.com/posts/all-the-bugs-they-found.html","score":4,"quelle":"hackernews","titel":"All the bugs they found"} -->
### All the bugs they found

Score 4/5 · [hackernews](https://andreapivetta.com/posts/all-the-bugs-they-found.html)

- [ ] Besonders wertvoll
- [ ] Später weiterverfolgen

**Was ist neu**
Ein Entwickler hat seinen selbst geschriebenen WASM-Laufzeitumgebung (WebAssembly-Interpreter) namens Epsilon – rund 11 000 Zeilen Go-Code – KI-Agenten zur Sicherheitsanalyse vorgelegt. Die Agenten fanden mehrere Schwachstellen: von Denial-of-Service-Abstürzen beim Parsen bis zu echten Sandbox-Escapes, bei denen ein bösartiges WASM-Modul auf den privaten Zustand anderer Module zugreifen konnte. Ursache war u.a. eine falsche Initialisierung von Referenz-Locals (null statt 0).
*Kosten/Limits: keine Angabe im Text.*

**Was es für die KI-Richtung heisst**
KI-Agenten werden gezielt als automatisierte Code-Auditoren eingesetzt – nicht für Stil, sondern für semantisch komplexe Sicherheitslücken, die Tests nicht abdecken.

**Build-Anker**
Lass Claude Code einen Go-Codeblock mit uninitialisierten Referenz-Variablen analysieren und zähle, wie viele falsche Null-vs-Nil-Initialisierungen es in einem Durchlauf korrekt markiert.

---

<!-- ki-news-meta: {"v":1,"url":"https://www.heise.de/news/Google-oeffnet-Android-CLI-fuer-alle-KI-Agenten-11301420.html?wt_mc=rss.red.ho.ho.atom.beitrag.beitrag","score":4,"quelle":"heise","titel":"Google öffnet Android CLI für alle KI-Agenten"} -->
### Google öffnet Android CLI für alle KI-Agenten

Score 4/5 · [heise](https://www.heise.de/news/Google-oeffnet-Android-CLI-fuer-alle-KI-Agenten-11301420.html?wt_mc=rss.red.ho.ho.atom.beitrag.beitrag)

- [ ] Besonders wertvoll
- [ ] Später weiterverfolgen

**Was ist neu**
Volltext nicht verfügbar – Angaben basieren auf Teaser. Google veröffentlicht Version 1.0 von Android CLI als stabile Version. Das Werkzeug öffnet den direkten Zugang zu Android Studio für beliebige KI-Agenten, nicht nur Google-eigene.

**Was es für die KI-Richtung heisst**
Google standardisiert die Schnittstelle zwischen Agenten und Entwicklungsumgebung, statt sie proprietär zu halten – ein Schritt, der drittentwickelte Agenten gleichrangig mit eigenen behandelt. Wer Agent-Workflows auf Android-Entwicklung baut, kann sich künftig auf eine stabile API stützen, ohne Google-Abhängigkeit im Ausführungspfad.

**Build-Anker**
Verbinde Claude mit der Android CLI über die offizielle Schnittstelle und lass einen einfachen Befehl automatisiert ausführen – miss, ob die Antwortzeit unter manueller Studio-Bedienung liegt.

> **Lies auch:** [Quoting SpaceX S-1](https://simonwillison.net/2026/May/20/spacex-s1/#atom-everything) · [\[AINews\] OpenAI GPT-next disproves 80 year old Erdős planar unit distance problem for under $1000](https://www.latent.space/p/ainews-openai-gpt-next-disproves) · [How fast is 10 tokens per second really?](https://simonwillison.net/2026/May/20/tokens-per-second/#atom-everything) · [Google I/O, Gemini Spark, Antigravity](https://simonwillison.net/2026/May/20/google-io/#atom-everything) · [Railway: The Agent-Native Cloud — Jake Cooper](https://www.latent.space/p/railway) · [The last six months in LLMs in five minutes](https://simonwillison.net/2026/May/19/5-minute-llms/#atom-everything) · [Google officially announces that ads will be included in AI Mode search results](https://blog.google/products/ads-commerce/google-marketing-live-search-ads/) · [Show HN: Rmux – A programmable terminal multiplexer with a Playwright-style SDK](https://github.com/helvesec/rmux) · [Google und US-Investor bauen gemeinsame Rechenzentren auf Basis von Google-TPUs](https://www.heise.de/news/Google-und-US-Investor-bauen-gemeinsame-Rechenzentren-auf-Basis-von-Google-TPUs-11299933.html?wt_mc=rss.red.ho.ho.atom.beitrag.beitrag)

---

<!-- ki-news-meta: {"v":1,"url":"https://www.heise.de/news/Google-und-US-Investor-bauen-gemeinsame-Rechenzentren-auf-Basis-von-Google-TPUs-11299933.html?wt_mc=rss.red.ho.ho.atom.beitrag.beitrag","score":4,"quelle":"heise","titel":"Google und US-Investor bauen gemeinsame Rechenzentren auf Basis von Google-TPUs"} -->
### Google und US-Investor bauen gemeinsame Rechenzentren auf Basis von Google-TPUs

Score 4/5 · [heise](https://www.heise.de/news/Google-und-US-Investor-bauen-gemeinsame-Rechenzentren-auf-Basis-von-Google-TPUs-11299933.html?wt_mc=rss.red.ho.ho.atom.beitrag.beitrag)

- [ ] Besonders wertvoll
- [ ] Später weiterverfolgen

**Was ist neu**
Blackstone investiert 5 Milliarden US-Dollar in Rechenzentren, die auf Googles eigenen KI-Beschleunigern (TPUs – Tensor Processing Units) basieren. Google tritt damit nicht nur als Cloud-Anbieter auf, sondern als Hardware-Lieferant, der Nvidia im Rechenzentrumsgeschäft direkt herausfordert. Volltext nicht verfügbar – weitere technische Details basieren auf Teaser.

**Was es für die KI-Richtung heisst**
Google sichert sich über Blackstone einen kapitalstarken Abnehmer für TPU-Kapazitäten ausserhalb der eigenen Cloud – das verbreitert den TPU-Markt strukturell jenseits von Google Cloud. Wer heute Infrastrukturkosten für KI-Produkte kalkuliert, muss Nvidia nicht mehr als einzige Grösse einrechnen.

**Build-Anker**
Ruf über die Google Cloud Console ein TPU-gestütztes Modell-Endpoint auf und miss die Latenz im Vergleich zu einem GPU-basierten Endpunkt – siehst du einen messbaren Unterschied bei identischen Anfragen?

> **Lies auch:** [\[AINews\] OpenAI GPT-next disproves 80 year old Erdős planar unit distance problem for under $1000](https://www.latent.space/p/ainews-openai-gpt-next-disproves) · [Google I/O, Gemini Spark, Antigravity](https://simonwillison.net/2026/May/20/google-io/#atom-everything) · [Railway: The Agent-Native Cloud — Jake Cooper](https://www.latent.space/p/railway) · [The last six months in LLMs in five minutes](https://simonwillison.net/2026/May/19/5-minute-llms/#atom-everything) · [Google officially announces that ads will be included in AI Mode search results](https://blog.google/products/ads-commerce/google-marketing-live-search-ads/) · [Show HN: Rmux – A programmable terminal multiplexer with a Playwright-style SDK](https://github.com/helvesec/rmux) · [Google öffnet Android CLI für alle KI-Agenten](https://www.heise.de/news/Google-oeffnet-Android-CLI-fuer-alle-KI-Agenten-11301420.html?wt_mc=rss.red.ho.ho.atom.beitrag.beitrag)

---

