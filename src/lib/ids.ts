import { createId, init } from "@paralleldrive/cuid2";

export { createId };

// Kuerzerer 16-Zeichen-cuid2 fuer process_token in Reply-Adressen.
// 36^16 ~ 8e24 Moeglichkeiten -- kollisionsfest auf jeder relevanten Skala.
export const createProcessToken = init({ length: 16 });
