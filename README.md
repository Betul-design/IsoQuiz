# ISO Incident Pro — Modular Version v6

This version is split into separate files and includes a configurable setup screen.

## File structure

```text
iso-incident-modular-v6-40q/
├─ index.html
├─ README.md
├─ assets/
│  ├─ css/
│  │  └─ styles.css
│  └─ js/
│     └─ app.js
└─ data/
   └─ questions.js
```

## What changed in v6

- New setup screen before the game starts.
- Selectable topics.
- Selectable question types: Scenario, Match, Fill Blank, Order.
- Selectable question count.
- Shuffle on/off option.
- Back button:
  - On question 1: returns to setup.
  - On later questions: returns to the previous question.
- HP/can bar is removed.
- Fill Blank now always shows correct answers after checking.
- Answer state is preserved when moving back and forward.
- Question bank is separated in `data/questions.js` and now contains 40 questions.

## How questions are loaded

The game reads questions from:

```js
window.QUESTION_BANK.questions
```

The setup screen filters that bank by:

```js
question.topics
question.type
```

Then it pulls the selected number of questions.

## Adding a new question

Add a new object to `window.QUESTION_BANK.questions` in `data/questions.js`.

Required fields depend on type:

- `scenario`: `choices`
- `match`: `pairs`
- `fill`: `sentences`, `wordBank`
- `sort`: `items`

Also add:

```js
topics: ['planning']
```

or map the question title in `QUESTION_TOPIC_MAP`.


## Random question selection

The setup screen first filters the bank by selected topics and question types. Then `pickRandomQuestions()` shuffles that filtered pool and takes the requested number of questions, capped at 40.

```js
function pickRandomQuestions(pool, requestedCount, shuffleEnabled = true){
  const limit = Math.min(MAX_QUESTION_COUNT, Math.max(1, requestedCount), pool.length);
  const source = shuffleEnabled ? shuffleCopy(pool) : [...pool];
  return source.slice(0, limit);
}
```

This means choosing the same topic can still produce different questions on different runs, as long as Shuffle is enabled and the filtered pool contains more questions than the selected quiz count.
