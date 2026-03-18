import { Database } from "bun:sqlite";
import { strToU8, zipSync } from "fflate";

export function buildAnkiPackage(
  deckName: string,
  cards: { front: string; back: string }[],
): Uint8Array {
  const now = Math.floor(Date.now() / 1000);
  const deckId = Date.now();
  const modelId = deckId + 1;

  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE col (
      id integer primary key, crt integer not null, mod integer not null,
      scm integer not null, ver integer not null, dty integer not null,
      usn integer not null, ls integer not null, conf text not null,
      models text not null, decks text not null, dconf text not null,
      tags text not null
    );
    CREATE TABLE notes (
      id integer primary key, guid text not null, mid integer not null,
      mod integer not null, usn integer not null, tags text not null,
      flds text not null, sfld integer not null, csum integer not null,
      flags integer not null, data text not null
    );
    CREATE TABLE cards (
      id integer primary key, nid integer not null, did integer not null,
      ord integer not null, mod integer not null, usn integer not null,
      type integer not null, queue integer not null, due integer not null,
      ivl integer not null, factor integer not null, reps integer not null,
      lapses integer not null, left integer not null, odue integer not null,
      odid integer not null, flags integer not null, data text not null
    );
    CREATE TABLE revlog (
      id integer primary key, cid integer not null, usn integer not null,
      ease integer not null, ivl integer not null, lastIvl integer not null,
      factor integer not null, time integer not null, type integer not null
    );
    CREATE TABLE graves (
      usn integer not null, oid integer not null, type integer not null
    );
    CREATE INDEX ix_notes_usn on notes (usn);
    CREATE INDEX ix_cards_usn on cards (usn);
    CREATE INDEX ix_cards_nid on cards (nid);
    CREATE INDEX ix_cards_sched on cards (did, queue, due);
    CREATE INDEX ix_revlog_usn on revlog (usn);
    CREATE INDEX ix_revlog_cid on revlog (cid);
  `);

  const models = {
    [modelId]: {
      id: modelId,
      name: "Basic",
      type: 0,
      mod: now,
      usn: -1,
      sortf: 0,
      did: null,
      tmpls: [
        {
          name: "Card 1",
          ord: 0,
          qfmt: "{{Front}}",
          afmt: "{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}",
          did: null,
          bqfmt: "",
          bafmt: "",
        },
      ],
      flds: [
        {
          name: "Front",
          ord: 0,
          sticky: false,
          rtl: false,
          font: "Arial",
          size: 20,
          media: [],
        },
        {
          name: "Back",
          ord: 1,
          sticky: false,
          rtl: false,
          font: "Arial",
          size: 20,
          media: [],
        },
      ],
      css: ".card { font-family: arial; font-size: 20px; text-align: center; color: black; background-color: white; }",
      latexPre:
        "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
      latexPost: "\\end{document}",
      tags: [],
      vers: [],
    },
  };

  const decks = {
    "1": {
      id: 1,
      name: "Default",
      extendRev: 50,
      usn: 0,
      collapsed: false,
      newToday: [0, 0],
      revToday: [0, 0],
      lrnToday: [0, 0],
      timeToday: [0, 0],
      dyn: 0,
      conf: 1,
      desc: "",
      mod: now,
    },
    [deckId]: {
      id: deckId,
      name: deckName,
      extendRev: 50,
      usn: -1,
      collapsed: false,
      newToday: [0, 0],
      revToday: [0, 0],
      lrnToday: [0, 0],
      timeToday: [0, 0],
      dyn: 0,
      conf: 1,
      desc: "",
      mod: now,
    },
  };

  const dconf = {
    "1": {
      id: 1,
      name: "Default",
      replayq: true,
      lapse: {
        leechFails: 8,
        minInt: 1,
        delays: [10],
        leechAction: 0,
        mult: 0,
      },
      rev: {
        perDay: 100,
        fuzz: 0.05,
        ivlFct: 1,
        maxIvl: 36500,
        ease4: 1.3,
        bury: true,
        minSpace: 1,
      },
      timer: 0,
      maxTaken: 60,
      usn: 0,
      new: {
        perDay: 20,
        delays: [1, 10],
        separate: true,
        ints: [1, 4, 7],
        initialFactor: 2500,
        bury: true,
        order: 1,
      },
      mod: now,
      autoplay: true,
    },
  };

  const conf = {
    activeDecks: [1],
    curDeck: 1,
    newSpread: 0,
    collapseTime: 1200,
    timeLim: 0,
    estTimes: true,
    dueCounts: true,
    curModel: null,
    nextPos: 1,
    sortType: "noteFld",
    sortBackwards: false,
  };

  db.run("INSERT INTO col VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", [
    1,
    now,
    now,
    now,
    11,
    0,
    -1,
    0,
    JSON.stringify(conf),
    JSON.stringify(models),
    JSON.stringify(decks),
    JSON.stringify(dconf),
    "{}",
  ]);

  const insertNote = db.prepare(
    "INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?)",
  );
  const insertCard = db.prepare(
    "INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  );

  for (let i = 0; i < cards.length; i++) {
    const noteId = deckId + 1000 + i;
    const cardId = noteId + 500000;
    const { front, back } = cards[i];
    insertNote.run(
      noteId,
      `g${noteId}`,
      modelId,
      now,
      -1,
      " ",
      `${front}\x1f${back}`,
      front,
      0,
      0,
      "",
    );
    insertCard.run(
      cardId,
      noteId,
      deckId,
      0,
      now,
      -1,
      0,
      0,
      i + 1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      "",
    );
  }

  const dbBytes = db.serialize();
  db.close();

  return zipSync({
    "collection.anki2": [dbBytes, { level: 0 }],
    media: [strToU8("{}"), { level: 0 }],
  });
}
