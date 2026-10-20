# Gmail für deinen KI-Assistenten — Installations-Playbook

**Was du danach hast:** Dein KI-Assistent kann dein Gmail lesen, durchsuchen, labeln,
Anhänge herunterladen — und Mails senden, mit Anhängen, formatiertem Text und als echte
Antwort im richtigen Gesprächsverlauf.

**So benutzt du diese Datei:** Schreib deinem Claude: *„Installiere mir den Gmail-Connector
von github.com/philipkleudgen/gmail-connector nach der Anleitung INSTALL-MIT-KI.md. Ich habe
einen Mac"* (oder *„… ich habe Windows"*). Claude lädt alles selbst herunter. Ab Teil C ist
die Anleitung an die KI gerichtet, nicht an dich. Du wirst an den drei Stellen gefragt, die
nur du machen kannst.

**Läuft auf Mac und Windows.** Wo sich etwas unterscheidet, steht es getrennt dabei.
Programmierkenntnisse brauchst du keine.

---

# Teil A · Was du vorher brauchst

## Das brauchst du

| | Was | Wie lange |
|---|---|---|
| 1 | **Ein Google-Konto mit Gmail** — das Postfach, um das es geht. Hast du schon. | – |
| 2 | **Node.js**, Version 20 oder neuer. Das Programm, das die Skripte ausführt. Anleitung unten. | 5 Min |
| 3 | **Die Kommandozeile öffnen können** — Terminal (Mac) bzw. PowerShell (Windows). Teil B. | 1 Min |
| 4 | **Etwa 30 Minuten Zeit**, davon rund 20 im Google-Browser. | – |
| 5 | Du sitzt **an dem Rechner**, auf dem es laufen soll — nicht per Fernzugriff. | – |

## Das brauchst du ausdrücklich **nicht**

- **Kein GitHub-Konto.** Der Connector liegt öffentlich auf GitHub, Herunterladen geht ohne Anmeldung.
- **Kein Vercel-Konto** — außer du willst später auch vom **Handy** aus zugreifen. Das ist
  Teil G.2, komplett optional, kostenlos, jederzeit nachholbar.
- **Keine Kreditkarte.** Nichts an dieser Einrichtung kostet Geld.
- **Kein WSL, keine Linux-Kenntnisse.** Windows funktioniert direkt.

## Node.js installieren (Punkt 2)

Erst prüfen, ob es schon da ist. Kommandozeile öffnen (Teil B) und einfügen:

```
node --version
```

- Erscheint `v20.…` oder höher (die **erste** Zahl muss mindestens 20 sein) → **fertig,
  überspringe den Rest dieses Abschnitts.**
- Erscheint `command not found`, `nicht gefunden` oder eine Zahl unter 20 → installieren:

**Auf beiden Systemen:** [nodejs.org](https://nodejs.org) öffnen und den großen Button mit
**„LTS"** anklicken (LTS = „Long Term Support", die stabile Version). Die Datei landet im
Download-Ordner.

| | Mac | Windows |
|---|---|---|
| Datei | endet auf `.pkg` | endet auf `.msi` |
| Installation | doppelklicken → immer *Fortfahren* / *Installieren* | doppelklicken → immer *Next* → *Install* |
| Passwort | der Mac fragt nach **deinem Mac-Passwort** (nicht dem Google-Passwort); beim Tippen erscheint nichts — normal | Windows fragt „Zulassen?" → *Ja* |

**Danach in beiden Fällen:** Kommandozeilen-Fenster **schließen und neu öffnen**, sonst kennt
es das neue Programm noch nicht. Dann `node --version` erneut ausführen — jetzt muss eine
Zahl kommen.

---

# Teil B · Kommandozeile in 60 Sekunden

Falls du das noch nie benutzt hast: Es ist nur ein Fenster, in dem man Befehle einfügt statt
zu klicken. Du musst nichts davon können — die Befehle bekommst du von deinem Assistenten.

**Öffnen:**

| Mac | Windows |
|---|---|
| `cmd` + `Leertaste`, `Terminal` tippen, `Enter` | `Windows`-Taste, `PowerShell` tippen, `Enter` |

**Befehl ausführen:** Befehl kopieren, ins Fenster einfügen, `Enter`. Einfügen geht mit
`cmd`+`V` (Mac) bzw. `Ctrl`+`V` oder Rechtsklick (Windows). Danach erscheint eine Ausgabe —
die schickst du deinem Assistenten, wenn er danach fragt.

