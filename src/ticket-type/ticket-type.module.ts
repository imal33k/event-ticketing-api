import { Module } from '@nestjs/common';
import { TicketTypesService } from './ticket-type.service';
import { TicketTypesController } from './ticket-type.controller';

@Module({
  controllers: [TicketTypesController],
  providers: [TicketTypesService],
})
export class TicketTypeModule {}
