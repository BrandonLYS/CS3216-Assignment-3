import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { Logo } from "@/shared/ui/logo";

export const alt = "PrismPM. Stand above the whole project. Project management with a memory.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";

export default async function Image() {
  // ImageResponse cannot resolve CSS variables; read the existing tokens at build time.
  const css = await readFile(join(process.cwd(), "src/app/globals.css"), "utf8");
  const color = (name: string) => {
    const value = css.match(new RegExp(`--color-${name}:\\s*([^;]+);`))?.[1];
    if (!value) throw new Error(`Missing design token: ${name}`);
    return value;
  };
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 72px",
        background: color("canvas"),
        color: color("ink"),
        borderLeft: `12px solid ${color("primary")}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", fontSize: 32, gap: 16 }}>
        <Logo size={44} color={color} />
        PrismPM
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ fontSize: 88, lineHeight: 1.05, letterSpacing: -3, maxWidth: 960 }}>
          Stand above the whole project.
        </div>
        <div style={{ fontSize: 30, color: color("ink-subtle") }}>Project management with a memory.</div>
      </div>
      <div
        style={{
          display: "flex",
          borderTop: `1px solid ${color("hairline")}`,
          paddingTop: 24,
          fontSize: 24,
          color: color("ink-muted"),
        }}
      >
        Tasks. Decisions. Evidence. One connected workspace.
      </div>
    </div>,
    size,
  );
}
