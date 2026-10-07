import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ListEventsDto } from './dto/list-events.dto';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateEventDto) {
    const { title, description, venue, startAt, endAt } = dto;

    return this.prisma.event.create({
      data: {
        title,
        description,
        venue,
        startsAt: startAt,
        endsAt: endAt,
      },
    });
  }

  async findAll({ page, limit }: ListEventsDto) {
    const where = { endsAt: { gte: new Date().toISOString() } }; // hide past events
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
    this.assertValidDates(
      dto.startAt ?? existing.startsAt.toString(),
      dto.endsAt ?? existing.endsAt.toString(),
    );
    return this.prisma.event.update({ where: { id }, data: dto });
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

  private assertValidDates(startsAt: string, endsAt: string) {
    if (new Date(endsAt) <= new Date(startsAt)) {
      throw new BadRequestException('endsAt must be after startsAt');
    }
  }
}
