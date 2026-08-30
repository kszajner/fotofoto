-- v0.4: zastępujemy placeholdery z 002 prawdziwą treścią gry.
-- UPDATE zamiast DELETE — submissions mają FK na tasks, a migracji się nie
-- cofa przy rollbacku kodu (CLAUDE.md: migracje wyłącznie addytywne).
-- Dopasowanie po title, nie po id — nie zakładamy konkretnych autoincrementów.

UPDATE tasks SET active = 0 WHERE title IN (
  'Selfie z Parą Młodą',
  'Pierwszy taniec',
  'Ktoś, kogo nie znasz',
  'Detal',
  'Najlepszy kadr wieczoru'
);

INSERT INTO tasks (title, description, points, active, sort_order) VALUES
  ('Twoje zdjęcie',
   'Zrób sobie zdjęcie — takie, jakie chcesz zapamiętać z tego dnia.', 1, 1, 10),
  ('Zdjęcie z kimś, kogo nie znasz',
   'Znajdź gościa, którego nie znasz, i zróbcie wspólne zdjęcie.', 1, 1, 20),
  ('Zdjęcie stołu i jedzenia',
   'Uchwyć swój stół i to, co na nim czeka.', 1, 1, 30),
  ('Selfie z kimś starszym/młodszym o 10 lat',
   'Znajdź kogoś co najmniej 10 lat starszego lub młodszego od Ciebie i zróbcie selfie.', 1, 1, 40),
  ('Zdjęcie sali',
   'Złap ogólny kadr sali weselnej.', 1, 1, 50),
  ('Zdjęcie w co najmniej 5 osób',
   'Zbierz minimum 5 osób w jednym kadrze.', 1, 1, 60),
  ('Zdjęcie pary młodej z tortem',
   'Złap Młodych przy torcie.', 1, 1, 70),
  ('Zdjęcie z parą młodą',
   'Zrób sobie zdjęcie z Parą Młodą.', 1, 1, 80),
  ('Zdjęcie pary młodej w trakcie aktywności',
   'Uchwyć Młodych w akcji — na parkiecie, w zabawie, gdziekolwiek.', 1, 1, 90);
