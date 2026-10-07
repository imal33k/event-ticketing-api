import { Module } from '@nestjs/common';
import { TicketTypesService } from './ticket-type.service';
import { TicketTypesController } from './ticket-type.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
   imports: [PrismaModule],
  controllers: [TicketTypesController],
  providers: [TicketTypesService],
})
export class TicketTypeModule {}
