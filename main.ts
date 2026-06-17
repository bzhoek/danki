#!/usr/bin/env deno -W=. -E=OPENAI_API_KEY,OPENAI_BASE_URL,OPENAI_ORG_ID,OPENAI_PROJECT_ID,OPENAI_WEBHOOK_SECRET,OPENAI_LOG,DEBUG,CLICOLOR_FORCE -N=api.openai.com:443,127.0.0.1:8765
// deno-lint-ignore-file no-explicit-any

import {Command} from "commander";
import {complete, insert_onyomis, speech} from "./src/lib.ts";
import {
  ApplyOptions, clean_nbsp, flag_cards, flag_ease, generate_notes,
  generate_speech,
  generate_target,
  hint, inbox_notes, move_cards, na_adjectives,
  onyomi,
  simple_sentence,
  translate, word_break
} from "./src/actions.ts";

const cli = new Command();
cli
  .description("A CLI for managing Anki and generate Japanese sentences using OpenAI's GPT-4o")
  .version("0.0.2");

function sub_command(command: string, description: string) {
  return cli.command(command).description(description)
}

sub_command("clean", "Replace nbsp").action(clean_nbsp);

const only_noop: ApplyOptions = {force: false, noop: true};
const force_noop: ApplyOptions = {force: true, noop: true};
function query_apply(command: string, description: string, action: (...args: any[]) => void, options: ApplyOptions = force_noop): Command {
  const subcmd = sub_command(command, description)
    .option("-n, --noop", "Non-destructive dry-run")
    .argument("<query>", "query")
    .action(action)
  if (options.force) {
    subcmd.option("-f, --force", "Overwrite existing translation")
  }
  return subcmd
}

query_apply("ease", "Flag card as orange", flag_ease, only_noop)
  .requiredOption("--ease <ease>", "Ease level to flag")
  .requiredOption("--flag <flag>", "Flag number, 0 = remove")
query_apply("flag", "Flag card as orange", flag_cards, only_noop)
  .argument("<flag>", "Flag number, 0 = remove")
query_apply("move", "Move cards to deck", move_cards, only_noop)
  .argument("<deck>", "Target deck")
query_apply("inbox", "Move cards of matching notes to Inbox", inbox_notes, only_noop);

query_apply("generate", "Generate target sentence as definition list", generate_target);
query_apply("notes", "Generate notes based on used kanji", generate_notes);
query_apply("hint", "Create hint from target", hint);
query_apply("onyomi", "Convert hiragana to katakana", onyomi);
query_apply("speech", "Add speech from target in context", generate_speech);
query_apply("translate", "Add translation to target as definition", translate);
query_apply("break", "Add zero-width spaces to target", word_break);
query_apply("na", "Check na-adjectives", na_adjectives);

function prompt_apply(command: string, description: string, transform: (...args: any[]) => string): Command {
  return sub_command(command, description)
    .action(async (args) => {
      const completion = await complete(transform(args));
      console.log(completion);
    })
}

const prompt_verb = (command: string, description: string, transform: (...args: any[]) => string) =>
  prompt_apply(command, description, transform)
    .argument("<verb>", "verb")

prompt_verb("it", "Intransitive pair of verb", (verb) =>
  `beantwoord met ja of nee of er een 自動詞 van ${verb} bestaat en wat dat woord is`,
)

prompt_verb("tt", "Transitive pair of verb", (verb) =>
  `beantwoord met ja of nee of er een 他動詞 van ${verb} bestaat en wat dat woord is`
)

const prompt_word = (command: string, description: string, transform: (...args: any[]) => string) =>
  prompt_apply(command, description, transform)
    .argument("<word>", "word");

const additional = `Use one line for the sentence and one line for the translation.`;
prompt_word("daily", "An everyday short sentence", (word) =>
  `Give an everyday short sentence (without pronouns) in Japanese kanji that uses the word ${word} in a common way. ${additional}`
)

prompt_word("memo", "An everyday short sentence", (word) =>
  `Suggest a short and memorable Japanese sentence (without pronouns) with kanji that uses the word ${word} in a typical way. ${additional}`
)

prompt_word("simple", "A simple sentence", simple_sentence);

const prompt_sentence = (command: string, description: string, transform: (...args: any[]) => string) =>
  prompt_apply(command, description, transform)
    .argument("<sentence>", "sentence")

prompt_sentence("kanjify", "Rewrite with kanji", (sentence) =>
  `Rewrite with kanji ${sentence}`
)

prompt_sentence("split", "Split sentence into comma-separated words", (sentence) =>
  `Split the sentence "${sentence}" into separate words and only respond with the CSV`,
)


cli.command("tts")
  .description("Save sentence as audio")
  .argument("<sentence>", "sentence")
  .requiredOption("-o, --output <file>", "output file")
  .action(async (sentence, opts) => {
    await speech(sentence, opts.output);
    console.log("Wrote", sentence, "to", opts.output);
  });

// TODO: this is not functional
cli.command("insert")
  .description("Insert missing On'yomi notes from list of words")
  .argument("<words>", "Words as comma-separated list")
  .action(async (words) => {
    await insert_onyomis(words);
  });

cli.parse();
