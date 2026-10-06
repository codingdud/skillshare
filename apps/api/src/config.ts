import { z } from 'zod';
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  WEB_ORIGIN: z.url().default('http://localhost:5173'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(11025),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  MAIL_FROM: z.string().default('SkillShare <noreply@skillshare.test>'),
});
export const config = schema.parse(process.env);
const configuredOrigin = new URL(config.WEB_ORIGIN);
const loopbackHosts = ['localhost', '127.0.0.1', '[::1]'];
const allowedOrigins = new Set([config.WEB_ORIGIN]);
if (config.NODE_ENV === 'development' && loopbackHosts.includes(configuredOrigin.hostname)) {
  for (const host of loopbackHosts) {
    allowedOrigins.add(
      `${configuredOrigin.protocol}//${host}${configuredOrigin.port ? `:${configuredOrigin.port}` : ''}`,
    );
  }
}
export const allowedWebOrigins: ReadonlySet<string> = allowedOrigins;
if (
  config.NODE_ENV === 'production' &&
  (!config.WEB_ORIGIN.startsWith('https://') || config.JWT_SECRET.startsWith('replace-'))
)
  throw new Error('Production requires HTTPS and a generated JWT secret.');
if (
  config.NODE_ENV === 'production' &&
  (!config.SMTP_USER || !config.SMTP_PASS || config.SMTP_HOST === 'localhost')
)
  throw new Error('Configure authenticated SMTP for production email verification.');
