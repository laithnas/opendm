import { prisma } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";
import { automationInputSchema, exportPayloadSchema, validateActionConfig, validateConditionConfig, type AutomationInput } from "@/modules/automations/schema";
import { validateDestination, createTrackedLink, getLinksForWorkspace } from "@/modules/links/service";
import type { Prisma } from "@prisma/client";

// Automation CRUD + duplicate + export/import.
// Conditions/actions are replaced wholesale on update (small trees, keeps the
// builder simple and the schema versioned via the export format).

export async function listAutomations(workspaceId: string, opts: { status?: string; page?: number; pageSize?: number } = {}) {
  const { status, page = 1, pageSize = 25 } = opts;
  const where: Prisma.AutomationWhereInput = { workspaceId, archivedAt: null };
  if (status && status !== "ALL") where.status = status as never;
  const [items, total] = await Promise.all([
    prisma.automation.findMany({
      where,
      include: {
        actions: { orderBy: { order: "asc" } },
        _count: { select: { executions: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.automation.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

export async function getAutomation(workspaceId: string, automationId: string) {
  const automation = await prisma.automation.findFirst({
    where: { id: automationId, workspaceId },
    include: { conditions: { orderBy: { order: "asc" } }, actions: { orderBy: { order: "asc" } } },
  });
  if (!automation) throw new NotFoundError("Automation not found");
  return automation;
}

export async function createAutomation(workspaceId: string, createdById: string, input: AutomationInput) {
  const data = automationInputSchema.parse(input);
  validateChildren(data);
  return prisma.automation.create({
    data: {
      workspaceId,
      createdById,
      name: data.name.trim(),
      description: data.description ?? null,
      triggerType: data.triggerType,
      triggerConfig: data.triggerConfig as unknown as Prisma.InputJsonValue,
      status: "DRAFT",
      conditions: {
        create: data.conditions.map((c) => ({
          kind: c.kind,
          config: c.config as unknown as Prisma.InputJsonValue,
          order: c.order,
          enabled: c.enabled,
        })),
      },
      actions: {
        create: data.actions.map((a) => ({
          kind: a.kind,
          config: a.config as unknown as Prisma.InputJsonValue,
          order: a.order,
          enabled: a.enabled,
          delayMs: a.delayMs,
        })),
      },
    },
    include: { conditions: true, actions: { orderBy: { order: "asc" } } },
  });
}

export async function updateAutomation(workspaceId: string, automationId: string, input: AutomationInput) {
  const data = automationInputSchema.parse(input);
  validateChildren(data);
  const existing = await prisma.automation.findFirst({ where: { id: automationId, workspaceId } });
  if (!existing) throw new NotFoundError("Automation not found");

  // An activation requires at least one action; validate before committing.
  if (data.actions.length === 0) {
    throw new AppError("Automations need at least one action to activate", 422, "VALIDATION_ERROR");
  }

  return prisma.$transaction(async (tx) => {
    return tx.automation.update({
      where: { id: automationId },
      data: {
        name: data.name.trim(),
        description: data.description ?? null,
        triggerType: data.triggerType,
        triggerConfig: data.triggerConfig as unknown as Prisma.InputJsonValue,
        conditions: {
          deleteMany: {},
          create: data.conditions.map((c) => ({
            kind: c.kind,
            config: c.config as unknown as Prisma.InputJsonValue,
            order: c.order,
            enabled: c.enabled,
          })),
        },
        actions: {
          deleteMany: {},
          create: data.actions.map((a) => ({
            kind: a.kind,
            config: a.config as unknown as Prisma.InputJsonValue,
            order: a.order,
            enabled: a.enabled,
            delayMs: a.delayMs,
          })),
        },
      },
      include: { conditions: true, actions: { orderBy: { order: "asc" } } },
    });
  });
}

function validateChildren(data: AutomationInput): void {
  for ( const c of data.conditions) {
    try {
      validateConditionConfig(c.kind, c.config as Record<string, unknown>);
    } catch (err) {
      throw new AppError(err instanceof Error ? err.message : "Invalid condition", 422, "VALIDATION_ERROR");
    }
  }
  for ( const a of data.actions) {
    try {
      validateActionConfig(a.kind, a.config as Record<string, unknown>);
    } catch (err) {
      throw new AppError(err instanceof Error ? err.message : "Invalid action", 422, "VALIDATION_ERROR");
    }
  }
}

export async function setAutomationStatus(
  workspaceId: string,
  automationId: string,
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED",
) {
  const existing = await prisma.automation.findFirst({ where: { id: automationId, workspaceId } });
  if (!existing) throw new NotFoundError("Automation not found");
  if (status === "ARCHIVED") {
    await prisma.automation.updateMany({
      where: { id: automationId, workspaceId },
      data: { status, archivedAt: new Date() },
    });
    return;
  }
  await prisma.automation.updateMany({
    where: { id: automationId, workspaceId, archivedAt: null },
    data: { status },
  });
}

export async function duplicateAutomation(workspaceId: string, automationId: string, nameSuffix = " copy") {
  const existing = await getAutomation(workspaceId, automationId);
  const cloneName = `${existing.name}${nameSuffix}`.slice(0, 120);
  return prisma.automation.create({
    data: {
      workspaceId,
      createdById: existing.createdById,
      name: cloneName,
      description: existing.description,
      triggerType: existing.triggerType,
      triggerConfig: existing.triggerConfig as Prisma.InputJsonValue,
      status: "DRAFT",
      conditions: {
        create: existing.conditions.map((c) => ({ kind: c.kind, config: c.config as Prisma.InputJsonValue, order: c.order, enabled: c.enabled })),
      },
      actions: {
        create: existing.actions.map((a) => ({ kind: a.kind, config: a.config as Prisma.InputJsonValue, order: a.order, enabled: a.enabled, delayMs: a.delayMs })),
      },
    },
    include: { conditions: true, actions: { orderBy: { order: "asc" } } },
  });
}

// ── Export / import ────────────────────────────────────────────────────────

export async function exportAutomation(workspaceId: string, automationId: string) {
  const a = await getAutomation(workspaceId, automationId);
  return {
    schema: "leonyx.flow.automation",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    automation: {
      name: a.name,
      description: a.description,
      triggerType: a.triggerType,
      triggerConfig: a.triggerConfig,
      conditions: a.conditions.map((c) => ({ kind: c.kind, config: c.config, order: c.order, enabled: c.enabled })),
      actions: a.actions.map((x) => ({ kind: x.kind, config: x.config, order: x.order, enabled: x.enabled, delayMs: x.delayMs })),
    },
  };
}

export interface ImportResult {
  automationId: string;
  name: string;
  rewroteLinks: number;
}

/** Strict, portable import. SEND_LINK actions referencing a destination URL
 *  get a fresh tracked link in this workspace (old slugs never leak across
 *  instances). Actions referencing a slug without a destination are rejected. */
export async function importAutomation(
  workspaceId: string,
  createdById: string,
  rawPayload: unknown,
  opts: { nameOverride?: string } = {},
): Promise<ImportResult> {
  const parsed = exportPayloadSchema.parse(rawPayload); // throws on invalid
  const input = parsed.automation;
  if (opts.nameOverride) input.name = opts.nameOverride;

  // Re-link SEND_LINK actions.
  const existingLinks = new Map((await getLinksForWorkspace(workspaceId)).map((l) => [l.slug, l]));
  let rewroteLinks = 0;
  const actions: AutomationInput["actions"] = [];
  for (const action of input.actions) {
    if (action.kind === "SEND_LINK") {
      const config = action.config as Record<string, unknown>;
      const slug = typeof config.linkSlug === "string" ? config.linkSlug : "";
      const destination = typeof config.linkDestination === "string" ? config.linkDestination : "";
      const name = typeof config.linkName === "string" ? config.linkName : "Imported link";
      if (slug && existingLinks.has(slug)) {
        config.linkDestination = undefined;
        actions.push({ ...action, config });
        continue;
      }
      if (destination) {
        // Create a fresh tracked link in the importing workspace.
        validateDestination(destination);
        const link = await createTrackedLink({
          workspaceId,
          name,
          destination,
          createdById: createdById ?? null,
        });
        config.linkSlug = link.slug;
        config.linkDestination = undefined;
        rewroteLinks++;
        actions.push({ ...action, config });
        continue;
      }
      throw new AppError(
        `Action "${action.kind}" references link slug "${slug}" that does not exist here — export it with a destination URL to make it portable`,
        422,
        "IMPORT_LINK_MISSING",
      );
    }
    actions.push(action);
  }

  const created = await createAutomation(workspaceId, createdById, { ...input, actions });
  return { automationId: created.id, name: created.name, rewroteLinks };
}

export async function getAutomationStats(workspaceId: string, automationId: string) {
  const [executions, clicks] = await Promise.all([
    prisma.execution.groupBy({
      by: ["status"],
      where: { workspaceId, automationId },
      _count: { _all: true },
    }),
    prisma.linkClick.count({ where: { workspaceId } }),
  ]);
  const links = await prisma.trackedLink.findMany({ where: { workspaceId, automationId }, select: { id: true } });
  const linkIds = links.map((l) => l.id);
  const clicksByLink = linkIds.length
    ? await prisma.linkClick.groupBy({ by: ["linkId"], where: { workspaceId, linkId: { in: linkIds } }, _count: { _all: true } })
    : [];
  return { executions, clicks: { total: clicks }, clicksByLink };
}