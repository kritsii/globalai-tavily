import { z } from "zod";

export const BriefInputSchema = z.object({
  investor: z.string().trim().min(1),
  meetingAt: z.iso.datetime(),
  meetingType: z.string().trim().min(1),
  startup: z.object({
    oneLiner: z.string().trim().min(1),
    sector: z.string().trim().min(1),
    stage: z.string().trim().min(1),
    raiseSize: z.string().trim().min(1),
  }),
});

export type BriefInput = z.infer<typeof BriefInputSchema>;

export const CandidateSchema = z.object({
  type: z.enum(["firm", "partner", "other"]),
  name: z.string().trim().min(1),
  officialDomain: z.string().trim().min(1),
  descriptor: z.string().trim().min(1),
  matchScore: z.number().min(0).max(1),
}).strict();

export type Candidate = z.infer<typeof CandidateSchema>;

export const SourceTypeSchema = z.enum(["primary", "news", "aggregator"]);

export const SourceSchema = z.object({
  id: z.string().min(1),
  url: z.string().url(),
  title: z.string().trim().min(1),
  publishedAt: z.string().nullable(),
  domain: z.string().trim().min(1),
  sourceType: SourceTypeSchema,
  snippet: z.string().trim().min(1),
});

export type Source = z.infer<typeof SourceSchema>;
export type SourceType = z.infer<typeof SourceTypeSchema>;

export const FactSchema = z.object({
  id: z.string().min(1),
  claim: z.string().trim().min(1),
  sourceIds: z.array(z.string().min(1)).min(1),
  date: z.string().nullable(),
});

export type Fact = z.infer<typeof FactSchema>;

export const BriefSectionItemSchema = z.object({
  text: z.string().trim().min(1),
  citations: z.array(z.string().min(1)).min(1),
});

export type BriefSectionItem = z.infer<typeof BriefSectionItemSchema>;

export const BriefSectionSchema = z.object({
  title: z.string().trim().min(1),
  items: z.array(BriefSectionItemSchema),
});

export type BriefSection = z.infer<typeof BriefSectionSchema>;

export const GapSchema = z.object({
  topic: z.string().trim().min(1),
  description: z.string().trim().min(1),
});

export type Gap = z.infer<typeof GapSchema>;

export const BriefSchema = z.object({
  title: z.string().trim().min(1),
  sections: z.array(BriefSectionSchema),
  sources: z.array(SourceSchema),
  gaps: z.array(GapSchema),
});

export type Brief = z.infer<typeof BriefSchema>;

export const RunStatsSchema = z.object({
  models: z.array(z.string().min(1)),
  tokens: z.object({
    input: z.number().int().nonnegative(),
    output: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
  costEstimate: z.number().nonnegative().nullable(),
  latencyMs: z.number().nonnegative(),
  fallbacks: z.number().int().nonnegative(),
  cacheHits: z.number().int().nonnegative(),
  droppedClaims: z.number().int().nonnegative(),
});

export type RunStats = z.infer<typeof RunStatsSchema>;
