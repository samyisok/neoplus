// NEO fork — keeping a transaction with its words (adr-008)
//
// Pure: it is given the book's paragraphs, its section claiming, and the text
// on loose or held cards, and decides keep / follow / retire. It never reads
// the page, and never writes anything but the ledger it was given.

'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NeoInventoryAnchor = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function normalizeText(text) {
    return typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
  }

  // FNV-1a over the normalised text: short, stable, and enough to answer "did
  // this section change?" without storing the section itself.
  function hashText(text) {
    const source = normalizeText(text);
    let hash = 0x811c9dc5;
    for (let i = 0; i < source.length; i += 1) {
      hash ^= source.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function normalizeQuote(text) {
    return normalizeText(text);
  }

  function chapterById(book, id) {
    return (book.chapters || []).find((chapter) => chapter.id === id) || null;
  }

  function sectionOf(chapter, sectionId) {
    if (!sectionId) return null;
    return (chapter.sections || []).find((section) => section.id === sectionId) || null;
  }

  function sectionParagraphs(chapter, section) {
    if (!section) return [];
    return (section.paragraphs || []).map((index) => chapter.paragraphs[index] || '').filter(Boolean);
  }

  function nearestParagraph(paragraphs, quote, prefer) {
    const hits = [];
    for (let i = 0; i < paragraphs.length; i += 1) {
      if (normalizeText(paragraphs[i]).includes(quote)) hits.push(i);
    }
    if (!hits.length) return -1;
    return hits.reduce((best, index) => (Math.abs(index - prefer) < Math.abs(best - prefer) ? index : best), hits[0]);
  }

  function anyCardHolds(book, quote) {
    return (book.cards || []).some((text) => normalizeText(text).includes(quote));
  }

  function chaptersHolding(book, quote) {
    return (book.chapters || []).filter((chapter) => chapter.paragraphs.some((text) => normalizeText(text).includes(quote)));
  }

  function reconcile(store, book, now = Date.now()) {
    const unknown = new Set(book.unknown || []);
    // A chapter we cannot read may hold any phrase; nothing is retired or moved
    // until the whole book is readable.
    if (unknown.size) return { store, changed: false };
    let changed = false;

    for (const transaction of store.transactions || []) {
      if (transaction.removedAt) continue;
      if (book.scope && transaction.chapterId !== book.scope) continue;
      const quote = normalizeQuote(transaction.quote);
      if (!quote) continue;

      const home = chapterById(book, transaction.chapterId);
      const homeSection = home ? sectionOf(home, transaction.sectionId) : null;

      // 1. The section has not changed: the hash answers in one comparison.
      if (homeSection) {
        const text = sectionParagraphs(home, homeSection).join(' ');
        if (hashText(text) === transaction.hash && normalizeText(text).includes(quote)) {
          const paragraph = nearestParagraph(home.paragraphs, quote, transaction.paragraph);
          if (paragraph >= 0 && paragraph !== transaction.paragraph) {
            transaction.paragraph = paragraph;
            changed = true;
          }
          continue;
        }
      }

      // 2. The section moved to another chapter and still holds the quote.
      if (transaction.sectionId) {
        const moved = (book.chapters || []).find((chapter) => sectionOf(chapter, transaction.sectionId));
        if (moved) {
          const movedSection = sectionOf(moved, transaction.sectionId);
          const text = sectionParagraphs(moved, movedSection).join(' ');
          if (normalizeText(text).includes(quote)) {
            const paragraphs = moved.paragraphs;
            const start = movedSection.paragraphs && movedSection.paragraphs.length ? movedSection.paragraphs[0] : 0;
            const paragraph = nearestParagraph(paragraphs, quote, start + transaction.paragraph);
            const next = {
              chapterId: moved.id,
              sectionId: movedSection.id,
              paragraph: paragraph < 0 ? transaction.paragraph : paragraph,
              hash: hashText(text)
            };
            if (next.chapterId !== transaction.chapterId || next.paragraph !== transaction.paragraph || next.hash !== transaction.hash) {
              Object.assign(transaction, next, { anchorAt: now });
              changed = true;
            }
            continue;
          }
        }
      }

      // 3. The same chapter still holds it, perhaps in another paragraph.
      if (home && home.paragraphs.some((text) => normalizeText(text).includes(quote))) {
        const paragraph = nearestParagraph(home.paragraphs, quote, transaction.paragraph);
        if (paragraph !== transaction.paragraph) {
          transaction.paragraph = paragraph;
          transaction.anchorAt = now;
          changed = true;
        }
        const section = paragraphHoldingSection(home, paragraph);
        if (section !== transaction.sectionId) {
          transaction.sectionId = section;
          transaction.anchorAt = now;
          changed = true;
        }
        continue;
      }

      // 4. Exactly one other chapter holds it: the words moved.
      const holders = chaptersHolding(book, quote);
      if (holders.length === 1) {
        const target = holders[0];
        const paragraph = nearestParagraph(target.paragraphs, quote, 0);
        const section = paragraphHoldingSection(target, paragraph);
        transaction.chapterId = target.id;
        transaction.sectionId = section;
        transaction.paragraph = paragraph < 0 ? 0 : paragraph;
        transaction.anchorAt = now;
        changed = true;
        continue;
      }
      if (holders.length > 1) continue; // ambiguous: keep the anchor, never guess

      // 5. Nothing in the chapters: a card still holding the words keeps them.
      if (anyCardHolds(book, quote)) continue;

      transaction.removedAt = now;
      transaction.anchorAt = now;
      changed = true;
    }

    return { store, changed };
  }

  function paragraphHoldingSection(chapter, paragraph) {
    if (paragraph < 0) return '';
    for (const section of chapter.sections || []) {
      if ((section.paragraphs || []).includes(paragraph)) return section.id;
    }
    return '';
  }

  return { normalizeText, normalizeQuote, hashText, reconcile, sectionParagraphs };
});
