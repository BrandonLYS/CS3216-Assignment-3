import { Logo } from "@/shared/ui/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="mb-8 flex items-center gap-2">
        <Logo className="size-6" />
        <span className="text-body font-medium tracking-[-0.2px]">Vantage</span>
      </div>
      <div className="w-full max-w-sm panel p-6">{children}</div>
    </main>
  );
}
