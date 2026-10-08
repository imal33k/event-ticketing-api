import { PartialType } from '@nestjs/swagger';
import { CreatePassDto } from './create-pass.dto';

export class UpdatePassDto extends PartialType(CreatePassDto) {}
