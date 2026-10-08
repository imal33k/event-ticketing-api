import { Injectable } from '@nestjs/common';
import { CreatePassDto } from './dto/create-pass.dto';
import { UpdatePassDto } from './dto/update-pass.dto';

@Injectable()
export class PassesService {
  create(createPassDto: CreatePassDto) {
    return 'This action adds a new pass';
  }

  findAll() {
    return `This action returns all passes`;
  }

  findOne(id: number) {
    return `This action returns a #${id} pass`;
  }

  update(id: number, updatePassDto: UpdatePassDto) {
    return `This action updates a #${id} pass`;
  }

  remove(id: number) {
    return `This action removes a #${id} pass`;
  }
}
