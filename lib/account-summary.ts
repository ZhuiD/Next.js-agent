import { prisma } from '@/lib/prisma';
import { getUserRateLimitStatus } from '@/lib/user-rate-limit';

export async function getAccountSummary(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      plan: true,
    },
  });

  if (!user) return null;

  const quota = await getUserRateLimitStatus(user.id, user.plan);

  return {
    user,
    quota,
    model: process.env.DASHSCOPE_MODEL ?? null,
  };
}
