import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Gives an order's tickets back to TicketType.sold. Call inside a transaction. */
export async function releaseStock(
  tx: Prisma.TransactionClient,
  orderId: string,
) {
  const tickets = await tx.ticket.findMany({
    where: { orderId },
    select: { ticketTypeId: true },
  });

  const counts = new Map<string, number>();
  for (const t of tickets) {
    counts.set(t.ticketTypeId, (counts.get(t.ticketTypeId) ?? 0) + 1);
  }

  // Same id order as order creation, so these can never deadlock
  const sorted = [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [ticketTypeId, qty] of sorted) {
    await tx.$executeRaw`
      UPDATE "TicketType"
      SET "sold" = GREATEST("sold" - ${qty}, 0)
      WHERE "id" = ${ticketTypeId}
    `;
  }
}