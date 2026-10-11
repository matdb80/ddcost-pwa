# DDCost Registro Segnalazioni — protocollo collaudo

Baseline: ramo feature/editor-cicli-v7-reviewed; PR #6 temporaneamente verso main solo per eseguire CI, **nessun merge verso main**.

## Verifiche obbligatorie
- `tsc -b` e `npm run build` devono passare su GitHub.
- Lo schema di feedback usa tabelle separate, screenshot MEDIUMTEXT (max 300 KB decodificati), e non altera le precisioni `DECIMAL(30,18)`.
- Prima di usare l'API, il database di COLLAUDO deve avere `feedback_tickets`, `feedback_attachments`, `feedback_settings`.
- Migration: impostare `DDCOST_STAGING_MIGRATE_FEEDBACK=1` solo sul service `ddcost-collaudo`. Il boot valida URL Microsoft, nome utente del branch TiDB, nome database, numero cicli, archivio e fingerprint JSON, e rifiuta condizioni diverse.
- Dopo `[Feedback migration] SUCCESS`, riportare la variabile a `0` e verificare al boot connessione e tabelle.
- Solo dopo, effettuare un unico collaudo cumulativo con ticket normale, screenshot, ticket consecutivo, registro admin, esportazione e soglia.
- Registro accessibile tramite ruolo `users.role = admin`; tutte le API amministrative richiedono `adminQuery`.
- La feature resta in PR **draft** fino all'esito dei controlli. Non pubblicare automaticamente il ramo main.
