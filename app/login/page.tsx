import { Suspense } from 'react';
import LoginForm from './login-form';

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-dvh max-w-md items-center justify-center px-4">
          <p className="text-sm text-zinc-500">加载中…</p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
