import { Injectable } from '@nestjs/common';
import { createTransport, SendMailOptions, Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: Transporter;

  constructor() {
    this.transporter = createTransport(
      {
        host: process.env.MAIL_HOST,
        port: Number(process.env.MAIL_PORT),
        secure: process.env.MAIL_SECURE === 'true',
        auth: {
          user: process.env.MAIL_USER,
          pass: process.env.MAIL_PASS,
        },
      },
      {
        from: process.env.MAIL_FROM,
      },
    );
  }

  async sendMail(mailOptions: SendMailOptions) {
    return this.transporter.sendMail(mailOptions);
  }
}
