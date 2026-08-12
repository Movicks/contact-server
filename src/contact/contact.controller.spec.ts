// contact.controller.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';
import { ContactFormDto } from './dto/contact-form.dto';

describe('ContactController', () => {
  let controller: ContactController;
  let service: ContactService;

  const mockContactService = {
    sendContactForm: jest.fn().mockImplementation((dto: ContactFormDto) =>
      Promise.resolve({
        success: true,
        message: 'Contact form submitted successfully',
        companyEmailSent: true,
        customerEmailSent: true,
      }),
    ),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContactController],
      providers: [
        {
          provide: ContactService,
          useValue: mockContactService,
        },
      ],
    }).compile();

    controller = module.get<ContactController>(ContactController);
    service = module.get<ContactService>(ContactService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should process contact form submission with country', async () => {
    const dto: ContactFormDto = {
      name: 'John Doe',
      customerName: 'Doe Enterprises',
      phone: '1234567890',
      email: 'john@example.com',
      customerType: 'Diaspora',
      country: 'United Kingdom',
      systemSize: '10kW',
      notes: 'Interested in commercial solar installation',
    };

    const result = await controller.submitContactForm(dto);
    expect(service.sendContactForm).toHaveBeenCalledWith(dto);
    expect(result).toEqual({
      success: true,
      message: 'Contact form submitted successfully',
      companyEmailSent: true,
      customerEmailSent: true,
    });
  });
});
