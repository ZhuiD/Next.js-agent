import { z } from 'zod';

export const authBodySchema = z.object({
  email: z.string().email('邮箱格式不正确'),
  password: z.string().min(6, '密码至少 6 位'),
});

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
