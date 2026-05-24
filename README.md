## Usage

Anki CLI tool in Deno for Japanese learners to organize decks and generate examples using OpenAI's GPT-4o through 
[AnkiConnect][connect].

[connect]: https://git.sr.ht/~foosoft/anki-connect

```sh
open https://platform.openai.com/settings/profile?tab=api-keys
export OPENAI_API_KEY=sk-...

$ ./main.ts
Usage: main [options] [command]

A CLI for managing Anki and generate Japanese sentences using OpenAI's GPT-4o

Options:
  -h, --help                     display help for command

Commands:
  move [options] <query> <deck>  Move cards to deck
  inbox [options] <query>        Move cards of matching notes to Inbox
  generate [options] <query>     Generate target sentence as definition list
  hint [options] <query>         Create hint from target
  onyomi [options] <query>       Convert hiragana to katakana
  speech [options] <query>       Add speech from target in context
  translate [options] <query>    Add translation to target as definition
  
  it <verb>                      Intransitive pair of verb
  tt <verb>                      Transitive pair of verb
  daily <word>                   An everyday short sentence
  memo <word>                    A memorable short sentence
  simple <word>                  A simple sentence
  kanjify <sentence>             Rewrite with kanji
  tts [options] <sentence>       Save sentence as audio
  split <sentence>               Split sentence into comma-separated words
  insert <words>
  help [command]                 display help for command
```
