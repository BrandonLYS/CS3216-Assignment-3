/** Regenerate src/app/favicon.ico from the shared Logo and the design tokens. */
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Logo } from "../src/shared/ui/logo";

async function main() {
  const css = await readFile("src/app/globals.css", "utf8");
  const tokens = new Map([...css.matchAll(/(--color-[\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2]]));
  const svg = renderToStaticMarkup(createElement(Logo)).replace(/var\((--color-[\w-]+)\)/g, (_, name: string) => {
    const value = tokens.get(name);
    if (!value) throw new Error(`Missing design token: ${name}`);
    return value;
  });
  const browser = await chromium.launch();
  try {
    const frames: Buffer[] = [];
    const sizes = [16, 32, 48, 64];
    for (const size of sizes) {
      const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
      await page.setContent(`<style>body{margin:0}svg{display:block;width:100%;height:100%}</style>${svg}`);
      frames.push(await page.screenshot({ omitBackground: true }));
      await page.close();
    }
    const header = Buffer.alloc(6 + sizes.length * 16);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(sizes.length, 4);
    let offset = header.length;
    for (const [index, size] of sizes.entries()) {
      const entry = 6 + index * 16;
      header[entry] = size;
      header[entry + 1] = size;
      header.writeUInt16LE(1, entry + 4);
      header.writeUInt16LE(32, entry + 6);
      header.writeUInt32LE(frames[index].length, entry + 8);
      header.writeUInt32LE(offset, entry + 12);
      offset += frames[index].length;
    }
    await writeFile("src/app/favicon.ico", Buffer.concat([header, ...frames]));
  } finally {
    await browser.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
