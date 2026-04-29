import { assertEquals } from "https://deno.land/std/assert/mod.ts";
import { describe, it } from "https://deno.land/std/testing/bdd.ts";
import { onyomi_note } from "./actions.ts";

describe("On'yomi conversion", () => {
  it("leaves な alone", () => {
    const result = onyomi_note({
      meaning: "mooi な",
      kanji: "綺麗な",
      kana: "きれいな",
    });
    assertEquals("キレイな", result);
  })
})
