import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root or local service
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long'),
  AGENCY_CA_PUBLIC_KEY: z.string().min(10, 'AGENCY_CA_PUBLIC_KEY is required'),
  SMS_PROVIDER: z.enum(['mock', 'twilio', 'msg91', 'custom_webhook']).default('mock'),
  SMS_WEBHOOK_SECRET: z.string().min(8, 'SMS_WEBHOOK_SECRET must be at least 8 characters'),
  SMS_INBOUND_NUMBER: z.string().min(5, 'SMS_INBOUND_NUMBER must be provided'),
  RETENTION_DAYS: z.coerce.number().min(1).default(30),
  API_PUBLIC_URL: z.string().url(),
});

export type AppConfig = z.infer<typeof envSchema>;

let parsedConfig: AppConfig;

try {
  parsedConfig = envSchema.parse(process.env);
} catch (error) {
  if (process.env.NODE_ENV === 'test') {
    // Provide safe defaults during isolated unit tests if .env is missing
    parsedConfig = envSchema.parse({
      DATABASE_URL: 'postgresql://rescuenet:rescuenet_secret@localhost:5432/rescuenet_test',
      JWT_SECRET: 'super_secret_rescuenet_jwt_signing_key_32_bytes_min_length_value',
      AGENCY_CA_PUBLIC_KEY: 'MCowBQYDK2VwAyEAx5d3v90oP9zP+6U6r3N6LhHh5k2f1W9r5Q3j8K9d2A4=',
      SMS_PROVIDER: 'mock',
      SMS_WEBHOOK_SECRET: 'test_sms_webhook_secret_key',
      SMS_INBOUND_NUMBER: '+911123456789',
      RETENTION_DAYS: 30,
      API_PUBLIC_URL: 'http://localhost:3000',
    });
  } else {
    console.error('Invalid RescueNet environment configuration:');
    if (error instanceof z.ZodError) {
      console.error(JSON.stringify(error.format(), null, 2));
    }
    throw error;
  }
}

export const config = parsedConfig;
