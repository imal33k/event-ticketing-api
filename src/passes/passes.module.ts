import { Module } from '@nestjs/common';
import { PassesService } from './passes.service';
import { PassesController } from './passes.controller';

@Module({
  controllers: [PassesController],
  providers: [PassesService],
})
export class PassesModule {}
