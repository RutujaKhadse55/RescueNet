import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SmsService } from '../../services/smsService';

export async function smsRoutes(server: FastifyInstance) {
  server.post(
    '/sms/webhook/:provider',
    {
      schema: {
        description: 'Provider-specific webhook endpoint for inbound SMS emergency reports',
        tags: ['SMS Gateway'],
        params: {
          type: 'object',
          required: ['provider'],
          properties: {
            provider: { type: 'string', enum: ['twilio', 'msg91', 'custom_webhook'] },
          },
        },
      },
    },
    async (
      req: FastifyRequest<{
        Params: { provider: 'twilio' | 'msg91' | 'custom_webhook' };
        Body: Record<string, any>;
      }>,
      reply: FastifyReply,
    ) => {
      const { provider } = req.params;
      const signature =
        (req.headers['x-twilio-signature'] as string) ||
        (req.headers['x-msg91-signature'] as string) ||
        (req.headers['x-webhook-signature'] as string);

      const isValid = SmsService.verifyWebhookSignature(provider, signature, req.body);
      if (!isValid) {
        return reply.status(403).send({ error: 'Invalid webhook signature' });
      }

      // Extract sender phone and body according to provider schema
      let from = '+919999999999';
      let body = '';
      let messageId: string | undefined = undefined;

      if (provider === 'twilio') {
        from = req.body?.From || from;
        body = req.body?.Body || '';
        messageId = req.body?.MessageSid;
      } else if (provider === 'msg91') {
        from = req.body?.sender || req.body?.from || from;
        body = req.body?.message || req.body?.body || '';
        messageId = req.body?.msgId;
      } else {
        // generic GSM modem
        from = req.body?.from || from;
        body = req.body?.body || req.body?.text || '';
        messageId = req.body?.id;
      }

      const res = await SmsService.processIncomingSms({
        provider,
        from,
        body,
        signature,
        messageId,
      });

      return reply.status(200).send(res);
    },
  );
}
