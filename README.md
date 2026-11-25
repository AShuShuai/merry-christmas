# 🎄 Merry Christmas 3D — React + TypeScript Engine ✨

Una versione moderna, modulare e interattiva in **React 18 + TypeScript + Vite + Tailwind CSS** dell'albero di Natale magico 3D su HTML5 Canvas.

Dedica speciale creata per rendere l'esperienza personalizzabile al 100%, fluida e ricca di effetti.

---

## 🌟 Caratteristiche Principali

- **Canvas 3D High-Performance**: Motore matematico a tripla elica con 7.200+ punti luce, stelle cadenti, petali di fiori / fiocchi di neve, polvere di fata orbitante, stella radiante a 10 punte e bagliore al suolo.
- **Interattività 3D**:
  - Trascina con mouse o touch per ruotare e inclinare l'albero nello spazio 3D.
  - Clicca o tocca qualsiasi punto per scatenare un'esplosione di scintillii fatati con suono a carillon.
- **Pannello di Controllo in Vetro Satinato (Glassmorphism)**:
  - **Dedica Personalizzabile**: Modifica il testo d'auguri in tempo reale (es. *"Buon Natale Chiara ❤️"*, *"Per Te Chiara ✨"*), con supporto a font calligrafici, serif o classici.
  - **5 Temi Cromatici Pronti**:
    1. 🌸 **Sogno Rosa (Originale)**: Fiori di ciliegio, magenta pastello e polvere di stelle.
    2. 🎄 **Natale Tradizionale**: Verde smeraldo abete, rosso rubino e oro caldo.
    3. ❄️ **Regno di Ghiaccio**: Azzurro artico, ciano glaciale e riflessi diamante.
    4. ✨ **Eleganza Dorata**: Oro imperiale, champagne e bagliori caldi.
    5. 🔮 **Cyberpunk Neon**: Viola ultravioletto, fucsia elettrico e ciano sintetico.
  - **Sintetizzatore Audio Chime (Web Audio API)**: Carillon di Natale integrato senza bisogno di file audio esterni.
  - **Scatto Foto HD**: Salva istantanee ad alta risoluzione dell'albero in PNG con un click.
  - **Regolazione Fine**: Slider per densità particelle, velocità di rotazione, frequenza meteore, toggles per ogni elemento visivo.
  - **Riavvio Animazione**: Riavvia quando vuoi l'effetto iniziale dei punti che convergono dai bordi dello schermo verso il centro.

---

## 🚀 Come Avviare il Progetto

Assicurati di avere Node.js installato, quindi apri il terminale nella cartella del progetto:

```bash
# 1. Installa le dipendenze (già fatto)
npm install

# 2. Avvia il server di sviluppo con Hot Reload
npm run dev
```

Il browser si aprirà automaticamente su `http://localhost:3000`.

---

## 📦 Build di Produzione

Per compilare la versione ottimizzata per il web (es. per pubblicarla su GitHub Pages, Vercel o Netlify):

```bash
npm run build
```

I file pronti saranno generati nella cartella `dist/`.

---

## 📁 Struttura del Codice

```
merry-christmas/
├── .gitignore              # Ignora node_modules, dist, .vite, log, cache
├── index.html              # HTML di mount con font Google (Great Vibes, Playfair, Cinzel)
├── package.json            # Dipendenze e script (dev, build, preview)
├── vite.config.ts          # Configurazione Vite React
├── tailwind.config.js      # Configurazione Tailwind CSS
├── tsconfig.json           # Configurazione TypeScript rigorosa
├── original-base.html      # Copia di backup del codice base HTML originario
└── src/
    ├── types/              # Definizioni TypeScript per particelle, temi e parametri
    ├── config/             # Temi cromatici e impostazioni predefinite
    ├── engine/             # Proiezione 3D e generatore di sprite radiali
    ├── utils/              # Sintetizzatore audio carillon Web Audio API
    ├── components/
    │   ├── ChristmasTreeCanvas.tsx  # Canvas 3D a 60 FPS con interazioni touch/mouse
    │   └── ControlsPanel.tsx        # Pannello glassmorphism di personalizzazione
    ├── App.tsx             # Stato globale e gestione opzioni salvate in localStorage
    ├── index.css           # Stili globali e animazioni
    └── main.tsx            # Entry point React
```
