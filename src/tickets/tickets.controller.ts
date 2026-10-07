import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CheckInDto } from './dto/check-in.dto';
import { Roles } from '../auth/decorators/role.decorators';
import { Throttle } from '@nestjs/throttler';

@Controller('tickets')
@UseGuards(JwtAuthGuard)
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get()
  findMine(
    @CurrentUser() user: { id: string },
    @Query() query: PaginationDto,
  ) {
    return this.ticketsService.findMine(user.id, query);
  }

  @UseGuards(RolesGuard)
@Roles('ADMIN', 'STAFF')
@Throttle({ default: { limit: 300, ttl: 60_000 } }) // busy gates scan fast
@HttpCode(200)
@Post('check-in')
checkIn(
  @CurrentUser() user: { id: string },
  @Body() dto: CheckInDto,
) {
  return this.ticketsService.checkIn(user.id, dto.code);
}
}