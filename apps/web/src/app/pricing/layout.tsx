import { NextAuthProvider } from "~/providers/next-auth";

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <NextAuthProvider>
      <div className="min-h-screen bg-background">
        <header className="border-b">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <a href="/" className="text-lg font-semibold">
              moSend
            </a>
            <nav className="flex gap-4 text-sm text-muted-foreground">
              <a href="/login" className="hover:text-foreground">
                Iniciar sesión
              </a>
              <a href="/signup" className="hover:text-foreground">
                Registrarse
              </a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-12">{children}</main>
      </div>
    </NextAuthProvider>
  );
}
