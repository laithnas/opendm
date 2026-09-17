// Variable interpolation for message templates.
//
// Supported variables (documented in the UI and docs/automation-engine.md):
//   {{username}}   — commenter/DM sender handle (without @)
//   {{name}}       — display name when the provider supplies it
//   {{comment}}    — the triggering comment/message text
//   {{keyword}}    — the keyword that matched (when one matched)
//   {{link}}       — tracked link URL when the action carries one
//   {{workspace}}  — workspace name

export interface RenderContext {
  username?: string | null;
  name?: string | null;
  comment?: string | null;
  keyword?: string | null;
  link?: string | null;
  workspace?: string | null;
}

export function renderTemplate(template: string, ctx: RenderContext): string {
  return template
    .replace(/\{\{\s*username\s*\}\}/gi, safe(ctx.username))
    .replace(/\{\{\s*name\s*\}\}/gi, safe(ctx.name))
    .replace(/\{\{\s*comment\s*\}\}/gi, safe(ctx.comment))
    .replace(/\{\{\s*keyword\s*\}\}/gi, safe(ctx.keyword))
    .replace(/\{\{\s*link\s*\}\}/gi, safe(ctx.link))
    .replace(/\{\{\s*workspace\s*\}\}/gi, safe(ctx.workspace));
}

function safe(value: string | null | undefined): string {
  return value ?? "";
}

export function uniqueVariables(template: string): string[] {
  const vars = new Set<string>();
  const re = /\{\{\s*([a-z_]+)\s*\}\}/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    const name = m[1] ? m[1].toLowerCase() : "";
    if (name) vars.add(name);
  }
  return [...vars];
}