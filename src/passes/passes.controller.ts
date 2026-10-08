import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { PassesService } from './passes.service';
import { CreatePassDto } from './dto/create-pass.dto';
import { UpdatePassDto } from './dto/update-pass.dto';

@Controller('passes')
export class PassesController {
  constructor(private readonly passesService: PassesService) {}

  @Post()
  create(@Body() createPassDto: CreatePassDto) {
    return this.passesService.create(createPassDto);
  }

  @Get()
  findAll() {
    return this.passesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.passesService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updatePassDto: UpdatePassDto) {
    return this.passesService.update(+id, updatePassDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.passesService.remove(+id);
  }
}
