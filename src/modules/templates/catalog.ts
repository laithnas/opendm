// Automation templates — instantiate editable automations.
// Same portable shape as the export/import payload so templates are just
// local exports. Community templates can be shared as JSON files.

import type { ExportPayload } from "@/modules/automations/schema";

export interface TemplateMeta {
  id: string;
  name: string;
  description: string;
  category: "lead-gen" | "sales" | "content" | "local" | "agency";
  triggerLabel: string;
}

export interface Template extends TemplateMeta {
  payload: ExportPayload;
}

function t(
  id: string,
  meta: Omit<TemplateMeta, "id">,
  automation: ExportPayload["automation"],
): Template {
  return {
    id,
    ...meta,
    payload: {
      schema: "leonyx.flow.automation",
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      automation,
    },
  };
}

export const templates: Template[] = [
  t("send-the-link", {
    name: "Send the link",
    description: "Whenever someone comments a keyword, send them a DM with your tracked link.",
    category: "lead-gen",
    triggerLabel: "Comment contains keyword",
  }, {
    name: "Send the link",
    description: "Replies to keyword comments with a tracked link in DMs.",
    triggerType: "COMMENT",
    triggerConfig: {},
    conditions: [
      { kind: "KEYWORD_MATCH", config: { keywords: ["link"], matchAny: false, caseInsensitive: true, wholeWord: true }, order: 0, enabled: true },
    ],
    actions: [
      { kind: "PUBLIC_REPLY", config: { text: "Sent it 👊" }, order: 0, enabled: true, delayMs: 0 },
      { kind: "SEND_LINK", config: { text: "Here you go {{username}} — everything you asked for: {{link}}", linkName: "Resource link", linkDestination: "https://example.com/resource" }, order: 1, enabled: true, delayMs: 0 },
      { kind: "ADD_TAG", config: { tag: "Link Request" }, order: 2, enabled: true, delayMs: 0 },
    ],
  }),

  t("lead-magnet", {
    name: "Lead magnet",
    description: "Keyword comment → DM with lead magnet link, tagged as a lead.",
    category: "lead-gen",
    triggerLabel: "Comment contains keyword",
  }, {
    name: "Lead magnet",
    description: "Delivers a lead magnet and tags the contact.",
    triggerType: "COMMENT",
    triggerConfig: {},
    conditions: [
      { kind: "KEYWORD_MATCH", config: { keywords: ["guide", "checklist", "pdf"], matchAny: true, caseInsensitive: true, wholeWord: true }, order: 0, enabled: true },
    ],
    actions: [
      { kind: "PUBLIC_REPLY", config: { text: "Check your DMs 👀" }, order: 0, enabled: true, delayMs: 0 },
      { kind: "SEND_LINK", config: { text: "Hey {{username}}, here's your free guide: {{link}}\n\nEnjoy!" }, order: 1, enabled: true, delayMs: 0 },
      { kind: "ADD_TAG", config: { tag: "Lead Magnet" }, order: 2, enabled: true, delayMs: 0 },
    ],
  }),

  t("comment-guide", {
    name: "Comment GUIDE",
    description: "Classic comment-to-DM: anyone commenting exactly “GUIDE” gets the guide in DMs.",
    category: "lead-gen",
    triggerLabel: "Comment contains “GUIDE”",
  }, {
    name: "Comment GUIDE",
    description: "The classic GUIDE automation.",
    triggerType: "COMMENT",
    triggerConfig: {},
    conditions: [
      { kind: "KEYWORD_MATCH", config: { keywords: ["GUIDE"], matchAny: false, caseInsensitive: true, wholeWord: true }, order: 0, enabled: true },
    ],
    actions: [
      { kind: "PUBLIC_REPLY", config: { text: "Sent! Check your DMs 👊" }, order: 0, enabled: true, delayMs: 0 },
      { kind: "SEND_DM", config: { text: "Hey {{username}} — here's the guide you asked for: {{link}}", ctaButtons: [{ title: "Get the guide" }] }, order: 1, enabled: true, delayMs: 0 },
      { kind: "ADD_TAG", config: { tag: "Guide Lead" }, order: 2, enabled: true, delayMs: 0 },
      { kind: "DELAY", config: { ms: 3600000 }, order: 3, enabled: false, delayMs: 3600000 },
      { kind: "SEND_DM", config: { text: "Did you get a chance to check out the guide? Happy to answer questions!" }, order: 4, enabled: false, delayMs: 0 },
    ],
  }),

  t("comment-price", {
    name: "Comment PRICE",
    description: "Reply with pricing in DMs when someone comments PRICE.",
    category: "sales",
    triggerLabel: "Comment contains “PRICE”",
  }, {
    name: "Comment PRICE",
    description: "Sends pricing details to interested commenters.",
    triggerType: "COMMENT",
    triggerConfig: {},
    conditions: [
      { kind: "KEYWORD_MATCH", config: { keywords: ["PRICE", "COST", "HOW MUCH"], matchAny: true, caseInsensitive: true, wholeWord: true }, order: 0, enabled: true },
    ],
    actions: [
      { kind: "PUBLIC_REPLY", config: { text: "Pricing coming your way 💬" }, order: 0, enabled: true, delayMs: 0 },
      { kind: "SEND_DM", config: { text: "Hi {{username}}! Here's our pricing: {{link}}\n\nWant me to walk you through the options?" }, order: 1, enabled: true, delayMs: 0 },
      { kind: "ADD_TAG", config: { tag: "Price Inquiry" }, order: 2, enabled: true, delayMs: 0 },
    ],
  }),

  t("story-keyword-reply", {
    name: "Story keyword reply",
    description: "Auto-reply to story replies containing a keyword.",
    category: "lead-gen",
    triggerLabel: "Story reply contains keyword",
  }, {
    name: "Story keyword reply",
    description: "Responds to story replies with a keyword.",
    triggerType: "STORY_REPLY",
    triggerConfig: {},
    conditions: [
      { kind: "KEYWORD_MATCH", config: { keywords: ["YES", "ME"], matchAny: true, caseInsensitive: true, wholeWord: true }, order: 0, enabled: true },
    ],
    actions: [
      { kind: "SEND_DM", config: { text: "Awesome {{username}} — here's the link: {{link}}" }, order: 0, enabled: true, delayMs: 0 },
      { kind: "ADD_TAG", config: { tag: "Story Reply" }, order: 1, enabled: true, delayMs: 0 },
    ],
  }),

  t("product-launch", {
    name: "Product launch",
    description: "Capture launch interest from comments and route them to your waitlist.",
    category: "sales",
    triggerLabel: "Comment contains launch keywords",
  }, {
    name: "Product launch",
    description: "Launches: keyword comments get the waitlist link.",
    triggerType: "COMMENT",
    triggerConfig: {},
    conditions: [
      { kind: "KEYWORD_MATCH", config: { keywords: ["LAUNCH", "WAITLIST", "INTERESTED"], matchAny: true, caseInsensitive: true, wholeWord: false }, order: 0, enabled: true },
    ],
    actions: [
      { kind: "PUBLIC_REPLY", config: { text: "We love the hype! 🔥" }, order: 0, enabled: true, delayMs: 0 },
      { kind: "SEND_LINK", config: { text: "{{username}}, join the waitlist here: {{link}}", linkName: "Waitlist", linkDestination: "https://example.com/waitlist" }, order: 1, enabled: true, delayMs: 0 },
      { kind: "ADD_TAG", config: { tag: "Launch Interest" }, order: 2, enabled: true, delayMs: 0 },
      { kind: "CALL_WEBHOOK", config: { url: "https://example.com/hooks/leonyx" }, order: 3, enabled: false, delayMs: 0 },
    ],
  }),

  t("webinar-registration", {
    name: "Webinar registration",
    description: "Keyword commenters get the webinar signup link and a tag for follow-up.",
    category: "lead-gen",
    triggerLabel: "Comment contains webinar keywords",
  }, {
    name: "Webinar registration",
    description: "Sends webinar signup links to interested commenters.",
    triggerType: "COMMENT",
    triggerConfig: {},
    conditions: [
      { kind: "KEYWORD_MATCH", config: { keywords: ["WEBINAR", "REGISTER", "SIGN UP"], matchAny: true, caseInsensitive: true, wholeWord: false }, order: 0, enabled: true },
    ],
    actions: [
      { kind: "PUBLIC_REPLY", config: { text: "Registration is open — check DMs!" }, order: 0, enabled: true, delayMs: 0 },
      { kind: "SEND_LINK", config: { text: "Register for the webinar here: {{link}}", linkName: "Webinar signup", linkDestination: "https://example.com/webinar" }, order: 1, enabled: true, delayMs: 0 },
      { kind: "ADD_TAG", config: { tag: "Webinar Lead" }, order: 2, enabled: true, delayMs: 0 },
    ],
  }),

  t("real-estate-listing", {
    name: "Real estate listing",
    description: "Send listing details to anyone commenting on a property post.",
    category: "local",
    triggerLabel: "Comment on selected post",
  }, {
    name: "Real estate listing",
    description: "Listing details for property post comments.",
    triggerType: "COMMENT",
    triggerConfig: {},
    conditions: [
      { kind: "POST_MATCH", config: { postSelection: "any", postRef: null }, order: 0, enabled: true },
      { kind: "KEYWORD_MATCH", config: { keywords: ["PRICE", "INFO", "DETAILS", "MORE"], matchAny: true, caseInsensitive: true, wholeWord: false }, order: 1, enabled: true },
    ],
    actions: [
      { kind: "PUBLIC_REPLY", config: { text: "Listing details sent 📩" }, order: 0, enabled: true, delayMs: 0 },
      { kind: "SEND_LINK", config: { text: "Here's the full listing: {{link}}", linkName: "Listing", linkDestination: "https://example.com/listing" }, order: 1, enabled: true, delayMs: 0 },
      { kind: "ADD_TAG", config: { tag: "Real Estate" }, order: 2, enabled: true, delayMs: 0 },
    ],
  }),

  t("restaurant-promotion", {
    name: "Restaurant promotion",
    description: "Commenters get a promo code or reservation link for your restaurant.",
    category: "local",
    triggerLabel: "Comment contains promo keywords",
  }, {
    name: "Restaurant promotion",
    description: "Sends promo codes and reservation links.",
    triggerType: "COMMENT",
    triggerConfig: {},
    conditions: [
      { kind: "KEYWORD_MATCH", config: { keywords: ["MENU", "PROMO", "DISCOUNT", "RESERVE"], matchAny: true, caseInsensitive: true, wholeWord: false }, order: 0, enabled: true },
    ],
    actions: [
      { kind: "PUBLIC_REPLY", config: { text: "Check your DMs for the code! 🍽️" }, order: 0, enabled: true, delayMs: 0 },
      { kind: "SEND_DM", config: { text: "Hey {{username}}! Use code LEO10 for 10% off — reserve here: {{link}}" }, order: 1, enabled: true, delayMs: 0 },
      { kind: "ADD_TAG", config: { tag: "Dining Promo" }, order: 2, enabled: true, delayMs: 0 },
    ],
  }),

  t("agency-lead-gen", {
    name: "Agency lead generation",
    description: "Capture inbound agency interest and forward it to your CRM via webhook.",
    category: "agency",
    triggerLabel: "DM contains agency keywords",
  }, {
    name: "Agency lead generation",
    description: "Routes interested DMs to your CRM webhook and tags them.",
    triggerType: "DM",
    triggerConfig: {},
    conditions: [
      { kind: "KEYWORD_MATCH", config: { keywords: ["PRICING", "PACKAGE", "WORK WITH", "AGENCY", "HELP"], matchAny: true, caseInsensitive: true, wholeWord: false }, order: 0, enabled: true },
      { kind: "EXCLUDE_KEYWORDS", config: { keywords: ["no thanks", "not interested"], matchAny: true, caseInsensitive: true, wholeWord: false }, order: 1, enabled: true },
    ],
    actions: [
      { kind: "SEND_DM", config: { text: "Thanks for reaching out {{username}}! A quick overview: {{link}}\n\nWhat does your business need help with?" }, order: 0, enabled: true, delayMs: 0 },
      { kind: "ADD_TAG", config: { tag: "Agency Lead" }, order: 1, enabled: true, delayMs: 0 },
      { kind: "CALL_WEBHOOK", config: { url: "https://example.com/hooks/leonyx" }, order: 2, enabled: false, delayMs: 0 },
    ],
  }),

  t("newsletter-signup", {
    name: "Newsletter signup",
    description: "Keyword commenters get the newsletter link and are tagged for the next send.",
    category: "content",
    triggerLabel: "Comment contains newsletter keywords",
  }, {
    name: "Newsletter signup",
    description: "Grows the newsletter list from comments.",
    triggerType: "COMMENT",
    triggerConfig: {},
    conditions: [
      { kind: "KEYWORD_MATCH", config: { keywords: ["NEWSLETTER", "SUBSCRIBE", "JOIN"], matchAny: true, caseInsensitive: true, wholeWord: false }, order: 0, enabled: true },
    ],
    actions: [
      { kind: "PUBLIC_REPLY", config: { text: "Subscribe link in your DMs ✉️" }, order: 0, enabled: true, delayMs: 0 },
      { kind: "SEND_LINK", config: { text: "Join the newsletter here: {{link}}", linkName: "Newsletter", linkDestination: "https://example.com/newsletter" }, order: 1, enabled: true, delayMs: 0 },
      { kind: "ADD_TAG", config: { tag: "Newsletter" }, order: 2, enabled: true, delayMs: 0 },
    ],
  }),
];

export function getTemplate(id: string): Template | undefined {
  return templates.find((tpl) => tpl.id === id);
}