import { apiRoute, json } from "@/lib/api";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";

export const GET = apiRoute({
  workspace: true,
  handler: async (ctx) => {
    const execution = await prisma.execution.findFirst({
      where: { id: ctx.params.executionId!, workspaceId: ctx.workspace!.workspaceId },
      include: {
        automation: { select: { id: true, name: true } },
        contact: { select: { id: true, username: true, name: true } },
        steps: { orderBy: { order: "asc" } },
        webhookDeliveries: { orderBy: { createdAt: "desc" } },
      },
    });
    // Always include email-visible data; never raw token fields.
    const contacts = execution?.contact
      ? await prisma.interaction.findMany({
          where: { contactId: execution.contact.id, workspaceId: ctx.workspace!.workspaceId },
          orderBy: { occurredAt: "desc" },
          take: 30,
        })
      : [];
    if (!execution) throw new NotFoundError("Execution not found");
    return json({ execution, interactions: contacts });
  },
});