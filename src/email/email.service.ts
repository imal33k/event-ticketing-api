import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Resend, type Attachment } from 'resend';

@Injectable()
export class EmailService {
  private readonly resend: Resend;
  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY);
  }

  async sendEmail(
    to: string,
    subject: string,
    html: string,
    attachments?: Attachment[],
  ) {
    try {
      const { data, error } = await this.resend.emails.send({
        from: 'onboarding@resend.dev',
        to,
        subject,
        html,
        attachments,
      });

      if (error) {
        console.error('🔥 RESEND ERROR:', error);
        throw new InternalServerErrorException(error.message);
      }

      console.log('✅ EMAIL SENT:', data);

      return data;
    } catch (error: any) {
      console.error('🔥 EMAIL ERROR:', error);

      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      throw new InternalServerErrorException(
        error?.message || 'Failed to send email',
      );
    }
  }
}
