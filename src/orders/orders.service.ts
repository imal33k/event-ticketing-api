import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { releaseStock } from './release-stock';
import { PaginationDto } from '../common/dto/pagination.dto';

const ORDER_TTL_MS = 15 * 60 * 1000; // 15 minutes to pay
const ORDER_INCLUDE = {
  tickets: {
    select: {
      id: true,
      code: true,
      checkedInAt: true,
      ticketType: {
        select: {
          name: true,
          priceKobo: true,
          event: {
            select: { id: true, title: true, venue: true, startsAt: true },
          },
        },
      },
    },
  },
} as const;


@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateOrderDto) {
    // 1. Merge duplicate ticket types, then sort by id
    const merged = new Map<string, number>();
    for (const item of dto.items) {
      merged.set(
        item.ticketTypeId,
        (merged.get(item.ticketTypeId) ?? 0) + item.quantity,
      );
    }
    const items = [...merged.entries()]
      .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }))
      .sort((a, b) => a.ticketTypeId.localeCompare(b.ticketTypeId));

    if (items.some((i) => i.quantity > 10)) {
      throw new BadRequestException('Maximum 10 tickets per ticket type');
    }

    return this.prisma.$transaction(async (tx) => {
      // 2. Load ticket types (and their events) to get real prices
      const ticketTypes = await tx.ticketType.findMany({
        where: { id: { in: items.map((i) => i.ticketTypeId) } },
        include: { event: { select: { endsAt: true } } },
      });
      if (ticketTypes.length !== items.length) {
        throw new NotFoundException('One or more ticket types not found');
      }

      const byId = new Map(ticketTypes.map((t) => [t.id, t]));
      const now = new Date();
      let total = 0;

      for (const item of items) {
        const tt = byId.get(item.ticketTypeId)!;
        if (new Date(tt.event.endsAt) <= now) {
          throw new BadRequestException(`Event for "${tt.name}" has ended`);
        }
        total += tt.priceKobo * item.quantity;
      }

      // 3. Reserve stock atomically, one ticket type at a time
      for (const item of items) {
        const updated = await tx.$executeRaw`
          UPDATE "TicketType"
          SET "sold" = "sold" + ${item.quantity}
          WHERE "id" = ${item.ticketTypeId}
            AND "sold" + ${item.quantity} <= "capacity"
        `;
        if (updated === 0) {
          const tt = byId.get(item.ticketTypeId)!;
          throw new ConflictException(`Not enough "${tt.name}" tickets left`);
        }
      }

      // 4. Create the order and its tickets
      return tx.order.create({
        data: {
          userId,
          total,
           expiresAt: new Date(Date.now() + ORDER_TTL_MS),
          tickets: {
            createMany: {
              data: items.flatMap((item) =>
                Array.from({ length: item.quantity }, () => ({
                  ticketTypeId: item.ticketTypeId,
                })),
              ),
            },
          },
        },
        include: { tickets:{omit: { code: true }} },
      });
    });
  }

  async findMine(userId: string, { page, limit }: PaginationDto) {
  const where = { userId };
  const [items, total] = await this.prisma.$transaction([
    this.prisma.order.findMany({
      where,
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    this.prisma.order.count({ where }),
  ]);
  return {
    items: items.map((o) => this.hideCodesIfUnpaid(o)),
    meta: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

async findOneMine(userId: string, id: string) {
  // Scoped by userId: someone else's order is just a 404
  const order = await this.prisma.order.findFirst({
    where: { id, userId },
    include: ORDER_INCLUDE,
  });
  if (!order) throw new NotFoundException('Order not found');
  return this.hideCodesIfUnpaid(order);
}

private hideCodesIfUnpaid<
  T extends { status: string; tickets: { code: string }[] },
>(order: T) {
  if (order.status === 'PAID') return order;
  return {
    ...order,
    tickets: order.tickets.map(({ code, ...rest }) => rest),
  };
}

async cancelMine(userId: string, id: string) {
  const cancelled = await this.prisma.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: { id, userId, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
    if (count === 0) return false;

    await releaseStock(tx, id);
    await tx.ticket.deleteMany({ where: { orderId: id } });
    return true;
  });

  if (!cancelled) {
    const order = await this.prisma.order.findFirst({
      where: { id, userId },
      select: { status: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    throw new ConflictException(
      `Only pending orders can be cancelled (this one is ${order.status})`,
    );
  }
  return { cancelled: true };
}
}