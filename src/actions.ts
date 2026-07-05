// deno-lint-ignore-file no-explicit-any
import {loadDefaultJapaneseParser} from "budoux";
import {
  anki_named_query,
  anki_notes,
  anki_post,
  anki_query, cloze_parts,
  complete,
  is_jukugo,
  to_katakana,
  update_fields,
} from "./lib.ts";
import {dl, extractXPaths} from "./dom.ts";

const breaks = loadDefaultJapaneseParser();

export const simple_sentence = (word: string) =>
  `Geef een natuurlijke Japanse voorbeeldzin met het woord: "${word}, zonder het woord te herhalen. Het liefst tussen 10 en 20 tekens en met een werkwoord en een partikel. Gebruik geen persoonlijk voornaamwoord. Gebruik één regel voor de Japanse zin en één regel voor de Nederlandse vertaling.`;

export type ApplyOptions = {
  force: boolean;
  noop: boolean;
};

// use existing google speech generation
export const generate_speech = async (query: string, options: any) => {
  const results = await anki_query(query, "target", "context");

  with_dl_docs(results, async (result, doc) => {
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

export const flag_cards = async (query: string, flag: string, options: ApplyOptions) => {
  const cards = await anki_post("findCards", {query: query});
  console.log("Matches", cards.result.length, "cards", cards.result);

  for (const card of cards.result) {
    const result = await anki_post("setSpecificValueOfCard", {
      card: card,
      keys: ["flags"],
      newValues: [parseInt(flag, 10)]
    }, options.noop);
    if (Array.isArray(result.result[0])) {
      console.error(result);
    }
  }
};

export const flag_ease = async (query: string, options: any) => {
  const flag = parseInt(options.flag, 10);
  
  const cards = await anki_post("findCards", {query: query});
  console.log("Matches", cards.result.length, "cards", cards.result);

  const reviews = await anki_post("getReviewsOfCards", {cards: cards.result}, options.noop);
  
  for (const card of cards.result) {
    const review = reviews.result[card];
    const last = review[review.length - 1];
    // console.log(last)
    if (last.type === 0) {
      console.log("Learning", card, "skipping...");
      continue;
    }
    if (last.ease !== options.ease) {
      console.log("At ease", last.ease, "for", card, "skipping...");
      continue;
    }
    console.log("Setting", card, "to", flag);
    const result = await anki_post("setSpecificValueOfCard", {
      card: card,
      keys: ["flags"],
      newValues: [flag]
    }, options.noop);
    if (Array.isArray(result.result[0])) {
      console.error(result);
    }
  }
};

export const generate_target = async (query: string, options: ApplyOptions) => {
  const results = await anki_query(query, "kanji", "kana", "target");
  
  with_dl_docs(results, async (result, doc) => {
    if (doc && doc.dd.length > 1) {
      if (!options.force) {
        console.log("Skipping existing target:", result.target);
        return;
      }
      console.log("Forcing new target:", result.target);
    }

    const word = either(result.kanji, result.kana);
    const completion = await complete(simple_sentence(word));
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
  const results = await anki_named_query("Hint", query, "kanji", "kana", "meaning", "target", "hint");

  with_dl_docs(results, async (result, doc) => {
    if (doc.dt.length > 0 && (result.hint.length === 0 || options.force)) {
      const clean_kanji = drop_na(result.kanji, result.meaning);
      const replacement = either(clean_kanji, result.kana);
      const clean_target = doc.dt.replaceAll(ZWSP, "");
      const clean_hint = hide_kanji(clean_target, replacement);
      const break_hint = breaks.parse(clean_hint).join(ZWSP);
      await update_fields(result.id, {hint: break_hint}, options.noop);
    }
  });
};

function either(a: string, b: string) {
  return a.length > 0 ? a : b;
}

function hide_kanji(sentence: string, kanji: string): string {
  const placeholder = "・".repeat(kanji.length);
  return sentence
    .replace(kanji, placeholder)
    .replace(/<i>.*/g, "")
    .trim();
}

export const ZWSP = "\u200B"; // zero-width space

export const word_break = async (query: string, options: any) => {
  const results = await anki_query(query, "kanji", "target", "hint");

  with_dl_docs(results, async (result, doc) => {
    if (doc.dt.includes(ZWSP) && !options.force) {
      console.warn("Already segmented:", doc.dt);
      return;
    }

    if (doc.dt.length < 8 || options.force) {
      console.warn("Skipping short:", doc.dt);
      return;
    }
    
    const clean_target = doc.dt.replaceAll(ZWSP, "");
    const break_target = breaks.parse(clean_target).join(ZWSP);
    const fields = {target: `<dl><dt>${break_target}</dt><dd>${doc.dd}</dd></dl>`};
    if (result.kanji?.length > 0) {
      const clean_hint = result.hint.replaceAll(ZWSP, "");
      const break_hint = breaks.parse(clean_hint).join(ZWSP);
      Object.assign(fields, {hint: break_hint});
    } else {
      console.error("Kanji missing", result.id);
    }
    await update_fields(result.id, fields, options.noop);
  });
};

export const clean_nbsp = async () => {
  const results = await anki_notes("Unclean", "&nbsp;");
  for (const result of results) {
    const changes = {}
    for (const [key, value] of Object.entries(result.fields)) {
      if (value.value.includes("&nbsp")) {
        Object.assign(changes, {[key]: value.value.replaceAll("&nbsp;", " ")});
      }
    }
    if (Object.keys(changes).length > 0) {
      await update_fields(result.noteId, changes);
    }
  }
};

// inserts breaks from broken string into target by synchronizing index
export function transfer_breaks(target: string, broken:string, separator: string = ZWSP): string {
  let result = target;
  let i = 0;
  for (const char of broken) {
    if (char == separator) {
      result = insert_at(result, i + 1, separator);
    }
    while (result.charAt(i) !== char && i < target.length) {
      i++;
    }
  }
  return result;
}

function insert_at(original: string, index: number, char: string): string {
  return original.slice(0, index) + char + original.slice(index);
}

export const break_words = (sentence: string, separator: string = ZWSP): string => {
  const clean = sentence.replaceAll(separator, "");
  let broken = breaks.parse(clean).join(separator);
  if (broken.endsWith("です")) {
    broken = insert_at(broken, broken.length - 2, separator)
  }
  return broken;
}

function with_dl_docs(results: any, callback: (result: any, doc: any) => void, field: string = 'target') {
  for (const result of results) {
    with_dl_doc(result, callback)
  }
}

function with_dl_doc(result: any, callback: (result: any, doc: any) => void, field: string = 'target') {
  ['target', 'sentence'].forEach(field => {
    const value = result[field];
    if (value?.length > 0) {
      const doc = extractXPaths(dl(value), {dt: "/dl/dt", dd: "/dl/dd"});
      if (doc === undefined) {
        console.error("Cannot parse:", value);
      }
      callback(result, doc);
      return
    }
  })
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

const KANA_NOTES = /^([^.]*)(\..*)?$/;

export const nacs_adjectives = async (query: string, options: any) => {
  let words = query.split(",").map((s) => s.trim());
  for (const word of words) {
    const results = await anki_query(`kanji:${word}*`, "kana", "kanji", "meaning", "furigana");
    if (results.length === 0) {
      console.log("Don't have", word);
    }
    for (const result of results) {
      if (word + "な" === result.kanji) {
        console.log("Have", result.kanji);
      } else if (result.kanji !== word) {
        console.error("Different word", result.kanji, "from", word);
        continue;
      }
      await na_note(result, options);
    }
  }
}

export const na_adjectives = async (query: string, options: any) => {
  const results = await anki_query(query, "kana", "kanji", "meaning", "furigana");

  for (const result of results) {
    await na_note(result, options);
  }
}

const na_note = async (result: any, options: any) => {
  const fields = {}
  const matches = result.kana.match(KANA_NOTES);
  const kana = matches[1];
  const remainder = matches[2] ?? "";
  if (!kana.endsWith("な")) {
    Object.assign(fields, {kana: kana + "な" + remainder, speech: ""});
  }
  if (!result.kanji.endsWith("な")) {
    Object.assign(fields, {kanji: result.kanji + "な"});
  }
  if (!result.meaning.endsWith("な")) {
    Object.assign(fields, {meaning: result.meaning + " な"});
  }
  if (!result.furigana.endsWith("<ruby>な</ruby>")) {
    Object.assign(fields, {furigana: result.furigana + "<ruby>な</ruby>"});
  }

  if (Object.keys(fields).length > 0) {
    await update_fields(result.id, fields, options.noop);
  }
}

// remove trailing な if also marked in meaning field
function drop_na(kanji: string, meaning: string): string {
  if (meaning.includes("な") && kanji.endsWith("な")) {
    return kanji.slice(0, -1);
  }
  return kanji
}

// NOTE: there is no on'yomi note that can end in な, it automatically becomes kun'yomi
export const onyomi_note = (result: any): string | null => {
  const kanji = drop_na(result.kanji, result.meaning)

  if (!is_jukugo(kanji)) {
    console.warn("Not jukugo", kanji);
    return null;
  }

  // split before and after the period
  const matches = result.kana.match(KANA_NOTES);
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
  const results = await anki_query(query, "target", "details", "sentence");
  
  with_dl_docs(results, async (result, doc) => {
    if (doc.dd.length > 1) {
      if (!options.force) {
        console.log("Skipping", result.id, "with translation", doc.dd)
        return;
      }
      console.log("Overwriting", result.id, "with translation", doc.dd)
    }

    const fields = {}
    if (result.modelName === "Grammar") {
      const parts = cloze_parts(doc.dt);
      if(parts ?? false) {
        const target = parts[1] + parts[3]
        console.log("Translate", target);
        // const kanji_kana = /[^\u3000-\u30FF\u4e00-\u9fff\uff00-\uffef]/g; // (kana)(kanji)(full-half)
        const kanji_kana = "\\u3000-\\u30FF\\u4e00-\\u9fff\\uff00-\\uffef"; // (kana)(kanji)(full-half)
        const only_kanja = new RegExp(`[^${kanji_kana}]`, "gi");
        const example = target.replaceAll(only_kanja, "")
        const definition = await wrapTranslation(doc.dt, example);
        Object.assign(fields, {sentence: definition});
      }
    } else {
      const details = result.details.split("<br>")
      let definition = "";
      if (result.details.startsWith(doc.dd) && details.length >= 2) {
        definition = result.details.split("<br>")[1];
        Object.assign(fields, {details: ""});
      } else {
        console.error("Cannot use details", result.id, result.details);
        definition = await wrapTranslation(doc.dt, result.target);
      }
      Object.assign(fields, {target: definition});
    }

    await update_fields(result.id, fields, options.noop);
  });
}

async function wrapTranslation(definition: string, example: string): Promise<string> {
  let translation = await complete(
    `Vertaal in het Nederlands in één beknopte zin: ${example}`,
  ) ?? "";
  return `<dl><dt>${definition}</dt><dd>${translation}</dd></dl>`;
}
