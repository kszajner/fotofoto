# Przygotowanie Raspberry Pi — jednorazowo

Cel: Raspberry Pi 5, Raspberry Pi OS **64-bit**. Wszystkie komendy odpalasz na Pi.

Po tym runbooku `./scripts/deploy.sh` będzie działał jedną komendą.

---

## 1. System i Node 24

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y git curl
```

Node 24 z NodeSource — **ten sam major co na Windowsie**, bo `better-sqlite3`
i `sharp` budują się pod konkretne ABI:

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
```

Sprawdź, że to naprawdę arm64 — na 32-bit nie będzie prebuildów:

```bash
node -v && dpkg --print-architecture
```

Oczekiwane: `v24.x` oraz `arm64`. Jeśli widzisz `armhf`, trzeba przeinstalować system.

---

## 2. Użytkownik i katalogi

```bash
sudo useradd --system --create-home --home-dir /srv/fotofoto --shell /bin/bash fotofoto
sudo mkdir -p /srv/fotofoto/{app,data,backup}
sudo chown -R fotofoto:fotofoto /srv/fotofoto
```

---

## 3. Dysk na dane

Zdjęcia i baza **nie mogą** siedzieć na karcie SD — wolny losowy zapis i realne
ryzyko korupcji przy zaniku prądu.

Znajdź UUID dysku:

```bash
lsblk -f
```

Dopisz do `/etc/fstab` (podstaw swój UUID):

```
UUID=xxxx-xxxx  /srv/fotofoto/data  ext4  defaults,noatime,nofail,x-systemd.device-timeout=10  0  2
```

`nofail` jest tu kluczowe. Bez niego Pi bez podłączonego dysku nie kończy bootowania,
tylko wpada w tryb ratunkowy — czyli **nie wstaje SSH i musisz iść do niego fizycznie**.
Z `nofail` system wstaje normalnie, usługa odmawia startu (`RequiresMountsFor`),
a Ty możesz się zalogować i naprawić.

```bash
sudo mount -a
findmnt /srv/fotofoto/data     # musi coś pokazać
sudo chown -R fotofoto:fotofoto /srv/fotofoto/data
```

`findmnt` musi zwrócić wiersz. Jeśli nie zwraca, unit systemd i tak odmówi startu
(`RequiresMountsFor`) — i o to chodzi, bo cichy zapis na SD byłby gorszy niż awaria.

---

## 4. Dostęp do prywatnego repo (deploy key)

Klucz **tylko do odczytu**, osobny dla tej maszyny:

```bash
sudo -u fotofoto mkdir -p /srv/fotofoto/.ssh
sudo -u fotofoto chmod 700 /srv/fotofoto/.ssh
sudo -u fotofoto ssh-keygen -t ed25519 -N "" -f /srv/fotofoto/.ssh/id_ed25519 -C "rpi-fotofoto"
sudo -u fotofoto cat /srv/fotofoto/.ssh/id_ed25519.pub
```

Wypisany klucz wklej w GitHubie: **Settings → Deploy keys → Add deploy key**.
Nie zaznaczaj „Allow write access" — Pi ma tylko czytać.

```bash
sudo -u fotofoto ssh -o StrictHostKeyChecking=accept-new -T git@github.com
sudo -u fotofoto git clone git@github.com:kszajner/fotofoto.git /srv/fotofoto/app
```

---

## 5. Konfiguracja

```bash
sudo tee /etc/fotofoto.env > /dev/null <<'EOF'
PORT=3000
HOST=127.0.0.1
DATA_DIR=/srv/fotofoto/data
LOG_LEVEL=info
EOF
sudo chmod 640 /etc/fotofoto.env
sudo chown root:fotofoto /etc/fotofoto.env
```

`HOST=127.0.0.1`, nie `0.0.0.0`. `cloudflared` łączy się z aplikacją przez loopback,
więc nie ma powodu, żeby cokolwiek innego w sieci ją widziało.

---

## 6. Usługa systemd

```bash
sudo cp /srv/fotofoto/app/scripts/fotofoto.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now fotofoto
systemctl status fotofoto --no-pager
```

Pozwolenie na restart bez hasła — wyłącznie ta jedna usługa, nie całe `sudo`:

```bash
echo 'fotofoto ALL=(root) NOPASSWD: /usr/bin/systemctl restart fotofoto' \
  | sudo tee /etc/sudoers.d/fotofoto
sudo chmod 440 /etc/sudoers.d/fotofoto
sudo visudo -c
```

---

## 7. Pierwszy deploy

```bash
sudo -u fotofoto -H bash -c 'cd /srv/fotofoto/app && ./scripts/deploy.sh v0.2.0'
```

Powinno skończyć się na `deploy ok — v0.2.0` i wypisać JSON z healthchecka.

Nie wdrażaj tagu starszego niż `v0.2.0`: `deploy.sh` pojawił się dopiero w v0.2,
więc checkout v0.1.0 usunąłby skrypt spod bash-a w trakcie jego wykonywania.

Weryfikacja:

```bash
curl -s http://127.0.0.1:3000/healthz        # {"ok":true,"version":"0.1.0","tasks":5,...}
curl -s http://127.0.0.1:3000/api/tasks
journalctl -u fotofoto -n 30 --no-pager
```

---

## 8. Sprawdzenie odporności

To jest właściwy cel v0.2 — nie samo „apka wstała", tylko „apka wstaje sama".

```bash
sudo systemctl kill -s SIGKILL fotofoto      # symulacja crashu
sleep 5 && systemctl is-active fotofoto      # oczekiwane: active

sudo reboot                                   # symulacja zaniku prądu
# po powrocie:
systemctl is-active fotofoto && curl -s http://127.0.0.1:3000/healthz
```

---

## Uwaga o rollbacku

`deploy.sh` cofa **kod**, nie **schemat bazy**. Migracja, która już się nałożyła,
zostaje nałożona.

Wniosek na przyszłość: **migracje piszemy wyłącznie addytywnie** — nowe tabele,
nowe kolumny z wartością domyślną. Żadnych `DROP COLUMN` ani zmiany typu, bo
wtedy rollback kodu zostawi stary kod przy nowym schemacie i przestanie działać.
