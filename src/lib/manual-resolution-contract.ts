// Reiner Vertrag des manuellen Prozessabschlusses: Konstanten und Typen, OHNE
// DB-Zugriff. Bewusst getrennt von manual-resolution.ts, damit die
// Client-Komponente (ELYTRA-Formular) und die API-Route dieselben Werte nutzen
// koennen, ohne den postgres-Client ins Browser-Bundle zu ziehen.
//
// Bedeutung der Felder siehe manual-resolution.ts -- dort liegt die Logik und
// die ausfuehrliche Rollenklarstellung (Self-Request vs. Kundenmeldung).

// Erkenntnisquelle: WORAUF das Ergebnis beruht. Bewusst getrennt vom reason,
// der sagt, WIE der Status zustande kam (resolved_manual).
export const MANUAL_KNOWLEDGE_SOURCES = ["self_document", "customer_report", "other"] as const;
export type ManualKnowledgeSource = (typeof MANUAL_KNOWLEDGE_SOURCES)[number];

// Genau die drei existierenden Terminalstatus. Die process_status-Enum kennt
// kein "rejected" -- bewusst NICHT auf Vorrat eingefuehrt.
export const MANUAL_TERMINAL_STATUSES = ["success", "no_data_held", "blacklisted"] as const;
export type ManualTerminalStatus = (typeof MANUAL_TERMINAL_STATUSES)[number];

export const MANUAL_RESOLUTION_REASON = "resolved_manual";
