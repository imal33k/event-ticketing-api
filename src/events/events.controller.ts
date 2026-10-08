import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/role.decorators';
import { CurrentUser } from '../auth/decorators/current-user';
import { ListEventsDto } from './dto/list-events.dto';
import { Public } from '../auth/decorators/public.decorators';
import { CreatePublicRegistrationDto } from './dto/create-public-registration.dto';
import { OrdersService } from '../orders/orders.service';

@Controller('events')
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly ordersService: OrdersService,
  ) {}

  @Get()
  findAll(@Query() query: ListEventsDto) {
    return this.eventsService.findAll(query);
  }

  @Get('register/:token')
  @Public()
  getPublicEvent(@Param('token') token: string) {
    return this.eventsService.getPublicEvent(token);
  }

  @Post('register/:token')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async registerPublicAttendee(
    @Param('token') token: string,
    @Body() dto: CreatePublicRegistrationDto,
  ) {
    const order = await this.ordersService.createPublicRegistration(token, dto);
    return {
      orderId: order.id,
      total: order.total,
      currency: 'NGN',
      status: order.status,
    };
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.eventsService.findOne(id);
  }

  // Admin-only routes
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('events')
  create(@Body() createEventDto: CreateEventDto) {
    return this.eventsService.create(createEventDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch(':id')
  update(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() updateEventDto: UpdateEventDto,
  ) {
    return this.eventsService.update(id, updateEventDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete(':id')
  removeForStaff(@Param('id') id: string) {
    return this.eventsService.remove(id);
  }
}
