import Image from "next/image";

import { LoginAuthPanel } from "@/app/login/LoginAuthPanel";
import { Logo } from "@/components/ui/Logo";

/** Privileged dashboard entry: sign-in only, with no public sign-up transfer. */
export default function LoginPage() {
  return (
    <div className="min-h-dvh bg-canvas px-4 py-4 md:px-8 md:py-8">
      <main
        id="main-content"
        className="mx-auto grid min-h-[calc(100dvh-2rem)] w-full max-w-6xl overflow-hidden rounded-[var(--radius-xl)] border border-outline-subtle bg-surface shadow-sheet md:min-h-[calc(100dvh-4rem)] lg:grid-cols-[minmax(0,1.08fr)_minmax(24rem,0.92fr)]"
      >
        <section className="flex min-w-0 flex-col bg-surface-variant p-6 md:p-8 lg:p-12">
          <Logo />
          <div className="flex min-h-0 flex-1 items-center justify-center py-6">
            <Image
              src="/illustrations/gridgo-portal-workers.svg"
              width={816}
              height={766}
              priority
              alt="GRIDGO operations team coordinating work"
              className="h-auto max-h-[15rem] w-full max-w-[34rem] object-contain md:max-h-[22rem] lg:max-h-[26rem]"
            />
          </div>
          <div className="max-w-xl">
            <p className="text-overline m-0 uppercase text-text-muted">GRIDGO portal</p>
            <h1 className="text-h2 m-0 mt-2 text-text-primary">
              Partner and operations portal
            </h1>
            <p className="text-body-lg m-0 mt-3 text-text-secondary">
              Sign in with the Google account or email and password already connected to
              your GRIDGO access.
            </p>
          </div>
        </section>

        <section className="flex min-w-0 items-center justify-center p-6 md:p-10 lg:p-12">
          <div className="flex w-full max-w-md flex-col gap-4">
            <div className="flex flex-col gap-2">
              <p className="text-overline m-0 uppercase text-text-muted">
                Authorized accounts only
              </p>
              <h2 className="text-h2 m-0 text-text-primary">Welcome back.</h2>
              <p className="text-body m-0 text-text-secondary">
                Portal access is assigned by GRIDGO Operations. New privileged accounts
                cannot be created here.
              </p>
            </div>
            <LoginAuthPanel />
          </div>
        </section>
      </main>
    </div>
  );
}