**Fünf Dinge, die sonst irritieren:**

- **Passwörter sieht man nicht.** Wird nach einem Passwort gefragt, bewegt sich beim Tippen
  nichts. Trotzdem tippen und `Enter`.
- **Gelbe und rote Ausgaben sind nicht automatisch schlimm.** Warnungen kommen oft und sind
  meist harmlos. Ob etwas kaputt ist, entscheidet dein Assistent anhand der Ausgabe.
- **Pfad zu einem Ordner herausfinden:** Mac — Ordner aus dem Finder ins Fenster ziehen.
  Windows — im Explorer `Shift` + Rechtsklick auf den Ordner → *Als Pfad kopieren*.
- **Nichts geht kaputt**, solange du nur Befehle aus dieser Anleitung einfügst.
- **Abbrechen:** `Ctrl` + `C` beendet einen laufenden Befehl (auf dem Mac auch `ctrl`, nicht
  `cmd`).

**Herunterladen:** Das macht dein Assistent mit einem Befehl, siehe Teil C.3. Danach gibt es
in deinem Benutzerordner einen Ordner `gmail-connector`. Der muss dort liegen bleiben, sonst
funktioniert später nichts mehr.

---

# Teil C · An den KI-Assistenten

Du installierst ein lokales Gmail-CLI. Lies diesen Teil komplett, bevor du den ersten Befehl
ausführst.

## C.1 Erst prüfen: kannst du Befehle ausführen?

- **Ja** (Claude Code, Claude Desktop mit Terminal-Zugriff, Codex CLI o. ä.) →
  **Ausführ-Modus**: Du arbeitest die Schritte selbst ab und prüfst nach jedem die
  „Erwartet:"-Zeile.
- **Nein** (ChatGPT oder Claude im Browser bzw. in der App) → **Führ-Modus**: Sag dem Nutzer
  in einem Satz, dass er die Befehle selbst einfügen muss. Dann gib ihm **einen Schritt pro
  Nachricht**, warte auf seine Rückmeldung mit der Ausgabe, prüfe sie, und geh erst dann
  weiter. Gib nie mehrere Befehle auf einmal aus — genau daran scheitern solche
  Installationen.

## C.2 Betriebssystem klären

Frag zuerst, ob **Mac oder Windows** — oder lies es aus der Umgebung, wenn du Zugriff hast.
Die Befehle in dieser Anleitung laufen auf beiden; unterschiedlich sind nur Pfade und das
Öffnen von Dateien. Wo eine Tabelle „Mac | Windows" steht, nimm die richtige Spalte und
nenne dem Nutzer nur die.

## C.3 Voraussetzungen abklopfen, bevor du anfängst

```
node --version
```

Kommt eine Version unter 20 oder „nicht gefunden": **stopp**. Verweise auf Teil A und warte,
bis er es erledigt hat. Installiere keine Systemsoftware ungefragt.

Dann den Connector herunterladen, in den Ordner `gmail-connector` im Benutzerordner. Gibt es
den Ordner schon, nicht überschreiben, sondern nachfragen.

| Mac (Terminal) | Windows (PowerShell) |
|---|---|
| `mkdir -p ~/gmail-connector && curl -fsSL https://github.com/philipkleudgen/gmail-connector/archive/refs/heads/main.tar.gz \| tar -xz --strip-components=1 -C ~/gmail-connector` | `mkdir $HOME\gmail-connector; curl.exe -fsSL -o $HOME\gmail-connector.tar.gz https://github.com/philipkleudgen/gmail-connector/archive/refs/heads/main.tar.gz; tar -xzf $HOME\gmail-connector.tar.gz --strip-components=1 -C $HOME\gmail-connector` |

**Erwartet:** im Ordner `gmail-connector` liegen `INSTALL-MIT-KI.md`, `package.json` und der
Ordner `scripts`. Git braucht es dafür nicht.

## C.4 Diese drei Dinge kann nur der Nutzer

1. **Im Google-Browser klicken** — Projekt, Gmail API, Zustimmungsbildschirm, OAuth-Client
   (Teil D).
2. **Die zwei Google-Werte eingeben.** Das Skript fragt sie in der Kommandozeile ab. **Er
   tippt sie dort selbst ein — frag sie nicht im Chat ab und schreib sie nirgends hin.**
3. **Das Anmeldefenster im Browser bestätigen** (Teil E).

