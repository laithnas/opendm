// Central product configuration. Everything brandable lives here so the
// product can be renamed/white-labeled without touching layout code.

export const product = {
  /** Product name. Change to rename the product everywhere. */
  name: process.env.APP_NAME?.trim() || "Leonyx Flow",
  /** Short tagline used on the landing page and emails. */
  tagline: "Own your social automations.",
  /** Company / vendor name. */
  company: process.env.COMPANY_NAME?.trim() || "Leonyx AI",
  /** Public logo URL. Empty = rendered brand mark. */
  logoUrl: process.env.LOGO_URL?.trim() || "",
  links: {
    site: "https://www.leonyx-ai.com/",
    github: "https://github.com/laithnas/leonyx-flow",
  },
} as const;

export const isDemoMode = () => process.env.DEMO_MODE === "true";

/** Meta messaging window: how long after the last inbound user message a
 *  business message is allowed. Instagram business messaging rules. */
export const MESSAGING_WINDOW_HOURS = 24 * 7;

/** Maximum CTA (quick reply) buttons attached to a single DM. */
export const MAX_CTA_BUTTONS = 3;

/** Max length for DM/comment text (Meta API bound is 1000 chars). */
export const MAX_MESSAGE_LENGTH = 1000;

export const PAGINATION_PAGE_SIZE = 25;