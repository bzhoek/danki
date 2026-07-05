import {assertEquals, assertExists} from "https://deno.land/std/assert/mod.ts";
import {describe, it} from "https://deno.land/std/testing/bdd.ts";
import {break_words, onyomi_note, transfer_breaks} from "./actions.ts";
import {CLOZE1_RE} from "./lib.ts";

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


function cloze_sentence(cloze: string): string | null {
  const match = cloze.match(CLOZE1_RE);
  if (match) {
    return match[1] + match[3];
  }
  return null;
}

describe("Word breaking", () => {
  it("breaks hiragana", () => {
    const cloze = "じゃないみたいです";
    const broken = break_words(cloze, "/");
    assertEquals("じゃないみたい/です", broken);
  })
  it("breaks spanning elements", () => {
    const cloze = "ひらがなで書{{c1::いていただけませんか::beleefd verzoek}}";
    const sentence = cloze_sentence(cloze);
    assertExists(sentence);
    assertEquals("ひらがなで書いていただけませんか", sentence);
    const broken = break_words(sentence, "/");
    assertEquals("ひらがなで/書いていただけませんか", broken);
    const merged = transfer_breaks(cloze, broken, "/");
    assertEquals("ひらがなで/書{{c1::いていただけませんか::beleefd verzoek}}", merged);
  })
  it("breaks all elements", () => {
    const cloze = "リンさんは歌が上手{{c1::じゃないみたいです::じゃないです het lijkt}}";
    const sentence = cloze_sentence(cloze);
    assertExists(sentence);
    assertEquals("リンさんは歌が上手じゃないみたいです", sentence);
    const broken = break_words(sentence, "/");
    assertEquals("リンさんは/歌が/上手じゃないみたい/です", broken);
    const merged = transfer_breaks(cloze, broken, "/");
    assertEquals("リンさんは/歌が/上手{{c1::じゃないみたい/です::じゃないです het lijkt}}", merged);
  })
})
