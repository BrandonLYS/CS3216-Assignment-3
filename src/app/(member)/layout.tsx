import { Logo } from "@/shared/ui/logo";

/**
 * The Participant's entrances: accepting an invite and the messaging login. Modelled on the
 * `(auth)` layout and, like it, carrying none of PrismPM's navigation - a Person never sees
 * the product, only the messages of one Project (ADR 0009).
 */
export default function MemberLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="mb-8 flex items-center gap-2">
        <Logo className="size-6" />
        <span className="text-body font-medium tracking-[-0.2px]">PrismPM</span>
      </div>
      <div className="w-full max-w-sm panel p-6">{children}</div>
    </main>
  );
}
