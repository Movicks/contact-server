import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { ContactFormDto } from './dto/contact-form.dto';

@Injectable()
export class ContactService {
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get('SMTP_HOST'),
      port: this.configService.get('SMTP_PORT'),
      secure: this.configService.get('SMTP_SECURE') === 'true',
      auth: {
        user: this.configService.get('SMTP_USER'),
        pass: this.configService.get('SMTP_PASSWORD'),
      },
    });
  }

  async sendContactForm(data: ContactFormDto) {
    try {
      // Email to the company/project desk
      const companyEmail = await this.sendCompanyNotification(data);
      
      // Auto-reply to the customer
      const customerEmail = await this.sendCustomerConfirmation(data);

      return {
        success: true,
        message: 'Contact form submitted successfully',
        companyEmailSent: companyEmail,
        customerEmailSent: customerEmail,
      };
    } catch (error) {
      console.error('Error sending email:', error);
      throw new InternalServerErrorException('Failed to send contact form');
    }
  }

  private async sendCompanyNotification(data: ContactFormDto) {
    const htmlContent = this.generateCompanyEmailHTML(data);

    const mailOptions = {
      from: this.configService.get('SMTP_FROM'),
      to: this.configService.get('COMPANY_EMAIL'), // e.g., contact@uvorenewables.com
      subject: `New Project Quote Request - ${data.customerName || data.name}`,
      html: htmlContent,
      replyTo: data.email,
    };

    const info = await this.transporter.sendMail(mailOptions);
    return info.messageId;
  }

  private async sendCustomerConfirmation(data: ContactFormDto) {
    const htmlContent = this.generateCustomerEmailHTML(data);

    const mailOptions = {
      from: this.configService.get('SMTP_FROM'),
      to: data.email,
      subject: 'We Received Your Project Quote Request - UVO Renewables',
      html: htmlContent,
    };

    const info = await this.transporter.sendMail(mailOptions);
    return info.messageId;
  }

  private generateCompanyEmailHTML(data: ContactFormDto): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #0a0f1c; padding: 20px; color: #f4f2ee; }
            .content { padding: 20px; background: #f9f9f9; }
            .field { margin-bottom: 15px; }
            .label { font-weight: bold; color: #3fae6b; }
            .value { margin-left: 10px; }
            .footer { margin-top: 20px; padding: 20px; background: #f1f1f1; text-align: center; font-size: 14px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>New Project Quote Request</h2>
            </div>
            <div class="content">
              <div class="field">
                <span class="label">Name:</span>
                <span class="value">${this.escapeHtml(data.name)}</span>
              </div>
              <div class="field">
                <span class="label">Customer/Business Name:</span>
                <span class="value">${this.escapeHtml(data.customerName)}</span>
              </div>
              <div class="field">
                <span class="label">Phone:</span>
                <span class="value">${this.escapeHtml(data.phone)}</span>
              </div>
              <div class="field">
                <span class="label">Email:</span>
                <span class="value">${this.escapeHtml(data.email)}</span>
              </div>
              <div class="field">
                <span class="label">Customer Type:</span>
                <span class="value">${this.escapeHtml(data.customerType || 'Not specified')}</span>
              </div>
              <div class="field">
                <span class="label">State/City:</span>
                <span class="value">${this.escapeHtml(data.state || 'Not specified')}</span>
              </div>
              <div class="field">
                <span class="label">Requested System Size:</span>
                <span class="value">${this.escapeHtml(data.systemSize || 'Not specified')}</span>
              </div>
              <div class="field">
                <span class="label">Project Notes:</span>
                <div style="margin-top: 5px; padding: 10px; background: white; border-radius: 4px;">
                  ${this.escapeHtml(data.notes || 'No notes provided')}
                </div>
              </div>
            </div>
            <div class="footer">
              <p>This request was submitted through the UVO Renewables website contact form.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private generateCustomerEmailHTML(data: ContactFormDto): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #0a0f1c; padding: 20px; color: #f4f2ee; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .highlight { color: #3fae6b; font-weight: bold; }
            .footer { margin-top: 20px; padding: 20px; background: #f1f1f1; text-align: center; font-size: 14px; color: #666; }
            .details { background: white; padding: 15px; border-radius: 4px; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>Thank You for Your Interest!</h2>
            </div>
            <div class="content">
              <p>Dear ${this.escapeHtml(data.name)},</p>
              
              <p>Thank you for reaching out to <span class="highlight">UVO Renewables</span> regarding your solar project.</p>
              
              <p>We have received your request for a project quote with the following details:</p>
              
              <div class="details">
                <strong>Requested System Size:</strong> ${this.escapeHtml(data.systemSize || 'Not specified')}<br/>
                <strong>Project Type:</strong> ${this.escapeHtml(data.customerType || 'Not specified')}
              </div>
              
              <p>Our project desk team will review your requirements and get back to you with a comprehensive recommendation within 24-48 hours.</p>
              
              <p><strong>What to expect next:</strong></p>
              <ul>
                <li>System size recommendation based on your needs</li>
                <li>Available financing and lease options</li>
                <li>Installation timeline</li>
                <li>Preliminary cost estimate</li>
              </ul>
              
              <p>In the meantime, if you have any questions, please don't hesitate to reply to this email or call us at our office.</p>
              
              <p>We look forward to helping you power your future with clean, reliable solar energy!</p>
              
              <p>Best regards,<br/>
              <strong>The UVO Renewables Team</strong></p>
            </div>
            <div class="footer">
              <p>UVO Renewables Ltd | 4 Ikere Close, Kubwa, Abuja, Nigeria</p>
              <p>contact@uvorenewables.com</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private escapeHtml(unsafe: string): string {
    if (!unsafe) return '';
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}