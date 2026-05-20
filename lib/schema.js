import { z } from 'zod';

// Strikte Validierung an den Phasen-Übergängen.
// Unbekannte Felder werden bewusst durchgereicht (Adapter dürfen Extras anhängen).

export const ArticleSchema = z.object({
  titel: z.string().min(1),
  url: z.string().url(),
  datum: z.string().nullable().optional(),
  quelle: z.string().min(1),
  rohtext: z.string().default(''),
  truncated: z.boolean().optional(),
  pricing_signal_found: z.boolean().optional(),
}).passthrough();

export const ScoredArticleSchema = ArticleSchema.extend({
  score: z.number().min(1).max(5).nullable(),
  begründung: z.string().nullable(),
  strategy_only: z.boolean().optional(),
  dedup_penalty: z.boolean().optional(),
  dedup_of: z.string().optional(),
  cluster_bonus: z.boolean().optional(),
  cluster_anchor: z.string().optional(),
});

export const ArticleArraySchema = z.array(ArticleSchema);
export const ScoredArticleArraySchema = z.array(ScoredArticleSchema);

export function parseArticles(raw) {
  const result = ArticleArraySchema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new Error(`articles-*.json validiert nicht: ${first.path.join('.')} – ${first.message}`);
  }
  return result.data;
}

export function parseScoredArticles(raw) {
  const result = ScoredArticleArraySchema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new Error(`scored-*.json validiert nicht: ${first.path.join('.')} – ${first.message}`);
  }
  return result.data;
}
