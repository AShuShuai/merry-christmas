# 🎄 Merry Christmas 3D — React + TypeScript + MediaPipe AI ✨

Una versione interattiva, moderna e mozzafiato in **React 18 + TypeScript + Vite + Tailwind CSS + Google MediaPipe AI** del celebre albero di Natale 3D virale su Douyin e TikTok.

---

## 🌟 Funzionalità Esclusive

### 1. ❄️ Stile Blu Glaciale di Default (Regno di Ghiaccio)
- Bagliori ciano luminosi, sfumature blu zaffiro, stella diamante a 10 punte e fiocchi di neve fluttuanti.
- Possibilità di cambiare in qualsiasi momento con gli altri 4 temi: *Sogno Rosa*, *Natale Tradizionale*, *Eleganza Dorata* e *Cyberpunk Neon*.

### 2. 🖐️ Controllo con i Gesti della Mano (Webcam AI)
Basato sul modello ufficiale **Google MediaPipe Hand Landmarker** (in esecuzione 100% locale nel browser, massima privacy):
- La webcam si avvia automaticamente all'apertura; al primo avvio il browser potrebbe chiedere il permesso.
- All'avvio l'albero e formato; se la mano esce dall'inquadratura, torna alla forma di albero.
- **Mano aperta (🖐️)**: trasforma le scintille dell'albero nel ritratto selezionato; quando l'albero e formato, le foto restano piccole e discrete.
- **Pugno chiuso (✊)**: ricompone l'albero.
- **Ruota l'albero nello spazio 3D**: muovi semplicemente la mano a destra o sinistra per far girare l'albero come per magia.
- **Puntatore della mano**: segue la punta dell'indice e mostra la posa rilevata — mano aperta, pizzico o pugno chiuso.
- **Pizzica (👌 Indice + Pollice)**: pizzica sopra una foto per aprire un ricordo. Le foto non si ripetono finche non sono state mostrate tutte; poi il ciclo ricomincia.

### 3. 📸 Foto & Ricordi Fluttuanti 3D
- Tronco e rami luminosi con fotografie polaroid appese attorno all'albero, in prospettiva 3D.
- Include 5 foto ricordo natalizie predefinite pronte all'uso.
- **Caricamento Foto Personali**: dal pannello *"Personalizza"* -> scheda *"Foto"*, puoi caricare qualsiasi foto dal tuo PC (con titolo e dedica personalizzata), salvata automaticamente nel browser.
- **Ritratto di scintille**: nella stessa scheda puoi scegliere il ritratto predefinito, una foto dei ricordi o caricarne uno dedicato. MediaPipe rileva il volto e isola la persona dalle spalle in su; le scintille seguono i lineamenti e i contorni della persona, senza campionare lo sfondo della foto. Diventano bianche durante il ritratto e riprendono i colori originali dell'albero quando lo ricomponi. Se il volto o la maschera della persona non possono essere rilevati, il morphing resta disattivato e il pannello mostra l'errore.
- **Modal Romantico Lightbox**: cliccando sulla foto (o pizzicando con le dita) si apre un ricordo polaroid con animazione, dedica e suono a carillon.

---

## 🚀 Avvio Rapido

```powershell
cd "c:\Users\alex shu\Desktop\myThings\Project\Per Chiara\merry-christmas"
npm run dev
```

Apri `http://localhost:3000`:
1. Consenti l'accesso alla webcam quando il browser lo richiede.
2. Mostra la mano alla webcam per ruotare l'albero; apri il palmo per trasformarlo nel ritratto e chiudi il pugno per ricomporlo.
3. Clicca su qualsiasi foto polaroid o fai il gesto del pizzico (👌) mentre il cursore è sopra di essa.
