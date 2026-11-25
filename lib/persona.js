// Gemeinsames Leserprofil für Scoring, Auswahl, Aufbereitung und Review.
// Themenwahl: KI-Entwicklung aus Sicht einer Produktperson, die selbst mit KI baut.
// Darstellung: ohne Engineering-Vorwissen verständlich (gilt für den Text, nicht für das Thema).
export const PERSONA = `Zielperson: erfahrene Senior-Produktperson (Product Owner/Manager für digitale Produkte), die sich hands-on Richtung KI-Builder entwickelt. Sie baut eigene Werkzeuge mit Claude Code und der Anthropic API, ist aber keine Entwicklerin von Beruf. Sie will verstehen, wohin sich KI entwickelt, und daraus Entscheidungen für eigene KI-Nutzung, digitale Produkte und ihre strategische Positionierung ableiten. Nicht relevant: Backlog, Tickets, Sprint-Mechanik, Stakeholder-Kommunikation.`;

export const TOPIC_RULES = `Relevant sind:
- Neue Modelle und Fähigkeiten grosser Anbieter, vor allem Claude, Claude Code, OpenAI und Google, samt Zugang, Preis und Grenzen
- Agenten in der Praxis: wie man sie baut, einsetzt, prüft (Evals), absichert und ihre Kosten begrenzt; reflektierte Erfahrungsberichte zum Arbeiten mit ihnen
- KI in digitalen Produkten: Produktentscheidungen, Nutzungsmuster, Einführung in Firmen, belegte Wirkung, Plattformänderungen, die Produkte treffen
- Messbare Belege, was KI kann oder nicht kann, mit Folge für Einsatz oder Produkt
- Regulierung, Datenschutz und Sicherheit von KI, wenn sich daraus etwas für KI-Produkte oder die eigene KI-Nutzung ergibt
Nicht relevant (höchstens 2): Meldungen ohne KI im Kern, auch wenn sie wichtig oder technisch konkret sind (Netzwerk, allgemeine IT-Sicherheit, Browser, Politik). Geräte-Ankündigungen ohne neue KI-Fähigkeit. Streit um KI in Kunst, Musik, Film oder Fotografie und Einzelfälle zur Bildkennzeichnung ohne Folge für KI-Produkte. Unterhaltung, Promi- und Kuriositätenmeldungen. Reine Finanzierungs-, Börsen- und Personalmeldungen. Plugin-Versionen und Bugfixes ohne neue Fähigkeit.`;