## C.5 Regeln, ausnahmslos

- **Keine Geheimnisse in den Chat.** Client-Schlüssel, Refresh-Token, Inhalte von
  `.env.local` oder der Datei unter `.config/gmail-cli/` niemals anzeigen, wiederholen oder
  in andere Dateien kopieren. Musst du prüfen, ob ein Wert gesetzt ist, prüfe die
  *Existenz*, nicht den Wert.
- **Keine echten Mails ohne ausdrückliche Freigabe.** Zum Testen `--dry-run`. Ein echter
  Testversand nur an die eigene Adresse des Nutzers und nur mit seinem Ja.
- **Nichts löschen** — weder Mails noch Dateien, die du nicht selbst angelegt hast.
- **Verifizieren statt behaupten.** Jeder Schritt hat eine „Erwartet:"-Zeile. Stimmt sie
  nicht, geh in die Fehlertabelle (Teil H) und rate nicht.
- **Erklär in einem Satz, was du gerade tust.** Der Nutzer ist Anfänger.
- **Am Ende berichten** im Format von Teil F.

---

# Teil D · Google-Zugangsdaten anlegen

> **An den Assistenten:** Diesen Teil macht der Nutzer im Browser. Gib ihm die fünf Punkte am
> Stück, sag ihm, dass er am Ende **zwei Werte** braucht (Client-ID und Client-Schlüssel) und
> dass er das letzte Fenster offen lassen soll. Warte, bis er sich meldet. Google verändert
> diese Oberfläche regelmäßig — **nutze die direkten Links**, die sind stabiler als
> Menüpfade, und wenn eine Bezeichnung abweicht, such nach dem sinngleichen Begriff statt
> abzubrechen.

**Warum ein eigenes Google-Projekt?** Der Zugriff auf Gmail-Inhalte ist bei Google besonders
geschützt. Wer das für **fremde** Postfächer anbietet, braucht ein Prüfverfahren samt
jährlichem Sicherheits-Audit. Legst du dein eigenes Projekt für dein eigenes Postfach an,
entfällt das — und deine Zugangsdaten bleiben deine. Niemand sonst kann in dein Postfach
sehen, auch nicht derjenige, von dem du dieses Kit hast.

Alle Schritte sind gegen die Oberfläche vom **25. Juli 2026** geprüft. Der Bereich heißt
inzwischen **„Google Auth Platform"** und hat links die Punkte *Übersicht · Branding ·
Zielgruppe · Clients · Datenzugriff · Überprüfungscenter · Einstellungen*. Falls Google
umbenennt: die Links unten führen trotzdem ans Ziel.

