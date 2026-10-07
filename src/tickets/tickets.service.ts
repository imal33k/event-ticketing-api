import { Injectable,ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto } from '../common/dto/pagination.dto';

@Injectable()
export class TicketsService {
  constructor(private prisma: PrismaService) {}

  async findMine(userId: string, { page, limit }: PaginationDto) {
    // Only tickets from PAID orders are real tickets
    const where = { order: { userId, status: 'PAID' as const } };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.ticket.findMany({
        where,
        select: {
          id: true,
          code: true,
          checkedInAt: true,
          ticketType: {
            select: {
              name: true,
              event: {
                select: { id: true, title: true, venue: true, startsAt: true },
              },
            },
          },
        },
        orderBy: { ticketType: { event: { startsAt: 'asc' } } },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return {
      items,
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async checkIn(staffId: string, code: string) {
  const now = new Date();

  // One atomic statement: all the rules AND the update together
  const { count } = await this.prisma.ticket.updateMany({
    where: {
      code,
      checkedInAt: null,
      order: { status: 'PAID' },
      ticketType: { event: { endsAt: { gt: now } } },
    },
    data: { checkedInAt: now, checkedInBy: staffId },
  });

  const ticket = await this.prisma.ticket.findUnique({
    where: { code },
    select: {
      id: true,
      checkedInAt: true,
      order: { select: { status: true, user: { select: { name: true } } } },
      ticketType: {
        select: {
          name: true,
          event: { select: { title: true, venue: true } },
        },
      },
    },
  });
  if (!ticket) throw new NotFoundException('Ticket not found');

  if (count === 1) {
    return {
      valid: true,
      ticket: {
        id: ticket.id,
        holder: ticket.order.user.name,
        type: ticket.ticketType.name,
        event: ticket.ticketType.event.title,
        venue: ticket.ticketType.event.venue,
        checkedInAt: ticket.checkedInAt,
      },
    };
  }

  // Rejected: work out why, so the scanner can show a useful message
  if (ticket.order.status !== 'PAID') {
    throw new ConflictException('Ticket has not been paid for');
  }
  if (ticket.checkedInAt) {
    throw new ConflictException(
      `Already checked in at ${ticket.checkedInAt.toISOString()}`,
    );
  }
  throw new ConflictException('This event has ended');
}
}