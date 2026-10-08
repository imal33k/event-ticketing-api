import {
  Body,
  Query,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user';
import { PaginationDto } from '../common/dto/pagination.dto';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } }) // 10 orders per minute
  @Post()
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(user.id, dto);
  }

  @Get()
  findMine(@CurrentUser() user: { id: string }, @Query() query: PaginationDto) {
    return this.ordersService.findMine(user.id, query);
  }
  @HttpCode(200)
  @Post(':id/cancel')
  cancel(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ordersService.cancelMine(user.id, id);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ordersService.findOneMine(user.id, id);
  }
}
