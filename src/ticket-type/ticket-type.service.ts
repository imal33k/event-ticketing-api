import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTicketTypeDto } from './dto/create-ticket-type.dto';

@Injectable()
export class TicketTypesService {
  constructor(private prisma: PrismaService) {}

  
  private async assertEventExists(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true },
    });
    if (!event) throw new NotFoundException('Event not found');
  }

  async create(eventId: string, dto: CreateTicketTypeDto) {
    await this.assertEventExists(eventId);
    return this.prisma.ticketType.create({
      data: { ...dto, eventId },
    });
  }

  async findAllForEvent(eventId: string) {
    await this.assertEventExists(eventId);
    return this.prisma.ticketType.findMany({
      where: { eventId },
      orderBy: { priceKobo: 'asc' },
    });
  }

}