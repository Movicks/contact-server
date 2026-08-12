// src/contact/contact.controller.ts
import { Body, Controller, Get, Post, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { ContactService } from './contact.service';
import { ContactFormDto } from './dto/contact-form.dto';

@Controller('contact')
export class ContactController {
  private readonly logger = new Logger(ContactController.name);

  constructor(private readonly contactService: ContactService) {}

  @Get('test')
  async testEmailConnection() {
    this.logger.log('Testing email connection...');
    return this.contactService.testConnection();
  }

  @Post('submit')
  @HttpCode(HttpStatus.OK)
  async submitContactForm(@Body() contactFormDto: ContactFormDto) {
    this.logger.log(`Contact form submission received from ${contactFormDto.email}`);
    
    const result = await this.contactService.sendContactForm(contactFormDto);
    
    if (!result.success) {
      this.logger.warn(`Contact form submission failed: ${result.error}`);
      // You might want to throw an exception here if you want the controller to handle errors
      // But keeping it as is returns the error in the response
    }
    
    return result;
  }
}