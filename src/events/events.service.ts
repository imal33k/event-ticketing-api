import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { ListEventsDto } from './dto/list-events.dto';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Admin: event CRUD
  // ---------------------------------------------------------------------------

  async create(dto: CreateEventDto) {
    const { title, description, venue, startAt, endAt } = dto;
    this.assertValidDates(startAt, endAt);

    return this.prisma.event.create({
      data: {
        title,
        description,
        venue,
        startsAt: new Date(startAt),
        endsAt: new Date(endAt),
        publicRegistrationToken: randomUUID(), // powers the public link
      },
    });
  }

  async findAll({ page, limit }: ListEventsDto) {
    const where = { endsAt: { gte: new Date() } };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.event.findMany({
        where,
        include: { ticketTypes: true },
        orderBy: { startsAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.event.count({ where }),
    ]);
    return {
      items,
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: { ticketTypes: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  async update(id: string, dto: UpdateEventDto) {
    const existing = await this.findOne(id);
    const { startAt, endAt, ...rest } = dto;

    this.assertValidDates(
      startAt ?? existing.startsAt.toISOString(),
      endAt ?? existing.endsAt.toISOString(),
    );

    return this.prisma.event.update({
      where: { id },
      data: {
        ...rest,
        ...(startAt && { startsAt: new Date(startAt) }),
        ...(endAt && { endsAt: new Date(endAt) }),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    const issued = await this.prisma.ticket.count({
      where: { ticketType: { eventId: id } },
    });
    if (issued > 0) {
      throw new ConflictException(
        'Cannot delete an event that already has tickets issued',
      );
    }

    await this.prisma.event.delete({ where: { id } });
    return { deleted: true };
  }

  // ---------------------------------------------------------------------------
  // Public registration (via public link)
  // ---------------------------------------------------------------------------

  async getPublicEvent(token: string) {
    const event = await this.findByPublicToken(token);

    return {
      id: event.id,
      title: event.title,
      description: event.description,
      venue: event.venue,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      ticketTypes: event.ticketTypes.map((ticketType) => ({
        id: ticketType.id,
        name: ticketType.name,
        priceKobo: ticketType.priceKobo,
        available: Math.max(0, ticketType.capacity - ticketType.sold),
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async findByPublicToken(token: string) {
    const event = await this.prisma.event.findUnique({
      where: { publicRegistrationToken: token },
      include: {
        ticketTypes: {
          orderBy: { priceKobo: 'asc' },
        },
      },
    });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  private assertValidDates(startAt: string, endAt: string) {
    if (new Date(endAt) <= new Date(startAt)) {
      throw new BadRequestException('endAt must be after startAt');
    }
  }
}
