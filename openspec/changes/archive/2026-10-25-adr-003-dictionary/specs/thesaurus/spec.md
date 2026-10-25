# Spec Delta

## MODIFIED Requirements

### Requirement: Offline synonym lookup

The system SHALL resolve synonyms from data bundled with the application, without a network request, and SHALL return the senses recorded for the word.

- Lookup SHALL match the clicked word case-insensitively.
- When the exact form has no entry, lookup SHALL try a conservative fallback in this order: possessive `'s` / `’s`, plural `-s` / `-es` / `-ies`, past `-ed` / `-ied`, participle `-ing` / `-ying`, including consonant doubling (`batting` → `bat`). A base form SHALL be used only when it has an entry.
- A successful lookup SHALL return the recorded senses, each with its part of speech and, where the source marks one, its relation to the clicked word: broader term, similar term, related term, or antonym.
- A relation marker SHALL never be part of a word: what the writer sees as a word is only the word.
- Each word SHALL appear once across the whole entry, and the clicked word itself SHALL never be offered.
- When removing the clicked word leaves no synonyms at all, the system SHALL treat the word as having none.
- A word with no entry SHALL produce a short message naming the word, and SHALL NOT open an empty synonym window.
- Lookup SHALL answer within 150 ms once the data for that word's first letter is in memory, and the first lookup for a letter SHALL answer within 500 ms from a local disk.
- Lookup SHALL remain correct when the application is packaged and when the machine is offline.
- The bundled data SHALL be the Open English WordNet 2025 edition, derived from Princeton WordNet: synonyms from a synset's members, broader terms from its direct hypernyms, similar terms from its `similar` links, related terms from its `also` links, and antonyms from the sense-level antonym links.
- The data SHALL travel with the Creative Commons Attribution 4.0 attribution to the Open English WordNet team and Princeton University, and with the WordNet notice; both SHALL ship in packaged builds.

#### Scenario: Word with several senses

- **WHEN** the writer looks up “batch”
- **THEN** the window shows the recorded senses, for example a collection sense and a quantity sense, each with its own synonyms
- **AND** the word “batch” does not appear among its own synonyms

#### Scenario: Inflected form

- **WHEN** the writer looks up “batches” and the data has only “batch”
- **THEN** the window opens with the synonyms recorded for “batch”

#### Scenario: Possessive form

- **WHEN** the writer looks up “writer's” and the data has only “writer”
- **THEN** the window opens with the synonyms recorded for “writer”

#### Scenario: Word missing from the data

- **WHEN** the writer looks up a word the bundled data does not contain
- **THEN** a short message names the word as having no synonyms, and no window opens

#### Scenario: Entry with no other words

- **WHEN** the only recorded synonym for the clicked word is the word itself
- **THEN** the same “no synonyms” message appears, and no empty window opens

#### Scenario: A word with a marked opposite

- **WHEN** the writer looks up “good”
- **THEN** “bad” appears under an Antonym label, not as “bad (antonym)”

#### Scenario: No network

- **WHEN** the machine is offline
- **THEN** lookup and replacement work exactly as they do online
