import { db } from "@/db/client";
import { brokers } from "@/db/schema";

export async function GET() {
  const allBrokers = await db.select().from(brokers);
  return Response.json(allBrokers);
}
