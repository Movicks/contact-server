import { Body, Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { ContactService } from './contact.service';
import { ContactFormDto } from './dto/contact-form.dto';

@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post('submit')
  @HttpCode(HttpStatus.OK)
  async submitContactForm(@Body() contactFormDto: ContactFormDto) {
    return this.contactService.sendContactForm(contactFormDto);
  }
}