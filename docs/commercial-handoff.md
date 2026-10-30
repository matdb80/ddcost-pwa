# Passaggio al commerciale

Implementazione per preventivi una tantum e offerte commerciali. I colleghi accedono con Microsoft nel tenant aziendale. Gli amministratori esistenti restano configurati in ALLOWED_MICROSOFT_OIDS; i nuovi account sono autorizzati con Object ID esatto in /commerciale/accessi, con profilo Commerciale oppure Redattore. Nessuna email è inviata durante l'abilitazione.

## Flusso

Salvare/completare il documento, scegliere un collega e premere “Pronto per il commerciale”. Il destinatario vede la notifica interna e apre una proiezione commerciale con copia di ogni campo o dell'intera offerta. Le cifre sono senza simbolo euro e senza separatore delle migliaia, con virgola decimale. Gli sconti mantengono la sequenza. Le righe per lotti alternativi restano distinte.

Il Commerciale non può interrogare le API interne, leggere costi/margini o documenti non assegnati. Il Redattore ha accesso ai dati interni e modifica i propri documenti secondo le regole già esistenti; non è amministratore. Disabilitare un account revoca anche le sessioni già aperte alla richiesta successiva.

I nuovi salvataggi completi dei preventivi già condivisi vengono rilevati dal destinatario; le bozze sono escluse. Per le offerte, aggiornamenti dei dati commerciali riattivano la notifica. Le ricevute di lettura e gli stati sono legati all'impronta della versione: una revisione nuova torna “Pronto”. Il destinatario può segnare “Trasferito nel gestionale” e “Inviato al cliente”; quest'ultimo è un'indicazione manuale, non invia email.

Le notifiche si aggiornano ogni 15 secondi mentre l'app è aperta. Non sono notifiche push a telefono/app chiusa. Il mittente può revocare una condivisione.

## Attivazione collaudo

1. Pubblicare il ramo dopo verifica della PR.
2. Impostare DDCOST_STAGING_MIGRATE_SALES=1 e DDCOST_COLLABORATION_ENABLED=1 sul servizio di collaudo.
3. La migrazione additiva verifica host, database, utente TiDB, VITE_APP_ID e redirect Microsoft del collaudo. Crea solo colleague_access e sales_assignments, senza modificare preventivi e offerte. Mantiene un vincolo unico documento/destinatario.
4. Verificare boot/migrazione, poi disabilitare il flag di migrazione.
5. Abilitare gli account Microsoft con Object ID del tenant, nome, email e permesso scelto.
6. Provare con due account: condivisione, notifica, copia singoli campi, nuova revisione, stati, revoca condivisione e revoca accesso. Provare anche da mobile.

La collaborazione è disabilitata per impostazione predefinita; senza flag i vecchi accessi rimangono invariati. La copia dei campi delle versioni salvate funziona anche con collaborazione disabilitata. Nessuna migrazione o attivazione live eseguita durante lo sviluppo.

## Verifiche

426 test superati (31 file), tsc e build client/server superati. Test specifici: proiezione dei soli dati di vendita, sconti sequenziali, quantità/prezzi mancanti, bozze, autorizzazioni a livello API, accesso a documento di altro destinatario, rifiuto ricevute obsolete, reset stato dopo modifica. Test DB tramite mock; da completare collaudo reale con due account e verifica migrazione su TiDB.
