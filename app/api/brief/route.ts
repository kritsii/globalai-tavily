import { z } from "zod";
import { extractFacts } from "@/lib/pipeline/extract";
import { finalizeBrief } from "@/lib/pipeline/finalize";
import { planSearchQueries } from "@/lib/pipeline/plan";
import { research } from "@/lib/pipeline/research";
import { synthesizeBrief } from "@/lib/pipeline/synthesize";
import { verifyBrief } from "@/lib/pipeline/verify";
import { createRunStats } from "@/lib/llm";
import { BriefInputSchema, CandidateSchema } from "@/types";

const RequestSchema = z.object({
  candidate: CandidateSchema,
  briefInput: BriefInputSchema,
});

class BudgetExceededError extends Error {
  constructor(
    readonly usedTokens: number,
    readonly budgetTokens: number,
  ) {
    super(`Brief token budget exceeded (${usedTokens}/${budgetTokens}).`);
    this.name = "BudgetExceededError";
  }
}

function readTokenBudget(): number {
  const rawBudget = process.env.BRIEF_BUDGET_MAX_TOKENS;
  if (!rawBudget || !/^[1-9]\d*$/.test(rawBudget)) {
    throw new Error(
      "BRIEF_BUDGET_MAX_TOKENS must be set to a positive integer.",
    );
  }

  const budget = Number(rawBudget);
  if (!Number.isSafeInteger(budget)) {
    throw new Error("BRIEF_BUDGET_MAX_TOKENS is outside the safe integer range.");
  }
  return budget;
}

function eventFrame(event: string, payload: unknown): Uint8Array {
  return new TextEncoder().encode(
    `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`,
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsedRequest = RequestSchema.safeParse(body);
  if (!parsedRequest.success) {
    return Response.json(
      {
        error: "Provide a candidate and valid briefInput.",
        details: parsedRequest.error.flatten(),
      },
      { status: 400 },
    );
  }

  let budgetTokens: number;
  try {
    budgetTokens = readTokenBudget();
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Invalid token budget configuration.",
      },
      { status: 500 },
    );
  }

  const { candidate, briefInput } = parsedRequest.data;
  const runContext = { candidate, briefInput };
  const stats = createRunStats();
  let cancelled = false;
  request.signal.addEventListener("abort", () => {
    cancelled = true;
  }, { once: true });

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, payload: unknown) => {
        if (cancelled) return;
        try {
          controller.enqueue(eventFrame(event, payload));
        } catch {
          cancelled = true;
        }
      };

      const checkBudget = () => {
        if (stats.tokens.total > budgetTokens) {
          throw new BudgetExceededError(stats.tokens.total, budgetTokens);
        }
      };

      const run = async () => {
        let stage = "plan";
        try {
          send("progress", { stage });
          const plan = await planSearchQueries(
            runContext.candidate,
            runContext.briefInput,
            stats,
          );
          if (cancelled) return;
          checkBudget();
          send("progress", { stage, queryCount: plan.queries.length });

          stage = "research";
          send("progress", { stage });
          const researchResult = await research(
            plan,
            runContext.briefInput.meetingAt,
            runContext.candidate,
          );
          if (cancelled) return;
          send("progress", {
            stage,
            sourceCount: researchResult.sources.length,
            stale: researchResult.stale,
          });

          stage = "extract";
          send("progress", { stage, sourceCount: researchResult.sources.length });
          const facts = await extractFacts(
            researchResult.sources,
            runContext.candidate,
            stats,
          );
          if (cancelled) return;
          checkBudget();
          send("progress", { stage, factCount: facts.length });

          stage = "synthesize";
          send("progress", { stage, factCount: facts.length });
          const synthesized = await synthesizeBrief(
            facts,
            researchResult.sources,
            runContext.briefInput,
            runContext.candidate,
            stats,
          );
          if (cancelled) return;
          checkBudget();
          send("progress", { stage });

          stage = "verify";
          send("progress", { stage });
          const cleanedBrief = await verifyBrief(
            synthesized,
            facts,
            researchResult.sources,
            runContext.candidate,
            runContext.briefInput.meetingAt,
            stats,
            runContext.briefInput,
          );
          if (cancelled) return;
          checkBudget();
          send("progress", {
            stage,
            droppedClaims: stats.droppedClaims.length,
          });

          stage = "finalize";
          send("progress", { stage });
          const brief = finalizeBrief(cleanedBrief, facts, researchResult);
          send("complete", { brief, stats });
        } catch (error) {
          if (cancelled) return;
          if (error instanceof BudgetExceededError) {
            send("error", {
              code: "BUDGET_EXCEEDED",
              stage,
              error: error.message,
              stats,
            });
          } else {
            console.error(`Brief generation failed during ${stage}:`, error);
            send("error", {
              code: "BRIEF_GENERATION_FAILED",
              stage,
              error: "Brief generation failed.",
              stats,
            });
          }
        } finally {
          if (!cancelled) {
            try {
              controller.close();
            } catch {
              cancelled = true;
            }
          }
        }
      };

      void run();
    },
    cancel() {
      cancelled = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
