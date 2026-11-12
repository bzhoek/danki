import { expandGlob } from "jsr:@std/fs";
import * as path from "node:path";
import showdown from "showdown";

const MEDIA =
  "/Users/bas/Library/Application Support/Anki2/User 1/collection.media";

export async function processMdFiles(directory: string) {
  for await (const entry of expandGlob(`${directory}/**/*.md`)) {
    if (entry.isFile) {
      const { name } = path.parse(entry.path);
      const html_path = path.format({ dir: MEDIA, name: `_${name}`, ext: ".html" });

      const original = await Deno.stat(entry.path);
      const derived = await Deno.stat(html_path).catch(() => ({
        mtime: undefined,
      }));

      let overwrite = true;
      if (original.mtime && derived.mtime) {
        overwrite = original.mtime.getTime() > derived.mtime.getTime();
      }

      console.log(entry.name, original.mtime, derived.mtime);

      if (overwrite) {
        let text = await Deno.readTextFile(entry.path);
        let converter = new showdown.Converter();
        converter.setOption("tables", "true");
        let html = converter.makeHtml(text);
        let ts = Date.now();
        await Deno.writeTextFile(html_path, html);
        console.log("Updated", html_path);
      }
    }
  }
}
