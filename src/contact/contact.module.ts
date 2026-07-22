import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ContactService } from './contact.service';
import { ContactController } from './contact.controller';

@Module({
  imports: [ConfigModule],
  controllers: [ContactController],
  providers: [ContactService],
})
export class ContactModule {}