# Segnalazioni preventivi — 5 novembre 2026

Base verificata: `4388692057ed75ea11cdee8c95c22df0dcae1082`, branch di collaudo `feature/editor-cicli-v7-reviewed`. L'importatore Excel di Copilot non è incluso in questo aggiornamento.

- TKT-20261104-64150002: nell'editor completo e nel riepilogo wizard, un preventivo esistente può essere salvato come nuova versione oppure sovrascritto. La sovrascrittura aggiorna il solo record visualizzato, conserva ID, radice, revisione, numero ed esito commerciale. Verifica proprietario, classificazioni e impronta del record letto; un aggiornamento concorrente produce un conflitto senza perdere l'altra modifica.
- TKT-20261104-64150001: intestazioni dei prodotti in azzurro acceso e testo scuro, nell'editor completo e nei passi prodotto del wizard.
- TKT-20261103-62150001: offerte standard e nuovi preventivi una tantum usano lo stesso contatore transazionale `offer_number_sequence`, indipendente dagli ID del database. Formato `DDC00001/2026`; progressivo continuo, anno calcolato in Europe/Rome al primo salvataggio. Il primo salvataggio di una bozza assegna già il numero. Aggiornamenti della bozza, completamento, revisioni e sovrascritture conservano il numero. Il contatore considera i riferimenti DDC esistenti di entrambi i tipi e non riutilizza numeri di record cancellati. Le anteprime non prenotano numeri.

Nessuna rinumerazione o ricalcolo degli archivi esistenti. I preventivi storici senza `numero_preventivo` continuano a mostrare il loro ID. Riferimenti/progetti e codici TMP vengono conservati. Il numero è mostrato anche in ricerca/elenco, PDF, copia e anteprima commerciale.

Non occorre una nuova migrazione: il contatore è già presente nel collaudo e nel backup. Il numero dei nuovi preventivi è conservato nel JSON del documento. Non distribuire su un ambiente privo di `offer_number_sequence` senza predisporre la configurazione già prevista dal progetto.

## Verifiche

- `npm run check`: superato.
- `npm test`: 450 test superati, di cui 27 nella selezione mirata iniziale.
- `npm run build`: superato, con il consueto avviso sulle dimensioni del bundle.
- Le prove delle API eseguono router, autorizzazioni e allocatore reali su un adattatore transazionale in memoria: nessun record aziendale è stato creato o sovrascritto durante i test. Non equivalgono a un collaudo concorrente su TiDB.
- Nessun test browser autenticato dichiarato: in questo ambiente non è disponibile il binario del browser di test.

## Controlli nell'app

1. Su un preventivo di prova, modificare una nota e scegliere “Salva e sovrascrivi versione attuale”: stesso ID, numero e revisione; riaprendo la nota deve essere persistita.
2. Modificare di nuovo e scegliere “Salva nuova versione”: nuovo record/revisione, stesso numero commerciale; l'originale deve conservare i dati precedenti.
3. Creare un'offerta standard e poi un nuovo preventivo una tantum: il secondo deve avere il progressivo successivo. Completare una bozza non consuma un altro numero.
4. Scorrere più prodotti e controllare le bande azzurre, anche nei passi del wizard mobile.
5. Cercare il nuovo numero e verificare PDF e testo da copiare. I documenti storici mantengono i riferimenti originari.

Le future integrazioni di Copilot devono partire dalla nuova testa del branch e preservare queste modifiche ai preventivi.
