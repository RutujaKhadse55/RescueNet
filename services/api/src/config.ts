import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root or local service
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z
    .string()
    .default('postgresql://rescuenet:rescuenet_secret@localhost:5432/rescuenet'),
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters long')
    .default('super_secret_rescuenet_jwt_signing_key_32_bytes_min_length_value'),
  AGENCY_CA_PUBLIC_KEY: z
    .string()
    .min(10, 'AGENCY_CA_PUBLIC_KEY is required')
    .default('MCowBQYDK2VwAyEAx5d3v90oP9zP+6U6r3N6LhHh5k2f1W9r5Q3j8K9d2A4='),
  SMS_PROVIDER: z.enum(['mock', 'twilio', 'msg91', 'custom_webhook']).default('mock'),
  SMS_WEBHOOK_SECRET: z
    .string()
    .min(8, 'SMS_WEBHOOK_SECRET must be at least 8 characters')
    .default('rescuenet_inbound_sms_hmac_secret_key_998877'),
  SMS_INBOUND_NUMBER: z
    .string()
    .min(5, 'SMS_INBOUND_NUMBER must be provided')
    .default('+911123456789'),
  RETENTION_DAYS: z.coerce.number().min(1).default(30),
  API_PUBLIC_URL: z.string().default('http://localhost:3000'),
});

export type AppConfig = z.infer<typeof envSchema>;

// Sanitize process.env to remove empty string entries so Zod defaults apply cleanly
const rawEnv: Record<string, any> = { ...process.env };
for (const [key, val] of Object.entries(rawEnv)) {
  if (typeof val === 'string' && val.trim() === '') {
    delete rawEnv[key];
  }
}

// Automatically bind Render public URL if provided by Render environment
if (rawEnv.RENDER_EXTERNAL_URL && !rawEnv.API_PUBLIC_URL) {
  rawEnv.API_PUBLIC_URL = rawEnv.RENDER_EXTERNAL_URL;
}

let parsedConfig: AppConfig;

try {
  parsedConfig = envSchema.parse(rawEnv);
} catch (error) {
  console.warn('Warning: Some environment variables were invalid. Using fallback production configuration.');
  if (error instanceof z.ZodError) {
    console.warn(JSON.stringify(error.format(), null, 2));
  }
  parsedConfig = envSchema.parse({});
}

export const config = parsedConfig;
