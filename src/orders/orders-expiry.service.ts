import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

import { releaseStock } from './release-stock';
const GRACE_MS = 2 * 60 * 1000; // wait 2 extra minutes before expiring
const BATCH_SIZE = 100;

@Injectable()
export class OrdersExpiryService {
  private readonly logger = new Logger(OrdersExpiryService.name);
  private running = false;

  constructor(private prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async expireStaleOrders() {
    if (this.running) return; // never overlap with a slow previous run
    this.running = true;
    try {
      const stale = await this.prisma.order.findMany({
        where: {
          status: 'PENDING',
          expiresAt: { lte: new Date(Date.now() - GRACE_MS) },
        },
        select: { id: true },
        orderBy: { expiresAt: 'asc' },
        take: BATCH_SIZE,
      });

      let expired = 0;
      for (const { id } of stale) {
        if (await this.expireOrder(id)) expired++;
      }
      if (expired > 0) this.logger.log(`Expired ${expired} order(s)`);
    } catch (e) {
      this.logger.error(
        'Expiry run failed',
        e instanceof Error ? e.stack : String(e),
      );
    } finally {
      this.running = false;
    }
  }

  async expireOrder(orderId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      // Claim the order. If a webhook just marked it PAID, this matches nothing.
      const { count } = await tx.order.updateMany({
        where: { id: orderId, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      });
      if (count === 0) return false;

      await releaseStock(tx, orderId); // must run before the tickets are deleted
      await tx.ticket.deleteMany({ where: { orderId } });
      return true;
    });
  }
}
