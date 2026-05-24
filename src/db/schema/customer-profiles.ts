import { date, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "@/lib/ids";
import { users } from "./users";

export type PostalAddress = {
  street: string;
  postalCode: string;
  city: string;
  country: string;
};

export const customerProfiles = pgTable("customer_profiles", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  firstName: text("first_name"),
  lastName: text("last_name"),
  emailAddresses: jsonb("email_addresses").$type<string[]>(),
  phoneNumbers: jsonb("phone_numbers").$type<string[]>(),
  postalAddresses: jsonb("postal_addresses").$type<PostalAddress[]>(),
  dateOfBirth: date("date_of_birth"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
