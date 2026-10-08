import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { Logger } from '@nestjs/common';
import { releaseStock } from '../orders/release-stock';
import { EmailService } from '../email/email.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private emailService: EmailService,
  ) {}

  async initialize(userId: string, orderId: string) {
    // Scope by userId so nobody can pay for (or probe) someone else's order
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { user: { select: { email: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');

    return this.initializeOrder(order);
  }

  async initializeGuest(orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId: null },
    });
    if (!order || !order.guestEmail) {
      throw new NotFoundException('Guest order not found');
    }

    return this.initializeOrder(order);
  }

  private async initializeOrder(order: {
    id: string;
    total: number;
    expiresAt: Date;
    status: string;
    user?: { email: string } | null;
    guestEmail?: string | null;
  }) {
    if (order.status !== 'PENDING') {
      throw new ConflictException(`Order is already ${order.status}`);
    }
    if (order.expiresAt <= new Date()) {
      throw new ConflictException('Order has expired, please place a new one');
    }

    const email = order.user?.email ?? order.guestEmail;
    if (!email) throw new BadGatewayException('Order has no payment email');

    const reference = `tkt_${randomUUID()}`;
    await this.prisma.order.update({
      where: { id: order.id },
      data: { paymentReference: reference },
    });

    let res: Response;
    try {
      res = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.getOrThrow<string>('PAYSTACK_SECRET_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          amount: order.total, // already in kobo
          reference,
          metadata: { orderId: order.id },
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new BadGatewayException('Could not reach payment provider');
    }

    const body: any = await res.json().catch(() => null);
    if (
      !res.ok ||
      !body?.status ||
      typeof body.data?.authorization_url !== 'string'
    ) {
      throw new BadGatewayException(
        body?.message ?? 'Payment provider rejected the request',
      );
    }

    return {
      authorizationUrl: body.data.authorization_url,
      reference,
    };
  }

  async getPublicOrderStatus(orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId: null },
      select: { status: true, emailSentAt: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    return {
      status: order.status,
      ticketEmailSent: order.emailSentAt !== null,
    };
  }

  verifySignature(rawBody: Buffer, signature?: string): boolean {
    if (!signature) return false;
    const expected = createHmac(
      'sha512',
      this.config.getOrThrow<string>('PAYSTACK_SECRET_KEY'),
    )
      .update(rawBody)
      .digest('hex');

    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  async handleEvent(event: { event: string; data: any }) {
    if (event.event !== 'charge.success') return; // ignore everything else

    const reference: string | undefined = event.data?.reference;
    const orderId: string | undefined = event.data?.metadata?.orderId;
    if (!reference) return;

    const order = await this.prisma.order.findFirst({
      where: { paymentReference: reference },
    });
    const metadataOrder = orderId
      ? await this.prisma.order.findUnique({ where: { id: orderId } })
      : null;
    const matchedOrder = order ?? metadataOrder;
    if (!matchedOrder) {
      this.logger.warn(`charge.success for unknown order, ref ${reference}`);
      return;
    }

    // Don't trust the webhook body alone: ask Paystack directly
    const tx = await this.verifyWithPaystack(reference);
    if (
      tx.status !== 'success' ||
      tx.amount !== matchedOrder.total ||
      tx.currency !== 'NGN'
    ) {
      this.logger.error(
        `Verification mismatch for order ${matchedOrder.id}: ` +
          `status=${tx.status} amount=${tx.amount} expected=${matchedOrder.total}`,
      );
      return;
    }

    if (matchedOrder.paymentReference !== reference) {
      this.logger.error(
        `Payment ${reference} is not the active reference for order ${matchedOrder.id}; refunding duplicate payment.`,
      );
      await this.autoRefund(matchedOrder.id, reference);
      return;
    }

    // Atomic and idempotent: only flips PENDING -> PAID, once
    const { count } = await this.prisma.order.updateMany({
      where: { id: matchedOrder.id, status: 'PENDING' },
      data: { status: 'PAID', paidAt: new Date(), paymentReference: reference },
    });

    if (count === 1) {
      await this.sendGuestTickets(matchedOrder.id);
      return;
    }

    const latest = await this.prisma.order.findUnique({
      where: { id: matchedOrder.id },
    });
    if (latest?.status === 'PAID') {
      await this.sendGuestTickets(latest.id);
    } else if (latest) {
      this.logger.error(
        `Order ${latest.id} was ${latest.status} when payment ${reference} arrived. Refunding payment.`,
      );
      await this.autoRefund(latest.id, reference);
    }
  }

  private async sendGuestTickets(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        tickets: {
          include: {
            ticketType: {
              include: { event: true },
            },
          },
        },
      },
    });
    if (
      !order ||
      order.status !== 'PAID' ||
      !order.guestEmail ||
      order.emailSentAt
    ) {
      return;
    }

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);

    for (const ticket of order.tickets) {
      const page = pdf.addPage([595.28, 841.89]);
      const { title, venue, startsAt } = ticket.ticketType.event;
      const qrPng = await QRCode.toBuffer(ticket.code, {
        type: 'png',
        width: 480,
        margin: 2,
        errorCorrectionLevel: 'M',
      });
      const qrImage = await pdf.embedPng(qrPng);

      page.drawText('Event ticket', {
        x: 50,
        y: 780,
        size: 24,
        font,
        color: rgb(0.08, 0.12, 0.2),
      });
      page.drawText(`Attendee: ${order.guestName ?? 'Guest'}`, {
        x: 50,
        y: 735,
        size: 14,
        font,
      });
      page.drawText(`Event: ${title}`, {
        x: 50,
        y: 708,
        size: 14,
        font,
        maxWidth: 495,
      });
      page.drawText(`Ticket: ${ticket.ticketType.name}`, {
        x: 50,
        y: 681,
        size: 14,
        font,
        maxWidth: 495,
      });
      page.drawText(`Venue: ${venue}`, {
        x: 50,
        y: 654,
        size: 14,
        font,
        maxWidth: 495,
      });
      page.drawText(
        `Starts: ${startsAt.toLocaleString('en-GB', { timeZone: 'UTC' })} UTC`,
        {
          x: 50,
          y: 627,
          size: 12,
          font,
          maxWidth: 495,
        },
      );
      page.drawImage(qrImage, {
        x: (595.28 - 270) / 2,
        y: 280,
        width: 270,
        height: 270,
      });
      page.drawText(`Ticket code: ${ticket.code}`, {
        x: 50,
        y: 245,
        size: 10,
        font,
        maxWidth: 495,
      });
    }

    const pdfBytes = Buffer.from(await pdf.save());
    const eventTitle = order.tickets[0]?.ticketType.event.title ?? 'Event';
    await this.emailService.sendEmail(
      order.guestEmail,
      `Your tickets - ${eventTitle}`,
      `<p>Hello ${this.escapeHtml(order.guestName ?? 'there')},</p>
     <p>Your payment is confirmed. Your ticket QR code${order.tickets.length === 1 ? '' : 's'} ${order.tickets.length === 1 ? 'is' : 'are'} attached as a PDF.</p>`,
      [
        {
          filename: 'event-tickets.pdf',
          content: pdfBytes,
          contentType: 'application/pdf',
        },
      ],
    );

    await this.prisma.order.update({
      where: { id: order.id },
      data: { emailSentAt: new Date() },
    });
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private async verifyWithPaystack(reference: string) {
    // Network errors are allowed to throw: Nest returns 500 and Paystack retries
    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: {
          Authorization: `Bearer ${this.config.getOrThrow<string>('PAYSTACK_SECRET_KEY')}`,
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    const body: any = await res.json();
    if (!res.ok || !body?.status) {
      throw new BadGatewayException('Could not verify transaction');
    }
    return body.data as { status: string; amount: number; currency: string };
  }
  async refundOrder(orderId: string) {
    // 1. Claim: only a PAID order with no used tickets can move to REFUNDING
    const claimed = await this.prisma.order.updateMany({
      where: {
        id: orderId,
        status: 'PAID',
        tickets: { none: { checkedInAt: { not: null } } },
      },
      data: { status: 'REFUNDING' },
    });

    if (claimed.count === 0) {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: { status: true },
      });
      if (!order) throw new NotFoundException('Order not found');
      if (order.status === 'PAID') {
        throw new ConflictException('Some tickets were already used');
      }
      throw new ConflictException(
        `Order is ${order.status}; only PAID orders can be refunded`,
      );
    }

    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { paymentReference: true },
    });
    if (!order.paymentReference) {
      await this.revertRefundClaim(orderId);
      throw new ConflictException('Order has no payment reference');
    }

    // 2. Ask Paystack to refund the full amount
    const result = await this.requestRefund(order.paymentReference);

    if (!result.accepted) {
      if (result.ambiguous) {
        // We can't tell whether Paystack received it. Don't guess.
        this.logger.error(
          `Refund for order ${orderId} may or may not have been queued. ` +
            `Left in REFUNDING: check the Paystack dashboard.`,
        );
        throw new BadGatewayException(
          'Refund status unclear. Check the Paystack dashboard before retrying.',
        );
      }
      await this.revertRefundClaim(orderId); // definitely not refunded
      throw new BadGatewayException(
        result.message ?? 'Paystack rejected the refund',
      );
    }

    // 3. Refund accepted: finalise locally
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: orderId },
          data: { status: 'REFUNDED', refundedAt: new Date() },
        });
        await releaseStock(tx, orderId);
      });
    } catch (e) {
      this.logger.error(
        `Paystack accepted the refund for order ${orderId} but saving it failed. ` +
          `Order is stuck in REFUNDING and needs manual fixing.`,
      );
      throw e;
    }
    return { refunded: true, orderId };
  }

  private revertRefundClaim(orderId: string) {
    return this.prisma.order.updateMany({
      where: { id: orderId, status: 'REFUNDING' },
      data: { status: 'PAID' },
    });
  }

  private async requestRefund(
    transactionReference: string,
  ): Promise<{ accepted: boolean; ambiguous: boolean; message?: string }> {
    let res: Response;
    try {
      res = await fetch('https://api.paystack.co/refund', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.getOrThrow<string>('PAYSTACK_SECRET_KEY')}`,
          'Content-Type': 'application/json',
        },
        // no "amount" means a full refund
        body: JSON.stringify({ transaction: transactionReference }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      return { accepted: false, ambiguous: true }; // timeout or network error
    }

    const body: any = await res.json().catch(() => null);
    if (res.ok && body?.status) return { accepted: true, ambiguous: false };
    return {
      accepted: false,
      ambiguous: res.status >= 500,
      message: body?.message,
    };
  }

  private async autoRefund(orderId: string, reference: string) {
    const r = await this.requestRefund(reference);
    if (r.accepted) {
      this.logger.warn(
        `Order ${orderId} was no longer pending when payment ${reference} ` +
          `arrived. Automatic refund requested.`,
      );
      return;
    }
    // Throwing makes Paystack retry the webhook later
    if (r.ambiguous) throw new BadGatewayException('Refund unclear, retry');
    this.logger.error(
      `Auto-refund rejected for order ${orderId}, ref ${reference}: ` +
        `${r.message}. Refund it manually in the Paystack dashboard.`,
    );
  }
}
