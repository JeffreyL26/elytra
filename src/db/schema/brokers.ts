import { boolean, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "@/lib/ids";

export const optOutMethodEnum = pgEnum("opt_out_method", [
  "email",
  "form",
  "mixed",
]);

export const brokers = pgTable("brokers", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  country: text("country"),
  websiteUrl: text("website_url"),
  optOutMethod: optOutMethodEnum("opt_out_method").notNull(),
  optOutEmail: text("opt_out_email"),
  optOutFormUrl: text("opt_out_form_url"),
  isDummy: boolean("is_dummy").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
