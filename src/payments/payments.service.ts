import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { releaseStock } from '../orders/release-stock';


@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async initialize(userId: string, orderId: string) {
    // Scope by userId so nobody can pay for (or probe) someone else's order
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { user: { select: { email: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');

    if (order.status !== 'PENDING') {
      throw new ConflictException(`Order is already ${order.status}`);
    }
    if (order.expiresAt <= new Date()) {
      throw new ConflictException('Order has expired, please place a new one');
    }

    const reference = `tkt_${randomUUID()}`;

    let res: Response;
    try {
      res = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.getOrThrow<string>('PAYSTACK_SECRET_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: order.user.email,
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
    if (!res.ok || !body?.status) {
      throw new BadGatewayException(
        body?.message ?? 'Payment provider rejected the request',
      );
    }

    // Save the reference so the webhook can match this payment to the order
    await this.prisma.order.update({
      where: { id: order.id },
      data: { paymentReference: reference },
    });

    return {
      authorizationUrl: body.data.authorization_url,
      reference,
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

  // Match by the orderId we attached at initialize time, or by reference
  const order = await this.prisma.order.findFirst({
    where: {
      OR: [
        ...(orderId ? [{ id: orderId }] : []),
        { paymentReference: reference },
      ],
    },
  });
  if (!order) {
    this.logger.warn(`charge.success for unknown order, ref ${reference}`);
    return;
  }
  if (order.status === 'PAID') return; // duplicate delivery, nothing to do

  // Don't trust the webhook body alone: ask Paystack directly
  const tx = await this.verifyWithPaystack(reference);
  if (
    tx.status !== 'success' ||
    tx.amount !== order.total ||
    tx.currency !== 'NGN'
  ) {
    this.logger.error(
      `Verification mismatch for order ${order.id}: ` +
        `status=${tx.status} amount=${tx.amount} expected=${order.total}`,
    );
    return;
  }

  // Atomic and idempotent: only flips PENDING -> PAID, once
  const { count } = await this.prisma.order.updateMany({
    where: { id: order.id, status: 'PENDING' },
    data: { status: 'PAID', paidAt: new Date(), paymentReference: reference },
  });

  if (count === 0) {
    this.logger.error(
      `Order ${order.id} was ${order.status} when payment ${reference} arrived. ` +
        `Customer was charged: needs refund or manual review.`,
    );
  }
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