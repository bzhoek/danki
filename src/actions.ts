// deno-lint-ignore-file no-explicit-any
import {loadDefaultJapaneseParser} from "budoux";
import {anki_post, anki_query, complete, is_jukugo, to_katakana, update_fields,} from "./lib.ts";
import {dl, extractXPaths} from "./dom.ts";

const breaks = loadDefaultJapaneseParser();

export const simple_sentence = (word: string) => 
  `Geef in eenvoudig Japans een herkenbare en specifieke voorbeeldzin, zonder persoonlijk voornaamwoord, met het woord: ${word}. Gebruik één regel voor de Japanse zin en één regel voor de Nederlandse vertaling.`;

export type ApplyOptions = {
  force: boolean;
  noop: boolean;
};

// use existing google speech generation
export const generate_speech = async (query: string, options: any) => {
  const results = await anki_query(query, "target", "context");

  with_dl_doc(results, async (result, doc) => {
    if (doc === undefined || doc.dt.length < 2) {
      console.log("Skipping empty target:", result.target);
      return;
    }
  });
}

export const inbox_notes = async (query: string, options: ApplyOptions) => {
  const results = await anki_query(query);
  for (const result of results) {
    await move_cards(`nid:${result.id}`, "0-Inbox", options);
  }
};

export const move_cards = async (query: string, deck: string, options: ApplyOptions) => {
  const cards = await anki_post("findCards", {query: query});
  if (cards.result) {
    console.log("Matches", cards.result.length, "cards", cards.result);
    const moved = await anki_post("changeDeck", {cards: cards.result, deck: deck}, options.noop);
    if (cards.result.length > 0 && moved && moved.result == null) {
      console.log("Moved", cards.result.length, "cards to", deck);
    }
  }
};

export const generate_target = async (query: string, options: ApplyOptions) => {
  const results = await anki_query(query, "kanji", "target");
  
  with_dl_doc(results, async (result, doc) => {
    if (doc && doc.dd.length > 1) {
      if (!options.force) {
        console.log("Skipping existing target:", result.target);
        return;
      }
      console.log("Forcing new target:", result.target);
    }

    const completion = await complete(simple_sentence(result.kanji));
    if (completion === null) {
      return;
    }

    const lines = completion.replace("。", "").split("\n");
    const fields = {
      target: `<dl><dt>${lines[0].trim()}</dt><dd>${lines[1]}</dd></dl>`,
    };
    await update_fields(result.id, fields, options.noop);
  });
};

type FieldMap = Record<string, string>;
const NOTES: FieldMap = {
  "kanji": "notes",
  "1reading": "1notes",
  "2reading": "2notes",
};

export const generate_notes = async (query: string, options: ApplyOptions) => {
  const results = await anki_query(query, ...[...Object.keys(NOTES), ...Object.values(NOTES)]);
  
  for (const result of results) {
    const readings = Object.keys(result).filter(k => NOTES[k]);
    
    const changes = {}
    for (const reading of readings) {
      const notes = NOTES[reading];
      const value = result[notes];
      if (value?.length > 0) {
        if(!options.force) {
          console.warn("Skipping existing notes for", reading, ":", value);
          continue;
        }
        console.warn("Force overwriting notes for", reading, ":", value);
      }

      const kanjis = result[reading].replaceAll(/[^一-龘]/g, "");
      const mapped = [...kanjis].map((kanji: string) => {
        return kanji_notes(kanji);
      });
      const meanings = await Promise.all(mapped);
      Object.assign(changes, {[notes]: meanings.join(" ")});
    }

    if (Object.keys(changes).length > 0) {
      await update_fields(result.id, changes, options.noop);
    }
  }
};

async function kanji_notes(kanji: string): Promise<string> {
  const results = await anki_query(`(note:OnYomi or note:KunYomi or note:OnKanji) kanji:${kanji}`, "meaning");

  return results.map((result: any) => `<b>${result.meaning}</b> ${kanji}`) ?? ""
}

