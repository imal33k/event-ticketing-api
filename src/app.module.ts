import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { EventsModule } from './events/events.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TicketTypeModule } from './ticket-type/ticket-type.module';
import { OrdersModule } from './orders/orders.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { PaymentsModule } from './payments/payments.module';
import { ScheduleModule } from '@nestjs/schedule';
import { TicketsModule } from './tickets/tickets.module';
import { EmailModule } from './email/email.module';
import { PassesModule } from './passes/passes.module';

@Module({
  imports: [
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 100 }], // 100 requests per minute per IP
    }),
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ScheduleModule.forRoot(),
    EventsModule,
    AuthModule,
    UsersModule,
    TicketTypeModule,
    OrdersModule,
    PaymentsModule,
    TicketsModule,
    EmailModule,
    PassesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
