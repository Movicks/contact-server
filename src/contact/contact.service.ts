// src/contact/contact.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import * as nodemailer from 'nodemailer';
import { ContactFormDto } from './dto/contact-form.dto';

interface MailPayload {
  from: string;
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);
  private resend: Resend | null = null;
  private smtpTransporter: nodemailer.Transporter | null = null;
  private readonly fromEmail: string;

  constructor(private configService: ConfigService) {
    // Initialize Resend
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    this.fromEmail = this.configService.get<string>('RESEND_FROM') || 'contact@uvorenewables.com';
    
    if (apiKey) {
      this.resend = new Resend(apiKey);
      this.logger.log(`✅ Resend initialized with: ${this.fromEmail}`);
    } else {
      this.logger.warn('⚠️ RESEND_API_KEY not set');
    }

    // Initialize SMTP (Gmail) as fallback
    this.initializeSMTP();
  }

  private initializeSMTP() {
    try {
      const host = this.configService.get<string>('SMTP_HOST');
      const user = this.configService.get<string>('SMTP_USER');
      const pass = this.configService.get<string>('SMTP_PASSWORD');

      if (!host || !user || !pass) {
        this.logger.warn('⚠️ SMTP credentials not fully configured');
        return;
      }

      this.smtpTransporter = nodemailer.createTransport({
        host: host,
        port: parseInt(this.configService.get<string>('SMTP_PORT') || '587'),
        secure: this.configService.get<string>('SMTP_SECURE') === 'true',
        auth: {
          user: user,
          pass: pass,
        },
        // Gmail specific settings
        tls: {
          rejectUnauthorized: false,
        },
        connectionTimeout: 30000,
        greetingTimeout: 30000,
        socketTimeout: 30000,
      });

      this.logger.log(`✅ SMTP fallback initialized with: ${host}`);
    } catch (error) {
      this.logger.error(`❌ Failed to initialize SMTP: ${error.message}`);
    }
  }

  // ─── Primary send logic ───────────────────────────────────────────────────

  private async sendEmail(payload: MailPayload): Promise<string> {
    // Try Resend first
    if (this.resend) {
      try {
        return await this.sendViaResend(payload);
      } catch (err) {
        this.logger.warn(`⚠️ Resend failed (${err.message}), falling back to SMTP`);
      }
    }

    // Fallback to SMTP (Gmail)
    if (this.smtpTransporter) {
      try {
        return await this.sendViaSMTP(payload);
      } catch (err) {
        this.logger.error(`❌ SMTP fallback also failed: ${err.message}`);
        throw new Error(`Both Resend and SMTP failed: ${err.message}`);
      }
    }

    throw new Error('No email providers available (Resend and SMTP both unavailable)');
  }

  // ─── Resend provider ─────────────────────────────────────────────────────

  private async sendViaResend(payload: MailPayload): Promise<string> {
    const { data, error } = await this.resend!.emails.send({
      from: this.fromEmail,
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
      ...(payload.replyTo ? { replyTo: payload.replyTo } : {}),
    });

    if (error) {
      throw new Error(`Resend error: ${error.message}`);
    }

    this.logger.log(`✅ Resend sent: ${data?.id} to ${payload.to}`);
    return data?.id ?? 'resend-ok';
  }

  // ─── SMTP (Gmail) fallback ──────────────────────────────────────────────

  private async sendViaSMTP(payload: MailPayload): Promise<string> {
    if (!this.smtpTransporter) {
      throw new Error('SMTP transporter not initialized');
    }

    const from = this.configService.get<string>('SMTP_FROM') || this.configService.get<string>('SMTP_USER');

    const info = await this.smtpTransporter.sendMail({
      from: from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      ...(payload.replyTo ? { replyTo: payload.replyTo } : {}),
    });

    this.logger.log(`✅ SMTP fallback sent: ${info.messageId} to ${payload.to}`);
    return info.messageId;
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  async sendContactForm(data: ContactFormDto) {
    try {
      this.logger.log(`📩 Processing contact form from ${data.email}`);

      const toEmail = this.configService.get<string>('COMPANY_EMAIL');

      if (!toEmail) {
        throw new Error('COMPANY_EMAIL not configured');
      }

      let companyMessageId: string | null = null;
      let customerMessageId: string | null = null;
      let companyError: string | null = null;
      let customerError: string | null = null;
      let usedFallback = false;

      // Company notification
      try {
        companyMessageId = await this.sendEmail({
          from: this.fromEmail,
          to: toEmail,
          subject: `New Solar Project Quote Request - ${data.customerName || data.name}`,
          html: this.generateCompanyEmailHTML(data),
          replyTo: data.email,
        });
        this.logger.log(`✅ Company notification sent: ${companyMessageId}`);
      } catch (err) {
        companyError = err.message;
        this.logger.error(`❌ Company notification error: ${err.message}`);
        usedFallback = true;
      }

      // Customer confirmation
      try {
        customerMessageId = await this.sendEmail({
          from: this.fromEmail,
          to: data.email,
          subject: 'We Received Your Solar Project Quote Request - UVO Renewables',
          html: this.generateCustomerEmailHTML(data),
        });
        this.logger.log(`✅ Customer confirmation sent: ${customerMessageId}`);
      } catch (err) {
        customerError = err.message;
        this.logger.error(`❌ Customer confirmation error: ${err.message}`);
        usedFallback = true;
      }

      const companyEmailSent = !!companyMessageId;
      const customerEmailSent = !!customerMessageId;

      if (!companyEmailSent && !customerEmailSent) {
        throw new Error(
          `Both emails failed. Company: ${companyError || 'unknown'}, Customer: ${customerError || 'unknown'}`,
        );
      }

      return {
        success: true,
        message: 'Contact form submitted successfully',
        companyEmailSent,
        customerEmailSent,
        companyMessageId,
        customerMessageId,
        usedFallback, // Indicates if fallback was used
      };
    } catch (error) {
      this.logger.error(`❌ Error sending contact form: ${error.message}`, error.stack);
      return {
        success: false,
        message: 'Failed to send your message. Please try again or contact us directly.',
        companyEmailSent: false,
        customerEmailSent: false,
        error: error.message,
      };
    }
  }

  // Test connection — tests both Resend and SMTP
  async testConnection() {
    const results = {
      resend: { success: false, message: '' },
      smtp: { success: false, message: '' },
    };

    // Test Resend
    if (this.resend) {
      try {
        const testEmail = this.configService.get<string>('COMPANY_EMAIL');
        if (testEmail) {
          const { data, error } = await this.resend.emails.send({
            from: this.fromEmail,
            to: [testEmail],
            subject: '✅ UVO Renewables - Resend Test',
            html: `
              <h1>Resend Test Successful ✅</h1>
              <p>Your Resend integration is working correctly with: <strong>${this.fromEmail}</strong></p>
              <p>Sent at: ${new Date().toLocaleString()}</p>
            `,
          });

          if (error) {
            results.resend = { success: false, message: error.message };
          } else {
            results.resend = { success: true, message: `Test email sent: ${data?.id}` };
          }
        } else {
          results.resend = { success: false, message: 'No test email configured (set COMPANY_EMAIL)' };
        }
      } catch (error) {
        results.resend = { success: false, message: error.message };
      }
    } else {
      results.resend = { success: false, message: 'RESEND_API_KEY not configured' };
    }

    // Test SMTP
    if (this.smtpTransporter) {
      try {
        await this.smtpTransporter.verify();
        results.smtp = { success: true, message: 'SMTP connection verified' };
      } catch (error) {
        results.smtp = { success: false, message: error.message };
      }
    } else {
      results.smtp = { success: false, message: 'SMTP not configured' };
    }

    const allWorking = results.resend.success || results.smtp.success;
    
    this.logger.log(`Test results: Resend=${results.resend.success}, SMTP=${results.smtp.success}`);
    
    return {
      success: allWorking,
      providers: results,
      primaryProvider: this.resend ? 'resend' : 'smtp',
      message: allWorking 
        ? 'At least one email provider is working' 
        : 'No email providers are working',
    };
  }

  // ─── Email templates ──────────────────────────────────────────────────────

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
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}