1. **Projekt anlegen:** [console.cloud.google.com/projectcreate](https://console.cloud.google.com/projectcreate)
   Beim ersten Besuch einmal die Nutzungsbedingungen bestätigen. Name z. B.
   `mail-assistent` → *Erstellen*. Kurz warten, bis oben im Projektauswähler das neue
   Projekt steht — alle folgenden Schritte gehören zu diesem Projekt.

2. **Gmail API aktivieren:**
   [console.cloud.google.com/apis/library/gmail.googleapis.com](https://console.cloud.google.com/apis/library/gmail.googleapis.com)
   → *Aktivieren*. Steht dort schon *Verwalten*, ist sie bereits aktiv.

3. **Auth-Platform einrichten (Assistent):**
   [console.cloud.google.com/auth/overview](https://console.cloud.google.com/auth/overview)
   Im frischen Projekt steht dort *„Google Auth Platform noch nicht konfiguriert"* →
   **„Erste Schritte"**. Der Assistent hat vier Schritte:
   - **App-Information**: *Anwendungsname* (z. B. `Mail-Assistent`) und
     *Nutzersupport-E-Mail* (deine Adresse aus der Liste) → *Weiter*
   - **Zielgruppe**: **Intern**, wenn deine Mailadresse auf eine **eigene Firmen-Domain**
     läuft (Google Workspace) — der einfachere Fall. Bei einer normalen
     **@gmail.com**-Adresse geht nur **Extern** → *Weiter*
   - **Kontaktdaten**: deine E-Mail-Adresse → *Weiter*
   - **Fertig**: Häkchen bei der Richtlinie zu Nutzerdaten → *Fortfahren* → **Erstellen**

4. **Nur bei „Extern": App veröffentlichen.**
   [console.cloud.google.com/auth/audience](https://console.cloud.google.com/auth/audience)
   Der **Veröffentlichungsstatus** steht direkt nach dem Assistenten auf **„Test"**. In
   diesem Zustand kann sich **nur zugreifen, wer unten unter *Testnutzer* eingetragen ist** —
   und die Zugangsdaten laufen **alle 7 Tage** ab. Zwei Möglichkeiten:
   - **Empfohlen:** *App veröffentlichen* klicken. Danach steht dort „In Produktion", und
     nichts läuft mehr ab.
   - Oder unter **Testnutzer** → *+ Add users* die eigene Mailadresse eintragen. Dann
     funktioniert es sofort, aber weiter mit 7-Tage-Ablauf.

   Bei **Intern** entfällt dieser Schritt komplett.

5. **Berechtigungen hinzufügen:**
   [console.cloud.google.com/auth/scopes](https://console.cloud.google.com/auth/scopes)
   → **„Bereiche hinzufügen oder entfernen"**. Die Liste oben hat rund 45 Einträge auf
   mehreren Seiten — such dort **nicht**. Scroll im Panel nach unten zu **„Bereiche manuell
   hinzufügen"**, füge dort **beide** Zeilen durch Komma getrennt ein:
   ```
   https://www.googleapis.com/auth/gmail.modify,https://www.googleapis.com/auth/gmail.send
   ```
   → **„Zu Tabelle hinzufügen"** (beide erscheinen oben mit Häkchen) → **„Aktualisieren"**.

   Soll der Assistent nur senden und **nicht** lesen dürfen, nimm nur `gmail.send`.

   Danach steht `gmail.send` unter *„Ihre vertraulichen Bereiche"* und `gmail.modify` unter
   *„Ihre eingeschränkten Bereiche"*, und es erscheint ein gelber Hinweis **„Die Anwendung
   muss überprüft werden"**. **Für die eigene Nutzung ignorieren** — die Prüfung braucht nur,
   wer die App fremden Nutzern anbietet.

6. **OAuth-Client erstellen:**
   [console.cloud.google.com/auth/clients](https://console.cloud.google.com/auth/clients)
   → **„Client erstellen"**.
   - **Anwendungstyp**: **Webanwendung**. Erst nach dieser Auswahl erscheinen die weiteren
     Felder — vorher ist die Seite fast leer, das ist normal.
   - **Name**: beliebig, der Vorschlag („Webclient 1") reicht.
   - Weiter unten stehen **zwei** ähnliche Abschnitte mit demselben Knopf *+ URI hinzufügen*.
     Der Eintrag gehört unter **„Autorisierte Weiterleitungs-URIs"** — **nicht** unter
     „Autorisierte JavaScript-Quellen". Dort **genau das** eintragen, ohne Leerzeichen und
     ohne Schrägstrich am Ende:
   ```
   http://localhost:5555/oauth2callback
   ```
   - *Erstellen*. Es erscheint das Fenster **„OAuth-Client erstellt"**.

   > ⚠️ **Jetzt „JSON herunterladen" klicken, bevor du das Fenster schließt.** Google zeigt
   > den Client-Schlüssel **nur dieses eine Mal**: „Das Ansehen und Herunterladen von
   > Clientschlüsseln ist nicht mehr möglich." Wer das Fenster mit *Ok* schließt, muss später
   > unter *Clients → dein Client → Add secret* einen neuen Schlüssel anlegen. Die Datei
   > heißt `client_secret_....json` und landet im Download-Ordner — **dort liegen lassen**,
   > das Kit findet sie von allein.

   Kleiner Hinweis der Console, der wörtlich zutrifft: Änderungen können „zwischen 5 Minuten
   und mehrere Stunden" brauchen, bis sie wirksam sind. Scheitert der nächste Schritt mit
   einem Fehler zum Client, einfach ein paar Minuten warten und erneut versuchen.

---

# Teil E · Installieren und anmelden

## E.1 In den Ordner wechseln und Bausteine laden

| Mac | Windows |
|---|---|
| `cd ~/gmail-connector` | `cd $HOME\gmail-connector` |

Pfad anpassen, falls der Ordner woanders liegt (Teil B: Pfad kopieren). Dann:

```
npm install
```

**Erwartet:** eine Zeile wie `added 51 packages … in 2s`.

Direkt darunter erscheint **`4 moderate severity vulnerabilities`**. Das ist erwartbar und
kein Grund zur Sorge: alle vier stammen aus einem einzigen Hinweis zum Baustein `uuid`, der
nur greift, wenn ein Programm ihm einen Speicherpuffer übergibt — das tut hier nichts.
**`npm audit fix --force` bitte nicht ausführen**, das tauscht Bausteine gegen
inkompatible Versionen und zerlegt die Installation.

## E.2 Postfach anmelden — ein Befehl

```
node scripts/authorize.mjs --account main
```

Beim ersten Mal sucht das Skript im Download-Ordner nach der Datei `client_secret_....json`
aus Teil D.6 und übernimmt beide Werte daraus — **dann ist nichts zu tippen**. Liegt sie
woanders: `--client-json /pfad/zur/datei.json`. Findet es keine, fragt es Client-ID und
Client-Schlüssel im Terminal ab (Schlüssel wird als `*` angezeigt); **der Nutzer gibt sie
selbst ein**. Die Konfigurationsdatei legt das Skript selbst an; niemand muss eine versteckte
Datei anlegen.

Dann öffnet sich der Browser. Der Nutzer wählt **das Postfach, um das es geht**, und
bestätigt die Berechtigungen. Steht dort „App nicht verifiziert", ist das beim eigenen
Projekt erwartbar: *Erweitert* → *Weiter zu …*.

**Erwartet:** `authorized: <mailadresse>` und eine Zeile `wrote: …/.config/gmail-cli/main.env`.

> **An den Assistenten:** Lies die Adresse vor und lass den Nutzer bestätigen, dass es die
> richtige ist. Steht dort ein anderes Konto — häufig, wenn im Browser mehrere Google-Konten
> angemeldet sind — den Befehl erneut ausführen und ihn bitten, im Anmeldefenster oben rechts
> das richtige Konto zu wählen.

Prüfen:

```
node scripts/send.mjs --account main --whoami
```

**Erwartet:** die Mailadresse und die Anzahl der Nachrichten im Postfach.

**Weiteres Postfach später?** Derselbe Befehl mit anderem Namen, z. B.
`node scripts/authorize.mjs --account firma2`. Jedes bekommt seine eigene Datei.

## E.3 Funktionstest

Erst trocken — zeigt alles an, sendet nichts. Zwei Befehle, nacheinander (`<eigene-adresse>`
ersetzen):

```
node -e "require('fs').writeFileSync('test.txt','Test aus der Einrichtung\n')"
```

```
node scripts/send.mjs --account main --to <eigene-adresse> --subject "Test" --text-file test.txt --dry-run
```

**Erwartet:** ein Kasten mit Absender, Empfänger, Betreff, Größe und `dry-run — nothing sent.`

Dann lesen (verändert nichts):

```
node scripts/read.mjs search --account main --q "newer_than:2d"
```

**Erwartet:** eine Liste mit Datum, Absender und Betreff. Kommt `no matches`, obwohl es neue
Mails gibt, siehe Teil H.

> **An den Assistenten:** Einen echten Versand nur mit ausdrücklichem Ja und nur an die
> eigene Adresse des Nutzers — derselbe Befehl ohne `--dry-run`. Danach mit
> `node scripts/read.mjs search --account main --q "in:sent newer_than:1h"` belegen, dass sie
> raus ist. Nicht behaupten, es habe geklappt.

---

# Teil F · Abschlussbericht (Assistent an Nutzer)

Wenn alles läuft, kurz und konkret berichten:

- welche Mailadresse autorisiert ist (aus `--whoami`, nicht geraten)
- wo die Zugangsdaten liegen: Mac `~/.config/gmail-cli/main.env`, Windows
  `C:\Users\<name>\.config\gmail-cli\main.env` — nur für seinen Benutzer zugänglich
- dass der Ordner `gmail-connector` liegen bleiben muss
- was er ab jetzt sagen kann („schick das als Mail an …", „such mir die Rechnung von …")
- dass du vor jedem echten Versand nachfragst
- was **nicht** eingerichtet ist (z. B. Handy-Zugriff, wenn Teil G.2 übersprungen wurde)

Die Befehle, die es ab jetzt gibt:

```
node scripts/send.mjs --account main --to kunde@beispiel.de --subject "Angebot" --text-file text.txt --attach angebot.pdf
node scripts/send.mjs --account main --to kunde@beispiel.de --subject "Re: Angebot" --text-file antwort.txt --thread-id <thread-id>
node scripts/read.mjs search   --account main --q "from:lieferant.de has:attachment"
node scripts/read.mjs message  --account main --id <message-id>
node scripts/read.mjs download --account main --id <message-id> --out <zielordner>
node scripts/read.mjs label    --account main --id <message-id> --add STARRED
```

Jedes Skript zeigt mit `--help` seine volle Hilfe. Bei `--q` gilt die normale Gmail-Suchsyntax
(`from:`, `subject:`, `has:attachment`, `newer_than:7d`, `label:` …) — dieselbe wie im
Gmail-Suchfeld.

---

# Teil G · Optional: zwei Erweiterungen

Beide sind nachrüstbar und für den normalen Betrieb nicht nötig. G.1 lohnt sich, wenn dein
Assistent keine Befehle ausführen darf; G.2, wenn er auch ohne deinen Rechner ans Postfach
soll.

## G.1 Postfach als Werkzeug statt als Befehl

Bis hierher ruft der Assistent die Skripte über die Kommandozeile auf. Das funktioniert
überall dort, wo er Befehle ausführen darf — bei Claude Code etwa. Kann er das nicht (die
normale Claude-Desktop-App zum Beispiel), lässt sich dasselbe Postfach als **Werkzeug**
einhängen: derselbe Rechner, dieselben Zugangsdaten, nur eine andere Verpackung.

Ein Befehl je Postfach. `$HOME` ergänzt die Kommandozeile selbst zum vollen Pfad:

```
claude mcp add gmail-main -s user -- node "$HOME/gmail-connector/scripts/mcp-local.mjs" --account main
```

Für jedes weitere Postfach aus E.2 derselbe Befehl mit dessen Namen, zum Beispiel
`claude mcp add gmail-firma2 -s user -- node "$HOME/gmail-connector/scripts/mcp-local.mjs" --account firma2`.
So hat jedes Konto im Chat sein eigenes Werkzeug, und Claude weiß immer, in welchem Postfach
es gerade sucht.

In der Claude-Desktop-App stattdessen in `claude_desktop_config.json`:

```json
"gmail-main": {
  "command": "node",
  "args": ["/Users/<name>/gmail-connector/scripts/mcp-local.mjs", "--account", "main"]
}
```

Danach kennt der Assistent sieben Werkzeuge — Profil, Suchen, Verlauf lesen, Nachricht
lesen, Anhänge herunterladen, Entwurf anlegen, Senden. Senden und Entwurf nehmen **Anhänge**
entgegen; weil der Server auf deinem Rechner läuft, genügt der Dateipfad, und die Datei wird
direkt von der Festplatte gelesen.

> **Nach jeder Änderung an den Werkzeugen den Server neu laden.** Claude merkt sich die
> Werkzeugliste vom letzten Verbindungsaufbau. Eine laufende Sitzung zeigt sonst weiter die
> alte Liste und behauptet steif, es gebe keine Anhänge. Claude Desktop beenden und neu
> öffnen; bei Claude Code die Sitzung neu starten. Das ist mit Abstand der häufigste Grund,
> warum eine Änderung „nicht wirkt".

Kein zusätzlicher Google-Bereich nötig: ein Anhang ist Teil der Nachricht, `gmail.send` deckt
ihn ab.

## G.2 Zugriff vom Handy

**Nur nötig, wenn der Assistent auch ohne den eigenen Rechner ans Postfach soll** — etwa in
der Claude-App auf dem Handy. Jederzeit später nachholbar; alles andere funktioniert ohne.

Dafür brauchst du ein Konto, das du bisher nicht gebraucht hast:

- **Vercel-Konto** — kostenlos, Anmeldung mit Google- oder GitHub-Konto:
  [vercel.com/signup](https://vercel.com/signup). Vercel betreibt den kleinen Server, über
  den das Handy zugreift. Für diese Nutzung fällt nichts an.

Vier Befehle, nacheinander:

```
npm run install:server
npm i -g vercel
vercel login
vercel --prod
```

`npm run install:server` lädt die Bausteine des Servers nach — die fehlen absichtlich in der
Grundinstallation, damit der Mail-Teil klein und schnell bleibt. Bei `vercel --prod` die
Vorschläge bestätigen und **als Region eine europäische wählen** (`fra1`, Frankfurt), damit
keine Daten die EU verlassen.

Dann das Postfach am Server registrieren:

```
node scripts/authorize.mjs --account main --vercel
```

Am Ende erscheint eine URL. Die in claude.ai unter *Einstellungen → Connectors → eigenen
Connector hinzufügen* **einfügen, nicht abtippen** — ein fehlendes Zeichen ergibt 404.

Zwei Hinweise: Die URL enthält ein Geheimnis, wer sie hat, kommt an das Postfach — wie ein
Passwort behandeln, nicht per Chat oder Mail weitergeben. Und über diesen Weg gehen **keine
Anhänge** und kein formatierter Text: der Server läuft bei Vercel und sieht deine Festplatte
nicht, ein Dateipfad würde dort ins Leere zeigen. Anhänge bleiben deshalb den beiden lokalen
Wegen vorbehalten — `scripts/send.mjs --attach` oder der Werkzeug-Weg aus G.1.

---

# Teil H · Wenn etwas nicht funktioniert

| Symptom | Ursache und Lösung |
|---|---|
| `command not found: node` / `node wird nicht als Befehl erkannt` | Node.js fehlt, oder das Fenster wurde nach der Installation nicht neu geöffnet. Teil A. |
| `npm` nicht gefunden | Gleiche Ursache — npm kommt zusammen mit Node.js. |
| `4 moderate severity vulnerabilities` | Erwartbar, siehe Teil E.1. Kein Fehler. `npm audit fix --force` **nicht** ausführen. |
| `No such file or directory` / `Pfad nicht gefunden` bei `cd` | Der Pfad zum Ordner `gmail-connector` stimmt nicht. Mac: Ordner ins Fenster ziehen. Windows: `Shift`+Rechtsklick → *Als Pfad kopieren*. |
| `Das sieht nicht wie eine Client-ID aus` | Falscher Wert eingefügt. Die Client-ID endet immer auf `.apps.googleusercontent.com`. |
| `No credentials found for account …` | `authorize.mjs` lief nicht für diesen Namen, oder der Name ist anders geschrieben. Mac `ls ~/.config/gmail-cli/`, Windows `dir $HOME\.config\gmail-cli` zeigt die vorhandenen. |
| `redirect_uri_mismatch` | Die Weiterleitungs-URI im OAuth-Client stimmt nicht exakt. Sie muss `http://localhost:5555/oauth2callback` lauten — kein Leerzeichen, kein Schrägstrich am Ende. |
| `Zugriff blockiert: App nicht verifiziert` | Erwartbar beim eigenen Projekt. *Erweitert* → *Weiter zu …*. |
| `Google returned no refresh token` | Die App war schon einmal freigegeben. Unter [myaccount.google.com/permissions](https://myaccount.google.com/permissions) entfernen, dann erneut ausführen. |
| Browser öffnet sich nicht | Die Anmelde-URL steht im Fenster — kopieren und selbst im Browser einfügen. |
| Browser öffnet, Seite lädt nicht | Es wird per Fernzugriff gearbeitet; der Rücksprung zeigt auf den falschen Rechner. Direkt am Rechner arbeiten, oder vorher `ssh -L 5555:localhost:5555 zielrechner`. |
| Lief eine Woche, dann nicht mehr | Der Zustimmungsbildschirm steht auf „Test" → auf **„In Produktion"** stellen, dann `authorize.mjs` erneut. |
| Suche liefert `no matches`, obwohl Mails da sind | Anführungszeichen wurden von der Kommandozeile geschluckt. Mit `--q "newer_than:1d"` gegentesten. |
| `insufficient authentication scopes` | Ein Bereich fehlt (Teil D.4). Ergänzen, dann `authorize.mjs` erneut. |
| Assistent sagt, er könne keine Anhänge verschicken | Zwei mögliche Ursachen. Entweder läuft der Handy-Weg (G.2) — der kann das wirklich nicht, dann `scripts/send.mjs --attach` nehmen. Oder der Werkzeug-Server aus G.1 wurde nach einer Änderung nicht neu geladen und zeigt die alte Werkzeugliste: Claude Desktop beenden und neu öffnen. |
| Anhang kommt mit zerschossenem Dateinamen an (`Pr_fbericht`) | Sollte nicht mehr vorkommen. Falls doch: eigene Änderungen an `scripts/mime.mjs` prüfen — `filename*` muss in `Content-Disposition` **vor** dem ASCII-Ersatznamen stehen, sonst nimmt Gmail den falschen. |
| `over Gmail's 25 MB limit` | Gmails harte Grenze; Base64 macht Dateien rund 37 % größer. Datei zu Google Drive hochladen und den Freigabe-Link in die Mail schreiben. |
| Connector antwortet 404 | URL abgetippt statt eingefügt, oder nach dem Setzen der Variablen fehlt ein Deployment: `vercel redeploy <deine-url>`. |
| Seite „Client erstellen" ist fast leer | Erst **Anwendungstyp** auswählen, dann erscheinen Name und die URI-Felder. |
| Client-Schlüssel nirgends zu finden | Google zeigt ihn nur im Fenster direkt nach dem Erstellen, per *JSON herunterladen*. Danach: *Clients → dein Client → Add secret* und einen neuen anlegen (der alte bleibt gültig, ist aber unlesbar). |
| `Zugriff blockiert` / `access_denied` beim Anmelden | Bei „Extern" steht die App auf **Test** und lässt nur eingetragene Testnutzer zu. Teil D.4: *App veröffentlichen* oder sich unter *Testnutzer* eintragen. |
| Fehler zum Client direkt nach dem Erstellen | Die Console sagt selbst, dass Änderungen bis zu mehrere Stunden brauchen können. Ein paar Minuten warten, erneut versuchen. |
| Gelber Hinweis „Die Anwendung muss überprüft werden" | Erwartbar, weil Gmail-Bereiche als eingeschränkt gelten. Für die eigene Nutzung ignorieren — Teil D.4. |
| Client-ID und Schlüssel weggeklickt | Kein Problem: unter *Clients* den Client anklicken, dort stehen beide wieder. |
| Google-Oberfläche sieht anders aus als beschrieben | Google benennt diesen Bereich regelmäßig um (zuletzt in „Google Auth Platform"). Die direkten Links in Teil D führen trotzdem ans Ziel; sinngleiche Begriffe suchen statt abbrechen. |

---

# Teil I · Was das Kit **nicht** kann

- **Endgültig löschen** — bewusst nicht eingebaut. In den Papierkorb verschieben geht über
  Labels, unwiderruflich löschen nicht.
- **Kalender, Kontakte, Drive** — nur Gmail.
- **Gmail-Einstellungen ändern** (Filter, Weiterleitungen, Abwesenheitsnotizen).
- **Von allein im Hintergrund laufen** — die Skripte tun etwas, wenn sie aufgerufen werden.
- **Andere Anbieter** (Outlook/Exchange, IMAP allgemein).

---

# Teil J · Datenschutz, kurz

- Deine Zugangsdaten liegen ausschließlich auf deinem Rechner: Mac `~/.config/gmail-cli/`,
  Windows `C:\Users\<name>\.config\gmail-cli\`. Auf dem Mac zusätzlich auf „nur für dich
  lesbar" gesetzt; unter Windows schützt das Benutzerprofil die Datei.
- Verantwortlich bist du: dein Google-Projekt, dein Postfach, deine Zugangsdaten. Es liest
  niemand mit.
- Keine Hintergrund-Synchronisierung. Der Assistent sieht nur, was er auf deine Aufforderung
  abruft.
- Zugriff jederzeit entziehen:
  [myaccount.google.com/permissions](https://myaccount.google.com/permissions) → App
  entfernen. Wirkt sofort.
- Betreibst du den Handy-Zugriff für **andere Personen** (Mitarbeitende), wirst du für deren
  Postfachdaten zur verantwortlichen Stelle — dann sind ein Auftragsverarbeitungsvertrag mit
  Vercel und ein Eintrag im Verzeichnis der Verarbeitungstätigkeiten fällig. Sauberer: jede
  Person richtet ihr eigenes Postfach selbst ein.

---

## Anhang: Dateien im Kit

```
scripts/authorize.mjs      Postfach anmelden (einmalig pro Postfach)
scripts/send.mjs           Senden: Anhänge, Formatierung, Antwort im Verlauf, --dry-run
scripts/read.mjs           Suchen, Lesen, Labeln, Anhänge herunterladen
scripts/mcp-local.mjs      Postfach als Werkzeug statt als Befehl (nur Teil G.1)
scripts/mime.mjs           Baut die Mail samt Anhängen — von send.mjs und mcp-local.mjs genutzt
scripts/creds.mjs          Findet die Zugangsdaten — von allen Skripten genutzt
scripts/install-creds.mjs  Zugangsdaten aus einem bestehenden Server übernehmen
lib/, app/                 Server für den Handy-Zugriff (nur Teil G.2)
README.md                  Technische Notizen (englisch)
```
