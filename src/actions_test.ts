import {assertEquals, assertExists} from "https://deno.land/std/assert/mod.ts";
import {describe, it} from "https://deno.land/std/testing/bdd.ts";
import {break_words, onyomi_note, transfer_breaks} from "./actions.ts";
import {cloze_sentence} from "./lib.ts";

describe("On'yomi conversion", () => {
  it("leaves な alone", () => {
    const result = onyomi_note({
      meaning: "mooi な",
      kanji: "綺麗な",
      kana: "きれいな",
    });
    assertEquals(result, "キレイな");
  })
})

describe("Word breaking", () => {
  it("breaks hiragana", () => {
    const cloze = "じゃないみたいです";
    const broken = break_words(cloze, "/");
    assertEquals(broken, "じゃないみたい/です");
  })
  it("breaks spanning elements", () => {
    const cloze = "ひらがなで書{{c1::いていただけませんか::beleefd verzoek}}";
    const sentence = cloze_sentence(cloze);
    assertExists(sentence);
    assertEquals(sentence, "ひらがなで書いていただけませんか");
    const broken = break_words(sentence, "/");
    assertEquals(broken, "ひらがなで/書いていただけませんか");
    const merged = transfer_breaks(cloze, broken, "/");
    assertEquals(merged, "ひらがなで/書{{c1::いていただけませんか::beleefd verzoek}}");
  })
  it("breaks all elements", () => {
    const cloze = "リンさんは歌が上手{{c1::じゃないみたいです::じゃないです het lijkt}}";
    const sentence = cloze_sentence(cloze);
    assertExists(sentence);
    assertEquals(sentence, "リンさんは歌が上手じゃないみたいです");
    const broken = break_words(sentence, "/");
    assertEquals(broken, "リンさんは/歌が/上手じゃないみたい/です");
    const merged = transfer_breaks(cloze, broken, "/");
    assertEquals(merged, "リンさんは/歌が/上手{{c1::じゃないみたい/です::じゃないです het lijkt}}");
  })
  it("breaks suffix", () => {
    const cloze = "あまり寝なかった{{c1::から::reden}}、疲れています";
    const sentence = cloze_sentence(cloze);
    assertExists(sentence);
    assertEquals(sentence, "あまり寝なかったから、疲れています");
    const broken = break_words(sentence, "/");
    assertEquals(broken, "あまり寝なかったから、/疲れています");
    const merged = transfer_breaks(cloze, broken, "/");
    assertEquals(merged, "あまり寝なかった{{c1::から::reden}}、/疲れています");
  })
})
