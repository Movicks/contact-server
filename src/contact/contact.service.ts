// src/contact/contact.service.ts
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as dns from 'dns';
import { ContactFormDto } from './dto/contact-form.dto';

@Injectable()
export class ContactService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(ContactService.name);

  constructor(private configService: ConfigService) {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    const port = parseInt(
      this.configService.get<string>('SMTP_PORT') || '587',
      10,
    );

    const host =
      this.configService.get<string>('SMTP_HOST') || 'smtp.gmail.com';

    const secure = port === 465;

    // Custom lookup forces dns.resolve4 (A records only) so the SMTP socket
    // never connects over IPv6 even on hosts where AAAA records resolve first.
    const ipv4Lookup = (hostname: string, _opts: any, callback: Function) => {
      dns.resolve4(hostname, (err, addresses) => {
        if (err) return callback(err);
        callback(null, addresses[0], 4);
      });
    };

    const smtpConfig: any = {
      host,
      port,
      secure,

      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASSWORD'),
      },

      lookup: ipv4Lookup,

      connectionTimeout: 30000,
      greetingTimeout: 30000,
      socketTimeout: 30000,

      tls: {
        rejectUnauthorized: true,
      },
    };

    this.logger.log(
      `SMTP Configuration: ${host}:${port} (secure: ${secure}, IPv4)`,
    );

    this.transporter = nodemailer.createTransport(smtpConfig);
  }

  async sendContactForm(data: ContactFormDto) {
    try {
      this.logger.log(`Processing contact form from ${data.email}`);

      // Send emails sequentially over pooled transporter to prevent socket/connection timeouts
      let companyMessageId: string | null = null;
      let customerMessageId: string | null = null;
      let companyError: string | null = null;
      let customerError: string | null = null;

      try {
        companyMessageId = await this.sendCompanyNotification(data);
      } catch (err) {
        companyError = err.message;
        this.logger.error(`Company notification error: ${err.message}`);
      }

      try {
        customerMessageId = await this.sendCustomerConfirmation(data);
      } catch (err) {
        customerError = err.message;
        this.logger.error(`Customer confirmation error: ${err.message}`);
      }

      const companyEmailSent = !!companyMessageId;
      const customerEmailSent = !!customerMessageId;

      if (!companyEmailSent && !customerEmailSent) {
        const errorMsg = `Both emails failed to send. Company: ${companyError || 'unknown'}, Customer: ${customerError || 'unknown'}`;
        throw new Error(errorMsg);
      }

      return {
        success: true,
        message: 'Contact form submitted successfully',
        companyEmailSent,
        customerEmailSent,
        companyMessageId,
        customerMessageId,
      };
    } catch (error) {
      this.logger.error(`Error sending contact form: ${error.message}`, error.stack);

      // Return success: false so the frontend can display the error
      return {
        success: false,
        message: 'Failed to send your message. Please try again or contact us directly.',
        companyEmailSent: false,
        customerEmailSent: false,
        error: error.message,
      };
    }
  }

  private async sendCompanyNotification(data: ContactFormDto) {
    try {
      const htmlContent = this.generateCompanyEmailHTML(data);
      const fromEmail = this.configService.get('SMTP_FROM');
      const toEmail = this.configService.get('COMPANY_EMAIL');

      if (!toEmail) {
        throw new Error('COMPANY_EMAIL not configured');
      }

      const mailOptions = {
        from: fromEmail,
        to: toEmail,
        subject: `New Solar Project Quote Request - ${data.customerName || data.name}`,
        html: htmlContent,
        replyTo: data.email,
        // Add headers to prevent spam filtering
        headers: {
          'X-Priority': '1',
          'X-MSMail-Priority': 'High',
          'Importance': 'high',
        },
      };

      this.logger.log(`Sending company notification to ${toEmail}`);
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Company email sent: ${info.messageId}`);
      return info.messageId;
    } catch (error) {
      this.logger.error(`Failed to send company notification: ${error.message}`);
      throw error;
    }
  }

  private async sendCustomerConfirmation(data: ContactFormDto) {
    try {
      const htmlContent = this.generateCustomerEmailHTML(data);
      const fromEmail = this.configService.get('SMTP_FROM');

      const mailOptions = {
        from: fromEmail,
        to: data.email,
        subject: 'We Received Your Solar Project Quote Request - UVO Renewables',
        html: htmlContent,
        // Add headers to prevent spam filtering
        headers: {
          'X-Priority': '3',
          'X-MSMail-Priority': 'Normal',
        },
      };

      this.logger.log(`Sending customer confirmation to ${data.email}`);
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Customer confirmation sent: ${info.messageId}`);
      return info.messageId;
    } catch (error) {
      this.logger.error(`Failed to send customer confirmation: ${error.message}`);
      throw error;
    }
  }

  // Test email connection
  async testConnection() {
    try {
      await this.transporter.verify();
      this.logger.log('SMTP connection verified successfully');
      return { success: true, message: 'SMTP connection working' };
    } catch (error) {
      this.logger.error(`SMTP connection failed: ${error.message}`);
      throw new InternalServerErrorException('Email service unavailable');
    }
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
                <span class="label">Country:</span>
                <span class="value">${this.escapeHtml(data.country || 'Not specified')}</span>
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
                <strong>Project Type:</strong> ${this.escapeHtml(data.customerType || 'Not specified')}<br/>
                <strong>Country:</strong> ${this.escapeHtml(data.country || 'Not specified')}
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