export const hint = async (query: string, options: any) => {
  const results = await anki_query(query, "kanji", "target", "hint");

  with_dl_doc(results, async (result, doc) => {
    if (doc.dt.length > 0 && (result.hint.length === 0 || options.force)) {
      const hint = hide_kanji(doc.dt, result.kanji);
      await update_fields(result.id, {hint: hint}, options.noop);
    }
  });
};

function hide_kanji(sentence: string, kanji: string): string {
  const placeholder = "・".repeat(kanji.length);
  return sentence
    .replace(kanji, placeholder)
    .replace(/<i>.*/g, "")
    .trim();
}

const ZWSP = "\u200B"; // zero-width space

export const word_break = async (query: string, options: any) => {
  const results = await anki_query(query, "kanji", "target", "hint");

  with_dl_doc(results, async (result, doc) => {
    if (doc.dt.includes(ZWSP) && !options.force) {
      console.warn("Already segmented:", doc.dt);
      return;
    }

    if (doc.dt.length < 8 || options.force) {
      console.warn("Skipping short:", doc.dt);
      return;
    }
    
    const clean = doc.dt.replaceAll(ZWSP, "");
    const target = breaks.parse(clean).join(ZWSP);
    const fields = {target: `<dl><dt>${target}</dt><dd>${doc.dd}</dd></dl>`};
    if (result.kanji?.length > 0) {
      const hint = hide_kanji(target, result.kanji);
      Object.assign(fields, {hint: hint});
    } else {
      console.error("Kanji missing", result.id);
    }
    await update_fields(result.id, fields, options.noop);
  });
};

function with_dl_doc(results: any, callback: (result: any, doc: any) => void) {
  for (const result of results) {
    const doc = extractXPaths(dl(result.target), {dt: "/dl/dt", dd: "/dl/dd"});
    if (doc === undefined) {
      console.error("Cannot parse:", result.target);
      continue;
    }
    callback(result, doc);
  }
}

export const onyomi = async (query: string, options: any) => {
  const results = await anki_query(query, "kana", "kanji", "meaning");

  for (const result of results) {
    const katakana = onyomi_note(result);

    if (katakana != null && (katakana != result.kana || options.force)) {
      await update_fields(result.id, {kana: katakana}, options.noop);
    }
  }
};

// NOTE: there is no on'yomi note that can end in な, it automatically becomes kun'yomi
export const onyomi_note = (result: any): string | null => {
  let kanji = result.kanji;
  // remove trailing な if also marked in meaning field
  if (result.meaning.includes("な") && kanji.endsWith("な")) {
    kanji = kanji.slice(0, -1);
  }

  if (!is_jukugo(kanji)) {
    console.warn("Not jukugo", kanji);
    return null;
  }

  // split before and after the period
  const matches = result.kana.match(/^([^.]*)(\..*)?$/);
  const kana = matches[1];
  const remainder = matches[2] ?? "";

  let katakana = to_katakana(kana);
  // restore trailing な if also marked in meaning field
  if (result.meaning.includes("な") && kana.endsWith("な")) {
    katakana = katakana.slice(0, -1) + "な";
  }
  return katakana + remainder;
}

export const translate = async (query: string, options: any) => {
  const results = await anki_query(query, "target", "details");
  
  with_dl_doc(results, async (result, doc) => {
    if (doc.dd.length > 1) {
      if (!options.force) {
        console.log("Skipping", result.id, "with translation", doc.dd)
        return;
      }
      console.log("Overwriting", result.id, "with translation", doc.dd)
    }

    const fields = {}
    const details = result.details.split("<br>")
    let translation: string;
    if (result.details.startsWith(doc.dd) && details.length >= 2) {
      translation = result.details.split("<br>")[1];
      Object.assign(fields, {details: ""});
    } else {
      console.error("Cannot use details", result.id, result.details);
      translation = await complete(
        `Vertaal in het Nederlands in één beknopte zin: ${result.target}`,
      ) ?? "";
    }

    Object.assign(fields, {target: `<dl><dt>${doc.dt}</dt><dd>${translation}</dd></dl>`});
    await update_fields(result.id, fields, options.noop);
  });
}
