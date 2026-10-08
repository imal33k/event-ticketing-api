import * as common from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user';
import {
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/role.decorators';
import { Public } from '../auth/decorators/public.decorators';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('initialize/:orderId')
  initialize(
    @CurrentUser() user: { id: string },
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.paymentsService.initialize(user.id, orderId);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('public/:orderId/initialize')
  initializePublicOrder(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.paymentsService.initializeGuest(orderId);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('public/:orderId')
  publicOrderStatus(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.paymentsService.getPublicOrderStatus(orderId);
  }

  @SkipThrottle() // authenticated by signature, not by IP rate limits
  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Req() req: common.RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature: string,
  ) {
    const raw = req.rawBody;
    if (!raw || !this.paymentsService.verifySignature(raw, signature)) {
      throw new UnauthorizedException('Invalid signature');
    }
    await this.paymentsService.handleEvent(JSON.parse(raw.toString('utf8')));
    return { received: true };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('refund/:orderId')
  refund(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.paymentsService.refundOrder(orderId);
  }
}
