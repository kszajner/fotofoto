-- 003 tylko dezaktywowała placeholdery z 002 — zostały w tabeli, w tym samym
-- zakresie sort_order co prawdziwe zadania, więc w panelu admina łatwo
-- kliknąć "aktywne" na niewłaściwym wierszu (stało się to podczas testu 2026-08-30:
-- "Selfie z Parą Młodą" wróciło na listę gościa obok realnego "Zdjęcie z parą młodą").
-- Usuwamy je na stałe. Bezpieczne — żadne submissions nie wskazują na te id
-- (zweryfikowane na produkcji przed napisaniem tej migracji).
DELETE FROM tasks WHERE title IN (
  'Selfie z Parą Młodą',
  'Pierwszy taniec',
  'Ktoś, kogo nie znasz',
  'Detal',
  'Najlepszy kadr wieczoru'
);
