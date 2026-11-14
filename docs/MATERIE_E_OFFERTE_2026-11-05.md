# Materie prime e offerte collegate — 5 novembre 2026

Base: `b05469ce2064665451ce6bd3dcf10656495fea8e`, branch `feature/editor-cicli-v7-reviewed`.
Questo aggiornamento contiene le segnalazioni TKT-20261105-66150002 e TKT-20261105-66150001. L'importatore Excel V3 in lavorazione con Copilot non è incluso.

## Materia prima da trasformare

La riga offre una scelta esplicita di materiale, geometria, unità di costo (€/kg o €/metro) e modalità del peso (automatico o manuale). Tutte le dimensioni sono in mm e si riferiscono al materiale necessario per un componente; il numero di componenti viene moltiplicato una sola volta.

| Materiale | Densità nominale kg/m³ |
| --- | ---: |
| Ferro (acciaio) | 7850 |
| Inox AISI 304 | 7900 |
| Inox AISI 316 | 8000 |
| Alluminio | 2700 |
| Ottone | 8500 |

Sono valori nominali a temperatura ambiente. In particolare acciaio generico, alluminio e ottone possono variare secondo lega; un peso inserito manualmente prevale sul valore teorico. La densità scelta viene conservata nella riga, così eventuali aggiornamenti futuri della tabella non riscrivono i costi dei documenti.

Fonti consultate il 5 novembre 2026:

- [Outokumpu Core, proprietà fisiche, tabella 7](https://www.outokumpu.com/de-de/products/product-ranges/-/media/files/products/core/outokumpu-core-range-datasheet.pdf?modified=20251117111909&revision=025e9931-a1d5-4c8f-8ff5-f881d38916da): AISI 304, 7,9 kg/dm³.
- [Outokumpu Supra, pagina 8, tabella 7](https://www.outokumpu.com/-/media/files/products/supra/outokumpu-supra-range-datasheet.pdf): AISI 316, 8,0 kg/dm³.
- [Ergenc, tabella tecnica delle densità](https://www.ergenc.com/en/kennis/tables/table-densities-of-metals/): acciaio 7850, alluminio 2700, ottone 8500 kg/m³; valori indicativi pubblicati dall'azienda di lavorazioni e servizi industriali.

Formule:

- Piatto e nastro: volume = lunghezza × larghezza × spessore.
- Tondino: volume = π × diametro² ÷ 4 × lunghezza.
- Tubo: volume = π × (diametro esterno² − diametro interno²) ÷ 4 × lunghezza. Sono richiesti diametri positivi e interno inferiore all'esterno.
- Peso kg = volume mm³ × densità kg/m³ ÷ 1.000.000.000.
- Costo €/pz: peso per componente × numero componenti × €/kg; oppure lunghezza mm ÷ 1000 × numero componenti × €/metro.

Il campo sfrido percentuale è rimosso dall'editor. La lunghezza deve includere tutto il materiale necessario. Nel nuovo calcolo nessuna percentuale viene aggiunta, anche se nel JSON rimane un vecchio valore. Il peso automatico si ricalcola dalle dimensioni, senza riutilizzare un risultato precedente come peso manuale.

### Archivi e validazione

Nessuna migrazione o scrittura automatica dei record esistenti. Il motore mantiene la formula precedente per le righe prive di `materia_prima_versione: 2`, compresi gli snapshot di offerte già salvate.

Aprendo una vecchia riga nell'editor si conserva il costo mediante il peso effettivo precedente, comprensivo dell'eventuale sfrido, riportato in modalità manuale. La UI lo dichiara e consente di scegliere il calcolo automatico, verificando la lunghezza totale. La conversione entra nel ciclo solo con il salvataggio della riga; Annulla lascia l'originale intatto. Nuove righe: automatico per impostazione iniziale.

Il salvataggio della nuova riga controlla geometria, quantità, peso, costo e valori non finiti. La stessa validazione è applicata in API a creazione, aggiornamento, nuova revisione e sovrascrittura dei cicli. Costo unitario zero è ammesso esplicitamente; peso o quantità mancanti non diventano un salvataggio valido.

Il calcolo è condiviso da riga, assiemi, simulazioni e nuove offerte. Il PDF interno mostra unità del prezzo, diametri del tubo e peso con sei decimali; lo sfrido appare soltanto se serve a descrivere righe storiche con percentuale non nulla.

## Offerte collegate ai cicli

L'elenco cicli mostra un contatore per il gruppo e per ogni revisione. Premendolo si apre l'elenco di offerte con numero, cliente, riferimento e revisioni utilizzate; il numero conduce all'offerta.

I riferimenti sono ricavati da `record_id` / `root_id` già salvati nelle righe dell'offerta o nel loro snapshot. Una stessa offerta è contata una sola volta, indipendentemente dal numero di righe, lotti o revisioni. Il contatore di gruppo comprende anche una revisione eliminata quando è disponibile la radice. Una riga manuale con lo stesso codice articolo non crea un collegamento presunto.

La visibilità è quella già prevista da `offer.list/get`: soli redattori autenticati. La risposta contiene i soli metadati necessari, senza trasferire i JSON tecnici delle offerte al client. Non si applica il limite di 100/500 offerte dell'elenco visuale. Salvataggi delle offerte invalidano anche la cache dell'elenco cicli. Non occorre una nuova tabella.

## Verifiche

- TypeScript: superato.
- Test mirati: 52/52.
- Suite completa: 502/502.
- Build client/server: superata.
- Verificati cinque materiali, quattro geometrie, peso manuale, €/metro, misure invalide e overflow, salvataggio/riapertura del modello, assiemi e simulazioni, PDF interno e conservazione dei costi storici.
- Verificati deduplicazione offerte, riferimenti a revisioni, snapshot storici, JSON malformati, metadati restituiti e controllo di accesso. Le prove API usano un adattatore in memoria, non un DB aziendale.
- Ambiente dei test: Node 24.22.1. Nessuna prova browser autenticata o modifica di record aziendali durante i test.

La prossima integrazione di Copilot deve conservare queste modifiche a editor, tipi, motore e API dei cicli. I tre TXT già consegnati descrivono una base precedente a questo aggiornamento: seguire la loro istruzione di verificare il HEAD remoto prima di integrare.
