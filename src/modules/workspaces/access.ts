import { prisma } from "@/lib/db";
import { AppError, ConflictError, NotFoundError } from "@/lib/errors";
import { randomCode } from "@/lib/ids";
import type { Prisma, WorkspaceMember, WorkspaceRole } from "@prisma/client";

// Workspace access control. Every workspace-scoped operation must go through
// getMembership (or requireWorkspaceRole) — this is the tenant boundary.
//
// NOTE: `WorkspaceContext.id` is the MEMBERSHIP row id. Use `.workspaceId`
// for the workspace id — `.id` on the union resolves to the member row.

export type WorkspaceContext = WorkspaceMember & {
  workspace: { id: string; name: string; slug: string; settings: Prisma.JsonValue };
  workspaceId: string;
};

export async function getMembership(userId: string, workspaceId: string): Promise<WorkspaceContext | null> {
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    include: { workspace: { select: { id: true, name: true, slug: true, settings: true } } },
  });
  if (!member) return null;
  return { ...member, workspaceId: member.workspaceId } as WorkspaceContext;
}

export async function requireWorkspaceRole(
  userId: string,
  workspaceId: string,
  roles: WorkspaceRole[],
): Promise<WorkspaceContext> {
  const member = await getMembership(userId, workspaceId);
  if (!member) throw new AppError("Not a member of this workspace", 403, "NOT_IN_WORKSPACE");
  if (!roles.includes(member.role)) {
    throw new AppError("You do not have permission for this action", 403, "FORBIDDEN");
  }
  return member;
}

export async function listUserWorkspaces(userId: string) {
  return prisma.workspaceMember.findMany({
    where: { userId },
    include: { workspace: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function createWorkspace(
  userId: string,
  input: { name: string },
): Promise<{ workspaceId: string }> {
  const name = input.name.trim();
  if (!name) throw new AppError("Workspace name is required", 422, "VALIDATION_ERROR");
  const slug = await uniqueSlug(name);
  const workspace = await prisma.workspace.create({
    data: {
      name,
      slug,
      members: { create: { userId, role: "OWNER" } },
    },
  });
  return { workspaceId: workspace.id };
}

async function uniqueSlug(name: string): Promise<string> {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "workspace";
  let slug = base;
  let n = 1;
  // Loop with tiny tolerance; collisions on fresh name are improbable.
  while (n < 5) {
    const existing = await prisma.workspace.findUnique({ where: { slug } });
    if (!existing) return slug;
    slug = `${base}-${n++}`;
  }
  return `${base}-${randomCode(4)}`;
}

export async function renameWorkspace(workspaceId: string, name: string): Promise<void> {
  await prisma.workspace.update({ where: { id: workspaceId }, data: { name: name.trim() } });
}

// ── Members / invites ─────────────────────────────────────────────────────

export async function inviteMember(
  actorId: string,
  workspace: WorkspaceContext,
  input: { email: string; role: WorkspaceRole },
): Promise<void> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new AppError("Invalid email address", 422, "VALIDATION_ERROR");
  }
  const existing = await prisma.invite.findUnique({
    where: { workspaceId_email: { workspaceId: workspace.workspaceId, email } },
  });
  if (existing && existing.status === "PENDING") {
    throw new ConflictError("An invitation for this email is already pending");
  }
  // If the user is already a member, do not re-invite.
  const memberUser = await prisma.user.findUnique({ where: { email } });
  if (memberUser) {
    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: workspace.workspaceId, userId: memberUser.id } },
    });
    if (member) throw new ConflictError("This user is already a member");
  }
  await prisma.invite.upsert({
    where: { workspaceId_email: { workspaceId: workspace.workspaceId, email } },
    create: {
      workspaceId: workspace.workspaceId,
      email,
      role: input.role,
      token: randomCode(32),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      invitedById: actorId,
    },
    update: {
      token: randomCode(32),
      role: input.role,
      status: "PENDING",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      acceptedAt: null,
      invitedById: actorId,
    },
  });
}

export async function acceptInvite(token: string, userId: string): Promise<{ workspaceId: string }> {
  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite) throw new NotFoundError("Invitation not found");
  if (invite.status !== "PENDING") throw new AppError("Invitation already used", 409, "INVITE_USED");
  if (invite.expiresAt < new Date()) throw new AppError("Invitation expired", 410, "INVITE_EXPIRED");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.email.toLowerCase() !== invite.email.toLowerCase()) {
    throw new AppError("This invitation was issued to a different email", 403, "INVITE_EMAIL_MISMATCH");
  }
  await prisma.$transaction([
    prisma.invite.update({ where: { id: invite.id }, data: { status: "ACCEPTED", acceptedAt: new Date() } }),
    prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId } },
      create: { workspaceId: invite.workspaceId, userId, role: invite.role },
      update: {},
    }),
  ]);
  return { workspaceId: invite.workspaceId };
}

export async function listMembers(workspaceId: string) {
  return prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: { user: { select: { id: true, email: true, name: true, image: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function listInvites(workspaceId: string) {
  return prisma.invite.findMany({
    where: { workspaceId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
}

export async function updateMemberRole(
  actorId: string,
  workspaceId: string,
  memberId: string,
  role: WorkspaceRole,
): Promise<void> {
  const target = await prisma.workspaceMember.findUnique({ where: { id: memberId } });
  if (!target || target.workspaceId !== workspaceId) throw new NotFoundError("Member not found");
  if (target.userId === actorId) throw new AppError("You cannot change your own role", 422, "VALIDATION_ERROR");
  if (target.role === "OWNER") throw new AppError("Cannot change the owner's role", 422, "VALIDATION_ERROR");
  await prisma.workspaceMember.update({ where: { id: memberId }, data: { role } });
}

export async function removeMember(actorId: string, workspaceId: string, memberId: string): Promise<void> {
  const target = await prisma.workspaceMember.findUnique({ where: { id: memberId } });
  if (!target || target.workspaceId !== workspaceId) throw new NotFoundError("Member not found");
  if (target.userId === actorId) throw new AppError("You cannot remove yourself", 422, "VALIDATION_ERROR");
  if (target.role === "OWNER") throw new AppError("Cannot remove the owner", 422, "VALIDATION_ERROR");
  await prisma.workspaceMember.delete({ where: { id: memberId } });
}

export async function revokeInvite(workspaceId: string, inviteId: string): Promise<void> {
  await prisma.invite.updateMany({
    where: { id: inviteId, workspaceId },
    data: { status: "REVOKED" },
  });
}